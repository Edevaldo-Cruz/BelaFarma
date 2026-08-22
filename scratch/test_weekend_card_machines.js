const path = require('path');
const Database = require(path.join(__dirname, '../backend/node_modules/better-sqlite3'));

const dbPath = path.join(__dirname, '../backend/belafarma.db');
const db = new Database(dbPath);

console.log('--- TEST: DATABASE & CARD MACHINES ENDPOINTS LOGIC ---');

// 1. Check columns in tables
const cardCols = db.prepare("PRAGMA table_info(card_machine_receivables)").all().map(c => c.name);
console.log('card_machine_receivables columns:', cardCols);

if (!cardCols.includes('brand') || !cardCols.includes('is_weekend_accumulated')) {
  try { db.exec("ALTER TABLE card_machine_receivables ADD COLUMN brand TEXT NOT NULL DEFAULT 'Outros'"); } catch(e){}
  try { db.exec("ALTER TABLE card_machine_receivables ADD COLUMN is_weekend_accumulated INTEGER DEFAULT 0"); } catch(e){}
}

const closingCols = db.prepare("PRAGMA table_info(cash_closings)").all().map(c => c.name);
console.log('cash_closings columns:', closingCols);
if (!closingCols.includes('credit_installments')) {
  try { db.exec("ALTER TABLE cash_closings ADD COLUMN credit_installments REAL DEFAULT 0"); } catch(e){}
}

// 2. Test inserting a weekend closing (Friday, Saturday, Sunday)
const fridayDate = '2026-08-21';
const mondayDate = '2026-08-24';

const testClosingId = 'test_closing_fds_' + Date.now();

// Insert receivables simulating Friday closing
db.prepare(`
  INSERT INTO card_machine_receivables (
    id, closing_id, sale_date, expected_payment_date, modality, brand, is_weekend_accumulated,
    gross_value, status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', ?)
`).run(
  `cmr_fri_deb_${Date.now()}`,
  testClosingId,
  fridayDate,
  mondayDate,
  'Débito',
  'Visa',
  1,
  500.00,
  new Date().toISOString()
);

db.prepare(`
  INSERT INTO card_machine_receivables (
    id, closing_id, sale_date, expected_payment_date, modality, brand, is_weekend_accumulated,
    gross_value, status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', ?)
`).run(
  `cmr_fri_cred_${Date.now()}`,
  testClosingId,
  fridayDate,
  mondayDate,
  'Crédito à Vista',
  'Master',
  1,
  1000.00,
  new Date().toISOString()
);

db.prepare(`
  INSERT INTO card_machine_receivables (
    id, closing_id, sale_date, expected_payment_date, modality, brand, is_weekend_accumulated,
    gross_value, status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', ?)
`).run(
  `cmr_fri_inst_${Date.now()}`,
  testClosingId,
  fridayDate,
  mondayDate,
  'Crédito Parcelado',
  'Elo',
  1,
  1500.00,
  new Date().toISOString()
);

console.log('✅ Inserção de vendas de fim de semana com vencimento na segunda-feira OK!');

// 3. Test consolidated reconciliation
const pendingMonday = db.prepare(`
  SELECT id, gross_value FROM card_machine_receivables
  WHERE closing_id = ?
`).all(testClosingId);

const totalGross = pendingMonday.reduce((sum, item) => sum + item.gross_value, 0);
console.log(`Total Bruto do FDS: R$ ${totalGross}`); // Expected 3000

const netDeposited = 2910.00; // Expected fee = 90.00 (3%)
const totalFee = totalGross - netDeposited;
const feePercent = (totalFee / totalGross) * 100;

console.log(`Total Líquido: R$ ${netDeposited}, Taxa R$: ${totalFee}, Taxa %: ${feePercent}%`);

// Clean test records
db.prepare('DELETE FROM card_machine_receivables WHERE closing_id = ?').run(testClosingId);
console.log('✅ Limpeza de registros de teste concluída com sucesso!');
