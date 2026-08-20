const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const watcherService = require('./services/watcher.service.js');
const incidentTracker = require('./services/incident-tracker.service.js');

module.exports = (db) => {

  // GET /api/system/status - Retorna o relatório completo de saúde do ecossistema
  router.get('/status', async (req, res) => {
    try {
      const health = await watcherService.getSystemHealth();
      res.json(health);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/trigger-service - Executa manualmente um serviço em background
  router.post('/trigger-service', async (req, res) => {
    const { serviceName } = req.body;
    if (!serviceName) {
      return res.status(400).json({ error: 'Parâmetro "serviceName" é obrigatório.' });
    }

    try {
      console.log(`[WATCHER-TRIGGER] Usuário solicitou disparo manual do serviço "${serviceName}"`);

      // Registra que a execução começou (status RUNNING)
      watcherService.registerServiceRun(serviceName, 'RUNNING');

      // Executa de forma assíncrona para não travar a resposta HTTP
      (async () => {
        try {
          switch (serviceName) {
            case 'backup':
              // Faz chamada interna para a rota de backup que já trata o backup completo
              const backupRes = await fetch(`http://localhost:3001/api/backups/create`, { method: 'POST' });
              if (!backupRes.ok) {
                const errData = await backupRes.json().catch(() => ({}));
                throw new Error(errData.error || `Erro HTTP ${backupRes.status}`);
              }
              // O próprio server.js fará o registro de sucesso, mas para garantir, registramos aqui também
              watcherService.registerServiceRun('backup', 'SUCCESS');
              break;

            case 'robo_ofertas_jit':
              const { escolherEPostarOfertaInteligente } = require('./whatsapp-group-endpoints.js');
              await escolherEPostarOfertaInteligente();
              watcherService.registerServiceRun('robo_ofertas_jit', 'SUCCESS');
              break;

            case 'robo_status':
              const { postarStatusDiario } = require('./services/whatsapp-status.service.js');
              await postarStatusDiario();
              watcherService.registerServiceRun('robo_status', 'SUCCESS');
              break;

            case 'auto_shortages':
              const autoShortages = require('./services/auto-shortages.service.js');
              const resShortages = await autoShortages.runAutoShortages(0);
              watcherService.registerServiceRun('auto_shortages', 'SUCCESS');
              break;

            case 'radio_news':
              const { gerarCuradoriaNoticas } = require('./services/marketing-agent.service');
              const noticias = await gerarCuradoriaNoticas();
              const radioUrl = process.env.RADIO_API_URL || 'http://192.168.1.70:5005';
              const radioRes = await fetch(`${radioUrl}/api/anunciar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mensagem: noticias, voz: 'pt-BR-FranciscaNeural' })
              });
              if (!radioRes.ok) {
                throw new Error(`Rádio respondeu com status ${radioRes.status}`);
              }
              watcherService.registerServiceRun('radio_news', 'SUCCESS');
              break;

            case 'whatsapp_vendas_sync':
              const whatsappVendasSync = require('./services/whatsapp-vendas-sync.js');
              const syncRes = await whatsappVendasSync.syncScrapedImages();
              if (syncRes && syncRes.success === false) {
                throw new Error(syncRes.error || 'Erro na sincronização de fotos');
              }
              watcherService.registerServiceRun('whatsapp_vendas_sync', 'SUCCESS');
              break;

            default:
              console.error(`[WATCHER-TRIGGER] Serviço desconhecido: ${serviceName}`);
              watcherService.registerServiceRun(serviceName, 'FAILED', `Serviço desconhecido: ${serviceName}`);
          }
        } catch (err) {
          console.error(`[WATCHER-TRIGGER] Erro ao executar "${serviceName}":`, err.message);
          watcherService.registerServiceRun(serviceName, 'FAILED', err.message);
        }
      })();

      res.json({ success: true, message: `Rotina do serviço "${serviceName}" iniciada com sucesso em segundo plano.` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/run-watcher-check - Dispara manualmente a rotina de envio de alertas de integridade no WhatsApp
  router.post('/run-watcher-check', async (req, res) => {
    try {
      console.log('[WATCHER-TRIGGER] Disparando verificação manual de alertas do Vigilante...');
      // Executa de forma assíncrona
      watcherService.checkAndAlertDelayedServices().catch(console.error);
      res.json({ success: true, message: 'Rotina de verificação de alertas iniciada. Se houver falhas críticas, o WhatsApp de admin receberá uma mensagem em instantes.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/visitors/record - Registra um acesso ao Dashboard e retorna estatísticas
  router.post('/visitors/record', (req, res) => {
    try {
      const userName = req.body?.userName || 'Anônimo';
      const now = new Date();
      const visitedAt = now.toISOString();
      const dateStr = now.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO page_visitors (visited_at, date_str, user_name)
        VALUES (?, ?, ?)
      `).run(visitedAt, dateStr, userName);

      const todayVisits = db.prepare(`SELECT COUNT(*) as count FROM page_visitors WHERE date_str = ?`).get(dateStr).count;
      const totalVisits = db.prepare(`SELECT COUNT(*) as count FROM page_visitors`).get().count;

      res.json({ success: true, todayVisits, totalVisits });
    } catch (err) {
      console.error('[VISITOR-COUNTER] Erro ao registrar visita:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/system/visitors/stats - Retorna o total de visitas de hoje e acumulado
  router.get('/visitors/stats', (req, res) => {
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const todayVisits = db.prepare(`SELECT COUNT(*) as count FROM page_visitors WHERE date_str = ?`).get(dateStr).count;
      const totalVisits = db.prepare(`SELECT COUNT(*) as count FROM page_visitors`).get().count;

      res.json({ todayVisits, totalVisits });
    } catch (err) {
      console.error('[VISITOR-COUNTER] Erro ao buscar estatísticas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/system/incidents - Retorna a lista de incidentes e interrupções registradas
  router.get('/incidents', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const type = req.query.type || null;
      const incidents = incidentTracker.getIncidents(limit, type);
      res.json(incidents);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/incidents/test - Simula um incidente de teste
  router.post('/incidents/test', (req, res) => {
    try {
      const { type = 'SERVICE_FAILURE', severity = 'WARNING', title = 'Incidente de Teste Manual', details = 'Teste gerado pelo usuário para validar o sistema de alertas.' } = req.body || {};
      const id = incidentTracker.recordIncident(type, severity, title, details);
      res.json({ success: true, message: 'Incidente de teste registrado com sucesso!', id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/system/incidents/clear - Limpa o histórico de incidentes
  router.delete('/incidents/clear', (req, res) => {
    try {
      const success = incidentTracker.clearIncidents();
      res.json({ success, message: 'Histórico de incidentes limpo com sucesso.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/system/logs - Retorna as últimas linhas do log do servidor
  router.get('/logs', (req, res) => {
    try {
      const linesCount = parseInt(req.query.lines) || 150;
      const filter = req.query.filter || null;
      const result = incidentTracker.getRecentLogs(linesCount, filter);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
