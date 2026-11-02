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
 * Cancela uma venda e estorna o estoque atômico
 */
function cancelarVenda(saleId, { user_name = 'Admin', reason = 'Cancelamento no Caixa' } = {}) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  if (!sale) {
    throw new Error('Venda não encontrada.');
  }

  if (sale.status === 'CANCELADA') {
    throw new Error('Esta venda já foi cancelada anteriormente.');
  }

  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);

  const executeCancelTransaction = db.transaction(() => {
    // 1. Atualiza status da venda
    db.prepare(`
      UPDATE sales 
      SET status = 'CANCELADA',
          cancelled_at = datetime('now', 'localtime'),
          cancellation_reason = ?
      WHERE id = ?
    `).run(reason, saleId);

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
    restocked_items: items.length
  };
}

module.exports = {
  registrarVenda,
  cancelarVenda
};
