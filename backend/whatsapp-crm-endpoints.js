/**
 * whatsapp-crm-endpoints.js
 * CRM WhatsApp — Importação de clientes, histórico de produtos e integração de faltas
 */

const { callAI } = require('./services/ai.service');

const EVOLUTION_MAIN_INSTANCE = process.env.EVOLUTION_MAIN_INSTANCE || 'belaFarma';
const API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const API_KEY = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_SENDER_API_KEY || 'BelafarmaSul2026';

// Helper: limpar e normalizar telefone
function cleanPhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

// Helper: formatar telefone no formato do usuário: 03288634755
function formatToUserPhone(phone) {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  
  // Ignorar LIDs e números de Grupos inválidos (120363...)
  if (clean.startsWith('120363') || clean.length > 13 || clean.length < 10) return '';
  
  // Remover o DDI brasileiro (55) se estiver presente
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    clean = clean.slice(2);
  }
  
  // Garantir que comece com '0' se tiver 10 ou 11 dígitos
  if (clean.length === 10 || clean.length === 11) {
    if (!clean.startsWith('0')) {
      clean = '0' + clean;
    }
  } else {
    // Se sobrou algum tamanho estranho, descartamos
    return '';
  }
  
  return clean;
}

// Helper: identificar nomes genéricos
function isGenericName(name) {
  if (!name) return true;
  const lower = name.toLowerCase().trim();
  return lower === 'contato whatsapp' || lower === 'cliente whatsapp' || lower === 'whatsapp' || lower === 'contato' || lower === 'contato whatsapp crm';
}

// Helper: verificar se dois telefones são o mesmo (últimos 8 dígitos)
function isSamePhone(a, b) {
  const ca = cleanPhone(a);
  const cb = cleanPhone(b);
  if (!ca || !cb) return false;
  const na = ca.startsWith('55') ? ca.slice(2) : ca;
  const nb = cb.startsWith('55') ? cb.slice(2) : cb;
  return na.slice(-8) === nb.slice(-8);
}

// Helper: gerar ID único
function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

// Helper: chamar a Evolution API com timeout
async function evolutionFetch(path, options = {}) {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': API_KEY,
      ...(options.headers || {}),
    },
  });
  return res;
}

/**
 * Inicializa os endpoints do CRM WhatsApp
 */
function initializeWhatsAppCRMEndpoints(app, db) {

  // ─── POST /api/whatsapp/import-customers ─────────────────────────────────
  /**
   * Importa todos os contatos/chats do WhatsApp para o banco de dados.
   * Para cada contato individual:
   *  - Cria/atualiza na tabela customers
   *  - Busca histórico de mensagens e chama a IA para extrair endereço e produtos
   *  - Salva produtos em whatsapp_product_history
   *  - Insere produtos "nao_encontrado" na tabela shortages com source='WhatsApp'
   */
  app.post('/api/whatsapp/import-customers', async (req, res) => {
    const stats = { total: 0, imported: 0, updated: 0, skipped: 0, productsFound: 0, shortagesAdded: 0 };

    try {
      console.log('[WhatsAppCRM] 🚀 Iniciando importação de clientes do WhatsApp...');

      // 0. Limpeza automática de registros de poluição anteriores (LIDs gigantes cadastrados por engano)
      try {
        const deleteHistory = db.prepare(`
          DELETE FROM whatsapp_product_history 
          WHERE phone IN (SELECT phone FROM customers WHERE source = 'WhatsApp' AND (length(phone) > 13 OR phone LIKE '%@lid'))
        `).run();
        
        const deleteCustomers = db.prepare(`
          DELETE FROM customers 
          WHERE source = 'WhatsApp' AND (length(phone) > 13 OR phone LIKE '%@lid')
        `).run();
        
        if (deleteCustomers.changes > 0) {
          console.log(`[WhatsAppCRM] 🧼 Limpeza de poluição: ${deleteCustomers.changes} contatos LID inválidos e seu histórico foram removidos.`);
        }
      } catch (cleanErr) {
        console.warn('[WhatsAppCRM] ⚠️ Falha na limpeza de poluição inicial:', cleanErr.message);
      }

      // 1. Buscar todos os chats
      let chats = [];
      try {
        const chatsRes = await evolutionFetch(`/chat/findChats/${EVOLUTION_MAIN_INSTANCE}`);
        if (chatsRes.ok) {
          const data = await chatsRes.json();
          chats = Array.isArray(data) ? data : (data.chats || data.data || []);
          console.log(`[WhatsAppCRM] 📥 ${chats.length} chats encontrados.`);
        } else {
          console.warn(`[WhatsAppCRM] ⚠️ Erro ao buscar chats: ${chatsRes.status}`);
        }
      } catch (e) {
        console.warn('[WhatsAppCRM] ⚠️ Falha ao buscar chats:', e.message);
      }

      // 2. Buscar todos os contatos da agenda
      let contacts = [];
      try {
        const contactsRes = await evolutionFetch(`/chat/findContacts/${EVOLUTION_MAIN_INSTANCE}`, {
          method: 'POST',
          body: JSON.stringify({ where: {} }),
        });
        if (contactsRes.ok) {
          const data = await contactsRes.json();
          contacts = Array.isArray(data) ? data : (data.contacts || data.data || []);
          console.log(`[WhatsAppCRM] 📥 ${contacts.length} contatos encontrados.`);
        } else {
          console.warn(`[WhatsAppCRM] ⚠️ Erro ao buscar contatos: ${contactsRes.status}`);
        }
      } catch (e) {
        console.warn('[WhatsAppCRM] ⚠️ Falha ao buscar contatos:', e.message);
      }

      // 3. Montar mapa unificado de contatos (chats têm prioridade sobre agenda)
      const contactMap = new Map(); // chave: telefone formatado (ex: 03288634755)

      // Adicionar da agenda primeiro (base)
      for (const c of contacts) {
        const jid = c.id || c.remoteJid || '';
        if (!jid || jid.includes('@g.us') || jid.includes('@broadcast')) continue;
        const phone = jid.split('@')[0];
        const formattedPhone = formatToUserPhone(phone);
        if (!formattedPhone) continue; // Ignora LIDs gigantes e números inválidos

        contactMap.set(formattedPhone, {
          phone: formattedPhone,
          name: c.pushName || c.name || 'Contato WhatsApp',
          jid,
          hasChat: false,
          lastInteraction: null,
        });
      }

      // Sobrescrever/complementar com dados dos chats (chats têm mais info)
      for (const c of chats) {
        const jid = c.id || c.remoteJid || '';
        if (!jid || jid.includes('@g.us') || jid.includes('@broadcast')) continue;
        const phone = jid.split('@')[0];
        const formattedPhone = formatToUserPhone(phone);
        if (!formattedPhone) continue; // Ignora LIDs gigantes e números inválidos

        const existing = contactMap.get(formattedPhone) || {};
        const lastTimestamp = c.updatedAt || c.messageTimestamp
          ? new Date(c.updatedAt || c.messageTimestamp * 1000).toISOString()
          : null;

        contactMap.set(formattedPhone, {
          phone: formattedPhone,
          name: c.name || c.pushName || existing.name || 'Contato WhatsApp',
          jid,
          hasChat: true,
          lastInteraction: lastTimestamp,
          lastMessage: c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || '',
        });
      }

      stats.total = contactMap.size;
      console.log(`[WhatsAppCRM] 🔢 Total de contatos únicos: ${stats.total}`);

      // 4. Para cada contato, processar no banco
      for (const [phone, contact] of contactMap) {
        try {
          // Verificar se já existe no customers
          const existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone)
            || db.prepare('SELECT * FROM customers WHERE phone LIKE ?').get(`%${phone.slice(-8)}%`);

          let customerId = existing?.id || null;
          const now = new Date().toISOString();

          // Tratar o nome para evitar nomes genéricos se tivermos um nome real
          const finalName = isGenericName(contact.name) && existing?.name && !isGenericName(existing.name)
            ? existing.name
            : contact.name;

          if (!existing) {
            // Criar novo cliente
            customerId = genId('cust');
            db.prepare(`
              INSERT INTO customers (id, name, phone, whatsapp_name, source, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, 'WhatsApp', ?, ?)
            `).run(customerId, finalName, phone, finalName, now, now);
            stats.imported++;
            console.log(`[WhatsAppCRM] ➕ Novo cliente: ${finalName} (${phone})`);
          } else {
            // Atualizar apenas campos em branco ou desatualizados
            const updates = [];
            const params = [];

            // Se o nome atual do banco for genérico (ou nulo) e o da API for melhor/real
            if ((!existing.name || isGenericName(existing.name)) && !isGenericName(contact.name)) {
              updates.push('name = ?');
              params.push(contact.name);
            }
            
            // Atualizar nome do whatsapp se for vazio ou genérico
            if (!existing.whatsapp_name || (isGenericName(existing.whatsapp_name) && !isGenericName(contact.name))) {
              updates.push('whatsapp_name = ?');
              params.push(contact.name);
            }

            // Atualizar formato de telefone para o padrão do usuário (03288634755) se estiver diferente
            if (existing.phone !== phone) {
              updates.push('phone = ?');
              params.push(phone);
              // Sincronizar também o telefone nas tabelas de histórico
              try {
                db.prepare('UPDATE whatsapp_product_history SET phone = ? WHERE phone = ? OR phone = ?')
                  .run(phone, existing.phone, existing.phone.replace(/\D/g, ''));
                console.log(`[WhatsAppCRM] 🔄 Telefone atualizado em whatsapp_product_history de ${existing.phone} para ${phone}`);
              } catch (historyErr) {
                console.warn(`[WhatsAppCRM] ⚠️ Erro ao atualizar histórico de produtos:`, historyErr.message);
              }
            }

            if (!existing.source) {
              updates.push("source = 'WhatsApp'");
            }

            if (updates.length > 0) {
              updates.push('updatedAt = ?');
              params.push(now);
              
              // Executar a query de atualização
              params.push(existing.id);
              db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
              stats.updated++;
              console.log(`[WhatsAppCRM] 📝 Cliente atualizado: ${existing.name || finalName} (Telefone: ${existing.phone} -> ${phone})`);
            } else {
              stats.skipped++;
            }
          }

          // 5. Processar histórico de mensagens via IA (somente para contatos com chat)
          if (contact.hasChat && customerId) {
            let dialog = '';
            try {
              const msgsRes = await evolutionFetch(`/chat/findMessages/${EVOLUTION_MAIN_INSTANCE}`, {
                method: 'POST',
                body: JSON.stringify({
                  where: { key: { remoteJid: contact.jid } },
                  limit: 30,
                }),
              });

              if (msgsRes.ok) {
                const msgsData = await msgsRes.json();
                const messagesList = Array.isArray(msgsData) ? msgsData : (msgsData.records || []);
                const sorted = [...messagesList].reverse();

                dialog = sorted.map(m => {
                  const sender = m.key?.fromMe ? 'Atendente/Bela' : 'Cliente';
                  const msg = m.message;
                  let text = '';
                  if (msg) {
                    text = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || '';
                    if (!text && msg.imageMessage) text = '[Imagem]';
                    if (!text && msg.audioMessage) text = '[Áudio]';
                  }
                  return text ? `${sender}: ${text}` : null;
                }).filter(Boolean).join('\n');
              }
            } catch (e) {
              console.warn(`[WhatsAppCRM] ⚠️ Erro ao buscar mensagens de ${phone}:`, e.message);
            }

            // Analisar conversa com IA se houver diálogo
            if (dialog && dialog.length > 20) {
              try {
                const systemPrompt = `Você é o analista de CRM da farmácia BelaFarma.
Leia a conversa de WhatsApp e responda SOMENTE com um JSON válido (sem markdown) contendo:
{
  "endereco": "endereço completo de entrega mencionado na conversa, ou null",
  "produtos": [
    {
      "nome": "Nome do produto mencionado",
      "status": "comprado" | "pesquisado" | "nao_encontrado" | "cancelado"
    }
  ]
}
Regras:
- "comprado": cliente confirmou compra ou combinou entrega/retirada
- "pesquisado": cliente perguntou sobre o produto mas não comprou
- "nao_encontrado": a farmácia informou que não tinha o produto em estoque
- "cancelado": cliente desistiu após receber o preço ou por outro motivo
- Se não houver produtos relevantes, retorne produtos: []`;

                const aiResponse = await callAI(
                  `Analise esta conversa:\n---\n${dialog}\n---`,
                  systemPrompt,
                  { temperature: 0.1 }
                );

                let cleaned = aiResponse.trim().replace(/^```json?\s*/i, '').replace(/```$/, '').trim();
                const parsed = JSON.parse(cleaned);
                const aiData = (parsed && typeof parsed === 'object') ? parsed : {};

                // Atualizar endereço do cliente se extraído e não preenchido
                if (aiData.endereco) {
                  const customerNow = db.prepare('SELECT address FROM customers WHERE id = ?').get(customerId);
                  if (!customerNow?.address) {
                    db.prepare('UPDATE customers SET address = ?, updatedAt = ? WHERE id = ?')
                      .run(aiData.endereco, now, customerId);
                    console.log(`[WhatsAppCRM] 📍 Endereço extraído para ${phone}: ${aiData.endereco}`);
                  }
                }

                // Salvar produtos no histórico
                if (Array.isArray(aiData.produtos)) {
                  for (const prod of aiData.produtos) {
                    if (!prod.nome || prod.nome.length < 2) continue;

                    // Verificar duplicata recente (mesmo produto + status nos últimos 30 dias)
                    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                    const exists = db.prepare(`
                      SELECT id FROM whatsapp_product_history
                      WHERE phone = ? AND product_name = ? AND status = ? AND created_at > ?
                    `).get(phone, prod.nome, prod.status, thirtyDaysAgo);

                    if (!exists) {
                      db.prepare(`
                        INSERT INTO whatsapp_product_history
                        (id, phone, customer_id, product_name, status, interaction_date, source, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, 'WhatsApp', ?)
                      `).run(
                        genId('wph'),
                        phone,
                        customerId,
                        prod.nome,
                        prod.status,
                        contact.lastInteraction || now,
                        now
                      );
                      stats.productsFound++;

                      // Se produto não encontrado → inserir na lista de faltas
                      if (prod.status === 'nao_encontrado') {
                        const shortageExists = db.prepare(`
                          SELECT id FROM shortages WHERE productName = ? AND source = 'WhatsApp'
                        `).get(prod.nome);

                        if (!shortageExists) {
                          db.prepare(`
                            INSERT INTO shortages (id, productName, type, clientInquiry, notes, createdAt, userName, source)
                            VALUES (?, ?, 'Medicamento', 1, ?, datetime('now'), 'WhatsApp CRM', 'WhatsApp')
                          `).run(
                            genId('sh'),
                            prod.nome,
                            `Detectado automaticamente via análise de conversa WhatsApp com ${contact.name} (${phone})`
                          );
                          stats.shortagesAdded++;
                          console.log(`[WhatsAppCRM] 🔴 Falta adicionada: ${prod.nome} (solicitado por ${contact.name})`);
                        }
                      }
                    }
                  }
                }
              } catch (aiErr) {
                console.warn(`[WhatsAppCRM] ⚠️ Erro de IA para ${phone}:`, aiErr.message);
              }
            }
          }
        } catch (contactErr) {
          console.error(`[WhatsAppCRM] ❌ Erro ao processar ${phone}:`, contactErr.message);
        }
      }

      console.log(`[WhatsAppCRM] ✅ Importação concluída:`, stats);
      res.json({ success: true, stats });

    } catch (err) {
      console.error('[WhatsAppCRM] ❌ Erro crítico na importação:', err);
      res.status(500).json({ error: err.message, stats });
    }
  });

  // ─── GET /api/whatsapp/crm-customers ─────────────────────────────────────
  /**
   * Lista todos os clientes com histórico de WhatsApp.
   * Suporta ?search=nome/telefone e ?status=nao_encontrado
   */
  app.get('/api/whatsapp/crm-customers', (req, res) => {
    try {
      const { search, product_status } = req.query;

      let query = `
        SELECT DISTINCT c.*,
          (SELECT COUNT(*) FROM whatsapp_product_history wph WHERE wph.phone = c.phone) as product_count,
          (SELECT COUNT(*) FROM whatsapp_product_history wph WHERE wph.phone = c.phone AND wph.status = 'nao_encontrado') as not_found_count,
          (SELECT COUNT(*) FROM whatsapp_product_history wph WHERE wph.phone = c.phone AND wph.status = 'comprado') as purchased_count,
          (SELECT MAX(wph.interaction_date) FROM whatsapp_product_history wph WHERE wph.phone = c.phone) as last_product_interaction
        FROM customers c
        WHERE (c.source = 'WhatsApp' OR c.whatsapp_name IS NOT NULL)
      `;
      const params = [];

      if (search) {
        query += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.whatsapp_name LIKE ?)`;
        const s = `%${search}%`;
        params.push(s, s, s);
      }

      if (product_status) {
        query += ` AND EXISTS (
          SELECT 1 FROM whatsapp_product_history wph
          WHERE wph.phone = c.phone AND wph.status = ?
        )`;
        params.push(product_status);
      }

      query += ` ORDER BY c.updatedAt DESC`;

      const customers = db.prepare(query).all(...params);

      res.json({
        total: customers.length,
        customers,
      });
    } catch (err) {
      console.error('[WhatsAppCRM] Erro ao listar clientes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/whatsapp/crm-customers/:id ─────────────────────────────────
  /**
   * Retorna o detalhe completo de um cliente com todo o histórico de produtos.
   */
  app.get('/api/whatsapp/crm-customers/:id', (req, res) => {
    try {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
      if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });

      const productHistory = db.prepare(`
        SELECT * FROM whatsapp_product_history
        WHERE phone = ?
        ORDER BY interaction_date DESC, created_at DESC
      `).all(customer.phone);

      // Agrupar por status
      const byStatus = {
        comprado: productHistory.filter(p => p.status === 'comprado'),
        pesquisado: productHistory.filter(p => p.status === 'pesquisado'),
        nao_encontrado: productHistory.filter(p => p.status === 'nao_encontrado'),
        cancelado: productHistory.filter(p => p.status === 'cancelado'),
      };

      // Buscar histórico de mensagens de WhatsApp salvas para este cliente
      const cleanPhoneStr = customer.phone ? customer.phone.replace(/\D/g, '') : '';
      const phoneSuffix = cleanPhoneStr.length >= 8 ? cleanPhoneStr.slice(-8) : cleanPhoneStr;

      let chatMessages = [];
      try {
        chatMessages = db.prepare(`
          SELECT id, fromMe, messageText as text, timestamp
          FROM whatsapp_messages
          WHERE phone = ? OR phone = ? OR (phone IS NOT NULL AND phone LIKE ?)
          ORDER BY timestamp ASC
          LIMIT 100
        `).all(customer.phone, cleanPhoneStr, `%${phoneSuffix}`);

        // Se não houver mensagens locais salvas no SQLite, busca ao vivo da Evolution API
        if (chatMessages.length === 0 && cleanPhoneStr && !cleanPhoneStr.startsWith('120363')) {
          const formattedJid = cleanPhoneStr.length >= 12 ? `${cleanPhoneStr}@s.whatsapp.net` : `55${cleanPhoneStr}@s.whatsapp.net`;
          try {
            const evoRes = await fetch(`${API_URL}/chat/findMessages/${EVOLUTION_MAIN_INSTANCE}`, {
              method: 'POST',
              headers: {
                'apikey': API_KEY,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                where: { key: { remoteJid: formattedJid } },
                limit: 40
              })
            });

            if (evoRes.ok) {
              const evoData = await evoRes.json();
              const records = Array.isArray(evoData) ? evoData : (evoData.records || evoData.data || []);
              for (const m of records) {
                const msgId = m.key?.id || `msg_${m.messageTimestamp}_${Math.random()}`;
                const fromMe = m.key?.fromMe ? 1 : 0;
                let text = '';
                if (m.message) {
                  text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || '';
                }
                if (!text) continue;
                const ts = m.messageTimestamp ? m.messageTimestamp * 1000 : Date.now();

                db.prepare(`
                  INSERT OR REPLACE INTO whatsapp_messages (id, phone, fromMe, messageText, timestamp)
                  VALUES (?, ?, ?, ?, ?)
                `).run(msgId, cleanPhoneStr, fromMe, text, ts);
              }

              // Re-consulta o SQLite após gravar
              chatMessages = db.prepare(`
                SELECT id, fromMe, messageText as text, timestamp
                FROM whatsapp_messages
                WHERE phone = ? OR phone = ? OR (phone IS NOT NULL AND phone LIKE ?)
                ORDER BY timestamp ASC
                LIMIT 100
              `).all(customer.phone, cleanPhoneStr, `%${phoneSuffix}`);
            }
          } catch (evoErr) {
            console.warn('[WhatsAppCRM] ⚠️ Falha ao sincronizar mensagens da Evolution API ao vivo:', evoErr.message);
          }
        }
      } catch (msgErr) {
        console.warn('[WhatsAppCRM] Erro ao buscar mensagens do cliente:', msgErr.message);
      }

      res.json({
        customer,
        productHistory,
        chatMessages,
        summary: {
          total: productHistory.length,
          byStatus,
        },
      });
    } catch (err) {
      console.error('[WhatsAppCRM] Erro ao buscar detalhe do cliente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/whatsapp/crm-stats ─────────────────────────────────────────
  /**
   * Estatísticas gerais do CRM WhatsApp.
   */
  app.get('/api/whatsapp/crm-stats', (req, res) => {
    try {
      const totalCustomers = db.prepare("SELECT COUNT(*) as c FROM customers WHERE source = 'WhatsApp' OR whatsapp_name IS NOT NULL").get()?.c || 0;
      const totalProducts = db.prepare('SELECT COUNT(*) as c FROM whatsapp_product_history').get()?.c || 0;
      const totalNotFound = db.prepare("SELECT COUNT(*) as c FROM whatsapp_product_history WHERE status = 'nao_encontrado'").get()?.c || 0;
      const totalPurchased = db.prepare("SELECT COUNT(*) as c FROM whatsapp_product_history WHERE status = 'comprado'").get()?.c || 0;
      const totalShortagesFromWA = db.prepare("SELECT COUNT(*) as c FROM shortages WHERE source = 'WhatsApp'").get()?.c || 0;

      // Top produtos não encontrados
      const topNotFound = db.prepare(`
        SELECT product_name, COUNT(*) as times
        FROM whatsapp_product_history
        WHERE status = 'nao_encontrado'
        GROUP BY product_name
        ORDER BY times DESC
        LIMIT 10
      `).all();

      // Top produtos comprados
      const topPurchased = db.prepare(`
        SELECT product_name, COUNT(*) as times
        FROM whatsapp_product_history
        WHERE status = 'comprado'
        GROUP BY product_name
        ORDER BY times DESC
        LIMIT 10
      `).all();

      res.json({
        totalCustomers,
        totalProducts,
        totalNotFound,
        totalPurchased,
        totalShortagesFromWA,
        topNotFound,
        topPurchased,
      });
    } catch (err) {
      console.error('[WhatsAppCRM] Erro ao buscar estatísticas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── DELETE /api/whatsapp/crm-customers/:customerId/products/:productId ───
  /**
   * Remove um produto do histórico de um cliente.
   */
  app.delete('/api/whatsapp/crm-customers/:customerId/products/:productId', (req, res) => {
    try {
      const result = db.prepare('DELETE FROM whatsapp_product_history WHERE id = ?').run(req.params.productId);
      if (result.changes === 0) return res.status(404).json({ error: 'Produto não encontrado' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/whatsapp/crm-reminders ──────────────────────────────────────
  /**
   * Retorna os clientes com lembretes ativos de uso contínuo para hoje.
   */
  app.get('/api/whatsapp/crm-reminders', (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const query = `
        SELECT 
          wph.id as history_id,
          wph.phone,
          wph.product_name,
          wph.last_purchase_date,
          wph.next_reminder_date,
          wph.treatment_duration_days,
          c.name as customer_name,
          c.id as customer_id
        FROM whatsapp_product_history wph
        JOIN customers c ON wph.phone = c.phone
        WHERE wph.is_continuous_use = 1 
          AND wph.reminder_status = 'pendente'
          AND wph.next_reminder_date <= ?
        ORDER BY wph.next_reminder_date ASC
      `;
      const reminders = db.prepare(query).all(today);
      res.json({ success: true, count: reminders.length, reminders });
    } catch (err) {
      console.error('[WhatsAppCRM] Erro ao buscar lembretes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── PUT /api/whatsapp/crm-products/:id/continuous ───────────────────────
  /**
   * Configura se um produto do histórico do cliente é de Uso Contínuo.
   */
  app.put('/api/whatsapp/crm-products/:id/continuous', (req, res) => {
    try {
      const { id } = req.params;
      const { is_continuous_use, treatment_duration_days, last_purchase_date } = req.body;

      const isContinuous = is_continuous_use ? 1 : 0;
      const duration = treatment_duration_days ? parseInt(treatment_duration_days) : 30;
      
      let lastPurchase = last_purchase_date;
      if (!lastPurchase) {
        lastPurchase = new Date().toISOString().split('T')[0]; // default to today
      }

      // Calcular próxima data de lembrete
      let nextReminder = null;
      if (isContinuous === 1) {
        const dateObj = new Date(lastPurchase + 'T12:00:00'); // evitar timezone shift
        dateObj.setDate(dateObj.getDate() + duration);
        nextReminder = dateObj.toISOString().split('T')[0];
      }

      const stmt = db.prepare(`
        UPDATE whatsapp_product_history
        SET is_continuous_use = ?,
            treatment_duration_days = ?,
            last_purchase_date = ?,
            next_reminder_date = ?,
            reminder_status = 'pendente'
        WHERE id = ?
      `);
      const result = stmt.run(isContinuous, duration, lastPurchase, nextReminder, id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Produto não encontrado no histórico.' });
      }

      res.json({ 
        success: true, 
        message: 'Configuração de uso contínuo atualizada.',
        data: { is_continuous_use: isContinuous, treatment_duration_days: duration, last_purchase_date: lastPurchase, next_reminder_date: nextReminder }
      });
    } catch (err) {
      console.error('[WhatsAppCRM] Erro ao configurar uso contínuo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/whatsapp/crm-reminders/:id/status ──────────────────────────
  /**
   * Atualiza o status do lembrete (enviado, ignorado, pendente).
   */
  app.post('/api/whatsapp/crm-reminders/:id/status', (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['enviado', 'ignorado', 'pendente'].includes(status)) {
        return res.status(400).json({ error: 'Status inválido.' });
      }

      const stmt = db.prepare(`
        UPDATE whatsapp_product_history
        SET reminder_status = ?
        WHERE id = ?
      `);
      const result = stmt.run(status, id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Lembrete não encontrado.' });
      }

      res.json({ success: true, message: `Status do lembrete atualizado para ${status}.` });
    } catch (err) {
      console.error('[WhatsAppCRM] Erro ao atualizar status do lembrete:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/whatsapp/crm-products/:id/record-purchase ─────────────────
  /**
   * Registra uma nova compra de um item de uso contínuo, reiniciando o ciclo.
   */
  app.post('/api/whatsapp/crm-products/:id/record-purchase', (req, res) => {
    try {
      const { id } = req.params;
      const { purchase_date } = req.body;

      const product = db.prepare('SELECT * FROM whatsapp_product_history WHERE id = ?').get(id);
      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado no histórico.' });
      }

      const duration = product.treatment_duration_days || 30;
      let lastPurchase = purchase_date;
      if (!lastPurchase) {
        lastPurchase = new Date().toISOString().split('T')[0];
      }

      const dateObj = new Date(lastPurchase + 'T12:00:00');
      dateObj.setDate(dateObj.getDate() + duration);
      const nextReminder = dateObj.toISOString().split('T')[0];

      const stmt = db.prepare(`
        UPDATE whatsapp_product_history
        SET last_purchase_date = ?,
            next_reminder_date = ?,
            reminder_status = 'pendente',
            notified_arrival = 0
        WHERE id = ?
      `);
      stmt.run(lastPurchase, nextReminder, id);

      res.json({ 
        success: true, 
        message: 'Nova compra registrada! Ciclo de lembrete reiniciado.',
        data: { last_purchase_date: lastPurchase, next_reminder_date: nextReminder }
      });
    } catch (err) {
      console.error('[WhatsAppCRM] Erro ao registrar nova compra:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/whatsapp/crm-shortages-resolved ────────────────────────────
  /**
   * Retorna clientes aguardando produtos indisponíveis que acabaram de chegar/ser comprados.
   */
  app.get('/api/whatsapp/crm-shortages-resolved', (req, res) => {
    try {
      const query = `
        SELECT DISTINCT
          wph.id as history_id,
          wph.product_name,
          wph.phone,
          wph.created_at as inquiry_date,
          c.name as customer_name,
          c.id as customer_id,
          s.id as shortage_id,
          s.purchased,
          s.ordered
        FROM whatsapp_product_history wph
        JOIN customers c ON wph.phone = c.phone
        JOIN shortages s ON (
          LOWER(s.productName) LIKE '%' || LOWER(wph.product_name) || '%'
          OR LOWER(wph.product_name) LIKE '%' || LOWER(s.productName) || '%'
        )
        WHERE wph.status = 'nao_encontrado'
          AND wph.notified_arrival = 0
          AND (s.purchased = 1 OR s.ordered = 1)
          AND wph.created_at >= date('now', '-30 days')
        ORDER BY wph.created_at DESC
      `;
      const resolved = db.prepare(query).all();
      res.json({ success: true, count: resolved.length, resolved });
    } catch (err) {
      console.error('[WhatsAppCRM] Erro ao buscar faltas resolvidas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/whatsapp/crm-shortages-resolved/:id/notified ─────────────
  /**
   * Marca uma indisponibilidade de produto como notificada de sua chegada.
   */
  app.post('/api/whatsapp/crm-shortages-resolved/:id/notified', (req, res) => {
    try {
      const { id } = req.params;
      const stmt = db.prepare(`
        UPDATE whatsapp_product_history
        SET notified_arrival = 1
        WHERE id = ?
      `);
      const result = stmt.run(id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Registro não encontrado.' });
      }

      res.json({ success: true, message: 'Notificação de chegada registrada com sucesso.' });
    } catch (err) {
      console.error('[WhatsAppCRM] Erro ao marcar chegada como notificada:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/whatsapp/crm-customers/:id/products ───────────────────────
  /**
   * Adiciona um produto manualmente ao histórico de compras/pesquisas do cliente.
   */
  app.post('/api/whatsapp/crm-customers/:id/products', (req, res) => {
    try {
      const { id } = req.params; // customerId
      const { product_name, status, is_continuous_use, treatment_duration_days, notes } = req.body;

      if (!product_name || !status) {
        return res.status(400).json({ error: 'Nome do produto e status são obrigatórios.' });
      }

      const customer = db.prepare('SELECT phone, name FROM customers WHERE id = ?').get(id);
      if (!customer) {
        return res.status(404).json({ error: 'Cliente não encontrado.' });
      }

      const now = new Date().toISOString();
      const wphId = genId('wph');
      const duration = treatment_duration_days ? parseInt(treatment_duration_days) : 30;
      const isContinuous = is_continuous_use ? 1 : 0;

      let nextReminder = null;
      if (isContinuous === 1 && status === 'comprado') {
        const dateObj = new Date();
        dateObj.setDate(dateObj.getDate() + duration);
        nextReminder = dateObj.toISOString().split('T')[0];
      }

      db.prepare(`
        INSERT INTO whatsapp_product_history
        (id, phone, customer_id, product_name, status, interaction_date, source, notes, created_at, is_continuous_use, treatment_duration_days, last_purchase_date, next_reminder_date, reminder_status)
        VALUES (?, ?, ?, ?, ?, ?, 'Manual', ?, ?, ?, ?, ?, ?, 'pendente')
      `).run(
        wphId,
        customer.phone,
        id,
        product_name,
        status,
        now,
        notes || null,
        now,
        isContinuous,
        duration,
        status === 'comprado' ? now.split('T')[0] : null,
        nextReminder
      );

      res.status(201).json({ success: true, id: wphId, message: 'Produto adicionado manualmente ao CRM.' });
    } catch (err) {
      console.error('[WhatsAppCRM] Erro ao adicionar produto manualmente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[WhatsAppCRM] ✅ Endpoints do CRM WhatsApp inicializados.');
}

module.exports = { initializeWhatsAppCRMEndpoints };
