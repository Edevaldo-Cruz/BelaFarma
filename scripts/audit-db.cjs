const Database = require('../backend/node_modules/better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/belafarma.db');

const db = new Database(dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tabelas encontradas:', tables.length);

// Check counts for ALL tables
for (const table of tables) {
    try {
        const count = db.prepare(`SELECT COUNT(*) as total FROM "${table.name}"`).get();
        if (count.total > 0) {
            console.log(`- ${table.name}: ${count.total} registros`);
        }
    } catch (e) {}
}
db.close();
