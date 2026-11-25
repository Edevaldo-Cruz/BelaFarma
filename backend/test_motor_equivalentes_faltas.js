/**
 * test_motor_equivalentes_faltas.js
 * Suíte completa de testes unitários e de integração para o Motor Farmacêutico de Equivalência
 * e Proteção Anti-Falsa-Falta nos Robôs da Falta & BelaPed.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const equivService = require('./services/compras-equivalentes.service');
const farmacoMatcher = require('./belaped-farmaco-matcher');

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

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Erro: ${err.message}`);
    failedTests++;
  }
}

const TEST_IDS = {
  refAradois: 9988001,
  genLosartanaA: 9988002,
  genLosartanaB: 9988003,
  simLosartanaC: 9988004,
  perfEsmalte: 9988005,
  genSaldoUmA: 9988006,
  genSaldoUmB: 9988007,
  genNegativo: 9988008,
  genPositivo: 9988009,
  exclTestA: 9988010,
  exclTestB: 9988011,
  grupoManualId: 'test-grupo-motor-9988',
  shortageAutoId: 'sh_test_auto_9988',
  shortageManualId: 'sh_test_manual_9988',
  shortageRefId: 'sh_test_ref_9988'
};

function setupMockDatabase() {
  const now = new Date().toISOString();

  const insCache = db.prepare(`
    INSERT OR REPLACE INTO compras_estoque_cache (
      produto_id, descricao, apresentacao, ean, categoria_id, curva_abc, saldo,
      est_minimo_calculado, vmd_ponderado, vendas_30d, vendas_10m, ativo_10m,
      custo_unitario, ultima_compra_valor, substancia_nome, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, 'A', ?, 10, 0.5, 15, 100, 1, 5.0, 5.0, ?, ?)
  `);

  // Caso 1: Referência vs Genéricos/Similares de molécula isolada MOCKLOSARTANAZ 50mg c/30
  insCache.run(TEST_IDS.refAradois, 'TESTEMOTOR MARCAZ 50MG C/ 30 CPR', '50 MG C/ 30 CPR', '7899988001', 1, 0, 'MOCKLOSARTANAZ', now);
  insCache.run(TEST_IDS.genLosartanaA, 'TESTEMOTOR MOCKLOSARTANAZ 50MG C/ 30 CPR EMS', '50 MG C/ 30 CPR', '7899988002', 7, 0, 'MOCKLOSARTANAZ', now);
  insCache.run(TEST_IDS.genLosartanaB, 'TESTEMOTOR MOCKLOSARTANAZ 50MG C/ 28 CPR MEDLEY', '50 MG C/ 28 CPR', '7899988003', 7, 10, 'MOCKLOSARTANAZ', now);
  insCache.run(TEST_IDS.simLosartanaC, 'TESTEMOTOR SIMILARZ 50MG C/ 30 CPR', '50 MG C/ 30 CPR', '7899988004', 2, 5, 'MOCKLOSARTANAZ', now);

  // Caso 2: Perfumaria não pode gerar grupo nem cobrir nada
  insCache.run(TEST_IDS.perfEsmalte, 'ESMALTE TESTEMOTOR RISQUE 8ML', '8ML', '7899988005', 5, 50, null, now);

  // Caso 3: Limiar A2 (saldoGrupo = 1 não cobre; saldoGrupo = 2 cobre)
  insCache.run(TEST_IDS.genSaldoUmA, 'MOCKATENOLOLZ 25MG C/ 30 CPR EMS', '25 MG C/ 30 CPR', '7899988006', 7, 0, 'MOCKATENOLOLZ', now);
  insCache.run(TEST_IDS.genSaldoUmB, 'MOCKATENOLOLZ 25MG C/ 30 CPR MEDLEY', '25 MG C/ 30 CPR', '7899988007', 7, 1, 'MOCKATENOLOLZ', now);

  // Caso 4: Saldo negativo em 1 SKU não anula estoque físico positivo de outro lab
  insCache.run(TEST_IDS.genNegativo, 'MOCKDIPIRONAZ 1G C/ 10 CPR TEUTO', '1G C/ 10 CPR', '7899988008', 7, -7, 'MOCKDIPIRONAZ', now);
  insCache.run(TEST_IDS.genPositivo, 'MOCKDIPIRONAZ 1000MG C/ 10 CPR VITAMEDIC', '1000MG C/ 10 CPR', '7899988009', 7, 12, 'MOCKDIPIRONAZ', now);

  // Caso 5: Exclusão manual
  insCache.run(TEST_IDS.exclTestA, 'TESTEEXCLUSAO 10MG C/ 30 CPR EMS', '10 MG C/ 30 CPR', '7899988010', 7, 0, 'MOCKLORATADINAZ', now);
  insCache.run(TEST_IDS.exclTestB, 'TESTEEXCLUSAO 10MG C/ 30 CPR CIMED', '10 MG C/ 30 CPR', '7899988011', 7, 8, 'MOCKLORATADINAZ', now);

  const chaveExcl = equivService.extrairAtributosProduto('TESTEEXCLUSAO 10MG C/ 30 CPR EMS', { categoriaId: 7 }).chave;
  db.prepare(`
    INSERT OR REPLACE INTO compras_grupos_equivalentes (
      id, nome_grupo, principio_ativo, dosagem, unidades_embalagem, forma_farmaceutica, chave_canonica, origem, created_at, updated_at
    ) VALUES (?, 'TESTEEXCLUSAO 10MG C/ 28-30 COMPRIMIDO', 'TESTEEXCLUSAO', '10MG', 30, 'COMPRIMIDO', ?, 'auto', ?, ?)
  `).run(TEST_IDS.grupoManualId, chaveExcl, now, now);

  db.prepare(`
    INSERT OR REPLACE INTO compras_produtos_equivalentes (
      id, grupo_id, produto_id, ean, descricao, laboratorio, manual_override, created_at
    ) VALUES (?, ?, ?, '7899988010', 'TESTEEXCLUSAO 10MG C/ 30 CPR EMS', 'EMS', 0, ?)
  `).run('test-vinc-excl-a', TEST_IDS.grupoManualId, TEST_IDS.exclTestA, now);

  db.prepare(`
    INSERT OR REPLACE INTO compras_produtos_equivalentes (
      id, grupo_id, produto_id, ean, descricao, laboratorio, manual_override, created_at
    ) VALUES (?, ?, ?, '7899988011', 'TESTEEXCLUSAO 10MG C/ 30 CPR CIMED', 'CIMED', 0, ?)
  `).run('test-vinc-excl-b', TEST_IDS.grupoManualId, TEST_IDS.exclTestB, now);

  // Shortages de teste para reavaliação
  db.prepare(`
    INSERT OR REPLACE INTO shortages (id, productName, type, clientInquiry, notes, createdAt, userName, source, purchased, ordered, saldo)
    VALUES (?, 'TESTEMOTOR MOCKLOSARTANAZ 50MG C/ 30 CPR EMS', 'Genérico', 0, '', ?, 'Sistema (Automático)', 'auto', 0, 0, 0)
  `).run(TEST_IDS.shortageAutoId, now);

  db.prepare(`
    INSERT OR REPLACE INTO shortages (id, productName, type, clientInquiry, notes, createdAt, userName, source, purchased, ordered, saldo)
    VALUES (?, 'MOCKDIPIRONAZ 1G C/ 10 CPR TEUTO', 'Genérico', 1, 'Cliente pediu', ?, 'Balcão', NULL, 0, 0, -7)
  `).run(TEST_IDS.shortageManualId, now);

  db.prepare(`
    INSERT OR REPLACE INTO shortages (id, productName, type, clientInquiry, notes, createdAt, userName, source, purchased, ordered, saldo)
    VALUES (?, 'TESTEMOTOR MARCAZ 50MG C/ 30 CPR', 'Marca (Referência)', 0, '', ?, 'Sistema (Automático)', 'auto', 0, 0, 0)
  `).run(TEST_IDS.shortageRefId, now);
}

function cleanupMockDatabase() {
  const allPids = [
    TEST_IDS.refAradois, TEST_IDS.genLosartanaA, TEST_IDS.genLosartanaB, TEST_IDS.simLosartanaC,
    TEST_IDS.perfEsmalte, TEST_IDS.genSaldoUmA, TEST_IDS.genSaldoUmB, TEST_IDS.genNegativo,
    TEST_IDS.genPositivo, TEST_IDS.exclTestA, TEST_IDS.exclTestB
  ];
  const ph = allPids.map(() => '?').join(',');
  db.prepare(`DELETE FROM compras_produtos_equivalentes WHERE produto_id IN (${ph})`).run(...allPids);
  db.prepare(`DELETE FROM compras_equivalentes_exclusoes WHERE produto_id IN (${ph})`).run(...allPids);
  db.prepare(`DELETE FROM compras_grupos_equivalentes WHERE id = ?`).run(TEST_IDS.grupoManualId);
  db.prepare(`DELETE FROM compras_estoque_cache WHERE produto_id IN (${ph})`).run(...allPids);
  db.prepare(`DELETE FROM shortages WHERE id IN (?, ?, ?)`).run(
    TEST_IDS.shortageAutoId, TEST_IDS.shortageManualId, TEST_IDS.shortageRefId
  );
}

async function runAll() {
  console.log('\n=================================================================');
  console.log('🧪 INICIANDO SUÍTE: MOTOR FARMACÊUTICO DE EQUIVALÊNCIAS & FALTAS');
  console.log('=================================================================\n');

  try {
    setupMockDatabase();

    // -----------------------------------------------------------------
    // BLOCO 1: PARSING E NORMALIZAÇÃO FARMACÊUTICA DE CASOS REAIS
    // -----------------------------------------------------------------
    console.log('📌 [BLOCO 1] Normalização Farmacêutica & Casos Reais Digifarma');

    runTest('1.1 Dipirona 1G com typo MONOIDARATADA == 1000MG Vitamedic == Dipirona Sodica 1000mg', () => {
      const a = equivService.extrairAtributosProduto('DIPIRONA MONOIDARATADA 1G 10CP', { categoriaId: 7 });
      const b = equivService.extrairAtributosProduto('DIPIRONA MONOIDRATADA 1G 10 COMPR VITAMEDIC', { categoriaId: 7 });
      const c = equivService.extrairAtributosProduto('DIPIRONA SODICA 1000MG C/ 10 CPR', { categoriaId: 7 });
      assert.strictEqual(a.isMedicamento, true);
      assert.strictEqual(a.chave, b.chave);
      assert.strictEqual(b.chave, c.chave);
      assert.strictEqual(a.dosagem, '1000MG');
      assert.strictEqual(a.unidadesChave, '10');
    });

    runTest('1.2 Rosuvastatina 20mg c/30 Torrent == CPRLEGRAND colado == CAL abreviado Pharlab', () => {
      const a = equivService.extrairAtributosProduto('ROSUVASTATINA CALCICA 20 MG C/ 30 CPR TORRENT', { categoriaId: 7 });
      const b = equivService.extrairAtributosProduto('ROSUVASTATINA CALCICA 20 MG C/ 30 CPRLEGRAND', { categoriaId: 7 });
      const c = equivService.extrairAtributosProduto('ROSUVASTATINA CAL 20MG 30CPR REV PHARLAB', { categoriaId: 7 });
      assert.strictEqual(a.chave, b.chave);
      assert.strictEqual(b.chave, c.chave);
      assert.strictEqual(b.laboratorio, 'LEGRAND');
    });

    runTest('1.3 Dexclorf + Betametasona 120ml (2mg/5ml == 0,4+0,05mg/ml; Globo sem dose usa chaveSemDose; != 100ml)', () => {
      const teu = equivService.extrairAtributosProduto('DEXCLORF. +BETAMETA 120 ML TEU', {
        apresentacao: '0,4+0,05MG/ML XPE C/ 120 ML+CM',
        substanciaNome: 'BETAMETASONA; DEXCLORFENIRAINA',
        categoriaId: 7
      });
      const base = equivService.extrairAtributosProduto('DEXCLORF. +BETAMETA C/ 120 ML', {
        apresentacao: '2 MG/5 ML+0.25 MG/5 ML XPE FR 120 ML+CM',
        substanciaNome: 'BETAMETASONA; DEXCLORFENIRAINA',
        categoriaId: 7
      });
      const globoSemDose = equivService.extrairAtributosProduto('DEXCLORF. +BETAMETA 120 ML GLOBO', {
        apresentacao: 'XPE C/ 120 ML-GL',
        substanciaNome: 'BETAMETASONA; DEXCLORFENIRAINA',
        categoriaId: 7
      });
      const outro100 = equivService.extrairAtributosProduto('DEXCLORF. MALEATO C/ 100 ML TEUTO', {
        apresentacao: 'XPE C/ 100 ML TEUTO',
        categoriaId: 7
      });

      assert.strictEqual(teu.principio, 'BETAMETASONA + DEXCLORFENIRAMINA');
      assert.strictEqual(teu.chave, base.chave, `Esperado ${teu.chave} === ${base.chave}`);
      assert.strictEqual(teu.chaveSemDose, globoSemDose.chaveSemDose);
      assert.notStrictEqual(teu.principio, outro100.principio);
      assert.notStrictEqual(teu.unidadesChave, outro100.unidadesChave);
    });

    runTest('1.4 Amitriptilina CLORID. vs HCL Germed/Teuto 25mg c/30', () => {
      const a = equivService.extrairAtributosProduto('AMITRIPTILINA CLORID. 25 MG C/ 30 CPR (C1) GERMED', { substanciaNome: 'AMITRIPTILINA', categoriaId: 7 });
      const b = equivService.extrairAtributosProduto('AMITRIPTILINA HCL G. TEU 25 MG C/ 30 CP (C1)', { substanciaNome: 'AMITRIPTILINA', categoriaId: 7 });
      assert.strictEqual(a.chave, b.chave);
    });

    runTest('1.5 Prednisona != Prednisolona e Prednisolona 60ml != 120ml', () => {
      const pred1 = equivService.extrairAtributosProduto('PREDNISONA 20 MG C/ 10 CPR NEO QUIMIC', { categoriaId: 7 });
      const pred2 = equivService.extrairAtributosProduto('PREDNISONA 20MG GEN 10 CPR-GLG', { categoriaId: 7 });
      const predSol = equivService.extrairAtributosProduto('PREDNISOLONA 20 MG C/ 10 CPR G', { categoriaId: 7 });
      const liq60 = equivService.extrairAtributosProduto('PREDNISOLONA FOSF. 3 MG C/ 60 ML', { apresentacao: '3,0 mg/ml sol or', categoriaId: 7 });
      const liq120 = equivService.extrairAtributosProduto('PREDNISOLONA FOSF. 3 MG C/ 120 ML', { apresentacao: '3,0 MG/ML SOL OR', categoriaId: 6 });

      assert.strictEqual(pred1.chave, pred2.chave);
      assert.notStrictEqual(pred1.chave, predSol.chave);
      assert.notStrictEqual(liq60.chave, liq120.chave);
      assert.strictEqual(liq60.unidadesChave, '60ML');
      assert.strictEqual(liq120.unidadesChave, '120ML');
    });

    runTest('1.6 Omeprazol 20mg c/56 != c/28; Metformina != Metformina XR', () => {
      const om56a = equivService.extrairAtributosProduto('OMEPRAZOL 20 MG C/ 56 CPS TEUTO', { categoriaId: 7 });
      const om56b = equivService.extrairAtributosProduto('OMEPRAZOL 20 MG C/ 56 CPS GLOBO', { categoriaId: 7 });
      const om28 = equivService.extrairAtributosProduto('OMEPRAZOL 20 MG C/ 28 CPS TEUTO', { categoriaId: 7 });
      const metNormal = equivService.extrairAtributosProduto('METFORMINA 500MG C/ 30 CPR', { categoriaId: 7 });
      const metXr = equivService.extrairAtributosProduto('METFORMINA 500MG XR C/ 30 CPR', { categoriaId: 7 });

      assert.strictEqual(om56a.chave, om56b.chave);
      assert.notStrictEqual(om56a.chave, om28.chave);
      assert.notStrictEqual(metNormal.chave, metXr.chave);
      assert.strictEqual(metXr.modificador, 'XR');
    });

    runTest('1.7 Diclofenaco Sódico != Potássico; Estriol Cr Vaginal sem XR; Nebacimed 15g != 10g; Betaistina 16 MC/', () => {
      const dicSod1 = equivService.extrairAtributosProduto('DICLOFENACO SODICO 50MG 20CPR', { categoriaId: 7 });
      const dicSod2 = equivService.extrairAtributosProduto('DICL.SODICO 50MG 20CPR BLF', { categoriaId: 7 });
      const dicPot = equivService.extrairAtributosProduto('DICLOFENACO POTASSICO 50MG 20CPR', { categoriaId: 7 });
      const estriol = equivService.extrairAtributosProduto('ESTRIOL 1 MG CR VAG C/ 50 GR + APLIC', { categoriaId: 6 });
      const neb15 = equivService.extrairAtributosProduto('NEBACIMED PDA C/ 15 GR CIMED', { apresentacao: '5MG+250UI PDA BG 15 GR', substanciaNome: 'BACITRACINA; NEOMICINA', categoriaId: 2 });
      const neo10 = equivService.extrairAtributosProduto('NEOMICINA+BACITRACINA 10 GR', { categoriaId: 7 });
      const beta = equivService.extrairAtributosProduto('BETAISTINA CLORIDR.', { apresentacao: '16 MC/ 30 CPR', categoriaId: 7 });

      assert.strictEqual(dicSod1.chave, dicSod2.chave);
      assert.notStrictEqual(dicSod1.chave, dicPot.chave);
      assert.strictEqual(estriol.forma, 'CREME_VAGINAL');
      assert.strictEqual(estriol.modificador, '');
      assert.strictEqual(neb15.principio, neo10.principio);
      assert.notStrictEqual(neb15.unidadesChave, neo10.unidadesChave);
      assert.strictEqual(beta.dosagem, '16MG');
      assert.strictEqual(beta.unidadesChave, '28-30');
    });

    runTest('1.8 Blacklist Anti-Poluição & Anti-Cadastro Corrompido Digifarma', () => {
      const naoMeds = [
        ['ESMALTE RISQUE 8ML', { categoriaId: 5 }],
        ['TINTURA KOLESTON 60G', { categoriaId: 5 }],
        ['CHUPETA LILLO SILICONE', { categoriaId: 5 }],
        ['HAVAIANAS TOP ROSE GOLD 35/36', { categoriaId: 5 }],
        ['CORTADOR CPR 3B', { categoriaId: 6 }],
        ['PORTA COMPRIMIDOS TRANSP REPART 12', { categoriaId: 6 }],
        ['LAVITAN MAIS A-Z C/ 90 DRG', { categoriaId: 6 }],
        ['BAND-AID TRANSPARENTE 10UN', { categoriaId: 5 }]
      ];
      for (const [desc, opts] of naoMeds) {
        const attr = equivService.extrairAtributosProduto(desc, opts);
        assert.strictEqual(attr.isMedicamento, false, `"${desc}" NÃO deve ser classificado como medicamento`);
        assert.strictEqual(attr.chave, null, `"${desc}" não deve gerar chave`);
      }

      // Cadastro corrompido Digifarma: PROFERGAN CRM 30G marcado como anticoncepcional
      const profergan = equivService.extrairAtributosProduto('PROFERGAN CRM 30G', {
        apresentacao: '2mg+0,01mg x 30cpr',
        substanciaNome: 'NORETISTERONA ACET.; ETINILESTRADIOL',
        categoriaId: 2
      });
      assert.strictEqual(profergan.principio, 'PROMETAZINA');
      assert.strictEqual(profergan.forma, 'CREME');
      assert.strictEqual(profergan.unidadesChave, '30G');
      assert.strictEqual(profergan.origemPrincipio, 'descricao_override_corrompida');
    });

    runTest('1.9 Casos da Auditoria: Vitamina D != C, Timolol 0,5% != 0,25%, Mometasona 60D != 120D, Acetilcisteina 16 Sachês', () => {
      const vitD = equivService.extrairAtributosProduto('VITAMINA D 15.000 UI C/4 CPS-BIG', { categoriaId: 2 });
      const vitC = equivService.extrairAtributosProduto('VITAMINA C 15.000 UI C/4 CPS', { categoriaId: 2 });
      assert.strictEqual(vitD.principio, 'VITAMINA D');
      assert.strictEqual(vitC.principio, 'VITAMINA C');
      assert.notStrictEqual(vitD.chave, vitC.chave);

      const tim05 = equivService.extrairAtributosProduto('TIMOLOL MALEATO 0,5% 5 ML EMS', { categoriaId: 7 });
      const tim025 = equivService.extrairAtributosProduto('TIMOLOL MALEATO 0,25% 5 ML EMS', { categoriaId: 7 });
      assert.strictEqual(tim05.dosagem, '0.5%');
      assert.strictEqual(tim025.dosagem, '0.25%');
      assert.notStrictEqual(tim05.chave, tim025.chave);

      const mom60 = equivService.extrairAtributosProduto('MOMETASONA SPRAY 50MCG 60 DOSES', { categoriaId: 7 });
      const mom120 = equivService.extrairAtributosProduto('MOMETASONA 50MCG 120ACION GEN NEO QUIM', { apresentacao: 'spr nas 50 mcg 120 acion', categoriaId: 7 });
      assert.strictEqual(mom60.unidadesChave, '60D');
      assert.strictEqual(mom120.unidadesChave, '120D');
      assert.notStrictEqual(mom60.chave, mom120.chave);

      const acetA = equivService.extrairAtributosProduto('ACETILCISTEINA 600MG 16 SACHES C/5G OURIFITO', { categoriaId: 2 });
      const acetB = equivService.extrairAtributosProduto('ACETILCISTEINA 600MG C/16 ENVS 5G SAB LARANJA', { categoriaId: 7 });
      assert.strictEqual(acetA.forma, 'SACHE_PO');
      assert.strictEqual(acetB.forma, 'SACHE_PO');
      assert.strictEqual(acetA.unidadesChave, '16');
      assert.strictEqual(acetA.chave, acetB.chave);
    });

    runTest('1.10 Conservadorismo categoria OUTROS (6) & sugerirCategoriaDigifarma', () => {
      const outrosBazar = [
        'MAMAD RETA 240 ML CRISTAL RS BIC PVC AN',
        'CR DENT ORAL-B 070G EXTRA BRANCO',
        'CR PENT SEDA ACQUAPLASH 150 ML',
        'DES MOOD AER 150ML 0% ALUMINIO MEN POWER',
        'AGUA C/GAS PET 510ML',
        'ADOCANTE ZERO CAL LIQ. 100 ML',
        'OLEO CAPILAR ARGAN FARMAX 100 ML',
        'ALCOOL GEL HIGIENIZADOR 70% 100ML KANECHOM'
      ];
      for (const desc of outrosBazar) {
        const attr = equivService.extrairAtributosProduto(desc, { categoriaId: 6 });
        assert.strictEqual(attr.isMedicamento, false, `"${desc}" em OUTROS (6) NÃO deve entrar como medicamento`);
        const sug = equivService.sugerirCategoriaDigifarma({ descricao: desc, categoria_id: 6 });
        assert.strictEqual(sug.categoriaSugerida, 5, `"${desc}" deve ser sugerido para PERFUMARIAS (5)`);
      }

      // Medicamento legítimo em OUTROS (6) com substância/DCB continua elegível e sugere Genérico/Similar
      const nimOutros = equivService.extrairAtributosProduto('NIMESULIDA 100 MG C/ 12 CPR', { categoriaId: 6, substanciaNome: 'NIMESULIDA' });
      assert.strictEqual(nimOutros.isMedicamento, true);
      const sugNim = equivService.sugerirCategoriaDigifarma({ descricao: 'NIMESULIDA 100 MG C/ 12 CPR GEN', categoria_id: 6, substancia_nome: 'NIMESULIDA' });
      assert.strictEqual(sugNim.categoriaSugerida, 7);
    });

    // -----------------------------------------------------------------
    // BLOCO 2: REGRAS A1 (REFERÊNCIA vs GEN/SIM) E A2 (LIMIAR > 1)
    // -----------------------------------------------------------------
    console.log('\n📌 [BLOCO 2] Regras A1 (Intercambialidade) e A2 (Limiar > 1 & Saldo Negativo)');

    runTest('2.1 Regra A1: Genérico (cat=7) zerado É coberto por outro Genérico/Similar (cat=7/2), mas Referência (cat=1) zerada NÃO é coberta', () => {
      const avalGen = equivService.avaliarCoberturaEquivalente({
        produto_id: TEST_IDS.genLosartanaA,
        descricao: 'TESTEMOTOR MOCKLOSARTANAZ 50MG C/ 30 CPR EMS',
        categoria_id: 7,
        substancia_nome: 'MOCKLOSARTANAZ',
        saldo: 0
      }, { limiteMinimoSaldoGrupo: 1 }, db);

      assert.strictEqual(avalGen.coberto, true, 'Genérico zerado deve ser coberto pelos 15 un equivalentes (10 Medley + 5 Similar)');
      assert.strictEqual(avalGen.saldoGrupo, 15);
      assert.ok(avalGen.equivalentesComEstoque.length >= 2);

      const avalRef = equivService.avaliarCoberturaEquivalente({
        produto_id: TEST_IDS.refAradois,
        descricao: 'TESTEMOTOR MARCAZ 50MG C/ 30 CPR',
        categoria_id: 1,
        substancia_nome: 'MOCKLOSARTANAZ',
        saldo: 0
      }, { limiteMinimoSaldoGrupo: 1 }, db);

      assert.strictEqual(avalRef.coberto, false, 'Referência (Marca) zerada NÃO pode ser ocultada por Genérico/Similar');
      assert.strictEqual(avalRef.isReferencia, true);
    });

    runTest('2.2 Regra A2: Saldo consolidado = 1 NÃO cobre falta; saldo negativo (-7) não anula físico (+12)', () => {
      const avalUm = equivService.avaliarCoberturaEquivalente({
        produto_id: TEST_IDS.genSaldoUmA,
        descricao: 'MOCKATENOLOLZ 25MG C/ 30 CPR EMS',
        categoria_id: 7,
        substancia_nome: 'MOCKATENOLOLZ',
        saldo: 0
      }, { limiteMinimoSaldoGrupo: 1 }, db);
      assert.strictEqual(avalUm.saldoGrupo, 1);
      assert.strictEqual(avalUm.coberto, false, 'Apenas 1 un restante no grupo NÃO cobre (precisa > 1)');

      const avalNeg = equivService.avaliarCoberturaEquivalente({
        produto_id: TEST_IDS.genNegativo,
        descricao: 'MOCKDIPIRONAZ 1G C/ 10 CPR TEUTO',
        categoria_id: 7,
        substancia_nome: 'MOCKDIPIRONAZ',
        saldo: -7
      }, { limiteMinimoSaldoGrupo: 1 }, db);
      assert.strictEqual(avalNeg.saldoGrupo, 12, 'Saldo -7 deve ser ignorado na soma física, prevalecendo +12 un Vitamedic');
      assert.strictEqual(avalNeg.coberto, true);
    });

    runTest('2.3 Exclusão manual impede re-vinculação automática & saoProdutosEquivalentesParaFalta', () => {
      equivService.desvincularProdutoDoGrupo(TEST_IDS.grupoManualId, TEST_IDS.exclTestA, db);
      const excl = db.prepare('SELECT 1 FROM compras_equivalentes_exclusoes WHERE produto_id = ?').get(TEST_IDS.exclTestA);
      assert.ok(excl, 'Exclusão manual deve ser gravada em compras_equivalentes_exclusoes');

      const mapExcl = new Set([`${TEST_IDS.exclTestA}|${equivService.extrairAtributosProduto('TESTEEXCLUSAO 10MG C/ 30 CPR EMS', { categoriaId: 7 }).chave}`]);
      const resChave = equivService.obterChaveEquivalenciaProduto(
        { produto_id: TEST_IDS.exclTestA, descricao: 'TESTEEXCLUSAO 10MG C/ 30 CPR EMS', categoria_id: 7 },
        { exclusoesSet: mapExcl }
      );
      assert.strictEqual(resChave.excluidoManualmente, true);
      assert.strictEqual(resChave.chave, null);

      assert.strictEqual(
        equivService.saoProdutosEquivalentesParaFalta(
          { produto_id: TEST_IDS.genLosartanaA, descricao: 'TESTEMOTOR MOCKLOSARTANAZ 50MG C/ 30 CPR EMS', categoria_id: 7, substancia_nome: 'MOCKLOSARTANAZ' },
          { produto_id: TEST_IDS.genLosartanaB, descricao: 'TESTEMOTOR MOCKLOSARTANAZ 50MG C/ 28 CPR MEDLEY', categoria_id: 7, substancia_nome: 'MOCKLOSARTANAZ' },
          db
        ),
        true
      );
      assert.strictEqual(
        equivService.saoProdutosEquivalentesParaFalta(
          { produto_id: TEST_IDS.refAradois, descricao: 'TESTEMOTOR MARCAZ 50MG C/ 30 CPR', categoria_id: 1, substancia_nome: 'MOCKLOSARTANAZ' },
          { produto_id: TEST_IDS.genLosartanaB, descricao: 'TESTEMOTOR MOCKLOSARTANAZ 50MG C/ 28 CPR MEDLEY', categoria_id: 7, substancia_nome: 'MOCKLOSARTANAZ' },
          db
        ),
        false
      );
    });

    await runAsyncTest('2.4 reavaliarFaltasComEquivalentes baixa falta auto de Genérico e só marca manual (sem baixar Referência)', async () => {
      // Snapshot de linhas reais pendentes para manter o teste 100% isolado e sem efeitos colaterais
      const snapshotReais = db.prepare(`
        SELECT id, purchased, coberto_por_equivalente, equivalente_info, notes
        FROM shortages
        WHERE COALESCE(purchased, 0) = 0 AND COALESCE(ordered, 0) = 0
          AND id NOT IN (?, ?, ?)
      `).all(TEST_IDS.shortageAutoId, TEST_IDS.shortageManualId, TEST_IDS.shortageRefId);

      try {
        // Executa dryRun primeiro (sem consultar Firebird para os mocks sintéticos)
        const prev = await equivService.reavaliarFaltasComEquivalentes(db, { dryRun: true, consultarFirebird: false });
        const itemAuto = prev.amostraCobertas.find(a => a.id === TEST_IDS.shortageAutoId);
        const itemManual = prev.amostraCobertas.find(a => a.id === TEST_IDS.shortageManualId);
        const itemRef = prev.amostraCobertas.find(a => a.id === TEST_IDS.shortageRefId);

        assert.ok(itemAuto, 'Falta auto de Genérico coberto deve aparecer como coberta');
        assert.ok(itemManual, 'Falta manual de Dipirona coberta deve aparecer para sinalização');
        assert.strictEqual(itemRef, undefined, 'Falta de Referência (Aradois) NÃO pode ser coberta por Genérico/Similar');

        await equivService.reavaliarFaltasComEquivalentes(db, { dryRun: false, consultarFirebird: false });

        const shAuto = db.prepare('SELECT purchased, coberto_por_equivalente, notes FROM shortages WHERE id = ?').get(TEST_IDS.shortageAutoId);
        const shManual = db.prepare('SELECT purchased, coberto_por_equivalente, equivalente_info FROM shortages WHERE id = ?').get(TEST_IDS.shortageManualId);
        const shRef = db.prepare('SELECT purchased, coberto_por_equivalente FROM shortages WHERE id = ?').get(TEST_IDS.shortageRefId);

        assert.strictEqual(shAuto.purchased, 1, 'Falta auto coberta deve receber baixa automática');
        assert.strictEqual(shAuto.coberto_por_equivalente, 1);
        assert.ok(shAuto.notes.includes('[Coberto por equivalente:'));

        assert.strictEqual(shManual.purchased, 0, 'Falta manual NÃO deve ser baixada automaticamente');
        assert.strictEqual(shManual.coberto_por_equivalente, 1, 'Falta manual deve receber flag coberto_por_equivalente');
        assert.ok(shManual.equivalente_info);

        assert.strictEqual(shRef.purchased, 0, 'Falta de Referência permanece ativa');
        assert.strictEqual(shRef.coberto_por_equivalente, 0);
      } finally {
        const restoreStmt = db.prepare(`
          UPDATE shortages
          SET purchased = ?, coberto_por_equivalente = ?, equivalente_info = ?, notes = ?
          WHERE id = ?
        `);
        db.transaction(() => {
          for (const row of snapshotReais) {
            restoreStmt.run(row.purchased, row.coberto_por_equivalente, row.equivalente_info, row.notes, row.id);
          }
        })();
      }
    });

    // -----------------------------------------------------------------
    // BLOCO 3: INTEGRIDADE DE CÓDIGO NOS ENDPOINTS E VALIDADOR
    // -----------------------------------------------------------------
    console.log('\n📌 [BLOCO 3] Auditoria Estática: Eliminação do Bug categoria_id !== 7 & Matcher');

    runTest('3.1 belaped-endpoints.js não exclui mais Genéricos (categoria_id !== 7) do motor de equivalência', () => {
      const code = fs.readFileSync(path.resolve(__dirname, 'belaped-endpoints.js'), 'utf8');
      assert.strictEqual(
        code.includes('categoriaId !== 5 && categoriaId !== 7'),
        false,
        'Não deve conter o bug legado categoriaId !== 5 && categoriaId !== 7'
      );
      assert.strictEqual(
        code.includes('categoria_id !== 5 && r.categoria_id !== 7'),
        false,
        'Não deve conter o bug legado r.categoria_id !== 5 && r.categoria_id !== 7'
      );
      assert.strictEqual(
        code.includes('categoria_id !== 5 && prod.categoria_id !== 7'),
        false,
        'Não deve conter o bug legado prod.categoria_id !== 5 && prod.categoria_id !== 7'
      );
    });

    runTest('3.2 belaped-farmaco-matcher diferencia XR vs normal e Diclofenaco Sódico vs Potássico', () => {
      assert.strictEqual(
        farmacoMatcher.validarEquivalenciaEstrita(
          { descricao: 'METFORMINA 500MG C/ 30 CPR' },
          { descricao: 'METFORMINA 500MG XR C/ 30 CPR' }
        ),
        false
      );
      assert.strictEqual(
        farmacoMatcher.validarEquivalenciaEstrita(
          { descricao: 'DICLOFENACO SODICO 50MG C/ 20 CPR' },
          { descricao: 'DICLOFENACO POTASSICO 50MG C/ 20 CPR' }
        ),
        false
      );
    });

  } finally {
    cleanupMockDatabase();
  }

  console.log('\n=================================================================');
  console.log('🏁 RESULTADO FINAL DA SUÍTE MOTOR EQUIVALENTES & FALTAS:');
  console.log(`   Total de Testes: ${totalTests}`);
  console.log(`   Aprovados:       ${passedTests}`);
  console.log(`   Falhas:          ${failedTests}`);
  console.log('=================================================================\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

runAll();
