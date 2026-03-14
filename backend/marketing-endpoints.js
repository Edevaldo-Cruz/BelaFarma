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

function initializeMarketingEndpoints(app, db) {
  console.log('[IsaMarketing] Registrando endpoints de marketing...');

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
        || process.env.ADMIN_WHATSAPP
        || '+5532988634755';

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
      
      const phone = req.body.phone || process.env.MARKETING_ROSANA_PHONE || process.env.ADMIN_WHATSAPP;
      
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

  // ─── POST /api/webhook/evolution ──────────────────────────────────────────
  /**
   * Webhook para receber mensagens da Evolution API.
   * Configuração recomendada na Evolution: http://seu-ip:3001/api/webhook/evolution
   */
  app.post('/api/webhook/evolution', async (req, res) => {
    try {
      const payload = req.body;
      
      // O evento de mensagem recebida na Evolution v2 é 'messages.upsert'
      if (payload.event !== 'messages.upsert') {
        return res.status(200).send('OK');
      }

      const data = payload.data;
      if (!data || !data.key || data.key.fromMe) {
        return res.status(200).send('OK');
      }

      const remoteJid = data.key.remoteJid || '';
      const phone = remoteJid.split('@')[0];
      const messageContent = data.message?.conversation 
        || data.message?.extendedTextMessage?.text 
        || '';
      
      const text = messageContent.toLowerCase().trim();
      const EDEVALDO_PHONE_CLEAN = (process.env.EDEVALDO_WHATSAPP || '').replace(/\D/g, '');

      // Log para debug
      console.log(`[IsaMarketing] Webhook recebido de ${phone}: "${text}"`);

      if (phone === EDEVALDO_PHONE_CLEAN && text === 'ok') {
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
      } else if (phone === EDEVALDO_PHONE_CLEAN && text === 'não') {
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
        destinatario: process.env.MARKETING_ROSANA_PHONE || process.env.ADMIN_WHATSAPP || '+5532988634755',
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
  console.log('  GET  /api/marketing/status');
}

module.exports = { initializeMarketingEndpoints };
