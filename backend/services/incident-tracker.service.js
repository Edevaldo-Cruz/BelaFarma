const fs = require('fs');
const path = require('path');
const os = require('os');

let dbInstance = null;
let heartbeatInterval = null;
let lastWhatsappIncidentId = null;

// Determina o diretório de logs
const LOG_DIR = process.platform === 'win32' 
  ? path.join(__dirname, '..') 
  : path.join(__dirname, '../data');
const LOG_FILE_PATH = path.join(LOG_DIR, 'backend.log');

/**
 * Inicializa as tabelas de incidentes e o sistema de batimento cardíaco (Heartbeat).
 * @param {object} db - Instância do better-sqlite3
 */
function initIncidentTracker(db) {
  dbInstance = db;

  try {
    // 1. Tabela de Incidentes e Interrupções
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL, -- 'SERVER_RESTART', 'WHATSAPP_DISCONNECT', 'SERVICE_FAILURE', 'UNCAUGHT_ERROR', 'HIGH_MEMORY'
        severity TEXT NOT NULL, -- 'CRITICAL', 'WARNING', 'INFO'
        title TEXT NOT NULL,
        details TEXT,
        duration_seconds INTEGER,
        resolved_at TEXT
      );
    `);

    // 2. Tabela de Heartbeat para detecção de quedas não programadas
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_heartbeats (
        id INTEGER PRIMARY KEY,
        last_ping TEXT NOT NULL,
        pid INTEGER NOT NULL,
        uptime_seconds REAL NOT NULL,
        memory_rss_mb INTEGER NOT NULL,
        clean_shutdown INTEGER NOT NULL DEFAULT 0
      );
    `);

    console.log('[INCIDENT-TRACKER] 🛡️ Tabelas de incidentes e heartbeat inicializadas.');

    // 3. Checagem pós-inicialização: verificar se a parada anterior foi inesperada
    checkPreviousShutdown();

    // 4. Iniciar rotina periódica de Heartbeat (a cada 30 segundos)
    startHeartbeatLoop();

    // 5. Registrar Handlers de Encerramento e Exceções Globais
    registerGlobalHandlers();

  } catch (err) {
    console.error('[INCIDENT-TRACKER] ❌ Erro ao inicializar Incident Tracker:', err.message);
  }
}

/**
 * Registra um incidente no banco de dados.
 */
function recordIncident(type, severity, title, details = null, durationSeconds = null, resolvedAt = null) {
  if (!dbInstance) return null;
  try {
    const timestamp = new Date().toISOString();
    const stmt = dbInstance.prepare(`
      INSERT INTO system_incidents (timestamp, type, severity, title, details, duration_seconds, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(timestamp, type, severity, title, details, durationSeconds, resolvedAt);
    console.log(`[INCIDENT-TRACKER] ⚠️ Incidente registrado [${severity}] ${title} (ID: ${info.lastInsertRowid})`);
    return info.lastInsertRowid;
  } catch (err) {
    console.error('[INCIDENT-TRACKER] Falha ao registrar incidente:', err.message);
    return null;
  }
}

/**
 * Atualiza um incidente marcando-o como resolvido e calculando a duração.
 */
function resolveIncident(id, durationSeconds = null, resolutionDetails = null) {
  if (!dbInstance || !id) return;
  try {
    const now = new Date().toISOString();
    let query = `UPDATE system_incidents SET resolved_at = ?`;
    const params = [now];

    if (durationSeconds !== null) {
      query += `, duration_seconds = ?`;
      params.push(durationSeconds);
    }
    if (resolutionDetails) {
      query += `, details = details || '\n\n' || ?`;
      params.push(`[Resolução em ${now}]: ${resolutionDetails}`);
    }

    query += ` WHERE id = ?`;
    params.push(id);

    dbInstance.prepare(query).run(...params);
    console.log(`[INCIDENT-TRACKER] ✅ Incidente #${id} marcado como resolvido (Duração: ${durationSeconds || 0}s).`);
  } catch (err) {
    console.error(`[INCIDENT-TRACKER] Falha ao resolver incidente #${id}:`, err.message);
  }
}

/**
 * Verifica se a inicialização atual ocorreu após um desligamento inesperado.
 */
function checkPreviousShutdown() {
  try {
    const row = dbInstance.prepare(`SELECT * FROM system_heartbeats WHERE id = 1`).get();
    const nowTime = Date.now();
    const nowIso = new Date(nowTime).toISOString();

    if (row) {
      const lastPingTime = new Date(row.last_ping).getTime();
      const diffSeconds = Math.round((nowTime - lastPingTime) / 1000);

      if (row.clean_shutdown === 0 && diffSeconds > 45) {
        // Encerramento inesperado (crash, falta de energia ou OOM)
        const diffMinutes = (diffSeconds / 60).toFixed(1);
        const details = `O servidor reiniciou após parada não programada.\nÚltimo registro ativo antes da queda: ${new Date(row.last_ping).toLocaleString('pt-BR')}.\nMemória antes da interrupção: ${row.memory_rss_mb} MB (PID: ${row.pid}).\nTempo total de inatividade estimado: ~${diffMinutes} minutos (${diffSeconds}s).`;

        recordIncident(
          'SERVER_RESTART',
          'WARNING',
          `Reinicialização Inesperada do Servidor (~${diffMinutes} min offline)`,
          details,
          diffSeconds,
          nowIso
        );
      } else if (row.clean_shutdown === 1) {
        // Encerramento limpo/programado (Deploy ou restart intencional)
        recordIncident(
          'SERVER_RESTART',
          'INFO',
          'Servidor Iniciado (Reinicialização Programada / Deploy)',
          `Início normal do servidor após encerramento correto. Parada anterior às ${new Date(row.last_ping).toLocaleString('pt-BR')}.`,
          diffSeconds,
          nowIso
        );
      }
    } else {
      // Primeira execução
      recordIncident(
        'SERVER_RESTART',
        'INFO',
        'Inicialização do Servidor (Primeiro Registro)',
        'O sistema foi iniciado e a auditoria de incidentes está ativa.',
        0,
        nowIso
      );
    }

    // Atualiza o heartbeat para o estado inicial da sessão atual
    updateHeartbeat(0);
  } catch (err) {
    console.error('[INCIDENT-TRACKER] Erro ao verificar desligamento anterior:', err.message);
  }
}

/**
 * Atualiza o registro de batimento cardíaco no banco de dados.
 */
function updateHeartbeat(cleanShutdown = 0) {
  if (!dbInstance) return;
  try {
    const now = new Date().toISOString();
    const memoryRss = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const uptime = process.uptime();
    const pid = process.pid;

    dbInstance.prepare(`
      INSERT INTO system_heartbeats (id, last_ping, pid, uptime_seconds, memory_rss_mb, clean_shutdown)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_ping = excluded.last_ping,
        pid = excluded.pid,
        uptime_seconds = excluded.uptime_seconds,
        memory_rss_mb = excluded.memory_rss_mb,
        clean_shutdown = excluded.clean_shutdown;
    `).run(now, pid, uptime, memoryRss, cleanShutdown);
  } catch (err) {
    // Falha silenciosa para não poluir os logs em excesso
  }
}

/**
 * Inicia o loop de heartbeat a cada 30s.
 */
function startHeartbeatLoop() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    updateHeartbeat(0);
  }, 30000);
}

/**
 * Registra listeners de sinais do sistema e erros não tratados.
 */
function registerGlobalHandlers() {
  const onCleanExit = (signal) => {
    console.log(`[INCIDENT-TRACKER] 🛑 Sinal de término recebido (${signal}). Marcando encerramento limpo...`);
    updateHeartbeat(1);
  };

  process.on('SIGINT', () => onCleanExit('SIGINT'));
  process.on('SIGTERM', () => onCleanExit('SIGTERM'));

  process.on('uncaughtException', (err) => {
    console.error('[INCIDENT-TRACKER] 💥 UNCAUGHT EXCEPTION detectada:', err);
    recordIncident(
      'UNCAUGHT_ERROR',
      'CRITICAL',
      `Exceção Não Tratada: ${err.message || 'Erro Desconhecido'}`,
      `Stack trace:\n${err.stack || 'Sem stack disponível'}\n\nMemória no momento: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB.`
    );
    updateHeartbeat(0);
  });

  process.on('unhandledRejection', (reason, promise) => {
    const errorMsg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : '';
    console.error('[INCIDENT-TRACKER] ⚠️ UNHANDLED PROMISE REJECTION:', errorMsg);
    recordIncident(
      'UNCAUGHT_ERROR',
      'CRITICAL',
      `Promise Rejeitada Não Tratada: ${errorMsg}`,
      `Detalhes / Stack:\n${stack || errorMsg}`
    );
  });
}

/**
 * Notifica e registra desconexão do WhatsApp Baileys.
 */
function notifyWhatsappDisconnect(instanceName, statusCode, reason, isFullReset = false) {
  const title = `WhatsApp ${instanceName === 'secundario' ? 'Secundário' : 'Principal'} Desconectado (Código: ${statusCode || 'N/A'})`;
  const details = `Motivo: ${reason}\nNecessitou reset completo de sessão: ${isFullReset ? 'Sim (novo QR Code exigido)' : 'Não (tentando reconectar automaticamente)'}`;
  const severity = (statusCode === 401 || isFullReset) ? 'CRITICAL' : 'WARNING';

  const incidentId = recordIncident('WHATSAPP_DISCONNECT', severity, title, details);
  if (instanceName === 'principal') {
    lastWhatsappIncidentId = incidentId;
  }
  return incidentId;
}

/**
 * Notifica e registra reconexão bem-sucedida do WhatsApp Baileys.
 */
function notifyWhatsappConnect(instanceName) {
  if (instanceName === 'principal' && lastWhatsappIncidentId) {
    resolveIncident(lastWhatsappIncidentId, null, 'Conexão restabelecida com sucesso.');
    lastWhatsappIncidentId = null;
  }
}

/**
 * Retorna os incidentes registrados no sistema.
 */
function getIncidents(limit = 50, type = null) {
  if (!dbInstance) return [];
  try {
    let query = `SELECT * FROM system_incidents`;
    const params = [];

    if (type) {
      query += ` WHERE type = ?`;
      params.push(type);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    return dbInstance.prepare(query).all(...params);
  } catch (err) {
    console.error('[INCIDENT-TRACKER] Erro ao buscar incidentes:', err.message);
    return [];
  }
}

/**
 * Limpa o histórico de incidentes.
 */
function clearIncidents() {
  if (!dbInstance) return false;
  try {
    dbInstance.prepare(`DELETE FROM system_incidents`).run();
    console.log('[INCIDENT-TRACKER] 🧹 Histórico de incidentes limpo pelo usuário.');
    return true;
  } catch (err) {
    console.error('[INCIDENT-TRACKER] Erro ao limpar incidentes:', err.message);
    return false;
  }
}

/**
 * Lê as últimas N linhas do backend.log de forma segura.
 */
function getRecentLogs(linesCount = 150, filter = null) {
  try {
    if (!fs.existsSync(LOG_FILE_PATH)) {
      return { lines: ['Arquivo backend.log ainda não foi criado.'], totalLines: 0 };
    }

    const content = fs.readFileSync(LOG_FILE_PATH, 'utf8');
    let lines = content.split('\n').filter(Boolean);

    if (filter) {
      const lowerFilter = filter.toLowerCase();
      lines = lines.filter(line => line.toLowerCase().includes(lowerFilter));
    }

    const totalFiltered = lines.length;
    const recent = lines.slice(-linesCount);

    return {
      lines: recent,
      totalLines: totalFiltered,
      filePath: LOG_FILE_PATH
    };
  } catch (err) {
    console.error('[INCIDENT-TRACKER] Erro ao ler backend.log:', err.message);
    return { lines: [`Erro ao ler arquivo de log: ${err.message}`], totalLines: 0 };
  }
}

module.exports = {
  initIncidentTracker,
  recordIncident,
  resolveIncident,
  notifyWhatsappDisconnect,
  notifyWhatsappConnect,
  getIncidents,
  clearIncidents,
  getRecentLogs
};
