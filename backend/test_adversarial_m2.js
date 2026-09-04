/**
 * test_adversarial_m2.js
 * 
 * Suíte de Testes Adversariais e Casos de Borda para o Milestone M2:
 * Inteligência de Estoque (30d/2x), Resolução de Preços Vigentes e Sincronização Resiliente.
 * 
 * Execução Empírica pelo Challenger 1 (Adversarial Critic & Specialist)
 */

const assert = require('node:assert');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Carrega os módulos sob auditoria
const medicamentosBuscaService = require('./services/medicamentos-busca.service');
const comprasEstoqueService = require('./services/compras-estoque.service');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testQueue = [];

function runTest(name, fn) {
  testQueue.push({ name, fn, isAsync: false });
}

function runAsyncTest(name, fn) {
  testQueue.push({ name, fn, isAsync: true });
}

async function runAllTests() {
  for (const t of testQueue) {
    totalTests++;
    try {
      if (t.isAsync) {
        await t.fn();
      } else {
        t.fn();
      }
      console.log(`  ✅ [PASS] ${t.name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${t.name}`);
      console.error(`     Erro: ${err.message}`);
      failedTests++;
    }
  }
}


console.log('================================================================================');
console.log('⚔️  SUÍTE ADVERSARIAL: EMPIRICAL CHALLENGER 1 — MILESTONE M2');
console.log(`   Data/Hora Local: ${new Date().toISOString()}`);
console.log('================================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. CASOS EXTREMOS: calcularInteligenciaEstoque
// ─────────────────────────────────────────────────────────────────────────────
console.log('🧪 [GRUPO 1] Casos Extremos para calcularInteligenciaEstoque');

const { calcularInteligenciaEstoque } = medicamentosBuscaService;

runTest('1.1 Saldo fortemente negativo (-50 un) com giro ativo (VMD = 2, margem = 15%)', () => {
  // 2 * 30 * 1.15 = 69 -> min = 69, max = 138
  // qtd sugerida = min - saldo = 69 - (-50) = 119
  const res = calcularInteligenciaEstoque(-50, 2, 15, 'C');
  assert.strictEqual(res.est_minimo_calculado, 69);
  assert.strictEqual(res.est_maximo_calculado, 138);
  assert.strictEqual(res.qtd_sugerida_compra, 119);
  assert.strictEqual(res.status_ruptura, 'RUPTURA');
});

runTest('1.2 Saldo fracionário negativo (-0.01 un) com giro ativo (VMD = 1, margem = 15%)', () => {
  // 1 * 30 * 1.15 = 34.5 -> ceil = 35, max = 70
  // qtd sugerida = 35 - (-0.01) = 35.01
  const res = calcularInteligenciaEstoque(-0.01, 1, 15, 'C');
  assert.strictEqual(res.est_minimo_calculado, 35);
  assert.strictEqual(res.est_maximo_calculado, 70);
  assert.strictEqual(res.qtd_sugerida_compra, 35.01);
  assert.strictEqual(res.status_ruptura, 'RUPTURA');
});

runTest('1.3 Giro nulo (VMD = 0) com saldo zero', () => {
  const res = calcularInteligenciaEstoque(0, 0, 15, 'C');
  assert.strictEqual(res.est_minimo_calculado, 0);
  assert.strictEqual(res.est_maximo_calculado, 0);
  assert.strictEqual(res.qtd_sugerida_compra, 0);
  assert.strictEqual(res.status_ruptura, 'RUPTURA'); // saldo <= 0 é ruptura por definição
});

runTest('1.4 Giro nulo (VMD = 0) com saldo positivo (saldo = 10)', () => {
  const res = calcularInteligenciaEstoque(10, 0, 15, 'C');
  assert.strictEqual(res.est_minimo_calculado, 0);
  assert.strictEqual(res.est_maximo_calculado, 0);
  assert.strictEqual(res.qtd_sugerida_compra, 0);
  assert.strictEqual(res.status_ruptura, 'EXCESSO'); // saldo > max (10 > 0)
});

runTest('1.5 Giro nulo (VMD = 0) com saldo negativo (-10 un)', () => {
  const res = calcularInteligenciaEstoque(-10, 0, 15, 'C');
  assert.strictEqual(res.est_minimo_calculado, 0);
  assert.strictEqual(res.est_maximo_calculado, 0);
  assert.strictEqual(res.qtd_sugerida_compra, 10); // cobre o furo do saldo negativo
  assert.strictEqual(res.status_ruptura, 'RUPTURA');
});

runTest('1.6 Margem zero (0%) com VMD = 1', () => {
  // 1 * 30 * 1.0 = 30
  const res = calcularInteligenciaEstoque(5, 1, 0, 'C');
  assert.strictEqual(res.est_minimo_calculado, 30);
  assert.strictEqual(res.est_maximo_calculado, 60);
  assert.strictEqual(res.qtd_sugerida_compra, 25);
  assert.strictEqual(res.status_ruptura, 'ABAIXO_MINIMO');
});

runTest('1.7 Margem de 100% com VMD = 1', () => {
  // 1 * 30 * (1 + 100/100) = 60
  const res = calcularInteligenciaEstoque(10, 1, 100, 'C');
  assert.strictEqual(res.est_minimo_calculado, 60);
  assert.strictEqual(res.est_maximo_calculado, 120);
  assert.strictEqual(res.qtd_sugerida_compra, 50);
  assert.strictEqual(res.status_ruptura, 'ABAIXO_MINIMO');
});

runTest('1.8 Margem extrema de 500% com VMD = 0.5', () => {
  // 0.5 * 30 * (1 + 5) = 15 * 6 = 90
  const res = calcularInteligenciaEstoque(0, 0.5, 500, 'B');
  assert.strictEqual(res.est_minimo_calculado, 90);
  assert.strictEqual(res.est_maximo_calculado, 180);
  assert.strictEqual(res.qtd_sugerida_compra, 90);
});

runTest('1.9 Piso Curva A com vendas fracionadas minúsculas (VMD = 0.001)', () => {
  // 0.001 * 30 * 1.15 = 0.0345 -> ceil = 1 -> piso Curva A força 2
  const res = calcularInteligenciaEstoque(1, 0.001, 15, 'A');
  assert.strictEqual(res.est_minimo_calculado, 2, 'Piso Curva A deve ser 2 unidades');
  assert.strictEqual(res.est_maximo_calculado, 4, 'Máximo deve ser 2x o piso = 4');
  assert.strictEqual(res.qtd_sugerida_compra, 1);
  assert.strictEqual(res.status_ruptura, 'ABAIXO_MINIMO');
});

runTest('1.10 Piso Curva A superado quando demanda natural > 2', () => {
  // VMD = 0.1 -> 0.1 * 30 * 1.15 = 3.45 -> ceil = 4 (> 2)
  const res = calcularInteligenciaEstoque(4, 0.1, 15, 'A');
  assert.strictEqual(res.est_minimo_calculado, 4);
  assert.strictEqual(res.est_maximo_calculado, 8);
  assert.strictEqual(res.qtd_sugerida_compra, 0);
  assert.strictEqual(res.status_ruptura, 'NORMAL');
});

runTest('1.11 Curva A em DORMÊNCIA (VMD = 0): não deve forçar piso de 2 unidades em item sem saída', () => {
  // Item Curva A morto/sem giro não pode gerar pedido falso
  const res = calcularInteligenciaEstoque(0, 0, 15, 'A');
  assert.strictEqual(res.est_minimo_calculado, 0, 'Dormência em Curva A deve resultar em mínimo 0');
  assert.strictEqual(res.est_maximo_calculado, 0);
  assert.strictEqual(res.qtd_sugerida_compra, 0);
  assert.strictEqual(res.status_ruptura, 'RUPTURA');
});

runTest('1.12 Produto inativo (ativo = false) com VMD positivo e Curva A', () => {
  const res = calcularInteligenciaEstoque(0, 5, 15, 'A', false);
  assert.strictEqual(res.est_minimo_calculado, 0);
  assert.strictEqual(res.est_maximo_calculado, 0);
  assert.strictEqual(res.qtd_sugerida_compra, 0);
  assert.strictEqual(res.status_ruptura, 'RUPTURA');
});

runTest('1.13 Entradas malformadas e sanitização adversarial', () => {
  const res = calcularInteligenciaEstoque('invalido', null, undefined, 123);
  assert.strictEqual(res.est_minimo_calculado, 0);
  assert.strictEqual(res.est_maximo_calculado, 0);
  assert.strictEqual(res.qtd_sugerida_compra, 0);
  assert.strictEqual(res.status_ruptura, 'RUPTURA');
});

runTest('1.14 VMD negativo é sanitizado para zero', () => {
  const res = calcularInteligenciaEstoque(10, -5, 15, 'C');
  assert.strictEqual(res.est_minimo_calculado, 0);
  assert.strictEqual(res.est_maximo_calculado, 0);
  assert.strictEqual(res.qtd_sugerida_compra, 0);
  assert.strictEqual(res.status_ruptura, 'EXCESSO');
});

runTest('1.15 Frações periódicas e float precision (VMD = 1/3, 1/7)', () => {
  // VMD = 1/3 -> 1/3 * 30 * 1.15 = 10 * 1.15 = 11.5 -> ceil = 12
  const res1 = calcularInteligenciaEstoque(5, 1/3, 15, 'C');
  assert.strictEqual(res1.est_minimo_calculado, 12);
  assert.strictEqual(res1.est_maximo_calculado, 24);
  assert.strictEqual(res1.qtd_sugerida_compra, 7);
  assert.strictEqual(res1.status_ruptura, 'ABAIXO_MINIMO');

  // VMD = 1/7 -> (1/7) * 30 * 1.15 = 4.92857 -> ceil = 5
  const res2 = calcularInteligenciaEstoque(5, 1/7, 15, 'C');
  assert.strictEqual(res2.est_minimo_calculado, 5);
  assert.strictEqual(res2.est_maximo_calculado, 10);
  assert.strictEqual(res2.qtd_sugerida_compra, 0);
  assert.strictEqual(res2.status_ruptura, 'NORMAL');
});

runTest('1.16 Valores numéricos infinitos (Infinity, -Infinity)', () => {
  const res1 = calcularInteligenciaEstoque(-Infinity, 1, 15, 'C');
  assert.strictEqual(res1.status_ruptura, 'RUPTURA');
  assert.strictEqual(res1.est_minimo_calculado, 35);
});


// ─────────────────────────────────────────────────────────────────────────────
// 2. CASOS DE BORDA: resolverPrecoVigente
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🏷️  [GRUPO 2] Casos de Borda para resolverPrecoVigente');

const { resolverPrecoVigente, resolverPrecoVigenteDetalhado } = medicamentosBuscaService;

runTest('2.1 Exato segundo e milissegundo no término da promoção (23:59:59.000 e 23:59:59.999)', () => {
  const prod = {
    preco_normal: 50.00,
    preco_promocional: 35.00,
    inicio_promocao: '2026-09-01',
    termino_promocao: '2026-09-04'
  };

  // 23:59:59.000 do dia 04 -> ainda ativa
  const dataAtiva1 = new Date('2026-09-04T23:59:59.000');
  assert.strictEqual(resolverPrecoVigente(prod, dataAtiva1), 35.00, '23:59:59.000 deve ser promocional');

  // 23:59:59.999 do dia 04 -> último milissegundo ativo
  const dataAtiva2 = new Date('2026-09-04T23:59:59.999');
  assert.strictEqual(resolverPrecoVigente(prod, dataAtiva2), 35.00, '23:59:59.999 deve ser promocional');

  // 00:00:00.000 do dia seguinte 05 -> expirada, volta ao normal
  const dataExpirada = new Date('2026-09-05T00:00:00.000');
  assert.strictEqual(resolverPrecoVigente(prod, dataExpirada), 50.00, '00:00:00.000 do dia seguinte deve ser preço normal');
});

runTest('2.2 Exato milissegundo no início da promoção (00:00:00.000 vs 23:59:59.999 anterior)', () => {
  const prod = {
    preco_normal: 80.00,
    preco_promocional: 60.00,
    inicio_promocao: '2026-09-01',
    termino_promocao: '2026-09-04'
  };

  // 23:59:59.999 do dia anterior 31/08 -> não iniciada
  const dataAntes = new Date('2026-08-31T23:59:59.999');
  assert.strictEqual(resolverPrecoVigente(prod, dataAntes), 80.00);

  // 00:00:00.000 do dia 01/09 -> início da promoção
  const dataInicio = new Date('2026-09-01T00:00:00.000');
  assert.strictEqual(resolverPrecoVigente(prod, dataInicio), 60.00);
});

runTest('2.3 Formatos de data sem horário (10 chars YYYY-MM-DD)', () => {
  const prod = {
    preco_normal: 100.00,
    preco_promocional: 75.00,
    inicio_promocao: '2026-09-04',
    termino_promocao: '2026-09-04'
  };

  // Meio-dia do próprio dia deve estar plenamente ativo
  const meioDia = new Date('2026-09-04T12:00:00.000');
  assert.strictEqual(resolverPrecoVigente(prod, meioDia), 75.00);
});

runTest('2.4 Formato com Timestamp com hora explícita (Firebird / ISO)', () => {
  const prod = {
    preco_normal: 40.00,
    preco_promocional: 30.00,
    inicio_promocao: '2026-09-04 08:00:00',
    termino_promocao: '2026-09-04 18:00:00'
  };

  // Às 07:59:59 -> normal
  assert.strictEqual(resolverPrecoVigente(prod, new Date('2026-09-04 07:59:59')), 40.00);
  // Às 12:00:00 -> promocional
  assert.strictEqual(resolverPrecoVigente(prod, new Date('2026-09-04 12:00:00')), 30.00);
  // Às 18:00:01 -> normal
  assert.strictEqual(resolverPrecoVigente(prod, new Date('2026-09-04 18:00:01')), 40.00);
});

runTest('2.5 Promoções com preço promocional zerado ou nulo', () => {
  const prodZero = {
    preco_normal: 25.00,
    preco_promocional: 0,
    inicio_promocao: '2026-09-01',
    termino_promocao: '2026-09-30'
  };
  assert.strictEqual(resolverPrecoVigente(prodZero, new Date('2026-09-04')), 25.00);

  const prodNull = {
    preco_normal: 25.00,
    preco_promocional: null,
    inicio_promocao: '2026-09-01',
    termino_promocao: '2026-09-30'
  };
  assert.strictEqual(resolverPrecoVigente(prodNull, new Date('2026-09-04')), 25.00);
});

runTest('2.6 Promoção com preço negativo', () => {
  const prodNeg = {
    preco_normal: 25.00,
    preco_promocional: -5.00,
    inicio_promocao: '2026-09-01',
    termino_promocao: '2026-09-30'
  };
  assert.strictEqual(resolverPrecoVigente(prodNeg, new Date('2026-09-04')), 25.00);
});

runTest('2.7 Inversão cronológica adversarial (término anterior ao início)', () => {
  const prodAnomalo = {
    preco_normal: 99.00,
    preco_promocional: 49.00,
    inicio_promocao: '2026-09-30',
    termino_promocao: '2026-09-01'
  };
  // Em qualquer data, não deve ativar promoção impossível
  assert.strictEqual(resolverPrecoVigente(prodAnomalo, new Date('2026-09-15')), 99.00);
});

runTest('2.8 Produto com datas corrompidas ou strings inválidas', () => {
  const prodCorrompido = {
    preco_normal: 15.50,
    preco_promocional: 9.90,
    inicio_promocao: 'DATA_INVALIDA',
    termino_promocao: 'NUNCA'
  };
  assert.strictEqual(resolverPrecoVigente(prodCorrompido, new Date()), 15.50);
});

runTest('2.9 Argumentos não-objeto ou nulos', () => {
  assert.strictEqual(resolverPrecoVigente(null), 0);
  assert.strictEqual(resolverPrecoVigente(undefined), 0);
  assert.strictEqual(resolverPrecoVigente('string'), 0);
  assert.strictEqual(resolverPrecoVigente(123), 0);
});

runTest('2.10 resolverPrecoVigenteDetalhado retorna metadados consistentes', () => {
  const prod = {
    preco_normal: 50.00,
    preco_promocional: 35.00,
    inicio_promocao: '2026-09-01',
    termino_promocao: '2026-09-30'
  };
  const det = resolverPrecoVigenteDetalhado(prod, new Date('2026-09-15'));
  assert.strictEqual(det.precoVigente, 35.00);
  assert.strictEqual(det.preco_venda_vigente, 35.00);
  assert.strictEqual(det.promocaoAtiva, true);
  assert.strictEqual(det.precoNormal, 50.00);
  assert.strictEqual(det.precoPromocional, 35.00);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RESILIÊNCIA DA SINCRONIZAÇÃO: Firebird Offline & Fallback
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🔄 [GRUPO 3] Resiliência da Sincronização e Fallback SQLite');

const { sincronizarEstoqueMedicamentos } = medicamentosBuscaService;

function criarBancoIsoladoTeste() {
  const testDb = new Database(':memory:');
  
  testDb.exec(`
    CREATE TABLE compras_estoque_cache (
      produto_id INTEGER PRIMARY KEY,
      descricao TEXT NOT NULL,
      apresentacao TEXT,
      ean TEXT,
      categoria_id INTEGER,
      curva_abc TEXT DEFAULT 'C',
      saldo REAL DEFAULT 0,
      est_minimo_calculado INTEGER DEFAULT 0,
      est_maximo_calculado INTEGER DEFAULT 0,
      est_minimo_digifarma INTEGER DEFAULT 0,
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
      preco_normal REAL DEFAULT 0,
      preco_promocional REAL DEFAULT 0,
      inicio_promocao TEXT,
      termino_promocao TEXT,
      preco_venda_vigente REAL DEFAULT 0,
      qtd_sugerida_compra INTEGER DEFAULT 0,
      status_ruptura TEXT DEFAULT 'NORMAL',
      margem_seguranca_aplicada REAL DEFAULT 15,
      dias_sem_venda INTEGER DEFAULT 0,
      atualizado_em TEXT
    );

    CREATE TABLE digifarma_ultimas_compras_cache (
      produto_id INTEGER PRIMARY KEY,
      ean TEXT,
      preco_unitario_ult_compra REAL NOT NULL,
      data_compra TEXT,
      fornecedor_nome TEXT,
      numero_nota_fiscal TEXT,
      embalagem INTEGER DEFAULT 1,
      atualizado_em TEXT
    );
  `);

  return testDb;
}

runAsyncTest('3.1 Sincronização com forceOffline: true processa dados locais com sucesso total', async () => {
  const testDb = criarBancoIsoladoTeste();

  // Insere registros prévios no cache local
  testDb.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, vendas_30d, vendas_31_60d, vendas_61_90d,
      custo_unitario, preco_normal, preco_promocional, inicio_promocao, termino_promocao
    ) VALUES (
      1001, 'DIPIRONA 500MG GTS', '789123456001', 0, 100, 50, 20,
      2.50, 8.00, 5.50, '2026-09-01', '2026-09-30'
    )
  `).run();

  // Insere metadados em digifarma_ultimas_compras_cache
  testDb.prepare(`
    INSERT INTO digifarma_ultimas_compras_cache (
      produto_id, ean, preco_unitario_ult_compra, fornecedor_nome, numero_nota_fiscal, data_compra
    ) VALUES (
      1001, '789123456001', 2.30, 'DISTRIBUIDORA EXEMPLO', 'NF-12345', '2026-09-02'
    )
  `).run();

  const syncResult = await sincronizarEstoqueMedicamentos(testDb, {
    forceOffline: true,
    margemSegurancaPercent: 15
  });

  assert.strictEqual(syncResult.success, true, 'Sincronização offline deve retornar success: true');
  assert.strictEqual(syncResult.fromCache, true, 'Deve indicar que operou a partir do cache local');
  assert.strictEqual(syncResult.totalSincronizados, 1);
  assert.strictEqual(syncResult.itensCriticos, 1, 'Dipirona com saldo 0 deve ser classificada como crítico');

  // Verifica persistência e recálculo
  const row = testDb.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = 1001').get();
  assert.ok(row, 'Registro deve existir no banco');
  assert.strictEqual(row.status_ruptura, 'RUPTURA');
  assert.strictEqual(row.preco_venda_vigente, 5.50, 'Deve ter resolvido preço promocional');
  assert.strictEqual(row.preco_unitario_ult_compra, 2.30, 'Deve ter mesclado última compra especializada');
  assert.strictEqual(row.ultima_compra_fornecedor, 'DISTRIBUIDORA EXEMPLO');
  assert.strictEqual(row.est_maximo_calculado, row.est_minimo_calculado * 2, 'Máximo deve ser 2x o mínimo');
  assert.strictEqual(row.qtd_sugerida_compra, row.est_minimo_calculado, 'Saldo 0 -> sugerida = mínimo');
});

runAsyncTest('3.2 Sincronização com base SQLite vazia e forceOffline: true não quebra', async () => {
  const testDb = criarBancoIsoladoTeste();

  const syncResult = await sincronizarEstoqueMedicamentos(testDb, { forceOffline: true });
  assert.strictEqual(syncResult.success, true);
  assert.strictEqual(syncResult.fromCache, true);
  assert.strictEqual(syncResult.totalSincronizados, 0);
  assert.strictEqual(syncResult.itensCriticos, 0);
});

runAsyncTest('3.3 Idempotência: sincronizações consecutivas preservam consistência via ON CONFLICT DO UPDATE', async () => {
  const testDb = criarBancoIsoladoTeste();

  testDb.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, vendas_30d, vendas_31_60d, vendas_61_90d,
      custo_unitario, preco_normal
    ) VALUES (
      2001, 'PARACETAMOL 750MG', '789123456002', 15, 60, 40, 30,
      1.80, 7.50
    )
  `).run();

  // 1ª Sincronização
  await sincronizarEstoqueMedicamentos(testDb, { forceOffline: true });
  const row1 = testDb.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = 2001').get();
  const min1 = row1.est_minimo_calculado;

  // Altera o saldo localmente simulando venda
  testDb.prepare('UPDATE compras_estoque_cache SET saldo = 5 WHERE produto_id = 2001').run();

  // 2ª Sincronização
  await sincronizarEstoqueMedicamentos(testDb, { forceOffline: true });
  const row2 = testDb.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = 2001').get();

  assert.strictEqual(row2.est_minimo_calculado, min1, 'Estoque mínimo recalculado deve ser idempotente');
  assert.strictEqual(row2.saldo, 5, 'Saldo atualizado deve ser mantido');
  assert.strictEqual(row2.qtd_sugerida_compra, Math.max(0, min1 - 5), 'Qtd sugerida deve refletir o novo saldo');
});

runAsyncTest('3.4 Tolerância a falha em notificarHoracio (não deve derrubar a sincronização)', async () => {
  const testDb = criarBancoIsoladoTeste();

  testDb.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, vendas_30d, vendas_31_60d, vendas_61_90d,
      custo_unitario, preco_normal
    ) VALUES (
      3001, 'LOSARTANA 50MG', '789123456003', 0, 30, 30, 30,
      3.00, 9.00
    )
  `).run();

  // Dispara com flag notificarHoracio: true mesmo que horacioAgent não possua banco real configurado
  const res = await sincronizarEstoqueMedicamentos(testDb, {
    forceOffline: true,
    notificarHoracio: true
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.totalSincronizados, 1);
  assert.strictEqual(res.itensCriticos, 1);
});

runAsyncTest('3.5 Simulação de queda/timeout do Firebird com forceOffline: false recuperando via cache', async () => {
  const testDb = criarBancoIsoladoTeste();
  testDb.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, vendas_30d, vendas_31_60d, vendas_61_90d,
      custo_unitario, preco_normal
    ) VALUES (
      4001, 'AMOXICILINA 500MG', '789123456004', 5, 45, 30, 15,
      4.00, 12.00
    )
  `).run();

  const digifarmaService = require('./services/digifarma.service');
  const originalQuery = digifarmaService.queryDigifarma;
  digifarmaService.queryDigifarma = async () => {
    throw new Error('ETIMEDOUT: Connection to Firebird (192.168.1.10:3050) timed out after 60000ms');
  };

  // Recarrega o módulo medicamentos-busca.service para que ele capture a função mockada
  delete require.cache[require.resolve('./services/medicamentos-busca.service')];
  const reloadedService = require('./services/medicamentos-busca.service');

  try {
    const res = await reloadedService.sincronizarEstoqueMedicamentos(testDb, { forceOffline: false });
    assert.strictEqual(res.success, true, 'Sincronização deve continuar com sucesso via fallback');
    assert.strictEqual(res.fromCache, true, 'Deve indicar fromCache: true');
    assert.strictEqual(res.totalSincronizados, 1);
    const row = testDb.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = 4001').get();
    assert.ok(row);
    assert.strictEqual(row.status_ruptura, row.saldo < row.est_minimo_calculado ? 'ABAIXO_MINIMO' : 'NORMAL');
  } finally {
    digifarmaService.queryDigifarma = originalQuery;
    delete require.cache[require.resolve('./services/medicamentos-busca.service')];
  }
});

runAsyncTest('3.7 Vulnerabilidade: Firebird retornando Date objects para INICIO_PROMOCAO/TERMINO_PROMOCAO', async () => {
  const testDb = criarBancoIsoladoTeste();

  const digifarmaService = require('./services/digifarma.service');
  const originalQuery = digifarmaService.queryDigifarma;
  // Simula o retorno padrão do driver node-firebird que converte campos TIMESTAMP em instâncias de Date
  digifarmaService.queryDigifarma = async () => {
    return [
      {
        PRODUTO_ID: 9001,
        DESCRICAO: 'PRODUTO COM PROMOCAO DATE FIREBIRD',
        APRESENTACAO: 'CX 1',
        COD_BARRAS: '789999001',
        CATEGORIA_ID: 1,
        PROD_SALDO: 10,
        PROD_ESTMINIMO: 5,
        CUSTO_UNITARIO: 10.00,
        VALOR_ULT_COMPRA: 9.50,
        PRECO_NORMAL: 20.00,
        PRECO_PROMOCIONAL: 15.00,
        INICIO_PROMOCAO: new Date('2026-09-01T00:00:00.000Z'),
        TERMINO_PROMOCAO: new Date('2026-09-30T23:59:59.999Z'),
        PROD_ATIVO: 'S',
        VENDAS_30D: 30,
        VENDAS_31_60D: 20,
        VENDAS_61_90D: 10
      }
    ];
  };

  delete require.cache[require.resolve('./services/medicamentos-busca.service')];
  const reloadedService = require('./services/medicamentos-busca.service');

  try {
    const res = await reloadedService.sincronizarEstoqueMedicamentos(testDb, { forceOffline: false });
    // Verifica se os dados foram realmente persistidos no SQLite
    const saved = testDb.prepare('SELECT COUNT(*) as c FROM compras_estoque_cache WHERE produto_id = 9001').get();
    assert.strictEqual(saved.c, 1, 'Produto retornado pelo Firebird deve ser salvo com sucesso no banco SQLite');
    assert.strictEqual(res.totalSincronizados, 1);
  } finally {
    digifarmaService.queryDigifarma = originalQuery;
    delete require.cache[require.resolve('./services/medicamentos-busca.service')];
  }
});


runAsyncTest('3.6 Teste de estresse com 1.000 produtos processados em transação atômica SQLite', async () => {
  const testDb = criarBancoIsoladoTeste();
  const insertStmt = testDb.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, vendas_30d, vendas_31_60d, vendas_61_90d,
      custo_unitario, preco_normal, preco_promocional, inicio_promocao, termino_promocao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const txInsert = testDb.transaction(() => {
    for (let i = 1; i <= 1000; i++) {
      const saldo = (i % 5 === 0) ? 0 : (i % 3 === 0 ? -2 : i % 20);
      insertStmt.run(
        10000 + i,
        `MEDICAMENTO TESTE ESTRESSE ${i}`,
        `78999999${String(i).padStart(4, '0')}`,
        saldo,
        (i % 50) + 1,
        (i % 30) + 1,
        (i % 20) + 1,
        5.00,
        20.00,
        (i % 2 === 0) ? 15.00 : 0,
        '2026-09-01',
        '2026-09-30'
      );
    }
  });
  txInsert();

  const t0 = Date.now();
  const res = await sincronizarEstoqueMedicamentos(testDb, { forceOffline: true });
  const duration = Date.now() - t0;

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.totalSincronizados, 1000);
  assert.ok(res.itensCriticos > 0, 'Deve identificar itens críticos');
  assert.ok(duration < 2000, `Processamento de 1.000 produtos deve levar < 2000ms (levou ${duration}ms)`);
  console.log(`         Estresse 1.000 produtos: ${duration}ms (${(duration / 1000).toFixed(3)}ms por item)`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PARIDADE: medicamentos-busca.service vs compras-estoque.service
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n⚖️  [GRUPO 4] Paridade entre Medicamentos Busca e Compras Estoque');

const { calcularDemandaPonderada } = comprasEstoqueService;

runTest('4.1 Paridade na fórmula de 30 dias para entradas normais (100 un em 30d, 50 un em 60d)', () => {
  // ComprasEstoque modo legado (2 períodos):
  // demanda = 100 * 0.65 + 50 * 0.35 = 65 + 17.5 = 82.5
  // min = ceil(82.5 * 1.15) = ceil(94.875) = 95
  const leg = calcularDemandaPonderada(100, 50, 15);
  assert.strictEqual(leg.estoqueMinimoSugerido, 95);
  assert.strictEqual(leg.estoqueMaximoSugerido, 190);

  // MedicamentosBusca 3 períodos com v90=0 e vmd = (100*0.5 + 50*0.3)/30 = 65/30 = 2.1667
  // min = ceil(2.1667 * 30 * 1.15) = ceil(65 * 1.15) = ceil(74.75) = 75
  const vmd = Number((((100 * 0.50) + (50 * 0.30) + (0 * 0.20)) / 30).toFixed(4));
  const busca = calcularInteligenciaEstoque(0, vmd, 15, 'C');
  assert.strictEqual(busca.est_maximo_calculado, busca.est_minimo_calculado * 2);
  assert.strictEqual(busca.est_minimo_calculado, 75);
  assert.strictEqual(busca.est_maximo_calculado, 150);
});

runTest('4.2 Ambos fixam rigorosamente estoque máximo como 2x o estoque mínimo', () => {
  const minVals = [1, 2, 5, 10, 35, 100, 250];
  for (const m of minVals) {
    const resBusca = calcularInteligenciaEstoque(0, m / 30, 0, 'C');
    assert.strictEqual(resBusca.est_maximo_calculado, resBusca.est_minimo_calculado * 2);
  }
});

runTest('4.3 Ambos aplicam o piso de 2 unidades para produtos Curva A com movimentação', () => {
  const legA = calcularDemandaPonderada(1, 0, 15, { curvaAbc: 'A' });
  assert.strictEqual(legA.estoqueMinimoSugerido, 2);
  assert.strictEqual(legA.estoqueMaximoSugerido, 4);

  const buscaA = calcularInteligenciaEstoque(1, 0.01, 15, 'A');
  assert.strictEqual(buscaA.est_minimo_calculado, 2);
  assert.strictEqual(buscaA.est_maximo_calculado, 4);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. ROBUSTEZ DE BUSCA E SANITIZAÇÃO SQL
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🛡️  [GRUPO 5] Robustez de Busca e Sanitização SQL');

const { buscarMedicamentos, obterMedicamentoPorId, obterRupturas } = medicamentosBuscaService;

runTest('5.1 Tentativa de SQL Injection em buscarMedicamentos é bloqueada por queries parametrizadas', () => {
  const testDb = criarBancoIsoladoTeste();
  testDb.prepare(`
    INSERT INTO compras_estoque_cache (produto_id, descricao, ean, saldo)
    VALUES (5001, 'IBUPROFENO 600MG', '789123456005', 20)
  `).run();

  const injResult = buscarMedicamentos(testDb, { q: "'; DROP TABLE compras_estoque_cache; --" });
  assert.strictEqual(injResult.success, true);
  assert.strictEqual(injResult.total, 0);

  // Valida que a tabela permanece intacta
  const check = testDb.prepare('SELECT COUNT(*) as c FROM compras_estoque_cache').get();
  assert.strictEqual(check.c, 1);
});

runTest('5.2 buscarMedicamentos com caracteres curinga e whitespace', () => {
  const testDb = criarBancoIsoladoTeste();
  testDb.prepare(`
    INSERT INTO compras_estoque_cache (produto_id, descricao, ean, saldo)
    VALUES (5002, 'DIPIRONA 500MG GTS', '789123456006', 10)
  `).run();

  // Termo apenas com espaços
  const resEspaco = buscarMedicamentos(testDb, { q: '   ' });
  assert.strictEqual(resEspaco.success, true);
  assert.strictEqual(resEspaco.total, 1);

  // Termo com símbolo de percentual
  const resPct = buscarMedicamentos(testDb, { q: '%' });
  assert.strictEqual(resPct.success, true);
});

runTest('5.3 obterMedicamentoPorId com entradas nulas, inválidas e tipos heterogêneos', () => {
  const testDb = criarBancoIsoladoTeste();
  testDb.prepare(`
    INSERT INTO compras_estoque_cache (produto_id, descricao, ean, saldo)
    VALUES (5003, 'OMEPRAZOL 20MG', '789123456007', 30)
  `).run();

  assert.strictEqual(obterMedicamentoPorId(testDb, null), null);
  assert.strictEqual(obterMedicamentoPorId(testDb, undefined), null);
  assert.strictEqual(obterMedicamentoPorId(testDb, ''), null);
  assert.strictEqual(obterMedicamentoPorId(testDb, 'nao_existe'), null);
  assert.strictEqual(obterMedicamentoPorId(testDb, 999999), null);

  // ID como número
  const numRow = obterMedicamentoPorId(testDb, 5003);
  assert.strictEqual(numRow.descricao, 'OMEPRAZOL 20MG');

  // ID como string
  const strRow = obterMedicamentoPorId(testDb, '5003');
  assert.strictEqual(strRow.descricao, 'OMEPRAZOL 20MG');

  // Busca por EAN via mesmo método
  const eanRow = obterMedicamentoPorId(testDb, '789123456007');
  assert.strictEqual(eanRow.produto_id, 5003);
});

runTest('5.4 obterRupturas com filtro de curva ABC inexistente', () => {
  const testDb = criarBancoIsoladoTeste();
  testDb.prepare(`
    INSERT INTO compras_estoque_cache (produto_id, descricao, ean, saldo, status_ruptura, curva_abc)
    VALUES (5004, 'PARACETAMOL', '789123456008', 0, 'RUPTURA', 'A')
  `).run();

  const resZ = obterRupturas(testDb, { curva: 'Z' });
  assert.strictEqual(resZ.success, true);
  assert.strictEqual(resZ.total, 0);
  assert.strictEqual(resZ.items.length, 0);

  const resA = obterRupturas(testDb, { curva: 'A' });
  assert.strictEqual(resA.success, true);
  assert.strictEqual(resA.total, 1);
  assert.strictEqual(resA.items[0].produto_id, 5004);
});

// ─────────────────────────────────────────────────────────────────────────────
// CONSOLIDAÇÃO FINAL
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  await runAllTests();

  console.log('\n================================================================================');
  console.log('🏁 RESULTADO CONSOLIDADO DOS TESTES ADVERSARIAIS (M2)');
  console.log(`   Total Executados: ${totalTests}`);
  console.log(`   Aprovados (PASS): ${passedTests} ✅`);
  console.log(`   Falhas (FAIL):    ${failedTests} ❌`);
  console.log(`   Taxa de Sucesso:  ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();

