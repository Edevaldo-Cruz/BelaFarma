/**
 * test_adversarial_reviewer_m1.js
 * Adversarial stress testing for M1 (Estoque Mínimo & Digifarma Sync)
 */

const assert = require('assert');
const db = require('../../backend/database');
const {
  formatarDataFirebird,
  calcularDemandaPonderada,
  determinarStatusRuptura,
  calcularEstoqueMinimo30Dias,
  sincronizarEstoqueMinimoDigifarma,
  sincronizarLoteEstoqueMinimoDigifarma,
  recalcularTodosEstoqueMinimo,
  listarProdutosAbaixoDoMinimo,
  obterResumoEstoqueMinimo
} = require('../../backend/services/compras-estoque.service');

async function testAdversarial() {
  console.log('=== TESTE ADVERSARIAL M1 (REVIEWER 1) ===\n');

  // Test 1: Extreme and pathological numbers in calculation
  console.log('1. Testando entradas patológicas na função matemática...');
  const t1 = calcularDemandaPonderada(-999, -500, -20);
  assert.strictEqual(t1.estoqueMinimoSugerido, 0, 'Valores negativos devem ser truncados para 0');

  const t2 = calcularDemandaPonderada(Infinity, NaN, undefined);
  // Infinity / NaN check
  assert.ok(typeof t2.estoqueMinimoSugerido === 'number');

  const t3 = calcularDemandaPonderada('100', '50', '15');
  assert.strictEqual(t3.estoqueMinimoSugerido, 95, 'Strings numéricas devem ser tratadas corretamente');

  const t4 = calcularDemandaPonderada(100, 50, 15, { pesoP1: 0.8, pesoP2: 0.2 });
  // (100*0.8 + 50*0.2) = 90 * 1.15 = 103.5 -> 104
  assert.strictEqual(t4.estoqueMinimoSugerido, 104, 'Pesos customizados devem funcionar');

  // Test 2: Curva A floor edge cases
  console.log('2. Testando piso de Curva A...');
  const tCurvaA_zero = calcularDemandaPonderada(0, 0, 15, { curvaAbc: 'A' });
  assert.strictEqual(tCurvaA_zero.estoqueMinimoSugerido, 0, 'Curva A sem vendas não deve ter piso forçado de 2');

  const tCurvaA_low = calcularDemandaPonderada(0.5, 0, 15, { curvaAbc: 'A' });
  assert.strictEqual(tCurvaA_low.estoqueMinimoSugerido, 2, 'Curva A com vendas baixas deve ter piso 2');

  // Test 3: Status matrix edge cases
  console.log('3. Testando matriz de status em fronteiras exatas...');
  assert.strictEqual(determinarStatusRuptura(0, 0), 'RUPTURA');
  assert.strictEqual(determinarStatusRuptura(-0.001, 10), 'RUPTURA');
  assert.strictEqual(determinarStatusRuptura(9.999, 10), 'ABAIXO_MINIMO');
  assert.strictEqual(determinarStatusRuptura(10, 10), 'NORMAL');
  assert.strictEqual(determinarStatusRuptura(24.999, 10), 'NORMAL');
  assert.strictEqual(determinarStatusRuptura(25, 10), 'EXCESSO');
  assert.strictEqual(determinarStatusRuptura(100, 0), 'NORMAL');

  // Test 4: SQL Injection resistance in filters
  console.log('4. Testando resistência a SQL Injection...');
  const sqli = await listarProdutosAbaixoDoMinimo({
    busca: "' OR 1=1 --",
    status: "' OR '1'='1",
    curvaAbc: "' OR '1'='1"
  });
  assert.ok(Array.isArray(sqli.produtos), 'Consulta deve retornar com segurança');

  // Test 5: Invalid product IDs in sync
  console.log('5. Testando IDs inválidos na sincronização...');
  const syncBad = await sincronizarEstoqueMinimoDigifarma('abc', 10);
  assert.strictEqual(syncBad.success, false);
  assert.strictEqual(syncBad.error, 'ID de produto inválido');

  const syncNegative = await sincronizarEstoqueMinimoDigifarma(-5, 10);
  assert.strictEqual(syncNegative.success, false);

  const syncBatchBad = await sincronizarLoteEstoqueMinimoDigifarma([
    { produtoId: null, estoqueMinimo: 10 },
    { produtoId: -1, estoqueMinimo: 5 }
  ]);
  assert.strictEqual(syncBatchBad.total, 2);
  assert.strictEqual(syncBatchBad.count, 0);
  assert.strictEqual(syncBatchBad.erros.length, 2);

  // Test 6: SQLite WAL Concurrency & High volume simulation
  console.log('6. Testando concorrência e alto volume no SQLite cache...');
  const items = [];
  for (let i = 80000; i < 80500; i++) {
    items.push({
      produto_id: i,
      descricao: `PRODUTO STRESS TEST ${i}`,
      ean: `789${i}`,
      categoria_id: 1,
      curva_abc: i % 3 === 0 ? 'A' : (i % 3 === 1 ? 'B' : 'C'),
      saldo: (i % 10) - 2, // some negative, some 0, some positive
      est_minimo_calculado: 10,
      est_minimo_digifarma: 5,
      vmd_ponderado: 0.33,
      vendas_30d: 10,
      vendas_31_60d: 5,
      custo_unitario: 12.5,
      ultima_compra_valor: 12.0,
      status_ruptura: ((i % 10) - 2) <= 0 ? 'RUPTURA' : (((i % 10) - 2) < 10 ? 'ABAIXO_MINIMO' : 'NORMAL'),
      margem_seguranca_aplicada: 15.0
    });
  }

  const upsertStmt = db.prepare(`
    INSERT OR REPLACE INTO compras_estoque_cache (
      produto_id, descricao, ean, categoria_id, curva_abc, saldo,
      est_minimo_calculado, est_minimo_digifarma, vmd_ponderado,
      vendas_30d, vendas_31_60d, custo_unitario, ultima_compra_valor,
      status_ruptura, margem_seguranca_aplicada, dias_sem_venda,
      sincronizado_em, atualizado_em
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, 0,
      null, datetime('now', 'localtime')
    )
  `);

  const tx = db.transaction((list) => {
    for (const item of list) {
      upsertStmt.run(
        item.produto_id, item.descricao, item.ean, item.categoria_id,
        item.curva_abc, item.saldo, item.est_minimo_calculado,
        item.est_minimo_digifarma, item.vmd_ponderado, item.vendas_30d,
        item.vendas_31_60d, item.custo_unitario, item.ultima_compra_valor,
        item.status_ruptura, item.margem_seguranca_aplicada
      );
    }
  });

  const tStart = Date.now();
  tx(items);
  const tEnd = Date.now();
  console.log(`   Inserção de 500 registros em lote no SQLite WAL: ${tEnd - tStart}ms`);
  assert.ok((tEnd - tStart) < 200, 'Inserção em lote de 500 itens deve levar menos de 200ms');

  // Test listing speed
  const tQueryStart = Date.now();
  const resList = await listarProdutosAbaixoDoMinimo({ limit: 100, apenasRuptura: true });
  const tQueryEnd = Date.now();
  console.log(`   Consulta de produtos em ruptura no SQLite: ${tQueryEnd - tQueryStart}ms (total: ${resList.total})`);
  assert.ok((tQueryEnd - tQueryStart) < 30, 'Consulta indexada deve levar menos de 30ms');

  // Clean up stress test data
  db.prepare('DELETE FROM compras_estoque_cache WHERE produto_id >= 80000 AND produto_id < 80500').run();

  console.log('\n✅ TODOS OS TESTES ADVERSARIAIS PASSARAM COM SUCESSO!\n');
}

testAdversarial().catch(err => {
  console.error('❌ Falha no teste adversarial:', err);
  process.exit(1);
});
