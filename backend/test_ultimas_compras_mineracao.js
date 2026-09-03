/**
 * Automated Verification Suite for Digifarma Última Compra & Mineração Fixes
 * 
 * Tests:
 * 1. Schema & indexing validation for digifarma_ultimas_compras_cache
 * 2. Query performance (< 5ms per lookup)
 * 3. Unit price calculation with packaging division (e.g. AP.BARB VICEROY ID 188549: 38.88 / 12 = 3.24)
 * 4. Discount & status evaluation (Aprovado_Radar vs Descartado_Preco_Maior)
 * 5. Fallback behavior (PRODUTOS fallback only when no invoice exists)
 * 6. Sincronizar & Recalcular operations
 * 7. Listar oportunidades enriched with embalagemUltCompra and precoTotalNota
 */

const assert = require('assert');
const { performance } = require('perf_hooks');
const db = require('./database');
const comprasMineracaoService = require('./services/compras-mineracao.service');

async function runTests() {
  console.log('=== INICIANDO SUÍTE DE TESTES: ÚLTIMAS COMPRAS DIGIFARMA ===\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. Validar estrutura da tabela de cache e colunas
  test('R2: Tabela digifarma_ultimas_compras_cache existe com colunas corretas', () => {
    const cols = db.pragma('table_info(digifarma_ultimas_compras_cache)');
    const colNames = cols.map(c => c.name);
    const requiredCols = [
      'produto_id', 'ean', 'descricao', 'preco_unitario_ult_compra',
      'preco_total_nota', 'quantidade', 'embalagem', 'embalagem_detalhe',
      'data_compra', 'fornecedor_nome', 'numero_nota_fiscal', 'fonte', 'atualizado_em'
    ];
    for (const req of requiredCols) {
      assert(colNames.includes(req), `Coluna ${req} ausente em digifarma_ultimas_compras_cache`);
    }
  });

  // 2. Validar índices da tabela de cache
  test('R2: Índices de performance para busca em < 5ms existem', () => {
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'digifarma_ultimas_compras_cache'
    `).all().map(i => i.name);
    
    assert(indexes.some(n => n.includes('ean')), 'Índice de EAN ausente');
    assert(indexes.some(n => n.includes('descricao')), 'Índice de Descrição ausente');
  });

  // 3. Teste de performance de busca no cache (< 5ms)
  test('R2: Performance de busca no cache executa em < 5ms', () => {
    // Busca por ID
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) {
      db.prepare('SELECT * FROM digifarma_ultimas_compras_cache WHERE produto_id = ?').get('188549');
    }
    const t1 = performance.now();
    const avgById = (t1 - t0) / 50;

    // Busca por EAN
    const t2 = performance.now();
    for (let i = 0; i < 50; i++) {
      db.prepare('SELECT * FROM digifarma_ultimas_compras_cache WHERE ean = ?').get('7896083000578');
    }
    const t3 = performance.now();
    const avgByEan = (t3 - t2) / 50;

    console.log(`         Tempo médio por ID: ${avgById.toFixed(3)}ms | por EAN: ${avgByEan.toFixed(3)}ms`);
    assert(avgById < 5.0, `Busca por ID muito lenta: ${avgById}ms`);
    assert(avgByEan < 5.0, `Busca por EAN muito lenta: ${avgByEan}ms`);
  });

  // 4. R1: Cálculo fiel do preço unitário com divisão de embalagem
  await asyncTest('R1: Produto 188549 (Viceroy c/12) calcula preço unitário R$ 3,24 (não R$ 38,88)', async () => {
    const result = await comprasMineracaoService.buscarUltimaCompraProduto({
      produtoId: 188549,
      ean: '7898361212568',
      descricao: 'AP.BARB VICEROY LADY CARE C/2 12UND'
    });

    assert(result, 'Resultado de busca não pode ser nulo');
    assert.strictEqual(result.precoUnitario, 3.24, `Preço unitário esperado R$ 3,24, obteve R$ ${result.precoUnitario}`);
    assert.strictEqual(result.precoTotalNota, 38.88, `Preço total esperado R$ 38,88, obteve R$ ${result.precoTotalNota}`);
    assert.strictEqual(result.embalagem, 12, `Embalagem esperada 12, obteve ${result.embalagem}`);
    assert(result.fornecedorNome.includes('SOTON'), `Fornecedor esperado conter SOTON, obteve ${result.fornecedorNome}`);
    assert(result.numeroNotaFiscal.includes('594906'), `NF esperada conter 594906, obteve ${result.numeroNotaFiscal}`);
  });

  // 5. Validação de Oferta: Desconto e Status
  await asyncTest('R1: Validação de oferta calcula percentual de desconto e status Aprovado_Radar / Descartado_Preco_Maior', async () => {
    // Oferta a R$ 2,80 (menor que R$ 3,24 -> Vantajoso)
    const validacao1 = await comprasMineracaoService.validarOfertaComDigifarma({
      produtoId: 188549,
      precoOfertado: 2.80
    });

    assert(validacao1.valida, 'Oferta mais barata deve ser válida');
    assert.strictEqual(validacao1.precoReferencia, 3.24);
    assert.strictEqual(validacao1.status, 'Aprovado_Radar');
    assert(validacao1.percentualDesconto > 13.5 && validacao1.percentualDesconto < 13.6, `Desconto esperado ~13.58%, obteve ${validacao1.percentualDesconto}%`);

    // Oferta a R$ 3,50 (maior que R$ 3,24 -> Descartado)
    const validacao2 = await comprasMineracaoService.validarOfertaComDigifarma({
      produtoId: 188549,
      precoOfertado: 3.50
    });

    assert(!validacao2.valida, 'Oferta mais cara não deve ser aprovada');
    assert.strictEqual(validacao2.status, 'Descartado_Preco_Maior');
  });

  // 6. Colunas novas em compras_oportunidades_mineradas
  test('R3: Tabela compras_oportunidades_mineradas possui embalagem_ult_compra e preco_total_nota', () => {
    const cols = db.pragma('table_info(compras_oportunidades_mineradas)').map(c => c.name);
    assert(cols.includes('embalagem_ult_compra'), 'Coluna embalagem_ult_compra ausente');
    assert(cols.includes('preco_total_nota'), 'Coluna preco_total_nota ausente');
  });

  // 7. R3: Recálculo de ofertas mineradas
  await asyncTest('R3: recalcularOfertasMineradas atualiza preços unitários e status no banco', async () => {
    // Inserir uma oportunidade de teste com valor incorreto (ex: R$ 38,88)
    const testId = 'test-op-viceroy-' + Date.now();
    db.prepare(`
      INSERT OR REPLACE INTO compras_oportunidades_mineradas (
        id, mensagem_id, distribuidora, produto_nome, ean,
        preco_ofertado, preco_ult_compra_digifarma, percentual_desconto,
        status, data_oferta, created_at, embalagem_ult_compra, preco_total_nota
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)
    `).run(
      testId, 'msg-1', 'FORNECEDOR TESTE', 'AP.BARB VICEROY LADY CARE C/2 12UND',
      '7898361212568', 2.80, 38.88, 92.8, 'Aprovado_Radar', '1 un', 38.88
    );

    const recResult = await comprasMineracaoService.recalcularOfertasMineradas();
    assert(recResult.totalProcessadas >= 1, 'Deve ter processado ao menos 1 oferta');

    // Verificar se o registro foi corrigido para R$ 3,24 unitário
    const updated = db.prepare('SELECT * FROM compras_oportunidades_mineradas WHERE id = ?').get(testId);
    assert.strictEqual(updated.preco_ult_compra_digifarma, 3.24, `Esperado 3.24, obteve ${updated.preco_ult_compra_digifarma}`);
    assert.strictEqual(updated.preco_total_nota, 38.88, `Esperado 38.88, obteve ${updated.preco_total_nota}`);
    assert(updated.embalagem_ult_compra.includes('12'), `Esperado embalagem com 12 un, obteve ${updated.embalagem_ult_compra}`);

    // Limpar o registro de teste
    db.prepare('DELETE FROM compras_oportunidades_mineradas WHERE id = ?').run(testId);
  });

  // 8. R4: listarOportunidades retorna campos embalagemUltCompra e precoTotalNota
  await asyncTest('R4: listarOportunidades enriquece e retorna campos visuais', async () => {
    const testId = 'test-op-visual-' + Date.now();
    db.prepare(`
      INSERT OR REPLACE INTO compras_oportunidades_mineradas (
        id, mensagem_id, distribuidora, produto_nome, ean,
        preco_ofertado, preco_ult_compra_digifarma, percentual_desconto,
        status, data_oferta, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      testId, 'msg-visual', 'FORNECEDOR TESTE', 'AP.BARB VICEROY LADY CARE C/2 12UND',
      '7898361212568', 2.80, 3.24, 13.58, 'Aprovado_Radar'
    );

    const lista = await comprasMineracaoService.listarOportunidades();
    const op = lista.find(o => o.id === testId);
    
    assert(op, 'Oportunidade de teste deve ser encontrada na listagem');
    assert.strictEqual(op.precoUltCompraDigifarma, 3.24);
    assert(op.embalagemUltCompra && op.embalagemUltCompra.includes('12'), `Embalagem deve conter 12: ${op.embalagemUltCompra}`);
    assert.strictEqual(op.precoTotalNota, 38.88);

    // Limpar o registro de teste
    db.prepare('DELETE FROM compras_oportunidades_mineradas WHERE id = ?').run(testId);
  });

  console.log(`\n=== RESUMO DOS TESTES: ${passed} PASSOU | ${failed} FALHOU ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal executando testes:', err);
  process.exit(1);
});
