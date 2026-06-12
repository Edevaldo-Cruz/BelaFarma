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
  : path.join(__dirname, 'data', 'baileys-session');

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

        // --- Verificação de nova conexão para importação de histórico ---
        if (db && sock && sock.user && sock.user.id) {
          try {
            const myPhone = sock.user.id.split(':')[0].split('@')[0];
            let lastPhone = null;
            const row = db.prepare("SELECT value FROM system_settings WHERE key = ?").get("baileys_last_phone");
            if (row) {
              lastPhone = row.value;
            }
            
            console.log(`[Baileys] Número conectado: ${myPhone}. Último número registrado: ${lastPhone}`);
            
            if (!lastPhone || lastPhone !== myPhone) {
              console.log(`[Baileys] 🆕 Nova conexão detectada (ou nova sessão)! Ativando importação das últimas 10 conversas...`);
              sock.importHistory = true;
              
              const now = new Date().toISOString();
              if (row) {
                db.prepare("UPDATE system_settings SET value = ?, updated_at = ? WHERE key = ?").run(myPhone, now, "baileys_last_phone");
              } else {
                db.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)").run("baileys_last_phone", myPhone, now);
              }
            } else {
              console.log(`[Baileys] Conexão mantida com o mesmo número (${myPhone}). Não importa o histórico.`);
              sock.importHistory = false;
            }
          } catch (err) {
            console.error('[Baileys] Erro ao gerenciar baileys_last_phone:', err.message);
          }
        }
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
    });

    // ── Mensagens (Integração PixBot & LabelBot) ──────────────────────
    if (db) {
      const PixBotService = require('./services/pix-bot.service.js');
      const pixBot = new PixBotService(db);

      const LabelBotService = require('./services/label-bot.service.js');
      const labelBot = new LabelBotService(db);

      // ── Histórico de mensagens (Importação em nova conexão) ────────────
      sock.ev.on('messaging-history.set', async (history) => {
        if (!sock.importHistory) {
          console.log('[Baileys] Histórico recebido, mas não é uma nova conexão. Ignorando importação de histórico antigo.');
          return;
        }

        const { messages } = history;
        if (!messages || messages.length === 0) {
          console.log('[Baileys] Nenhum histórico de mensagens recebido.');
          return;
        }

        console.log(`[Baileys] Processando histórico para nova conexão. Total de mensagens no histórico: ${messages.length}`);

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
        console.log(`[Baileys] Salvando histórico dos ${recentChats.length} chats mais recentes no SQLite...`);

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

        console.log(`[Baileys] Importação de histórico concluída: ${recentChats.length} chats e ${totalSaved} mensagens gravadas.`);
        
        // Desativar a flag para não importar novamente nesta sessão
        sock.importHistory = false;
      });

      sock.ev.on('messages.upsert', async (m) => {
        try {
          console.log(`[Baileys] 📨 messages.upsert: tipo=${m.type}, msgId=${m.messages?.[0]?.key?.id}, fromMe=${m.messages?.[0]?.key?.fromMe}`);
          if (m.type !== 'notify') return;
          const msg = m.messages[0];
          if (!msg.message) return;

          const remoteJid = msg.key.remoteJid;
          if (remoteJid.endsWith('@g.us')) return; // Ignora mensagens de grupos

          const phone = remoteJid.split('@')[0];
          const messageType = Object.keys(msg.message)[0];
          
          // 1. Extração de Texto
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
              console.warn('[Baileys] Falha ao salvar mensagem no SQLite:', dbErr.message);
            }
          }

          // Se a mensagem foi enviada por nós (fromMe), não processa para PixBot/LabelBot
          if (msg.key.fromMe) return;

          const isLabelTrigger = cleanText.startsWith('etiqueta') || 
                                 cleanText.startsWith('#etiqueta') || 
                                 cleanText.startsWith('etq') || 
                                 cleanText.startsWith('criar etiqueta') || 
                                 cleanText.startsWith('gerar etiqueta') || 
                                 cleanText.startsWith('imprimir etiqueta');

          // Verifica se é imagem ou documento com imagem
          const isImage = !!(
            messageType === 'imageMessage' || 
            (messageType === 'documentMessage' && msg.message.documentMessage?.mimetype?.startsWith('image/')) ||
            (messageType === 'documentWithCaptionMessage' && msg.message.documentWithCaptionMessage?.message?.documentMessage?.mimetype?.startsWith('image/')) ||
            Object.keys(msg.message || {}).some(key => key.endsWith('Message') && msg.message[key]?.mimetype?.startsWith('image/'))
          );

          const isAudio = messageType === 'audioMessage';

          // ── FLUXO DE ÁUDIO ──────────────────────────────────
          if (isAudio) {
            console.log(`[Baileys] 🎙️ Áudio recebido de ${phone}. Baixando mídia...`);
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
          // ── FLUXO DE IMAGEM ─────────────────────────────────
          else if (isImage) {
            console.log(`[Baileys] 📸 Imagem recebida de ${phone}. Analisando...`);
            
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
            
            // Se tiver legenda contendo gatilho de etiqueta
            if (isLabelTrigger) {
              console.log(`[Baileys] 🏷️ Legenda explícita de etiqueta detectada. Roteando para LabelBot...`);
              const result = await labelBot.processWhatsAppInput({
                phone,
                imageBase64: base64Image,
                imageMime: mimeType,
                text: text
              });
              if (result && result.replyText) {
                await sock.sendMessage(remoteJid, { text: result.replyText });
              }
            } else {
              // Caso contrário, tenta o PixBot primeiro
              console.log(`[Baileys] 🔍 Tentando auditoria PIX via PixBot...`);
              const isPix = await pixBot.processBaileysImage(base64Image, mimeType, phone, msg.key.id);
              
              // Se não for um PIX, faz o fallback automático para o LabelBot!
              if (isPix === false) {
                console.log(`[Baileys] 🏷️ Não é comprovante PIX. Fazendo fallback de imagem para o LabelBot...`);
                const result = await labelBot.processWhatsAppInput({
                  phone,
                  imageBase64: base64Image,
                  imageMime: mimeType
                });
                if (result && result.replyText) {
                  await sock.sendMessage(remoteJid, { text: result.replyText });
                }
              }
            }
          }
          // ── FLUXO DE TEXTO ──────────────────────────────────
          else if (isLabelTrigger) {
            console.log(`[Baileys] 💬 Texto de gatilho de etiqueta recebido de ${phone}. Enviando ao LabelBot...`);
            const result = await labelBot.processWhatsAppInput({
              phone,
              text: text
            });
            if (result && result.replyText) {
              await sock.sendMessage(remoteJid, { text: result.replyText });
            }
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

// ──────────────────────────────────────────────────────────
// SEND STATUS — posta no status do WhatsApp (My Status)
// ──────────────────────────────────────────────────────────
async function sendStatus(imagePath, caption = '') {
  if (!isConnected || !sock) {
    throw new Error('Baileys não está conectado ao WhatsApp.');
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Imagem não encontrada: ${imagePath}`);
  }

  const imageBuffer = fs.readFileSync(imagePath);

  // Enviar para o status@broadcast
  await sock.sendMessage('status@broadcast', {
    image: imageBuffer,
    caption: caption || undefined,
    mimetype: imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  }, {
    statusJidList: [
      // Envia para o próprio número também para aparecer no celular
      sock.user.id.split(':')[0] + '@s.whatsapp.net'
    ]
  });

  console.log(`[Baileys] ✅ Status postado com sucesso.`);
  return { success: true };
}

// ──────────────────────────────────────────────────────────
// SEND TEXT — envia mensagem de texto para qualquer número de contato
// ──────────────────────────────────────────────────────────
async function sendText(phoneOrJid, text) {
  if (!isConnected || !sock) {
    throw new Error('Baileys não está conectado ao WhatsApp.');
  }

  let jid = phoneOrJid;
  if (!jid.endsWith('@g.us') && !jid.endsWith('@s.whatsapp.net')) {
    const cleanNum = phoneOrJid.replace(/\D/g, '');
    jid = `${cleanNum}@s.whatsapp.net`;
  }

  await sock.sendMessage(jid, { text });
  console.log(`[Baileys] ✅ Mensagem de texto enviada para ${phoneOrJid} (${jid})`);
  return { success: true, jid };
}

module.exports = {
  connect,
  disconnect,
  getStatus,
  sendTextToGroup,
  sendImageToGroup,
  sendStatus,
  listGroups,
  sendText
};
