const fs = require('fs');
const path = require('path');

// Configurações do WhatsApp / Evolution API via .env
const ENABLED = process.env.WA_NOTIFICATIONS_ENABLED !== 'false';
const ADMIN_PHONE = process.env.ADMIN_WHATSAPP;
const API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const API_KEY = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
const INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || 'belafarma';

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
async function sendMessage(phone, message) {
  if (!ENABLED) {
    console.log('[MessageSender] Notificações desabilitadas (WA_NOTIFICATIONS_ENABLED=false)');
    return { success: false, error: 'Notificações desabilitadas' };
  }

  if (!phone) {
    console.warn('[MessageSender] Número de destino não informado');
    return { success: false, error: 'Número não informado' };
  }

  if (!message || message.trim() === '') {
    console.warn('[MessageSender] Mensagem vazia');
    return { success: false, error: 'Mensagem vazia' };
  }

  const formattedPhone = formatPhone(phone);

  try {
    const url = `${API_URL}/message/sendText/${INSTANCE_NAME}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      },
      body: JSON.stringify({
        number: formattedPhone,
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
 * Envia notificação para o administrador da farmácia.
 */
async function notifyAdmin(message) {
  if (!ADMIN_PHONE) {
    console.warn('[MessageSender] ADMIN_WHATSAPP não configurado no .env');
    return { success: false, error: 'ADMIN_WHATSAPP não configurado' };
  }
  return sendMessage(ADMIN_PHONE, message);
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
  notifyAdmin,
  sendBulk,
  ADMIN_PHONE,
  ENABLED,
};
