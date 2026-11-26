/**
 * backend/services/bank-conciliation-cron.service.js
 *
 * Rotina diária automática de conciliação bancária e auditoria de divergências.
 * Persiste os alertas por categoria (CREDITO, DEBITO, IFOOD, PIX, BANCO) e envia
 * alerta no WhatsApp do administrador SOMENTE quando encontrar problemas.
 */

const cron = require('node-cron');
const db = require('../database');
const openFinance = require('./open-finance.service');
const conciliador = require('./conciliacao-extrato.service');
const { registerServiceRun } = require('./watcher.service');

let cronInitialized = false;

function getTodaySP() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

function addDaysYMD(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function formatBRL(val) {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getUltimaExecucao() {
  try {
    const rows = db.prepare(`
      SELECT * FROM bank_conciliation_runs
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    const mapRun = (r) => {
      if (!r) return null;
      let alertas = [];
      try {
        alertas = r.alertas_json ? JSON.parse(r.alertas_json) : [];
      } catch (e) {}
      return {
        id: r.id,
        runDate: r.run_date,
        status: r.status,
        saldoTotal: r.saldo_total,
        extratoConciliados: r.extrato_conciliados,
        cardsBaixados: r.cards_baixados,
        ifoodBaixados: r.ifood_baixados,
        alertas,
        whatsappSent: Boolean(r.whatsapp_sent),
        createdAt: r.created_at
      };
    };

    return {
      ultima: rows.length > 0 ? mapRun(rows[0]) : null,
      historico: rows.map(mapRun)
    };
  } catch (err) {
    return { ultima: null, historico: [] };
  }
}

async function enviarAlertaWhatsapp(saldoPrincipal, alertas) {
  const destino = (process.env.ADMIN_WHATSAPP || process.env.EDEVALDO_WHATSAPP || '').trim();
  if (!destino) {
    console.warn('[BankConciliationCron] ADMIN_WHATSAPP não configurado; alerta não enviado.');
    return false;
  }

  try {
    const messageSender = require('./message-sender.service');
    const linhas = alertas.map((a, idx) => `${idx + 1}. [${a.category} • ${a.nivel}] ${a.titulo}: ${a.detalhe}`);
    const texto = [
      '⚠️ *ALERTA - Conciliação Bancária BelaFarma*',
      `📅 Data: ${getTodaySP().split('-').reverse().join('/')}`,
      saldoPrincipal !== null && saldoPrincipal !== undefined ? `💰 Saldo Conta Principal: *${formatBRL(saldoPrincipal)}*` : null,
      '',
      '*Divergências identificadas na auditoria diária:*',
      ...linhas,
      '',
      '_Acesse Financeiro -> Alertas de Divergência para tratar e marcar como resolvido._'
    ].filter(Boolean).join('\n');

    const res = await messageSender.sendMessage(destino, texto);
    return Boolean(res && (res.success || res.fallback));
  } catch (err) {
    console.error('[BankConciliationCron] Falha ao enviar alerta WhatsApp:', err.message);
    return false;
  }
}

function classifyCardCategory(modality) {
  const m = String(modality || '').toUpperCase();
  return (m.includes('DÉB') || m.includes('DEB')) ? 'DEBITO' : 'CREDITO';
}

async function executarRotinaDiaria({ origem = 'CRON', enviarWhatsapp = true } = {}) {
  const today = getTodaySP();
  const nowIso = new Date().toISOString();
  const runId = `bcrun_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  if (!openFinance.isConfigured()) {
    console.log(`[BankConciliationCron] (${origem}) Open Finance não configurado — rotina ignorada.`);
    return { skipped: true, reason: 'Open Finance não configurado' };
  }

  console.log(`🏦 [BankConciliationCron] Iniciando rotina diária (${origem})...`);

  const alertas = [];
  let saldoPrincipal = null;
  let extratoConciliados = 0;
  let cardsBaixados = 0;
  let ifoodBaixados = 0;

  const pushAlert = ({
    fingerprint,
    category,
    nivel = 'ATENCAO',
    titulo,
    detalhe,
    expectedValue = null,
    actualValue = null,
    differenceValue = null,
    referenceDate = today,
    accountId = null
  }) => {
    const reg = conciliador.registrarAlertaDivergencia({
      fingerprint,
      category,
      severity: nivel,
      title: titulo,
      description: detalhe,
      expectedValue,
      actualValue,
      differenceValue,
      referenceDate,
      accountId
    });
    if (reg.action !== 'KEPT_RESOLVED') {
      alertas.push({ category, nivel, titulo, detalhe });
    }
  };

  try {
    const [itemStatus, saldo, transacoes, painel] = await Promise.all([
      openFinance.getItemStatus().catch(e => ({ error: e.message })),
      openFinance.getSaldo(),
      openFinance.getTransacoes(), // Padrão: Conta Principal
      conciliador.obterPainelConciliacao()
    ]);

    saldoPrincipal = Number(saldo?.saldoPrincipal ?? saldo?.saldoTotal ?? 0);
    const principalAccId = saldo?.contaPrincipal?.id || null;

    // 1. Conexão / Consentimento Open Finance (BANCO)
    if (itemStatus) {
      if (itemStatus.status === 'LOGIN_ERROR' || itemStatus.executionStatus === 'ERROR' || itemStatus.error) {
        pushAlert({
          fingerprint: `banco_conn_err_${today}`,
          category: 'BANCO',
          nivel: 'CRITICO',
          titulo: 'Erro na conexão Open Finance',
          detalhe: `Status: ${itemStatus.status || 'ERRO'}. Pode ser necessário reconectar a conta no Meu Pluggy.`,
          accountId: principalAccId
        });
      }

      if (itemStatus.lastUpdatedAt) {
        const diffHoras = (Date.now() - new Date(itemStatus.lastUpdatedAt).getTime()) / (1000 * 60 * 60);
        if (diffHoras > 48) {
          pushAlert({
            fingerprint: `banco_stale_${today}`,
            category: 'BANCO',
            nivel: 'ATENÇÃO',
            titulo: 'Extrato bancário desatualizado',
            detalhe: `Última sincronização com o banco foi há ${Math.round(diffHoras)} horas.`,
            accountId: principalAccId
          });
        }
      }

      if (itemStatus.consentExpiresAt) {
        const diasParaVencer = Math.ceil((new Date(itemStatus.consentExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (diasParaVencer <= 15) {
          pushAlert({
            fingerprint: `banco_consent_${String(itemStatus.consentExpiresAt).slice(0, 10)}`,
            category: 'BANCO',
            nivel: 'ATENÇÃO',
            titulo: 'Consentimento Open Finance perto do vencimento',
            detalhe: `Faltam ${diasParaVencer} dia(s) para expirar. Renove no Meu Pluggy.`,
            accountId: principalAccId
          });
        }
      }
    }

    // 2. Saldo crítico na Conta Principal (BANCO)
    if (saldoPrincipal < 500) {
      pushAlert({
        fingerprint: `banco_low_balance_${today}`,
        category: 'BANCO',
        nivel: saldoPrincipal < 0 ? 'CRITICO' : 'ATENCAO',
        titulo: 'Saldo baixo na Conta Principal',
        detalhe: `Saldo da Conta Principal em ${formatBRL(saldoPrincipal)} (abaixo de R$ 500,00).`,
        expectedValue: 500,
        actualValue: saldoPrincipal,
        differenceValue: Number((saldoPrincipal - 500).toFixed(2)),
        accountId: principalAccId
      });
    }

    // 3. Tarifas / Juros / IOF / Encargos inesperados nos últimos 2 dias (BANCO)
    const doisDiasAtras = addDaysYMD(today, -2);
    const palavrasTarifa = ['TARIFA', 'IOF', 'JUROS', 'ENCARGO', 'MULTA', 'CHEQUE'];
    for (const t of transacoes) {
      const valor = Number(t.amount || 0);
      const dataTx = t.date ? t.date.substring(0, 10) : '';
      if (valor < 0 && Math.abs(valor) >= 1 && dataTx >= doisDiasAtras) {
        const descUpper = (t.description || '').toUpperCase();
        if (palavrasTarifa.some(p => descUpper.includes(p))) {
          pushAlert({
            fingerprint: `banco_tarifa_${t.id}`,
            category: 'BANCO',
            nivel: 'ATENCAO',
            titulo: 'Tarifa ou encargo bancário detectado',
            detalhe: `${dataTx.split('-').reverse().join('/')} - ${t.description}: ${formatBRL(Math.abs(valor))}`,
            expectedValue: 0,
            actualValue: Number(Math.abs(valor).toFixed(2)),
            differenceValue: Number((-Math.abs(valor)).toFixed(2)),
            referenceDate: dataTx,
            accountId: principalAccId
          });
        }
      }
    }

    // 4. Conciliar entradas do extrato (Maquininha e iFood)
    const paraConciliar = [];
    for (const m of (painel.maquininha || [])) {
      if (m.status !== 'CONCILIADO') {
        paraConciliar.push({
          transactionId: m.id,
          transactionDate: m.data,
          amount: m.valor,
          description: m.descricao,
          channel: 'MAQUININHA',
          targetType: 'card_machine_receivable',
          targetId: m.sugestao ? m.sugestao.id : null,
          notes: m.sugestao
            ? `Conciliado com ${m.sugestao.modality} (${m.sugestao.brand})`
            : `Depósito confirmado via Extrato Bancário (${m.bandeira} ${m.modalidade})`
        });
      }
    }
    for (const ifd of (painel.ifood || [])) {
      if (ifd.status !== 'CONCILIADO') {
        paraConciliar.push({
          transactionId: ifd.id,
          transactionDate: ifd.data,
          amount: ifd.valor,
          description: ifd.descricao,
          channel: 'IFOOD',
          targetType: 'ifood_sale',
          targetId: ifd.sugestao ? ifd.sugestao.id : null,
          notes: ifd.sugestao
            ? `Repasse iFood conciliado com pedido ${ifd.sugestao.id}`
            : `Repasse iFood confirmado via Extrato Bancário (${ifd.tipoRepasse})`
        });
      }
    }
    if (paraConciliar.length > 0) {
      const concRes = await conciliador.conciliarItens(paraConciliar, `Rotina Diária (${origem})`);
      extratoConciliados = concRes.count || 0;
    }

    // 5. Conciliar recebíveis internos SOMENTE quando houver match real no extrato
    const sisRes = conciliador.conciliarPendenciasSistema({
      userName: `Rotina Diária (${origem})`,
      transacoesExtrato: transacoes,
      somenteComMatchExtrato: true
    });
    cardsBaixados = sisRes.totalCardsBaixados || 0;
    ifoodBaixados = sisRes.totalIFoodBaixados || 0;

    // 6. Anomalias de taxa ou líquido > bruto (CREDITO / DEBITO)
    for (const anom of (sisRes.anomaliasTaxas || [])) {
      const cat = anom.modality === 'DEBITO' ? 'DEBITO' : 'CREDITO';
      if (anom.tipo === 'DIVERGENCIA_LIQUIDO_MAIOR') {
        pushAlert({
          fingerprint: `card_liq_maior_${cat}_${anom.dueDate}_${anom.brand}`,
          category: cat,
          nivel: 'ATENCAO',
          titulo: `Divergência em repasse (${cat === 'DEBITO' ? 'Débito' : 'Crédito'})`,
          detalhe: `${anom.brand} (${anom.dueDate}): depositado ${formatBRL(anom.netTotal)} acima do bruto esperado (${formatBRL(anom.totalGross)}).`,
          expectedValue: anom.totalGross,
          actualValue: anom.netTotal,
          differenceValue: Number((anom.netTotal - anom.totalGross).toFixed(2)),
          referenceDate: anom.dueDate,
          accountId: principalAccId
        });
      } else if (anom.tipo === 'TAXA_ACIMA_PADRAO') {
        pushAlert({
          fingerprint: `card_taxa_alta_${cat}_${anom.dueDate}_${anom.brand}`,
          category: cat,
          nivel: 'ATENCAO',
          titulo: `Taxa de ${cat === 'DEBITO' ? 'Débito' : 'Crédito'} acima do padrão (${anom.taxaPercent}%)`,
          detalhe: `${anom.brand} (${anom.dueDate}): bruto ${formatBRL(anom.totalGross)} → líquido ${formatBRL(anom.netTotal)}.`,
          expectedValue: anom.totalGross,
          actualValue: anom.netTotal,
          differenceValue: Number((anom.netTotal - anom.totalGross).toFixed(2)),
          referenceDate: anom.dueDate,
          accountId: principalAccId
        });
      }
    }

    // 7. Repasses previstos de maquininha nos últimos 5 dias sem depósito (agrupados por categoria e data)
    const cincoDiasAtras = addDaysYMD(today, -5);
    const cardsSemRepasseRows = db.prepare(`
      SELECT expected_payment_date, modality, COUNT(*) as qtd, COALESCE(SUM(gross_value), 0) as total
      FROM card_machine_receivables
      WHERE status = 'Pendente'
        AND expected_payment_date >= ?
        AND expected_payment_date <= ?
      GROUP BY expected_payment_date, modality
      ORDER BY expected_payment_date DESC
    `).all(cincoDiasAtras, today);

    for (const row of cardsSemRepasseRows) {
      const cat = classifyCardCategory(row.modality);
      const due = row.expected_payment_date || today;
      pushAlert({
        fingerprint: `card_missing_${cat}_${due}_${row.modality}`,
        category: cat,
        nivel: 'ATENCAO',
        titulo: `Repasse ${cat === 'DEBITO' ? 'Débito' : 'Crédito'} não localizado no extrato`,
        detalhe: `${row.qtd} lote(s) de ${row.modality} previsto(s) para ${due.split('-').reverse().join('/')} (${formatBRL(row.total)}) ainda não baixado(s).`,
        expectedValue: Number(Number(row.total).toFixed(2)),
        actualValue: 0,
        differenceValue: Number((-Number(row.total)).toFixed(2)),
        referenceDate: due,
        accountId: principalAccId
      });
    }

    // 8. Repasses iFood vencidos há mais de 7 dias sem depósito (IFOOD)
    const seteDiasAtras = addDaysYMD(today, -7);
    const ifoodAtrasado = db.prepare(`
      SELECT COUNT(*) as qtd, COALESCE(SUM(net_value), 0) as total, MIN(payment_due_date) as min_due
      FROM ifood_sales
      WHERE status = 'Pendente'
        AND payment_due_date <= ?
    `).get(seteDiasAtras);

    if (Number(ifoodAtrasado?.qtd || 0) > 0) {
      const total = Number(Number(ifoodAtrasado.total).toFixed(2));
      pushAlert({
        fingerprint: `ifood_overdue_${seteDiasAtras}`,
        category: 'IFOOD',
        nivel: 'ATENCAO',
        titulo: 'Repasse iFood vencido há mais de 7 dias',
        detalhe: `${ifoodAtrasado.qtd} venda(s) somando ${formatBRL(total)} (vencimento desde ${ifoodAtrasado.min_due || seteDiasAtras}) sem depósito correspondente.`,
        expectedValue: total,
        actualValue: 0,
        differenceValue: -total,
        referenceDate: ifoodAtrasado.min_due || seteDiasAtras,
        accountId: principalAccId
      });
    }

    // 9. Auditoria Pix: comparar fechamento de caixa (cash_closings) vs entradas PIX na Conta Principal (últimos 7 dias)
    try {
      const closings = db.prepare(`
        SELECT substr(date, 1, 10) as dia,
               COALESCE(SUM(pix), 0) + COALESCE(SUM(pixDirect), 0) as total_pix_caixa
        FROM cash_closings
        WHERE substr(date, 1, 10) >= ? AND substr(date, 1, 10) <= ?
        GROUP BY substr(date, 1, 10)
      `).all(seteDiasAtras, today);

      const pixBancoPorDia = new Map();
      for (const t of transacoes) {
        const valor = Number(t.amount || 0);
        if (valor <= 0) continue;
        const d = (t.description || '').toUpperCase();
        if (!(d.includes('PIX') || d.includes('QRS')) || d.includes('IFOOD')) continue;
        const dt = t.date ? t.date.substring(0, 10) : '';
        if (dt) {
          pixBancoPorDia.set(dt, (pixBancoPorDia.get(dt) || 0) + valor);
        }
      }

      for (const c of closings) {
        const caixaPix = Number(Number(c.total_pix_caixa || 0).toFixed(2));
        if (caixaPix <= 0) continue;
        const bancoPix = Number((pixBancoPorDia.get(c.dia) || 0).toFixed(2));
        const diff = Number((bancoPix - caixaPix).toFixed(2));
        if (caixaPix - bancoPix > 5) {
          pushAlert({
            fingerprint: `pix_diff_${c.dia}`,
            category: 'PIX',
            nivel: 'ATENCAO',
            titulo: `Divergência de Pix no fechamento (${c.dia.split('-').reverse().join('/')})`,
            detalhe: `Caixa registrou ${formatBRL(caixaPix)} em Pix, mas entraram ${formatBRL(bancoPix)} na Conta Principal.`,
            expectedValue: caixaPix,
            actualValue: bancoPix,
            differenceValue: diff,
            referenceDate: c.dia,
            accountId: principalAccId
          });
        }
      }
    } catch (pixErr) {
      console.warn('[BankConciliationCron] Falha ao auditar Pix x cash_closings:', pixErr.message);
    }

    const status = alertas.length > 0 ? 'ALERTA' : 'OK';
    let whatsappSent = 0;

    if (alertas.length > 0 && enviarWhatsapp) {
      const sent = await enviarAlertaWhatsapp(saldoPrincipal, alertas);
      whatsappSent = sent ? 1 : 0;
    }

    db.prepare(`
      INSERT INTO bank_conciliation_runs (
        id, run_date, status, saldo_total, extrato_conciliados, cards_baixados, ifood_baixados, alertas_json, whatsapp_sent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      today,
      status,
      saldoPrincipal,
      extratoConciliados,
      cardsBaixados,
      ifoodBaixados,
      JSON.stringify(alertas),
      whatsappSent,
      nowIso
    );

    registerServiceRun(
      'bank_conciliation_cron',
      'SUCCESS',
      alertas.length > 0 ? `${alertas.length} alerta(s) identificado(s)` : null
    );

    console.log(`✅ [BankConciliationCron] (${origem}) Finalizado com status ${status}: ${extratoConciliados} extrato, ${cardsBaixados} cards, ${ifoodBaixados} iFood, ${alertas.length} alerta(s).`);

    return {
      success: true,
      id: runId,
      runDate: today,
      status,
      saldoTotal: saldoPrincipal,
      extratoConciliados,
      cardsBaixados,
      ifoodBaixados,
      alertas,
      whatsappSent: Boolean(whatsappSent),
      createdAt: nowIso
    };
  } catch (err) {
    console.error(`❌ [BankConciliationCron] (${origem}) Erro na rotina diária:`, err.message);

    const erroAlerta = [{
      category: 'BANCO',
      nivel: 'CRITICO',
      titulo: 'Falha ao executar conciliação bancária automática',
      detalhe: err.message
    }];

    conciliador.registrarAlertaDivergencia({
      fingerprint: `cron_error_${today}`,
      category: 'BANCO',
      severity: 'CRITICO',
      title: erroAlerta[0].titulo,
      description: erroAlerta[0].detalhe,
      referenceDate: today
    });

    let whatsappSent = 0;
    if (enviarWhatsapp) {
      const sent = await enviarAlertaWhatsapp(saldoPrincipal, erroAlerta);
      whatsappSent = sent ? 1 : 0;
    }

    try {
      db.prepare(`
        INSERT INTO bank_conciliation_runs (
          id, run_date, status, saldo_total, extrato_conciliados, cards_baixados, ifood_baixados, alertas_json, whatsapp_sent, created_at
        ) VALUES (?, ?, 'ERRO', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        runId,
        today,
        saldoPrincipal,
        extratoConciliados,
        cardsBaixados,
        ifoodBaixados,
        JSON.stringify(erroAlerta),
        whatsappSent,
        nowIso
      );
    } catch (dbErr) {
      console.error('[BankConciliationCron] Falha ao gravar log de erro:', dbErr.message);
    }

    registerServiceRun('bank_conciliation_cron', 'FAILED', err.message);
    return {
      success: false,
      status: 'ERRO',
      alertas: erroAlerta,
      error: err.message
    };
  }
}

function initBankConciliationCron() {
  if (cronInitialized) return;
  cronInitialized = true;

  cron.schedule('30 11 * * *', async () => {
    await executarRotinaDiaria({ origem: 'CRON_11H30', enviarWhatsapp: true });
  }, { timezone: 'America/Sao_Paulo' });

  cron.schedule('30 18 * * 1-6', async () => {
    try {
      const today = getTodaySP();
      const existing = db.prepare(`
        SELECT id FROM bank_conciliation_runs
        WHERE run_date = ? AND status IN ('OK', 'ALERTA')
        LIMIT 1
      `).get(today);

      if (!existing) {
        await executarRotinaDiaria({ origem: 'CRON_FALLBACK_18H30', enviarWhatsapp: true });
      }
    } catch (err) {
      console.error('[BankConciliationCron] Erro no fallback 18h30:', err.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  console.log('⏰ [BankConciliationCron] Agendado: diário às 11h30 e fallback às 18h30 (seg-sáb).');
}

module.exports = {
  initBankConciliationCron,
  executarRotinaDiaria,
  getUltimaExecucao
};
