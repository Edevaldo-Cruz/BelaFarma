const Database = require('./backend/node_modules/better-sqlite3');
const db = new Database('./backend/belafarma.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tabelas:', tables.map(t => t.name));
