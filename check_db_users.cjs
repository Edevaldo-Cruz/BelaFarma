
const Database = require('better-sqlite3');
const db = new Database('backend/belafarma.db');
try {
  const users = db.prepare('SELECT * FROM users').all();
  console.log('Users:', JSON.stringify(users, null, 2));
} catch (e) {
  console.error('Error:', e.message);
}
db.close();
