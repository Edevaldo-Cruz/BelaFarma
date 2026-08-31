/**
 * stress_test_m2.js
 * Suíte de Testes de Stress Adversarial para o Milestone M2:
 * Offer Parsing, Mineração Histórica, Textos Informais e Edge Cases.
 *
 * Executado pelo Challenger 1 (critic / specialist)
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendPath = path.join(__dirname, '../../backend/server.js');
const require = createRequire(backendPath);

const assert = require('assert');
const Database = require('better-sqlite3');

const servicePath = path.join(__dirname, '../../backend/services/compras-mineracao.service.js');
const comprasMineracaoService = require(servicePath);

console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
console.log('║ ⚡ EMPIRICAL CHALLENGER M2: STRESS TEST & ADVERSARIAL HARNESS               ║');
console.log('║ Módulo: Central de Compras - Offer Parsing, Informality & Edge Cases         ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════════╝\n');

let passedTests = 0;
let failedTests = 0;
let totalTests = 0;
const testResults = [];

function test(category, name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] [${category}] ${name}`);
    passedTests++;
    testResults.push({ category, name, status: 'PASS' });
  } catch (err) {
    failedTests++;
    console.error(`  ❌ [FAIL] [${category}] ${name}`);
    console.error(`     Erro: ${err.message}`);
    testResults.push({ category, name, status: 'FAIL', error: err.message, stack: err.stack });
  }
}

async function testAsync(category, name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] [${category}] ${name}`);
    passedTests++;
    testResults.push({ category, name, status: 'PASS' });
  } catch (err) {
    failedTests++;
    console.error(`  ❌ [FAIL] [${category}] ${name}`);
    console.error(`     Erro: ${err.message}`);
    testResults.push({ category, name, status: 'FAIL', error: err.message, stack: err.stack });
  }
}

function createFreshTestDb() {
  const db = new Database(':memory:');
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS compras_historico_mensagens (
      id TEXT PRIMARY KEY,
      message_id TEXT UNIQUE,
      remote_jid TEXT NOT NULL,
      telefone TEXT NOT NULL,
      nome_contato TEXT,
      from_me INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL,
      data_hora TEXT NOT NULL,
      tipo_mensagem TEXT DEFAULT 'texto',
      texto_mensagem TEXT,
      midia_path TEXT,
      processado_mineracao INTEGER DEFAULT 0,
      resultado_mineracao_json TEXT,
      created_at TEXT NOT NULL
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
      created_at TEXT NOT NULL,
      FOREIGN KEY (fornecedor_id) REFERENCES compras_fornecedores_meta(id)
    );

    CREATE TABLE IF NOT EXISTS local_suppliers (
      id TEXT PRIMARY KEY,
      digifarma_id INTEGER,
      representante TEXT,
      telefone TEXT,
      prazo_boletos TEXT,
      createdAt TEXT
    );
  `);
  return db;
}

(async () => {

  // ═════════════════════════════════════════════════════════════
  // SUÍTE 1: Textos Informais de Representantes & Jargão WhatsApp
  // ═════════════════════════════════════════════════════════════
  console.log('\n💬 SUÍTE 1: Mineração em Mensagens Informais, Gírias e Emojis');

  test('SUITE 1', '1.1 - Mensagem informal com áudio transcript / gírias e caixa baixa', () => {
    const texto = `e ai meu amigo belezinha sou o fabiano vendedor aqui da santa cruz to passando pra te passar as ofertas do dia fechamento minimo de 450 reais prazos 28/35/42 no boleto\n- dipirona 500mg gotas r$ 1,95\n- paracetamol 750mg c/ 20 cx por r$ 2,10`;
    const res = comprasMineracaoService.minerarTextoLivre(texto, { phone: '5532984112233' });
    assert.strictEqual(res.distribuidora, 'Santa Cruz', 'Deve extrair distribuidora Santa Cruz');
    assert.strictEqual(res.representante, 'fabiano', 'Deve extrair representante Fabiano');
    assert.strictEqual(res.pedidoMinimoValor, 450, 'Deve extrair pedido mínimo 450');
    assert.ok(res.prazosPagamento.includes('28/35/42'), 'Deve capturar prazo 28/35/42');
    assert.strictEqual(res.ofertas.length, 2, 'Deve extrair 2 ofertas');
    assert.strictEqual(res.ofertas[0].precoOfertado, 1.95);
    assert.strictEqual(res.ofertas[1].precoOfertado, 2.10);
  });

  test('SUITE 1', '1.2 - Mensagem com markdown negrito no nome (*Bruno*) e emojis', () => {
    const texto = `🔥🚨 *MEGA OFERTA PANPHARMA* 🚨🔥\nFala Dr. Edevaldo! 👨‍⚕️💊 Aqui é o *Bruno* da *Panpharma* trazendo os melhores preços de genéricos da Eurofarma!\n📦 Faturamento mínimo: R$ 800,00\n💳 Condição: 30/60/90 dias\n\n🎯 *CONFIRA AS OFERTAS:* 🎯\n💥 7891058001122 Amoxicilina 500mg 21 caps por R$ 9,80\n💥 7896004701234 Losartana 50mg c/ 30 cp R$ 1,75\n💥 Omeprazol 20mg c/ 28 caps R$ 3,90`;
    const res = comprasMineracaoService.minerarTextoLivre(texto, { phone: '5532991223344' });
    assert.strictEqual(res.distribuidora, 'Panpharma');
    assert.strictEqual(res.pedidoMinimoValor, 800);
    assert.ok(res.prazosPagamento.includes('30/60/90'));
    // Deve extrair 3 ofertas reais (ignorando a linha de faturamento mínimo com emoji)
    assert.strictEqual(res.ofertas.length, 3, 'Deve extrair apenas 3 produtos e não classificar a linha de faturamento mínimo como produto');
    assert.strictEqual(res.representante, 'Bruno', 'Deve extrair Bruno mesmo formatado como *Bruno* no WhatsApp');
  });

  test('SUITE 1', '1.3 - Apresentação formal com assinatura no rodapé (Att: Consultor Comercial)', () => {
    const texto = `Prezados clientes BelaFarma,\nSegue cotação especial de antibióticos com entrega expressa.\nPedido mínimo R$ 1.500,00 com frete CIF incluso.\nCondição de pagamento: 28 ddl no boleto bancário.\n\n- Azitromicina 500mg c/ 3 comp R$ 6,50\n- Cefalexina 500mg c/ 10 comp R$ 8,20\n\nAtenciosamente,\nMarcio Ferreira\nConsultor Comercial - Distribuidora Profarma`;
    const res = comprasMineracaoService.minerarTextoLivre(texto, { phone: '5532988776655' });
    assert.strictEqual(res.distribuidora, 'Profarma');
    assert.strictEqual(res.pedidoMinimoValor, 1500);
    assert.ok(res.prazosPagamento.some(p => p.includes('28')));
    assert.strictEqual(res.ofertas.length, 2);
    assert.strictEqual(res.representante, 'Marcio Ferreira', 'Deve extrair Marcio Ferreira e não a palavra Comercial');
  });

  test('SUITE 1', '1.4 - Mensagem sem nome no corpo do texto mas com pushName no contato', () => {
    const texto = `Bom dia! Segue encarte da Profarma. Pedido mínimo R$ 400,00. Prazos 28/35/42.\n- Dipirona 500mg cx 100 R$ 1,50`;
    const res = comprasMineracaoService.minerarTextoLivre(texto, { phone: '5532991112222', nome: 'Luciana Profarma' });
    assert.strictEqual(res.distribuidora, 'Profarma');
    assert.strictEqual(res.representante, 'Luciana Profarma', 'Usa o nome do contato quando não há auto-apresentação no texto');
    assert.strictEqual(res.ofertas.length, 1);
  });

  // ═════════════════════════════════════════════════════════════
  // SUÍTE 2: Prazos de Pagamento Complexos e Atípicos
  // ═════════════════════════════════════════════════════════════
  console.log('\n📅 SUÍTE 2: Prazos de Pagamento Complexos (DDL, Parcelados, À Vista, Pix)');

  test('SUITE 2', '2.1 - Prazos longos de 4 a 5 parcelas (ex: 28/35/42/49/56 ddl)', () => {
    const texto = 'Trabalhamos com linha completa de éticos no prazo estendido 28/35/42/49/56 ddl para pedidos acima do mínimo.';
    const prazos = comprasMineracaoService.extrairPrazos(texto);
    assert.ok(prazos.includes('28/35/42/49/56'), 'Deve extrair prazo estendido de 5 parcelas');
  });

  test('SUITE 2', '2.2 - Prazos múltiplos de 15 em 15 dias (ex: 15/30/45/60)', () => {
    const texto = 'Condição especial 15/30/45/60 dias direto no boleto.';
    const prazos = comprasMineracaoService.extrairPrazos(texto);
    assert.ok(prazos.includes('15/30/45/60'), 'Deve capturar 15/30/45/60');
  });

  test('SUITE 2', '2.3 - Prazos únicos explícitos e menção a DDL (ex: 45 ddl, boleto 60 dias)', () => {
    const t1 = 'Faturamento para 45 ddl sem juros.';
    const p1 = comprasMineracaoService.extrairPrazos(t1);
    assert.ok(p1.some(p => p.includes('45')), 'Deve capturar 45 dias/ddl');

    const t2 = 'Pagamento em boleto 60 dias da emissão.';
    const p2 = comprasMineracaoService.extrairPrazos(t2);
    assert.ok(p2.some(p => p.includes('60')), 'Deve capturar 60 dias');
  });

  test('SUITE 2', '2.4 - Pagamento À vista com menção a Pix e antecipado', () => {
    const t1 = 'Preço promocional válido apenas para pagamento a vista via pix.';
    const p1 = comprasMineracaoService.extrairPrazos(t1);
    assert.ok(p1.includes('À vista'), 'Deve capturar À vista com a vista');

    const t2 = 'Condição especial com faturamento antecipado.';
    const p2 = comprasMineracaoService.extrairPrazos(t2);
    assert.ok(p2.includes('À vista'), 'Deve capturar À vista para antecipado');
  });

  test('SUITE 2', '2.5 - Mensagem combinando prazo parcelado E à vista', () => {
    const texto = 'Trabalhamos com 28/35/42 dias no faturado ou à vista com 3% de desconto.';
    const prazos = comprasMineracaoService.extrairPrazos(texto);
    assert.ok(prazos.includes('28/35/42'), 'Deve conter 28/35/42');
    assert.ok(prazos.includes('À vista'), 'Deve conter À vista');
  });

  test('SUITE 2', '2.6 - Variações de 21/28/35/42 dias', () => {
    const texto = 'Condição especial Santa Cruz: 21/28/35/42 ddl para genéricos.';
    const prazos = comprasMineracaoService.extrairPrazos(texto);
    assert.ok(prazos.includes('21/28/35/42'));
  });

  // ═════════════════════════════════════════════════════════════
  // SUÍTE 3: Bonificações Compostas & Descontos Progressivos
  // ═════════════════════════════════════════════════════════════
  console.log('\n🎁 SUÍTE 3: Bonificações Compostas, Descontos Combinados e Fórmulas Matemáticas');

  test('SUITE 3', '3.1 - Bonificação clássica "compre X ganhe Y" (ex: compre 10 ganhe 2)', () => {
    const texto = '- Dipirona 500mg cx 100 R$ 2,40 (compre 10 ganhe 2)';
    const ofertas = comprasMineracaoService.extrairLinhasDeOferta(texto);
    assert.strictEqual(ofertas.length, 1);
    // 10 * 2.40 / 12 = 2.00
    assert.strictEqual(ofertas[0].precoBruto, 2.40);
    assert.strictEqual(ofertas[0].precoOfertado, 2.00);
  });

  test('SUITE 3', '3.2 - Bonificação "compre X leve Y" (ex: compre 20 leve 25)', () => {
    const texto = '- Paracetamol 750mg c/ 20 R$ 3,00 (compre 20 leve 25)';
    const ofertas = comprasMineracaoService.extrairLinhasDeOferta(texto);
    assert.strictEqual(ofertas.length, 1);
    // 20 * 3.00 / 25 = 2.40
    assert.strictEqual(ofertas[0].precoBruto, 3.00);
    assert.strictEqual(ofertas[0].precoOfertado, 2.40);
  });

  test('SUITE 3', '3.3 - Bonificação em formato "X+Y" (ex: 10+2, 5+1, 100+20)', () => {
    const t1 = '- Nimesulida 100mg c/ 12 R$ 3,60 (10+2)';
    const ofr1 = comprasMineracaoService.extrairLinhasDeOferta(t1);
    assert.strictEqual(ofr1.length, 1);
    // 10 * 3.60 / 12 = 3.00
    assert.strictEqual(ofr1[0].precoOfertado, 3.00);

    const t2 = '- Ibuprofeno 600mg c/ 20 R$ 6,00 (5+1)';
    const ofr2 = comprasMineracaoService.extrairLinhasDeOferta(t2);
    // 5 * 6.00 / 6 = 5.00
    assert.strictEqual(ofr2[0].precoOfertado, 5.00);

    const t3 = '- Dipirona 500mg c/ 100 R$ 2,40 (100+20)';
    const ofr3 = comprasMineracaoService.extrairLinhasDeOferta(t3);
    // 100 * 2.40 / 120 = 2.00
    assert.strictEqual(ofr3[0].precoOfertado, 2.00);
  });

  test('SUITE 3', '3.4 - Bonificação Composta: "10+2 com 10% de desconto"', () => {
    const texto = '- Omeprazol 20mg c/ 28 caps R$ 12,00 (10+2) com 10% de desconto';
    const ofertas = comprasMineracaoService.extrairLinhasDeOferta(texto);
    assert.strictEqual(ofertas.length, 1);
    // Preço bruto: 12.00
    // Bonificação 10+2: 10 * 12.00 / 12 = 10.00
    // Desconto 10%: 10.00 * 0.90 = 9.00
    assert.strictEqual(ofertas[0].precoBruto, 12.00);
    assert.strictEqual(ofertas[0].precoOfertado, 9.00);
  });

  test('SUITE 3', '3.5 - Bonificação Composta: "compre 50 leve 60 com 5% off"', () => {
    const texto = '- Losartana Potássica 50mg c/ 30 R$ 2,40 (compre 50 leve 60) com 5% off';
    const ofertas = comprasMineracaoService.extrairLinhasDeOferta(texto);
    assert.strictEqual(ofertas.length, 1);
    // Preço bruto: 2.40
    // Bonificação 50/60: 50 * 2.40 / 60 = 2.00
    // Desconto 5%: 2.00 * 0.95 = 1.90
    assert.strictEqual(ofertas[0].precoBruto, 2.40);
    assert.strictEqual(ofertas[0].precoOfertado, 1.90);
  });

  test('SUITE 3', '3.6 - Desconto com percentual decimal (ex: 7.5% de desconto / 12,5% off)', () => {
    const t1 = '- Captopril 25mg c/ 30 R$ 4,00 com 7.5% de desconto';
    const ofr1 = comprasMineracaoService.extrairLinhasDeOferta(t1);
    // 4.00 * (1 - 0.075) = 3.70
    assert.strictEqual(ofr1[0].precoOfertado, 3.70);

    const t2 = '- Atenolol 50mg c/ 30 R$ 8,00 com 12,5% off';
    const ofr2 = comprasMineracaoService.extrairLinhasDeOferta(t2);
    // 8.00 * (1 - 0.125) = 7.00
    assert.strictEqual(ofr2[0].precoOfertado, 7.00);
  });

  test('SUITE 3', '3.7 - Formato "leve X pague Y" ou "pague X leve Y"', () => {
    const t1 = '- Dipirona 500mg cx 100 R$ 2,40 (leve 12 pague 10)';
    const ofr1 = comprasMineracaoService.extrairLinhasDeOferta(t1);
    assert.strictEqual(ofr1.length, 1);
    // Preço esperado com desconto de bonificação (10 * 2.40 / 12 = 2.00)
    assert.strictEqual(ofr1[0].precoOfertado, 2.00, 'Deve calcular preco liquido para leve 12 pague 10');
  });

  // ═════════════════════════════════════════════════════════════
  // SUÍTE 4: Múltiplos Produtos & Alta Densidade de Encarte
  // ═════════════════════════════════════════════════════════════
  console.log('\n📋 SUÍTE 4: Múltiplos Produtos em Mensagem Única & Variações de Sintaxe');

  test('SUITE 4', '4.1 - Encarte completo com 12 itens e múltiplos formatos de marcadores e preços', () => {
    const encarte = `
      *TABELÃO DE OFERTAS DA SEMANA - DISTRIBUIDORA SANTA CRUZ*
      Vendedor Carlos Alberto Santa Cruz
      Pedido Mínimo R$ 600,00 | Prazo: 28/35/42 dias

      01) 7891058001010 Dipirona 500mg cx 100 R$ 1,45
      02) 7891058001027 Paracetamol 750mg c/ 20 cx por R$ 2,15
      03) 7891058001034 Ibuprofeno 600mg c/ 20 cx un: 3,40
      04) 7891058001041 Amoxicilina 500mg c/ 21 caps cada 9,90
      05) 7891058001058 Losartana 50mg c/ 30 comp 1,60
      06) 7891058001065 Omeprazol 20mg c/ 28 caps R$ 3,80 (10+2)
      07) 7891058001072 Azitromicina 500mg c/ 3 comp R$ 5,50 com 10% off
      08) 7891058001089 Simvastatina 20mg c/ 30 comp R$ 2,90
      09) 7891058001096 Glibenclamida 5mg c/ 30 comp por 1,10
      10) 7891058001102 Atenolol 50mg c/ 30 comp cada R$ 2,30
      11) 7891058001119 Enalapril 20mg c/ 30 comp 1,95
      12) 7891058001126 Metformina 850mg c/ 30 comp R$ 2,20

      Frete grátis para toda a região! Aguardo seu pedido.
    `;

    const minerado = comprasMineracaoService.minerarTextoLivre(encarte, { phone: '553299887766' });
    assert.strictEqual(minerado.distribuidora, 'Santa Cruz');
    assert.strictEqual(minerado.representante, 'Carlos Alberto');
    assert.strictEqual(minerado.pedidoMinimoValor, 600);
    assert.ok(minerado.prazosPagamento.includes('28/35/42'));
    assert.strictEqual(minerado.ofertas.length, 12, 'Deve extrair exatamente as 12 ofertas do encarte');

    assert.strictEqual(minerado.ofertas[0].ean, '7891058001010');
    assert.strictEqual(minerado.ofertas[0].precoOfertado, 1.45);
    assert.strictEqual(minerado.ofertas[5].precoOfertado, 3.17);
    assert.strictEqual(minerado.ofertas[6].precoOfertado, 4.95);
  });

  test('SUITE 4', '4.2 - Produtos com números na descrição (dosagens, quantidades, apresentações)', () => {
    const texto = `
      - Vitamina C 1000mg c/ 30 comprimidos efervescentes R$ 8,50
      - Complexo B 100 drágeas por R$ 4,20
      - Amoxicilina 500mg + Clavulanato 125mg c/ 14 comp R$ 24,00
      - Dipirona 500mg/ml gotas 20ml R$ 2,10
    `;
    const ofertas = comprasMineracaoService.extrairLinhasDeOferta(texto);
    assert.strictEqual(ofertas.length, 4, 'Deve extrair 4 produtos com números no nome');

    assert.ok(ofertas[0].produtoNome.includes('Vitamina C 1000mg'), 'Preserva 1000mg no nome');
    assert.strictEqual(ofertas[0].precoOfertado, 8.50);

    assert.ok(ofertas[1].produtoNome.includes('Complexo B 100'), 'Preserva 100 no nome');
    assert.strictEqual(ofertas[1].precoOfertado, 4.20);

    assert.ok(ofertas[2].produtoNome.includes('Amoxicilina 500mg + Clavulanato 125mg'), 'Preserva dosagem composta');
    assert.strictEqual(ofertas[2].precoOfertado, 24.00);

    assert.ok(ofertas[3].produtoNome.includes('Dipirona 500mg/ml gotas 20ml'), 'Preserva 500mg/ml e 20ml');
    assert.strictEqual(ofertas[3].precoOfertado, 2.10);
  });

  test('SUITE 4', '4.3 - Sintaxe com marcadores diversos (bolinhas •, traços -, setas > e til ~)', () => {
    const texto = `
      • Dipirona 500mg R$ 1,45
      > Paracetamol 750mg por R$ 2,10
      ~ Losartana 50mg R$ 1,80
      - Omeprazol 20mg R$ 3,90
    `;
    const ofertas = comprasMineracaoService.extrairLinhasDeOferta(texto);
    assert.strictEqual(ofertas.length, 4, 'Deve reconhecer todos os 4 marcadores de lista');
  });

  // ═════════════════════════════════════════════════════════════
  // SUÍTE 5: Casos Limite Adversariais & Robustez a Entradas Inválidas
  // ═════════════════════════════════════════════════════════════
  console.log('\n🛡️ SUÍTE 5: Casos Limite (Edge Cases, Textos Vazios, Ruído, Injeção)');

  test('SUITE 5', '5.1 - Entradas nulas, vazias, strings com apenas espaços e quebras de linha', () => {
    assert.doesNotThrow(() => {
      const r1 = comprasMineracaoService.minerarTextoLivre(null);
      assert.strictEqual(r1.ofertas.length, 0);
      assert.strictEqual(r1.pedidoMinimoValor, 0);

      const r2 = comprasMineracaoService.minerarTextoLivre('');
      assert.strictEqual(r2.ofertas.length, 0);

      const r3 = comprasMineracaoService.minerarTextoLivre('   \n\n\t   \n');
      assert.strictEqual(r3.ofertas.length, 0);

      const p1 = comprasMineracaoService.extrairPrazos(null);
      assert.deepStrictEqual(p1, []);

      const m1 = comprasMineracaoService.extrairPedidoMinimo(undefined);
      assert.strictEqual(m1.valor, 0);
    }, 'Não deve lançar erro em inputs vazios ou nulos');
  });

  test('SUITE 5', '5.2 - Mensagem sem nenhuma oferta (apenas conversa casual)', () => {
    const texto = 'Bom dia amigo, tudo bem? Como foram as vendas do final de semana? Depois me fala se vai precisar de reposição.';
    const res = comprasMineracaoService.minerarTextoLivre(texto, { phone: '5532999998888' });
    assert.strictEqual(res.ofertas.length, 0, 'Zero ofertas para conversa comum');
    assert.strictEqual(res.pedidoMinimoValor, 0, 'Zero pedido mínimo');
  });

  test('SUITE 5', '5.3 - Linhas de ruído que parecem preço mas são totais ou datas', () => {
    const texto = `
      Pedido mínimo R$ 500,00
      Total do encarte R$ 12.500,00
      Tabela válida até 31/12/2026
      - Dipirona 500mg R$ 1,50
    `;
    const ofertas = comprasMineracaoService.extrairLinhasDeOferta(texto);
    assert.strictEqual(ofertas.length, 1, 'Deve extrair apenas o produto Dipirona e ignorar cabeçalho/totais');
    assert.strictEqual(ofertas[0].produtoNome, 'Dipirona 500mg');
    assert.strictEqual(ofertas[0].precoOfertado, 1.50);
  });

  test('SUITE 5', '5.4 - Preços com formatação brasileira de milhar e centavos (ex: 1.250,50 e 1250,50)', () => {
    const texto = `
      - Caixa Fechada Amoxicilina 1000 un R$ 1.250,00
      - Lote Especial Paracetamol R$ 1250,00
    `;
    const ofertas = comprasMineracaoService.extrairLinhasDeOferta(texto);
    assert.strictEqual(ofertas.length, 2);
    assert.strictEqual(ofertas[0].precoOfertado, 1250.00);
    assert.strictEqual(ofertas[1].precoOfertado, 1250.00);
  });

  test('SUITE 5', '5.5 - Strings contendo caracteres especiais e tentativa de SQL Injection', () => {
    const injectionText = `
      Olá, sou o Robert'); DROP TABLE compras_oportunidades_mineradas; -- da Santa Cruz
      Pedido mínimo R$ 300,00
      - Dipirona 500mg'; DELETE FROM compras_fornecedores_meta; -- R$ 1,80
    `;
    const res = comprasMineracaoService.minerarTextoLivre(injectionText, { phone: '553299112233' });
    assert.strictEqual(res.distribuidora, 'Santa Cruz');
    assert.strictEqual(res.ofertas.length, 1);
    assert.strictEqual(res.ofertas[0].precoOfertado, 1.80);
  });

  test('SUITE 5', '5.6 - Variação abreviada de pedido mínimo (ex: "pedido min R$ 400")', () => {
    const t1 = 'Pedido min R$ 400,00 para entrega amanhã.';
    const res = comprasMineracaoService.extrairPedidoMinimo(t1);
    assert.strictEqual(res.valor, 400.00, 'Deve capturar pedido min como 400');
  });

  // ═════════════════════════════════════════════════════════════
  // SUÍTE 6: Validação Comparativa com Histórico Digifarma
  // ═════════════════════════════════════════════════════════════
  console.log('\n📊 SUÍTE 6: Validação Comparativa de Preços e Detecção de Ruptura');

  const testDb = createFreshTestDb();

  testDb.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, est_minimo_calculado, custo_unitario, ultima_compra_valor, status_ruptura, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(201, 'DIPIRONA 500MG CX 100', '7891000000001', 0, 50, 2.00, 2.00, 'RUPTURA_CRITICA', new Date().toISOString());

  testDb.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, est_minimo_calculado, custo_unitario, ultima_compra_valor, status_ruptura, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(202, 'LOSARTANA POTASSICA 50MG 30 COMP', '7891000000002', 10, 100, 2.50, 2.50, 'ABAIXO_MINIMO', new Date().toISOString());

  testDb.prepare(`
    INSERT INTO compras_estoque_cache (
      produto_id, descricao, ean, saldo, est_minimo_calculado, custo_unitario, ultima_compra_valor, status_ruptura, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(203, 'OMEPRAZOL 20MG 28 CAPS', '7891000000003', 80, 50, 4.00, 4.00, 'NORMAL', new Date().toISOString());

  await testAsync('SUITE 6', '6.1 - Validação com Preço Vantajoso e Produto em Ruptura Crítica', async () => {
    const val = await comprasMineracaoService.validarOfertaComDigifarma('DIPIRONA 500MG', '7891000000001', 1.40, testDb, { skipFirebird: true });
    assert.strictEqual(val.produtoId, 201);
    assert.strictEqual(val.precoUltCompra, 2.00);
    assert.strictEqual(val.precoOfertado, 1.40);
    assert.strictEqual(val.precoInferior, true, 'Preço é inferior à última compra');
    assert.strictEqual(val.percentualDesconto, 30.00, 'Economia de 30.00%');
    assert.strictEqual(val.emRuptura, true, 'Sinaliza ruptura');
  });

  await testAsync('SUITE 6', '6.2 - Validação com Preço Desfavorável (Mais caro que última compra)', async () => {
    const val = await comprasMineracaoService.validarOfertaComDigifarma('OMEPRAZOL 20MG', '7891000000003', 4.80, testDb, { skipFirebird: true });
    assert.strictEqual(val.produtoId, 203);
    assert.strictEqual(val.precoUltCompra, 4.00);
    assert.strictEqual(val.precoOfertado, 4.80);
    assert.strictEqual(val.precoInferior, false, 'Preço não é vantajoso');
    assert.strictEqual(val.percentualDesconto, -20.00, 'Desconto negativo de -20%');
    assert.strictEqual(val.emRuptura, false, 'Não está em ruptura');
  });

  await testAsync('SUITE 6', '6.3 - Validação de Produto Novo / Não Encontrado no Cache', async () => {
    const val = await comprasMineracaoService.validarOfertaComDigifarma('MEDICAMENTO INEXISTENTE XYZ', '7899999999999', 50.00, testDb, { skipFirebird: true });
    assert.strictEqual(val.produtoId, null, 'Produto não cadastrado');
    assert.strictEqual(val.precoUltCompra, null, 'Sem histórico anterior');
    assert.strictEqual(val.precoInferior, false);
    assert.strictEqual(val.percentualDesconto, 0);
  });

  // ═════════════════════════════════════════════════════════════
  // SUÍTE 7: Persistência SQLite, Mineração de Histórico & Idempotência
  // ═════════════════════════════════════════════════════════════
  console.log('\n💾 SUÍTE 7: Teste de Carga e Idempotência no Banco de Dados');

  const batchDb = createFreshTestDb();

  await testAsync('SUITE 7', '7.1 - Ingestão em lote de histórico com 10 representantes distintos', async () => {
    const fornecedoresTest = [
      { tel: '5532988010001', nome: 'Rodrigo', dist: 'Santa Cruz', prazos: '28/35/42', min: 400, prod: 'Dipirona 500mg R$ 1,45' },
      { tel: '5532988010002', nome: 'Mariana', dist: 'Panpharma', prazos: '30/60/90', min: 500, prod: 'Paracetamol 750mg R$ 2,10' },
      { tel: '5532988010003', nome: 'Carlos', dist: 'Profarma', prazos: '28 ddl', min: 600, prod: 'Losartana 50mg R$ 1,80' },
      { tel: '5532988010004', nome: 'Fernanda', dist: 'Gam', prazos: '21/28/35', min: 350, prod: 'Amoxicilina 500mg R$ 9,50' },
      { tel: '5532988010005', nome: 'Marcos', dist: 'Medcom', prazos: '30 ddl', min: 800, prod: 'Omeprazol 20mg R$ 3,70' },
      { tel: '5532988010006', nome: 'Juliana', dist: 'Dimebras', prazos: '14/28', min: 300, prod: 'Azitromicina 500mg R$ 5,80' },
      { tel: '5532988010007', nome: 'Lucas', dist: 'Dislab', prazos: '28/35/42/49', min: 1000, prod: 'Simvastatina 20mg R$ 2,60' },
      { tel: '5532988010008', nome: 'Patricia', dist: 'Total Distribuidora', prazos: '30/60', min: 450, prod: 'Atenolol 50mg R$ 2,20' },
      { tel: '5532988010009', nome: 'Gabriel', dist: 'Riofarmac', prazos: '28 ddl', min: 500, prod: 'Glibenclamida 5mg R$ 1,15' },
      { tel: '5532988010010', nome: 'Amanda', dist: 'Servmed', prazos: '30/60/90', min: 700, prod: 'Ibuprofeno 600mg R$ 3,30' }
    ];

    for (let i = 0; i < fornecedoresTest.length; i++) {
      const f = fornecedoresTest[i];
      batchDb.prepare(`
        INSERT INTO compras_historico_mensagens (
          id, message_id, remote_jid, telefone, nome_contato, from_me, timestamp, data_hora, tipo_mensagem, texto_mensagem, processado_mineracao, created_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'texto', ?, 0, ?)
      `).run(
        `msg_${i}`, `mid_${i}`, `${f.tel}@s.whatsapp.net`, f.tel, `${f.nome} ${f.dist}`,
        Date.now() - (i * 3600000), new Date().toISOString(),
        `Olá! Sou o ${f.nome} da ${f.dist}. Prazos ${f.prazos} e pedido mínimo R$ ${f.min},00.\n- ${f.prod}`,
        new Date().toISOString()
      );
    }

    const relatorio1 = await comprasMineracaoService.minerarHistoricoConversas(batchDb, { limit: 50, skipFirebird: true });
    assert.strictEqual(relatorio1.totalMensagensProcessadas, 10, 'Deve processar todas as 10 mensagens');
    assert.strictEqual(relatorio1.representantesCadastrados, 10, 'Deve cadastrar os 10 fornecedores');
    assert.strictEqual(relatorio1.ofertasIndexadas, 10, 'Deve indexar 10 ofertas');

    const fornecedores = comprasMineracaoService.listarFornecedoresMinerados(batchDb);
    assert.strictEqual(fornecedores.length, 10, 'Lista 10 fornecedores');
  });

  await testAsync('SUITE 7', '7.2 - Idempotência: Reprocessamento sem duplicar fornecedores', async () => {
    const relatorio2 = await comprasMineracaoService.minerarHistoricoConversas(batchDb, { limit: 50, skipFirebird: true });
    assert.strictEqual(relatorio2.totalMensagensProcessadas, 0, 'Zero mensagens pendentes na 2ª rodada');
    assert.strictEqual(relatorio2.representantesCadastrados, 10, 'Total de fornecedores continua 10');

    const relatorio3 = await comprasMineracaoService.minerarHistoricoConversas(batchDb, { limit: 50, reprocessarTudo: true, skipFirebird: true });
    assert.strictEqual(relatorio3.totalMensagensProcessadas, 10);
    const countTotal = batchDb.prepare('SELECT COUNT(*) as total FROM compras_fornecedores_meta').get().total;
    assert.strictEqual(countTotal, 10, 'Garante integridade única por telefone/distribuidora');
  });

  // ═════════════════════════════════════════════════════════════
  // SUÍTE 8: Isolamento e Robustez Geral
  // ═════════════════════════════════════════════════════════════
  console.log('\n🔒 SUÍTE 8: Isolamento de Sessão e Trava de Segurança');

  test('SUITE 8', '8.1 - Verificação de Isolamento do WhatsApp Comercial', () => {
    const baileysComprasService = require(path.join(__dirname, '../../backend/baileys-compras-service.js'));
    assert.ok(baileysComprasService.SESSION_DIR.includes('baileys-session-compras'), 'Diretório isolado exclusivo');
    const status = baileysComprasService.getStatus();
    assert.ok(status !== null && typeof status === 'object');
    assert.strictEqual(typeof status.connected, 'boolean');
  });

  // ─────────────────────────────────────────────────────────────
  // Resumo Final da Execução
  // ─────────────────────────────────────────────────────────────
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║ 🏁 RESULTADO DO STRESS TEST M2: ${passedTests}/${totalTests} PASSARAM (${failedTests} FALHAS IDENTIFICADAS)`);
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝\n');

  if (failedTests > 0) {
    console.log('📋 Detalhes das Falhas Encontradas:');
    testResults.filter(t => t.status === 'FAIL').forEach(f => {
      console.log(`  ❌ [${f.category}] ${f.name}`);
      console.log(`     Motivo: ${f.error}`);
    });
  } else {
    console.log('🌟 TODOS OS TESTES PASSARAM COM SUCESSO!');
  }

})();
