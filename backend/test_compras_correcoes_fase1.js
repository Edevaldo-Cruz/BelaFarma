/**
 * test_compras_correcoes_fase1.js
 * Testes Automatizados para validação das correções da Fase 1 do Robô de Compras
 */

const assert = require('assert');
const path = require('path');
const Database = require('better-sqlite3');

const comprasMineracao = require('./services/compras-mineracao.service');
const comprasPedidos = require('./services/compras-pedidos.service');

const dbPath = path.join(__dirname, '..', 'data', 'belafarma.db');
const db = new Database(dbPath, { readonly: true });

async function runTests() {
  console.log('🚀 Iniciando bateria de testes da Fase 1...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  // ──────────────────────────────────────────────────────────
  // TESTE 1: Concentração de medicamento NÃO é interpretada como preço
  // ──────────────────────────────────────────────────────────
  test('1.1 - CLONAZEPAM 2,00 não deve extrair R$ 2,00 como preço', () => {
    const texto = 'CLONAZEPAM 2,00\nGOTAS 20ML';
    const ofertas = comprasMineracao.extrairLinhasDeOferta(texto);
    const clonazepamOferta = ofertas.find(o => o.produtoNome.includes('CLONAZEPAM'));
    assert.strictEqual(clonazepamOferta, undefined, 'Não deveria gerar oferta com preço R$ 2,00 para Clonazepam 2,00');
  });

  test('1.2 - DIPIRONA 500,00 sem moeda não deve virar preço R$ 500,00', () => {
    const texto = 'DIPIRONA 500,00 COMPRIMIDOS';
    const ofertas = comprasMineracao.extrairLinhasDeOferta(texto);
    assert.strictEqual(ofertas.length, 0, 'Não deveria extrair oferta sem indicador de preço');
  });

  test('1.3 - Preço legítimo com R$ ou traço DEVE ser extraído normalmente', () => {
    const texto = 'LOSARTANA 50MG C/30 - R$ 3,89';
    const ofertas = comprasMineracao.extrairLinhasDeOferta(texto);
    assert.strictEqual(ofertas.length, 1, 'Deveria extrair 1 oferta');
    assert.strictEqual(ofertas[0].precoOfertado, 3.89, 'Preço ofertado deve ser 3.89');
    assert.ok(ofertas[0].produtoNome.includes('LOSARTANA'), 'Produto deve ser Losartana');
  });

  // ──────────────────────────────────────────────────────────
  // TESTE 2: Trava de Sanidade (> 40% de desconto -> Revisao_Manual)
  // ──────────────────────────────────────────────────────────
  await testAsync('2.1 - Oferta com 80% de desconto vai para Revisao_Manual e não Aprovado_Radar', async () => {
    const mockDb = new Database(':memory:');
    mockDb.exec(`
      CREATE TABLE digifarma_ultimas_compras_cache (
        produto_id TEXT PRIMARY KEY,
        ean TEXT,
        descricao TEXT,
        preco_unitario_ult_compra REAL,
        preco_total_nota REAL,
        quantidade REAL,
        embalagem INTEGER,
        embalagem_detalhe TEXT,
        data_compra TEXT,
        fornecedor_nome TEXT,
        numero_nota_fiscal TEXT,
        fonte TEXT,
        atualizado_em TEXT
      );
      CREATE TABLE compras_estoque_cache (
        produto_id INTEGER PRIMARY KEY,
        ean TEXT,
        descricao TEXT,
        saldo REAL,
        est_minimo_calculado REAL,
        est_minimo_digifarma REAL,
        preco_unitario_ult_compra REAL,
        ultima_compra_valor REAL,
        ativo_10m INTEGER DEFAULT 1
      );
      INSERT INTO digifarma_ultimas_compras_cache (produto_id, descricao, preco_unitario_ult_compra, preco_total_nota)
      VALUES ('999', 'MEDICAMENTO TESTE 50MG', 10.00, 10.00);
      INSERT INTO compras_estoque_cache (produto_id, descricao, saldo, est_minimo_calculado, preco_unitario_ult_compra)
      VALUES (999, 'MEDICAMENTO TESTE 50MG', 10, 5, 10.00);
    `);

    const validacao = await comprasMineracao.validarOfertaComDigifarma('MEDICAMENTO TESTE 50MG', null, 2.00, mockDb, { skipFirebird: true });
    assert.strictEqual(validacao.status, 'Revisao_Manual', 'Status deve ser Revisao_Manual para 80% de desconto');
    assert.strictEqual(validacao.precisaRevisao, true, 'precisaRevisao deve ser true');
    assert.strictEqual(validacao.vantajosa, false, 'vantajosa deve ser false quando requer revisão manual');
    assert.ok(validacao.motivoRevisao.includes('trava de segurança'), 'Deve conter justificativa da trava de segurança');
  });

  await testAsync('2.2 - Oferta com 20% de desconto é Aprovado_Radar legítimo', async () => {
    const mockDb = new Database(':memory:');
    mockDb.exec(`
      CREATE TABLE digifarma_ultimas_compras_cache (
        produto_id TEXT PRIMARY KEY,
        ean TEXT,
        descricao TEXT,
        preco_unitario_ult_compra REAL,
        preco_total_nota REAL,
        quantidade REAL,
        embalagem INTEGER,
        embalagem_detalhe TEXT,
        data_compra TEXT,
        fornecedor_nome TEXT,
        numero_nota_fiscal TEXT,
        fonte TEXT,
        atualizado_em TEXT
      );
      CREATE TABLE compras_estoque_cache (
        produto_id INTEGER PRIMARY KEY,
        ean TEXT,
        descricao TEXT,
        saldo REAL,
        est_minimo_calculado REAL,
        est_minimo_digifarma REAL,
        preco_unitario_ult_compra REAL,
        ultima_compra_valor REAL,
        ativo_10m INTEGER DEFAULT 1
      );
      INSERT INTO digifarma_ultimas_compras_cache (produto_id, descricao, preco_unitario_ult_compra, preco_total_nota)
      VALUES ('999', 'MEDICAMENTO TESTE 50MG', 10.00, 10.00);
      INSERT INTO compras_estoque_cache (produto_id, descricao, saldo, est_minimo_calculado, preco_unitario_ult_compra)
      VALUES (999, 'MEDICAMENTO TESTE 50MG', 10, 5, 10.00);
    `);

    const validacao = await comprasMineracao.validarOfertaComDigifarma('MEDICAMENTO TESTE 50MG', null, 8.00, mockDb, { skipFirebird: true });
    assert.strictEqual(validacao.status, 'Aprovado_Radar', 'Status deve ser Aprovado_Radar para 20% de desconto');
    assert.strictEqual(validacao.precisaRevisao, false, 'precisaRevisao deve ser false');
    assert.strictEqual(validacao.vantajosa, true, 'vantajosa deve ser true');
  });

  // ──────────────────────────────────────────────────────────
  // TESTE 3: Precedência de Preço de Nota Fiscal sobre CMV
  // ──────────────────────────────────────────────────────────
  await testAsync('3.1 - Preço de Nota Fiscal (com embalagem coletiva) tem precedência sobre CMV desatualizado', async () => {
    const mockDb = new Database(':memory:');
    mockDb.exec(`
      CREATE TABLE digifarma_ultimas_compras_cache (
        produto_id TEXT PRIMARY KEY,
        ean TEXT,
        descricao TEXT,
        preco_unitario_ult_compra REAL,
        preco_total_nota REAL,
        quantidade REAL,
        embalagem INTEGER,
        embalagem_detalhe TEXT,
        data_compra TEXT,
        fornecedor_nome TEXT,
        numero_nota_fiscal TEXT,
        fonte TEXT,
        atualizado_em TEXT
      );
      CREATE TABLE compras_estoque_cache (
        produto_id INTEGER PRIMARY KEY,
        ean TEXT,
        descricao TEXT,
        saldo REAL,
        est_minimo_calculado REAL,
        est_minimo_digifarma REAL,
        preco_unitario_ult_compra REAL,
        ultima_compra_valor REAL,
        ativo_10m INTEGER DEFAULT 1
      );
      -- Na nota fiscal a unidade saiu a R$ 3,24 (caixa c/ 12 por R$ 38,88)
      INSERT INTO digifarma_ultimas_compras_cache (produto_id, descricao, preco_unitario_ult_compra, preco_total_nota)
      VALUES ('555', 'APARELHO BARBEAR CX 12', 3.24, 38.88);
      -- No cadastro de estoque antigo estava o valor da caixa inteira R$ 38,88 como última compra
      INSERT INTO compras_estoque_cache (produto_id, descricao, saldo, est_minimo_calculado, preco_unitario_ult_compra, ultima_compra_valor)
      VALUES (555, 'APARELHO BARBEAR CX 12', 10, 5, 38.88, 38.88);
    `);

    const validacao = await comprasMineracao.validarOfertaComDigifarma('APARELHO BARBEAR CX 12', null, 3.10, mockDb, { skipFirebird: true });
    assert.strictEqual(validacao.precoUltCompra, 3.24, 'Preço de referência DEVE ser R$ 3,24 (da nota fiscal) e NÃO R$ 38,88');
    assert.ok(validacao.percentualDesconto < 10, 'Desconto real é cerca de 4.3% e NÃO 92%');
    assert.strictEqual(validacao.status, 'Aprovado_Radar', 'Deve ser aprovado com desconto real compatível');
  });

  // ──────────────────────────────────────────────────────────
  // TESTE 4: Projeção de Boletos Futuros e Orçamento de Novembro/2026
  // ──────────────────────────────────────────────────────────
  test('4.1 - Orçamento de Novembro/2026 reflete R$ 10.535,65 em boletos e saldo restante de R$ 1.964,35', () => {
    const resumoNov = comprasPedidos.validarTetoOrcamentario(0, 11, 2026, {}, db);
    assert.strictEqual(resumoNov.limiteMensal, 12500, 'Limite de Novembro deve ser R$ 12.500,00');
    assert.strictEqual(resumoNov.totalBoletosMes, 10535.65, 'Boletos programados para Novembro devem somar R$ 10.535,65');
    assert.strictEqual(resumoNov.comprometido, 10535.65, 'Total comprometido deve ser R$ 10.535,65');
    assert.strictEqual(resumoNov.disponivel, 1964.35, 'Saldo disponível para Novembro deve ser exatamente R$ 1.964,35');
  });

  test('4.2 - Pedido de R$ 2.500 em Novembro é rejeitado por estourar o saldo disponível de R$ 1.964,35', () => {
    const validacao = comprasPedidos.validarTetoOrcamentario(2500, 11, 2026, {}, db);
    assert.strictEqual(validacao.permitido, false, 'Pedido de R$ 2.500 deve ser recusado em Novembro');
    assert.strictEqual(validacao.permitidoMensal, false, 'permitidoMensal deve ser false');
    assert.ok(validacao.motivo.includes('excedido'), 'Deve conter mensagem explicativa de estouro de teto');
  });

  test('4.3 - Trava Semanal: limite semanal de R$ 3.650 é retornado corretamente', () => {
    const validacao = comprasPedidos.validarTetoOrcamentario(100, 11, 2026, {}, db);
    assert.strictEqual(validacao.limiteSemanal, 3650.00, 'Limite semanal deve ser R$ 3.650,00');
    assert.ok(validacao.disponivelSemana >= 0, 'Saldo semanal disponível deve ser positivo ou zero');
  });

  console.log(`\n🏁 Resultado: ${passed} testes passaram, ${failed} falharam.`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
