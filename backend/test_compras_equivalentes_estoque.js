/**
 * test_compras_equivalentes_estoque.js
 * Suíte de Testes Automatizados para:
 * 1. Consolidação de Estoque Mínimo e Saldo de Produtos Equivalentes
 * 2. Previsão de Duração de Estoque (Dias e Data Projetada de Esgotamento)
 * 3. Trava de Reposição pelo Estoque Mínimo do Grupo
 * 4. Regras do Agente Horácio (Compra de Oportunidade Extremamente Vantajosa >= 25% Curva A/B)
 */

const assert = require('assert');
const crypto = require('crypto');
const db = require('./database');
const equivService = require('./services/compras-equivalentes.service');
const estoqueService = require('./services/compras-estoque.service');
const horacioAgent = require('./services/horacio-agent.service');

let passedTests = 0;
let failedTests = 0;

async function executeTest(testName, fn) {
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

// -------------------------------------------------------------
// SETUP DE DADOS DE TESTE EM MEMÓRIA / SQLITE
// -------------------------------------------------------------
const testGrupoId = 'test-grupo-' + crypto.randomUUID();
const prodA_Id = 999901;
const prodB_Id = 999902;
const prodC_Id = 999903;

function setupMockData() {
  const now = new Date().toISOString();

  // Insere grupo de teste
  db.prepare(`
    INSERT OR REPLACE INTO compras_grupos_equivalentes (
      id, nome_grupo, principio_ativo, dosagem, unidades_embalagem, forma_farmaceutica, est_minimo_grupo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(testGrupoId, 'LOSARTANA POTASSICA 50MG C/ 30 COMP', 'LOSARTANA POTASSICA', '50MG', 30, 'COMPRIMIDO', 20, now, now);

  // Insere vínculos de produtos equivalentes
  db.prepare(`
    INSERT OR REPLACE INTO compras_produtos_equivalentes (
      id, grupo_id, produto_id, ean, descricao, laboratorio, manual_override, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run('vinculo-1', testGrupoId, prodA_Id, '789999010001', 'LOSARTANA 50MG C/30 EMS', 'EMS', now);

  db.prepare(`
    INSERT OR REPLACE INTO compras_produtos_equivalentes (
      id, grupo_id, produto_id, ean, descricao, laboratorio, manual_override, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run('vinculo-2', testGrupoId, prodB_Id, '789999020001', 'LOSARTANA 50MG C/30 MEDLEY', 'MEDLEY', now);

  // Produto A: Saldo 15, VMD 1.0, Curva A
  db.prepare(`
    INSERT OR REPLACE INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, est_minimo_calculado, est_maximo_calculado, vmd_ponderado,
      vendas_30d, vendas_31_60d, vendas_61_90d, vendas_10m, entradas_10m, ativo_10m,
      curva_abc, ciclo_vida, custo_unitario, ultima_compra_valor, preco_unitario_ult_compra, status_ruptura, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'A', 'ESTAVEL', 5.0, 5.0, 5.0, 'NORMAL', ?)
  `).run(prodA_Id, 'LOSARTANA 50MG C/30 EMS', '789999010001', 15, 10, 20, 1.0, 30, 30, 30, 300, 300, now);

  // Produto B: Saldo 10, VMD 0.5, Curva A
  db.prepare(`
    INSERT OR REPLACE INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, est_minimo_calculado, est_maximo_calculado, vmd_ponderado,
      vendas_30d, vendas_31_60d, vendas_61_90d, vendas_10m, entradas_10m, ativo_10m,
      curva_abc, ciclo_vida, custo_unitario, ultima_compra_valor, preco_unitario_ult_compra, status_ruptura, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'A', 'ESTAVEL', 5.5, 5.0, 5.0, 'NORMAL', ?)
  `).run(prodB_Id, 'LOSARTANA 50MG C/30 MEDLEY', '789999020001', 10, 8, 16, 0.5, 15, 15, 15, 150, 150, now);

  // Produto C: Isolado (sem grupo), Saldo 0, VMD 0.8, Curva A, Mínimo 10
  db.prepare(`
    INSERT OR REPLACE INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, est_minimo_calculado, est_maximo_calculado, vmd_ponderado,
      vendas_30d, vendas_31_60d, vendas_61_90d, vendas_10m, entradas_10m, ativo_10m,
      curva_abc, ciclo_vida, custo_unitario, ultima_compra_valor, preco_unitario_ult_compra, status_ruptura, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'A', 'ESTAVEL', 12.0, 11.5, 11.5, 'RUPTURA', ?)
  `).run(prodC_Id, 'DIPIRONA 500MG GOTAS 20ML', '789999030001', 0, 10, 20, 0.8, 24, 24, 24, 240, 240, now);
}

function cleanupMockData() {
  db.prepare('DELETE FROM compras_grupos_equivalentes WHERE id = ?').run(testGrupoId);
  db.prepare('DELETE FROM compras_produtos_equivalentes WHERE grupo_id = ?').run(testGrupoId);
  db.prepare('DELETE FROM compras_estoque_cache WHERE produto_id IN (?, ?, ?)').run(prodA_Id, prodB_Id, prodC_Id);
}

async function runAllTests() {
  console.log('\n=================================================================');
  console.log('🧪 INICIANDO TESTES: EQUIVALENTES, PREVISÃO & AGENTE HORÁCIO');
  console.log('=================================================================\n');

  setupMockData();

  // -------------------------------------------------------------
  // GRUPO 1: CONSOLIDAÇÃO DO GRUPO DE EQUIVALENTES
  // -------------------------------------------------------------
  console.log('📦 [GRUPO 1] Consolidação de Estoque e VMD de Equivalentes');

  await executeTest('1.1 Consolidação de saldo e VMD do grupo no compras-equivalentes.service', () => {
    const g = equivService.obterEstoqueConsolidadoGrupo(testGrupoId, db);
    assert.ok(g, 'Grupo deve ser retornado');
    assert.strictEqual(g.saldoTotal, 25, 'Saldo total deve ser 15 + 10 = 25');
    assert.strictEqual(g.vmdTotal, 1.5, 'VMD total deve ser 1.0 + 0.5 = 1.5');
    assert.strictEqual(g.estMinimoTotal, 20, 'Estoque mínimo configurado no grupo deve ser 20');
    assert.strictEqual(g.emRuptura, false, 'Grupo com 25 un e mínimo 20 não está em ruptura');
    assert.strictEqual(g.diasDuracaoEstoque, Math.round(25 / 1.5), 'Duração deve ser 17 dias');
    assert.ok(g.dataPrevisaoEsgotamento, 'Deve gerar data de previsão de esgotamento');
  });

  await executeTest('1.2 Consulta em lote de consolidação via obterConsolidadoParaProdutos', () => {
    const mapa = equivService.obterConsolidadoParaProdutos([prodA_Id, prodB_Id], db);
    assert.ok(mapa[prodA_Id], 'Produto A deve ter grupo mapeado');
    assert.ok(mapa[prodB_Id], 'Produto B deve ter grupo mapeado');
    assert.strictEqual(mapa[prodA_Id].saldoTotal, 25);
    assert.strictEqual(mapa[prodB_Id].saldoTotal, 25);
  });

  // -------------------------------------------------------------
  // GRUPO 2: REGRA DE OURO - SUGESTÃO NÃO PASSA DO MÍNIMO CONSOLIDADO
  // -------------------------------------------------------------
  console.log('\n🛡️ [GRUPO 2] Regra de Ouro: Sugestão de Reposição e Teto de Estoque');

  await executeTest('2.1 Produto com saldo 0 em grupo que atinge o mínimo NÃO gera sugestão de reposição', async () => {
    // Zera o saldo do Produto B (Medley), mas deixa o Produto A com 25 un (cobre o mínimo de 20)
    db.prepare('UPDATE compras_estoque_cache SET saldo = 25 WHERE produto_id = ?').run(prodA_Id);
    db.prepare("UPDATE compras_estoque_cache SET saldo = 0, status_ruptura = 'RUPTURA' WHERE produto_id = ?").run(prodB_Id);

    const res = await estoqueService.listarProdutosAbaixoDoMinimo({
      busca: 'LOSARTANA 50MG C/30 MEDLEY',
      status: 'TODOS'
    });

    assert.ok(res.produtos.length > 0, 'Deve encontrar o produto B');
    const prodB = res.produtos.find(p => p.produtoId === prodB_Id);
    assert.ok(prodB, 'Produto B deve estar na lista');
    assert.strictEqual(prodB.saldo, 0, 'Saldo individual é 0');
    assert.strictEqual(prodB.saldoEquivalentes, 25, 'Saldo dos equivalentes é 25');
    assert.strictEqual(prodB.estMinimoConsolidado, 20, 'Estoque mínimo do grupo é 20');
    assert.strictEqual(prodB.sugeridoReposicao, 0, 'Sugestão deve ser ZERO pois grupo já tem 25 un cobrindo o mínimo de 20');
  });

  await executeTest('2.2 Quando grupo está abaixo do mínimo, sugestão somada ao saldo total não passa do mínimo', async () => {
    // Ajusta: Produto A = 6 un, Produto B = 4 un -> Total do grupo = 10 un (mínimo do grupo = 20)
    db.prepare('UPDATE compras_estoque_cache SET saldo = 6 WHERE produto_id = ?').run(prodA_Id);
    db.prepare('UPDATE compras_estoque_cache SET saldo = 4 WHERE produto_id = ?').run(prodB_Id);

    const res = await estoqueService.listarProdutosAbaixoDoMinimo({
      busca: 'LOSARTANA 50MG C/30 EMS',
      status: 'TODOS'
    });

    const prodA = res.produtos.find(p => p.produtoId === prodA_Id);
    assert.ok(prodA);
    assert.strictEqual(prodA.saldoEquivalentes, 10, 'Saldo do grupo deve ser 10');
    assert.strictEqual(prodA.estMinimoConsolidado, 20, 'Mínimo do grupo é 20');
    // Defasagem total do grupo = 20 - 10 = 10
    assert.strictEqual(prodA.sugeridoReposicao, 10, 'Sugestão do grupo deve ser exatamente a defasagem para o mínimo (10 un)');
    assert.strictEqual(prodA.saldoEquivalentes + prodA.sugeridoReposicao, prodA.estMinimoConsolidado, 'Soma do saldo do grupo com a reposição não pode passar do estoque mínimo');
  });

  await executeTest('2.3 Produto sem equivalentes calcula reposição e previsão individualmente', async () => {
    const res = await estoqueService.listarProdutosAbaixoDoMinimo({
      busca: 'DIPIRONA 500MG GOTAS',
      status: 'TODOS'
    });

    const prodC = res.produtos.find(p => p.produtoId === prodC_Id);
    assert.ok(prodC);
    assert.strictEqual(prodC.saldo, 0);
    assert.strictEqual(prodC.grupoEquivalenteNome, null);
    assert.strictEqual(prodC.sugeridoReposicao, 10);
    assert.strictEqual(prodC.diasDuracaoEstoque, 0);
    assert.strictEqual(prodC.dataPrevisaoEsgotamento, 'Ruptura (Hoje)');
  });

  // -------------------------------------------------------------
  // GRUPO 3: AGENTE DE COMPRAS HORÁCIO - COMPRAS DE OPORTUNIDADE & PREVISÃO
  // -------------------------------------------------------------
  console.log('\n👔 [GRUPO 3] Agente Horácio: Regras de Oportunidade Extremamente Vantajosa');

  await executeTest('3.1 Horácio rejeita compra acima do mínimo quando desconto é comum (< 25%)', async () => {
    // Grupo com saldo 25 un >= mínimo 20 un. Oferta com apenas 15% de desconto.
    db.prepare("UPDATE compras_estoque_cache SET saldo = 15, curva_abc = 'A' WHERE produto_id = ?").run(prodA_Id);
    db.prepare("UPDATE compras_estoque_cache SET saldo = 10, curva_abc = 'A' WHERE produto_id = ?").run(prodB_Id);

    const oferta = {
      produtoId: prodA_Id,
      produtoNome: 'LOSARTANA 50MG C/30 EMS',
      ean: '789999010001',
      precoOfertado: 4.25, // histórico 5.00 -> 15% OFF
      distribuidora: 'Distribuidora Teste',
      representante: 'Carlos',
      telefone: '5561999999999'
    };

    const rel = await horacioAgent.analisarOfertasEmTempoReal(oferta, db);
    assert.strictEqual(rel, null, 'Horácio não deve gerar alerta pois estoque está acima do mínimo e desconto não é extremamente vantajoso');
  });

  await executeTest('3.2 Horácio rejeita compra acima do mínimo em item Curva C mesmo com 30% de desconto', async () => {
    // Configura produto A para ser Curva C com grupo de teste coberto (saldo 25 >= mínimo 20)
    db.prepare("UPDATE compras_estoque_cache SET saldo = 15, curva_abc = 'C' WHERE produto_id = ?").run(prodA_Id);
    db.prepare("UPDATE compras_estoque_cache SET saldo = 10, curva_abc = 'C' WHERE produto_id = ?").run(prodB_Id);

    const ofertaCurvaC = {
      produtoId: prodA_Id,
      produtoNome: 'LOSARTANA 50MG C/30 EMS',
      ean: '789999010001',
      precoOfertado: 3.50, // 30% OFF em Curva C
      distribuidora: 'Distribuidora Teste',
      representante: 'Carlos',
      telefone: '5561999999999'
    };

    const rel = await horacioAgent.analisarOfertasEmTempoReal(ofertaCurvaC, db);
    assert.strictEqual(rel, null, 'Horácio não deve comprar acima do mínimo para Curva C');
  });

  await executeTest('3.3 Horácio APROVA compra acima do mínimo quando desconto >= 25% em Curva A e inclui previsão de estoque', async () => {
    // Produto A (Curva A), histórico R$ 5,00, ofertado a R$ 3,50 (30% OFF)
    // Saldo do grupo = 25 un >= mínimo 20 un
    db.prepare("UPDATE compras_estoque_cache SET saldo = 15, est_minimo_calculado = 10, curva_abc = 'A', ultima_compra_valor = 5.0, preco_unitario_ult_compra = 5.0 WHERE produto_id = ?").run(prodA_Id);
    db.prepare("UPDATE compras_estoque_cache SET saldo = 10, est_minimo_calculado = 10, curva_abc = 'A', ultima_compra_valor = 5.0, preco_unitario_ult_compra = 5.0 WHERE produto_id = ?").run(prodB_Id);

    const ofertaSuper = {
      produtoId: prodA_Id,
      produtoNome: 'LOSARTANA 50MG C/30 EMS',
      ean: '789999010001',
      precoOfertado: 3.50, // 30% OFF
      distribuidora: 'Distribuidora Diamante',
      representante: 'Carlos',
      telefone: '5561999999999',
      pedidoMinimoValor: 100.0
    };

    const rel = await horacioAgent.analisarOfertasEmTempoReal(ofertaSuper, db);
    assert.ok(rel, 'Horácio deve aprovar compra de oportunidade super vantajosa');
    assert.strictEqual(rel.tipo, 'Critico_TempoReal');
    assert.ok(rel.itens && rel.itens.length > 0);

    const item = rel.itens[0];
    assert.ok(item.motivo.includes('Compra Estratégica') || item.motivo.includes('OFF'), 'Motivo deve sinalizar compra estratégica');
    assert.ok(item.diasDuracaoEstoque > 0, 'Deve calcular dias de estoque restante');
    assert.ok(item.dataPrevisaoEsgotamento, 'Deve calcular data prevista de esgotamento');
    assert.ok(rel.mensagemFormatada.includes('PREVISÃO DO ESTOQUE ATUAL'), 'Mensagem formatada deve conter a previsão');
    assert.ok(rel.mensagemFormatada.includes('EQUIVALENTES VERIFICADOS NO ESTOQUE'), 'Mensagem formatada deve conter equivalentes');
  });

  cleanupMockData();

  console.log('\n=================================================================');
  console.log('🏁 RESULTADO FINAL DA SUÍTE DE TESTES');
  console.log(`   Total Aprovados: ${passedTests}`);
  console.log(`   Total Falhas:    ${failedTests}`);
  console.log('=================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests();
