/**
 * Belinha ERP - Clean Database Schema & Tables Initialization
 * Gerencia o schema independente e de alta velocidade para substituição do Digifarma.
 */

const db = require('../../database');

function initErpDatabase() {
  console.log('[Belinha ERP DB] 🚀 Inicializando tabelas do ERP nativo...');

  // 1. Tabela Mestre de Produtos (Independente do Digifarma)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      code TEXT PRIMARY KEY,
      barcode TEXT,
      name TEXT NOT NULL,
      presentation TEXT,
      category_id INTEGER,
      sale_price REAL NOT NULL DEFAULT 0,
      promo_price REAL DEFAULT 0,
      cost_price REAL DEFAULT 0,
      stock_qty REAL NOT NULL DEFAULT 0,
      curve TEXT DEFAULT 'C',
      tributacao_monofasica TEXT,
      cst_pis TEXT,
      cst_cofins TEXT,
      aliquota_st REAL,
      imposto_aliq REAL,
      ncm TEXT,
      cest TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();

  // Índices para buscas em milissegundos
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_name ON products (name)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_active ON products (is_active)`).run();

  // 2. Vendas do PDV (Cabeçalho)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      sale_date TEXT NOT NULL,
      sale_time TEXT NOT NULL,
      total_items_value REAL NOT NULL DEFAULT 0,
      discount_value REAL NOT NULL DEFAULT 0,
      total_value REAL NOT NULL DEFAULT 0,
      customer_id TEXT,
      customer_name TEXT,
      user_name TEXT NOT NULL DEFAULT 'Caixa',
      status TEXT NOT NULL DEFAULT 'CONCLUIDA',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      cancelled_at TEXT,
      cancellation_reason TEXT
    )
  `).run();

  // Migra colunas para a tabela sales caso já existisse
  try {
    const sCols = db.pragma('table_info(sales)').map(c => c.name);
    if (!sCols.includes('total_items_value')) db.prepare(`ALTER TABLE sales ADD COLUMN total_items_value REAL DEFAULT 0`).run();
    if (!sCols.includes('discount_value')) db.prepare(`ALTER TABLE sales ADD COLUMN discount_value REAL DEFAULT 0`).run();
    if (!sCols.includes('customer_name')) db.prepare(`ALTER TABLE sales ADD COLUMN customer_name TEXT`).run();
    if (!sCols.includes('user_name')) db.prepare(`ALTER TABLE sales ADD COLUMN user_name TEXT DEFAULT 'Caixa'`).run();
    if (!sCols.includes('notes')) db.prepare(`ALTER TABLE sales ADD COLUMN notes TEXT`).run();
    if (!sCols.includes('created_at')) db.prepare(`ALTER TABLE sales ADD COLUMN created_at TEXT`).run();
    if (!sCols.includes('cancelled_at')) db.prepare(`ALTER TABLE sales ADD COLUMN cancelled_at TEXT`).run();
    if (!sCols.includes('cancellation_reason')) db.prepare(`ALTER TABLE sales ADD COLUMN cancellation_reason TEXT`).run();
  } catch (err) {
    console.warn('[Belinha ERP DB] Aviso ao verificar colunas sales:', err.message);
  }

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (sale_date)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales (customer_id)`).run();

  // 3. Itens da Venda
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_code TEXT NOT NULL,
      barcode TEXT,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      unit_cost REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      profit REAL DEFAULT 0,
      FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE
    )
  `).run();

  // Migra colunas para a tabela sale_items caso já existisse
  try {
    const siCols = db.pragma('table_info(sale_items)').map(c => c.name);
    if (!siCols.includes('barcode')) db.prepare(`ALTER TABLE sale_items ADD COLUMN barcode TEXT`).run();
    if (!siCols.includes('unit_cost')) db.prepare(`ALTER TABLE sale_items ADD COLUMN unit_cost REAL DEFAULT 0`).run();
    if (!siCols.includes('total_cost')) db.prepare(`ALTER TABLE sale_items ADD COLUMN total_cost REAL DEFAULT 0`).run();
    if (!siCols.includes('profit')) db.prepare(`ALTER TABLE sale_items ADD COLUMN profit REAL DEFAULT 0`).run();
  } catch (err) {
    console.warn('[Belinha ERP DB] Aviso ao verificar colunas sale_items:', err.message);
  }

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items (sale_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sale_items_prod_code ON sale_items (product_code)`).run();

  // 4. Formas de Pagamento da Venda
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sale_payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL,
      change_amount REAL DEFAULT 0,
      card_brand TEXT,
      installments INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON sale_payments (sale_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sale_payments_method ON sale_payments (payment_method)`).run();

  // 5. Garantir colunas essenciais na tabela customer_debts (Crediário)
  try {
    const debtCols = db.pragma('table_info(customer_debts)').map(c => c.name);
    if (!debtCols.includes('sale_id')) {
      db.prepare(`ALTER TABLE customer_debts ADD COLUMN sale_id TEXT`).run();
    }
    if (!debtCols.includes('due_date')) {
      db.prepare(`ALTER TABLE customer_debts ADD COLUMN due_date TEXT`).run();
    }
    if (!debtCols.includes('balance')) {
      db.prepare(`ALTER TABLE customer_debts ADD COLUMN balance REAL`).run();
    }
  } catch (err) {
    console.warn('[Belinha ERP DB] Aviso ao verificar colunas customer_debts:', err.message);
  }

  // 6. Tabela de Metadados de Migração e Auditoria
  db.prepare(`
    CREATE TABLE IF NOT EXISTS erp_migration_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migrated_at TEXT DEFAULT (datetime('now', 'localtime')),
      source_type TEXT NOT NULL, -- 'FIREBIRD_DIRECT' | 'DIGIFARMA_CACHE'
      products_count INTEGER NOT NULL DEFAULT 0,
      customers_count INTEGER NOT NULL DEFAULT 0,
      debts_count INTEGER NOT NULL DEFAULT 0,
      total_debt_value REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      summary TEXT
    )
  `).run();

  console.log('[Belinha ERP DB] ✅ Schema limpo do ERP verificado e pronto!');
  return true;
}

module.exports = {
  db,
  initErpDatabase
};
