const db = require('../database');
const fetch = require('node-fetch');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const config = require('../config.js');

let ultimaAutoCorrecao = {
  timestamp: null,
  acoes: [],
  status: 'NENHUMA_ACAO',
  memoriaAntesMB: null,
  memoriaDepoisMB: null,
  duracaoMs: 0
};

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
    backgroundServices: [],
    resourceWatch: {
      totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
      freeMemoryPct: Number(((os.freemem() / os.totalmem()) * 100).toFixed(1)),
      processMemoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      orphanChromeCount: 0,
      walSizeMB: 0,
      isCotacaoRunning: false,
      autoRemediationActive: true,
      lastAutoRemediation: ultimaAutoCorrecao
    }
  };

  // 1. Banco SQLite Local
  try {
    db.prepare('SELECT 1').get();
    status.database.operational = true;
    
    const dbPath = config.dbPath;
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      status.database.sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    }

    const walPath = dbPath + '-wal';
    if (fs.existsSync(walPath)) {
      status.resourceWatch.walSizeMB = Number((fs.statSync(walPath).size / 1024 / 1024).toFixed(2));
    }
  } catch (err) {
    status.database.operational = false;
    status.database.error = err.message;
  }

  // Checa processos zumbis do Chrome e cotação ativa
  try {
    status.resourceWatch.orphanChromeCount = await contarProcessosZumbisChrome();
  } catch (_) {}

  try {
    const belaped = require('../belaped-endpoints.js');
    if (typeof belaped.getCotacaoStatus === 'function') {
      const cStatus = belaped.getCotacaoStatus();
      status.resourceWatch.isCotacaoRunning = !!(cStatus && cStatus.emAndamento);
    }
  } catch (_) {}

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

/**
 * Conta processos do Google Chrome headless/puppeteer ativos no sistema (Windows)
 * @returns {Promise<number>}
 */
async function contarProcessosZumbisChrome() {
  if (process.platform !== 'win32') return 0;
  return new Promise((resolve) => {
    const psScript = `(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object { $_.CommandLine -like "*--headless*" -or $_.CommandLine -like "*puppeteer*" } | Measure-Object).Count`;
    execFile('powershell.exe', ['-NoProfile', '-Command', psScript], { timeout: 6000 }, (err, stdout) => {
      if (err) return resolve(0);
      const count = parseInt(stdout ? stdout.trim() : '0', 10);
      resolve(isNaN(count) ? 0 : count);
    });
  });
}

/**
 * Encerra de forma segura todos os processos headless/puppeteer zumbis do Chrome no Windows
 * @returns {Promise<number>} Quantidade de processos encerrados
 */
async function limparProcessosZumbisChrome() {
  if (process.platform !== 'win32') return 0;
  return new Promise((resolve) => {
    const psScript = `$targets = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object { $_.CommandLine -like "*--headless*" -or $_.CommandLine -like "*puppeteer*" }; $count = $targets.Count; $targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Output $count`;
    execFile('powershell.exe', ['-NoProfile', '-Command', psScript], { timeout: 10000 }, (err, stdout) => {
      if (err) return resolve(0);
      const count = parseInt(stdout ? stdout.trim() : '0', 10);
      resolve(isNaN(count) ? 0 : count);
    });
  });
}

/**
 * Executa o plano automático de correção do Vigilante (Self-Healing de Recursos)
 * @param {object} options
 * @param {boolean} options.forcar - Força a execução mesmo se os limites não forem violados
 */
async function executarPlanoAutoCorrecao(options = {}) {
  const forcar = !!options.forcar;
  const acoesTomadas = [];
  const inicio = Date.now();

  const totalMemMB = Math.round(os.totalmem() / 1024 / 1024);
  const freeMemMBInicial = Math.round(os.freemem() / 1024 / 1024);
  const freeMemPctInicial = Number(((freeMemMBInicial / totalMemMB) * 100).toFixed(1));

  // 1. Checa status da cotação BelaPed
  let cotacaoStatus = { emAndamento: false };
  try {
    const belapedEndpoints = require('../belaped-endpoints.js');
    if (typeof belapedEndpoints.getCotacaoStatus === 'function') {
      cotacaoStatus = belapedEndpoints.getCotacaoStatus();
    }
  } catch (_) {}

  // 2. Checa processos zumbis do Chrome
  const zumbis = await contarProcessosZumbisChrome();

  // Ação 1: Processos zumbis detectados sem cotação ativa
  if (zumbis > 0 && (!cotacaoStatus.emAndamento || forcar)) {
    const encerrados = await limparProcessosZumbisChrome();
    acoesTomadas.push(`Encerrados ${encerrados || zumbis} processos zumbis do Chrome em segundo plano.`);
  } else if (zumbis > 8 && cotacaoStatus.emAndamento) {
    // Se a cotação estiver rodando mas houver mais de 8 processos acumulados (vazamento anômalo)
    const encerrados = await limparProcessosZumbisChrome();
    acoesTomadas.push(`Expurgo preventivo em cotação: encerrados ${encerrados || zumbis} processos acumulados do Chrome.`);
  }

  // Ação 2: Cotação travada há mais de 15 minutos sem progresso
  if (cotacaoStatus.emAndamento && cotacaoStatus.iniciadoEm) {
    const inicioCotacao = new Date(cotacaoStatus.iniciadoEm).getTime();
    const duracaoMs = Date.now() - inicioCotacao;
    if (duracaoMs > 15 * 60 * 1000) { // 15 minutos
      try {
        const belapedEndpoints = require('../belaped-endpoints.js');
        if (typeof belapedEndpoints.abortarCotacaoTravada === 'function') {
          belapedEndpoints.abortarCotacaoTravada();
          acoesTomadas.push(`Cotação do BelaPed travada há mais de 15 minutos foi cancelada e seus navegadores reiniciados.`);
        }
      } catch (_) {}
    }
  }

  // Ação 3: Memória RAM sob pressão crítica (< 2.5 GB livres ou < 15%) ou acionamento forçado
  if (freeMemMBInicial < 2500 || freeMemPctInicial < 15.0 || forcar) {
    // Checkpoint de compactação do WAL do SQLite
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      acoesTomadas.push('Checkpoint TRUNCATE executado no banco SQLite (WAL compactado).');
    } catch (e) {
      console.warn('[Vigilante] Erro no checkpoint WAL:', e.message);
    }

    // Coleta forçada de lixo do Node se disponível
    if (global.gc) {
      try {
        global.gc();
        acoesTomadas.push('Coleta forçada de lixo (V8 GC) executada.');
      } catch (_) {}
    }
  }

  // Ação 4: Inchaço do arquivo WAL do SQLite (> 40 MB)
  const walPath = config.dbPath + '-wal';
  if (fs.existsSync(walPath)) {
    try {
      const walSizeMB = fs.statSync(walPath).size / 1024 / 1024;
      if (walSizeMB > 40) {
        db.pragma('wal_checkpoint(TRUNCATE)');
        acoesTomadas.push(`WAL do SQLite excedeu 40 MB (${walSizeMB.toFixed(1)} MB). Compactado para zero.`);
      }
    } catch (_) {}
  }

  const freeMemMBFinal = Math.round(os.freemem() / 1024 / 1024);
  const diffLiberada = freeMemMBFinal - freeMemMBInicial;
  const statusResultado = acoesTomadas.length > 0 ? 'AUTO_CORRECAO_EXECUTADA' : 'SISTEMA_SAUDAVEL';

  ultimaAutoCorrecao = {
    timestamp: new Date().toISOString(),
    acoes: acoesTomadas,
    status: statusResultado,
    memoriaAntesMB: freeMemMBInicial,
    memoriaDepoisMB: freeMemMBFinal,
    duracaoMs: Date.now() - inicio
  };

  // Se realizou alguma ação corretiva, registra no histórico de incidentes
  if (acoesTomadas.length > 0) {
    console.log(`[Vigilante Auto-Fix] 🛡️ Plano de auto-correção executado: ${acoesTomadas.join(' | ')}`);
    try {
      const incidentTracker = require('./incident-tracker.service.js');
      incidentTracker.recordIncident(
        'AUTO_REMEDIATION',
        freeMemMBFinal < 1500 ? 'WARNING' : 'INFO',
        `Auto-Correção do Vigilante Executada (${acoesTomadas.length} ações)`,
        `Ações de auto-remediação executadas com sucesso:\n- ${acoesTomadas.join('\n- ')}\n\nMemória RAM Livre: de ${freeMemMBInicial} MB para ${freeMemMBFinal} MB (Variação: +${diffLiberada} MB).`
      );
    } catch (_) {}

    registerServiceRun('vigilante_recursos', 'SUCCESS');
  }

  return {
    sucesso: true,
    acoesTomadas,
    memoriaAntesMB: freeMemMBInicial,
    memoriaDepoisMB: freeMemMBFinal,
    memoriaLiberadaMB: diffLiberada > 0 ? diffLiberada : 0,
    duracaoMs: Date.now() - inicio
  };
}

/**
 * Inicializa o loop contínuo de vigilância e auto-correção a cada 3 minutos
 */
let loopRecursosIniciado = false;
function iniciarLoopVigilanteRecursos() {
  if (loopRecursosIniciado) return;
  loopRecursosIniciado = true;
  console.log('[Vigilante] 🛡️ Guardião de Recursos & Auto-Correção ativado (ciclo de 3 minutos).');

  // Executa uma primeira checagem após 15 segundos do boot
  setTimeout(() => {
    executarPlanoAutoCorrecao().catch(err => console.error('[Vigilante] Erro no auto-fix inicial:', err.message));
  }, 15000);

  // Intervalo recorrente de 3 minutos
  setInterval(() => {
    executarPlanoAutoCorrecao().catch(err => console.error('[Vigilante] Erro no ciclo de auto-fix:', err.message));
  }, 3 * 60 * 1000);
}

module.exports = {
  registerServiceRun,
  getSystemHealth,
  checkAndAlertDelayedServices,
  contarProcessosZumbisChrome,
  limparProcessosZumbisChrome,
  executarPlanoAutoCorrecao,
  iniciarLoopVigilanteRecursos
};
