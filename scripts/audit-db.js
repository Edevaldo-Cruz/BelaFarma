import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../data/belafarma.db');

const db = new Database(dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tabelas:', tables.map(t => t.name).join(', '));

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
