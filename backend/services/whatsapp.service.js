/**
 * WhatsApp Service — BelaFarma
 * Envia mensagens via Evolution API
 *
 * IMPORTANTE: Este serviço é best-effort.
 * Falhas aqui NUNCA devem interromper o fluxo principal da aplicação.
 * Sempre use .catch() ou await com try/catch ao chamar as funções.
 */

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'belafarma';
const ADMIN_PHONE = process.env.ADMIN_WHATSAPP;
const ENABLED = process.env.WA_NOTIFICATIONS_ENABLED !== 'false';

/**
 * Envia uma mensagem de WhatsApp para um número específico via Evolution API.
 * @param {string} phone - Número no formato DDD+Número (ex: 32988634755)
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
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Suporte para fetch no Node.js (usando node-fetch se necessário, mas v18+ tem nativo)
    // No projeto usamos node-fetch v2.7.0 importado no server.js ou via global
    const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: cleanPhone,
        textMessage: { text: message },
        options: { delay: 1200, presence: "composing" }
      })
    });

    const result = await response.json();

    if (response.ok) {
      const messageId = result?.key?.id;
      console.log(`[WhatsApp] ✅ Mensagem enviada para ${phone} via Evolution — ID: ${messageId}`);
      return { success: true, messageId };
    } else {
      console.warn(`[WhatsApp] ⚠️ Erro na Evolution API ao enviar para ${phone}:`, result);
      return { success: false, error: result?.message || 'Erro desconhecido na Evolution' };
    }

  } catch (error) {
    console.error(`[WhatsApp] ❌ Falha catastrófica ao enviar para ${phone}:`, error.message);
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
