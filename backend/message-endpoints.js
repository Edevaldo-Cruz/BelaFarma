/**
 * Message Endpoints — BelaFarma
 * Endpoints da API para o sistema de mensagens WhatsApp.
 * 
 * Endpoints:
 * - GET    /api/messages/templates          - Listar templates
 * - PUT    /api/messages/templates/:id      - Editar template
 * - POST   /api/messages/templates          - Criar template
 * - DELETE /api/messages/templates/:id      - Deletar template
 * - GET    /api/messages/schedules          - Listar agendamentos
 * - PUT    /api/messages/schedules/:id      - Editar agendamento (horário, ativar/desativar)
 * - GET    /api/messages/log                - Histórico de mensagens
 * - POST   /api/messages/send               - Envio manual individual
 * - POST   /api/messages/send-bulk          - Envio em lote (promoção)
 * - POST   /api/messages/campaign           - Criar campanha de promoção
 * - GET    /api/messages/campaigns          - Listar campanhas
 * - GET    /api/messages/birthdays-today    - Aniversariantes do dia
 * - GET    /api/messages/debtors            - Devedores para cobrança
 * - POST   /api/messages/test               - Teste de envio
 * - POST   /api/messages/run-job/:type      - Executar job manualmente
 * - GET    /api/messages/stats              - Estatísticas de envio
 */

const sender = require('./services/message-sender.service');
const templateService = require('./services/message-templates.service');
const scheduler = require('./services/message-scheduler.service');

function initializeMessageEndpoints(app, db) {

  // ─────────────────────────────────────────────────────────────
  // TEMPLATES
  // ─────────────────────────────────────────────────────────────

  // GET all templates
  app.get('/api/messages/templates', (req, res) => {
    try {
      const templates = db.prepare('SELECT * FROM message_templates ORDER BY type ASC').all();
      res.json(templates.map(t => ({ ...t, isActive: !!t.isActive })));
    } catch (err) {
      console.error('[Messages API] Erro ao buscar templates:', err);
      res.status(500).json({ error: 'Falha ao buscar templates.' });
    }
  });

  // CREATE template
  app.post('/api/messages/templates', (req, res) => {
    try {
      const { type, name, content, isActive } = req.body;
      if (!type || !name || !content) {
        return res.status(400).json({ error: 'type, name e content são obrigatórios.' });
      }

      const now = new Date().toISOString();
      const id = `tpl-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

      db.prepare(`
        INSERT INTO message_templates (id, type, name, content, isActive, createdAt, updatedAt)
        VALUES (@id, @type, @name, @content, @isActive, @createdAt, @updatedAt)
      `).run({
        id, type, name, content,
        isActive: isActive !== false ? 1 : 0,
        createdAt: now, updatedAt: now,
      });

      res.status(201).json({ id, type, name, content, isActive: isActive !== false, createdAt: now, updatedAt: now });
    } catch (err) {
      console.error('[Messages API] Erro ao criar template:', err);
      res.status(500).json({ error: 'Falha ao criar template.' });
    }
  });

  // UPDATE template
  app.put('/api/messages/templates/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { name, content, isActive } = req.body;
      const now = new Date().toISOString();

      const result = db.prepare(`
        UPDATE message_templates 
        SET name = COALESCE(@name, name),
            content = COALESCE(@content, content),
            isActive = @isActive,
            updatedAt = @updatedAt
        WHERE id = @id
      `).run({
        id,
        name: name || null,
        content: content || null,
        isActive: isActive !== undefined ? (isActive ? 1 : 0) : 1,
        updatedAt: now,
      });

      if (result.changes > 0) {
        const updated = db.prepare('SELECT * FROM message_templates WHERE id = ?').get(id);
        res.json({ ...updated, isActive: !!updated.isActive });
      } else {
        res.status(404).json({ error: 'Template não encontrado.' });
      }
    } catch (err) {
      console.error('[Messages API] Erro ao atualizar template:', err);
      res.status(500).json({ error: 'Falha ao atualizar template.' });
    }
  });

  // DELETE template
  app.delete('/api/messages/templates/:id', (req, res) => {
    try {
      const { id } = req.params;
      const result = db.prepare('DELETE FROM message_templates WHERE id = ?').run(id);
      if (result.changes > 0) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Template não encontrado.' });
      }
    } catch (err) {
      console.error('[Messages API] Erro ao deletar template:', err);
      res.status(500).json({ error: 'Falha ao deletar template.' });
    }
  });

  // Preview template (renderiza com variáveis de exemplo)
  app.post('/api/messages/templates/preview', (req, res) => {
    try {
      const { content, variables } = req.body;
      const rendered = templateService.renderTemplate(content, variables || {
        nome: 'João da Silva',
        apelido: 'Joãozinho',
        valor: '150.00',
        data_vencimento: '15/03/2026',
        mensagem_promocao: 'Descontos de até 50% em vitaminas e suplementos!',
      });
      res.json({ preview: rendered });
    } catch (err) {
      console.error('[Messages API] Erro ao pré-visualizar template:', err);
      res.status(500).json({ error: 'Falha ao pré-visualizar.' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // AGENDAMENTOS (SCHEDULES)
  // ─────────────────────────────────────────────────────────────

  // GET all schedules
  app.get('/api/messages/schedules', (req, res) => {
    try {
      const schedules = db.prepare('SELECT * FROM message_schedule_config ORDER BY hour ASC, minute ASC').all();
      res.json(schedules.map(s => ({ ...s, isEnabled: !!s.isEnabled })));
    } catch (err) {
      console.error('[Messages API] Erro ao buscar agendamentos:', err);
      res.status(500).json({ error: 'Falha ao buscar agendamentos.' });
    }
  });

  // UPDATE schedule (horário, ativar/desativar)
  app.put('/api/messages/schedules/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { hour, minute, isEnabled } = req.body;

      // Validate
      if (hour !== undefined && (hour < 0 || hour > 23)) {
        return res.status(400).json({ error: 'Hora deve ser entre 0 e 23.' });
      }
      if (minute !== undefined && (minute < 0 || minute > 59)) {
        return res.status(400).json({ error: 'Minuto deve ser entre 0 e 59.' });
      }

      const result = db.prepare(`
        UPDATE message_schedule_config 
        SET hour = COALESCE(@hour, hour),
            minute = COALESCE(@minute, minute),
            isEnabled = @isEnabled
        WHERE id = @id
      `).run({
        id,
        hour: hour !== undefined ? hour : null,
        minute: minute !== undefined ? minute : null,
        isEnabled: isEnabled !== undefined ? (isEnabled ? 1 : 0) : 1,
      });

      if (result.changes > 0) {
        // Reinicia os cron jobs com os novos horários
        scheduler.restartScheduler(db);
        
        const updated = db.prepare('SELECT * FROM message_schedule_config WHERE id = ?').get(id);
        res.json({ ...updated, isEnabled: !!updated.isEnabled, message: 'Agendamento atualizado. Cron jobs reiniciados.' });
      } else {
        res.status(404).json({ error: 'Agendamento não encontrado.' });
      }
    } catch (err) {
      console.error('[Messages API] Erro ao atualizar agendamento:', err);
      res.status(500).json({ error: 'Falha ao atualizar agendamento.' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // LOG / HISTÓRICO
  // ─────────────────────────────────────────────────────────────

  app.get('/api/messages/log', (req, res) => {
    try {
      const { limit = 100, type, status } = req.query;
      let query = 'SELECT * FROM message_log';
      const params = [];
      const conditions = [];

      if (type) { conditions.push('type = ?'); params.push(type); }
      if (status) { conditions.push('status = ?'); params.push(status); }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY sentAt DESC LIMIT ?';
      params.push(Number(limit));

      const logs = db.prepare(query).all(...params);
      res.json(logs);
    } catch (err) {
      console.error('[Messages API] Erro ao buscar log:', err);
      res.status(500).json({ error: 'Falha ao buscar histórico.' });
    }
  });

  // Clear logs older than 30 days
  app.delete('/api/messages/log/cleanup', (req, res) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const result = db.prepare('DELETE FROM message_log WHERE sentAt < ?')
        .run(thirtyDaysAgo.toISOString());
      
      res.json({ deleted: result.changes });
    } catch (err) {
      console.error('[Messages API] Erro ao limpar log:', err);
      res.status(500).json({ error: 'Falha ao limpar histórico.' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // ENVIO MANUAL
  // ─────────────────────────────────────────────────────────────

  // Envio individual
  app.post('/api/messages/send', async (req, res) => {
    try {
      const { phone, message, type = 'manual', customerName, customerId } = req.body;

      if (!phone || !message) {
        return res.status(400).json({ error: 'phone e message são obrigatórios.' });
      }

      const result = await sender.sendMessage(phone, message);

      // Registra no log
      scheduler.logMessage(db, {
        phone, type,
        status: result.success ? 'enviado' : 'erro',
        customerName, customerId,
        errorMsg: result.error,
      });

      res.json(result);
    } catch (err) {
      console.error('[Messages API] Erro ao enviar mensagem:', err);
      res.status(500).json({ error: 'Falha ao enviar mensagem.' });
    }
  });

  // Envio em lote (promoção)
  app.post('/api/messages/send-bulk', async (req, res) => {
    try {
      const { messages, campaignId } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages (array) é obrigatório.' });
      }

      const result = await sender.sendBulk(messages, (index, total, sendResult) => {
        const msg = messages[index - 1];
        scheduler.logMessage(db, {
          phone: msg?.phone,
          type: 'promocao',
          status: sendResult.success ? 'enviado' : 'erro',
          customerName: msg?.metadata?.customerName,
          customerId: msg?.metadata?.customerId,
          campaignId,
          errorMsg: sendResult.error,
        });
      });

      res.json(result);
    } catch (err) {
      console.error('[Messages API] Erro no envio em lote:', err);
      res.status(500).json({ error: 'Falha no envio em lote.' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // CAMPANHAS
  // ─────────────────────────────────────────────────────────────

  // GET all campaigns
  app.get('/api/messages/campaigns', (req, res) => {
    try {
      const campaigns = db.prepare('SELECT * FROM message_campaigns ORDER BY createdAt DESC').all();
      res.json(campaigns);
    } catch (err) {
      console.error('[Messages API] Erro ao buscar campanhas:', err);
      res.status(500).json({ error: 'Falha ao buscar campanhas.' });
    }
  });

  // CREATE campaign (just saves the campaign, does NOT send yet)
  app.post('/api/messages/campaigns', (req, res) => {
    try {
      const { name, description, messageContent, targetCustomerIds } = req.body;

      if (!name || !messageContent) {
        return res.status(400).json({ error: 'name e messageContent são obrigatórios.' });
      }

      const now = new Date().toISOString();
      const id = `camp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

      db.prepare(`
        INSERT INTO message_campaigns (id, name, description, messageContent, targetCustomerIds, status, sentCount, failedCount, totalCount, createdAt)
        VALUES (@id, @name, @description, @messageContent, @targetCustomerIds, @status, @sentCount, @failedCount, @totalCount, @createdAt)
      `).run({
        id, name,
        description: description || '',
        messageContent,
        targetCustomerIds: JSON.stringify(targetCustomerIds || []),
        status: 'rascunho',
        sentCount: 0, failedCount: 0,
        totalCount: (targetCustomerIds || []).length,
        createdAt: now,
      });

      res.status(201).json({ id, name, status: 'rascunho', createdAt: now });
    } catch (err) {
      console.error('[Messages API] Erro ao criar campanha:', err);
      res.status(500).json({ error: 'Falha ao criar campanha.' });
    }
  });

  // EXECUTE campaign (sends messages)
  app.post('/api/messages/campaigns/:id/execute', async (req, res) => {
    try {
      const { id } = req.params;
      const campaign = db.prepare('SELECT * FROM message_campaigns WHERE id = ?').get(id);

      if (!campaign) {
        return res.status(404).json({ error: 'Campanha não encontrada.' });
      }

      if (campaign.status === 'enviada') {
        return res.status(400).json({ error: 'Campanha já foi enviada.' });
      }

      const customerIds = JSON.parse(campaign.targetCustomerIds || '[]');

      if (customerIds.length === 0) {
        return res.status(400).json({ error: 'Nenhum cliente selecionado.' });
      }

      // Busca os clientes
      const placeholders = customerIds.map(() => '?').join(',');
      const customers = db.prepare(`SELECT * FROM customers WHERE id IN (${placeholders}) AND phone IS NOT NULL AND phone != ''`).all(...customerIds);

      if (customers.length === 0) {
        return res.status(400).json({ error: 'Nenhum cliente com telefone válido encontrado.' });
      }

      // Gera as mensagens
      const messages = customers.map(c => ({
        phone: c.phone,
        message: templateService.renderTemplate(campaign.messageContent, {
          nome: c.nickname || c.name,
          apelido: c.nickname || '',
        }),
        metadata: { customerId: c.id, customerName: c.name }
      }));

      // Atualiza status
      db.prepare('UPDATE message_campaigns SET status = ? WHERE id = ?').run('enviando', id);

      // Envia
      const result = await sender.sendBulk(messages, (index, total, sendResult) => {
        const msg = messages[index - 1];
        scheduler.logMessage(db, {
          phone: msg?.phone,
          type: 'promocao',
          status: sendResult.success ? 'enviado' : 'erro',
          customerName: msg?.metadata?.customerName,
          customerId: msg?.metadata?.customerId,
          campaignId: id,
          errorMsg: sendResult.error,
        });
      });

      // Atualiza campanha com resultado
      db.prepare(`
        UPDATE message_campaigns 
        SET status = 'enviada', sentCount = ?, failedCount = ?, totalCount = ?, executedAt = ?
        WHERE id = ?
      `).run(result.sent, result.failed, result.total, new Date().toISOString(), id);

      res.json({ ...result, campaignId: id });
    } catch (err) {
      console.error('[Messages API] Erro ao executar campanha:', err);
      res.status(500).json({ error: 'Falha ao executar campanha.' });
    }
  });

  // DELETE campaign
  app.delete('/api/messages/campaigns/:id', (req, res) => {
    try {
      const { id } = req.params;
      const result = db.prepare('DELETE FROM message_campaigns WHERE id = ?').run(id);
      if (result.changes > 0) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Campanha não encontrada.' });
      }
    } catch (err) {
      console.error('[Messages API] Erro ao deletar campanha:', err);
      res.status(500).json({ error: 'Falha ao deletar campanha.' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // CONSULTAS ÚTEIS
  // ─────────────────────────────────────────────────────────────

  // Aniversariantes do dia
  app.get('/api/messages/birthdays-today', (req, res) => {
    try {
      const customers = scheduler.getBirthdayCustomers(db);
      res.json(customers);
    } catch (err) {
      console.error('[Messages API] Erro ao buscar aniversariantes:', err);
      res.status(500).json({ error: 'Falha ao buscar aniversariantes.' });
    }
  });

  // Devedores para cobrança
  app.get('/api/messages/debtors', (req, res) => {
    try {
      const debtors = scheduler.getDebtors(db);
      res.json(debtors);
    } catch (err) {
      console.error('[Messages API] Erro ao buscar devedores:', err);
      res.status(500).json({ error: 'Falha ao buscar devedores.' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // EXECUÇÃO MANUAL DE JOBS
  // ─────────────────────────────────────────────────────────────

  app.post('/api/messages/run-job/:type', async (req, res) => {
    try {
      const { type } = req.params;

      let result;
      if (type === 'aniversario') {
        result = await scheduler.runBirthdayJob(db);
      } else if (type === 'cobranca') {
        result = await scheduler.runDebtCollectionJob(db);
      } else {
        return res.status(400).json({ error: `Tipo de job desconhecido: ${type}` });
      }

      res.json({ type, ...result });
    } catch (err) {
      console.error('[Messages API] Erro ao executar job:', err);
      res.status(500).json({ error: 'Falha ao executar job.' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // TESTE
  // ─────────────────────────────────────────────────────────────

  app.post('/api/messages/test', async (req, res) => {
    try {
      const { phone } = req.body;
      const target = phone || sender.ADMIN_PHONE;

      if (!target) {
        return res.status(400).json({ error: 'Nenhum número para teste.' });
      }

      const now = new Date().toLocaleString('pt-BR');
      const result = await sender.sendMessage(target,
        `🧪 *Teste BelaFarma — Módulo Mensagens*\n` +
        `✅ Sistema de mensagens funcionando!\n` +
        `🕐 Horário: ${now}`
      );

      scheduler.logMessage(db, {
        phone: target, type: 'teste',
        status: result.success ? 'enviado' : 'erro',
        customerName: 'Teste',
        errorMsg: result.error,
      });

      res.json(result);
    } catch (err) {
      console.error('[Messages API] Erro no teste:', err);
      res.status(500).json({ error: 'Falha no teste.' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // ESTATÍSTICAS
  // ─────────────────────────────────────────────────────────────

  app.get('/api/messages/stats', (req, res) => {
    try {
      const totalSent = db.prepare("SELECT COUNT(*) as count FROM message_log WHERE status = 'enviado'").get();
      const totalFailed = db.prepare("SELECT COUNT(*) as count FROM message_log WHERE status = 'erro'").get();
      const todaySent = db.prepare(`
        SELECT COUNT(*) as count FROM message_log 
        WHERE status = 'enviado' AND date(sentAt) = date('now')
      `).get();

      const byType = db.prepare(`
        SELECT type, COUNT(*) as count, 
               SUM(CASE WHEN status = 'enviado' THEN 1 ELSE 0 END) as sent,
               SUM(CASE WHEN status = 'erro' THEN 1 ELSE 0 END) as failed
        FROM message_log GROUP BY type
      `).all();

      const last7Days = db.prepare(`
        SELECT date(sentAt) as day, COUNT(*) as count
        FROM message_log 
        WHERE sentAt >= datetime('now', '-7 days')
        GROUP BY date(sentAt)
        ORDER BY day ASC
      `).all();

      res.json({
        totalSent: totalSent.count,
        totalFailed: totalFailed.count,
        todaySent: todaySent.count,
        byType,
        last7Days,
      });
    } catch (err) {
      console.error('[Messages API] Erro ao buscar estatísticas:', err);
      res.status(500).json({ error: 'Falha ao buscar estatísticas.' });
    }
  });

  console.log('[Messages API] ✅ Endpoints de mensagens inicializados.');
}

module.exports = { initializeMessageEndpoints };
