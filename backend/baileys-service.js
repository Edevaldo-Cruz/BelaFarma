/**
 * baileys-service.js
 * Serviço de integração WhatsApp via Baileys (sem browser, sem Puppeteer).
 * Conecta diretamente ao protocolo do WhatsApp como um segundo aparelho.
 * Salva a sessão em disco para reconectar automaticamente.
 */

const path = require('path');
const fs   = require('fs');

// Diretório persistente da sessão (volume Docker em produção)
const SESSION_DIR = process.platform === 'win32'
  ? path.join(__dirname, 'baileys-session')
  : path.join(__dirname, '..', 'data', 'baileys-session');

// Estado interno do serviço
let sock          = null;   // Socket Baileys ativo
let isConnected   = false;  // true quando autenticado e pronto
let isConnecting  = false;  // true durante inicialização
let lastQR        = null;   // Último QR Code em base64 (para exibir na interface)
let lastError     = null;   // Último erro registrado
let reconnectTimer = null;  // Timer de reconexão

// ──────────────────────────────────────────────────────────
// Inicialização lazy: carrega o Baileys somente quando
// o módulo já foi instalado (evita crash se faltou npm install)
// ──────────────────────────────────────────────────────────
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
    console.error('[Baileys] ❌ Módulo @whiskeysockets/baileys não encontrado:', e.message);
    console.error('[Baileys] Execute: npm install @whiskeysockets/baileys qrcode');
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
      printQRInTerminal: true,       // Imprime QR no log do Docker tb
      browser: ['BelaFarma', 'Chrome', '120.0'],
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 2000,
      logger: { level: 'silent',     // Silencia logs verbosos do Baileys
        trace: () => {}, debug: () => {}, info: () => {},
        warn:  (m) => console.warn('[Baileys-internal]', m),
        error: (m) => console.error('[Baileys-internal]', m),
        fatal: (m) => console.error('[Baileys-internal FATAL]', m),
        child: () => ({ trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{} })
      }
    });

    // ── Eventos de credenciais ──────────────────────────
    sock.ev.on('creds.update', saveCreds);

    // ── QR Code ────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        lastQR = qr;
        isConnected = false;
        console.log('[Baileys] 📲 QR Code gerado! Escaneie pelo WhatsApp → Aparelhos Conectados.');
        // Gera também como imagem base64 para a interface web
        try {
          const QRCode = require('qrcode');
          lastQR = await QRCode.toDataURL(qr);
        } catch (e) {
          lastQR = qr; // Fallback: string raw
        }
      }

      if (connection === 'open') {
        isConnected  = true;
        isConnecting = false;
        lastQR       = null;
        lastError    = null;
        console.log('[Baileys] ✅ Conectado ao WhatsApp com sucesso!');
      }

      if (connection === 'close') {
        isConnected  = false;
        isConnecting = false;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'desconhecido';

        // Logout explícito = sessão inválida, apaga e para
        if (statusCode === DisconnectReason?.loggedOut) {
          console.warn('[Baileys] ⚠️ Sessão encerrada (logout). Apagando sessão salva...');
          try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch(e) {}
          lastError = 'Sessão encerrada. Escaneie o QR Code novamente.';
          // Reconecta para gerar novo QR
          reconnectTimer = setTimeout(connect, 5000);
          return;
        }

        console.warn(`[Baileys] 🔄 Desconectado (${statusCode} - ${reason}). Reconectando em 8s...`);
        lastError = `Desconectado: ${reason}`;
        reconnectTimer = setTimeout(connect, 8000);
      }
      }
    });

    // ── Mensagens (Integração PixBot) ──────────────────────
    if (db) {
      const PixBotService = require('./services/pix-bot.service.js');
      const pixBot = new PixBotService(db);

      sock.ev.on('messages.upsert', async (m) => {
        try {
          if (m.type !== 'notify') return;
          const msg = m.messages[0];
          if (!msg.message || msg.key.fromMe) return;

          const remoteJid = msg.key.remoteJid;
          if (remoteJid.endsWith('@g.us')) return; // Ignora mensagens de grupos

          const phone = remoteJid.split('@')[0];
          const messageType = Object.keys(msg.message)[0];
          
          // Verifica se é imagem ou documento com imagem
          const isImage = messageType === 'imageMessage' || 
                         (messageType === 'documentMessage' && msg.message.documentMessage.mimetype.startsWith('image/')) ||
                         (messageType === 'documentWithCaptionMessage' && msg.message.documentWithCaptionMessage.message?.documentMessage?.mimetype?.startsWith('image/'));

          if (isImage) {
            console.log(`[Baileys] 📸 Imagem recebida de ${phone}. Repassando ao PixBot...`);
            
            // Baixa a mídia usando o método nativo do Baileys
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
            
            await pixBot.processBaileysImage(base64Image, mimeType, phone, msg.key.id);
          }
        } catch (err) {
          console.error('[Baileys] Erro ao processar mensagem recebida:', err.message);
        }
      });
    }

  } catch (err) {
    isConnecting = false;
    lastError    = err.message;
    console.error('[Baileys] ❌ Erro ao iniciar:', err.message);
    reconnectTimer = setTimeout(connect, 10000);
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
  console.log('[Baileys] 🔌 Desconectado manualmente.');
}

// ──────────────────────────────────────────────────────────
// STATUS — retorna o estado atual do serviço
// ──────────────────────────────────────────────────────────
function getStatus() {
  return {
    connected:   isConnected,
    connecting:  isConnecting,
    hasQR:       !!lastQR,
    qrCode:      lastQR,       // base64 data URL da imagem do QR
    error:       lastError,
    sessionDir:  SESSION_DIR
  };
}

// ──────────────────────────────────────────────────────────
// Resolve o JID (ID do WhatsApp) de um grupo pelo nome
// Busca entre os grupos que o número conectado participa
// ──────────────────────────────────────────────────────────
async function resolveGroupJid(groupName) {
  if (!sock || !isConnected) throw new Error('Baileys não conectado.');

  const groups = await sock.groupFetchAllParticipating();
  const entries = Object.values(groups);

  // Busca exata primeiro, depois parcial (case-insensitive)
  const exact = entries.find(g => g.subject === groupName);
  if (exact) return exact.id;

  const partial = entries.find(g =>
    g.subject.toLowerCase().includes(groupName.toLowerCase()) ||
    groupName.toLowerCase().includes(g.subject.toLowerCase())
  );
  if (partial) return partial.id;

  // Lista os grupos disponíveis para facilitar diagnóstico
  const available = entries.map(g => `"${g.subject}"`).join(', ');
  throw new Error(`Grupo "${groupName}" não encontrado. Grupos disponíveis: ${available}`);
}

// ──────────────────────────────────────────────────────────
// SEND TEXT — envia mensagem de texto para um grupo
// ──────────────────────────────────────────────────────────
async function sendTextToGroup(groupName, text) {
  if (!isConnected || !sock) {
    throw new Error('Baileys não está conectado ao WhatsApp.');
  }

  const jid = await resolveGroupJid(groupName);
  await sock.sendMessage(jid, { text });
  console.log(`[Baileys] ✅ Texto enviado para "${groupName}" (${jid})`);
  return { success: true, jid };
}

// ──────────────────────────────────────────────────────────
// SEND IMAGE — envia imagem com legenda para um grupo
// ──────────────────────────────────────────────────────────
async function sendImageToGroup(groupName, imagePath, caption = '') {
  if (!isConnected || !sock) {
    throw new Error('Baileys não está conectado ao WhatsApp.');
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Imagem não encontrada: ${imagePath}`);
  }

  const jid = await resolveGroupJid(groupName);
  const imageBuffer = fs.readFileSync(imagePath);

  await sock.sendMessage(jid, {
    image: imageBuffer,
    caption: caption || undefined,
    mimetype: imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  });

  console.log(`[Baileys] ✅ Imagem enviada para "${groupName}" (${jid})`);
  return { success: true, jid };
}

// ──────────────────────────────────────────────────────────
// LISTAR GRUPOS — retorna todos os grupos que o número participa
// ──────────────────────────────────────────────────────────
async function listGroups() {
  if (!isConnected || !sock) {
    throw new Error('Baileys não está conectado.');
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
