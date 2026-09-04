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

  // 9. Adversarial: listarOportunidades sobrepõe preço de caixa legado (38.88) com unitário real (3.24)
  await asyncTest('Adversarial: listarOportunidades sobrepõe preço legado de caixa (R$ 38,88) por R$ 3,24 unitário', async () => {
    const testId = 'test-op-legacy-box-' + Date.now();
    db.prepare(`
      INSERT OR REPLACE INTO compras_oportunidades_mineradas (
        id, mensagem_id, distribuidora, produto_nome, ean,
        preco_ofertado, preco_ult_compra_digifarma, percentual_desconto,
        status, data_oferta, created_at, ultimo_fornecedor
      ) VALUES (?, 'msg-legacy', 'SOTON FARMA', 'AP.BARB VICEROY LADY CARE C/2 12UND',
        '7898361212568', 2.80, 38.88, 92.8, 'Aprovado_Radar', datetime('now'), datetime('now'), 'SOTON FARMA')
    `).run(testId);

    const lista = await comprasMineracaoService.listarOportunidades(db);
    const op = lista.find(o => o.id === testId);

    assert(op, 'Oportunidade de teste com preço legado deve existir na listagem');
    assert.strictEqual(op.precoUltCompraDigifarma, 3.24, `Esperado R$ 3,24 unitário, obteve R$ ${op.precoUltCompraDigifarma}`);
    assert(Math.abs(op.descontoPercentual - 13.58) < 0.1, `Desconto esperado ~13.58%, obteve ${op.descontoPercentual}%`);
    assert(op.embalagemUltCompra.includes('12'), `Embalagem esperada com 12 un, obteve ${op.embalagemUltCompra}`);

    db.prepare('DELETE FROM compras_oportunidades_mineradas WHERE id = ?').run(testId);
  });

  // 10. Adversarial: buscarUltimaCompraProduto com objeto e queryDigifarma mockada
  await asyncTest('Adversarial: buscarUltimaCompraProduto trata argumento objeto e passa ID escalar ao Firebird', async () => {
    let capturedId = null;
    const mockQuery = async (sql, params) => {
      if (sql.includes('ITEM_NOTAS')) {
        capturedId = params[0];
        return [{
          ITEM_NOTAS_PRCOMPRA: 48.00,
          ITEM_NOTAS_EMBALAGEM: 12,
          ITEM_NOTAS_ULT_COMPRA: 4.00,
          ITEM_NOTAS_QUANT: 2,
          DATA_EMISSAO: '2026-09-01 10:00:00',
          NOTA_FISCAL: '778899',
          FORNECEDOR: 'DISTRIBUIDORA TESTE MOCK'
        }];
      }
      return [];
    };

    const res = await comprasMineracaoService.buscarUltimaCompraProduto({
      produtoId: 888777,
      ean: '7899998887776',
      produtoNome: 'PRODUTO TESTE MOCK C/12',
      dbInstance: db,
      options: { queryDigifarma: mockQuery, skipFirebird: false }
    });

    assert.strictEqual(typeof capturedId, 'number', `ID capturado no mock deve ser numérico escalar, obteve ${typeof capturedId}`);
    assert.strictEqual(capturedId, 888777, `ID esperado 888777, obteve ${capturedId}`);
    assert(res, 'Resultado do mock não pode ser nulo');
    assert.strictEqual(res.precoUnitario, 4.00, `Preço unitário esperado 4.00, obteve ${res.precoUnitario}`);
    assert.strictEqual(res.precoTotalNota, 48.00, `Preço total esperado 48.00, obteve ${res.precoTotalNota}`);

    // Limpa do cache
    db.prepare('DELETE FROM digifarma_ultimas_compras_cache WHERE produto_id = 888777').run();
  });

  // 11. Adversarial: Fallback estrito para PRODUTOS no Firebird quando produto não tem NF de entrada
  await asyncTest('Adversarial: Fallback estrito para PRODUTOS quando produto nunca teve NF de entrada', async () => {
    const mockQueryNoNf = async (sql, params) => {
      if (sql.includes('ITEM_NOTAS')) {
        return []; // Nunca teve NF
      }
      if (sql.includes('PRODUTOS')) {
        return [{
          PRODUTO_ID: 777111,
          PRODUTO: 'DIPIRONA GOTAS 20ML TESTE FALLBACK',
          COD_BARRAS: '7891112223334',
          VALOR_ULT_COMPRA: 5.50,
          PROD_PRCOMPRA: 4.80
        }];
      }
      return [];
    };

    const res = await comprasMineracaoService.buscarUltimaCompraProduto({
      produtoId: 777111,
      ean: '7891112223334',
      produtoNome: 'DIPIRONA GOTAS 20ML TESTE FALLBACK',
      dbInstance: db,
      options: { queryDigifarma: mockQueryNoNf, skipFirebird: false }
    });

    assert(res, 'Fallback deve retornar dados do cadastro de PRODUTOS');
    assert.strictEqual(res.precoUnitario, 5.50, `Preço esperado do fallback 5.50, obteve ${res.precoUnitario}`);
    assert.strictEqual(res.fonte, 'PRODUTOS_CADASTRO', `Fonte esperada PRODUTOS_CADASTRO, obteve ${res.fonte}`);

    // Limpa do cache
    db.prepare('DELETE FROM digifarma_ultimas_compras_cache WHERE produto_id = 777111').run();
  });

  // 12. Adversarial: Fallback no compras_estoque_cache do SQLite quando Firebird está offline
  await asyncTest('Adversarial: Fallback no compras_estoque_cache do SQLite quando Firebird está offline', async () => {
    // Insere produto temporário em compras_estoque_cache
    db.prepare(`
      INSERT OR REPLACE INTO compras_estoque_cache (
        produto_id, ean, descricao, saldo, custo_unitario, ultima_compra_valor, atualizado_em
      ) VALUES (666555, '7896665554443', 'PRODUTO TESTE SOMENTE ESTOQUE', 15, 7.20, 7.20, datetime('now'))
    `).run();

    const res = await comprasMineracaoService.buscarUltimaCompraProduto({
      produtoId: 666555,
      ean: '7896665554443',
      produtoNome: 'PRODUTO TESTE SOMENTE ESTOQUE',
      dbInstance: db,
      options: { skipFirebird: true }
    });

    assert(res, 'Deve resolver via compras_estoque_cache');
    assert.strictEqual(res.precoUnitario, 7.20, `Preço unitário esperado 7.20, obteve ${res.precoUnitario}`);
    assert.strictEqual(res.fonte, 'ESTOQUE_CACHE', `Fonte esperada ESTOQUE_CACHE, obteve ${res.fonte}`);

    // Limpa
    db.prepare('DELETE FROM compras_estoque_cache WHERE produto_id = 666555').run();
  });

  // 13. Adversarial: Ofertas com preco_ofertado <= 0 não recebem 100% de desconto nem status Aprovado_Radar
  await asyncTest('Adversarial: Oferta com preço 0 ou negativo é descartada e não recebe desconto de 100%', async () => {
    const validacaoZero = await comprasMineracaoService.validarOfertaComDigifarma({
      produtoId: 188549,
      precoOfertado: 0.00
    });

    assert(!validacaoZero.valida, 'Preço zero não pode ser considerado oferta válida');
    assert.strictEqual(validacaoZero.status, 'Descartado_Preco_Maior');
    assert.strictEqual(validacaoZero.percentualDesconto, 0, 'Desconto deve ser 0% para preço 0, não 100%');

    // Recálculo com oferta de preço 0
    const testZeroId = 'test-op-zero-' + Date.now();
    db.prepare(`
      INSERT INTO compras_oportunidades_mineradas (
        id, mensagem_id, distribuidora, produto_nome, ean,
        preco_ofertado, preco_ult_compra_digifarma, percentual_desconto,
        status, data_oferta, created_at
      ) VALUES (?, 'msg-z', 'DIST ZERO', 'AP.BARB VICEROY LADY CARE C/2 12UND',
        '7898361212568', 0, 3.24, 0, 'Aprovado_Radar', datetime('now'), datetime('now'))
    `).run(testZeroId);

    await comprasMineracaoService.recalcularOfertasMineradas(db);
    const updatedZero = db.prepare('SELECT * FROM compras_oportunidades_mineradas WHERE id = ?').get(testZeroId);
    assert.strictEqual(updatedZero.status, 'Descartado_Preco_Maior', `Status esperado Descartado_Preco_Maior, obteve ${updatedZero.status}`);
    assert.strictEqual(updatedZero.percentual_desconto, 0, `Desconto esperado 0%, obteve ${updatedZero.percentual_desconto}%`);

    db.prepare('DELETE FROM compras_oportunidades_mineradas WHERE id = ?').run(testZeroId);
  });

  // 14. Performance & Latência do endpoint e listagem de oportunidades (< 100ms)
  await asyncTest('R2/Critério: Listar oportunidades executa em menos de 100ms', async () => {
    const t0 = performance.now();
    const ops = comprasMineracaoService.listarOportunidades(db, { limite: 100 });
    const elapsed = performance.now() - t0;

    console.log(`         Tempo de listagem de oportunidades: ${elapsed.toFixed(3)}ms (limite 100)`);
    assert(elapsed < 100.0, `Tempo de resposta muito alto: ${elapsed}ms (esperado < 100ms)`);
    assert(Array.isArray(ops), 'Retorno deve ser array');
  });

  // 15. Adversarial: Sincronização sobrepõe dados prévios de ESTOQUE_CACHE mesmo com NF emitida no passado
  await asyncTest('Adversarial: Sincronização sobrepõe fallback ESTOQUE_CACHE com NF real de data anterior', async () => {
    const prodIdTest = 999888;
    // 1. Simula entrada gerada via compras_estoque_cache com data_compra de hoje
    db.prepare(`
      INSERT OR REPLACE INTO digifarma_ultimas_compras_cache (
        produto_id, ean, descricao, preco_unitario_ult_compra, preco_total_nota,
        quantidade, embalagem, embalagem_detalhe, data_compra, fornecedor_nome,
        numero_nota_fiscal, fonte, atualizado_em
      ) VALUES (?, '7899998881112', 'PRODUTO TESTE SYNC OVERRIDE', 10.00, 10.00,
        1, 1, 'Cadastro Geral Digifarma', datetime('now'), 'Cadastro Geral Digifarma',
        'Sem NF Entrada', 'ESTOQUE_CACHE', datetime('now'))
    `).run(prodIdTest);

    // 2. Mock do Firebird com NF emitida 10 dias atrás a R$ 6.50
    const mockQuerySync = async (sql, params) => {
      return [{
        PRODUTO_ID: prodIdTest,
        COD_BARRAS: '7899998881112',
        PRODUTO: 'PRODUTO TESTE SYNC OVERRIDE',
        ITEM_NOTAS_PRCOMPRA: 6.50,
        ITEM_NOTAS_EMBALAGEM: 1,
        ITEM_NOTAS_ULT_COMPRA: 6.50,
        ITEM_NOTAS_QUANT: 10,
        DATA_EMISSAO: '2026-08-20 10:00:00',
        NOTA_FISCAL: 'NF 123456',
        FORNECEDOR: 'DISTRIBUIDORA REAL FIREBIRD'
      }];
    };

    await comprasMineracaoService.sincronizarUltimasComprasDigifarma(db, {
      dias: 90,
      queryDigifarma: mockQuerySync,
      skipFirebird: false
    });

    const itemCache = db.prepare('SELECT * FROM digifarma_ultimas_compras_cache WHERE produto_id = ?').get(prodIdTest);
    assert.strictEqual(itemCache.fonte, 'NOTA_FISCAL', `Fonte esperada NOTA_FISCAL, obteve ${itemCache.fonte}`);
    assert.strictEqual(itemCache.preco_unitario_ult_compra, 6.50, `Preço esperado 6.50, obteve ${itemCache.preco_unitario_ult_compra}`);
    assert.strictEqual(itemCache.fornecedor_nome, 'DISTRIBUIDORA REAL FIREBIRD', `Fornecedor esperado DISTRIBUIDORA REAL FIREBIRD, obteve ${itemCache.fornecedor_nome}`);
    assert.strictEqual(itemCache.numero_nota_fiscal, 'NF 123456', `NF esperada NF 123456, obteve ${itemCache.numero_nota_fiscal}`);

    db.prepare('DELETE FROM digifarma_ultimas_compras_cache WHERE produto_id = ?').run(prodIdTest);
  });

  // 16. Adversarial: validarOfertaComDigifarma com precoOfertado passado como string não quebra .toFixed
  await asyncTest('Adversarial: validarOfertaComDigifarma trata precoOfertado string sem crash', async () => {
    const validacao = await comprasMineracaoService.validarOfertaComDigifarma({
      produtoId: 188549,
      precoOfertado: '2.80' // string ao invés de number
    });

    assert(validacao, 'Validação deve retornar objeto válido');
    assert.strictEqual(typeof validacao.precoOfertado, 'number', 'precoOfertado deve ser numérico');
    assert.strictEqual(validacao.precoOfertado, 2.80);
    assert.strictEqual(validacao.status, 'Aprovado_Radar');
  });

  // 17. Adversarial: Produto sem código de barras (EAN nulo) persiste produto_id e enriquece no listarOportunidades
  await asyncTest('Adversarial: Produto sem EAN (nulo) persiste produto_id e é localizado no listarOportunidades', async () => {
    const opSemEanId = 'test-op-sem-ean-' + Date.now();
    db.prepare(`
      INSERT OR REPLACE INTO compras_oportunidades_mineradas (
        id, mensagem_id, distribuidora, produto_nome, ean, produto_id,
        preco_ofertado, preco_ult_compra_digifarma, percentual_desconto,
        status, data_oferta, created_at
      ) VALUES (?, 'msg-no-ean', 'DIST TESTE', 'AP.BARB VICEROY LADY CARE C/2 12UND',
        NULL, 188549, 2.50, 38.88, 0, 'Disponivel', datetime('now'), datetime('now'))
    `).run(opSemEanId);

    const lista = comprasMineracaoService.listarOportunidades(db, { limite: 100 });
    const opEncontrada = lista.find(o => o.id === opSemEanId);

    assert(opEncontrada, 'Oportunidade sem EAN deve ser localizada');
    assert.strictEqual(opEncontrada.precoUltCompraDigifarma, 3.24, `Preço deve ser enriquecido para 3.24 via produto_id, obteve ${opEncontrada.precoUltCompraDigifarma}`);
    assert(opEncontrada.descontoPercentual > 20, `Desconto deve ser recalculado positivamente, obteve ${opEncontrada.descontoPercentual}%`);
    assert(opEncontrada.embalagemUltCompra.includes('12'), 'Embalagem de 12 unidades deve ser retornada');

    db.prepare('DELETE FROM compras_oportunidades_mineradas WHERE id = ?').run(opSemEanId);
  });

  // 18. Adversarial: buscarUltimaCompraProduto seleciona candidato por pontuarCorrespondencia e não apenas pRows[0]
  await asyncTest('Adversarial: buscarUltimaCompraProduto seleciona candidato no Firebird por melhor score de similaridade', async () => {
    let consultouNotaComId = null;
    const mockQueryRank = async (sql, params) => {
      if (sql.includes('CONTAINING')) {
        return [
          { PRODUTO_ID: 101, PRODUTO: 'DIPIRONA GOTAS 20ML GENERICO', COD_BARRAS: '789101', VALOR_ULT_COMPRA: 4.00, PROD_PRCOMPRA: 3.50 },
          { PRODUTO_ID: 102, PRODUTO: 'DIPIRONA SODICA 500MG COM 20 COMPRIMIDOS EMS', COD_BARRAS: '789102', VALOR_ULT_COMPRA: 5.20, PROD_PRCOMPRA: 4.80 }
        ];
      }
      if (sql.includes('ITEM_NOTAS')) {
        consultouNotaComId = params[0];
        return [{
          ITEM_NOTAS_PRCOMPRA: 5.20,
          ITEM_NOTAS_EMBALAGEM: 1,
          ITEM_NOTAS_ULT_COMPRA: 5.20,
          ITEM_NOTAS_QUANT: 5,
          DATA_EMISSAO: '2026-09-01 10:00:00',
          NOTA_FISCAL: 'NF 9911',
          FORNECEDOR: 'DISTRIBUIDORA EMS'
        }];
      }
      return [];
    };

    const res = await comprasMineracaoService.buscarUltimaCompraProduto({
      produtoNome: 'DIPIRONA 500MG C/20 COMP EMS',
      dbInstance: db,
      options: { queryDigifarma: mockQueryRank, skipFirebird: false, skipCache: true }
    });

    assert(res, 'Busca deve retornar resultado');
    assert.strictEqual(consultouNotaComId, 102, `Deveria selecionar produto 102 (500mg comp EMS) e não 101 (gotas), mas consultou ${consultouNotaComId}`);
    assert.strictEqual(res.precoUnitario, 5.20);

    db.prepare('DELETE FROM digifarma_ultimas_compras_cache WHERE produto_id IN (101, 102)').run();
  });

  // 19. Adversarial: recalcularOfertasMineradas preenche produto_id e ean retroativamente no banco
  await asyncTest('Adversarial: recalcularOfertasMineradas preenche produto_id e ean retroativamente', async () => {
    const testBackfillId = 'test-op-backfill-' + Date.now();
    db.prepare(`
      INSERT OR REPLACE INTO compras_oportunidades_mineradas (
        id, mensagem_id, distribuidora, produto_nome, ean, produto_id,
        preco_ofertado, preco_ult_compra_digifarma, percentual_desconto,
        status, data_oferta, created_at
      ) VALUES (?, 'msg-bf', 'DIST BF', 'AP.BARB VICEROY LADY CARE C/2 12UND',
        NULL, NULL, 2.80, NULL, 0, 'Disponivel', datetime('now'), datetime('now'))
    `).run(testBackfillId);

    await comprasMineracaoService.recalcularOfertasMineradas(db);

    const saved = db.prepare('SELECT * FROM compras_oportunidades_mineradas WHERE id = ?').get(testBackfillId);
    assert.strictEqual(saved.produto_id, 188549, `produto_id esperado 188549, obteve ${saved.produto_id}`);
    assert.strictEqual(saved.ean, '7898361212568', `ean esperado 7898361212568, obteve ${saved.ean}`);
    assert.strictEqual(saved.preco_ult_compra_digifarma, 3.24, `preco_ult esperado 3.24, obteve ${saved.preco_ult_compra_digifarma}`);
    assert.strictEqual(saved.status, 'Aprovado_Radar', `status esperado Aprovado_Radar, obteve ${saved.status}`);

    db.prepare('DELETE FROM compras_oportunidades_mineradas WHERE id = ?').run(testBackfillId);
  });

  // 20. Adversarial: recalcularOfertasMineradas não quebra por escopo quando item está apenas em compras_estoque_cache
  await asyncTest('Adversarial: recalcularOfertasMineradas com item somente em estoque_cache não quebra por ReferenceError', async () => {
    const testScopeId = 'test-op-scope-cache-' + Date.now();
    const testProdId = 888123;
    db.prepare('DELETE FROM digifarma_ultimas_compras_cache WHERE produto_id = ?').run(testProdId);
    db.prepare('DELETE FROM compras_estoque_cache WHERE produto_id = ?').run(testProdId);

    db.prepare(`
      INSERT INTO compras_estoque_cache (produto_id, descricao, ean, saldo, custo_unitario, ultima_compra_valor, atualizado_em)
      VALUES (?, 'PRODUTO UNICO APENAS NO ESTOQUE CACHE 500MG', '7898881230001', 10, 5.0, 5.0, datetime('now'))
    `).run(testProdId);

    db.prepare(`
      INSERT INTO compras_oportunidades_mineradas (
        id, produto_nome, ean, produto_id, preco_ofertado, status, data_oferta, created_at
      ) VALUES (
        ?, 'PRODUTO UNICO APENAS NO ESTOQUE CACHE 500MG', '7898881230001', ?, 4.0, 'Disponivel', datetime('now'), datetime('now')
      )
    `).run(testScopeId, testProdId);

    const recalcRes = await comprasMineracaoService.recalcularOfertasMineradas(db);
    assert(recalcRes.success, 'Recálculo deve retornar sucesso');

    const updated = db.prepare('SELECT * FROM compras_oportunidades_mineradas WHERE id = ?').get(testScopeId);
    assert(updated, 'Registro deve existir');
    assert.strictEqual(updated.preco_ult_compra_digifarma, 5.0, `Preço esperado 5.0, obteve ${updated.preco_ult_compra_digifarma}`);
    assert.strictEqual(updated.status, 'Aprovado_Radar', `Status esperado Aprovado_Radar, obteve ${updated.status}`);

    db.prepare('DELETE FROM compras_oportunidades_mineradas WHERE id = ?').run(testScopeId);
    db.prepare('DELETE FROM compras_estoque_cache WHERE produto_id = ?').run(testProdId);
  });

  // 21. Adversarial: recalcularOfertasMineradas com registro de cache onde ean é nulo não causa ReferenceError
  await asyncTest('Adversarial: recalcularOfertasMineradas com item com ean nulo no cache não quebra por ReferenceError', async () => {
    const testNoEanId = 'test-op-no-ean-recalc-' + Date.now();
    const testProdId = 888124;

    db.prepare(`
      INSERT OR REPLACE INTO digifarma_ultimas_compras_cache (
        produto_id, ean, descricao, preco_unitario_ult_compra, preco_total_nota,
        quantidade, embalagem, embalagem_detalhe, data_compra, fornecedor_nome,
        numero_nota_fiscal, fonte, atualizado_em
      ) VALUES (?, NULL, 'PRODUTO HOSPITALAR SEM EAN RECALC', 12.00, 12.00,
        1, 1, 'Unidade individual (R$ 12.00)', datetime('now'), 'FORN HOSPITALAR',
        'NF 4433', 'NOTA_FISCAL', datetime('now'))
    `).run(testProdId);

    db.prepare(`
      INSERT INTO compras_oportunidades_mineradas (
        id, produto_nome, ean, produto_id, preco_ofertado, status, data_oferta, created_at
      ) VALUES (
        ?, 'PRODUTO HOSPITALAR SEM EAN RECALC', NULL, ?, 10.0, 'Disponivel', datetime('now'), datetime('now')
      )
    `).run(testNoEanId, testProdId);

    const recalcRes = await comprasMineracaoService.recalcularOfertasMineradas(db);
    assert(recalcRes.success, 'Recálculo deve retornar sucesso');

    const updated = db.prepare('SELECT * FROM compras_oportunidades_mineradas WHERE id = ?').get(testNoEanId);
    assert.strictEqual(updated.preco_ult_compra_digifarma, 12.00);
    assert.strictEqual(updated.status, 'Aprovado_Radar');

    db.prepare('DELETE FROM compras_oportunidades_mineradas WHERE id = ?').run(testNoEanId);
    db.prepare('DELETE FROM digifarma_ultimas_compras_cache WHERE produto_id = ?').run(testProdId);
  });

  // 22. Adversarial: sincronizarUltimasComprasDigifarma com prCompra zero e ultFrac positivo (bonificação/amostra)
  await asyncTest('Adversarial: sincronização trata compra bonificada (prCompra=0 e ultFrac>0) preservando precoUnitario e total', async () => {
    const prodBonifId = 888125;
    const mockQueryBonif = async () => [{
      PRODUTO_ID: prodBonifId,
      COD_BARRAS: '7898881250002',
      PRODUTO: 'PRODUTO BONIFICADO TESTE C/10',
      ITEM_NOTAS_PRCOMPRA: 0.00,
      ITEM_NOTAS_EMBALAGEM: 10,
      ITEM_NOTAS_ULT_COMPRA: 2.50,
      ITEM_NOTAS_QUANT: 5,
      DATA_EMISSAO: '2026-09-02 10:00:00',
      NOTA_FISCAL: 'NF 8800',
      FORNECEDOR: 'DISTRIBUIDORA BONIF'
    }];

    await comprasMineracaoService.sincronizarUltimasComprasDigifarma(db, {
      dias: 90,
      queryDigifarma: mockQueryBonif,
      skipFirebird: false
    });

    const itemCache = db.prepare('SELECT * FROM digifarma_ultimas_compras_cache WHERE produto_id = ?').get(prodBonifId);
    assert(itemCache, 'Item bonificado deve ser registrado no cache');
    assert.strictEqual(itemCache.preco_unitario_ult_compra, 2.50, `Preço unitário esperado 2.50, obteve ${itemCache.preco_unitario_ult_compra}`);
    assert.strictEqual(itemCache.preco_total_nota, 25.00, `Preço total da caixa c/10 esperado 25.00, obteve ${itemCache.preco_total_nota}`);

    db.prepare('DELETE FROM digifarma_ultimas_compras_cache WHERE produto_id = ?').run(prodBonifId);
  });

  // 23. Adversarial: listarOportunidades atualiza status para Descartado_Preco_Maior quando cache torna oferta desvantajosa
  await asyncTest('Adversarial: listarOportunidades ajusta status para Descartado_Preco_Maior se precoOfertado >= unitário do cache', async () => {
    const testStatusId = 'test-op-status-descarte-' + Date.now();
    const testProdId = 188549; // Viceroy cujo unitário real é R$ 3,24

    // Oferta cadastrada com status legado Aprovado_Radar (comparada com preço de caixa 38.88), mas ofertada a 3.50 (mais cara que 3.24)
    db.prepare(`
      INSERT OR REPLACE INTO compras_oportunidades_mineradas (
        id, mensagem_id, distribuidora, produto_nome, ean, produto_id,
        preco_ofertado, preco_ult_compra_digifarma, percentual_desconto,
        status, data_oferta, created_at
      ) VALUES (?, 'msg-stat', 'DIST STAT', 'AP.BARB VICEROY LADY CARE C/2 12UND',
        '7898361212568', ?, 3.50, 38.88, 90.99, 'Aprovado_Radar', datetime('now'), datetime('now'))
    `).run(testStatusId, testProdId);

    const lista = comprasMineracaoService.listarOportunidades(db, { limite: 100 });
    const op = lista.find(o => o.id === testStatusId);

    assert(op, 'Oportunidade de teste deve existir');
    assert.strictEqual(op.precoUltCompraDigifarma, 3.24);
    assert.strictEqual(op.status, 'Descartado_Preco_Maior', `Status esperado Descartado_Preco_Maior pois 3.50 >= 3.24, mas obteve ${op.status}`);

    db.prepare('DELETE FROM compras_oportunidades_mineradas WHERE id = ?').run(testStatusId);
  });

  // 24. Adversarial: buscarUltimaCompraProduto localiza por descrição exata mesmo com produtoId inexistente
  await asyncTest('Adversarial: buscarUltimaCompraProduto encontra por descricao exata no cache se produtoId for inexistente', async () => {
    const res = await comprasMineracaoService.buscarUltimaCompraProduto({
      produtoId: 99999999, // ID inexistente
      ean: null,
      produtoNome: 'AP.BARB VICEROY LADY CARE C/2 12UND',
      dbInstance: db,
      options: { skipFirebird: true }
    });

    assert(res, 'Deve localizar o produto pela descrição exata');
    assert.strictEqual(res.precoUnitario, 3.24);
    assert.strictEqual(res.produto_id, 188549);
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
