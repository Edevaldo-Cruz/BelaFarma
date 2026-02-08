// ============================================================================
// SISTEMA FOGUETE AMARELO - Endpoints da API
// ============================================================================
// Este arquivo contém todos os endpoints relacionados ao sistema Foguete Amarelo
// Deve ser importado no server.js principal
// ============================================================================

// ============================================================================
// 1. ENDPOINT: Cadastrar Nota Fiscal
// ============================================================================
const createInvoiceEndpoint = (app, db) => {
  app.post('/api/invoices', (req, res) => {
    const { invoiceNumber, supplierName, issueDate, totalValue, isFogueteAmarelo, items, userId } = req.body;
    
    // Validações básicas
    if (!invoiceNumber || !supplierName || !issueDate || !totalValue || !items || items.length === 0) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    
    const transaction = db.transaction(() => {
      const invoiceId = `inv_${Date.now()}`;
      const createdAt = new Date().toISOString();
      
      // Calcular data de vencimento (120 dias se Foguete Amarelo)
      let paymentDueDate = null;
      if (isFogueteAmarelo) {
        const dueDate = new Date(issueDate);
        dueDate.setDate(dueDate.getDate() + 120);
        paymentDueDate = dueDate.toISOString().split('T')[0];
      }
      
      // 1. Inserir nota fiscal
      db.prepare(`
        INSERT INTO invoices (
          id, invoice_number, supplier_name, issue_date, total_value,
          is_foguete_amarelo, payment_due_date, status, created_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        invoiceId, invoiceNumber, supplierName, issueDate, totalValue,
        isFogueteAmarelo ? 1 : 0, paymentDueDate, 'Ativa', createdAt, userId
      );
      
      // 2. Inserir itens da nota
      for (const item of items) {
        const itemId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const totalCost = item.quantity * item.unitCost;
        
        db.prepare(`
          INSERT INTO invoice_items (
            id, invoice_id, product_code, product_name, quantity,
            unit_cost, total_cost, quantity_sold, quantity_remaining
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          itemId, invoiceId, item.productCode, item.productName, item.quantity,
          item.unitCost, totalCost, 0, item.quantity
        );
      }
      
      // 3. Se for Foguete Amarelo, criar título em contas a pagar
      if (isFogueteAmarelo) {
        const accountId = `ap_${Date.now()}`;
        
        db.prepare(`
          INSERT INTO accounts_payable (
            id, type, reference_id, supplier_name, description, due_date,
            original_value, amortized_value, remaining_value, status,
            is_foguete_amarelo, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          accountId, 'Nota Fiscal', invoiceId, supplierName,
          `NF ${invoiceNumber} - Foguete Amarelo`, paymentDueDate,
          totalValue, 0, totalValue, 'Pendente', 1, createdAt
        );
      }
      
      // 4. Registrar log
      db.prepare(`
        INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `log_${Date.now()}`, createdAt, 'Sistema', userId,
        'Criou', 'Compras', `Nota Fiscal ${invoiceNumber} - ${supplierName} - R$ ${totalValue.toFixed(2)}`
      );
    });
    
    try {
      transaction();
      console.log(`[INVOICE] Nota fiscal ${invoiceNumber} cadastrada com sucesso`);
      res.json({ success: true, message: 'Nota fiscal cadastrada com sucesso!' });
    } catch (error) {
      console.error('[ERRO] Falha ao cadastrar nota fiscal:', error);
      res.status(500).json({ error: error.message });
    }
  });
};

// ============================================================================
// 2. ENDPOINT: Listar Notas Fiscais
// ============================================================================
const getInvoicesEndpoint = (app, db) => {
  app.get('/api/invoices', (req, res) => {
    try {
      const invoices = db.prepare(`
        SELECT * FROM invoices 
        ORDER BY issue_date DESC
      `).all();
      
      res.json(invoices.map(inv => ({
        ...inv,
        is_foguete_amarelo: !!inv.is_foguete_amarelo
      })));
    } catch (error) {
      console.error('[ERRO] Falha ao buscar notas fiscais:', error);
      res.status(500).json({ error: error.message });
    }
  });
};

// ============================================================================
// 3. ENDPOINT: Dashboard Foguete Amarelo
// ============================================================================
const getFogueteAmareloDashboardEndpoint = (app, db) => {
  app.get('/api/foguete-amarelo/dashboard', (req, res) => {
    try {
      const notas = db.prepare(`
        SELECT 
          i.id,
          i.invoice_number,
          i.supplier_name,
          i.issue_date,
          i.payment_due_date,
          ap.original_value,
          ap.amortized_value,
          ap.remaining_value,
          ROUND((ap.amortized_value * 100.0 / ap.original_value), 2) as percentual_amortizado,
          COUNT(DISTINCT fap.id) as total_pagamentos,
          COALESCE(SUM(fap.value), 0) as total_pago_antecipado,
          CAST(julianday(i.payment_due_date) - julianday('now') AS INTEGER) as dias_ate_vencimento
        FROM invoices i
        JOIN accounts_payable ap ON ap.reference_id = i.id AND ap.type = 'Nota Fiscal'
        LEFT JOIN foguete_amarelo_payments fap ON fap.invoice_id = i.id
        WHERE i.is_foguete_amarelo = 1 
          AND i.status = 'Ativa'
        GROUP BY i.id
        ORDER BY i.payment_due_date ASC
      `).all();
      
      res.json(notas);
    } catch (error) {
      console.error('[ERRO] Falha ao buscar dashboard Foguete Amarelo:', error);
      res.status(500).json({ error: error.message });
    }
  });
};

// ============================================================================
// 4. ENDPOINT: Registrar Venda (PDV) com Lógica Foguete Amarelo
// ============================================================================
const createSaleEndpoint = (app, db) => {
  app.post('/api/sales', (req, res) => {
    const { items, paymentMethod, customerId, userId } = req.body;
    
    if (!items || items.length === 0 || !paymentMethod || !userId) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    
    const transaction = db.transaction(() => {
      const saleId = `sale_${Date.now()}`;
      const saleDate = new Date().toISOString().split('T')[0];
      const saleTime = new Date().toISOString().split('T')[1].split('.')[0];
      const createdAt = new Date().toISOString();
      const totalValue = items.reduce((sum, item) => sum + item.totalPrice, 0);
      
      // 1. Criar registro de venda
      db.prepare(`
        INSERT INTO sales (
          id, sale_date, sale_time, total_value, payment_method,
          customer_id, user_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleId, saleDate, saleTime, totalValue, paymentMethod,
        customerId || null, userId, 'Finalizada', createdAt
      );
      
      // 2. Processar cada item da venda
      for (const item of items) {
        // 2.1. Buscar lote (FIFO) - Nota mais antiga com estoque
        const invoiceItem = db.prepare(`
          SELECT 
            ii.*,
            i.is_foguete_amarelo,
            i.id as invoice_id,
            i.invoice_number
          FROM invoice_items ii
          JOIN invoices i ON ii.invoice_id = i.id
          WHERE ii.product_code = ?
            AND ii.quantity_remaining >= ?
            AND i.status = 'Ativa'
          ORDER BY i.issue_date ASC
          LIMIT 1
        `).get(item.productCode, item.quantity);
        
        if (!invoiceItem) {
          throw new Error(`Produto ${item.productCode} sem estoque suficiente`);
        }
        
        // 2.2. Registrar item da venda
        const saleItemId = `sitem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const totalCost = item.quantity * invoiceItem.unit_cost;
        const profit = item.totalPrice - totalCost;
        
        db.prepare(`
          INSERT INTO sale_items (
            id, sale_id, product_code, product_name, quantity,
            unit_price, total_price, unit_cost, total_cost, profit,
            invoice_item_id, is_foguete_amarelo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          saleItemId, saleId, item.productCode, item.productName, item.quantity,
          item.unitPrice, item.totalPrice, invoiceItem.unit_cost, totalCost, profit,
          invoiceItem.id, invoiceItem.is_foguete_amarelo
        );
        
        // 2.3. Atualizar quantidade do lote
        db.prepare(`
          UPDATE invoice_items
          SET quantity_sold = quantity_sold + ?,
              quantity_remaining = quantity_remaining - ?
          WHERE id = ?
        `).run(item.quantity, item.quantity, invoiceItem.id);
        
        // 2.4. SE for Foguete Amarelo, processar pagamento antecipado
        if (invoiceItem.is_foguete_amarelo === 1) {
          const custoVenda = totalCost;
          const paymentDate = new Date();
          paymentDate.setDate(paymentDate.getDate() + 1); // D+1
          const paymentDateStr = paymentDate.toISOString().split('T')[0];
          
          // 2.4.1. Criar pagamento antecipado
          const paymentId = `fap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          db.prepare(`
            INSERT INTO foguete_amarelo_payments (
              id, invoice_id, invoice_number, sale_id, payment_date,
              value, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            paymentId, invoiceItem.invoice_id, invoiceItem.invoice_number,
            saleId, paymentDateStr, custoVenda, 'Pendente', createdAt
          );
          
          // 2.4.2. Atualizar título principal (accounts_payable)
          db.prepare(`
            UPDATE accounts_payable
            SET amortized_value = amortized_value + ?,
                remaining_value = original_value - (amortized_value + ?)
            WHERE reference_id = ? AND type = 'Nota Fiscal'
          `).run(custoVenda, custoVenda, invoiceItem.invoice_id);
          
          console.log(`[FOGUETE AMARELO] Pagamento antecipado criado: R$ ${custoVenda.toFixed(2)} para NF ${invoiceItem.invoice_number}`);
        }
      }
      
      // 3. Registrar log
      db.prepare(`
        INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `log_${Date.now()}`, createdAt, 'Sistema', userId,
        'Criou', 'Vendas', `Venda ${saleId} - Total: R$ ${totalValue.toFixed(2)}`
      );
    });
    
    try {
      transaction();
      console.log(`[SALE] Venda registrada com sucesso`);
      res.json({ success: true, message: 'Venda registrada com sucesso!' });
    } catch (error) {
      console.error('[ERRO] Falha ao processar venda:', error);
      res.status(500).json({ error: error.message });
    }
  });
};

// ============================================================================
// 5. ENDPOINT: Criar Nota Fiscal Automaticamente ao Entregar Pedido
// ============================================================================
const createInvoiceFromOrderEndpoint = (app, db) => {
  app.post('/api/orders/create-invoice', (req, res) => {
    const { order, userId } = req.body;
    
    // Validações
    if (!order || !order.invoiceNumber || !order.distributor || !order.totalValue) {
      return res.status(400).json({ error: 'Dados do pedido incompletos' });
    }
    
    // Verificar se já existe nota fiscal para este pedido
    const existingInvoice = db.prepare(`
      SELECT id FROM invoices WHERE invoice_number = ?
    `).get(order.invoiceNumber);
    
    if (existingInvoice) {
      console.log(`[INFO] Nota fiscal ${order.invoiceNumber} já existe. Pulando criação.`);
      return res.json({ success: true, message: 'Nota fiscal já existe', invoiceId: existingInvoice.id });
    }
    
    const transaction = db.transaction(() => {
      const invoiceId = `inv_${Date.now()}`;
      const createdAt = new Date().toISOString();
      const isFogueteAmarelo = order.isFogueteAmarelo || false;
      
      // Data de emissão = data de recebimento do pedido (ou hoje)
      const issueDate = order.receiptDate || new Date().toISOString().split('T')[0];
      
      // Calcular data de vencimento
      let paymentDueDate = null;
      if (isFogueteAmarelo) {
        const dueDate = new Date(issueDate);
        dueDate.setDate(dueDate.getDate() + 120); // 120 dias
        paymentDueDate = dueDate.toISOString().split('T')[0];
      } else {
        // Para notas normais, usar o paymentMonth do pedido
        // Vencimento no último dia do mês de pagamento
        const paymentMonth = order.paymentMonth || 'Janeiro';
        const monthMap = {
          'Janeiro': 0, 'Fevereiro': 1, 'Março': 2, 'Abril': 3,
          'Maio': 4, 'Junho': 5, 'Julho': 6, 'Agosto': 7,
          'Setembro': 8, 'Outubro': 9, 'Novembro': 10, 'Dezembro': 11
        };
        const month = monthMap[paymentMonth] || 0;
        const year = new Date().getFullYear();
        const lastDay = new Date(year, month + 1, 0);
        paymentDueDate = lastDay.toISOString().split('T')[0];
      }
      
      // 1. Inserir nota fiscal
      db.prepare(`
        INSERT INTO invoices (
          id, invoice_number, supplier_name, issue_date, total_value,
          is_foguete_amarelo, payment_due_date, status, created_at, created_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        invoiceId, 
        order.invoiceNumber, 
        order.distributor, 
        issueDate, 
        order.totalValue,
        isFogueteAmarelo ? 1 : 0, 
        paymentDueDate, 
        'Ativa', 
        createdAt, 
        userId,
        `Gerada automaticamente do pedido. Vendedor: ${order.seller || 'N/A'}`
      );
      
      // 2. Criar item genérico da nota (já que não temos detalhes dos produtos)
      const itemId = `item_${Date.now()}`;
      db.prepare(`
        INSERT INTO invoice_items (
          id, invoice_id, product_code, product_name, quantity,
          unit_cost, total_cost, quantity_sold, quantity_remaining
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        itemId, 
        invoiceId, 
        'PEDIDO', 
        `Produtos do Pedido ${order.distributor}`, 
        1,
        order.totalValue, 
        order.totalValue, 
        0, 
        1
      );
      
      // 3. Se for Foguete Amarelo, criar título em contas a pagar
      if (isFogueteAmarelo) {
        const accountId = `ap_${Date.now()}`;
        
        db.prepare(`
          INSERT INTO accounts_payable (
            id, type, reference_id, supplier_name, description, due_date,
            original_value, amortized_value, remaining_value, status,
            is_foguete_amarelo, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          accountId, 
          'Nota Fiscal', 
          invoiceId, 
          order.distributor,
          `NF ${order.invoiceNumber} - Foguete Amarelo`, 
          paymentDueDate,
          order.totalValue, 
          0, 
          order.totalValue, 
          'Pendente', 
          1, 
          createdAt
        );
        
        console.log(`[FOGUETE AMARELO] Título criado em contas a pagar: R$ ${order.totalValue.toFixed(2)}`);
      }
      
      // 4. Registrar log
      db.prepare(`
        INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `log_${Date.now()}`, 
        createdAt, 
        'Sistema', 
        userId,
        'Criou', 
        'Compras', 
        `Nota Fiscal ${order.invoiceNumber} - ${order.distributor} - R$ ${order.totalValue.toFixed(2)}${isFogueteAmarelo ? ' (Foguete Amarelo)' : ''}`
      );
      
      return invoiceId;
    });
    
    try {
      const invoiceId = transaction();
      console.log(`[INVOICE] Nota fiscal ${order.invoiceNumber} criada automaticamente do pedido`);
      res.json({ 
        success: true, 
        message: 'Nota fiscal criada com sucesso!', 
        invoiceId,
        isFogueteAmarelo: order.isFogueteAmarelo || false
      });
    } catch (error) {
      console.error('[ERRO] Falha ao criar nota fiscal do pedido:', error);
      res.status(500).json({ error: error.message });
    }
  });
};

// ============================================================================
// Endpoint: Lançar Pagamento Manual
// ============================================================================
const lancarPagamentoEndpoint = (app, db) => {
  app.post('/api/foguete-amarelo/lancar-pagamento', (req, res) => {
    const { invoiceId, invoiceNumber, value, paymentDate, observations, userId } = req.body;
    
    // Validações
    if (!invoiceId || !value || !paymentDate) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    
    if (value <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero' });
    }
    
    const transaction = db.transaction(() => {
      const paymentId = `fap_${Date.now()}`;
      const createdAt = new Date().toISOString();
      
      // 1. Inserir lançamento na tabela foguete_amarelo_payments
      db.prepare(`
        INSERT INTO foguete_amarelo_payments (
          id, invoice_id, invoice_number, value, payment_date, observations, 
          status, created_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        paymentId,
        invoiceId,
        invoiceNumber,
        value,
        paymentDate,
        observations || null,
        'Confirmado',
        createdAt,
        userId
      );
      
      // 2. Atualizar valor amortizado em accounts_payable
      db.prepare(`
        UPDATE accounts_payable
        SET amortized_value = amortized_value + ?,
            remaining_value = remaining_value - ?
        WHERE reference_id = ? AND type = 'Nota Fiscal'
      `).run(value, value, invoiceId);
      
      // 3. Verificar se foi quitado completamente
      const account = db.prepare(`
        SELECT remaining_value FROM accounts_payable
        WHERE reference_id = ? AND type = 'Nota Fiscal'
      `).get(invoiceId);
      
      if (account && account.remaining_value <= 0.01) {
        // Marcar como quitado
        db.prepare(`
          UPDATE accounts_payable
          SET status = 'Quitado', paid_at = ?
          WHERE reference_id = ? AND type = 'Nota Fiscal'
        `).run(createdAt, invoiceId);
        
        db.prepare(`
          UPDATE invoices
          SET status = 'Quitada'
          WHERE id = ?
        `).run(invoiceId);
      }
      
      // 4. Registrar log
      db.prepare(`
        INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `log_${Date.now()}`,
        createdAt,
        'Sistema',
        userId,
        'Lançou',
        'Foguete Amarelo',
        `Pagamento de ${value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para NF ${invoiceNumber}`
      );
      
      console.log(`[FOGUETE AMARELO] Lançamento registrado: R$ ${value.toFixed(2)} - NF ${invoiceNumber}`);
    });
    
    try {
      transaction();
      res.json({ 
        success: true, 
        message: 'Lançamento registrado com sucesso!' 
      });
    } catch (error) {
      console.error('Erro ao lançar pagamento:', error);
      res.status(500).json({ error: error.message });
    }
  });
};

// ============================================================================
// Endpoint: Buscar Histórico de Lançamentos
// ============================================================================
const getHistoricoLancamentosEndpoint = (app, db) => {
  app.get('/api/foguete-amarelo/lancamentos/:invoiceId', (req, res) => {
    const { invoiceId } = req.params;
    
    try {
      const lancamentos = db.prepare(`
        SELECT 
          id,
          value,
          payment_date,
          observations,
          status,
          created_at,
          created_by
        FROM foguete_amarelo_payments
        WHERE invoice_id = ?
        ORDER BY payment_date DESC, created_at DESC
      `).all(invoiceId);
      
      res.json(lancamentos);
    } catch (error) {
      console.error('Erro ao buscar histórico de lançamentos:', error);
      res.status(500).json({ error: error.message });
    }
  });
};

// ============================================================================
// Exportar função de inicialização
// ============================================================================
const initializeFogueteAmareloEndpoints = (app, db) => {
  console.log('🚀 Inicializando endpoints do Sistema Foguete Amarelo...');
  
  createInvoiceEndpoint(app, db);
  getInvoicesEndpoint(app, db);
  getFogueteAmareloDashboardEndpoint(app, db);
  createSaleEndpoint(app, db);
  createInvoiceFromOrderEndpoint(app, db);
  lancarPagamentoEndpoint(app, db); // NOVO!
  getHistoricoLancamentosEndpoint(app, db); // NOVO!
  
  console.log('✅ Endpoints do Sistema Foguete Amarelo inicializados!');
};

module.exports = { initializeFogueteAmareloEndpoints };
