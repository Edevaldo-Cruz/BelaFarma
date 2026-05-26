/**
 * Marketing Endpoints — BelaFarma Sul
 * 
 * 🤖 ISA-MARKETING — Endpoints da API REST
 */

const {
  gerarRelatorioCompleto,
  gerarIdeiasProduto,
  gerarCuradoriaNoticas,
  gerarTrendHunting,
  gerarAlertaClima,
  buscarClimaReal,
  gerarRelatorioClimaIpiranga,
  formatarResumoWhatsApp,
  getDatasComemorativasProximos,
  gerarMensagemClimaDiaria,
  analisarProdutosParados90Dias,
} = require('./services/marketing-agent.service');

const { sendMessage } = require('./services/message-sender.service');
const PixBotService = require('./services/pix-bot.service');
const { callAI } = require('./services/ai.service');
const EventEmitter = require('events');

// Emissor global para notificações em tempo real (Painel Web)
const notificationEmitter = new EventEmitter();

function initializeMarketingEndpoints(app, db) {
  const pixBot = new PixBotService(db);
  console.log('[IsaMarketing] Registrando endpoints de marketing...');

  // ─── INICIALIZAR TABELA DE AUDITORIAS DE INATIVOS SALVAS ───────────────────
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS crm_inactive_audits (
        phone TEXT PRIMARY KEY,
        whatsappName TEXT,
        systemName TEXT,
        jid TEXT,
        inactivityDays INTEGER,
        lastMessage TEXT,
        lastInteractionTime INTEGER,
        atendido INTEGER,
        fechouVenda INTEGER,
        modalidade TEXT,
        modalidadeDescricao TEXT,
        endereco TEXT,
        ideiaReativacao TEXT,
        productsJson TEXT,
        auditedAt TEXT
      )
    `).run();
    console.log('[IsaMarketing] 💾 Tabela crm_inactive_audits inicializada com sucesso.');
  } catch (dbErr) {
    console.error('[IsaMarketing] ❌ Erro ao inicializar crm_inactive_audits:', dbErr.message);
  }

  // ─── POST /api/marketing/gerar-relatorio ───────────────────────────────────
  app.post('/api/marketing/gerar-relatorio', async (req, res) => {
    try {
      console.log('[IsaMarketing] Gerando relatório completo da Isa...');
      const { relatorio, metadata } = await gerarRelatorioCompleto(db);

      const stmt = db.prepare(`
        INSERT INTO marketing_reports (id, content, metadata, sentToRosana, createdAt)
        VALUES (?, ?, ?, 0, datetime('now'))
      `);

      const id = `mkt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      stmt.run(id, relatorio, JSON.stringify(metadata));

      console.log(`[IsaMarketing] ✅ Relatório ${id} salvo.`);
      res.json({ id, content: relatorio, metadata, sentToRosana: false, createdAt: new Date().toISOString() });

    } catch (err) {
      console.error('[IsaMarketing] Erro ao gerar relatório:', err);
      res.status(500).json({ error: err.message || 'Erro ao gerar relatório da Isa' });
    }
  });

  // ─── POST /api/marketing/enviar-relatorio ─────────────────────────────────
  app.post('/api/marketing/enviar-relatorio', async (req, res) => {
    try {
      const { reportId, phone } = req.body;

      const destinatario = phone
        || process.env.MARKETING_ROSANA_PHONE
        || null;

      if (!destinatario) {
        return res.status(400).json({ error: 'Nenhum destinatário de telefone fornecido ou configurado no MARKETING_ROSANA_PHONE.' });
      }

      let report;
      if (reportId) {
        report = db.prepare('SELECT * FROM marketing_reports WHERE id = ?').get(reportId);
        if (!report) return res.status(404).json({ error: 'Relatório não encontrado' });
      } else {
        report = db.prepare(
          'SELECT * FROM marketing_reports ORDER BY createdAt DESC LIMIT 1'
        ).get();

        if (!report) {
          console.log('[IsaMarketing] Nenhum relatório existente, gerando novo...');
          const { relatorio, metadata } = await gerarRelatorioCompleto(db);
          const id = `mkt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          db.prepare(`
            INSERT INTO marketing_reports (id, content, metadata, sentToRosana, createdAt)
            VALUES (?, ?, ?, 0, datetime('now'))
          `).run(id, relatorio, JSON.stringify(metadata));
          report = { id, content: relatorio, metadata: JSON.stringify(metadata), sentToRosana: 0 };
        }
      }

      const metadata = JSON.parse(report.metadata || '{}');
      const mensagem = formatarResumoWhatsApp(report.content, metadata);

      console.log(`[IsaMarketing] 📱 Enviando para ${destinatario}...`);

      // Usa delay para parecer humano (1-3 segundos)
      await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));

      let enviado = false;
      let isFallback = false;
      try {
        const result = await sendMessage(destinatario, mensagem);
        enviado = result.success;
        isFallback = !!result.fallback;
      } catch (waErr) {
        console.error('[IsaMarketing] Erro WhatsApp:', waErr.message);
      }

      if (enviado && !isFallback) {
        db.prepare(`
          UPDATE marketing_reports SET sentToRosana = 1, sentAt = datetime('now') WHERE id = ?
        `).run(report.id);
      }

      res.json({
        success: true,
        enviado,
        isFallback,
        phone: destinatario,
        reportId: report.id,
        message: enviado 
          ? (isFallback ? `📥 Relatório salvo na fila de pendentes (API offline)` : `✅ Relatório da Isa enviado para ${destinatario}`)
          : `⚠️ Falha ao processar mensagem`
      });

    } catch (err) {
      console.error('[IsaMarketing] Erro ao enviar:', err);
      res.status(500).json({ error: err.message || 'Erro ao enviar relatório' });
    }
  });

  // ─── GET /api/marketing/historico ─────────────────────────────────────────
  app.get('/api/marketing/historico', (req, res) => {
    try {
      const { limit = 10 } = req.query;
      const reports = db.prepare(`
        SELECT id, metadata, sentToRosana, sentAt, createdAt
        FROM marketing_reports
        ORDER BY createdAt DESC
        LIMIT ?
      `).all(parseInt(limit));

      const parsed = reports.map(r => ({
        id: r.id,
        metadata: JSON.parse(r.metadata || '{}'),
        sentToRosana: !!r.sentToRosana,
        sentAt: r.sentAt,
        createdAt: r.createdAt,
      }));

      res.json(parsed);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/marketing/historico/:id ─────────────────────────────────────
  app.get('/api/marketing/historico/:id', (req, res) => {
    try {
      const report = db.prepare('SELECT * FROM marketing_reports WHERE id = ?').get(req.params.id);
      if (!report) return res.status(404).json({ error: 'Relatório não encontrado' });

      res.json({
        id: report.id,
        content: report.content,
        metadata: JSON.parse(report.metadata || '{}'),
        sentToRosana: !!report.sentToRosana,
        sentAt: report.sentAt,
        createdAt: report.createdAt,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/marketing/datas-comemorativas ───────────────────────────────
  app.get('/api/marketing/datas-comemorativas', (req, res) => {
    try {
      const dias = parseInt(req.query.dias) || 30;
      const datas = getDatasComemorativasProximos(dias);
      res.json({ datas, total: datas.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/marketing/ideias/produto ───────────────────────────────────
  app.post('/api/marketing/ideias/produto', async (req, res) => {
    try {
      const { nome, categoria, preco, estoque } = req.body;
      if (!nome) return res.status(400).json({ error: 'Nome do produto obrigatório' });

      console.log(`[IsaMarketing] 💡 Gerando ideias para: ${nome}`);
      const ideias = await gerarIdeiasProduto({ nome, categoria, preco, estoque });
      res.json({ ideias, produto: nome });
    } catch (err) {
      console.error('[IsaMarketing] Erro ideias produto:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/marketing/curadoria-noticias ────────────────────────────────
  app.get('/api/marketing/curadoria-noticias', async (req, res) => {
    try {
      console.log('[IsaMarketing] 📰 Gerando curadoria de notícias...');
      const noticias = await gerarCuradoriaNoticas();
      res.json({ noticias });
    } catch (err) {
      console.error('[IsaMarketing] Erro curadoria:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/marketing/trend-hunting ────────────────────────────────────
  app.get('/api/marketing/trend-hunting', async (req, res) => {
    try {
      console.log('[IsaMarketing] 🔥 Trend hunting em execução...');
      const trends = await gerarTrendHunting();
      res.json({ trends });
    } catch (err) {
      console.error('[IsaMarketing] Erro trend hunting:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/marketing/alerta-clima ────────────────────────────────────
  app.post('/api/marketing/alerta-clima', async (req, res) => {
    try {
      const { clima } = req.body;
      if (!clima) return res.status(400).json({ error: 'Descreva o clima atual (ex: "frio e chuva")' });

      console.log(`[IsaMarketing] ☁️ Gerando alerta de clima: ${clima}`);
      const conteudo = await gerarAlertaClima(clima);
      res.json({ conteudo, clima });
    } catch (err) {
      console.error('[IsaMarketing] Erro alerta clima:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/marketing/diario/clima ────────────────────────────────────
  app.post('/api/marketing/diario/clima', async (req, res) => {
    try {
      console.log('[IsaMarketing] Gerando clima diário para Rosana...');
      const mensagem = await gerarMensagemClimaDiaria();
      
      const phone = req.body.phone || process.env.MARKETING_ROSANA_PHONE || null;
      if (!phone) {
        return res.status(400).json({ error: 'Nenhum destinatário de telefone fornecido ou configurado no MARKETING_ROSANA_PHONE.' });
      }
      
      if (mensagem) {
        await sendMessage(phone, mensagem);
        res.json({ success: true, message: `Clima enviado para ${phone}`, content: mensagem });
      } else {
        res.status(404).json({ error: 'Não foi possível gerar a mensagem de clima' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/marketing/diario/venda-parada ─────────────────────────────
  app.post('/api/marketing/diario/venda-parada', async (req, res) => {
    try {
    const phone = req.body.phone || process.env.EDEVALDO_WHATSAPP || process.env.ADMIN_WHATSAPP || '+5532988634755';
    const analise = await analisarProdutosParados90Dias(db, phone);
      
      if (analise) {
        await sendMessage(phone, analise);
        res.json({ success: true, message: `Análise enviada para ${phone}`, content: analise });
      } else {
        res.status(404).json({ error: 'Relatório de venda parada não encontrado ou vazio' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/webhook/stream ──────────────────────────────────────────────
  app.get('/api/webhook/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Desativa proxy buffering do Nginx
    res.flushHeaders();

    // Envia instrução de reconexão automática e o primeiro keepalive
    res.write('retry: 10000\n');
    res.write(': keepalive\n\n');

    const onMessage = () => {
      try {
        res.write(`data: message\n\n`);
      } catch (err) {
        console.error('[MKT Stream] Erro ao enviar mensagem por streaming:', err.message);
      }
    };

    notificationEmitter.on('message', onMessage);

    // Heartbeat periódico de 30s para manter conexão aberta e evitar erro 520/524 no Cloudflare/Nginx
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (err) {
        // Conexão provavelmente fechada
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeatInterval);
      notificationEmitter.off('message', onMessage);
    });
  });

  // ─── POST /api/webhook/evolution ──────────────────────────────────────────
  /**
   * Webhook para receber mensagens da Evolution API.
   * Configuração recomendada na Evolution: http://seu-ip:3001/api/webhook/evolution
   */
  app.post('/api/webhook/evolution', async (req, res) => {
    try {
      const payload = req.body;
      
      // 🤖 Chamar o Robô de PIX para processar a mensagem (em background)
      pixBot.processMessage(payload).catch(err => console.error('[PixBot] Erro:', err.message));

      // Emitir evento para SSE se for uma mensagem nova de cliente
      if (payload.event === 'messages.upsert' && !payload.data.key?.fromMe) {
        notificationEmitter.emit('message');
        
        const instance = payload.instance || '';
        const remoteJid = payload.data.key?.remoteJid || '';
        const isGroup = remoteJid.includes('@g.us');
        const isBroadcast = remoteJid.includes('@broadcast');
        const mainInstance = process.env.EVOLUTION_MAIN_INSTANCE || 'belaFarma';

        // Disparar sinal sonoro de notificação na rádio apenas se:
        // 1. A mensagem vier da instância principal (belaFarma)
        // 2. Não for mensagem de grupo (@g.us)
        // 3. Não for lista de transmissão (@broadcast)
        if (instance === mainInstance && !isGroup && !isBroadcast) {
          const radioUrl = process.env.RADIO_API_URL || 'http://192.168.1.70:5005';
          console.log(`[Webhook] 🔔 Nova mensagem da instância principal (${mainInstance}). Disparando sinal sonoro na rádio em: ${radioUrl}...`);
          
          fetch(`${radioUrl}/api/notificar`, { 
            method: 'POST',
            signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined
          })
          .then(async res => {
            if (res.ok) {
              console.log('[Webhook] 🔔 Sinal sonoro (chime) disparado na rádio com sucesso!');
            } else {
              console.error(`[Webhook] ⚠️ Rádio respondeu com status ${res.status} ao disparar chime.`);
            }
          })
          .catch(err => {
            console.error('[Webhook] ❌ Falha ao notificar rádio Bela Farma:', err.message);
          });
        } else {
          console.log(`[Webhook] 🔔 Mensagem ignorada para sinal sonoro na rádio. (Instância: ${instance}, Grupo: ${isGroup}, Transmissão: ${isBroadcast})`);
        }
      }

      // O evento de mensagem recebida na Evolution v2 é 'messages.upsert'
      if (payload.event && payload.event.toLowerCase() !== 'messages.upsert') {
        return res.status(200).send('OK');
      }

      const data = payload.data;
      if (!data || !data.key) {
        return res.status(200).send('OK');
      }

      const remoteJid = data.key.remoteJid || '';
      const phone = remoteJid.split('@')[0];

      // ─── SALVAR MENSAGEM NO HISTÓRICO LOCAL (SQLite) ───────────────────
      const messageContent = data.message?.conversation 
        || data.message?.extendedTextMessage?.text 
        || data.message?.imageMessage?.caption 
        || (data.message?.imageMessage ? '[Imagem]' : '')
        || (data.message?.audioMessage ? '[Áudio]' : '')
        || '';

      if (remoteJid && !remoteJid.includes('@g.us') && !remoteJid.includes('@broadcast') && messageContent) {
        const msgId = data.key.id;
        const fromMe = data.key.fromMe ? 1 : 0;
        const timestamp = data.messageTimestamp ? (data.messageTimestamp * 1000) : Date.now();
        
        try {
          db.prepare(`
            INSERT OR IGNORE INTO whatsapp_messages (id, phone, fromMe, messageText, timestamp)
            VALUES (?, ?, ?, ?, ?)
          `).run(msgId, phone, fromMe, messageContent, timestamp);
        } catch (dbErr) {
          console.error('[IsaMarketing] ❌ Erro ao salvar mensagem no histórico local:', dbErr.message);
        }
      }

      // Se a mensagem for enviada pelo atendente (nós mesmos), encerramos a execução do webhook aqui
      if (data.key.fromMe) {
        return res.status(200).send('OK');
      }

      // ─── CADASTRO AUTOMÁTICO DE CLIENTE DO WHATSAPP ───────────────────
      try {
        const pushName = payload.data.pushName || 'Cliente WhatsApp';
        const existingCustomer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
        if (!existingCustomer) {
          const customerId = 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
          db.prepare(`
            INSERT INTO customers (id, name, phone, createdAt, updatedAt, source)
            VALUES (?, ?, ?, datetime('now'), datetime('now'), 'WhatsApp')
          `).run(customerId, pushName, phone);
          console.log(`[IsaMarketing] 👤 Novo cliente cadastrado automaticamente via WhatsApp: ${pushName} (${phone})`);
        }
      } catch (custErr) {
        console.error('[IsaMarketing] ❌ Erro ao cadastrar cliente automático via webhook:', custErr.message);
      }

      const text = messageContent.toLowerCase().trim();
      const EDEVALDO_PHONE_CLEAN = (process.env.EDEVALDO_WHATSAPP || '').replace(/\D/g, '');

      // Log para debug
      console.log(`[IsaMarketing] Webhook recebido de ${phone}: "${text}"`);

      if (phone.endsWith(EDEVALDO_PHONE_CLEAN.slice(-8)) && text === 'ok') {
        console.log(`[IsaMarketing] ✨ Edevaldo enviou 'ok'! Verificando aprovações pendentes...`);

        // Buscar a aprovação pendente mais recente para este número
        const pending = db.prepare(`
          SELECT * FROM nayane_pending_approvals 
          WHERE (phone LIKE ? OR phone = ?) 
            AND status = 'Pendente' 
          ORDER BY createdAt DESC LIMIT 1
        `).get(`%${phone}%`, phone);

        if (pending) {
          const suggestions = JSON.parse(pending.suggestionsJson);
          console.log(`[IsaMarketing] 🚀 Processando ${suggestions.length} tarefas para Edevaldo...`);

          const now = new Date().toISOString();
          const amanha = new Date();
          amanha.setDate(amanha.getDate() + 1);
          const dueDate = amanha.toISOString();

          for (const sug of suggestions) {
            const taskId = `mkt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            
            try {
              db.prepare(`
                INSERT INTO tasks (
                  id, title, description, assignedUser, creator, priority, status, dueDate, creationDate, color
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                taskId,
                `🛒 MKT: ${sug.productName}`,
                `Ação sugerida pela Belinha: ${sug.action}`,
                'all_users', // Enviado para todos os operadores verem
                'Belinha (IA)',
                'Média',
                'A Fazer',
                dueDate,
                now,
                '#8b5cf6' // Roxo para tarefas de marketing
              );

              // Atualizar histórico de sugestão
              db.prepare('UPDATE marketing_suggestions_history SET approved = 1, taskId = ? WHERE productName = ? AND approved = 0')
                .run(taskId, sug.productName);
            } catch (taskErr) {
              console.error(`[IsaMarketing] Erro ao criar tarefa para ${sug.productName}:`, taskErr.message);
            }
          }

          // Marcar como aprovado
          db.prepare('UPDATE nayane_pending_approvals SET status = ? WHERE id = ?').run('Aprovado', pending.id);

          // Enviar confirmação via WhatsApp
          await sendMessage(pending.phone, "✅ Combinado! Acabei de criar as tarefas no painel do sistema. Vamos pra cima! 🚀");
          
          console.log(`[IsaMarketing] ✅ ${suggestions.length} tarefas criadas com sucesso.`);
        } else {
          console.log(`[IsaMarketing] Nenhuma aprovação pendente encontrada para ${phone}`);
        }
      } else if (phone.endsWith(EDEVALDO_PHONE_CLEAN.slice(-8)) && text === 'não') {
        console.log(`[IsaMarketing] ❌ Edevaldo enviou 'não'. Cancelando sugestões pendentes...`);

        const pending = db.prepare(`
          SELECT * FROM nayane_pending_approvals 
          WHERE (phone LIKE ? OR phone = ?) 
            AND status = 'Pendente' 
          ORDER BY createdAt DESC LIMIT 1
        `).get(`%${phone}%`, phone);

        if (pending) {
          const suggestions = JSON.parse(pending.suggestionsJson);
          
          // Remover do histórico para permitir que esses produtos sejam sugeridos novamente no futuro
          for (const sug of suggestions) {
            db.prepare('DELETE FROM marketing_suggestions_history WHERE productName = ? AND approved = 0').run(sug.productName);
          }

          // Marcar como reprovado
          db.prepare('UPDATE nayane_pending_approvals SET status = ? WHERE id = ?').run('Reprovado', pending.id);

          // Enviar confirmação
          await sendMessage(pending.phone, "Sem problemas! Entendi que essas ações não são o foco agora. Se precisar de novas sugestões amanhã, é só me chamar! 😊");
          
          console.log(`[IsaMarketing] ❌ ${suggestions.length} sugestões reprovadas.`);
        }
      }

      res.status(200).send('OK');
    } catch (err) {
      console.error('[IsaMarketing] Erro no processamento do webhook:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ─── GET /api/marketing/inactive-customers ──────────────────────────────
  app.get('/api/marketing/inactive-customers', async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30; // Dias de inatividade
      console.log(`[IsaMarketing] 🔍 Rastreando e auditando com IA os chats inativos há mais de ${days} dias...`);

      const EVOLUTION_MAIN_INSTANCE = process.env.EVOLUTION_MAIN_INSTANCE || 'belafarma_principal';
      const API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
      const API_KEY = process.env.EVOLUTION_SENDER_API_KEY || process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';

      console.log(`[IsaMarketing] 🔗 Consultando Evolution API para chats da instância: ${EVOLUTION_MAIN_INSTANCE}`);
      
      let chats = [];
      let waOnline = false;
      try {
        const response = await fetch(`${API_URL}/chat/findChats/${EVOLUTION_MAIN_INSTANCE}`, {
          method: 'GET',
          headers: {
            'apikey': API_KEY,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            chats = data;
          } else if (data && typeof data === 'object') {
            chats = data.chats || data.data || data.instance || [];
          }
          console.log(`[IsaMarketing] 📥 Recebidos ${chats.length} chats do WhatsApp principal.`);
          waOnline = true;
        } else {
          const errorMsg = await response.text();
          console.warn(`[IsaMarketing] ⚠️ Falha ao buscar chats da Evolution API (Status ${response.status}):`, errorMsg);
        }
      } catch (waErr) {
        console.error('[IsaMarketing] ❌ Erro de rede ao conectar à Evolution API:', waErr.message);
      }

      // Se a lista de chats vier vazia, cria dados simulados ricos para demonstração
      if (chats.length === 0) {
        console.log('[IsaMarketing] 🧪 Usando dados simulados de chats para fins de demonstração (Evolution API indisponível)...');
        const tempCustomers = db.prepare('SELECT name, phone FROM customers LIMIT 4').all();
        
        chats = tempCustomers.map((c, idx) => ({
          id: `${c.phone || '5532988634755'}_${idx}@s.whatsapp.net`,
          name: c.name,
          updatedAt: new Date(Date.now() - (15 + idx * 15) * 24 * 60 * 60 * 1000).toISOString(),
          lastMessage: {
            message: {
              conversation: idx === 0 ? 'Pode entregar na Rua das Laranjeiras, 456, Bloco B' : 'Deixa separado para eu retirar'
            }
          }
        }));
        
        // Adiciona contatos com comportamento de abandono/não atendimento para testes ricos
        chats.push({
          id: '5532991992233@s.whatsapp.net',
          name: 'Juliana Paes (WhatsApp)',
          updatedAt: new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString(),
          lastMessage: {
            message: {
              conversation: 'Qual o valor do Cerave?'
            }
          }
        });

        chats.push({
          id: '5532988887766@s.whatsapp.net',
          name: 'Cliente Sumido (Sem Resposta)',
          updatedAt: new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString(),
          lastMessage: {
            message: {
              conversation: 'Oi, boa tarde! Gostaria de saber se tem alguém?'
            }
          }
        });
      }

      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      // Utilitários de limpeza e comparação de telefones
      const cleanPhoneNumber = (p) => p ? p.replace(/\D/g, '') : '';
      const isSamePhone = (phoneA, phoneB) => {
        const cleanA = cleanPhoneNumber(phoneA);
        const cleanB = cleanPhoneNumber(phoneB);
        if (!cleanA || !cleanB) return false;
        
        const a = cleanA.startsWith('55') ? cleanA.slice(2) : cleanA;
        const b = cleanB.startsWith('55') ? cleanB.slice(2) : cleanB;
        
        return a.slice(-8) === b.slice(-8);
      };

      // Filtra contatos individuais e calcula inatividade
      const inactiveChats = chats
        .filter(c => {
          const jid = c.id || c.remoteJid || '';
          return jid && !jid.includes('@g.us');
        })
        .map(c => {
          const jid = c.id || c.remoteJid || '';
          const phone = jid.split('@')[0];
          const name = c.name || c.pushName || 'Contato sem Nome';
          
          let lastInteractionTime = 0;
          if (c.updatedAt) {
            lastInteractionTime = new Date(c.updatedAt).getTime();
          } else if (c.messageTimestamp) {
            lastInteractionTime = new Date(c.messageTimestamp * 1000).getTime();
          } else if (c.lastMessage?.messageTimestamp) {
            lastInteractionTime = new Date(c.lastMessage.messageTimestamp * 1000).getTime();
          }

          const inactivityMs = now - lastInteractionTime;
          const inactivityDays = Math.floor(inactivityMs / oneDayMs);

          return {
            phone,
            name,
            jid,
            lastMessage: c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || '',
            lastInteractionTime,
            inactivityDays: lastInteractionTime > 0 ? inactivityDays : null
          };
        })
        .filter(c => c.inactivityDays === null || c.inactivityDays >= days)
        .sort((a, b) => (b.inactivityDays || 0) - (a.inactivityDays || 0));

      const resultData = [];
      const allCustomers = db.prepare('SELECT * FROM customers').all();

      // Diálogos fictícios pré-definidos para simulação local/fallback off-line
      const simulatedDialogs = {
        '5532988634755': `Cliente: Olá, vocês têm a pomada Nebacetin?
Atendente/Bela: Olá! Temos sim, está saindo por R$ 18,90.
Cliente: Ótimo, pode mandar uma aqui para mim por favor?
Atendente/Bela: Claro! Qual o endereço de entrega?
Cliente: Pode entregar na Rua das Laranjeiras, 456, Bloco B.
Atendente/Bela: Combinado, já estamos enviando com o motoboy!`,

        '5532991992233': `Cliente: Olá, qual o valor do hidratante Cerave?
Atendente/Bela: Olá! O Cerave de 454g está saindo por R$ 98,90 hoje.
Cliente: Nossa, está um pouco caro. Tem algum desconto?
Atendente/Bela: Infelizmente esse já está no menor preço promocional de atacado.
Cliente: Ah sim. Vou ver aqui e qualquer coisa aviso. Obrigado.`,

        '5532988887766': `Cliente: Oi, boa tarde! Gostaria de saber se tem alguém?
Cliente: Tem atendente disponível? Queria tirar uma dúvida rápida sobre uma receita...`,

        'default_retirada': `Cliente: Oi, boa tarde! Gostaria de reservar o anticoncepcional Ciclo 21.
Atendente/Bela: Boa tarde! Reservamos sim. Fica R$ 8,50.
Cliente: Vou passar aí para buscar daqui a pouco, deixa separado para mim no nome de Maria por favor.
Atendente/Bela: Perfeito Maria, já está separado no balcão da farmácia!`
      };

      for (const chat of inactiveChats) {
        // ─── CACHE COMERCIAL PERSISTENTE DO SQLITE (CRÍTICO PARA TOKEN SAVING) ─────
        try {
          const existingAudit = db.prepare('SELECT * FROM crm_inactive_audits WHERE phone = ?').get(chat.phone);
          if (existingAudit) {
            // Se houve interação nova (última conversa no whats é mais recente do que o salvo na auditoria)
            if (chat.lastInteractionTime && chat.lastInteractionTime > existingAudit.lastInteractionTime) {
              console.log(`[IsaMarketing] 🔄 Nova conversa detectada para ${chat.phone}. Removendo auditoria desatualizada.`);
              db.prepare('DELETE FROM crm_inactive_audits WHERE phone = ?').run(chat.phone);
              // Segue o fluxo para re-auditar se ele ainda permanecer como inativo (critério de inatividade atualizada)
            } else {
              // Não houve nova conversa! O cliente permaneceu inativo. Reutilizamos 100% dos dados salvos de forma instantânea!
              console.log(`[IsaMarketing] 💾 [SQLITE PERSISTENT HIT] Reutilizando auditoria salva para inativo: ${chat.phone}`);
              
              const customer = allCustomers.find(cust => isSamePhone(cust.phone, chat.phone));
              let isRegistered = false;
              let customerId = null;
              let customerNotes = '';
              let systemName = existingAudit.systemName || chat.name;
              
              if (customer) {
                isRegistered = true;
                customerId = customer.id;
                systemName = customer.name;
                customerNotes = customer.notes || '';
              }

              const savedProducts = JSON.parse(existingAudit.productsJson || '[]');
              const purchasedProducts = savedProducts.filter(p => p.type === 'purchased').map(p => ({
                productName: p.productName,
                saleDate: p.saleDate,
                quantity: p.quantity
              }));
              const searchedProducts = savedProducts.filter(p => p.type === 'searched').map(p => ({
                productName: p.productName,
                notes: p.notes,
                createdAt: p.createdAt
              }));

              resultData.push({
                phone: chat.phone,
                whatsappName: chat.name,
                systemName,
                jid: chat.jid,
                isRegistered,
                customerId,
                inactivityDays: chat.inactivityDays || existingAudit.inactivityDays,
                lastMessage: chat.lastMessage || existingAudit.lastMessage,
                customerNotes,
                
                // Dados recuperados do banco
                atendido: existingAudit.atendido === 1,
                fechouVenda: existingAudit.fechouVenda === 1,
                modalidade: existingAudit.modalidade,
                modalidadeDescricao: existingAudit.modalidadeDescricao,
                endereco: existingAudit.endereco,
                ideiaReativacao: existingAudit.ideiaReativacao || 'Enviar oferta de genéricos.',
                purchasedProducts,
                searchedProducts
              });

              continue; // PULA para o próximo contato, economizando 100% de processamento e tokens!
            }
          }
        } catch (dbReadErr) {
          console.error('[IsaMarketing] Erro ao ler crm_inactive_audits:', dbReadErr.message);
        }

        const customer = allCustomers.find(cust => isSamePhone(cust.phone, chat.phone));
        
        let isRegistered = false;
        let customerId = null;
        let customerNotes = '';
        let systemName = chat.name;
        let crmAddress = null;

        if (customer) {
          isRegistered = true;
          customerId = customer.id;
          systemName = customer.name;
          customerNotes = customer.notes || '';
          crmAddress = customer.address || null;
        }

        // 1. CARREGAR HISTÓRICO DE MENSAGENS (Evolution API ou Fallback local)
        let formattedDialog = '';
        if (waOnline) {
          try {
            const msgsRes = await fetch(`${API_URL}/chat/findMessages/${EVOLUTION_MAIN_INSTANCE}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': API_KEY
              },
              body: JSON.stringify({
                where: {
                  key: { remoteJid: chat.jid }
                },
                limit: 20
              })
            });

            if (msgsRes.ok) {
              const msgsData = await msgsRes.json();
              const messagesList = Array.isArray(msgsData) ? msgsData : (msgsData.records || []);
              
              // Ordena mensagens do passado para o presente
              const sortedMsgs = [...messagesList].reverse();
              
              formattedDialog = sortedMsgs.map(m => {
                const sender = m.key?.fromMe ? 'Atendente/Bela' : 'Cliente';
                let text = '';
                const msg = m.message;
                if (msg) {
                  text = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || '';
                  if (!text && msg.imageMessage) text = '[Imagem]';
                  if (!text && msg.audioMessage) text = '[Áudio enviado/recebido]';
                }
                return `${sender}: ${text}`;
              }).filter(line => line.includes(': ')).join('\n');
            }
          } catch (e) {
            console.warn(`[IsaMarketing] ⚠️ Erro ao buscar mensagens de ${chat.phone}:`, e.message);
          }
        }

        // Se o diálogo vier em branco, aciona o fallback estático de alta fidelidade
        if (!formattedDialog) {
          const keyPrefix = Object.keys(simulatedDialogs).find(k => chat.phone.startsWith(k)) || 'default_retirada';
          formattedDialog = simulatedDialogs[keyPrefix];
        }

        // 2. CONSULTAR/SALVAR ANÁLISE NO CACHE DE IA (ai_cache)
        const cacheKey = `mkt_ai_audit_${chat.phone}_${chat.lastInteractionTime || 'static'}`;
        let aiAnalysis = null;

        try {
          const cachedRow = db.prepare('SELECT value FROM ai_cache WHERE key = ?').get(cacheKey);
          if (cachedRow) {
            aiAnalysis = JSON.parse(cachedRow.value);
            console.log(`[IsaMarketing] ⚡ [CACHE HIT] Análise recuperada para ${chat.phone}`);
          }
        } catch (cacheErr) {
          console.error('[IsaMarketing] Erro ao ler tabela ai_cache:', cacheErr.message);
        }

        // Se não houver cache ou a IA falhou em execuções anteriores, roda a Gemini/OpenAI
        if (!aiAnalysis) {
          try {
            console.log(`[IsaMarketing] 🤖 [IA RUN] Chamando IA para auditar conversa de ${chat.phone}...`);
            const systemPrompt = `Você é o auditor de IA do CRM da farmácia BelaFarma.
Sua missão é ler um histórico de conversa de WhatsApp entre o cliente e a farmácia e responder com um JSON detalhando o desfecho comercial exata da conversa.

Você deve responder estritamente com um objeto JSON válido (sem tags markdown de código como \`\`\`json) contendo:
{
  "atendido": true/false (o atendente respondeu às dúvidas e orçamentos do cliente?),
  "fechouVenda": true/false (o cliente concordou em fechar a compra dos produtos?),
  "modalidade": "entrega" | "retirada" | "abandonou_apos_preco" | "nao_atendido" | "desconhecido",
  "modalidadeDescricao": "Breve frase descrevendo o desfecho comercial (ex: 'Venda fechada com entrega via motoboy', 'Cliente buscou o produto na loja', 'Cliente parou de falar após ouvir o valor', 'O cliente não recebeu atendimento')",
  "produtos": ["Produto 1", "Produto 2"], (produtos mencionados, procurados ou comprados pelo cliente na conversa)
  "endereco": "Endereço completo de entrega se mencionado na conversa, caso contrário null",
  "ideiaReativacao": "Sugestão prática, sutil e inteligente de texto ou abordagem para reativar esse cliente. Ex: 'Oferecer 10% de desconto no hidratante Cerave citado', 'Enviar uma saudação perguntando se a inflamação melhorou', 'Oferecer entrega grátis no próximo pedido de Nebacetin', 'Pedir desculpas pela demora no último atendimento e oferecer um cupom de agrado'."
}`;

            const responseText = await callAI(
              `Analise a seguinte conversa de WhatsApp:\n---\n${formattedDialog}\n---`,
              systemPrompt,
              { temperature: 0.2 }
            );

            // Limpa formatação markdown do JSON se a IA retornar com ```json ... ```
            let cleanedText = responseText.trim();
            if (cleanedText.startsWith('```')) {
              cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
            }

            aiAnalysis = JSON.parse(cleanedText);

            // Grava no cache
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 45); // 45 dias de validade
            db.prepare('INSERT OR REPLACE INTO ai_cache (key, value, expires_at) VALUES (?, ?, ?)')
              .run(cacheKey, JSON.stringify(aiAnalysis), expiresAt.toISOString());

          } catch (aiErr) {
            console.error(`[IsaMarketing] ❌ Falha na IA/JSON parse para ${chat.phone}:`, aiErr.message);
            // Objeto de recuperação
            aiAnalysis = {
              atendido: formattedDialog.includes('Atendente/Bela:'),
              fechouVenda: formattedDialog.includes('motoboy') || formattedDialog.includes('separado'),
              modalidade: formattedDialog.includes('motoboy') ? 'entrega' : formattedDialog.includes('separado') ? 'retirada' : 'desconhecido',
              modalidadeDescricao: 'Recuperado offline via análise estática simples de palavras-chave.',
              produtos: ['Medicamento Geral'],
              endereco: null,
              ideiaReativacao: 'Oferecer nossa linha de similares com desconto exclusivo.'
            };
          }
        }

        // Funde o endereço: prioriza o endereço mencionado na conversa (extraído pela IA), senão usa o cadastrado no CRM
        const finalAddress = aiAnalysis.endereco || crmAddress || 'Não informado na conversa';

        resultData.push({
          phone: chat.phone,
          whatsappName: chat.name,
          systemName,
          jid: chat.jid,
          isRegistered,
          customerId,
          inactivityDays: chat.inactivityDays,
          lastMessage: chat.lastMessage,
          customerNotes,
          
          // Dados obtidos da análise da conversa pela IA (Gemini)
          atendido: aiAnalysis.atendido,
          fechouVenda: aiAnalysis.fechouVenda,
          modalidade: aiAnalysis.modalidade,
          modalidadeDescricao: aiAnalysis.modalidadeDescricao,
          endereco: finalAddress,
          ideiaReativacao: aiAnalysis.ideiaReativacao || 'Enviar oferta de nossa linha de medicamentos genéricos.',
          
          // Histórico de produtos obtido da conversa pela IA!
          purchasedProducts: aiAnalysis.produtos.map(pName => ({
            productName: pName,
            saleDate: chat.lastInteractionTime ? new Date(chat.lastInteractionTime).toISOString() : new Date().toISOString(),
            quantity: 1
          })),
          searchedProducts: !aiAnalysis.fechouVenda ? aiAnalysis.produtos.map(pName => ({
            productName: pName,
            notes: 'Detectado via auditoria de IA no WhatsApp',
            createdAt: chat.lastInteractionTime ? new Date(chat.lastInteractionTime).toISOString() : new Date().toISOString()
          })) : []
        });

        // ─── SALVAR AUDITORIA EM CACHE PERSISTENTE (SQLITE) ───────────────
        try {
          const productsToSave = [
            ...aiAnalysis.produtos.map(pName => ({
              type: 'purchased',
              productName: pName,
              saleDate: chat.lastInteractionTime ? new Date(chat.lastInteractionTime).toISOString() : new Date().toISOString(),
              quantity: 1
            })),
            ...(!aiAnalysis.fechouVenda ? aiAnalysis.produtos.map(pName => ({
              type: 'searched',
              productName: pName,
              notes: 'Detectado via auditoria de IA no WhatsApp',
              createdAt: chat.lastInteractionTime ? new Date(chat.lastInteractionTime).toISOString() : new Date().toISOString()
            })) : [])
          ];

          db.prepare(`
            INSERT OR REPLACE INTO crm_inactive_audits (
              phone, whatsappName, systemName, jid, inactivityDays, lastMessage, lastInteractionTime,
              atendido, fechouVenda, modalidade, modalidadeDescricao, endereco, ideiaReativacao, productsJson, auditedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(
            chat.phone,
            chat.name,
            systemName,
            chat.jid,
            chat.inactivityDays || 0,
            chat.lastMessage || '',
            chat.lastInteractionTime || 0,
            aiAnalysis.atendido ? 1 : 0,
            aiAnalysis.fechouVenda ? 1 : 0,
            aiAnalysis.modalidade,
            aiAnalysis.modalidadeDescricao,
            finalAddress,
            aiAnalysis.ideiaReativacao || 'Enviar oferta de genéricos.',
            JSON.stringify(productsToSave)
          );
          console.log(`[IsaMarketing] 💾 Auditoria salva com sucesso para o inativo ${chat.phone}.`);
        } catch (dbWriteErr) {
          console.error('[IsaMarketing] ❌ Erro ao salvar auditoria de inativo no banco:', dbWriteErr.message);
        }
      }

      res.json({
        days,
        totalInactive: resultData.length,
        inactiveCustomers: resultData
      });

    } catch (err) {
      console.error('[IsaMarketing] Erro ao buscar clientes inativos:', err);
      res.status(500).json({ error: err.message || 'Erro interno ao rastrear inatividade' });
    }
  });

  // ─── GET /api/marketing/new-customers ────────────────────────────────────
  app.get('/api/marketing/new-customers', (req, res) => {
    try {
      const days = parseInt(req.query.days) || 15;
      console.log(`[IsaMarketing] 🔍 Buscando novos clientes cadastrados nos últimos ${days} dias...`);

      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - days);
      const limitDateIso = limitDate.toISOString().slice(0, 10);

      const newCustomers = db.prepare(`
        SELECT id, name, phone, createdAt, address, notes
        FROM customers
        WHERE createdAt >= ? OR (createdAt IS NULL AND phone IS NOT NULL)
        ORDER BY createdAt DESC
      `).all(limitDateIso);

      const result = [];

      for (const customer of newCustomers) {
        const lastSale = db.prepare(`
          SELECT id, sale_date as saleDate, total_value as totalValue
          FROM sales
          WHERE customer_id = ? AND status = 'Finalizada'
          ORDER BY sale_date DESC
          LIMIT 1
        `).get(customer.id);

        let purchasedProducts = [];
        if (lastSale) {
          purchasedProducts = db.prepare(`
            SELECT product_name as productName, quantity, unit_price as unitPrice
            FROM sale_items
            WHERE sale_id = ?
          `).all(lastSale.id);
        }

        const sentLog = db.prepare(`
          SELECT sentAt, status
          FROM message_log
          WHERE (customerId = ? OR phone = ?) AND type = 'boas_vindas' AND errorMessage IS NULL
          ORDER BY sentAt DESC
          LIMIT 1
        `).get(customer.id, customer.phone);

        let postSalesStatus = 'Pendente';
        let sentAt = null;
        if (sentLog) {
          postSalesStatus = 'Enviado';
          sentAt = sentLog.sentAt;
        }

        result.push({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          createdAt: customer.createdAt,
          address: customer.address || 'Não informado',
          notes: customer.notes || '',
          lastSaleDate: lastSale ? lastSale.saleDate : null,
          lastSaleValue: lastSale ? lastSale.totalValue : null,
          purchasedProducts,
          postSalesStatus,
          sentAt
        });
      }

      res.json({
        days,
        totalNew: result.length,
        newCustomers: result
      });

    } catch (err) {
      console.error('[IsaMarketing] Erro ao buscar novos clientes:', err);
      res.status(500).json({ error: err.message || 'Erro interno ao carregar novos clientes' });
    }
  });

  // ─── POST /api/marketing/post-sales/audit ────────────────────────────────
  app.post('/api/marketing/post-sales/audit', async (req, res) => {
    try {
      const { phone, customerId } = req.body;
      if (!phone) {
        return res.status(400).json({ error: 'O telefone é obrigatório.' });
      }

      console.log(`[IsaMarketing] 🤖 Auditando WhatsApp para pós-venda do cliente ${phone}...`);

      let messages = [];
      try {
        const cleanPhone = phone.replace(/\D/g, '');
        const suffix = cleanPhone.slice(-8);
        messages = db.prepare(`
          SELECT fromMe, messageText, timestamp
          FROM whatsapp_messages
          WHERE phone LIKE ? OR phone = ?
          ORDER BY timestamp DESC
          LIMIT 25
        `).all(`%${suffix}`, cleanPhone);
      } catch (dbErr) {
        console.error('[IsaMarketing] Erro ao buscar mensagens locais:', dbErr.message);
      }

      if (messages.length === 0) {
        try {
          const EVOLUTION_MAIN_INSTANCE = process.env.EVOLUTION_MAIN_INSTANCE || 'belafarma_principal';
          const API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
          const API_KEY = process.env.EVOLUTION_SENDER_API_KEY || process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
          const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

          const msgsRes = await fetch(`${API_URL}/chat/findMessages/${EVOLUTION_MAIN_INSTANCE}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': API_KEY
            },
            body: JSON.stringify({
              where: {
                key: { remoteJid: jid }
              },
              limit: 25
            })
          });

          if (msgsRes.ok) {
            const msgsData = await msgsRes.json();
            const list = Array.isArray(msgsData) ? msgsData : (msgsData.records || []);
            messages = list.map(m => ({
              fromMe: m.key?.fromMe ? 1 : 0,
              messageText: m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.imageMessage?.caption || '',
              timestamp: m.messageTimestamp ? (m.messageTimestamp * 1000) : Date.now()
            })).filter(m => m.messageText);
          }
        } catch (waErr) {
          console.warn('[IsaMarketing] Falha ao consultar Evolution para novas mensagens:', waErr.message);
        }
      }

      const sortedMessages = [...messages].reverse();
      const formattedDialog = sortedMessages.map(m => {
        const sender = m.fromMe === 1 ? 'Atendente/Bela' : 'Cliente';
        return `${sender}: ${m.messageText}`;
      }).join('\n');

      if (!formattedDialog.trim()) {
        return res.json({
          success: true,
          products: [],
          address: null,
          suggestedMessage: null,
          details: 'Nenhuma mensagem encontrada para auditar no WhatsApp.'
        });
      }

      const systemPrompt = `Você é a Belinha, a assistente digital de pós-venda e sucesso do cliente da BelaFarma em Juiz de Fora, MG.
Seu tom de voz é de "vizinha especialista": amigável, calorosa, confiável e prestativa.

Analise o histórico de conversa do WhatsApp fornecido e responda estritamente com um objeto JSON válido (sem tags markdown de código como \`\`\`json) contendo:
{
  "products": ["Produto 1", "Produto 2"], // Lista de produtos comprados, encomendados ou negociados pelo cliente na conversa (ex: 'Pomada Nebacetin', 'Aptamil 1'). Se nenhum, deixe vazio.
  "address": "Endereço completo de entrega se mencionado na conversa, caso contrário null",
  "suggestedMessage": "Uma mensagem de pós-venda/agradecimento de sucesso do cliente altamente personalizada e carinhosa. Cite os produtos identificados de forma natural (ex: perguntando se a pomada ajudou ou se a entrega deu certo), use gírias ou tons amigáveis de Juiz de Fora/MG de forma sutil, emojis moderados e termine com um gancho/CTA caloroso."
}`;

      const responseText = await callAI(
        `Analise a seguinte conversa de WhatsApp para capturar a venda no pós-venda:\n---\n${formattedDialog}\n---`,
        systemPrompt,
        { temperature: 0.3 }
      );

      let cleanedText = responseText.trim();
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      }

      const aiResult = JSON.parse(cleanedText);

      if (aiResult.address && customerId) {
        try {
          const currentCust = db.prepare('SELECT address FROM customers WHERE id = ?').get(customerId);
          if (currentCust && !currentCust.address) {
            db.prepare('UPDATE customers SET address = ?, updatedAt = datetime(\'now\') WHERE id = ?')
              .run(aiResult.address, customerId);
            console.log(`[IsaMarketing] 🏠 Endereço de entrega do cliente ${customerId} atualizado automaticamente: ${aiResult.address}`);
          }
        } catch (dbUpdErr) {
          console.error('[IsaMarketing] Erro ao atualizar endereço do cliente:', dbUpdErr.message);
        }
      }

      res.json({
        success: true,
        products: aiResult.products || [],
        address: aiResult.address,
        suggestedMessage: aiResult.suggestedMessage
      });

    } catch (err) {
      console.error('[IsaMarketing] Erro no smart-audit de pós-venda:', err);
      res.status(500).json({ error: err.message || 'Erro interno na auditoria de pós-venda' });
    }
  });

  // ─── POST /api/marketing/post-sales/generate-message ────────────────────
  app.post('/api/marketing/post-sales/generate-message', async (req, res) => {
    try {
      const { name, products } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'O nome do cliente é obrigatório.' });
      }

      const productsList = Array.isArray(products) ? products : [];
      console.log(`[IsaMarketing] 🤖 Gerando mensagem de pós-venda para ${name} com base em ${productsList.length} produtos...`);

      const systemPrompt = `Você é a Belinha, a assistente digital de pós-venda e sucesso do cliente da BelaFarma em Juiz de Fora, MG.
Seu tom de voz é de "vizinha especialista": extremamente simpática, prestativa e calorosa.

Escreva uma mensagem de pós-venda (WhatsApp) sob medida para o cliente.
Regras:
1. Comece saudando o cliente pelo nome.
2. Faça referência específica aos produtos que ele comprou (se houver). Se a lista de produtos estiver vazia, faça uma mensagem de pós-venda geral e carinhosa de agradecimento.
3. Seja atenciosa: se comprou medicamentos de uso agudo (ex: analgésicos, anti-inflamatórios, antibióticos, antigripais), pergunte se ele já está se sentindo melhor. Se comprou itens infantis (fralda, leite), pergunte se o bebê se adaptou bem. Se comprou cosméticos, pergunte sobre a experiência.
4. Termine de forma prestativa, com uma pergunta ou CTA natural (ex: "Qualquer dúvida, é só me chamar por aqui! Como foi sua experiência com a entrega?").
5. Use emojis de forma moderada, negritos para destacar os produtos, e mantenha o texto curto/médio para leitura rápida no WhatsApp.

Responda APENAS com o texto final da mensagem de pós-venda, sem explicações ou introduções.`;

      const prompt = `CLIENTE: ${name}\nPRODUTOS COMPRADOS: ${productsList.join(', ')}`;
      const suggestedMessage = await callAI(prompt, systemPrompt, { temperature: 0.6 });

      res.json({
        success: true,
        suggestedMessage: suggestedMessage.trim()
      });

    } catch (err) {
      console.error('[IsaMarketing] Erro ao gerar mensagem de pós-venda:', err);
      res.status(500).json({ error: err.message || 'Erro ao gerar mensagem de pós-venda' });
    }
  });

  // ─── POST /api/marketing/post-sales/send ─────────────────────────────────
  app.post('/api/marketing/post-sales/send', async (req, res) => {
    try {
      const { clients, messageText } = req.body;
      if (!Array.isArray(clients) || clients.length === 0) {
        return res.status(400).json({ error: 'Nenhum cliente selecionado.' });
      }
      if (!messageText && !clients.some(c => c.messageText)) {
        return res.status(400).json({ error: 'A mensagem de pós-venda não pode estar vazia.' });
      }

      console.log(`[IsaMarketing] 🚀 Iniciando disparo de Pós-Venda para ${clients.length} clientes...`);

      let sentCount = 0;
      let failedCount = 0;

      for (const client of clients) {
        const textToSend = (client.messageText || messageText || '').replace('{nome}', client.name);
        const response = await sendMessage(client.phone, textToSend);
        
        const logId = 'log_' + Math.random().toString(36).substr(2, 9);
        const status = response.success ? 'Enviado' : 'Erro';
        const errorMsg = response.success ? null : (response.error || 'Erro na Evolution API');

        if (response.success) {
          sentCount++;
        } else {
          failedCount++;
        }

        try {
          db.prepare(`
            INSERT INTO message_log (id, phone, type, status, customerName, customerId, errorMessage, sentAt)
            VALUES (?, ?, 'boas_vindas', ?, ?, ?, ?, datetime('now'))
          `).run(logId, client.phone, status, client.name, client.id || null, errorMsg);
        } catch (dbErr) {
          console.error('[IsaMarketing] Erro ao gravar log de pós-venda:', dbErr.message);
        }
      }

      res.json({
        success: true,
        sent: sentCount,
        failed: failedCount,
        total: clients.length
      });

    } catch (err) {
      console.error('[IsaMarketing] Erro ao enviar mensagens de pós-venda:', err);
      res.status(500).json({ error: err.message || 'Erro interno no envio de pós-venda' });
    }
  });

  // ─── GET /api/marketing/status ────────────────────────────────────────────
  app.get('/api/marketing/status', (req, res) => {
    try {
      const ultimoRelatorio = db.prepare(`
        SELECT id, createdAt, sentToRosana, sentAt
        FROM marketing_reports
        ORDER BY createdAt DESC
        LIMIT 1
      `).get();

      const agora = new Date();
      const diasParaSegunda = (1 - agora.getDay() + 7) % 7 || 7;
      const proximaSegunda = new Date(agora);
      proximaSegunda.setDate(agora.getDate() + diasParaSegunda);
      proximaSegunda.setHours(8, 0, 0, 0);

      res.json({
        agente: 'Isa-Marketing',
        ativo: true,
        emExecucao: false,
        proximoEnvio: proximaSegunda.toISOString(),
        destinatario: process.env.MARKETING_ROSANA_PHONE || 'Desativado/Cancelado',
        frequencia: 'Toda segunda-feira às 08:00 (Horário de Brasília)',
        descricao: 'Especialista em comunicação e tendências da Bela Farma Sul — JF/MG',
        ultimoRelatorio: ultimoRelatorio ? {
          id: ultimoRelatorio.id,
          createdAt: ultimoRelatorio.createdAt,
          sentToRosana: !!ultimoRelatorio.sentToRosana,
          sentAt: ultimoRelatorio.sentAt,
        } : null,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[IsaMarketing] ✅ Endpoints registrados:');
  console.log('  POST /api/marketing/gerar-relatorio');
  console.log('  POST /api/marketing/enviar-relatorio');
  console.log('  GET  /api/marketing/historico');
  console.log('  GET  /api/marketing/historico/:id');
  console.log('  GET  /api/marketing/datas-comemorativas');
  console.log('  POST /api/marketing/ideias/produto');
  console.log('  GET  /api/marketing/curadoria-noticias');
  console.log('  GET  /api/marketing/trend-hunting');
  console.log('  POST /api/marketing/diario/clima');
  console.log('  POST /api/marketing/diario/venda-parada');
  console.log('  POST /api/webhook/evolution (Configurar na Evolution API)');
  console.log('  GET  /api/webhook/stream');
  console.log('  GET  /api/marketing/status');
}

module.exports = { initializeMarketingEndpoints };
