const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'belafarma.db');
const db = new Database(dbPath);

const months = ['2026-01', '2026-02', '2026-03', '2026-04'];
months.forEach(m => {
  const closings = db.prepare(`SELECT * FROM cash_closings WHERE date LIKE '${m}-%'`).all();
  let totalSales = 0;
  let count = closings.length;
  closings.forEach(c => {
    totalSales += c.totalSales;
  });
  const avgSales = count > 0 ? totalSales / count : 0;
  console.log(`Mês ${m}: Total Vendas: R$ ${totalSales.toFixed(2)}, Dias com fechamento: ${count}, Média Diária: R$ ${avgSales.toFixed(2)}`);
});
