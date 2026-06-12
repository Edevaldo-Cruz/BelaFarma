const Database = require('better-sqlite3');
const { dbPath } = require('./config');
console.log('Lendo banco de dados em:', dbPath);

try {
  const db = new Database(dbPath);
  const rows = db.prepare('SELECT * FROM whatsapp_messages ORDER BY timestamp DESC LIMIT 10').all();
  console.log('\nÚltimas 10 mensagens no SQLite:');
  console.log(JSON.stringify(rows, null, 2));
} catch (e) {
  console.error('Erro ao ler tabela:', e.message);
}
