/**
 * backend/services/conciliacao-extrato.service.js
 *
 * Motor de conciliação bancária entre o Extrato Bancário (Open Finance)
 * e os recebíveis de Maquininha (Rede/POS) e iFood da BelaFarma.
 */

const db = require('../database');
const openFinance = require('./open-finance.service');

function getTodaySP() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

function addDaysYMD(ymd, days) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function normalizeBrand(str) {
  const s = String(str || '').toUpperCase();
  if (s.includes('VISA')) return 'VISA';
  if (s.includes('MAST')) return 'MASTER';
  if (s.includes('ELO')) return 'ELO';
  return 'OUTROS';
}

function normalizeModality(str) {
  const s = String(str || '').toUpperCase();
  if (s.includes('PIX')) return 'PIX';
  if (s.includes(' DB') || s.includes('DÉB') || s.includes('DEB')) return 'DEBITO';
  return 'CREDITO';
}

class ConciliacaoExtratoService {
  /**
   * Obtém a lista de conciliações já salvas
   */
  getConciliacoesSalvas() {
    return db.prepare('SELECT * FROM bank_conciliations').all();
  }

  /**
   * Retorna resumo das pendências vencidas e futuras no sistema (Maquininha + iFood)
   */
  obterPendenciasSistema() {
    const today = getTodaySP();

    const cardDue = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(gross_value), 0) as totalGross
      FROM card_machine_receivables
      WHERE status = 'Pendente'
        AND (expected_payment_date <= ? OR expected_payment_date IS NULL OR expected_payment_date = '')
    `).get(today);

    const cardFuture = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(gross_value), 0) as totalGross
      FROM card_machine_receivables
      WHERE status = 'Pendente' AND expected_payment_date > ?
    `).get(today);

    const ifoodDue = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(net_value), 0) as totalNet
      FROM ifood_sales
      WHERE status = 'Pendente'
        AND (payment_due_date <= ? OR payment_due_date IS NULL OR payment_due_date = '')
    `).get(today);

    const ifoodFuture = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(net_value), 0) as totalNet
      FROM ifood_sales
      WHERE status = 'Pendente' AND payment_due_date > ?
    `).get(today);

    return {
      today,
      cardDueCount: Number(cardDue?.count || 0),
      cardDueGross: Number(cardDue?.totalGross || 0),
      cardFutureCount: Number(cardFuture?.count || 0),
      cardFutureGross: Number(cardFuture?.totalGross || 0),
      ifoodDueCount: Number(ifoodDue?.count || 0),
      ifoodDueNet: Number(ifoodDue?.totalNet || 0),
      ifoodFutureCount: Number(ifoodFuture?.count || 0),
      ifoodFutureNet: Number(ifoodFuture?.totalNet || 0)
    };
  }

  /**
   * Analisa e cruza o extrato com as bases internas de Maquininha e iFood
   */
  async obterPainelConciliacao(options = {}) {
    const transacoes = await openFinance.getTransacoes(options);
    const concSalvas = this.getConciliacoesSalvas();
    const concMap = new Map();
    concSalvas.forEach(c => concMap.set(c.transaction_id, c));

    // Buscar recebíveis em aberto ou do período
    const cardReceivables = db.prepare(`
      SELECT * FROM card_machine_receivables
      ORDER BY expected_payment_date DESC
    `).all();

    // Buscar vendas do iFood
    const ifoodSales = db.prepare(`
      SELECT * FROM ifood_sales
      ORDER BY sale_date DESC
    `).all();

    const itensMaquininha = [];
    const itensIFood = [];
    const itensPix = [];
    const itensOutros = [];

    let totalMaquininhaConciliado = 0;
    let totalMaquininhaPendente = 0;
    let totalIFoodConciliado = 0;
    let totalIFoodPendente = 0;

    for (const t of transacoes) {
      const valor = Number(t.amount || 0);
      if (valor <= 0) continue; // Somente entradas financeiras

      const desc = (t.description || '').toUpperCase();
      const descRaw = (t.descriptionRaw || '').toUpperCase();
      const dateStr = t.date ? t.date.substring(0, 10) : '';
      const concExistente = concMap.get(t.id);

      // 1. Identificar se é Maquininha (REDE, CIELO, STONE, etc.)
      const isRede = desc.includes('REDE ') || descRaw.includes('REDE ') || desc.includes('CIELO') || desc.includes('STONE');
      // 2. Identificar se é iFood
      const isIFood = desc.includes('IFOOD') || descRaw.includes('IFOOD');
      // 3. Identificar se é Pix
      const isPix = desc.includes('PIX') || desc.includes('QRS');

      if (isRede) {
        let sugestaoMatch = null;
        if (!concExistente) {
          sugestaoMatch = cardReceivables.find(r => {
            const rDate = r.expected_payment_date || r.sale_date;
            const rVal = Number(r.net_deposited_value || r.gross_value || 0);
            const dateMatch = rDate === dateStr;
            const valMatch = Math.abs(rVal - valor) <= 0.05;
            return dateMatch || (valMatch && r.status === 'Pendente');
          });
        }

        const conciliado = !!concExistente;
        if (conciliado) {
          totalMaquininhaConciliado += valor;
        } else {
          totalMaquininhaPendente += valor;
        }

        let bandeira = 'Rede';
        if (desc.includes('MAST')) bandeira = 'Mastercard';
        else if (desc.includes('VISA')) bandeira = 'Visa';
        else if (desc.includes('ELO')) bandeira = 'Elo';

        let modalidade = 'Crédito/Débito';
        if (desc.includes(' DB')) modalidade = 'Débito';
        else if (desc.includes(' AT') || desc.includes(' CR')) modalidade = 'Crédito';

        itensMaquininha.push({
          id: t.id,
          data: dateStr,
          valor,
          descricao: t.description,
          bandeira,
          modalidade,
          status: conciliado ? 'CONCILIADO' : (sugestaoMatch ? 'SUGESTAO' : 'NOVO_EXTRATO'),
          conciliacao: concExistente || null,
          sugestao: sugestaoMatch || null
        });
      } else if (isIFood) {
        let sugestaoMatch = null;
        if (!concExistente) {
          sugestaoMatch = ifoodSales.find(s => {
            const diff = Math.abs(Number(s.net_value) - valor);
            return diff <= 0.05 && s.status === 'Pendente';
          });
        }

        const conciliado = !!concExistente;
        if (conciliado) {
          totalIFoodConciliado += valor;
        } else {
          totalIFoodPendente += valor;
        }

        const tipoRepasse = desc.includes('PIX') ? 'Pix iFood' : 'Crédito iFood (Master)';

        itensIFood.push({
          id: t.id,
          data: dateStr,
          valor,
          descricao: t.description,
          tipoRepasse,
          status: conciliado ? 'CONCILIADO' : (sugestaoMatch ? 'SUGESTAO' : 'NOVO_EXTRATO'),
          conciliacao: concExistente || null,
          sugestao: sugestaoMatch || null
        });
      } else if (isPix) {
        itensPix.push({
          id: t.id,
          data: dateStr,
          valor,
          descricao: t.description,
          pagador: t.paymentData?.payer?.documentNumber?.value || 'Balcão/Cliente',
          status: concExistente ? 'CONCILIADO' : 'NOVO_EXTRATO'
        });
      } else {
        itensOutros.push({
          id: t.id,
          data: dateStr,
          valor,
          descricao: t.description,
          status: concExistente ? 'CONCILIADO' : 'NOVO_EXTRATO'
        });
      }
    }

    return {
      resumo: {
        totalMaquininhaConciliado,
        totalMaquininhaPendente,
        totalMaquininhaGeral: totalMaquininhaConciliado + totalMaquininhaPendente,
        qtdMaquininha: itensMaquininha.length,

        totalIFoodConciliado,
        totalIFoodPendente,
        totalIFoodGeral: totalIFoodConciliado + totalIFoodPendente,
        qtdIFood: itensIFood.length,

        qtdPix: itensPix.length,
        totalPix: itensPix.reduce((acc, p) => acc + p.valor, 0)
      },
      pendenciasSistema: this.obterPendenciasSistema(),
      maquininha: itensMaquininha,
      ifood: itensIFood,
      pix: itensPix.slice(0, 50),
      outros: itensOutros
    };
  }

  /**
   * Concilia manualmente ou automaticamente um ou mais itens do extrato
   */
  async conciliarItens(itens, userName = 'Administrador') {
    const stmt = db.prepare(`
      INSERT INTO bank_conciliations (
        id, transaction_id, transaction_date, amount, description, channel, target_type, target_id, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(transaction_id) DO UPDATE SET
        status = excluded.status,
        notes = excluded.notes,
        target_id = excluded.target_id
    `);

    const updateReceivable = db.prepare(`
      UPDATE card_machine_receivables
      SET status = 'Conferido', net_deposited_value = ?, reconciled_at = ?, reconciled_by = ?
      WHERE id = ?
    `);

    const updateIFood = db.prepare(`
      UPDATE ifood_sales
      SET status = 'Recebido', received_at = ?
      WHERE id = ?
    `);

    const results = [];
    const now = new Date().toISOString();

    const tx = db.transaction((lista) => {
      for (const item of lista) {
        const concId = 'conc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        stmt.run(
          concId,
          item.transactionId,
          item.transactionDate,
          item.amount,
          item.description || '',
          item.channel,
          item.targetType || 'card_machine_receivable',
          item.targetId || null,
          'CONCILIATED',
          item.notes || `Conciliado via Open Finance por ${userName}`,
          now
        );

        if (item.channel === 'MAQUININHA' && item.targetId) {
          updateReceivable.run(item.amount, now, userName, item.targetId);
        }

        if (item.channel === 'IFOOD' && item.targetId) {
          updateIFood.run(now, item.targetId);
        }

        results.push({ transactionId: item.transactionId, status: 'CONCILIATED' });
      }
    });

    tx(itens);
    return { success: true, count: results.length, items: results };
  }

  /**
   * Concilia e baixa os recebíveis vencidos de Maquininha e iFood no banco de dados
   * usando os depósitos do extrato (quando disponíveis).
   * - Se `somenteComMatchExtrato === true` (uso da rotina diária automática):
   *   só dá baixa quando há depósito real correspondente no extrato e devolve anomalias de taxa.
   * - Se `somenteComMatchExtrato === false` (zeramento manual / limpeza completa):
   *   dá baixa em todos os recebíveis vencidos até hoje.
   */
  conciliarPendenciasSistema({ userName = 'Robô Open Finance', transacoesExtrato = [], somenteComMatchExtrato = false } = {}) {
    const today = getTodaySP();
    const now = new Date().toISOString();

    const pendingCards = db.prepare(`
      SELECT * FROM card_machine_receivables
      WHERE status = 'Pendente'
        AND (expected_payment_date <= ? OR expected_payment_date IS NULL OR expected_payment_date = '')
      ORDER BY expected_payment_date ASC, sale_date ASC
    `).all(today);

    const pendingIFood = db.prepare(`
      SELECT * FROM ifood_sales
      WHERE status = 'Pendente'
        AND (payment_due_date <= ? OR payment_due_date IS NULL OR payment_due_date = '')
      ORDER BY payment_due_date ASC, sale_date ASC
    `).all(today);

    const allTx = Array.isArray(transacoesExtrato) ? transacoesExtrato : [];

    // Prepara candidatos de depósito de maquininha vindos do extrato
    const cardDeposits = allTx
      .filter(t => {
        const valor = Number(t.amount || 0);
        if (valor <= 0) return false;
        const d = `${t.description || ''} ${t.descriptionRaw || ''}`.toUpperCase();
        return d.includes('REDE ') || d.includes('CIELO') || d.includes('STONE') || d.includes('GETNET') || d.includes('PAGSEGURO');
      })
      .map(t => {
        const d = `${t.description || ''} ${t.descriptionRaw || ''}`.toUpperCase();
        return {
          id: t.id,
          date: t.date ? t.date.substring(0, 10) : '',
          amount: Number(t.amount || 0),
          brand: normalizeBrand(d),
          modality: normalizeModality(d),
          used: false
        };
      });

    // Depósitos recentes do iFood nos últimos 7 dias (para validação na rotina diária)
    const seteDiasAtras = addDaysYMD(today, -7);
    const ifoodDepositsRecentes = allTx
      .filter(t => {
        const valor = Number(t.amount || 0);
        if (valor <= 0) return false;
        const d = `${t.description || ''} ${t.descriptionRaw || ''}`.toUpperCase();
        const dt = t.date ? t.date.substring(0, 10) : '';
        return d.includes('IFOOD') && dt >= seteDiasAtras;
      })
      .map(t => ({
        date: t.date ? t.date.substring(0, 10) : '',
        amount: Number(t.amount || 0)
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    let cardConciliadosExtrato = 0;
    let cardBaixadosVencidos = 0;
    let totalCardsValor = 0;
    let totalIFoodBaixados = 0;
    let totalIFoodValor = 0;
    const anomaliasTaxas = [];

    const updateCardMatched = db.prepare(`
      UPDATE card_machine_receivables
      SET net_deposited_value = ?,
          fee_value = ?,
          fee_percent = ?,
          status = 'Conferido',
          reconciled_at = ?,
          reconciled_by = ?,
          notes = COALESCE(notes, ?)
      WHERE id = ?
    `);

    const updateCardOverdue = db.prepare(`
      UPDATE card_machine_receivables
      SET status = 'Conferido',
          net_deposited_value = COALESCE(net_deposited_value, gross_value),
          fee_value = COALESCE(fee_value, 0),
          fee_percent = COALESCE(fee_percent, 0),
          reconciled_at = ?,
          reconciled_by = ?,
          notes = COALESCE(notes, 'Pendência vencida conciliada via Conciliação Bancária')
      WHERE id = ?
    `);

    const updateIFoodSale = db.prepare(`
      UPDATE ifood_sales
      SET status = 'Recebido',
          received_at = ?,
          checking_account_id = COALESCE(checking_account_id, ?)
      WHERE id = ?
    `);

    db.transaction(() => {
      // 1. Agrupar recebíveis de maquininha por data esperada | bandeira | modalidade
      const groups = new Map();
      for (const item of pendingCards) {
        const dueDate = item.expected_payment_date || item.sale_date || '';
        const brand = normalizeBrand(item.brand);
        const modality = normalizeModality(item.modality);
        const key = `${dueDate}|${brand}|${modality}`;
        if (!groups.has(key)) {
          groups.set(key, { dueDate, brand, modality, items: [] });
        }
        groups.get(key).items.push(item);
      }

      for (const group of groups.values()) {
        const { dueDate, brand, modality, items } = group;
        const nextDay = addDaysYMD(dueDate, 1);

        const matchedDeposits = (dueDate && brand !== 'OUTROS' && modality !== 'PIX')
          ? cardDeposits.filter(dep =>
              !dep.used &&
              dep.brand === brand &&
              dep.modality === modality &&
              (dep.date === dueDate || (nextDay && dep.date === nextDay))
            )
          : [];

        if (matchedDeposits.length > 0) {
          matchedDeposits.forEach(dep => { dep.used = true; });
          const netTotal = matchedDeposits.reduce((sum, d) => sum + d.amount, 0);
          const totalGross = items.reduce((sum, it) => sum + (Number(it.gross_value) || 0), 0);
          const totalFee = Math.max(0, totalGross - netTotal);
          const overallFeePercent = totalGross > 0 ? (totalFee / totalGross) * 100 : 0;

          if (netTotal > totalGross + 0.05) {
            anomaliasTaxas.push({
              tipo: 'DIVERGENCIA_LIQUIDO_MAIOR',
              dueDate,
              brand,
              modality,
              totalGross: Number(totalGross.toFixed(2)),
              netTotal: Number(netTotal.toFixed(2)),
              taxaPercent: Number(overallFeePercent.toFixed(2))
            });
          } else if (overallFeePercent > 7) {
            anomaliasTaxas.push({
              tipo: 'TAXA_ACIMA_PADRAO',
              dueDate,
              brand,
              modality,
              totalGross: Number(totalGross.toFixed(2)),
              netTotal: Number(netTotal.toFixed(2)),
              taxaPercent: Number(overallFeePercent.toFixed(2))
            });
          }

          let distributedNet = 0;
          let distributedFee = 0;

          items.forEach((item, index) => {
            const itemGross = Number(item.gross_value) || 0;
            let itemNet = 0;
            let itemFee = 0;

            if (index === items.length - 1) {
              itemNet = Number((netTotal - distributedNet).toFixed(2));
              itemFee = Number((totalFee - distributedFee).toFixed(2));
            } else {
              const ratio = totalGross > 0 ? (itemGross / totalGross) : (1 / items.length);
              itemNet = Number((netTotal * ratio).toFixed(2));
              itemFee = Number((totalFee * ratio).toFixed(2));
              distributedNet += itemNet;
              distributedFee += itemFee;
            }

            const itemFeePercent = itemGross > 0
              ? Number(((itemFee / itemGross) * 100).toFixed(2))
              : Number(overallFeePercent.toFixed(2));

            updateCardMatched.run(
              itemNet,
              itemFee,
              itemFeePercent,
              now,
              userName,
              'Conciliado automaticamente via Extrato Bancário (Open Finance)',
              item.id
            );

            cardConciliadosExtrato++;
            totalCardsValor += itemGross;
          });
        } else if (!somenteComMatchExtrato) {
          for (const item of items) {
            updateCardOverdue.run(now, userName, item.id);
            cardBaixadosVencidos++;
            totalCardsValor += Number(item.gross_value || 0);
          }
        }
      }

      // 2. Baixar vendas vencidas do iFood até hoje (ou até a maior data de repasse recente no modo automático)
      const maxIFoodDepositDate = ifoodDepositsRecentes.length > 0 ? ifoodDepositsRecentes[0].date : '';
      for (const sale of pendingIFood) {
        if (somenteComMatchExtrato) {
          if (!maxIFoodDepositDate) continue;
          const due = sale.payment_due_date || sale.sale_date || '';
          if (!due || due > maxIFoodDepositDate) continue;
        }
        updateIFoodSale.run(now, `open_finance_${sale.id}`, sale.id);
        totalIFoodBaixados++;
        totalIFoodValor += Number(sale.net_value || 0);
      }
    })();

    return {
      cardConciliadosExtrato,
      cardBaixadosVencidos,
      totalCardsBaixados: cardConciliadosExtrato + cardBaixadosVencidos,
      totalCardsValor: Number(totalCardsValor.toFixed(2)),
      totalIFoodBaixados,
      totalIFoodValor: Number(totalIFoodValor.toFixed(2)),
      anomaliasTaxas,
      pendenciasRestantes: this.obterPendenciasSistema()
    };
  }

  /**
   * Concilia automaticamente todas as entradas do extrato e zera pendências vencidas no sistema
   */
  async autoConciliarTudo(userName = 'Robô Open Finance') {
    const [painel, transacoes] = await Promise.all([
      this.obterPainelConciliacao(),
      openFinance.getTransacoes()
    ]);

    const paraConciliar = [];

    for (const m of painel.maquininha) {
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

    for (const ifd of painel.ifood) {
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

    let countExtrato = 0;
    if (paraConciliar.length > 0) {
      const concRes = await this.conciliarItens(paraConciliar, userName);
      countExtrato = concRes.count || 0;
    }

    const sistema = this.conciliarPendenciasSistema({
      userName,
      transacoesExtrato: transacoes
    });

    return {
      success: true,
      count: countExtrato,
      sistema,
      message: `Conciliação concluída: ${countExtrato} lançamento(s) do extrato, ${sistema.totalCardsBaixados} recebível(eis) de maquininha e ${sistema.totalIFoodBaixados} venda(s) iFood conciliados.`
    };
  }
}

module.exports = new ConciliacaoExtratoService();
