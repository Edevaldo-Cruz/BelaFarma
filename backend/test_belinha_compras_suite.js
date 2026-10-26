/**
 * test_belinha_compras_suite.js
 * Suíte de Testes Automatizados E2E da "Belinha Compras" (Tiers 1 a 4).
 * Cobertura de Ponta a Ponta dos Requisitos R1, R2, R3 e R4 de ORIGINAL_REQUEST.md.
 * 
 * Execução: node backend/test_belinha_compras_suite.js
 * Código de saída: 0 em caso de 100% de sucesso, 1 em qualquer falha.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Carrega instâncias e serviços
const db = require('./database');
const belinhaService = require('./services/belinha-compras.service');
const aiService = require('./services/ai.service');

// Carrega fixtures oficiais
const fixturesPath = path.join(__dirname, 'fixtures', 'belinha_compras_fixtures.json');
if (!fs.existsSync(fixturesPath)) {
  console.error(`❌ Arquivo de fixtures não encontrado em: ${fixturesPath}`);
  process.exit(1);
}
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));

// ──────────────────────────────────────────────────────────
// ANSI Cores e Formatação de Terminal
// ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

// ──────────────────────────────────────────────────────────
// Validador Estrito de JSON Schema (Draft-07)
// ──────────────────────────────────────────────────────────

/**
 * Valida se um objeto obedece estritamente ao schema JSON formal da Belinha Compras.
 * Lança erro assertivo se violar tipagem, nulabilidade ou campos obrigatórios.
 * @param {object} res - Resposta a validar
 * @param {string} context - Contexto do teste para mensagens de erro
 */
function assertStrictBelinhaSchema(res, context = '') {
  const prefix = context ? `[${context}] ` : '';
  assert(res !== null && typeof res === 'object', `${prefix}Resultado deve ser um objeto JSON não nulo`);
  assert(typeof res.sucesso === 'boolean', `${prefix}'sucesso' deve ser boolean (recebido: ${typeof res.sucesso})`);
  assert(typeof res.ehOfertaComercial === 'boolean', `${prefix}'ehOfertaComercial' deve ser boolean`);
  assert(res.fornecedor !== null && typeof res.fornecedor === 'object', `${prefix}'fornecedor' deve ser objeto não nulo`);

  // Validação estrita das propriedades do fornecedor
  const f = res.fornecedor;
  assert('distribuidora' in f, `${prefix}'fornecedor.distribuidora' deve existir no objeto`);
  assert(f.distribuidora === null || typeof f.distribuidora === 'string', `${prefix}'distribuidora' deve ser string ou null`);

  assert('representante' in f, `${prefix}'fornecedor.representante' deve existir no objeto`);
  assert(f.representante === null || typeof f.representante === 'string', `${prefix}'representante' deve ser string ou null`);

  assert('condicaoPagamento' in f, `${prefix}'fornecedor.condicaoPagamento' deve existir no objeto`);
  assert(f.condicaoPagamento === null || typeof f.condicaoPagamento === 'string', `${prefix}'condicaoPagamento' deve ser string ou null`);

  assert('pedidoMinimo' in f, `${prefix}'fornecedor.pedidoMinimo' deve existir no objeto`);
  assert(f.pedidoMinimo === null || (typeof f.pedidoMinimo === 'number' && f.pedidoMinimo >= 0), `${prefix}'pedidoMinimo' deve ser number >= 0 ou null`);

  assert('validadeOferta' in f, `${prefix}'fornecedor.validadeOferta' deve existir no objeto`);
  assert(f.validadeOferta === null || typeof f.validadeOferta === 'string', `${prefix}'validadeOferta' deve ser string ou null`);

  // Validação estrita do array produtosOfertados
  assert(Array.isArray(res.produtosOfertados), `${prefix}'produtosOfertados' deve ser um array`);

  // Se não for oferta comercial, o array DEVE ser vazio
  if (!res.ehOfertaComercial) {
    assert.strictEqual(res.produtosOfertados.length, 0, `${prefix}Se ehOfertaComercial é false, produtosOfertados DEVE ser vazio`);
  }

  // Validação de cada item do array
  for (let idx = 0; idx < res.produtosOfertados.length; idx++) {
    const item = res.produtosOfertados[idx];
    const itemPrefix = `${prefix}produtosOfertados[${idx}] `;

    assert(item !== null && typeof item === 'object', `${itemPrefix}deve ser um objeto`);
    assert(typeof item.nomeComercial === 'string' && item.nomeComercial.trim().length >= 3, `${itemPrefix}'nomeComercial' deve ser string com >= 3 caracteres`);

    assert('ean' in item, `${itemPrefix}'ean' deve existir`);
    if (item.ean !== null) {
      assert(typeof item.ean === 'string', `${itemPrefix}'ean' deve ser string quando presente`);
      assert(/^\d{13}$/.test(item.ean), `${itemPrefix}'ean' deve ter exatamente 13 dígitos numéricos: ${item.ean}`);
      assert(belinhaService.validarEan13(item.ean), `${itemPrefix}'ean' deve possuir dígito verificador módulo 10 válido: ${item.ean}`);
    }

    assert('laboratorio' in item, `${itemPrefix}'laboratorio' deve existir`);
    assert(item.laboratorio === null || typeof item.laboratorio === 'string', `${itemPrefix}'laboratorio' deve ser string ou null`);

    assert(typeof item.precoOfertado === 'number', `${itemPrefix}'precoOfertado' deve ser number`);
    assert(item.precoOfertado > 0, `${itemPrefix}'precoOfertado' deve ser estritamente maior que 0`);
    assert(!isNaN(item.precoOfertado), `${itemPrefix}'precoOfertado' não pode ser NaN`);

    assert('unidade' in item, `${itemPrefix}'unidade' deve existir`);
    assert(item.unidade === null || typeof item.unidade === 'string', `${itemPrefix}'unidade' deve ser string ou null`);

    assert('bonificacao' in item, `${itemPrefix}'bonificacao' deve existir`);
    assert(item.bonificacao === null || typeof item.bonificacao === 'string', `${itemPrefix}'bonificacao' deve ser string ou null`);

    assert('descontoProgressivo' in item, `${itemPrefix}'descontoProgressivo' deve existir`);
    assert(item.descontoProgressivo === null || typeof item.descontoProgressivo === 'string', `${itemPrefix}'descontoProgressivo' deve ser string ou null`);

    assert('confiancaOcr' in item, `${itemPrefix}'confiancaOcr' deve existir`);
    if (item.confiancaOcr !== null) {
      assert(typeof item.confiancaOcr === 'number', `${itemPrefix}'confiancaOcr' deve ser number quando presente`);
      assert(item.confiancaOcr >= 0 && item.confiancaOcr <= 1, `${itemPrefix}'confiancaOcr' deve estar entre 0.0 e 1.0 (recebido: ${item.confiancaOcr})`);
    }
  }
}

// ──────────────────────────────────────────────────────────
// Harness de Testes e Contadores de Métricas
// ──────────────────────────────────────────────────────────
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const tierStats = {
  1: { total: 0, pass: 0, fail: 0, name: 'Tier 1 - Feature Coverage' },
  2: { total: 0, pass: 0, fail: 0, name: 'Tier 2 - Boundary & Corner Cases' },
  3: { total: 0, pass: 0, fail: 0, name: 'Tier 3 - Cross-Feature Combinations' },
  4: { total: 0, pass: 0, fail: 0, name: 'Tier 4 - Real-World Scenarios' }
};

const failedDetails = [];

async function runTestCase(tier, id, description, testFn) {
  totalTests++;
  tierStats[tier].total++;
  const testTag = `${C.cyan}[T${tier}:${id}]${C.reset}`;

  try {
    await testFn();
    passedTests++;
    tierStats[tier].pass++;
    console.log(`  ${C.green}✔ PASS${C.reset} ${testTag} ${description}`);
  } catch (err) {
    failedTests++;
    tierStats[tier].fail++;
    console.error(`  ${C.red}✖ FAIL${C.reset} ${testTag} ${description}`);
    console.error(`     ${C.red}Erro:${C.reset} ${err.message}`);
    failedDetails.push({ tier, id, description, error: err.message, stack: err.stack });
  }
}

// ──────────────────────────────────────────────────────────
// Início da Execução da Bateria de Testes
// ──────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  console.log(`\n${C.bold}════════════════════════════════════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.blue}🤖 BELINHA COMPRAS — SUÍTE DE TESTES AUTOMATIZADA E2E (TIERS 1 A 4)${C.reset}`);
  console.log(`${C.dim}Conformidade com TEST_INFRA.md, PROJECT.md e ORIGINAL_REQUEST.md (Requisitos R1, R2, R3, R4)${C.reset}`);
  console.log(`${C.bold}════════════════════════════════════════════════════════════════════════════════════════════${C.reset}\n`);

  // Interceptador para simulações determinísticas de IA/OCR sem depender de quota externa
  const originalCallAI = aiService.callAI;

  // ══════════════════════════════════════════════════════════
  // TIER 1: Feature Coverage (≥ 25 Testes)
  // ══════════════════════════════════════════════════════════
  console.log(`\n${C.bold}${C.yellow}📋 GRUPO 1: TIER 1 — FEATURE COVERAGE (Isolamento de Funcionalidades)${C.reset}`);
  console.log(`${C.dim}Verificação unitária de classificação, fornecedor, rep, prazos, mínimo, EAN, lab, preço e bonificação.${C.reset}\n`);

  for (const fix of fixtures.tier1_feature_fixtures) {
    await runTestCase(1, fix.id, fix.description, async () => {
      // Executa motor de extração determinístico/híbrido
      const res = belinhaService.extrairOfertasDeterministicas(fix.input.text, {
        pushName: fix.input.pushName,
        phone: fix.input.phone
      });

      // Validação 1: Schema JSON Estrito
      assertStrictBelinhaSchema(res, fix.id);
      assert.strictEqual(res.sucesso, true, 'sucesso deve ser true');

      // Validações específicas por feature
      if (fix.expected.ehOfertaComercial !== undefined) {
        assert.strictEqual(res.ehOfertaComercial, fix.expected.ehOfertaComercial, `ehOfertaComercial esperado: ${fix.expected.ehOfertaComercial}`);
      }

      if (fix.expected.produtosCountMin !== undefined) {
        assert(res.produtosOfertados.length >= fix.expected.produtosCountMin, `Esperado mínimo ${fix.expected.produtosCountMin} produtos, obtido ${res.produtosOfertados.length}`);
      }

      if (fix.expected.distribuidora !== undefined) {
        assert(res.fornecedor.distribuidora && res.fornecedor.distribuidora.toUpperCase().includes(fix.expected.distribuidora.toUpperCase()), 
          `Distribuidora esperada '${fix.expected.distribuidora}', obtida: '${res.fornecedor.distribuidora}'`);
      }

      if (fix.expected.representante !== undefined) {
        assert(res.fornecedor.representante && res.fornecedor.representante.toLowerCase().includes(fix.expected.representante.toLowerCase()),
          `Representante esperado contendo '${fix.expected.representante}', obtido: '${res.fornecedor.representante}'`);
      }

      if (fix.expected.condicaoPagamento !== undefined) {
        assert(res.fornecedor.condicaoPagamento && res.fornecedor.condicaoPagamento.toLowerCase().includes(fix.expected.condicaoPagamento.toLowerCase()),
          `Condição de pagamento esperada contendo '${fix.expected.condicaoPagamento}', obtida: '${res.fornecedor.condicaoPagamento}'`);
      }

      if (fix.expected.pedidoMinimo !== undefined) {
        assert.strictEqual(res.fornecedor.pedidoMinimo, fix.expected.pedidoMinimo, `Pedido mínimo esperado ${fix.expected.pedidoMinimo}, obtido ${res.fornecedor.pedidoMinimo}`);
      }

      if (fix.expected.validadeOferta !== undefined) {
        assert(res.fornecedor.validadeOferta && res.fornecedor.validadeOferta.includes(fix.expected.validadeOferta),
          `Validade esperada '${fix.expected.validadeOferta}', obtida: '${res.fornecedor.validadeOferta}'`);
      }

      if (fix.expected.nomeComercial !== undefined) {
        assert(res.produtosOfertados.length > 0, 'Deveria ter extraído ao menos um produto');
        const prod = res.produtosOfertados[0];
        assert(prod.nomeComercial.includes('AMOXICILINA'), `Nome do produto deve conter AMOXICILINA (recebido: ${prod.nomeComercial})`);
        assert(!prod.nomeComercial.includes('R$'), `Nome do produto não pode conter poluição de preço: ${prod.nomeComercial}`);
      }

      if (fix.expected.ean !== undefined) {
        assert(res.produtosOfertados.length > 0, 'Deveria conter produtos');
        const prod = res.produtosOfertados.find(p => p.ean === fix.expected.ean);
        assert(prod, `Produto com EAN ${fix.expected.ean} deveria ser encontrado`);
        assert(belinhaService.validarEan13(prod.ean), 'EAN deve ser válido pelo algoritmo GS1 Módulo 10');
      }

      if (fix.expected.laboratorio !== undefined) {
        assert(res.produtosOfertados.length > 0, 'Deveria conter produtos');
        const prod = res.produtosOfertados[0];
        assert(prod.laboratorio && prod.laboratorio.toUpperCase() === fix.expected.laboratorio.toUpperCase(),
          `Laboratório esperado '${fix.expected.laboratorio}', obtido '${prod.laboratorio}'`);
      }

      if (fix.expected.precoOfertado !== undefined) {
        assert(res.produtosOfertados.length > 0, 'Deveria conter produtos');
        const prod = res.produtosOfertados[0];
        assert.strictEqual(prod.precoOfertado, fix.expected.precoOfertado, `Preço líquido esperado ${fix.expected.precoOfertado}, obtido ${prod.precoOfertado}`);
      }

      if (fix.expected.unidade !== undefined) {
        assert(res.produtosOfertados.length > 0, 'Deveria conter produtos');
        const prod = res.produtosOfertados[0];
        assert.strictEqual(prod.unidade, fix.expected.unidade, `Unidade esperada '${fix.expected.unidade}', obtida '${prod.unidade}'`);
      }

      if (fix.expected.bonificacaoPresent) {
        assert(res.produtosOfertados.length > 0, 'Deveria conter produtos');
        const prod = res.produtosOfertados[0];
        assert(prod.bonificacao !== null && prod.bonificacao.length > 0, 'Bonificação deveria estar preenchida');
      }

      if (fix.expected.descontoProgressivoPresent) {
        assert(res.produtosOfertados.length > 0, 'Deveria conter produtos');
        const prod = res.produtosOfertados[0];
        assert(prod.descontoProgressivo !== null && prod.descontoProgressivo.length > 0, 'descontoProgressivo deveria estar presente');
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // TIER 2: Boundary & Corner Cases (≥ 20 Testes)
  // ══════════════════════════════════════════════════════════
  console.log(`\n${C.bold}${C.yellow}📋 GRUPO 2: TIER 2 — BOUNDARY & CORNER CASES (Casos de Borda e Sanidade)${C.reset}`);
  console.log(`${C.dim}Rejeição de ruído, comprovantes, EANs corrompidos, dosagem com vírgula vs preço, e buffers vazios.${C.reset}\n`);

  for (const fix of fixtures.tier2_boundary_corner_fixtures) {
    await runTestCase(2, fix.id, fix.description, async () => {
      // Caso especial: buffer corrompido / vazio
      if (fix.category === 'buffer_boundary') {
        const res = await belinhaService.processarMensagemComercial({
          buffer: Buffer.from([]),
          mimeType: 'image/jpeg',
          pushName: fix.input.pushName,
          phone: fix.input.phone
        });
        assertStrictBelinhaSchema(res, fix.id);
        assert.strictEqual(res.sucesso, true);
        assert.strictEqual(res.ehOfertaComercial, false);
        assert.strictEqual(res.produtosOfertados.length, 0);
        return;
      }

      const res = belinhaService.extrairOfertasDeterministicas(fix.input.text, {
        pushName: fix.input.pushName,
        phone: fix.input.phone
      });

      // Validação estrita de schema
      assertStrictBelinhaSchema(res, fix.id);
      assert.strictEqual(res.sucesso, true);

      // Verificações específicas do caso de borda
      if (fix.expected.ehOfertaComercial !== undefined) {
        assert.strictEqual(res.ehOfertaComercial, fix.expected.ehOfertaComercial,
          `ehOfertaComercial esperado ${fix.expected.ehOfertaComercial}, obtido ${res.ehOfertaComercial}`);
      }

      if (fix.expected.produtosOfertados && fix.expected.produtosOfertados.length === 0) {
        assert.strictEqual(res.produtosOfertados.length, 0, `produtosOfertados deveria ser vazio (recebido: ${res.produtosOfertados.length})`);
      }

      if (fix.expected.eanNull) {
        // Se houver algum produto extraído na linha com EAN inválido, o EAN DEVE ser nulo
        for (const prod of res.produtosOfertados) {
          assert.strictEqual(prod.ean, null, `EAN com erro de formato ou checksum DEVE ser null (recebido: ${prod.ean})`);
        }
      }

      if (fix.expected.precoOfertado !== undefined) {
        assert(res.produtosOfertados.length > 0, 'Deveria ter extraído ao menos um produto');
        assert.strictEqual(res.produtosOfertados[0].precoOfertado, fix.expected.precoOfertado,
          `Preço esperado ${fix.expected.precoOfertado}, obtido ${res.produtosOfertados[0].precoOfertado}`);
      }

      if (fix.expected.nomeContains) {
        assert(res.produtosOfertados.length > 0, 'Deveria ter extraído produto herdando contexto');
        assert(res.produtosOfertados[0].nomeComercial.includes(fix.expected.nomeContains),
          `Nome comercial deveria conter '${fix.expected.nomeContains}' (recebido: ${res.produtosOfertados[0].nomeComercial})`);
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // TIER 3: Cross-Feature Combinations (≥ 15 Testes)
  // ══════════════════════════════════════════════════════════
  console.log(`\n${C.bold}${C.yellow}📋 GRUPO 3: TIER 3 — CROSS-FEATURE COMBINATIONS (Combinações Complexas)${C.reset}`);
  console.log(`${C.dim}Ofertas com mix de bonificação, prazos compostos, combos, faixas progressivas e múltiplos labs.${C.reset}\n`);

  for (const fix of fixtures.tier3_combination_fixtures) {
    await runTestCase(3, fix.id, fix.description, async () => {
      const res = belinhaService.extrairOfertasDeterministicas(fix.input.text, {
        pushName: fix.input.pushName,
        phone: fix.input.phone
      });

      assertStrictBelinhaSchema(res, fix.id);
      assert.strictEqual(res.sucesso, true);

      if (fix.expected.ehOfertaComercial !== undefined) {
        assert.strictEqual(res.ehOfertaComercial, fix.expected.ehOfertaComercial);
      }

      if (fix.expected.distribuidora) {
        assert(res.fornecedor.distribuidora && res.fornecedor.distribuidora.toUpperCase().includes(fix.expected.distribuidora.toUpperCase()),
          `Distribuidora esperada contendo '${fix.expected.distribuidora}', obtida '${res.fornecedor.distribuidora}'`);
      }

      if (fix.expected.representante) {
        assert(res.fornecedor.representante && res.fornecedor.representante.toLowerCase().includes(fix.expected.representante.toLowerCase()),
          `Representante esperado contendo '${fix.expected.representante}', obtido '${res.fornecedor.representante}'`);
      }

      if (fix.expected.condicaoPagamento) {
        assert(res.fornecedor.condicaoPagamento && res.fornecedor.condicaoPagamento.toLowerCase().includes(fix.expected.condicaoPagamento.toLowerCase()),
          `Prazos esperados contendo '${fix.expected.condicaoPagamento}', obtidos '${res.fornecedor.condicaoPagamento}'`);
      }

      if (fix.expected.pedidoMinimo) {
        assert.strictEqual(res.fornecedor.pedidoMinimo, fix.expected.pedidoMinimo);
      }

      if (fix.expected.validadeOferta) {
        assert(res.fornecedor.validadeOferta && res.fornecedor.validadeOferta.includes(fix.expected.validadeOferta),
          `Validade esperada contendo '${fix.expected.validadeOferta}', obtida '${res.fornecedor.validadeOferta}'`);
      }

      if (fix.expected.produtosCount !== undefined) {
        assert.strictEqual(res.produtosOfertados.length, fix.expected.produtosCount,
          `Quantidade esperada de produtos: ${fix.expected.produtosCount}, obtida: ${res.produtosOfertados.length}`);
      }

      if (fix.expected.precosEsperados) {
        const precosExtraidos = res.produtosOfertados.map(p => p.precoOfertado);
        assert.deepStrictEqual(precosExtraidos, fix.expected.precosEsperados,
          `Preços esperados ${JSON.stringify(fix.expected.precosEsperados)}, obtidos ${JSON.stringify(precosExtraidos)}`);
      }

      if (fix.expected.allEansValid13) {
        for (const prod of res.produtosOfertados) {
          assert(prod.ean !== null, `Produto '${prod.nomeComercial}' deve possuir EAN extraído`);
          assert(belinhaService.validarEan13(prod.ean), `EAN ${prod.ean} deve ser válido`);
        }
      }

      if (fix.expected.hasDescontoProgressivo) {
        const comProgressivo = res.produtosOfertados.filter(p => p.descontoProgressivo !== null);
        assert(comProgressivo.length > 0, 'Deveria conter produtos com descontoProgressivo preenchido');
      }

      if (fix.expected.firstTwoEans13 && fix.expected.thirdEanNull) {
        assert(res.produtosOfertados[0].ean !== null && belinhaService.validarEan13(res.produtosOfertados[0].ean));
        assert(res.produtosOfertados[1].ean !== null && belinhaService.validarEan13(res.produtosOfertados[1].ean));
        assert.strictEqual(res.produtosOfertados[2].ean, null, 'Terceiro produto não tinha EAN na linha e deve ter ean: null');
      }

      if (fix.expected.labsEsperados) {
        const labs = res.produtosOfertados.map(p => (p.laboratorio || '').toUpperCase());
        for (const expLab of fix.expected.labsEsperados) {
          assert(labs.includes(expLab.toUpperCase()), `Laboratório '${expLab}' deveria estar presente nos produtos extraídos (${labs.join(', ')})`);
        }
      }

      if (fix.expected.unidadesEsperadas) {
        const unidades = res.produtosOfertados.map(p => p.unidade);
        assert.deepStrictEqual(unidades, fix.expected.unidadesEsperadas,
          `Unidades esperadas ${JSON.stringify(fix.expected.unidadesEsperadas)}, obtidas ${JSON.stringify(unidades)}`);
      }

      if (fix.expected.bonificacaoPresent) {
        assert(res.produtosOfertados[0].bonificacao !== null, 'Deveria ter extraído bonificação');
      }

      if (fix.expected.validadePresent) {
        assert(res.fornecedor.validadeOferta !== null, 'Validade textual deveria estar preenchida');
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // TIER 4: Real-World Scenarios (≥ 6 Testes)
  // ══════════════════════════════════════════════════════════
  console.log(`\n${C.bold}${C.yellow}📋 GRUPO 4: TIER 4 — REAL-WORLD SCENARIOS (Cenários Críticos de Mercado)${C.reset}`);
  console.log(`${C.dim}Transmissão Panpharma, Visão Multimodal com confiancaOcr, Bonificações reais e Radar BelaPed.${C.reset}\n`);

  // Cenário 1: Lista de Transmissão Panpharma com 10 Medicamentos
  await runTestCase(4, 'T4_01_PANPHARMA', 'Cenário 1: Transmissão Panpharma com 10 Produtos e EANs Válidos', async () => {
    const fix = fixtures.tier4_scenario_fixtures.find(f => f.id === 'T4_01_PANPHARMA_BROADCAST_10_ITEMS');
    const res = belinhaService.extrairOfertasDeterministicas(fix.input.text, {
      pushName: fix.input.pushName,
      phone: fix.input.phone
    });

    assertStrictBelinhaSchema(res, 'T4_01');
    assert.strictEqual(res.ehOfertaComercial, true);
    assert(res.fornecedor.distribuidora.toUpperCase().includes('PANPHARMA'));
    assert(res.fornecedor.representante.includes('Carlos'));
    assert(res.fornecedor.condicaoPagamento.includes('28/42'));
    assert.strictEqual(res.fornecedor.pedidoMinimo, 350);
    assert.strictEqual(res.fornecedor.validadeOferta, '2026-10-31');
    assert.strictEqual(res.produtosOfertados.length, 10, 'Deve extrair todos os 10 medicamentos da lista');

    // Verifica todos os 10 EANs com algoritmo Módulo 10
    for (const p of res.produtosOfertados) {
      assert(p.ean !== null, `Produto '${p.nomeComercial}' deve possuir EAN`);
      assert(belinhaService.validarEan13(p.ean), `EAN ${p.ean} deve passar no teste GS1 Módulo 10`);
      assert(p.precoOfertado > 0, `Preço deve ser positivo`);
      assert(p.laboratorio !== null, `Laboratório deve ser identificado`);
    }
  });

  // Cenário 2: Encarte Fotográfico Santa Cruz (Multimodal Vision Simulation com confiancaOcr)
  await runTestCase(4, 'T4_02_MULTIMODAL_VISION', 'Cenário 2: Encarte Fotográfico Santa Cruz com confiancaOcr 0.95', async () => {
    const fix = fixtures.tier4_scenario_fixtures.find(f => f.id === 'T4_02_SANTA_CRUZ_IMAGE_MULTIMODAL');

    // Prepara resposta JSON simulada de visão computacional
    const simulatedVisionJson = JSON.stringify({
      sucesso: true,
      ehOfertaComercial: true,
      fornecedor: {
        distribuidora: "SANTA CRUZ",
        representante: "Santa Cruz Farma",
        condicaoPagamento: "30 dias no boleto",
        pedidoMinimo: 500,
        validadeOferta: "2026-10-31"
      },
      produtosOfertados: [
        {
          nomeComercial: "AMOXICILINA 500MG 21CAP EMS",
          ean: "7896004701233",
          laboratorio: "EMS",
          precoOfertado: 14.20,
          unidade: "cx",
          bonificacao: null,
          descontoProgressivo: null,
          confiancaOcr: 0.95
        },
        {
          nomeComercial: "PARACETAMOL 750MG 20CPR CIMED",
          ean: "7896523206547",
          laboratorio: "CIMED",
          precoOfertado: 3.75,
          unidade: "cx",
          bonificacao: null,
          descontoProgressivo: null,
          confiancaOcr: 0.95
        },
        {
          nomeComercial: "LOSARTANA 50MG 30CPR NEO QUIMICA",
          ean: "7896714201238",
          laboratorio: "NEO QUIMICA",
          precoOfertado: 1.70,
          unidade: "cx",
          bonificacao: null,
          descontoProgressivo: null,
          confiancaOcr: 0.92
        }
      ]
    });

    // Mock seguro da chamada multimodal do aiService
    aiService.callAI = async (prompt, systemPrompt, options) => {
      return simulatedVisionJson;
    };

    try {
      const mockImageBuffer = Buffer.from('GIF89a_MOCK_IMAGE_BUFFER_DATA');
      const res = await belinhaService.extrairOfertasMultimodal(mockImageBuffer, 'image/jpeg', {
        pushName: fix.input.pushName,
        phone: fix.input.phone,
        caption: fix.input.caption
      });

      assertStrictBelinhaSchema(res, 'T4_02');
      assert.strictEqual(res.ehOfertaComercial, true);
      assert.strictEqual(res.fornecedor.distribuidora, 'SANTA CRUZ');
      assert.strictEqual(res.produtosOfertados.length, 3);

      for (const prod of res.produtosOfertados) {
        assert(typeof prod.confiancaOcr === 'number', 'confiancaOcr deve ser numérico em visão');
        assert(prod.confiancaOcr >= 0.90 && prod.confiancaOcr <= 1.0, `confiancaOcr deve refletir alta legibilidade (obtido: ${prod.confiancaOcr})`);
        assert(belinhaService.validarEan13(prod.ean), 'EAN do encarte deve ser válido');
      }
    } finally {
      aiService.callAI = originalCallAI;
    }
  });

  // Cenário 3: Mensagem Informal de Representante com Bonificação 10+2 e 20+4
  await runTestCase(4, 'T4_03_INFORMAL_BONIF', 'Cenário 3: Mensagem Informal de Representante com Bonificação 10+2 e 20+4', async () => {
    const fix = fixtures.tier4_scenario_fixtures.find(f => f.id === 'T4_03_INFORMAL_REP_BONIF_10_2');
    const res = belinhaService.extrairOfertasDeterministicas(fix.input.text, {
      pushName: fix.input.pushName,
      phone: fix.input.phone
    });

    assertStrictBelinhaSchema(res, 'T4_03');
    assert.strictEqual(res.ehOfertaComercial, true);
    assert.strictEqual(res.fornecedor.distribuidora, 'Profarma');
    assert(res.fornecedor.representante.includes('Fernando'));
    assert.strictEqual(res.fornecedor.pedidoMinimo, 300);
    assert.strictEqual(res.produtosOfertados.length, 2);

    // Neosaldina: 20+4 por R$ 15,00 -> Preço líquido diluído: (20 * 15.00) / 24 = 12.50
    const neosaldina = res.produtosOfertados.find(p => p.nomeComercial.includes('NEOSALDINA'));
    assert(neosaldina, 'Neosaldina deve ser extraída');
    assert.strictEqual(neosaldina.precoOfertado, 12.50, `Preço líquido unitário da Neosaldina 20+4 deve ser 12.50 (obtido: ${neosaldina.precoOfertado})`);

    // Doril: Compre 10 Ganhe 2 por R$ 12,00 -> Preço líquido diluído: (10 * 12.00) / 12 = 10.00
    const doril = res.produtosOfertados.find(p => p.nomeComercial.includes('DORIL'));
    assert(doril, 'Doril deve ser extraído');
    assert.strictEqual(doril.precoOfertado, 10.00, `Preço líquido unitário do Doril 10+2 deve ser 10.00 (obtido: ${doril.precoOfertado})`);
  });

  // Cenário 4: Fluxo de Conversa Casual Sem Ofertas ("Bom dia doutor")
  await runTestCase(4, 'T4_04_CONVERSA_CASUAL', 'Cenário 4: Conversa Casual Sem Ofertas Descartada sem Consumo de Tokens', async () => {
    const fix = fixtures.tier4_scenario_fixtures.find(f => f.id === 'T4_04_CASUAL_CHAT_NOISE');
    const res = await belinhaService.processarMensagemComercial({
      text: fix.input.text,
      pushName: fix.input.pushName,
      phone: fix.input.phone
    });

    assertStrictBelinhaSchema(res, 'T4_04');
    assert.strictEqual(res.sucesso, true);
    assert.strictEqual(res.ehOfertaComercial, false);
    assert.strictEqual(res.fornecedor.distribuidora, null);
    assert.strictEqual(res.produtosOfertados.length, 0);
  });

  // Cenário 5: Tabela Promocional com Faixas Escalonadas de Volume
  await runTestCase(4, 'T4_05_FAIXAS_VOLUME', 'Cenário 5: Tabela Promocional com Faixas Escalonadas de Volume', async () => {
    const fix = fixtures.tier4_scenario_fixtures.find(f => f.id === 'T4_05_ESCALATED_VOLUME_TABLE');
    const res = belinhaService.extrairOfertasDeterministicas(fix.input.text, {
      pushName: fix.input.pushName,
      phone: fix.input.phone
    });

    assertStrictBelinhaSchema(res, 'T4_05');
    assert.strictEqual(res.ehOfertaComercial, true);
    assert.strictEqual(res.produtosOfertados.length, 3);

    // Nistatina (1 un: 8.29, 6 un: 7.69, 60 un: 7.19)
    const nistatina = res.produtosOfertados.find(p => p.nomeComercial.includes('NISTATINA'));
    assert(nistatina, 'Deveria encontrar Nistatina');
    assert.strictEqual(nistatina.precoOfertado, 8.29, 'Preço base deve ser 8.29');
    assert(nistatina.descontoProgressivo.includes('6 un'), 'descontoProgressivo deve descrever faixa de 6 un');
    assert(nistatina.descontoProgressivo.includes('60 un'), 'descontoProgressivo deve descrever faixa de 60 un');

    // Losartana (30 un: 1.75, 60 un: 1.49, 120 un: 1.39)
    const losartana = res.produtosOfertados.find(p => p.nomeComercial.includes('LOSARTANA'));
    assert(losartana, 'Deveria encontrar Losartana');
    assert.strictEqual(losartana.precoOfertado, 1.75, 'Preço base deve ser 1.75');
    assert(losartana.descontoProgressivo.includes('60 un'), 'descontoProgressivo deve descrever faixa de 60 un');
  });

  // Cenário 6: Ingestão Ponta a Ponta via Baileys com Upsert no BelaPed
  await runTestCase(4, 'T4_06_END_TO_END_RADAR', 'Cenário 6: Ingestão Ponta a Ponta no SQLite e Upsert em belaped_cotacoes_reais', async () => {
    const fix = fixtures.tier4_scenario_fixtures.find(f => f.id === 'T4_06_END_TO_END_DB_PERSISTENCE');
    const testMsgId = 'test_belinha_suite_' + Date.now();
    const crypto = require('crypto');

    // 0. Simula o evento Baileys persistindo a mensagem bruta recebida
    db.prepare(`
      INSERT INTO compras_historico_mensagens (
        id, message_id, remote_jid, telefone, nome_contato,
        timestamp, data_hora, tipo_mensagem, texto_mensagem,
        processado_mineracao, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'texto', ?, 0, datetime('now'))
    `).run(
      crypto.randomUUID(),
      testMsgId,
      '5532998886677@s.whatsapp.net',
      fix.input.phone,
      fix.input.pushName,
      Date.now(),
      fix.input.text
    );

    // 1. Executa processamento comercial passando a instância do SQLite
    const res = await belinhaService.processarMensagemComercial({
      text: fix.input.text,
      pushName: fix.input.pushName,
      phone: fix.input.phone,
      messageId: testMsgId,
      db: db
    });

    assertStrictBelinhaSchema(res, 'T4_06');
    assert.strictEqual(res.sucesso, true);
    assert.strictEqual(res.ehOfertaComercial, true);
    assert.strictEqual(res.produtosOfertados.length, 2);

    try {
      // 2. Verifica gravação na tabela compras_historico_mensagens
      const msgRow = db.prepare('SELECT * FROM compras_historico_mensagens WHERE message_id = ?').get(testMsgId);
      assert(msgRow, 'A mensagem bruta deve ser persistida em compras_historico_mensagens');
      assert.strictEqual(msgRow.processado_mineracao, 1, 'processado_mineracao deve ser marcado como 1');
      assert(msgRow.resultado_mineracao_json, 'resultado_mineracao_json deve estar presente');
      const parsedJson = JSON.parse(msgRow.resultado_mineracao_json);
      assertStrictBelinhaSchema(parsedJson, 'T4_06:DB_HISTORICO');

      // 3. Verifica gravação na tabela compras_oportunidades_mineradas
      const opRows = db.prepare('SELECT * FROM compras_oportunidades_mineradas WHERE mensagem_id = ?').all(testMsgId);
      assert(opRows.length >= 2, `Deveria ter persistido ao menos 2 oportunidades (obtido: ${opRows.length})`);
      for (const op of opRows) {
        assert(op.preco_ofertado > 0, 'preco_ofertado deve ser positivo');
        assert(op.distribuidora.toUpperCase().includes('PROFARMA'), 'distribuidora deve ser PROFARMA');
      }

      // 4. Verifica ponte com o Radar do BelaPed: upsert atômico em belaped_cotacoes_reais
      // Ezetimiba: EAN 7896112407911
      const cotacaoEzetimiba = db.prepare('SELECT * FROM belaped_cotacoes_reais WHERE ean = ? AND UPPER(fornecedor) = ?').get('7896112407911', 'PROFARMA');
      assert(cotacaoEzetimiba, 'Cotacao de Ezetimiba deve ser sincronizada com belaped_cotacoes_reais');
      assert.strictEqual(cotacaoEzetimiba.preco, 22.90, `Preco em belaped_cotacoes_reais deve ser 22.90 (obtido: ${cotacaoEzetimiba.preco})`);
      assert.strictEqual(cotacaoEzetimiba.disponivel, 1, 'disponivel deve ser 1');

      // Desloratadina: EAN 7899620915183
      const cotacaoDesloratadina = db.prepare('SELECT * FROM belaped_cotacoes_reais WHERE ean = ? AND UPPER(fornecedor) = ?').get('7899620915183', 'PROFARMA');
      assert(cotacaoDesloratadina, 'Cotacao de Desloratadina deve ser sincronizada com belaped_cotacoes_reais');
      assert.strictEqual(cotacaoDesloratadina.preco, 12.50, `Preco em belaped_cotacoes_reais deve ser 12.50 (obtido: ${cotacaoDesloratadina.preco})`);
      assert.strictEqual(cotacaoDesloratadina.disponivel, 1, 'disponivel deve ser 1');

      // 5. Verifica consumo direto pelo motor de cotações do BelaPed
      const quotesBelaPed = db.prepare(`
        SELECT ean, fornecedor, preco, disponivel 
        FROM belaped_cotacoes_reais 
        WHERE ean IN ('7896112407911', '7899620915183') AND UPPER(fornecedor) = 'PROFARMA'
      `).all();
      assert.strictEqual(quotesBelaPed.length, 2, 'O radar BelaPed deve ler as 2 cotacoes inseridas pela Belinha Compras');
    } finally {
      // Limpeza higiênica dos dados de teste
      db.prepare('DELETE FROM compras_oportunidades_mineradas WHERE mensagem_id = ?').run(testMsgId);
      db.prepare('DELETE FROM compras_historico_mensagens WHERE message_id = ?').run(testMsgId);
      db.prepare("DELETE FROM belaped_cotacoes_reais WHERE ean IN ('7896112407911', '7899620915183') AND UPPER(fornecedor) = 'PROFARMA'").run();
    }
  });

  // ──────────────────────────────────────────────────────────
  // Relatório Final e Encerramento
  // ──────────────────────────────────────────────────────────
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${C.bold}════════════════════════════════════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}📊 RESUMO GERAL DA SUÍTE BELINHA COMPRAS${C.reset}`);
  console.log(`${C.bold}════════════════════════════════════════════════════════════════════════════════════════════${C.reset}`);

  for (let t = 1; t <= 4; t++) {
    const s = tierStats[t];
    const statusColor = s.fail === 0 ? C.green : C.red;
    console.log(`  ${statusColor}${s.fail === 0 ? '✔' : '✖'}${C.reset} ${C.bold}${s.name}:${C.reset} ${s.pass}/${s.total} aprovados (${s.fail} falhas)`);
  }

  console.log(`${C.dim}────────────────────────────────────────────────────────────────────────────────────────────${C.reset}`);
  console.log(`  ${C.bold}Total de Testes:${C.reset} ${totalTests}`);
  console.log(`  ${C.green}${C.bold}Aprovados:${C.reset}       ${passedTests}`);
  console.log(`  ${failedTests === 0 ? C.green : C.red}${C.bold}Falhas:${C.reset}          ${failedTests}`);
  console.log(`  ${C.bold}Tempo Total:${C.reset}     ${duration}s`);

  if (failedTests > 0) {
    console.log(`\n${C.bold}${C.red}🚨 DETALHES DAS FALHAS ENCONTRADAS:${C.reset}`);
    failedDetails.forEach(f => {
      console.log(`  - [Tier ${f.tier} : ${f.id}] ${f.description}`);
      console.log(`    ${C.red}Erro:${C.reset} ${f.error}`);
    });
    console.log(`\n${C.red}${C.bold}❌ SUÍTE FALHOU: Código de saída 1${C.reset}\n`);
    process.exit(1);
  } else {
    console.log(`\n${C.green}${C.bold}🎉 100% DOS TESTES APROVADOS! (Código de saída 0)${C.reset}`);
    console.log(`${C.cyan}Total de casos de teste implementados: ${totalTests} (Meta mínima TEST_INFRA.md: 66)${C.reset}\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('\n🚨 Erro fatal na execução da suíte:', err);
  process.exit(1);
});
