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

const incidentTracker = require('./services/incident-tracker.service.js');

// Estado interno do serviço
let sock          = null;   // Socket Baileys ativo
let isConnected   = false;  // true quando autenticado e pronto
let isConnecting  = false;  // true durante inicialização
let lastQR        = null;   // Último QR Code em base64 (para exibir na interface)
let lastError     = null;   // Último erro registrado
let reconnectTimer = null;  // Timer de reconexão
let savedDb       = null;   // Referência salva do banco de dados

// ──────────────────────────────────────────────────────────
// Inicialização lazy: carrega o Baileys somente quando
// o módulo já foi instalado (evita crash se faltou npm install)
// ──────────────────────────────────────────────────────────
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
    console.error('[Baileys] ❌ Módulo @whiskeysockets/baileys não encontrado:', e.message);
    console.error('[Baileys] Execute: npm install @whiskeysockets/baileys qrcode');
    return false;
  }
}

// ──────────────────────────────────────────────────────────
// CONNECT — inicia ou reconecta a sessão
// ──────────────────────────────────────────────────────────
async function connect(db) {
  if (db) savedDb = db;
  if (isConnecting) {
    console.log('[Baileys] Conexão já em andamento...');
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
        console.log(`[Baileys] 🌐 Versão do WhatsApp Web obtida: v${version.join('.')}`);
      } catch (verErr) {
        console.warn('[Baileys] Não foi possível buscar versão mais recente do WA Web, usando fallback:', verErr.message);
      }
    }

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,       // Imprime QR no log do Docker tb
      browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 2000,
      logger: {
        level: 'silent',
        trace: () => {}, debug: () => {}, info: () => {},
        warn:  (...m) => console.warn('[Baileys-internal WARN]', ...m),
        error: (...m) => console.error('[Baileys-internal ERROR]', ...m),
        fatal: (...m) => console.error('[Baileys-internal FATAL]', ...m),
        child: function() { return this; }
      }
    });

    // ── Eventos de credenciais ──────────────────────────
    sock.ev.on('creds.update', saveCreds);

    // ── QR Code ────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        isConnected  = false;
        isConnecting = false; // Libera a trava — já temos um socket ativo esperando scan
        lastError    = null;  // Limpa erro anterior — QR foi gerado com sucesso
        console.log('[Baileys] 📲 QR Code gerado! Escaneie pelo WhatsApp → Aparelhos Conectados.');
        // Gera imagem base64 para a interface web (guarda raw como fallback imediato)
        lastQR = qr;
        try {
          const QRCode = require('qrcode');
          const dataUrl = await QRCode.toDataURL(qr);
          // Só substitui se o QR atual ainda é o mesmo (evita race condition)
          if (lastQR === qr) {
            lastQR = dataUrl;
          }
        } catch (e) {
          // Mantém o QR raw como fallback — será exibido como texto, mas não trava
          console.warn('[Baileys] Falha ao converter QR para base64, usando raw:', e.message);
        }
      }

      if (connection === 'open') {
        isConnected  = true;
        isConnecting = false;
        lastQR       = null;
        lastError    = null;
        console.log('[Baileys] ✅ Conectado ao WhatsApp com sucesso!');
        try { incidentTracker.notifyWhatsappConnect('principal'); } catch(e) {}

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
        const reason = lastDisconnect?.error?.message || String(lastDisconnect?.error || 'desconhecido');

        console.warn(`[Baileys] ⚠️ Conexão fechada. Código: ${statusCode}, Motivo: ${reason}`);

        // Casos onde a sessão deve ser APAGADA e recriada do zero:
        // - loggedOut: usuário desvinculou o aparelho
        // - badSession: sessão corrompida
        // - QR refs attempts ended: todas as 5 tentativas de QR expiraram
        const needsFullReset = statusCode === DisconnectReason?.loggedOut ||
                               statusCode === DisconnectReason?.badSession ||
                               reason.includes('QR refs attempts ended');

        // Notifica o Rastreador de Incidentes
        try {
          incidentTracker.notifyWhatsappDisconnect('principal', statusCode, reason, needsFullReset);
        } catch (e) {}

        if (needsFullReset) {
          console.warn('[Baileys] 🧹 Sessão inválida ou QR expirado completamente. Apagando pasta de sessão para forçar novo QR Code...');
          try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch(e) {}
          lastError = `Reset: código ${statusCode} — ${reason}`;
          lastQR = null;
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => connect(savedDb), 4000);
          return;
        }

        // Desconexão temporária (timeout, rede, etc.) — NÃO apaga o QR nem a sessão
        // O Baileys vai reconectar e o QR que já foi gerado continua disponível
        console.warn(`[Baileys] 🔄 Desconectado temporariamente (${statusCode} - ${reason}). Reconectando em 5s...`);
        lastError = `Desconectado: ${reason}`;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => connect(savedDb), 5000);
      }
    });

    // ── Mensagens (Integração PixBot) ─────────────────────────────────
    if (db) {
      const PixBotService = require('./services/pix-bot.service.js');
      const pixBot = new PixBotService(db);

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

          // Desembrulha mensagens envelopadas (ViewOnce, Ephemeral, DocumentWithCaption, etc.)
          let contentMsg = msg.message;
          if (contentMsg?.viewOnceMessage?.message) contentMsg = contentMsg.viewOnceMessage.message;
          else if (contentMsg?.viewOnceMessageV2?.message) contentMsg = contentMsg.viewOnceMessageV2.message;
          else if (contentMsg?.viewOnceMessageV2Extension?.message) contentMsg = contentMsg.viewOnceMessageV2Extension.message;
          else if (contentMsg?.ephemeralMessage?.message) contentMsg = contentMsg.ephemeralMessage.message;
          else if (contentMsg?.documentWithCaptionMessage?.message) contentMsg = contentMsg.documentWithCaptionMessage.message;

          const messageType = Object.keys(contentMsg)[0] || '';
          
          // 1. Extração de Texto
          let text = null;
          if (messageType === 'conversation') {
            text = contentMsg.conversation;
          } else if (messageType === 'extendedTextMessage') {
            text = contentMsg.extendedTextMessage?.text;
          } else if (messageType === 'imageMessage' && contentMsg.imageMessage?.caption) {
            text = contentMsg.imageMessage.caption;
          } else if (messageType === 'documentMessage' && contentMsg.documentMessage?.caption) {
            text = contentMsg.documentMessage.caption;
          }

          const cleanText = text ? text.toLowerCase().trim() : '';

          // Salva no SQLite local para a plataforma de vendas (histórico)
          if (db) {
            try {
              const textContent = text || (messageType === 'audioMessage' ? '[🎙️ Áudio]' : (messageType === 'imageMessage' || messageType === 'documentMessage') ? '[📷 Mídia]' : '[Outra mídia]');
              const timestampMs = msg.messageTimestamp ? (msg.messageTimestamp * 1000) : Date.now();
              const fromMeVal = msg.key.fromMe ? 1 : 0;
              const rawJson = JSON.stringify(msg);
              db.prepare(`
                INSERT OR REPLACE INTO whatsapp_messages (id, phone, fromMe, messageText, rawMessage, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(msg.key.id, phone, fromMeVal, textContent, rawJson, timestampMs);
            } catch (dbErr) {
              console.warn('[Baileys] Falha ao salvar mensagem no SQLite:', dbErr.message);
            }
          }

          // Se a mensagem foi enviada por nós (fromMe), não processa para PixBot
          if (msg.key.fromMe) return;

          // Verifica se é imagem ou documento de imagem/pdf
          const isImage = !!(
            messageType === 'imageMessage' || 
            (messageType === 'documentMessage' && (
              contentMsg.documentMessage?.mimetype?.startsWith('image/') ||
              contentMsg.documentMessage?.mimetype?.includes('pdf')
            )) ||
            Object.keys(contentMsg || {}).some(key => key.endsWith('Message') && contentMsg[key]?.mimetype?.startsWith('image/'))
          );

          // ── FLUXO DE IMAGEM (AUDITORIA PIX) ──────────────────
          if (isImage) {
            console.log(`[Baileys] 📸 Imagem recebida de ${phone}. Analisando se é PIX...`);
            
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
            const mimeType = contentMsg.imageMessage?.mimetype || 
                            contentMsg.documentMessage?.mimetype || 
                            'image/jpeg';
            
            console.log(`[Baileys] 🔍 Tentando auditoria PIX via PixBot...`);
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
        console.warn('[Baileys] Erro no logout (ignorado):', e.message);
      }
    }
    try { sock.ws?.close(); } catch (e) {}
    sock = null;
  }
  isConnected  = false;
  isConnecting = false;
  lastQR       = null;
  console.log('[Baileys] 🔌 Desconectado manualmente e limpo.');
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
async function sendStatus(imagePath, caption = '', statusJidList = null) {
  if (!isConnected || !sock) {
    throw new Error('Baileys não está conectado ao WhatsApp.');
  }

  let fullPath = imagePath;
  if (!fs.existsSync(fullPath)) {
    const filename = path.basename(imagePath);
    const candidates = [
      path.join(process.cwd(), imagePath),
      path.join(process.cwd(), 'data', 'uploads', filename),
      path.join(process.cwd(), 'uploads', filename),
      path.join(process.cwd(), 'public', 'uploads', filename),
      path.join(__dirname, 'data', 'uploads', filename),
      path.join(__dirname, 'uploads', filename),
      path.join(__dirname, 'public', 'uploads', filename),
      path.join(__dirname, '..', 'data', 'uploads', filename),
      path.join(__dirname, '..', 'uploads', filename),
      path.join(__dirname, '..', 'public', 'uploads', filename)
    ];
    const found = candidates.find(c => fs.existsSync(c));
    if (found) {
      fullPath = found;
    } else {
      throw new Error(`Imagem não encontrada: ${imagePath}`);
    }
  }

  const imageBuffer = fs.readFileSync(fullPath);

  let jidList = [];
  if (statusJidList && Array.isArray(statusJidList) && statusJidList.length > 0) {
    jidList = statusJidList;
  } else {
    // Adiciona o próprio número limpo para aparecer em "Meu Status" no celular
    const rawUser = sock.user?.id || '';
    const cleanOwn = rawUser.replace(/@.*$/, '').replace(/\D/g, '');
    if (cleanOwn.length >= 10) {
      jidList.push(`${cleanOwn}@s.whatsapp.net`);
    }

    // Adiciona contatos salvos no banco de dados
    if (savedDb) {
      try {
        const phones = new Set();

        // 1. Tabela de clientes (customers)
        const custRows = savedDb.prepare(`SELECT phone FROM customers WHERE phone IS NOT NULL AND phone != ''`).all();
        custRows.forEach(r => {
          const c = r.phone.replace(/\D/g, '');
          if (c.length >= 10) phones.add(c);
        });

        // 2. Histórico de mensagens (whatsapp_messages)
        const msgRows = savedDb.prepare(`SELECT DISTINCT phone FROM whatsapp_messages WHERE phone IS NOT NULL AND phone != ''`).all();
        msgRows.forEach(r => {
          const c = r.phone.replace(/\D/g, '');
          if (c.length >= 10) phones.add(c);
        });

        phones.forEach(phoneNum => {
          const jid = `${phoneNum}@s.whatsapp.net`;
          if (!jidList.includes(jid)) jidList.push(jid);
        });
      } catch (e) {
        console.warn('[Baileys] Erro ao carregar contatos para statusJidList:', e.message);
      }
    }
  }

  const options = {
    statusJidList: jidList
  };

  // Enviar para o status@broadcast
  await sock.sendMessage('status@broadcast', {
    image: imageBuffer,
    caption: caption || undefined,
    mimetype: fullPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
  }, options);

  console.log(`[Baileys] ✅ Status postado com sucesso para ${jidList.length} destinatários (${fullPath}).`);
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

async function varrerPixDoDia() {
  if (!isConnected || !sock) {
    throw new Error('WhatsApp Principal não está conectado ao servidor.');
  }

  console.log('[Baileys-PixScan] 🔍 Iniciando varredura retroativa de comprovantes de hoje...');
  const PixBotService = require('./services/pix-bot.service.js');
  const pixBot = new PixBotService(savedDb);

  // Início do dia de hoje (00:00:00 local)
  const now = new Date();
  const startOfDayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDayIso = new Date(startOfDayMs).toISOString();

  let auditadas = 0;
  let aprovadas = 0;
  let recusadas = 0;

  // 1. Consultar mensagens registradas hoje que possuem texto de mídia ou imagem
  let rows = [];
  if (savedDb) {
    try {
      rows = savedDb.prepare(`
        SELECT id, phone, messageText, rawMessage, timestamp
        FROM whatsapp_messages
        WHERE timestamp >= ? AND fromMe = 0
        ORDER BY timestamp DESC
      `).all(startOfDayMs);
    } catch (e) {
      console.warn('[Baileys-PixScan] Erro ao consultar SQLite local:', e.message);
    }
  }

  console.log(`[Baileys-PixScan] 📋 ${rows.length} mensagens encontradas hoje no histórico local.`);

  // 2. Filtrar mensagens com padrão de mídia/imagem
  const mediaRows = rows.filter(r => {
    const text = (r.messageText || '').toLowerCase();
    return text.includes('imagem') || text.includes('mídia') || text.includes('midia') || text.includes('documento') || text === '[📷 imagem]' || text === '[📷 mídia]';
  });

  console.log(`[Baileys-PixScan] 📸 ${mediaRows.length} mensagens de mídia identificadas hoje.`);

  for (const row of mediaRows) {
    try {
      // Verificar se o telefone já teve um PIX confirmado hoje
      const jaConfirmado = savedDb.prepare(`
        SELECT id FROM pix_confirmations 
        WHERE phone = ? AND createdAt >= ?
      `).get(row.phone, startOfDayIso);

      if (jaConfirmado) {
        console.log(`[Baileys-PixScan] ⏩ PIX já confirmado hoje para o número ${row.phone}. Ignorando duplicata.`);
        continue;
      }

      console.log(`[Baileys-PixScan] 📸 Tentando baixar mídia da mensagem ${row.id} (${row.phone})...`);

      // Tentar reconstruir a mensagem a partir do rawMessage salvo ou chave
      let msgToDownload = null;
      if (row.rawMessage) {
        try { msgToDownload = JSON.parse(row.rawMessage); } catch (e) {}
      }

      if (!msgToDownload) {
        msgToDownload = {
          key: {
            remoteJid: `${row.phone}@s.whatsapp.net`,
            fromMe: false,
            id: row.id
          },
          message: { imageMessage: { url: '' } }
        };
      }

      auditadas++;

      // Tenta baixar a mídia usando o helper do Baileys
      try {
        const buffer = await downloadMediaMessage(
          msgToDownload,
          'buffer',
          { },
          { 
            logger: sock.logger,
            reuploadRequest: sock.updateMediaMessage
          }
        );

        if (buffer && buffer.length > 0) {
          const base64Image = buffer.toString('base64');
          console.log(`[Baileys-PixScan] 🔍 Enviando imagem de ${row.phone} para auditoria IA...`);
          const aprovado = await pixBot.processBaileysImage(base64Image, 'image/jpeg', row.phone, row.id);
          if (aprovado) {
            aprovadas++;
          } else {
            recusadas++;
          }
        }
      } catch (dlErr) {
        console.warn(`[Baileys-PixScan] Não foi possível baixar mídia da mensagem ${row.id} (pode ter sido apagada ou expirado no WhatsApp):`, dlErr.message);
      }
    } catch (err) {
      console.error(`[Baileys-PixScan] Erro na varredura retroativa de ${row.phone}:`, err.message);
    }
  }

  const msg = auditadas > 0 
    ? `Varredura concluída! ${mediaRows.length} imagens verificadas. ${aprovadas} comprovante(s) aprovado(s) e lançado(s) no PIX Direto.`
    : mediaRows.length > 0 
      ? `Varredura concluída! ${mediaRows.length} imagens encontradas hoje já haviam sido auditadas ou confirmadas.`
      : `Varredura concluída! Nenhuma imagem/comprovante novo foi encontrado nas conversas de hoje.`;

  return {
    success: true,
    totalMensagensHoje: rows.length,
    imagensIdentificadas: mediaRows.length,
    auditadas,
    aprovadas,
    recusadas,
    message: msg
  };
}

module.exports = {
  connect,
  disconnect,
  getStatus,
  sendTextToGroup,
  sendImageToGroup,
  sendStatus,
  listGroups,
  sendText,
  varrerPixDoDia
};
