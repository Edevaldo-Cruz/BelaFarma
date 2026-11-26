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

  db.prepare(`
    CREATE TABLE IF NOT EXISTS bank_accounts_config (
      account_id TEXT PRIMARY KEY,
      item_id TEXT,
      bank_name TEXT,
      account_number TEXT,
      role TEXT NOT NULL DEFAULT 'SECUNDARIO',
      custom_label TEXT,
      updated_at TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS bank_divergence_alerts (
      id TEXT PRIMARY KEY,
      fingerprint TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'ATENCAO',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      expected_value REAL,
      actual_value REAL,
      difference_value REAL,
      reference_date TEXT,
      account_id TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      resolution_note TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  console.log('✅ [BankConciliation] Tabelas bank_conciliations, runs, accounts_config e divergence_alerts prontas!');
}

initBankConciliationTables();
module.exports = { initBankConciliationTables };
