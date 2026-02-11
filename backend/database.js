const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Suporta variável de ambiente para o caminho do banco
const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'belafarma.db');

// Garante que o diretório existe
const dbDir = path.dirname(DB_FILE);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`Diretório de dados criado: ${dbDir}`);
}

let db;

try {
  db = new Database(DB_FILE, { verbose: console.log });
  console.log(`Conexão com o banco de dados SQLite estabelecida: ${DB_FILE}`);
  
  // Ativa o modo WAL para melhor concorrência
  db.pragma('journal_mode = WAL');

  // Função para criar as tabelas
  const createTables = () => {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        accessKey TEXT NOT NULL UNIQUE
      );
    `;

    const createOrdersTable = `
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        orderDate TEXT NOT NULL,
        distributor TEXT NOT NULL,
        seller TEXT,
        totalValue REAL NOT NULL,
        arrivalForecast TEXT,
        status TEXT NOT NULL,
        paymentMonth TEXT,
        invoiceNumber TEXT,
        paymentMethod TEXT NOT NULL,
        receiptDate TEXT,
        notes TEXT,
        installments TEXT -- Armazenado como JSON
      );
    `;

    const createShortagesTable = `
      CREATE TABLE IF NOT EXISTS shortages (
        id TEXT PRIMARY KEY,
        productName TEXT NOT NULL,
        type TEXT NOT NULL,
        clientInquiry INTEGER NOT NULL, -- 0 for false, 1 for true
        notes TEXT,
        createdAt TEXT NOT NULL,
        userName TEXT NOT NULL
      );
    `;

    const createLogsTable = `
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        userName TEXT NOT NULL,
        userId TEXT NOT NULL,
        action TEXT NOT NULL,
        category TEXT NOT NULL,
        details TEXT
      );
    `;

    const createCashClosingsTable = `
      CREATE TABLE IF NOT EXISTS cash_closings (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        totalSales REAL NOT NULL,
        initialCash REAL NOT NULL,
        receivedExtra REAL NOT NULL,
        totalDigital REAL NOT NULL,
        totalInDrawer REAL NOT NULL,
        difference REAL NOT NULL,
        safeDeposit REAL NOT NULL,
        expenses REAL NOT NULL,
        userName TEXT NOT NULL,
        credit REAL,
        debit REAL,
        pix REAL,
        pixDirect REAL,
        totalCrediario REAL,
        crediarioList TEXT,
        creditReceipts TEXT
      );
    `;

    const createTasksTable = `
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        assignedUser TEXT NOT NULL,
        creator TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        creationDate TEXT NOT NULL,
        color TEXT NOT NULL,
        isArchived INTEGER DEFAULT 0,
        completionDate TEXT,
        recurrenceType TEXT DEFAULT 'none',
        recurrenceInterval INTEGER DEFAULT 0,
        recurrenceDaysOfWeek TEXT DEFAULT '[]', -- JSON string "[0,1,2]"
        recurrenceDayOfMonth INTEGER DEFAULT 0,
        recurrenceMonthOfYear INTEGER DEFAULT 0,
        recurrenceEndDate TEXT,
        recurrenceId TEXT,
        originalDueDate TEXT,
        annotations TEXT DEFAULT '[]', -- JSON string of array of objects
        needsAdminAttention INTEGER DEFAULT 0, -- 0 for false, 1 for true
        adminAttentionMessage TEXT
      );
    `;

    const createCrediarioRecordsTable = `
      CREATE TABLE IF NOT EXISTS crediario_records (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        client TEXT NOT NULL,
        value REAL NOT NULL,
        userName TEXT NOT NULL
      );
    `;

    const createCheckingAccountTransactionsTable = `
      CREATE TABLE IF NOT EXISTS checking_account_transactions (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        value REAL NOT NULL,
        cashClosingId TEXT,
        FOREIGN KEY (cashClosingId) REFERENCES cash_closings(id)
      );
    `;

    const createBoletosTable = `
      CREATE TABLE IF NOT EXISTS boletos (
        id TEXT PRIMARY KEY,
        supplierName TEXT,
        order_id TEXT, -- Made nullable
        due_date TEXT NOT NULL,
        value REAL NOT NULL,
        status TEXT NOT NULL
        -- installment_number INTEGER, -- Removed
        -- invoice_number TEXT,     -- Removed
        -- boletoPath TEXT          -- Removed, as file upload is removed
        -- FOREIGN KEY (order_id) REFERENCES orders(id) -- Foreign key might need to be removed or adjusted if order_id is nullable
      );
    `;

    const createMonthlyLimitsTable = `
      CREATE TABLE IF NOT EXISTS monthly_limits (
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        "limit" REAL NOT NULL,
        PRIMARY KEY (month, year)
      );
    `;

    const createDailyRecordsTable = `
      CREATE TABLE IF NOT EXISTS daily_records (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        expenses TEXT NOT NULL,
        nonRegistered TEXT NOT NULL,
        pixDiretoList TEXT,
        crediarioList TEXT,
        creditReceipts TEXT,
        userName TEXT NOT NULL,
        cashClosingId TEXT -- New column to link to cash closings
      );
    `;

    const createFixedAccountsTable = `
      CREATE TABLE IF NOT EXISTS fixed_accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        value REAL NOT NULL,
        dueDay INTEGER NOT NULL,
        isActive INTEGER DEFAULT 1
      );
    `;

    const createFixedAccountPaymentsTable = `
      CREATE TABLE IF NOT EXISTS fixed_account_payments (
        id TEXT PRIMARY KEY,
        fixedAccountId TEXT NOT NULL,
        fixedAccountName TEXT NOT NULL,
        value REAL NOT NULL,
        dueDate TEXT NOT NULL,
        month TEXT NOT NULL,
        status TEXT NOT NULL,
        paidAt TEXT,
        notes TEXT,
        FOREIGN KEY (fixedAccountId) REFERENCES fixed_accounts(id)
      );
    `;
    console.log('Fixed account payments table verified/created.');

    // CRM Module Tables
    const createCustomersTable = `
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        nickname TEXT,
        cpf TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `;

    const createCustomerDebtsTable = `
      CREATE TABLE IF NOT EXISTS customer_debts (
        id TEXT PRIMARY KEY,
        customerId TEXT NOT NULL,
        purchaseDate TEXT NOT NULL,
        description TEXT,
        totalValue REAL NOT NULL,
        status TEXT DEFAULT 'Pendente',
        paidAt TEXT,
        userName TEXT NOT NULL,
        FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE RESTRICT
      );
    `;

    // Safe Entries Table
    const createSafeEntriesTable = `
      CREATE TABLE IF NOT EXISTS safe_entries (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT CHECK(type IN ('Entrada', 'Saída')) NOT NULL,
        value REAL NOT NULL,
        userName TEXT
      );
    `;

    // Consignados Module Tables
    const createConsignadoSuppliersTable = `
      CREATE TABLE IF NOT EXISTS consignado_suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact TEXT,
        pixKey TEXT,
        createdAt TEXT NOT NULL
      );
    `;

    const createConsignadoProductsTable = `
      CREATE TABLE IF NOT EXISTS consignado_products (
        id TEXT PRIMARY KEY,
        supplierId TEXT NOT NULL,
        name TEXT NOT NULL,
        costPrice REAL NOT NULL,
        salePrice REAL NOT NULL,
        currentStock INTEGER NOT NULL DEFAULT 0,
        soldQty INTEGER NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'Ativo',
        FOREIGN KEY (supplierId) REFERENCES consignado_suppliers(id) ON DELETE CASCADE
      );
    `;

    // Executa as queries
    db.exec(createUsersTable);
    db.exec(createOrdersTable);
    db.exec(createShortagesTable);
    db.exec(createLogsTable);
    db.exec(createCashClosingsTable);
    db.exec(createCrediarioRecordsTable);
    db.exec(createTasksTable);
    db.exec(createCheckingAccountTransactionsTable);
    db.exec(createSafeEntriesTable);
    db.exec(createConsignadoSuppliersTable);
    db.exec(createConsignadoProductsTable);
    db.exec(createBoletosTable);
    db.exec(createMonthlyLimitsTable);
    db.exec(createDailyRecordsTable);
    db.exec(createFixedAccountsTable);
    db.exec(createFixedAccountPaymentsTable);
    db.exec(createCustomersTable);
    db.exec(createCustomerDebtsTable);
    // --- Boletos Table Migrations ---
    // Add supplierName column if it doesn't exist
    try {
      db.prepare('SELECT supplierName FROM boletos LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE boletos ADD COLUMN supplierName TEXT');
      console.log('Added supplierName column to boletos table.');
    }

    // Make order_id nullable if it's currently NOT NULL
    const boletosInfo = db.prepare('PRAGMA table_info(boletos)').all();
    const orderIdColumn = boletosInfo.find(col => col.name === 'order_id');

    // If order_id exists and is NOT NULL
    if (orderIdColumn && orderIdColumn.notnull === 1) {
      console.log('Migrating boletos table: making order_id nullable...');
      db.transaction(() => {
        // 1. Rename existing table
        db.exec('ALTER TABLE boletos RENAME TO boletos_old;');

        // 2. Create new table with desired schema (order_id TEXT)
        db.exec(`
          CREATE TABLE IF NOT EXISTS boletos (
            id TEXT PRIMARY KEY,
            supplierName TEXT,
            order_id TEXT, -- Now nullable
            due_date TEXT NOT NULL,
            value REAL NOT NULL,
            status TEXT NOT NULL,
            installment_number INTEGER,
            invoice_number TEXT
            -- FOREIGN KEY (order_id) REFERENCES orders(id) -- Foreign key constraint removed for nullable order_id
          );
        `);

        // 3. Copy data from old table to new table
        // We handle missing supplierName column in old table gracefully
        db.exec(`
          INSERT INTO boletos (id, supplierName, order_id, due_date, value, status, installment_number, invoice_number)
          SELECT 
            id, 
            COALESCE(supplierName, NULL) AS supplierName, -- Handle potential missing supplierName in old table
            order_id, 
            due_date, 
            value, 
            status, 
            installment_number, 
            invoice_number 
          FROM boletos_old;
        `);

        // 4. Drop old table
        db.exec('DROP TABLE boletos_old;');
      })();
      console.log('Boletos table migration for order_id nullable completed.');
    }
    // --- End Boletos Table Migrations ---
    // db.exec(createMonthlyLimitsTable); // Already executed
    // db.exec(createDailyRecordsTable); // Already executed

    // Add supplierName column to boletos table if it doesn't exist
    try {
      db.prepare('SELECT supplierName FROM boletos LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE boletos ADD COLUMN supplierName TEXT');
    }

    // Add boletoPath column to orders table if it doesn't exist
    try {
      db.prepare('SELECT boletoPath FROM orders LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE orders ADD COLUMN boletoPath TEXT');
    }



    // ALTER TABLE statements for new task columns (if they don't exist)
    // Recurrence
    try { db.prepare('SELECT recurrenceType FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceType TEXT DEFAULT 'none'"); }
    try { db.prepare('SELECT recurrenceInterval FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceInterval INTEGER DEFAULT 0"); }
    try { db.prepare('SELECT recurrenceDaysOfWeek FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceDaysOfWeek TEXT DEFAULT '[]'"); }
    try { db.prepare('SELECT recurrenceDayOfMonth FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceDayOfMonth INTEGER DEFAULT 0"); }
    try { db.prepare('SELECT recurrenceMonthOfYear FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceMonthOfYear INTEGER DEFAULT 0"); }
    try { db.prepare('SELECT recurrenceEndDate FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceEndDate TEXT"); }
    try { db.prepare('SELECT recurrenceId FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceId TEXT"); }
    try { db.prepare('SELECT originalDueDate FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN originalDueDate TEXT"); }
    // Annotations & Admin Attention
    try { db.prepare('SELECT annotations FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN annotations TEXT DEFAULT '[]'"); }
    try { db.prepare('SELECT needsAdminAttention FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN needsAdminAttention INTEGER DEFAULT 0"); }
    try { db.prepare('SELECT adminAttentionMessage FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN adminAttentionMessage TEXT"); }
    try { db.prepare('SELECT adminResolutionMessage FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN adminResolutionMessage TEXT"); }
    try { db.prepare('SELECT hasAdminResponse FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN hasAdminResponse INTEGER DEFAULT 0"); }
    
    // Daily records cashClosingId migration
    try {
      db.prepare('SELECT cashClosingId FROM daily_records LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE daily_records ADD COLUMN cashClosingId TEXT');
      console.log('Added cashClosingId column to daily_records table.');
    }

    // Daily records lancado migration
    try {
      db.prepare('SELECT lancado FROM daily_records LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE daily_records ADD COLUMN lancado INTEGER DEFAULT 0');
      console.log('Added lancado column to daily_records table.');
    }

    // Cash closings creditReceipts migration
    try {
      db.prepare('SELECT creditReceipts FROM cash_closings LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE cash_closings ADD COLUMN creditReceipts TEXT');
      console.log('Added creditReceipts column to cash_closings table.');
    }

    // Daily records creditReceipts migration
    try {
      db.prepare('SELECT creditReceipts FROM daily_records LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE daily_records ADD COLUMN creditReceipts TEXT');
      console.log('Added creditReceipts column to daily_records table.');
    }

    // Migrate existing data: mark all records from previous days as lancado = 1
    // (assuming records from past days were already processed in previous cash closings)
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const updateStmt = db.prepare(`
        UPDATE daily_records 
        SET lancado = 1 
        WHERE date < ? AND lancado = 0
      `);
      const result = updateStmt.run(today);
      if (result.changes > 0) {
        console.log(`Migrated ${result.changes} old records (before ${today}) to lancado = 1`);
      }
    } catch (e) {
      console.error('Error migrating old records:', e);
    }

    // CRM: Add creditLimit column to customers table if it doesn't exist
    try {
      db.prepare('SELECT creditLimit FROM customers LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE customers ADD COLUMN creditLimit REAL DEFAULT 0');
      console.log('Added creditLimit column to customers table.');
    }

    // CRM: Add dueDay column to customers table if it doesn't exist
    try {
      db.prepare('SELECT dueDay FROM customers LIMIT 1').get();
    } catch (e) {
      // Default dueDay to current day or null? Null is better.
      db.exec('ALTER TABLE customers ADD COLUMN dueDay INTEGER');
      console.log('Added dueDay column to customers table.');
    }

    // Create bugs table for system bug tracking
    db.exec(`
      CREATE TABLE IF NOT EXISTS bugs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        reporter TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        category TEXT,
        createdAt TEXT NOT NULL,
        resolvedAt TEXT,
        resolvedBy TEXT,
        resolutionNotes TEXT,
        screenshots TEXT
      )
    `);
    console.log('Bugs table verified/created.');

    // Create flyering_tasks table for panfletagem management
    db.exec(`
      CREATE TABLE IF NOT EXISTS flyering_tasks (\n        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- 'polyline' or 'polygon'
        coordinates TEXT NOT NULL, -- JSON array de [lat, lng]
        assignedUserId TEXT NOT NULL,
        status TEXT NOT NULL, -- 'Pendente', 'Em Andamento', 'Concluído'
        color TEXT NOT NULL, -- Cor hexadecimal
        createdAt TEXT NOT NULL,
        createdBy TEXT NOT NULL,
        description TEXT,
        area TEXT -- Nome da área
      )
    `);
    console.log('Flyering tasks table verified/created.');

    // ========================================================================
    // SISTEMA FOGUETE AMARELO - Tabelas para gestão de notas fiscais
    // ========================================================================

    // Tabela: invoices (Notas Fiscais de Entrada)
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT NOT NULL UNIQUE,
        supplier_name TEXT NOT NULL,
        issue_date TEXT NOT NULL,
        total_value REAL NOT NULL,
        is_foguete_amarelo INTEGER DEFAULT 0,
        payment_due_date TEXT,
        status TEXT DEFAULT 'Ativa',
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        notes TEXT
      )
    `);
    console.log('Invoices table verified/created.');

    // Índices para invoices
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_name)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoices_foguete ON invoices(is_foguete_amarelo, status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(payment_due_date)');
    } catch (e) {
      console.log('Invoices indexes already exist.');
    }

    // Tabela: invoice_items (Itens da Nota Fiscal)
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        product_code TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL,
        total_cost REAL NOT NULL,
        quantity_sold REAL DEFAULT 0,
        quantity_remaining REAL NOT NULL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);
    console.log('Invoice items table verified/created.');

    // Índices para invoice_items
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_code)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoice_items_remaining ON invoice_items(quantity_remaining)');
    } catch (e) {
      console.log('Invoice items indexes already exist.');
    }

    // Tabela: sales (Vendas - PDV)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        sale_date TEXT NOT NULL,
        sale_time TEXT NOT NULL,
        total_value REAL NOT NULL,
        payment_method TEXT NOT NULL,
        customer_id TEXT,
        user_id TEXT NOT NULL,
        status TEXT DEFAULT 'Finalizada',
        created_at TEXT NOT NULL,
        cancelled_at TEXT,
        cancellation_reason TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `);
    console.log('Sales table verified/created.');

    // Índices para sales
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)');
    } catch (e) {
      console.log('Sales indexes already exist.');
    }

    // Tabela: sale_items (Itens da Venda)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        product_code TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        unit_cost REAL NOT NULL,
        total_cost REAL NOT NULL,
        profit REAL NOT NULL,
        invoice_item_id TEXT,
        is_foguete_amarelo INTEGER DEFAULT 0,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id)
      )
    `);
    console.log('Sale items table verified/created.');

    // Índices para sale_items
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_code)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sale_items_foguete ON sale_items(is_foguete_amarelo)');
    } catch (e) {
      console.log('Sale items indexes already exist.');
    }

    // Tabela: foguete_amarelo_payments (Pagamentos Antecipados)
    db.exec(`
      CREATE TABLE IF NOT EXISTS foguete_amarelo_payments (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        sale_id TEXT,
        payment_date TEXT NOT NULL,
        value REAL NOT NULL,
        status TEXT DEFAULT 'Pendente',
        created_at TEXT NOT NULL,
        notes TEXT,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);
    console.log('Foguete Amarelo payments table verified/created.');

    // Índices para foguete_amarelo_payments
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_fap_invoice ON foguete_amarelo_payments(invoice_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_fap_payment_date ON foguete_amarelo_payments(payment_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_fap_status ON foguete_amarelo_payments(status)');
    } catch (e) {
      console.log('Foguete Amarelo payments indexes already exist.');
    }

    // Adicionar colunas que podem estar faltando
    try {
      db.exec('ALTER TABLE foguete_amarelo_payments ADD COLUMN observations TEXT');
      console.log('Coluna observations adicionada.');
    } catch (e) {
      // Coluna já existe
    }

    try {
      db.exec('ALTER TABLE foguete_amarelo_payments ADD COLUMN created_by TEXT');
      console.log('Coluna created_by adicionada.');
    } catch (e) {
      // Coluna já existe
    }

    // Tabela: accounts_payable (Contas a Pagar Unificada)
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts_payable (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        reference_id TEXT,
        supplier_name TEXT NOT NULL,
        description TEXT,
        due_date TEXT NOT NULL,
        original_value REAL NOT NULL,
        amortized_value REAL DEFAULT 0,
        remaining_value REAL NOT NULL,
        status TEXT DEFAULT 'Pendente',
        is_foguete_amarelo INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        paid_at TEXT,
        payment_method TEXT,
        notes TEXT
      )
    `);
    console.log('Accounts payable table verified/created.');

    // Índices para accounts_payable
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_ap_type ON accounts_payable(type)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ap_due_date ON accounts_payable(due_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ap_status ON accounts_payable(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ap_foguete ON accounts_payable(is_foguete_amarelo)');
    } catch (e) {
      console.log('Accounts payable indexes already exist.');
    }

    // Garantir colunas em safe_entries (Correção de Bug Cofre)
    try {
      db.exec('ALTER TABLE safe_entries ADD COLUMN userName TEXT');
      console.log('Coluna userName adicionada em safe_entries.');
    } catch (e) {
      // Coluna já existe
    }

    // ========================================================================
    // MÓDULO iFOOD - Tabela para gestão de vendas iFood
    // ========================================================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS ifood_sales (
        id TEXT PRIMARY KEY,
        sale_date TEXT NOT NULL,
        gross_value REAL NOT NULL,
        operator_fee_percent REAL DEFAULT 0,
        operator_fee_value REAL DEFAULT 0,
        net_value REAL NOT NULL,
        payment_due_date TEXT NOT NULL,
        status TEXT DEFAULT 'Pendente',
        received_at TEXT,
        description TEXT,
        daily_record_id TEXT,
        checking_account_id TEXT,
        user_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    console.log('iFood sales table verified/created.');

    // Índices para ifood_sales
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_ifood_sale_date ON ifood_sales(sale_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ifood_status ON ifood_sales(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ifood_due_date ON ifood_sales(payment_due_date)');
    } catch (e) {
      console.log('iFood sales indexes already exist.');
    }

    console.log('✅ Módulo iFood: Tabela criada com sucesso!');

    // Tabela de configurações do sistema (chave-valor)
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT
      )
    `);
    console.log('System settings table verified/created.');

    // Inserir valor padrão para taxa iFood se não existir
    const existingFee = db.prepare("SELECT * FROM system_settings WHERE key = 'ifood_fee_percent'").get();
    if (!existingFee) {
      db.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES ('ifood_fee_percent', '6.5', ?)").run(new Date().toISOString());
      console.log('Default iFood fee (6.5%) inserted.');
    }

    console.log('✅ Sistema Foguete Amarelo: Todas as tabelas criadas com sucesso!');

    console.log('Tabelas verificadas/criadas com sucesso.');
  };

  createTables();

} catch (err) {
  console.error('Erro ao conectar ou configurar o banco de dados:', err.message);
  // Se houver um erro na conexão, o `db` pode não ser exportado ou ser `undefined`
  // As chamadas subsequentes a ele falharão, o que é o comportamento esperado.
}

// Exporta a instância do banco de dados para ser usada em outros arquivos
module.exports = db;