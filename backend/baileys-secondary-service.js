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

// Inicialização lazy do Baileys
let makeWASocket, useMultiFileAuthState, DisconnectReason, Boom, downloadMediaMessage;

function loadBaileys() {
  try {
    const baileys = require('@whiskeysockets/baileys');
    makeWASocket       = baileys.default || baileys.makeWASocket || baileys;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    DisconnectReason   = baileys.DisconnectReason;
    downloadMediaMessage = baileys.downloadMediaMessage;
    Boom               = require('@hapi/boom');
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
  if (isConnecting) return;
  if (!loadBaileys()) return;

  isConnecting = true;
  lastError    = null;

  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: ['BelaFarma Secundario', 'Chrome', '120.0'],
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 2000,
      logger: { level: 'silent',
        trace: () => {}, debug: () => {}, info: () => {},
        warn:  (m) => console.warn('[Baileys-Sec-internal]', m),
        error: (m) => console.error('[Baileys-Sec-internal]', m),
        fatal: (m) => console.error('[Baileys-Sec-internal FATAL]', m),
        child: () => ({ trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{} })
      }
    });

    // Eventos de credenciais
    sock.ev.on('creds.update', saveCreds);

    // Eventos de conexão e QR Code
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        lastQR = qr;
        isConnected = false;
        console.log('[Baileys-Secondary] 📲 QR Code gerado! Escaneie pelo WhatsApp Secundário.');
        try {
          const QRCode = require('qrcode');
          lastQR = await QRCode.toDataURL(qr);
        } catch (e) {
          lastQR = qr;
        }
      }

      if (connection === 'open') {
        isConnected  = true;
        isConnecting = false;
        lastQR       = null;
        lastError    = null;
        console.log('[Baileys-Secondary] ✅ WhatsApp Secundário conectado com sucesso!');
      }

      if (connection === 'close') {
        isConnected  = false;
        isConnecting = false;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'desconhecido';

        if (statusCode === DisconnectReason?.loggedOut) {
          console.warn('[Baileys-Secondary] ⚠️ Sessão secundária encerrada (logout). Apagando dados...');
          try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch(e) {}
          lastError = 'Sessão encerrada. Escaneie o QR Code novamente.';
          reconnectTimer = setTimeout(() => connect(db), 5000);
          return;
        }

        console.warn(`[Baileys-Secondary] 🔄 Desconectado (${statusCode} - ${reason}). Reconectando em 8s...`);
        lastError = `Desconectado: ${reason}`;
        reconnectTimer = setTimeout(() => connect(db), 8000);
      }
    });

    // Evento de mensagens recebidas (Exclusivo para o Robô de Etiquetas)
    if (db) {
      const LabelBotService = require('./services/label-bot.service.js');
      const labelBot = new LabelBotService(db);

      sock.ev.on('messages.upsert', async (m) => {
        try {
          if (m.type !== 'notify') return;
          const msg = m.messages[0];
          if (!msg.message || msg.key.fromMe) return;

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
          const isPriceResponse = cleanText.startsWith('preço') || cleanText.startsWith('preco');
          const isLabelTrigger = cleanText.startsWith('etiqueta') || 
                                 cleanText.startsWith('#etiqueta') || 
                                 cleanText.startsWith('etq') || 
                                 cleanText.startsWith('criar etiqueta') || 
                                 cleanText.startsWith('gerar etiqueta') || 
                                 cleanText.startsWith('imprimir etiqueta') ||
                                 isPriceResponse;

          const isImage = messageType === 'imageMessage' || 
                         (messageType === 'documentMessage' && msg.message.documentMessage.mimetype.startsWith('image/')) ||
                         (messageType === 'documentWithCaptionMessage' && msg.message.documentWithCaptionMessage.message?.documentMessage?.mimetype?.startsWith('image/'));

          const isAudio = messageType === 'audioMessage';

          // 🎙️ FLUXO DE ÁUDIO (ETIQUETAS)
          if (isAudio) {
            console.log(`[Baileys-Secondary] 🎙️ Áudio recebido de ${phone}. Processando com LabelBot...`);
            const buffer = await downloadMediaMessage(
              msg,
              'buffer',
              { },
              { 
                logger: sock.logger,
                reuploadRequest: sock.updateMediaMessage
              }
            );

            const result = await labelBot.processWhatsAppInput({
              phone,
              audioBuffer: buffer
            });

            if (result && result.replyText) {
              await sock.sendMessage(remoteJid, { text: result.replyText });
            }
          }
          // 📸 FLUXO DE IMAGEM (ETIQUETAS)
          else if (isImage) {
            console.log(`[Baileys-Secondary] 📸 Imagem recebida de ${phone}. Enviando ao LabelBot...`);
            const buffer = await downloadMediaMessage(
              msg,
              'buffer',
              { },
              { 
                logger: sock.logger,
                reuploadRequest: sock.updateMediaMessage
              }
            );

            const base64Image = buffer.toString('base64');
            const mimeType = msg.message?.imageMessage?.mimetype || 
                            msg.message?.documentMessage?.mimetype || 
                            'image/jpeg';

            const result = await labelBot.processWhatsAppInput({
              phone,
              imageBase64: base64Image,
              imageMime: mimeType,
              text: text
            });

            if (result && result.replyText) {
              await sock.sendMessage(remoteJid, { text: result.replyText });
            }
          }
          // 💬 FLUXO DE TEXTO (ETIQUETAS)
          else if (isLabelTrigger) {
            console.log(`[Baileys-Secondary] 💬 Texto de etiqueta de ${phone}. Enviando ao LabelBot...`);
            const result = await labelBot.processWhatsAppInput({
              phone,
              text: text
            });

            if (result && result.replyText) {
              await sock.sendMessage(remoteJid, { text: result.replyText });
            }
          }
        } catch (err) {
          console.error('[Baileys-Secondary] Erro ao processar mensagem recebida:', err.message);
        }
      });
    }

  } catch (err) {
    isConnecting = false;
    lastError    = err.message;
    console.error('[Baileys-Secondary] ❌ Erro ao iniciar:', err.message);
    reconnectTimer = setTimeout(() => connect(db), 10000);
  }
}

// ──────────────────────────────────────────────────────────
// DISCONNECT — encerra a conexão manualmente
// ──────────────────────────────────────────────────────────
async function disconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (sock) {
    try { await sock.logout(); } catch(e) {}
    sock = null;
  }
  isConnected  = false;
  isConnecting = false;
  console.log('[Baileys-Secondary] 🔌 Desconectado manualmente.');
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
