/**
 * whatsapp-crm-endpoints.js
 * CRM WhatsApp — Importação de clientes, histórico de produtos e integração de faltas
 */

const { callAI } = require('./services/ai.service');

const EVOLUTION_MAIN_INSTANCE = process.env.EVOLUTION_MAIN_INSTANCE || 'belaFarma';
const API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const API_KEY = process.env.EVOLUTION_SENDER_API_KEY || process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';

// Helper: limpar e normalizar telefone
function cleanPhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
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
        const contactsRes = await evolutionFetch(`/contact/findContacts/${EVOLUTION_MAIN_INSTANCE}`, {
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
      const contactMap = new Map(); // chave: telefone limpo

      // Adicionar da agenda primeiro (base)
      for (const c of contacts) {
        const jid = c.id || c.remoteJid || '';
        if (!jid || jid.includes('@g.us') || jid.includes('@broadcast')) continue;
        const phone = jid.split('@')[0];
        if (!phone || phone.length < 8) continue;
        contactMap.set(phone, {
          phone,
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
        if (!phone || phone.length < 8) continue;

        const existing = contactMap.get(phone) || {};
        const lastTimestamp = c.updatedAt || c.messageTimestamp
          ? new Date(c.updatedAt || c.messageTimestamp * 1000).toISOString()
          : null;

        contactMap.set(phone, {
          phone,
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

          if (!existing) {
            // Criar novo cliente
            customerId = genId('cust');
            db.prepare(`
              INSERT INTO customers (id, name, phone, whatsapp_name, source, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, 'WhatsApp', ?, ?)
            `).run(customerId, contact.name, phone, contact.name, now, now);
            stats.imported++;
            console.log(`[WhatsAppCRM] ➕ Novo cliente: ${contact.name} (${phone})`);
          } else {
            // Atualizar apenas campos em branco
            const updates = [];
            const params = [];

            if (!existing.name || existing.name === 'Cliente WhatsApp') {
              updates.push('name = ?');
              params.push(contact.name);
            }
            if (!existing.whatsapp_name) {
              updates.push('whatsapp_name = ?');
              params.push(contact.name);
            }
            if (!existing.source) {
              updates.push("source = 'WhatsApp'");
            }

            if (updates.length > 0) {
              updates.push('updatedAt = ?');
              params.push(now, existing.id);
              db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
              stats.updated++;
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

      res.json({
        customer,
        productHistory,
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

  console.log('[WhatsAppCRM] ✅ Endpoints do CRM WhatsApp inicializados.');
}

module.exports = { initializeWhatsAppCRMEndpoints };
