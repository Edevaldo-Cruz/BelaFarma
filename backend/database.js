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
        pixDirect REAL
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

    // Executa as queries
    db.exec(createUsersTable);
    db.exec(createOrdersTable);
    db.exec(createShortagesTable);
    db.exec(createLogsTable);
    db.exec(createCashClosingsTable);
    db.exec(createCheckingAccountTransactionsTable);

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
