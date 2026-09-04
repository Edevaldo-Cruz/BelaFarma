/**
 * Adversarial Stress & Verification Test Suite for Milestone M1
 * Schema compras_estoque_cache SQLite
 * Author: Challenger 1 (critic, specialist)
 */

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

console.log('===============================================================');
console.log('  CHALLENGER 1: EMPIRICAL ADVERSARIAL TEST SUITE (MILESTONE M1)');
console.log('===============================================================\n');

let db = require('./database.js');

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, fn) {
  results.total++;
  try {
    fn();
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: err.message });
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// BATERIA 1: IDEMPOTÊNCIA DE MIGRAÇÃO E REEXECUÇÃO DO SCHEMA
// ─────────────────────────────────────────────────────────────
console.log('--- BATERIA 1: IDEMPOTÊNCIA DE MIGRAÇÃO ---');

const EXPECTED_REQUIRED_COLUMNS = [
  'apresentacao',
  'preco_venda_vigente',
  'preco_normal',
  'preco_promocional',
  'inicio_promocao',
  'termino_promocao',
  'preco_unitario_ult_compra',
  'ultima_compra_fornecedor',
  'ultima_compra_data',
  'ultima_compra_nf',
  'qtd_sugerida_compra'
];

const EXPECTED_INDEXES = [
  'idx_cec_status',
  'idx_cec_ean',
  'idx_cec_descricao',
  'idx_cec_curva',
  'idx_cec_ciclo'
];

test('B1.1: Todas as 11 novas colunas estão presentes na tabela compras_estoque_cache', () => {
  const cols = db.pragma('table_info(compras_estoque_cache)').map(c => c.name);
  const missing = EXPECTED_REQUIRED_COLUMNS.filter(c => !cols.includes(c));
  assert.strictEqual(missing.length, 0, 'Colunas ausentes: ' + missing.join(', '));
  assert.strictEqual(cols.length, 32, `Total de colunas esperado 32, encontrado ${cols.length}`);
});

test('B1.2: Todos os índices obrigatórios existem na tabela compras_estoque_cache', () => {
  const indexes = db.pragma('index_list(compras_estoque_cache)').map(i => i.name);
  const missing = EXPECTED_INDEXES.filter(i => !indexes.includes(i));
  assert.strictEqual(missing.length, 0, 'Índices ausentes: ' + missing.join(', '));
});

test('B1.3: Reexecução de database.js em subprocesso isolado (3 execuções consecutivas)', () => {
  const initialCols = db.pragma('table_info(compras_estoque_cache)');
  const initialCount = db.prepare('SELECT count(*) as c FROM compras_estoque_cache').get().c;

  for (let run = 1; run <= 3; run++) {
    const output = execFileSync('node', ['-e', 'require("./backend/database.js"); console.log("OK_RUN_" + process.argv[1]);', run.toString()], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8'
    });
    assert(output.includes('OK_RUN_' + run), 'Falha ao executar ciclo ' + run + ' de database.js');
  }

  const colsAfter = db.pragma('table_info(compras_estoque_cache)');
  const countAfter = db.prepare('SELECT count(*) as c FROM compras_estoque_cache').get().c;

  assert.strictEqual(colsAfter.length, initialCols.length, 'Número de colunas divergiu após reexecução');
  assert.strictEqual(countAfter, initialCount, `Total de registros divergiu: ${countAfter} vs ${initialCount}`);
});

test('B1.4: Invocação direta repetida de comandos DDL ALTER TABLE idempotentes', () => {
  const alterStatements = [
    'ALTER TABLE compras_estoque_cache ADD COLUMN apresentacao TEXT',
    'ALTER TABLE compras_estoque_cache ADD COLUMN preco_venda_vigente REAL DEFAULT 0',
    'ALTER TABLE compras_estoque_cache ADD COLUMN preco_normal REAL DEFAULT 0',
    'ALTER TABLE compras_estoque_cache ADD COLUMN preco_promocional REAL DEFAULT 0',
    'ALTER TABLE compras_estoque_cache ADD COLUMN inicio_promocao TEXT',
    'ALTER TABLE compras_estoque_cache ADD COLUMN termino_promocao TEXT',
    'ALTER TABLE compras_estoque_cache ADD COLUMN preco_unitario_ult_compra REAL DEFAULT 0',
    'ALTER TABLE compras_estoque_cache ADD COLUMN ultima_compra_fornecedor TEXT',
    'ALTER TABLE compras_estoque_cache ADD COLUMN ultima_compra_data TEXT',
    'ALTER TABLE compras_estoque_cache ADD COLUMN ultima_compra_nf TEXT',
    'ALTER TABLE compras_estoque_cache ADD COLUMN qtd_sugerida_compra REAL DEFAULT 0'
  ];

  for (const sql of alterStatements) {
    try {
      db.exec(sql);
      assert.fail('Deveria ter lançado erro de coluna duplicada no ALTER TABLE puro');
    } catch (e) {
      assert(e.message.includes('duplicate column name'), 'Erro inesperado: ' + e.message);
    }
  }

  for (const idx of EXPECTED_INDEXES) {
    db.exec('CREATE INDEX IF NOT EXISTS ' + idx + ' ON compras_estoque_cache(descricao)');
  }
});

test('B1.5: Criação do Schema a Frio em Banco Novo In-Memory (Zero Estado)', () => {
  const memDb = new Database(':memory:');
  
  // Executa o exato bloco DDL de database.js
  memDb.exec(`
    CREATE TABLE IF NOT EXISTS compras_estoque_cache (
      produto_id INTEGER PRIMARY KEY,
      descricao TEXT NOT NULL,
      apresentacao TEXT,
      ean TEXT,
      categoria_id INTEGER DEFAULT 0,
      curva_abc TEXT DEFAULT 'C',
      saldo REAL DEFAULT 0,
      est_minimo_calculado REAL DEFAULT 0,
      est_maximo_calculado REAL DEFAULT 0,
      est_minimo_digifarma REAL DEFAULT 0,
      vmd_ponderado REAL DEFAULT 0,
      vendas_30d REAL DEFAULT 0,
      vendas_31_60d REAL DEFAULT 0,
      vendas_61_90d REAL DEFAULT 0,
      ciclo_vida TEXT DEFAULT 'ESTAVEL',
      custo_unitario REAL DEFAULT 0,
      ultima_compra_valor REAL DEFAULT 0,
      preco_unitario_ult_compra REAL DEFAULT 0,
      ultima_compra_fornecedor TEXT,
      ultima_compra_data TEXT,
      ultima_compra_nf TEXT,
      preco_venda_vigente REAL DEFAULT 0,
      preco_normal REAL DEFAULT 0,
      preco_promocional REAL DEFAULT 0,
      inicio_promocao TEXT,
      termino_promocao TEXT,
      qtd_sugerida_compra REAL DEFAULT 0,
      status_ruptura TEXT DEFAULT 'NORMAL',
      margem_seguranca_aplicada REAL DEFAULT 15.0,
      dias_sem_venda INTEGER DEFAULT 0,
      sincronizado_em TEXT,
      atualizado_em TEXT NOT NULL
    );
  `);

  // Executa migrações idempotentes
  try { memDb.exec('ALTER TABLE compras_estoque_cache ADD COLUMN apresentacao TEXT'); } catch (e) {}
  try { memDb.exec('ALTER TABLE compras_estoque_cache ADD COLUMN preco_venda_vigente REAL DEFAULT 0'); } catch (e) {}
  try { memDb.exec('ALTER TABLE compras_estoque_cache ADD COLUMN preco_normal REAL DEFAULT 0'); } catch (e) {}
  try { memDb.exec('ALTER TABLE compras_estoque_cache ADD COLUMN preco_promocional REAL DEFAULT 0'); } catch (e) {}
  try { memDb.exec('ALTER TABLE compras_estoque_cache ADD COLUMN inicio_promocao TEXT'); } catch (e) {}
  try { memDb.exec('ALTER TABLE compras_estoque_cache ADD COLUMN termino_promocao TEXT'); } catch (e) {}
  try { memDb.exec('ALTER TABLE compras_estoque_cache ADD COLUMN preco_unitario_ult_compra REAL DEFAULT 0'); } catch (e) {}
  try { memDb.exec('ALTER TABLE compras_estoque_cache ADD COLUMN ultima_compra_fornecedor TEXT'); } catch (e) {}
  try { memDb.exec('ALTER TABLE compras_estoque_cache ADD COLUMN ultima_compra_data TEXT'); } catch (e) {}
  try { memDb.exec('ALTER TABLE compras_estoque_cache ADD COLUMN ultima_compra_nf TEXT'); } catch (e) {}
  try { memDb.exec('ALTER TABLE compras_estoque_cache ADD COLUMN qtd_sugerida_compra REAL DEFAULT 0'); } catch (e) {}

  // Cria índices
  memDb.exec('CREATE INDEX IF NOT EXISTS idx_cec_status ON compras_estoque_cache(status_ruptura)');
  memDb.exec('CREATE INDEX IF NOT EXISTS idx_cec_ean ON compras_estoque_cache(ean)');
  memDb.exec('CREATE INDEX IF NOT EXISTS idx_cec_descricao ON compras_estoque_cache(descricao)');
  memDb.exec('CREATE INDEX IF NOT EXISTS idx_cec_curva ON compras_estoque_cache(curva_abc)');
  memDb.exec('CREATE INDEX IF NOT EXISTS idx_cec_ciclo ON compras_estoque_cache(ciclo_vida)');

  const cols = memDb.pragma('table_info(compras_estoque_cache)').map(c => c.name);
  assert.strictEqual(cols.length, 32, 'Banco em memória deve ter 32 colunas');
  const indexes = memDb.pragma('index_list(compras_estoque_cache)').map(i => i.name);
  assert.strictEqual(indexes.length, 5, 'Banco em memória deve ter 5 índices');
  memDb.close();
});

// ─────────────────────────────────────────────────────────────
// BATERIA 2: VALORES EXTREMOS, LIMITES E CASOS DE FRONTEIRA
// ─────────────────────────────────────────────────────────────
console.log('\n--- BATERIA 2: VALORES EXTREMOS E LIMITES (EDGE CASES) ---');

const CHALLENGER_TEST_IDS = [98765401, 98765402, 98765403, 98765404];

// Limpeza preventiva específica
const deleteStmt = db.prepare('DELETE FROM compras_estoque_cache WHERE produto_id IN (?, ?, ?, ?)');
deleteStmt.run(...CHALLENGER_TEST_IDS);

test('B2.1: Inserção e Leitura de valores explicitamente NULOS em todos os campos novos', () => {
  const stmt = db.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, apresentacao, preco_venda_vigente, preco_normal,
      preco_promocional, inicio_promocao, termino_promocao, preco_unitario_ult_compra,
      ultima_compra_fornecedor, ultima_compra_data, ultima_compra_nf, qtd_sugerida_compra,
      atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    CHALLENGER_TEST_IDS[0],
    'MEDICAMENTO TESTE VALORES NULOS',
    '7898888000001',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    new Date().toISOString()
  );

  const row = db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(CHALLENGER_TEST_IDS[0]);
  assert(row, 'Registro não encontrado');
  assert.strictEqual(row.apresentacao, null);
  assert.strictEqual(row.preco_venda_vigente, null);
  assert.strictEqual(row.preco_normal, null);
  assert.strictEqual(row.preco_promocional, null);
  assert.strictEqual(row.inicio_promocao, null);
  assert.strictEqual(row.termino_promocao, null);
  assert.strictEqual(row.preco_unitario_ult_compra, null);
  assert.strictEqual(row.ultima_compra_fornecedor, null);
  assert.strictEqual(row.ultima_compra_data, null);
  assert.strictEqual(row.ultima_compra_nf, null);
  assert.strictEqual(row.qtd_sugerida_compra, null);
});

test('B2.2: Strings gigantes (> 20.000 caracteres) sem truncamento ou corrupção', () => {
  const longApresentacao = 'CX COM ' + 'COMPRIMIDOS '.repeat(1800) + 'FINAL'; // ~21.600 chars
  const longFornecedor = 'DISTRIBUIDORA FARMACEUTICA '.repeat(400) + 'LTDA'; // ~10.800 chars
  const longNf = 'NF-' + '9'.repeat(2000);

  const stmt = db.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, apresentacao, preco_unitario_ult_compra,
      ultima_compra_fornecedor, ultima_compra_nf, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    CHALLENGER_TEST_IDS[1],
    'MEDICAMENTO TESTE STRINGS LONGAS',
    '7898888000002',
    longApresentacao,
    15.50,
    longFornecedor,
    longNf,
    new Date().toISOString()
  );

  const row = db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(CHALLENGER_TEST_IDS[1]);
  assert(row, 'Registro de strings longas não encontrado');
  assert.strictEqual(row.apresentacao.length, longApresentacao.length, 'Tamanho de apresentacao divergiu');
  assert.strictEqual(row.apresentacao, longApresentacao, 'Conteúdo de apresentacao foi alterado');
  assert.strictEqual(row.ultima_compra_fornecedor.length, longFornecedor.length, 'Tamanho de fornecedor divergiu');
  assert.strictEqual(row.ultima_compra_nf.length, longNf.length, 'Tamanho de NF divergiu');
});

test('B2.3: Caracteres especiais Unicode, emojis, acentos, idiomas não-latinos, aspas e SQL injection', () => {
  const specialApresentacao = 'CX 30 COMP. 💊 & 💉 "Gotas" / \'Frasco\' 100% (Açaí & Própolis) — 医薬品 الأدوية Лекарства — R$ 25,00 <script>alert(1)</script>';
  const specialFornecedor = 'D\'Agostini & Filhos / São José LTDA — CNPJ: 12.345.678/0001-99 \'; DROP TABLE compras_estoque_cache; --';
  const specialNf = 'NF-e/2026 #594.906-Série 1 (DANFE)';

  const stmt = db.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, apresentacao, ultima_compra_fornecedor, ultima_compra_nf, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    CHALLENGER_TEST_IDS[2],
    'MEDICAMENTO ESPECIAL COM CARACTERES UNICODE E SQLI PAYLOAD',
    '7898888000003',
    specialApresentacao,
    specialFornecedor,
    specialNf,
    new Date().toISOString()
  );

  const row = db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(CHALLENGER_TEST_IDS[2]);
  assert(row, 'Registro de caracteres especiais não encontrado');
  assert.strictEqual(row.apresentacao, specialApresentacao);
  assert.strictEqual(row.ultima_compra_fornecedor, specialFornecedor);
  assert.strictEqual(row.ultima_compra_nf, specialNf);

  const count = db.prepare('SELECT count(*) as c FROM compras_estoque_cache').get().c;
  assert(count > 0, 'Tabela foi corrompida por payload');
});

test('B2.4: Precisão de ponto flutuante, microvalores, valores astronômicos e negativos', () => {
  const microPreco = 0.00000001;
  const astroPreco = 9999999999.95;
  const fracPreco = 12.3456789123;
  const saldoNegativo = -45.5;

  const stmt = db.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, preco_unitario_ult_compra, preco_normal,
      preco_promocional, preco_venda_vigente, qtd_sugerida_compra, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    CHALLENGER_TEST_IDS[3],
    'MEDICAMENTO TESTE PONTO FLUTUANTE EXTREMO',
    '7898888000004',
    saldoNegativo,
    microPreco,
    astroPreco,
    fracPreco,
    fracPreco,
    999999.5,
    new Date().toISOString()
  );

  const row = db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(CHALLENGER_TEST_IDS[3]);
  assert(row, 'Registro numérico não encontrado');
  assert.strictEqual(row.saldo, saldoNegativo, 'Saldo negativo falhou');
  assert.strictEqual(row.preco_unitario_ult_compra, microPreco, 'Micro preço falhou');
  assert.strictEqual(row.preco_normal, astroPreco, 'Preço astronômico falhou');
  assert.strictEqual(row.preco_venda_vigente, fracPreco, 'Preço fracionado de alta precisão falhou');
});

test('B2.5: Operação UPDATE alterando campos nulos para preenchidos e vice-versa', () => {
  db.prepare(`
    UPDATE compras_estoque_cache
    SET apresentacao = 'UPDATED APRESENTACAO',
        preco_venda_vigente = 99.90,
        preco_unitario_ult_compra = 50.25,
        ultima_compra_fornecedor = 'FORNECEDOR NOVO',
        qtd_sugerida_compra = 100
    WHERE produto_id = ?
  `).run(CHALLENGER_TEST_IDS[0]);

  let row = db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(CHALLENGER_TEST_IDS[0]);
  assert.strictEqual(row.apresentacao, 'UPDATED APRESENTACAO');
  assert.strictEqual(row.preco_venda_vigente, 99.90);
  assert.strictEqual(row.preco_unitario_ult_compra, 50.25);
  assert.strictEqual(row.qtd_sugerida_compra, 100);

  db.prepare(`
    UPDATE compras_estoque_cache
    SET apresentacao = NULL,
        preco_venda_vigente = NULL,
        preco_unitario_ult_compra = NULL
    WHERE produto_id = ?
  `).run(CHALLENGER_TEST_IDS[0]);

  row = db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(CHALLENGER_TEST_IDS[0]);
  assert.strictEqual(row.apresentacao, null);
  assert.strictEqual(row.preco_venda_vigente, null);
  assert.strictEqual(row.preco_unitario_ult_compra, null);
});

test('B2.6: Limpeza rigorosa dos registros de teste', () => {
  const res = deleteStmt.run(...CHALLENGER_TEST_IDS);
  assert.strictEqual(res.changes, 4, 'Esperado 4 registros excluídos, mas foram ' + res.changes);
  const check = db.prepare('SELECT count(*) as c FROM compras_estoque_cache WHERE produto_id IN (?, ?, ?, ?)').get(...CHALLENGER_TEST_IDS).c;
  assert.strictEqual(check, 0, 'Sobraram registros de teste no banco');
});

// ─────────────────────────────────────────────────────────────
// BATERIA 3: BENCHMARK DE PERFORMANCE (<10ms) NA BASE REAL
// ─────────────────────────────────────────────────────────────
console.log('\n--- BATERIA 3: BENCHMARKS DE PERFORMANCE (SLA < 10ms) ---');

const totalRows = db.prepare('SELECT count(*) as c FROM compras_estoque_cache').get().c;
console.log('Base de dados atual: ' + totalRows + ' registros em compras_estoque_cache.');

const sampleRows = db.prepare("SELECT produto_id, ean, descricao FROM compras_estoque_cache WHERE ean IS NOT NULL AND ean != '' LIMIT 100").all();
assert(sampleRows.length > 0, 'Necessário ter dados para o benchmark');

const benchmarkResults = [];

function measureBenchmark(name, iterations, queryFn, slaMs = 10.0) {
  for (let i = 0; i < 20; i++) {
    queryFn(i);
  }

  const durations = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    queryFn(i);
    const t1 = process.hrtime.bigint();
    const durationMs = Number(t1 - t0) / 1e6;
    durations.push(durationMs);
  }

  durations.sort((a, b) => a - b);
  const min = durations[0];
  const max = durations[durations.length - 1];
  const avg = durations.reduce((acc, v) => acc + v, 0) / durations.length;
  const p50 = durations[Math.floor(durations.length * 0.50)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const p99 = durations[Math.floor(durations.length * 0.99)];

  console.log('Benchmark [' + name + '] (' + iterations + ' iterações):');
  console.log('  Média: ' + avg.toFixed(3) + 'ms | p50: ' + p50.toFixed(3) + 'ms | p95: ' + p95.toFixed(3) + 'ms | p99: ' + p99.toFixed(3) + 'ms | Max: ' + max.toFixed(3) + 'ms | SLA: < ' + slaMs + 'ms');

  test('B3 - Performance: ' + name + ' (p95 < ' + slaMs + 'ms, avg < ' + slaMs + 'ms)', () => {
    assert(p95 < slaMs, 'p95 (' + p95.toFixed(3) + 'ms) excedeu o SLA de ' + slaMs + 'ms');
    assert(avg < slaMs, 'Média (' + avg.toFixed(3) + 'ms) excedeu o SLA de ' + slaMs + 'ms');
  });

  benchmarkResults.push({ name, iterations, avg, p50, p95, p99, max, slaMs });
  return { name, iterations, avg, p50, p95, p99, max };
}

// 1. Busca por produto_id (PK Index Lookup)
const stmtById = db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?');
measureBenchmark('Busca por ID (PK)', 500, (i) => {
  const targetId = sampleRows[i % sampleRows.length].produto_id;
  stmtById.get(targetId);
});

// 2. Busca por ean (idx_cec_ean Index Lookup)
const stmtByEan = db.prepare('SELECT * FROM compras_estoque_cache WHERE ean = ?');
measureBenchmark('Busca por EAN (idx_cec_ean)', 500, (i) => {
  const targetEan = sampleRows[i % sampleRows.length].ean;
  stmtByEan.get(targetEan);
});

// 3. Busca por status_ruptura (idx_cec_status Index)
const statuses = ['RUPTURA', 'ABAIXO_MINIMO', 'NORMAL', 'EXCESSO'];
const stmtByStatus = db.prepare('SELECT * FROM compras_estoque_cache WHERE status_ruptura = ? LIMIT 50');
measureBenchmark('Busca por status_ruptura (idx_cec_status)', 300, (i) => {
  const s = statuses[i % statuses.length];
  stmtByStatus.all(s);
});

// 4. Busca por curva_abc (idx_cec_curva Index)
const curvas = ['A', 'B', 'C'];
const stmtByCurva = db.prepare('SELECT * FROM compras_estoque_cache WHERE curva_abc = ? LIMIT 50');
measureBenchmark('Busca por curva_abc (idx_cec_curva)', 300, (i) => {
  const c = curvas[i % curvas.length];
  stmtByCurva.all(c);
});

// 5. Busca por prefixo de descrição (idx_cec_descricao Index Range Scan)
const prefixes = ['DIP%', 'PAR%', 'OME%', 'AMO%', 'IBU%', 'LOS%'];
const stmtByDescPrefix = db.prepare('SELECT * FROM compras_estoque_cache WHERE descricao LIKE ? LIMIT 20');
measureBenchmark('Busca por Prefixo Descrição LIKE (idx_cec_descricao)', 300, (i) => {
  const p = prefixes[i % prefixes.length];
  stmtByDescPrefix.all(p);
});

// 6. Query Combinada Status + Curva
const stmtCombined = db.prepare('SELECT produto_id, descricao, saldo, est_minimo_calculado, status_ruptura FROM compras_estoque_cache WHERE status_ruptura = ? AND curva_abc = ? LIMIT 50');
measureBenchmark('Busca Combinada (Status + Curva ABC)', 300, (i) => {
  stmtCombined.all('RUPTURA', 'A');
});

// 7. Leitura Completa das 11 Novas Colunas
const stmtFullNewCols = db.prepare(`
  SELECT produto_id, apresentacao, preco_venda_vigente, preco_normal, preco_promocional,
         inicio_promocao, termino_promocao, preco_unitario_ult_compra,
         ultima_compra_fornecedor, ultima_compra_data, ultima_compra_nf, qtd_sugerida_compra
  FROM compras_estoque_cache
  WHERE produto_id = ?
`);
measureBenchmark('Leitura Completa das 11 Novas Colunas (por ID)', 500, (i) => {
  const targetId = sampleRows[i % sampleRows.length].produto_id;
  stmtFullNewCols.get(targetId);
});

// ─────────────────────────────────────────────────────────────
// RESUMO FINAL
// ─────────────────────────────────────────────────────────────
console.log('\n===============================================================');
console.log('RESUMO DOS TESTES: TOTAL = ' + results.total + ' | APROVADOS = ' + results.passed + ' | FALHAS = ' + results.failed);
console.log('===============================================================');

if (results.failed > 0) {
  console.error('\n🚨 ALGUNS TESTES FALHARAM!');
  process.exit(1);
} else {
  console.log('\n✅ TODOS OS TESTES PASSARAM COM SUCESSO!');
  process.exit(0);
}