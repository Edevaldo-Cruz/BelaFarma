const Database = require('better-sqlite3');

const DB_FILE = 'belafarma.db';
let db;

try {
  db = new Database(DB_FILE, { verbose: console.log });
  console.log('Conexão com o banco de dados SQLite estabelecida.');
  
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
        crediarioList TEXT
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

    // Executa as queries
    db.exec(createUsersTable);
    db.exec(createOrdersTable);
    db.exec(createShortagesTable);
    db.exec(createLogsTable);
    db.exec(createCashClosingsTable);
    db.exec(createCrediarioRecordsTable);
    db.exec(createTasksTable);
    db.exec(createCheckingAccountTransactionsTable);
    db.exec(createBoletosTable);
    db.exec(createMonthlyLimitsTable);
    db.exec(createDailyRecordsTable);
    db.exec(createFixedAccountsTable);
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

    const createSafeEntriesTable = `
      CREATE TABLE IF NOT EXISTS safe_entries (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL, -- 'Entrada' or 'Saída'
        value REAL NOT NULL,
        userName TEXT NOT NULL
      );
    `;
    db.exec(createSafeEntriesTable);

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