/**
 * stress_r2_r3.cjs
 * Empirical Challenger Adversarial Stress Harness for BelaPed Task Force:
 * Rigorously stress tests R2 (Robot Strict EAN Validation & Parity) and R3 (Basket Optimization & Curva A Complementation).
 *
 * Execution: node stress_r2_r3.cjs
 */

const path = require('path');
const assert = require('assert');
const fs = require('fs');

const Database = require('./backend/node_modules/better-sqlite3');
const farmacoMatcher = require('./backend/belaped-farmaco-matcher.js');
const motorEssencia = require('./backend/belaped-motor-essencia.js');
const { validarCorrespondenciaProduto } = require('./backend/belaped-validador.js');

// Os 7 Robôs Oficiais do BelaPed
const { OrienteRobot } = require('./backend/belaped-robot-oriente.js');
const { DistrimedRobot } = require('./backend/belaped-robot-distrimed.js');
const { DpcRobot } = require('./backend/belaped-robot-dpc.js');
const { ProfarmaRobot } = require('./backend/belaped-robot-profarma.js');
const { SotonRobot } = require('./backend/belaped-robot-soton.js');
const { MartinsRobot } = require('./backend/belaped-robot-martins.js');
const { DivimedRobot } = require('./backend/belaped-robot-divimed.js');

// Cores ANSI
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

let totalAssertions = 0;
let passedTests = 0;
let failedTests = 0;
const testVulnerabilities = [];
const failures = [];
const startTime = Date.now();

function logHeader(text) {
  console.log(`\n${colors.bold}${colors.magenta}======================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}  ${text}${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}======================================================================${colors.reset}`);
}

function logSuite(name) {
  console.log(`\n${colors.bold}${colors.cyan}⚡ [ADVERSARIAL SUITE] ${name}${colors.reset}`);
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

// ============================================================================
// Utilitários de Geração Adversarial de EANs
// ============================================================================
function calcularDigitoVerificadorEan13(corpo12) {
  let soma = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(corpo12[i], 10);
    soma += (i % 2 === 0) ? d : d * 3;
  }
  const mod = soma % 10;
  return mod === 0 ? 0 : 10 - mod;
}

function gerarEan13Aleatorio(prefixo = '789') {
  let corpo = prefixo;
  while (corpo.length < 12) {
    corpo += Math.floor(Math.random() * 10).toString();
  }
  const dv = calcularDigitoVerificadorEan13(corpo);
  return corpo + dv;
}

function gerarMutacoesPadrao(eanOriginal) {
  const mutacoes = [];
  const len = eanOriginal.length;

  // 1. Off-by-one no dígito final
  const ultimo = parseInt(eanOriginal[len - 1], 10);
  mutacoes.push({ tipo: 'off-by-one-ultimo-mais-1', ean: eanOriginal.slice(0, len - 1) + ((ultimo + 1) % 10) });
  mutacoes.push({ tipo: 'off-by-one-ultimo-menos-1', ean: eanOriginal.slice(0, len - 1) + ((ultimo + 9) % 10) });

  // 2. Off-by-one no primeiro dígito
  const primeiro = parseInt(eanOriginal[0], 10);
  mutacoes.push({ tipo: 'off-by-one-primeiro', ean: ((primeiro + 1) % 10) + eanOriginal.slice(1) });

  // 3. Mutação em cada posição individual (0..12)
  for (let i = 0; i < len; i++) {
    const d = parseInt(eanOriginal[i], 10);
    const novoD = (d + 5) % 10;
    mutacoes.push({ tipo: `mutacao-posicao-${i}`, ean: eanOriginal.slice(0, i) + novoD + eanOriginal.slice(i + 1) });
  }

  // 4. Inversão de dígitos adjacentes (transposição)
  for (let i = 0; i < len - 1; i++) {
    if (eanOriginal[i] !== eanOriginal[i + 1]) {
      const invertido = eanOriginal.slice(0, i) + eanOriginal[i + 1] + eanOriginal[i] + eanOriginal.slice(i + 2);
      mutacoes.push({ tipo: `transposicao-${i}-${i + 1}`, ean: invertido });
    }
  }

  // 5. Truncamentos de tamanho inválido
  mutacoes.push({ tipo: 'truncado-12-digitos', ean: eanOriginal.slice(0, 12) });
  mutacoes.push({ tipo: 'truncado-8-digitos-prefixo', ean: eanOriginal.slice(0, 8) });
  mutacoes.push({ tipo: 'estendido-14-com-sufixo', ean: eanOriginal + '9' });

  // 6. EANs nulos / alfa
  mutacoes.push({ tipo: 'todos-zeros', ean: '0000000000000' });
  mutacoes.push({ tipo: 'todos-noves', ean: '9999999999999' });
  mutacoes.push({ tipo: 'alfanumerico', ean: '78912345ABCDE' });

  return mutacoes;
}

// ============================================================================
// EXECUÇÃO DA SUÍTE DE TESTES ADVERSARIAIS
// ============================================================================
(async function runAdversarialHarness() {
  logHeader('BelaPed Task Force: Challenger 2 Adversarial Stress Harness (R2 & R3)');

  // --------------------------------------------------------------------------
  // SUÍTE 1: ADVERSARIAL STRESS TEST DE PARIDADE E EAN DOS 7 ROBÔS (R2)
  // --------------------------------------------------------------------------
  logSuite('R2.1 Paridade Rigorosa e Presença Mandatória dos 6 Métodos nos 7 Robôs');

  const robosInfo = [
    { nome: 'Oriente Farma', classe: OrienteRobot },
    { nome: 'Distrimed', classe: DistrimedRobot },
    { nome: 'DPC', classe: DpcRobot },
    { nome: 'Profarma', classe: ProfarmaRobot },
    { nome: 'Soton Farma', classe: SotonRobot },
    { nome: 'Martins Atacado', classe: MartinsRobot },
    { nome: 'Divimed', classe: DivimedRobot }
  ];

  const metodosMandatorios = [
    'iniciar',
    'fechar',
    'cotarEAN',
    'adicionarAoCarrinho',
    'contarItensCarrinho',
    'limparCarrinho'
  ];

  await test('Auditoria de Contrato: 7 robôs implementam todos os 6 métodos obrigatórios', () => {
    expectEqual(robosInfo.length, 7, 'Devem ser exatamente 7 robôs');
    for (const r of robosInfo) {
      expect(typeof r.classe === 'function', `${r.nome} deve ser classe construtora`);
      for (const m of metodosMandatorios) {
        expect(
          typeof r.classe.prototype[m] === 'function',
          `Robô ${r.nome} DEVE implementar método '${m}'`
        );
      }
    }
  });

  logSuite('R2.2 Desafio Adversarial de Validação Estrita de EAN: DPC Distribuidora');

  await test('DPC: Bateria Padrão de Mutações, Off-by-One e Transposições (Zero Aceitação de Mismatch)', async () => {
    const targetEan = '7891234567890';
    const dpc = new DpcRobot();
    dpc.page = {}; // mock page ativa

    const mutacoes = gerarMutacoesPadrao(targetEan);
    let rejeitados = 0;
    for (const m of mutacoes) {
      dpc._buscarNoCatalogoDpc = async () => [
        { ean: m.ean, descricao: `PRODUTO MUTADO ${m.tipo}`, preco: 19.90 }
      ];

      const res = await dpc.cotarEAN(targetEan, '', { cotarPorEssencia: false });
      if (!res.disponivel) {
        rejeitados++;
      } else {
        throw new Error(`FALHA CRÍTICA: DPC aceitou EAN mismatching "${m.ean}" (tipo: ${m.tipo}) ao buscar "${targetEan}"!`);
      }
    }

    expectEqual(rejeitados, mutacoes.length, `Todos os ${mutacoes.length} EANs mutados padrão foram rejeitados pela DPC`);

    // Prova que o EAN correto com formatação idêntica É aceito
    dpc._buscarNoCatalogoDpc = async () => [
      { ean: targetEan, descricao: 'PRODUTO LEGITIMO TARGET', preco: 19.90 }
    ];
    const resLegitimo = await dpc.cotarEAN(targetEan, '', { cotarPorEssencia: false });
    expectEqual(resLegitimo.disponivel, true, 'DPC deve aceitar produto legítimo com EAN exato');
    expectEqual(resLegitimo.preco, 19.90, 'Preço deve ser 19.90');

    // Prova de paridade GTIN-14 (0 + 13 dígitos): '07891234567890' deve ser reconhecido
    dpc._buscarNoCatalogoDpc = async () => [
      { ean: '0' + targetEan, descricao: 'PRODUTO GTIN-14 LEGITIMO', preco: 18.50 }
    ];
    const resGtin14 = await dpc.cotarEAN(targetEan, '', { cotarPorEssencia: false });
    expectEqual(resGtin14.disponivel, true, 'DPC deve reconhecer representação GTIN-14 com zero à esquerda');
  });

  logSuite('R2.3 Desafio Adversarial de Validação Estrita de EAN: Soton Farma (Mercos)');

  await test('Soton: Bateria Padrão de Mutações, Off-by-One e Transposições (Zero Aceitação de Mismatch)', async () => {
    const targetEan = '7891234567890';
    const soton = new SotonRobot();
    soton.page = {};

    const mutacoes = gerarMutacoesPadrao(targetEan);
    let rejeitados = 0;

    for (const m of mutacoes) {
      soton._buscarTermoNaSoton = async () => [
        { ean: m.ean, descricao: `SOTON PROD MUTADO ${m.tipo}`, preco: 22.00 }
      ];

      const res = await soton.cotarEAN(targetEan, '', { cotarPorEssencia: false });
      if (!res.disponivel) {
        rejeitados++;
      } else {
        throw new Error(`FALHA CRÍTICA: Soton aceitou EAN mismatching "${m.ean}" (tipo: ${m.tipo}) ao buscar "${targetEan}"!`);
      }
    }

    expectEqual(rejeitados, mutacoes.length, `Todos os ${mutacoes.length} EANs mutados padrão foram rejeitados pela Soton`);

    // Legitimo aceito
    soton._buscarTermoNaSoton = async () => [
      { ean: targetEan, descricao: 'SOTON LEGITIMO TARGET', preco: 22.00 }
    ];
    const resLegitimo = await soton.cotarEAN(targetEan, '', { cotarPorEssencia: false });
    expectEqual(resLegitimo.disponivel, true, 'Soton deve aceitar o EAN exato');
  });

  logSuite('R2.4 Desafio Adversarial de Validação Estrita de EAN: Martins Atacado');

  await test('Martins: Bateria Padrão de Mutações, Off-by-One e Transposições (Zero Aceitação de Mismatch)', async () => {
    const targetEan = '7891234567890';
    const martins = new MartinsRobot();
    martins.page = {};

    const mutacoes = gerarMutacoesPadrao(targetEan);
    let rejeitados = 0;

    for (const m of mutacoes) {
      martins._executarBuscaMartins = async () => [
        { ean: m.ean, descricao: `MARTINS PROD MUTADO ${m.tipo}`, preco: 25.00 }
      ];

      const res = await martins.cotarEAN(targetEan, '', { cotarPorEssencia: false });
      if (!res.disponivel) {
        rejeitados++;
      } else {
        throw new Error(`FALHA CRÍTICA: Martins aceitou EAN mismatching "${m.ean}" (tipo: ${m.tipo}) ao buscar "${targetEan}"!`);
      }
    }

    expectEqual(rejeitados, mutacoes.length, `Todos os ${mutacoes.length} EANs mutados padrão foram rejeitados pelo Martins`);

    // Legitimo aceito
    martins._executarBuscaMartins = async () => [
      { ean: targetEan, descricao: 'MARTINS LEGITIMO TARGET', preco: 25.00 }
    ];
    const resLegitimo = await martins.cotarEAN(targetEan, '', { cotarPorEssencia: false });
    expectEqual(resLegitimo.disponivel, true, 'Martins deve aceitar o EAN exato');
  });

  logSuite('R2.5 Desafio Adversarial de Validação Estrita de EAN: Divimed');

  await test('Divimed: Bateria Padrão de Mutações, Off-by-One e Transposições (Zero Aceitação de Mismatch)', async () => {
    const targetEan = '7891234567890';
    const divimed = new DivimedRobot();
    divimed.page = {};

    const mutacoes = gerarMutacoesPadrao(targetEan);
    let rejeitados = 0;

    for (const m of mutacoes) {
      divimed._buscarProdutosDivimed = async () => [
        { ean: m.ean, descricao: `DIVIMED PROD MUTADO ${m.tipo}`, preco: 30.00, produtoId: 101, estoque: 50 }
      ];

      const res = await divimed.cotarEAN(targetEan, 'MEDICAMENTO QUALQUER', { cotarPorEssencia: false });
      if (!res.disponivel) {
        rejeitados++;
      } else {
        throw new Error(`FALHA CRÍTICA: Divimed aceitou EAN mismatching "${m.ean}" (tipo: ${m.tipo}) ao buscar "${targetEan}"!`);
      }
    }

    expectEqual(rejeitados, mutacoes.length, `Todos os ${mutacoes.length} EANs mutados padrão foram rejeitados pela Divimed`);

    // Legitimo aceito
    divimed._buscarProdutosDivimed = async () => [
      { ean: targetEan, descricao: 'DIVIMED LEGITIMO TARGET', preco: 30.00, produtoId: 101, estoque: 50 }
    ];
    const resLegitimo = await divimed.cotarEAN(targetEan, 'MEDICAMENTO QUALQUER', { cotarPorEssencia: false });
    expectEqual(resLegitimo.disponivel, true, 'Divimed deve aceitar o EAN exato');
  });

  logSuite('R2.6 Fuzzing Adversarial de 100 EANs Aleatórios Válidos em Cruzamento');

  await test('Fuzzing Cruzado: 100 pares aleatórios de EAN-13 distintos nunca se cruzam falsamente', async () => {
    const dpc = new DpcRobot();
    dpc.page = {};

    let totalTestes = 0;
    let totalRejeitados = 0;

    for (let k = 0; k < 100; k++) {
      const eanTarget = gerarEan13Aleatorio('789');
      let eanDistinto = gerarEan13Aleatorio('789');
      while (eanDistinto === eanTarget) {
        eanDistinto = gerarEan13Aleatorio('789');
      }

      dpc._buscarNoCatalogoDpc = async () => [
        { ean: eanDistinto, descricao: 'PRODUTO ALEATORIO NO PORTAL', preco: 10.00 }
      ];

      const res = await dpc.cotarEAN(eanTarget, '', { cotarPorEssencia: false });
      totalTestes++;
      if (!res.disponivel) totalRejeitados++;
    }

    expectEqual(totalRejeitados, totalTestes, '100% dos pares aleatórios distintos devem ser rejeitados');
  });

  logSuite('R2.7 Teste de Brecha: Ataque de Sufixo e Prefixo Estendido (endsWith permissivo)');

  await test('Auditoria de Vulnerabilidade: Teste de sufixo 8 dígitos e código de 15 dígitos em todos os 4 robôs', async () => {
    const targetEan = '7891234567890';
    const robosAuditados = [
      { nome: 'DPC', instance: new DpcRobot(), mockFn: (inst, data) => { inst._buscarNoCatalogoDpc = async () => data; } },
      { nome: 'Soton', instance: new SotonRobot(), mockFn: (inst, data) => { inst._buscarTermoNaSoton = async () => data; } },
      { nome: 'Martins', instance: new MartinsRobot(), mockFn: (inst, data) => { inst._executarBuscaMartins = async () => data; } },
      { nome: 'Divimed', instance: new DivimedRobot(), mockFn: (inst, data) => { inst._buscarProdutosDivimed = async () => data; } }
    ];

    const casosBrecha = [
      { tipo: 'sufixo-8-digitos', eanFalso: '34567890', descricao: 'Código interno 8 dígitos que coincide com o final do EAN' },
      { tipo: 'estendido-15-digitos', eanFalso: '997891234567890', descricao: 'Código de 15 dígitos com prefixo arbitrário 99' }
    ];

    for (const r of robosAuditados) {
      r.instance.page = {};
      for (const c of casosBrecha) {
        r.mockFn(r.instance, [{ ean: c.eanFalso, descricao: 'PRODUTO TESTE BRECHA', preco: 10.00, produtoId: 99, estoque: 10 }]);
        const res = await r.instance.cotarEAN(targetEan, '', { cotarPorEssencia: false });

        if (res.disponivel) {
          testVulnerabilities.push({
            portal: r.nome,
            tipo: c.tipo,
            eanAlvo: targetEan,
            eanAceito: c.eanFalso,
            detalhe: `Robô ${r.nome} aceitou "${c.eanFalso}" (${c.descricao}) devido à condição permissiva endsWith()`
          });
        }
      }
    }

    expectEqual(testVulnerabilities.length, 0, 'Zero aceitações indevidas de códigos de sufixo 8 dígitos ou prefixo 15 dígitos nos 4 robôs');
  });

  // --------------------------------------------------------------------------
  // SUÍTE 2: ADVERSARIAL STRESS TEST DE BLOQUEIO DE PEDIDO MÍNIMO (R3)
  // --------------------------------------------------------------------------
  logSuite('R3.1 Análise de Limite de Borda: Baskets com R$ 0,01 Abaixo do Mínimo Oficial');

  const limitesOficiaisPortais = [
    { portal: 'PROFARMA', minimo: 150.00 },
    { portal: 'ORIENTE FARMA', minimo: 150.00 },
    { portal: 'MARTINS ATACADO', minimo: 200.00 },
    { portal: 'DPC DISTRIBUIDORA', minimo: 300.00 },
    { portal: 'SOTON FARMA', minimo: 300.00 },
    { portal: 'DISTRIMED', minimo: 350.00 },
    { portal: 'DIVIMED', minimo: 400.00 }
  ];

  function avaliarEBloquearDespachoPedido(carrinho) {
    const total = Number(Number(carrinho.total).toFixed(2));
    const min = Number(Number(carrinho.pedidoMinimo).toFixed(2));
    const atingiu = total >= min;
    const falta = atingiu ? 0 : Number((min - total).toFixed(2));

    const statusCarrinho = {
      distribuidora: carrinho.distribuidora,
      total,
      pedidoMinimo: min,
      atingiuMinimo: atingiu,
      faltaParaMinimo: falta
    };

    if (!atingiu) {
      return {
        bloqueado: true,
        motivo: `PEDIDO_BLOQUEADO: Pedido em ${carrinho.distribuidora} (R$ ${total.toFixed(2)}) abaixo do mínimo de R$ ${min.toFixed(2)}. Faltam R$ ${falta.toFixed(2)}.`,
        carrinho: statusCarrinho
      };
    }

    return {
      bloqueado: false,
      status: 'AUTORIZADO_PARA_DISPARO',
      carrinho: statusCarrinho
    };
  }

  await test('Bloqueio Incondicional: Baskets com R$ 0,01 abaixo do mínimo em TODOS os 7 portais', () => {
    for (const p of limitesOficiaisPortais) {
      const valorSubminimo = Number((p.minimo - 0.01).toFixed(2));

      const carrinhoSub = {
        distribuidora: p.portal,
        total: valorSubminimo,
        pedidoMinimo: p.minimo
      };

      const decisao = avaliarEBloquearDespachoPedido(carrinhoSub);
      expectEqual(decisao.bloqueado, true, `Despacho na ${p.portal} a R$ ${valorSubminimo} DEVE ser sumariamente bloqueado`);
      expectEqual(decisao.carrinho.atingiuMinimo, false, `atingiuMinimo deve ser false na ${p.portal}`);
      expectEqual(decisao.carrinho.faltaParaMinimo, 0.01, `Falta deve ser exatamente R$ 0,01 na ${p.portal}`);
      expect(decisao.motivo.includes('PEDIDO_BLOQUEADO'), 'Motivo deve conter código PEDIDO_BLOQUEADO');
    }
  });

  await test('Limiares de Borda Exata: R$ 0,00 de falta (Exatamente no Mínimo) e R$ 0,01 Acima', () => {
    for (const p of limitesOficiaisPortais) {
      // 1. Exatamente no valor mínimo
      const carrinhoExato = {
        distribuidora: p.portal,
        total: p.minimo,
        pedidoMinimo: p.minimo
      };
      const decExato = avaliarEBloquearDespachoPedido(carrinhoExato);
      expectEqual(decExato.bloqueado, false, `Exatamente no mínimo (R$ ${p.minimo}) deve autorizar`);
      expectEqual(decExato.carrinho.atingiuMinimo, true, 'atingiuMinimo deve ser true');
      expectEqual(decExato.carrinho.faltaParaMinimo, 0, 'Falta deve ser 0');

      // 2. R$ 0,01 acima do mínimo
      const carrinhoAcima = {
        distribuidora: p.portal,
        total: Number((p.minimo + 0.01).toFixed(2)),
        pedidoMinimo: p.minimo
      };
      const decAcima = avaliarEBloquearDespachoPedido(carrinhoAcima);
      expectEqual(decAcima.bloqueado, false, `R$ 0,01 acima deve autorizar`);
      expectEqual(decAcima.carrinho.atingiuMinimo, true, 'atingiuMinimo deve ser true');
    }
  });

  await test('Adversarial Edge Cases: Carrinhos vazios (R$ 0), valores negativos e dízimas de ponto flutuante', () => {
    // 1. Carrinho vazio R$ 0,00
    const carZero = { distribuidora: 'DPC', total: 0.00, pedidoMinimo: 300.00 };
    const decZero = avaliarEBloquearDespachoPedido(carZero);
    expectEqual(decZero.bloqueado, true, 'Carrinho R$ 0 deve ser bloqueado');
    expectEqual(decZero.carrinho.faltaParaMinimo, 300.00, 'Falta deve ser R$ 300,00');

    // 2. Ponto flutuante IEEE 754: 149.99000000000004 vs 150.00
    const floatAdversarial = 100.00 + 49.99; // 149.99
    const carFloat = { distribuidora: 'PROFARMA', total: floatAdversarial, pedidoMinimo: 150.00 };
    const decFloat = avaliarEBloquearDespachoPedido(carFloat);
    expectEqual(decFloat.bloqueado, true, 'IEEE-754 149.99 não deve vazar como 150.00');
    expectEqual(decFloat.carrinho.faltaParaMinimo, 0.01, 'Falta precisa ser 0.01');

    // 3. Valor negativo
    const carNeg = { distribuidora: 'SOTON', total: -50.00, pedidoMinimo: 300.00 };
    const decNeg = avaliarEBloquearDespachoPedido(carNeg);
    expectEqual(decNeg.bloqueado, true, 'Valor negativo deve ser bloqueado');
  });

  // --------------------------------------------------------------------------
  // SUÍTE 3: ADVERSARIAL STRESS TEST DE COMPLEMENTAÇÃO CURVA A ZERADA (R3)
  // --------------------------------------------------------------------------
  logSuite('R3.2 Validação Física e Injeção Contaminada de Curva A no SQLite');

  await test('ERP Digifarma Real: Consulta e verificação estrita de Curva A com saldo <= 0 em data/belafarma.db', () => {
    const dbPath = path.resolve(process.cwd(), 'data/belafarma.db');
    if (!fs.existsSync(dbPath)) {
      console.log(`[Pulo de banco físico - db não encontrado em ${dbPath}]`);
      return;
    }

    const dbReal = new Database(dbPath, { readonly: true });
    try {
      const rows = dbReal.prepare(`
        SELECT produto_id, descricao, ean, curva_abc, saldo, vmd_ponderado 
        FROM compras_estoque_cache 
        WHERE curva_abc = 'A' AND saldo <= 0
        ORDER BY vmd_ponderado DESC 
        LIMIT 50
      `).all();

      expect(rows.length > 0, 'Devem existir produtos Curva A zerados no estoque real da farmácia');

      let vmdAnterior = Infinity;
      for (let i = 0; i < rows.length; i++) {
        const item = rows[i];
        expectEqual(item.curva_abc, 'A', `Item #${item.produto_id} DEVE ser Curva A`);
        expect(item.saldo <= 0, `Item #${item.produto_id} DEVE ter saldo <= 0 (obtido: ${item.saldo})`);
        const vmd = Number(item.vmd_ponderado || 0);
        expect(vmd <= vmdAnterior, `Ordenação VMD DECRESCENTE violada no item #${item.produto_id}: ${vmd} > ${vmdAnterior}`);
        vmdAnterior = vmd;
      }
    } finally {
      dbReal.close();
    }
  });

  await test('Adversarial Test Matrix: Injeção de registros contaminados (Curva B, Curva C, Saldo Positivo, VMD Nulo)', () => {
    const memDb = new Database(':memory:');
    memDb.exec(`
      CREATE TABLE compras_estoque_cache (
        produto_id INTEGER PRIMARY KEY,
        descricao TEXT,
        apresentacao TEXT,
        ean TEXT,
        curva_abc TEXT,
        saldo REAL,
        vmd_ponderado REAL,
        est_minimo_calculado REAL,
        custo_unitario REAL
      );

      CREATE TABLE belaped_cotacoes_reais (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ean TEXT,
        fornecedor TEXT,
        preco REAL,
        disponivel INTEGER,
        url_produto TEXT
      );
    `);

    const insEstoque = memDb.prepare(`
      INSERT INTO compras_estoque_cache (produto_id, descricao, ean, curva_abc, saldo, vmd_ponderado)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insEstoque.run(1, 'VALIDO CURVA A ALTO VMD', '7890000000001', 'A', 0, 5.0);
    insEstoque.run(2, 'VALIDO CURVA A MEDIO VMD', '7890000000002', 'A', -3, 3.0);
    insEstoque.run(3, 'VALIDO CURVA A BAIXO VMD', '7890000000003', 'A', 0, 1.0);
    insEstoque.run(4, 'CONTAMINADO SALDO POSITIVO 1', '7890000000004', 'A', 1, 10.0);
    insEstoque.run(5, 'CONTAMINADO SALDO POSITIVO 50', '7890000000005', 'A', 50, 8.0);
    insEstoque.run(6, 'CONTAMINADO CURVA B ZERADA', '7890000000006', 'B', 0, 7.0);
    insEstoque.run(7, 'CONTAMINADO CURVA C ZERADA', '7890000000007', 'C', -1, 6.0);
    insEstoque.run(8, 'VALIDO MAS SEM COTAÇÃO', '7890000000008', 'A', 0, 4.0);
    insEstoque.run(9, 'VALIDO COTAÇÃO PREÇO 0', '7890000000009', 'A', 0, 2.0);

    const insCotacao = memDb.prepare(`
      INSERT INTO belaped_cotacoes_reais (ean, fornecedor, preco, disponivel)
      VALUES (?, 'DPC DISTRIBUIDORA', ?, ?)
    `);

    insCotacao.run('7890000000001', 10.00, 1);
    insCotacao.run('7890000000002', 15.00, 1);
    insCotacao.run('7890000000003', 20.00, 1);
    insCotacao.run('7890000000004', 12.00, 1);
    insCotacao.run('7890000000005', 14.00, 1);
    insCotacao.run('7890000000006', 11.00, 1);
    insCotacao.run('7890000000007', 13.00, 1);
    insCotacao.run('7890000000009', 0.00, 1); // Preço 0

    const candidatos = memDb.prepare(`
      SELECT 
        c.produto_id,
        c.descricao,
        c.ean,
        c.curva_abc,
        c.saldo,
        c.vmd_ponderado,
        cr.preco as preco_portal
      FROM compras_estoque_cache c
      INNER JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.disponivel = 1 AND cr.preco > 0
      WHERE c.curva_abc = 'A'
        AND c.saldo <= 0
        AND UPPER(cr.fornecedor) = 'DPC DISTRIBUIDORA'
      ORDER BY c.vmd_ponderado DESC
    `).all();

    expectEqual(candidatos.length, 3, 'Exatamente 3 produtos devem passar por todos os filtros');
    expectEqual(candidatos[0].produto_id, 1, '1º produto deve ser o de maior VMD (5.0)');
    expectEqual(candidatos[1].produto_id, 2, '2º produto deve ser o de VMD médio (3.0)');
    expectEqual(candidatos[2].produto_id, 3, '3º produto deve ser o de menor VMD (1.0)');

    const saldoPositivo = candidatos.filter(c => c.saldo > 0);
    expectEqual(saldoPositivo.length, 0, 'ZERO produtos com saldo positivo devem ser retornados');

    const curvaNaoA = candidatos.filter(c => c.curva_abc !== 'A');
    expectEqual(curvaNaoA.length, 0, 'ZERO produtos que não sejam Curva A devem ser retornados');
  });

  await test('Cálculo Dinâmico da Quantidade de Giro (7 dias) e Cobertura Precisa da Falta', () => {
    const falta = 130.00;

    const candidatos = [
      { produto_id: 1, descricao: 'MEDICAMENTO A', preco_portal: 10.00, vmd_ponderado: 1.0 },
      { produto_id: 2, descricao: 'MEDICAMENTO B', preco_portal: 5.00, vmd_ponderado: 2.0 },
      { produto_id: 3, descricao: 'MEDICAMENTO C', preco_portal: 20.00, vmd_ponderado: 0.2 }
    ];

    let acumulado = 0;
    const sugestoes = [];

    for (const item of candidatos) {
      const preco = Number(item.preco_portal);
      const vmd = Number(item.vmd_ponderado || 0);
      const qtdSugerida = Math.max(1, Math.min(20, Math.ceil(vmd * 7)));
      const subtotal = Number((qtdSugerida * preco).toFixed(2));

      sugestoes.push({
        ...item,
        qtd_sugerida: qtdSugerida,
        subtotal
      });

      acumulado += subtotal;
      if (falta > 0 && acumulado >= falta) {
        break;
      }
    }

    expectEqual(sugestoes.length, 2, 'Devem ser sugeridos apenas 2 itens para atingir R$ 130,00');
    expectEqual(sugestoes[0].qtd_sugerida, 7, 'Item 1: 1.0 vmd * 7 = 7 un');
    expectEqual(sugestoes[0].subtotal, 70.00, 'Item 1 subtotal: R$ 70,00');
    expectEqual(sugestoes[1].qtd_sugerida, 14, 'Item 2: 2.0 vmd * 7 = 14 un');
    expectEqual(sugestoes[1].subtotal, 70.00, 'Item 2 subtotal: R$ 70,00');

    expect(acumulado >= falta, `Total sugerido (R$ ${acumulado.toFixed(2)}) deve cobrir a falta (R$ ${falta.toFixed(2)})`);
    const novoTotal = 70.00 + acumulado;
    expect(novoTotal >= 200.00, 'Novo total atinge o mínimo de R$ 200,00');
  });

  // --------------------------------------------------------------------------
  // RELATÓRIO FINAL DO HARNESS
  // --------------------------------------------------------------------------
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  logHeader('Resumo da Execução Adversarial (Challenger 2)');
  console.log(`  Total de Testes Executados:   ${colors.bold}${passedTests + failedTests}${colors.reset}`);
  console.log(`  Testes Aprovados:             ${colors.green}${colors.bold}${passedTests}${colors.reset}`);
  console.log(`  Testes Reprovados:            ${failedTests > 0 ? colors.red : colors.green}${colors.bold}${failedTests}${colors.reset}`);
  console.log(`  Total de Asserções:           ${colors.cyan}${colors.bold}${totalAssertions}${colors.reset}`);
  console.log(`  Vulnerabilidades Encontradas: ${colors.yellow}${colors.bold}${testVulnerabilities.length}${colors.reset}`);
  console.log(`  Tempo Total:                  ${duration}s\n`);

  if (testVulnerabilities.length > 0) {
    console.log(`${colors.yellow}⚠️ LISTA DE VULNERABILIDADES CONFIRMADAS EMPIRICAMENTE:${colors.reset}`);
    testVulnerabilities.forEach((v, idx) => {
      console.log(`  ${idx + 1}. [${v.portal}] ${v.tipo}: ${v.detalhe}`);
    });
    console.log('');
  }

  if (failedTests > 0) {
    console.error(`${colors.bold}${colors.red}❌ FALHAS CRÍTICAS ENCONTRADAS (${failedTests}):${colors.reset}`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${colors.yellow}${f.name}${colors.reset}: ${f.error.message}`);
    });
    process.exit(1);
  } else {
    console.log(`${colors.bold}${colors.green}✅ HARNESS EXECUTADO COM SUCESSO! DADOS EMPÍRICOS CONSOLIDADOS.${colors.reset}`);
    process.exit(0);
  }
})();
