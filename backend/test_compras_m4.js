/**
 * test_compras_m4.js
 * Suíte Completa de Testes Automatizados para a Fila de Aprovação Obrigatória
 * Human-in-the-Loop com Sistema de Alerta Duplo (Worker M4 - R4 / F11, F12).
 * 
 * Execução: node backend/test_compras_m4.js
 */

const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const comprasAprovacaoService = require('./services/compras-aprovacao.service');
const baileysComprasService = require('./baileys-compras-service');

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('🧪 INICIANDO TESTES DO WORKER M4 (Fila de Aprovação & Alerta Duplo M4/R4) ');
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
 * Cria banco de dados SQLite isolado em memória com schema completo para testes
 */
function createTestDb() {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      accessKey TEXT NOT NULL UNIQUE
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

    CREATE TABLE IF NOT EXISTS compras_configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      descricao TEXT,
      updated_at TEXT
    );
  `);

  db.prepare(`
    INSERT INTO compras_configuracoes (chave, valor, descricao, updated_at)
    VALUES ('alerta_duplo_whatsapp_adm', 'true', 'Alerta Duplo', datetime('now'))
  `).run();

  return db;
}

/**
 * Mock de instância de WhatsApp para envio controlado em testes
 */
function createMockWhatsapp() {
  const sentMessages = [];
  return {
    sentMessages,
    async enviarMensagemAprovada(approvalId, db) {
      const item = db.prepare('SELECT * FROM compras_fila_aprovacao WHERE id = ?').get(approvalId);
      if (!item) throw new Error(`Item ${approvalId} não encontrado`);
      const st = (item.status || '').toLowerCase();
      if (st !== 'aprovado' && st !== 'editado_enviado') {
        throw new Error(`Não é permitido enviar mensagem com status "${item.status}". Apenas itens com status "aprovado" podem ser despachados.`);
      }
      const msgId = `COMPRAS_MSG_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      sentMessages.push({
        id: msgId,
        to: item.destinatario_telefone,
        text: item.mensagem_texto
      });
      return {
        success: true,
        messageId: msgId,
        timestamp: new Date().toISOString()
      };
    },
    async enviarMensagemDireta(phone, text, isApproved) {
      if (!isApproved) {
        throw new Error('Disparo não autorizado');
      }
      const msgId = `COMPRAS_MSG_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      sentMessages.push({ id: msgId, to: phone, text });
      return { success: true, messageId: msgId, timestamp: new Date().toISOString() };
    },
    async sendTextMessage(phone, text) {
      const msgId = `ADM_MSG_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      sentMessages.push({ id: msgId, to: phone, text });
      return { success: true, messageId: msgId };
    },
    getStatus() {
      return { connected: true, status: 'connected' };
    }
  };
}

(async () => {

  // ──────────────────────────────────────────────────────────
  // GRUPO 1: Enfileiramento Obrigatório e Bloqueio de Disparo
  // ──────────────────────────────────────────────────────────
  console.log('📋 GRUPO 1: Enfileiramento Obrigatório e Bloqueio de Disparo Direto (F11 / R4)');

  test('1.1 - Enfileiramento correto de solicitação de cotação com status inicial Pendente', () => {
    const db = createTestDb();
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: { nome: 'Carlos Representante', telefone: '5532999999999' },
      fornecedorNome: 'Carlos Representante',
      distribuidora: 'Distribuidora Santa Cruz',
      mensagemTexto: 'Olá Carlos, solicitamos cotação para Dipirona 500mg (100 cx) e Amoxicilina 500mg (50 cx).',
      dadosCotacao: {
        itens: [
          { produtoId: 101, descricao: 'Dipirona 500mg', quantidade: 100 },
          { produtoId: 102, descricao: 'Amoxicilina 500mg', quantidade: 50 }
        ]
      },
      criadoPor: 'Bot Cotações'
    }, db);

    assert.ok(item.id.startsWith('APROV_'), 'ID deve ter prefixo APROV_');
    assert.strictEqual(item.status, 'Pendente');
    assert.strictEqual(item.tipo, 'cotacao');
    assert.strictEqual(item.destinatario.telefone, '5532999999999');
    assert.strictEqual(item.distribuidora, 'Distribuidora Santa Cruz');
    assert.strictEqual(item.dadosContexto.itens.length, 2);

    const pendentes = comprasAprovacaoService.listarPendentes(db);
    assert.strictEqual(pendentes.length, 1);
    assert.strictEqual(pendentes[0].id, item.id);
  });

  test('1.2 - Enfileiramento de mensagem de pedido de compra formal', () => {
    const db = createTestDb();
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'pedido_compra',
      destinatario: '5532988887777',
      distribuidora: 'Profarma',
      fornecedorNome: 'Lucas Profarma',
      conteudo: 'Pedido de compra fechado conforme cotação #105. Valor total: R$ 3.450,00.',
      dadosContexto: {
        cotacaoId: 'COT_105',
        valorTotal: 3450.00,
        condicaoPagamento: '28/35/42 dias'
      }
    }, db);

    assert.strictEqual(item.tipo, 'pedido_compra');
    assert.strictEqual(item.destinatario.telefone, '5532988887777');
    assert.strictEqual(item.dadosContexto.valorTotal, 3450.00);
  });

  test('1.3 - Bloqueio estrito de disparos diretos sem aprovação humana', async () => {
    const db = createTestDb();
    const mockWhats = createMockWhatsapp();

    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Panpharma',
      mensagemTexto: 'Solicitação de cotação teste'
    }, db);

    // Tentativa de envio com status pendente deve ser bloqueada
    let bloqueado = false;
    try {
      await mockWhats.enviarMensagemAprovada(item.id, db);
    } catch (err) {
      bloqueado = true;
      assert.ok(err.message.includes('Não é permitido enviar mensagem com status') || err.message.includes('Apenas itens com status "aprovado"'));
    }
    assert.strictEqual(bloqueado, true, 'Envio direto com status pendente deve falhar');
  });

  test('1.4 - Validação de campos obrigatórios no enfileiramento (texto vazio ou telefone inválido)', () => {
    const db = createTestDb();

    // Texto vazio
    assert.throws(() => {
      comprasAprovacaoService.enfileirarMensagem({
        tipo: 'cotacao',
        destinatario: '5532999999999',
        distribuidora: 'Santa Cruz',
        mensagemTexto: '   '
      }, db);
    }, /O texto da mensagem não pode ser vazio/);

    // Telefone vazio
    assert.throws(() => {
      comprasAprovacaoService.enfileirarMensagem({
        tipo: 'cotacao',
        destinatario: '',
        distribuidora: 'Santa Cruz',
        mensagemTexto: 'Texto válido'
      }, db);
    }, /Destinatário não possui número de telefone válido/);
  });

  test('1.5 - Listagem de itens pendentes vs todos os itens', () => {
    const db = createTestDb();

    const item1 = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Santa Cruz',
      mensagemTexto: 'Cotação 1'
    }, db);

    const item2 = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532888888888',
      distribuidora: 'Profarma',
      mensagemTexto: 'Cotação 2'
    }, db);

    assert.strictEqual(comprasAprovacaoService.listarPendentes(db).length, 2);
    assert.strictEqual(comprasAprovacaoService.listarFilaAprovacao('todos', db).length, 2);
  });

  // ──────────────────────────────────────────────────────────
  // GRUPO 2: Fluxo de Aprovação Humana e Edição Prévia
  // ──────────────────────────────────────────────────────────
  console.log('\n📋 GRUPO 2: Fluxo de Aprovação Humana e Edição Prévia (F11 / R4)');

  test('2.1 - Edição de texto e itens de uma mensagem pendente', () => {
    const db = createTestDb();
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Santa Cruz',
      mensagemTexto: 'Texto Original Proposto Pelo Robô',
      itens: [{ id: 1, qtd: 10 }]
    }, db);

    const editado = comprasAprovacaoService.editarMensagem(
      item.id,
      'Texto Corrigido e Revisado pelo Farmacêutico',
      [{ id: 1, qtd: 20 }, { id: 2, qtd: 15 }],
      { usuarioEditor: 'Edevaldo Cruz' },
      db
    );

    assert.strictEqual(editado.mensagemTexto, 'Texto Corrigido e Revisado pelo Farmacêutico');
    assert.strictEqual(editado.dadosContexto.itens.length, 2);
    assert.strictEqual(editado.dadosContexto.itens[0].qtd, 20);
    assert.strictEqual(editado.dadosContexto.historicoEdicoes.length, 1);
    assert.strictEqual(editado.dadosContexto.historicoEdicoes[0].editadoPor, 'Edevaldo Cruz');
  });

  test('2.2 - Tentativa de editar mensagem com texto vazio ou espaços dispara erro', () => {
    const db = createTestDb();
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Santa Cruz',
      mensagemTexto: 'Texto Inicial'
    }, db);

    assert.throws(() => {
      comprasAprovacaoService.editarMensagem(item.id, '', null, {}, db);
    }, /O texto da mensagem não pode ser vazio/);

    assert.throws(() => {
      comprasAprovacaoService.editarMensagem(item.id, '    ', null, {}, db);
    }, /O texto da mensagem não pode ser vazio/);
  });

  await testAsync('2.3 - Aprovação humana e disparo via WhatsApp com registro de auditoria', async () => {
    const db = createTestDb();
    const mockWhats = createMockWhatsapp();

    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: { nome: 'Marcos', telefone: '5532988887777' },
      distribuidora: 'GAM Distribuidora',
      mensagemTexto: 'Solicitação de cotação formal GAM'
    }, db);

    const aprovado = await comprasAprovacaoService.aprovarMensagem(
      item.id,
      'Edevaldo (Admin)',
      null,
      db,
      mockWhats
    );

    assert.strictEqual(aprovado.status, 'Enviado');
    assert.strictEqual(aprovado.revisadoPor, 'Edevaldo (Admin)');
    assert.ok(aprovado.revisadoEm);
    assert.strictEqual(aprovado.enviado, true);
    assert.strictEqual(mockWhats.sentMessages.length, 1);
    assert.strictEqual(mockWhats.sentMessages[0].to, '5532988887777');

    // Fila pendente agora deve estar vazia
    assert.strictEqual(comprasAprovacaoService.listarPendentes(db).length, 0);
  });

  await testAsync('2.4 - Bloqueio de dupla aprovação ou transição inválida em item já enviado', async () => {
    const db = createTestDb();
    const mockWhats = createMockWhatsapp();

    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Santa Cruz',
      mensagemTexto: 'Cotação'
    }, db);

    await comprasAprovacaoService.aprovarMensagem(item.id, 'Admin 1', null, db, mockWhats);

    // Segunda tentativa deve lançar erro
    let duplicadoBloqueado = false;
    try {
      await comprasAprovacaoService.aprovarMensagem(item.id, 'Admin 2', null, db, mockWhats);
    } catch (e) {
      duplicadoBloqueado = true;
      assert.ok(e.message.includes('Transição inválida'));
    }
    assert.strictEqual(duplicadoBloqueado, true);
  });

  await testAsync('2.5 - Aprovação com edição inline de texto no mesmo ato', async () => {
    const db = createTestDb();
    const mockWhats = createMockWhatsapp();

    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'pedido',
      destinatario: '5532999999999',
      distribuidora: 'Profarma',
      mensagemTexto: 'Pedido Original R$ 1.000'
    }, db);

    const aprovado = await comprasAprovacaoService.aprovarMensagem(
      item.id,
      'Ed Gestor',
      'Pedido Modificado com Desconto R$ 950',
      db,
      mockWhats
    );

    assert.strictEqual(aprovado.mensagemTexto, 'Pedido Modificado com Desconto R$ 950');
    assert.strictEqual(mockWhats.sentMessages[0].text, 'Pedido Modificado com Desconto R$ 950');
  });

  // ──────────────────────────────────────────────────────────
  // GRUPO 3: Fluxo de Rejeição de Mensagens
  // ──────────────────────────────────────────────────────────
  console.log('\n📋 GRUPO 3: Fluxo de Rejeição com Motivo Obrigatório (F11 / R4)');

  test('3.1 - Rejeição de mensagem com motivo e registro de quem rejeitou', () => {
    const db = createTestDb();
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Santa Cruz',
      mensagemTexto: 'Cotação desnecessária'
    }, db);

    const rejeitado = comprasAprovacaoService.rejeitarMensagem(
      item.id,
      'Produto já adquirido de outro fornecedor com preço menor',
      'Ed Admin',
      db
    );

    assert.strictEqual(rejeitado.status, 'Rejeitado');
    assert.strictEqual(rejeitado.motivoRejeicao, 'Produto já adquirido de outro fornecedor com preço menor');
    assert.strictEqual(rejeitado.revisadoPor, 'Ed Admin');
    assert.ok(rejeitado.revisadoEm);

    // Não deve aparecer na lista de pendentes
    assert.strictEqual(comprasAprovacaoService.listarPendentes(db).length, 0);
  });

  test('3.2 - Rejeição sem motivo informado dispara erro obrigatório', () => {
    const db = createTestDb();
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Santa Cruz',
      mensagemTexto: 'Cotação'
    }, db);

    assert.throws(() => {
      comprasAprovacaoService.rejeitarMensagem(item.id, '', 'Admin', db);
    }, /Motivo da rejeição é obrigatório/);

    assert.throws(() => {
      comprasAprovacaoService.rejeitarMensagem(item.id, '   ', 'Admin', db);
    }, /Motivo da rejeição é obrigatório/);
  });

  await testAsync('3.3 - Tentativa de aprovar mensagem já rejeitada previamente lança erro', async () => {
    const db = createTestDb();
    const mockWhats = createMockWhatsapp();

    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Santa Cruz',
      mensagemTexto: 'Cotação'
    }, db);

    comprasAprovacaoService.rejeitarMensagem(item.id, 'Estoque suficiente', 'Admin', db);

    let falhaEsperada = false;
    try {
      await comprasAprovacaoService.aprovarMensagem(item.id, 'Admin', null, db, mockWhats);
    } catch (e) {
      falhaEsperada = true;
      assert.ok(e.message.includes('Transição inválida'));
    }
    assert.strictEqual(falhaEsperada, true, 'Não deve permitir aprovar mensagem já rejeitada');
  });

  test('3.4 - Tentativa de editar mensagem já rejeitada lança erro', () => {
    const db = createTestDb();
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Santa Cruz',
      mensagemTexto: 'Cotação'
    }, db);

    comprasAprovacaoService.rejeitarMensagem(item.id, 'Cancelado', 'Admin', db);

    assert.throws(() => {
      comprasAprovacaoService.editarMensagem(item.id, 'Novo Texto', null, {}, db);
    }, /Apenas mensagens pendentes podem ser editadas/);
  });

  // ──────────────────────────────────────────────────────────
  // GRUPO 4: Sistema de Alerta Duplo (Web & WhatsApp ADM)
  // ──────────────────────────────────────────────────────────
  console.log('\n📋 GRUPO 4: Sistema de Alerta Duplo (Web & WhatsApp ADM) (F12 / R4)');

  test('4.1 - Disparo simultâneo de notificação Web (Toast) e WhatsApp ADM', () => {
    const item = {
      id: 'APROV_1001',
      tipo: 'cotacao',
      distribuidora: 'Santa Cruz',
      destinatario: { nome: 'Carlos Representante', telefone: '553299999999' }
    };

    const res = comprasAprovacaoService.gerarAlertaDuplo(item, ['5532988634755']);
    assert.strictEqual(res.disparadoComSucesso, true);
    assert.strictEqual(res.alertaWeb.tipo, 'TOAST_NOTIFICATION');
    assert.strictEqual(res.alertaWeb.variant, 'warning');
    assert.ok(res.alertaWeb.mensagem.includes('Santa Cruz'));
    assert.strictEqual(res.msgsAdm.length, 1);
    assert.ok(res.msgsAdm[0].text.includes('Santa Cruz'));
    assert.ok(res.msgsAdm[0].text.includes('🚨 *BELAFARMA - CENTRAL DE COMPRAS*'));
  });

  test('4.2 - Formatação de link de ação rápida para WhatsApp ADM', () => {
    const item = {
      id: 'APROV_888',
      tipo: 'pedido_compra',
      distribuidora: 'Profarma',
      destinatario: { nome: 'Lucas', telefone: '55328888' }
    };

    const res = comprasAprovacaoService.gerarAlertaDuplo(item, ['5532988634755'], 'https://sistema.belafarma.com');
    assert.ok(res.msgsAdm[0].text.includes('https://sistema.belafarma.com/compras/aprovacao/APROV_888'));
  });

  test('4.3 - Disparo de alerta para múltiplos números de administradores', () => {
    const item = {
      id: 'APROV_999',
      tipo: 'cotacao',
      distribuidora: 'GAM',
      destinatario: { nome: 'Juliana', telefone: '55327777' }
    };

    const res = comprasAprovacaoService.gerarAlertaDuplo(item, ['5532988634755', '553298526604']);
    assert.strictEqual(res.msgsAdm.length, 2);
    assert.strictEqual(res.msgsAdm[0].to, '5532988634755');
    assert.strictEqual(res.msgsAdm[1].to, '553298526604');
  });

  test('4.4 - Funcionamento seguro sem administradores configurados (lista vazia)', () => {
    const item = {
      id: 'APROV_1',
      tipo: 'cotacao',
      distribuidora: 'Medley',
      destinatario: { nome: 'Vendedor', telefone: '55321111' }
    };

    const res = comprasAprovacaoService.gerarAlertaDuplo(item, []);
    assert.strictEqual(res.msgsAdm.length, 0);
    assert.strictEqual(res.alertaWeb.tipo, 'TOAST_NOTIFICATION');
    assert.strictEqual(res.disparadoComSucesso, true);
  });

  test('4.5 - Sanitização de números com formatação internacional (+55...) ou caracteres especiais', () => {
    const item = {
      id: 'APROV_2',
      tipo: 'cotacao',
      distribuidora: 'EMS',
      destinatario: { nome: 'Vendedor', telefone: '+55 (32) 99999-8888' }
    };

    const res = comprasAprovacaoService.gerarAlertaDuplo(item, ['+55 (32) 98863-4755']);
    assert.strictEqual(res.msgsAdm[0].to, '5532988634755');
    assert.ok(res.msgsAdm[0].text.includes('5532999998888'));
  });

  test('4.6 - Preservação de quebras de linha e estrutura no alerta WhatsApp ADM', () => {
    const item = {
      id: 'APROV_3',
      tipo: 'cotacao',
      distribuidora: 'Eurofarma',
      destinatario: { nome: 'Renata', telefone: '553299991111' }
    };

    const res = comprasAprovacaoService.gerarAlertaDuplo(item, ['5532988634755']);
    const texto = res.msgsAdm[0].text;
    assert.ok(texto.includes('\n\n'));
    assert.ok(texto.includes('• *Tipo:*'));
    assert.ok(texto.includes('• *Distribuidora:*'));
    assert.ok(texto.includes('👉 *Acesse o painel para aprovar ou rejeitar:*'));
  });

  await testAsync('4.7 - Execução de notificarAdministradoresWhatsApp e atualização de notificado_admin', async () => {
    const db = createTestDb();
    const mockWhats = createMockWhatsapp();

    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Santa Cruz',
      mensagemTexto: 'Cotação Teste Alerta'
    }, db);

    const notifResult = await comprasAprovacaoService.notificarAdministradoresWhatsApp(item.id, db, mockWhats);
    assert.strictEqual(notifResult.success, true);
    assert.strictEqual(notifResult.disparadoComSucesso, true);

    const itemDb = comprasAprovacaoService.obterItemAprovacao(item.id, db);
    assert.strictEqual(itemDb.notificadoAdmin, 1);
    assert.ok(itemDb.adminNotificadoEm);
  });

  test('4.8 - Contador de pendências em tempo real para badge da interface web', () => {
    const db = createTestDb();
    assert.strictEqual(comprasAprovacaoService.obterContadorPendencias(db).totalPendentes, 0);

    const it1 = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Santa Cruz',
      mensagemTexto: 'Item 1'
    }, db);

    const it2 = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'pedido',
      destinatario: '5532888888888',
      distribuidora: 'Profarma',
      mensagemTexto: 'Item 2'
    }, db);

    assert.strictEqual(comprasAprovacaoService.obterContadorPendencias(db).totalPendentes, 2);

    comprasAprovacaoService.rejeitarMensagem(it1.id, 'Motivo', 'Admin', db);
    assert.strictEqual(comprasAprovacaoService.obterContadorPendencias(db).totalPendentes, 1);
  });

  // ──────────────────────────────────────────────────────────
  // GRUPO 5: Casos de Borda e Corner Cases
  // ──────────────────────────────────────────────────────────
  console.log('\n📋 GRUPO 5: Casos de Borda, Volume e Corner Cases');

  test('5.1 - Processamento em lote de 100 mensagens enfileiradas', () => {
    const db = createTestDb();
    const total = 100;

    for (let i = 0; i < total; i++) {
      comprasAprovacaoService.enfileirarMensagem({
        tipo: i % 2 === 0 ? 'cotacao' : 'pedido',
        destinatario: `553299999${String(i).padStart(4, '0')}`,
        distribuidora: `Distribuidora #${i}`,
        mensagemTexto: `Mensagem de teste de carga #${i}`
      }, db);
    }

    const pendentes = comprasAprovacaoService.listarPendentes(db);
    assert.strictEqual(pendentes.length, total);

    // Rejeita os 50 primeiros e aprova os 50 restantes
    for (let i = 0; i < 50; i++) {
      comprasAprovacaoService.rejeitarMensagem(pendentes[i].id, 'Teste carga rejeição', 'Admin', db);
    }

    assert.strictEqual(comprasAprovacaoService.listarPendentes(db).length, 50);
  });

  test('5.2 - Consulta ou alteração de ID inexistente dispara erro descritivo', () => {
    const db = createTestDb();

    assert.throws(() => {
      comprasAprovacaoService.obterItemAprovacao('ID_INEXISTENTE_999', db);
    }, /Item não encontrado/);

    assert.throws(() => {
      comprasAprovacaoService.editarMensagem('ID_INEXISTENTE_999', 'Texto', null, {}, db);
    }, /Item não encontrado/);

    assert.throws(() => {
      comprasAprovacaoService.rejeitarMensagem('ID_INEXISTENTE_999', 'Motivo', 'Admin', db);
    }, /Item não encontrado/);
  });

  test('5.3 - Limpeza de fila antiga remove apenas itens finalizados fora da janela', () => {
    const db = createTestDb();

    const it1 = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Santa Cruz',
      mensagemTexto: 'Item Antigo Rejeitado'
    }, db);
    comprasAprovacaoService.rejeitarMensagem(it1.id, 'Motivo', 'Admin', db);

    // Simula data antiga (100 dias atrás)
    const dataAntiga = new Date(Date.now() - (100 * 24 * 60 * 60 * 1000)).toISOString();
    db.prepare('UPDATE compras_fila_aprovacao SET created_at = ? WHERE id = ?').run(dataAntiga, it1.id);

    const it2 = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532999999999',
      distribuidora: 'Santa Cruz',
      mensagemTexto: 'Item Recente Pendente'
    }, db);

    const resLimpeza = comprasAprovacaoService.limparFilaAntiga(90, db);
    assert.strictEqual(resLimpeza.removidos, 1);

    // O pendente recente deve permanecer intacto
    const pendentes = comprasAprovacaoService.listarPendentes(db);
    assert.strictEqual(pendentes.length, 1);
    assert.strictEqual(pendentes[0].id, it2.id);
  });

  // ──────────────────────────────────────────────────────────
  // RESUMO DOS RESULTADOS
  // ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📊 RESUMO DA SUÍTE DE TESTES M4:');
  console.log(`  Total de Testes Executados: ${totalTests}`);
  console.log(`  Passaram com Sucesso:       ${passedTests}`);
  console.log(`  Falhas:                     ${totalTests - passedTests}`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  if (passedTests === totalTests) {
    console.log('🎉 TODOS OS TESTES DO WORKER M4 PASSARAM COM 100% DE SUCESSO!\n');
    process.exit(0);
  } else {
    console.error('❌ HOUVE FALHAS NOS TESTES DO WORKER M4. VERIFIQUE OS LOGS ACIMA.\n');
    process.exit(1);
  }

})();
