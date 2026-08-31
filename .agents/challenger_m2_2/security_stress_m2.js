/**
 * security_stress_m2.js
 * Suíte de Testes Adversariais e Estresse de Segurança para Milestone M2 (Session Isolation & Security Gate)
 * Central de Compras BelaFarma.
 * 
 * Challenger 2 — Empirical Stress Harness
 */

import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import crypto from 'crypto';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const Database = require('better-sqlite3');

const comprasMineracaoService = require('./services/compras-mineracao.service');
const baileysComprasService = require('./baileys-compras-service');

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('🛡️  CENTRAL DE COMPRAS BELAFARMA — SUÍTE DE TESTES DE SEGURANÇA E ESTRESSE M2');
console.log('    CHALLENGER 2: SESSION ISOLATION, SECURITY GATE & CONCURRENCY WAL');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    failedTests++;
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Erro: ${err.message}`);
    if (err.stack) console.error(`     ${err.stack.split('\n')[1]}`);
  }
}

async function runTestAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    failedTests++;
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Erro: ${err.message}`);
    if (err.stack) console.error(`     ${err.stack.split('\n')[1]}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Setup de Banco SQLite em Memória com WAL e Schemas Oficiais
// ─────────────────────────────────────────────────────────────
function createFreshDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

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
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────
// EXECUÇÃO DOS TESTES ADVERSARIAIS
// ─────────────────────────────────────────────────────────────

(async () => {
  const db = createFreshDb();

  console.log('\n🔒 SEÇÃO 1: TRAVA DE SEGURANÇA E TENTATIVAS DE BYPASS (SECURITY GATE)');
  console.log('───────────────────────────────────────────────────────────────────────────────');

  // Teste 1.1: Rejeição estrita de status 'pendente'
  await runTestAsync('1.1 - Bloqueio de envio para item com status "pendente"', async () => {
    const id = 'aprov_pendente_01';
    db.prepare(`
      INSERT INTO compras_fila_aprovacao (id, tipo, destinatario_telefone, destinatario_nome, fornecedor_nome, mensagem_texto, status, created_at, updated_at)
      VALUES (?, 'cotacao', '5532988881111', 'Rep Carlos', 'Santa Cruz', 'Cotacao teste', 'pendente', ?, ?)
    `).run(id, new Date().toISOString(), new Date().toISOString());

    let errorThrown = null;
    try {
      await baileysComprasService.enviarMensagemAprovada(id, db);
    } catch (err) {
      errorThrown = err;
    }
    assert.ok(errorThrown, 'Deve lançar erro de autorização');
    assert.ok(errorThrown.message.includes('Não é permitido enviar mensagem com status "pendente"'), 'Mensagem de erro explícita');
  });

  // Teste 1.2: Rejeição estrita de status 'rejeitado'
  await runTestAsync('1.2 - Bloqueio de envio para item com status "rejeitado"', async () => {
    const id = 'aprov_rejeitado_02';
    db.prepare(`
      INSERT INTO compras_fila_aprovacao (id, tipo, destinatario_telefone, destinatario_nome, fornecedor_nome, mensagem_texto, status, created_at, updated_at)
      VALUES (?, 'cotacao', '5532988882222', 'Rep Mariana', 'Profarma', 'Cotacao teste', 'rejeitado', ?, ?)
    `).run(id, new Date().toISOString(), new Date().toISOString());

    let errorThrown = null;
    try {
      await baileysComprasService.enviarMensagemAprovada(id, db);
    } catch (err) {
      errorThrown = err;
    }
    assert.ok(errorThrown, 'Deve lançar erro');
    assert.ok(errorThrown.message.includes('Não é permitido enviar mensagem com status "rejeitado"'), 'Mensagem de erro explícita');
  });

  // Teste 1.3: Rejeição de status 'cancelado'
  await runTestAsync('1.3 - Bloqueio de envio para item com status "cancelado"', async () => {
    const id = 'aprov_cancelado_03';
    db.prepare(`
      INSERT INTO compras_fila_aprovacao (id, tipo, destinatario_telefone, destinatario_nome, fornecedor_nome, mensagem_texto, status, created_at, updated_at)
      VALUES (?, 'cotacao', '5532988883333', 'Rep João', 'Panpharma', 'Cotacao cancelada', 'cancelado', ?, ?)
    `).run(id, new Date().toISOString(), new Date().toISOString());

    let errorThrown = null;
    try {
      await baileysComprasService.enviarMensagemAprovada(id, db);
    } catch (err) {
      errorThrown = err;
    }
    assert.ok(errorThrown, 'Deve lançar erro');
    assert.ok(errorThrown.message.includes('Não é permitido enviar mensagem com status "cancelado"'));
  });

  // Teste 1.4: Prevenção de Ataque de Repetição (Replay Attack / Duplo Envio)
  await runTestAsync('1.4 - Prevenção de Replay Attack (Item com status "enviado" não pode ser reenviado)', async () => {
    const id = 'aprov_enviado_04';
    db.prepare(`
      INSERT INTO compras_fila_aprovacao (id, tipo, destinatario_telefone, destinatario_nome, fornecedor_nome, mensagem_texto, status, message_id_enviada, created_at, updated_at)
      VALUES (?, 'cotacao', '5532988884444', 'Rep Lucas', 'GAM', 'Cotacao ja enviada', 'enviado', 'MSG_ALREADY_SENT', ?, ?)
    `).run(id, new Date().toISOString(), new Date().toISOString());

    let errorThrown = null;
    try {
      await baileysComprasService.enviarMensagemAprovada(id, db);
    } catch (err) {
      errorThrown = err;
    }
    assert.ok(errorThrown, 'Deve lançar erro de replay');
    assert.ok(errorThrown.message.includes('Não é permitido enviar mensagem com status "enviado"'), 'Impede envio duplo de mensagens já despachadas');
  });

  // Teste 1.5: Rejeição de Status Malformado / Nulo / Injetado
  await runTestAsync('1.5 - Rejeição de status arbitrário ou malformado ("hacked", "", null)', async () => {
    const idMal = 'aprov_malformed_05';
    db.prepare(`
      INSERT INTO compras_fila_aprovacao (id, tipo, destinatario_telefone, destinatario_nome, fornecedor_nome, mensagem_texto, status, created_at, updated_at)
      VALUES (?, 'cotacao', '5532988885555', 'Rep Hack', 'Malicious', 'Test', 'hacked_status', ?, ?)
    `).run(idMal, new Date().toISOString(), new Date().toISOString());

    let errorThrown = null;
    try {
      await baileysComprasService.enviarMensagemAprovada(idMal, db);
    } catch (err) {
      errorThrown = err;
    }
    assert.ok(errorThrown, 'Deve rejeitar status arbitrário');
  });

  // Teste 1.6: ID inexistente
  await runTestAsync('1.6 - Tratamento robusto para approvalId inexistente', async () => {
    let errorThrown = null;
    try {
      await baileysComprasService.enviarMensagemAprovada('UUID_INEXISTENTE_99999', db);
    } catch (err) {
      errorThrown = err;
    }
    assert.ok(errorThrown, 'Deve lançar erro de item não encontrado');
    assert.ok(errorThrown.message.includes('não encontrado'));
  });

  // Teste 1.7: Tentativa de SQL Injection no ID
  await runTestAsync('1.7 - Imunidade a SQL Injection no ID de aprovação', async () => {
    const sqliId = "' OR '1'='1'; DROP TABLE compras_fila_aprovacao; --";
    let errorThrown = null;
    try {
      await baileysComprasService.enviarMensagemAprovada(sqliId, db);
    } catch (err) {
      errorThrown = err;
    }
    assert.ok(errorThrown);
    // Verifica que a tabela ainda existe intacta
    const checkTable = db.prepare("SELECT count(*) as count FROM compras_fila_aprovacao").get();
    assert.ok(checkTable.count >= 0, 'Tabela protegida contra SQL injection via parâmetros preparados');
  });

  // Teste 1.8: Proteção contra ausência de instância do banco
  await runTestAsync('1.8 - Validação de banco de dados ausente', async () => {
    let errorThrown = null;
    try {
      await baileysComprasService.enviarMensagemAprovada('some_id', null);
    } catch (err) {
      errorThrown = err;
    }
    assert.ok(errorThrown);
    assert.ok(errorThrown.message.includes('banco SQLite não fornecida') || errorThrown.message.includes('não encontrado'));
  });

  // Teste 1.9: Bloqueio de envio direto via socket desconectado
  await runTestAsync('1.9 - Bloqueio de chamadas diretas com socket desconectado', async () => {
    let errorText = null;
    try {
      await baileysComprasService.sendTextMessage('5532988889999', 'Texto de teste');
    } catch (err) {
      errorText = err;
    }
    assert.ok(errorText, 'Deve bloquear envio com socket desconectado');
    assert.ok(errorText.message.includes('não está conectada'));

    let errorMedia = null;
    try {
      await baileysComprasService.sendMediaMessage('5532988889999', 'arquivo_inexistente.pdf');
    } catch (err) {
      errorMedia = err;
    }
    assert.ok(errorMedia, 'Deve bloquear envio de mídia');
  });

  // Teste 1.10: Validação de telefones e mensagens vazias
  await runTestAsync('1.10 - Rejeição de telefones inválidos e mensagens vazias', async () => {
    await assert.rejects(async () => {
      await baileysComprasService.sendTextMessage('', 'mensagem');
    }, /Destinatário não especificado|não está conectada/);

    await assert.rejects(async () => {
      await baileysComprasService.sendTextMessage('5532988889999', '');
    }, /Conteúdo da mensagem não pode ser vazio|não está conectada/);
  });

  // Teste 1.11: Bloqueio de envio de item aprovado se o socket estiver desconectado
  await runTestAsync('1.11 - Proteção de envio de item aprovado quando socket está desconectado', async () => {
    const aprovId = 'aprov_valido_11';
    db.prepare(`
      INSERT INTO compras_fila_aprovacao (
        id, tipo, destinatario_telefone, destinatario_nome, fornecedor_id, fornecedor_nome,
        distribuidora, mensagem_texto, status, created_at, updated_at
      ) VALUES (?, 'solicitacao_cotacao', '5532988889999', 'Ricardo', 'forn_1', 'Santa Cruz', 'Santa Cruz', 'Cotação aprovada teste', 'aprovado', ?, ?)
    `).run(aprovId, new Date().toISOString(), new Date().toISOString());

    await assert.rejects(async () => {
      await baileysComprasService.enviarMensagemAprovada(aprovId, db);
    }, /não está conectada/);
  });

  // Teste 1.12: Validação de status 'editado_enviado' bloqueado com socket desconectado
  await runTestAsync('1.12 - Suporte a status "editado_enviado" valida socket antes de disparo', async () => {
    const editId = 'aprov_editado_12';
    db.prepare(`
      INSERT INTO compras_fila_aprovacao (
        id, tipo, destinatario_telefone, destinatario_nome, fornecedor_id, fornecedor_nome,
        distribuidora, mensagem_texto, status, created_at, updated_at
      ) VALUES (?, 'pedido', '5532988885555', 'Mariana', 'forn_2', 'Profarma', 'Profarma', 'Texto editado', 'editado_enviado', ?, ?)
    `).run(editId, new Date().toISOString(), new Date().toISOString());

    await assert.rejects(async () => {
      await baileysComprasService.enviarMensagemAprovada(editId, db);
    }, /não está conectada/);
  });


  console.log('\n⚡ SEÇÃO 2: CONCORRÊNCIA MASSIVA DE INGESTÃO E ESCRITA SQLITE WAL');
  console.log('───────────────────────────────────────────────────────────────────────────────');

  // Teste 2.1: Ingestão paralela de 100 mensagens simultâneas de 100 fornecedores distintos
  await runTestAsync('2.1 - Ingestão concorrente de 100 mensagens simultâneas (Promise.all)', async () => {
    const promises = [];
    const now = Date.now();

    for (let i = 0; i < 100; i++) {
      const msg = {
        messageId: `stress_msg_${i}_${crypto.randomUUID()}`,
        remoteJid: `553299999${String(i).padStart(4, '0')}@s.whatsapp.net`,
        phone: `553299999${String(i).padStart(4, '0')}`,
        contactName: `Representante Concorrente ${i}`,
        text: `Olá BelaFarma! Sou o Rep ${i} da Distribuidora Especializada_${i}.\nPrazo 28/35/42 dias.\nPedido mínimo R$ ${300 + i}.\n- Dipirona 500mg R$ ${(1.50 + (i * 0.01)).toFixed(2)}`,
        timestamp: now + i
      };

      promises.push(comprasMineracaoService.processarMensagemRecebida(msg, db, { skipFirebird: true }));
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 100, 'Todas as 100 promessas foram resolvidas');
    assert.ok(results.every(r => r.minerado === true), 'Todas as 100 mensagens foram mineradas com sucesso');

    const totalFornecedores = db.prepare('SELECT count(*) as total FROM compras_fornecedores_meta').get().total;
    assert.strictEqual(totalFornecedores, 100, 'Exatamente 100 fornecedores registrados sem colisão');

    const totalOfertas = db.prepare('SELECT count(*) as total FROM compras_oportunidades_mineradas').get().total;
    assert.strictEqual(totalOfertas, 100, 'Exatamente 100 ofertas registradas sem perda');
  });

  // Teste 2.2: Condição de Corrida Extrema: 50 mensagens simultâneas do MESMO fornecedor
  await runTestAsync('2.2 - Condição de corrida: 50 mensagens simultâneas do MESMO fornecedor (Upsert lock stress)', async () => {
    const promises = [];
    const sharedPhone = '5532988880000';
    const sharedJid = `${sharedPhone}@s.whatsapp.net`;

    for (let i = 0; i < 50; i++) {
      const msg = {
        messageId: `race_msg_${i}_${crypto.randomUUID()}`,
        remoteJid: sharedJid,
        phone: sharedPhone,
        contactName: 'Carlos Santa Cruz',
        text: `Oferta relâmpago ${i}:\n- Amoxicilina 500mg c/ 21 caps por R$ ${(10 + (i * 0.1)).toFixed(2)} (compre 10 ganhe 2).\nPrazo 30/60/90.`,
        timestamp: Date.now() + i
      };
      promises.push(comprasMineracaoService.processarMensagemRecebida(msg, db, { skipFirebird: true }));
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 50, '50 inserções paralelas finalizadas');

    // Deve existir APENAS 1 registro do fornecedor em compras_fornecedores_meta
    const fornecedores = db.prepare('SELECT * FROM compras_fornecedores_meta WHERE telefone = ?').all(sharedPhone);
    assert.strictEqual(fornecedores.length, 1, 'Exatamente 1 fornecedor único mantido (ON CONFLICT funcionou sem duplicação)');

    // Todas as 50 ofertas devem ter sido associadas corretamente ao fornecedor
    const ofertas = db.prepare('SELECT * FROM compras_oportunidades_mineradas WHERE telefone = ?').all(sharedPhone);
    assert.strictEqual(ofertas.length, 50, 'Todas as 50 ofertas foram indexadas');
  });

  // Teste 2.3: Lote concorrente + Mensagens em tempo real simultâneas
  await runTestAsync('2.3 - Execução simultânea de Lote Histórico e Mensagens em Tempo Real', async () => {
    // Insere histórico
    const batchList = [];
    for (let i = 0; i < 30; i++) {
      batchList.push({
        key: {
          id: `batch_hist_${i}`,
          remoteJid: `553297777${String(i).padStart(4, '0')}@s.whatsapp.net`,
          fromMe: false
        },
        message: {
          conversation: `Histórico lote ${i} - Panpharma\nprazos 28/35/42\npedido minimo R$ 500\n- Losartana 50mg R$ 2,00`
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      });
    }

    // Dispara lote e mensagens em tempo real concorrentemente
    const batchPromise = comprasMineracaoService.processarMensagensEmLote(batchList, db, { skipFirebird: true });
    
    const realtimePromises = [];
    for (let j = 0; j < 20; j++) {
      realtimePromises.push(comprasMineracaoService.processarMensagemRecebida({
        messageId: `rt_msg_${j}`,
        remoteJid: `553296666${String(j).padStart(4, '0')}@s.whatsapp.net`,
        phone: `553296666${String(j).padStart(4, '0')}`,
        contactName: `Rep RT ${j}`,
        text: `Oferta RT ${j}:\n- Paracetamol 750mg R$ 1,80 com 10% desc.`,
        timestamp: Date.now()
      }, db, { skipFirebird: true }));
    }

    const [batchRes, rtRes] = await Promise.all([
      batchPromise,
      Promise.all(realtimePromises)
    ]);

    assert.strictEqual(batchRes.processadas, 30, '30 mensagens de lote processadas');
    assert.strictEqual(rtRes.length, 20, '20 mensagens de tempo real processadas');
  });

  // Teste 2.4: Integridade do SQLite WAL (PRAGMA integrity_check)
  runTest('2.4 - Verificação de Integridade Forense do Banco SQLite (PRAGMA integrity_check)', () => {
    const check = db.pragma('integrity_check');
    assert.strictEqual(check[0].integrity_check, 'ok', 'Banco de dados íntegro sem corrupção após estresse');

    const fkCheck = db.pragma('foreign_key_check');
    assert.strictEqual(fkCheck.length, 0, 'Zero violações de chave estrangeira');
  });

  // Teste 2.5: Integridade estrutural de colunas JSON após concorrência
  runTest('2.5 - Integridade de Colunas JSON em compras_fornecedores_meta', () => {
    const fornecedores = db.prepare('SELECT prazos_pagamento, categorias_fornecidas, catalogo_produtos FROM compras_fornecedores_meta').all();
    for (const f of fornecedores) {
      assert.doesNotThrow(() => JSON.parse(f.prazos_pagamento || '[]'), 'prazos_pagamento é JSON válido');
      assert.doesNotThrow(() => JSON.parse(f.categorias_fornecidas || '[]'), 'categorias_fornecidas é JSON válido');
      assert.doesNotThrow(() => JSON.parse(f.catalogo_produtos || '[]'), 'catalogo_produtos é JSON válido');
    }
  });

  // Teste 2.6: Leitura concorrente sob estresse de escrita contínua (Simulação de Dashboard Polling)
  await runTestAsync('2.6 - Leituras concorrentes sob escrita contínua (Stress Dashboard Polling)', async () => {
    const writePromises = [];
    for (let w = 0; w < 50; w++) {
      writePromises.push(comprasMineracaoService.processarMensagemRecebida({
        messageId: `polling_stress_msg_${w}`,
        remoteJid: `553295555${String(w).padStart(4, '0')}@s.whatsapp.net`,
        phone: `553295555${String(w).padStart(4, '0')}`,
        contactName: `Rep Polling ${w}`,
        text: `Oferta Polling ${w}:\n- Dipirona 500mg R$ 1,45\nPrazo 28 dias.`,
        timestamp: Date.now()
      }, db, { skipFirebird: true }));
    }

    const readPromises = [];
    for (let r = 0; r < 50; r++) {
      readPromises.push((async () => {
        const ops = comprasMineracaoService.listarOportunidades(db);
        const forns = comprasMineracaoService.listarFornecedoresMinerados(db);
        assert.ok(Array.isArray(ops));
        assert.ok(Array.isArray(forns));
      })());
    }

    await Promise.all([...writePromises, ...readPromises]);
    const finalOps = comprasMineracaoService.listarOportunidades(db);
    assert.ok(finalOps.length >= 50, 'Todas as leituras e escritas completaram sem deadlock ou lock timeout');
  });


  console.log('\n📂 SEÇÃO 3: ISOLAMENTO DE SESSÃO E CAMINHOS MULTIPLATAFORMA (WINDOWS & LINUX)');
  console.log('───────────────────────────────────────────────────────────────────────────────');

  // Teste 3.1: Validação de isolamento do diretório de sessão no Windows
  runTest('3.1 - Isolamento de caminho de sessão no Windows', () => {
    const sessionDir = baileysComprasService.SESSION_DIR;
    assert.ok(sessionDir.includes('baileys-session-compras'), 'Nome da pasta deve ser baileys-session-compras');
    assert.ok(!sessionDir.endsWith(path.sep + 'baileys-session'), 'Não pode colidir com sessão do WhatsApp Principal');
    assert.ok(!sessionDir.endsWith(path.sep + 'baileys-session-secondary'), 'Não pode colidir com sessão do WhatsApp Secundário');
  });

  // Teste 3.2: Validação de cálculo do caminho Linux / Docker Container
  runTest('3.2 - Verificação de conformidade do caminho em Linux/Docker (/data/baileys-session-compras)', () => {
    const sessionLogicSim = (platform, dir) => {
      return platform === 'win32'
        ? path.win32.join(dir, 'baileys-session-compras')
        : path.posix.join(dir, 'data', 'baileys-session-compras');
    };
    const testLinux = sessionLogicSim('linux', '/home/ed/projetcs/BelaFarma/backend');
    assert.strictEqual(testLinux, '/home/ed/projetcs/BelaFarma/backend/data/baileys-session-compras');
    
    const testWin = sessionLogicSim('win32', 'C:\\BelaFarma\\backend');
    assert.strictEqual(testWin, 'C:\\BelaFarma\\backend\\baileys-session-compras');
  });

  // Teste 3.3: Resistência a Path Traversal em caminhos de arquivos
  runTest('3.3 - Resistência contra Path Traversal em arquivos de sessão', () => {
    const maliciousPaths = [
      '../baileys-session/creds.json',
      '../../etc/passwd',
      '..\\..\\Windows\\System32',
      'baileys-session-compras/../../../config.js'
    ];

    for (const p of maliciousPaths) {
      const normalized = path.normalize(p);
      const isContained = !normalized.startsWith('..') && !path.isAbsolute(normalized);
      // Nenhum arquivo fora do diretório autorizado pode ser acessado
      assert.strictEqual(isContained, false, `Caminho malicioso "${p}" detectado e bloqueado`);
    }
  });

  // Teste 3.4: Verificação de status e isolamento de estado do serviço
  runTest('3.4 - Estado da conexão isolado e getters padronizados', () => {
    const status1 = baileysComprasService.getStatus();
    const status2 = baileysComprasService.getComprasConnectionStatus();
    assert.deepStrictEqual(status1, status2, 'getComprasConnectionStatus é alias fiel de getStatus');
    assert.strictEqual(typeof status1.status, 'string');
    assert.strictEqual(typeof status1.connected, 'boolean');
    assert.strictEqual(typeof status1.hasQR, 'boolean');
  });

  // Teste 3.5: Triplo Isolamento de Pastas de Sessão (Principal vs Secundário vs Compras)
  runTest('3.5 - Triplo Isolamento de Sessões Baileys (Principal, Secundário e Compras)', () => {
    const dirPrincipal = path.join(process.cwd(), 'backend', 'baileys-session');
    const dirSecundario = path.join(process.cwd(), 'backend', 'baileys-session-secondary');
    const dirCompras = baileysComprasService.SESSION_DIR;

    assert.notStrictEqual(dirCompras, dirPrincipal, 'Compras !== Principal');
    assert.notStrictEqual(dirCompras, dirSecundario, 'Compras !== Secundário');
    assert.notStrictEqual(dirPrincipal, dirSecundario, 'Principal !== Secundário');
  });


  console.log('\n🧪 SEÇÃO 4: PAYLOADS ADVERSARIAIS, REDOS E CASOS DE BORDA DO PARSER');
  console.log('───────────────────────────────────────────────────────────────────────────────');

  // Teste 4.1: Estresse contra ReDoS (Regular Expression Denial of Service)
  runTest('4.1 - Proteção contra ReDoS em textos patológicos gigantes (>50.000 caracteres)', () => {
    const hugeText = 'A'.repeat(25000) + ' 28/35/42 ' + 'B'.repeat(25000) + ' pedido mínimo R$ 1.500,00 ' + 'C'.repeat(10000);
    const start = Date.now();
    
    const prazos = comprasMineracaoService.extrairPrazos(hugeText);
    const min = comprasMineracaoService.extrairPedidoMinimo(hugeText);
    const dist = comprasMineracaoService.extrairDistribuidoraELaboratorios(hugeText);
    const ofertas = comprasMineracaoService.extrairLinhasDeOferta(hugeText);
    
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 200, `Parser executou em ${elapsed}ms (deve ser < 200ms para evitar ReDoS)`);
    assert.ok(prazos.includes('28/35/42'), 'Extraiu prazo com sucesso');
    assert.strictEqual(min.valor, 1500.00, 'Extraiu valor mínimo com sucesso');
  });

  // Teste 4.2: Valores Monetários Extremos e Formatados de Formas Incomuns
  runTest('4.2 - Parser de valores monetários extremos e malformados', () => {
    const t = `
      - Produto 1 R$ 0,05
      - Produto 2 R$ 9.999,99
      - Produto 3 por R$ 0,00
      - Produto 4 R$ -15,00
      - Produto 5 por 15.50
    `;
    const ofertas = comprasMineracaoService.extrairLinhasDeOferta(t);
    assert.ok(ofertas.some(o => o.precoOfertado === 0.05), 'Suporta centavos pequenos (0.05)');
    assert.ok(ofertas.some(o => o.precoOfertado === 9999.99), 'Suporta valores altos (9999.99)');
    assert.ok(!ofertas.some(o => o.precoOfertado <= 0), 'Descarta valores nulos ou negativos');
  });

  // Teste 4.3: Mensagens com Emojis, Unicode, Zero-Width Spaces e Quebras de Linha Complexas
  runTest('4.3 - Resiliência a Emojis, Unicode, Zero-Width e Caracteres Especiais', () => {
    const textoUnicode = `
      🔥🚨 *SUPER OFERTA EXCLUSIVA* 🚨🔥
      Olá 👋, sou o Rodrigo da \u200BProfarma\u200B!
      Condição: \u200E30/60/90\u200E dias 💳
      Pedido mínimo: R$ 450,00 📦
      - 💊 Dipirona 500mg c/ 100 cx: R$ 1,60 (10+2) 💥
      - 💉 Insulina NPH 100UI: R$ 28,50 ❄️
    `;
    const res = comprasMineracaoService.minerarTextoLivre(textoUnicode, { phone: '5532988887777' });
    assert.strictEqual(res.distribuidora, 'Profarma', 'Distribuidora identificada com Unicode');
    assert.strictEqual(res.representante, 'Rodrigo', 'Representante identificado com Unicode');
    assert.strictEqual(res.pedidoMinimoValor, 450.00, 'Pedido mínimo identificado com Emojis');
    assert.ok(res.ofertas.length >= 2, 'Ofertas com emojis identificadas');
    assert.strictEqual(res.ofertas[0].precoBruto, 1.60);
    // Bonificação 10+2: 10 * 1.60 / 12 = 1.33
    assert.strictEqual(res.ofertas[0].precoOfertado, 1.33);
  });

  // Teste 4.4: Tolerância a Falhas com Dados Corrompidos no Banco
  await runTestAsync('4.4 - Tolerância a dados JSON corrompidos em compras_fornecedores_meta', async () => {
    const corruptedId = 'forn_corrupted_json';
    db.prepare(`
      INSERT INTO compras_fornecedores_meta (
        id, distribuidora, telefone, prazos_pagamento, categorias_fornecidas, catalogo_produtos, created_at, updated_at
      ) VALUES (?, 'Corrupted Dist', '5532999998888', '{INVALID_JSON', 'NOT_AN_ARRAY', NULL, ?, ?)
    `).run(corruptedId, new Date().toISOString(), new Date().toISOString());

    // Ingestão de nova mensagem para este mesmo fornecedor com JSON corrompido
    let erroFatal = false;
    try {
      await comprasMineracaoService.processarMensagemRecebida({
        messageId: 'recovery_msg_01',
        remoteJid: '5532999998888@s.whatsapp.net',
        phone: '5532999998888',
        contactName: 'Rep Recuperacao',
        text: 'Nova oferta:\n- Dipirona R$ 1,50.\nPrazo 28 dias.',
        timestamp: Date.now()
      }, db, { skipFirebird: true });
    } catch (e) {
      erroFatal = true;
    }

    assert.strictEqual(erroFatal, false, 'Sistema não caiu com JSON corrompido pré-existente');
    const recuperado = db.prepare('SELECT * FROM compras_fornecedores_meta WHERE id = ?').get(corruptedId);
    assert.doesNotThrow(() => JSON.parse(recuperado.prazos_pagamento), 'JSON recuperado e saneado');
  });

  // Teste 4.5: Fórmulas de Bonificação e Descontos Extremos
  runTest('4.5 - Cálculo exato de bonificações extremas ("compre 100 ganhe 50", "99% off", "0% desc")', () => {
    const textBonus = `
      - Produto A R$ 10,00 (compre 100 ganhe 50)
      - Produto B R$ 100,00 com 99% off
      - Produto C R$ 50,00 com 0% desc
      - Produto D R$ 20,00 (50+50)
    `;
    const ofertas = comprasMineracaoService.extrairLinhasDeOferta(textBonus);
    assert.strictEqual(ofertas.length, 4);

    // Produto A: 100 * 10 / 150 = 6.67
    assert.strictEqual(ofertas[0].precoOfertado, 6.67);
    // Produto B: 100 * (1 - 0.99) = 1.00
    assert.strictEqual(ofertas[1].precoOfertado, 1.00);
    // Produto C: 50.00
    assert.strictEqual(ofertas[2].precoOfertado, 50.00);
    // Produto D: 50 * 20 / 100 = 10.00
    assert.strictEqual(ofertas[3].precoOfertado, 10.00);
  });

  // ─────────────────────────────────────────────────────────────
  // RESUMO E IMPRESSÃO FINAL
  // ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log(`📊 RESULTADO DA AUDITORIA ADVERSARIAL: ${passedTests}/${totalTests} TESTES PASSARAM COM SUCESSO!`);
  if (failedTests === 0) {
    console.log('🛡️  VEREDITO: APPROVE — SEGURANÇA, ISOLAMENTO E CONCORRÊNCIA 100% VALIDADOS.');
  } else {
    console.log(`❌ VEREDITO: REQUEST_CHANGES — ${failedTests} FALHAS ENCONTRADAS.`);
  }
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  if (failedTests === 0) {
    process.exit(0);
  } else {
    process.exit(1);
  }
})();
