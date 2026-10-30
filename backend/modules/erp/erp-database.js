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
    
    // Colunas fiscais (NFC-e Modelo 65)
    if (!sCols.includes('fiscal_status')) db.prepare(`ALTER TABLE sales ADD COLUMN fiscal_status TEXT DEFAULT 'NAO_EMITIDO'`).run();
    if (!sCols.includes('nfe_number')) db.prepare(`ALTER TABLE sales ADD COLUMN nfe_number INTEGER`).run();
    if (!sCols.includes('nfe_series')) db.prepare(`ALTER TABLE sales ADD COLUMN nfe_series INTEGER DEFAULT 1`).run();
    if (!sCols.includes('access_key')) db.prepare(`ALTER TABLE sales ADD COLUMN access_key TEXT`).run();
    if (!sCols.includes('protocol_number')) db.prepare(`ALTER TABLE sales ADD COLUMN protocol_number TEXT`).run();
    if (!sCols.includes('qr_code_url')) db.prepare(`ALTER TABLE sales ADD COLUMN qr_code_url TEXT`).run();
    if (!sCols.includes('customer_cpf')) db.prepare(`ALTER TABLE sales ADD COLUMN customer_cpf TEXT`).run();
    if (!sCols.includes('issued_at')) db.prepare(`ALTER TABLE sales ADD COLUMN issued_at TEXT`).run();
    if (!sCols.includes('xml_content')) db.prepare(`ALTER TABLE sales ADD COLUMN xml_content TEXT`).run();
    if (!sCols.includes('contingency_reason')) db.prepare(`ALTER TABLE sales ADD COLUMN contingency_reason TEXT`).run();
  } catch (err) {
    console.warn('[Belinha ERP DB] Aviso ao verificar colunas sales:', err.message);
  }

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (sale_date)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_fiscal ON sales (fiscal_status)`).run();
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

  // 7. Tabela de Parâmetros Fiscais (NFC-e & Certificado Digital A1)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS fiscal_settings (
      id TEXT PRIMARY KEY DEFAULT 'primary',
      cnpj TEXT DEFAULT '47378578000140',
      razao_social TEXT DEFAULT 'BELA FARMA SUL LTDA',
      nome_fantasia TEXT DEFAULT 'DROGARIA BELA FARMA',
      inscricao_estadual TEXT DEFAULT '0041234560089',
      logradouro TEXT DEFAULT 'RUA PREVIDENCIARIOS',
      numero TEXT DEFAULT '100',
      bairro TEXT DEFAULT 'PREVIDENCIARIOS',
      municipio TEXT DEFAULT 'JUIZ DE FORA',
      cod_municipio_ibge TEXT DEFAULT '3136702',
      uf TEXT DEFAULT 'MG',
      cep TEXT DEFAULT '36033000',
      regime_tributario INTEGER DEFAULT 1, -- 1=Simples Nacional, 3=Regime Normal
      ambiente TEXT DEFAULT 'homologacao', -- 'homologacao' | 'producao'
      nfe_series INTEGER DEFAULT 1,
      next_nfe_number INTEGER DEFAULT 1,
      csc TEXT DEFAULT '1234567890ABCDEF1234567890ABCDEF',
      id_csc TEXT DEFAULT '000001',
      certificate_pfx_base64 TEXT,
      certificate_password TEXT,
      certificate_expiry TEXT,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();

  // Garante um registro padrão em fiscal_settings se estiver vazia
  const existingFiscal = db.prepare('SELECT id FROM fiscal_settings WHERE id = ?').get('primary');
  if (!existingFiscal) {
    db.prepare(`
      INSERT INTO fiscal_settings (id, cnpj, razao_social, nome_fantasia, uf, cod_municipio_ibge, ambiente, nfe_series, next_nfe_number)
      VALUES ('primary', '47378578000140', 'BELA FARMA SUL LTDA', 'DROGARIA BELA FARMA', 'MG', '3136702', 'homologacao', 1, 1)
    `).run();
  }

  console.log('[Belinha ERP DB] ✅ Schema limpo do ERP verificado e pronto!');
  return true;
}

module.exports = {
  db,
  initErpDatabase
};
