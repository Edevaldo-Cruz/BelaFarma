const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../backend/belafarma.db');
const db = new Database(dbPath);

console.log('=== Contas Fixas (Ativas) ===');
const fixedAccounts = db.prepare('SELECT * FROM fixed_accounts WHERE isActive = 1').all();
let totalAccounts = 0;
fixedAccounts.forEach(acc => {
  console.log(`- ${acc.name}: R$ ${acc.value.toFixed(2)} (Dia de vencimento: ${acc.dueDay})`);
  totalAccounts += acc.value;
});
console.log(`Total Contas Fixas Ativas: R$ ${totalAccounts.toFixed(2)}\n`);

console.log('=== Contas Fixas Cadastradas (Inativas) ===');
const inactiveAccounts = db.prepare('SELECT * FROM fixed_accounts WHERE isActive = 0').all();
inactiveAccounts.forEach(acc => {
  console.log(`- ${acc.name}: R$ ${acc.value.toFixed(2)} (Dia de vencimento: ${acc.dueDay})`);
});

console.log('\n=== Pagamentos de Contas Fixas Gerados para Maio de 2026 (2026-05) ===');
const payments05 = db.prepare("SELECT * FROM fixed_account_payments WHERE month = '2026-05'").all();
let total05 = 0;
payments05.forEach(p => {
  console.log(`- ${p.fixedAccountName}: R$ ${p.value.toFixed(2)} (Vence em: ${p.dueDate}, Status: ${p.status})`);
  total05 += p.value;
});
console.log(`Total 2026-05: R$ ${total05.toFixed(2)}\n`);

console.log('=== Pagamentos de Contas Fixas Gerados para Junho de 2026 (2026-06) ===');
const payments06 = db.prepare("SELECT * FROM fixed_account_payments WHERE month = '2026-06'").all();
let total06 = 0;
payments06.forEach(p => {
  console.log(`- ${p.fixedAccountName}: R$ ${p.value.toFixed(2)} (Vence em: ${p.dueDate}, Status: ${p.status})`);
  total06 += p.value;
});
console.log(`Total 2026-06: R$ ${total06.toFixed(2)}\n`);
