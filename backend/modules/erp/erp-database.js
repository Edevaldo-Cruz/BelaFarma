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
      vendas_30d REAL DEFAULT 0,
      vendas_10m REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();

  try {
    const pCols = db.pragma('table_info(products)').map(c => c.name);
    if (!pCols.includes('vendas_30d')) db.prepare(`ALTER TABLE products ADD COLUMN vendas_30d REAL DEFAULT 0`).run();
    if (!pCols.includes('vendas_10m')) db.prepare(`ALTER TABLE products ADD COLUMN vendas_10m REAL DEFAULT 0`).run();
    if (!pCols.includes('psicotropico')) db.prepare(`ALTER TABLE products ADD COLUMN psicotropico TEXT DEFAULT 'N'`).run();
    if (!pCols.includes('antimicrobiano')) db.prepare(`ALTER TABLE products ADD COLUMN antimicrobiano TEXT DEFAULT 'N'`).run();
    if (!pCols.includes('recipe_type')) db.prepare(`ALTER TABLE products ADD COLUMN recipe_type TEXT DEFAULT NULL`).run();
  } catch (err) {
    console.warn('[Belinha ERP DB] Aviso ao verificar colunas products:', err.message);
  }

  // Índices para buscas em milissegundos
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_name ON products (name)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_active ON products (is_active)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_vendas ON products (vendas_30d, vendas_10m)`).run();

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
    if (!sCols.includes('cancellation_protocol')) db.prepare(`ALTER TABLE sales ADD COLUMN cancellation_protocol TEXT`).run();
    if (!sCols.includes('xml_cancellation')) db.prepare(`ALTER TABLE sales ADD COLUMN xml_cancellation TEXT`).run();

    // Identificação do Vendedor / Atendente
    if (!sCols.includes('seller_id')) db.prepare(`ALTER TABLE sales ADD COLUMN seller_id TEXT`).run();
    if (!sCols.includes('seller_name')) db.prepare(`ALTER TABLE sales ADD COLUMN seller_name TEXT`).run();

    // Rastreamento de Sincronização Resiliente com o Digifarma
    if (!sCols.includes('digifarma_sync_status')) db.prepare(`ALTER TABLE sales ADD COLUMN digifarma_sync_status TEXT DEFAULT 'PENDENTE'`).run();
    if (!sCols.includes('digifarma_venda_id')) db.prepare(`ALTER TABLE sales ADD COLUMN digifarma_venda_id INTEGER`).run();
    if (!sCols.includes('digifarma_sync_at')) db.prepare(`ALTER TABLE sales ADD COLUMN digifarma_sync_at TEXT`).run();
    if (!sCols.includes('digifarma_sync_error')) db.prepare(`ALTER TABLE sales ADD COLUMN digifarma_sync_error TEXT`).run();
  } catch (err) {
    console.warn('[Belinha ERP DB] Aviso ao verificar colunas sales:', err.message);
  }

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_digifarma_sync ON sales (digifarma_sync_status)`).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (sale_date)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_fiscal ON sales (fiscal_status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales (customer_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales (seller_id)`).run();

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
    if (!siCols.includes('is_unregistered')) db.prepare(`ALTER TABLE sale_items ADD COLUMN is_unregistered INTEGER DEFAULT 0`).run();
    if (!siCols.includes('is_cancelled')) db.prepare(`ALTER TABLE sale_items ADD COLUMN is_cancelled INTEGER DEFAULT 0`).run();
    if (!siCols.includes('cancelled_at')) db.prepare(`ALTER TABLE sale_items ADD COLUMN cancelled_at TEXT`).run();
    if (!siCols.includes('cancellation_reason')) db.prepare(`ALTER TABLE sale_items ADD COLUMN cancellation_reason TEXT`).run();
    if (!siCols.includes('digifarma_item_id')) db.prepare(`ALTER TABLE sale_items ADD COLUMN digifarma_item_id INTEGER`).run();

    const sCols = db.pragma('table_info(sales)').map(c => c.name);
    if (!sCols.includes('returned_value')) db.prepare(`ALTER TABLE sales ADD COLUMN returned_value REAL DEFAULT 0`).run();
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

  // 8. Tabela de Movimentações de Caixa (Sangria e Suprimento)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id TEXT PRIMARY KEY,
      movement_type TEXT NOT NULL, -- 'SANGRIA' ou 'SUPRIMENTO'
      amount REAL NOT NULL,
      reason TEXT,
      user_name TEXT NOT NULL DEFAULT 'Caixa',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      digifarma_sync_status TEXT DEFAULT 'PENDENTE',
      digifarma_caixa_id INTEGER,
      digifarma_sync_error TEXT
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_cash_movements_created ON cash_movements (created_at)`).run();

  // 9. Tabelas de Pré-Vendas e Orçamentos (Balcão / WhatsApp)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS pre_sales (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      customer_name TEXT,
      seller_id TEXT,
      seller_name TEXT,
      total_items_value REAL DEFAULT 0,
      discount_value REAL DEFAULT 0,
      total_value REAL DEFAULT 0,
      notes TEXT,
      status TEXT DEFAULT 'ABERTA', -- 'ABERTA', 'FATURADA', 'CANCELADA'
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      consumed_at TEXT,
      sale_id TEXT
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_pre_sales_status ON pre_sales (status)`).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS pre_sale_items (
      id TEXT PRIMARY KEY,
      pre_sale_id TEXT NOT NULL,
      product_code TEXT NOT NULL,
      barcode TEXT,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      unit_cost REAL DEFAULT 0,
      recipe_type TEXT,
      recipe_label TEXT
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_pre_sale_items_ps ON pre_sale_items (pre_sale_id)`).run();

  // Garante um registro padrão em fiscal_settings se estiver vazia
  const existingFiscal = db.prepare('SELECT id FROM fiscal_settings WHERE id = ?').get('primary');
  if (!existingFiscal) {
    db.prepare(`
      INSERT INTO fiscal_settings (id, cnpj, razao_social, nome_fantasia, uf, cod_municipio_ibge, ambiente, nfe_series, next_nfe_number)
      VALUES ('primary', '47378578000140', 'BELA FARMA SUL LTDA', 'DROGARIA BELA FARMA', 'MG', '3136702', 'homologacao', 1, 1)
    `).run();
  }

  // Migração: Dados do Contabilista para o SPED Fiscal (Registro 0100)
  const colsFiscal = db.prepare('PRAGMA table_info(fiscal_settings)').all().map(c => c.name);
  const contadorCols = [
    { name: 'contador_nome', def: "TEXT DEFAULT 'EDIVALDO CRUZ'" },
    { name: 'contador_cpf', def: "TEXT DEFAULT ''" },
    { name: 'contador_crc', def: "TEXT DEFAULT ''" },
    { name: 'contador_cnpj', def: "TEXT DEFAULT ''" },
    { name: 'contador_cep', def: "TEXT DEFAULT '36033000'" },
    { name: 'contador_endereco', def: "TEXT DEFAULT 'RUA PREVIDENCIARIOS'" },
    { name: 'contador_numero', def: "TEXT DEFAULT '100'" },
    { name: 'contador_bairro', def: "TEXT DEFAULT 'PREVIDENCIARIOS'" },
    { name: 'contador_telefone', def: "TEXT DEFAULT '3232150000'" },
    { name: 'contador_email', def: "TEXT DEFAULT ''" }
  ];
  for (const col of contadorCols) {
    if (!colsFiscal.includes(col.name)) {
      try {
        db.prepare(`ALTER TABLE fiscal_settings ADD COLUMN ${col.name} ${col.def}`).run();
      } catch (err) {}
    }
  }

  // 8. Tabela de Matriz Fiscal por NCM
  db.prepare(`
    CREATE TABLE IF NOT EXISTS fiscal_ncm_rules (
      ncm TEXT PRIMARY KEY,
      descricao TEXT NOT NULL,
      cest_padrao TEXT,
      is_monofasico_pis_cofins INTEGER NOT NULL DEFAULT 1,
      is_icms_st INTEGER NOT NULL DEFAULT 1,
      cst_pis TEXT DEFAULT '04',
      cst_cofins TEXT DEFAULT '04',
      csosn_icms TEXT DEFAULT '500',
      cfop_saida TEXT DEFAULT '5405',
      fundamentacao_legal TEXT DEFAULT 'Lei 10.147/2000 / Conv. ICMS 142/2018',
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_ncm_rules_monofasico ON fiscal_ncm_rules (is_monofasico_pis_cofins)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_ncm_rules_icms_st ON fiscal_ncm_rules (is_icms_st)`).run();

  // 9. Tabela de Fechamentos e Apurações do Simples Nacional (PGDAS-D)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS tax_closings (
      id TEXT PRIMARY KEY,
      competencia TEXT NOT NULL,
      data_fechamento TEXT NOT NULL,
      faturamento_bruto REAL NOT NULL DEFAULT 0,
      total_cancelamentos REAL NOT NULL DEFAULT 0,
      faturamento_liquido REAL NOT NULL DEFAULT 0,
      rec_monofasico_st REAL NOT NULL DEFAULT 0,
      rec_apenas_st REAL NOT NULL DEFAULT 0,
      rec_apenas_monofasico REAL NOT NULL DEFAULT 0,
      rec_tributada_integral REAL NOT NULL DEFAULT 0,
      rec_indeterminada REAL NOT NULL DEFAULT 0,
      aliquota_efetiva_estimada REAL DEFAULT 0.08,
      das_estimado_sem_segregacao REAL NOT NULL DEFAULT 0,
      das_estimado_com_segregacao REAL NOT NULL DEFAULT 0,
      economia_tributaria_estimada REAL NOT NULL DEFAULT 0,
      total_documentos INTEGER NOT NULL DEFAULT 0,
      total_itens INTEGER NOT NULL DEFAULT 0,
      inconsistencias_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'CONCLUIDO',
      gerado_por TEXT NOT NULL DEFAULT 'Sistema',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_tax_closings_comp ON tax_closings (competencia)`).run();

  // 10. Tabela de Inconsistências e Pendências Cadastrais de Auditoria Fiscal
  db.prepare(`
    CREATE TABLE IF NOT EXISTS fiscal_audit_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      closing_id TEXT NOT NULL,
      product_code TEXT,
      barcode TEXT,
      product_name TEXT,
      issue_type TEXT NOT NULL,
      detalhe TEXT NOT NULL,
      impacto_valor REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDENTE',
      FOREIGN KEY (closing_id) REFERENCES tax_closings (id) ON DELETE CASCADE
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_issues_closing ON fiscal_audit_issues (closing_id)`).run();

  // 11. Tabela de Histórico de Custos e Repasses de Preço
  db.prepare(`
    CREATE TABLE IF NOT EXISTS product_price_cost_history (
      id TEXT PRIMARY KEY,
      product_code TEXT NOT NULL,
      barcode TEXT,
      product_name TEXT NOT NULL,
      cost_price_before REAL NOT NULL DEFAULT 0,
      cost_price_new REAL NOT NULL DEFAULT 0,
      cost_variation_pct REAL NOT NULL DEFAULT 0,
      sale_price_before REAL NOT NULL DEFAULT 0,
      sale_price_new REAL NOT NULL DEFAULT 0,
      trigger_type TEXT NOT NULL DEFAULT 'MANUAL',
      invoice_id TEXT,
      applied_to_digifarma INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_price_cost_hist_prod ON product_price_cost_history (product_code)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_price_cost_hist_created ON product_price_cost_history (created_at)`).run();

  // 12. Garantir colunas fiscais completas em invoices e invoice_items para SPED e SINTEGRA
  try {
    const invCols = db.pragma('table_info(invoices)').map(c => c.name);
    if (!invCols.includes('access_key')) db.prepare(`ALTER TABLE invoices ADD COLUMN access_key TEXT`).run();
    if (!invCols.includes('cnpj_supplier')) db.prepare(`ALTER TABLE invoices ADD COLUMN cnpj_supplier TEXT`).run();
    if (!invCols.includes('series')) db.prepare(`ALTER TABLE invoices ADD COLUMN series TEXT`).run();
    if (!invCols.includes('supplier_ie')) db.prepare(`ALTER TABLE invoices ADD COLUMN supplier_ie TEXT`).run();
    if (!invCols.includes('supplier_ibge_code')) db.prepare(`ALTER TABLE invoices ADD COLUMN supplier_ibge_code TEXT`).run();
    if (!invCols.includes('supplier_address')) db.prepare(`ALTER TABLE invoices ADD COLUMN supplier_address TEXT`).run();
    if (!invCols.includes('supplier_uf')) db.prepare(`ALTER TABLE invoices ADD COLUMN supplier_uf TEXT`).run();
    if (!invCols.includes('total_icms')) db.prepare(`ALTER TABLE invoices ADD COLUMN total_icms REAL DEFAULT 0`).run();
    if (!invCols.includes('total_icms_st')) db.prepare(`ALTER TABLE invoices ADD COLUMN total_icms_st REAL DEFAULT 0`).run();
    if (!invCols.includes('total_ipi')) db.prepare(`ALTER TABLE invoices ADD COLUMN total_ipi REAL DEFAULT 0`).run();
    if (!invCols.includes('xml_raw')) db.prepare(`ALTER TABLE invoices ADD COLUMN xml_raw TEXT`).run();

    const itemCols = db.pragma('table_info(invoice_items)').map(c => c.name);
    if (!itemCols.includes('barcode')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN barcode TEXT`).run();
    if (!itemCols.includes('lot_number')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN lot_number TEXT`).run();
    if (!itemCols.includes('expiration_date')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN expiration_date TEXT`).run();
    if (!itemCols.includes('cfop_original')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN cfop_original TEXT`).run();
    if (!itemCols.includes('cfop_entrada')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN cfop_entrada TEXT`).run();
    if (!itemCols.includes('cst_csosn')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN cst_csosn TEXT`).run();
    if (!itemCols.includes('base_icms')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN base_icms REAL DEFAULT 0`).run();
    if (!itemCols.includes('aliquota_icms')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN aliquota_icms REAL DEFAULT 0`).run();
    if (!itemCols.includes('valor_icms')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN valor_icms REAL DEFAULT 0`).run();
    if (!itemCols.includes('base_st')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN base_st REAL DEFAULT 0`).run();
    if (!itemCols.includes('aliquota_st')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN aliquota_st REAL DEFAULT 0`).run();
    if (!itemCols.includes('valor_st')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN valor_st REAL DEFAULT 0`).run();
    if (!itemCols.includes('valor_ipi')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN valor_ipi REAL DEFAULT 0`).run();
    if (!itemCols.includes('cst_pis')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN cst_pis TEXT`).run();
    if (!itemCols.includes('cst_cofins')) db.prepare(`ALTER TABLE invoice_items ADD COLUMN cst_cofins TEXT`).run();
  } catch (err) {
    console.warn('[Belinha ERP DB] Aviso ao verificar colunas fiscais de invoices/invoice_items:', err.message);
  }

  // 13. Fila de Saneamento Fiscal de Produtos Provisórios (Cadastro Expresso no PDV)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS product_sanitization_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_code TEXT NOT NULL UNIQUE,
      barcode_read TEXT,
      product_name TEXT NOT NULL,
      sale_price REAL NOT NULL,
      cost_price REAL DEFAULT 0,
      ncm_provisional TEXT DEFAULT '33049990',
      ncm_definitive TEXT,
      cest_definitive TEXT,
      category TEXT DEFAULT 'Perfumaria / Acessório',
      status TEXT DEFAULT 'PENDENTE', -- 'PENDENTE', 'SANEADO', 'IGNORADO'
      digifarma_synced INTEGER DEFAULT 0,
      digifarma_product_id INTEGER,
      sale_id TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      validated_at TEXT,
      validated_by TEXT,
      notes TEXT
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sanitization_status ON product_sanitization_tasks (status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sanitization_code ON product_sanitization_tasks (product_code)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sanitization_barcode ON product_sanitization_tasks (barcode_read)`).run();

  // 14. Tabela de Preços Escalonados (Cache e Regras Locais sincronizadas com Digifarma DESCONTO_ESCALONADO)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS tiered_pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digifarma_id INTEGER UNIQUE,
      product_id INTEGER NOT NULL,
      product_code TEXT,
      barcode TEXT,
      product_name TEXT,
      quantity INTEGER NOT NULL,
      package_price REAL NOT NULL,
      unit_effective_price REAL NOT NULL,
      active INTEGER DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      is_permanent INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      synced_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_tiered_prod_id ON tiered_pricing (product_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_tiered_barcode ON tiered_pricing (barcode)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_tiered_prod_code ON tiered_pricing (product_code)`).run();

  // Migração dinâmica de colunas para tiered_pricing e products (validade de promoções)
  try {
    const tpCols = db.pragma('table_info(tiered_pricing)').map(c => c.name);
    if (!tpCols.includes('start_date')) db.prepare(`ALTER TABLE tiered_pricing ADD COLUMN start_date TEXT`).run();
    if (!tpCols.includes('end_date')) db.prepare(`ALTER TABLE tiered_pricing ADD COLUMN end_date TEXT`).run();
    if (!tpCols.includes('is_permanent')) db.prepare(`ALTER TABLE tiered_pricing ADD COLUMN is_permanent INTEGER DEFAULT 1`).run();
    if (!tpCols.includes('created_at')) db.prepare(`ALTER TABLE tiered_pricing ADD COLUMN created_at TEXT`).run();

    const pCols = db.pragma('table_info(products)').map(c => c.name);
    if (!pCols.includes('promo_start_date')) db.prepare(`ALTER TABLE products ADD COLUMN promo_start_date TEXT`).run();
    if (!pCols.includes('promo_end_date')) db.prepare(`ALTER TABLE products ADD COLUMN promo_end_date TEXT`).run();
    if (!pCols.includes('promo_permanent')) db.prepare(`ALTER TABLE products ADD COLUMN promo_permanent INTEGER DEFAULT 0`).run();
  } catch (err) {
    console.warn('[Belinha ERP DB] Aviso ao migrar colunas de validade de promoções:', err.message);
  }

  console.log('[Belinha ERP DB] ✅ Schema limpo do ERP verificado e pronto!');
  return true;
}

// Auto-inicializa o schema na carga do módulo
try {
  initErpDatabase();
} catch (err) {
  console.warn('[Belinha ERP DB] Aviso ao inicializar banco ERP:', err.message);
}

module.exports = {
  db,
  initErpDatabase
};
