const Database = require('better-sqlite3');
const dbPath = './belafarma.db';
const db = new Database(dbPath);

console.log('--- Buscando Lara no SQLite ---');
try {
  const customers = db.prepare(`
    SELECT id, name, phone, whatsapp_name 
    FROM customers 
    WHERE name LIKE '%Lara%' OR phone LIKE '%1468538%' OR whatsapp_name LIKE '%Lara%'
  `).all();

  console.log('Resultados em customers:', JSON.stringify(customers, null, 2));
} catch (err) {
  console.error('Erro:', err.message);
}
