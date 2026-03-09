/**
 * Message Sender Service — BelaFarma
 * Módulo responsável APENAS pelo envio de mensagens via Evolution API.
 * 
 * Features:
 * - Envio individual
 * - Envio em lote com rate-limit (evita bloqueio do WhatsApp)
 * - Log de todas as tentativas de envio
 * 
 * IMPORTANTE: Este serviço é best-effort.
 * Falhas NUNCA devem interromper o fluxo principal da aplicação.
 */

const ENABLED = process.env.WA_NOTIFICATIONS_ENABLED !== 'false';
const ADMIN_PHONE = process.env.ADMIN_WHATSAPP;
const API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const API_KEY = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
const INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || 'belafarma';

const RATE_LIMIT_MS = 3000; // 3 segundos entre cada mensagem
const MAX_BATCH_SIZE = 50;  // Máximo de mensagens por lote

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
  // A Evolution API geralmente prefere o número com código do país, sem o +
  // Ex: +5532999058008 -> 5532999058008
  return phone.replace(/\D/g, ''); 
}

/**
 * Envia uma mensagem de WhatsApp para um número específico via Evolution API.
 * @param {string} phone - Número no formato E.164 (ex: +5532999058008)
 * @param {string} message - Texto da mensagem
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
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
    
    // Node.js 18+ possui fetch nativo
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

    const result = await response.json();

    if (!response.ok) {
      console.error(`[MessageSender] ❌ Falha ao enviar para ${phone}:\n`, JSON.stringify(result, null, 2));
      return { success: false, error: result.message || 'Erro na API' };
    }

    console.log(`[MessageSender] ✅ Mensagem enviada para ${phone}`);
    return { success: true, messageId: result.key?.id };

  } catch (error) {
    console.error(`[MessageSender] ❌ Erro de conexão ao enviar para ${phone}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Envia notificação para o administrador da farmácia.
 * @param {string} message
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
 * @param {Array<{phone: string, message: string, metadata?: object}>} messages
 * @param {Function} onProgress - Callback (index, total, result) chamado após cada envio
 * @returns {Promise<{total: number, sent: number, failed: number, results: Array}>}
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

    // Rate-limit: aguarda entre envios (exceto no último)
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
