const fs = require('fs');
const path = require('path');

// Configurações do WhatsApp / Evolution API via .env
const ENABLED = process.env.WA_NOTIFICATIONS_ENABLED !== 'false';
const ADMIN_PHONES = (process.env.ADMIN_WHATSAPP || '').split(',').map(p => p.trim()).filter(p => !!p);
const API_URL = process.env.EVOLUTION_API_URL || 'http://evolution-api:8080';
// belaAtende é a instância de ENVIO; belaFarma é a instância de RECEBIMENTO
const API_KEY = process.env.EVOLUTION_SENDER_API_KEY || process.env.EVOLUTION_API_KEY || 'BelaAtende2026';
const INSTANCE_NAME = process.env.EVOLUTION_SENDER_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'belaAtende';

const RATE_LIMIT_MS = 3000; // 3 segundos entre cada mensagem
const MAX_BATCH_SIZE = 50;  // Máximo de mensagens por lote

// Caminho para fallback de mensagens (FileSystem)
const MENSAGENS_DIR = path.join(__dirname, '../../mensagens');
const PENDENTES_DIR = path.join(MENSAGENS_DIR, 'pendentes');

/**
 * Aguarda um tempo em milissegundos
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formata o número para o padrão da API (remoção do +)
 */
function formatPhone(phone) {
  return phone.replace(/\D/g, ''); 
}

/**
 * Salva a mensagem como JSON para ser processada pelo MessageWatcher depois
 */
function saveMessageToFile(phone, message) {
  try {
    if (!fs.existsSync(PENDENTES_DIR)) {
      fs.mkdirSync(PENDENTES_DIR, { recursive: true });
    }
    const fileName = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.json`;
    const filePath = path.join(PENDENTES_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify({
      phone,
      textMessage: { text: message },
      createdAt: new Date().toISOString(),
      type: 'fallback'
    }, null, 2));
    console.log(`[MessageSender] 💾 Mensagem salva em arquivo (fallback): ${fileName}`);
    return true;
  } catch (err) {
    console.error('[MessageSender] ❌ Erro ao salvar fallback em arquivo:', err.message);
    return false;
  }
}

/**
 * Envia uma mensagem de WhatsApp para um número específico via Evolution API.
 * @param {string} phone - Número no formato E.164 (ex: +5532999058008)
 * @param {string} message - Texto da mensagem
 * @returns {Promise<{success: boolean, messageId?: string, error?: string, fallback?: boolean}>}
 */
async function sendMessage(phone, message, disableFallback = false) {
  if (!ENABLED) {
    console.log('[MessageSender] Notificações desabilitadas (WA_NOTIFICATIONS_ENABLED=false)');
    return { success: false, error: 'Notificações desabilitadas' };
  }

  if (!phone) {
    console.warn('[MessageSender] Número de destino não informado');
    return { success: false, error: 'Número não informado' };
  }

  // Suporte para múltiplos números separados por vírgula
  if (typeof phone === 'string' && phone.includes(',')) {
    const phones = phone.split(',').map(p => p.trim()).filter(p => !!p);
    const results = await Promise.all(phones.map(p => sendMessage(p, message, disableFallback)));
    return results.find(r => r.success) || results[0];
  }

  if (!message || message.trim() === '') {
    console.warn('[MessageSender] Mensagem vazia');
    return { success: false, error: 'Mensagem vazia' };
  }

  // Se for um grupo (@g.us), não formata o número
  const isGroup = typeof phone === 'string' && phone.includes('@g.us');
  const target = isGroup ? phone : formatPhone(phone);

  try {
    const url = `${API_URL}/message/sendText/${INSTANCE_NAME}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      },
      body: JSON.stringify({
        number: target,
        textMessage: {
          text: message
        },
        options: {
          delay: 1200,
          presence: "composing"
        }
      })
    });

    let result = {};
    try {
      result = await response.json();
    } catch (e) {}

    if (!response.ok) {
      console.error(`[MessageSender] ❌ Falha na API (${response.status}) ao enviar para ${phone}`);
      
      if (disableFallback) {
        return { 
          success: false, 
          error: result.message || `Erro API ${response.status}`,
          fallback: false,
          isApiError: true
        };
      }

      const saved = saveMessageToFile(phone, message);
      return { 
        success: saved, 
        error: result.message || `Erro API ${response.status}`,
        fallback: saved
      };
    }

    console.log(`[MessageSender] ✅ Mensagem enviada via API para ${phone}`);
    return { success: true, messageId: result.key?.id };

  } catch (error) {
    console.error(`[MessageSender] ❌ Erro de conexão ao enviar para ${phone}:`, error.message);
    
    if (disableFallback) {
        return { 
          success: false, 
          error: error.message,
          fallback: false,
          isNetworkError: true
        };
    }

    // FALLBACK: Se falhar a conexão, salva no disco
    const saved = saveMessageToFile(phone, message);
    return { 
      success: saved, 
      error: error.message,
      fallback: saved
    };
  }
}

/**
 * Envia uma mensagem de mídia (imagem) para um número ou JID de grupo via Evolution API.
 * @param {string} target - Número ou JID do grupo (ex: 5532999058008 ou 123456789@g.us)
 * @param {string} caption - Texto da legenda
 * @param {string} mediaPath - Caminho local absoluto do arquivo (ex: F:/.../uploads/imagem.jpg)
 */
async function sendMediaMessage(target, caption, mediaPath) {
  if (!ENABLED) return { success: false, error: 'Notificações desabilitadas' };
  if (!target || !mediaPath) return { success: false, error: 'Destino ou Mídia não informados' };

  try {
    const url = `${API_URL}/message/sendMedia/${INSTANCE_NAME}`;
    
    // Se for um caminho de arquivo local, converte para Base64
    let mediaData = mediaPath;
    let extension = 'jpeg'; // Extensão padrão
    
    if (fs.existsSync(mediaPath)) {
      const fileBuffer = fs.readFileSync(mediaPath);
      extension = path.extname(mediaPath).replace('.', '').toLowerCase();
      if (extension === 'jpg') extension = 'jpeg';
      mediaData = `data:image/${extension};base64,${fileBuffer.toString('base64')}`;
    } else {
      // Se for uma URL de imagem, tenta extrair a extensão do link
      const match = mediaPath.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
      if (match) {
        extension = match[1].toLowerCase();
        if (extension === 'jpg') extension = 'jpeg';
      }
    }

    // Se for um grupo (@g.us), não formata o destino
    const isGroup = typeof target === 'string' && target.includes('@g.us');
    const dest = isGroup ? target : formatPhone(target);

    // Evolution API v1.8.2 exige uma estrutura flat no body (e não aninhada em mediaMessage)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      },
      body: JSON.stringify({
        number: dest,
        mediatype: "image",
        mimetype: `image/${extension}`,
        media: mediaData,
        fileName: `imagem.${extension}`,
        caption: caption || "",
        options: {
          delay: 1500,
          presence: "composing"
        }
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`[MessageSender] ❌ Erro ao enviar mídia para ${target}:`, result.message || response.status);
      return { success: false, error: result.message || `Erro API ${response.status}` };
    }

    console.log(`[MessageSender] ✅ Mídia enviada com sucesso para ${target}`);
    return { success: true, messageId: result.key?.id };
  } catch (error) {
    console.error(`[MessageSender] 💥 Erro crítico no sendMediaMessage para ${target}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Busca todos os grupos vinculados à instância.
 */
async function fetchGroups() {
  if (!ENABLED) return [];
  try {
    const url = `${API_URL}/group/fetchAllGroups/${INSTANCE_NAME}?getParticipants=false`;
    // Fallback: na v2 pode ser /group/fetchAll/{instance}
    // Vamos tentar o endpoint principal primeiro
    console.log(`[MessageSender] 🔍 Buscando grupos em: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'apikey': API_KEY }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MessageSender] ❌ Erro API (${response.status}):`, errorText);
      
      // Fallback para v2 ou outras versões de endpoint
      if (response.status === 404) {
        const fallbackUrl = `${API_URL}/group/fetchAll/${INSTANCE_NAME}`;
        console.log(`[MessageSender] 🔄 Tentando fallback em: ${fallbackUrl}`);
        const fallbackRes = await fetch(fallbackUrl, {
            method: 'GET',
            headers: { 'apikey': API_KEY }
        });
        if (fallbackRes.ok) return await fallbackRes.json();
      }
      
      throw new Error(`Erro API: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[MessageSender] 📦 Grupos recebidos:`, Array.isArray(data) ? data.length : 'Objeto');
    
    // Se for um objeto, tenta extrair a lista de várias formas comuns na Evolution API
    if (!Array.isArray(data) && data && typeof data === 'object') {
       if (data.groups && Array.isArray(data.groups)) return data.groups;
       if (data.data && Array.isArray(data.data)) return data.data;
       if (data.instance && Array.isArray(data.instance)) return data.instance;
       // Se o objeto em si tiver chaves que parecem JIDs, pode ser um mapa (raro na v1)
    }

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[MessageSender] ❌ Erro ao buscar grupos:', error.message);
    return [];
  }
}


/**
 * Envia notificação para o administrador da farmácia.
 */
async function notifyAdmin(message) {
  if (ADMIN_PHONES.length === 0) {
    console.warn('[MessageSender] ADMIN_WHATSAPP não configurado no .env');
    return { success: false, error: 'ADMIN_WHATSAPP não configurado' };
  }
  
  return sendMessage(ADMIN_PHONES.join(','), message);
}

/**
 * Envia mensagens em lote com rate-limit entre cada envio.
 */
async function sendBulk(messages, onProgress = null) {
  const batch = messages.slice(0, MAX_BATCH_SIZE);
  const results = [];
  let sent = 0;
  let failed = 0;

  console.log(`[MessageSender] 📤 Iniciando envio em lote: ${batch.length} mensagens`);

  for (let i = 0; i < batch.length; i++) {
    const { phone, message, metadata } = batch[i];
    
    const result = await sendMessage(phone, message);
    results.push({ ...result, phone, metadata });

    if (result.success) {
      sent++;
    } else {
      failed++;
    }

    if (onProgress) {
      onProgress(i + 1, batch.length, result);
    }

    if (i < batch.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log(`[MessageSender] 📊 Lote finalizado: ${sent} enviados, ${failed} falharam`);

  return {
    total: batch.length,
    sent,
    failed,
    results
  };
}

module.exports = {
  sendMessage,
  sendMediaMessage,
  fetchGroups,
  notifyAdmin,
  sendBulk,
  ADMIN_PHONES,
  ENABLED,
};
