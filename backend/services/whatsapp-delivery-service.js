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
   - "items": Lista/Resumo dos medicamentos e produtos consultados ou comprados. IMPORTANTE: Se a conversa mencionar ou indicar o envio de uma foto, receita ou áudio (sem texto claro do nome), escreva "Receita / Imagem". Deixe vazio ("") APENAS se for uma conversa sem menção a produtos/receitas (ex: só "Bom dia").
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
    }).slice(0, 150);

    // Salvar contatos cacheados para recuperar nomes
    try {
      const insertContact = db.prepare(`
        INSERT INTO whatsapp_contacts (id, name, pushName, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET 
          name = excluded.name,
          pushName = excluded.pushName,
          updated_at = CURRENT_TIMESTAMP
      `);
      db.transaction((chats) => {
        for (const c of chats) {
          const jid = c.id || c.remoteJid;
          const name = c.name || (c.contact && c.contact.name) || '';
          const pushName = c.pushName || (c.contact && c.contact.pushName) || '';
          if (name || pushName) {
            insertContact.run(jid, name, pushName);
          }
        }
      })(individualChats);
    } catch (err) {
      console.warn('[DeliveryAIService] ⚠️ Erro ao salvar cache de contatos:', err.message);
    }

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
            limit: 50
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

            let rawTs = m.messageTimestamp || Date.now();
            if (typeof rawTs === 'string') rawTs = parseInt(rawTs, 10);
            const ts = (rawTs > 0 && rawTs < 10000000000) ? rawTs * 1000 : (rawTs || Date.now());

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
  let chatLimit = 200;

  if (options.currentMonth) {
    // Pegar desde o primeiro dia do mês atual às 00:00:00
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    timeLimit = startOfMonth;
    chatLimit = 500;
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
      HAVING msgCount >= 1
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
        } else {
          // Fallback to whatsapp_contacts cache
          const waContact = db.prepare('SELECT name, pushName FROM whatsapp_contacts WHERE id = ?').get(chat.phone + '@s.whatsapp.net');
          if (waContact) {
            customerName = waContact.name || waContact.pushName || 'Cliente WhatsApp';
          }
        }
      } catch (e) { /* ignora */ }

      const messages = db.prepare(`
        SELECT * FROM (
          SELECT id, fromMe, messageText, timestamp
          FROM whatsapp_messages
          WHERE phone = ?
          ORDER BY timestamp DESC
          LIMIT 50
        )
        ORDER BY timestamp ASC
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
          const itemsStr = result.items || '';
          
          // Task 2: Medicamento não identificado não deve ser considerado
          // FLEXIBILIZAÇÃO: Não descartamos se a venda foi FECHADA (pois a negociação pode ter ocorrido por áudio/foto)
          // ou se a IA identificou que é uma receita/imagem.
          const invalidItems = !itemsStr || itemsStr.trim() === '' || itemsStr.toLowerCase().includes('produtos consultados') || itemsStr.toLowerCase().includes('não identificado') || itemsStr.toLowerCase().includes('não informado');
          if (invalidItems && !isClosed) {
            continue;
          }

          const isClosed = result.sale_closed !== false;
          const finalName = (result.customer_name && result.customer_name !== 'Cliente') ? result.customer_name : customerName;
          const totalAmount = parseFloat(result.total_amount) || 0;
          const address = result.delivery_address || (result.is_delivery ? 'Endereço a confirmar' : 'Balcão / Loja');
          const paymentMethod = result.payment_method || 'A combinar';
          
          let status = result.status;
          if (!status) {
            status = isClosed ? 'Pendente' : 'Nao_Fechado';
          }

          const unclosedReason = !isClosed ? (result.unclosed_reason || 'Sem Resposta do Cliente') : null;
          const notes = result.notes || '';

          // Task 3: Não agrupar de 12 em 12 horas. Cada novo avanço da conversa é um novo pedido.
          // Só ignoramos se a última mensagem da conversa for EXATAMENTE a mesma já salva (evita loop da varredura de 30min).
          const existing = db.prepare(`
            SELECT id FROM deliveries WHERE phone = ? AND last_message_id = ? LIMIT 1
          `).get(cleanPhone, lastMsgId);

          if (existing) {
            // O chat não avançou desde a última varredura. Ignorar para não criar cópia idêntica.
            continue;
          }

          if (isClosed) {
            stats.closedSalesCount++;
            stats.closedSalesAmount += totalAmount;
          } else {
            stats.unclosedSalesCount++;
            stats.unclosedSalesAmount += totalAmount;
          }

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
