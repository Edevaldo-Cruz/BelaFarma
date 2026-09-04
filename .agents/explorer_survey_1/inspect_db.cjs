const db = require('../../backend/database.js');

console.log('=== COLUNAS digifarma_products_cache ===');
const cols = db.prepare("PRAGMA table_info('digifarma_products_cache')").all();
console.log(JSON.stringify(cols, null, 2));

console.log('=== AMOSTRA digifarma_products_cache ===');
const sample = db.prepare("SELECT * FROM digifarma_products_cache LIMIT 2").all();
console.log(JSON.stringify(sample, null, 2));

console.log('=== TOTAL digifarma_products_cache ===');
const tot = db.prepare("SELECT count(*) as total FROM digifarma_products_cache").get();
console.log('Total:', tot.total);
