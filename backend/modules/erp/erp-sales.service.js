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

      let dateStr = null;
      let timeStr = '12:00:00';
      try {
        const d = new Date(r.data_hora);
        if (!isNaN(d.getTime())) {
          dateStr = getLocalDateStr(d);
          const pad = n => String(n).padStart(2, '0');
          timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }
      } catch (e) {}

      // Se a data do registro não pôde ser calculada ou não for a data esperada
      if (!dateStr) continue;

      if (dataInicio && dataFim) {
        if (dateStr < dataInicio || dateStr > dataFim) continue;
      } else if (dataInicio) {
        if (dateStr !== dataInicio) continue;
      } else {
        // Se nenhuma data foi especificada, o cache só deve retornar vendas estritamente de HOJE
        if (dateStr !== todayStr) continue;
      }

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
function listarVendas({ dataInicio, dataFim, status, paymentMethod, deliveryType = 'TODOS', limit = 100, offset = 0 } = {}) {
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

  const normalizedDelivery = String(deliveryType || 'TODOS').toUpperCase();
  if (normalizedDelivery === 'ENTREGA') {
    where += ' AND COALESCE(s.is_delivery, 0) = 1';
  } else if (normalizedDelivery === 'LOCAL') {
    where += ' AND COALESCE(s.is_delivery, 0) = 0';
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
      (SELECT json_group_array(json_object('method', payment_method, 'amount', amount, 'card_brand', card_brand)) FROM sale_payments WHERE sale_id = s.id) as payments_json,
      (SELECT recipe_type FROM controlled_sales_recipes WHERE sale_id = s.id LIMIT 1) as recipe_type,
      (SELECT COUNT(*) FROM controlled_sales_recipes WHERE sale_id = s.id) as controlled_count
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
      is_delivery: Number(r.is_delivery || 0) === 1,
      origin: 'BELINHA',
      payments: paymentsParsed
    };
  });

  // 2. Vendas do Digifarma (Cache SQLite) — quando o filtro for estritamente ENTREGA, retorna apenas entregas marcadas
  const digiSales = normalizedDelivery === 'ENTREGA'
    ? []
    : obterVendasDigifarmaCache({ dataInicio, dataFim, status, paymentMethod }).map(d => ({
        ...d,
        is_delivery: false
      }));

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

  // Diretriz oficial: Priorizar exclusivamente o Digifarma como fonte da verdade de vendas
  const todayStr = getLocalDateStr();
  if (targetDate === todayStr) {
    const digiSales = obterVendasDigifarmaCache({ dataInicio: todayStr, dataFim: todayStr });
    if (digiSales && digiSales.length > 0) {
      // Se há vendas do Digifarma, elas são a única e absoluta fonte da verdade
      totalCupons = 0;
      totalFaturado = 0;
      totalDescontos = 0;
      canceladasCount = 0;
      canceladasValor = 0;
      Object.keys(pagamentosMap).forEach(k => { pagamentosMap[k] = 0; });

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
  }

  // Movimentações de caixa do dia (Sangrias e Suprimentos / Reforços)
  let totalSangriaDia = 0;
  let totalSuprimentoDia = 0;
  try {
    const movRows = db.prepare(`
      SELECT movement_type, COALESCE(SUM(amount), 0) as total
      FROM cash_movements
      WHERE DATE(created_at) = ?
      GROUP BY movement_type
    `).all(targetDate);
    for (const mr of movRows) {
      if (mr.movement_type === 'SANGRIA') totalSangriaDia = Math.round((Number(mr.total) || 0) * 100) / 100;
      if (mr.movement_type === 'SUPRIMENTO') totalSuprimentoDia = Math.round((Number(mr.total) || 0) * 100) / 100;
    }
  } catch (_) {}

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
    movimentacoes: {
      total_sangria: totalSangriaDia,
      total_suprimento: totalSuprimentoDia
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

const DEFAULT_JF_NEIGHBORHOODS = [
  'Ipiranga',
  'Santa Luzia',
  'São Mateus',
  'Cascatinha',
  'Teixeiras',
  'Santa Efigênia',
  'Jardim Gaúcho',
  'Sagrado Coração',
  'Bom Pastor',
  'Centro',
  'Bela Aurora',
  'Alto dos Passos',
  'Estrela Sul',
  'Graminha',
  'Vila Ideal',
  'Olavo Costa',
  'Cruzeiro do Sul',
  'São Geraldo',
  'Santa Cecília',
  'Mundo Novo'
];

/**
 * Retorna os bairros mais pedidos (para botões de 1 clique no PDV) + lista completa para autocomplete.
 * Combina vendas do PDV (sales.delivery_neighborhood), entregas WhatsApp (deliveries.neighborhood)
 * e lista padrão da região Zona Sul de Juiz de Fora.
 */
function obterBairrosMaisPedidos(topLimit = 8) {
  const countsMap = new Map();
  const displayMap = new Map();

  const register = (rawName, weight = 1) => {
    const clean = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (!clean || clean.length < 2) return;
    if (/^(n[aã]o informado|balc[aã]o|sem bairro|null|undefined|-)$/i.test(clean)) return;
    const key = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (!displayMap.has(key)) displayMap.set(key, clean);
    countsMap.set(key, (countsMap.get(key) || 0) + weight);
  };

  try {
    const salesRows = db.prepare(`
      SELECT delivery_neighborhood AS bairro, COUNT(*) AS qtd
      FROM sales
      WHERE is_delivery = 1
        AND status = 'CONCLUIDA'
        AND delivery_neighborhood IS NOT NULL
        AND TRIM(delivery_neighborhood) != ''
      GROUP BY TRIM(delivery_neighborhood)
    `).all();
    for (const r of salesRows) register(r.bairro, Number(r.qtd || 0) * 2);
  } catch (_) {}

  try {
    const delivRows = db.prepare(`
      SELECT neighborhood AS bairro, COUNT(*) AS qtd
      FROM deliveries
      WHERE neighborhood IS NOT NULL AND TRIM(neighborhood) != ''
      GROUP BY TRIM(neighborhood)
    `).all();
    for (const r of delivRows) register(r.bairro, Number(r.qtd || 0));
  } catch (_) {}

  // Garante bairros padrão no catálogo (peso 0 para só entrar no top se ainda não houver histórico suficiente)
  for (const def of DEFAULT_JF_NEIGHBORHOODS) {
    register(def, 0);
  }

  const ranked = Array.from(countsMap.entries())
    .map(([key, score]) => ({ name: displayMap.get(key), score }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const idxA = DEFAULT_JF_NEIGHBORHOODS.findIndex(d => d.toUpperCase() === a.name.toUpperCase());
      const idxB = DEFAULT_JF_NEIGHBORHOODS.findIndex(d => d.toUpperCase() === b.name.toUpperCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

  return {
    topNeighborhoods: ranked.slice(0, topLimit).map(r => r.name),
    allNeighborhoods: ranked.map(r => r.name)
  };
}

/**
 * Painel Analítico Gerencial de Entregas:
 * - Comparativo Venda Local vs Entrega (qtd, faturamento, %, ticket médio)
 * - Ranking por Bairro (qtd, faturamento, ticket médio, %)
 * - Horários de Pico (07h-22h) e Dias da Semana (Dom-Sáb)
 * - Desempenho por Canal (WhatsApp, Telefone, Balcão, iFood) e Forma de Pagamento
 * - Top 15 Produtos mais pedidos em Entregas
 * - Lista detalhada das entregas do período
 */
function obterRelatorioAnaliticoEntregas({ dataInicio, dataFim } = {}) {
  const today = getLocalDateStr();
  const start = dataInicio || today;
  const end = dataFim || start;

  const round2 = v => Math.round((Number(v) || 0) * 100) / 100;

  const salesRows = db.prepare(`
    SELECT
      s.id,
      s.sale_date,
      s.sale_time,
      s.total_value,
      s.discount_value,
      s.payment_method,
      s.customer_name,
      s.seller_name,
      s.user_name,
      COALESCE(s.is_delivery, 0) AS is_delivery,
      COALESCE(NULLIF(TRIM(s.delivery_neighborhood), ''), 'Não Informado') AS delivery_neighborhood,
      COALESCE(NULLIF(TRIM(s.delivery_channel), ''), 'WHATSAPP') AS delivery_channel,
      (SELECT COALESCE(SUM(quantity), 0) FROM sale_items WHERE sale_id = s.id) AS total_units
    FROM sales s
    WHERE s.status = 'CONCLUIDA'
      AND s.sale_date BETWEEN ? AND ?
    ORDER BY s.sale_date DESC, s.sale_time DESC
  `).all(start, end);

  const deliveryRows = salesRows.filter(r => Number(r.is_delivery) === 1);
  const localRows = salesRows.filter(r => Number(r.is_delivery) === 0);

  const delivTotal = round2(deliveryRows.reduce((a, r) => a + Number(r.total_value || 0), 0));
  const localTotal = round2(localRows.reduce((a, r) => a + Number(r.total_value || 0), 0));
  const grandTotal = round2(delivTotal + localTotal);

  const delivCount = deliveryRows.length;
  const localCount = localRows.length;
  const grandCount = salesRows.length;

  // 1. Ranking por Bairro
  const bairroMap = new Map();
  for (const r of deliveryRows) {
    const b = r.delivery_neighborhood || 'Não Informado';
    const cur = bairroMap.get(b) || { neighborhood: b, count: 0, total: 0, units: 0 };
    cur.count += 1;
    cur.total = round2(cur.total + Number(r.total_value || 0));
    cur.units += Number(r.total_units || 0);
    bairroMap.set(b, cur);
  }
  const byNeighborhood = Array.from(bairroMap.values())
    .map(b => ({
      ...b,
      avgTicket: b.count > 0 ? round2(b.total / b.count) : 0,
      shareCountPct: delivCount > 0 ? round2((b.count / delivCount) * 100) : 0,
      shareRevenuePct: delivTotal > 0 ? round2((b.total / delivTotal) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count || b.total - a.total);

  // 2. Horários de Pico (07h às 21h)
  const hourMap = new Map();
  for (let h = 7; h <= 21; h++) {
    const label = `${String(h).padStart(2, '0')}h`;
    hourMap.set(h, { hour: h, label, count: 0, total: 0 });
  }
  for (const r of deliveryRows) {
    const h = parseInt(String(r.sale_time || '12:00').slice(0, 2), 10);
    if (!Number.isNaN(h)) {
      const bucket = hourMap.get(h) || { hour: h, label: `${String(h).padStart(2, '0')}h`, count: 0, total: 0 };
      bucket.count += 1;
      bucket.total = round2(bucket.total + Number(r.total_value || 0));
      hourMap.set(h, bucket);
    }
  }
  const byHour = Array.from(hourMap.values()).sort((a, b) => a.hour - b.hour);

  // 3. Dias da Semana (Dom a Sáb)
  const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const weekdayBuckets = weekdayNames.map((label, day) => ({ day, label, count: 0, total: 0 }));
  for (const r of deliveryRows) {
    const parts = String(r.sale_date || '').split('-').map(Number);
    if (parts.length === 3 && !parts.some(Number.isNaN)) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const wd = d.getDay();
      if (weekdayBuckets[wd]) {
        weekdayBuckets[wd].count += 1;
        weekdayBuckets[wd].total = round2(weekdayBuckets[wd].total + Number(r.total_value || 0));
      }
    }
  }

  // 4. Canal de Origem (WhatsApp, Telefone, Balcão, iFood)
  const channelMap = new Map();
  for (const r of deliveryRows) {
    const ch = String(r.delivery_channel || 'WHATSAPP').toUpperCase();
    const cur = channelMap.get(ch) || { channel: ch, count: 0, total: 0 };
    cur.count += 1;
    cur.total = round2(cur.total + Number(r.total_value || 0));
    channelMap.set(ch, cur);
  }
  const byChannel = Array.from(channelMap.values())
    .map(c => ({
      ...c,
      avgTicket: c.count > 0 ? round2(c.total / c.count) : 0,
      sharePct: delivCount > 0 ? round2((c.count / delivCount) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count || b.total - a.total);

  // 5. Forma de Pagamento nas Entregas
  const paymentMap = new Map();
  for (const r of deliveryRows) {
    const pm = String(r.payment_method || 'DINHEIRO').toUpperCase();
    const cur = paymentMap.get(pm) || { method: pm, count: 0, total: 0 };
    cur.count += 1;
    cur.total = round2(cur.total + Number(r.total_value || 0));
    paymentMap.set(pm, cur);
  }
  const byPayment = Array.from(paymentMap.values())
    .map(p => ({
      ...p,
      sharePct: delivTotal > 0 ? round2((p.total / delivTotal) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total);

  // 6. Top 15 Produtos mais pedidos nas Entregas
  const topProducts = db.prepare(`
    SELECT
      si.product_code AS code,
      si.product_name AS name,
      SUM(si.quantity) AS total_qty,
      COUNT(DISTINCT si.sale_id) AS orders_count,
      ROUND(SUM(si.total_price), 2) AS total_revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.status = 'CONCLUIDA'
      AND COALESCE(s.is_delivery, 0) = 1
      AND s.sale_date BETWEEN ? AND ?
    GROUP BY si.product_code, si.product_name
    ORDER BY total_qty DESC, total_revenue DESC
    LIMIT 15
  `).all(start, end);

  return {
    period: { dataInicio: start, dataFim: end },
    comparison: {
      delivery: {
        count: delivCount,
        total: delivTotal,
        avgTicket: delivCount > 0 ? round2(delivTotal / delivCount) : 0,
        shareCountPct: grandCount > 0 ? round2((delivCount / grandCount) * 100) : 0,
        shareRevenuePct: grandTotal > 0 ? round2((delivTotal / grandTotal) * 100) : 0
      },
      local: {
        count: localCount,
        total: localTotal,
        avgTicket: localCount > 0 ? round2(localTotal / localCount) : 0,
        shareCountPct: grandCount > 0 ? round2((localCount / grandCount) * 100) : 0,
        shareRevenuePct: grandTotal > 0 ? round2((localTotal / grandTotal) * 100) : 0
      },
      grandTotal,
      grandCount
    },
    byNeighborhood,
    byHour,
    byWeekday: weekdayBuckets,
    byChannel,
    byPayment,
    topProducts,
    deliveries: deliveryRows.map(r => ({
      id: r.id,
      sale_date: r.sale_date,
      sale_time: r.sale_time,
      total_value: round2(r.total_value),
      payment_method: r.payment_method || 'DINHEIRO',
      customer_name: r.customer_name || 'Cliente Balcão',
      seller_name: r.seller_name || r.user_name || 'Caixa',
      neighborhood: r.delivery_neighborhood,
      channel: r.delivery_channel,
      total_units: Number(r.total_units || 0)
    }))
  };
}

module.exports = {
  listarVendas,
  obterVendaDetalhada,
  obterResumoCaixaDoDia,
  obterVendasBelinhaLive,
  obterBairrosMaisPedidos,
  obterRelatorioAnaliticoEntregas
};
