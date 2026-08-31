/**
 * test_compras_m3.js
 * Suíte Completa de Testes Automatizados para o Motor de Cotações Inteligentes,
 * Ranking Ponderado (60/25/15), Otimização de Pedido Mínimo e Gestão de Quebras (Worker M3 - R3 / F7, F8, F9, F10).
 */

const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const comprasCotacoesService = require('./services/compras-cotacoes.service');

console.log('═══════════════════════════════════════════════════════════════');
console.log('🧪 INICIANDO TESTES DO WORKER M3 (Motor de Cotações & Ranking)');
console.log('═══════════════════════════════════════════════════════════════\n');

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
    console.error(err.stack);
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
    console.error(err.stack);
  }
}

// ──────────────────────────────────────────────────────────
// 1. Testes de Preço Líquido, Bonificações e Descontos
// ──────────────────────────────────────────────────────────
console.log('📋 GRUPO 1: Cálculo de Preço Líquido & Bonificações Comerciais');

test('1.1 - Bonificação "Compre 10 Ganhe 2" (Paga 10, Recebe 12)', () => {
  // Preço bruto: R$ 12,00. Paga 10 (R$ 120), leva 12 -> Preço unitário líquido = R$ 10,00 (Economia de 16.67%)
  const res = comprasCotacoesService.calcularPrecoLiquidoComBonificacao(12.00, "compre 10 ganhe 2");
  assert.strictEqual(res.precoBruto, 12.00);
  assert.strictEqual(res.precoLiquido, 10.00);
  assert.strictEqual(res.percentualEconomia, 16.67);
  assert.ok(res.bonificacaoFormatada.includes("Compre 10 Receba 12"));
});

test('1.2 - Bonificação "Compre 20 Leve 25" (Formato Leve X)', () => {
  // Preço bruto: R$ 2,00. Paga 20 (R$ 40), leva 25 -> Preço líquido = R$ 1,60 (Economia de 20%)
  const res = comprasCotacoesService.calcularPrecoLiquidoComBonificacao(2.00, "compre 20 leve 25");
  assert.strictEqual(res.precoLiquido, 1.60);
  assert.strictEqual(res.percentualEconomia, 20.00);
});

test('1.3 - Bonificação formato "10+2" e "5+1"', () => {
  // Preço bruto: R$ 6,00 com 10+2 -> Paga 10, leva 12 -> R$ 5,00
  const res1 = comprasCotacoesService.calcularPrecoLiquidoComBonificacao(6.00, "10+2");
  assert.strictEqual(res1.precoLiquido, 5.00);

  // Preço bruto: R$ 12,00 com 5+1 -> Paga 5, leva 6 -> R$ 10,00
  const res2 = comprasCotacoesService.calcularPrecoLiquidoComBonificacao(12.00, "5+1");
  assert.strictEqual(res2.precoLiquido, 10.00);
});

test('1.4 - Desconto percentual no texto e como parâmetro adicional', () => {
  // Preço bruto: R$ 10,00 com 15% de desconto no texto -> R$ 8,50
  const res1 = comprasCotacoesService.calcularPrecoLiquidoComBonificacao(10.00, "15% de desconto");
  assert.strictEqual(res1.precoLiquido, 8.50);
  assert.strictEqual(res1.percentualEconomia, 15.00);

  // Preço bruto: R$ 20,00 com 10% de desconto adicional
  const res2 = comprasCotacoesService.calcularPrecoLiquidoComBonificacao(20.00, null, 10);
  assert.strictEqual(res2.precoLiquido, 18.00);
});

test('1.5 - Avaliação de Oportunidade com Radar contra Digifarma', () => {
  // Oferta R$ 8,00 vs Digifarma R$ 10,00 -> Vantajosa (Economia de 20%)
  const op1 = comprasCotacoesService.avaliarOportunidade("Dipirona", 8.00, 10.00);
  assert.strictEqual(op1.valida, true);
  assert.strictEqual(op1.economiaPercentual, 20.00);
  assert.strictEqual(op1.status, 'Aprovado_Radar');

  // Oferta R$ 12,00 vs Digifarma R$ 10,00 -> Descartada
  const op2 = comprasCotacoesService.avaliarOportunidade("Dipirona", 12.00, 10.00);
  assert.strictEqual(op2.valida, false);
  assert.strictEqual(op2.status, 'Descartado_Preco_Maior');
});

// ──────────────────────────────────────────────────────────
// 2. Motor de Score Ponderado (60/25/15)
// ──────────────────────────────────────────────────────────
console.log('\n⚖️ GRUPO 2: Motor de Score Ponderado (60% Preço, 25% Prazo, 15% Histórico)');

test('2.1 - Score do Menor Preço Líquido (60%) normalizado em 100 pts', () => {
  // Menor preço: R$ 10,00.
  // Preço R$ 10,00 -> 100 pts de preço
  const score10 = comprasCotacoesService.calcularScoreFornecedor({ precoLiquido: 10.00, menorPrecoRodada: 10.00, prazoDias: 28, pontualidadeScore: 100, taxaQuebraHistorica: 0 });
  assert.strictEqual(score10.scorePreco, 100);

  // Preço R$ 20,00 -> (10 / 20) * 100 = 50 pts de preço
  const score20 = comprasCotacoesService.calcularScoreFornecedor({ precoLiquido: 20.00, menorPrecoRodada: 10.00, prazoDias: 28, pontualidadeScore: 100, taxaQuebraHistorica: 0 });
  assert.strictEqual(score20.scorePreco, 50);
});

test('2.2 - Score de Prazo de Pagamento (25%) com escala até 42 dias', () => {
  // 42 dias -> 100 pts
  const s42 = comprasCotacoesService.calcularScoreFornecedor({ precoLiquido: 10.00, menorPrecoRodada: 10.00, prazoDias: 42 });
  assert.strictEqual(s42.scorePrazo, 100);

  // 28 dias -> (28 / 42) * 100 = 66.67 pts
  const s28 = comprasCotacoesService.calcularScoreFornecedor({ precoLiquido: 10.00, menorPrecoRodada: 10.00, prazoDias: 28 });
  assert.strictEqual(s28.scorePrazo, 66.67);

  // À vista / 0 dias -> Piso de 10 pts
  const s0 = comprasCotacoesService.calcularScoreFornecedor({ precoLiquido: 10.00, menorPrecoRodada: 10.00, prazoDias: 0 });
  assert.strictEqual(s0.scorePrazo, 10);

  // Prazo ultra-longo (90 dias) -> Teto de 100 pts
  const s90 = comprasCotacoesService.calcularScoreFornecedor({ precoLiquido: 10.00, menorPrecoRodada: 10.00, prazoDias: 90 });
  assert.strictEqual(s90.scorePrazo, 100);
});

test('2.3 - Score Histórico de Confiabilidade com penalização por taxa de quebra (15%)', () => {
  // Pontualidade 100 e Quebra 0% -> 100 pts
  const s1 = comprasCotacoesService.calcularScoreFornecedor({ precoLiquido: 10.00, menorPrecoRodada: 10.00, prazoDias: 28, pontualidadeScore: 100, taxaQuebraHistorica: 0 });
  assert.strictEqual(s1.scoreHistorico, 100);

  // Pontualidade 100 e Quebra 20% -> 100 * (1 - 0.20) = 80 pts
  const s2 = comprasCotacoesService.calcularScoreFornecedor({ precoLiquido: 10.00, menorPrecoRodada: 10.00, prazoDias: 28, pontualidadeScore: 100, taxaQuebraHistorica: 20 });
  assert.strictEqual(s2.scoreHistorico, 80);

  // Fornecedor novo sem histórico -> Score neutro de 75 pts
  const sNovo = comprasCotacoesService.calcularScoreFornecedor({ precoLiquido: 10.00, menorPrecoRodada: 10.00, prazoDias: 28 });
  assert.strictEqual(sNovo.scoreHistorico, 75);

  // Quebra 100% -> 0 pts
  const sQuebraTotal = comprasCotacoesService.calcularScoreFornecedor({ precoLiquido: 10.00, menorPrecoRodada: 10.00, prazoDias: 28, pontualidadeScore: 100, taxaQuebraHistorica: 100 });
  assert.strictEqual(sQuebraTotal.scoreHistorico, 0);
});

test('2.4 - Cálculo exato da ponderação (60 * Preço + 25 * Prazo + 15 * Histórico)', () => {
  // Preço 100 pts (0.60 * 100 = 60), Prazo 100 pts (0.25 * 100 = 25), Histórico 100 pts (0.15 * 100 = 15) -> Total = 100 pts
  const sPerfeito = comprasCotacoesService.calcularScoreFornecedor({ precoLiquido: 10.00, menorPrecoRodada: 10.00, prazoDias: 42, pontualidadeScore: 100, taxaQuebraHistorica: 0 });
  assert.strictEqual(sPerfeito.scoreTotal, 100);

  // Preço 50 pts (0.60 * 50 = 30), Prazo 66.67 pts (0.25 * 66.67 = 16.67), Histórico 80 pts (0.15 * 80 = 12) -> Total = 58.67
  const sMedio = comprasCotacoesService.calcularScoreFornecedor({ precoLiquido: 20.00, menorPrecoRodada: 10.00, prazoDias: 28, pontualidadeScore: 100, taxaQuebraHistorica: 20 });
  assert.strictEqual(sMedio.scoreTotal, 58.67);
});

// ──────────────────────────────────────────────────────────
// 3. Algoritmo de Ranking e Desempate de Cotações
// ──────────────────────────────────────────────────────────
console.log('\n🏆 GRUPO 3: Ranking e Desempate de Cotações');

test('3.1 - Ordenação de Cotações por Score Total Decrescente', () => {
  const respostas = [
    { fornecedorId: 'F1', distribuidora: 'Santa Cruz', precoLiquido: 10.00, prazoDias: 28, pontualidadeScore: 90, taxaQuebraPercent: 5 },
    { fornecedorId: 'F2', distribuidora: 'Profarma', precoLiquido: 9.50, prazoDias: 42, pontualidadeScore: 95, taxaQuebraPercent: 0 },
    { fornecedorId: 'F3', distribuidora: 'Panpharma', precoLiquido: 12.00, prazoDias: 14, pontualidadeScore: 70, taxaQuebraPercent: 10 }
  ];

  const ranking = comprasCotacoesService.calcularScoreRanking(respostas);
  assert.strictEqual(ranking.length, 3);
  assert.strictEqual(ranking[0].fornecedorId, 'F2', 'Profarma deve ser a 1ª colocada (vencedora)');
  assert.strictEqual(ranking[0].vencedor, true);
  assert.strictEqual(ranking[0].posicao, 1);
  assert.strictEqual(ranking[1].fornecedorId, 'F1', 'Santa Cruz deve ser a 2ª');
  assert.strictEqual(ranking[2].fornecedorId, 'F3', 'Panpharma deve ser a 3ª');
});

test('3.2 - Desempate por Menor Preço Líquido em caso de Score Total idêntico', () => {
  const respostas = [
    { fornecedorId: 'F_Caro', distribuidora: 'Caro', precoLiquido: 10.50, prazoDias: 28, pontualidadeScore: 80, taxaQuebraPercent: 0 },
    { fornecedorId: 'F_Barato', distribuidora: 'Barato', precoLiquido: 10.00, prazoDias: 28, pontualidadeScore: 80, taxaQuebraPercent: 0 }
  ];

  const ranking = comprasCotacoesService.calcularScoreRanking(respostas);
  assert.strictEqual(ranking[0].fornecedorId, 'F_Barato', 'Menor preço deve desempatar na frente');
});

test('3.3 - Fornecedor com bonificação vencendo mesmo com preço de tabela mais alto', () => {
  // Fornecedor A: R$ 10,00 direto (líquido = 10.00)
  // Fornecedor B: R$ 11,00 mas com "Compre 10 Ganhe 2" (líquido = 9.17)
  const respostas = [
    { fornecedorId: 'FA', distribuidora: 'A', precoLiquido: 10.00, prazoDias: 28, pontualidadeScore: 90 },
    { fornecedorId: 'FB', distribuidora: 'B', precoBruto: 11.00, bonificacao: 'compre 10 ganhe 2', prazoDias: 28, pontualidadeScore: 90 }
  ];

  const ranking = comprasCotacoesService.calcularScoreRanking(respostas);
  assert.strictEqual(ranking[0].fornecedorId, 'FB', 'Fornecedor B com bonificação é mais econômico e vence');
  assert.strictEqual(ranking[0].precoLiquido, 9.1667);
});

// ──────────────────────────────────────────────────────────
// 4. Redação Contextualizada de Solicitações para WhatsApp
// ──────────────────────────────────────────────────────────
console.log('\n📱 GRUPO 4: Redação Contextualizada de Cotações para WhatsApp');

test('4.1 - Geração de texto profissional com itens, EAN e quantidades em negrito', () => {
  const itens = [
    { descricao: "Amoxicilina 500mg 21 caps", ean: "7891234567890", quantidade: 30 },
    { descricao: "Losartana Potássica 50mg", ean: "7899876543210", quantidade: 50 }
  ];

  const msg = comprasCotacoesService.gerarMensagemCotacao("Panpharma", "Roberto", itens);
  assert.ok(msg.includes("Roberto"), 'Inclui nome do representante');
  assert.ok(msg.includes("Panpharma"), 'Inclui distribuidora');
  assert.ok(msg.includes("Central de Compras BelaFarma"), 'Identificação institucional');
  assert.ok(msg.includes("[EAN: 7891234567890]"), 'EAN formatado');
  assert.ok(msg.includes("Qtd Sugerida: *30 un*"), 'Quantidade formatada em negrito');
  assert.ok(msg.includes("Por gentileza, informe os preços líquidos"), 'Encerramento comercial');
});

test('4.2 - Tratamento de itens sem EAN e listas unitárias', () => {
  const itens = [{ descricao: "Alcool 70% 1L", ean: null, quantidade: 12 }];
  const msg = comprasCotacoesService.gerarMensagemCotacao("Profarma", "Lucas", itens);
  assert.ok(msg.includes("1. *Alcool 70% 1L* - Qtd Sugerida: *12 un*"));
  assert.ok(!msg.includes("null"));
});

test('4.3 - Rejeição para lista vazia de itens', () => {
  assert.throws(() => {
    comprasCotacoesService.gerarMensagemCotacao("Santa Cruz", "Carlos", []);
  }, /Lista de itens vazia/);
});

// ──────────────────────────────────────────────────────────
// 5. Otimização Automática de Pedido Mínimo
// ──────────────────────────────────────────────────────────
console.log('\n📦 GRUPO 5: Otimização Automática de Pedido Mínimo');

test('5.1 - Cesta que já atinge o pedido mínimo -> Aprovada direto', () => {
  const dados = [{
    fornecedorId: 'F1',
    nome: 'Santa Cruz',
    pedidoMinimo: 500,
    itens: [{ produtoId: 1, valorTotal: 600 }]
  }];

  const res = comprasCotacoesService.otimizarPedidoMinimo(dados);
  assert.strictEqual(res[0].atingiuMinimo, true);
  assert.strictEqual(res[0].estrategia, 'Atingido_Direto');
  assert.strictEqual(res[0].subtotal, 600);
});

test('5.2 - Preenchimento inteligente com itens de giro alto daquele fornecedor', () => {
  // Faltam R$ 150 para atingir o mínimo de R$ 500
  const dados = [{
    fornecedorId: 'F2',
    nome: 'Profarma',
    pedidoMinimo: 500,
    itens: [{ produtoId: 1, valorTotal: 350 }],
    catalogoOutrosItensGiroAlto: [
      { produtoId: 20, descricao: 'Dipirona Gotas', valorTotal: 160 }
    ]
  }];

  const res = comprasCotacoesService.otimizarPedidoMinimo(dados);
  assert.strictEqual(res[0].atingiuMinimo, true);
  assert.strictEqual(res[0].estrategia, 'Preenchimento_Giro_Alto');
  assert.strictEqual(res[0].subtotalFinal, 510);
  assert.strictEqual(res[0].itensAdicionados.length, 1);
});

test('5.3 - Realocação para 2º melhor colocado global com comparativo de custo-benefício', () => {
  // Pedido R$ 100 de um mínimo de R$ 1.000 sem itens adicionais viáveis
  const dados = [{
    fornecedorId: 'F3',
    nome: 'Distribuidora Pequena',
    pedidoMinimo: 1000,
    itens: [{ produtoId: 1, valorTotal: 100 }],
    catalogoOutrosItensGiroAlto: [],
    segundoColocadoGlobal: {
      fornecedorId: 'F_Grande',
      distribuidora: 'Santa Cruz',
      subtotal: 105 // No 2º colocado custa 105 (diferença de R$ 5 vs gastar R$ 900 extras)
    }
  }];

  const res = comprasCotacoesService.otimizarPedidoMinimo(dados);
  assert.strictEqual(res[0].atingiuMinimo, false);
  assert.strictEqual(res[0].estrategia, 'Realocacao_Segundo_Colocado');
  assert.strictEqual(res[0].diferencaFaltante, 900);
  assert.ok(res[0].comparativoCustoBeneficio);
  assert.strictEqual(res[0].comparativoCustoBeneficio.custoExtraRealocacao, 5);
  assert.ok(res[0].comparativoCustoBeneficio.recomendacao.includes("Realocar para 2º Colocado"));
});

// ──────────────────────────────────────────────────────────
// 6. Gestão de Quebras e Fallback Automático
// ──────────────────────────────────────────────────────────
console.log('\n🔄 GRUPO 6: Gestão de Quebras e Fallback Automático');

test('6.1 - Passagem automática para o 2º colocado e penalização histórica (+15%)', () => {
  const ranking = [
    { fornecedorId: 'F1', nome: 'Vencedor Inicial', precoLiquido: 10.00, scoreTotal: 95, taxaQuebraPercent: 5 },
    { fornecedorId: 'F2', nome: 'Segundo Colocado', precoLiquido: 10.50, scoreTotal: 90, taxaQuebraPercent: 0 }
  ];

  const resultado = comprasCotacoesService.processarQuebraFornecedor('COT_001', ranking, 'F1');
  assert.strictEqual(resultado.sucesso, true);
  assert.strictEqual(resultado.status, 'Realocado_Com_Sucesso');
  assert.strictEqual(resultado.novoVencedorId, 'F2');
  assert.strictEqual(resultado.fornecedorAnterior, 'Vencedor Inicial');
  assert.strictEqual(resultado.novoPreco, 10.50);

  // Verifica se taxa de quebra do desistente foi incrementada em +15%
  assert.strictEqual(ranking[0].taxaQuebraPercent, 20);
  assert.strictEqual(ranking[0].status, 'Quebra_Declarada');
});

test('6.2 - Fallback em cascata para 3º colocado após múltiplas quebras', () => {
  const ranking = [
    { fornecedorId: 'F1', nome: 'F1', precoLiquido: 10.00, status: 'Quebra_Declarada' },
    { fornecedorId: 'F2', nome: 'F2', precoLiquido: 10.50, scoreTotal: 90, taxaQuebraPercent: 0 },
    { fornecedorId: 'F3', nome: 'F3', precoLiquido: 11.00, scoreTotal: 85, taxaQuebraPercent: 0 }
  ];

  // F2 também informa quebra
  const resultado = comprasCotacoesService.processarQuebraFornecedor('COT_001', ranking, 'F2');
  assert.strictEqual(resultado.sucesso, true);
  assert.strictEqual(resultado.novoVencedorId, 'F3');
});

test('6.3 - Ruptura Geral de Mercado quando todos os fornecedores quebram', () => {
  const ranking = [
    { fornecedorId: 'F1', nome: 'F1', precoLiquido: 10.00, status: 'Quebra_Declarada' }
  ];

  const resultado = comprasCotacoesService.processarQuebraFornecedor('COT_001', ranking, 'F1');
  assert.strictEqual(resultado.sucesso, false);
  assert.strictEqual(resultado.status, 'Ruptura_Geral_Mercado');
});

// ──────────────────────────────────────────────────────────
// 7. Integração com Banco SQLite em Modo WAL
// ──────────────────────────────────────────────────────────
console.log('\n💾 GRUPO 7: Integração com Banco SQLite & Persistência de Cotações');

const testDb = new Database(':memory:');

testDb.exec(`
  CREATE TABLE IF NOT EXISTS compras_estoque_cache (
    produto_id INTEGER PRIMARY KEY,
    descricao TEXT NOT NULL,
    ean TEXT,
    categoria_id INTEGER DEFAULT 0,
    curva_abc TEXT DEFAULT 'C',
    saldo REAL DEFAULT 0,
    est_minimo_calculado REAL DEFAULT 0,
    est_minimo_digifarma REAL DEFAULT 0,
    vmd_ponderado REAL DEFAULT 0,
    vendas_30d REAL DEFAULT 0,
    vendas_31_60d REAL DEFAULT 0,
    custo_unitario REAL DEFAULT 0,
    ultima_compra_valor REAL DEFAULT 0,
    status_ruptura TEXT DEFAULT 'NORMAL',
    margem_seguranca_aplicada REAL DEFAULT 15.0,
    dias_sem_venda INTEGER DEFAULT 0,
    sincronizado_em TEXT,
    atualizado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS compras_fornecedores_meta (
    id TEXT PRIMARY KEY,
    digifarma_id INTEGER UNIQUE,
    distribuidora TEXT NOT NULL,
    representante TEXT,
    telefone TEXT NOT NULL,
    prazos_pagamento TEXT,
    pedido_minimo_valor REAL DEFAULT 0,
    pedido_minimo_condicoes TEXT,
    taxa_quebra_percent REAL DEFAULT 0,
    pontualidade_score REAL DEFAULT 100,
    categorias_fornecidas TEXT,
    catalogo_produtos TEXT,
    ultima_varredura_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
    data_oferta TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS compras_cotacoes (
    id TEXT PRIMARY KEY,
    numero_cotacao TEXT NOT NULL UNIQUE,
    titulo TEXT NOT NULL,
    status TEXT DEFAULT 'Aberta',
    itens_solicitados TEXT NOT NULL,
    criterios_score TEXT,
    created_at TEXT NOT NULL,
    finalizada_at TEXT
  );

  CREATE TABLE IF NOT EXISTS compras_cotacoes_respostas (
    id TEXT PRIMARY KEY,
    cotacao_id TEXT NOT NULL,
    fornecedor_id TEXT,
    distribuidora TEXT NOT NULL,
    telefone TEXT NOT NULL,
    status TEXT DEFAULT 'Pendente',
    solicitada_em TEXT NOT NULL,
    respondida_em TEXT,
    resposta_raw TEXT,
    itens_cotados_json TEXT,
    score_preco REAL DEFAULT 0,
    score_prazo REAL DEFAULT 0,
    score_historico REAL DEFAULT 0,
    score_total REAL DEFAULT 0,
    vencedora INTEGER DEFAULT 0,
    posicao_ranking INTEGER DEFAULT 0,
    prazo_dias INTEGER DEFAULT 0,
    condicao_pagamento TEXT,
    motivo_quebra TEXT,
    pedido_minimo_atingido INTEGER DEFAULT 1,
    valor_total_cotado REAL DEFAULT 0,
    FOREIGN KEY (cotacao_id) REFERENCES compras_cotacoes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS compras_cotacoes_itens (
    id TEXT PRIMARY KEY,
    cotacao_id TEXT NOT NULL,
    produto_id INTEGER,
    descricao TEXT NOT NULL,
    ean TEXT,
    quantidade_sugerida REAL DEFAULT 1,
    unidade TEXT DEFAULT 'UN',
    preco_referencia REAL DEFAULT 0,
    melhor_preco_ofertado REAL,
    fornecedor_vencedor_id TEXT,
    status TEXT DEFAULT 'Pendente',
    created_at TEXT NOT NULL,
    FOREIGN KEY (cotacao_id) REFERENCES compras_cotacoes(id) ON DELETE CASCADE
  );
`);

// Popula dados de teste no banco em memória
testDb.prepare(`
  INSERT INTO compras_fornecedores_meta (
    id, distribuidora, representante, telefone, prazos_pagamento, pedido_minimo_valor,
    taxa_quebra_percent, pontualidade_score, categorias_fornecidas, catalogo_produtos,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'forn_sc_01', 'Santa Cruz', 'Carlos Santa Cruz', '5532988881111', '["28/35/42"]', 500,
  0, 98, '["Genéricos", "Similares"]', '["Dipirona 500mg", "Amoxicilina 500mg"]',
  new Date().toISOString(), new Date().toISOString()
);

testDb.prepare(`
  INSERT INTO compras_fornecedores_meta (
    id, distribuidora, representante, telefone, prazos_pagamento, pedido_minimo_valor,
    taxa_quebra_percent, pontualidade_score, categorias_fornecidas, catalogo_produtos,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'forn_pf_02', 'Profarma', 'Lucas Profarma', '5532988882222', '["30/60/90"]', 600,
  5, 92, '["Genéricos", "Éticos"]', '["Losartana 50mg", "Dipirona 500mg"]',
  new Date().toISOString(), new Date().toISOString()
);

testDb.prepare(`
  INSERT INTO compras_estoque_cache (
    produto_id, descricao, ean, saldo, est_minimo_calculado, custo_unitario, status_ruptura, atualizado_em
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(1001, 'Dipirona 500mg cx 100', '7891111111111', 0, 50, 2.00, 'RUPTURA_CRITICA', new Date().toISOString());

testDb.prepare(`
  INSERT INTO compras_estoque_cache (
    produto_id, descricao, ean, saldo, est_minimo_calculado, custo_unitario, status_ruptura, atualizado_em
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(1002, 'Amoxicilina 500mg 21 caps', '7892222222222', 5, 30, 10.00, 'ABAIXO_MINIMO', new Date().toISOString());

(async () => {

  test('7.1 - Reconhecimento de Fornecedores por Histórico/Catálogo e Geração de Cotação', () => {
    const cotacoes = comprasCotacoesService.gerarSolicitacaoCotacao([1001, 1002], {
      db: testDb,
      salvarCotacao: true,
      titulo: 'Cotação de Faltas Teste'
    });

    assert.ok(cotacoes.length >= 1, 'Deve gerar cotações para fornecedores elegíveis');
    assert.ok(cotacoes.some(c => c.distribuidora === 'Santa Cruz'), 'Identificou Santa Cruz para Dipirona e Amoxicilina');

    // Verifica persistência no SQLite
    const cotacaoDb = testDb.prepare('SELECT * FROM compras_cotacoes LIMIT 1').get();
    assert.ok(cotacaoDb, 'Gravou em compras_cotacoes');

    const itensDb = testDb.prepare('SELECT * FROM compras_cotacoes_itens WHERE cotacao_id = ?').all(cotacaoDb.id);
    assert.ok(itensDb.length >= 2, 'Gravou itens em compras_cotacoes_itens');
  });

  test('7.2 - Registro de Respostas e Cálculo Automático de Ranking no Banco', () => {
    const cotacaoDb = testDb.prepare('SELECT id FROM compras_cotacoes LIMIT 1').get();
    assert.ok(cotacaoDb);

    // Resposta 1: Santa Cruz (R$ 1,80 Dipirona)
    comprasCotacoesService.registrarRespostaCotacao(cotacaoDb.id, {
      fornecedorId: 'forn_sc_01',
      distribuidora: 'Santa Cruz',
      telefone: '5532988881111',
      precoLiquido: 1.80,
      prazoDias: 35,
      itens: [{ produtoId: 1001, precoLiquido: 1.80 }]
    }, testDb);

    // Resposta 2: Profarma (R$ 1,50 Dipirona com bonificação)
    comprasCotacoesService.registrarRespostaCotacao(cotacaoDb.id, {
      fornecedorId: 'forn_pf_02',
      distribuidora: 'Profarma',
      telefone: '5532988882222',
      precoLiquido: 1.50,
      prazoDias: 42,
      itens: [{ produtoId: 1001, precoLiquido: 1.50 }]
    }, testDb);

    const detalhe = comprasCotacoesService.obterCotacao(cotacaoDb.id, testDb);
    assert.strictEqual(detalhe.respostas.length, 2);
    assert.strictEqual(detalhe.respostas[0].fornecedor_id, 'forn_pf_02', 'Profarma venceu por menor preço e maior prazo');
    assert.strictEqual(detalhe.respostas[0].vencedor, true);
  });

  test('7.3 - Repasse de Quebra Persistido no SQLite', () => {
    const cotacaoDb = testDb.prepare('SELECT id FROM compras_cotacoes LIMIT 1').get();

    // Profarma informa quebra por falta de estoque
    const repasse = comprasCotacoesService.tratarQuebraFornecedor(cotacaoDb.id, 'forn_pf_02', { db: testDb });
    assert.strictEqual(repasse.status, 'reallocated');
    assert.strictEqual(repasse.novoVencedorId, 'forn_sc_01');

    // Verifica persistência na tabela compras_fornecedores_meta (+15% taxa de quebra)
    const fornPf = testDb.prepare('SELECT taxa_quebra_percent FROM compras_fornecedores_meta WHERE id = ?').get('forn_pf_02');
    assert.strictEqual(fornPf.taxa_quebra_percent, 20); // 5 + 15 = 20%
  });

  // ──────────────────────────────────────────────────────────
  // Resumo Final
  // ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`📊 RESULTADO FINAL: ${passedTests}/${totalTests} TESTES PASSARAM COM SUCESSO!`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }

})();
