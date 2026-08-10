const Database = require('better-sqlite3');
const config = require('./config.js');
config.log();

const DB_FILE = config.dbPath;

let db;

try {
  db = new Database(DB_FILE, { verbose: console.log });
  console.log(`Conexão com o banco de dados SQLite estabelecida.`);
  
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
        installments TEXT, -- Armazenado como JSON
        isFogueteAmarelo INTEGER DEFAULT 0,
        boletoPath TEXT
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
        userName TEXT NOT NULL,
        purchased INTEGER DEFAULT 0,
        ordered INTEGER DEFAULT 0,
        saldo REAL DEFAULT 0,
        valorUltimaCompra REAL DEFAULT 0,
        history TEXT
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
        sangrias TEXT, -- New column for sangrias
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

    const createPixConfirmationsTable = `
      CREATE TABLE IF NOT EXISTS pix_confirmations (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        value REAL,
        senderName TEXT,
        pixDate TEXT,
        status TEXT NOT NULL,
        aiAnalysis TEXT,
        createdAt TEXT NOT NULL
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

    const createCustomerRecipesTable = `
      CREATE TABLE IF NOT EXISTS customer_recipes (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        doctor_name TEXT,
        medication_name TEXT,
        recipe_image_url TEXT NOT NULL,
        expiry_date TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
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
        userName TEXT,
        source_id TEXT, -- Para vincular a sangrias ou outros lançamentos
        parent_id TEXT -- Novo campo para vincular ao registro diário ou fechamento
      );
    `;

    // AI Cache Table
    const createAICacheTable = `
      CREATE TABLE IF NOT EXISTS ai_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at TEXT NOT NULL
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

    // Purchasing (Isa-Compras) Tables
    const createSuppliersTable = `
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        whatsapp TEXT NOT NULL,
        category TEXT NOT NULL, -- 'Medicamentos', 'Perfumaria', etc.
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

    // Stock products and label printing queue tables
    const createStockProductsTable = `
      CREATE TABLE IF NOT EXISTS stock_products (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sale_price REAL NOT NULL,
        cost_price REAL,
        stock_qty INTEGER,
        updated_at TEXT NOT NULL
      );
    `;

    const createLabelPrintQueueTable = `
      CREATE TABLE IF NOT EXISTS label_print_queue (
        id TEXT PRIMARY KEY,
        product_name TEXT NOT NULL,
        price REAL NOT NULL,
        original_price REAL,
        barcode TEXT,
        quantity INTEGER DEFAULT 1,
        status TEXT DEFAULT 'Pendente',
        source TEXT,
        phone TEXT,
        created_at TEXT NOT NULL,
        printed_at TEXT
      );
    `;

    const createLocalSuppliersTable = `
      CREATE TABLE IF NOT EXISTS local_suppliers (
        id TEXT PRIMARY KEY,
        digifarma_id INTEGER UNIQUE,
        representante TEXT,
        telefone TEXT,
        prazo_boletos TEXT,
        createdAt TEXT
      );
    `;

    const createQuotationsTable = `
      CREATE TABLE IF NOT EXISTS quotations (
        id TEXT PRIMARY KEY,
        productName TEXT NOT NULL,
        supplierId TEXT,
        supplierName TEXT NOT NULL,
        supplierPhone TEXT,
        status TEXT NOT NULL, -- 'Enviada', 'Respondida', 'Dúvida do Fornecedor', 'Ignorada'
        quotedPrice REAL,
        rawMessage TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `;

    const createQuotationListsTable = `
      CREATE TABLE IF NOT EXISTS quotation_lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'Aberta',
        createdAt TEXT NOT NULL
      );
    `;

    const createQuotationListItemsTable = `
      CREATE TABLE IF NOT EXISTS quotation_list_items (
        id TEXT PRIMARY KEY,
        listId TEXT NOT NULL,
        productId TEXT NOT NULL,
        productName TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (listId) REFERENCES quotation_lists(id) ON DELETE CASCADE
      );
    `;

    // Executa as queries
    db.exec(createUsersTable);
    db.exec(createOrdersTable);
    db.exec(createShortagesTable);

    try { db.exec('ALTER TABLE shortages ADD COLUMN saldo REAL DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE shortages ADD COLUMN valorUltimaCompra REAL DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE shortages ADD COLUMN history TEXT'); } catch(e) {}
    db.exec(createLogsTable);
    db.exec(createCashClosingsTable);
    db.exec(createCrediarioRecordsTable);
    db.exec(createTasksTable);
    db.exec(createCheckingAccountTransactionsTable);
    db.exec(createSafeEntriesTable);
    db.exec(createAICacheTable);
    db.exec(createConsignadoSuppliersTable);
    db.exec(createConsignadoProductsTable);
    db.exec(createSuppliersTable);
    db.exec(createBoletosTable);
    db.exec(createMonthlyLimitsTable);
    db.exec(createDailyRecordsTable);
    db.exec(createFixedAccountsTable);
    db.exec(createFixedAccountPaymentsTable);
    db.exec(createPixConfirmationsTable);
    db.exec(createCustomersTable);
    db.exec(createCustomerDebtsTable);
    db.exec(createCustomerRecipesTable);
    db.exec(createStockProductsTable);
    db.exec(createLabelPrintQueueTable);
    db.exec(createLocalSuppliersTable);
    db.exec(createQuotationsTable);
    db.exec(createQuotationListsTable);
    db.exec(createQuotationListItemsTable);

    // Inventario Module Tables
    const createSessoesInventarioTable = `
      CREATE TABLE IF NOT EXISTS sessoes_inventario (
        id TEXT PRIMARY KEY,
        data_inicio TEXT NOT NULL,
        data_fim TEXT,
        status TEXT NOT NULL
      );
    `;

    const createItensInventariadosTable = `
      CREATE TABLE IF NOT EXISTS itens_inventariados (
        id TEXT PRIMARY KEY,
        sessao_id TEXT NOT NULL,
        codigo_barras TEXT NOT NULL,
        descricao TEXT NOT NULL,
        quantidade_contada INTEGER DEFAULT 1,
        data_hora_bip TEXT NOT NULL,
        FOREIGN KEY(sessao_id) REFERENCES sessoes_inventario(id) ON DELETE CASCADE
      );
    `;

    const createVendasDuranteInventarioTable = `
      CREATE TABLE IF NOT EXISTS vendas_durante_inventario (
        id TEXT PRIMARY KEY,
        sessao_id TEXT NOT NULL,
        codigo_barras TEXT NOT NULL,
        quantidade_vendida REAL NOT NULL,
        data_hora_venda TEXT NOT NULL,
        FOREIGN KEY(sessao_id) REFERENCES sessoes_inventario(id) ON DELETE CASCADE
      );
    `;

    const createDigifarmaProductsCacheTable = `
      CREATE TABLE IF NOT EXISTS digifarma_products_cache (
        codigo_barras TEXT PRIMARY KEY,
        produto_id TEXT,
        descricao TEXT NOT NULL,
        estoque_atual REAL,
        preco_venda REAL,
        atualizado_em TEXT
      );
    `;

    const createNappPricesTable = `
      CREATE TABLE IF NOT EXISTS napp_prices (
        ean TEXT PRIMARY KEY,
        produto_id TEXT,
        preco_proffer REAL,
        atualizado_em TEXT
      );
    `;

    db.exec(createSessoesInventarioTable);
    db.exec(createItensInventariadosTable);
    db.exec(createVendasDuranteInventarioTable);
    db.exec(createDigifarmaProductsCacheTable);
    db.exec(createNappPricesTable);

    // --- Price Manager Table Migrations ---
    try {
      db.prepare('SELECT categoria_id FROM digifarma_products_cache LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN categoria_id INTEGER DEFAULT 0');
      console.log('Added categoria_id column to digifarma_products_cache table.');
    }

    try {
      db.prepare('SELECT curva FROM digifarma_products_cache LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN curva TEXT DEFAULT "C"');
      console.log('Added curva column to digifarma_products_cache table.');
    }

    try {
      db.prepare('SELECT preco_custo FROM digifarma_products_cache LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN preco_custo REAL DEFAULT 0.0');
      console.log('Added preco_custo column to digifarma_products_cache table.');
    }

    try {
      db.prepare('SELECT preco_promocao FROM digifarma_products_cache LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN preco_promocao REAL DEFAULT 0.0');
      console.log('Added preco_promocao column to digifarma_products_cache table.');
    }

    try {
      db.prepare('SELECT preco_normal FROM digifarma_products_cache LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN preco_normal REAL DEFAULT 0.0');
      console.log('Added preco_normal column to digifarma_products_cache table.');
    }

    try {
      db.prepare('SELECT categoria_id FROM digifarma_products_cache LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN categoria_id INTEGER DEFAULT 0');
      console.log('Added categoria_id column to digifarma_products_cache table.');
    }




    // Create indexes for fast lookups
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_stock_products_name ON stock_products(name);');
      db.exec('CREATE INDEX IF NOT EXISTS idx_label_print_queue_status ON label_print_queue(status);');
      db.exec('CREATE INDEX IF NOT EXISTS idx_digifarma_cache_desc ON digifarma_products_cache(descricao);');
      console.log('Stock, Label and Digifarma Cache indexes verified/created.');
    } catch (e) {
      console.log('Stock/Label/Cache indexes already exist or failed to create:', e.message);
    }

    // --- Inventario Table Migrations ---
    try {
      db.prepare('SELECT modo_teste FROM sessoes_inventario LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE sessoes_inventario ADD COLUMN modo_teste INTEGER DEFAULT 0');
      console.log('Added modo_teste column to sessoes_inventario table.');
    }

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

    // Add isFogueteAmarelo column to orders table if it doesn't exist
    try {
      db.prepare('SELECT isFogueteAmarelo FROM orders LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE orders ADD COLUMN isFogueteAmarelo INTEGER DEFAULT 0');
      console.log('Added isFogueteAmarelo column to orders table.');
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

    // Daily records sangrias migration
    try {
      db.prepare('SELECT sangrias FROM daily_records LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE daily_records ADD COLUMN sangrias TEXT');
      console.log('Added sangrias column to daily_records table.');
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

    // CRM: Add preferences column to customers table if it doesn't exist
    try {
      db.prepare('SELECT preferences FROM customers LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE customers ADD COLUMN preferences TEXT');
      console.log('Added preferences column to customers table.');
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
    } catch (e) {}

    try {
      db.exec('ALTER TABLE safe_entries ADD COLUMN source_id TEXT');
      console.log('Coluna source_id adicionada em safe_entries.');
    } catch (e) {}

    try {
      db.exec('ALTER TABLE safe_entries ADD COLUMN parent_id TEXT');
      console.log('Coluna parent_id adicionada em safe_entries.');
    } catch (e) {}

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

    // ========================================================================
    // SISTEMA DE MENSAGENS WHATSAPP - Tabelas
    // ========================================================================

    // CRM: Add birthDate column to customers table if it doesn't exist
    try {
      db.prepare('SELECT birthDate FROM customers LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE customers ADD COLUMN birthDate TEXT');
      console.log('Added birthDate column to customers table.');
    }

    // Tabela: message_templates (Templates editáveis de mensagens)
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_templates (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);
    console.log('Message templates table verified/created.');

    // Tabela: message_log (Histórico de mensagens enviadas)
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_log (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        customerName TEXT,
        customerId TEXT,
        campaignId TEXT,
        errorMessage TEXT,
        sentAt TEXT NOT NULL
      )
    `);
    console.log('Message log table verified/created.');

    // Índices para message_log
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_msg_log_type ON message_log(type)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_msg_log_status ON message_log(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_msg_log_sentAt ON message_log(sentAt)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_msg_log_campaign ON message_log(campaignId)');
    } catch (e) {
      console.log('Message log indexes already exist.');
    }

    // Tabela: message_campaigns (Campanhas de promoção)
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        messageContent TEXT NOT NULL,
        targetCustomerIds TEXT,
        status TEXT DEFAULT 'rascunho',
        sentCount INTEGER DEFAULT 0,
        failedCount INTEGER DEFAULT 0,
        totalCount INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        executedAt TEXT
      )
    `);
    console.log('Message campaigns table verified/created.');

    // Tabela: whatsapp_group_posts (Agendamento de postagens em grupos e status)
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_group_posts (
        id TEXT PRIMARY KEY,
        groupId TEXT,
        groupName TEXT,
        content TEXT NOT NULL,
        mediaPath TEXT,
        scheduledAt TEXT NOT NULL,
        status TEXT DEFAULT 'Pendente',
        errorMessage TEXT,
        createdAt TEXT NOT NULL,
        sentAt TEXT,
        type TEXT DEFAULT 'group'
      )
    `);
    try {
      db.exec(`ALTER TABLE whatsapp_group_posts ADD COLUMN type TEXT DEFAULT 'group'`);
    } catch (e) {
      // Coluna já existe
    }
    console.log('WhatsApp group posts table verified/created.');

    // Tabela: whatsapp_offers_bank (Banco de imagens/textos de ofertas)
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_offers_bank (
        id TEXT PRIMARY KEY,
        productName TEXT NOT NULL,
        price REAL NOT NULL,
        category TEXT NOT NULL,
        mediaPath TEXT,
        aiCaption TEXT,
        createdAt TEXT NOT NULL
      )
    `);
    console.log('WhatsApp offers bank table verified/created.');

    // Tabela: whatsapp_custom_groups (Grupos de WhatsApp customizados salvos pelo usuário)
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_custom_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    console.log('WhatsApp custom groups table verified/created.');

    console.log('✅ Sistema de Mensagens: Tabelas criadas com sucesso!');

    // ========================================================================
    // AGENTE DE MARKETING - Tabela para relatórios gerados pela IA
    // ========================================================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS marketing_reports (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata TEXT,
        sentToRosana INTEGER DEFAULT 0,
        sentAt TEXT,
        createdAt TEXT NOT NULL
      )
    `);

    // Índice para busca por data
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_mkt_reports_created ON marketing_reports(createdAt)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_mkt_reports_sent ON marketing_reports(sentToRosana)');
    } catch (e) { /* índices já existem */ }

    console.log('✅ Agente de Marketing: Tabela marketing_reports criada!');

    // Histórico de produtos sugeridos para evitar repetição
    db.exec(`
      CREATE TABLE IF NOT EXISTS marketing_suggestions_history (
        id TEXT PRIMARY KEY,
        productName TEXT NOT NULL,
        suggestedAction TEXT,
        suggestedAt TEXT NOT NULL,
        approved INTEGER DEFAULT 0,
        taskId TEXT
      )
    `);

    // Controle de aprovações pendentes (Nayane enviando "ok")
    db.exec(`
      CREATE TABLE IF NOT EXISTS nayane_pending_approvals (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        suggestionsJson TEXT NOT NULL,
        status TEXT DEFAULT 'Pendente',
        createdAt TEXT NOT NULL
      )
    `);

    console.log('✅ Agente de Marketing: Tabelas de histórico e aprovações criadas!');

    // ========================================================================
    // CRM WHATSAPP — Histórico de Produtos por Cliente
    // ========================================================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_product_history (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        customer_id TEXT,
        product_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('comprado', 'pesquisado', 'nao_encontrado', 'cancelado')),
        interaction_date TEXT,
        source TEXT DEFAULT 'WhatsApp',
        notes TEXT,
        created_at TEXT NOT NULL
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_wph_phone ON whatsapp_product_history(phone)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_wph_status ON whatsapp_product_history(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_wph_product ON whatsapp_product_history(product_name)');
    } catch (e) { /* índices já existem */ }
    console.log('✅ CRM WhatsApp: Tabela whatsapp_product_history criada!');

    // Cache de auditorias de clientes inativos (usado no módulo de marketing)
    db.exec(`
      CREATE TABLE IF NOT EXISTS crm_inactive_audits (
        phone TEXT PRIMARY KEY,
        whatsappName TEXT,
        systemName TEXT,
        jid TEXT,
        inactivityDays INTEGER,
        lastMessage TEXT,
        lastInteractionTime INTEGER,
        atendido INTEGER DEFAULT 0,
        fechouVenda INTEGER DEFAULT 0,
        modalidade TEXT,
        modalidadeDescricao TEXT,
        endereco TEXT,
        ideiaReativacao TEXT,
        productsJson TEXT DEFAULT '[]',
        auditedAt TEXT
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cia_phone ON crm_inactive_audits(phone)');
    } catch (e) { /* índice já existe */ }
    console.log('✅ CRM WhatsApp: Tabela crm_inactive_audits criada!');

    // Tabela para armazenar o histórico local das mensagens de WhatsApp para análise de faltas e PIX
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        fromMe INTEGER NOT NULL,
        messageText TEXT NOT NULL,
        rawMessage TEXT,
        timestamp INTEGER NOT NULL
      )
    `);
    try {
      db.exec('ALTER TABLE whatsapp_messages ADD COLUMN rawMessage TEXT');
    } catch (e) { /* Coluna já existe */ }
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_wm_phone ON whatsapp_messages(phone)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_wm_timestamp ON whatsapp_messages(timestamp)');
    } catch (e) { /* índices já existem */ }
    console.log('✅ CRM WhatsApp: Tabela whatsapp_messages atualizada com rawMessage!');

    // Tabela para armazenar os pedidos de entrega (Deliveries) e orçamentos não fechados identificados via IA
    db.exec(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        customer_name TEXT,
        delivery_address TEXT,
        items TEXT,
        total_amount REAL DEFAULT 0,
        payment_method TEXT,
        status TEXT DEFAULT 'Pendente',
        sale_closed INTEGER DEFAULT 1,
        unclosed_reason TEXT,
        last_message_id TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try {
      db.exec('ALTER TABLE deliveries ADD COLUMN sale_closed INTEGER DEFAULT 1');
    } catch (e) { /* coluna já existe */ }
    try {
      db.exec('ALTER TABLE deliveries ADD COLUMN unclosed_reason TEXT');
    } catch (e) { /* coluna já existe */ }
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_phone ON deliveries(phone)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_closed ON deliveries(sale_closed)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_created ON deliveries(created_at)');
    } catch (e) { /* índices já existem */ }
    console.log('✅ Tabela deliveries atualizada para suportar auditoria de Vendas Fechadas x Não Fechadas!');

    // Migration: adicionar coluna source em customers (usada no webhook)
    try {
      db.prepare('SELECT source FROM customers LIMIT 1').get();
    } catch (e) {
      db.exec("ALTER TABLE customers ADD COLUMN source TEXT DEFAULT 'Manual'");
      console.log('✅ Migration: coluna source adicionada em customers.');
    }

    // Migration: adicionar coluna source em shortages (para identificar origem WhatsApp)
    try {
      db.prepare('SELECT source FROM shortages LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE shortages ADD COLUMN source TEXT');
      console.log('✅ Migration: coluna source adicionada em shortages.');
    }

    // Migration: adicionar coluna purchased em shortages
    try {
      db.prepare('SELECT purchased FROM shortages LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE shortages ADD COLUMN purchased INTEGER DEFAULT 0');
      console.log('✅ Migration: coluna purchased adicionada em shortages.');
    }

    // Migration: adicionar coluna ordered em shortages
    try {
      db.prepare('SELECT ordered FROM shortages LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE shortages ADD COLUMN ordered INTEGER DEFAULT 0');
      console.log('✅ Migration: coluna ordered adicionada em shortages.');
    }

    // Migration: adicionar coluna whatsapp_name em customers
    try {
      db.prepare('SELECT whatsapp_name FROM customers LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE customers ADD COLUMN whatsapp_name TEXT');
      console.log('✅ Migration: coluna whatsapp_name adicionada em customers.');
    }

    // Migration: Limpeza de LIDs/Grupos inválidos em customers
    try {
      db.exec("DELETE FROM customers WHERE phone LIKE '120363%' OR LENGTH(phone) > 15 OR phone LIKE '%@g.us%' OR phone LIKE '%@lid%'");
      console.log('✅ Migration: Limpeza de LIDs/Grupos em customers concluída!');
    } catch (e) {}

    // Migration: adicionar colunas de CRM Preditivo (Uso Contínuo e Cruzamento de Faltas) em whatsapp_product_history
    try {
      db.prepare('SELECT is_continuous_use FROM whatsapp_product_history LIMIT 1').get();
    } catch (e) {
      try {
        db.exec('ALTER TABLE whatsapp_product_history ADD COLUMN is_continuous_use INTEGER DEFAULT 0');
        db.exec('ALTER TABLE whatsapp_product_history ADD COLUMN treatment_duration_days INTEGER DEFAULT 30');
        db.exec('ALTER TABLE whatsapp_product_history ADD COLUMN last_purchase_date TEXT');
        db.exec('ALTER TABLE whatsapp_product_history ADD COLUMN next_reminder_date TEXT');
        db.exec("ALTER TABLE whatsapp_product_history ADD COLUMN reminder_status TEXT DEFAULT 'pendente'");
        db.exec('ALTER TABLE whatsapp_product_history ADD COLUMN notified_arrival INTEGER DEFAULT 0');
        console.log('✅ Migration: Colunas de CRM Preditivo adicionadas a whatsapp_product_history.');
      } catch (alterErr) {
        console.error('❌ Erro ao adicionar colunas de CRM Preditivo:', alterErr.message);
      }
    }

    // Migration: adicionar colunas type e userName em pix_confirmations (extrato Pix)
    try { db.exec('ALTER TABLE pix_confirmations ADD COLUMN type TEXT DEFAULT "entrada"'); } catch(e) {}
    try { db.exec('ALTER TABLE pix_confirmations ADD COLUMN userName TEXT DEFAULT ""'); } catch(e) {}

    // Criar tabela scraped_images para o módulo WhatsApp Vendas
    db.exec(`
      CREATE TABLE IF NOT EXISTS scraped_images (
        ean TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        image_url TEXT NOT NULL,
        category TEXT,
        brand TEXT,
        last_updated TEXT
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_scraped_images_ean ON scraped_images(ean)');
    } catch(e) {}
    console.log('✅ WhatsApp Vendas: Tabela scraped_images criada/verificada!');

    // Criar tabela critical_products para estoque crítico monitorado
    db.exec(`
      CREATE TABLE IF NOT EXISTS critical_products (
        id TEXT PRIMARY KEY,
        produto_id INTEGER NOT NULL UNIQUE,
        productName TEXT NOT NULL,
        minStock INTEGER DEFAULT 0
      )
    `);
    console.log('✅ Estoque Crítico: Tabela critical_products criada/verificada!');

    // Criar tabela custom_product_groups para agrupamentos customizados de produtos
    db.exec(`
      CREATE TABLE IF NOT EXISTS custom_product_groups (
        codigo_barras TEXT PRIMARY KEY,
        grupo_customizado TEXT NOT NULL,
        manual_override INTEGER DEFAULT 1
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpg_grupo ON custom_product_groups(grupo_customizado)');
    } catch(e) {}
    console.log('✅ Grupos Customizados: Tabela custom_product_groups criada/verificada!');

    // Criar tabela page_visitors para contador de acessos do Dashboard
    db.exec(`
      CREATE TABLE IF NOT EXISTS page_visitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visited_at TEXT NOT NULL,
        date_str TEXT NOT NULL,
        user_name TEXT
      );
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_pv_date ON page_visitors(date_str)');
    } catch(e) {}
    console.log('✅ Contador de Visitantes: Tabela page_visitors criada/verificada!');

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