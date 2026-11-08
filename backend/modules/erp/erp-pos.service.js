/**
 * Belinha ERP - POS (Frente de Caixa) Service
 * Gerencia a finalização rápida de vendas, baixa de estoque atômica e cancelamento com estorno.
 */

const { db } = require('./erp-database');
const { obterProdutoPorCodigo } = require('./erp-products.service');
const { recordSaleRecipes } = require('./controlled-medications.service');

/**
 * Registra uma nova venda de PDV com baixa atômica de estoque
 */
function registrarVenda(payload) {
  const {
    items = [],
    payments = [],
    customer_id = null,
    customer_name = null,
    discount_value = 0,
    user_name = 'Caixa',
    seller_id = null,
    seller_name = null,
    notes = ''
  } = payload;

  const finalSellerName = String(seller_name || user_name || 'Caixa').trim() || 'Caixa';
  const finalSellerId = seller_id || payload.user_id || 'caixa';

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('A venda deve conter pelo menos 1 produto.');
  }

  if (!Array.isArray(payments) || payments.length === 0) {
    throw new Error('Informe pelo menos uma forma de pagamento.');
  }

  // 1. Cálculos de conferência
  let totalItemsValue = 0;
  const processedItems = [];

  for (const it of items) {
    const qtd = Math.max(1, parseFloat(it.quantity) || 1);
    const prod = obterProdutoPorCodigo(it.code || it.product_code || it.barcode);
    const precoUnit = Math.max(0, parseFloat(it.unit_price) || (prod ? (prod.promo_price > 0 ? prod.promo_price : prod.sale_price) : 0));
    const custoUnit = Math.max(0, parseFloat(it.unit_cost) || (prod ? prod.cost_price : 0));
    const subtotal = Math.round((qtd * precoUnit) * 100) / 100;
    const totalCusto = Math.round((qtd * custoUnit) * 100) / 100;

    totalItemsValue += subtotal;

    const isUnregistered = it.is_unregistered || (!prod && (String(it.code || it.product_code || '').startsWith('AVULSO') || String(it.barcode || '').startsWith('*'))) ? 1 : 0;
    const prodCode = prod ? prod.code : String(it.code || it.product_code || it.barcode || `ITEM-${Date.now()}`).trim();
    const prodName = prod ? prod.name : String(it.product_name || it.name || 'PRODUTO NÃO IDENTIFICADO').trim();

    processedItems.push({
      product_code: prodCode,
      barcode: prod ? prod.barcode : (it.barcode || ''),
      product_name: prodName,
      quantity: qtd,
      unit_price: precoUnit,
      total_price: subtotal,
      unit_cost: custoUnit,
      total_cost: totalCusto,
      profit: Math.round((subtotal - totalCusto) * 100) / 100,
      is_unregistered: isUnregistered
    });
  }

  totalItemsValue = Math.round(totalItemsValue * 100) / 100;
  const desconto = Math.max(0, parseFloat(discount_value) || 0);
  let totalFinal = Math.max(0, Math.round((totalItemsValue - desconto) * 100) / 100);

  // 2. Conferência de pagamentos
  let totalPago = 0;
  for (const p of payments) {
    totalPago += parseFloat(p.amount) || 0;
  }
  totalPago = Math.round(totalPago * 100) / 100;

  // Tolerância de 5 centavos para arredondamentos flutuantes entre front e back
  if (Math.round((totalFinal - totalPago) * 100) > 5) {
    throw new Error(`Valor pago (R$ ${totalPago.toFixed(2)}) é inferior ao total da venda (R$ ${totalFinal.toFixed(2)}).`);
  }
  if (Math.abs(totalFinal - totalPago) <= 0.05) {
    totalFinal = totalPago;
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];
  const saleId = `VND-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // 3. Execução Transacional Atômica (ACID no SQLite)
  const executeSaleTransaction = db.transaction(() => {
    // A. Garantir existência de cliente válido no banco
    let validCustomerId = customer_id;
    if (validCustomerId) {
      const custExists = db.prepare('SELECT id FROM customers WHERE id = ?').get(validCustomerId);
      if (!custExists) {
        if (customer_name && String(customer_name).trim()) {
          const byName = db.prepare('SELECT id FROM customers WHERE name = ?').get(String(customer_name).trim());
          if (byName) {
            validCustomerId = byName.id;
          } else {
            db.prepare(`
              INSERT INTO customers (id, name, createdAt, updatedAt, source) 
              VALUES (?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), 'PDV_VENDA')
            `).run(validCustomerId, String(customer_name).trim());
          }
        } else {
          validCustomerId = null;
        }
      }
    } else if (customer_name && String(customer_name).trim()) {
      const byName = db.prepare('SELECT id FROM customers WHERE name = ?').get(String(customer_name).trim());
      if (byName) {
        validCustomerId = byName.id;
      }
    }

    // Se for Crediário, o cliente é estritamente obrigatório e deve existir em customers
    const hasCrediario = payments.some(p => String(p.payment_method || '').toUpperCase() === 'CREDIARIO');
    if (hasCrediario && !validCustomerId) {
      const fallbackId = `CUST-${Date.now()}`;
      const fallbackName = customer_name && String(customer_name).trim() ? String(customer_name).trim() : 'Consumidor Crediário Balcão';
      db.prepare(`
        INSERT INTO customers (id, name, createdAt, updatedAt, source)
        VALUES (?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), 'PDV_CREDIARIO')
      `).run(fallbackId, fallbackName);
      validCustomerId = fallbackId;
    }

    // B. Gravar cabeçalho da venda
    const paymentMethodSummary = payments.map(p => p.payment_method).join(', ') || 'DINHEIRO';
    const userIdVal = payload.user_id || user_name || 'caixa';

    db.prepare(`
      INSERT INTO sales (
        id, sale_date, sale_time, total_items_value, discount_value, total_value,
        payment_method, customer_id, customer_name, user_id, user_name,
        seller_id, seller_name, status, notes, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, 'CONCLUIDA', ?, datetime('now', 'localtime')
      )
    `).run(
      saleId,
      dateStr,
      timeStr,
      totalItemsValue,
      desconto,
      totalFinal,
      paymentMethodSummary,
      validCustomerId,
      customer_name || null,
      userIdVal,
      finalSellerName,
      seller_id || userIdVal,
      finalSellerName,
      notes
    );

    // B. Gravar itens da venda e dar baixa no estoque
    const insertItemStmt = db.prepare(`
      INSERT INTO sale_items (
        id, sale_id, product_code, barcode, product_name,
        quantity, unit_price, total_price, unit_cost, total_cost, profit, is_unregistered
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?
      )
    `);

    const updateStockStmt = db.prepare(`
      UPDATE products 
      SET stock_qty = stock_qty - ?,
          updated_at = datetime('now', 'localtime')
      WHERE code = ?
    `);

    for (let i = 0; i < processedItems.length; i++) {
      const it = processedItems[i];
      const itemId = `${saleId}-${i + 1}`;
      insertItemStmt.run(
        itemId,
        saleId,
        it.product_code || `ITEM-${i + 1}`,
        it.barcode || '',
        it.product_name || 'PRODUTO NÃO IDENTIFICADO',
        it.quantity,
        it.unit_price,
        it.total_price,
        it.unit_cost,
        it.total_cost,
        it.profit,
        it.is_unregistered || 0
      );

      // Baixa no estoque físico
      updateStockStmt.run(it.quantity, it.product_code);
    }

    // C. Gravar formas de pagamento
    const insertPaymentStmt = db.prepare(`
      INSERT INTO sale_payments (
        id, sale_id, payment_method, amount, change_amount, card_brand, installments, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime')
      )
    `);

    for (let pIdx = 0; pIdx < payments.length; pIdx++) {
      const p = payments[pIdx];
      const pId = `${saleId}-PAY-${pIdx + 1}`;
      const change = parseFloat(p.change_amount) || 0;
      const methodStr = String(p.payment_method || 'DINHEIRO').toUpperCase();

      insertPaymentStmt.run(
        pId,
        saleId,
        methodStr,
        parseFloat(p.amount) || 0,
        change,
        p.card_brand || null,
        parseInt(p.installments, 10) || 1
      );

      // Se for crediário, gera o débito para cobrança vinculado ao cliente garantido
      if (methodStr === 'CREDIARIO') {
        const debtId = `DEBT-${saleId}`;
        const custId = validCustomerId;
        const dueDate = p.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        db.prepare(`
          INSERT INTO customer_debts (
            id, customerId, purchaseDate, description, totalValue, status, userName, sale_id, due_date, balance
          ) VALUES (
            ?, ?, ?, ?, ?, 'PENDENTE', ?, ?, ?, ?
          )
        `).run(
          debtId,
          custId,
          dateStr,
          `Venda PDV #${saleId}`,
          p.amount,
          finalSellerName,
          saleId,
          dueDate,
          p.amount
        );
      }
    }
  });

  executeSaleTransaction();

  // Grava receitas retidas vinculadas se houver medicamentos controlados
  if (Array.isArray(payload.controlled_recipes) && payload.controlled_recipes.length > 0) {
    try {
      recordSaleRecipes(saleId, payload.controlled_recipes);
    } catch (recipeErr) {
      console.error(`[Belinha PDV] ⚠️ Erro ao registrar receitas controladas da venda #${saleId}:`, recipeErr.message);
    }
  }

  console.log(`[Belinha PDV] ✅ Venda #${saleId} finalizada com sucesso! Total: R$ ${totalFinal.toFixed(2)} (${processedItems.length} itens)`);

  return {
    success: true,
    sale_id: saleId,
    sale_date: dateStr,
    sale_time: timeStr,
    total_items_value: totalItemsValue,
    discount_value: desconto,
    total_value: totalFinal,
    seller_id: finalSellerId,
    seller_name: finalSellerName,
    items: processedItems,
    payments
  };
}

/**
 * Cancela uma venda e estorna o estoque atômico, integrando com cancelamento SEFAZ e Digifarma
 */
async function cancelarVenda(saleId, { user_name = 'Admin', reason = 'Cancelamento no Caixa' } = {}) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  if (!sale) {
    throw new Error('Venda não encontrada.');
  }

  if (sale.status === 'CANCELADA') {
    throw new Error('Esta venda já foi cancelada anteriormente.');
  }

  const cleanReason = String(reason || '').trim();

  // Se a venda possui NFC-e homologada na SEFAZ, aciona o cancelamento fiscal estrito
  if (sale.fiscal_status === 'EMITIDO') {
    const { cancelarCupomFiscal } = require('./erp-fiscal.service');
    return await cancelarCupomFiscal(saleId, cleanReason);
  }

  // Caso seja venda sem emissão fiscal ou em contingência não transmitida
  // Estorno no Digifarma (Firebird) se vinculado
  let digifarmaEstorno = null;
  if (sale.digifarma_venda_id) {
    try {
      const { estornarVendaDigifarma } = require('./erp-digifarma-sales-sync.service');
      digifarmaEstorno = await estornarVendaDigifarma(sale.digifarma_venda_id, cleanReason);
    } catch (dgErr) {
      console.warn(`[Belinha PDV] ⚠️ Falha ao estornar venda ${sale.digifarma_venda_id} no Digifarma:`, dgErr.message);
    }
  }

  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);

  const executeCancelTransaction = db.transaction(() => {
    // 1. Atualiza status da venda
    db.prepare(`
      UPDATE sales 
      SET status = 'CANCELADA',
          fiscal_status = CASE WHEN fiscal_status = 'CONTINGENCIA' THEN 'CANCELADO' ELSE fiscal_status END,
          cancelled_at = datetime('now', 'localtime'),
          cancellation_reason = ?
      WHERE id = ?
    `).run(cleanReason, saleId);

    // 2. Estorna o estoque dos itens
    const restockStmt = db.prepare(`
      UPDATE products 
      SET stock_qty = stock_qty + ?,
          updated_at = datetime('now', 'localtime')
      WHERE code = ?
    `);

    for (const it of items) {
      restockStmt.run(it.quantity, it.product_code);
    }

    // 3. Cancela débito de crediário se houver
    db.prepare(`
      UPDATE customer_debts 
      SET status = 'CANCELADO', balance = 0
      WHERE sale_id = ?
    `).run(saleId);
  });

  executeCancelTransaction();

  console.log(`[Belinha PDV] ↩️ Venda #${saleId} cancelada e estoque estornado! (${items.length} itens)`);

  return {
    success: true,
    sale_id: saleId,
    status: 'CANCELADA',
    restocked_items: items.length,
    digifarma_estorno: digifarmaEstorno
  };
}

/**
 * Exclui/Estorna individualmente um item de uma venda já realizada (Padrão Digifarma)
 * - Marca o item como cancelado em sale_items (is_cancelled = 1)
 * - Estorna o estoque físico do produto no SQLite e no Digifarma
 * - Deduz o valor do item no total da venda e acumula em returned_value
 * - Se todos os itens da venda forem cancelados, atualiza a venda para CANCELADA
 * @param {string} saleId 
 * @param {string} itemId 
 * @param {Object} options { user_name, reason }
 * @returns {Promise<Object>}
 */
async function cancelarItemVenda(saleId, itemId, { user_name = 'Caixa', reason = 'Devolução no Caixa' } = {}) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  if (!sale) {
    throw new Error('Venda não encontrada.');
  }

  if (sale.status === 'CANCELADA') {
    throw new Error('Esta venda já se encontra totalmente cancelada.');
  }

  const it = db.prepare('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?').get(itemId, saleId);
  if (!it) {
    throw new Error('Item não encontrado nesta venda.');
  }

  if (it.is_cancelled === 1) {
    throw new Error('Este item já foi cancelado/devolvido anteriormente.');
  }

  const cleanReason = String(reason || 'Devolução/Exclusão de item no Caixa').trim();
  const valorItem = Number(it.total_price) || 0;
  const qtdItem = Number(it.quantity) || 1;

  // 1. Estorno no Digifarma (Firebird) se vinculado
  let digifarmaResult = null;
  if (sale.digifarma_venda_id) {
    try {
      const { estornarItemVendaDigifarma } = require('./erp-digifarma-sales-sync.service');
      digifarmaResult = await estornarItemVendaDigifarma({
        digifarmaVendaId: sale.digifarma_venda_id,
        produtoId: it.product_code,
        quantidade: qtdItem,
        valorItem: valorItem,
        digifarmaItemId: it.digifarma_item_id
      });
    } catch (dgErr) {
      console.warn(`[Belinha PDV] ⚠️ Falha ao estornar item ${it.product_code} no Digifarma:`, dgErr.message);
      digifarmaResult = { success: false, error: dgErr.message };
    }
  }

  // 2. Transação atômica no SQLite local
  let vendaTodaCancelada = false;
  const tx = db.transaction(() => {
    // A. Marca o item como cancelado
    db.prepare(`
      UPDATE sale_items 
      SET is_cancelled = 1,
          cancelled_at = datetime('now', 'localtime'),
          cancellation_reason = ?
      WHERE id = ?
    `).run(cleanReason, itemId);

    // B. Estorna estoque físico local
    db.prepare(`
      UPDATE products 
      SET stock_qty = stock_qty + ?,
          updated_at = datetime('now', 'localtime')
      WHERE code = ?
    `).run(qtdItem, it.product_code);

    // C. Atualiza valores da venda
    db.prepare(`
      UPDATE sales 
      SET returned_value = COALESCE(returned_value, 0) + ?,
          total_value = MAX(0, total_value - ?),
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(valorItem, valorItem, saleId);

    // D. Verifica se ainda restam itens ativos
    const itensAtivos = db.prepare(`
      SELECT COUNT(*) AS ativos 
      FROM sale_items 
      WHERE sale_id = ? AND (is_cancelled IS NULL OR is_cancelled = 0)
    `).get(saleId);

    if (itensAtivos && itensAtivos.ativos === 0) {
      db.prepare(`
        UPDATE sales 
        SET status = 'CANCELADA',
            cancelled_at = datetime('now', 'localtime'),
            cancellation_reason = ?
        WHERE id = ?
      `).run(`Todos os itens cancelados individualmente. Último motivo: ${cleanReason}`, saleId);
      vendaTodaCancelada = true;
    }
  });

  tx();

  console.log(`[Belinha PDV] ✅ Item #${itemId} (${it.product_name}) da Venda #${saleId} cancelado com sucesso. Devolução: R$ ${valorItem.toFixed(2)}`);

  return {
    success: true,
    sale_id: saleId,
    item_id: itemId,
    product_name: it.product_name,
    quantity: qtdItem,
    valor_estornado: valorItem,
    venda_toda_cancelada: vendaTodaCancelada,
    digifarma: digifarmaResult
  };
}

/**
 * Registra movimentação de caixa (Sangria ou Suprimento) no PDV
 */
function registrarMovimentacaoCaixa({ movement_type, amount, reason = '', user_name = 'Caixa' }) {
  const tipo = String(movement_type || '').toUpperCase().trim();
  const numAmount = Math.round(parseFloat(amount) * 100) / 100;

  if (tipo !== 'SANGRIA' && tipo !== 'SUPRIMENTO') {
    throw new Error('Tipo de movimentação inválido. Utilize SANGRIA ou SUPRIMENTO.');
  }

  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('O valor da movimentação deve ser maior que zero.');
  }

  const id = `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const cleanReason = String(reason || '').trim() || (tipo === 'SANGRIA' ? 'Sangria de Caixa' : 'Suprimento / Reforço de Caixa');

  db.prepare(`
    INSERT INTO cash_movements (id, movement_type, amount, reason, user_name, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
  `).run(id, tipo, numAmount, cleanReason, user_name);

  return {
    success: true,
    id,
    movement_type: tipo,
    amount: numAmount,
    reason: cleanReason,
    user_name,
    created_at: new Date().toISOString()
  };
}

/**
 * Lista as movimentações de caixa do dia
 */
function listarMovimentacoesCaixa(dateRef = null) {
  const dateStr = dateRef || new Date().toISOString().split('T')[0];
  const rows = db.prepare(`
    SELECT * FROM cash_movements 
    WHERE date(created_at) = date(?)
    ORDER BY created_at DESC
  `).all(dateStr);

  const totais = {
    total_sangria: 0,
    total_suprimento: 0,
    quantidade: rows.length
  };

  for (const r of rows) {
    if (r.movement_type === 'SANGRIA') {
      totais.total_sangria += parseFloat(r.amount) || 0;
    } else if (r.movement_type === 'SUPRIMENTO') {
      totais.total_suprimento += parseFloat(r.amount) || 0;
    }
  }

  totais.total_sangria = Math.round(totais.total_sangria * 100) / 100;
  totais.total_suprimento = Math.round(totais.total_suprimento * 100) / 100;

  return {
    date: dateStr,
    totais,
    movements: rows
  };
}

/**
 * Cria ou salva uma Pré-Venda / Orçamento gerado no Balcão ou WhatsApp
 */
function criarPreVenda(payload) {
  const {
    customer_id = null,
    customer_name = null,
    seller_id = null,
    seller_name = null,
    items = [],
    discount_value = 0,
    notes = ''
  } = payload;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('A pré-venda deve conter pelo menos 1 item.');
  }

  const preSaleId = `PRE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  let totalItems = 0;
  const processed = [];

  for (const it of items) {
    const qtd = Math.max(1, parseFloat(it.quantity) || 1);
    const prod = obterProdutoPorCodigo(it.code || it.product_code || it.barcode);
    const preco = Math.max(0, parseFloat(it.unit_price) || (prod ? (prod.promo_price > 0 ? prod.promo_price : prod.sale_price) : 0));
    const custo = Math.max(0, parseFloat(it.unit_cost) || (prod ? prod.cost_price : 0));
    const subtotal = Math.round((qtd * preco) * 100) / 100;

    totalItems += subtotal;
    processed.push({
      product_code: prod ? prod.code : String(it.code || it.product_code || it.barcode).trim(),
      barcode: prod ? prod.barcode : (it.barcode || ''),
      product_name: prod ? prod.name : String(it.product_name || it.name || 'PRODUTO').trim(),
      quantity: qtd,
      unit_price: preco,
      total_price: subtotal,
      unit_cost: custo,
      recipe_type: it.recipe_type || null,
      recipe_label: it.recipe_label || null
    });
  }

  totalItems = Math.round(totalItems * 100) / 100;
  const desc = Math.max(0, parseFloat(discount_value) || 0);
  const total = Math.max(0, Math.round((totalItems - desc) * 100) / 100);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO pre_sales (
        id, customer_id, customer_name, seller_id, seller_name,
        total_items_value, discount_value, total_value, notes, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABERTA', datetime('now', 'localtime'))
    `).run(
      preSaleId,
      customer_id || null,
      customer_name || null,
      seller_id || null,
      seller_name || null,
      totalItems,
      desc,
      total,
      notes || null
    );

    const insertItem = db.prepare(`
      INSERT INTO pre_sale_items (
        id, pre_sale_id, product_code, barcode, product_name,
        quantity, unit_price, total_price, unit_cost, recipe_type, recipe_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < processed.length; i++) {
      const it = processed[i];
      insertItem.run(
        `${preSaleId}-${i + 1}`,
        preSaleId,
        it.product_code,
        it.barcode,
        it.product_name,
        it.quantity,
        it.unit_price,
        it.total_price,
        it.unit_cost,
        it.recipe_type,
        it.recipe_label
      );
    }
  });

  tx();

  return {
    success: true,
    pre_sale_id: preSaleId,
    total_value: total,
    items_count: processed.length
  };
}

/**
 * Lista pré-vendas abertas para puxar no PDV
 */
function listarPreVendas({ status = 'ABERTA', limit = 30 } = {}) {
  const rows = db.prepare(`
    SELECT * FROM pre_sales 
    WHERE status = ?
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(status, limit);

  return rows.map(r => {
    const items = db.prepare('SELECT * FROM pre_sale_items WHERE pre_sale_id = ?').all(r.id);
    return {
      ...r,
      items
    };
  });
}

/**
 * Puxa uma pré-venda específica com seus itens
 */
function obterPreVenda(id) {
  const ps = db.prepare('SELECT * FROM pre_sales WHERE id = ?').get(id);
  if (!ps) return null;

  const items = db.prepare('SELECT * FROM pre_sale_items WHERE pre_sale_id = ?').all(id);
  return {
    ...ps,
    items
  };
}

/**
 * Marca uma pré-venda como consumida/faturada no caixa
 */
function consumirPreVenda(id, saleId) {
  db.prepare(`
    UPDATE pre_sales
    SET status = 'FATURADA',
        consumed_at = datetime('now', 'localtime'),
        sale_id = ?
    WHERE id = ?
  `).run(saleId, id);

  return { success: true };
}

/**
 * Consulta status de crediário, limites e dívidas de um cliente
 */
function consultarStatusCrediarioCliente(term) {
  if (!term) return null;
  const cleanTerm = String(term).trim();
  const cleanDigits = cleanTerm.replace(/\D/g, '');

  let cust = null;
  if (cleanDigits.length >= 11) {
    cust = db.prepare('SELECT * FROM customers WHERE cpf = ? OR id = ?').get(cleanDigits, cleanTerm);
  }
  if (!cust) {
    cust = db.prepare('SELECT * FROM customers WHERE id = ? OR name LIKE ? LIMIT 1').get(cleanTerm, `%${cleanTerm}%`);
  }

  if (!cust) return null;

  const debts = db.prepare(`
    SELECT * FROM customer_debts 
    WHERE customerId = ? AND status != 'PAGO' AND status != 'CANCELADO'
    ORDER BY purchaseDate ASC
  `).all(cust.id);

  let totalAberto = 0;
  for (const d of debts) {
    totalAberto += parseFloat(d.balance !== undefined ? d.balance : d.totalValue) || 0;
  }
  totalAberto = Math.round(totalAberto * 100) / 100;

  const limiteCadastrado = parseFloat(cust.creditLimit) || 300.00; // Padrão de farmácia R$ 300 se não cadastrado
  const limiteDisponivel = Math.max(0, Math.round((limiteCadastrado - totalAberto) * 100) / 100);

  return {
    customer_id: cust.id,
    customer_name: cust.name,
    customer_cpf: cust.cpf,
    phone: cust.phone,
    credit_limit: limiteCadastrado,
    open_debt: totalAberto,
    available_limit: limiteDisponivel,
    can_purchase: limiteDisponivel > 0,
    debts_count: debts.length,
    recent_debts: debts.slice(0, 5)
  };
}

module.exports = {
  registrarVenda,
  cancelarVenda,
  cancelarItemVenda,
  registrarMovimentacaoCaixa,
  listarMovimentacoesCaixa,
  criarPreVenda,
  listarPreVendas,
  obterPreVenda,
  consumirPreVenda,
  consultarStatusCrediarioCliente
};
