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
        order_id TEXT NOT NULL,
        due_date TEXT NOT NULL,
        value REAL NOT NULL,
        status TEXT NOT NULL,
        installment_number INTEGER,
        invoice_number TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id)
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
