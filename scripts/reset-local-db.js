/**
 * Script para Resetar e Inicializar o Banco de Dados Local (SQLite)
 * 
 * Este script:
 * 1. Para o servidor backend (se estiver rodando)
 * 2. Deleta os arquivos do banco de dados SQLite
 * 3. Reinicia o servidor (que recria as tabelas automaticamente)
 * 4. Insere dados iniciais (usuário admin)
 * 
 * Uso:
 *   node scripts/reset-local-db.js
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'belafarma.db');
const DB_SHM = DB_FILE + '-shm';
const DB_WAL = DB_FILE + '-wal';

console.log('🔄 Resetando Banco de Dados Local (SQLite)...\n');

// Função para deletar arquivo se existir
function deleteFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`   ✅ Deletado: ${path.basename(filePath)}`);
    return true;
  }
  return false;
}

// Passo 1: Deletar arquivos do banco
console.log('📦 Deletando arquivos do banco de dados...');
const deletedMain = deleteFileIfExists(DB_FILE);
const deletedShm = deleteFileIfExists(DB_SHM);
const deletedWal = deleteFileIfExists(DB_WAL);

if (!deletedMain && !deletedShm && !deletedWal) {
  console.log('   ℹ️  Nenhum arquivo de banco encontrado (já estava limpo)');
}
console.log('');

// Passo 2: Criar novo banco de dados
console.log('🏗️  Criando novo banco de dados...');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
console.log('   ✅ Banco de dados criado\n');

// Passo 3: Criar tabelas (executando o mesmo código de database.js)
console.log('📋 Criando tabelas...');

const tables = [
  {
    name: 'users',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        accessKey TEXT NOT NULL UNIQUE
      );
    `
  },
  {
    name: 'orders',
    sql: `
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
        installments TEXT,
        boletoPath TEXT
      );
    `
  },
  {
    name: 'shortages',
    sql: `
      CREATE TABLE IF NOT EXISTS shortages (
        id TEXT PRIMARY KEY,
        productName TEXT NOT NULL,
        type TEXT NOT NULL,
        clientInquiry INTEGER NOT NULL,
        notes TEXT,
        createdAt TEXT NOT NULL,
        userName TEXT NOT NULL
      );
    `
  },
  {
    name: 'logs',
    sql: `
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        userName TEXT NOT NULL,
        userId TEXT NOT NULL,
        action TEXT NOT NULL,
        category TEXT NOT NULL,
        details TEXT
      );
    `
  },
  {
    name: 'cash_closings',
    sql: `
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
    `
  },
  {
    name: 'tasks',
    sql: `
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
        recurrenceDaysOfWeek TEXT DEFAULT '[]',
        recurrenceDayOfMonth INTEGER DEFAULT 0,
        recurrenceMonthOfYear INTEGER DEFAULT 0,
        recurrenceEndDate TEXT,
        recurrenceId TEXT,
        originalDueDate TEXT,
        annotations TEXT DEFAULT '[]',
        needsAdminAttention INTEGER DEFAULT 0,
        adminAttentionMessage TEXT,
        adminResolutionMessage TEXT,
        hasAdminResponse INTEGER DEFAULT 0
      );
    `
  },
  {
    name: 'crediario_records',
    sql: `
      CREATE TABLE IF NOT EXISTS crediario_records (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        client TEXT NOT NULL,
        value REAL NOT NULL,
        userName TEXT NOT NULL
      );
    `
  },
  {
    name: 'checking_account_transactions',
    sql: `
      CREATE TABLE IF NOT EXISTS checking_account_transactions (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        value REAL NOT NULL,
        cashClosingId TEXT,
        FOREIGN KEY (cashClosingId) REFERENCES cash_closings(id)
      );
    `
  },
  {
    name: 'boletos',
    sql: `
      CREATE TABLE IF NOT EXISTS boletos (
        id TEXT PRIMARY KEY,
        supplierName TEXT,
        order_id TEXT,
        due_date TEXT NOT NULL,
        value REAL NOT NULL,
        status TEXT NOT NULL,
        installment_number INTEGER,
        invoice_number TEXT
      );
    `
  },
  {
    name: 'monthly_limits',
    sql: `
      CREATE TABLE IF NOT EXISTS monthly_limits (
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        "limit" REAL NOT NULL,
        PRIMARY KEY (month, year)
      );
    `
  },
  {
    name: 'daily_records',
    sql: `
      CREATE TABLE IF NOT EXISTS daily_records (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        expenses TEXT NOT NULL,
        nonRegistered TEXT NOT NULL,
        pixDiretoList TEXT,
        crediarioList TEXT,
        userName TEXT NOT NULL,
        cashClosingId TEXT,
        lancado INTEGER DEFAULT 0
      );
    `
  },
  {
    name: 'fixed_accounts',
    sql: `
      CREATE TABLE IF NOT EXISTS fixed_accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        value REAL NOT NULL,
        dueDay INTEGER NOT NULL,
        isActive INTEGER DEFAULT 1
      );
    `
  },
  {
    name: 'customers',
    sql: `
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
        updatedAt TEXT NOT NULL,
        creditLimit REAL DEFAULT 0,
        dueDay INTEGER
      );
    `
  },
  {
    name: 'customer_debts',
    sql: `
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
    `
  },
  {
    name: 'safe_entries',
    sql: `
      CREATE TABLE IF NOT EXISTS safe_entries (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        value REAL NOT NULL,
        userName TEXT NOT NULL
      );
    `
  },
  {
    name: 'bugs',
    sql: `
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
      );
    `
  },
  {
    name: 'flyering_tasks',
    sql: `
      CREATE TABLE IF NOT EXISTS flyering_tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        coordinates TEXT NOT NULL,
        assignedUserId TEXT NOT NULL,
        status TEXT NOT NULL,
        color TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        createdBy TEXT NOT NULL,
        description TEXT,
        area TEXT
      );
    `
  }
];

tables.forEach(table => {
  db.exec(table.sql);
  console.log(`   ✅ ${table.name}`);
});

console.log('');

// Passo 4: Inserir dados iniciais
console.log('👤 Inserindo dados iniciais...\n');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Inserir usuário administrador
const adminId = generateId();
const adminUser = {
  id: adminId,
  name: 'Administrador',
  role: 'Administrador',
  accessKey: 'admin123'
};

const insertUserStmt = db.prepare(`
  INSERT INTO users (id, name, role, accessKey)
  VALUES (@id, @name, @role, @accessKey)
`);

insertUserStmt.run(adminUser);
console.log('✅ Usuário Administrador criado');
console.log(`   📝 Nome: ${adminUser.name}`);
console.log(`   🔑 Chave de acesso: ${adminUser.accessKey}`);
console.log(`   ⚠️  IMPORTANTE: Altere a chave após o primeiro login!\n`);

// Fechar conexão
db.close();

console.log('='.repeat(60));
console.log('✨ Banco de dados local resetado e inicializado com sucesso!');
console.log('='.repeat(60));
console.log('\n📌 PRÓXIMOS PASSOS:\n');
console.log('1. Inicie o servidor backend:');
console.log('   cd backend');
console.log('   node server.js\n');
console.log('2. Faça login com:');
console.log(`   Chave de acesso: ${adminUser.accessKey}\n`);
console.log('3. Ou use a chave mestra:');
console.log('   Chave de acesso: belafarma2024\n');
console.log('='.repeat(60));
