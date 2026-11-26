/**
 * backend/services/bank-conciliation-cron.service.js
 *
 * Rotina diária automática de conciliação bancária e auditoria de anomalias.
 * Executa diariamente às 11h30 (com fallback às 18h30 de seg-sáb) e envia
 * alertas no WhatsApp do administrador SOMENTE quando identificar algo errado.
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

async function enviarAlertaWhatsapp(saldoTotal, alertas) {
  const destino = (process.env.ADMIN_WHATSAPP || process.env.EDEVALDO_WHATSAPP || '').trim();
  if (!destino) {
    console.warn('[BankConciliationCron] ADMIN_WHATSAPP não configurado; alerta não enviado.');
    return false;
  }

  try {
    const messageSender = require('./message-sender.service');
    const linhas = alertas.map((a, idx) => `${idx + 1}. [${a.nivel}] ${a.titulo}: ${a.detalhe}`);
    const texto = [
      '⚠️ *ALERTA - Conciliação Bancária BelaFarma*',
      `📅 Data: ${getTodaySP().split('-').reverse().join('/')}`,
      saldoTotal !== null && saldoTotal !== undefined ? `💰 Saldo atual: *${formatBRL(saldoTotal)}*` : null,
      '',
      '*Ocorrências identificadas na auditoria diária:*',
      ...linhas,
      '',
      '_Verifique na aba Financeiro -> Conciliação Bancária._'
    ].filter(Boolean).join('\n');

    const res = await messageSender.sendMessage(destino, texto);
    return Boolean(res && (res.success || res.fallback));
  } catch (err) {
    console.error('[BankConciliationCron] Falha ao enviar alerta WhatsApp:', err.message);
    return false;
  }
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
  let saldoTotal = null;
  let extratoConciliados = 0;
  let cardsBaixados = 0;
  let ifoodBaixados = 0;

  try {
    const [itemStatus, saldo, transacoes, painel] = await Promise.all([
      openFinance.getItemStatus().catch(e => ({ error: e.message })),
      openFinance.getSaldo(),
      openFinance.getTransacoes(),
      conciliador.obterPainelConciliacao()
    ]);

    saldoTotal = Number(saldo?.saldoTotal ?? 0);

    // 1. Conexão / Consentimento Open Finance
    if (itemStatus) {
      if (itemStatus.status === 'LOGIN_ERROR' || itemStatus.executionStatus === 'ERROR' || itemStatus.error) {
        alertas.push({
          nivel: 'CRÍTICO',
          titulo: 'Erro na conexão Open Finance',
          detalhe: `Status: ${itemStatus.status || 'ERRO'}. Pode ser necessário reconectar a conta no Meu Pluggy.`
        });
      }

      if (itemStatus.lastUpdatedAt) {
        const diffHoras = (Date.now() - new Date(itemStatus.lastUpdatedAt).getTime()) / (1000 * 60 * 60);
        if (diffHoras > 48) {
          alertas.push({
            nivel: 'ATENÇÃO',
            titulo: 'Extrato bancário desatualizado',
            detalhe: `Última sincronização com o banco foi há ${Math.round(diffHoras)} horas.`
          });
        }
      }

      if (itemStatus.consentExpiresAt) {
        const diasParaVencer = Math.ceil((new Date(itemStatus.consentExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (diasParaVencer <= 15) {
          alertas.push({
            nivel: 'ATENÇÃO',
            titulo: 'Consentimento Open Finance perto do vencimento',
            detalhe: `Faltam ${diasParaVencer} dia(s) para expirar. Renove no Meu Pluggy.`
          });
        }
      }
    }

    // 2. Saldo baixo/negativo
    if (saldoTotal < 500) {
      alertas.push({
        nivel: saldoTotal < 0 ? 'CRÍTICO' : 'ATENÇÃO',
        titulo: 'Saldo bancário baixo',
        detalhe: `Saldo consolidado em ${formatBRL(saldoTotal)} (abaixo de R$ 500,00).`
      });
    }

    // 3. Tarifas / Juros / IOF / Encargos inesperados (últimos 2 dias)
    const doisDiasAtras = addDaysYMD(today, -2);
    const palavrasTarifa = ['TARIFA', 'IOF', 'JUROS', 'ENCARGO', 'MULTA', 'CHEQUE'];
    for (const t of transacoes) {
      const valor = Number(t.amount || 0);
      const dataTx = t.date ? t.date.substring(0, 10) : '';
      if (valor < 0 && Math.abs(valor) >= 1 && dataTx >= doisDiasAtras) {
        const descUpper = (t.description || '').toUpperCase();
        if (palavrasTarifa.some(p => descUpper.includes(p))) {
          alertas.push({
            nivel: 'ATENÇÃO',
            titulo: 'Tarifa ou encargo bancário detectado',
            detalhe: `${dataTx.split('-').reverse().join('/')} - ${t.description}: ${formatBRL(Math.abs(valor))}`
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

    // 6. Verificar anomalias de taxa ou divergência de valor líquido > bruto
    for (const anom of (sisRes.anomaliasTaxas || [])) {
      if (anom.tipo === 'DIVERGENCIA_LIQUIDO_MAIOR') {
        alertas.push({
          nivel: 'ATENÇÃO',
          titulo: 'Divergência em repasse de maquininha',
          detalhe: `${anom.brand} ${anom.modality} (${anom.dueDate}): depositado ${formatBRL(anom.netTotal)} acima do bruto esperado (${formatBRL(anom.totalGross)}).`
        });
      } else if (anom.tipo === 'TAXA_ACIMA_PADRAO') {
        alertas.push({
          nivel: 'ATENÇÃO',
          titulo: 'Taxa de maquininha acima de 7%',
          detalhe: `${anom.brand} ${anom.modality} (${anom.dueDate}): taxa efetiva de ${anom.taxaPercent}% (bruto ${formatBRL(anom.totalGross)} → líquido ${formatBRL(anom.netTotal)}).`
        });
      }
    }

    // 7. Repasses previstos de maquininha nos últimos 5 dias que não caíram no extrato
    const cincoDiasAtras = addDaysYMD(today, -5);
    const cardsSemRepasse = db.prepare(`
      SELECT COUNT(*) as qtd, COALESCE(SUM(gross_value), 0) as total
      FROM card_machine_receivables
      WHERE status = 'Pendente'
        AND expected_payment_date >= ?
        AND expected_payment_date <= ?
    `).get(cincoDiasAtras, today);

    if (Number(cardsSemRepasse?.qtd || 0) > 0) {
      alertas.push({
        nivel: 'ATENÇÃO',
        titulo: 'Repasse de maquininha previsto não localizado no extrato',
        detalhe: `${cardsSemRepasse.qtd} lote(s) somando ${formatBRL(cardsSemRepasse.total)} com vencimento entre ${cincoDiasAtras.split('-').reverse().join('/')} e hoje ainda sem baixa no extrato.`
      });
    }

    // 8. Repasses iFood vencidos há mais de 7 dias sem depósito
    const seteDiasAtras = addDaysYMD(today, -7);
    const ifoodAtrasado = db.prepare(`
      SELECT COUNT(*) as qtd, COALESCE(SUM(net_value), 0) as total
      FROM ifood_sales
      WHERE status = 'Pendente'
        AND payment_due_date <= ?
    `).get(seteDiasAtras);

    if (Number(ifoodAtrasado?.qtd || 0) > 0) {
      alertas.push({
        nivel: 'ATENÇÃO',
        titulo: 'Repasse iFood vencido há mais de 7 dias sem depósito',
        detalhe: `${ifoodAtrasado.qtd} venda(s) somando ${formatBRL(ifoodAtrasado.total)} ainda pendentes de recebimento.`
      });
    }

    const status = alertas.length > 0 ? 'ALERTA' : 'OK';
    let whatsappSent = 0;

    if (alertas.length > 0 && enviarWhatsapp) {
      const sent = await enviarAlertaWhatsapp(saldoTotal, alertas);
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
      saldoTotal,
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
      saldoTotal,
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
      nivel: 'CRÍTICO',
      titulo: 'Falha ao executar conciliação bancária automática',
      detalhe: err.message
    }];

    let whatsappSent = 0;
    if (enviarWhatsapp) {
      const sent = await enviarAlertaWhatsapp(saldoTotal, erroAlerta);
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
        saldoTotal,
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

  // Todo dia às 11h30 (logo após o ciclo diário do Open Finance)
  cron.schedule('30 11 * * *', async () => {
    await executarRotinaDiaria({ origem: 'CRON_11H30', enviarWhatsapp: true });
  }, { timezone: 'America/Sao_Paulo' });

  // Verificação de segurança às 18h30 (segunda a sábado) caso o servidor estivesse desligado às 11h30
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
