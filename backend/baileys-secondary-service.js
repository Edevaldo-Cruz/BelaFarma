/**
 * baileys-secondary-service.js
 * Serviço de integração WhatsApp Secundário via Baileys.
 * Destinado ao uso interno (Robô de Etiquetas e envios/automações futuras).
 * Mantém sessão e conexões 100% isoladas do WhatsApp Principal.
 */

const path = require('path');
const fs   = require('fs');

// Diretório persistente da sessão (volume Docker em produção)
const SESSION_DIR = process.platform === 'win32'
  ? path.join(__dirname, 'baileys-session-secondary')
  : path.join(__dirname, 'data', 'baileys-session-secondary');

// Estado interno do serviço
let sock          = null;   // Socket Baileys ativo
let isConnected   = false;  // true quando autenticado e pronto
let isConnecting  = false;  // true durante inicialização
let lastQR        = null;   // Último QR Code em base64 (para exibir na interface)
let lastError     = null;   // Último erro registrado
let reconnectTimer = null;  // Timer de reconexão
let savedDb       = null;   // Referência salva do banco de dados

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
    console.error('[Baileys-Secondary] ❌ Módulo @whiskeysockets/baileys não encontrado:', e.message);
    return false;
  }
}

// ──────────────────────────────────────────────────────────
// CONNECT — inicia ou reconecta a sessão
// ──────────────────────────────────────────────────────────
async function connect(db) {
  if (db) savedDb = db;
  if (isConnecting) {
    console.log('[Baileys-Secondary] Conexão já em andamento...');
    return;
  }
  if (!loadBaileys()) return;

  isConnecting = true;
  // NÃO limpa lastError aqui — mantém visível até QR gerado ou conexão aberta
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
        console.log(`[Baileys-Secondary] 🌐 Versão do WhatsApp Web obtida: v${version.join('.')}`);
      } catch (verErr) {
        console.warn('[Baileys-Secondary] Não foi possível buscar versão mais recente do WA Web, usando fallback:', verErr.message);
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
        warn:  (...m) => console.warn('[Baileys-Sec-internal WARN]', ...m),
        error: (...m) => console.error('[Baileys-Sec-internal ERROR]', ...m),
        fatal: (...m) => console.error('[Baileys-Sec-internal FATAL]', ...m),
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
        isConnecting = false; // Libera a trava — já temos um socket ativo esperando scan
        lastError    = null;  // Limpa erro anterior — QR foi gerado com sucesso
        console.log('[Baileys-Secondary] 📲 QR Code gerado! Escaneie pelo WhatsApp Secundário.');
        lastQR = qr;
        try {
          const QRCode = require('qrcode');
          const dataUrl = await QRCode.toDataURL(qr);
          // Só substitui se o QR atual ainda é o mesmo (evita race condition)
          if (lastQR === qr) {
            lastQR = dataUrl;
          }
        } catch (e) {
          console.warn('[Baileys-Secondary] Falha ao converter QR para base64, usando raw:', e.message);
        }
      }

      if (connection === 'open') {
        isConnected  = true;
        isConnecting = false;
        lastQR       = null;
        lastError    = null;
        console.log('[Baileys-Secondary] ✅ WhatsApp Secundário conectado com sucesso!');

        // --- Verificação de nova conexão para importação de histórico ---
        if (db && sock && sock.user && sock.user.id) {
          try {
            const myPhone = sock.user.id.split(':')[0].split('@')[0];
            let lastPhone = null;
            const row = db.prepare("SELECT value FROM system_settings WHERE key = ?").get("baileys_secondary_last_phone");
            if (row) {
              lastPhone = row.value;
            }
            
            console.log(`[Baileys-Secondary] Número conectado: ${myPhone}. Último número registrado: ${lastPhone}`);
            
            if (!lastPhone || lastPhone !== myPhone) {
              console.log(`[Baileys-Secondary] 🆕 Nova conexão detectada (ou nova sessão)! Ativando importação das últimas 10 conversas...`);
              sock.importHistory = true;
              
              const now = new Date().toISOString();
              if (row) {
                db.prepare("UPDATE system_settings SET value = ?, updated_at = ? WHERE key = ?").run(myPhone, now, "baileys_secondary_last_phone");
              } else {
                db.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)").run("baileys_secondary_last_phone", myPhone, now);
              }
            } else {
              console.log(`[Baileys-Secondary] Conexão mantida com o mesmo número (${myPhone}). Não importa o histórico.`);
              sock.importHistory = false;
            }
          } catch (err) {
            console.error('[Baileys-Secondary] Erro ao gerenciar baileys_secondary_last_phone:', err.message);
          }
        }
      }

      if (connection === 'close') {
        isConnected  = false;
        isConnecting = false;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || String(lastDisconnect?.error || 'desconhecido');

        console.warn(`[Baileys-Secondary] ⚠️ Conexão fechada. Código: ${statusCode}, Motivo: ${reason}`);

        // Casos onde a sessão deve ser APAGADA e recriada do zero
        const needsFullReset = statusCode === DisconnectReason?.loggedOut ||
                               statusCode === DisconnectReason?.badSession ||
                               reason.includes('QR refs attempts ended');

        if (needsFullReset) {
          console.warn('[Baileys-Secondary] 🧹 Sessão secundária inválida ou QR expirado completamente. Apagando pasta de sessão...');
          try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch(e) {}
          lastError = `Reset: código ${statusCode} — ${reason}`;
          lastQR = null;
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => connect(savedDb), 4000);
          return;
        }

        // Desconexão temporária — NÃO apaga o QR nem a sessão
        console.warn(`[Baileys-Secondary] 🔄 Desconectado temporariamente (${statusCode} - ${reason}). Reconectando em 5s...`);
        lastError = `Desconectado: ${reason}`;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => connect(savedDb), 5000);
      }
    });

    // Evento de mensagens recebidas
    if (db) {

      // ── Histórico de mensagens (Importação em nova conexão) ────────────
      sock.ev.on('messaging-history.set', async (history) => {
        if (!sock.importHistory) {
          console.log('[Baileys-Secondary] Histórico recebido, mas não é uma nova conexão. Ignorando importação de histórico antigo.');
          return;
        }

        const { messages } = history;
        if (!messages || messages.length === 0) {
          console.log('[Baileys-Secondary] Nenhum histórico de mensagens recebido.');
          return;
        }

        console.log(`[Baileys-Secondary] Processando histórico para nova conexão. Total de mensagens no histórico: ${messages.length}`);

        // Filtrar e agrupar mensagens por remoteJid (ignorando grupos e broadcasts)
        const messagesByJid = {};
        for (const msg of messages) {
          if (!msg.message || !msg.key || !msg.key.remoteJid) continue;
          
          const remoteJid = msg.key.remoteJid;
          if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast') || remoteJid.includes(':')) continue;

          if (!messagesByJid[remoteJid]) {
            messagesByJid[remoteJid] = [];
          }
          messagesByJid[remoteJid].push(msg);
        }

        // Para cada remoteJid, ordenar as mensagens do mais antigo ao mais recente
        const chatsList = [];
        for (const jid in messagesByJid) {
          const chatMsgs = messagesByJid[jid];
          chatMsgs.sort((a, b) => {
            const tsA = a.messageTimestamp || 0;
            const tsB = b.messageTimestamp || 0;
            return tsB - tsA;
          });
          
          chatsList.push({
            jid,
            phone: jid.split('@')[0],
            latestTimestamp: chatMsgs[0].messageTimestamp || 0,
            msgs: chatMsgs
          });
        }

        // Ordenar os chats pelo timestamp mais recente
        chatsList.sort((a, b) => b.latestTimestamp - a.latestTimestamp);

        // Pegar os 10 chats mais recentes
        const recentChats = chatsList.slice(0, 10);
        console.log(`[Baileys-Secondary] Salvando histórico dos ${recentChats.length} chats mais recentes no SQLite...`);

        // Para cada um dos chats selecionados, salvar as últimas 10 mensagens deles
        let totalSaved = 0;
        for (const chat of recentChats) {
          const msgsToSave = chat.msgs.slice(0, 10);
          
          for (const msg of msgsToSave) {
            try {
              const messageType = Object.keys(msg.message)[0];
              let text = null;
              if (messageType === 'conversation') {
                text = msg.message.conversation;
              } else if (messageType === 'extendedTextMessage') {
                text = msg.message.extendedTextMessage.text;
              } else if (messageType === 'imageMessage' && msg.message.imageMessage.caption) {
                text = msg.message.imageMessage.caption;
              } else if (messageType === 'documentWithCaptionMessage' && msg.message.documentWithCaptionMessage.message?.documentMessage?.caption) {
                text = msg.message.documentWithCaptionMessage.message.documentMessage.caption;
              }

              const textContent = text || (messageType === 'audioMessage' ? '[🎙️ Áudio]' : messageType === 'imageMessage' ? '[📷 Imagem]' : '[Outra mídia]');
              const timestampMs = msg.messageTimestamp ? (msg.messageTimestamp * 1000) : Date.now();
              const fromMeVal = msg.key.fromMe ? 1 : 0;

              db.prepare(`
                INSERT OR IGNORE INTO whatsapp_messages (id, phone, fromMe, messageText, timestamp)
                VALUES (?, ?, ?, ?, ?)
              `).run(msg.key.id, chat.phone, fromMeVal, textContent, timestampMs);
              
              totalSaved++;
            } catch (err) {
              // Ignorar erros
            }
          }
        }

        console.log(`[Baileys-Secondary] Importação de histórico concluída: ${recentChats.length} chats e ${totalSaved} mensagens gravadas.`);
        
        // Desativar a flag para não importar novamente nesta sessão
        sock.importHistory = false;
      });

      sock.ev.on('messages.upsert', async (m) => {
        try {
          console.log(`[Baileys-Secondary] 📨 messages.upsert: tipo=${m.type}, msgId=${m.messages?.[0]?.key?.id}, fromMe=${m.messages?.[0]?.key?.fromMe}`);
          if (m.type !== 'notify') return;
          const msg = m.messages[0];
          if (!msg.message) return;

          const remoteJid = msg.key.remoteJid;
          if (remoteJid.endsWith('@g.us')) return; // Ignora mensagens de grupos

          const phone = remoteJid.split('@')[0];
          const messageType = Object.keys(msg.message)[0];
          
          // Extração de texto
          let text = null;
          if (messageType === 'conversation') {
            text = msg.message.conversation;
          } else if (messageType === 'extendedTextMessage') {
            text = msg.message.extendedTextMessage.text;
          } else if (messageType === 'imageMessage' && msg.message.imageMessage.caption) {
            text = msg.message.imageMessage.caption;
          } else if (messageType === 'documentWithCaptionMessage' && msg.message.documentWithCaptionMessage.message?.documentMessage?.caption) {
            text = msg.message.documentWithCaptionMessage.message.documentMessage.caption;
          }

          const cleanText = text ? text.toLowerCase().trim() : '';

          // Salva no SQLite local para a plataforma de vendas (histórico)
          if (db) {
            try {
              const textContent = text || (messageType === 'audioMessage' ? '[🎙️ Áudio]' : messageType === 'imageMessage' ? '[📷 Imagem]' : '[Outra mídia]');
              const timestampMs = msg.messageTimestamp ? (msg.messageTimestamp * 1000) : Date.now();
              const fromMeVal = msg.key.fromMe ? 1 : 0;
              db.prepare(`
                INSERT OR IGNORE INTO whatsapp_messages (id, phone, fromMe, messageText, timestamp)
                VALUES (?, ?, ?, ?, ?)
              `).run(msg.key.id, phone, fromMeVal, textContent, timestampMs);
            } catch (dbErr) {
              console.warn('[Baileys-Secondary] Falha ao salvar mensagem no SQLite:', dbErr.message);
            }
          }


          // Se a mensagem foi enviada por nós (fromMe), não processa
          if (msg.key.fromMe) return;

          // NOVO: Fluxo de Cotações (Quotations)
          const quotationService = require('./services/quotation.service.js');
          await quotationService.processIncomingMessage(db, phone, cleanText, pushName, sock);
        } catch (err) {
          console.error('[Baileys-Secondary] Erro ao processar mensagem recebida:', err.message);
        }
      });
    }

  } catch (err) {
    isConnecting = false;
    lastError    = err.message;
    console.error('[Baileys-Secondary] ❌ Erro ao iniciar:', err.message);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(savedDb), 10000);
  }
}

// ──────────────────────────────────────────────────────────
// DISCONNECT — encerra a conexão manualmente
// ──────────────────────────────────────────────────────────
async function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sock) {
    try { sock.ev.removeAllListeners(); } catch (e) {}
    // Só tenta logout se estava autenticado — evita travar em sessões sem scan
    if (isConnected) {
      try { await sock.logout(); } catch (e) {
        console.warn('[Baileys-Secondary] Erro no logout (ignorado):', e.message);
      }
    }
    try { sock.ws?.close(); } catch (e) {}
    sock = null;
  }
  isConnected  = false;
  isConnecting = false;
  lastQR       = null;
  console.log('[Baileys-Secondary] 🔌 Desconectado manualmente e limpo.');
}

// ──────────────────────────────────────────────────────────
// STATUS — retorna o estado atual do serviço
// ──────────────────────────────────────────────────────────
function getStatus() {
  return {
    connected:   isConnected,
    connecting:  isConnecting,
    hasQR:       !!lastQR,
    qrCode:      lastQR,
    error:       lastError,
    sessionDir:  SESSION_DIR
  };
}

// ──────────────────────────────────────────────────────────
// Resolve o JID de um grupo pelo nome
// ──────────────────────────────────────────────────────────
async function resolveGroupJid(groupName) {
  if (!sock || !isConnected) throw new Error('Baileys Secundário não conectado.');

  const groups = await sock.groupFetchAllParticipating();
  const entries = Object.values(groups);

  const exact = entries.find(g => g.subject === groupName);
  if (exact) return exact.id;

  const partial = entries.find(g =>
    g.subject.toLowerCase().includes(groupName.toLowerCase()) ||
    groupName.toLowerCase().includes(g.subject.toLowerCase())
  );
  if (partial) return partial.id;

  const available = entries.map(g => `"${g.subject}"`).join(', ');
  throw new Error(`Grupo "${groupName}" não encontrado no WhatsApp Secundário. Disponíveis: ${available}`);
}

// ──────────────────────────────────────────────────────────
// SEND TEXT — envia mensagem de texto (para grupos ou contatos)
// ──────────────────────────────────────────────────────────
async function sendTextToGroup(groupNameOrNumber, text) {
  if (!isConnected || !sock) {
    throw new Error('Baileys Secundário não está conectado.');
  }

  let jid = groupNameOrNumber;
  if (!jid.endsWith('@g.us') && !jid.endsWith('@s.whatsapp.net')) {
    // Se for apenas o nome de um grupo, tenta resolver
    if (isNaN(Number(groupNameOrNumber.replace(/\D/g, '')))) {
      jid = await resolveGroupJid(groupNameOrNumber);
    } else {
      // Se for número, formata como JID de contato
      const cleanNum = groupNameOrNumber.replace(/\D/g, '');
      jid = `${cleanNum}@s.whatsapp.net`;
    }
  }

  await sock.sendMessage(jid, { text });
  console.log(`[Baileys-Secondary] ✅ Texto enviado para ${groupNameOrNumber} (${jid})`);
  return { success: true, jid };
}

// ──────────────────────────────────────────────────────────
// SEND IMAGE — envia imagem com legenda (para grupos ou contatos)
// ──────────────────────────────────────────────────────────
async function sendImageToGroup(groupNameOrNumber, imagePath, caption = '') {
  if (!isConnected || !sock) {
    throw new Error('Baileys Secundário não está conectado.');
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Imagem não encontrada: ${imagePath}`);
  }

  let jid = groupNameOrNumber;
  if (!jid.endsWith('@g.us') && !jid.endsWith('@s.whatsapp.net')) {
    if (isNaN(Number(groupNameOrNumber.replace(/\D/g, '')))) {
      jid = await resolveGroupJid(groupNameOrNumber);
    } else {
      const cleanNum = groupNameOrNumber.replace(/\D/g, '');
      jid = `${cleanNum}@s.whatsapp.net`;
    }
  }

  const imageBuffer = fs.readFileSync(imagePath);

  await sock.sendMessage(jid, {
    image: imageBuffer,
    caption: caption || undefined,
    mimetype: imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  });

  console.log(`[Baileys-Secondary] ✅ Imagem enviada para ${groupNameOrNumber} (${jid})`);
  return { success: true, jid };
}

// ──────────────────────────────────────────────────────────
// LISTAR GRUPOS
// ──────────────────────────────────────────────────────────
async function listGroups() {
  if (!isConnected || !sock) {
    throw new Error('Baileys Secundário não está conectado.');
  }
  const groups = await sock.groupFetchAllParticipating();
  return Object.values(groups).map(g => ({
    id: g.id,
    name: g.subject,
    participants: g.participants?.length || 0
  }));
}

module.exports = {
  connect,
  disconnect,
  getStatus,
  sendTextToGroup,
  sendImageToGroup,
  listGroups
};
