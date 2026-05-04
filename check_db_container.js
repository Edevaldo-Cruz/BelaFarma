
const Database = require('better-sqlite3');
const db = new Database('/usr/src/app/data/belafarma.db');
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables:', tables.map(t => t.name).join(', '));
  const users = db.prepare("SELECT * FROM users").all();
  console.log('Users count:', users.length);
  if (users.length > 0) {
    console.log('First user:', users[0].name);
  }
} catch (e) {
  console.error('Error:', e.message);
}
db.close();
