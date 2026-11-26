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

  db.prepare(`
    CREATE TABLE IF NOT EXISTS bank_conciliation_runs (
      id TEXT PRIMARY KEY,
      run_date TEXT NOT NULL,
      status TEXT NOT NULL,
      saldo_total REAL,
      extrato_conciliados INTEGER DEFAULT 0,
      cards_baixados INTEGER DEFAULT 0,
      ifood_baixados INTEGER DEFAULT 0,
      alertas_json TEXT,
      whatsapp_sent INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `).run();

  console.log('✅ [BankConciliation] Tabelas bank_conciliations e bank_conciliation_runs prontas!');
}

initBankConciliationTables();
module.exports = { initBankConciliationTables };
