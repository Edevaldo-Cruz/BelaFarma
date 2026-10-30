/**
 * Belinha ERP - Sales Service
 * Consulta de histórico de vendas, detalhes de cupons e relatórios de caixa.
 */

const { db } = require('./erp-database');

/**
 * Retorna string YYYY-MM-DD no fuso horário local
 */
function getLocalDateStr(date = new Date()) {
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Normaliza os métodos de pagamento do Digifarma para o padrão do ERP
 */
function mapDigifarmaPayment(fp) {
  const id = fp.id;
  const desc = (fp.descricao || '').toUpperCase();
  const valor = parseFloat(fp.valor || 0);

  let method = 'OUTROS';
  let card_brand = desc || undefined;

  if (id === 1) {
    method = 'DINHEIRO';
  } else if (id === 4) {
    if (desc.includes('DEBITO') || desc.includes('DÉBITO')) {
      method = 'CARTAO_DEBITO';
    } else {
      method = 'CARTAO_CREDITO';
    }
  } else if (id === 5) {
    method = 'CREDIARIO';
  } else if (id === 8 || id === 15 || id === 14) {
    method = 'PIX';
  } else {
    method = 'OUTROS';
  }

  return {
    method,
    amount: valor,
    card_brand
  };
}

/**
 * Lê e mapeia as vendas do Digifarma sincronizadas no cache SQLite
 */
function obterVendasDigifarmaCache({ dataInicio, dataFim, status, paymentMethod } = {}) {
  try {
    const todayStr = getLocalDateStr();
    // digifarma_vendas_hoje_cache armazena as vendas de hoje
    // Se o filtro de data foi passado e NÃO cobre hoje, não aplica o cache
    if (dataInicio && dataFim) {
      if (todayStr < dataInicio || todayStr > dataFim) {
        return [];
      }
    } else if (dataInicio && dataInicio !== todayStr) {
      return [];
    }

    const rows = db.prepare('SELECT * FROM digifarma_vendas_hoje_cache').all();
    if (!rows || rows.length === 0) return [];

    const mapped = [];
    for (const r of rows) {
      const isCancelada = r.cancelado === 'S';
      const saleStatus = isCancelada ? 'CANCELADA' : 'CONCLUIDA';

      if (status && status !== 'TODOS' && status !== saleStatus) {
        continue;
      }

      let dateStr = todayStr;
      let timeStr = '12:00:00';
      try {
        const d = new Date(r.data_hora);
        if (!isNaN(d.getTime())) {
          dateStr = getLocalDateStr(d);
          const pad = n => String(n).padStart(2, '0');
          timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }
      } catch (e) {}

      if (dataInicio && dataFim) {
        if (dateStr < dataInicio || dateStr > dataFim) continue;
      } else if (dataInicio && dateStr !== dataInicio) continue;

      let rawPayments = [];
      try {
        rawPayments = JSON.parse(r.formas_pagamento || '[]');
      } catch (e) {
        rawPayments = [];
      }

      const payments = rawPayments.map(mapDigifarmaPayment);

      // Filtro de forma de pagamento
      if (paymentMethod && paymentMethod !== 'TODOS') {
        const pm = paymentMethod.toUpperCase();
        const hasPayment = payments.some(p => {
          const m = p.method.toUpperCase();
          if (pm === 'CARTAO_DEBITO' || pm === 'DEBITO') return m.includes('DEBITO');
          if (pm === 'CARTAO_CREDITO' || pm === 'CREDITO') return m.includes('CREDITO');
          if (pm === 'CREDIARIO' || pm === 'CONVENIO') return m.includes('CREDIARIO') || m.includes('CONVENIO');
          return m === pm;
        });
        if (!hasPayment) continue;
      }

      const methodNames = Array.from(new Set(payments.map(p => p.method)));
      const payment_methods = methodNames.join(', ') || 'DINHEIRO';

      mapped.push({
        id: `DIGI-${r.venda_nota_id}`,
        sale_date: dateStr,
        sale_time: timeStr,
        total_items_value: parseFloat(r.valor_total || 0),
        discount_value: 0,
        total_value: parseFloat(r.valor_total || 0),
        customer_name: 'Balcão / Digifarma',
        user_name: 'Caixa Digifarma',
        status: saleStatus,
        total_items: parseInt(r.total_itens || 0, 10),
        payment_methods,
        payments,
        fiscal_status: 'EMITIDO',
        nfe_number: r.venda_nota_id,
        origin: 'DIGIFARMA'
      });
    }

    return mapped;
  } catch (err) {
    console.warn('[ERP Sales] Erro ao obter cache de vendas do Digifarma:', err.message);
    return [];
  }
}

/**
 * Lista vendas com filtros rápidos por data, status e forma de pagamento
 * Unifica vendas do PDV Belinha e do Digifarma
 */
function listarVendas({ dataInicio, dataFim, status, paymentMethod, limit = 100, offset = 0 } = {}) {
  let where = '1=1';
  const params = [];

  if (dataInicio && dataFim) {
    where += ' AND s.sale_date BETWEEN ? AND ?';
    params.push(dataInicio, dataFim);
  } else if (dataInicio) {
    where += ' AND s.sale_date = ?';
    params.push(dataInicio);
  }

  if (status && status !== 'TODOS') {
    where += ' AND s.status = ?';
    params.push(status);
  }

  if (paymentMethod && paymentMethod !== 'TODOS') {
    const pm = paymentMethod.toUpperCase();
    if (pm === 'CARTAO_DEBITO' || pm === 'DEBITO') {
      where += " AND EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id AND (UPPER(sp.payment_method) LIKE '%DEBITO%' OR UPPER(sp.payment_method) LIKE '%DÉBITO%'))";
    } else if (pm === 'CARTAO_CREDITO' || pm === 'CREDITO') {
      where += " AND EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id AND (UPPER(sp.payment_method) LIKE '%CREDITO%' OR UPPER(sp.payment_method) LIKE '%CRÉDITO%'))";
    } else if (pm === 'CREDIARIO' || pm === 'CONVENIO') {
      where += " AND EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id AND (UPPER(sp.payment_method) LIKE '%CREDIARIO%' OR UPPER(sp.payment_method) LIKE '%CREDIÁRIO%' OR UPPER(sp.payment_method) LIKE '%CONVENIO%' OR UPPER(sp.payment_method) LIKE '%CONVÊNIO%'))";
    } else {
      where += " AND EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id AND UPPER(sp.payment_method) = ?)";
      params.push(pm);
    }
  }

  const sql = `
    SELECT 
      s.*,
      (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as total_items,
      (SELECT GROUP_CONCAT(payment_method, ', ') FROM sale_payments WHERE sale_id = s.id) as payment_methods,
      (SELECT json_group_array(json_object('method', payment_method, 'amount', amount, 'card_brand', card_brand)) FROM sale_payments WHERE sale_id = s.id) as payments_json
    FROM sales s
    WHERE ${where}
    ORDER BY s.sale_date DESC, s.sale_time DESC
  `;

  const rows = db.prepare(sql).all(...params);

  const belinhaSales = rows.map(r => {
    let paymentsParsed = [];
    try {
      if (r.payments_json) {
        paymentsParsed = JSON.parse(r.payments_json);
      }
    } catch (e) {
      paymentsParsed = [];
    }
    return {
      ...r,
      origin: 'BELINHA',
      payments: paymentsParsed
    };
  });

  // 2. Vendas do Digifarma (Cache SQLite)
  const digiSales = obterVendasDigifarmaCache({ dataInicio, dataFim, status, paymentMethod });

  // 3. Unificar e ordenar por data e horário decrescentes
  const combined = [...belinhaSales, ...digiSales];
  combined.sort((a, b) => {
    const dtA = `${a.sale_date} ${a.sale_time}`;
    const dtB = `${b.sale_date} ${b.sale_time}`;
    return dtB.localeCompare(dtA);
  });

  return combined.slice(offset, offset + limit);
}

/**
 * Retorna os detalhes completos de uma venda específica (itens + formas de pagamento)
 */
function obterVendaDetalhada(saleId) {
  if (String(saleId).startsWith('DIGI-')) {
    const notaId = parseInt(saleId.replace('DIGI-', ''), 10);
    const row = db.prepare('SELECT * FROM digifarma_vendas_hoje_cache WHERE venda_nota_id = ?').get(notaId);
    if (!row) return null;

    let payments = [];
    try {
      const raw = JSON.parse(row.formas_pagamento || '[]');
      payments = raw.map(mapDigifarmaPayment);
    } catch (e) {}

    let dateStr = getLocalDateStr();
    let timeStr = '12:00:00';
    try {
      const d = new Date(row.data_hora);
      dateStr = getLocalDateStr(d);
      const pad = n => String(n).padStart(2, '0');
      timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch (e) {}

    return {
      id: saleId,
      sale_date: dateStr,
      sale_time: timeStr,
      total_items_value: parseFloat(row.valor_total || 0),
      discount_value: 0,
      total_value: parseFloat(row.valor_total || 0),
      customer_name: 'Balcão / Digifarma',
      user_name: 'Caixa Digifarma',
      status: row.cancelado === 'S' ? 'CANCELADA' : 'CONCLUIDA',
      total_items: parseInt(row.total_itens || 0, 10),
      payment_methods: payments.map(p => p.method).join(', ') || 'DINHEIRO',
      fiscal_status: 'EMITIDO',
      nfe_number: notaId,
      origin: 'DIGIFARMA',
      items: [
        {
          id: 1,
          product_name: `Venda #${notaId} processada no Caixa Digifarma`,
          barcode: 'DIGI-POS',
          quantity: parseInt(row.total_itens || 1, 10),
          unit_price: parseFloat(row.valor_total || 0) / (parseInt(row.total_itens || 1, 10) || 1),
          discount_value: 0,
          total_price: parseFloat(row.valor_total || 0)
        }
      ],
      payments
    };
  }

  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  if (!sale) return null;

  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
  const payments = db.prepare('SELECT * FROM sale_payments WHERE sale_id = ?').all(saleId);

  return {
    ...sale,
    origin: 'BELINHA',
    items,
    payments
  };
}

/**
 * Resumo de movimentação de caixa de uma data específica
 * Consolida vendas do Belinha PDV e do Digifarma
 */
function obterResumoCaixaDoDia(dataRef) {
  const targetDate = dataRef || getLocalDateStr();

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
    const val = parseFloat(p.total_valor) || 0;
    if (m === 'DINHEIRO') {
      pagamentosMap.DINHEIRO += val;
    } else if (m === 'CARTAO_DEBITO' || m.includes('DEBITO') || m.includes('DÉBITO')) {
      pagamentosMap.CARTAO_DEBITO += val;
    } else if (m === 'CARTAO_CREDITO' || m.includes('CREDITO') || m.includes('CRÉDITO')) {
      pagamentosMap.CARTAO_CREDITO += val;
    } else if (m === 'PIX') {
      pagamentosMap.PIX += val;
    } else if (m === 'CREDIARIO' || m === 'CREDIÁRIO' || m.includes('CONVENIO') || m.includes('CONVÊNIO')) {
      pagamentosMap.CREDIARIO += val;
    } else {
      pagamentosMap.OUTROS += val;
    }
  }

  let totalCupons = totalVendas.total_cupons || 0;
  let totalFaturado = totalVendas.total_faturado || 0;
  let totalDescontos = totalVendas.total_descontos || 0;
  let canceladasCount = canceladas.total_canceladas || 0;
  let canceladasValor = canceladas.valor_cancelado || 0;

  // Se a data de referência for a data de hoje, consolidar também as vendas do Digifarma
  const todayStr = getLocalDateStr();
  if (targetDate === todayStr) {
    const digiSales = obterVendasDigifarmaCache({ dataInicio: todayStr, dataFim: todayStr });
    for (const s of digiSales) {
      if (s.status === 'CONCLUIDA') {
        totalCupons += 1;
        totalFaturado += s.total_value;
        for (const p of s.payments) {
          const m = (p.method || '').toUpperCase();
          const val = p.amount || 0;
          if (m === 'DINHEIRO') pagamentosMap.DINHEIRO += val;
          else if (m === 'CARTAO_DEBITO') pagamentosMap.CARTAO_DEBITO += val;
          else if (m === 'CARTAO_CREDITO') pagamentosMap.CARTAO_CREDITO += val;
          else if (m === 'PIX') pagamentosMap.PIX += val;
          else if (m === 'CREDIARIO') pagamentosMap.CREDIARIO += val;
          else pagamentosMap.OUTROS += val;
        }
      } else if (s.status === 'CANCELADA') {
        canceladasCount += 1;
        canceladasValor += s.total_value;
      }
    }
  }

  return {
    data: targetDate,
    total_cupons: totalCupons,
    total_faturado: Math.round(totalFaturado * 100) / 100,
    total_descontos: Math.round(totalDescontos * 100) / 100,
    pagamentos: {
      DINHEIRO: Math.round(pagamentosMap.DINHEIRO * 100) / 100,
      CARTAO_DEBITO: Math.round(pagamentosMap.CARTAO_DEBITO * 100) / 100,
      CARTAO_CREDITO: Math.round(pagamentosMap.CARTAO_CREDITO * 100) / 100,
      PIX: Math.round(pagamentosMap.PIX * 100) / 100,
      CREDIARIO: Math.round(pagamentosMap.CREDIARIO * 100) / 100,
      OUTROS: Math.round(pagamentosMap.OUTROS * 100) / 100
    },
    cancelamentos: {
      total: canceladasCount,
      valor: Math.round(canceladasValor * 100) / 100
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
