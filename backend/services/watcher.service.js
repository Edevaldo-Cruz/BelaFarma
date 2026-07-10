const db = require('../database');
const fetch = require('node-fetch');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Inicializa a tabela de status de saúde dos serviços
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_health_status (
      service_name TEXT PRIMARY KEY,
      last_run_time TEXT NOT NULL,
      last_success_time TEXT,
      status TEXT NOT NULL, -- 'SUCCESS', 'FAILED', 'RUNNING'
      last_error TEXT
    );
  `);
  console.log('[WATCHER] Tabela service_health_status criada ou verificada.');
} catch (err) {
  console.error('[WATCHER] Erro ao criar tabela service_health_status:', err.message);
}

/**
 * Registra a execução de um serviço em segundo plano.
 * @param {string} serviceName - Chave identificadora do serviço
 * @param {string} status - 'SUCCESS' ou 'FAILED'
 * @param {string|null} errorMsg - Mensagem de erro se falhou
 */
function registerServiceRun(serviceName, status, errorMsg = null) {
  try {
    const now = new Date().toISOString();
    const successTime = status === 'SUCCESS' ? now : null;

    const query = `
      INSERT INTO service_health_status (service_name, last_run_time, last_success_time, status, last_error)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(service_name) DO UPDATE SET
        last_run_time = excluded.last_run_time,
        last_success_time = CASE WHEN excluded.status = 'SUCCESS' THEN excluded.last_success_time ELSE last_success_time END,
        status = excluded.status,
        last_error = excluded.last_error;
    `;
    db.prepare(query).run(serviceName, now, successTime, status, errorMsg);
    console.log(`[WATCHER] Registro do serviço "${serviceName}": ${status}${errorMsg ? ` (Erro: ${errorMsg})` : ''}`);
  } catch (err) {
    console.error(`[WATCHER] Falha ao registrar status do serviço "${serviceName}":`, err.message);
  }
}

/**
 * Faz o levantamento em tempo real de toda a saúde do ecossistema.
 * @returns {Promise<Object>}
 */
async function getSystemHealth() {
  const status = {
    database: { operational: false, sizeMB: '0.00', error: null },
    system: {
      uptimeSeconds: process.uptime(),
      totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
      processMemoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      platform: process.platform
    },
    whatsapp: {
      principal: { connected: false, status: 'UNKNOWN', error: null },
      secundario: { connected: false, status: 'UNKNOWN', error: null }
    },
    evolutionApi: { operational: false, error: null, instances: [] },
    digifarmaDb: { operational: false, error: null },
    backgroundServices: []
  };

  // 1. Banco SQLite Local
  try {
    db.prepare('SELECT 1').get();
    status.database.operational = true;
    
    // Caminho relativo ao diretório backend
    const dbPath = path.join(__dirname, '../belafarma.db');
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      status.database.sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    }
  } catch (err) {
    status.database.operational = false;
    status.database.error = err.message;
  }

  // 2. Conexão Baileys Local (Principal e Secundário)
  try {
    const baileysService = require('../baileys-service.js');
    const pStatus = baileysService.getStatus();
    status.whatsapp.principal = {
      connected: !!pStatus.connected,
      status: pStatus.state || (pStatus.connected ? 'connected' : 'disconnected'),
      error: null
    };
  } catch (err) {
    status.whatsapp.principal.error = err.message;
  }

  try {
    const secondaryService = require('../baileys-secondary-service.js');
    const sStatus = secondaryService.getStatus();
    status.whatsapp.secundario = {
      connected: !!sStatus.connected,
      status: sStatus.state || (sStatus.connected ? 'connected' : 'disconnected'),
      error: null
    };
  } catch (err) {
    status.whatsapp.secundario.error = err.message;
  }

  // 3. Evolution API (WhatsApp Remoto)
  const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://evolution-api:8080';
  const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
  
  try {
    // Timeout controlado de 3 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
      method: 'GET',
      headers: { 'apikey': EVOLUTION_KEY },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      status.evolutionApi.operational = true;
      const data = await res.json();
      if (Array.isArray(data)) {
        status.evolutionApi.instances = data.map(inst => ({
          name: inst.instanceName || (inst.instance && inst.instance.instanceName) || 'desconhecido',
          status: inst.status || (inst.instance && inst.instance.status) || 'UNKNOWN',
          connectionStatus: inst.connectionStatus || (inst.instance && inst.instance.connectionStatus) || 'UNKNOWN'
        }));
      }
    } else {
      status.evolutionApi.operational = false;
      status.evolutionApi.error = `Response Code: ${res.status}`;
    }
  } catch (err) {
    status.evolutionApi.operational = false;
    status.evolutionApi.error = err.name === 'AbortError' ? 'Timeout de conexão (3s)' : err.message;
  }

  // 4. Integração Banco de Dados Digifarma (Firebird)
  try {
    const { queryDigifarma } = require('./digifarma.service');
    
    // Timeout de 2.5 segundos para não travar o Vigilante se o servidor Digifarma local estiver offline
    const digiPromise = queryDigifarma('SELECT 1 FROM RDB$DATABASE');
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout de 2.5s na rede local do Digifarma.')), 2500)
    );

    await Promise.race([digiPromise, timeoutPromise]);
    status.digifarmaDb.operational = true;
  } catch (err) {
    status.digifarmaDb.operational = false;
    status.digifarmaDb.error = err.message;
  }

  // 5. Histórico e Atrasos de Crons de Segundo Plano
  try {
    const rows = db.prepare('SELECT * FROM service_health_status').all();
    
    const serviceMetadata = {
      'backup': { label: 'Backup Automático', intervalMs: 14 * 60 * 60 * 1000 }, // Roda a cada 12h (margem de 14h)
      'robo_ofertas_jit': { label: 'Robô de Ofertas JIT', intervalMs: 2.5 * 60 * 60 * 1000 }, // Roda a cada 1h comercial (margem 2.5h)
      'robo_status': { label: 'Robô de Status', intervalMs: 26 * 60 * 60 * 1000 }, // Roda a cada 24h (margem 26h)
      'auto_shortages': { label: 'Lançamento de Faltas Automático', intervalMs: 26 * 60 * 60 * 1000 }, // Roda a cada 24h
      'radio_news': { label: 'Notícias da Rádio IA', intervalMs: 9 * 60 * 60 * 1000 }, // Roda 3x ao dia (margem 9h)
      'whatsapp_vendas_sync': { label: 'Sincronização Fotos Site', intervalMs: 26 * 60 * 60 * 1000 } // Roda a cada 24h
    };

    status.backgroundServices = Object.keys(serviceMetadata).map(key => {
      const row = rows.find(r => r.service_name === key);
      const meta = serviceMetadata[key];
      
      let healthStatus = 'UNKNOWN'; // 'OK', 'FAILED', 'DELAYED', 'UNKNOWN'
      let delayMessage = null;

      if (row) {
        const lastSuccess = row.last_success_time ? new Date(row.last_success_time).getTime() : 0;
        const nowTime = Date.now();
        
        if (row.status === 'FAILED') {
          healthStatus = 'FAILED';
        } else if (lastSuccess === 0) {
          healthStatus = 'UNKNOWN';
        } else if (nowTime - lastSuccess > meta.intervalMs) {
          // Ajustes inteligentes para não marcar como "atrasado" fora do horário de funcionamento comercial
          const isJit = key === 'robo_ofertas_jit';
          const isSunday = new Date().getDay() === 0;
          const hour = new Date().getHours();
          if (isJit && (isSunday || hour < 8 || hour > 21)) {
            healthStatus = 'OK'; // Fora do horário JIT, tudo bem não ter rodado nas últimas horas
          } else {
            healthStatus = 'DELAYED';
            const diffHours = Math.round((nowTime - lastSuccess) / (60 * 60 * 1000));
            delayMessage = `Último sucesso foi há ${diffHours} horas (esperado: < ${meta.intervalMs / (60 * 60 * 1000)}h)`;
          }
        } else {
          healthStatus = 'OK';
        }

        return {
          name: key,
          label: meta.label,
          lastRun: row.last_run_time,
          lastSuccess: row.last_success_time,
          status: row.status,
          health: healthStatus,
          lastError: row.last_error,
          delayMessage
        };
      } else {
        return {
          name: key,
          label: meta.label,
          lastRun: null,
          lastSuccess: null,
          status: 'NEVER_RUN',
          health: 'UNKNOWN',
          lastError: null,
          delayMessage: 'Serviço nunca foi executado pelo Vigilante.'
        };
      }
    });
  } catch (err) {
    console.error('[WATCHER] Erro ao buscar dados de backgroundServices:', err.message);
  }

  return status;
}

/**
 * Checa a saúde geral do ecossistema e envia alertas via WhatsApp do Admin se necessário.
 */
async function checkAndAlertDelayedServices() {
  try {
    console.log('[WATCHER] Executando rotina de verificação de alertas...');
    const health = await getSystemHealth();
    const alerts = [];

    // Verificações críticas em tempo real
    if (!health.database.operational) {
      alerts.push(`- 🗄️ *Banco de Dados local (SQLite)* está inoperante!`);
    }
    if (!health.whatsapp.principal.connected) {
      alerts.push(`- 💬 *WhatsApp Principal (Baileys)* está desconectado!`);
    }
    if (!health.evolutionApi.operational) {
      alerts.push(`- 🤖 *Evolution API (Instâncias)* está offline! Erro: ${health.evolutionApi.error || 'Sem resposta'}`);
    }

    // Verificações de serviços de background
    health.backgroundServices.forEach(srv => {
      if (srv.health === 'FAILED') {
        alerts.push(`- ⚠️ *Serviço "${srv.label}"* falhou na última execução! Erro: ${srv.lastError || 'Desconhecido'}`);
      } else if (srv.health === 'DELAYED') {
        alerts.push(`- ⏳ *Serviço "${srv.label}"* está atrasado! ${srv.delayMessage || ''}`);
      }
    });

    if (alerts.length > 0) {
      console.warn(`[WATCHER] ${alerts.length} alertas encontrados! Enviando notificação para Admin...`);
      const message = `⚠️ *[Vigilante BelaFarma]* Alertas de integridade do sistema detectados:\n\n${alerts.join('\n')}\n\n_Por favor, verifique o painel administrativo._`;
      
      const baileysService = require('./baileys-service.js');
      const ADMIN_PHONE = (process.env.ADMIN_WHATSAPP || '').replace(/\D/g, '');
      
      if (ADMIN_PHONE && baileysService.getStatus().connected) {
        // Envia direto para o número do admin
        await baileysService.sendTextToGroup(ADMIN_PHONE, message);
        console.log(`[WATCHER] Mensagem de alerta enviada com sucesso para ${ADMIN_PHONE}`);
      } else {
        console.warn(`[WATCHER] Impossível enviar alerta. ADMIN_WHATSAPP: "${ADMIN_PHONE}". WhatsApp conectado: ${baileysService.getStatus().connected}`);
      }
    } else {
      console.log('[WATCHER] Sistema 100% saudável. Nenhum alerta necessário.');
    }
  } catch (err) {
    console.error('[WATCHER] Falha na execução da rotina de alertas:', err.message);
  }
}

module.exports = {
  registerServiceRun,
  getSystemHealth,
  checkAndAlertDelayedServices
};
