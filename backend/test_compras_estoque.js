/**
 * test_compras_estoque.js
 * Suíte de Testes Automatizados para o Módulo de Estoque Mínimo e Sincronização Firebird (Worker M1)
 * 
 * Cobertura Completa:
 * 1. Fórmula Matemática e Ponderação de Vendas (30-60d com pesos 0.65/0.35 + 15% margem)
 * 2. Casos Especiais (Histórico Zerado, Inatividade >90d, Produtos Inativos, Piso Curva A)
 * 3. Margens Customizadas (0%, 15%, 30%, 50%)
 * 4. Matriz de Status de Ruptura (RUPTURA, ABAIXO_MINIMO, NORMAL, EXCESSO)
 * 5. Fallback Gracioso de Cache SQLite na Inacessibilidade do Firebird
 * 6. Operações Atômicas de Sincronização Unitária e em Lote
 * 7. Listagem Filtrada e Paginada de Faltas/Rupturas com Cálculo de Reposição Financeira
 * 8. Resumo Consolidado de KPIs
 */

const assert = require('assert');
const path = require('path');
const db = require('./database');
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
} = require('./services/compras-estoque.service');

let passedTests = 0;
let failedTests = 0;

function runTest(testName, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${testName}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

async function runAsyncTest(testName, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${testName}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

console.log('\n=================================================================');
console.log('🧪 INICIANDO SUÍTE DE TESTES: ESTOQUE MÍNIMO & SYNC DIGIFARMA');
console.log('=================================================================\n');

// -------------------------------------------------------------
// GRUPO 1: CÁLCULO PONDERADO E MATEMÁTICA DA DEMANDA (R1 / F1)
// -------------------------------------------------------------
console.log('📦 [GRUPO 1] Matemática e Ponderação de Vendas (30 e 60 dias)');

runTest('1.1 Cálculo padrão ponderado (100 un em 30d, 50 un em 31-60d, margem 15%)', () => {
  // P1 = 100 * 0.65 = 65
  // P2 = 50 * 0.35 = 17.5
  // Demanda Ponderada = 82.5
  // VMD = 82.5 / 30 = 2.75
  // Demanda 30d com margem +15% = 82.5 * 1.15 = 94.875 -> ceil = 95
  const res = calcularDemandaPonderada(100, 50, 15);
  assert.strictEqual(res.vendas30d, 100);
  assert.strictEqual(res.vendas31_60d, 50);
  assert.strictEqual(res.vmdPonderado, 2.75);
  assert.strictEqual(res.demanda30d, 82.5);
  assert.strictEqual(res.margemSegurancaPercent, 15);
  assert.strictEqual(res.estoqueMinimoSugerido, 95);
});

runTest('1.2 Cálculo ponderado com margem zero (0%)', () => {
  // 82.5 * 1.0 = 82.5 -> ceil = 83
  const res = calcularDemandaPonderada(100, 50, 0);
  assert.strictEqual(res.estoqueMinimoSugerido, 83);
});

runTest('1.3 Cálculo ponderado com margem de 30%', () => {
  // 82.5 * 1.30 = 107.25 -> ceil = 108
  const res = calcularDemandaPonderada(100, 50, 30);
  assert.strictEqual(res.estoqueMinimoSugerido, 108);
});

runTest('1.4 Histórico zerado nos 60 dias (vendas30d = 0, vendas31_60d = 0)', () => {
  const res = calcularDemandaPonderada(0, 0, 15);
  assert.strictEqual(res.vmdPonderado, 0);
  assert.strictEqual(res.demanda30d, 0);
  assert.strictEqual(res.estoqueMinimoSugerido, 0);
});

runTest('1.5 Produto com mais de 90 dias sem vendas', () => {
  const res = calcularDemandaPonderada(10, 5, 15, { diasSemVenda: 95 });
  assert.strictEqual(res.vmdPonderado, 0);
  assert.strictEqual(res.estoqueMinimoSugerido, 0);
});

runTest('1.6 Produto inativo (ativo = false)', () => {
  const res = calcularDemandaPonderada(50, 30, 15, { ativo: false });
  assert.strictEqual(res.estoqueMinimoSugerido, 0);
  assert.strictEqual(res.demanda30d, 0);
});

runTest('1.7 Piso de segurança para produtos Curva A (cálculo < 2 unidades)', () => {
  // 1 venda em 30d, 0 em 31-60d: 1 * 0.65 = 0.65 * 1.15 = 0.7475 -> ceil = 1
  // Para Curva A, deve aplicar piso de 2 unidades
  const resCurvaA = calcularDemandaPonderada(1, 0, 15, { curvaAbc: 'A' });
  assert.strictEqual(resCurvaA.estoqueMinimoSugerido, 2);

  // Para Curva C com os mesmos dados, permanece 1 unidade
  const resCurvaC = calcularDemandaPonderada(1, 0, 15, { curvaAbc: 'C' });
  assert.strictEqual(resCurvaC.estoqueMinimoSugerido, 1);
});

runTest('1.8 Resiliência com entradas nulas, indefinidas ou NaN', () => {
  const res = calcularDemandaPonderada(null, undefined, 'invalid');
  assert.strictEqual(res.vendas30d, 0);
  assert.strictEqual(res.vendas31_60d, 0);
  assert.strictEqual(res.estoqueMinimoSugerido, 0);
});

// -------------------------------------------------------------
// GRUPO 2: MATRIZ DE CLASSIFICAÇÃO DE STATUS DE ESTOQUE (F3)
// -------------------------------------------------------------
console.log('\n🔍 [GRUPO 2] Matriz de Classificação de Ruptura e Saldo');

runTest('2.1 Status RUPTURA quando saldo é zero ou negativo', () => {
  assert.strictEqual(determinarStatusRuptura(0, 10), 'RUPTURA');
  assert.strictEqual(determinarStatusRuptura(-2, 10), 'RUPTURA');
  assert.strictEqual(determinarStatusRuptura(0, 0), 'RUPTURA');
});

runTest('2.2 Status ABAIXO_MINIMO quando saldo positivo é menor que o mínimo', () => {
  assert.strictEqual(determinarStatusRuptura(5, 10), 'ABAIXO_MINIMO');
  assert.strictEqual(determinarStatusRuptura(1, 2), 'ABAIXO_MINIMO');
});

runTest('2.3 Status NORMAL quando saldo atende ao mínimo sem excesso', () => {
  assert.strictEqual(determinarStatusRuptura(10, 10), 'NORMAL');
  assert.strictEqual(determinarStatusRuptura(15, 10), 'NORMAL');
  assert.strictEqual(determinarStatusRuptura(24, 10), 'NORMAL');
});

runTest('2.4 Status EXCESSO quando saldo é >= 2.5x o estoque mínimo', () => {
  assert.strictEqual(determinarStatusRuptura(25, 10), 'EXCESSO');
  assert.strictEqual(determinarStatusRuptura(50, 10), 'EXCESSO');
});

runTest('2.5 Status NORMAL quando mínimo é zero e saldo é positivo', () => {
  assert.strictEqual(determinarStatusRuptura(5, 0), 'NORMAL');
});

// -------------------------------------------------------------
// GRUPO 3: CACHE SQLITE E PERSISTÊNCIA EM MODO WAL
// -------------------------------------------------------------
console.log('\n💾 [GRUPO 3] Persistência no SQLite (compras_estoque_cache)');

runTest('3.1 Inserção e Leitura no compras_estoque_cache', () => {
  // Limpa registros de teste anteriores
  db.prepare('DELETE FROM compras_estoque_cache WHERE produto_id IN (99901, 99902, 99903)').run();

  const insertStmt = db.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, categoria_id, curva_abc, saldo,
      est_minimo_calculado, est_minimo_digifarma, vmd_ponderado,
      vendas_30d, vendas_31_60d, custo_unitario, ultima_compra_valor,
      status_ruptura, margem_seguranca_aplicada, dias_sem_venda,
      sincronizado_em, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    99901, 'DIPIRONA 500MG GTS 20ML TESTE', '7891234567890', 1, 'A', 0,
    30, 10, 0.85, 30, 20, 4.50, 4.20, 'RUPTURA', 15.0, 0,
    null, new Date().toISOString()
  );

  insertStmt.run(
    99902, 'PARACETAMOL 750MG 20CP TESTE', '7891234567891', 1, 'B', 5,
    20, 20, 0.55, 20, 15, 6.00, 5.80, 'ABAIXO_MINIMO', 15.0, 0,
    new Date().toISOString(), new Date().toISOString()
  );

  insertStmt.run(
    99903, 'OMEPRAZOL 20MG 28CAP TESTE', '7891234567892', 2, 'C', 50,
    15, 15, 0.40, 15, 10, 8.00, 7.90, 'EXCESSO', 15.0, 0,
    new Date().toISOString(), new Date().toISOString()
  );

  const row = db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(99901);
  assert.ok(row, 'Registro deve existir no SQLite');
  assert.strictEqual(row.produto_id, 99901);
  assert.strictEqual(row.status_ruptura, 'RUPTURA');
  assert.strictEqual(row.est_minimo_calculado, 30);
});

// -------------------------------------------------------------
// GRUPO 4: CONSULTAS FILTRADAS, PAGINAÇÃO E REPOSIÇÃO (F3)
// -------------------------------------------------------------
console.log('\n📊 [GRUPO 4] Listagem de Faltas, Rupturas e Necessidade de Reposição');

async function testarListagem() {
  await runAsyncTest('4.1 Listagem de produtos abaixo do mínimo com cálculo financeiro', async () => {
    const res = await listarProdutosAbaixoDoMinimo({ busca: 'TESTE' });
    assert.ok(res.produtos, 'Deve retornar array de produtos');
    assert.ok(typeof res.total === 'number', 'Total deve ser numérico');
    assert.ok(typeof res.valorTotalReposicao === 'number', 'Valor de reposição deve ser numérico');

    const item99901 = res.produtos.find(p => p.produtoId === 99901);
    assert.ok(item99901, 'Item 99901 deve constar na listagem de atenção');
    assert.strictEqual(item99901.statusRuptura, 'RUPTURA');
    assert.strictEqual(item99901.diferencaEstoque, 30); // 30 - 0 = 30
    assert.strictEqual(item99901.valorNecessarioReposicao, 135.00); // 30 * 4.50 = 135.00

    const item99902 = res.produtos.find(p => p.produtoId === 99902);
    assert.ok(item99902, 'Item 99902 deve constar na listagem');
    assert.strictEqual(item99902.statusRuptura, 'ABAIXO_MINIMO');
    assert.strictEqual(item99902.diferencaEstoque, 15); // 20 - 5 = 15
    assert.strictEqual(item99902.valorNecessarioReposicao, 90.00); // 15 * 6.00 = 90.00
  });

  await runAsyncTest('4.2 Filtro exclusivo de ruptura (apenasRuptura = true)', async () => {
    const res = await listarProdutosAbaixoDoMinimo({ apenasRuptura: true });
    assert.ok(res.produtos.every(p => p.statusRuptura === 'RUPTURA'), 'Todos os itens devem ser RUPTURA');
    assert.ok(res.produtos.some(p => p.produtoId === 99901), '99901 deve estar presente');
    assert.ok(!res.produtos.some(p => p.produtoId === 99902), '99902 não deve estar presente');
  });

  await runAsyncTest('4.3 Filtro por Curva ABC (curvaAbc = A)', async () => {
    const res = await listarProdutosAbaixoDoMinimo({ curvaAbc: 'A' });
    assert.ok(res.produtos.every(p => p.curvaAbc === 'A'), 'Todos os itens devem ser Curva A');
    assert.ok(res.produtos.some(p => p.produtoId === 99901));
  });

  await runAsyncTest('4.4 Busca textual por descrição e EAN', async () => {
    const resDesc = await listarProdutosAbaixoDoMinimo({ busca: 'DIPIRONA' });
    assert.ok(resDesc.produtos.some(p => p.produtoId === 99901));

    const resEan = await listarProdutosAbaixoDoMinimo({ busca: '7891234567891' });
    assert.ok(resEan.produtos.some(p => p.produtoId === 99902));
  });

  await runAsyncTest('4.5 Resumo consolidado de KPIs (obterResumoEstoqueMinimo)', async () => {
    const resumo = obterResumoEstoqueMinimo();
    assert.ok(resumo.totalItens >= 3, 'Deve contabilizar itens de teste');
    assert.ok(resumo.totalRuptura >= 1, 'Deve ter ao menos 1 ruptura');
    assert.ok(resumo.totalAbaixoMinimo >= 1, 'Deve ter ao menos 1 abaixo do mínimo');
    assert.ok(resumo.valorTotalReposicao >= 225.00, 'Valor total deve somar as reposições');
  });
}

// -------------------------------------------------------------
// GRUPO 5: SINCRONIZAÇÃO E FALLBACK RESILIENTE (F2 / R1)
// -------------------------------------------------------------
console.log('\n🔄 [GRUPO 5] Sincronização e Fallback Gracioso');

async function testarSincronizacaoEFallback() {
  await runAsyncTest('5.1 Cálculo unitário com fallback para cache local quando Firebird offline', async () => {
    // Produto 99901 existe apenas no cache SQLite local
    const res = await calcularEstoqueMinimo30Dias(99901, 15);
    assert.ok(res, 'Deve retornar resultado mesmo com Firebird offline');
    assert.strictEqual(res.produtoId, 99901);
    assert.strictEqual(res.curvaAbc, 'A');
    assert.strictEqual(res.statusRuptura, 'RUPTURA');
    assert.strictEqual(res.fromCache, true, 'Deve indicar que o resultado veio do cache');
  });

  await runAsyncTest('5.2 Sincronização unitária em cache local com tratamento de erro gracioso', async () => {
    // Tentativa de sync com Firebird: se Firebird estiver offline, retorna erro estruturado sem crash
    const res = await sincronizarEstoqueMinimoDigifarma(99901, 35);
    assert.ok(res, 'Deve retornar objeto estruturado');
    assert.strictEqual(res.produtoId, 99901);
    assert.strictEqual(res.estoqueMinimo, 35);
    // Se Firebird online: success = true; se offline: success = false com mensagem de erro descritiva
    if (!res.success) {
      assert.ok(typeof res.error === 'string', 'Mensagem de erro deve ser string explicativa');
    }
  });

  await runAsyncTest('5.3 Sincronização em lote resiliente', async () => {
    const lista = [
      { produtoId: 99901, estoqueMinimo: 35 },
      { produtoId: 99902, estoqueMinimo: 25 },
      { produtoId: 'invalido', estoqueMinimo: 10 }
    ];
    const resLote = await sincronizarLoteEstoqueMinimoDigifarma(lista);
    assert.ok(resLote, 'Deve retornar resposta estruturada');
    assert.strictEqual(resLote.total, 3);
    assert.ok(resLote.erros.some(e => e.produtoId === 'invalido'), 'Deve capturar ID inválido nos erros');
  });

  await runAsyncTest('5.4 Formatação de datas para Firebird', async () => {
    const testDate = new Date(2026, 7, 29, 14, 30, 0); // 29 de Agosto de 2026 14:30:00
    const str = formatarDataFirebird(testDate);
    assert.strictEqual(str, '2026-08-29 14:30:00');
  });

  // Limpeza de registros de teste
  db.prepare('DELETE FROM compras_estoque_cache WHERE produto_id IN (99901, 99902, 99903)').run();
}

async function main() {
  await testarListagem();
  await testarSincronizacaoEFallback();

  console.log('\n=================================================================');
  console.log(`🏁 SUÍTE DE TESTES FINALIZADA`);
  console.log(`   Total Aprovados: ${passedTests}`);
  console.log(`   Total Falhas:    ${failedTests}`);
  console.log('=================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Erro fatal na execução dos testes:', err);
  process.exit(1);
});
