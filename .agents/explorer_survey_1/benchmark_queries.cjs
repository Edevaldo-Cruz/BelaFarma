const db = require('../../backend/database.js');
const { performance } = require('perf_hooks');

console.log('=== TESTE DE PERFORMANCE DE ÍNDICES EM compras_estoque_cache (64k registros) ===');

// 1. Busca por ID (PK)
let t0 = performance.now();
for (let i = 0; i < 100; i++) {
  db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(188549);
}
let t1 = performance.now();
console.log(`Busca por produto_id (PK): ${((t1 - t0) / 100).toFixed(4)} ms`);

// 2. Busca por EAN (índice idx_cec_ean)
t0 = performance.now();
for (let i = 0; i < 100; i++) {
  db.prepare('SELECT * FROM compras_estoque_cache WHERE ean = ?').get('7898361212568');
}
t1 = performance.now();
console.log(`Busca por ean (Index): ${((t1 - t0) / 100).toFixed(4)} ms`);

// 3. Busca por Descricao (índice idx_cec_descricao)
t0 = performance.now();
for (let i = 0; i < 50; i++) {
  db.prepare('SELECT * FROM compras_estoque_cache WHERE descricao LIKE ? LIMIT 20').all('%DIPIRONA%');
}
t1 = performance.now();
console.log(`Busca por descricao LIKE %term%: ${((t1 - t0) / 50).toFixed(4)} ms`);

// 4. Busca por status_ruptura (índice idx_cec_status)
t0 = performance.now();
for (let i = 0; i < 50; i++) {
  db.prepare('SELECT * FROM compras_estoque_cache WHERE status_ruptura = ? LIMIT 20').all('RUPTURA');
}
t1 = performance.now();
console.log(`Busca por status_ruptura (Index): ${((t1 - t0) / 50).toFixed(4)} ms`);

// 5. Busca por curva_abc (índice idx_cec_curva)
t0 = performance.now();
for (let i = 0; i < 50; i++) {
  db.prepare('SELECT * FROM compras_estoque_cache WHERE curva_abc = ? LIMIT 20').all('A');
}
t1 = performance.now();
console.log(`Busca por curva_abc (Index): ${((t1 - t0) / 50).toFixed(4)} ms`);
