const path = require('path');
const Database = require(path.join(__dirname, '../backend/node_modules/better-sqlite3'));

const dbPath = path.join(__dirname, '../backend/belafarma.db');
const db = new Database(dbPath);

console.log('=== SYSTEM INCIDENTS ===');
try {
  const incidents = db.prepare("SELECT * FROM system_incidents ORDER BY id DESC LIMIT 50").all();
  console.log(JSON.stringify(incidents, null, 2));
} catch (e) {
  console.log('Error reading system_incidents:', e.message);
}

console.log('\n=== SYSTEM HEARTBEATS ===');
try {
  const heartbeats = db.prepare("SELECT * FROM system_heartbeats ORDER BY id DESC LIMIT 10").all();
  console.log(JSON.stringify(heartbeats, null, 2));
} catch (e) {
  console.log('Error reading system_heartbeats:', e.message);
}
