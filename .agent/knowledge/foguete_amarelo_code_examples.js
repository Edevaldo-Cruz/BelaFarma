// ============================================================================
// EXEMPLOS DE CÓDIGO PRONTOS PARA USO - Sistema Foguete Amarelo
// ============================================================================
// Este arquivo contém snippets de código que você pode copiar e adaptar
// ============================================================================

// ============================================================================
// 1. BACKEND - Endpoint de Cadastro de Nota Fiscal
// ============================================================================

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
      `log_${Date.now()}`, createdAt, req.user?.name || 'Sistema', userId,
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

// ============================================================================
// 2. BACKEND - Endpoint de Venda com Lógica Foguete Amarelo
// ============================================================================

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
      `log_${Date.now()}`, createdAt, req.user?.name || 'Sistema', userId,
      'Criou', 'Vendas', `Venda ${saleId} - Total: R$ ${totalValue.toFixed(2)}`
    );
  });
  
  try {
    transaction();
    console.log(`[SALE] Venda ${saleId} registrada com sucesso`);
    res.json({ success: true, message: 'Venda registrada com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao processar venda:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 3. BACKEND - Endpoint Dashboard Foguete Amarelo
// ============================================================================

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

// ============================================================================
// 4. FRONTEND - Componente Dashboard (React + TypeScript)
// ============================================================================

/*
import React, { useState, useEffect } from 'react';
import './FogueteAmareloMonitor.css';

interface FogueteAmareloData {
  id: string;
  invoice_number: string;
  supplier_name: string;
  issue_date: string;
  payment_due_date: string;
  original_value: number;
  amortized_value: number;
  remaining_value: number;
  percentual_amortizado: number;
  total_pagamentos: number;
  dias_ate_vencimento: number;
}

export function FogueteAmareloMonitor() {
  const [notas, setNotas] = useState<FogueteAmareloData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/foguete-amarelo/dashboard');
      if (!response.ok) throw new Error('Erro ao buscar dados');
      const data = await response.json();
      setNotas(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR');
  };

  if (loading) return <div className="loading">Carregando...</div>;
  if (error) return <div className="error">Erro: {error}</div>;

  return (
    <div className="foguete-amarelo-dashboard">
      <div className="dashboard-header">
        <h2>🚀 Monitoramento Foguete Amarelo - Cimed</h2>
        <button onClick={fetchDashboard} className="btn-refresh">
          Atualizar
        </button>
      </div>

      {notas.length === 0 ? (
        <div className="empty-state">
          <p>Nenhuma nota Foguete Amarelo ativa no momento.</p>
        </div>
      ) : (
        <div className="notas-grid">
          {notas.map(nota => (
            <div key={nota.id} className="nota-card">
              <div className="nota-header">
                <h3>NF: {nota.invoice_number}</h3>
                <span className="supplier">{nota.supplier_name}</span>
              </div>

              <div className="nota-dates">
                <div className="date-item">
                  <label>Emissão</label>
                  <span>{formatDate(nota.issue_date)}</span>
                </div>
                <div className="date-item">
                  <label>Vencimento</label>
                  <span>{formatDate(nota.payment_due_date)}</span>
                </div>
                <div className="date-item">
                  <label>Dias restantes</label>
                  <span className={nota.dias_ate_vencimento < 30 ? 'urgent' : ''}>
                    {nota.dias_ate_vencimento} dias
                  </span>
                </div>
              </div>

              <div className="nota-values">
                <div className="value-item">
                  <label>Valor Original</label>
                  <span className="value original">
                    {formatCurrency(nota.original_value)}
                  </span>
                </div>

                <div className="value-item">
                  <label>Já Amortizado ({nota.percentual_amortizado.toFixed(1)}%)</label>
                  <span className="value amortized">
                    {formatCurrency(nota.amortized_value)}
                  </span>
                </div>

                <div className="value-item">
                  <label>Saldo Restante</label>
                  <span className="value remaining">
                    {formatCurrency(nota.remaining_value)}
                  </span>
                </div>
              </div>

              <div className="progress-bar-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${nota.percentual_amortizado}%` }}
                  />
                </div>
                <span className="progress-label">
                  {nota.percentual_amortizado.toFixed(1)}% amortizado
                </span>
              </div>

              <div className="nota-footer">
                <span className="payments-count">
                  📦 {nota.total_pagamentos} pagamento{nota.total_pagamentos !== 1 ? 's' : ''} antecipado{nota.total_pagamentos !== 1 ? 's' : ''}
                </span>
                <button 
                  className="btn-details"
                  onClick={() => window.location.href = `/foguete-amarelo/${nota.id}`}
                >
                  Ver Detalhes
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
*/

// ============================================================================
// 5. FRONTEND - CSS para Dashboard
// ============================================================================

/*
.foguete-amarelo-dashboard {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.dashboard-header h2 {
  font-size: 24px;
  color: #333;
  margin: 0;
}

.btn-refresh {
  padding: 10px 20px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
}

.btn-refresh:hover {
  background: #45a049;
}

.notas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 20px;
}

.nota-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.nota-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

.nota-header {
  border-bottom: 2px solid #FFC107;
  padding-bottom: 10px;
  margin-bottom: 15px;
}

.nota-header h3 {
  margin: 0 0 5px 0;
  color: #333;
  font-size: 18px;
}

.nota-header .supplier {
  color: #666;
  font-size: 14px;
}

.nota-dates {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 5px;
}

.date-item {
  display: flex;
  flex-direction: column;
}

.date-item label {
  font-size: 11px;
  color: #666;
  margin-bottom: 3px;
}

.date-item span {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}

.date-item span.urgent {
  color: #f44336;
}

.nota-values {
  margin-bottom: 15px;
}

.value-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.value-item label {
  font-size: 13px;
  color: #666;
}

.value-item .value {
  font-size: 16px;
  font-weight: 700;
}

.value.original {
  color: #2196F3;
}

.value.amortized {
  color: #4CAF50;
}

.value.remaining {
  color: #FF9800;
}

.progress-bar-container {
  margin-bottom: 15px;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 5px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #FFC107 0%, #FF9800 100%);
  transition: width 0.3s ease;
}

.progress-label {
  font-size: 12px;
  color: #666;
}

.nota-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 15px;
  border-top: 1px solid #e0e0e0;
}

.payments-count {
  font-size: 13px;
  color: #666;
}

.btn-details {
  padding: 8px 16px;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
}

.btn-details:hover {
  background: #1976D2;
}

.loading, .error, .empty-state {
  text-align: center;
  padding: 40px;
  color: #666;
}

.error {
  color: #f44336;
}

@media (max-width: 768px) {
  .notas-grid {
    grid-template-columns: 1fr;
  }
  
  .nota-dates {
    flex-direction: column;
    gap: 10px;
  }
}
*/

// ============================================================================
// 6. UTILITÁRIOS - Funções Auxiliares
// ============================================================================

// Calcular data de vencimento (+120 dias)
function calculateDueDate(issueDate, days = 120) {
  const date = new Date(issueDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

// Formatar moeda
function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

// Formatar data
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR');
}

// Calcular dias entre datas
function daysBetween(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000;
  const firstDate = new Date(date1);
  const secondDate = new Date(date2);
  return Math.round(Math.abs((firstDate - secondDate) / oneDay));
}

// ============================================================================
// FIM DOS EXEMPLOS
// ============================================================================
