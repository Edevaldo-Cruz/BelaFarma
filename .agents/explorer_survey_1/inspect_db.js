const db = require('../../backend/database.js');

console.log('=== COLUNAS compras_estoque_cache ===');
const columns = db.prepare("PRAGMA table_info('compras_estoque_cache')").all();
console.log(JSON.stringify(columns, null, 2));

console.log('=== ÍNDICES compras_estoque_cache ===');
const indices = db.prepare("PRAGMA index_list('compras_estoque_cache')").all();
for (const idx of indices) {
  const info = db.prepare(`PRAGMA index_info('${idx.name}')`).all();
  console.log(`Índice: ${idx.name} (unique: ${idx.unique}) -> colunas:`, info.map(c => c.name).join(', '));
}

console.log('=== REGISTROS DE AMOSTRA (LIMIT 3) ===');
const sample = db.prepare("SELECT * FROM compras_estoque_cache LIMIT 3").all();
console.log(JSON.stringify(sample, null, 2));

console.log('=== TOTAL DE REGISTROS ===');
const total = db.prepare("SELECT count(*) as total FROM compras_estoque_cache").get();
console.log('Total:', total.total);
