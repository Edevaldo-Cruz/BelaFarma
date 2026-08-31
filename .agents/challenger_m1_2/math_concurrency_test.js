/**
 * math_concurrency_test.js
 * Challenger 2 — Milestone M1: Mathematical & Concurrency Verifier
 * 
 * Verificação empírica adversarial de:
 * 1. Oráculo matemático exato para 1.000 amostras aleatórias (V30d, V31-60d, margem alpha).
 * 2. Regras especiais e boundary testing (Curva A floor, inatividade, dormência > 90d, NaN/null, negativos).
 * 3. Matriz de classificação de status (RUPTURA, ABAIXO_MINIMO, NORMAL, EXCESSO) para 500 amostras.
 * 4. Concorrência assíncrona pesada (600 operações simultâneas de leitura/escrita/cálculo no SQLite WAL).
 * 5. Verificação de integridade pós-stress (PRAGMA integrity_check) e teardown limpo.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const path = require('path');
const db = require('../../backend/database');
const {
  calcularDemandaPonderada,
  determinarStatusRuptura,
  calcularEstoqueMinimo30Dias,
  listarProdutosAbaixoDoMinimo,
  obterResumoEstoqueMinimo
} = require('../../backend/services/compras-estoque.service');

// Cores para saída no terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

let totalPassed = 0;
let totalFailed = 0;
const failureDetails = [];

function assert(condition, message, details = '') {
  if (condition) {
    totalPassed++;
  } else {
    totalFailed++;
    failureDetails.push({ message, details });
    console.error(`${colors.red}  ❌ FALHA: ${message}${colors.reset} ${details}`);
  }
}

/**
 * Oráculo Matemático Exato de Referência
 */
function exactMathOracle(v30d, v31_60d, alpha, options = {}) {
  const v1 = Math.max(0, Number(v30d) || 0);
  const v2 = Math.max(0, Number(v31_60d) || 0);
  const margem = isNaN(Number(alpha)) ? 15 : Number(alpha);
  const p1 = options.pesoP1 !== undefined ? Number(options.pesoP1) : 0.65;
  const p2 = options.pesoP2 !== undefined ? Number(options.pesoP2) : 0.35;
  const ativo = options.ativo !== undefined ? Boolean(options.ativo) : true;
  const diasSemVenda = Number(options.diasSemVenda) || 0;
  const curva = (options.curvaAbc || 'C').toUpperCase();

  if (!ativo || (v1 === 0 && v2 === 0) || diasSemVenda > 90) {
    return {
      estoqueMinimo: 0,
      demanda30d: 0,
      vmd: 0
    };
  }

  const demanda30d = (v1 * p1) + (v2 * p2);
  const vmd = demanda30d / 30;
  const fator = 1 + (margem / 100);
  let estoqueMinimo = Math.ceil(demanda30d * fator);

  if (curva === 'A' && (v1 > 0 || v2 > 0) && estoqueMinimo < 2) {
    estoqueMinimo = 2;
  }

  return {
    estoqueMinimo: Math.max(0, estoqueMinimo),
    demanda30d: Number(demanda30d.toFixed(2)),
    vmd: Number(vmd.toFixed(4))
  };
}

/**
 * Oráculo Exato de Status de Ruptura
 */
function exactStatusOracle(saldo, min) {
  const s = Number(saldo) || 0;
  const m = Number(min) || 0;
  if (s <= 0) return 'RUPTURA';
  if (s < m) return 'ABAIXO_MINIMO';
  if (m > 0 && s >= m * 2.5) return 'EXCESSO';
  return 'NORMAL';
}

async function runMathConcurrencySuite() {
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}🔬 CHALLENGER 2: SUÍTE DE TESTES MATEMÁTICOS & CONCORRÊNCIA (M1)${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  // --------------------------------------------------------------------------
  // TESTE 1: 1.000 AMOSTRAS ALEATÓRIAS CONTRA ORÁCULO MATEMÁTICO EXATO
  // --------------------------------------------------------------------------
  console.log(`${colors.bold}📊 [PARTE 1] Verificação de 1.000 Amostras Aleatórias contra Oráculo Matemático${colors.reset}`);

  let oracleMatches = 0;
  const numSamples = 1000;

  for (let i = 0; i < numSamples; i++) {
    // Gerar amostras aleatórias variadas: inteiros, decimais, zero, extremos
    let v30 = Math.random() < 0.05 ? 0 : Math.random() * 5000;
    let v60 = Math.random() < 0.05 ? 0 : Math.random() * 5000;
    if (Math.random() < 0.5) {
      v30 = Math.floor(v30);
      v60 = Math.floor(v60);
    }
    const alpha = Math.random() < 0.1 ? 15 : Number((Math.random() * 50).toFixed(2));
    const curva = ['A', 'B', 'C'][Math.floor(Math.random() * 3)];
    const ativo = Math.random() > 0.05; // 5% chance inativo
    const diasSemVenda = Math.random() < 0.05 ? 95 : Math.floor(Math.random() * 80);

    const expected = exactMathOracle(v30, v60, alpha, { curvaAbc: curva, ativo, diasSemVenda });
    const actual = calcularDemandaPonderada(v30, v60, alpha, { curvaAbc: curva, ativo, diasSemVenda });

    const matchEstoque = actual.estoqueMinimoSugerido === expected.estoqueMinimo;
    const matchDemanda = Math.abs(actual.demanda30d - expected.demanda30d) < 0.01;
    const matchVmd = Math.abs(actual.vmdPonderado - expected.vmd) < 0.001;

    if (matchEstoque && matchDemanda && matchVmd) {
      oracleMatches++;
      totalPassed++;
    } else {
      totalFailed++;
      failureDetails.push({
        sample: i + 1,
        inputs: { v30, v60, alpha, curva, ativo, diasSemVenda },
        expected,
        actual
      });
    }
  }

  console.log(`  ${oracleMatches === numSamples ? colors.green + '✅' : colors.red + '❌'} Amostras validadas contra oráculo: ${oracleMatches} / ${numSamples} aprovadas.${colors.reset}`);

  // --------------------------------------------------------------------------
  // TESTE 2: TESTES DE FRONTEIRA E CASOS EXTREMOS
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}🎯 [PARTE 2] Testes de Fronteira, Curva A, Inatividade e Robustez de Tipos${colors.reset}`);

  // 2.1 Caso canônico
  const c1 = calcularDemandaPonderada(100, 50, 15);
  assert(c1.estoqueMinimoSugerido === 95, '2.1 V30d=100, V31_60d=50, 15% deve resultar em 95', `Obtido: ${c1.estoqueMinimoSugerido}`);
  assert(c1.demanda30d === 82.5, '2.1 Demanda base deve ser 82.50', `Obtido: ${c1.demanda30d}`);
  assert(c1.vmdPonderado === 2.75, '2.1 VMD deve ser 2.75', `Obtido: ${c1.vmdPonderado}`);

  // 2.2 Zeros e negativos
  const c2 = calcularDemandaPonderada(0, 0, 15);
  assert(c2.estoqueMinimoSugerido === 0, '2.2 Vendas zeradas devem gerar estoque mínimo 0');
  const c2Neg = calcularDemandaPonderada(-50, -20, 15);
  assert(c2Neg.estoqueMinimoSugerido === 0, '2.2 Vendas negativas devem ser tratadas como 0');

  // 2.3 Piso de segurança Curva A
  const c3A = calcularDemandaPonderada(1, 0, 0, { curvaAbc: 'A' });
  assert(c3A.estoqueMinimoSugerido === 2, '2.3 Curva A com venda baixa (< 2) deve aplicar piso de 2 unidades', `Obtido: ${c3A.estoqueMinimoSugerido}`);

  const c3C = calcularDemandaPonderada(1, 0, 0, { curvaAbc: 'C' });
  assert(c3C.estoqueMinimoSugerido === 1, '2.3 Curva C com 1 venda e margem 0% deve resultar em 1 unidade', `Obtido: ${c3C.estoqueMinimoSugerido}`);

  const c3AZero = calcularDemandaPonderada(0, 0, 15, { curvaAbc: 'A' });
  assert(c3AZero.estoqueMinimoSugerido === 0, '2.3 Curva A sem vendas nos 60 dias NÃO deve aplicar piso (deve ser 0)', `Obtido: ${c3AZero.estoqueMinimoSugerido}`);

  // 2.4 Inatividade e Dormência
  const c4Inativo = calcularDemandaPonderada(500, 300, 15, { ativo: false });
  assert(c4Inativo.estoqueMinimoSugerido === 0, '2.4 Produto inativo deve ter estoque mínimo 0 mesmo com vendas históricas');

  const c4Dormencia = calcularDemandaPonderada(500, 300, 15, { diasSemVenda: 95 });
  assert(c4Dormencia.estoqueMinimoSugerido === 0, '2.4 Produto com > 90 dias sem vendas deve ter estoque mínimo 0');

  // 2.5 Resiliência contra tipos inválidos / NaN / undefined
  const c5Null = calcularDemandaPonderada(null, undefined, NaN);
  assert(c5Null.estoqueMinimoSugerido === 0, '2.5 Entradas null/undefined/NaN devem retornar 0 com segurança');

  const c5Str = calcularDemandaPonderada("100", "50", "15");
  assert(c5Str.estoqueMinimoSugerido === 95, '2.5 Strings numéricas devem ser convertidas corretamente');

  // 2.6 Grandes volumes
  const c6Big = calcularDemandaPonderada(100000, 50000, 20);
  assert(c6Big.estoqueMinimoSugerido === 99000, '2.6 Volume alto (100k + 50k, 20%) deve calcular 99.000', `Obtido: ${c6Big.estoqueMinimoSugerido}`);

  // --------------------------------------------------------------------------
  // TESTE 3: MATRIZ DE CLASSIFICAÇÃO DE STATUS (500 AMOSTRAS)
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}🏷️ [PARTE 3] Matriz de Classificação de Ruptura (500 Amostras)${colors.reset}`);

  let statusMatches = 0;
  const numStatusSamples = 500;

  for (let i = 0; i < numStatusSamples; i++) {
    const min = Math.random() < 0.1 ? 0 : Math.floor(Math.random() * 200);
    let saldo;
    const r = Math.random();
    if (r < 0.25) {
      saldo = Math.random() < 0.5 ? 0 : -Math.floor(Math.random() * 20); // RUPTURA
    } else if (r < 0.5) {
      saldo = min > 0 ? Math.floor(Math.random() * min) : 0; // ABAIXO_MINIMO ou RUPTURA
    } else if (r < 0.75) {
      saldo = min + Math.floor(Math.random() * (min > 0 ? min * 1.4 : 10)); // NORMAL
    } else {
      saldo = min > 0 ? Math.ceil(min * (2.5 + Math.random() * 3)) : Math.floor(Math.random() * 50); // EXCESSO
    }

    const expStatus = exactStatusOracle(saldo, min);
    const actStatus = determinarStatusRuptura(saldo, min);

    if (expStatus === actStatus) {
      statusMatches++;
      totalPassed++;
    } else {
      totalFailed++;
      failureDetails.push({
        type: 'StatusMismatch',
        inputs: { saldo, min },
        expected: expStatus,
        actual: actStatus
      });
    }
  }

  console.log(`  ${statusMatches === numStatusSamples ? colors.green + '✅' : colors.red + '❌'} Matriz de status validada: ${statusMatches} / ${numStatusSamples} aprovadas.${colors.reset}`);

  // --------------------------------------------------------------------------
  // TESTE 4: CONCORRÊNCIA ASSÍNCRONA PESADA NO SQLITE WAL & SERVIÇO DE ESTOQUE
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}⚡ [PARTE 4] Concorrência Assíncrona Pesada no SQLite (WAL Mode)${colors.reset}`);

  // Preparação de IDs de teste isolados (88001 a 88100)
  const testIds = [];
  for (let i = 88001; i <= 88100; i++) {
    testIds.push(i);
  }

  // Limpa registros residuais prévios
  db.prepare(`DELETE FROM compras_estoque_cache WHERE produto_id >= 88001 AND produto_id <= 88100`).run();

  // Inserção inicial em lote
  const insertInitialStmt = db.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, categoria_id, curva_abc, saldo,
      est_minimo_calculado, est_minimo_digifarma, vmd_ponderado,
      vendas_30d, vendas_31_60d, custo_unitario, ultima_compra_valor,
      status_ruptura, margem_seguranca_aplicada, dias_sem_venda,
      sincronizado_em, atualizado_em
    ) VALUES (
      ?, ?, ?, 1, 'B', ?,
      ?, 0, ?,
      ?, ?, 10.50, 10.00,
      ?, 15.0, 0,
      datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `);

  const initialTx = db.transaction(() => {
    for (const id of testIds) {
      const v30 = 50 + (id % 50);
      const v60 = 30 + (id % 30);
      const saldo = id % 3 === 0 ? 0 : (id % 2 === 0 ? 10 : 80);
      const calc = calcularDemandaPonderada(v30, v60, 15);
      const status = determinarStatusRuptura(saldo, calc.estoqueMinimoSugerido);
      insertInitialStmt.run(
        id,
        `PRODUTO TESTE CONCORRÊNCIA ${id}`,
        `78900000${id}`,
        saldo,
        calc.estoqueMinimoSugerido,
        calc.vmdPonderado,
        v30,
        v60,
        status
      );
    }
  });
  initialTx();
  console.log(`  📦 100 produtos de teste populados para estresse de concorrência.`);

  // Dispara 600 operações concorrentes simultâneas divididas em 4 grupos:
  // Grupo A: 150 leituras paginadas com filtros (`listarProdutosAbaixoDoMinimo`)
  // Grupo B: 150 consultas estatísticas (`obterResumoEstoqueMinimo`)
  // Grupo C: 150 escritas concorrentes de recálculo (`calcularEstoqueMinimo30Dias` com fallback para cache)
  // Grupo D: 150 atualizações diretas de saldo / status
  const totalConcurrentOps = 600;
  const tasks = [];
  let concurrentErrors = 0;
  const startTime = Date.now();

  for (let i = 0; i < 150; i++) {
    // Grupo A: Leitura paginada com filtro aleatório
    tasks.push((async (opId) => {
      try {
        const apenasRuptura = opId % 2 === 0;
        const res = await listarProdutosAbaixoDoMinimo({
          apenasRuptura,
          limit: 20,
          offset: (opId * 5) % 80
        });
        if (!res || !Array.isArray(res.produtos)) {
          throw new Error('Resposta inválida em listarProdutosAbaixoDoMinimo');
        }
      } catch (err) {
        concurrentErrors++;
        failureDetails.push({ op: 'Grupo A (Leitura)', error: err.message });
      }
    })(i));

    // Grupo B: Estatísticas resumidas
    tasks.push((async (opId) => {
      try {
        const resumo = obterResumoEstoqueMinimo();
        if (typeof resumo.totalItens !== 'number' || resumo.totalItens < 100) {
          throw new Error('Resumo com contagem inconsistente');
        }
      } catch (err) {
        concurrentErrors++;
        failureDetails.push({ op: 'Grupo B (Resumo)', error: err.message });
      }
    })(i));

    // Grupo C: Cálculo unitário (fallback SQLite)
    tasks.push((async (opId) => {
      const targetId = testIds[opId % testIds.length];
      try {
        const calcRes = await calcularEstoqueMinimo30Dias(targetId, 15);
        if (!calcRes || calcRes.produtoId !== targetId) {
          throw new Error(`Cálculo falhou para produto ${targetId}`);
        }
      } catch (err) {
        concurrentErrors++;
        failureDetails.push({ op: 'Grupo C (Cálculo Unitário)', error: err.message });
      }
    })(i));

    // Grupo D: Atualizações diretas concorrentes
    tasks.push((async (opId) => {
      const targetId = testIds[opId % testIds.length];
      const newSaldo = (opId * 7) % 150;
      try {
        const row = db.prepare('SELECT est_minimo_calculado FROM compras_estoque_cache WHERE produto_id = ?').get(targetId);
        const estMin = row ? row.est_minimo_calculado : 50;
        const newStatus = determinarStatusRuptura(newSaldo, estMin);
        db.prepare(`
          UPDATE compras_estoque_cache
          SET saldo = ?, status_ruptura = ?, atualizado_em = datetime('now', 'localtime')
          WHERE produto_id = ?
        `).run(newSaldo, newStatus, targetId);
      } catch (err) {
        concurrentErrors++;
        failureDetails.push({ op: 'Grupo D (Update Direto)', error: err.message });
      }
    })(i));
  }

  console.log(`  🚀 Disparando ${totalConcurrentOps} operações simultâneas via Promise.all()...`);
  await Promise.all(tasks);
  const duration = Date.now() - startTime;
  console.log(`  ⏱️ Concorrência finalizada em ${duration}ms (${(totalConcurrentOps / (duration / 1000)).toFixed(1)} ops/seg).`);

  assert(concurrentErrors === 0, `Nenhuma colisão/lock durante ${totalConcurrentOps} operações concorrentes`, `Erros detectados: ${concurrentErrors}`);

  // --------------------------------------------------------------------------
  // TESTE 5: INTEGRIDADE DO BANCO DE DADOS E TEARDOWN
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}🛡️ [PARTE 5] Verificação de Integridade SQLite & Limpeza${colors.reset}`);

  let integrityOk = false;
  try {
    const integrityCheck = db.prepare('PRAGMA integrity_check').all();
    integrityOk = integrityCheck.length === 1 && integrityCheck[0].integrity_check === 'ok';
    assert(integrityOk, 'PRAGMA integrity_check retornou "ok"');
  } catch (err) {
    assert(false, 'Falha ao executar PRAGMA integrity_check', err.message);
  }

  // Limpeza dos 100 registros de teste
  try {
    const delRes = db.prepare(`DELETE FROM compras_estoque_cache WHERE produto_id >= 88001 AND produto_id <= 88100`).run();
    console.log(`  🧹 Teardown realizado: ${delRes.changes} registros temporários excluídos.`);
    assert(delRes.changes === 100, '100 registros de teste limpos com sucesso');
  } catch (err) {
    assert(false, 'Falha ao limpar registros de teste', err.message);
  }

  // --------------------------------------------------------------------------
  // RESUMO E VEREDITO
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}🏁 RESULTADO FINAL DA SUÍTE CHALLENGER 2 (M1):${colors.reset}`);
  console.log(`   ${colors.green}Total de Verificações Aprovadas: ${totalPassed}${colors.reset}`);
  console.log(`   ${totalFailed === 0 ? colors.green : colors.red}Total de Falhas:                 ${totalFailed}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  if (totalFailed === 0) {
    console.log(`${colors.bold}${colors.green}🏆 VEREDITO: APPROVE${colors.reset} — Exatidão matemática comprovada e alta resiliência de concorrência.`);
  } else {
    console.log(`${colors.bold}${colors.red}🚫 VEREDITO: REQUEST_CHANGES${colors.reset} — Falhas identificadas nos testes.`);
    console.error('Detalhes das falhas:', JSON.stringify(failureDetails.slice(0, 10), null, 2));
  }

  return {
    totalPassed,
    totalFailed,
    failureDetails,
    durationMs: duration,
    verdict: totalFailed === 0 ? 'APPROVE' : 'REQUEST_CHANGES'
  };
}

// Execução direta
runMathConcurrencySuite()
  .then((result) => {
    process.exit(result.totalFailed === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error('Erro crítico na execução do teste:', err);
    process.exit(1);
  });
