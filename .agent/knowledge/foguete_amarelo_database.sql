-- ============================================================================
-- SCRIPT SQL: Criação de Tabelas para Sistema Foguete Amarelo
-- ============================================================================
-- Este script cria todas as tabelas necessárias para implementar o sistema
-- de gestão de notas fiscais com amortização automática (Foguete Amarelo)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABELA: invoices (Notas Fiscais de Entrada)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  supplier_name TEXT NOT NULL,
  issue_date TEXT NOT NULL,           -- Formato: YYYY-MM-DD
  total_value REAL NOT NULL,
  is_foguete_amarelo INTEGER DEFAULT 0, -- 0 = Não, 1 = Sim
  payment_due_date TEXT,              -- Data de vencimento (120 dias se FA)
  status TEXT DEFAULT 'Ativa',        -- 'Ativa', 'Quitada', 'Cancelada'
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,           -- ID do usuário
  notes TEXT
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_name);
CREATE INDEX IF NOT EXISTS idx_invoices_foguete ON invoices(is_foguete_amarelo, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(payment_due_date);

-- ----------------------------------------------------------------------------
-- 2. TABELA: invoice_items (Itens da Nota Fiscal)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  product_code TEXT NOT NULL,         -- Código/EAN do produto
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,             -- Quantidade comprada
  unit_cost REAL NOT NULL,            -- Custo unitário
  total_cost REAL NOT NULL,           -- quantity * unit_cost
  quantity_sold REAL DEFAULT 0,       -- Quantidade já vendida
  quantity_remaining REAL NOT NULL,   -- Quantidade em estoque
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_code);
CREATE INDEX IF NOT EXISTS idx_invoice_items_remaining ON invoice_items(quantity_remaining);

-- ----------------------------------------------------------------------------
-- 3. TABELA: foguete_amarelo_payments (Pagamentos Antecipados)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS foguete_amarelo_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  sale_id TEXT,                       -- ID da venda que gerou o pagamento
  payment_date TEXT NOT NULL,         -- Data do pagamento (D+1)
  value REAL NOT NULL,                -- Valor do pagamento antecipado
  status TEXT DEFAULT 'Pendente',     -- 'Pendente', 'Pago', 'Cancelado'
  created_at TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fap_invoice ON foguete_amarelo_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_fap_payment_date ON foguete_amarelo_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_fap_status ON foguete_amarelo_payments(status);

-- ----------------------------------------------------------------------------
-- 4. TABELA: sales (Vendas - PDV)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  sale_date TEXT NOT NULL,            -- Formato: YYYY-MM-DD
  sale_time TEXT NOT NULL,            -- Formato: HH:MM:SS
  total_value REAL NOT NULL,
  payment_method TEXT NOT NULL,       -- 'Dinheiro', 'Cartão', 'Pix', etc.
  customer_id TEXT,                   -- Opcional: ID do cliente
  user_id TEXT NOT NULL,              -- ID do operador
  status TEXT DEFAULT 'Finalizada',   -- 'Finalizada', 'Cancelada'
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

-- ----------------------------------------------------------------------------
-- 5. TABELA: sale_items (Itens da Venda)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,           -- Preço de venda unitário
  total_price REAL NOT NULL,          -- quantity * unit_price
  unit_cost REAL NOT NULL,            -- Custo unitário (para margem)
  total_cost REAL NOT NULL,           -- quantity * unit_cost
  profit REAL NOT NULL,               -- total_price - total_cost
  invoice_item_id TEXT,               -- Referência ao lote
  is_foguete_amarelo INTEGER DEFAULT 0, -- Flag se veio de nota FA
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_code);
CREATE INDEX IF NOT EXISTS idx_sale_items_foguete ON sale_items(is_foguete_amarelo);

-- ----------------------------------------------------------------------------
-- 6. TABELA: accounts_payable (Contas a Pagar)
-- ----------------------------------------------------------------------------
-- Opção 1: Adicionar campos à tabela boletos existente
-- ALTER TABLE boletos ADD COLUMN invoice_id TEXT;
-- ALTER TABLE boletos ADD COLUMN is_foguete_amarelo INTEGER DEFAULT 0;
-- ALTER TABLE boletos ADD COLUMN original_value REAL;
-- ALTER TABLE boletos ADD COLUMN amortized_value REAL DEFAULT 0;
-- ALTER TABLE boletos ADD COLUMN remaining_value REAL;

-- Opção 2: Criar nova tabela unificada (RECOMENDADO)
CREATE TABLE IF NOT EXISTS accounts_payable (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                 -- 'Nota Fiscal', 'Boleto', 'Conta Fixa'
  reference_id TEXT,                  -- ID da nota, boleto, etc.
  supplier_name TEXT NOT NULL,
  description TEXT,
  due_date TEXT NOT NULL,
  original_value REAL NOT NULL,
  amortized_value REAL DEFAULT 0,     -- Valor já amortizado (só para FA)
  remaining_value REAL NOT NULL,      -- Saldo a pagar
  status TEXT DEFAULT 'Pendente',     -- 'Pendente', 'Pago', 'Vencido'
  is_foguete_amarelo INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  payment_method TEXT,
  notes TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ap_type ON accounts_payable(type);
CREATE INDEX IF NOT EXISTS idx_ap_due_date ON accounts_payable(due_date);
CREATE INDEX IF NOT EXISTS idx_ap_status ON accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_ap_foguete ON accounts_payable(is_foguete_amarelo);

-- ============================================================================
-- DADOS DE EXEMPLO PARA TESTE
-- ============================================================================

-- Exemplo 1: Nota Fiscal Foguete Amarelo
INSERT INTO invoices (
  id, invoice_number, supplier_name, issue_date, total_value, 
  is_foguete_amarelo, payment_due_date, status, created_at, created_by
) VALUES (
  'inv_001',
  'NF-12345',
  'Cimed - Foguete Amarelo',
  '2026-02-01',
  10000.00,
  1,
  '2026-06-01', -- 120 dias depois
  'Ativa',
  '2026-02-01T10:30:00',
  'user_admin'
);

-- Itens da nota
INSERT INTO invoice_items (
  id, invoice_id, product_code, product_name, quantity, 
  unit_cost, total_cost, quantity_sold, quantity_remaining
) VALUES 
  ('item_001', 'inv_001', 'DIPIRONA500', 'Dipirona 500mg', 100, 8.00, 800.00, 0, 100),
  ('item_002', 'inv_001', 'PARACETAMOL750', 'Paracetamol 750mg', 50, 12.00, 600.00, 0, 50),
  ('item_003', 'inv_001', 'IBUPROFENO600', 'Ibuprofeno 600mg', 80, 15.00, 1200.00, 0, 80);

-- Título principal em contas a pagar
INSERT INTO accounts_payable (
  id, type, reference_id, supplier_name, description, due_date,
  original_value, amortized_value, remaining_value, status, 
  is_foguete_amarelo, created_at
) VALUES (
  'ap_001',
  'Nota Fiscal',
  'inv_001',
  'Cimed - Foguete Amarelo',
  'NF-12345 - Compra de medicamentos',
  '2026-06-01',
  10000.00,
  0.00,
  10000.00,
  'Pendente',
  1,
  '2026-02-01T10:30:00'
);

-- Exemplo 2: Venda que gera pagamento antecipado
INSERT INTO sales (
  id, sale_date, sale_time, total_value, payment_method, 
  user_id, status, created_at
) VALUES (
  'sale_001',
  '2026-02-08',
  '14:30:00',
  75.00,
  'Dinheiro',
  'user_operador',
  'Finalizada',
  '2026-02-08T14:30:00'
);

-- Item da venda (5 caixas de Dipirona)
INSERT INTO sale_items (
  id, sale_id, product_code, product_name, quantity,
  unit_price, total_price, unit_cost, total_cost, profit,
  invoice_item_id, is_foguete_amarelo
) VALUES (
  'sitem_001',
  'sale_001',
  'DIPIRONA500',
  'Dipirona 500mg',
  5,
  15.00,
  75.00,
  8.00,
  40.00,
  35.00,
  'item_001',
  1
);

-- Pagamento antecipado gerado
INSERT INTO foguete_amarelo_payments (
  id, invoice_id, invoice_number, sale_id, payment_date,
  value, status, created_at
) VALUES (
  'fap_001',
  'inv_001',
  'NF-12345',
  'sale_001',
  '2026-02-09', -- D+1
  40.00,
  'Pendente',
  '2026-02-08T14:30:00'
);

-- Atualizar invoice_items (quantidade vendida)
UPDATE invoice_items 
SET quantity_sold = 5, quantity_remaining = 95
WHERE id = 'item_001';

-- Atualizar accounts_payable (amortização)
UPDATE accounts_payable
SET amortized_value = 40.00, remaining_value = 9960.00
WHERE id = 'ap_001';

-- ============================================================================
-- QUERIES ÚTEIS PARA CONSULTA
-- ============================================================================

-- Query 1: Dashboard Foguete Amarelo
-- Lista todas as notas FA ativas com resumo financeiro
/*
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
  julianday(i.payment_due_date) - julianday('now') as dias_ate_vencimento
FROM invoices i
JOIN accounts_payable ap ON ap.reference_id = i.id AND ap.type = 'Nota Fiscal'
LEFT JOIN foguete_amarelo_payments fap ON fap.invoice_id = i.id
WHERE i.is_foguete_amarelo = 1 
  AND i.status = 'Ativa'
GROUP BY i.id
ORDER BY i.payment_due_date ASC;
*/

-- Query 2: Produtos em estoque de notas Foguete Amarelo
/*
SELECT 
  ii.product_code,
  ii.product_name,
  ii.quantity_remaining,
  ii.unit_cost,
  i.invoice_number,
  i.issue_date,
  i.supplier_name
FROM invoice_items ii
JOIN invoices i ON ii.invoice_id = i.id
WHERE i.is_foguete_amarelo = 1
  AND ii.quantity_remaining > 0
  AND i.status = 'Ativa'
ORDER BY i.issue_date ASC, ii.product_name;
*/

-- Query 3: Histórico de vendas que geraram pagamentos antecipados
/*
SELECT 
  s.sale_date,
  s.sale_time,
  s.id as sale_id,
  si.product_name,
  si.quantity,
  si.unit_cost,
  si.total_cost,
  fap.payment_date,
  fap.value as valor_pagamento,
  fap.status,
  i.invoice_number
FROM sales s
JOIN sale_items si ON si.sale_id = s.id
JOIN foguete_amarelo_payments fap ON fap.sale_id = s.id
JOIN invoices i ON fap.invoice_id = i.id
WHERE si.is_foguete_amarelo = 1
ORDER BY s.sale_date DESC, s.sale_time DESC;
*/

-- Query 4: Pagamentos antecipados pendentes por data
/*
SELECT 
  fap.payment_date,
  COUNT(*) as qtd_pagamentos,
  SUM(fap.value) as total_a_pagar,
  GROUP_CONCAT(i.invoice_number, ', ') as notas_fiscais
FROM foguete_amarelo_payments fap
JOIN invoices i ON fap.invoice_id = i.id
WHERE fap.status = 'Pendente'
  AND fap.payment_date >= date('now')
GROUP BY fap.payment_date
ORDER BY fap.payment_date ASC;
*/

-- Query 5: Detalhes de uma nota específica
/*
SELECT 
  i.*,
  ap.amortized_value,
  ap.remaining_value,
  COUNT(DISTINCT fap.id) as total_pagamentos,
  COUNT(DISTINCT ii.id) as total_produtos,
  SUM(ii.quantity) as quantidade_total_comprada,
  SUM(ii.quantity_sold) as quantidade_total_vendida,
  SUM(ii.quantity_remaining) as quantidade_total_estoque
FROM invoices i
JOIN accounts_payable ap ON ap.reference_id = i.id
LEFT JOIN foguete_amarelo_payments fap ON fap.invoice_id = i.id
LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
WHERE i.id = 'inv_001'
GROUP BY i.id;
*/

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
