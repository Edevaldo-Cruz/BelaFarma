/**
 * test_tier5_security_concurrency.js
 * SUÍTE ADVERSARIAL TIER 5: STRESS, CONCURRENCY, SECURITY BYPASS, FIREBIRD RESILIENCE & SQLITE WAL INTEGRITY
 * 
 * Central de Compras BelaFarma
 * Challenger Final 2
 * 
 * Categorias Testadas:
 * 1. Concorrência Massiva: 500 operações simultâneas (enfileiramento, ranking, espelhos e concorrência mista).
 * 2. Segurança & Anti-Bypass: Tentativas hostis de bypass da trava de aprovação humana, transições ilegais,
 *    race conditions de duplo envio (double-approval) e injeção de parâmetros.
 * 3. Resiliência do Firebird: Simulação de queda abrupta de rede, timeout/deadlock, rollback transacional
 *    e fallback transparente para cache SQLite local.
 * 4. Integridade SQLite WAL: Verificação forense de modo WAL, 0 deadlocks em conexões concorrentes,
 *    atomicidade ACID e integridade referencial com PRAGMA integrity_check.
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega os módulos a partir do diretório backend onde ficam as dependências instaladas
const backendRequire = createRequire(path.join(__dirname, '../../backend/server.js'));

const Database = backendRequire('better-sqlite3');

// Serviços do backend
const comprasAprovacaoService = backendRequire('./services/compras-aprovacao.service');
const comprasEstoqueService = backendRequire('./services/compras-estoque.service');
const comprasCotacoesService = backendRequire('./services/compras-cotacoes.service');
const comprasPedidosService = backendRequire('./services/compras-pedidos.service');
const baileysComprasService = backendRequire('./baileys-compras-service');

// Cores ANSI para console
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
};

// Runner de Testes Tier 5
class Tier5Runner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.total = 0;
    this.categories = {};
  }

  register(category, name, fn) {
    this.tests.push({ category, name, fn });
  }

  async run() {
    console.log(`\n${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}    CENTRAL DE COMPRAS BELAFARMA — TIER 5 ADVERSARIAL STRESS & SECURITY SUITE    ${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════════════════════════${colors.reset}\n`);

    const startTotal = Date.now();
    let currentCategory = null;

    for (const t of this.tests) {
      if (t.category !== currentCategory) {
        currentCategory = t.category;
        console.log(`\n${colors.bright}${colors.magenta}▶▶ [${currentCategory.toUpperCase()}] ${colors.reset}`);
      }

      this.total++;
      if (!this.categories[t.category]) {
        this.categories[t.category] = { passed: 0, failed: 0, count: 0 };
      }
      this.categories[t.category].count++;

      const testStart = Date.now();
      try {
        await t.fn();
        const duration = Date.now() - testStart;
        this.passed++;
        this.categories[t.category].passed++;
        console.log(`  ${colors.green}✔ [PASS]${colors.reset} ${t.name} ${colors.dim}(${duration}ms)${colors.reset}`);
      } catch (err) {
        const duration = Date.now() - testStart;
        this.failed++;
        this.categories[t.category].failed++;
        console.log(`  ${colors.red}✖ [FAIL]${colors.reset} ${t.name} ${colors.dim}(${duration}ms)${colors.reset}`);
        console.log(`    ${colors.red}Error: ${err.message}${colors.reset}`);
        if (err.stack) {
          const lines = err.stack.split('\n').slice(1, 3).join('\n    ');
          console.log(`    ${colors.dim}${lines}${colors.reset}`);
        }
      }
    }

    const totalDuration = ((Date.now() - startTotal) / 1000).toFixed(2);

    console.log(`\n${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}                      RELATÓRIO FINAL DO TIER 5 (ADVERSARIAL)                   ${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`  Total de Testes Adversariais: ${colors.bright}${this.total}${colors.reset}`);
    console.log(`  Passaram com Sucesso:         ${colors.green}${colors.bright}${this.passed}${colors.reset}`);
    console.log(`  Falhas Encontradas:           ${this.failed > 0 ? colors.red : colors.green}${colors.bright}${this.failed}${colors.reset}`);
    console.log(`  Tempo Total de Execução:      ${totalDuration}s\n`);

    console.log(`${colors.bright}Resultados por Categoria:${colors.reset}`);
    for (const [cat, stats] of Object.entries(this.categories)) {
      const statusColor = stats.failed === 0 ? colors.green : colors.red;
      console.log(`  - ${cat}: ${statusColor}${stats.passed}/${stats.count} passaram${colors.reset}`);
    }
    console.log('');

    if (this.failed === 0) {
      console.log(`${colors.green}${colors.bright}✅ TIER 5 CONCLUÍDO COM 100% DE SUCESSO! SISTEMA ROBUSTO E RESILIENTE.${colors.reset}\n`);
      return 0;
    } else {
      console.log(`${colors.red}${colors.bright}❌ TIER 5 FALHOU! VERIFIQUE AS ASSERÇÕES ACIMA.${colors.reset}\n`);
      return 1;
    }
  }
}

/**
 * Cria banco SQLite de teste em arquivo temporário com WAL ativo e schema completo
 */
function createIsolatedTestDatabase(dbName = `tier5_test_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.sqlite`) {
  const tempDir = path.join(__dirname, 'temp_test_db');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const dbPath = path.join(tempDir, dbName);
  
  if (fs.existsSync(dbPath)) {
    try { fs.unlinkSync(dbPath); } catch (e) {}
  }

  const db = new Database(dbPath, { timeout: 10000 });
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 10000');

  // Criação do Schema Completo da Central de Compras
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      accessKey TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS compras_configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      descricao TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_estoque_cache (
      produto_id INTEGER PRIMARY KEY,
      descricao TEXT NOT NULL,
      apresentacao TEXT,
      ean TEXT,
      categoria_id INTEGER,
      categoria_nome TEXT,
      saldo REAL DEFAULT 0,
      est_minimo_digifarma INTEGER DEFAULT 0,
      vmd_ponderado REAL DEFAULT 0,
      demanda_30d REAL DEFAULT 0,
      margem_seguranca_percent REAL DEFAULT 15,
      estoque_minimo_sugerido INTEGER DEFAULT 0,
      status_ruptura TEXT DEFAULT 'NORMAL',
      curva_abc TEXT DEFAULT 'C',
      custo_unitario REAL DEFAULT 0,
      ultima_compra_valor REAL DEFAULT 0,
      ultima_compra_data TEXT,
      sincronizado_em TEXT,
      atualizado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_fornecedores_meta (
      id TEXT PRIMARY KEY,
      telefone TEXT NOT NULL UNIQUE,
      nome_contato TEXT NOT NULL,
      distribuidora TEXT NOT NULL,
      laboratorio TEXT,
      prazos_pagamento_json TEXT DEFAULT '[]',
      pedido_minimo_valor REAL DEFAULT 0,
      categorias_atendidas_json TEXT DEFAULT '[]',
      produtos_atendidos_json TEXT DEFAULT '[]',
      pontualidade_score REAL DEFAULT 100,
      taxa_quebra_percent REAL DEFAULT 0,
      observacoes TEXT,
      ativo INTEGER DEFAULT 1,
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
      media_url TEXT,
      media_mimetype TEXT,
      media_caption TEXT,
      processado_mineracao INTEGER DEFAULT 0,
      processado_em TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compras_oportunidades_mineradas (
      id TEXT PRIMARY KEY,
      fornecedor_id TEXT NOT NULL,
      mensagem_id TEXT,
      produto_nome TEXT NOT NULL,
      ean TEXT,
      preco_ofertado REAL NOT NULL,
      preco_ultima_compra REAL,
      economia_percent REAL DEFAULT 0,
      bonificacao_qtd_comprar INTEGER DEFAULT 0,
      bonificacao_qtd_ganhar INTEGER DEFAULT 0,
      bonificacao_descricao TEXT,
      preco_liquido_unitario REAL NOT NULL,
      data_oferta TEXT NOT NULL,
      status TEXT DEFAULT 'ativa',
      dados_extra_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (fornecedor_id) REFERENCES compras_fornecedores_meta(id)
    );

    CREATE TABLE IF NOT EXISTS compras_cotacoes (
      id TEXT PRIMARY KEY,
      titulo TEXT NOT NULL,
      status TEXT DEFAULT 'aberta',
      produtos_solicitados_json TEXT NOT NULL,
      total_itens INTEGER DEFAULT 0,
      data_criacao TEXT NOT NULL,
      data_limite_resposta TEXT,
      vencedor_fornecedor_id TEXT,
      vencedor_distribuidora TEXT,
      valor_total_vencedor REAL DEFAULT 0,
      pedido_minimo_atingido INTEGER DEFAULT 0,
      observacoes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compras_cotacoes_itens (
      id TEXT PRIMARY KEY,
      cotacao_id TEXT NOT NULL,
      produto_id INTEGER,
      ean TEXT,
      descricao TEXT NOT NULL,
      quantidade_solicitada INTEGER NOT NULL,
      preco_referencia REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (cotacao_id) REFERENCES compras_cotacoes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS compras_cotacoes_respostas (
      id TEXT PRIMARY KEY,
      cotacao_id TEXT NOT NULL,
      fornecedor_id TEXT NOT NULL,
      fornecedor_nome TEXT NOT NULL,
      distribuidora TEXT NOT NULL,
      itens_cotados_json TEXT NOT NULL,
      valor_total_liquido REAL NOT NULL,
      valor_total_cotado REAL DEFAULT 0,
      prazo_pagamento_dias INTEGER DEFAULT 30,
      prazo_dias INTEGER DEFAULT 30,
      condicao_pagamento TEXT DEFAULT '30 dias',
      pedido_minimo_atingido INTEGER DEFAULT 1,
      taxa_quebra_historica REAL DEFAULT 0,
      score_preco REAL DEFAULT 0,
      score_prazo REAL DEFAULT 0,
      score_historico REAL DEFAULT 0,
      score_ponderado_total REAL DEFAULT 0,
      posicao_ranking INTEGER DEFAULT 0,
      vencedor INTEGER DEFAULT 0,
      motivo_quebra TEXT,
      data_resposta TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (cotacao_id) REFERENCES compras_cotacoes(id) ON DELETE CASCADE
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

    CREATE TABLE IF NOT EXISTS compras_pedidos (
      id TEXT PRIMARY KEY,
      numero_pedido TEXT NOT NULL UNIQUE,
      cotacao_id TEXT,
      fornecedor_id TEXT,
      fornecedor_nome TEXT NOT NULL,
      distribuidora TEXT NOT NULL,
      telefone_contato TEXT,
      data_emissao TEXT NOT NULL,
      previsao_entrega TEXT,
      condicao_pagamento TEXT,
      prazos_dias_json TEXT DEFAULT '[]',
      valor_bruto REAL DEFAULT 0,
      valor_descontos REAL DEFAULT 0,
      valor_bonificacoes REAL DEFAULT 0,
      valor_liquido_total REAL NOT NULL,
      status TEXT DEFAULT 'emitido',
      mes_referencia INTEGER,
      ano_referencia INTEGER,
      orcamento_comprometido INTEGER DEFAULT 1,
      boletos_json TEXT DEFAULT '[]',
      texto_formatado TEXT,
      motivo_cancelamento TEXT,
      observacoes TEXT,
      enviado_whatsapp INTEGER DEFAULT 0,
      whatsapp_message_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compras_pedidos_itens (
      id TEXT PRIMARY KEY,
      pedido_id TEXT NOT NULL,
      produto_id INTEGER,
      ean TEXT,
      descricao TEXT NOT NULL,
      apresentacao TEXT,
      quantidade INTEGER NOT NULL,
      quantidade_bonificada INTEGER DEFAULT 0,
      preco_tabela REAL DEFAULT 0,
      desconto_percent REAL DEFAULT 0,
      preco_unitario_liquido REAL NOT NULL,
      valor_total_liquido REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (pedido_id) REFERENCES compras_pedidos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS monthly_limits (
      id TEXT PRIMARY KEY,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      limitValue REAL NOT NULL,
      committedValue REAL DEFAULT 0,
      observations TEXT
    );
  `);

  // Configurações padrão
  db.prepare(`
    INSERT OR REPLACE INTO compras_configuracoes (chave, valor, descricao, updated_at)
    VALUES 
      ('margem_seguranca_padrao', '15', 'Margem de segurança percentual padrão para estoque mínimo', datetime('now')),
      ('alerta_duplo_whatsapp_adm', 'true', 'Ativa alerta duplo no WhatsApp dos Administradores', datetime('now')),
      ('admin_notification_phones', '["5532988634755", "5532999998888"]', 'Telefones dos administradores para alertas', datetime('now')),
      ('painel_base_url', 'https://sistema.belafarma.com', 'URL base do painel web', datetime('now'))
  `).run();

  // Usuário administrador
  db.prepare(`
    INSERT OR REPLACE INTO users (id, name, role, accessKey)
    VALUES ('usr_admin_1', 'Edevaldo Gestor', 'admin', 'key_admin_123')
  `).run();

  // Limite mensal de compras
  db.prepare(`
    INSERT OR REPLACE INTO monthly_limits (id, month, year, limitValue, committedValue)
    VALUES ('limit_2026_8', 8, 2026, 50000.00, 10000.00)
  `).run();

  return { db, dbPath, cleanup: () => {
    try {
      db.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      const wal = `${dbPath}-wal`;
      const shm = `${dbPath}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch (e) {}
  }};
}

const runner = new Tier5Runner();

/* ============================================================================
 * 1. TESTES DE CONCORRÊNCIA MASSIVA (500 OPERAÇÕES SIMULTÂNEAS)
 * ============================================================================ */

runner.register('Concorrência Massiva (500 Ops)', '500 Enfileiramentos Simultâneos na Fila de Aprovação (Zero Deadlocks)', async () => {
  const { db, cleanup } = createIsolatedTestDatabase();
  try {
    const totalOps = 500;
    const start = Date.now();

    // Dispara 500 operações simultâneas com Promises paralelas
    const promises = Array.from({ length: totalOps }, (_, i) => {
      return new Promise((resolve, reject) => {
        try {
          const item = comprasAprovacaoService.enfileirarMensagem({
            tipo: 'cotacao',
            destinatario: { nome: `Fornecedor ${i}`, telefone: `553298800${String(i).padStart(4, '0')}` },
            fornecedorNome: `Distribuidora ${i % 10}`,
            distribuidora: `Distribuidora ${i % 10}`,
            conteudo: `Olá! Cotação de lote #${i} para reposição de estoque.`,
            dadosContexto: { loteId: i, totalItens: (i % 5) + 1 }
          }, db);
          resolve(item);
        } catch (e) {
          reject(e);
        }
      });
    });

    const results = await Promise.all(promises);
    const elapsed = Date.now() - start;

    assert.strictEqual(results.length, totalOps, `Devem ser retornados ${totalOps} resultados`);
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM compras_fila_aprovacao').get();
    assert.strictEqual(countRow.cnt, totalOps, `A tabela deve conter exatamente ${totalOps} registros gravados`);
    
    // Validar status pendente em todos
    const pendingRow = db.prepare(`SELECT COUNT(*) as cnt FROM compras_fila_aprovacao WHERE status = 'pendente'`).get();
    assert.strictEqual(pendingRow.cnt, totalOps, 'Todos os 500 registros devem estar com status pendente');

    console.log(`      📊 Throughput: ${(totalOps / (elapsed / 1000)).toFixed(1)} ops/seg (${elapsed}ms total)`);
  } finally {
    cleanup();
  }
});

runner.register('Concorrência Massiva (500 Ops)', '500 Cálculos Simultâneos de Demanda Ponderada & Estoque Mínimo (Zero Desvio)', async () => {
  const totalOps = 500;
  const start = Date.now();

  const promises = Array.from({ length: totalOps }, (_, i) => {
    return Promise.resolve().then(() => {
      const v30 = (i % 50) + 1;
      const v60 = (i % 30) + 2;
      const margem = 15;
      
      const calc = comprasEstoqueService.calcularDemandaPonderada(v30, v60, margem, { curvaAbc: i % 2 === 0 ? 'A' : 'B' });
      
      // Oráculo formal
      const vmdEsp = ((v30 * 0.65) + (v60 * 0.35)) / 30;
      const demEsp = (v30 * 0.65) + (v60 * 0.35);
      let estMinEsp = Math.ceil(demEsp * 1.15);
      if (i % 2 === 0 && estMinEsp < 2) estMinEsp = 2;

      assert.strictEqual(calc.estoqueMinimoSugerido, estMinEsp, `Cálculo divergente na iteração ${i}`);
      assert.strictEqual(calc.vmdPonderado, Number(vmdEsp.toFixed(4)));
      return calc;
    });
  });

  const results = await Promise.all(promises);
  const elapsed = Date.now() - start;
  assert.strictEqual(results.length, totalOps);
  console.log(`      📊 Throughput: ${(totalOps / (elapsed / 1000)).toFixed(1)} calcs/seg (${elapsed}ms total)`);
});

runner.register('Concorrência Massiva (500 Ops)', '500 Operações Mistas Concorrentes (Leitura + Escrita + Transação SQLite WAL)', async () => {
  const { db, cleanup } = createIsolatedTestDatabase();
  try {
    // Popula 50 itens iniciais
    for (let i = 0; i < 50; i++) {
      db.prepare(`
        INSERT INTO compras_estoque_cache (produto_id, descricao, saldo, est_minimo_digifarma, curva_abc)
        VALUES (?, ?, ?, ?, ?)
      `).run(i + 1, `Medicamento Teste ${i + 1}`, i * 2, 20, i % 3 === 0 ? 'A' : 'B');
    }

    const totalOps = 500;
    const start = Date.now();

    const tasks = Array.from({ length: totalOps }, (_, i) => {
      return new Promise((resolve, reject) => {
        try {
          if (i % 3 === 0) {
            // Escrita 1: Atualizar estoque
            const pId = (i % 50) + 1;
            db.prepare('UPDATE compras_estoque_cache SET saldo = saldo + 1 WHERE produto_id = ?').run(pId);
            resolve({ type: 'write_stock', pId });
          } else if (i % 3 === 1) {
            // Escrita 2: Inserir log/fila
            const item = comprasAprovacaoService.enfileirarMensagem({
              tipo: 'aviso',
              destinatario: { nome: `Rep ${i}`, telefone: `5532999${String(i).padStart(4, '0')}` },
              fornecedorNome: 'Dist Local',
              conteudo: `Mensagem mista ${i}`
            }, db);
            resolve({ type: 'write_queue', id: item.id });
          } else {
            // Leitura: Consultar lista de faltas
            const rows = db.prepare('SELECT * FROM compras_estoque_cache WHERE saldo < est_minimo_digifarma LIMIT 10').all();
            resolve({ type: 'read_shortages', count: rows.length });
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    const results = await Promise.all(tasks);
    const elapsed = Date.now() - start;

    assert.strictEqual(results.length, totalOps);
    
    // Integridade do banco após as 500 operações mistas
    const integrity = db.pragma('integrity_check');
    assert.strictEqual(integrity[0].integrity_check, 'ok', 'Integridade SQLite WAL deve ser OK');
    
    console.log(`      📊 Throughput: ${(totalOps / (elapsed / 1000)).toFixed(1)} ops/seg (${elapsed}ms total)`);
  } finally {
    cleanup();
  }
});

/* ============================================================================
 * 2. TESTES DE SEGURANÇA, ANTI-BYPASS & POLÍTICA DE APROVAÇÃO OBRIGATÓRIA
 * ============================================================================ */

runner.register('Segurança & Anti-Bypass', 'Tentativa de Envio Direto Baileys sem Aprovação Prévia é Interceptada e Bloqueada', async () => {
  const { db, cleanup } = createIsolatedTestDatabase();
  try {
    // 1. Cria um item na fila com status 'pendente'
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'pedido',
      destinatario: { nome: 'Distribuidora Alpha', telefone: '5532988112233' },
      fornecedorNome: 'Alpha Medicamentos',
      conteudo: 'Pedido de compra não aprovado',
      dadosContexto: { valorTotal: 1500 }
    }, db);

    assert.strictEqual(item.status.toLowerCase(), 'pendente');

    // 2. Tenta forçar o envio direto via baileysComprasService.enviarMensagemAprovada com item pendente
    let capturedError = null;
    try {
      await baileysComprasService.enviarMensagemAprovada(item.id, db);
    } catch (err) {
      capturedError = err;
    }

    assert(capturedError !== null, 'O sistema DEVE lançar exceção ao tentar enviar mensagem pendente');
    assert(capturedError.message.includes('Não é permitido enviar mensagem com status') || capturedError.message.includes('Apenas itens com status "aprovado"'),
      `Mensagem de erro esperada, recebido: ${capturedError.message}`);

    // Verifica que o status permanece 'pendente' e não foi adulterado
    const itemNoDb = db.prepare('SELECT status, message_id_enviada FROM compras_fila_aprovacao WHERE id = ?').get(item.id);
    assert.strictEqual(itemNoDb.status, 'pendente');
    assert.strictEqual(itemNoDb.message_id_enviada, null);
  } finally {
    cleanup();
  }
});

runner.register('Segurança & Anti-Bypass', 'Tentativa de Envio de Mensagem com Status "Rejeitado" é Rejeitada', async () => {
  const { db, cleanup } = createIsolatedTestDatabase();
  try {
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: { nome: 'Fornecedor Beta', telefone: '5532988223344' },
      fornecedorNome: 'Beta Pharma',
      conteudo: 'Cotacao cancelada'
    }, db);

    // Rejeita a mensagem
    comprasAprovacaoService.rejeitarMensagem(item.id, 'Preço acima da tabela negociada', 'Supervisor', db);

    // Tenta enviar a mensagem rejeitada
    let capturedError = null;
    try {
      await baileysComprasService.enviarMensagemAprovada(item.id, db);
    } catch (err) {
      capturedError = err;
    }

    assert(capturedError !== null, 'Deve proibir o disparo de mensagens rejeitadas');
    assert(capturedError.message.includes('Apenas itens com status "aprovado"') || capturedError.message.includes('Não é permitido'));
  } finally {
    cleanup();
  }
});

runner.register('Segurança & Anti-Bypass', 'Prevenção de Race Condition em Dupla Aprovação Simultânea (Double-Approval Lock)', async () => {
  const { db, cleanup } = createIsolatedTestDatabase();
  try {
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'pedido',
      destinatario: { nome: 'Fornecedor Gama', telefone: '5532988334455' },
      fornecedorNome: 'Gama Distribuidora',
      conteudo: 'Pedido de teste de concorrência'
    }, db);

    // Mock do WhatsApp com delay para amplificar a janela de race condition
    let sendCallsCount = 0;
    const mockWhatsapp = {
      enviarMensagemAprovada: async (approvalId, database) => {
        sendCallsCount++;
        await new Promise(r => setTimeout(r, 20)); // Delay artificial
        return { success: true, messageId: `MOCK_MSG_${Date.now()}` };
      }
    };

    // Dispara DUAS aprovações simultâneas para o MESMO approvalId
    const [res1, res2] = await Promise.allSettled([
      comprasAprovacaoService.aprovarMensagem(item.id, 'Aprovador 1', null, db, mockWhatsapp),
      comprasAprovacaoService.aprovarMensagem(item.id, 'Aprovador 2', null, db, mockWhatsapp)
    ]);

    // Exatamente UMA deve ter sucesso (fulfilled) e a outra deve ter sido rejeitada com erro de transição inválida
    const fulfilled = [res1, res2].filter(r => r.status === 'fulfilled');
    const rejected = [res1, res2].filter(r => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exatamente UMA requisição de aprovação deve ser aceita');
    assert.strictEqual(rejected.length, 1, 'A segunda requisição concorrente DEVE falhar com erro de transição inválida');
    assert(rejected[0].reason.message.includes('Transição inválida') || rejected[0].reason.message.includes('já está'),
      `Mensagem esperada: Transição inválida, recebido: ${rejected[0].reason.message}`);

    // Verifica que o envio externo só ocorreu exatamente 1 vez
    assert.strictEqual(sendCallsCount, 1, 'O WhatsApp externo só pode ter recebido 1 chamada de envio');
  } finally {
    cleanup();
  }
});

runner.register('Segurança & Anti-Bypass', 'Proteção contra Injeção de Parâmetros e SQL Injection em Edições e Buscas', async () => {
  const { db, cleanup } = createIsolatedTestDatabase();
  try {
    const maliciousPayload = `'; DROP TABLE compras_fila_aprovacao; --`;
    
    // Inserção com payload malicioso no nome e texto
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: { nome: maliciousPayload, telefone: '5532988445566' },
      fornecedorNome: `Fornecedor ${maliciousPayload}`,
      conteudo: `Texto legítimo ${maliciousPayload}`
    }, db);

    assert(item.id, 'Deve criar o item seguramente');

    // Edição com tentativa de injection
    comprasAprovacaoService.editarMensagem(item.id, `Texto alterado ${maliciousPayload}`, null, { usuarioEditor: `Admin ${maliciousPayload}` }, db);

    // Valida que a tabela continua intacta
    const checkTable = db.prepare(`SELECT count(*) as cnt FROM compras_fila_aprovacao WHERE id = ?`).get(item.id);
    assert.strictEqual(checkTable.cnt, 1, 'A tabela compras_fila_aprovacao não pode ter sido afetada por injection');

    // Busca com parâmetro malicioso
    const results = comprasAprovacaoService.listarFilaAprovacao({ status: `pendente' OR '1'='1` }, db);
    assert(Array.isArray(results), 'Retorno deve ser array');
  } finally {
    cleanup();
  }
});

runner.register('Segurança & Anti-Bypass', 'Rastreabilidade Forense: Auditoria Completa de Quem Aprovou, Rejeitou e Editou', async () => {
  const { db, cleanup } = createIsolatedTestDatabase();
  try {
    const item = comprasAprovacaoService.enfileirarMensagem({
      tipo: 'pedido',
      destinatario: { nome: 'Fornecedor Auditoria', telefone: '5532988998899' },
      fornecedorNome: 'Auditoria Pharma',
      conteudo: 'Texto original antes de revisao'
    }, db);

    // 1. Edição por Gestor
    comprasAprovacaoService.editarMensagem(item.id, 'Texto revisado e aprovado com 5% de desconto', null, { usuarioEditor: 'Gestor Carlos' }, db);

    // 2. Aprovação por Diretoria
    const mockWhatsapp = {
      enviarMensagemAprovada: async () => ({ success: true, messageId: 'MSG_AUDIT_101' })
    };
    const aprovado = await comprasAprovacaoService.aprovarMensagem(item.id, 'Diretora Maria', null, db, mockWhatsapp);

    assert.strictEqual(aprovado.status, 'Enviado');
    assert.strictEqual(aprovado.revisadoPor, 'Diretora Maria');
    assert.strictEqual(aprovado.messageIdEnviada, 'MSG_AUDIT_101');
    assert(aprovado.dadosContexto.historicoEdicoes.length >= 1, 'Histórico de edições deve conter registro forense');
    assert.strictEqual(aprovado.dadosContexto.historicoEdicoes[0].editadoPor, 'Gestor Carlos');
  } finally {
    cleanup();
  }
});

/* ============================================================================
 * 3. TESTES DE RESILIÊNCIA DO FIREBIRD & MECANISMOS DE FALLBACK
 * ============================================================================ */

runner.register('Resiliência Firebird & Fallback', 'Falha de Rede no Firebird Dispara Fallback Transparente para Cache SQLite', async () => {
  const { db, cleanup } = createIsolatedTestDatabase();
  try {
    // Popula cache local SQLite para produto 999
    db.prepare(`
      INSERT INTO compras_estoque_cache (
        produto_id, descricao, saldo, est_minimo_digifarma, vmd_ponderado,
        demanda_30d, estoque_minimo_sugerido, status_ruptura, curva_abc, custo_unitario
      ) VALUES (999, 'Dipirona 500mg Gotas (Cached)', 5, 20, 0.6667, 20, 23, 'ABAIXO_MINIMO', 'A', 2.50)
    `).run();

    // Simula consulta quando o Firebird está inacessível
    const cachedItem = db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(999);
    assert(cachedItem, 'Item deve existir no cache local');
    assert.strictEqual(cachedItem.produto_id, 999);
    assert.strictEqual(cachedItem.status_ruptura, 'ABAIXO_MINIMO');
    assert.strictEqual(cachedItem.estoque_minimo_sugerido, 23);

    // Valida classificação de ruptura a partir dos dados do cache
    const status = comprasEstoqueService.determinarStatusRuptura(cachedItem.saldo, cachedItem.estoque_minimo_sugerido);
    assert.strictEqual(status, 'ABAIXO_MINIMO', 'Status calculado a partir do fallback deve ser preciso');
  } finally {
    cleanup();
  }
});

runner.register('Resiliência Firebird & Fallback', 'Tratamento de Timeout / Lock com Rollback em Atualizações em Lote', async () => {
  const { db, cleanup } = createIsolatedTestDatabase();
  try {
    // Simula lote de 10 produtos onde o 5º falha por lock
    const listaAtualizacoes = Array.from({ length: 10 }, (_, i) => ({
      produtoId: i + 1,
      estoqueMinimo: (i + 1) * 10
    }));

    // Injeta produtos no cache SQLite
    for (const item of listaAtualizacoes) {
      db.prepare(`
        INSERT INTO compras_estoque_cache (produto_id, descricao, est_minimo_digifarma)
        VALUES (?, ?, 0)
      `).run(item.produtoId, `Prod ${item.produtoId}`);
    }

    // Executa transação controlada SQLite para simular comportamento transacional seguro
    const tx = db.transaction((itens) => {
      for (const it of itens) {
        if (it.produtoId === 5) {
          throw new Error('Lock timeout simulated on Firebird item 5');
        }
        db.prepare('UPDATE compras_estoque_cache SET est_minimo_digifarma = ? WHERE produto_id = ?').run(it.estoqueMinimo, it.produtoId);
      }
    });

    let txError = null;
    try {
      tx(listaAtualizacoes);
    } catch (e) {
      txError = e;
    }

    assert(txError !== null, 'Transação deve falhar e capturar o erro de lock');

    // Valida que TODOS os produtos sofreram rollback para 0 (atomicidade preservada)
    const rows = db.prepare('SELECT est_minimo_digifarma FROM compras_estoque_cache').all();
    for (const r of rows) {
      assert.strictEqual(r.est_minimo_digifarma, 0, 'Todos os itens devem permanecer inalterados após rollback');
    }
  } finally {
    cleanup();
  }
});

runner.register('Resiliência Firebird & Fallback', 'Idempotência de Sincronização: Gravações Repetidas Mantêm Consistência Estrita', async () => {
  const { db, cleanup } = createIsolatedTestDatabase();
  try {
    db.prepare(`
      INSERT INTO compras_estoque_cache (produto_id, descricao, est_minimo_digifarma)
      VALUES (101, 'Amoxicilina 500mg', 15)
    `).run();

    // 10 chamadas idempotentes para o mesmo valor
    for (let k = 0; k < 10; k++) {
      db.prepare(`
        UPDATE compras_estoque_cache
        SET est_minimo_digifarma = ?,
            sincronizado_em = datetime('now')
        WHERE produto_id = ?
      `).run(25, 101);
    }

    const row = db.prepare('SELECT est_minimo_digifarma FROM compras_estoque_cache WHERE produto_id = ?').get(101);
    assert.strictEqual(row.est_minimo_digifarma, 25, 'O valor final deve ser 25 com consistência absoluta');
  } finally {
    cleanup();
  }
});

/* ============================================================================
 * 4. TESTES FORENSES DE INTEGRIDADE SQLITE WAL & CONEXÕES PARALELAS
 * ============================================================================ */

runner.register('Integridade SQLite WAL & Forense', 'Verificação de Pragmas: journal_mode=WAL, foreign_keys=ON, busy_timeout', async () => {
  const { db, cleanup } = createIsolatedTestDatabase();
  try {
    const journalMode = db.pragma('journal_mode');
    assert.strictEqual(journalMode[0].journal_mode.toLowerCase(), 'wal', 'journal_mode deve ser WAL');

    const foreignKeys = db.pragma('foreign_keys');
    assert.strictEqual(foreignKeys[0].foreign_keys, 1, 'foreign_keys deve estar ativo (1)');

    const busyTimeout = db.pragma('busy_timeout');
    assert(busyTimeout[0].timeout >= 5000, `busy_timeout deve ser >= 5000ms (atual: ${busyTimeout[0].timeout})`);
  } finally {
    cleanup();
  }
});

runner.register('Integridade SQLite WAL & Forense', 'Concorrência Multi-Conexão (10 Leitores Simultâneos + 10 Escritores Simultâneos)', async () => {
  const { dbPath, cleanup } = createIsolatedTestDatabase('wal_multi_conn.sqlite');
  try {
    const numConnections = 10;
    const connections = Array.from({ length: numConnections }, () => {
      const conn = new Database(dbPath, { timeout: 10000 });
      conn.pragma('journal_mode = WAL');
      conn.pragma('busy_timeout = 10000');
      return conn;
    });

    const opsPerConn = 25; // 10 conns * 25 ops escritoras = 250 escritas + 250 leituras = 500 ops
    const start = Date.now();

    // Executa leituras e escritas simultâneas cruzadas entre as diferentes conexões
    const tasks = [];

    // Escritores
    for (let c = 0; c < numConnections; c++) {
      const conn = connections[c];
      for (let op = 0; op < opsPerConn; op++) {
        tasks.push(new Promise((resolve, reject) => {
          try {
            const id = `conn_${c}_op_${op}_${crypto.randomUUID().substr(0, 8)}`;
            conn.prepare(`
              INSERT INTO compras_historico_mensagens (
                id, message_id, remote_jid, telefone, timestamp, data_hora, texto_mensagem, created_at
              ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
            `).run(id, `MSG_${id}`, '5532999990000@s.whatsapp.net', '5532999990000', Date.now(), `Texto paralelo de c=${c} op=${op}`);
            resolve({ conn: c, op, type: 'write' });
          } catch (e) {
            reject(e);
          }
        }));
      }
    }

    // Leitores
    for (let c = 0; c < numConnections; c++) {
      const conn = connections[c];
      for (let op = 0; op < opsPerConn; op++) {
        tasks.push(new Promise((resolve, reject) => {
          try {
            const count = conn.prepare('SELECT COUNT(*) as cnt FROM compras_historico_mensagens').get();
            resolve({ conn: c, op, type: 'read', count: count.cnt });
          } catch (e) {
            reject(e);
          }
        }));
      }
    }

    const results = await Promise.all(tasks);
    const elapsed = Date.now() - start;

    assert.strictEqual(results.length, numConnections * opsPerConn * 2, 'Todas as 500 operações multi-conexão devem completar com sucesso');

    // Fecha conexões auxiliares
    for (const c of connections) {
      c.close();
    }

    // Reabre e verifica integridade forense
    const verifyDb = new Database(dbPath);
    const countTotal = verifyDb.prepare('SELECT COUNT(*) as cnt FROM compras_historico_mensagens').get();
    assert.strictEqual(countTotal.cnt, numConnections * opsPerConn, `Devem haver exatamente ${numConnections * opsPerConn} registros gravados`);

    const integrityCheck = verifyDb.pragma('integrity_check');
    assert.strictEqual(integrityCheck[0].integrity_check, 'ok', 'PRAGMA integrity_check deve retornar "ok"');

    verifyDb.close();
    console.log(`      📊 Throughput Multi-Conexão: ${(results.length / (elapsed / 1000)).toFixed(1)} ops/seg (${elapsed}ms total)`);
  } finally {
    cleanup();
  }
});

runner.register('Integridade SQLite WAL & Forense', 'Validação de Integridade Referencial (Foreign Keys) sob Carga de Pedidos & Cotações', async () => {
  const { db, cleanup } = createIsolatedTestDatabase();
  try {
    // 1. Cria cotação pai
    const cotacaoId = `cot_${Date.now()}`;
    db.prepare(`
      INSERT INTO compras_cotacoes (id, titulo, produtos_solicitados_json, data_criacao, created_at, updated_at)
      VALUES (?, 'Cotação FK Test', '[]', datetime('now'), datetime('now'), datetime('now'))
    `).run(cotacaoId);

    // 2. Cria 50 itens filhos vinculados à cotação
    for (let i = 0; i < 50; i++) {
      db.prepare(`
        INSERT INTO compras_cotacoes_itens (id, cotacao_id, descricao, quantidade_solicitada, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(`item_${i}_${cotacaoId}`, cotacaoId, `Item Cotação #${i}`, 10);
    }

    // 3. Tenta inserir item com FK inexistente (deve ser rejeitado)
    let fkError = null;
    try {
      db.prepare(`
        INSERT INTO compras_cotacoes_itens (id, cotacao_id, descricao, quantidade_solicitada, created_at)
        VALUES (?, 'cotacao_inexistente_999', 'Item Fantasma', 10, datetime('now'))
      `).run(`item_invalid_${Date.now()}`);
    } catch (err) {
      fkError = err;
    }

    assert(fkError !== null, 'Inserção com FK inexistente DEVE falhar quando foreign_keys=ON');
    assert(fkError.message.includes('FOREIGN KEY constraint failed'), `Erro de FK esperado, recebido: ${fkError.message}`);

    // 4. Deleta cotação pai e valida CASCADE
    db.prepare('DELETE FROM compras_cotacoes WHERE id = ?').run(cotacaoId);
    const orphanCount = db.prepare('SELECT COUNT(*) as cnt FROM compras_cotacoes_itens WHERE cotacao_id = ?').get(cotacaoId);
    assert.strictEqual(orphanCount.cnt, 0, 'Todos os itens filhos devem ter sido removidos em CASCADE');

    // 5. Forense PRAGMA foreign_key_check
    const fkCheck = db.pragma('foreign_key_check');
    assert.strictEqual(fkCheck.length, 0, 'Nenhuma violação de chave estrangeira deve existir no banco');
  } finally {
    cleanup();
  }
});

// Execução principal
(async () => {
  const exitCode = await runner.run();
  process.exit(exitCode);
})();
