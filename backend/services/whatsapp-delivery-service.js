const { callAI } = require('./ai.service');

/**
 * Serviço de Varredura e Auditoria de Vendas (Fechadas x Não Fechadas) e Deliveries via IA
 */

function formatPhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

function parseJsonFromAiResponse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (err) { /* falha silenciosa */ }
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1));
      } catch (err) { /* falha silenciosa */ }
    }
  }
  return null;
}

const DELIVERY_AUDIT_SYSTEM_PROMPT = `
Você é o auditor financeiro e de vendas da Drogaria BelaFarma.
Sua missão é analisar o diálogo no WhatsApp entre o Cliente e a Farmácia e classificar a conversa:

Determine 2 pontos cruciais:
1. FOI FECHADA UMA VENDA / PEDIDO DE ENTREGA? ("sale_closed": true ou false)
   - true: O cliente aceitou o orçamento, passou o endereço/dados, confirmou a compra ou a entrega foi agendada/realizada.
   - false: O cliente apenas perguntou preço/estoque, pediu orçamento e não respondeu mais, achou caro, ou o produto estava em falta.

2. QUAIS OS DETALHES DO ATENDIMENTO?
   - "customer_name": Nome do cliente (se mencionado) ou "Cliente".
   - "is_delivery": true se for pedido para entrega em casa, false se for retirada no balcão ou apenas orçamento.
   - "delivery_address": Endereço de entrega (se informado) ou null.
   - "items": Lista/Resumo dos medicamentos e produtos consultados ou comprados.
   - "total_amount": Valor total em R$ (valor cobrado se fechou a venda, ou valor total orçado se não fechou).
   - "payment_method": Forma de pagamento (Pix, Cartão, Dinheiro, Crediário, A combinar).
   - "status": 
       - Se FECHOU venda: "Pendente", "Em Rota" ou "Entregue".
       - Se NÃO FECHOU venda: "Nao_Fechado" ou "Cancelado".
   - "unclosed_reason": Caso "sale_closed" seja false, informe o motivo provável:
       - "Preço Alto": O cliente reclamou do valor ou achou caro.
       - "Falta de Estoque": A farmácia não tinha o produto disponível.
       - "Sem Resposta do Cliente": O atendente passou a cotação e o cliente parou de responder.
       - "Desistiu": O cliente informou que não queria mais.
       - "Apenas Cotação": Cliente só tirou dúvida sem intenção imediata.
       - null (caso a venda tenha sido FECHADA com sucesso).
   - "notes": Resumo direto de 1 linha sobre a negociação.

RESPONDA EXCLUSIVAMENTE EM FORMATO JSON VÁLIDO:
{
  "sale_closed": true ou false,
  "is_delivery": true ou false,
  "customer_name": "Nome do cliente",
  "delivery_address": "Endereço ou null",
  "items": "Descrição dos produtos",
  "total_amount": 0.00,
  "payment_method": "Pix | Cartão | Dinheiro | Crediário | Outro",
  "status": "Pendente | Em Rota | Entregue | Nao_Fechado | Cancelado",
  "unclosed_reason": "Preço Alto | Falta de Estoque | Sem Resposta do Cliente | Desistiu | Apenas Cotação | null",
  "notes": "Observação curta sobre o atendimento"
}
`;

/**
 * Executa a varredura das conversas no SQLite local e extrai entregas + vendas não fechadas
 */
async function syncMessagesFromEvolution(db) {
  const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
  const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
  const EVOLUTION_MAIN_INSTANCE = process.env.EVOLUTION_MAIN_INSTANCE || 'belafarma_principal';

  try {
    console.log(`[DeliveryAIService] 🔄 Sincronizando mensagens reais da Evolution API (${EVOLUTION_MAIN_INSTANCE})...`);
    const chatsRes = await fetch(`${EVOLUTION_API_URL}/chat/findChats/${EVOLUTION_MAIN_INSTANCE}`, {
      headers: { 'apikey': EVOLUTION_API_KEY }
    });

    if (!chatsRes.ok) {
      console.warn(`[DeliveryAIService] ⚠️ Evolution API findChats respondeu status ${chatsRes.status}`);
      return;
    }

    const chatsData = await chatsRes.json();
    const chatsList = Array.isArray(chatsData) ? chatsData : (chatsData.chats || chatsData.data || []);

    const individualChats = chatsList.filter(c => {
      const jid = c.id || c.remoteJid || '';
      return jid && !jid.includes('@g.us') && !jid.includes('@broadcast') && !jid.includes(':');
    }).slice(0, 30);

    let syncedCount = 0;

    for (const chat of individualChats) {
      const jid = chat.id || chat.remoteJid;
      const phone = jid.split('@')[0];

      try {
        const msgsRes = await fetch(`${EVOLUTION_API_URL}/chat/findMessages/${EVOLUTION_MAIN_INSTANCE}`, {
          method: 'POST',
          headers: {
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            where: { key: { remoteJid: jid } },
            limit: 30
          })
        });

        if (msgsRes.ok) {
          const msgsData = await msgsRes.json();
          const records = Array.isArray(msgsData) ? msgsData : (msgsData.records || msgsData.data || []);

          for (const m of records) {
            const msgId = m.key?.id || `msg_${m.messageTimestamp}_${Math.random()}`;
            const fromMe = m.key?.fromMe ? 1 : 0;
            let text = '';
            if (m.message) {
              text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || '';
            }
            if (!text) continue;

            const ts = (m.messageTimestamp ? m.messageTimestamp * 1000 : Date.now());

            db.prepare(`
              INSERT OR REPLACE INTO whatsapp_messages (id, phone, fromMe, messageText, timestamp)
              VALUES (?, ?, ?, ?, ?)
            `).run(msgId, phone, fromMe, text, ts);

            syncedCount++;
          }
        }
      } catch (errMsg) {
        /* ignora falha individual */
      }
    }
    console.log(`[DeliveryAIService] ✅ Sincronizadas ${syncedCount} mensagens reais da Evolution API no SQLite.`);
  } catch (errSync) {
    console.warn(`[DeliveryAIService] ⚠️ Não foi possível sincronizar via Evolution API:`, errSync.message);
  }
}

async function scanDeliveriesFromWhatsApp(db, options = {}) {
  // Sincronizar mensagens reais da Evolution API primeiro
  await syncMessagesFromEvolution(db);

  const now = new Date();
  let timeLimit = 0;
  let chatLimit = 60;

  if (options.currentMonth) {
    // Pegar desde o primeiro dia do mês atual às 00:00:00
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    timeLimit = startOfMonth;
    chatLimit = 150;
    console.log(`[DeliveryAIService] 📅 Varredura COMPLETA do MÊS ATUAL (${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })})...`);
  } else {
    const hoursToAnalyze = options.hours || 48;
    timeLimit = Date.now() - (hoursToAnalyze * 60 * 60 * 1000);
    console.log(`[DeliveryAIService] 🛵 Auditoria de Vendas & Deliveries (últimas ${hoursToAnalyze}h)...`);
  }

  const stats = {
    processedChats: 0,
    closedSalesCount: 0,
    closedSalesAmount: 0,
    unclosedSalesCount: 0,
    unclosedSalesAmount: 0,
    errors: 0
  };

  try {
    // Buscar chats ativos no período com pelo menos 2 mensagens
    const recentChats = db.prepare(`
      SELECT phone, MAX(timestamp) as lastTimestamp, COUNT(*) as msgCount
      FROM whatsapp_messages
      WHERE timestamp >= ? AND phone IS NOT NULL AND phone != ''
      GROUP BY phone
      HAVING msgCount >= 2
      ORDER BY lastTimestamp DESC
      LIMIT ?
    `).all(timeLimit, chatLimit);

    console.log(`[DeliveryAIService] 📊 Encontrados ${recentChats.length} chats para auditoria de vendas do período.`);

    for (const chat of recentChats) {
      const cleanPhone = formatPhone(chat.phone);
      if (!cleanPhone) continue;

      stats.processedChats++;

      let customerName = 'Cliente WhatsApp';
      try {
        const cust = db.prepare('SELECT name FROM customers WHERE phone LIKE ? LIMIT 1').get(`%${cleanPhone.slice(-8)}%`);
        if (cust && cust.name && cust.name.trim() !== '') {
          customerName = cust.name;
        }
      } catch (e) { /* ignora */ }

      const messages = db.prepare(`
        SELECT id, fromMe, messageText, timestamp
        FROM whatsapp_messages
        WHERE phone = ?
        ORDER BY timestamp ASC
        LIMIT 40
      `).all(chat.phone);

      if (!messages || messages.length === 0) continue;

      const lastMsgId = messages[messages.length - 1].id || `msg_${messages[messages.length - 1].timestamp}`;

      const transcript = messages.map(m => {
        const sender = m.fromMe === 1 ? 'Atendente BelaFarma' : customerName;
        const hora = new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `[${hora}] ${sender}: ${m.messageText}`;
      }).join('\n');

      const userPrompt = `
Analise o atendimento WhatsApp com o cliente (${customerName} - Tel: ${cleanPhone}):

--- CONVERSA ---
${transcript}
--- FIM ---

Determine se a venda foi FECHADA ou NÃO FECHADA e retorne o JSON conforme o prompt do sistema.
`;

      try {
        const aiResponseText = await callAI(userPrompt, DELIVERY_AUDIT_SYSTEM_PROMPT, { temperature: 0.2 });
        const result = parseJsonFromAiResponse(aiResponseText);

        if (result && (result.total_amount > 0 || result.items || result.delivery_address)) {
          const isClosed = result.sale_closed !== false;
          const finalName = (result.customer_name && result.customer_name !== 'Cliente') ? result.customer_name : customerName;
          const totalAmount = parseFloat(result.total_amount) || 0;
          const address = result.delivery_address || (result.is_delivery ? 'Endereço a confirmar' : 'Balcão / Loja');
          const itemsStr = result.items || 'Produtos consultados';
          const paymentMethod = result.payment_method || 'A combinar';
          
          let status = result.status;
          if (!status) {
            status = isClosed ? 'Pendente' : 'Nao_Fechado';
          }

          const unclosedReason = !isClosed ? (result.unclosed_reason || 'Sem Resposta do Cliente') : null;
          const notes = result.notes || '';

          if (isClosed) {
            stats.closedSalesCount++;
            stats.closedSalesAmount += totalAmount;
          } else {
            stats.unclosedSalesCount++;
            stats.unclosedSalesAmount += totalAmount;
          }

          // Checar se já existe registro recente deste telefone no banco (no mês ou últimas 30d)
          const existing = db.prepare(`
            SELECT id, status, total_amount, sale_closed
            FROM deliveries
            WHERE phone = ? AND created_at >= datetime('now', '-30 days')
            ORDER BY created_at DESC
            LIMIT 1
          `).get(cleanPhone);

          if (existing) {
            db.prepare(`
              UPDATE deliveries
              SET customer_name = ?,
                  delivery_address = ?,
                  items = ?,
                  total_amount = ?,
                  payment_method = ?,
                  status = ?,
                  sale_closed = ?,
                  unclosed_reason = ?,
                  last_message_id = ?,
                  notes = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(
              finalName,
              address,
              itemsStr,
              totalAmount > 0 ? totalAmount : existing.total_amount,
              paymentMethod,
              status,
              isClosed ? 1 : 0,
              unclosedReason,
              lastMsgId,
              notes,
              existing.id
            );
          } else {
            const deliveryId = `deliv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            db.prepare(`
              INSERT INTO deliveries (
                id, phone, customer_name, delivery_address, items,
                total_amount, payment_method, status, sale_closed, unclosed_reason,
                last_message_id, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              deliveryId,
              cleanPhone,
              finalName,
              address,
              itemsStr,
              totalAmount,
              paymentMethod,
              status,
              isClosed ? 1 : 0,
              unclosedReason,
              lastMsgId,
              notes
            );
          }
        }
      } catch (aiErr) {
        stats.errors++;
        console.error(`[DeliveryAIService] ⚠️ Erro ao auditar chat de ${cleanPhone}:`, aiErr.message);
      }
    }

    console.log(`[DeliveryAIService] ✅ Auditoria concluída. Vendas Fechadas: ${stats.closedSalesCount} (R$ ${stats.closedSalesAmount.toFixed(2)}), Não Fechadas: ${stats.unclosedSalesCount} (R$ ${stats.unclosedSalesAmount.toFixed(2)})`);
  } catch (err) {
    console.error('[DeliveryAIService] ❌ Erro geral na auditoria:', err);
  }

  return stats;
}

module.exports = {
  scanDeliveriesFromWhatsApp
};
