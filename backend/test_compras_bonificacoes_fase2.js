/**
 * test_compras_bonificacoes_fase2.js
 * Bateria de Testes Automatizados para a Fase 2:
 * 1. Detecção matemática de Bonificações Comerciais (Compre X Leve Y, X+Y, etc.)
 * 2. Cálculo do Preço Líquido Efetivo e Diluição Unitária
 * 3. Validação de Oferta Viabilizada por Bonificação vs Digifarma
 * 4. Listagem com filtro 'apenasBonificadas' e Badges Inteligentes
 * 5. Ranking Estratégico de Oportunidades por Retorno Financeiro Projetado (R$)
 */

const assert = require('assert');
const Database = require('better-sqlite3');
const {
  extrairBonificacaoDetalhada,
  validarOfertaComDigifarma,
  listarOportunidades,
  obterRankingOportunidades,
  processarMensagemRecebida
} = require('./services/compras-mineracao.service');

function setupTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  // Cria tabela de mensagens
  db.exec(`
    CREATE TABLE IF NOT EXISTS compras_historico_mensagens (
      id TEXT PRIMARY KEY,
      message_id TEXT UNIQUE,
      remote_jid TEXT,
      telefone TEXT,
      nome_contato TEXT,
      from_me INTEGER DEFAULT 0,
      timestamp INTEGER,
      data_hora TEXT,
      tipo_mensagem TEXT,
      texto_mensagem TEXT,
      processado_mineracao INTEGER DEFAULT 0,
      resultado_mineracao_json TEXT,
      created_at TEXT
    );
  `);

  // Cria tabela de oportunidades
  db.exec(`
    CREATE TABLE IF NOT EXISTS compras_oportunidades_mineradas (
      id TEXT PRIMARY KEY,
      fornecedor_id TEXT,
      distribuidora TEXT,
      representante TEXT,
      telefone TEXT,
      mensagem_id TEXT,
      mensagem_raw TEXT,
      produto_nome TEXT,
      ean TEXT,
      preco_ofertado REAL,
      qtd_minima INTEGER DEFAULT 1,
      faixas_preco TEXT,
      preco_ult_compra_digifarma REAL,
      percentual_desconto REAL,
      condicoes_pagamento TEXT,
      validade_oferta TEXT,
      validade_texto TEXT,
      is_combo INTEGER DEFAULT 0,
      combo_id TEXT,
      combo_nome TEXT,
      combo_dados TEXT,
      status TEXT DEFAULT 'Aprovado_Radar',
      data_oferta TEXT,
      created_at TEXT,
      estoque_atual REAL DEFAULT 0,
      estoque_minimo REAL DEFAULT 0,
      em_ruptura INTEGER DEFAULT 0,
      ultimo_fornecedor TEXT,
      data_ult_compra TEXT,
      nota_fiscal_ult_compra TEXT,
      embalagem_ult_compra TEXT,
      preco_total_nota REAL,
      produto_id TEXT,
      linha_raw TEXT,
      trecho_original TEXT,
      confianca TEXT,
      precisa_revisao INTEGER DEFAULT 0,
      motivo_revisao TEXT,
      preco_bruto REAL,
      preco_liquido_efetivo REAL,
      tem_bonificacao INTEGER DEFAULT 0,
      bonificacao_detalhe TEXT,
      economia_bonificacao_percentual REAL DEFAULT 0,
      economia_bonificacao_reais REAL DEFAULT 0,
      viabilizada_por_bonificacao INTEGER DEFAULT 0
    );
  `);

  // Cria tabela de cache de estoque
  db.exec(`
    CREATE TABLE IF NOT EXISTS compras_estoque_cache (
      produto_id TEXT PRIMARY KEY,
      ean TEXT,
      descricao TEXT,
      saldo REAL DEFAULT 0,
      est_minimo_calculado REAL DEFAULT 0,
      est_minimo_digifarma REAL DEFAULT 0,
      curva_abc TEXT DEFAULT 'B',
      vendas_30d REAL DEFAULT 0,
      vmd_ponderado REAL DEFAULT 0,
      em_ruptura INTEGER DEFAULT 0,
      cmv_atual REAL DEFAULT 0,
      ativo_10m INTEGER DEFAULT 1,
      atualizado_em TEXT
    );
  `);

  // Cria cache de últimas compras
  db.exec(`
    CREATE TABLE IF NOT EXISTS digifarma_ultimas_compras_cache (
      produto_id TEXT PRIMARY KEY,
      ean TEXT,
      descricao TEXT,
      preco_unitario_ult_compra REAL,
      fornecedor_nome TEXT,
      data_compra TEXT,
      numero_nota_fiscal TEXT,
      embalagem_detalhe TEXT,
      preco_total_nota REAL,
      atualizado_em TEXT
    );
  `);

  return db;
}

async function runTests() {
  console.log('🧪 Iniciando Bateria de Testes da Fase 2 (Bonificações & Ranking)...');
  let passed = 0;

  // TESTE 1: Extração matemática de bonificação "Compre 10 Ganhe 2"
  {
    const bonus = extrairBonificacaoDetalhada('DIPIRONA 500MG C/ 100 R$ 12,00 (COMPRE 10 GANHE 2)', 12.00);
    assert(bonus !== null, 'Deveria detectar bonificação');
    assert.strictEqual(bonus.qtdPaga, 10);
    assert.strictEqual(bonus.qtdBonus, 2);
    assert.strictEqual(bonus.qtdTotal, 12);
    // Preço bruto: 12.00. Paga 10 = 120.00. Leva 12. Preço líquido efetivo = 120 / 12 = 10.00
    assert.strictEqual(bonus.precoLiquidoEfetivo, 10.00);
    assert.strictEqual(bonus.economiaPercentual, 16.67);
    assert.strictEqual(bonus.economiaReaisTotal, 24.00);
    console.log('  ✅ Teste 1 OK: Extração de "Compre 10 Ganhe 2" calculou preço líquido e economia com exatidão.');
    passed++;
  }

  // TESTE 2: Extração padrão "10+2" ou "10 + 2"
  {
    const bonus = extrairBonificacaoDetalhada('LOSARTANA 50MG C/ 30 R$ 5,00 10+2', 5.00);
    assert(bonus !== null, 'Deveria detectar bonificação 10+2');
    assert.strictEqual(bonus.qtdPaga, 10);
    assert.strictEqual(bonus.qtdBonus, 2);
    assert.strictEqual(bonus.qtdTotal, 12);
    assert.strictEqual(bonus.precoLiquidoEfetivo, 4.17);
    console.log('  ✅ Teste 2 OK: Extração no formato "10+2" reconhecida com sucesso.');
    passed++;
  }

  // TESTE 3: Extração padrão "Pague 5 Leve 6"
  {
    const bonus = extrairBonificacaoDetalhada('OMEPRAZOL 20MG C/ 28 R$ 8,00 PAGUE 5 LEVE 6', 8.00);
    assert(bonus !== null, 'Deveria detectar pague 5 leve 6');
    assert.strictEqual(bonus.qtdPaga, 5);
    assert.strictEqual(bonus.qtdBonus, 1);
    assert.strictEqual(bonus.qtdTotal, 6);
    // 5 * 8 = 40. 40 / 6 = 6.67
    assert.strictEqual(bonus.precoLiquidoEfetivo, 6.67);
    console.log('  ✅ Teste 3 OK: Extração no formato "Pague 5 Leve 6" validada.');
    passed++;
  }

  // TESTE 4: Oferta viabilizada por bonificação (Preço bruto >= Digifarma, Líquido < Digifarma)
  {
    const db = setupTestDb();
    // No Digifarma a última compra foi R$ 9,00
    db.prepare(`
      INSERT INTO digifarma_ultimas_compras_cache 
      (produto_id, descricao, preco_unitario_ult_compra, fornecedor_nome, data_compra, atualizado_em)
      VALUES ('PROD1', 'DIPIRONA 500MG', 9.00, 'Distribuidora Santa Cruz', '2026-08-15', datetime('now'))
    `).run();

    // Distribuidora oferece a R$ 10,00 (maior que 9.00!), mas com "Compre 10 Ganhe 2"
    const bonusInfo = extrairBonificacaoDetalhada('DIPIRONA 500MG R$ 10,00 COMPRE 10 GANHE 2', 10.00);
    // Preço líquido é R$ 8,33 (< R$ 9,00!)
    const oferta = {
      produtoNome: 'DIPIRONA 500MG',
      precoOfertado: 10.00,
      precoBruto: 10.00,
      precoLiquidoEfetivo: bonusInfo.precoLiquidoEfetivo,
      temBonificacao: true,
      bonificacaoDetalhe: bonusInfo,
      economiaBonificacaoPercentual: bonusInfo.economiaPercentual,
      economiaBonificacaoReais: bonusInfo.economiaReaisTotal
    };

    const validacao = await validarOfertaComDigifarma(oferta, db);
    assert.strictEqual(validacao.viabilizadaPorBonificacao, true, 'Deveria marcar viabilizadaPorBonificacao como true');
    assert.strictEqual(validacao.status, 'Aprovado_Radar', 'Status deveria ser Aprovado_Radar graças ao preço líquido');
    assert(validacao.percentualDesconto > 0, 'Desconto percentual efetivo deve ser positivo');
    console.log(`  ✅ Teste 4 OK: Viabilização por bonificação ativa (Bruto R$ 10,00 -> Líquido R$ ${validacao.precoLiquidoEfetivo} vs Digifarma R$ 9,00). Desconto: ${validacao.percentualDesconto.toFixed(1)}%.`);
    passed++;
  }

  // TESTE 5: Listar oportunidades com filtro 'apenasBonificadas' e Badges
  {
    const db = setupTestDb();
    // Insere oportunidade normal
    db.prepare(`
      INSERT INTO compras_oportunidades_mineradas (
        id, produto_nome, preco_ofertado, preco_ult_compra_digifarma, percentual_desconto,
        status, data_oferta, created_at, tem_bonificacao, preco_liquido_efetivo
      ) VALUES (
        'OP1', 'IBUPROFENO 400MG', 3.00, 4.00, 25.0,
        'Aprovado_Radar', datetime('now'), datetime('now'), 0, 3.00
      )
    `).run();

    // Insere oportunidade com bonificação viabilizada
    db.prepare(`
      INSERT INTO compras_oportunidades_mineradas (
        id, produto_nome, preco_ofertado, preco_bruto, preco_liquido_efetivo,
        preco_ult_compra_digifarma, percentual_desconto, status, data_oferta, created_at,
        tem_bonificacao, bonificacao_detalhe, viabilizada_por_bonificacao
      ) VALUES (
        'OP2', 'DIPIRONA 500MG', 10.00, 10.00, 8.33,
        9.00, 7.4, 'Aprovado_Radar', datetime('now'), datetime('now'),
        1, '{"tipo":"compre_x_ganhe_y","qtdPaga":10,"qtdBonus":2}', 1
      )
    `).run();

    const todas = listarOportunidades(db, { apenasHoje: false });
    assert.strictEqual(todas.length, 2, 'Deveria listar 2 oportunidades no total');

    const apenasBonif = listarOportunidades(db, { apenasHoje: false, apenasBonificadas: true });
    assert.strictEqual(apenasBonif.length, 1, 'Deveria retornar apenas a oportunidade com bonificação');
    assert.strictEqual(apenasBonif[0].id, 'OP2');
    assert.strictEqual(apenasBonif[0].viabilizadaPorBonificacao, true);
    assert.strictEqual(apenasBonif[0].justificativa.badge, '🎁 Viabilizado por Bônus');
    console.log('  ✅ Teste 5 OK: Filtro apenasBonificadas e Badge inteligente "🎁 Viabilizado por Bônus" operando.');
    passed++;
  }

  // TESTE 6: Ranking Estratégico de Oportunidades com Projeção em R$
  {
    const db = setupTestDb();

    // Produto A: Alta curva (Curva A), alta demanda (100 un/mês), economia R$ 1,00/un -> Economia projetada R$ 100,00
    db.prepare(`
      INSERT INTO compras_estoque_cache (produto_id, descricao, saldo, est_minimo_calculado, curva_abc, vendas_30d, em_ruptura)
      VALUES ('PROD_A', 'LOSARTANA 50MG', 5, 20, 'A', 100, 1)
    `).run();

    db.prepare(`
      INSERT INTO compras_oportunidades_mineradas (
        id, produto_id, produto_nome, preco_ofertado, preco_ult_compra_digifarma,
        percentual_desconto, status, data_oferta, created_at, tem_bonificacao, preco_liquido_efetivo
      ) VALUES (
        'OP_A', 'PROD_A', 'LOSARTANA 50MG', 2.00, 3.00,
        33.3, 'Aprovado_Radar', datetime('now'), datetime('now'), 0, 2.00
      )
    `).run();

    // Produto C: Baixa curva (Curva C), baixa demanda (5 un/mês), economia R$ 10,00/un -> Economia projetada R$ 50,00
    db.prepare(`
      INSERT INTO compras_estoque_cache (produto_id, descricao, saldo, est_minimo_calculado, curva_abc, vendas_30d, em_ruptura)
      VALUES ('PROD_C', 'TERMOMETRO DIGITAL', 20, 10, 'C', 5, 0)
    `).run();

    db.prepare(`
      INSERT INTO compras_oportunidades_mineradas (
        id, produto_id, produto_nome, preco_ofertado, preco_ult_compra_digifarma,
        percentual_desconto, status, data_oferta, created_at, tem_bonificacao, preco_liquido_efetivo
      ) VALUES (
        'OP_C', 'PROD_C', 'TERMOMETRO DIGITAL', 15.00, 25.00,
        40.0, 'Aprovado_Radar', datetime('now'), datetime('now'), 0, 15.00
      )
    `).run();

    const ranking = obterRankingOportunidades(db, { apenasHoje: false });
    assert(ranking.totalOportunidadesAvaliadas === 2, 'Deveria avaliar 2 oportunidades');
    assert(ranking.itens.length === 2, 'Deveria trazer 2 itens ranqueados');
    // Produto A deve ser o primeiro colocado por ser Curva A, em ruptura e gerar maior retorno total em R$ (R$ 100,00 vs R$ 50,00)
    assert.strictEqual(ranking.itens[0].id, 'OP_A', 'Produto A (Curva A em Ruptura) deve liderar o ranking');
    assert.strictEqual(ranking.itens[0].economiaProjetadaReais, 100.00);
    assert.strictEqual(ranking.itens[1].economiaProjetadaReais, 50.00);
    assert.strictEqual(ranking.economiaProjetadaTotalReais, 150.00);
    console.log(`  ✅ Teste 6 OK: Ranking financeiro priorizou Curva A/Ruptura. Economia projetada total: R$ ${ranking.economiaProjetadaTotalReais.toFixed(2)}.`);
    passed++;
  }

  console.log(`\n🎉 Todos os ${passed}/6 testes da Fase 2 passaram com 100% de sucesso!\n`);
}

runTests().catch(err => {
  console.error('❌ Falha nos testes da Fase 2:', err);
  process.exit(1);
});
