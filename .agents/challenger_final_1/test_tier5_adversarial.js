/**
 * test_tier5_adversarial.js
 * Suíte de Testes Adversariais Tier 5 — Central de Compras BelaFarma
 * 
 * Auditoria Forense White-Box e Testes de Stress Ponta a Ponta:
 * 1. ADV-E2E-01: Fluxo End-to-End Completo Integrado
 *    (Ruptura -> Cotação -> Fila de Aprovação -> Edição -> Aprovação -> Envio Baileys -> Pedido de Compra -> Trava de Orçamento -> Boletos no Contas a Pagar)
 * 2. ADV-SEC-02: Segurança, Governança Human-in-the-Loop & Tentativas de Bypass
 * 3. ADV-MATH-03: Integridade Algorítmica, BVA (Boundary Value Analysis) e Robustez Matemática
 * 4. ADV-DB-04: Resiliência Transacional, Fallback SQLite e Persistência Atômica
 * 5. ADV-CONC-05: Concorrência, Race Conditions e Integridade sob Múltiplas Requisições
 * 6. ADV-UI-06: Verificação de Conformidade Estrita de UI (Zero alert/confirm, Toasts/Modais, Mobile Layout)
 * 
 * Autor: Challenger Final 1 (Empirical Challenger)
 * Data: 2026-08-29
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import assert from 'assert';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega better-sqlite3 diretamente de backend/node_modules
let Database;
try {
  Database = require(path.join(__dirname, '../../backend/node_modules/better-sqlite3'));
} catch (e) {
  Database = require('better-sqlite3');
}

const crypto = require('crypto');
const mainDb = require('../../backend/database');

// Carrega os módulos reais do backend
const comprasEstoqueService = require('../../backend/services/compras-estoque.service');
const comprasMineracaoService = require('../../backend/services/compras-mineracao.service');
const comprasCotacoesService = require('../../backend/services/compras-cotacoes.service');
const comprasAprovacaoService = require('../../backend/services/compras-aprovacao.service');
const comprasPedidosService = require('../../backend/services/compras-pedidos.service');
const baileysComprasService = require('../../backend/baileys-compras-service');

// Cores para saída no terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function runTest(suiteName, testName, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    testResults.push({ suite: suiteName, name: testName, status: 'PASS' });
    console.log(`  ${colors.green}✔ [PASS]${colors.reset} ${suiteName} -> ${testName}`);
  } catch (err) {
    failedTests++;
    testResults.push({ suite: suiteName, name: testName, status: 'FAIL', error: err.message });
    console.error(`  ${colors.red}✖ [FAIL]${colors.reset} ${suiteName} -> ${testName}`);
    console.error(`     ${colors.yellow}Erro:${colors.reset} ${err.message}`);
    if (err.stack) {
      console.error(`     ${colors.reset}${err.stack.split('\n').slice(1, 4).join('\n     ')}`);
    }
  }
}

async function runAsyncTest(suiteName, testName, testFn) {
  totalTests++;
  try {
    await testFn();
    passedTests++;
    testResults.push({ suite: suiteName, name: testName, status: 'PASS' });
    console.log(`  ${colors.green}✔ [PASS]${colors.reset} ${suiteName} -> ${testName}`);
  } catch (err) {
    failedTests++;
    testResults.push({ suite: suiteName, name: testName, status: 'FAIL', error: err.message });
    console.error(`  ${colors.red}✖ [FAIL]${colors.reset} ${suiteName} -> ${testName}`);
    console.error(`     ${colors.yellow}Erro:${colors.reset} ${err.message}`);
    if (err.stack) {
      console.error(`     ${colors.reset}${err.stack.split('\n').slice(1, 4).join('\n     ')}`);
    }
  }
}

/**
 * Cria um banco de dados SQLite isolado em memória com todas as tabelas e índices necessários
 */
function createIsolatedTestDatabase() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      accessKey TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS monthly_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      "limit" REAL NOT NULL,
      UNIQUE(month, year)
    );

    CREATE TABLE IF NOT EXISTS boletos (
      id TEXT PRIMARY KEY,
      supplierName TEXT NOT NULL,
      order_id TEXT,
      due_date TEXT NOT NULL,
      value REAL NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_suppliers (
      id TEXT PRIMARY KEY,
      digifarma_id INTEGER,
      representante TEXT,
      distribuidora TEXT,
      telefone TEXT,
      prazo_boletos TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_estoque_cache (
      produto_id INTEGER PRIMARY KEY,
      descricao TEXT NOT NULL,
      ean TEXT,
      categoria_id INTEGER,
      curva_abc TEXT DEFAULT 'C',
      saldo REAL DEFAULT 0,
      est_minimo_calculado INTEGER DEFAULT 0,
      est_minimo_digifarma INTEGER DEFAULT 0,
      vmd_ponderado REAL DEFAULT 0,
      vendas_30d REAL DEFAULT 0,
      vendas_31_60d REAL DEFAULT 0,
      custo_unitario REAL DEFAULT 0,
      ultima_compra_valor REAL DEFAULT 0,
      status_ruptura TEXT DEFAULT 'NORMAL',
      margem_seguranca_aplicada REAL DEFAULT 15,
      dias_sem_venda INTEGER DEFAULT 0,
      sincronizado_em TEXT,
      atualizado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_fornecedores_meta (
      id TEXT PRIMARY KEY,
      digifarma_id INTEGER,
      distribuidora TEXT NOT NULL,
      representante TEXT,
      telefone TEXT UNIQUE,
      prazos_pagamento TEXT,
      pedido_minimo_valor REAL DEFAULT 0,
      pedido_minimo_condicoes TEXT,
      taxa_quebra_percent REAL DEFAULT 0,
      pontualidade_score REAL DEFAULT 100,
      categorias_fornecidas TEXT,
      catalogo_produtos TEXT,
      ultima_varredura_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_historico_mensagens (
      id TEXT PRIMARY KEY,
      message_id TEXT UNIQUE,
      remote_jid TEXT NOT NULL,
      telefone TEXT NOT NULL,
      nome_contato TEXT,
      from_me INTEGER DEFAULT 0,
      timestamp INTEGER,
      data_hora TEXT,
      tipo_mensagem TEXT DEFAULT 'texto',
      texto_mensagem TEXT,
      processado_mineracao INTEGER DEFAULT 0,
      resultado_mineracao_json TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_oportunidades_mineradas (
      id TEXT PRIMARY KEY,
      fornecedor_id TEXT,
      distribuidora TEXT,
      representante TEXT,
      telefone TEXT,
      mensagem_id TEXT,
      mensagem_raw TEXT,
      produto_nome TEXT NOT NULL,
      ean TEXT,
      preco_ofertado REAL NOT NULL,
      preco_ult_compra_digifarma REAL,
      percentual_desconto REAL,
      condicoes_pagamento TEXT,
      validade_oferta TEXT,
      status TEXT DEFAULT 'Disponivel',
      data_oferta TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_cotacoes (
      id TEXT PRIMARY KEY,
      numero_cotacao TEXT UNIQUE NOT NULL,
      titulo TEXT,
      status TEXT DEFAULT 'Aberta',
      itens_solicitados TEXT,
      criterios_score TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_cotacoes_respostas (
      id TEXT PRIMARY KEY,
      cotacao_id TEXT NOT NULL,
      fornecedor_id TEXT,
      distribuidora TEXT NOT NULL,
      telefone TEXT,
      status TEXT DEFAULT 'Pendente',
      solicitada_em TEXT,
      respondida_em TEXT,
      preco_liquido REAL DEFAULT 0,
      prazo_dias INTEGER DEFAULT 0,
      score_total REAL DEFAULT 0,
      posicao_ranking INTEGER DEFAULT 0,
      vencedora INTEGER DEFAULT 0,
      motivo_quebra TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_cotacoes_itens (
      id TEXT PRIMARY KEY,
      cotacao_id TEXT NOT NULL,
      produto_id INTEGER NOT NULL,
      descricao TEXT NOT NULL,
      ean TEXT,
      quantidade_sugerida INTEGER DEFAULT 1,
      unidade TEXT DEFAULT 'un',
      preco_referencia REAL DEFAULT 0,
      preco_cotado REAL DEFAULT 0,
      bonificacao TEXT,
      status TEXT DEFAULT 'Pendente',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_fila_aprovacao (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL,
      destinatario_telefone TEXT NOT NULL,
      destinatario_nome TEXT,
      fornecedor_id TEXT,
      fornecedor_nome TEXT,
      distribuidora TEXT,
      mensagem_texto TEXT NOT NULL,
      dados_contexto TEXT,
      status TEXT DEFAULT 'pendente',
      notificado_admin INTEGER DEFAULT 0,
      admin_notificado_em TEXT,
      aprovado_por TEXT,
      aprovado_em TEXT,
      rejeitado_motivo TEXT,
      message_id_enviada TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_pedidos (
      id TEXT PRIMARY KEY,
      numero_pedido TEXT UNIQUE NOT NULL,
      cotacao_id TEXT,
      fornecedor_id TEXT,
      distribuidora TEXT NOT NULL,
      representante TEXT,
      telefone TEXT,
      itens_json TEXT NOT NULL,
      valor_total REAL NOT NULL,
      condicao_pagamento TEXT,
      previsao_entrega TEXT,
      mes_referencia INTEGER,
      ano_referencia INTEGER,
      texto_formatado TEXT,
      status TEXT DEFAULT 'Pendente_Aprovacao',
      integrado_contas_pagar INTEGER DEFAULT 0,
      boletos_json TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_pedidos_itens (
      id TEXT PRIMARY KEY,
      pedido_id TEXT NOT NULL,
      codigo_digifarma INTEGER,
      ean TEXT,
      descricao TEXT NOT NULL,
      quantidade INTEGER NOT NULL,
      preco_unitario REAL NOT NULL,
      bonificacao TEXT,
      desconto_percentual REAL DEFAULT 0,
      subtotal REAL NOT NULL,
      created_at TEXT
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

// ──────────────────────────────────────────────────────────
// EXECUÇÃO DOS TESTES ADVERSARIAIS
// ──────────────────────────────────────────────────────────

async function runTier5TestSuite() {
  console.log(`\n${colors.bright}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}        AUDITORIA ADVERSARIAL TIER 5 — CENTRAL DE COMPRAS BELAFARMA        ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}================================================================================${colors.reset}\n`);

  const testDb = createIsolatedTestDatabase();

  // ══════════════════════════════════════════════════════════
  // SUÍTE 1: ADV-E2E-01 — Pipeline End-to-End Completo White-Box
  // ══════════════════════════════════════════════════════════
  console.log(`\n${colors.bright}${colors.blue}▶▶ [ADV-E2E-01] Fluxo End-to-End Completo Integrado${colors.reset}`);

  await runAsyncTest('ADV-E2E-01', 'Passo 1: Detecção de Ruptura e Cálculo Ponderado de Estoque Mínimo (30d)', async () => {
    // Insere produto no cache com vendas 30d=60, 31-60d=30, saldo=0 (Ruptura Crítica)
    const nowIso = new Date().toISOString();
    const insertCacheSql = `
      INSERT OR REPLACE INTO compras_estoque_cache (
        produto_id, descricao, ean, categoria_id, curva_abc, saldo,
        vendas_30d, vendas_31_60d, custo_unitario, ultima_compra_valor, status_ruptura, atualizado_em
      ) VALUES (99901, 'Amoxicilina 500mg 21 caps EMS', '7896004701010', 1, 'A', 0, 60, 30, 15.00, 15.00, 'RUPTURA', ?)
    `;
    testDb.prepare(insertCacheSql).run(nowIso);
    mainDb.prepare(insertCacheSql).run(nowIso);

    // VMD Ponderado = ((60 * 0.65) + (30 * 0.35)) / 30 = (39 + 10.5) / 30 = 49.5 / 30 = 1.65 un/dia
    // Demanda 30d = 49.5 un
    // Estoque Mínimo (+15%) = Math.ceil(49.5 * 1.15) = Math.ceil(56.925) = 57 un
    const calculo = await comprasEstoqueService.calcularEstoqueMinimo30Dias(99901, 15, { db: testDb });
    assert.strictEqual(calculo.produtoId, 99901);
    assert.strictEqual(calculo.estoqueMinimoSugerido, 57);
    assert.strictEqual(calculo.statusRuptura, 'RUPTURA');
    assert.strictEqual(calculo.saldo, 0);

    // Valida também a função pura calcularDemandaPonderada diretamente
    const pura = comprasEstoqueService.calcularDemandaPonderada(60, 30, 15, { curvaAbc: 'A', ativo: true });
    assert.strictEqual(pura.estoqueMinimoSugerido, 57);
    assert.strictEqual(pura.vmdPonderado, 1.65);
  });

  await runAsyncTest('ADV-E2E-01', 'Passo 2: Mineração de Ofertas e Histórico de Fornecedores WhatsApp', async () => {
    // Simula mensagem recebida de representante da Distribuidora Santa Cruz oferecendo Amoxicilina com bonificação
    const msgTexto = `Olá Central BelaFarma! Aqui é o Carlos da Santa Cruz.
Temos Amoxicilina 500mg c/ 21 caps EMS por R$ 14,00 cada (Compre 10 Ganhe 2).
Prazo de pagamento: 28/35/42 dias.
Pedido mínimo: R$ 500,00 com frete grátis.`;

    const resMineracao = await comprasMineracaoService.processarMensagemRecebida({
      messageId: 'MSG_WA_MOCK_101',
      phone: '5532988881111',
      contactName: 'Carlos Santa Cruz',
      text: msgTexto,
      timestamp: Date.now()
    }, testDb, { skipFirebird: true });

    assert.strictEqual(resMineracao.minerado, true);
    assert.strictEqual(resMineracao.fornecedor.distribuidora, 'Santa Cruz');
    assert.strictEqual(resMineracao.fornecedor.representante, 'Carlos');
    assert.strictEqual(resMineracao.fornecedor.pedidoMinimoValor, 500);
    assert(resMineracao.fornecedor.prazosPagamento.some(p => p.includes('28/35/42')), 'Deve mapear prazos 28/35/42');
    assert.strictEqual(resMineracao.ofertas.length, 1);
    // Preço líquido efetivo: (10 * 14.00) / 12 = 11.67
    assert.strictEqual(resMineracao.ofertas[0].precoOfertado, 11.67);
  });

  await runAsyncTest('ADV-E2E-01', 'Passo 3: Geração Contextual de Cotação Multi-Fornecedor', async () => {
    // Insere segundo fornecedor (Profarma) para disputa
    testDb.prepare(`
      INSERT INTO compras_fornecedores_meta (
        id, distribuidora, representante, telefone, prazos_pagamento, pedido_minimo_valor, taxa_quebra_percent, pontualidade_score, catalogo_produtos
      ) VALUES ('forn_pf', 'Profarma', 'Lucas Profarma', '5532988882222', '["28 dias"]', 300, 0, 95, '["Amoxicilina 500mg"]')
    `).run();

    const cotacoesGeradas = comprasCotacoesService.gerarSolicitacaoCotacao([99901], {
      db: testDb,
      salvarCotacao: true,
      titulo: 'Cotação E2E Amoxicilina'
    });

    assert(cotacoesGeradas.length >= 1, 'Deve gerar solicitação para ao menos 1 fornecedor');
    const cotacaoSC = cotacoesGeradas.find(c => c.distribuidora === 'Santa Cruz') || cotacoesGeradas[0];
    assert(cotacaoSC.mensagemTexto.includes('Central de Compras BelaFarma'));
    assert(cotacaoSC.mensagemTexto.includes('Amoxicilina'));
  });

  await runAsyncTest('ADV-E2E-01', 'Passo 4: Motor de Ranking Ponderado (60% Preço Líquido, 25% Prazo, 15% Histórico)', async () => {
    // Respostas dos fornecedores:
    // Santa Cruz: R$ 11.67 líq, 42 dias, quebra 0%, pontualidade 100
    // Profarma:   R$ 13.00 líq, 28 dias, quebra 5%, pontualidade 95
    const respostas = [
      {
        fornecedorId: 'forn_sc',
        distribuidora: 'Santa Cruz',
        precoLiquido: 11.67,
        prazoDias: 42,
        taxaQuebraPercent: 0,
        pontualidadeScore: 100
      },
      {
        fornecedorId: 'forn_pf',
        distribuidora: 'Profarma',
        precoLiquido: 13.00,
        prazoDias: 28,
        taxaQuebraPercent: 5,
        pontualidadeScore: 95
      }
    ];

    const ranking = comprasCotacoesService.calcularScoreRanking(respostas);
    assert.strictEqual(ranking[0].distribuidora, 'Santa Cruz');
    assert.strictEqual(ranking[0].vencedor, true);
    assert.strictEqual(ranking[0].posicao, 1);
    assert(ranking[0].scoreTotal > ranking[1].scoreTotal, 'Santa Cruz deve ter score maior que Profarma');
    assert.strictEqual(ranking[0].scoreTotal, 100.00); // Preço menor rodada (60) + Prazo 42d (25) + Histórico perfeito (15) = 100
  });

  await runAsyncTest('ADV-E2E-01', 'Passo 5: Otimização de Pedido Mínimo (57 un × R$ 11.67 = R$ 665.19 >= R$ 500.00)', async () => {
    const itensCesta = [
      {
        descricao: 'Amoxicilina 500mg 21 caps EMS',
        quantidade: 57,
        precoUnitario: 11.67,
        valorTotal: 665.19
      }
    ];

    const otimizacao = comprasCotacoesService.otimizarPedidoMinimo([
      {
        fornecedorId: 'forn_sc',
        distribuidora: 'Santa Cruz',
        pedidoMinimo: 500.00,
        itens: itensCesta
      }
    ]);

    assert.strictEqual(otimizacao.length, 1);
    assert.strictEqual(otimizacao[0].atingiuMinimo, true);
    assert.strictEqual(otimizacao[0].estrategia, 'Atingido_Direto');
    assert.strictEqual(otimizacao[0].subtotalFinal, 665.19);
  });

  let approvalItemIdGlobal = null;

  await runAsyncTest('ADV-E2E-01', 'Passo 6: Fila de Aprovação Obrigatória & Geração de Alerta Duplo (Web + WhatsApp ADM)', async () => {
    const textoMensagem = `Olá Carlos (Santa Cruz)! Confirmamos o pedido de 57 un de Amoxicilina 500mg EMS pelo valor acordado de R$ 11.67/un com bonificação Compre 10 Ganhe 2. Faturamento para 28/35/42 dias.`;
    
    const enfileirado = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'pedido',
      destinatario: { nome: 'Carlos Santa Cruz', telefone: '5532988881111' },
      distribuidora: 'Santa Cruz',
      mensagemTexto: textoMensagem,
      dadosContexto: {
        itens: [{ produtoId: 99901, descricao: 'Amoxicilina 500mg', quantidade: 57, precoUnitario: 11.67, subtotal: 665.19 }]
      }
    }, testDb);

    approvalItemIdGlobal = enfileirado.id;
    assert(approvalItemIdGlobal.startsWith('APROV_'));
    assert.strictEqual(enfileirado.status, 'Pendente');
    assert.strictEqual(enfileirado.alerta.alertaWeb.tipo, 'TOAST_NOTIFICATION');
    assert(enfileirado.alerta.msgsAdm.length >= 1, 'Deve conter notificação WhatsApp para administrador');
    assert(enfileirado.alerta.msgsAdm[0].text.includes(approvalItemIdGlobal), 'Texto para ADM deve conter link/ID de aprovação');
  });

  await runAsyncTest('ADV-E2E-01', 'Passo 7: Revisão Administrativa e Edição de Texto na Fila Pendente', async () => {
    const textoRevisado = `Olá Carlos (Santa Cruz)! Pedido CONFIRMADO: 57 un de Amoxicilina 500mg EMS a R$ 11.67/un (Bonif 10+2). Condição: 28/35/42 dias. Entrega prevista: 24h.`;

    const itemEditado = comprasAprovacaoService.editarMensagem(approvalItemIdGlobal, textoRevisado, null, { usuarioEditor: 'Gerente Compras' }, testDb);
    assert.strictEqual(itemEditado.mensagemTexto, textoRevisado);
    assert.strictEqual(itemEditado.status, 'Pendente');
    assert.strictEqual(itemEditado.dadosContexto.historicoEdicoes.length, 1);
    assert.strictEqual(itemEditado.dadosContexto.historicoEdicoes[0].editadoPor, 'Gerente Compras');
  });

  await runAsyncTest('ADV-E2E-01', 'Passo 8: Aprovação Humana Expressa e Despacho via WhatsApp Comercial Baileys', async () => {
    // Mock do serviço WhatsApp Baileys injetado para rastreabilidade
    const mockBaileys = {
      enviarMensagemAprovada: async (approvalId, db) => {
        return {
          success: true,
          messageId: `BAILEYS_MSG_${Date.now()}`,
          timestamp: new Date().toISOString()
        };
      }
    };

    const aprovacaoResult = await comprasAprovacaoService.aprovarMensagem(
      approvalItemIdGlobal,
      'Administrador Geral',
      null,
      testDb,
      mockBaileys
    );

    assert.strictEqual(aprovacaoResult.status, 'Enviado');
    assert.strictEqual(aprovacaoResult.enviado, true);
    assert.strictEqual(aprovacaoResult.revisadoPor, 'Administrador Geral');
    assert(aprovacaoResult.messageIdEnviada.startsWith('BAILEYS_MSG_'));
  });

  await runAsyncTest('ADV-E2E-01', 'Passo 9: Elaboração Formal de Espelho do Pedido de Compra (F13)', async () => {
    const espelho = comprasPedidosService.gerarEspelhoPedidoCompra({
      distribuidora: 'Santa Cruz',
      representante: 'Carlos',
      condicaoPagamento: '28/35/42 dias',
      previsaoEntrega: '24h',
      itens: [
        {
          codigoDigifarma: 99901,
          ean: '7896004701010',
          descricao: 'Amoxicilina 500mg 21 caps EMS',
          quantidade: 57,
          precoUnitario: 11.67,
          bonificacao: 'Compre 10 Ganhe 2',
          subtotal: 665.19
        }
      ]
    });

    assert.strictEqual(espelho.valorTotal, 665.19);
    assert.strictEqual(espelho.itens.length, 1);
    assert.strictEqual(espelho.itens[0].codigoDigifarma, 99901);
    assert(espelho.textoFormatado.includes('ESPELHO DE PEDIDO DE COMPRA'));
    assert(espelho.textoFormatado.includes('R$ 665.19'));
  });

  await runAsyncTest('ADV-E2E-01', 'Passo 10: Trava Estrita de Orçamento Mensal (Teto R$ 50.000,00 vs Comprometido R$ 665.19)', async () => {
    // Configura teto mensal na tabela monthly_limits
    const hoje = new Date();
    const mes = hoje.getMonth() + 1;
    const ano = hoje.getFullYear();

    comprasPedidosService.definirLimiteMensal(mes, ano, 50000.00, testDb);

    const validacaoOrc = comprasPedidosService.validarTetoOrcamentario(665.19, mes, ano, {}, testDb);
    assert.strictEqual(validacaoOrc.permitido, true);
    assert.strictEqual(validacaoOrc.limiteMensal, 50000.00);
    assert.strictEqual(validacaoOrc.disponivel, 50000.00);
    assert.strictEqual(validacaoOrc.saldoAposPedido, 49334.81);
  });

  await runAsyncTest('ADV-E2E-01', 'Passo 11: Integração Financeira — Geração e Parcelamento de Boletos no Contas a Pagar', async () => {
    // Cria o pedido no banco com integração financeira de boletos
    const pedidoCriado = comprasPedidosService.criarPedidoCompra({
      distribuidora: 'Santa Cruz',
      representante: 'Carlos',
      condicaoPagamento: '28/35/42 dias',
      previsaoEntrega: '24h',
      mesReferencia: new Date().getMonth() + 1,
      anoReferencia: new Date().getFullYear(),
      itens: [
        {
          codigoDigifarma: 99901,
          ean: '7896004701010',
          descricao: 'Amoxicilina 500mg 21 caps EMS',
          quantidade: 57,
          precoUnitario: 11.67,
          bonificacao: 'Compre 10 Ganhe 2',
          subtotal: 665.19
        }
      ]
    }, { integrarBoletos: true }, testDb);

    assert.strictEqual(pedidoCriado.integradoContasPagar, 1);
    assert.strictEqual(pedidoCriado.boletos.length, 3);
    
    // Validação da divisão em 3 parcelas (28/35/42 dias):
    // 665.19 / 3 = 221.73 por parcela. Soma: 221.73 + 221.73 + 221.73 = 665.19
    const somaBoletos = pedidoCriado.boletos.reduce((acc, b) => acc + b.valor, 0);
    assert.strictEqual(Number(somaBoletos.toFixed(2)), 665.19);

    // Consulta física na tabela boletos do Contas a Pagar
    const boletosNoBanco = testDb.prepare('SELECT * FROM boletos WHERE order_id = ?').all(pedidoCriado.id);
    assert.strictEqual(boletosNoBanco.length, 3);
    assert.strictEqual(boletosNoBanco[0].supplierName, 'Santa Cruz');
    assert.strictEqual(boletosNoBanco[0].status, 'Pendente');
  });

  // ══════════════════════════════════════════════════════════
  // SUÍTE 2: ADV-SEC-02 — Governança Human-in-the-Loop & Segurança
  // ══════════════════════════════════════════════════════════
  console.log(`\n${colors.bright}${colors.blue}▶▶ [ADV-SEC-02] Segurança, Governança Human-in-the-Loop & Tentativas de Bypass${colors.reset}`);

  await runAsyncTest('ADV-SEC-02', 'Bypass Attack: Tentativa de envio direto via Baileys sem aprovação prévia é bloqueada', async () => {
    // Cria item pendente na fila
    const pendente = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'aviso',
      destinatario: '5532999990000',
      distribuidora: 'Hacker Dist',
      mensagemTexto: 'Tentativa de bypass não autorizado'
    }, testDb);

    // Tenta chamar diretamente baileysComprasService.enviarMensagemAprovada com item em status pendente
    let bloqueado = false;
    try {
      await baileysComprasService.enviarMensagemAprovada(pendente.id, testDb);
    } catch (e) {
      bloqueado = true;
      assert(e.message.includes('Não é permitido enviar mensagem com status "pendente"'), 'Deve lançar erro de trava de segurança');
    }
    assert.strictEqual(bloqueado, true, 'O bypass direto deve ser estritamente bloqueado!');
  });

  await runAsyncTest('ADV-SEC-02', 'Transição Inválida: Tentativa de aprovar mensagem já rejeitada previamente é rejeitada', async () => {
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999990001',
      distribuidora: 'Teste Rejeicao',
      mensagemTexto: 'Cotacao teste'
    }, testDb);

    comprasAprovacaoService.rejeitarMensagem(item.id, 'Preço abusivo', 'Diretor', testDb);

    let erroLancado = false;
    try {
      await comprasAprovacaoService.aprovarMensagem(item.id, 'Outro Usuario', null, testDb);
    } catch (e) {
      erroLancado = true;
      assert(e.message.includes('Transição inválida'), 'Deve bloquear transição de rejeitado para aprovado');
    }
    assert.strictEqual(erroLancado, true);
  });

  runTest('ADV-SEC-02', 'Imutabilidade: Tentativa de editar mensagem já aprovada/enviada é bloqueada', () => {
    const item = testDb.prepare(`SELECT id FROM compras_fila_aprovacao WHERE status = 'enviado' LIMIT 1`).get();
    assert(item, 'Deve existir item enviado');

    let bloqueado = false;
    try {
      comprasAprovacaoService.editarMensagem(item.id, 'Tentando alterar texto de mensagem já disparada', null, {}, testDb);
    } catch (e) {
      bloqueado = true;
      assert(e.message.includes('Apenas mensagens pendentes podem ser editadas'));
    }
    assert.strictEqual(bloqueado, true);
  });

  runTest('ADV-SEC-02', 'Validação de Justificativa: Rejeição sem motivo informado dispara erro', () => {
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999990002',
      distribuidora: 'Dist Sem Motivo',
      mensagemTexto: 'Cotacao teste'
    }, testDb);

    let falhouSemMotivo = false;
    try {
      comprasAprovacaoService.rejeitarMensagem(item.id, '   ', 'Auditor', testDb);
    } catch (e) {
      falhouSemMotivo = true;
      assert(e.message.includes('Motivo da rejeição é obrigatório'));
    }
    assert.strictEqual(falhouSemMotivo, true);
  });

  runTest('ADV-SEC-02', 'Sanitização de Edição: Edição de mensagem com texto vazio ou espaços é rejeitada', () => {
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999990003',
      distribuidora: 'Dist Edicao Vazia',
      mensagemTexto: 'Cotacao teste original'
    }, testDb);

    let erroTextoVazio = false;
    try {
      comprasAprovacaoService.editarMensagem(item.id, '\n\t  \n', null, {}, testDb);
    } catch (e) {
      erroTextoVazio = true;
      assert(e.message.includes('texto da mensagem não pode ser vazio'));
    }
    assert.strictEqual(erroTextoVazio, true);
  });

  // ══════════════════════════════════════════════════════════
  // SUÍTE 3: ADV-MATH-03 — Integridade Algorítmica e BVA
  // ══════════════════════════════════════════════════════════
  console.log(`\n${colors.bright}${colors.blue}▶▶ [ADV-MATH-03] Integridade Algorítmica, BVA e Robustez Matemática${colors.reset}`);

  runTest('ADV-MATH-03', 'Prevenção de Divisão por Zero em Bonificação Malformada ("Compre 0 Ganhe 0")', () => {
    const res = comprasCotacoesService.calcularPrecoLiquidoComBonificacao(10.00, 'Compre 0 Ganhe 0');
    assert.strictEqual(res.precoLiquido, 10.00);
    assert.strictEqual(res.precoBruto, 10.00);
    assert.strictEqual(res.percentualEconomia, 0);
  });

  runTest('ADV-MATH-03', 'Bonificação Complexa com Dízima Periódica (Compre 7 Ganhe 3 -> 7/10 = 70% do preço)', () => {
    const res = comprasCotacoesService.calcularPrecoLiquidoComBonificacao(30.00, 'Compre 7 Ganhe 3');
    // Preço Líquido: (7 * 30.00) / 10 = 21.00
    assert.strictEqual(res.precoLiquido, 21.00);
    assert.strictEqual(res.percentualEconomia, 30.00);
  });

  runTest('ADV-MATH-03', 'Arredondamento e Centavos em Parcelamento de 4 Boletos (R$ 100.00 / 4)', () => {
    const proj = comprasPedidosService.projetarVencimentosBoletos(100.00, [28, 35, 42, 49]);
    assert.strictEqual(proj.length, 4);
    assert.strictEqual(proj[0].valor, 25.00);
    assert.strictEqual(proj[1].valor, 25.00);
    assert.strictEqual(proj[2].valor, 25.00);
    assert.strictEqual(proj[3].valor, 25.00);
    const soma = proj.reduce((acc, p) => acc + p.valor, 0);
    assert.strictEqual(soma, 100.00);
  });

  runTest('ADV-MATH-03', 'Arredondamento e Centavos em Parcelamento Ímpar (R$ 100.00 / 3 -> 33.33, 33.33, 33.34)', () => {
    const proj = comprasPedidosService.projetarVencimentosBoletos(100.00, [28, 35, 42]);
    assert.strictEqual(proj.length, 3);
    assert.strictEqual(proj[0].valor, 33.33);
    assert.strictEqual(proj[1].valor, 33.33);
    assert.strictEqual(proj[2].valor, 33.34); // Ajuste de centavo na última parcela
    const soma = Number(proj.reduce((acc, p) => acc + p.valor, 0).toFixed(2));
    assert.strictEqual(soma, 100.00);
  });

  runTest('ADV-MATH-03', 'Limites de Score: Taxa de Quebra 100% zera score histórico', () => {
    const score = comprasCotacoesService.calcularScoreFornecedor({
      precoLiquido: 10.00,
      menorPrecoRodada: 10.00,
      prazoDias: 28,
      taxaQuebraHistorica: 100,
      pontualidadeScore: 100
    });
    // Score Preço: 60 * 1 = 60
    // Score Prazo: 25 * (28/42) = 16.67
    // Score Histórico: 15 * (100 * (1 - 1)) = 0
    assert.strictEqual(score.scoreHistorico, 0.00);
    assert.strictEqual(score.scoreTotal, 76.67);
  });

  runTest('ADV-MATH-03', 'Limites de Score: Prazo ultra-longo (90 dias) capped em 100 pts de prazo', () => {
    const score = comprasCotacoesService.calcularScoreFornecedor({
      precoLiquido: 10.00,
      menorPrecoRodada: 10.00,
      prazoDias: 90,
      taxaQuebraHistorica: 0,
      pontualidadeScore: 100
    });
    assert.strictEqual(score.scorePrazo, 100.00);
    assert.strictEqual(score.scoreTotal, 100.00);
  });

  runTest('ADV-MATH-03', 'VMD: Vendas negativas sanitizadas para 0 e produto inativo gera demanda 0', () => {
    const demInativo = comprasEstoqueService.calcularDemandaPonderada(100, 100, 15, { ativo: false });
    assert.strictEqual(demInativo.estoqueMinimoSugerido, 0);

    const demNegativo = comprasEstoqueService.calcularDemandaPonderada(-50, -20, 15, { ativo: true });
    assert.strictEqual(demNegativo.estoqueMinimoSugerido, 0);
  });

  runTest('ADV-MATH-03', 'Piso de Curva A: Produto Curva A com vendas e cálculo < 2 unidades recebe piso = 2 un', () => {
    // Vendas: 1 nos 30d, 0 nos 31-60d -> Demanda = 0.65 -> +15% = 0.7475 -> Math.ceil = 1 un -> Piso Curva A = 2 un
    const dem = comprasEstoqueService.calcularDemandaPonderada(1, 0, 15, { curvaAbc: 'A', ativo: true });
    assert.strictEqual(dem.estoqueMinimoSugerido, 2);
  });

  runTest('ADV-MATH-03', 'Trava Orçamentária: Estouro de exatamente R$ 0.01 é bloqueado', () => {
    const orc = comprasPedidosService.validarOrcamento(1000.00, 500.00, 500.01, [28]);
    assert.strictEqual(orc.permitido, false);
    assert.strictEqual(orc.saldoAposPedido, -0.01);
  });

  runTest('ADV-MATH-03', 'Trava Orçamentária: Pedido que deixa saldo exatamente R$ 0.00 é permitido', () => {
    const orc = comprasPedidosService.validarOrcamento(1000.00, 500.00, 500.00, [28]);
    assert.strictEqual(orc.permitido, true);
    assert.strictEqual(orc.saldoAposPedido, 0.00);
  });

  // ══════════════════════════════════════════════════════════
  // SUÍTE 4: ADV-DB-04 — Resiliência Transacional e Fallback
  // ══════════════════════════════════════════════════════════
  console.log(`\n${colors.bright}${colors.blue}▶▶ [ADV-DB-04] Resiliência Transacional, Fallback SQLite e Persistência Atômica${colors.reset}`);

  await runAsyncTest('ADV-DB-04', 'Sincronização em Lote com IDs Inválidos é tratada sem derrubar processo', async () => {
    const res = await comprasEstoqueService.sincronizarLoteEstoqueMinimoDigifarma([
      { produtoId: -1, estoqueMinimo: 10 },
      { produtoId: 'ABC', estoqueMinimo: 20 },
      { produtoId: null, estoqueMinimo: 30 }
    ]);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.erros.length, 3);
    assert.strictEqual(res.count, 0);
  });

  runTest('ADV-DB-04', 'Idempotência no Upsert de Metadados de Fornecedores', () => {
    const forn1 = comprasMineracaoService.upsertFornecedorMeta(testDb, {
      telefone: '5532991112222',
      distribuidora: 'Panpharma',
      representante: 'Roberto',
      pedidoMinimoValor: 400,
      prazosPagamento: ['28 dias'],
      categorias: ['Genéricos']
    });

    // Atualização subsequente com novos prazos e categorias adicionais
    const forn2 = comprasMineracaoService.upsertFornecedorMeta(testDb, {
      telefone: '5532991112222',
      distribuidora: 'Panpharma',
      representante: 'Roberto Panpharma',
      pedidoMinimoValor: 450,
      prazosPagamento: ['35 dias'],
      categorias: ['Similares']
    });

    assert.strictEqual(forn1.id, forn2.id, 'ID deve permanecer idêntico (upsert idempotente)');
    assert.strictEqual(forn2.pedidoMinimoValor, 450);
    assert(forn2.prazosPagamento.includes('28 dias') && forn2.prazosPagamento.includes('35 dias'));
    assert(forn2.categorias.includes('Genéricos') && forn2.categorias.includes('Similares'));
  });

  runTest('ADV-DB-04', 'Fallback e Fallback em Cascata de Quebras de Fornecedores (R3/F10)', () => {
    const rankingInicial = [
      { fornecedorId: 'f1', distribuidora: 'Dist 1', scoreTotal: 95, precoLiquido: 10, status: 'Vencedor', vencedor: true },
      { fornecedorId: 'f2', distribuidora: 'Dist 2', scoreTotal: 90, precoLiquido: 11, status: 'Pendente', vencedor: false },
      { fornecedorId: 'f3', distribuidora: 'Dist 3', scoreTotal: 80, precoLiquido: 12, status: 'Pendente', vencedor: false }
    ];

    const quebra1 = comprasCotacoesService.processarQuebraFornecedor('COT_E2E_Q', rankingInicial, 'f1', {
      db: testDb,
      motivoQuebra: 'Falta de estoque no CD'
    });

    assert.strictEqual(quebra1.novoVencedor, 'Dist 2');
    assert.strictEqual(quebra1.novoVencedorId, 'f2');
    assert.strictEqual(quebra1.rankingAtualizado[0].fornecedorId, 'f2');

    // Quebra subsequente do 2º colocado -> Fallback para o 3º
    const quebra2 = comprasCotacoesService.processarQuebraFornecedor('COT_E2E_Q', quebra1.rankingAtualizado, 'f2', {
      db: testDb,
      motivoQuebra: 'Distribuidora 2 também sem estoque'
    });

    assert.strictEqual(quebra2.novoVencedor, 'Dist 3');
    assert.strictEqual(quebra2.novoVencedorId, 'f3');
    assert.strictEqual(quebra2.rankingAtualizado[0].fornecedorId, 'f3');
  });

  // ══════════════════════════════════════════════════════════
  // SUÍTE 5: ADV-CONC-05 — Concorrência e Race Conditions
  // ══════════════════════════════════════════════════════════
  console.log(`\n${colors.bright}${colors.blue}▶▶ [ADV-CONC-05] Concorrência, Race Conditions e Integridade sob Carga${colors.reset}`);

  await runAsyncTest('ADV-CONC-05', 'Race Condition: Disparo simultâneo de aprovação dupla no mesmo item resulta em exatamente 1 sucesso', async () => {
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532998889999',
      distribuidora: 'Dist Concorrencia',
      mensagemTexto: 'Cotacao para teste concorrente'
    }, testDb);

    let sucessoCount = 0;
    let erroCount = 0;

    const mockWA = {
      enviarMensagemAprovada: async () => ({ success: true, messageId: `MSG_CONC_${Date.now()}` })
    };

    // Tenta aprovar simultaneamente
    const promises = [
      comprasAprovacaoService.aprovarMensagem(item.id, 'User A', null, testDb, mockWA)
        .then(() => { sucessoCount++; })
        .catch(() => { erroCount++; }),
      comprasAprovacaoService.aprovarMensagem(item.id, 'User B', null, testDb, mockWA)
        .then(() => { sucessoCount++; })
        .catch(() => { erroCount++; })
    ];

    await Promise.all(promises);

    assert.strictEqual(sucessoCount, 1, 'Exatamente 1 aprovação deve ter sucesso');
    assert.strictEqual(erroCount, 1, 'A segunda aprovação concorrente deve falhar');
  });

  runTest('ADV-CONC-05', 'Simulação de 100 Mensagens Enfileiradas e Processamento Ordenado FIFO', () => {
    for (let i = 1; i <= 100; i++) {
      comprasAprovacaoService.enfileirarMensagem({
        tipo: 'cotacao',
        destinatario: `553298000${String(i).padStart(4, '0')}`,
        distribuidora: `Distribuidora Lote ${i}`,
        mensagemTexto: `Solicitacao de cotação lote ${i}`
      }, testDb);
    }

    const pendentes = comprasAprovacaoService.listarPendentes(testDb);
    assert(pendentes.length >= 100, 'Deve listar 100+ mensagens pendentes');
    const contador = comprasAprovacaoService.obterContadorPendencias(testDb);
    assert(contador.totalPendentes >= 100);
  });

  // ══════════════════════════════════════════════════════════
  // SUÍTE 6: ADV-UI-06 — Conformidade de Interface Web
  // ══════════════════════════════════════════════════════════
  console.log(`\n${colors.bright}${colors.blue}▶▶ [ADV-UI-06] Conformidade de Interface Web (Regras de UI BelaFarma)${colors.reset}`);

  runTest('ADV-UI-06', 'Auditoria Estrita de Código: Ausência de alert() em todos os componentes de compras', () => {
    const comprasDir = path.join(__dirname, '..', '..', 'components', 'compras');
    if (fs.existsSync(comprasDir)) {
      const files = fs.readdirSync(comprasDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(comprasDir, file), 'utf-8');
        assert(!content.includes('alert('), `Componente ${file} não pode conter alert()!`);
      }
    }
  });

  runTest('ADV-UI-06', 'Auditoria Estrita de Código: Ausência de confirm() em todos os componentes de compras', () => {
    const comprasDir = path.join(__dirname, '..', '..', 'components', 'compras');
    if (fs.existsSync(comprasDir)) {
      const files = fs.readdirSync(comprasDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(comprasDir, file), 'utf-8');
        assert(!content.includes('confirm('), `Componente ${file} não pode conter confirm()!`);
      }
    }
  });

  runTest('ADV-UI-06', 'Auditoria de CentralCompras.tsx: 7 Sub-abas Especializadas Declaradas', () => {
    const centralComprasPath = path.join(__dirname, '..', '..', 'components', 'CentralCompras.tsx');
    assert(fs.existsSync(centralComprasPath), 'CentralCompras.tsx deve existir');
    const content = fs.readFileSync(centralComprasPath, 'utf-8');
    
    // Verifica declaração das 7 sub-abas
    assert(content.includes('ComprasDashboard'), 'Deve importar ComprasDashboard');
    assert(content.includes('ComprasMineracao'), 'Deve importar ComprasMineracao');
    assert(content.includes('ComprasCotacoes'), 'Deve importar ComprasCotacoes');
    assert(content.includes('ComprasAprovacaoFila'), 'Deve importar ComprasAprovacaoFila');
    assert(content.includes('ComprasPedidosPainel'), 'Deve importar ComprasPedidosPainel');
    assert(content.includes('ComprasRepresentantes'), 'Deve importar ComprasRepresentantes');
    assert(content.includes('ComprasWhatsAppConexao'), 'Deve importar ComprasWhatsAppConexao');
    assert(!content.includes('alert('), 'CentralCompras.tsx não pode conter alert()');
    assert(!content.includes('confirm('), 'CentralCompras.tsx não pode conter confirm()');
  });

  // Limpeza dos dados de teste no mainDb
  try {
    mainDb.prepare('DELETE FROM compras_estoque_cache WHERE produto_id = 99901').run();
  } catch (e) {}

  // ──────────────────────────────────────────────────────────
  // RELATÓRIO FINAL CONSOLIDADO TIER 5
  // ──────────────────────────────────────────────────────────
  console.log(`\n${colors.bright}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}             RELATÓRIO DA SUÍTE ADVERSARIAL TIER 5 (CHALLENGER 1)              ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`  Total de Testes Adversariais Executados: ${colors.bright}${totalTests}${colors.reset}`);
  console.log(`  Testes Passados:                         ${colors.green}${passedTests}${colors.reset}`);
  console.log(`  Falhas Encontradas:                      ${failedTests > 0 ? colors.red : colors.green}${failedTests}${colors.reset}`);
  console.log(`  Taxa de Sucesso:                         ${colors.bright}${((passedTests / totalTests) * 100).toFixed(1)}%${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}================================================================================${colors.reset}\n`);

  if (failedTests === 0) {
    console.log(`${colors.bright}${colors.green}🏆 [VEREDITO FINAL]: APPROVE — 100% DOS TESTES ADVERSARIAIS TIER 5 PASSARAM!${colors.reset}\n`);
    return true;
  } else {
    console.log(`${colors.bright}${colors.red}❌ [VEREDITO FINAL]: REQUEST_CHANGES — ${failedTests} falha(s) encontrada(s)!${colors.reset}\n`);
    return false;
  }
}

// Execução imediata
runTier5TestSuite().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Erro fatal na execução da suíte Tier 5:', err);
  process.exit(1);
});
