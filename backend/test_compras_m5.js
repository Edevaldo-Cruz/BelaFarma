/**
 * test_compras_m5.js
 * Suíte Completa de Testes Automatizados para Elaboração de Pedidos de Compra
 * e Controle Orçamentário Financeiro (Worker M5 - R5 / F13, F14).
 * 
 * Execução: node backend/test_compras_m5.js
 */

const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const comprasPedidosService = require('./services/compras-pedidos.service');

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('🧪 INICIANDO TESTES DO WORKER M5 (Pedidos de Compra & Orçamento M5/R5)     ');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Erro: ${err.message}`);
    if (err.stack) {
      const lines = err.stack.split('\n').slice(1, 4).join('\n     ');
      console.error(`     ${lines}`);
    }
  }
}

async function testAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Erro: ${err.message}`);
    if (err.stack) {
      const lines = err.stack.split('\n').slice(1, 4).join('\n     ');
      console.error(`     ${lines}`);
    }
  }
}

/**
 * Cria banco de dados SQLite isolado em memória com schema completo para testes M5
 */
function createTestDb() {
  const db = new Database(':memory:');

  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS monthly_limits (
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      "limit" REAL NOT NULL,
      PRIMARY KEY (month, year)
    );

    CREATE TABLE IF NOT EXISTS boletos (
      id TEXT PRIMARY KEY,
      supplierName TEXT,
      order_id TEXT,
      due_date TEXT NOT NULL,
      value REAL NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      orderDate TEXT NOT NULL,
      distributor TEXT NOT NULL,
      seller TEXT,
      totalValue REAL NOT NULL,
      arrivalForecast TEXT,
      status TEXT NOT NULL,
      paymentMonth TEXT,
      invoiceNumber TEXT,
      paymentMethod TEXT NOT NULL,
      receiptDate TEXT,
      notes TEXT,
      installments TEXT,
      isFogueteAmarelo INTEGER DEFAULT 0,
      boletoPath TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_pedidos (
      id TEXT PRIMARY KEY,
      numero_pedido TEXT NOT NULL UNIQUE,
      cotacao_id TEXT,
      fornecedor_id TEXT,
      distribuidora TEXT NOT NULL,
      representante TEXT,
      telefone TEXT,
      itens_json TEXT NOT NULL,
      valor_total REAL NOT NULL,
      condicao_pagamento TEXT NOT NULL,
      previsao_entrega TEXT,
      mes_referencia INTEGER,
      ano_referencia INTEGER,
      boletos_json TEXT,
      texto_formatado TEXT,
      status TEXT DEFAULT 'Pendente_Aprovacao',
      integrado_contas_pagar INTEGER DEFAULT 0,
      order_legado_id TEXT,
      motivo_cancelamento TEXT,
      created_at TEXT NOT NULL,
      enviado_at TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_pedidos_itens (
      id TEXT PRIMARY KEY,
      pedido_id TEXT NOT NULL,
      codigo_digifarma INTEGER,
      ean TEXT,
      descricao TEXT NOT NULL,
      quantidade REAL NOT NULL,
      preco_unitario REAL NOT NULL,
      bonificacao TEXT,
      desconto_percentual REAL DEFAULT 0,
      subtotal REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (pedido_id) REFERENCES compras_pedidos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS compras_cotacoes (
      id TEXT PRIMARY KEY,
      numero_cotacao TEXT NOT NULL,
      titulo TEXT,
      status TEXT DEFAULT 'Aberta',
      itens_solicitados TEXT,
      criterios_score TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compras_cotacoes_respostas (
      id TEXT PRIMARY KEY,
      cotacao_id TEXT NOT NULL,
      fornecedor_id TEXT,
      distribuidora TEXT NOT NULL,
      representante TEXT,
      telefone TEXT,
      preco_liquido REAL,
      score_total REAL DEFAULT 0,
      vencedora INTEGER DEFAULT 0,
      condicao_pagamento TEXT,
      previsao_entrega TEXT,
      status TEXT DEFAULT 'Recebida',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compras_cotacoes_itens (
      id TEXT PRIMARY KEY,
      cotacao_id TEXT NOT NULL,
      produto_id INTEGER,
      descricao TEXT NOT NULL,
      ean TEXT,
      quantidade_sugerida REAL DEFAULT 1,
      unidade TEXT DEFAULT 'un',
      preco_referencia REAL DEFAULT 0,
      preco_cotado REAL DEFAULT 0,
      bonificacao TEXT,
      status TEXT DEFAULT 'Pendente',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compras_configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      descricao TEXT,
      updated_at TEXT
    );
  `);

  return db;
}

(async () => {

  // ──────────────────────────────────────────────────────────
  // GRUPO 1: Elaboração de Espelhos Formais de Pedidos de Compra (F13 / R5)
  // ──────────────────────────────────────────────────────────
  console.log('📋 GRUPO 1: Elaboração de Espelhos Formais de Pedidos de Compra (F13 / R5)');

  test('1.1 - Geração formal de espelho com itens, subtotais e valor final exato', () => {
    const pedido = {
      distribuidora: 'Santa Cruz',
      representante: 'Carlos Santa Cruz',
      condicaoPagamento: '28/35/42 dias',
      previsaoEntrega: '31/08/2026',
      itens: [
        { codigoDigifarma: 101, ean: '7891234567890', descricao: 'Dipirona 500mg 100 comp', quantidade: 10, precoUnitario: 15.50 },
        { codigoDigifarma: 102, ean: '7899876543210', descricao: 'Paracetamol 750mg 20 comp', quantidade: 20, precoUnitario: 8.00 }
      ]
    };

    const espelho = comprasPedidosService.gerarEspelhoPedidoCompra(pedido);
    assert.ok(espelho.numeroPedido.startsWith('PED_'), 'Número do pedido deve ter prefixo PED_');
    assert.strictEqual(espelho.distribuidora, 'Santa Cruz');
    assert.strictEqual(espelho.representante, 'Carlos Santa Cruz');
    assert.strictEqual(espelho.condicaoPagamento, '28/35/42 dias');
    assert.strictEqual(espelho.previsaoEntrega, '31/08/2026');
    assert.strictEqual(espelho.itens.length, 2);
    assert.strictEqual(espelho.itens[0].subtotal, 155.00);
    assert.strictEqual(espelho.itens[1].subtotal, 160.00);
    assert.strictEqual(espelho.valorTotal, 315.00);
  });

  test('1.2 - Exportação de texto formatado completo para envio WhatsApp', () => {
    const pedido = {
      distribuidora: 'Profarma',
      representante: 'Lucas',
      condicaoPagamento: '30 dias',
      previsaoEntrega: '01/09/2026',
      itens: [
        { codigoDigifarma: 50, ean: '7890001112223', descricao: 'Omeprazol 20mg 28 cap', quantidade: 5, precoUnitario: 10.00 }
      ]
    };

    const espelho = comprasPedidosService.gerarEspelhoPedidoCompra(pedido);
    assert.ok(espelho.textoFormatado.includes('📋 *ESPELHO DE PEDIDO DE COMPRA — BELAFARMA*'));
    assert.ok(espelho.textoFormatado.includes('*Distribuidora:* Profarma'));
    assert.ok(espelho.textoFormatado.includes('*Condição Pagto:* 30 dias'));
    assert.ok(espelho.textoFormatado.includes('[Cod: 50] Omeprazol 20mg 28 cap (EAN: 7890001112223)'));
    assert.ok(espelho.textoFormatado.includes('*VALOR TOTAL DO PEDIDO: R$ 50.00*'));
  });

  test('1.3 - Inclusão de bonificações aplicadas nos itens do espelho', () => {
    const pedido = {
      distribuidora: 'Panpharma',
      representante: 'Roberto',
      condicaoPagamento: '28/35/42 dias',
      previsaoEntrega: '24h',
      itens: [
        { codigoDigifarma: 300, ean: '789111', descricao: 'Amoxicilina 500mg', quantidade: 50, precoUnitario: 6.50, bonificacao: '10+2' }
      ]
    };

    const espelho = comprasPedidosService.gerarEspelhoPedidoCompra(pedido);
    assert.strictEqual(espelho.itens[0].bonificacao, '10+2');
    assert.ok(espelho.textoFormatado.includes('[Bonif: 10+2]'));
  });

  test('1.4 - Rejeição estrita de espelho para pedido sem itens ou lista vazia', () => {
    assert.throws(() => {
      comprasPedidosService.gerarEspelhoPedidoCompra({ distribuidora: 'Santa Cruz', itens: [] });
    }, /Pedido sem itens/);

    assert.throws(() => {
      comprasPedidosService.gerarEspelhoPedidoCompra({ distribuidora: 'Santa Cruz', itens: null });
    }, /Pedido sem itens/);
  });

  test('1.5 - Precisão decimal monetária (2 casas decimais) com preços fracionados', () => {
    const pedido = {
      distribuidora: 'GAM',
      representante: 'Juliana',
      condicaoPagamento: 'À vista',
      previsaoEntrega: 'Hoje',
      itens: [
        { codigoDigifarma: 2, ean: '222', descricao: 'Item Fracionado', quantidade: 3, precoUnitario: 3.33 }
      ]
    };

    const espelho = comprasPedidosService.gerarEspelhoPedidoCompra(pedido);
    assert.strictEqual(espelho.valorTotal, 9.99);
    assert.strictEqual(espelho.itens[0].subtotal, 9.99);
  });

  test('1.6 - Geração de espelho a partir de cotação vencedora registrada em SQLite', () => {
    const db = createTestDb();

    // Insere cotação e resposta vencedora
    const cotacaoId = 'COT_2026_001';
    db.prepare(`
      INSERT INTO compras_cotacoes (id, numero_cotacao, titulo, status, created_at)
      VALUES (?, 'COT_001', 'Cotação de Reposição', 'Encerrada', datetime('now'))
    `).run(cotacaoId);

    db.prepare(`
      INSERT INTO compras_cotacoes_respostas (id, cotacao_id, fornecedor_id, distribuidora, representante, condicao_pagamento, previsao_entrega, score_total, vencedora, created_at)
      VALUES ('RESP_1', ?, 'FORN_SC', 'Santa Cruz', 'Carlos', '28/35/42 dias', '24h', 95.5, 1, datetime('now'))
    `).run(cotacaoId);

    db.prepare(`
      INSERT INTO compras_cotacoes_itens (id, cotacao_id, produto_id, descricao, ean, quantidade_sugerida, preco_cotado, created_at)
      VALUES ('ITEM_1', ?, 101, 'Losartana 50mg', '789101010', 30, 4.50, datetime('now'))
    `).run(cotacaoId);

    const espelho = comprasPedidosService.gerarEspelhoPedido('Santa Cruz', cotacaoId, {}, db);
    assert.strictEqual(espelho.distribuidora, 'Santa Cruz');
    assert.strictEqual(espelho.representante, 'Carlos');
    assert.strictEqual(espelho.condicaoPagamento, '28/35/42 dias');
    assert.strictEqual(espelho.valorTotal, 135.00); // 30 * 4.50
    assert.strictEqual(espelho.itens[0].descricao, 'Losartana 50mg');
  });

  // ──────────────────────────────────────────────────────────
  // GRUPO 2: Controle Orçamentário Mensal e Travas (F14 / R5)
  // ──────────────────────────────────────────────────────────
  console.log('\n📋 GRUPO 2: Controle Orçamentário Mensal e Travas (F14 / R5)');

  test('2.1 - Aprovação de pedido dentro do teto mensal disponível', () => {
    const res = comprasPedidosService.validarOrcamento(30000, 20000, 5000);
    assert.strictEqual(res.permitido, true);
    assert.strictEqual(res.tetoMensal, 30000);
    assert.strictEqual(res.comprometido, 20000);
    assert.strictEqual(res.disponivelAntes, 10000);
    assert.strictEqual(res.saldoAposPedido, 5000);
  });

  test('2.2 - Bloqueio estrito de pedido que ultrapassa o teto orçamentário mensal', () => {
    const res = comprasPedidosService.validarOrcamento(20000, 18000, 3000);
    assert.strictEqual(res.permitido, false);
    assert.strictEqual(res.disponivelAntes, 2000);
    assert.strictEqual(res.saldoAposPedido, -1000);
  });

  test('2.3 - Pedido que atinge exatamente o teto (saldo restante R$ 0,00)', () => {
    const res = comprasPedidosService.validarOrcamento(10000, 7000, 3000);
    assert.strictEqual(res.permitido, true);
    assert.strictEqual(res.saldoAposPedido, 0);
  });

  test('2.4 - Orçamento zerado bloqueia imediatamente qualquer novo pedido', () => {
    const res = comprasPedidosService.validarOrcamento(0, 0, 100);
    assert.strictEqual(res.permitido, false);
    assert.strictEqual(res.saldoAposPedido, -100);
  });

  test('2.5 - Estouro mínimo de 1 centavo (R$ 0,01) é interceptado com precisão', () => {
    const res = comprasPedidosService.validarOrcamento(1000, 900, 100.01);
    assert.strictEqual(res.permitido, false);
    assert.strictEqual(res.saldoAposPedido, -0.01);
  });

  test('2.6 - Definição e consulta de limite na tabela monthly_limits do SQLite', () => {
    const db = createTestDb();
    const saveRes = comprasPedidosService.definirLimiteMensal(8, 2026, 45000.00, db);
    assert.strictEqual(saveRes.success, true);
    assert.strictEqual(saveRes.limite, 45000.00);

    const orcamento = comprasPedidosService.validarTetoOrcamentario(10000, 8, 2026, {}, db);
    assert.strictEqual(orcamento.limiteMensal, 45000.00);
    assert.strictEqual(orcamento.permitido, true);
    assert.strictEqual(orcamento.saldoAposPedido, 35000.00);
  });

  test('2.7 - Acúmulo progressivo de pedidos reduzindo o saldo disponível no mês', () => {
    const db = createTestDb();
    comprasPedidosService.definirLimiteMensal(8, 2026, 20000.00, db);

    // Cria 1º pedido de R$ 12.000
    comprasPedidosService.criarPedidoCompra({
      distribuidora: 'Santa Cruz',
      mesReferencia: 8,
      anoReferencia: 2026,
      itens: [{ codigoDigifarma: 1, descricao: 'Item 1', quantidade: 120, precoUnitario: 100.00 }]
    }, { travaOrcamentariaEstrita: true }, db);

    // 2º pedido de R$ 7.000 deve passar (total R$ 19.000 de R$ 20.000)
    const ped2 = comprasPedidosService.criarPedidoCompra({
      distribuidora: 'Profarma',
      mesReferencia: 8,
      anoReferencia: 2026,
      itens: [{ codigoDigifarma: 2, descricao: 'Item 2', quantidade: 70, precoUnitario: 100.00 }]
    }, { travaOrcamentariaEstrita: true }, db);
    assert.strictEqual(ped2.valorTotal, 7000.00);

    // 3º pedido de R$ 2.000 deve ser travado (estoura em R$ 1.000)
    let travaDisparada = false;
    try {
      comprasPedidosService.criarPedidoCompra({
        distribuidora: 'Panpharma',
        mesReferencia: 8,
        anoReferencia: 2026,
        itens: [{ codigoDigifarma: 3, descricao: 'Item 3', quantidade: 20, precoUnitario: 100.00 }]
      }, { travaOrcamentariaEstrita: true }, db);
    } catch (e) {
      travaDisparada = true;
      assert.strictEqual(e.code, 'ORCAMENTO_EXCEDIDO');
    }
    assert.strictEqual(travaDisparada, true, 'Deve travar quando estourar o limite mensal acumulado');
  });

  test('2.8 - Resumo e indicador de saúde do orçamento mensal', () => {
    const db = createTestDb();
    comprasPedidosService.definirLimiteMensal(8, 2026, 10000.00, db);

    // Inserir pedido consumindo 85% do teto
    comprasPedidosService.criarPedidoCompra({
      distribuidora: 'Santa Cruz',
      mesReferencia: 8,
      anoReferencia: 2026,
      itens: [{ codigoDigifarma: 1, descricao: 'Item 1', quantidade: 85, precoUnitario: 100.00 }]
    }, {}, db);

    const resumo = comprasPedidosService.obterResumoOrcamentoMensal(8, 2026, db);
    assert.strictEqual(resumo.limiteMensal, 10000.00);
    assert.strictEqual(resumo.comprometido, 8500.00);
    assert.strictEqual(resumo.disponivel, 1500.00);
    assert.strictEqual(resumo.percentualUtilizado, 85.00);
    assert.strictEqual(resumo.status, 'atencao');
  });

  // ──────────────────────────────────────────────────────────
  // GRUPO 3: Projeção de Vencimento de Boletos & Contas a Pagar
  // ──────────────────────────────────────────────────────────
  console.log('\n📋 GRUPO 3: Projeção de Boletos e Integração com Contas a Pagar (F14 / R5)');

  test('3.1 - Extração flexível de prazos a partir de strings comerciais', () => {
    assert.deepStrictEqual(comprasPedidosService.extrairPrazosDias('28/35/42 dias'), [28, 35, 42]);
    assert.deepStrictEqual(comprasPedidosService.extrairPrazosDias('30 dias'), [30]);
    assert.deepStrictEqual(comprasPedidosService.extrairPrazosDias('14/21/28/35'), [14, 21, 28, 35]);
    assert.deepStrictEqual(comprasPedidosService.extrairPrazosDias('À vista'), [0]);
    assert.deepStrictEqual(comprasPedidosService.extrairPrazosDias('a vista'), [0]);
    assert.deepStrictEqual(comprasPedidosService.extrairPrazosDias([28, 42]), [28, 42]);
  });

  test('3.2 - Projeção de boletos parcelados em 3x (28/35/42 dias) com cálculo de datas', () => {
    const dataBase = new Date('2026-08-01T12:00:00Z');
    const parcelas = comprasPedidosService.projetarVencimentosBoletos(3000.00, '28/35/42 dias', dataBase);

    assert.strictEqual(parcelas.length, 3);
    assert.strictEqual(parcelas[0].dias, 28);
    assert.strictEqual(parcelas[0].valor, 1000.00);
    assert.strictEqual(parcelas[0].vencimento, '2026-08-29');

    assert.strictEqual(parcelas[1].dias, 35);
    assert.strictEqual(parcelas[1].valor, 1000.00);
    assert.strictEqual(parcelas[1].vencimento, '2026-09-05');

    assert.strictEqual(parcelas[2].dias, 42);
    assert.strictEqual(parcelas[2].valor, 1000.00);
    assert.strictEqual(parcelas[2].vencimento, '2026-09-12');
  });

  test('3.3 - Divisão de parcelas com resíduo fracionário (R$ 100,00 em 3 parcelas de 33.33 + 33.34)', () => {
    const parcelas = comprasPedidosService.projetarVencimentosBoletos(100.00, [28, 35, 42]);
    assert.strictEqual(parcelas.length, 3);
    assert.strictEqual(parcelas[0].valor, 33.33);
    assert.strictEqual(parcelas[1].valor, 33.33);
    assert.strictEqual(parcelas[2].valor, 33.34);
    
    // Soma total das parcelas deve bater exatamente 100.00
    const soma = Number(parcelas.reduce((acc, p) => acc + p.valor, 0).toFixed(2));
    assert.strictEqual(soma, 100.00);
  });

  test('3.4 - Vinculação real de boletos no Contas a Pagar (tabela boletos do SQLite)', () => {
    const db = createTestDb();

    // Cria pedido
    const pedido = comprasPedidosService.criarPedidoCompra({
      distribuidora: 'Distribuidora Santa Cruz',
      itens: [{ codigoDigifarma: 1, descricao: 'Item', quantidade: 10, precoUnitario: 300.00 }]
    }, {}, db);

    // Vincula boletos
    const vinculo = comprasPedidosService.vincularBoletosContasAPagar(pedido.id, '28/35/42 dias', {}, db);
    assert.strictEqual(vinculo.totalBoletos, 3);
    assert.strictEqual(vinculo.valorTotal, 3000.00);
    assert.strictEqual(vinculo.integrado, true);

    // Verifica persistência na tabela boletos
    const boletosDb = db.prepare('SELECT * FROM boletos WHERE order_id = ?').all(pedido.id);
    assert.strictEqual(boletosDb.length, 3);
    assert.strictEqual(boletosDb[0].supplierName, 'Distribuidora Santa Cruz');
    assert.strictEqual(boletosDb[0].status, 'Pendente');
    assert.strictEqual(boletosDb[0].value, 1000.00);

    // Verifica flag no pedido
    const pedDb = comprasPedidosService.obterPedidoPorId(pedido.id, db);
    assert.strictEqual(pedDb.integradoContasPagar, 1);
    assert.strictEqual(pedDb.boletos.length, 3);
  });

  // ──────────────────────────────────────────────────────────
  // GRUPO 4: CRUD Completo e Workflow Operacional de Pedidos
  // ──────────────────────────────────────────────────────────
  console.log('\n📋 GRUPO 4: CRUD Completo e Workflow Operacional de Pedidos');

  test('4.1 - Criação e persistência atômica de pedido e itens individuais', () => {
    const db = createTestDb();

    const pedidoCriado = comprasPedidosService.criarPedidoCompra({
      distribuidora: 'Profarma Distribuidora',
      representante: 'Marcos Silva',
      condicaoPagamento: '28/35/42 dias',
      previsaoEntrega: '24h',
      mesReferencia: 8,
      anoReferencia: 2026,
      itens: [
        { codigoDigifarma: 501, ean: '789501', descricao: 'Dipirona Gotas', quantidade: 50, precoUnitario: 4.20 },
        { codigoDigifarma: 502, ean: '789502', descricao: 'Paracetamol Gotas', quantidade: 30, precoUnitario: 3.50 }
      ]
    }, { integrarBoletos: true }, db);

    assert.ok(pedidoCriado.id);
    assert.strictEqual(pedidoCriado.valorTotal, 315.00); // (50*4.2) + (30*3.5) = 210 + 105 = 315

    // Consulta do pedido por ID
    const pedidoRecuperado = comprasPedidosService.obterPedidoPorId(pedidoCriado.id, db);
    assert.strictEqual(pedidoRecuperado.distribuidora, 'Profarma Distribuidora');
    assert.strictEqual(pedidoRecuperado.representante, 'Marcos Silva');
    assert.strictEqual(pedidoRecuperado.itens.length, 2);
    assert.strictEqual(pedidoRecuperado.itens[0].descricao, 'Dipirona Gotas');
    assert.strictEqual(pedidoRecuperado.boletos.length, 3);
  });

  test('4.2 - Listagem de pedidos com filtros por distribuidora e mês/ano', () => {
    const db = createTestDb();

    comprasPedidosService.criarPedidoCompra({
      distribuidora: 'Santa Cruz',
      mesReferencia: 8,
      anoReferencia: 2026,
      itens: [{ codigoDigifarma: 1, descricao: 'Item', quantidade: 1, precoUnitario: 100 }]
    }, {}, db);

    comprasPedidosService.criarPedidoCompra({
      distribuidora: 'Profarma',
      mesReferencia: 8,
      anoReferencia: 2026,
      itens: [{ codigoDigifarma: 2, descricao: 'Item', quantidade: 1, precoUnitario: 200 }]
    }, {}, db);

    comprasPedidosService.criarPedidoCompra({
      distribuidora: 'Santa Cruz',
      mesReferencia: 9,
      anoReferencia: 2026,
      itens: [{ codigoDigifarma: 3, descricao: 'Item', quantidade: 1, precoUnitario: 300 }]
    }, {}, db);

    // Todos
    assert.strictEqual(comprasPedidosService.listarPedidos({}, db).length, 3);

    // Filtro distribuidora
    assert.strictEqual(comprasPedidosService.listarPedidos({ distribuidora: 'Santa Cruz' }, db).length, 2);

    // Filtro mês
    assert.strictEqual(comprasPedidosService.listarPedidos({ mes: 8 }, db).length, 2);
    assert.strictEqual(comprasPedidosService.listarPedidos({ mes: 9 }, db).length, 1);
  });

  test('4.3 - Atualização de status do pedido e registro de data de envio', () => {
    const db = createTestDb();

    const pedido = comprasPedidosService.criarPedidoCompra({
      distribuidora: 'GAM',
      itens: [{ codigoDigifarma: 1, descricao: 'Item', quantidade: 1, precoUnitario: 50 }]
    }, {}, db);

    assert.strictEqual(pedido.status, 'Pendente_Aprovacao');

    const aprovado = comprasPedidosService.atualizarStatusPedido(pedido.id, 'Aprovado', {}, db);
    assert.strictEqual(aprovado.status, 'Aprovado');

    const enviado = comprasPedidosService.atualizarStatusPedido(pedido.id, 'Enviado', {}, db);
    assert.strictEqual(enviado.status, 'Enviado');
    assert.ok(enviado.enviadoAt, 'Deve preencher enviadoAt');
  });

  test('4.4 - Cancelamento de pedido com estorno automático de boletos pendentes', () => {
    const db = createTestDb();

    const pedido = comprasPedidosService.criarPedidoCompra({
      distribuidora: 'Medley',
      itens: [{ codigoDigifarma: 1, descricao: 'Item', quantidade: 10, precoUnitario: 100 }]
    }, { integrarBoletos: true }, db);

    // Cancela pedido
    const cancelado = comprasPedidosService.cancelarPedido(pedido.id, 'Duplicidade de pedido', db);
    assert.strictEqual(cancelado.status, 'Cancelado');

    // Boletos vinculados devem ser atualizados para Cancelado
    const boletos = db.prepare('SELECT * FROM boletos WHERE order_id = ?').all(pedido.id);
    assert.ok(boletos.length > 0);
    boletos.forEach(b => {
      assert.strictEqual(b.status, 'Cancelado');
    });
  });

  test('4.5 - Exportação e consulta de espelho em texto formatado', () => {
    const db = createTestDb();

    const pedido = comprasPedidosService.criarPedidoCompra({
      distribuidora: 'EMS Pharma',
      representante: 'Renata',
      condicaoPagamento: '28d',
      previsaoEntrega: 'Hoje',
      itens: [{ codigoDigifarma: 99, ean: '78999', descricao: 'Dipirona 1g', quantidade: 10, precoUnitario: 5.00 }]
    }, {}, db);

    const texto = comprasPedidosService.exportarEspelhoTexto(pedido.id, db);
    assert.ok(texto.includes('ESPELHO DE PEDIDO DE COMPRA'));
    assert.ok(texto.includes('EMS Pharma'));
    assert.ok(texto.includes('VALOR TOTAL DO PEDIDO: R$ 50.00'));
  });

  // ──────────────────────────────────────────────────────────
  // GRUPO 5: Casos de Borda e Corner Cases (Tier 2 Compliant)
  // ──────────────────────────────────────────────────────────
  console.log('\n📋 GRUPO 5: Casos de Borda e Corner Cases (Tier 2 Compliant)');

  test('5.1 - Pedido de 100 itens com cálculo exato de somatório monetário', () => {
    const itens = Array.from({ length: 100 }, (_, i) => ({
      codigoDigifarma: i + 1,
      ean: `EAN_${i}`,
      descricao: `Medicamento #${i}`,
      quantidade: 10,
      precoUnitario: 5.00
    }));

    const espelho = comprasPedidosService.gerarEspelhoPedidoCompra({
      distribuidora: 'Santa Cruz',
      representante: 'Carlos',
      itens
    });

    assert.strictEqual(espelho.itens.length, 100);
    assert.strictEqual(espelho.valorTotal, 5000.00);
  });

  test('5.2 - Preço unitário altamente fracionado com arredondamento contábil seguro', () => {
    const espelho = comprasPedidosService.gerarEspelhoPedidoCompra({
      distribuidora: 'Dist',
      itens: [{ codigoDigifarma: 1, descricao: 'P', quantidade: 7, precoUnitario: 1.42857 }]
    });
    assert.strictEqual(espelho.valorTotal, 10.00); // 7 * 1.42857 = 9.99999 -> 10.00
  });

  test('5.3 - Previsão de entrega customizada ("Faturamento Imediato")', () => {
    const espelho = comprasPedidosService.gerarEspelhoPedidoCompra({
      distribuidora: 'Dist',
      previsaoEntrega: 'Faturamento Imediato',
      itens: [{ codigoDigifarma: 1, descricao: 'P', quantidade: 1, precoUnitario: 10 }]
    });
    assert.strictEqual(espelho.previsaoEntrega, 'Faturamento Imediato');
  });

  test('5.4 - Código Digifarma de grande magnitude (>1.000.000)', () => {
    const espelho = comprasPedidosService.gerarEspelhoPedidoCompra({
      distribuidora: 'Dist',
      itens: [{ codigoDigifarma: 9999999, descricao: 'P', quantidade: 1, precoUnitario: 10 }]
    });
    assert.ok(espelho.textoFormatado.includes('[Cod: 9999999]'));
  });

  test('5.5 - Caracteres especiais na razão social da distribuidora (&, /, S/A)', () => {
    const espelho = comprasPedidosService.gerarEspelhoPedidoCompra({
      distribuidora: 'Distribuidora & Farmacêutica ABC/XYZ S/A',
      itens: [{ codigoDigifarma: 1, descricao: 'P', quantidade: 1, precoUnitario: 10 }]
    });
    assert.ok(espelho.textoFormatado.includes('Distribuidora & Farmacêutica ABC/XYZ S/A'));
  });

  test('5.6 - Parcelamento em 4 boletos (28/35/42/49 dias)', () => {
    const res = comprasPedidosService.validarOrcamento(10000, 0, 4000, [28, 35, 42, 49]);
    assert.strictEqual(res.boletosProjetados.length, 4);
    assert.strictEqual(res.boletosProjetados[0].valor, 1000.00);
    assert.strictEqual(res.boletosProjetados[3].valor, 1000.00);
  });

  test('5.7 - Limite mensal de compras de alta magnitude (R$ 500.000,00)', () => {
    const res = comprasPedidosService.validarOrcamento(500000, 150000, 50000);
    assert.strictEqual(res.permitido, true);
    assert.strictEqual(res.saldoAposPedido, 300000.00);
  });

  test('5.8 - Valor do novo pedido zerado (R$ 0,00)', () => {
    const res = comprasPedidosService.validarOrcamento(10000, 5000, 0);
    assert.strictEqual(res.permitido, true);
    assert.strictEqual(res.saldoAposPedido, 5000.00);
  });

  test('5.9 - Tentativa de buscar pedido inexistente dispara erro descritivo', () => {
    const db = createTestDb();
    assert.throws(() => {
      comprasPedidosService.obterPedidoPorId('PED_INEXISTENTE_999', db);
    }, /Pedido não encontrado/);
  });

  // ──────────────────────────────────────────────────────────
  // RESUMO DOS RESULTADOS
  // ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📊 RESUMO DA SUÍTE DE TESTES M5:');
  console.log(`  Total de Testes Executados: ${totalTests}`);
  console.log(`  Passaram com Sucesso:       ${passedTests}`);
  console.log(`  Falhas:                     ${totalTests - passedTests}`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  if (passedTests === totalTests) {
    console.log('🎉 TODOS OS TESTES DO WORKER M5 PASSARAM COM 100% DE SUCESSO!\n');
    process.exit(0);
  } else {
    console.error('❌ HOUVE FALHAS NOS TESTES DO WORKER M5. VERIFIQUE OS LOGS ACIMA.\n');
    process.exit(1);
  }

})();
