const db = require('better-sqlite3')('belafarma.db');

console.log("=== VENDAS MENSAIS (cash_closings) ===");
const salesByMonth = db.prepare(`
  SELECT substr(date, 1, 7) as month, SUM(totalSales) as total_sales, SUM(expenses) as cash_expenses
  FROM cash_closings 
  GROUP BY month
  ORDER BY month DESC
  LIMIT 6
`).all();
console.table(salesByMonth);

console.log("\n=== CONTAS A PAGAR POR MÊS (accounts_payable) ===");
const payableByMonth = db.prepare(`
  SELECT substr(due_date, 1, 7) as month, SUM(original_value) as total_payable, status
  FROM accounts_payable
  GROUP BY month, status
  ORDER BY month DESC
  LIMIT 10
`).all();
console.table(payableByMonth);

console.log("\n=== CONTAS FIXAS (fixed_accounts) ===");
const fixedAccounts = db.prepare(`
  SELECT SUM(value) as total_fixed_monthly
  FROM fixed_accounts
  WHERE isActive = 1
`).get();
console.log(fixedAccounts);

console.log("\n=== TRANSAÇÕES BANCÁRIAS (checking_account_transactions) ===");
const transactionsByMonth = db.prepare(`
  SELECT substr(date, 1, 7) as month, type, SUM(value) as total_value
  FROM checking_account_transactions
  GROUP BY month, type
  ORDER BY month DESC
  LIMIT 10
`).all();
console.table(transactionsByMonth);

console.log("\n=== BOLETOS POR MÊS (boletos) ===");
const boletosByMonth = db.prepare(`
  SELECT substr(due_date, 1, 7) as month, status, SUM(value) as total_value
  FROM boletos
  GROUP BY month, status
  ORDER BY month DESC
  LIMIT 10
`).all();
console.table(boletosByMonth);
