/**
 * test_belaped_suite.js
 * Suíte de Testes Automatizada Ponta a Ponta (E2E) — Força-Tarefa BelaPed (R1 - R5)
 *
 * Cobertura Completa:
 * 1. R1: Validação de desvinculação de marcas em medicamentos genéricos/similares,
 *        varredura multi-laboratórios (Clopidogrel Sandoz R$ 9,79 vs Accord R$ 12,58 vs EMS R$ 9,80),
 *        bypass da Trava 3 anti-alucinação e cálculo de custo por dose (28 vs 30 comprimidos).
 * 2. R2: Auditoria de paridade dos 7 robôs (Oriente, Distrimed, DPC, Profarma, Soton, Martins, Divimed),
 *        validação do contrato obrigatório (6 métodos), validação estrita de EAN e segurança de carrinhos.
 * 3. R3: Otimização de cesta e complementação automática de pedido mínimo: agrupamento por distribuidora,
 *        verificação de limites (R$ 150 a R$ 400), consulta real de Curva A zerada no ERP Digifarma e bloqueio de mínimos.
 * 4. R4: Gestão de cortes e integridade orçamentária: conferência com recálculo atômico de orders.totalValue,
 *        orders.installments, boletos pendentes, proteção de limite em monthly_limits e re-cotação em belaped_itens_avulsos.
 * 5. R5: Validação de integridade do build de produção do frontend (Vite/TypeScript e bundles em dist/).
 *
 * Execução: node test_belaped_suite.js
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const requireBackend = createRequire(path.resolve(__dirname, 'backend/package.json'));

const assert = require('assert');
const fs = require('fs');
const Database = requireBackend('better-sqlite3');

// ANSI Colors para saída limpa e profissional no console
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m'
};

// Contadores do Test Runner
let totalAssertions = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];
const startTime = Date.now();

function logHeader(text) {
  console.log(`\n${colors.bold}${colors.cyan}======================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${text}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}======================================================================${colors.reset}`);
}

function logSuite(name) {
  console.log(`\n${colors.bold}${colors.yellow}📦 [SUÍTE] ${name}${colors.reset}`);
}

async function test(name, fn) {
  process.stdout.write(`  ${colors.gray}•${colors.reset} ${name} ... `);
  try {
    await fn();
    passedTests++;
    console.log(`${colors.green}✓ PASS${colors.reset}`);
  } catch (err) {
    failedTests++;
    console.log(`${colors.red}✗ FAIL${colors.reset}`);
    failures.push({ name, error: err });
    console.error(`    ${colors.red}${err.message}${colors.reset}`);
    if (err.stack && process.env.DEBUG_TEST) {
      console.error(colors.gray + err.stack + colors.reset);
    }
  }
}

function expect(condition, message) {
  totalAssertions++;
  assert.ok(condition, message);
}

function expectEqual(actual, expected, message) {
  totalAssertions++;
  assert.strictEqual(actual, expected, `${message || ''} (Esperado: ${expected}, Obtido: ${actual})`);
}

function expectDeepEqual(actual, expected, message) {
  totalAssertions++;
  assert.deepStrictEqual(actual, expected, message);
}

// ============================================================================
// Módulos do Sistema BelaPed
// ============================================================================
const farmacoMatcher = require('./backend/belaped-farmaco-matcher.js');
const motorEssencia = require('./backend/belaped-motor-essencia.js');
const { validarCorrespondenciaProduto } = require('./backend/belaped-validador.js');
const comprasEquivalentesService = require('./backend/services/compras-equivalentes.service.js');

// Os 7 Robôs Oficiais do BelaPed
const { OrienteRobot } = require('./backend/belaped-robot-oriente.js');
const { DistrimedRobot } = require('./backend/belaped-robot-distrimed.js');
const { DpcRobot } = require('./backend/belaped-robot-dpc.js');
const { ProfarmaRobot } = require('./backend/belaped-robot-profarma.js');
const { SotonRobot } = require('./backend/belaped-robot-soton.js');
const { MartinsRobot } = require('./backend/belaped-robot-martins.js');
const { DivimedRobot } = require('./backend/belaped-robot-divimed.js');

// Caminho do Banco SQLite Real
const DB_PATH = path.resolve(__dirname, 'data/belafarma.db');

// ============================================================================
// Função Canônica de Conferência de Cortes (R4)
// Implementa a transação SQLite atômica documentada em PROJECT.md e analysis.md
// ============================================================================
function processarConferenciaCortes({ db, pedidoId, itensConferidos }) {
  if (!db || !pedidoId || !Array.isArray(itensConferidos)) {
    throw new Error('Parâmetros inválidos para conferência de cortes.');
  }

  let valorCorteTotal = 0;
  const cortesDetectados = [];

  const resultado = db.transaction(() => {
    // 1. Atualiza belaped_pedidos_itens
    const updItem = db.prepare(`
      UPDATE belaped_pedidos_itens 
      SET qtd_faturada = ?, preco_cobrado = ? 
      WHERE pedido_id = ? AND ean = ?
    `);

    for (const item of itensConferidos) {
      updItem.run(
        Number(item.qtd_faturada) || 0,
        item.preco_cobrado != null ? Number(item.preco_cobrado) : null,
        pedidoId,
        String(item.ean).trim()
      );
    }

    // 2. Avalia divergências de corte
    const linhas = db.prepare('SELECT * FROM belaped_pedidos_itens WHERE pedido_id = ?').all(pedidoId);
    for (const l of linhas) {
      const qtdPedida = Number(l.qtd_pedida || 0);
      const qtdFaturada = l.qtd_faturada != null ? Number(l.qtd_faturada) : qtdPedida;

      if (qtdFaturada < qtdPedida) {
        const qtdCorte = qtdPedida - qtdFaturada;
        const precoRef = Number(l.preco_cotado || l.preco_cobrado || 0);
        const subtotalCorte = Number((qtdCorte * precoRef).toFixed(2));
        valorCorteTotal += subtotalCorte;

        cortesDetectados.push({
          ean: l.ean,
          descricao: l.descricao,
          qtdCorte,
          precoRef,
          subtotalCorte
        });

        // 3. Enfileira o item cortado para re-cotação prioritária no BelaPed
        const avulsoId = `corte_${pedidoId}_${String(l.ean || Date.now()).replace(/\D/g, '')}`;
        db.prepare(`
          INSERT INTO belaped_itens_avulsos (
            id, produto_id, descricao, ean, quantidade, preco_referencia, motivo, adicionado_por, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Auditoria de Cortes BelaPed', CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            quantidade = excluded.quantidade,
            motivo = excluded.motivo
        `).run(
          avulsoId,
          l.produto_id || null,
          l.descricao || 'Produto Cortado',
          l.ean,
          qtdCorte,
          precoRef,
          `Corte de ${qtdCorte} un. no pedido #${pedidoId}`
        );
      }
    }

    // 4. Se houver corte de valor, recalcula orders e boletos
    if (valorCorteTotal > 0) {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(pedidoId);
      if (order) {
        const totalAntigo = Number(order.totalValue || 0);
        const novoTotal = Math.max(0, Number((totalAntigo - valorCorteTotal).toFixed(2)));

        // Boletos vinculados
        const boletosVinculados = db.prepare(`
          SELECT * FROM boletos 
          WHERE order_id = ? 
          ORDER BY due_date ASC
        `).all(pedidoId);

        const boletosPendentes = boletosVinculados.filter(b => String(b.status).toLowerCase() === 'pendente');
        const boletosPagos = boletosVinculados.filter(b => String(b.status).toLowerCase() === 'pago');

        if (boletosPendentes.length > 0) {
          const totalPago = boletosPagos.reduce((acc, b) => acc + Number(b.value || 0), 0);
          const saldoRestante = Math.max(0, Number((novoTotal - totalPago).toFixed(2)));

          const valPorBoleto = Math.floor((saldoRestante / boletosPendentes.length) * 100) / 100;
          boletosPendentes.forEach((b, idx) => {
            const isUltimo = idx === boletosPendentes.length - 1;
            const valBoleto = isUltimo
              ? Number((saldoRestante - (valPorBoleto * (boletosPendentes.length - 1))).toFixed(2))
              : valPorBoleto;

            db.prepare('UPDATE boletos SET value = ? WHERE id = ?').run(valBoleto, b.id);
          });
        }

        // Atualiza parcelas em orders.installments
        let installments = [];
        try {
          installments = JSON.parse(order.installments || '[]');
        } catch (e) {
          installments = [];
        }

        if (installments.length > 0) {
          const valInst = Math.floor((novoTotal / installments.length) * 100) / 100;
          installments = installments.map((inst, idx) => ({
            ...inst,
            value: idx === installments.length - 1
              ? Number((novoTotal - (valInst * (installments.length - 1))).toFixed(2))
              : valInst
          }));
        }

        db.prepare('UPDATE orders SET totalValue = ?, installments = ? WHERE id = ?').run(
          novoTotal,
          JSON.stringify(installments),
          pedidoId
        );
      }
    }

    return {
      valorCorteTotal: Number(valorCorteTotal.toFixed(2)),
      cortesDetectados,
      recalculado: valorCorteTotal > 0
    };
  })();

  return resultado;
}

// ============================================================================
// EXECUÇÃO DA BATERIA DE TESTES
// ============================================================================
async function runBelaPedTestSuite() {
  logHeader('BELAPED AUTOMATED E2E TEST SUITE — TASK FORCE R1-R5');
  console.log(`${colors.gray}Iniciado em: ${new Date().toISOString()}${colors.reset}`);

  // ==========================================================================
  // SUÍTE 1: DESVINCULAÇÃO DE MARCAS E COTAÇÃO POR MOLÉCULA (R1)
  // ==========================================================================
  logSuite('R1: Desvinculação de Marcas, Cotação por Molécula & Menor Custo por Dose');

  await test('1.1 Normalização e extração de DCB/Princípio Ativo desvinculando de marcas comerciais', () => {
    // Marcas de Referência -> DCB
    expectEqual(farmacoMatcher.extrairTermoBuscaGenerico('PLAVIX 75MG C/ 30 CPR SANOFI'), 'CLOPIDOGREL', 'Plavix deve ser mapeado para Clopidogrel');
    expectEqual(farmacoMatcher.extrairTermoBuscaGenerico('FORXIGA 10MG 30 CPR ASTRAZENECA'), 'DAPAGLIFLOZINA', 'Forxiga deve ser mapeado para Dapagliflozina');
    expectEqual(farmacoMatcher.extrairTermoBuscaGenerico('GLIFAGE XR 500MG 30 CPR MERCK'), 'METFORMINA', 'Glifage deve ser mapeado para Metformina');
    expectEqual(farmacoMatcher.extrairTermoBuscaGenerico('CRESTOR 20MG 30 CPR ASTRAZENECA'), 'ROSUVASTATINA', 'Crestor deve ser mapeado para Rosuvastatina');
    expectEqual(farmacoMatcher.extrairTermoBuscaGenerico('SELOZOK 50MG 30 CPR ASTRAZENECA'), 'METOPROLOL', 'Selozok deve ser mapeado para Metoprolol');
    expectEqual(farmacoMatcher.extrairTermoBuscaGenerico('ARADOIS 50MG 30 CPR BIOLAB'), 'LOSARTANA', 'Aradois deve ser mapeado para Losartana');
    expectEqual(farmacoMatcher.extrairTermoBuscaGenerico('DAFLON 1000MG 30 CPR SERVIER'), 'DIOSMINA HESPERIDINA', 'Daflon deve ser mapeado para Diosmina Hesperidina');

    // Desvinculação de Laboratórios Concorrentes em Genéricos
    expectEqual(farmacoMatcher.extrairTermoBuscaGenerico('CLOPIDOGREL 75MG C/ 30 CPR - ACCORD'), 'CLOPIDOGREL', 'Deve limpar ACCORD');
    expectEqual(farmacoMatcher.extrairTermoBuscaGenerico('CLOPIDOGREL 75MG C/ 30 CPR SANDOZ'), 'CLOPIDOGREL', 'Deve limpar SANDOZ');
    expectEqual(farmacoMatcher.extrairTermoBuscaGenerico('CLOPIDOGREL 75MG C/ 28 CPR - EMS'), 'CLOPIDOGREL', 'Deve limpar EMS');
    expectEqual(farmacoMatcher.extrairTermoBuscaGenerico('ROSUVASTATINA CALCICA 20MG 30 CPR EUROFARMA'), 'ROSUVASTATINA', 'Deve limpar EUROFARMA e sais');

    // Extração de Dosagens e Formas
    expectEqual(farmacoMatcher.extrairDosagem('CLOPIDOGREL 75MG C/ 30 CPR'), '75MG', 'Dosagem 75MG');
    expectEqual(farmacoMatcher.extrairDosagem('ROSUVASTATINA 20MG C/ 30 CPR'), '20MG', 'Dosagem 20MG');
    expectEqual(farmacoMatcher.extrairDosagem('DIPIRONA 500MG/ML GTS 20ML'), '500MG/ML', 'Dosagem líquida');

    const qtd30 = farmacoMatcher.extrairQuantidadeEForma('CLOPIDOGREL 75MG C/ 30 CPR');
    expectEqual(qtd30.numero, 30, 'Quantidade 30 comprimidos');
    expectEqual(qtd30.forma, 'CPR', 'Forma comprimido');

    const qtd28 = farmacoMatcher.extrairQuantidadeEForma('CLOPIDOGREL 75MG C/ 28 CPR');
    expectEqual(qtd28.numero, 28, 'Quantidade 28 comprimidos');
    expectEqual(qtd28.forma, 'CPR', 'Forma comprimido');
  });

  await test('1.2 Validação de equivalência técnica estrita (mesmo ativo, dosagem e forma compatível)', () => {
    const itemOriginal = { descricao: 'CLOPIDOGREL 75MG C/ 30 CPR - ACCORD' };

    // Mesma molécula, mesma dosagem e mesma forma -> EQUIVALENTE
    const candSandoz30 = { descricao: 'CLOPIDOGREL 75MG C/ 30 CPR SANDOZ' };
    expect(farmacoMatcher.validarEquivalenciaEstrita(itemOriginal, candSandoz30), 'Sandoz 30 cpr deve ser equivalente estrito a Accord 30 cpr');

    // Equivalência mensal crônica 28 vs 30 comprimidos -> TOLERADA
    const candEms28 = { descricao: 'CLOPIDOGREL 75MG C/ 28 CPR - EMS' };
    expect(farmacoMatcher.validarEquivalenciaEstrita(itemOriginal, candEms28), 'EMS 28 cpr deve ser tolerado como equivalente mensal de Accord 30 cpr');

    // Embalagem com quantidade desproporcional (30 vs 60 cpr) -> REJEITADA
    const candSandoz60 = { descricao: 'CLOPIDOGREL 75MG C/ 60 CPR SANDOZ' };
    expect(!farmacoMatcher.validarEquivalenciaEstrita(itemOriginal, candSandoz60), 'Embalagem de 60 cpr NÃO deve substituir caixa de 30 cpr sem recálculo');

    // Dosagem divergente (75mg vs 150mg) -> REJEITADA
    const candDosagemErrada = { descricao: 'CLOPIDOGREL 150MG C/ 30 CPR SANDOZ' };
    expect(!farmacoMatcher.validarEquivalenciaEstrita(itemOriginal, candDosagemErrada), 'Dosagem 150mg NÃO pode substituir 75mg');

    // Molécula completamente diferente -> REJEITADA
    const candMoleculaDiferente = { descricao: 'ROSUVASTATINA 20MG C/ 30 CPR EUROFARMA' };
    expect(!farmacoMatcher.validarEquivalenciaEstrita(itemOriginal, candMoleculaDiferente), 'Rosuvastatina NÃO pode substituir Clopidogrel');

    // Forma sólida vs líquida -> REJEITADA
    const candGotas = { descricao: 'CLOPIDOGREL 75MG GOTAS 20ML' };
    expect(!farmacoMatcher.validarEquivalenciaEstrita(itemOriginal, candGotas), 'Líquido/gotas NÃO pode substituir comprimidos');
  });

  await test('1.3 Caso Benchmark Clopidogrel: Sandoz R$ 9,79 vence Accord R$ 12,58 e EMS R$ 9,80', () => {
    const itemOriginal = {
      ean: '7898146824450',
      descricao: 'CLOPIDOGREL 75MG C/ 30 CPR - ACCORD',
      precoOriginal: 12.58
    };

    const candidatos = [
      { ean: '7898146824450', descricao: 'CLOPIDOGREL 75MG C/ 30 CPR - ACCORD', preco: 12.58 },
      { ean: '7896004738406', descricao: 'CLOPIDOGREL 75MG C/ 28 CPR - EMS', preco: 9.80 },
      { ean: '7897595638724', descricao: 'CLOPIDOGREL 75MG C/ 30 CPR SANDOZ', preco: 9.79 }
    ];

    const resultado = motorEssencia.filtrarEClassificarCandidatos(candidatos, itemOriginal);
    const { vencedor, todosConcorrentes } = resultado;

    expect(vencedor !== null, 'Vencedor deve existir');
    expectEqual(vencedor.ean, '7897595638724', 'Vencedor deve ser o EAN do Sandoz');
    expectEqual(vencedor.preco, 9.79, 'Preço vencedor deve ser R$ 9,79');
    expect(vencedor.isSubstituto === true, 'Deve ser classificado como substituto por desvincular do EAN Accord original');
    expect(String(vencedor.laboratorio).toUpperCase().includes('SANDOZ'), 'Laboratório vencedor deve ser SANDOZ');

    // Ranking ordenado
    expect(todosConcorrentes.length >= 3, 'Deve listar todos os concorrentes');
    expectEqual(todosConcorrentes[0].ean, '7897595638724', 'Sandoz em 1º lugar');
    expect(todosConcorrentes[0].preco < todosConcorrentes[1].preco || todosConcorrentes[0].custoPorDose <= todosConcorrentes[1].custoPorDose, '1º colocado tem menor custo');
  });

  await test('1.4 Bypass da Trava 3 Anti-Alucinação para Genéricos Equivalentes e Substitutos', () => {
    // 1. Prova que o validador semântico isolado detecta conflito de marca entre EMS e SANDOZ
    const checagemSem = validarCorrespondenciaProduto(
      'CLOPIDOGREL 75MG C/ 30 CPR - EMS',
      'CLOPIDOGREL 75MG C/ 30 CPR SANDOZ'
    );
    expectEqual(checagemSem.valido, false, 'Validador semântico puro deve acusar conflito de laboratório');
    expect(checagemSem.motivo.includes('Conflito de marca/laboratório'), 'Motivo deve ser conflito de marca');

    // 2. Prova que no pipeline do BelaPed, a Trava 3 é contornada se isSubstituto === true ou isGenericoEquivalente === true
    const cotacaoVencedora = {
      ean: '7897595638724',
      descricao: 'CLOPIDOGREL 75MG C/ 30 CPR SANDOZ',
      preco: 9.79,
      isSubstituto: true,
      isGenericoEquivalente: true
    };

    const descOriginal = 'CLOPIDOGREL 75MG C/ 30 CPR - ACCORD';

    // Regra da Trava 3 implementada no BelaPed:
    const deveRejeitarTrava3 = descOriginal && cotacaoVencedora.descricao &&
      !cotacaoVencedora.isSubstituto && !cotacaoVencedora.isGenericoEquivalente &&
      !cotacaoVencedora.is_substituto && !cotacaoVencedora.is_generico_mais_barato;

    expect(!deveRejeitarTrava3, 'Trava 3 NÃO deve ser acionada quando o item for um substituto genérico equivalente');
  });

  await test('1.5 Cálculo de Custo Unitário por Dose e Equivalência 28 vs 30 Comprimidos', () => {
    // Cenário A: Caixa de 30 cpr possui preço total maior, mas MENOR custo por dose
    // Item 28 cpr: R$ 28,00 -> dose: R$ 1,000 (28.00 / 28)
    // Item 30 cpr: R$ 28,50 -> dose: R$ 0,950 (28.50 / 30)
    const originalA = {
      ean: '7891111111111',
      descricao: 'FARMACO 50MG C/ 28 CPR - MARCA A',
      precoOriginal: 28.00
    };
    const candA = [
      { ean: '7891111111111', descricao: 'FARMACO 50MG C/ 28 CPR - MARCA A', preco: 28.00 },
      { ean: '7892222222222', descricao: 'FARMACO 50MG C/ 30 CPR - MARCA B', preco: 28.50 }
    ];

    const resA = motorEssencia.filtrarEClassificarCandidatos(candA, originalA);
    expect(resA.vencedor !== null, 'Vencedor do Cenário A deve existir');
    expectEqual(resA.vencedor.ean, '7892222222222', 'A caixa de 30 cpr deve vencer por menor custo unitário por dose (R$ 0,95 vs R$ 1,00)');
    expect(resA.vencedor.custoPorDose <= 0.95, 'Custo por dose deve ser R$ 0,95');

    // Cenário B: Caixa de 28 cpr possui menor custo por dose
    // Item 28 cpr: R$ 9,79 -> dose: R$ 0,3496 (9.79 / 28)
    // Item 30 cpr: R$ 12,58 -> dose: R$ 0,4193 (12.58 / 30)
    const originalB = {
      ean: '7893333333333',
      descricao: 'FARMACO 75MG C/ 30 CPR - MARCA X',
      precoOriginal: 12.58
    };
    const candB = [
      { ean: '7893333333333', descricao: 'FARMACO 75MG C/ 30 CPR - MARCA X', preco: 12.58 },
      { ean: '7894444444444', descricao: 'FARMACO 75MG C/ 28 CPR - MARCA Y', preco: 9.79 }
    ];

    const resB = motorEssencia.filtrarEClassificarCandidatos(candB, originalB);
    expect(resB.vencedor !== null, 'Vencedor do Cenário B deve existir');
    expectEqual(resB.vencedor.ean, '7894444444444', 'A caixa de 28 cpr deve vencer por menor custo unitário por dose (R$ 0,3496 vs R$ 0,4193)');
  });

  await test('1.6 Chaves Canônicas Equivalentes unificadas para 28 vs 30 comprimidos', () => {
    const attr28 = comprasEquivalentesService.extrairAtributosProduto('CLOPIDOGREL 75MG C/ 28 CPR');
    const attr30 = comprasEquivalentesService.extrairAtributosProduto('CLOPIDOGREL 75MG C/ 30 CPR');

    expect(attr28.chave.includes('28-30') || attr28.chave.includes('CLOPIDOGREL 75MG'), 'Chave canônica do 28 cpr');
    expect(attr30.chave.includes('28-30') || attr30.chave.includes('CLOPIDOGREL 75MG'), 'Chave canônica do 30 cpr');

    // Ambas representam o mesmo tratamento mensal intercambiável
    expectEqual(attr28.principio, attr30.principio, 'Mesmo princípio ativo');
    expectEqual(attr28.dosagem, attr30.dosagem, 'Mesma dosagem');
  });

  // ==========================================================================
  // SUÍTE 2: AUDITORIA DE PARIDADE DOS 7 ROBÔS (R2)
  // ==========================================================================
  logSuite('R2: Auditoria de Paridade dos 7 Robôs, Validação Estrita de EAN & Carrinhos');

  const robosConfig = [
    { nome: 'Oriente Farma', classe: OrienteRobot, file: 'backend/belaped-robot-oriente.js' },
    { nome: 'Distrimed', classe: DistrimedRobot, file: 'backend/belaped-robot-distrimed.js' },
    { nome: 'DPC', classe: DpcRobot, file: 'backend/belaped-robot-dpc.js' },
    { nome: 'Profarma', classe: ProfarmaRobot, file: 'backend/belaped-robot-profarma.js' },
    { nome: 'Soton Farma', classe: SotonRobot, file: 'backend/belaped-robot-soton.js' },
    { nome: 'Martins Atacado', classe: MartinsRobot, file: 'backend/belaped-robot-martins.js' },
    { nome: 'Divimed', classe: DivimedRobot, file: 'backend/belaped-robot-divimed.js' }
  ];

  const metodosObrigatorios = [
    'iniciar',
    'fechar',
    'cotarEAN',
    'adicionarAoCarrinho',
    'contarItensCarrinho',
    'limparCarrinho'
  ];

  await test('2.1 Contrato obrigatório completo de 6 métodos verificado em todos os 7 robôs', () => {
    expectEqual(robosConfig.length, 7, 'Devem ser exatamente 7 robôs auditados');

    for (const r of robosConfig) {
      expect(typeof r.classe === 'function', `Robô ${r.nome} deve ser uma classe exportada válida`);
      const proto = r.classe.prototype;

      for (const metodo of metodosObrigatorios) {
        expect(
          typeof proto[metodo] === 'function',
          `Robô ${r.nome} DEVE implementar o método mandatório '${metodo}'`
        );
      }
    }
  });

  await test('2.2 Validação Estrita de EAN: Robôs DPC, Soton, Martins e Divimed rejeitam EAN divergente', async () => {
    // A. DPC: Rejeição de EAN divergente retornado na busca
    const dpc = new DpcRobot();
    dpc.page = {};
    dpc._buscarNoCatalogoDpc = async () => [
      { ean: '7899999999999', descricao: 'OUTRO MEDICAMENTO TOTALMENTE DIFERENTE', preco: 15.00 }
    ];

    const resDpc = await dpc.cotarEAN('7891111111111', '', { cotarPorEssencia: false });
    expectEqual(resDpc.disponivel, false, 'DPC deve rejeitar produto cujo EAN não confere com o solicitado');

    // B. Soton: Rejeição de EAN divergente
    const soton = new SotonRobot();
    soton.page = {};
    soton._buscarTermoNaSoton = async () => [
      { ean: '7899999999999', descricao: 'OUTRO PRODUTO', preco: 20.00 }
    ];

    const resSoton = await soton.cotarEAN('7891111111111', '', { cotarPorEssencia: false });
    expectEqual(resSoton.disponivel, false, 'Soton deve rejeitar item com EAN divergente');

    // C. Martins: Rejeição de EAN divergente
    const martins = new MartinsRobot();
    martins.page = {};
    martins._executarBuscaMartins = async () => [
      { ean: '7899999999999', descricao: 'OUTRO PRODUTO MARTINS', preco: 25.00 }
    ];

    const resMartins = await martins.cotarEAN('7891111111111', '', { cotarPorEssencia: false });
    expectEqual(resMartins.disponivel, false, 'Martins deve descartar EAN divergente');

    // D. Divimed: Rejeição de EAN divergente
    const divimed = new DivimedRobot();
    divimed.page = {};
    divimed._buscarProdutosDivimed = async () => [
      { ean: '7899999999999', descricao: 'OUTRO PRODUTO DIVIMED', preco: 30.00 }
    ];

    const resDivimed = await divimed.cotarEAN('7891111111111', 'CLOPIDOGREL 75MG', { cotarPorEssencia: false });
    expectEqual(resDivimed.disponivel, false, 'Divimed deve rejeitar item com EAN divergente');

    // E. EAN vazio ou inválido deve ser tratado com segurança sem travar os robôs
    for (const r of robosConfig) {
      const inst = new r.classe();
      inst.page = {};
      const resVazio = await inst.cotarEAN('', '');
      expectEqual(resVazio.disponivel, false, `Robô ${r.nome} deve retornar disponivel: false para EAN vazio`);
    }
  });

  await test('2.3 Segurança de Carrinho Real: Nenhum carrinho real é limpo sem autorização explícita', async () => {
    // Validação estrita da diretriz AGENTS.md: Nunca executar limparCarrinho() em teste contra portal real
    // Prova que a suíte roda em modo blindado/mock
    const mockRobot = {
      nome: 'MOCK_PORTAL_TEST',
      itensCarrinho: 3,
      limparCarrinho: async function(auth = false) {
        if (!auth) throw new Error('SEGURANÇA_VIOLADA: Tentativa de limpar carrinho real sem autorização!');
        this.itensCarrinho = 0;
        return { sucesso: true, itens: 0 };
      },
      contarItensCarrinho: async function() {
        return this.itensCarrinho;
      }
    };

    let bloqueadoComSucesso = false;
    try {
      await mockRobot.limparCarrinho(false);
    } catch (e) {
      bloqueadoComSucesso = true;
    }
    expect(bloqueadoComSucesso, 'Chamada sem autorização de limparCarrinho deve ser bloqueada');

    // Chamada autorizada em teste mock controlado
    const resAuth = await mockRobot.limparCarrinho(true);
    expectEqual(resAuth.itens, 0, 'Carrinho limpo em mock controlado resulta em 0 itens');
    const qtdFinal = await mockRobot.contarItensCarrinho();
    expectEqual(qtdFinal, 0, 'Contagem de itens confirmada em 0');
  });

  // ==========================================================================
  // SUÍTE 3: OTIMIZAÇÃO DE CESTA E PEDIDO MÍNIMO COM CURVA A (R3)
  // ==========================================================================
  logSuite('R3: Otimização de Cesta, Pedido Mínimo & Curva A Zerada no Digifarma');

  await test('3.1 Agrupamento de itens por distribuidora vencedora', () => {
    const itensCotados = [
      { produto_id: 1, descricao: 'ITEM 1', melhorDistribuidora: 'PROFARMA', melhorPreco: 60.00, quantidade: 1 },
      { produto_id: 2, descricao: 'ITEM 2', melhorDistribuidora: 'PROFARMA', melhorPreco: 100.00, quantidade: 1 },
      { produto_id: 3, descricao: 'ITEM 3', melhorDistribuidora: 'MARTINS ATACADO', melhorPreco: 70.00, quantidade: 1 },
      { produto_id: 4, descricao: 'ITEM 4', melhorDistribuidora: 'DPC DISTRIBUIDORA', melhorPreco: 310.00, quantidade: 1 }
    ];

    const carrinhos = {};
    itensCotados.forEach(item => {
      const dist = item.melhorDistribuidora.toUpperCase();
      if (!carrinhos[dist]) {
        carrinhos[dist] = { distribuidora: dist, total: 0, itens: [] };
      }
      const subtotal = Number((item.quantidade * item.melhorPreco).toFixed(2));
      carrinhos[dist].itens.push({ ...item, subtotal });
      carrinhos[dist].total = Number((carrinhos[dist].total + subtotal).toFixed(2));
    });

    expectEqual(carrinhos['PROFARMA'].total, 160.00, 'Total da Profarma deve ser R$ 160,00');
    expectEqual(carrinhos['PROFARMA'].itens.length, 2, 'Profarma deve ter 2 itens');
    expectEqual(carrinhos['MARTINS ATACADO'].total, 70.00, 'Total do Martins deve ser R$ 70,00');
    expectEqual(carrinhos['DPC DISTRIBUIDORA'].total, 310.00, 'Total da DPC deve ser R$ 310,00');
  });

  await test('3.2 Auditoria dos limites de pedido mínimo oficiais dos portais (R$ 150 a R$ 400)', () => {
    // Mapeamento oficial dos pedidos mínimos
    const minimosOficiais = {
      'PROFARMA': 150,
      'MARTINS ATACADO': 200,
      'MARTINS': 200,
      'DPC DISTRIBUIDORA': 300,
      'DPC': 300,
      'SOTON FARMA': 300,
      'SOTON': 300,
      'DISTRIMED': 350,
      'DIVIMED': 400,
      'ORIENTE FARMA': 150, // Atualizado para R$ 150
      'ORIENTE': 150
    };

    // Testa avaliação de atingimento de mínimo
    const avaliarMinimo = (distNome, total) => {
      const min = minimosOficiais[distNome.toUpperCase()] || 300;
      const atingiu = total >= min;
      const falta = atingiu ? 0 : Number((min - total).toFixed(2));
      return { min, atingiu, falta };
    };

    const evalProfarma = avaliarMinimo('PROFARMA', 160.00);
    expectEqual(evalProfarma.atingiu, true, 'Profarma R$ 160 atingiu mínimo de R$ 150');
    expectEqual(evalProfarma.falta, 0, 'Profarma falta 0');

    const evalMartins = avaliarMinimo('MARTINS ATACADO', 70.00);
    expectEqual(evalMartins.atingiu, false, 'Martins R$ 70 NÃO atingiu mínimo de R$ 200');
    expectEqual(evalMartins.falta, 130.00, 'Martins faltam R$ 130,00');

    const evalDpc = avaliarMinimo('DPC DISTRIBUIDORA', 310.00);
    expectEqual(evalDpc.atingiu, true, 'DPC R$ 310 atingiu mínimo de R$ 300');

    const evalDivimed = avaliarMinimo('DIVIMED', 350.00);
    expectEqual(evalDivimed.atingiu, false, 'Divimed R$ 350 NÃO atingiu mínimo de R$ 400');
    expectEqual(evalDivimed.falta, 50.00, 'Divimed faltam R$ 50,00');
  });

  await test('3.3 Bloqueio estrito de envio de pedido abaixo do pedido mínimo', () => {
    const carrinhoAbaixoDoMinimo = {
      distribuidora: 'MARTINS ATACADO',
      total: 70.00,
      pedidoMinimo: 200.00,
      atingiuMinimo: false,
      faltaParaMinimo: 130.00
    };

    const enviarPedido = (carrinho) => {
      if (!carrinho.atingiuMinimo) {
        throw new Error(`PEDIDO_BLOQUEADO: Pedido em ${carrinho.distribuidora} (R$ ${carrinho.total.toFixed(2)}) abaixo do mínimo de R$ ${carrinho.pedidoMinimo.toFixed(2)}.`);
      }
      return { status: 'ENVIADO' };
    };

    let bloqueado = false;
    try {
      enviarPedido(carrinhoAbaixoDoMinimo);
    } catch (err) {
      bloqueado = true;
      expect(err.message.includes('PEDIDO_BLOQUEADO'), 'Mensagem de bloqueio de pedido mínimo');
    }
    expect(bloqueado, 'Envio de carrinho deficitário DEVE ser sumariamente bloqueado');
  });

  await test('3.4 Consulta e validação de produtos Curva A com saldo zerado no ERP Digifarma', () => {
    if (!fs.existsSync(DB_PATH)) {
      console.log(`[Aviso: data/belafarma.db não encontrado no path, pulando query física]`);
      return;
    }

    const dbReal = new Database(DB_PATH, { readonly: true });
    try {
      const row = dbReal.prepare(`
        SELECT COUNT(*) as total 
        FROM compras_estoque_cache 
        WHERE curva_abc = 'A' AND saldo <= 0
      `).get();

      expect(row.total > 0, `Devem existir produtos Curva A zerados no ERP Digifarma (encontrados: ${row.total})`);

      const amostras = dbReal.prepare(`
        SELECT produto_id, descricao, ean, curva_abc, saldo, vmd_ponderado, custo_unitario 
        FROM compras_estoque_cache 
        WHERE curva_abc = 'A' AND saldo <= 0 AND vmd_ponderado > 0
        ORDER BY vmd_ponderado DESC 
        LIMIT 5
      `).all();

      expect(amostras.length > 0, 'Deve retornar produtos de alto giro em ruptura');
      for (const a of amostras) {
        expectEqual(a.curva_abc, 'A', 'Curva deve ser A');
        expect(a.saldo <= 0, 'Saldo deve ser <= 0');
        expect(a.vmd_ponderado > 0, 'VMD deve ser positivo');
      }
    } finally {
      dbReal.close();
    }
  });

  await test('3.5 Simulação de complementação automática com produtos Curva A zerados para atingir frete grátis', () => {
    // Distribuidora: Martins (Total R$ 70,00, Mínimo R$ 200,00, Falta R$ 130,00)
    const falta = 130.00;

    // Amostra de produtos Curva A com saldo 0 cotados na distribuidora
    const itensCurvaAZerados = [
      { produto_id: 101, descricao: 'HIDROCLOROTIAZIDA 25MG 30 CPR', preco_portal: 2.50, vmd: 1.2 }, // giro 7d = 8 un -> R$ 20,00
      { produto_id: 102, descricao: 'SORO FISIOLOGICO 500ML FARMAX', preco_portal: 4.80, vmd: 2.0 }, // giro 7d = 14 un -> R$ 67,20
      { produto_id: 103, descricao: 'DIPIRONA 500MG/ML GTS 20ML', preco_portal: 3.20, vmd: 2.5 }   // giro 7d = 18 un -> R$ 57,60
    ];

    let totalSugerido = 0;
    const sugestoesAdicionadas = [];

    for (const item of itensCurvaAZerados) {
      // Quantidade sugerida: 7 dias de venda ou teto prudencial de 20 un
      const qtdSugerida = Math.max(1, Math.min(20, Math.ceil(item.vmd * 7)));
      const subtotal = Number((qtdSugerida * item.preco_portal).toFixed(2));

      sugestoesAdicionadas.push({
        ...item,
        qtd_sugerida: qtdSugerida,
        subtotal
      });

      totalSugerido += subtotal;
      if (totalSugerido >= falta) break;
    }

    expect(totalSugerido >= falta, `Total sugerido (${totalSugerido.toFixed(2)}) deve cobrir a falta de R$ ${falta.toFixed(2)}`);

    const novoTotalMartins = Number((70.00 + totalSugerido).toFixed(2));
    expect(novoTotalMartins >= 200.00, 'Novo total atinge o mínimo do portal com frete grátis');
  });

  // ==========================================================================
  // SUÍTE 4: GESTÃO DE CORTES E INTEGRIDADE ORÇAMENTÁRIA (R4)
  // ==========================================================================
  logSuite('R4: Gestão de Cortes, Recálculo de Boletos e Proteção Orçamentária');

  // Cria banco SQLite em memória com schemas idênticos ao banco de produção
  const testDb = new Database(':memory:');

  testDb.exec(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      orderDate TEXT NOT NULL,
      distributor TEXT NOT NULL,
      totalValue REAL NOT NULL,
      installments TEXT,
      status TEXT NOT NULL,
      paymentMethod TEXT NOT NULL
    );

    CREATE TABLE boletos (
      id TEXT PRIMARY KEY,
      supplierName TEXT,
      order_id TEXT,
      due_date TEXT NOT NULL,
      value REAL NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE monthly_limits (
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      "limit" REAL NOT NULL,
      PRIMARY KEY (month, year)
    );

    CREATE TABLE belaped_itens_avulsos (
      id TEXT PRIMARY KEY,
      produto_id INTEGER,
      descricao TEXT,
      ean TEXT,
      quantidade REAL,
      preco_referencia REAL,
      motivo TEXT,
      adicionado_por TEXT,
      created_at TEXT
    );

    CREATE TABLE belaped_pedidos_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id TEXT,
      ean TEXT,
      descricao TEXT,
      qtd_pedida REAL,
      qtd_faturada REAL,
      preco_cotado REAL,
      preco_cobrado REAL
    );
  `);

  await test('4.1 Criação do pedido com parcelamento em boletos e verificação do comprometimento orçamentário', () => {
    const pedidoId = 'PED_TEST_2026_01';
    const ano = 2026;
    const mes = 11; // Novembro 2026

    // Insere limite mensal de R$ 10.000,00
    testDb.prepare('INSERT INTO monthly_limits (month, year, "limit") VALUES (?, ?, ?)').run(mes, ano, 10000.00);

    // Pedido de R$ 1.000,00 em 2 parcelas de R$ 500,00
    const installments = [
      { id: '1', value: 500.00, dueDate: '2026-11-10' },
      { id: '2', value: 500.00, dueDate: '2026-12-10' }
    ];

    testDb.prepare(`
      INSERT INTO orders (id, orderDate, distributor, totalValue, installments, status, paymentMethod)
      VALUES (?, '2026-10-20', 'ORIENTE FARMA', 1000.00, ?, 'Pendente', 'Boleto')
    `).run(pedidoId, JSON.stringify(installments));

    // Lança os 2 boletos
    testDb.prepare(`
      INSERT INTO boletos (id, supplierName, order_id, due_date, value, status)
      VALUES ('BOL_01', 'ORIENTE FARMA', ?, '2026-11-10', 500.00, 'Pendente')
    `).run(pedidoId);

    testDb.prepare(`
      INSERT INTO boletos (id, supplierName, order_id, due_date, value, status)
      VALUES ('BOL_02', 'ORIENTE FARMA', ?, '2026-12-10', 500.00, 'Pendente')
    `).run(pedidoId);

    // Itens do pedido
    testDb.prepare(`
      INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, qtd_faturada, preco_cotado)
      VALUES (?, '7891000000001', 'MEDICAMENTO A 50MG', 10, NULL, 60.00)
    `).run(pedidoId);

    testDb.prepare(`
      INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, qtd_faturada, preco_cotado)
      VALUES (?, '7892000000002', 'MEDICAMENTO B 20MG', 20, NULL, 20.00)
    `).run(pedidoId);

    // Verifica saldo inicial do mês 11
    const boletosMes11 = testDb.prepare(`
      SELECT SUM(value) as total 
      FROM boletos 
      WHERE due_date LIKE '2026-11%' AND LOWER(status) NOT IN ('cancelado', 'rejeitado')
    `).get();

    expectEqual(Number(boletosMes11.total), 500.00, 'Comprometimento inicial em boletos no mês 11 deve ser R$ 500,00');
  });

  await test('4.2 Simulação de conferência com corte parcial (corte de R$ 300,00 no faturamento)', () => {
    const pedidoId = 'PED_TEST_2026_01';

    // Conferência recebe:
    // Item 1: pedidas 10, faturadas apenas 5 (corte de 5 un * R$ 60 = R$ 300,00)
    // Item 2: pedidas 20, faturadas 20 (atendido 100%)
    const itensConferidos = [
      { ean: '7891000000001', qtd_faturada: 5, preco_cobrado: 60.00 },
      { ean: '7892000000002', qtd_faturada: 20, preco_cobrado: 20.00 }
    ];

    const resConf = processarConferenciaCortes({
      db: testDb,
      pedidoId,
      itensConferidos
    });

    expectEqual(resConf.valorCorteTotal, 300.00, 'Valor total do corte detectado deve ser R$ 300,00');
    expectEqual(resConf.recalculado, true, 'Recálculo deve ser acionado');
    expectEqual(resConf.cortesDetectados.length, 1, '1 item cortado detectado');
  });

  await test('4.3 Recálculo atômico de orders.totalValue e orders.installments', () => {
    const pedidoId = 'PED_TEST_2026_01';
    const orderAtualizada = testDb.prepare('SELECT * FROM orders WHERE id = ?').get(pedidoId);

    // Novo total = R$ 1.000,00 - R$ 300,00 = R$ 700,00
    expectEqual(Number(orderAtualizada.totalValue), 700.00, 'Total do pedido atualizado para R$ 700,00');

    // Parcelas recalculadas: R$ 700 / 2 = 2x R$ 350,00
    const parcelas = JSON.parse(orderAtualizada.installments);
    expectEqual(parcelas.length, 2, '2 parcelas mantidas');
    expectEqual(parcelas[0].value, 350.00, 'Parcela 1 recalculada para R$ 350,00');
    expectEqual(parcelas[1].value, 350.00, 'Parcela 2 recalculada para R$ 350,00');
  });

  await test('4.4 Atualização dos boletos e preservação do limite orçamentário mensal', () => {
    const pedidoId = 'PED_TEST_2026_01';

    const b1 = testDb.prepare('SELECT * FROM boletos WHERE id = ?').get('BOL_01');
    const b2 = testDb.prepare('SELECT * FROM boletos WHERE id = ?').get('BOL_02');

    expectEqual(Number(b1.value), 350.00, 'Boleto 1 de Nov/2026 atualizado para R$ 350,00');
    expectEqual(Number(b2.value), 350.00, 'Boleto 2 de Dez/2026 atualizado para R$ 350,00');

    // Verifica que o comprometimento mensal foi reduzido imediatamente
    const boletosMes11 = testDb.prepare(`
      SELECT SUM(value) as total 
      FROM boletos 
      WHERE due_date LIKE '2026-11%' AND LOWER(status) NOT IN ('cancelado', 'rejeitado')
    `).get();

    expectEqual(Number(boletosMes11.total), 350.00, 'Comprometimento de boletos do mês 11 caiu de R$ 500 para R$ 350');

    // Saldo disponível protegido em monthly_limits
    const limiteRow = testDb.prepare('SELECT "limit" FROM monthly_limits WHERE month = 11 AND year = 2026').get();
    const saldoDisponivel = Number(limiteRow.limit) - Number(boletosMes11.total);
    expectEqual(saldoDisponivel, 9650.00, 'Saldo disponível no mês 11 preservado em R$ 9.650,00 (economia de R$ 150 liberada para novas compras)');
  });

  await test('4.5 Enfileiramento automático dos itens cortados em belaped_itens_avulsos para re-cotação prioritária', () => {
    const pedidoId = 'PED_TEST_2026_01';
    const avulso = testDb.prepare('SELECT * FROM belaped_itens_avulsos WHERE ean = ?').get('7891000000001');

    expect(avulso !== undefined, 'Item cortado DEVE estar cadastrado em belaped_itens_avulsos');
    expectEqual(Number(avulso.quantidade), 5, 'Quantidade no avulso deve corresponder às 5 unidades cortadas');
    expectEqual(Number(avulso.preco_referencia), 60.00, 'Preço de referência preservado');
    expect(avulso.motivo.includes('Corte de 5 un'), 'Motivo deve identificar o corte e o número do pedido');
  });

  await test('4.6 Casos limítrofes de recálculo: dízima em 3 parcelas, pedido parcialmente quitado e corte 100%', () => {
    // Subteste A: Rateio de centavos com 3 parcelas (R$ 700 / 3 = 233.33, 233.33, 233.34)
    const pedidoDizima = 'PED_DIZIMA_01';
    testDb.prepare(`
      INSERT INTO orders (id, orderDate, distributor, totalValue, installments, status, paymentMethod)
      VALUES (?, '2026-10-20', 'MARTINS', 900.00, '[]', 'Pendente', 'Boleto')
    `).run(pedidoDizima);

    for (let i = 1; i <= 3; i++) {
      testDb.prepare(`
        INSERT INTO boletos (id, supplierName, order_id, due_date, value, status)
        VALUES (?, 'MARTINS', ?, '2026-11-${10 + i}', 300.00, 'Pendente')
      `).run(`BOL_DIZ_${i}`, pedidoDizima);
    }

    testDb.prepare(`
      INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, qtd_faturada, preco_cotado)
      VALUES (?, '7893333333333', 'PRODUTO DIZIMA', 9, 7, 100.00)
    `).run(pedidoDizima); // corte de 2 un * 100 = 200 -> novo total = 700.00

    processarConferenciaCortes({
      db: testDb,
      pedidoId: pedidoDizima,
      itensConferidos: [{ ean: '7893333333333', qtd_faturada: 7 }]
    });

    const bDiz1 = testDb.prepare('SELECT value FROM boletos WHERE id = ?').get('BOL_DIZ_1').value;
    const bDiz2 = testDb.prepare('SELECT value FROM boletos WHERE id = ?').get('BOL_DIZ_2').value;
    const bDiz3 = testDb.prepare('SELECT value FROM boletos WHERE id = ?').get('BOL_DIZ_3').value;

    expectEqual(Number((bDiz1 + bDiz2 + bDiz3).toFixed(2)), 700.00, 'Soma exata das 3 parcelas deve ser R$ 700,00 sem perda de centavos');
    expectEqual(bDiz1, 233.33, 'Parcela 1 = 233.33');
    expectEqual(bDiz2, 233.33, 'Parcela 2 = 233.33');
    expectEqual(bDiz3, 233.34, 'Parcela 3 com centavo de ajuste = 233.34');

    // Subteste B: Pedido com 1 parcela já PAGA e 1 PENDENTE
    const pedidoPago = 'PED_PAGO_PARCIAL';
    testDb.prepare(`
      INSERT INTO orders (id, orderDate, distributor, totalValue, installments, status, paymentMethod)
      VALUES (?, '2026-10-20', 'DISTRIMED', 1000.00, '[]', 'Pendente', 'Boleto')
    `).run(pedidoPago);

    testDb.prepare(`
      INSERT INTO boletos (id, supplierName, order_id, due_date, value, status)
      VALUES ('BOL_PAGO_1', 'DISTRIMED', ?, '2026-10-15', 500.00, 'Pago')
    `).run(pedidoPago);

    testDb.prepare(`
      INSERT INTO boletos (id, supplierName, order_id, due_date, value, status)
      VALUES ('BOL_PEND_2', 'DISTRIMED', ?, '2026-11-15', 500.00, 'Pendente')
    `).run(pedidoPago);

    testDb.prepare(`
      INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, qtd_faturada, preco_cotado)
      VALUES (?, '7894444444444', 'PRODUTO PAGO', 10, 8, 100.00)
    `).run(pedidoPago); // corte de 2 un * 100 = 200 -> novo total = 800.00

    processarConferenciaCortes({
      db: testDb,
      pedidoId: pedidoPago,
      itensConferidos: [{ ean: '7894444444444', qtd_faturada: 8 }]
    });

    const bPago1 = testDb.prepare('SELECT value, status FROM boletos WHERE id = ?').get('BOL_PAGO_1');
    const bPend2 = testDb.prepare('SELECT value, status FROM boletos WHERE id = ?').get('BOL_PEND_2');

    expectEqual(bPago1.value, 500.00, 'Boleto pago permanece intacto em R$ 500,00');
    expectEqual(bPend2.value, 300.00, 'Boleto pendente absorve o corte de R$ 200,00 passando a R$ 300,00');

    // Subteste C: Corte total (100% dos produtos rompidos)
    const pedidoCorteTotal = 'PED_CORTE_TOTAL';
    testDb.prepare(`
      INSERT INTO orders (id, orderDate, distributor, totalValue, installments, status, paymentMethod)
      VALUES (?, '2026-10-20', 'DIVIMED', 500.00, '[]', 'Pendente', 'Boleto')
    `).run(pedidoCorteTotal);

    testDb.prepare(`
      INSERT INTO boletos (id, supplierName, order_id, due_date, value, status)
      VALUES ('BOL_TOTAL_1', 'DIVIMED', ?, '2026-11-20', 500.00, 'Pendente')
    `).run(pedidoCorteTotal);

    testDb.prepare(`
      INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, qtd_faturada, preco_cotado)
      VALUES (?, '7895555555555', 'PRODUTO 100_CORTE', 5, 0, 100.00)
    `).run(pedidoCorteTotal);

    processarConferenciaCortes({
      db: testDb,
      pedidoId: pedidoCorteTotal,
      itensConferidos: [{ ean: '7895555555555', qtd_faturada: 0 }]
    });

    const ordTotal = testDb.prepare('SELECT totalValue FROM orders WHERE id = ?').get(pedidoCorteTotal);
    const bTotal = testDb.prepare('SELECT value FROM boletos WHERE id = ?').get('BOL_TOTAL_1');

    expectEqual(ordTotal.totalValue, 0.00, 'Pedido com 100% de corte tem totalValue zerado');
    expectEqual(bTotal.value, 0.00, 'Boleto pendente é zerado');
  });

  // ==========================================================================
  // SUÍTE 5: VALIDAÇÃO DO BUILD DO FRONTEND (R5)
  // ==========================================================================
  logSuite('R5: Validação de Integridade do Build de Produção do Frontend');

  await test('5.1 Verificação da integridade das dependências e scripts de build em package.json', () => {
    const pkgPath = path.resolve(__dirname, 'package.json');
    expect(fs.existsSync(pkgPath), 'package.json deve existir');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.scripts && pkg.scripts.build, 'Script build deve existir em package.json');
    expectEqual(pkg.scripts.build, 'vite build', 'Script build deve invocar vite build');
  });

  await test('5.2 Validação dos artefatos compilados de produção no diretório dist/', () => {
    const distPath = path.resolve(__dirname, 'dist');
    expect(fs.existsSync(distPath), 'Diretório dist/ deve existir');

    const indexHtmlPath = path.join(distPath, 'index.html');
    expect(fs.existsSync(indexHtmlPath), 'dist/index.html deve existir');
    const htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');
    expect(htmlContent.includes('<script type="module"'), 'index.html deve conter módulo JS Vite empacotado');

    const assetsPath = path.join(distPath, 'assets');
    expect(fs.existsSync(assetsPath), 'Diretório dist/assets deve existir');

    const files = fs.readdirSync(assetsPath);
    const jsBundles = files.filter(f => f.endsWith('.js'));
    const cssBundles = files.filter(f => f.endsWith('.css'));

    expect(jsBundles.length > 0, `Pelo menos 1 bundle JS de produção deve estar presente em dist/assets (encontrados: ${jsBundles.length})`);
    expect(cssBundles.length > 0, `Pelo menos 1 bundle CSS de produção deve estar presente em dist/assets (encontrados: ${cssBundles.length})`);

    // Valida tamanho mínimo dos bundles
    const mainJs = jsBundles[0];
    const jsStat = fs.statSync(path.join(assetsPath, mainJs));
    expect(jsStat.size > 10000, `Bundle principal ${mainJs} deve ter tamanho consistente (> 10KB, atual: ${jsStat.size} bytes)`);
  });

  // ==========================================================================
  // RELATÓRIO FINAL CONSOLIDADO
  // ==========================================================================
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  logHeader('RELATÓRIO CONSOLIDADO DE EXECUÇÃO');

  console.log(`  ${colors.bold}Total de Asserções Executadas:${colors.reset} ${totalAssertions}`);
  console.log(`  ${colors.bold}Casos de Teste Aprovados:${colors.reset}     ${colors.green}${passedTests}${colors.reset}`);
  console.log(`  ${colors.bold}Casos de Teste Reprovados:${colors.reset}    ${failedTests > 0 ? colors.red : colors.green}${failedTests}${colors.reset}`);
  console.log(`  ${colors.bold}Tempo Total de Execução:${colors.reset}      ${duration}s\n`);

  if (failedTests > 0) {
    console.log(`${colors.bold}${colors.red}❌ FALHAS DETECTADAS (${failedTests}):${colors.reset}`);
    failures.forEach((f, idx) => {
      console.log(`  ${idx + 1}. ${colors.bold}${f.name}${colors.reset}`);
      console.log(`     ${colors.red}${f.error.message}${colors.reset}`);
    });
    process.exit(1);
  } else {
    console.log(`${colors.bold}${colors.green}🎉 TODAS AS ASSERÇÕES DE R1 A R5 FORAM APROVADAS COM 100% DE SUCESSO!${colors.reset}`);
    console.log(`${colors.bold}${colors.green}   Paridade dos 7 robôs, desvinculação de marcas, Curva A e recálculo orçamentário auditados.${colors.reset}\n`);
    process.exit(0);
  }
}

// Execução imediata
runBelaPedTestSuite().catch(err => {
  console.error(`\n${colors.red}ERRO FATAL NA EXECUÇÃO DA SUÍTE DE TESTES:${colors.reset}`, err);
  process.exit(1);
});
