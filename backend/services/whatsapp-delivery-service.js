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
   - "products_discussed": Array contendo os nomes individuais de TODOS os produtos ou medicamentos citados/consultados na conversa. Exemplo: ["Dipirona 500mg", "Dorflex 30 comprimidos"]. Se nenhum produto for citado, retorne [].
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
  "products_discussed": ["Produto 1", "Produto 2"],
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
    }).slice(0, 1000);

    // Salvar contatos cacheados para recuperar nomes
    try {
      const insertContact = db.prepare(`
        INSERT INTO whatsapp_contacts (id, name, pushName, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET 
          name = CASE WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name ELSE whatsapp_contacts.name END,
          pushName = CASE WHEN excluded.pushName IS NOT NULL AND excluded.pushName != '' THEN excluded.pushName ELSE whatsapp_contacts.pushName END,
          updated_at = CURRENT_TIMESTAMP
      `);
      db.transaction((chats) => {
        for (const c of chats) {
          const jid = c.id || c.remoteJid || '';
          const phone = jid.split('@')[0];
          const name = c.name || (c.contact && c.contact.name) || '';
          const pushName = c.pushName || (c.contact && c.contact.pushName) || '';
          if (name || pushName) {
            if (jid) insertContact.run(jid, name, pushName);
            if (phone) {
              insertContact.run(phone, name, pushName);
              insertContact.run(phone + '@s.whatsapp.net', name, pushName);
            }
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
            const msgPushName = m.pushName || (m.key && m.key.pushName) || '';

            // Se for mensagem recebida e tiver pushName (nickname do WhatsApp), cacheia!
            if (!fromMe && msgPushName && msgPushName.trim() !== '') {
              try {
                db.prepare(`
                  INSERT INTO whatsapp_contacts (id, name, pushName, updated_at)
                  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(id) DO UPDATE SET pushName = excluded.pushName, updated_at = CURRENT_TIMESTAMP
                `).run(phone, '', msgPushName.trim());

                db.prepare(`
                  INSERT INTO whatsapp_contacts (id, name, pushName, updated_at)
                  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(id) DO UPDATE SET pushName = excluded.pushName, updated_at = CURRENT_TIMESTAMP
                `).run(phone + '@s.whatsapp.net', '', msgPushName.trim());
              } catch (e) {}
            }

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

      // Task 3: Não agrupar de 12 em 12 horas. Cada novo avanço da conversa é um novo pedido.
      // Movemos essa checagem para ANTES de chamar a IA, economizando absurdamente o tempo de processamento e limite de requisições.
      const existing = db.prepare(`
        SELECT id FROM deliveries WHERE phone = ? AND last_message_id = ? LIMIT 1
      `).get(cleanPhone, lastMsgId);

      if (existing) {
        continue;
      }

      // Métricas da conversa
      const timestamps = messages.map(m => m.timestamp);
      const minTimestamp = Math.min(...timestamps);
      const maxTimestamp = Math.max(...timestamps);
      const chatDurationSeconds = messages.length > 1 ? Math.round((maxTimestamp - minTimestamp) / 1000) : 0;
      const chatMessageCount = messages.length;

      // Verificação de Novo Cliente (is_new_customer)
      let isNewCustomer = 1;
      try {
        const phoneSuffix = cleanPhone.length >= 8 ? cleanPhone.slice(-8) : cleanPhone;
        const hasPriorClosedDelivery = db.prepare(`
          SELECT id FROM deliveries WHERE phone = ? AND sale_closed = 1 LIMIT 1
        `).get(cleanPhone);

        const hasCustomerRecord = db.prepare(`
          SELECT id FROM customers WHERE phone LIKE ? OR phone = ? LIMIT 1
        `).get(`%${phoneSuffix}%`, cleanPhone);

        const hasPriorSale = db.prepare(`
          SELECT s.id FROM sales s
          JOIN customers c ON s.customer_id = c.id
          WHERE (c.phone LIKE ? OR c.phone = ?) AND s.status = 'Finalizada'
          LIMIT 1
        `).get(`%${phoneSuffix}%`, cleanPhone);

        if (hasPriorClosedDelivery || hasCustomerRecord || hasPriorSale) {
          isNewCustomer = 0;
        }
      } catch (errCust) {
        try {
          const hasPriorClosedDelivery = db.prepare(`
            SELECT id FROM deliveries WHERE phone = ? AND sale_closed = 1 LIMIT 1
          `).get(cleanPhone);
          if (hasPriorClosedDelivery) isNewCustomer = 0;
        } catch (e2) {}
      }

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
          const isClosed = result.sale_closed !== false;
          
          const invalidItems = !itemsStr || itemsStr.trim() === '' || itemsStr.toLowerCase().includes('produtos consultados') || itemsStr.toLowerCase().includes('não identificado') || itemsStr.toLowerCase().includes('não informado');
          if (invalidItems && !isClosed) {
            continue;
          }
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
          const reviewStatus = !isClosed ? 'pending_review' : null;

          const discussedProducts = Array.isArray(result.products_discussed)
            ? result.products_discussed
            : (itemsStr ? [itemsStr] : []);
          const discussedProductsJson = JSON.stringify(discussedProducts);

          if (isClosed) {
            stats.closedSalesCount++;
            stats.closedSalesAmount += totalAmount;
          } else {
            stats.unclosedSalesCount++;
            stats.unclosedSalesAmount += totalAmount;
          }

          const existingPending = db.prepare(`
            SELECT id FROM deliveries WHERE phone = ? AND review_status = 'pending_review' LIMIT 1
          `).get(cleanPhone);

          if (existingPending) {
            db.prepare(`
              UPDATE deliveries SET
                customer_name = ?,
                delivery_address = ?,
                items = ?,
                total_amount = ?,
                payment_method = ?,
                status = ?,
                sale_closed = ?,
                unclosed_reason = ?,
                last_message_id = ?,
                notes = ?,
                review_status = ?,
                is_new_customer = ?,
                chat_duration_seconds = ?,
                chat_message_count = ?,
                discussed_products_json = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(
              finalName,
              address,
              itemsStr,
              totalAmount,
              paymentMethod,
              status,
              isClosed ? 1 : 0,
              unclosedReason,
              lastMsgId,
              notes,
              reviewStatus,
              isNewCustomer,
              chatDurationSeconds,
              chatMessageCount,
              discussedProductsJson,
              existingPending.id
            );
          } else {
            const deliveryId = `deliv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            db.prepare(`
              INSERT INTO deliveries (
                id, phone, customer_name, delivery_address, items,
                total_amount, payment_method, status, sale_closed, unclosed_reason,
                last_message_id, notes,
                review_status, is_new_customer, chat_duration_seconds, chat_message_count, discussed_products_json
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              notes,
              reviewStatus,
              isNewCustomer,
              chatDurationSeconds,
              chatMessageCount,
              discussedProductsJson
            );
          }
        }
      } catch (aiErr) {
        stats.errors++;
        console.error(`[DeliveryAIService] ⚠️ Erro ao auditar chat de ${cleanPhone}:`, aiErr.message);
      }
      
      // Delay de 3 segundos para evitar 429 Too Many Requests (Gemini/OpenAI)
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log(`[DeliveryAIService] ✅ Auditoria concluída. Vendas Fechadas: ${stats.closedSalesCount} (R$ ${stats.closedSalesAmount.toFixed(2)}), Não Fechadas: ${stats.unclosedSalesCount} (R$ ${stats.unclosedSalesAmount.toFixed(2)})`);
  } catch (err) {
    console.error('[DeliveryAIService] ❌ Erro geral na auditoria:', err);
  }

  return stats;
}

/**
 * Sincroniza conversas da Evolution API e coloca na fila de pendentes (sem chamar a IA em lote)
 */
async function syncAndEnqueueChats(db, options = {}) {
  await syncMessagesFromEvolution(db);

  let minTimestamp = options.minTimestamp;
  if (!minTimestamp) {
    if (options.startDate) {
      minTimestamp = new Date(`${options.startDate}T00:00:00`).getTime();
    } else {
      // Padrão: 01 de Agosto de 2026 às 00:00:00
      minTimestamp = new Date('2026-08-01T00:00:00').getTime();
    }
  }

  console.log(`[DeliveryAIService] 📥 Buscando conversas desde ${new Date(minTimestamp).toLocaleDateString('pt-BR')} para enfileirar...`);

  try {
    const recentChats = db.prepare(`
      SELECT phone, MAX(timestamp) as lastTimestamp, COUNT(*) as msgCount
      FROM whatsapp_messages
      WHERE timestamp >= ? AND phone IS NOT NULL AND phone != ''
      GROUP BY phone
      HAVING msgCount >= 1
      ORDER BY lastTimestamp DESC
      LIMIT 1000
    `).all(minTimestamp);

    let enqueuedCount = 0;

    for (const chat of recentChats) {
      const cleanPhone = formatPhone(chat.phone);
      if (!cleanPhone) continue;

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

      const lastMsg = messages[messages.length - 1];
      const lastMsgId = lastMsg.id || `msg_${lastMsg.timestamp}`;
      const lastSnippet = lastMsg.messageText ? lastMsg.messageText.substring(0, 100) : '';

      // Nome do cliente
      let customerName = 'Cliente WhatsApp';
      try {
        const cust = db.prepare('SELECT name FROM customers WHERE phone LIKE ? OR phone = ? LIMIT 1').get(`%${cleanPhone.slice(-8)}%`, cleanPhone);
        if (cust && cust.name && cust.name.trim() !== '' && !/^\d{10,}$/.test(cust.name)) {
          customerName = cust.name.trim();
        } else {
          const waContact = db.prepare(`
            SELECT name, pushName FROM whatsapp_contacts 
            WHERE id = ? OR id = ? OR id = ? OR id LIKE ? 
            LIMIT 1
          `).get(cleanPhone, chat.phone, chat.phone + '@s.whatsapp.net', `%${cleanPhone.slice(-8)}%`);
          if (waContact) {
            const best = (waContact.pushName && waContact.pushName.trim()) || (waContact.name && waContact.name.trim());
            if (best && !/^\d{10,}$/.test(best)) {
              customerName = best;
            }
          }
        }
      } catch (e) {}

      // Métricas da conversa
      const timestamps = messages.map(m => m.timestamp);
      const chatMinTs = Math.min(...timestamps);
      const chatMaxTs = Math.max(...timestamps);
      const chatDurationSeconds = messages.length > 1 ? Math.round((chatMaxTs - chatMinTs) / 1000) : 0;
      const chatMessageCount = messages.length;

      // Verificação de Novo Cliente
      let isNewCustomer = 1;
      try {
        const phoneSuffix = cleanPhone.length >= 8 ? cleanPhone.slice(-8) : cleanPhone;
        const hasPriorClosedDelivery = db.prepare(`
          SELECT id FROM deliveries WHERE phone = ? AND sale_closed = 1 LIMIT 1
        `).get(cleanPhone);

        const hasCustomerRecord = db.prepare(`
          SELECT id FROM customers WHERE phone LIKE ? OR phone = ? LIMIT 1
        `).get(`%${phoneSuffix}%`, cleanPhone);

        const hasPriorSale = db.prepare(`
          SELECT s.id FROM sales s
          JOIN customers c ON s.customer_id = c.id
          WHERE (c.phone LIKE ? OR c.phone = ?) AND s.status = 'Finalizada'
          LIMIT 1
        `).get(`%${phoneSuffix}%`, cleanPhone);

        if (hasPriorClosedDelivery || hasCustomerRecord || hasPriorSale) {
          isNewCustomer = 0;
        }
      } catch (errCust) {}

      // Verifica se já existe registro dessa conversa
      const existing = db.prepare(`
        SELECT id, review_status FROM deliveries WHERE phone = ? LIMIT 1
      `).get(cleanPhone);

      if (!existing) {
        const deliveryId = `deliv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        db.prepare(`
          INSERT INTO deliveries (
            id, phone, customer_name, delivery_address, items,
            total_amount, payment_method, status, sale_closed, unclosed_reason,
            last_message_id, notes,
            review_status, is_new_customer, chat_duration_seconds, chat_message_count, discussed_products_json,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch', 'localtime'))
        `).run(
          deliveryId,
          cleanPhone,
          customerName,
          null,
          lastSnippet,
          0,
          null,
          'Pendente',
          0,
          null,
          lastMsgId,
          `Última mensagem: "${lastSnippet}"`,
          'pending_review',
          isNewCustomer,
          chatDurationSeconds,
          chatMessageCount,
          JSON.stringify([]),
          Math.round(lastMsg.timestamp / 1000)
        );
        enqueuedCount++;
      }
    }

    console.log(`[DeliveryAIService] ✅ Enfileiramento concluído. ${enqueuedCount} novas conversas pendentes adicionadas.`);
    return { enqueuedCount, totalProcessed: recentChats.length };
  } catch (err) {
    console.error('[DeliveryAIService] ❌ Erro ao sincronizar e enfileirar conversas:', err);
    throw err;
  }
}

/**
 * Analisa uma única conversa sob demanda usando a IA quando o atendente clica em Cotação ou Pedido
 */
async function analyzeSingleChatWithAI(db, deliveryId, targetType = 'cotacao') {
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
  if (!delivery) {
    throw new Error('Registro de entrega/conversa não encontrado.');
  }

  const cleanPhone = formatPhone(delivery.phone);
  const messages = db.prepare(`
    SELECT * FROM (
      SELECT id, fromMe, messageText, timestamp
      FROM whatsapp_messages
      WHERE phone = ? OR phone = ?
      ORDER BY timestamp DESC
      LIMIT 50
    )
    ORDER BY timestamp ASC
  `).all(cleanPhone, delivery.phone);

  if (!messages || messages.length === 0) {
    return {
      delivery_address: delivery.delivery_address || '',
      items: delivery.items || '',
      total_amount: delivery.total_amount || 0,
      payment_method: delivery.payment_method || 'PIX',
      unclosed_reason: delivery.unclosed_reason || 'Preço',
      products_discussed: [],
      notes: delivery.notes || ''
    };
  }

  const customerName = delivery.customer_name || 'Cliente WhatsApp';
  const transcript = messages.map(m => {
    const sender = m.fromMe === 1 ? 'Atendente BelaFarma' : customerName;
    const hora = new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `[${hora}] ${sender}: ${m.messageText}`;
  }).join('\n');

  const userPrompt = `
Analise a conversa WhatsApp com o cliente (${customerName} - Tel: ${cleanPhone}) para o tipo de registro "${targetType.toUpperCase()}":

--- CONVERSA ---
${transcript}
--- FIM ---

Analise e extraia os dados em JSON.
`;

  try {
    const aiResponseText = await callAI(userPrompt, DELIVERY_AUDIT_SYSTEM_PROMPT, { temperature: 0.2 });
    const result = parseJsonFromAiResponse(aiResponseText) || {};

    const itemsStr = result.items || '';
    const discussedProducts = Array.isArray(result.products_discussed)
      ? result.products_discussed
      : (itemsStr ? [itemsStr] : []);

    const updatedData = {
      customer_name: (result.customer_name && result.customer_name !== 'Cliente') ? result.customer_name : customerName,
      delivery_address: result.delivery_address || '',
      items: itemsStr,
      products_discussed: discussedProducts,
      total_amount: parseFloat(result.total_amount) || 0,
      payment_method: result.payment_method || 'PIX',
      unclosed_reason: result.unclosed_reason || (targetType === 'cotacao' ? 'Preço' : null),
      notes: result.notes || ''
    };

    // Atualiza o registro no banco com a análise da IA
    db.prepare(`
      UPDATE deliveries SET
        customer_name = ?,
        delivery_address = ?,
        items = ?,
        total_amount = ?,
        payment_method = ?,
        unclosed_reason = ?,
        notes = ?,
        discussed_products_json = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      updatedData.customer_name,
      updatedData.delivery_address,
      updatedData.items,
      updatedData.total_amount,
      updatedData.payment_method,
      updatedData.unclosed_reason,
      updatedData.notes,
      JSON.stringify(updatedData.products_discussed),
      deliveryId
    );

    return updatedData;
  } catch (err) {
    console.error(`[DeliveryAIService] ⚠️ Erro ao analisar conversa de ${cleanPhone} com IA:`, err.message);
    throw err;
  }
}

module.exports = {
  scanDeliveriesFromWhatsApp,
  syncAndEnqueueChats,
  analyzeSingleChatWithAI
};

