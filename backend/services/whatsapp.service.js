/**
 * WhatsApp Service — BelaFarma
 * Envia mensagens via OpenClaw Gateway (http://127.0.0.1:18789)
 *
 * IMPORTANTE: Este serviço é best-effort.
 * Falhas aqui NUNCA devem interromper o fluxo principal da aplicação.
 * Sempre use .catch() ou await com try/catch ao chamar as funções.
 */

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
const ADMIN_PHONE = process.env.ADMIN_WHATSAPP;
const ENABLED = process.env.WA_NOTIFICATIONS_ENABLED !== 'false';

/**
 * Envia uma mensagem de WhatsApp para um número específico.
 * @param {string} phone - Número no formato E.164 (ex: +5532999058008)
 * @param {string} message - Texto da mensagem
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendMessage(phone, message) {
  if (!ENABLED) {
    console.log('[WhatsApp] Notificações desabilitadas (WA_NOTIFICATIONS_ENABLED=false)');
    return { success: false, error: 'Notificações desabilitadas' };
  }

  if (!phone) {
    console.warn('[WhatsApp] Número de destino não informado');
    return { success: false, error: 'Número não informado' };
  }

  try {
    // O OpenClaw CLI é chamado como processo filho para enviar a mensagem
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const execFileAsync = promisify(execFile);

    const { stdout, stderr } = await execFileAsync('openclaw', [
      'message', 'send',
      '--channel', 'whatsapp',
      '--target', phone,
      '--message', message,
      '--json'
    ], {
      timeout: 15000, // 15 segundos máximo
      windowsHide: true
    });

    // Tenta parsear saída JSON
    try {
      const result = JSON.parse(stdout);
      const messageId = result?.messageId || result?.id;
      console.log(`[WhatsApp] ✅ Mensagem enviada para ${phone} — ID: ${messageId}`);
      return { success: true, messageId };
    } catch {
      // Saída não é JSON mas o comando pode ter funcionado
      if (stdout.includes('Sent') || stdout.includes('✅')) {
        console.log(`[WhatsApp] ✅ Mensagem enviada para ${phone}`);
        return { success: true };
      }
    }

    if (stderr) {
      console.warn(`[WhatsApp] Aviso ao enviar para ${phone}:`, stderr);
    }

    return { success: true };

  } catch (error) {
    // Erro silencioso — não quebra o fluxo principal
    console.error(`[WhatsApp] ❌ Falha ao enviar para ${phone}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Envia notificação para o administrador da farmácia.
 * Usa o número configurado em ADMIN_WHATSAPP no .env
 * @param {string} message
 */
async function notifyAdmin(message) {
  if (!ADMIN_PHONE) {
    console.warn('[WhatsApp] ADMIN_WHATSAPP não configurado no .env');
    return { success: false, error: 'ADMIN_WHATSAPP não configurado' };
  }
  return sendMessage(ADMIN_PHONE, message);
}

// ─── Mensagens pré-definidas ────────────────────────────────────────────────

/**
 * Notifica fechamento de caixa
 */
async function notifyCashClosing({ date, totalSales, totalExpenses, safeAmount }) {
  const msg =
    `✅ *Caixa Fechado — BelaFarma*\n` +
    `📅 Data: ${date}\n` +
    `💰 Vendas: R$ ${Number(totalSales).toFixed(2)}\n` +
    `📤 Despesas: R$ ${Number(totalExpenses).toFixed(2)}\n` +
    `🏦 Cofre: R$ ${Number(safeAmount).toFixed(2)}`;
  return notifyAdmin(msg);
}

/**
 * Notifica boleto vencendo em breve
 */
async function notifyBoletoVencendo({ supplier, amount, dueDate }) {
  const msg =
    `⚠️ *Boleto Vencendo — BelaFarma*\n` +
    `🏪 Fornecedor: ${supplier}\n` +
    `💵 Valor: R$ ${Number(amount).toFixed(2)}\n` +
    `📅 Vencimento: ${dueDate}`;
  return notifyAdmin(msg);
}

/**
 * Notifica backup concluído
 */
async function notifyBackupConcluido({ timestamp }) {
  const msg =
    `🗄️ *Backup Concluído — BelaFarma*\n` +
    `✅ Banco de dados salvo com sucesso\n` +
    `🕐 Horário: ${timestamp}`;
  return notifyAdmin(msg);
}

/**
 * Notifica novo pedido criado
 */
async function notifyNovoPedido({ orderNumber, supplier, items }) {
  const msg =
    `📦 *Novo Pedido — BelaFarma*\n` +
    `#️⃣ Pedido: ${orderNumber}\n` +
    `🏪 Fornecedor: ${supplier}\n` +
    `📋 Itens: ${items}`;
  return notifyAdmin(msg);
}

module.exports = {
  sendMessage,
  notifyAdmin,
  notifyCashClosing,
  notifyBoletoVencendo,
  notifyBackupConcluido,
  notifyNovoPedido,
};
