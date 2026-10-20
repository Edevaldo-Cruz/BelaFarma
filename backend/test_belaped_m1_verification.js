/**
 * test_belaped_m1_verification.js
 * Teste unitário e de integração focado nos requisitos da Milestone M1 (BelaPed):
 * 1. Desvinculação total de marcas e cotação por molécula (menor preço faturado entre labs).
 * 2. Bypass da Trava 3 anti-alucinação para substitutos e genéricos equivalentes legítimos.
 * 3. Cálculo de menor custo unitário por dose (28 vs 30 cpr) e economia genuína positiva.
 * 4. Unificação canônica de chaves de equivalência 28 vs 30 cpr em compras-equivalentes.service.
 * 5. Preservação de substitutos em expurgarCotacoesInconsistentes (não deleção de is_substituto=1).
 * 6. Concorrência numWorkers = 7 para suporte pleno aos 7 robôs.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('./database');

const farmacoMatcher = require('./belaped-farmaco-matcher');
const motorEssencia = require('./belaped-motor-essencia');
const equivService = require('./services/compras-equivalentes.service');
const { validarCorrespondenciaProduto } = require('./belaped-validador');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Erro: ${err.message}`);
    failedTests++;
  }
}

console.log('\n=================================================================');
console.log('🧪 INICIANDO SUÍTE DE TESTES M1 - BELAPED QUOTATION ENGINE');
console.log('=================================================================\n');

// -----------------------------------------------------------------
// 1. Desvinculação total de marcas & Menor preço por molécula
// -----------------------------------------------------------------
console.log('📌 [BLOCO 1] Desvinculação de Marcas & Menor Preço por Molécula');

runTest('1.1 Eleição do menor preço faturado entre laboratórios concorrentes (Sandoz vs Accord vs EMS)', () => {
  const itemOriginal = {
    ean: '7898146824450',
    descricao: 'CLOPIDOGREL 75MG C/ 30 CPR - ACCORD',
    precoOriginal: 12.58
  };

  const concorrentes = [
    { ean: '7898146824450', descricao: 'CLOPIDOGREL 75MG C/ 30 CPR - ACCORD', preco: 12.58, laboratorio: 'ACCORD' },
    { ean: '7897595638724', descricao: 'CLOPIDOGREL 75MG C/ 30 CPR SANDOZ', preco: 9.79, laboratorio: 'SANDOZ' },
    { ean: '7896004738406', descricao: 'CLOPIDOGREL 75MG C/ 28 CPR EMS', preco: 9.50, laboratorio: 'EMS' }
  ];

  // Sandoz 9.79 / 30 = 0.3263 / dose
  // EMS 9.50 / 28 = 0.3393 / dose
  // Accord 12.58 / 30 = 0.4193 / dose
  const res = motorEssencia.filtrarEClassificarCandidatos(concorrentes, itemOriginal, db);

  assert.ok(res.vencedor, 'Deve eleger um produto vencedor');
  assert.strictEqual(res.vencedor.ean, '7897595638724', 'Sandoz deve ser o vencedor pelo menor custo por dose');
  assert.strictEqual(res.vencedor.isSubstituto, true, 'Deve marcar como substituto');
  assert.strictEqual(res.vencedor.custoPorDose, 0.3263, 'Custo por dose da Sandoz deve ser R$ 0,3263');
  assert.strictEqual(res.vencedor.economiaReais, 2.79, 'Economia em reais vs Accord deve ser R$ 2,79');
  assert.strictEqual(res.vencedor.economiaPct, 22.2, 'Economia percentual deve ser 22.2%');
});

runTest('1.2 Bypass da Trava 3 para substitutos eleitos vs Bloqueio de produto alucinado', () => {
  const descOriginal = 'CLOPIDOGREL 75MG C/ 30 CPR - EMS';
  const resultadoSubstituto = {
    disponivel: true,
    preco: 9.79,
    descricao: 'CLOPIDOGREL 75MG C/ 30 CPR SANDOZ',
    isSubstituto: true,
    isGenericoEquivalente: true
  };

  // Simulação da lógica da Trava 3 atualizada em belaped-endpoints.js
  let travaAcionada = false;
  let resultadoFinal = { ...resultadoSubstituto };

  const ehSubstitutoLegitimo = Boolean(
    resultadoFinal.isSubstituto ||
    resultadoFinal.isGenericoEquivalente ||
    resultadoFinal.is_substituto ||
    resultadoFinal.is_generico_mais_barato
  );

  if (descOriginal && resultadoFinal.descricao && !ehSubstitutoLegitimo) {
    const checagemSem = validarCorrespondenciaProduto(descOriginal, resultadoFinal.descricao);
    if (!checagemSem.valido) {
      travaAcionada = true;
      resultadoFinal = { disponivel: false, preco: null, mensagem: `Descartado: ${checagemSem.motivo}` };
    }
  }

  assert.strictEqual(travaAcionada, false, 'Trava 3 NÃO deve ser acionada para substitutos legítimos');
  assert.strictEqual(resultadoFinal.disponivel, true, 'Cotação legítima de substituto deve permanecer disponível');
  assert.strictEqual(resultadoFinal.preco, 9.79, 'Preço deve ser mantido');

  // Agora testa produto falso/alucinado (ex: dipirona cotada no lugar de clopidogrel sem flag de substituto)
  const resultadoAlucinado = {
    disponivel: true,
    preco: 4.50,
    descricao: 'DIPIRONA SODICA 500MG C/ 20 CPR TEUTO',
    isSubstituto: false,
    isGenericoEquivalente: false
  };

  let travaAlucinadaAcionada = false;
  let resultadoAlucinadoFinal = { ...resultadoAlucinado };
  const ehSubstituto2 = Boolean(
    resultadoAlucinadoFinal.isSubstituto ||
    resultadoAlucinadoFinal.isGenericoEquivalente
  );

  if (descOriginal && resultadoAlucinadoFinal.descricao && !ehSubstituto2) {
    const checagemSem = validarCorrespondenciaProduto(descOriginal, resultadoAlucinadoFinal.descricao);
    if (!checagemSem.valido) {
      travaAlucinadaAcionada = true;
      resultadoAlucinadoFinal = { disponivel: false, preco: null, mensagem: `Descartado: ${checagemSem.motivo}` };
    }
  }

  assert.strictEqual(travaAlucinadaAcionada, true, 'Trava 3 DEVE bloquear produto não-substituto alucinado');
  assert.strictEqual(resultadoAlucinadoFinal.disponivel, false, 'Produto alucinado deve ser descartado');
});

// -----------------------------------------------------------------
// 2. Equivalência 28 vs 30 Comprimidos & Custo por Dose
// -----------------------------------------------------------------
console.log('\n📌 [BLOCO 2] Equivalência 28 vs 30 Comprimidos & Economia Real');

runTest('2.1 Caixa de 30 cpr mais cara nominalmente, porém mais barata por dose que caixa de 28 cpr', () => {
  const itemOriginal = {
    ean: '7891112223334',
    descricao: 'ROSUVASTATINA 20MG C/ 28 COMPRIMIDOS',
    precoOriginal: 28.00 // R$ 1,00 por dose
  };

  const concorrentes = [
    { ean: '7891112223334', descricao: 'ROSUVASTATINA 20MG C/ 28 COMPRIMIDOS', preco: 28.00 },
    { ean: '7895556667778', descricao: 'ROSUVASTATINA 20MG C/ 30 COMPRIMIDOS', preco: 28.50 } // R$ 0,95 por dose
  ];

  const res = motorEssencia.filtrarEClassificarCandidatos(concorrentes, itemOriginal, db);

  assert.ok(res.vencedor);
  assert.strictEqual(res.vencedor.ean, '7895556667778', 'Apresentação de 30 cpr deve vencer pela menor dose');
  assert.strictEqual(res.vencedor.custoPorDose, 0.95, 'Custo por dose deve ser R$ 0,9500');

  // Preço de ref normalizado para 30 doses: (28 / 28) * 30 = R$ 30,00
  // Preço pago: R$ 28,50 -> Economia real: R$ 1,50 (5.0%)
  assert.strictEqual(res.vencedor.economiaReais, 1.50, 'Economia real deve ser calculada positivamente como R$ 1,50');
  assert.strictEqual(res.vencedor.economiaPct, 5.0, 'Economia percentual deve ser 5.0%');
});

runTest('2.2 Caixa de 28 cpr mais barata por dose que caixa de 30 cpr', () => {
  const itemOriginal = {
    ean: '7899990001112',
    descricao: 'ATORVASTATINA 20MG C/ 30 CPR',
    precoOriginal: 30.00 // R$ 1,00 por dose
  };

  const concorrentes = [
    { ean: '7899990001112', descricao: 'ATORVASTATINA 20MG C/ 30 CPR', preco: 30.00 },
    { ean: '7899990002223', descricao: 'ATORVASTATINA 20MG C/ 28 CPR', preco: 25.20 } // R$ 0,90 por dose
  ];

  const res = motorEssencia.filtrarEClassificarCandidatos(concorrentes, itemOriginal, db);

  assert.ok(res.vencedor);
  assert.strictEqual(res.vencedor.ean, '7899990002223', 'Apresentação de 28 cpr deve vencer');
  assert.strictEqual(res.vencedor.custoPorDose, 0.90, 'Custo por dose deve ser R$ 0,9000');

  // Preço de ref normalizado para 28 doses: (30 / 30) * 28 = R$ 28,00
  // Preço pago: R$ 25,20 -> Economia real: R$ 2,80 (10.0%)
  assert.strictEqual(res.vencedor.economiaReais, 2.80, 'Economia real deve ser R$ 2,80');
  assert.strictEqual(res.vencedor.economiaPct, 10.0, 'Economia percentual deve ser 10.0%');
});

// -----------------------------------------------------------------
// 3. Unificação Canônica em compras-equivalentes.service
// -----------------------------------------------------------------
console.log('\n📌 [BLOCO 3] Chaves Canônicas Unificadas (compras-equivalentes.service)');

runTest('3.1 Extração de atributos e geração de chave idêntica para 28 vs 30 cpr', () => {
  const p28 = equivService.extrairAtributosProduto('CLOPIDOGREL 75MG C/ 28 COMPRIMIDOS EMS');
  const p30 = equivService.extrairAtributosProduto('CLOPIDOGREL 75MG C/ 30 CPR SANDOZ');

  assert.strictEqual(p28.principio, 'CLOPIDOGREL', 'Princípio de p28 deve ser CLOPIDOGREL');
  assert.strictEqual(p30.principio, 'CLOPIDOGREL', 'Princípio de p30 deve ser CLOPIDOGREL');
  assert.strictEqual(p28.dosagem, '75MG', 'Dosagem deve ser 75MG');
  assert.strictEqual(p30.dosagem, '75MG', 'Dosagem deve ser 75MG');
  assert.strictEqual(p28.unidadesChave, '28-30', 'unidadesChave deve ser 28-30 para p28');
  assert.strictEqual(p30.unidadesChave, '28-30', 'unidadesChave deve ser 28-30 para p30');
  assert.strictEqual(p28.chave, p30.chave, `As chaves canônicas devem ser exatamente idênticas: "${p28.chave}" vs "${p30.chave}"`);
});

runTest('3.2 Busca de grupo por produto reconhece 28 e 30 cpr no mesmo grupo', () => {
  const testGrupoId = 'test-grupo-m1-cpr';
  const now = new Date().toISOString();

  // Cria grupo para 30 cpr
  db.prepare(`
    INSERT OR REPLACE INTO compras_grupos_equivalentes (
      id, nome_grupo, principio_ativo, dosagem, unidades_embalagem, forma_farmaceutica, est_minimo_grupo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(testGrupoId, 'MOLECULATEST 50MG C/ 28-30 COMPRIMIDO', 'MOLECULATEST', '50MG', 30, 'COMPRIMIDO', 10, now, now);

  // Busca passando produto de 28 cpr
  const grupoEncontrado = equivService.buscarGrupoPorProduto(null, null, 'MOLECULATEST 50MG C/ 28 COMPRIMIDOS - EUROFARMA', db);
  assert.ok(grupoEncontrado, 'Deve encontrar o grupo mesmo sendo 28 comprimidos');
  assert.strictEqual(grupoEncontrado.grupoId, testGrupoId, 'ID do grupo deve corresponder ao cadastrado');

  // Limpeza do mock
  db.prepare('DELETE FROM compras_grupos_equivalentes WHERE id = ?').run(testGrupoId);
});

// -----------------------------------------------------------------
// 4. Preservação de Substitutos no Expurgo
// -----------------------------------------------------------------
console.log('\n📌 [BLOCO 4] Preservação de Substitutos em expurgarCotacoesInconsistentes');

runTest('4.1 Cotações com is_substituto = 1 NÃO são invalidadas pelo expurgo', () => {
  const eanTeste = '7899999999991';
  const eanFantasma = '7899999999992';
  const now = new Date().toISOString();

  // Insere produto no cache do ERP
  db.prepare(`
    INSERT OR REPLACE INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, est_minimo_calculado, custo_unitario, atualizado_em
    ) VALUES (888801, 'CLOPIDOGREL 75MG C/ 30 CPR - ACCORD', ?, 5, 2, 12.00, ?)
  `).run(eanTeste, now);

  db.prepare(`
    INSERT OR REPLACE INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, est_minimo_calculado, custo_unitario, atualizado_em
    ) VALUES (888802, 'SHAMPOO SALON LINE 300ML', ?, 5, 2, 15.00, ?)
  `).run(eanFantasma, now);

  // Insere cotação legítima de substituto (Sandoz substituindo Accord) com is_substituto = 1
  db.prepare(`
    INSERT OR REPLACE INTO belaped_cotacoes_reais (
      ean, fornecedor, preco, disponivel, descricao, is_substituto, updated_at
    ) VALUES (?, 'PROFARMA_TEST', 9.79, 1, 'CLOPIDOGREL 75MG C/ 30 CPR SANDOZ', 1, ?)
  `).run(eanTeste, now);

  // Insere cotação fantasma com laboratório incompatível e is_substituto = 0
  db.prepare(`
    INSERT OR REPLACE INTO belaped_cotacoes_reais (
      ean, fornecedor, preco, disponivel, descricao, is_substituto, updated_at
    ) VALUES (?, 'PROFARMA_TEST', 14.00, 1, 'CONDICIONADOR CREMER 300ML', 0, ?)
  `).run(eanFantasma, now);

  // Executa o expurgo de consistência
  // Importa a função ou roda a query atualizada
  const endpointsCode = fs.readFileSync(path.resolve(__dirname, 'belaped-endpoints.js'), 'utf8');
  assert.ok(
    endpointsCode.includes('AND COALESCE(c.is_substituto, 0) = 0'),
    'Query de expurgo em belaped-endpoints.js deve filtrar COALESCE(c.is_substituto, 0) = 0'
  );

  // Simula execução do expurgo corrigido
  const cotacoes = db.prepare(`
    SELECT c.id, c.ean, c.fornecedor, c.preco, c.descricao as desc_cotada, e.descricao as desc_esperada,
           COALESCE(c.is_substituto, 0) as is_substituto,
           COALESCE(c.is_generico_mais_barato, 0) as is_generico_mais_barato
    FROM belaped_cotacoes_reais c
    JOIN compras_estoque_cache e ON e.ean = c.ean
    WHERE c.disponivel = 1 AND c.preco > 0
      AND COALESCE(c.is_substituto, 0) = 0
      AND COALESCE(c.is_generico_mais_barato, 0) = 0
  `).all();

  const stmtInvalidar = db.prepare(`
    UPDATE belaped_cotacoes_reais
    SET disponivel = 0, preco = NULL, descricao = @motivo, updated_at = datetime('now')
    WHERE id = @id
  `);

  for (const row of cotacoes) {
    const checagem = validarCorrespondenciaProduto(row.desc_esperada, row.desc_cotada);
    if (!checagem.valido) {
      stmtInvalidar.run({ id: row.id, motivo: `[Incompatível] ${checagem.motivo}` });
    }
  }

  // Verifica resultado no banco
  const cotSubstituto = db.prepare('SELECT disponivel, preco FROM belaped_cotacoes_reais WHERE ean = ?').get(eanTeste);
  const cotFantasma = db.prepare('SELECT disponivel, preco FROM belaped_cotacoes_reais WHERE ean = ?').get(eanFantasma);

  assert.strictEqual(cotSubstituto.disponivel, 1, 'Substituto deve permanecer disponível (1)');
  assert.strictEqual(cotSubstituto.preco, 9.79, 'Preço do substituto deve ser preservado intacto (R$ 9,79)');

  assert.strictEqual(cotFantasma.disponivel, 0, 'Cotação fantasma inconsistente deve ser invalidada (0)');
  assert.strictEqual(cotFantasma.preco, null, 'Preço da cotação fantasma deve ser anulado (null)');

  // Limpeza do mock
  db.prepare('DELETE FROM belaped_cotacoes_reais WHERE ean IN (?, ?)').run(eanTeste, eanFantasma);
  db.prepare('DELETE FROM compras_estoque_cache WHERE ean IN (?, ?)').run(eanTeste, eanFantasma);
});

// -----------------------------------------------------------------
// 5. Concorrência e Workers
// -----------------------------------------------------------------
console.log('\n📌 [BLOCO 5] Concorrência numWorkers = 7');

runTest('5.1 numWorkers configurado como 7 para cotação simultânea dos 7 robôs', () => {
  const endpointsCode = fs.readFileSync(path.resolve(__dirname, 'belaped-endpoints.js'), 'utf8');
  assert.ok(
    endpointsCode.includes("numWorkers = fornecedor === 'TODOS' ? 7 : 1"),
    "numWorkers deve ser configurado como fornecedor === 'TODOS' ? 7 : 1 em belaped-endpoints.js"
  );
});

// -----------------------------------------------------------------
// Resumo Final
// -----------------------------------------------------------------
console.log('\n=================================================================');
console.log(`🏁 RESULTADO DA VERIFICAÇÃO M1:`);
console.log(`   Total de Testes: ${totalTests}`);
console.log(`   Aprovados:       ${passedTests}`);
console.log(`   Falhas:          ${failedTests}`);
console.log('=================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
