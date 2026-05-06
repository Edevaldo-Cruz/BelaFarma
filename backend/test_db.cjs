const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data', 'belafarma.db');
const db = new Database(dbPath);

const posts = db.prepare('SELECT * FROM whatsapp_group_posts').all();
console.log('Posts:', JSON.stringify(posts, null, 2));

const now = new Date().toISOString();
console.log('Now:', now);
console.log('Scheduled <= Now?', posts.map(p => p.scheduledAt <= now));
