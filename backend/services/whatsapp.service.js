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

// ============================================================================
// 🛑 REGRA SAGRADA DE SEGURANÇA 🛑
// O sistema DEVE usar uma instância EXCLUSIVA para envios (SENDER).
// O número principal da farmácia NUNCA deve ser usado para disparar mensagens,
// evitando banimentos e punições do WhatsApp.
// ============================================================================
const EVOLUTION_SENDER_INSTANCE = process.env.EVOLUTION_SENDER_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'belafarma';
const EVOLUTION_MAIN_INSTANCE = process.env.EVOLUTION_MAIN_INSTANCE || 'belafarma_principal';

console.log(`[WhatsApp] 🔧 Config: SENDER=${EVOLUTION_SENDER_INSTANCE}, MAIN=${EVOLUTION_MAIN_INSTANCE}, URL=${EVOLUTION_API_URL}`);

const ADMIN_PHONES = (process.env.ADMIN_WHATSAPP || '').split(',').map(p => p.trim()).filter(p => !!p);
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

  // 🛡️ TRAVA DE SEGURANÇA DA REGRA SAGRADA 🛡️
  // Bloqueia APENAS se a instância SENDER contiver a palavra 'principal' — evita usar o número da farmácia para disparos.
  // Não bloqueia mais se sender === main, pois em produção ambas podem ter o mesmo nome base ('belafarma').
  if (EVOLUTION_SENDER_INSTANCE.toLowerCase().includes('principal')) {
    console.error(`[WhatsApp] 🚨 BLOQUEIO CRÍTICO: Instância SENDER ('${EVOLUTION_SENDER_INSTANCE}') parece ser a instância principal. Configure EVOLUTION_SENDER_INSTANCE no .env com a instância de disparo.`);
    return { success: false, error: 'Bloqueio de Segurança: Configure EVOLUTION_SENDER_INSTANCE corretamente.' };
  }

  if (!phone) {
    console.warn('[WhatsApp] Número de destino não informado');
    return { success: false, error: 'Número não informado' };
  }

  // Suporte para múltiplos números separados por vírgula
  if (typeof phone === 'string' && phone.includes(',')) {
    const phones = phone.split(',').map(p => p.trim()).filter(p => !!p);
    const results = await Promise.all(phones.map(p => sendMessage(p, message)));
    return results.find(r => r.success) || results[0];
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    
    const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_SENDER_INSTANCE}`, {
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
  if (ADMIN_PHONES.length === 0) {
    console.warn('[WhatsApp] ADMIN_WHATSAPP não configurado no .env');
    return { success: false, error: 'ADMIN_WHATSAPP não configurado' };
  }
  
  // Como sendMessage agora suporta strings com vírgula, podemos passar a lista
  return sendMessage(ADMIN_PHONES.join(','), message);
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
