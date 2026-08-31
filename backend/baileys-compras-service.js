/**
 * baileys-compras-service.js
 * Instância Isolada de WhatsApp Comercial para a Central de Compras BelaFarma.
 * 
 * Mantém sessão e conexões 100% isoladas do WhatsApp Principal e do WhatsApp Secundário.
 * Pasta de sessão dedicada: baileys-session-compras
 * 
 * Regra de Segurança: Nenhuma mensagem externa é disparada automaticamente sem aprovação
 * na fila de aprovação (Human-in-the-loop).
 */

const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');

// Diretório persistente da sessão (volume Docker em produção ou local no Windows)
const SESSION_DIR = process.platform === 'win32'
  ? path.join(__dirname, 'baileys-session-compras')
  : path.join(__dirname, 'data', 'baileys-session-compras');

// Tenta carregar o rastreador de incidentes se disponível
let incidentTracker = null;
try {
  incidentTracker = require('./services/incident-tracker.service.js');
} catch (e) {
  // Opcional
}

// Estado interno do serviço
let sock           = null;   // Socket Baileys ativo
let isConnected    = false;  // true quando autenticado e pronto
let isConnecting   = false;  // true durante handshake/inicialização
let lastQR         = null;   // Último QR Code (Base64 ou raw)
let lastError      = null;   // Último erro registrado
let connectedPhone = null;   // Telefone conectado
let reconnectTimer = null;   // Timer de reconexão
let savedDb        = null;   // Instância SQLite

// Inicialização lazy do Baileys
let makeWASocket, useMultiFileAuthState, DisconnectReason, Boom, downloadMediaMessage, Browsers, fetchLatestBaileysVersion;

function loadBaileys() {
  try {
    const baileys = require('@whiskeysockets/baileys');
    makeWASocket          = baileys.default || baileys.makeWASocket || baileys;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    DisconnectReason      = baileys.DisconnectReason;
    downloadMediaMessage  = baileys.downloadMediaMessage;
    Browsers              = baileys.Browsers;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    Boom                  = require('@hapi/boom');
    return true;
  } catch (e) {
    console.error('[Baileys-Compras] ❌ Módulo @whiskeysockets/baileys não encontrado:', e.message);
    return false;
  }
}

/**
 * CONNECT — Inicia ou reconecta a sessão isolada de WhatsApp de Compras.
 * @param {object} db - Instância do banco SQLite
 */
async function connect(db) {
  if (db) savedDb = db;
  if (isConnecting) {
    console.log('[Baileys-Compras] Conexão já em andamento...');
    return;
  }
  if (!loadBaileys()) return;

  isConnecting = true;
  lastQR       = null;

  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    let version = [2, 3000, 1015901307];
    if (fetchLatestBaileysVersion) {
      try {
        const fetched = await fetchLatestBaileysVersion();
        version = fetched.version;
        console.log(`[Baileys-Compras] 🌐 Versão do WhatsApp Web Compras: v${version.join('.')}`);
      } catch (verErr) {
        console.warn('[Baileys-Compras] Fallback para versão padrão do WA Web:', verErr.message);
      }
    }

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 2000,
      logger: {
        level: 'silent',
        trace: () => {}, debug: () => {}, info: () => {},
        warn:  (...m) => console.warn('[Baileys-Compras-internal WARN]', ...m),
        error: (...m) => console.error('[Baileys-Compras-internal ERROR]', ...m),
        fatal: (...m) => console.error('[Baileys-Compras-internal FATAL]', ...m),
        child: function() { return this; }
      }
    });

    // Eventos de credenciais
    sock.ev.on('creds.update', saveCreds);

    // Eventos de conexão e QR Code
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        isConnected  = false;
        isConnecting = false;
        lastError    = null;
        console.log('[Baileys-Compras] 📲 QR Code gerado para WhatsApp Comercial de Compras.');
        lastQR = qr;
        try {
          const QRCode = require('qrcode');
          const dataUrl = await QRCode.toDataURL(qr);
          if (lastQR === qr) {
            lastQR = dataUrl;
          }
        } catch (e) {
          console.warn('[Baileys-Compras] Falha ao converter QR para base64:', e.message);
        }
      }

      if (connection === 'open') {
        isConnected  = true;
        isConnecting = false;
        lastQR       = null;
        lastError    = null;
        
        if (sock?.user?.id) {
          connectedPhone = sock.user.id.split(':')[0].split('@')[0];
        }
        console.log(`[Baileys-Compras] ✅ WhatsApp Comercial de Compras conectado! Número: ${connectedPhone || 'Desconhecido'}`);
        
        try {
          if (incidentTracker?.notifyWhatsappConnect) {
            incidentTracker.notifyWhatsappConnect('compras');
          }
        } catch (e) {}

        // Atualizar configuração do sistema
        if (savedDb && connectedPhone) {
          try {
            const now = new Date().toISOString();
            savedDb.prepare(`
              INSERT INTO compras_configuracoes (chave, valor, descricao, updated_at)
              VALUES ('whatsapp_compras_phone', ?, 'Número conectado no WhatsApp Comercial de Compras', ?)
              ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at
            `).run(connectedPhone, now);
          } catch (dbErr) {
            console.warn('[Baileys-Compras] Erro ao gravar phone nas configs:', dbErr.message);
          }
        }
      }

      if (connection === 'close') {
        isConnected    = false;
        isConnecting   = false;
        connectedPhone = null;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || String(lastDisconnect?.error || 'desconhecido');

        console.warn(`[Baileys-Compras] ⚠️ Conexão de compras fechada. Código: ${statusCode}, Motivo: ${reason}`);

        const needsFullReset = statusCode === DisconnectReason?.loggedOut ||
                               statusCode === DisconnectReason?.badSession ||
                               reason.includes('QR refs attempts ended');

        try {
          if (incidentTracker?.notifyWhatsappDisconnect) {
            incidentTracker.notifyWhatsappDisconnect('compras', statusCode, reason, needsFullReset);
          }
        } catch (e) {}

        if (needsFullReset) {
          console.warn('[Baileys-Compras] 🧹 Sessão de compras inválida ou expirada. Limpando pasta de sessão...');
          try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch(e) {}
          lastError = `Reset: código ${statusCode} — ${reason}`;
          lastQR = null;
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => connect(savedDb), 4000);
          return;
        }

        console.warn(`[Baileys-Compras] 🔄 Desconectado temporariamente (${statusCode} - ${reason}). Reconectando em 5s...`);
        lastError = `Desconectado: ${reason}`;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => connect(savedDb), 5000);
      }
    });

    // ── Histórico de mensagens (Sincronização de conversas) ──────────
    sock.ev.on('messaging-history.set', async (history) => {
      const { messages } = history;
      if (!messages || messages.length === 0) return;

      console.log(`[Baileys-Compras] 📥 Histórico recebido na instância de compras: ${messages.length} mensagens.`);
      
      if (savedDb) {
        try {
          const comprasMineracaoService = require('./services/compras-mineracao.service');
          await comprasMineracaoService.processarMensagensEmLote(messages, savedDb);
        } catch (minErr) {
          console.error('[Baileys-Compras] Erro ao processar histórico para mineração:', minErr.message);
        }
      }
    });

    // ── Mensagens Recebidas em Tempo Real ────────────────────────────
    sock.ev.on('messages.upsert', async (m) => {
      try {
        if (m.type !== 'notify') return;
        const msg = m.messages?.[0];
        if (!msg || !msg.message) return;

        const remoteJid = msg.key?.remoteJid;
        if (!remoteJid || remoteJid.endsWith('@broadcast')) return;

        // Desembrulha mensagens envelopadas
        let contentMsg = msg.message;
        if (contentMsg?.viewOnceMessage?.message) contentMsg = contentMsg.viewOnceMessage.message;
        else if (contentMsg?.viewOnceMessageV2?.message) contentMsg = contentMsg.viewOnceMessageV2.message;
        else if (contentMsg?.viewOnceMessageV2Extension?.message) contentMsg = contentMsg.viewOnceMessageV2Extension.message;
        else if (contentMsg?.ephemeralMessage?.message) contentMsg = contentMsg.ephemeralMessage.message;
        else if (contentMsg?.documentWithCaptionMessage?.message) contentMsg = contentMsg.documentWithCaptionMessage.message;

        const messageType = Object.keys(contentMsg)[0] || '';
        let text = null;
        let mediaType = 'texto';

        if (messageType === 'conversation') {
          text = contentMsg.conversation;
        } else if (messageType === 'extendedTextMessage') {
          text = contentMsg.extendedTextMessage?.text;
        } else if (messageType === 'imageMessage') {
          text = contentMsg.imageMessage?.caption || '[📷 Imagem de Tabela/Oferta]';
          mediaType = 'imagem';
        } else if (messageType === 'documentMessage') {
          text = contentMsg.documentMessage?.caption || `[📄 Documento: ${contentMsg.documentMessage?.fileName || 'anexo'}]`;
          mediaType = 'documento';
        } else if (messageType === 'audioMessage') {
          text = '[🎙️ Áudio]';
          mediaType = 'audio';
        }

        const phone = remoteJid.split('@')[0];
        const timestamp = msg.messageTimestamp ? (msg.messageTimestamp * 1000) : Date.now();
        const fromMe = msg.key.fromMe ? 1 : 0;
        const messageId = msg.key.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const contactName = msg.pushName || '';

        // Salva histórico bruto de compras no SQLite
        if (savedDb) {
          try {
            const dateStr = new Date(timestamp).toISOString();
            savedDb.prepare(`
              INSERT INTO compras_historico_mensagens (
                id, message_id, remote_jid, telefone, nome_contato, from_me,
                timestamp, data_hora, tipo_mensagem, texto_mensagem, processado_mineracao, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
              ON CONFLICT(message_id) DO UPDATE SET
                texto_mensagem = excluded.texto_mensagem,
                nome_contato = COALESCE(excluded.nome_contato, compras_historico_mensagens.nome_contato)
            `).run(
              crypto.randomUUID(),
              messageId,
              remoteJid,
              phone,
              contactName,
              fromMe,
              timestamp,
              dateStr,
              mediaType,
              text,
              dateStr
            );

            // Se for mensagem recebida (não enviada por nós), envia para o radar de mineração
            if (!fromMe && text) {
              const comprasMineracaoService = require('./services/compras-mineracao.service');
              await comprasMineracaoService.processarMensagemRecebida({
                messageId,
                remoteJid,
                phone,
                contactName,
                text,
                mediaType,
                timestamp
              }, savedDb);
            }
          } catch (dbErr) {
            console.error('[Baileys-Compras] Erro ao gravar mensagem no SQLite:', dbErr.message);
          }
        }
      } catch (err) {
        console.error('[Baileys-Compras] Erro no processamento de messages.upsert:', err.message);
      }
    });

  } catch (err) {
    isConnecting = false;
    isConnected  = false;
    lastError    = err.message;
    console.error('[Baileys-Compras] ❌ Falha crítica ao inicializar Baileys Compras:', err.message);
  }
}

/**
 * Formata telefone/JID para o padrão do WhatsApp
 */
function formatJid(phoneOrJid) {
  if (!phoneOrJid) throw new Error('Destinatário não especificado.');
  let jid = String(phoneOrJid).trim();
  if (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@g.us')) {
    return jid;
  }
  const clean = jid.replace(/\D/g, '');
  if (clean.length < 8) throw new Error(`Número inválido para envio WhatsApp: "${phoneOrJid}"`);
  return `${clean}@s.whatsapp.net`;
}

/**
 * DISCONNECT — Encerra a conexão e desliga o socket.
 */
async function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      await sock.logout().catch(() => {});
      sock.end();
    } catch (e) {
      // Ignora erro de fechamento
    }
    sock = null;
  }
  isConnected    = false;
  isConnecting   = false;
  lastQR         = null;
  connectedPhone = null;
  console.log('[Baileys-Compras] 🔌 Desconectado e liberado.');
}

/**
 * RECONNECT / RESET — Apaga a pasta de sessão e força novo QR Code limpo.
 */
async function reconnect(db) {
  await disconnect();
  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      console.log('[Baileys-Compras] 🧹 Pasta de sessão excluída para reset completo.');
    }
  } catch (e) {
    console.warn('[Baileys-Compras] Aviso ao remover pasta de sessão:', e.message);
  }
  await connect(db || savedDb);
}

/**
 * GET STATUS — Retorna o estado atual da conexão comercial.
 */
function getStatus() {
  let statusStr = 'disconnected';
  if (isConnected) statusStr = 'connected';
  else if (isConnecting) statusStr = 'connecting';
  else if (lastQR) statusStr = 'qr_ready';

  return {
    status: statusStr,
    connected: isConnected,
    connecting: isConnecting,
    hasQR: !!lastQR,
    qrCode: lastQR,
    phone: connectedPhone,
    error: lastError,
    sessionDir: SESSION_DIR
  };
}

/**
 * Alias padronizado do PROJECT.md
 */
function getComprasConnectionStatus() {
  return getStatus();
}

/**
 * Inicializador padronizado do PROJECT.md
 */
async function initComprasBaileys(db) {
  return connect(db);
}

/**
 * SEND TEXT — Envia mensagem de texto para representante.
 * NOTA: Esta função só deve ser chamada após aprovação na fila.
 */
async function sendTextMessage(phoneOrJid, text) {
  if (!isConnected || !sock) {
    throw new Error('Instância do WhatsApp Comercial de Compras não está conectada.');
  }
  if (!text || !text.trim()) {
    throw new Error('Conteúdo da mensagem não pode ser vazio.');
  }

  const jid = formatJid(phoneOrJid);
  const result = await sock.sendMessage(jid, { text });
  const msgId = result?.key?.id || `sent_${Date.now()}`;
  console.log(`[Baileys-Compras] 📤 Mensagem enviada para ${jid} (ID: ${msgId})`);
  return {
    success: true,
    messageId: msgId,
    timestamp: new Date().toISOString(),
    jid
  };
}

/**
 * SEND MEDIA — Envia mídia (imagem, tabela, PDF) para fornecedor.
 */
async function sendMediaMessage(phoneOrJid, mediaPath, caption = '') {
  if (!isConnected || !sock) {
    throw new Error('Instância do WhatsApp Comercial de Compras não está conectada.');
  }
  if (!fs.existsSync(mediaPath)) {
    throw new Error(`Arquivo de mídia não encontrado: ${mediaPath}`);
  }

  const jid = formatJid(phoneOrJid);
  const buffer = fs.readFileSync(mediaPath);
  const ext = path.extname(mediaPath).toLowerCase();
  
  let payload = {};
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    payload = {
      image: buffer,
      caption: caption || undefined,
      mimetype: ext === '.png' ? 'image/png' : 'image/jpeg'
    };
  } else {
    payload = {
      document: buffer,
      mimetype: ext === '.pdf' ? 'application/pdf' : 'application/octet-stream',
      fileName: path.basename(mediaPath),
      caption: caption || undefined
    };
  }

  const result = await sock.sendMessage(jid, payload);
  const msgId = result?.key?.id || `sent_media_${Date.now()}`;
  console.log(`[Baileys-Compras] 📤 Mídia enviada para ${jid} (ID: ${msgId})`);
  return {
    success: true,
    messageId: msgId,
    timestamp: new Date().toISOString(),
    jid
  };
}

/**
 * ENVIAR MENSAGEM APROVADA — Envia uma mensagem da fila `compras_fila_aprovacao`
 * com checagem de aprovação obrigatória.
 * @param {string} approvalId 
 * @param {object} db 
 */
async function enviarMensagemAprovada(approvalId, db) {
  const database = db || savedDb;
  if (!database) throw new Error('Instância do banco SQLite não fornecida.');

  const item = database.prepare('SELECT * FROM compras_fila_aprovacao WHERE id = ?').get(approvalId);
  if (!item) {
    throw new Error(`Item de aprovação "${approvalId}" não encontrado.`);
  }

  const st = (item.status || '').toLowerCase();
  if (st !== 'aprovado' && st !== 'editado_enviado') {
    throw new Error(`Não é permitido enviar mensagem com status "${item.status}". Apenas itens com status "aprovado" podem ser despachados.`);
  }

  // Dispara o envio via socket
  const sendResult = await sendTextMessage(item.destinatario_telefone, item.mensagem_texto);

  // Atualiza status na fila de aprovação
  const nowIso = new Date().toISOString();
  database.prepare(`
    UPDATE compras_fila_aprovacao
    SET status = 'enviado',
        message_id_enviada = ?,
        updated_at = ?
    WHERE id = ?
  `).run(sendResult.messageId, nowIso, approvalId);

  // Registra no histórico de mensagens de compras
  try {
    database.prepare(`
      INSERT INTO compras_historico_mensagens (
        id, message_id, remote_jid, telefone, nome_contato, from_me,
        timestamp, data_hora, tipo_mensagem, texto_mensagem, processado_mineracao, created_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'texto', ?, 1, ?)
    `).run(
      crypto.randomUUID(),
      sendResult.messageId,
      sendResult.jid,
      item.destinatario_telefone,
      item.destinatario_nome,
      Date.now(),
      nowIso,
      item.mensagem_texto,
      nowIso
    );
  } catch (histErr) {
    console.warn('[Baileys-Compras] Aviso ao gravar histórico de mensagem enviada:', histErr.message);
  }

  return {
    success: true,
    messageId: sendResult.messageId,
    timestamp: nowIso
  };
}

/**
 * MINERAR HISTÓRICO CONVERSAS — Dispara a varredura do histórico de compras.
 */
async function minerarHistoricoConversas(options = {}) {
  const comprasMineracaoService = require('./services/compras-mineracao.service');
  return comprasMineracaoService.minerarHistoricoConversas(savedDb, options);
}

module.exports = {
  connect,
  initComprasBaileys,
  disconnect,
  reconnect,
  getStatus,
  getComprasConnectionStatus,
  sendTextMessage,
  sendMediaMessage,
  enviarMensagemAprovada,
  minerarHistoricoConversas,
  SESSION_DIR
};
