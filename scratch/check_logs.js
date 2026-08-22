const path = require('path');
const Database = require(path.join(__dirname, '../backend/node_modules/better-sqlite3'));

const dbPath = path.join(__dirname, '../backend/belafarma.db');
const db = new Database(dbPath);

console.log('--- TABLES IN DB ---');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables.map(t => t.name));

console.log('\n--- LAST 30 SYSTEM LOGS (logs table) ---');
try {
  const recentLogs = db.prepare("SELECT * FROM logs ORDER BY rowid DESC LIMIT 30").all();
  console.table(recentLogs);
} catch (e) {
  console.log('Error reading logs table:', e.message);
}

// Check incident tracking if exists
if (tables.some(t => t.name === 'system_incidents' || t.name === 'incidents')) {
  const tableName = tables.find(t => t.name.includes('incident')).name;
  console.log(`\n--- INCIDENTS (${tableName}) ---`);
  const incidents = db.prepare(`SELECT * FROM ${tableName} ORDER BY rowid DESC LIMIT 20`).all();
  console.table(incidents);
}
