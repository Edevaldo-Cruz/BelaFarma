/**
 * Belinha ERP - Sales Service
 * Consulta de histórico de vendas, detalhes de cupons e relatórios de caixa.
 */

const { db } = require('./erp-database');

/**
 * Lista vendas com filtros rápidos
 */
function listarVendas({ dataInicio, dataFim, status, limit = 50, offset = 0 } = {}) {
  let where = '1=1';
  const params = [];

  if (dataInicio && dataFim) {
    where += ' AND sale_date BETWEEN ? AND ?';
    params.push(dataInicio, dataFim);
  } else if (dataInicio) {
    where += ' AND sale_date >= ?';
    params.push(dataInicio);
  }

  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }

  const sql = `
    SELECT 
      s.*,
      (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as total_items,
      (SELECT GROUP_CONCAT(payment_method, ', ') FROM sale_payments WHERE sale_id = s.id) as payment_methods
    FROM sales s
    WHERE ${where}
    ORDER BY s.sale_date DESC, s.sale_time DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

/**
 * Retorna os detalhes completos de uma venda específica (itens + formas de pagamento)
 */
function obterVendaDetalhada(saleId) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  if (!sale) return null;

  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
  const payments = db.prepare('SELECT * FROM sale_payments WHERE sale_id = ?').all(saleId);

  return {
    ...sale,
    items,
    payments
  };
}

/**
 * Resumo de movimentação de caixa de uma data específica
 */
function obterResumoCaixaDoDia(dataRef) {
  const targetDate = dataRef || new Date().toISOString().split('T')[0];

  const totalVendas = db.prepare(`
    SELECT 
      COUNT(*) as total_cupons,
      COALESCE(SUM(total_value), 0) as total_faturado,
      COALESCE(SUM(discount_value), 0) as total_descontos
    FROM sales 
    WHERE sale_date = ? AND status = 'CONCLUIDA'
  `).get(targetDate);

  const pagamentos = db.prepare(`
    SELECT 
      sp.payment_method,
      COALESCE(SUM(sp.amount), 0) as total_valor
    FROM sale_payments sp
    JOIN sales s ON sp.sale_id = s.id
    WHERE s.sale_date = ? AND s.status = 'CONCLUIDA'
    GROUP BY sp.payment_method
  `).all(targetDate);

  const canceladas = db.prepare(`
    SELECT COUNT(*) as total_canceladas, COALESCE(SUM(total_value), 0) as valor_cancelado
    FROM sales
    WHERE sale_date = ? AND status = 'CANCELADA'
  `).get(targetDate);

  const pagamentosMap = {
    DINHEIRO: 0,
    CARTAO_DEBITO: 0,
    CARTAO_CREDITO: 0,
    PIX: 0,
    CREDIARIO: 0,
    OUTROS: 0
  };

  for (const p of pagamentos) {
    const m = (p.payment_method || '').toUpperCase();
    if (pagamentosMap.hasOwnProperty(m)) {
      pagamentosMap[m] = p.total_valor;
    } else {
      pagamentosMap.OUTROS += p.total_valor;
    }
  }

  return {
    data: targetDate,
    total_cupons: totalVendas.total_cupons || 0,
    total_faturado: totalVendas.total_faturado || 0,
    total_descontos: totalVendas.total_descontos || 0,
    pagamentos: pagamentosMap,
    cancelamentos: {
      total: canceladas.total_canceladas || 0,
      valor: canceladas.valor_cancelado || 0
    }
  };
}

/**
 * Retorna os totais de vendas do Belinha PDV desde o início do dia comercial (03:00)
 * para integração com a tela de Fechamento de Caixa (CashClosing) e Lançamentos (DailyRecords).
 */
function obterVendasBelinhaLive(businessDayStart) {
  try {
    const rawStart = businessDayStart || `${new Date().toISOString().split('T')[0]} 03:00:00`;
    const parts = rawStart.trim().split(' ');
    const datePart = parts[0];
    const timePart = parts[1] || '03:00:00';

    const rows = db.prepare(`
      SELECT 
        s.id,
        s.customer_name,
        s.customer_id,
        sp.payment_method,
        sp.amount
      FROM sales s
      JOIN sale_payments sp ON s.id = sp.sale_id
      WHERE (s.sale_date > ? OR (s.sale_date = ? AND s.sale_time >= ?))
        AND s.status = 'CONCLUIDA'
    `).all(datePart, datePart, timePart);

    let dinheiro = 0, credit = 0, debit = 0, pix = 0, crediario = 0, outros = 0;
    const crediarioList = [];
    const uniqueSales = new Set();

    for (const r of rows) {
      uniqueSales.add(r.id);
      const m = (r.payment_method || '').toUpperCase();
      const val = parseFloat(r.amount) || 0;

      if (m === 'DINHEIRO') {
        dinheiro += val;
      } else if (m === 'CARTAO_DEBITO') {
        debit += val;
      } else if (m === 'CARTAO_CREDITO') {
        credit += val;
      } else if (m === 'PIX') {
        pix += val;
      } else if (m === 'CREDIARIO') {
        crediario += val;
        crediarioList.push({
          id: `BELINHA-${r.id}`,
          client: r.customer_name || 'Cliente Crediário',
          val: val,
          customerId: r.customer_id
        });
      } else {
        outros += val;
      }
    }

    return {
      qtdVendas: uniqueSales.size,
      dinheiro: Math.round(dinheiro * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      debit: Math.round(debit * 100) / 100,
      pix: Math.round(pix * 100) / 100,
      crediario: Math.round(crediario * 100) / 100,
      crediarioList,
      outros: Math.round(outros * 100) / 100,
      totalSales: Math.round((dinheiro + credit + debit + pix + crediario + outros) * 100) / 100
    };
  } catch (err) {
    console.warn('[Belinha ERP Sales] Erro ao obter vendas live do Belinha:', err.message);
    return {
      qtdVendas: 0,
      dinheiro: 0,
      credit: 0,
      debit: 0,
      pix: 0,
      crediario: 0,
      crediarioList: [],
      outros: 0,
      totalSales: 0
    };
  }
}

module.exports = {
  listarVendas,
  obterVendaDetalhada,
  obterResumoCaixaDoDia,
  obterVendasBelinhaLive
};
