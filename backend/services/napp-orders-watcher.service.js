const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('../database');
const { queryDigifarma } = require('./digifarma.service');
const watcher = require('./watcher.service');

const SELLER_ID = '20a28238-fea5-11f0-b8ef-cb8fa8305438';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

let cachedToken = null;
let tokenExpiry = 0;
let isSyncing = false;
let watcherInterval = null;
let activeWatchInterval = null;
let activeWatchExpiresAt = 0;
const trackedPendingCodes = new Set();

/**
 * Obtém ou renova token de autenticação na Napp Solutions
 */
async function getNappToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const email = process.env.NAPP_EMAIL;
  const password = process.env.NAPP_PASSWORD;

  if (!email || !password) {
    throw new Error('Credenciais da Napp (NAPP_EMAIL / NAPP_PASSWORD) não configuradas no .env.');
  }

  const res = await fetch('https://api-app-public.nappsolutions.com/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Falha no login Napp (Status ${res.status}): ${err}`);
  }

  const data = await res.json();
  if (!data.token) {
    throw new Error('Token não retornado pela Napp.');
  }

  cachedToken = data.token;
  // Expira em 50 minutos para margem segura
  tokenExpiry = now + 50 * 60 * 1000;
  return cachedToken;
}

/**
 * Retorna a data local (America/Sao_Paulo) no formato YYYY-MM-DD
 */
function getLocalDateStr(dateInput = new Date()) {
  const d = new Date(dateInput);
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // 'YYYY-MM-DD'
}

/**
 * Busca detalhes completos de um pedido pelo ID
 */
async function fetchOrderDetail(orderId, token) {
  const url = `https://api-app-public.nappsolutions.com/v1/sellers/${SELLER_ID}/orders/${orderId}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`Erro ao buscar detalhe do pedido ${orderId}: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Extrai lista de itens do pedido da Napp
 */
function extractOrderItems(orderDetail) {
  let items = [];
  
  if (orderDetail.external_json) {
    try {
      const ext = typeof orderDetail.external_json === 'string' 
        ? JSON.parse(orderDetail.external_json) 
        : orderDetail.external_json;
      if (ext?.bag?.items && Array.isArray(ext.bag.items)) {
        items = ext.bag.items.map(i => ({
          name: i.name,
          ean: String(i.ean || '').trim(),
          quantity: i.quantity || 1,
          unitPrice: (i.prices?.unitValue?.value ? i.prices.unitValue.value / 100 : 0) || (i.prices?.grossValue?.value ? (i.prices.grossValue.value / 100) / (i.quantity || 1) : 0),
          totalPrice: (i.prices?.grossValue?.value ? i.prices.grossValue.value / 100 : 0)
        }));
      }
    } catch (e) {
      console.warn('[Napp Watcher] Erro ao parsear external_json do pedido:', e.message);
    }
  }

  // Fallback caso não tenha conseguido via external_json
  if (items.length === 0 && Array.isArray(orderDetail.items)) {
    items = orderDetail.items.map(i => ({
      name: i.name || i.product_name,
      ean: String(i.ean || i.sku || '').trim(),
      quantity: i.quantity || 1,
      unitPrice: parseFloat(i.price || i.unit_price || 0),
      totalPrice: parseFloat(i.total || i.total_price || 0)
    }));
  }

  return items;
}

/**
 * Localiza produto no Digifarma pelo EAN
 */
async function findProductByEan(ean) {
  if (!ean) return null;
  const cleanEan = String(ean).trim();

  // Consulta direta no Firebird para garantir dados atualizados
  const sql = `
    SELECT FIRST 1 
      PRODUTO_ID, 
      PRODUTO, 
      COD_BARRAS, 
      PROD_PRVENDA, 
      PROD_PRCOMPRA, 
      VALOR_ULT_COMPRA, 
      PROD_CMV
    FROM PRODUTOS 
    WHERE COD_BARRAS = ?
  `;
  const prods = await queryDigifarma(sql, [cleanEan]);
  if (prods && prods.length > 0) {
    return prods[0];
  }

  // Fallback: verificar tabela de múltiplos EANs se existir
  try {
    const eanSql = `
      SELECT FIRST 1 p.PRODUTO_ID, p.PRODUTO, p.COD_BARRAS, p.PROD_PRVENDA, p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, p.PROD_CMV
      FROM PRODUTOS_EAN pe
      JOIN PRODUTOS p ON pe.PRODUTO_ID = p.PRODUTO_ID
      WHERE pe.COD_BARRAS = ?
    `;
    const altProds = await queryDigifarma(eanSql, [cleanEan]);
    if (altProds && altProds.length > 0) {
      return altProds[0];
    }
  } catch (e) {}

  return null;
}

/**
 * Cria ou complementa uma Pré-Venda no Digifarma para o pedido iFood
 */
async function launchDigifarmaPreVenda(orderDetail, itemsWithProducts) {
  const orderCode = String(orderDetail.code || '').trim();
  const customerName = (orderDetail.customer_name || 'CLIENTE IFOOD').toUpperCase().substring(0, 50);
  const customerDoc = String(orderDetail.customer_document || '').replace(/\D/g, '').substring(0, 14);
  const totalAmount = parseFloat(orderDetail.total_amount || 0);

  // 1. Checar se já existe registro em VENDAS_INTEGRACOES para este pedido
  const existingVi = await queryDigifarma(
    "SELECT VENDA_NOTA_ID, ID_TRANSACAO FROM VENDAS_INTEGRACOES WHERE ID_TRANSACAO = ? OR TOKEN = ?",
    [orderCode, orderCode]
  );

  let vendaNotaId = null;
  let preVendaId = null;

  if (existingVi && existingVi.length > 0) {
    vendaNotaId = existingVi[0].VENDA_NOTA_ID;
    console.log(`[Napp Watcher] Pedido ${orderCode} já possui VENDA_NOTA_ID ${vendaNotaId} no Digifarma. Verificando itens...`);

    // Checar se a CAB_VENDAS existe
    const cab = await queryDigifarma("SELECT PRE_VENDA, CLIENTE_CUPOM FROM CAB_VENDAS WHERE VENDA_NOTA_ID = ?", [vendaNotaId]);
    if (cab && cab.length > 0) {
      preVendaId = cab[0].PRE_VENDA;
      
      // Atualizar nome do cliente e número do pedido caso estejam vazios
      await queryDigifarma(`
        UPDATE CAB_VENDAS 
        SET CLIENTE_CUPOM = ?, CPF_CUPOM = ?, NUM_PEDIDO = ?, FLAG_DELIVERY = 'S'
        WHERE VENDA_NOTA_ID = ?
      `, [customerName, customerDoc, orderCode, vendaNotaId]);
    }

    // Checar se já possui itens
    const existingItems = await queryDigifarma("SELECT COUNT(*) as CNT FROM ITEM_VENDAS WHERE VENDA_NOTA_ID = ?", [vendaNotaId]);
    if (existingItems[0]?.CNT > 0) {
      console.log(`[Napp Watcher] Pré-venda ${vendaNotaId} já possui ${existingItems[0].CNT} itens gravados.`);
      return { success: true, vendaNotaId, preVendaId, action: 'already_completed' };
    }
  } else {
    // 2. Não existe: Gerar novos IDs nos generators do Firebird
    const genCab = await queryDigifarma("SELECT GEN_ID(GEN_CAB_VENDAS, 1) as NEW_ID FROM RDB$DATABASE");
    vendaNotaId = genCab[0].NEW_ID;

    const genPv = await queryDigifarma("SELECT GEN_ID(GEN_PRE_VENDAS, 1) as NEW_PV FROM RDB$DATABASE");
    preVendaId = genPv[0].NEW_PV;

    console.log(`[Napp Watcher] Criando nova Pré-Venda: VENDA_NOTA_ID=${vendaNotaId}, PRE_VENDA=${preVendaId} para pedido ${orderCode}...`);

    // Inserir CAB_VENDAS
    const insertCabSql = `
      INSERT INTO CAB_VENDAS (
        VENDA_NOTA_ID, VENDEDOR_ID, VENDA_TOTAL, VENDA_RECEBIDO, VENDA_DATA_HORA,
        DINHEIRO, CHEQUE, CHEQUE_PRE, CARTAO, CREDIARIO, PARCELAMENTO, CAIXA_ID,
        CARTAO_ATD, CARTAO_FECHADO, CANCELADO, CANCELADO_CUPOM, STATUS_TRANSF,
        LASTUPDATE, CAIXA_DEFINIDO, PRE_VENDA, CANCELADO_SEM_FECHAR, DESCONTO_SUBTOTAL,
        PARCELAS_CARTAO, CLIENTE_CUPOM, CPF_CUPOM, ORIGEM_VENDA_ID, FRETE, FLAG_DELIVERY,
        VENDA_TOTAL_DEC, VENDA_RECEBIDO_DEC, NUM_PEDIDO
      ) VALUES (
        ?, 11, 0, 0, CURRENT_TIMESTAMP,
        0, 0, 0, 0, 0, 0, 1090,
        ?, 'N', 'N', 'N', 'I',
        CURRENT_TIMESTAMP, 'S', ?, 'N', 0,
        1, ?, ?, 8, 0, 'S',
        0, 0, ?
      )
    `;

    await queryDigifarma(insertCabSql, [
      vendaNotaId,
      preVendaId,
      preVendaId,
      customerName,
      customerDoc,
      orderCode
    ]);

    // Inserir CAB_VENDAS_FPAGTOS
    const insertFpSql = `
      INSERT INTO CAB_VENDAS_FPAGTOS (
        CAB_VENDAS_FPAGTO_ID, TIPO_PAGAMENTO_ID, VENDA_NOTA_ID, ORDEM_ID, NSU, PARCELAS, VALOR, VALOR_CANCELADO
      ) VALUES (
        GEN_ID(GEN_CAB_VENDAS_FPAGTOS, 1), 9, ?, 1, ?, 1, ?, 0
      )
    `;
    await queryDigifarma(insertFpSql, [vendaNotaId, orderCode, totalAmount]);

    // Inserir VENDAS_INTEGRACOES
    const insertViSql = `
      INSERT INTO VENDAS_INTEGRACOES (
        VENDA_NOTA_ID, INTEGRACAO, ID_TRANSACAO, NSU, VALOR_TRANSACAO, TOKEN, STATUS
      ) VALUES (
        ?, 'NAPP iFood!', ?, ?, ?, ?, 'A'
      )
    `;
    await queryDigifarma(insertViSql, [vendaNotaId, orderCode, orderCode, totalAmount, orderCode]);

    // Inserir STATUS_VENDA
    const dummyToken = 'napp_' + orderCode + '_' + Date.now();
    await queryDigifarma(`
      INSERT INTO STATUS_VENDA (
        TOKEN, VENDA_NOTA_ID, GRAVOU_CAB_VENDAS, GRAVOU_ITEM_VENDAS
      ) VALUES (?, ?, 'S', 'S')
    `, [dummyToken.substring(0, 40), vendaNotaId]);
  }

  // 3. Inserir Itens em ITEM_VENDAS
  let itemIndex = 1;
  for (const item of itemsWithProducts) {
    const prod = item.product;
    const qty = item.quantity || 1;
    const unitPrice = item.unitPrice || parseFloat(prod.PROD_PRVENDA || 0);
    const costPrice = parseFloat(prod.PROD_PRCOMPRA || prod.VALOR_ULT_COMPRA || 0);
    const cmv = parseFloat(prod.PROD_CMV || costPrice || 0);

    // Buscar estoque local atual como SALDO_ANTERIOR
    let saldoAnterior = 0;
    try {
      const cached = db.prepare('SELECT estoque_atual FROM digifarma_products_cache WHERE produto_id = ?').get(prod.PRODUTO_ID);
      if (cached && typeof cached.estoque_atual === 'number') {
        saldoAnterior = cached.estoque_atual;
      }
    } catch (e) {}

    const insertItemSql = `
      INSERT INTO ITEM_VENDAS (
        ITEM_VENDA_ID, VENDA_NOTA_ID, PRODUTO_ID, ITEMVEND_QUANT, ITEMVEND_PRTABELA,
        ITEMVEND_PRVENDA, ITEMVEND_COMISSAO, PAGAR_COMISSAO, DATA_COMISSAO, SALDO_ANTERIOR,
        VENDEDOR_ID, CANCELADO, SIGN, COD_TRIBUTACAO, ITEMVEND_CANCELADO_CUPOM, STATUS_TRANSF,
        LASTUPDATE, ITEMVEND_PERC_COMIS, CONFIRMADO, ORIGEM_PRECO_ID, ITEMVEND_PRTABELA_DEC,
        ITEMVEND_PRVENDA_DEC, ITEMVEND_COMISSAO_DEC, ITEMVEND_DESCONTO_DEC, ITEMVEND_FRETE_TOTAL,
        SUBSIDIO, SUBSIDIO_ASSEFAZ, ITEMVEND_FRETE, VENDA_INTELIGENTE, ITEMVEND_ULT_COMPRA,
        ITEMVEND_CMV, INDICADOR, CASHBACK_ACUMULADO, CASHBACK_RESGATADO, PONTO_ACUMULADO
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, 0, 'S', CURRENT_TIMESTAMP, ?,
        11, 'N', 'CHK-010605', 'F', 'N', 'I',
        CURRENT_TIMESTAMP, 1, 'N', 1, ?,
        ?, 0, 0, 0,
        0, 0, 0, 'N', ?,
        ?, 0, 0, 0, 0
      )
    `;

    await queryDigifarma(insertItemSql, [
      itemIndex,
      vendaNotaId,
      prod.PRODUTO_ID,
      qty,
      unitPrice,
      unitPrice,
      saldoAnterior,
      unitPrice,
      unitPrice,
      costPrice,
      cmv
    ]);

    itemIndex++;
  }

  console.log(`[Napp Watcher] ✅ Pré-venda #${preVendaId} (VendaNota #${vendaNotaId}) finalizada com ${itemsWithProducts.length} itens no Digifarma!`);
  return {
    success: true,
    vendaNotaId,
    preVendaId,
    action: 'created'
  };
}

/**
 * Registra o pedido iFood na tabela de controle financeiro ifood_sales (Previsão D+30)
 */
function recordIFoodSale(orderDetail, fallbackId = null) {
  const orderCode = String(orderDetail.code || '').trim();
  const orderId = orderDetail.id || fallbackId || ('napp_' + orderCode);
  const rawDate = orderDetail.date || new Date().toISOString();
  const saleDateStr = getLocalDateStr(rawDate);

  // Verificar se já existe em ifood_sales
  const existing = db.prepare("SELECT id, status FROM ifood_sales WHERE id = ? OR description LIKE ?").get(
    orderId,
    `%#${orderCode}%`
  );

  if (existing) {
    return { recorded: false, id: existing.id, status: existing.status };
  }

  // Obter taxa do iFood configurada no sistema (padrão 6.5%)
  let feePercent = 6.5;
  try {
    const feeSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'ifood_fee_percent'").get();
    if (feeSetting && feeSetting.value) {
      feePercent = parseFloat(feeSetting.value) || 6.5;
    }
  } catch (e) {}

  const grossValue = parseFloat(orderDetail.total_amount || 0);
  const feeValue = grossValue * (feePercent / 100);
  const netValue = grossValue - feeValue;

  // Previsão de repasse: D+30 (30 dias corridos)
  const d = new Date(saleDateStr + 'T12:00:00Z');
  d.setDate(d.getDate() + 30);
  const dueDateStr = d.toISOString().split('T')[0];

  const customerName = orderDetail.customer_name || 'Cliente iFood';
  const description = `iFood #${orderCode} - ${customerName}`;

  db.prepare(`
    INSERT INTO ifood_sales (
      id, sale_date, gross_value, operator_fee_percent, operator_fee_value,
      net_value, payment_due_date, status, description, user_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendente', ?, 'Robô Napp/iFood', ?)
  `).run(
    orderId,
    saleDateStr,
    grossValue,
    feePercent,
    feeValue,
    netValue,
    dueDateStr,
    description,
    new Date().toISOString()
  );

  console.log(`[Napp Watcher] 💰 Pedido #${orderCode} cadastrado no controle iFood (Bruto: R$ ${grossValue.toFixed(2)}, Líquido Previsto: R$ ${netValue.toFixed(2)}, Vencimento: ${dueDateStr}).`);
  return { recorded: true, id: orderId };
}

/**
 * Processamento central de um pedido Napp
 */
async function processSingleOrder(orderSummary, token, todayStr) {
  const orderId = orderSummary.id;
  const orderCode = String(orderSummary.code || '');
  const orderDateStr = getLocalDateStr(orderSummary.date);
  const isToday = (orderDateStr === todayStr);

  // Verificar histórico prévio no SQLite
  const prevSync = db.prepare("SELECT * FROM napp_orders_sync WHERE order_id = ?").get(orderId);

  // Se já foi sincronizado com sucesso no Digifarma (ou dispensado por ser data passada) E já está no ifood_sales, nada a fazer
  if (prevSync && (prevSync.sync_status === 'SUCCESS' || prevSync.sync_status === 'SKIPPED_PAST_DATE')) {
    const inIfood = db.prepare("SELECT id FROM ifood_sales WHERE id = ? OR description LIKE ?").get(orderId, `%#${orderCode}%`);
    if (inIfood) {
      return { skipped: true, code: orderCode };
    }
  }

  // Buscar detalhes do pedido
  const detail = await fetchOrderDetail(orderId, token);

  // 1. Sempre registrar no controle financeiro do BelaFarma (ifood_sales)
  recordIFoodSale(detail);

  // 2. Lançamento no Digifarma: APENAS se o pedido for de HOJE
  if (!isToday) {
    db.prepare(`
      INSERT OR REPLACE INTO napp_orders_sync (
        order_id, code, order_date, customer_name, customer_document,
        total_amount, is_today, prevenda_id, venda_nota_id, sync_status, error_log, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'SKIPPED_PAST_DATE', NULL, ?)
    `).run(
      orderId,
      orderCode,
      orderDateStr,
      detail.customer_name || '',
      detail.customer_document || '',
      parseFloat(detail.total_amount || 0),
      new Date().toISOString()
    );
    return { success: true, code: orderCode, isToday: false, status: 'SKIPPED_PAST_DATE' };
  }

  // O pedido é de HOJE: Processar lançamento no Digifarma
  const rawItems = extractOrderItems(detail);
  if (rawItems.length === 0) {
    const err = `Nenhum item identificado no pedido #${orderCode}`;
    db.prepare(`
      INSERT OR REPLACE INTO napp_orders_sync (
        order_id, code, order_date, customer_name, customer_document,
        total_amount, is_today, prevenda_id, venda_nota_id, sync_status, error_log, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, NULL, NULL, 'NO_ITEMS_FOUND', ?, ?)
    `).run(
      orderId,
      orderCode,
      orderDateStr,
      detail.customer_name || '',
      detail.customer_document || '',
      parseFloat(detail.total_amount || 0),
      err,
      new Date().toISOString()
    );
    return { success: false, code: orderCode, error: err };
  }

  // Validar produtos por EAN
  const itemsWithProducts = [];
  const missingItems = [];

  for (const item of rawItems) {
    const product = await findProductByEan(item.ean);
    if (!product) {
      missingItems.push(`${item.name} (EAN: ${item.ean || 'sem EAN'})`);
    } else {
      itemsWithProducts.push({
        ...item,
        product
      });
    }
  }

  if (missingItems.length > 0) {
    const errorMsg = `Itens não encontrados no Digifarma por EAN: ${missingItems.join(', ')}`;
    console.warn(`[Napp Watcher] ⚠️ Pedido #${orderCode} não pôde ser lançado no Digifarma: ${errorMsg}`);

    db.prepare(`
      INSERT OR REPLACE INTO napp_orders_sync (
        order_id, code, order_date, customer_name, customer_document,
        total_amount, is_today, prevenda_id, venda_nota_id, sync_status, error_log, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, NULL, NULL, 'ITEM_NOT_FOUND', ?, ?)
    `).run(
      orderId,
      orderCode,
      orderDateStr,
      detail.customer_name || '',
      detail.customer_document || '',
      parseFloat(detail.total_amount || 0),
      errorMsg,
      new Date().toISOString()
    );

    return { success: false, code: orderCode, error: errorMsg };
  }

  // Todos os itens encontrados! Gravar Pré-Venda no Digifarma
  try {
    const digiResult = await launchDigifarmaPreVenda(detail, itemsWithProducts);

    db.prepare(`
      INSERT OR REPLACE INTO napp_orders_sync (
        order_id, code, order_date, customer_name, customer_document,
        total_amount, is_today, prevenda_id, venda_nota_id, sync_status, error_log, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'SUCCESS', NULL, ?)
    `).run(
      orderId,
      orderCode,
      orderDateStr,
      detail.customer_name || '',
      detail.customer_document || '',
      parseFloat(detail.total_amount || 0),
      digiResult.preVendaId,
      digiResult.vendaNotaId,
      new Date().toISOString()
    );

    return {
      success: true,
      code: orderCode,
      isToday: true,
      preVendaId: digiResult.preVendaId,
      vendaNotaId: digiResult.vendaNotaId
    };
  } catch (digiErr) {
    console.error(`[Napp Watcher] ❌ Erro ao gravar pré-venda do pedido #${orderCode} no Digifarma:`, digiErr.message);

    db.prepare(`
      INSERT OR REPLACE INTO napp_orders_sync (
        order_id, code, order_date, customer_name, customer_document,
        total_amount, is_today, prevenda_id, venda_nota_id, sync_status, error_log, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, NULL, NULL, 'ERROR', ?, ?)
    `).run(
      orderId,
      orderCode,
      orderDateStr,
      detail.customer_name || '',
      detail.customer_document || '',
      parseFloat(detail.total_amount || 0),
      digiErr.message,
      new Date().toISOString()
    );

    return { success: false, code: orderCode, error: digiErr.message };
  }
}

/**
 * Executa o ciclo de sincronização e vigia da Napp
 * @param {boolean} includePast30Days Se true, verifica pedidos dos últimos 30 dias
 */
async function syncNappOrders({ includePast30Days = false } = {}) {
  if (isSyncing) {
    console.log('[Napp Watcher] ⏳ Já existe uma sincronização de pedidos em execução.');
    return { status: 'already_running' };
  }

  isSyncing = true;
  const todayStr = getLocalDateStr();
  console.log(`[Napp Watcher] 🚀 Iniciando checagem de pedidos Napp (Data Hoje: ${todayStr}, 30 Dias: ${includePast30Days})...`);

  const results = {
    processed: 0,
    createdPreVenda: 0,
    recordedIFood: 0,
    errors: []
  };

  try {
    const token = await getNappToken();
    const limit = 50;
    let offset = 0;
    let keepPaginating = true;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const minDateLimit = thirtyDaysAgo.toISOString();

    while (keepPaginating) {
      const url = `https://api-app-public.nappsolutions.com/v1/sellers/${SELLER_ID}/orders?limit=${limit}&offset=${offset}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error(`Erro ao listar pedidos da Napp: HTTP ${res.status}`);
      }

      const data = await res.json();
      const orders = data.data || [];
      if (orders.length === 0) break;

      for (const order of orders) {
        const orderDateStr = getLocalDateStr(order.date);

        // Se o pedido for de hoje e estiver em andamento (não entregue e não cancelado), sinalizar
        if (orderDateStr === todayStr && order.status !== 'DELIVERED' && order.status !== 'CANCELED') {
          results.hasPendingOrdersToday = true;
          console.log(`[Napp Watcher] ⏳ Pedido #${order.code} de hoje em andamento (Status: ${order.status}). Aguardando ser entregue...`);
        }

        // Apenas pedidos entregues geram pré-venda no Digifarma e controle financeiro
        if (order.status !== 'DELIVERED') continue;

        // Se não for retroativo 30d e o pedido for anterior a hoje, pular para o próximo (não break, pois a lista da Napp não é ordenada estritamente por data)
        if (!includePast30Days && orderDateStr !== todayStr) {
          continue;
        }

        // Se for retroativo 30 dias, ignorar se for mais antigo que 30 dias
        if (includePast30Days && order.date < minDateLimit) {
          continue;
        }

        try {
          const r = await processSingleOrder(order, token, todayStr);
          results.processed++;
          if (r.preVendaId) {
            results.createdPreVenda++;
            if (trackedPendingCodes.has(order.code)) {
              trackedPendingCodes.delete(order.code);
              console.log(`[Napp Watcher] 🎉 Pedido pendente #${order.code} foi entregue e finalizado com sucesso!`);
            }
          }
          if (r.error) results.errors.push({ code: order.code, error: r.error });
        } catch (singleErr) {
          results.errors.push({ code: order.code, error: singleErr.message });
        }

        await delay(100);
      }

      offset += limit;
      if (offset >= (data.pagination?.total || 0)) {
        break;
      }
    }

    const summaryMsg = `Vigia Napp finalizado: ${results.processed} pedidos avaliados, ${results.createdPreVenda} pré-vendas criadas hoje, ${results.errors.length} erros.`;
    console.log(`[Napp Watcher] ✅ ${summaryMsg}`);
    watcher.registerServiceRun('napp_orders_watcher', 'SUCCESS', summaryMsg);

  } catch (err) {
    console.error('[Napp Watcher] ❌ Erro ao executar vigia Napp:', err.message);
    watcher.registerServiceRun('napp_orders_watcher', 'FAILED', err.message);
    results.errors.push({ general: err.message });
  } finally {
    isSyncing = false;
  }

  return results;
}

/**
 * Verifica se um texto recebido no WhatsApp corresponde ao alerta de novo pedido do iFood
 */
function isIFoodOrderAlert(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hasNovoPedido = normalized.includes('novo pedido recebido') || normalized.includes('novo pedido');
  const hasFarmacia = normalized.includes('bela farma');
  return hasNovoPedido && hasFarmacia;
}

const WHATSAPP_TRIGGER_DELAY_MS = 10 * 60 * 1000; // 10 minutos
const scheduledWhatsAppTimers = new Set();

/**
 * Gatilho chamado quando a mensagem de novo pedido iFood chega no WhatsApp principal.
 * Aguarda 10 minutos após o recebimento do alerta para disparar a consulta na Napp,
 * dando tempo hábil para a separação, expedição e finalização da entrega do pedido.
 */
function triggerNappCheckFromWhatsApp(messageText = '', sender = '', { delayMs = WHATSAPP_TRIGGER_DELAY_MS } = {}) {
  console.log(`[Napp Watcher] 📲 GATILHO WHATSAPP RECEBIDO de ${sender}!`);
  console.log(`[Napp Watcher] 📄 Mensagem: "${messageText.replace(/\r?\n/g, ' ')}"`);

  // Extrai código numérico caso venha na mensagem (ex: #6099 ou 6099)
  const codeMatch = messageText.match(/#?(\d{4,6})/);
  let orderCodeStr = '';
  if (codeMatch) {
    orderCodeStr = codeMatch[1];
    trackedPendingCodes.add(orderCodeStr);
    console.log(`[Napp Watcher] 🔍 Código de pedido detectado no alerta: #${orderCodeStr}`);
  }

  const delayMinutes = Math.round(delayMs / 60000);
  console.log(`[Napp Watcher] ⏳ Aguardando ${delayMinutes} minutos após o evento do WhatsApp para consultar a Napp...`);

  // Agenda a consulta na Napp para daqui a 10 minutos (ou delayMs especificado)
  const timer = setTimeout(async () => {
    scheduledWhatsAppTimers.delete(timer);
    console.log(`[Napp Watcher] ⏰ Tempo de espera (${delayMinutes} min) concluído! Consultando pedido no Napp agora...`);

    // Define janela de vigilância ativa de 60 minutos a partir deste momento
    activeWatchExpiresAt = Date.now() + 60 * 60 * 1000;

    // Executa a checagem no Napp
    const res = await syncNappOrders({ includePast30Days: false });

    // Se o pedido ainda estiver em trânsito (não entregue) hoje, ativa vigilância de 60s até a entrega
    if (res?.hasPendingOrdersToday || trackedPendingCodes.size > 0) {
      startActiveWatchInterval();
    }
  }, delayMs);

  scheduledWhatsAppTimers.add(timer);
  return timer;
}

/**
 * Inicia ciclo de monitoramento frequente (a cada 60s) enquanto houver pedido em andamento
 */
function startActiveWatchInterval() {
  if (activeWatchInterval) return;

  console.log('[Napp Watcher] ⚡ Monitoramento ativo iniciado (checando a cada 60s até que o pedido seja entregue)...');
  activeWatchInterval = setInterval(async () => {
    if (Date.now() > activeWatchExpiresAt) {
      console.log('[Napp Watcher] 💤 Janela de monitoramento ativo de 60 minutos expirou. Retornando ao modo de repouso.');
      stopActiveWatchInterval();
      return;
    }

    const res = await syncNappOrders({ includePast30Days: false });
    if (!res?.hasPendingOrdersToday && trackedPendingCodes.size === 0) {
      console.log('[Napp Watcher] ✅ Todos os pedidos de hoje estão entregues ou finalizados. Modo de repouso ativado.');
      stopActiveWatchInterval();
    }
  }, 60 * 1000);
}

function stopActiveWatchInterval() {
  if (activeWatchInterval) {
    clearInterval(activeWatchInterval);
    activeWatchInterval = null;
  }
}

/**
 * Inicia o serviço de monitoramento.
 * Em vez de consultar a API da Napp de 2 em 2 minutos ininterruptamente,
 * o monitoramento é acionado por evento via WhatsApp principal (frase de novo pedido)
 * com acompanhamento ativo até a entrega, e um batimento leve de segurança (a cada 30 min).
 */
function startNappOrdersWatcher() {
  if (watcherInterval) return;

  console.log('[Napp Watcher] 🎧 Modo de escuta ativado: Monitoramento Napp disparado via WhatsApp principal (frase de novo pedido) + batimento leve de 30min.');

  // Executa uma vez na inicialização verificando os últimos 30 dias
  syncNappOrders({ includePast30Days: true }).catch(e => console.error('[Napp Watcher] Erro inicial 30d:', e.message));

  // Batimento leve de segurança (a cada 30 minutos em vez de 2 minutos)
  watcherInterval = setInterval(() => {
    syncNappOrders({ includePast30Days: false }).catch(e => console.error('[Napp Watcher] Erro no ciclo de segurança:', e.message));
  }, 30 * 60 * 1000);
}

function stopNappOrdersWatcher() {
  if (watcherInterval) {
    clearInterval(watcherInterval);
    watcherInterval = null;
  }
  for (const t of scheduledWhatsAppTimers) {
    clearTimeout(t);
  }
  scheduledWhatsAppTimers.clear();
  stopActiveWatchInterval();
}

module.exports = {
  syncNappOrders,
  startNappOrdersWatcher,
  stopNappOrdersWatcher,
  triggerNappCheckFromWhatsApp,
  isIFoodOrderAlert,
  getNappToken
};

