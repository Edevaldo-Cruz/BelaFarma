const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'belafarma.db');
const db = new Database(dbPath);

try {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM customers').get();
  console.log(`Total de clientes cadastrados: ${count.cnt}`);
  
  const sources = db.prepare('SELECT source, COUNT(*) as cnt FROM customers GROUP BY source').all();
  console.log('Clientes por origem:', JSON.stringify(sources, null, 2));
  
  console.log('\nÚltimos 10 clientes cadastrados:');
  const customers = db.prepare('SELECT id, name, phone, source, createdAt FROM customers ORDER BY createdAt DESC LIMIT 10').all();
  customers.forEach((c, idx) => {
    console.log(`${idx + 1}. Name: ${c.name}, Phone: ${c.phone}, Source: ${c.source}, CreatedAt: ${c.createdAt}`);
  });
} catch (err) {
  console.error('Erro:', err.message);
}

db.close();
