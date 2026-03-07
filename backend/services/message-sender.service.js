/**
 * Message Sender Service — BelaFarma
 * Módulo responsável APENAS pelo envio de mensagens via OpenClaw CLI.
 * 
 * Features:
 * - Envio individual
 * - Envio em lote com rate-limit (evita bloqueio do WhatsApp)
 * - Log de todas as tentativas de envio
 * 
 * IMPORTANTE: Este serviço é best-effort.
 * Falhas NUNCA devem interromper o fluxo principal da aplicação.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const ENABLED = process.env.WA_NOTIFICATIONS_ENABLED !== 'false';
const ADMIN_PHONE = process.env.ADMIN_WHATSAPP;
const RATE_LIMIT_MS = 3000; // 3 segundos entre cada mensagem
const MAX_BATCH_SIZE = 50;  // Máximo de mensagens por lote

/**
 * Aguarda um tempo em milissegundos
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Envia uma mensagem de WhatsApp para um número específico via OpenClaw CLI.
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

  try {
    const { stdout, stderr } = await execFileAsync('openclaw', [
      'message', 'send',
      '--channel', 'whatsapp',
      '--target', phone,
      '--message', message,
      '--json'
    ], {
      timeout: 15000,
      windowsHide: true
    });

    // Tenta parsear saída JSON
    try {
      const result = JSON.parse(stdout);
      const messageId = result?.messageId || result?.id;
      console.log(`[MessageSender] ✅ Mensagem enviada para ${phone} — ID: ${messageId}`);
      return { success: true, messageId };
    } catch {
      // Saída não é JSON mas o comando pode ter funcionado
      if (stdout.includes('Sent') || stdout.includes('✅') || stdout.includes('sent')) {
        console.log(`[MessageSender] ✅ Mensagem enviada para ${phone}`);
        return { success: true };
      }
    }

    if (stderr) {
      console.warn(`[MessageSender] Aviso ao enviar para ${phone}:`, stderr);
    }

    return { success: true };

  } catch (error) {
    console.error(`[MessageSender] ❌ Falha ao enviar para ${phone}:`, error.message);
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
