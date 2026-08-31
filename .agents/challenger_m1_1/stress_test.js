/**
 * stress_test.js
 * Suíte de Testes de Estresse Adversarial e Casos Extremos (Challenger 1 - Milestone M1)
 * 
 * Cobertura de Desafio:
 * 1. Margens Extremas & Boundary Value Analysis (-500%, -100%, -50%, 0%, 1000%, 10000%, NaN, strings, Infinity)
 * 2. Carga Massiva de 10.000 Produtos (Benchmark de CPU, Throughput do Bulk-Upsert SQLite, Latência Paginada e Agregações)
 * 3. Entradas Corrompidas, Malformadas & Ataques de SQL Injection (Busca, Filtros, Curva ABC, OrderBy, Limites, Objetos Circulares)
 * 4. Simulação de Quedas de Conexão e Desconexão Abrupta no Meio do Lote Firebird (Network Fault Simulation & Fallback)
 * 5. Limpeza de Dados Sintéticos e Validação de Integridade Forense (PRAGMA integrity_check)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const assert = require('assert');
const path = require('path');

// Importa módulos do backend
const db = require('../../backend/database');
const digifarmaService = require('../../backend/services/digifarma.service');
let comprasEstoqueService = require('../../backend/services/compras-estoque.service');

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
} = comprasEstoqueService;

// Helper para re-instanciar compras-estoque.service com mock de Firebird
function getFreshComprasEstoqueService(mockQueryDigifarma) {
  const digifarmaPath = require.resolve('../../backend/services/digifarma.service');
  const estoquePath = require.resolve('../../backend/services/compras-estoque.service');

  if (mockQueryDigifarma) {
    require.cache[digifarmaPath] = {
      id: digifarmaPath,
      filename: digifarmaPath,
      loaded: true,
      exports: {
        ...require('../../backend/services/digifarma.service'),
        queryDigifarma: mockQueryDigifarma
      }
    };
  } else {
    delete require.cache[digifarmaPath];
  }
  delete require.cache[estoquePath];
  return require('../../backend/services/compras-estoque.service');
}

// Contadores de teste
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function runSyncTest(testId, testName, fn) {
  const start = process.hrtime.bigint();
  try {
    fn();
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`  ✅ [PASS] ${testId} - ${testName} (${durationMs.toFixed(2)}ms)`);
    passedTests++;
    testResults.push({ id: testId, name: testName, status: 'PASS', durationMs });
  } catch (err) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.error(`  ❌ [FAIL] ${testId} - ${testName} (${durationMs.toFixed(2)}ms)`);
    console.error(`     Erro: ${err.message}`);
    failedTests++;
    testResults.push({ id: testId, name: testName, status: 'FAIL', durationMs, error: err.message });
  }
}

async function runAsyncTest(testId, testName, fn) {
  const start = process.hrtime.bigint();
  try {
    await fn();
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`  ✅ [PASS] ${testId} - ${testName} (${durationMs.toFixed(2)}ms)`);
    passedTests++;
    testResults.push({ id: testId, name: testName, status: 'PASS', durationMs });
  } catch (err) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.error(`  ❌ [FAIL] ${testId} - ${testName} (${durationMs.toFixed(2)}ms)`);
    console.error(`     Erro: ${err.message}`);
    failedTests++;
    testResults.push({ id: testId, name: testName, status: 'FAIL', durationMs, error: err.message });
  }
}

console.log('\n======================================================================');
console.log('⚡ SUÍTE DE ESTRESSE ADVERSARIAL & CASOS EXTREMOS (CHALLENGER 1 - M1)');
console.log('======================================================================\n');

// =====================================================================
// TIER 1: MARGENS DE SEGURANÇA EXTREMAS & ANÁLISE DE VALOR LIMITE
// =====================================================================
console.log('📌 [TIER 1] Margens de Segurança Extremas & Boundary Value Analysis');

runSyncTest('T1.1', 'Margem negativa extrema (-500%): garantia de piso não-negativo (Math.max(0, ...))', () => {
  const res = calcularDemandaPonderada(100, 50, -500);
  assert.strictEqual(res.estoqueMinimoSugerido, 0, 'Estoque sugerido não pode ser negativo');
  assert.strictEqual(res.vmdPonderado, 2.75);
  assert.strictEqual(res.demanda30d, 82.5);
});

runSyncTest('T1.2', 'Margem de -100%: fator multiplicador 0 resulta em estoque mínimo 0', () => {
  const res = calcularDemandaPonderada(100, 50, -100);
  assert.strictEqual(res.estoqueMinimoSugerido, 0);
});

runSyncTest('T1.3', 'Margem de -50%: reduz a demanda calculada para 50%', () => {
  // 82.5 * (1 - 0.5) = 41.25 -> ceil = 42
  const res = calcularDemandaPonderada(100, 50, -50);
  assert.strictEqual(res.estoqueMinimoSugerido, 42);
});

runSyncTest('T1.4', 'Margem de 0%: cálculo puro da demanda ponderada sem acréscimo', () => {
  // 82.5 * 1.0 = 82.5 -> ceil = 83
  const res = calcularDemandaPonderada(100, 50, 0);
  assert.strictEqual(res.estoqueMinimoSugerido, 83);
});

runSyncTest('T1.5', 'Margem ultra-elevada (+1000%): fator 11x comporta números gigantes sem quebrar', () => {
  // 82.5 * 11 = 907.5 -> ceil = 908
  const res = calcularDemandaPonderada(100, 50, 1000);
  assert.strictEqual(res.estoqueMinimoSugerido, 908);
});

runSyncTest('T1.6', 'Margem extrema (+10000%): fator 101x cálculo com precisão', () => {
  // 82.5 * 101 = 8332.5 -> ceil = 8333
  const res = calcularDemandaPonderada(100, 50, 10000);
  assert.strictEqual(res.estoqueMinimoSugerido, 8333);
});

runSyncTest('T1.7', 'Margem fracionária de alta precisão (15.5555%)', () => {
  // 82.5 * (1 + 0.155555) = 82.5 * 1.155555 = 95.3332875 -> ceil = 96
  const res = calcularDemandaPonderada(100, 50, 15.5555);
  assert.strictEqual(res.estoqueMinimoSugerido, 96);
});

runSyncTest('T1.8', 'Margens malformadas (strings numéricas, NaN, objetos, arrays, null)', () => {
  // String "25" -> convertida para 25
  const resStr = calcularDemandaPonderada(100, 50, "25");
  assert.strictEqual(resStr.estoqueMinimoSugerido, 104);

  // String inválida "invalido" -> fallback para padrão 15%
  const resInvalid = calcularDemandaPonderada(100, 50, "invalido");
  assert.strictEqual(resInvalid.estoqueMinimoSugerido, 95);

  // NaN -> fallback para 15%
  const resNaN = calcularDemandaPonderada(100, 50, NaN);
  assert.strictEqual(resNaN.estoqueMinimoSugerido, 95);

  // Objeto vazio -> fallback para 15%
  const resObj = calcularDemandaPonderada(100, 50, {});
  assert.strictEqual(resObj.estoqueMinimoSugerido, 95);

  // null -> Number(null) em JS avalia como 0 (margem 0%), gerando 83
  const resNull = calcularDemandaPonderada(100, 50, null);
  assert.strictEqual(resNull.estoqueMinimoSugerido, 83);
});

runSyncTest('T1.9', 'Vendas com valores negativos e corrompidos (deve truncar para 0)', () => {
  const resNeg = calcularDemandaPonderada(-50, -20, 15);
  assert.strictEqual(resNeg.vendas30d, 0);
  assert.strictEqual(resNeg.vendas31_60d, 0);
  assert.strictEqual(resNeg.estoqueMinimoSugerido, 0);
});

runSyncTest('T1.10', 'Vendas massivas de 1.000.000 de unidades (sem overflow numérico)', () => {
  // 1.000.000 * 0.65 + 500.000 * 0.35 = 650.000 + 175.000 = 825.000
  // 825.000 * 1.15 = 948.750
  const resBig = calcularDemandaPonderada(1000000, 500000, 15);
  assert.strictEqual(resBig.estoqueMinimoSugerido, 948750);
});

runSyncTest('T1.11', 'Pesos customizados assimétricos e extremos', () => {
  // Apenas vendas dos últimos 30 dias (pesoP1 = 1.0, pesoP2 = 0)
  const resP1Only = calcularDemandaPonderada(100, 50, 15, { pesoP1: 1.0, pesoP2: 0.0 });
  // Demanda = 100 * 1.15 = 115
  assert.strictEqual(resP1Only.estoqueMinimoSugerido, 115);

  // Apenas vendas de 31-60 dias (pesoP1 = 0, pesoP2 = 1.0)
  const resP2Only = calcularDemandaPonderada(100, 50, 15, { pesoP1: 0.0, pesoP2: 1.0 });
  // Demanda = 50 * 1.15 = 57.5 -> ceil = 58
  assert.strictEqual(resP2Only.estoqueMinimoSugerido, 58);
});

runSyncTest('T1.12', 'Piso de segurança Curva A com vendas fracionárias mínimas', () => {
  // Venda mínima de 0.1 unidade em 30d: 0.1 * 0.65 = 0.065 * 1.15 = 0.07475 -> ceil = 1
  // Para Curva A deve obrigatoriamente forçar o piso de 2 unidades
  const resPiso = calcularDemandaPonderada(0.1, 0, 15, { curvaAbc: 'A' });
  assert.strictEqual(resPiso.estoqueMinimoSugerido, 2);
});

// =====================================================================
// TIER 2: VOLUME MACIÇO DE 10.000 PRODUTOS (BENCHMARKS & SCALE)
// =====================================================================
console.log('\n📊 [TIER 2] Carga Massiva de 10.000 Produtos (Scale & Throughput & Latency)');

const TEST_BASE_ID = 800000;
const TOTAL_ITEMS = 10000;
const syntheticProducts = [];

runSyncTest('T2.1', `Geração em memória de ${TOTAL_ITEMS} produtos sintéticos variados`, () => {
  const curvas = ['A', 'B', 'C'];
  for (let i = 0; i < TOTAL_ITEMS; i++) {
    const pId = TEST_BASE_ID + i;
    const curva = curvas[i % 3];
    const v30 = (i % 200); // 0 a 199
    const v60 = ((i * 3) % 150); // 0 a 149
    const saldo = (i % 80); // 0 a 79
    const custo = parseFloat((2.50 + ((i % 100) * 1.25)).toFixed(2));
    const ultCompra = parseFloat((custo * 0.95).toFixed(2));
    const estMinimoDigifarma = (i % 50);

    syntheticProducts.push({
      produto_id: pId,
      descricao: `PRODUTO STRESS TESTE ${pId} ${curva}`,
      ean: `789${String(pId).padStart(10, '0')}`,
      categoria_id: (i % 15) + 1,
      curva_abc: curva,
      saldo,
      est_minimo_digifarma: estMinimoDigifarma,
      vendas_30d: v30,
      vendas_31_60d: v60,
      custo_unitario: custo,
      ultima_compra_valor: ultCompra
    });
  }
  assert.strictEqual(syntheticProducts.length, TOTAL_ITEMS);
});

let calculatedResults = [];

runSyncTest('T2.2', `Benchmark de CPU: Cálculo da demanda ponderada para ${TOTAL_ITEMS} itens (< 500ms)`, () => {
  const t0 = Date.now();
  calculatedResults = syntheticProducts.map(p => {
    const calc = calcularDemandaPonderada(p.vendas_30d, p.vendas_31_60d, 15, {
      curvaAbc: p.curva_abc,
      ativo: true
    });
    const status = determinarStatusRuptura(p.saldo, calc.estoqueMinimoSugerido);
    return {
      ...p,
      est_minimo_calculado: calc.estoqueMinimoSugerido,
      vmd_ponderado: calc.vmdPonderado,
      status_ruptura: status,
      margem_seguranca_aplicada: 15.0
    };
  });
  const elapsed = Date.now() - t0;
  const throughput = (TOTAL_ITEMS / (elapsed / 1000)).toFixed(0);
  console.log(`     ⚡ CPU: ${TOTAL_ITEMS} cálculos concluídos em ${elapsed}ms (${throughput} itens/segundo)`);
  assert.ok(elapsed < 500, `Cálculo de CPU demorou ${elapsed}ms, acima do teto de 500ms`);
});

runSyncTest('T2.3', `Benchmark de Persistência: Bulk-Upsert SQLite de ${TOTAL_ITEMS} registros via transação (< 2500ms)`, () => {
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
      datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `);

  const tx = db.transaction((items) => {
    for (const item of items) {
      upsertStmt.run(
        item.produto_id,
        item.descricao,
        item.ean,
        item.categoria_id,
        item.curva_abc,
        item.saldo,
        item.est_minimo_calculado,
        item.est_minimo_digifarma,
        item.vmd_ponderado,
        item.vendas_30d,
        item.vendas_31_60d,
        item.custo_unitario,
        item.ultima_compra_valor,
        item.status_ruptura,
        item.margem_seguranca_aplicada
      );
    }
  });

  const t0 = Date.now();
  tx(calculatedResults);
  const elapsed = Date.now() - t0;
  const throughput = (TOTAL_ITEMS / (elapsed / 1000)).toFixed(0);
  console.log(`     💾 DB: ${TOTAL_ITEMS} itens inseridos em ${elapsed}ms (${throughput} itens/segundo)`);
  assert.ok(elapsed < 2500, `Bulk-upsert demorou ${elapsed}ms, acima do limite de 2500ms`);

  // Valida contagem real no banco
  const countRow = db.prepare(`SELECT COUNT(*) as c FROM compras_estoque_cache WHERE produto_id >= ? AND produto_id < ?`).get(TEST_BASE_ID, TEST_BASE_ID + TOTAL_ITEMS);
  assert.strictEqual(countRow.c, TOTAL_ITEMS, 'Todos os 10.000 itens devem existir na tabela');
});

// Sub-benchmarks de leitura em cima da base de 10k
async function runScaleReadTests() {
  await runAsyncTest('T2.4.1', 'Latência de Leitura Paginada: listarProdutosAbaixoDoMinimo (limit: 100) (< 100ms)', async () => {
    const t0 = Date.now();
    const res = await listarProdutosAbaixoDoMinimo({ limit: 100, offset: 0 });
    const elapsed = Date.now() - t0;
    console.log(`     ⏱️  Leitura paginada concluída em ${elapsed}ms (Itens retornados: ${res.produtos.length}, Total: ${res.total})`);
    assert.ok(res.produtos.length > 0);
    assert.ok(elapsed < 100, `Leitura paginada demorou ${elapsed}ms, acima do limite de 100ms`);
  });

  await runAsyncTest('T2.4.2', 'Latência de Leitura com Filtro RUPTURA (< 100ms)', async () => {
    const t0 = Date.now();
    const res = await listarProdutosAbaixoDoMinimo({ apenasRuptura: true, limit: 100 });
    const elapsed = Date.now() - t0;
    console.log(`     ⏱️  Filtro ruptura concluído em ${elapsed}ms (Total em ruptura: ${res.totalRuptura})`);
    assert.ok(res.produtos.every(p => p.statusRuptura === 'RUPTURA'));
    assert.ok(elapsed < 100, `Filtro demorou ${elapsed}ms, acima do limite de 100ms`);
  });

  await runAsyncTest('T2.4.3', 'Latência com Múltiplos Filtros Combinados + Ordenação Financeira (< 100ms)', async () => {
    const t0 = Date.now();
    const res = await listarProdutosAbaixoDoMinimo({
      curvaAbc: 'A',
      busca: 'PRODUTO STRESS',
      categoriaId: 3,
      orderBy: 'valor_reposicao_desc',
      limit: 50
    });
    const elapsed = Date.now() - t0;
    console.log(`     ⏱️  Filtros combinados concluídos em ${elapsed}ms (Total encontrado: ${res.total})`);
    assert.ok(elapsed < 100, `Consulta demorou ${elapsed}ms, acima do limite de 100ms`);
    if (res.produtos.length > 1) {
      assert.ok(res.produtos[0].valorNecessarioReposicao >= res.produtos[1].valorNecessarioReposicao);
    }
  });

  await runAsyncTest('T2.4.4', 'Latência de Paginação Profunda (offset: 5000, limit: 50) (< 200ms)', async () => {
    const t0 = Date.now();
    const res = await listarProdutosAbaixoDoMinimo({ limit: 50, offset: 5000 });
    const elapsed = Date.now() - t0;
    console.log(`     ⏱️  Paginação profunda concluída em ${elapsed}ms`);
    assert.ok(elapsed < 200, `Paginação demorou ${elapsed}ms, acima do limite de 200ms`);
  });

  await runAsyncTest('T2.5', 'Latência de Agregação Global: obterResumoEstoqueMinimo sobre catálogo massivo de 74k itens (< 80ms)', async () => {
    const t0 = Date.now();
    const resumo = obterResumoEstoqueMinimo();
    const elapsed = Date.now() - t0;
    console.log(`     ⏱️  Resumo global concluído em ${elapsed}ms (Total Itens: ${resumo.totalItens}, Reposição Total: R$ ${resumo.valorTotalReposicao})`);
    assert.ok(resumo.totalItens >= 10000);
    assert.ok(resumo.totalRuptura > 0);
    assert.ok(resumo.valorTotalReposicao > 0);
    assert.ok(elapsed < 80, `Agregação demorou ${elapsed}ms, acima do limite de 80ms`);
  });
}

// =====================================================================
// TIER 3: ENTRADAS CORROMPIDAS, MALFORMADAS & SQL INJECTION ADVERSARIAL
// =====================================================================
console.log('\n🛡️ [TIER 3] Entradas Corrompidas, Malformadas & SQL Injection Adversarial');

async function runAdversarialSecurityTests() {
  await runAsyncTest('T3.1.1', `SQL Injection em 'busca': "' OR '1'='1' -- " não deve burlar filtros`, async () => {
    const res = await listarProdutosAbaixoDoMinimo({ busca: "' OR '1'='1' -- " });
    assert.ok(Array.isArray(res.produtos));
    assert.strictEqual(res.total, 0, 'Injeção literal não deve corresponder a produtos reais');
  });

  await runAsyncTest('T3.1.2', `SQL Injection Destrutiva em 'busca': "'; DROP TABLE compras_estoque_cache; --"`, async () => {
    const res = await listarProdutosAbaixoDoMinimo({ busca: "'; DROP TABLE compras_estoque_cache; --" });
    assert.ok(Array.isArray(res.produtos));
    assert.strictEqual(res.total, 0);

    // Confirma que a tabela continua existindo e intacta
    const check = db.prepare(`SELECT count(*) as c FROM compras_estoque_cache`).get();
    assert.ok(check.c >= 10000, 'Tabela compras_estoque_cache deve permanecer intacta');
  });

  await runAsyncTest('T3.1.3', `SQL Injection em 'curvaAbc': "A' OR '1'='1"`, async () => {
    const res = await listarProdutosAbaixoDoMinimo({ curvaAbc: "A' OR '1'='1" });
    assert.ok(Array.isArray(res.produtos));
    assert.strictEqual(res.total, 0, 'Curva maliciosa não deve retornar registros');
  });

  await runAsyncTest('T3.1.4', `SQL Injection em 'status': "RUPTURA' OR '1'='1"`, async () => {
    const res = await listarProdutosAbaixoDoMinimo({ status: "RUPTURA' OR '1'='1" });
    assert.ok(Array.isArray(res.produtos));
    assert.strictEqual(res.total, 0);
  });

  await runAsyncTest('T3.1.5', `SQL Injection em 'categoriaId': "1 OR 1=1" e tipos inválidos (NaN, null)`, async () => {
    const res = await listarProdutosAbaixoDoMinimo({ categoriaId: "1 OR 1=1" });
    assert.ok(Array.isArray(res.produtos));

    const resNaN = await listarProdutosAbaixoDoMinimo({ categoriaId: "invalido" });
    assert.ok(Array.isArray(resNaN.produtos));
  });

  await runAsyncTest('T3.1.6', `SQL Injection em 'orderBy': bypass de whitelist "saldo; DROP TABLE compras_estoque_cache;"`, async () => {
    const res = await listarProdutosAbaixoDoMinimo({ orderBy: "saldo; DROP TABLE compras_estoque_cache; --" });
    assert.ok(Array.isArray(res.produtos));
    const check = db.prepare(`SELECT count(*) as c FROM compras_estoque_cache`).get();
    assert.ok(check.c >= 10000);
  });

  await runAsyncTest('T3.1.7', `Parâmetros 'limit' e 'offset' com valores negativos, astronômicos e corrompidos`, async () => {
    const resNeg = await listarProdutosAbaixoDoMinimo({ limit: -100, offset: -50 });
    assert.strictEqual(resNeg.limit, 1);
    assert.strictEqual(resNeg.offset, 0);
    assert.strictEqual(resNeg.produtos.length, 1);

    const resBig = await listarProdutosAbaixoDoMinimo({ limit: 9999999 });
    assert.strictEqual(resBig.limit, 1000);

    const resStr = await listarProdutosAbaixoDoMinimo({ limit: "invalido", offset: "invalido" });
    assert.strictEqual(resStr.limit, 100);
    assert.strictEqual(resStr.offset, 0);
  });

  await runAsyncTest('T3.2', 'Objetos circulares e estruturas anômalas não causam crash por recursão', async () => {
    const circular = { foo: 'bar' };
    circular.self = circular;

    const resCalc = calcularDemandaPonderada(100, 50, 15, circular);
    assert.strictEqual(resCalc.estoqueMinimoSugerido, 95);

    const resList = await listarProdutosAbaixoDoMinimo(circular);
    assert.ok(Array.isArray(resList.produtos));
  });

  await runAsyncTest('T3.3', 'Entradas malformadas em sincronizarLoteEstoqueMinimoDigifarma (Detecção de Robustez vs Crash)', async () => {
    // Casos não-array
    const resNull = await sincronizarLoteEstoqueMinimoDigifarma(null);
    assert.strictEqual(resNull.total, 0);
    assert.strictEqual(resNull.count, 0);

    const resObj = await sincronizarLoteEstoqueMinimoDigifarma({ foo: 'bar' });
    assert.strictEqual(resObj.total, 0);

    // Array com elementos válidos misturados com IDs inválidos
    const listaCorrompida = [
      { produtoId: "abc", estoqueMinimo: 20 },
      { produtoId: -50, estoqueMinimo: 10 },
      { produtoId: 0, estoqueMinimo: 0 },
      { produtoId: "999999", estoqueMinimo: "invalid_min" }
    ];

    const resLote = await sincronizarLoteEstoqueMinimoDigifarma(listaCorrompida);
    assert.strictEqual(resLote.total, 4);
    assert.ok(resLote.erros.length >= 3, 'Deve identificar e capturar itens inválidos nos erros');
  });

  await runAsyncTest('T3.4', 'Validação de ID em calcularEstoqueMinimo30Dias (rejeição com erro descritivo)', async () => {
    let errNegative = null;
    try {
      await calcularEstoqueMinimo30Dias(-1);
    } catch (e) {
      errNegative = e;
    }
    assert.ok(errNegative, 'Deve lançar erro para ID negativo');
    assert.ok(errNegative.message.includes('inválido'));

    let errString = null;
    try {
      await calcularEstoqueMinimo30Dias('abc');
    } catch (e) {
      errString = e;
    }
    assert.ok(errString, 'Deve lançar erro para ID não numérico');
  });
}

// =====================================================================
// TIER 4: SIMULAÇÃO DE QUEDAS DE CONEXÃO & FALHAS DE REDE (FAULT INJECTION)
// =====================================================================
console.log('\n🔌 [TIER 4] Simulação de Quedas de Conexão e Desconexão Abrupta no Meio do Lote');

async function runNetworkFaultSimulationTests() {
  await runAsyncTest('T4.1', 'Simulação de Desconexão Abrupta no Meio do Lote (Falha no 4º item de 10)', async () => {
    let callCount = 0;
    const mockQueryDigifarma = async (sql, params, timeout) => {
      callCount++;
      if (callCount <= 3) {
        return [{ PROD_ESTMINIMO: params[0] }];
      } else {
        throw new Error('ETIMEDOUT: Connection reset by peer (Firebird server disconnected)');
      }
    };

    const freshService = getFreshComprasEstoqueService(mockQueryDigifarma);

    const lote = [
      { produtoId: 800001, estoqueMinimo: 10 },
      { produtoId: 800002, estoqueMinimo: 15 },
      { produtoId: 800003, estoqueMinimo: 20 },
      { produtoId: 800004, estoqueMinimo: 25 },
      { produtoId: 800005, estoqueMinimo: 30 },
      { produtoId: 800006, estoqueMinimo: 35 },
      { produtoId: 800007, estoqueMinimo: 40 },
      { produtoId: 800008, estoqueMinimo: 45 },
      { produtoId: 800009, estoqueMinimo: 50 },
      { produtoId: 800010, estoqueMinimo: 55 }
    ];

    const res = await freshService.sincronizarLoteEstoqueMinimoDigifarma(lote);

    // Restaura service padrão
    getFreshComprasEstoqueService(null);

    assert.strictEqual(res.total, 10);
    assert.strictEqual(res.count, 3, 'Exatamente os 3 primeiros itens devem ter sido confirmados');
    assert.strictEqual(res.erros.length, 7, 'Os 7 itens após a queda de conexão devem ser registrados nos erros');
    assert.strictEqual(res.success, false, 'Status global do lote deve indicar que houve erros parciais');
    assert.ok(res.erros[0].error.includes('ETIMEDOUT'), 'Mensagem de erro deve conter o motivo da falha de rede');

    // Valida que o SQLite local foi sincronizado apenas para os 3 itens bem-sucedidos
    const item3 = db.prepare('SELECT est_minimo_digifarma, sincronizado_em FROM compras_estoque_cache WHERE produto_id = ?').get(800003);
    assert.strictEqual(item3.est_minimo_digifarma, 20);

    const item4 = db.prepare('SELECT est_minimo_digifarma FROM compras_estoque_cache WHERE produto_id = ?').get(800004);
    assert.notStrictEqual(item4.est_minimo_digifarma, 25, 'Item 4 falhou no Firebird e não deve ter sido sincronizado');
  });

  await runAsyncTest('T4.2', 'Fallback para Cache Local durante Indisponibilidade Total do Firebird', async () => {
    const mockQueryDigifarma = async () => {
      throw new Error('ECONNREFUSED 192.168.1.10:3050 - Servidor do Digifarma Offline ou Inacessível.');
    };

    const freshService = getFreshComprasEstoqueService(mockQueryDigifarma);

    // Consulta de produto existente no cache (800001)
    const res = await freshService.calcularEstoqueMinimo30Dias(800001, 15);

    // Restaura service padrão
    getFreshComprasEstoqueService(null);

    assert.ok(res, 'Deve responder através do cache local sem lançar erro fatal');
    assert.strictEqual(res.produtoId, 800001);
    assert.strictEqual(res.fromCache, true, 'Flag fromCache deve ser true indicando operação em contingência');
    assert.ok(typeof res.estoqueMinimoSugerido === 'number');
  });

  await runAsyncTest('T4.3', 'Recálculo Global com Fallback Completo quando Firebird cai na inicialização', async () => {
    const mockQueryDigifarma = async () => {
      throw new Error('Firebird Network Timeout (60000ms)');
    };

    const freshService = getFreshComprasEstoqueService(mockQueryDigifarma);

    const resRecalc = await freshService.recalcularTodosEstoqueMinimo(15, { autoSyncDigifarma: false });

    // Restaura service padrão
    getFreshComprasEstoqueService(null);

    assert.ok(resRecalc.success, 'Recálculo deve ser bem-sucedido via fallback de cache');
    assert.strictEqual(resRecalc.fromCacheFallback, true, 'Deve sinalizar fromCacheFallback = true');
    assert.ok(resRecalc.totalProcessados >= 10000, 'Deve ter processado os 10k produtos do cache local');
  });
}

// =====================================================================
// TIER 5: LIMPEZA DE DADOS SINTÉTICOS & INTEGRIDADE FORENSE DO BANCO
// =====================================================================
console.log('\n🧹 [TIER 5] Limpeza de Dados Sintéticos e Integridade do Banco de Dados');

async function runCleanupAndIntegrityTests() {
  runSyncTest('T5.1', `Remoção atômica de todos os ${TOTAL_ITEMS} produtos de estresse (IDs ${TEST_BASE_ID} a ${TEST_BASE_ID + TOTAL_ITEMS - 1})`, () => {
    const t0 = Date.now();
    const info = db.prepare(`DELETE FROM compras_estoque_cache WHERE produto_id >= ? AND produto_id < ?`).run(TEST_BASE_ID, TEST_BASE_ID + TOTAL_ITEMS);
    const elapsed = Date.now() - t0;
    console.log(`     🧹 ${info.changes} registros removidos com sucesso em ${elapsed}ms`);
    assert.strictEqual(info.changes, TOTAL_ITEMS, `Deveria remover exatamente ${TOTAL_ITEMS} produtos sintéticos`);
  });

  runSyncTest('T5.2', 'Verificação de Integridade Forense do Banco SQLite (PRAGMA integrity_check)', () => {
    const row = db.prepare('PRAGMA integrity_check').get();
    console.log(`     🔍 PRAGMA integrity_check result: ${row.integrity_check}`);
    assert.strictEqual(row.integrity_check, 'ok', 'Banco de dados deve estar 100% íntegro');
  });
}

// =====================================================================
// RUNNER PRINCIPAL
// =====================================================================
async function main() {
  try {
    await runScaleReadTests();
    await runAdversarialSecurityTests();
    await runNetworkFaultSimulationTests();
    await runCleanupAndIntegrityTests();

    console.log('\n======================================================================');
    console.log('🏁 RESULTADO FINAL DA SUÍTE DE ESTRESSE (CHALLENGER 1 - M1)');
    console.log(`   Total de Testes Executados: ${passedTests + failedTests}`);
    console.log(`   ✅ Testes Aprovados:       ${passedTests}`);
    console.log(`   ❌ Testes Reprovados:      ${failedTests}`);
    console.log(`   Taxa de Sucesso:           ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
    console.log('======================================================================\n');

    if (failedTests > 0) {
      console.error('❌ A suíte de estresse identificou falhas nos requisitos de resiliência.');
      process.exit(1);
    } else {
      console.log('🎉 TODOS OS TESTES DE ESTRESSE, VOLUMES, SEGURANÇA E FALLBACK FORAM APROVADOS COM DISTINÇÃO!');
      process.exit(0);
    }
  } catch (errFatal) {
    console.error('💥 Erro fatal durante a execução da suíte de estresse:', errFatal);
    process.exit(1);
  }
}

main();
