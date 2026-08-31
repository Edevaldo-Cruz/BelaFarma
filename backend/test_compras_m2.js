/**
 * test_compras_m2.js
 * Suíte de Testes Automatizados para a Instância Isolada Baileys Compras
 * e o Motor de Mineração Histórica (Worker M2 - R2 / F4, F5, F6).
 */

const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const comprasMineracaoService = require('./services/compras-mineracao.service');
const baileysComprasService = require('./baileys-compras-service');

console.log('═══════════════════════════════════════════════════════════════');
console.log('🧪 INICIANDO TESTES DO WORKER M2 (WhatsApp Compras & Mineração)');
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
// 1. Testes de Parsing Determinístico & Regex de Mineração
// ──────────────────────────────────────────────────────────
console.log('📋 GRUPO 1: Parser Determinístico & Extração de Padrões Comerciais');

test('1.1 - Extração de Prazos de Pagamento em múltiplos formatos', () => {
  const t1 = 'Olá, segue tabela com prazos 28/35/42 dias no boleto para farmácias.';
  const prazos1 = comprasMineracaoService.extrairPrazos(t1);
  assert.ok(prazos1.includes('28/35/42'), 'Deve identificar prazo 28/35/42');

  const t2 = 'Condição especial 30/60/90 ou 30 ddl com 2% de desconto.';
  const prazos2 = comprasMineracaoService.extrairPrazos(t2);
  assert.ok(prazos2.includes('30/60/90'), 'Deve identificar prazo 30/60/90');
  assert.ok(prazos2.some(p => p.includes('30')), 'Deve identificar prazo de 30 dias');

  const t3 = 'Pagamento à vista com 5% de desconto extra via Pix.';
  const prazos3 = comprasMineracaoService.extrairPrazos(t3);
  assert.ok(prazos3.includes('À vista'), 'Deve identificar À vista');
});

test('1.2 - Extração de Pedido Mínimo e Faturamento Mínimo', () => {
  const t1 = 'Bom dia! Pedido mínimo R$ 350,00 para entrega amanhã cedo.';
  const min1 = comprasMineracaoService.extrairPedidoMinimo(t1);
  assert.strictEqual(min1.valor, 350.00, 'Deve extrair R$ 350,00');

  const t2 = 'Faturamento mínimo de R$ 1.200,00 com frete grátis para a região.';
  const min2 = comprasMineracaoService.extrairPedidoMinimo(t2);
  assert.strictEqual(min2.valor, 1200.00, 'Deve extrair R$ 1.200,00');
  assert.ok(min2.condicoes.toLowerCase().includes('frete grátis'), 'Deve capturar condição de frete');

  const t3 = 'Sem pedido mínimo para esta linha promocional.';
  const min3 = comprasMineracaoService.extrairPedidoMinimo(t3);
  assert.strictEqual(min3.valor, 0, 'Valor zero quando não há mínimo numérico');
});

test('1.3 - Identificação de Distribuidoras e Laboratórios Farmacêuticos', () => {
  const t1 = 'Aqui é o Carlos da Distribuidora Santa Cruz com as ofertas da semana.';
  const info1 = comprasMineracaoService.extrairDistribuidoraELaboratorios(t1);
  assert.strictEqual(info1.distribuidora, 'Santa Cruz', 'Deve identificar Santa Cruz');

  const t2 = 'Campanha especial Panpharma para os produtos da Eurofarma e Neo Química.';
  const info2 = comprasMineracaoService.extrairDistribuidoraELaboratorios(t2);
  assert.strictEqual(info2.distribuidora, 'Panpharma', 'Deve identificar Panpharma');
  assert.ok(info2.laboratorios.includes('Eurofarma'), 'Deve identificar laboratório Eurofarma');
  assert.ok(info2.laboratorios.includes('Neo Química'), 'Deve identificar laboratório Neo Química');
});

test('1.4 - Identificação do Nome do Representante', () => {
  const t1 = 'Sou o Rodrigo representante da Profarma em Juiz de Fora e região.';
  const rep1 = comprasMineracaoService.extrairNomeRepresentante(t1);
  assert.strictEqual(rep1, 'Rodrigo', 'Deve extrair Rodrigo');

  const t2 = 'Bom dia! Aqui é a Mariana da Medcom. Tudo bem?';
  const rep2 = comprasMineracaoService.extrairNomeRepresentante(t2);
  assert.strictEqual(rep2, 'Mariana', 'Deve extrair Mariana');
});

test('1.5 - Parser de Linhas de Ofertas com Bonificação e Desconto', () => {
  const texto = `
    *TABELA PROMOCIONAL DA SEMANA*
    - Dipirona 500mg 10x10 cx c/ 100 R$ 1,45
    - 7891058001234 Amoxicilina 500mg c/ 21 caps por R$ 12,00 (compre 10 ganhe 2)
    - Paracetamol 750mg c/ 20 cx por R$ 2,50 com 10% de desconto
    - Losartana Potássica 50mg c/ 30 R$ 1,80
  `;

  const ofertas = comprasMineracaoService.extrairLinhasDeOferta(texto);
  assert.strictEqual(ofertas.length, 4, 'Deve extrair 4 ofertas');

  // Oferta 1: Dipirona
  assert.ok(ofertas[0].produtoNome.toLowerCase().includes('dipirona'), 'Oferta 1 é Dipirona');
  assert.strictEqual(ofertas[0].precoOfertado, 1.45, 'Preço unitário 1.45');

  // Oferta 2: Amoxicilina com Bonificação 10+2
  // Preço bruto: 12.00. Com 10 recebendo 12: precoLiquido = (10 * 12) / 12 = 10.00
  assert.strictEqual(ofertas[1].ean, '7891058001234', 'EAN identificado');
  assert.strictEqual(ofertas[1].precoBruto, 12.00, 'Preço bruto 12.00');
  assert.strictEqual(ofertas[1].precoOfertado, 10.00, 'Preço líquido calculado com bonificação deve ser 10.00');

  // Oferta 3: Paracetamol com 10% de desconto
  // Preço bruto: 2.50. Com 10%: precoLiquido = 2.25
  assert.strictEqual(ofertas[2].precoBruto, 2.50, 'Preço bruto 2.50');
  assert.strictEqual(ofertas[2].precoOfertado, 2.25, 'Preço líquido com 10% desc deve ser 2.25');

  // Oferta 4: Losartana
  assert.strictEqual(ofertas[3].precoOfertado, 1.80, 'Preço 1.80');
});

// ──────────────────────────────────────────────────────────
// 2. Testes de Integração com Banco SQLite e Comparador Digifarma
// ──────────────────────────────────────────────────────────
console.log('\n💾 GRUPO 2: Integração de Banco SQLite & Comparador de Preço');

const testDb = new Database(':memory:');

// Inicializa schema SQLite no banco em memória
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

  CREATE TABLE IF NOT EXISTS compras_fila_aprovacao (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    destinatario_telefone TEXT NOT NULL,
    destinatario_nome TEXT NOT NULL,
    fornecedor_id TEXT,
    fornecedor_nome TEXT NOT NULL,
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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

// Insere dados de cache de produto para testar comparação de preços
testDb.prepare(`
  INSERT INTO compras_estoque_cache (
    produto_id, descricao, ean, saldo, est_minimo_calculado, custo_unitario, ultima_compra_valor, status_ruptura, atualizado_em
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(101, 'DIPIRONA 500MG CX 100', '7891112223334', 0, 50, 2.00, 2.00, 'RUPTURA_CRITICA', new Date().toISOString());

testDb.prepare(`
  INSERT INTO compras_estoque_cache (
    produto_id, descricao, ean, saldo, est_minimo_calculado, custo_unitario, ultima_compra_valor, status_ruptura, atualizado_em
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(102, 'AMOXICILINA 500MG 21 CAPS', '7894445556667', 5, 20, 15.00, 14.00, 'ABAIXO_MINIMO', new Date().toISOString());

(async () => {

  await testAsync('2.1 - Validador de Oferta contra última compra no Digifarma / Cache', async () => {
    // Dipirona: última compra foi 2.00, oferta é 1.45 (27.5% de desconto!)
    const val1 = await comprasMineracaoService.validarOfertaComDigifarma('DIPIRONA 500MG', '7891112223334', 1.45, testDb, { skipFirebird: true });
    assert.strictEqual(val1.produtoId, 101, 'Deve localizar produto 101');
    assert.strictEqual(val1.precoUltCompra, 2.00, 'Preço de última compra 2.00');
    assert.strictEqual(val1.precoInferior, true, 'Preço ofertado é inferior ao do Digifarma');
    assert.strictEqual(val1.percentualDesconto, 27.50, 'Economia calculada em 27.50%');
    assert.strictEqual(val1.emRuptura, true, 'Produto está em ruptura (saldo = 0)');

    // Amoxicilina: última compra foi 14.00, oferta é 10.00 (28.57% de desconto)
    const val2 = await comprasMineracaoService.validarOfertaComDigifarma('AMOXICILINA 500MG', '7894445556667', 10.00, testDb, { skipFirebird: true });
    assert.strictEqual(val2.produtoId, 102, 'Deve localizar produto 102');
    assert.strictEqual(val2.precoUltCompra, 14.00, 'Preço anterior 14.00');
    assert.strictEqual(val2.precoInferior, true, 'Oferta mais vantajosa');
    assert.strictEqual(val2.percentualDesconto, 28.57, 'Economia calculada em 28.57%');
  });

  await testAsync('2.2 - Ingestão de Mensagem de WhatsApp e Cadastro de Fornecedor / Ofertas', async () => {
    const msg = {
      messageId: 'msg_test_001',
      remoteJid: '5532988887777@s.whatsapp.net',
      phone: '5532988887777',
      contactName: 'Ricardo Santa Cruz',
      text: `Olá Edevaldo! Aqui é o Ricardo da Santa Cruz.
Temos condição especial com prazo 28/35/42 dias.
Pedido mínimo R$ 400,00 com frete incluso.
Ofertas de hoje:
- 7891112223334 DIPIRONA 500MG CX 100 R$ 1,45
- 7894445556667 AMOXICILINA 500MG 21 CAPS R$ 10,00
- Losartana 50mg c/ 30 R$ 1,90`,
      timestamp: Date.now()
    };

    const resultado = await comprasMineracaoService.processarMensagemRecebida(msg, testDb, { skipFirebird: true });
    assert.strictEqual(resultado.minerado, true, 'Mensagem processada');
    assert.strictEqual(resultado.fornecedor.distribuidora, 'Santa Cruz', 'Distribuidora cadastrada');
    assert.strictEqual(resultado.fornecedor.representante, 'Ricardo', 'Representante cadastrado');
    assert.strictEqual(resultado.fornecedor.pedidoMinimoValor, 400, 'Pedido mínimo R$ 400');
    assert.ok(resultado.fornecedor.prazosPagamento.includes('28/35/42'), 'Prazo 28/35/42 cadastrado');
    assert.strictEqual(resultado.ofertas.length, 3, '3 ofertas indexadas');

    // Verifica persistência no SQLite
    const fornDb = testDb.prepare('SELECT * FROM compras_fornecedores_meta WHERE telefone = ?').get('5532988887777');
    assert.ok(fornDb, 'Fornecedor gravado em compras_fornecedores_meta');
    assert.strictEqual(fornDb.distribuidora, 'Santa Cruz');

    const ofertasDb = testDb.prepare('SELECT * FROM compras_oportunidades_mineradas WHERE telefone = ?').all('5532988887777');
    assert.strictEqual(ofertasDb.length, 3, '3 ofertas salvas em compras_oportunidades_mineradas');
  });

  await testAsync('2.3 - Varredura e Mineração em Lote de Histórico', async () => {
    // Insere mensagens brutas não processadas no histórico
    testDb.prepare(`
      INSERT INTO compras_historico_mensagens (
        id, message_id, remote_jid, telefone, nome_contato, from_me, timestamp, data_hora, tipo_mensagem, texto_mensagem, processado_mineracao, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'texto', ?, 0, ?)
    `).run(
      'hist_01', 'msg_hist_01', '5532999991111@s.whatsapp.net', '5532999991111', 'Juliana Profarma',
      Date.now() - 86400000, new Date().toISOString(),
      'Bom dia! Juliana da Profarma. Prazos 30/60/90 e pedido mínimo R$ 500. Oferta: Paracetamol 750mg por R$ 1,80.',
      new Date().toISOString()
    );

    const relatorio = await comprasMineracaoService.minerarHistoricoConversas(testDb, { limit: 10, skipFirebird: true });
    assert.ok(relatorio.totalMensagensProcessadas >= 1, 'Deve processar mensagem histórica');
    assert.ok(relatorio.representantesCadastrados >= 2, 'Total de fornecedores agora é pelo menos 2');

    const fornecedores = comprasMineracaoService.listarFornecedoresMinerados(testDb);
    assert.ok(fornecedores.some(f => f.distribuidora === 'Profarma'), 'Profarma cadastrada na varredura');
  });

  test('1.6 - Cálculo de Variações Complexas de Bonificação', () => {
    const t = `
      - Dipirona 500mg cx 100 R$ 2,00 (compre 20 leve 25)
      - Losartana 50mg c/ 30 R$ 4,00 (10+2)
      - Omeprazol 20mg c/ 28 R$ 10,00 (compre 5 leve 6)
      - Ivermectina 6mg c/ 4 R$ 5,00 com 20% off
    `;
    const ofertas = comprasMineracaoService.extrairLinhasDeOferta(t);
    assert.strictEqual(ofertas.length, 4);

    // Dipirona: 20 * 2.00 / 25 = 1.60
    assert.strictEqual(ofertas[0].precoOfertado, 1.60);

    // Losartana: 10 * 4.00 / 12 = 3.33
    assert.strictEqual(ofertas[1].precoOfertado, 3.33);

    // Omeprazol: 5 * 10.00 / 6 = 8.33
    assert.strictEqual(ofertas[2].precoOfertado, 8.33);

    // Ivermectina: 5.00 * 0.80 = 4.00
    assert.strictEqual(ofertas[3].precoOfertado, 4.00);
  });

  test('1.7 - Mineração de Perfil Completo em Texto Livre', () => {
    const texto = `
      Boa tarde farmácia BelaFarma!
      Aqui é o Marcos representante da GAM (Genésio A Mendes).
      Atendemos as linhas de Genéricos, Similares e laboratório EMS e Biolab.
      Nossa condição comercial padrão é 28/35/42 dias no boleto bancário.
      Faturamento mínimo de R$ 600,00 com entrega diária.
    `;
    const perfil = comprasMineracaoService.minerarTextoLivre(texto, { phone: '5532977776666' });
    assert.strictEqual(perfil.distribuidora, 'Gam');
    assert.strictEqual(perfil.representante, 'Marcos');
    assert.strictEqual(perfil.pedidoMinimoValor, 600.00);
    assert.ok(perfil.prazosPagamento.includes('28/35/42'));
    assert.ok(perfil.categorias.some(c => c.includes('EMS')));
    assert.ok(perfil.categorias.some(c => c.includes('Biolab')));
  });

  // ──────────────────────────────────────────────────────────
  // 2. Continuação dos Testes de Banco e Consultas
  // ──────────────────────────────────────────────────────────

  await testAsync('2.4 - Consultas Filtradas de Oportunidades Mineradas', async () => {
    const todas = comprasMineracaoService.listarOportunidades(testDb);
    assert.ok(todas.length >= 3, 'Deve listar pelo menos 3 oportunidades');

    const apenasDesconto = comprasMineracaoService.listarOportunidades(testDb, { apenasComDesconto: true });
    assert.ok(apenasDesconto.every(o => o.percentual_desconto > 0), 'Apenas itens com desconto real');

    const buscaDipirona = comprasMineracaoService.listarOportunidades(testDb, { busca: 'Dipirona' });
    assert.ok(buscaDipirona.length >= 1, 'Busca por Dipirona retorna resultado');
  });

  await testAsync('2.5 - Consulta de Catálogo e Atualização Manual de Fornecedor', async () => {
    const fornecedores = comprasMineracaoService.listarFornecedoresMinerados(testDb);
    assert.ok(fornecedores.length >= 2, 'Pelo menos 2 fornecedores cadastrados');

    const forn1 = fornecedores[0];
    const catalogo = comprasMineracaoService.obterCatalogoFornecedor(testDb, forn1.id);
    assert.ok(catalogo.fornecedor, 'Retorna objeto do fornecedor');
    assert.strictEqual(catalogo.fornecedor.id, forn1.id);

    // Atualiza pontualidade e taxas
    comprasMineracaoService.atualizarFornecedorMeta(testDb, forn1.id, {
      pontualidadeScore: 95.5,
      taxaQuebraPercent: 2.1
    });

    const fornAtualizado = testDb.prepare('SELECT * FROM compras_fornecedores_meta WHERE id = ?').get(forn1.id);
    assert.strictEqual(fornAtualizado.pontualidade_score, 95.5);
    assert.strictEqual(fornAtualizado.taxa_quebra_percent, 2.1);
  });

  await testAsync('2.6 - Oferta Mais Cara que Última Compra (Preço não vantajoso)', async () => {
    // Insere produto com custo 5.00
    testDb.prepare(`
      INSERT INTO compras_estoque_cache (
        produto_id, descricao, ean, saldo, est_minimo_calculado, custo_unitario, ultima_compra_valor, status_ruptura, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(103, 'DORFLEX 36 COMP', '7897778889990', 10, 15, 5.00, 5.00, 'NORMAL', new Date().toISOString());

    // Oferta a 6.00 (20% mais caro)
    const val = await comprasMineracaoService.validarOfertaComDigifarma('DORFLEX 36 COMP', '7897778889990', 6.00, testDb, { skipFirebird: true });
    assert.strictEqual(val.precoInferior, false, 'Oferta mais cara não é inferior');
    assert.strictEqual(val.percentualDesconto, -20.00, 'Desconto negativo (-20%)');
  });

  // ──────────────────────────────────────────────────────────
  // 3. Testes do Serviço Isolado Baileys Compras
  // ──────────────────────────────────────────────────────────
  console.log('\n📱 GRUPO 3: Instância Isolada Baileys Compras & Trava de Segurança');

  test('3.1 - Verificação de Isolamento de Diretório de Sessão', () => {
    const sessionDir = baileysComprasService.SESSION_DIR;
    assert.ok(sessionDir.includes('baileys-session-compras'), 'Diretório exclusivo baileys-session-compras');
    assert.ok(!sessionDir.endsWith('baileys-session'), 'Não compartilha pasta do WhatsApp Principal');
    assert.ok(!sessionDir.endsWith('baileys-session-secondary'), 'Não compartilha pasta do WhatsApp Secundário');
  });

  test('3.2 - Consulta de Status Inicial da Conexão', () => {
    const status = baileysComprasService.getStatus();
    assert.strictEqual(typeof status.connected, 'boolean', 'Campo connected é booleano');
    assert.strictEqual(typeof status.status, 'string', 'Status string válido');
    assert.ok(['connected', 'connecting', 'disconnected', 'qr_ready'].includes(status.status), 'Status normalizado');
  });

  await testAsync('3.3 - Trava de Segurança de Envio (Apenas itens aprovados na fila)', async () => {
    const pendingId = 'appr_pendente_1';
    testDb.prepare(`
      INSERT INTO compras_fila_aprovacao (
        id, tipo, destinatario_telefone, destinatario_nome, fornecedor_id, fornecedor_nome,
        distribuidora, mensagem_texto, status, created_at, updated_at
      ) VALUES (?, 'solicitacao_cotacao', '5532988887777', 'Ricardo', 'forn_1', 'Santa Cruz', 'Santa Cruz', 'Cotação teste', 'pendente', ?, ?)
    `).run(pendingId, new Date().toISOString(), new Date().toISOString());

    // Tentativa de enviar item com status 'pendente' DEVE FALHAR
    let erroCapturado = null;
    try {
      await baileysComprasService.enviarMensagemAprovada(pendingId, testDb);
    } catch (e) {
      erroCapturado = e;
    }
    assert.ok(erroCapturado, 'Deve lançar erro ao tentar enviar mensagem pendente sem aprovação prévia');
    assert.ok(erroCapturado.message.includes('Não é permitido enviar mensagem com status "pendente"'), 'Mensagem de erro explícita');
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
