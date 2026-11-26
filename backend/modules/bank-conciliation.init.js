/**
 * backend/modules/bank-conciliation.init.js
 */
const db = require('../database');

function initBankConciliationTables() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS bank_conciliations (
      id TEXT PRIMARY KEY,
      transaction_id TEXT UNIQUE NOT NULL,
      transaction_date TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      channel TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      status TEXT NOT NULL DEFAULT 'CONCILIATED',
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `).run();
  console.log('✅ [BankConciliation] Tabela bank_conciliations pronta!');
}

initBankConciliationTables();
module.exports = { initBankConciliationTables };
