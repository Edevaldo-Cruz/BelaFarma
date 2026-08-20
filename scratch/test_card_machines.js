const path = require('path');
const Database = require(path.join(__dirname, '../backend/node_modules/better-sqlite3'));

const dbPath = path.join(__dirname, '../backend/belafarma.db');
const db = new Database(dbPath);

// Initialize card machines router which ensures table exists
const cardMachinesEndpoints = require(path.join(__dirname, '../backend/card-machines-endpoints.js'));
cardMachinesEndpoints(db);

console.log('Testing card_machine_receivables table...');

// 1. Check table structure
const tableInfo = db.prepare("PRAGMA table_info(card_machine_receivables)").all();
console.log('Table columns:', tableInfo.map(c => c.name));

if (tableInfo.length === 0) {
  console.error('FAIL: Table card_machine_receivables does not exist!');
  process.exit(1);
}

// 2. Test insertion
const testId = 'test_cmr_' + Date.now();
const insertStmt = db.prepare(`
  INSERT INTO card_machine_receivables (
    id, closing_id, sale_date, expected_payment_date, modality,
    gross_value, net_deposited_value, fee_value, fee_percent,
    status, created_at
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, NULL, NULL, NULL,
    'Pendente', ?
  )
`);

const today = new Date().toISOString().split('T')[0];
insertStmt.run(testId, 'test_closing_123', today, today, 'Débito', 1000.0, new Date().toISOString());
console.log('Inserted test receivable with ID:', testId);

// 3. Test Reconcile logic
const grossVal = 1000.0;
const netVal = 985.0; // 1.5% fee
const feeVal = grossVal - netVal;
const feePercent = (feeVal / grossVal) * 100;

const updateStmt = db.prepare(`
  UPDATE card_machine_receivables
  SET net_deposited_value = ?,
      fee_value = ?,
      fee_percent = ?,
      status = 'Conferido',
      reconciled_at = ?,
      reconciled_by = ?
  WHERE id = ?
`);

updateStmt.run(netVal, feeVal, feePercent, new Date().toISOString(), 'Edevaldo', testId);

const updatedRow = db.prepare('SELECT * FROM card_machine_receivables WHERE id = ?').get(testId);
console.log('Updated row:', updatedRow);

if (updatedRow.fee_percent !== 1.5 || updatedRow.fee_value !== 15.0 || updatedRow.status !== 'Conferido') {
  console.error('FAIL: Reconcile math mismatch!');
  process.exit(1);
}

// Clean up test record
db.prepare('DELETE FROM card_machine_receivables WHERE id = ?').run(testId);
console.log('Cleaned up test record. All DB tests passed successfully! ✅');
