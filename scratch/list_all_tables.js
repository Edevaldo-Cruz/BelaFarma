const path = require('path');
const Database = require(path.join(__dirname, '../backend/node_modules/better-sqlite3'));

const dbPath = path.join(__dirname, '../backend/belafarma.db');
const db = new Database(dbPath);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables in DB:');
for (const t of tables) {
  const count = db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get().c;
  console.log(`- ${t.name}: ${count} rows`);
}
