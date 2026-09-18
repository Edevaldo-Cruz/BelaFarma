const express = require('express');
const {
  scanDeliveriesFromWhatsApp,
  syncAndEnqueueChats,
  analyzeSingleChatWithAI
} = require('./services/whatsapp-delivery-service');
const { findOrCreateDigifarmaCustomer } = require('./services/digifarma.service');

function initializeDeliveryEndpoints(app, db) {
  // GET /api/deliveries/in-transit - Listar pedidos atualmente Em Rota para confirmação
  app.get('/api/deliveries/in-transit', (req, res) => {
    try {
      const sql = `
        SELECT d.*, 
               COALESCE(
                 NULLIF(wc.pushName, ''), 
                 NULLIF(wc.name, ''), 
                 NULLIF(wc2.pushName, ''), 
                 NULLIF(wc2.name, '')
               ) as wa_name,
               c.id as customer_record_id,
               c.digifarma_id
        FROM deliveries d
        LEFT JOIN whatsapp_contacts wc ON wc.id = d.phone
        LEFT JOIN whatsapp_contacts wc2 ON wc2.id = d.phone || '@s.whatsapp.net'
        LEFT JOIN customers c ON (c.phone LIKE '%' || substr(d.phone, -8) OR c.phone = d.phone)
        WHERE d.status = 'Em Rota'
        GROUP BY d.phone, COALESCE(d.items, d.id)
        ORDER BY d.created_at DESC
      `;
      const inTransit = db.prepare(sql).all();
      res.json({
        success: true,
        count: inTransit.length,
        deliveries: inTransit
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao buscar pedidos em rota:', err);
      res.status(500).json({ error: 'Erro ao carregar pedidos em rota.', details: err.message });
    }
  });

  // POST /api/deliveries/:id/confirm-status - Confirmar Entrega ou Reagendar/Cancelar com Nome e Endereço
  app.post('/api/deliveries/:id/confirm-status', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        status, // 'Entregue' | 'Pendente' | 'Cancelado' | 'Nao_Fechado'
        customer_name,
        delivery_address,
        neighborhood,
        unclosed_reason
      } = req.body;

      const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);
      if (!delivery) {
        return res.status(404).json({ error: 'Registro de entrega não encontrado.' });
      }

      const finalStatus = status || 'Entregue';
      const isClosed = (finalStatus === 'Entregue' || finalStatus === 'Em Rota' || finalStatus === 'Pendente') ? 1 : 0;
      const cleanPhone = delivery.phone ? delivery.phone.replace(/\D/g, '') : '';
      const finalName = (customer_name && customer_name.trim() !== '') ? customer_name.trim() : delivery.customer_name;
      const finalAddress = (delivery_address && delivery_address.trim() !== '') ? delivery_address.trim() : delivery.delivery_address;
      const finalNeighborhood = (neighborhood && neighborhood.trim() !== '') ? neighborhood.trim() : delivery.neighborhood;

      // 1. Atualizar entrega no SQLite
      db.prepare(`
        UPDATE deliveries SET
          status = ?,
          sale_closed = ?,
          customer_name = ?,
          delivery_address = ?,
          neighborhood = COALESCE(?, neighborhood),
          unclosed_reason = ?,
          review_status = 'reviewed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        finalStatus,
        isClosed,
        finalName,
        finalAddress,
        finalNeighborhood,
        unclosed_reason || null,
        id
      );

      // Cascata: Se houverem duplicatas para este mesmo telefone em 'Em Rota' ou com o mesmo last_message_id, atualizar todas
      if (cleanPhone) {
        db.prepare(`
          UPDATE deliveries SET
            status = ?,
            sale_closed = ?,
            customer_name = ?,
            delivery_address = ?,
            neighborhood = COALESCE(?, neighborhood),
            unclosed_reason = ?,
            review_status = 'reviewed',
            updated_at = CURRENT_TIMESTAMP
          WHERE phone = ? AND id != ? AND (status = 'Em Rota' OR last_message_id = ?)
        `).run(
          finalStatus,
          isClosed,
          finalName,
          finalAddress,
          finalNeighborhood,
          unclosed_reason || null,
          delivery.phone,
          id,
          delivery.last_message_id
        );
      }

      // 2. Atualizar cadastro local do cliente e memória de endereços
      if (cleanPhone) {
        try {
          const cust = db.prepare('SELECT id, digifarma_id FROM customers WHERE phone LIKE ? OR phone = ? LIMIT 1').get(`%${cleanPhone.slice(-8)}%`, cleanPhone);
          const custId = cust ? cust.id : null;

          if (finalName && !['cliente', 'cliente whatsapp', 'atendente'].includes(finalName.toLowerCase())) {
            db.prepare(`
              UPDATE customers 
              SET name = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE phone LIKE ? AND (name IS NULL OR name = '' OR name LIKE 'Cliente%')
            `).run(finalName, `%${cleanPhone.slice(-8)}%`);

            db.prepare(`
              INSERT INTO whatsapp_contacts (id, name, updated_at)
              VALUES (?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP
            `).run(cleanPhone, finalName);
          }

          if (finalAddress && finalAddress !== 'Endereço a confirmar' && finalAddress !== 'Balcão / Loja' && finalAddress.length >= 5) {
            db.prepare(`
              INSERT INTO customer_address_history (id, phone, customer_id, address, neighborhood, last_used_at, created_at)
              VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
            `).run(`addr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, cleanPhone, custId, finalAddress, finalNeighborhood || null);

            if (custId) {
              db.prepare(`
                UPDATE customers 
                SET address = ?, neighborhood = COALESCE(?, neighborhood), updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(finalAddress, finalNeighborhood || null, custId);
            }
          }
        } catch (errMem) {
          console.warn('[DeliveryEndpoints] ⚠️ Falha ao atualizar memória de cliente:', errMem.message);
        }
      }

      // 3. Sincronização e Cadastro Automático no Digifarma
      let digiResult = null;
      if (cleanPhone) {
        try {
          digiResult = await findOrCreateDigifarmaCustomer({
            name: finalName,
            phone: cleanPhone,
            address: finalAddress,
            neighborhood: finalNeighborhood
          });

          if (digiResult && digiResult.success && digiResult.cliente_id) {
            db.prepare('UPDATE deliveries SET digifarma_cliente_id = ? WHERE id = ?').run(digiResult.cliente_id, id);
            db.prepare('UPDATE customers SET digifarma_id = ? WHERE phone LIKE ? OR phone = ?').run(digiResult.cliente_id, `%${cleanPhone.slice(-8)}%`, cleanPhone);
          }
        } catch (errDigi) {
          console.warn('[DeliveryEndpoints] ⚠️ Erro na sincronização do Digifarma:', errDigi.message);
        }
      }

      const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);

      res.json({
        success: true,
        message: finalStatus === 'Entregue' ? 'Entrega confirmada com sucesso!' : 'Status atualizado com sucesso!',
        delivery: updated,
        digifarma: digiResult
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao confirmar status da entrega:', err);
      res.status(500).json({ error: 'Erro ao confirmar entrega.', details: err.message });
    }
  });

  // POST /api/deliveries/:id/sync-digifarma - Sincronização explícita com o Digifarma
  app.post('/api/deliveries/:id/sync-digifarma', async (req, res) => {
    try {
      const { id } = req.params;
      const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);
      if (!delivery) {
        return res.status(404).json({ error: 'Entrega não encontrada.' });
      }

      const digiResult = await findOrCreateDigifarmaCustomer({
        name: delivery.customer_name,
        phone: delivery.phone,
        address: delivery.delivery_address,
        neighborhood: delivery.neighborhood
      });

      if (digiResult && digiResult.success && digiResult.cliente_id) {
        db.prepare('UPDATE deliveries SET digifarma_cliente_id = ? WHERE id = ?').run(digiResult.cliente_id, id);
        const cleanPhone = delivery.phone.replace(/\D/g, '');
        db.prepare('UPDATE customers SET digifarma_id = ? WHERE phone LIKE ? OR phone = ?').run(digiResult.cliente_id, `%${cleanPhone.slice(-8)}%`, cleanPhone);
      }

      res.json({
        success: true,
        digifarma: digiResult
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao sincronizar com Digifarma:', err);
      res.status(500).json({ error: 'Erro ao sincronizar com Digifarma.', details: err.message });
    }
  });

  // POST /api/deliveries/sync-chats - Sincronizar conversas retroativas (ex: desde 01/08/2026) e colocar na fila de pendentes
  app.post('/api/deliveries/sync-chats', async (req, res) => {
    try {
      const { startDate = '2026-08-01' } = req.body;
      const result = await syncAndEnqueueChats(db, { startDate });
      res.json({
        success: true,
        message: `Sincronização concluída. ${result.enqueuedCount} novas conversas pendentes adicionadas.`,
        enqueuedCount: result.enqueuedCount,
        totalProcessed: result.totalProcessed
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao sincronizar conversas:', err);
      res.status(500).json({ error: 'Erro ao sincronizar conversas.', details: err.message });
    }
  });

  // POST /api/deliveries/analyze-chat - Analisa conversa com IA sob demanda (ao clicar em Cotação ou Pedido)
  app.post('/api/deliveries/analyze-chat', async (req, res) => {
    try {
      const { id, type = 'cotacao' } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'O ID da conversa é obrigatório.' });
      }
      const result = await analyzeSingleChatWithAI(db, id, type);
      res.json({
        success: true,
        data: result
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao analisar conversa com IA:', err);
      res.status(500).json({ error: 'Erro ao analisar conversa com IA.', details: err.message });
    }
  });

  // POST /api/deliveries/dismiss-chat/:id - Marcar conversa como Não Relevante
  app.post('/api/deliveries/dismiss-chat/:id', (req, res) => {
    try {
      const { id } = req.params;
      db.prepare(`
        UPDATE deliveries SET
          review_status = 'dismissed',
          classification_type = 'nao_relevante',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);

      res.json({
        success: true,
        message: 'Conversa marcada como Não Relevante e removida da fila.'
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao descartar conversa:', err);
      res.status(500).json({ error: 'Erro ao descartar conversa.', details: err.message });
    }
  });

  // GET /api/deliveries - Lista de entregas/vendas e métricas consolidadas
  app.get('/api/deliveries', (req, res) => {
    try {
      const { status, period = 'month', search, filterClosed } = req.query;

      let timeClause = '';
      const dateCol = "COALESCE(d.conversation_date, date(d.created_at, 'localtime'))";
      if (period === 'today') {
        timeClause = `AND (
          ${dateCol} = date('now', 'localtime') OR
          date(d.created_at, 'localtime') = date('now', 'localtime') OR
          d.created_at LIKE date('now', 'localtime') || '%'
        )`;
      } else if (period === '7days') {
        timeClause = `AND ${dateCol} >= date('now', '-7 days', 'localtime')`;
      } else if (period === '30days') {
        timeClause = `AND ${dateCol} >= date('now', '-30 days', 'localtime')`;
      } else if (period === 'month') {
        timeClause = `AND substr(${dateCol}, 1, 7) = strftime('%Y-%m', 'now', 'localtime')`;
      } else if (period === 'prev_month') {
        // Mês anterior
        timeClause = `AND substr(${dateCol}, 1, 7) = strftime('%Y-%m', 'now', 'start of month', '-1 month', 'localtime')`;
      } else if (period && period.match(/^\d{4}-\d{2}$/)) {
        // Mês específico YYYY-MM (ex: 2026-07)
        timeClause = `AND substr(${dateCol}, 1, 7) = '${period}'`;
      } else if (period === 'all') {
        timeClause = '';
      }

      let statusClause = '';
      if (status && status !== 'all') {
        statusClause = 'AND status = ?';
      }

      let closedClause = '';
      if (filterClosed === 'closed') {
        closedClause = 'AND sale_closed = 1';
      } else if (filterClosed === 'unclosed') {
        closedClause = 'AND sale_closed = 0';
      }

      let searchClause = '';
      const params = [];

      if (status && status !== 'all') {
        params.push(status);
      }

      if (search && search.trim() !== '') {
        searchClause = 'AND (customer_name LIKE ? OR phone LIKE ? OR delivery_address LIKE ? OR items LIKE ? OR unclosed_reason LIKE ?)';
        const searchTerm = `%${search.trim()}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }

      const sql = `
        SELECT d.*, COALESCE(wc.name, wc.pushName) as wa_name
        FROM deliveries d
        LEFT JOIN whatsapp_contacts wc ON wc.id = d.phone || '@s.whatsapp.net'
        WHERE 1=1 ${timeClause} ${statusClause} ${closedClause} ${searchClause}
        ORDER BY d.created_at DESC
      `;

      const deliveries = db.prepare(sql).all(...params);

      // Métricas consolidadas
      const metrics = {
        totalContacts: deliveries.length,
        closedSalesCount: 0,
        closedSalesAmount: 0,
        unclosedSalesCount: 0,
        unclosedSalesAmount: 0,
        conversionRate: 0,
        averageTicket: 0,
        byPaymentMethod: {},
        byStatus: {
          Pendente: 0,
          'Em Rota': 0,
          Entregue: 0,
          Nao_Fechado: 0,
          Cancelado: 0
        },
        byUnclosedReason: {}
      };

      for (const d of deliveries) {
        const isClosed = d.sale_closed === 1 && d.status !== 'Nao_Fechado' && d.status !== 'Cancelado';
        const amount = parseFloat(d.total_amount) || 0;

        if (isClosed) {
          metrics.closedSalesCount++;
          metrics.closedSalesAmount += amount;
        } else {
          metrics.unclosedSalesCount++;
          metrics.unclosedSalesAmount += amount;

          const reason = d.unclosed_reason || 'Sem Resposta do Cliente';
          metrics.byUnclosedReason[reason] = (metrics.byUnclosedReason[reason] || 0) + 1;
        }

        if (d.status) {
          metrics.byStatus[d.status] = (metrics.byStatus[d.status] || 0) + 1;
        }

        if (d.payment_method) {
          metrics.byPaymentMethod[d.payment_method] = (metrics.byPaymentMethod[d.payment_method] || 0) + 1;
        }
      }

      const totalAnalysable = metrics.closedSalesCount + metrics.unclosedSalesCount;
      metrics.conversionRate = totalAnalysable > 0 ? (metrics.closedSalesCount / totalAnalysable) * 100 : 0;
      metrics.averageTicket = metrics.closedSalesCount > 0 ? (metrics.closedSalesAmount / metrics.closedSalesCount) : 0;

      res.json({
        success: true,
        count: deliveries.length,
        deliveries,
        metrics
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao buscar deliveries:', err);
      res.status(500).json({ error: 'Erro ao carregar entregas.', details: err.message });
    }
  });

  // GET /api/deliveries/pending-reviews - Listar revisões pendentes
  app.get('/api/deliveries/pending-reviews', (req, res) => {
    try {
      const sql = `
        SELECT d.*, 
               COALESCE(
                 NULLIF(wc.pushName, ''), 
                 NULLIF(wc.name, ''), 
                 NULLIF(wc2.pushName, ''), 
                 NULLIF(wc2.name, '')
               ) as wa_name
        FROM deliveries d
        LEFT JOIN whatsapp_contacts wc ON wc.id = d.phone
        LEFT JOIN whatsapp_contacts wc2 ON wc2.id = d.phone || '@s.whatsapp.net'
        WHERE d.review_status = 'pending_review' AND (d.classification_type IS NULL OR d.classification_type != 'nao_relevante')
        ORDER BY d.created_at DESC
      `;
      const pendingReviews = db.prepare(sql).all();
      res.json({
        success: true,
        count: pendingReviews.length,
        pending_reviews: pendingReviews
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao buscar pending-reviews:', err);
      res.status(500).json({ error: 'Erro ao buscar revisões pendentes.', details: err.message });
    }
  });

  // GET /api/deliveries/pending-reviews/:id - Buscar detalhes de uma revisão pendente
  app.get('/api/deliveries/pending-reviews/:id', (req, res) => {
    try {
      const { id } = req.params;
      const sql = `
        SELECT d.*, 
               COALESCE(
                 NULLIF(wc.pushName, ''), 
                 NULLIF(wc.name, ''), 
                 NULLIF(wc2.pushName, ''), 
                 NULLIF(wc2.name, '')
               ) as wa_name
        FROM deliveries d
        LEFT JOIN whatsapp_contacts wc ON wc.id = d.phone
        LEFT JOIN whatsapp_contacts wc2 ON wc2.id = d.phone || '@s.whatsapp.net'
        WHERE d.id = ?
      `;
      const record = db.prepare(sql).get(id);

      if (!record) {
        return res.status(404).json({ error: 'Registro de revisão pendente não encontrado.' });
      }

      res.json({
        success: true,
        delivery: record
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao buscar detalhes da revisão pendente:', err);
      res.status(500).json({ error: 'Erro ao carregar detalhes da revisão pendente.', details: err.message });
    }
  });

  // GET /api/deliveries/chat-history/:phone - Buscar histórico recente de mensagens do WhatsApp
  app.get('/api/deliveries/chat-history/:phone', (req, res) => {
    try {
      const { phone } = req.params;
      const cleanPhone = phone.replace(/\D/g, '');

      const messages = db.prepare(`
        SELECT * FROM (
          SELECT id, fromMe, messageText, timestamp
          FROM whatsapp_messages
          WHERE phone = ? OR phone = ?
          ORDER BY timestamp DESC
          LIMIT 30
        )
        ORDER BY timestamp ASC
      `).all(cleanPhone, phone);

      const cust = db.prepare('SELECT name FROM customers WHERE phone LIKE ? OR phone = ? LIMIT 1').get(`%${cleanPhone.slice(-8)}%`, cleanPhone);
      const waContact = db.prepare('SELECT name, pushName FROM whatsapp_contacts WHERE id = ? OR id = ? LIMIT 1').get(cleanPhone, phone + '@s.whatsapp.net');
      const senderName = cust?.name || waContact?.pushName || waContact?.name || 'Cliente WhatsApp';

      const formatted = messages.map(m => ({
        id: m.id,
        fromMe: m.fromMe === 1,
        sender: m.fromMe === 1 ? 'Atendente BelaFarma' : senderName,
        text: m.messageText,
        time: new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      }));

      res.json({
        success: true,
        count: formatted.length,
        messages: formatted
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao buscar histórico de mensagens:', err);
      res.status(500).json({ error: 'Erro ao carregar histórico de mensagens.', details: err.message });
    }
  });

  // POST /api/deliveries/:id/submit-review - Submeter formulário de revisão de atendimento
  app.post('/api/deliveries/:id/submit-review', (req, res) => {
    try {
      const { id } = req.params;
      const { gerou_entrega, delivery_details, rejection_details, unclosed_reason, reviewed_by, total_amount } = req.body;

      // 1. Validação de Entrada: gerou_entrega deve ser booleano
      if (typeof gerou_entrega !== 'boolean') {
        return res.status(400).json({ error: 'O campo gerou_entrega é obrigatório e deve ser booleano.' });
      }

      // 2. Validação de Entrada: total_amount se fornecido deve ser um número válido
      const amtToCheck = total_amount !== undefined
        ? total_amount
        : (delivery_details && delivery_details.total_amount !== undefined ? delivery_details.total_amount : undefined);

      if (amtToCheck !== undefined && amtToCheck !== null && amtToCheck !== '') {
        if (isNaN(Number(amtToCheck))) {
          return res.status(400).json({ error: 'O campo total_amount deve ser um número válido.' });
        }
      }

      // 3. Validação de Entrada: rejection_details se fornecido deve ser array contendo apenas objetos válidos
      if (rejection_details !== undefined && rejection_details !== null) {
        if (!Array.isArray(rejection_details)) {
          return res.status(400).json({ error: 'O campo rejection_details deve ser um array.' });
        }
        for (const rej of rejection_details) {
          if (!rej || typeof rej !== 'object' || Array.isArray(rej)) {
            return res.status(400).json({ error: 'Os itens de rejection_details devem ser objetos válidos.' });
          }
        }
      }

      const existing = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);
      if (!existing) {
        return res.status(404).json({ error: 'Registro de entrega não encontrado.' });
      }

      const reviewer = reviewed_by || 'Atendente';

      // Transação atômica para UPDATE e manipulação de chat_product_rejections
      const executeTransaction = db.transaction(() => {
        if (gerou_entrega) {
          const details = delivery_details || {};
          const parsedAmount = details.total_amount !== undefined && details.total_amount !== null && details.total_amount !== ''
            ? parseFloat(details.total_amount)
            : (total_amount !== undefined && total_amount !== null && total_amount !== '' ? parseFloat(total_amount) : null);

          db.prepare(`
            UPDATE deliveries SET
              sale_closed = 1,
              status = 'Pendente',
              review_status = 'reviewed',
              classification_type = 'pedido',
              reviewed_at = CURRENT_TIMESTAMP,
              reviewed_by = ?,
              customer_name = COALESCE(?, customer_name),
              delivery_address = COALESCE(?, delivery_address),
              items = COALESCE(?, items),
              total_amount = COALESCE(?, total_amount),
              payment_method = COALESCE(?, payment_method),
              notes = COALESCE(?, notes),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            reviewer,
            details.customer_name || null,
            details.delivery_address || null,
            details.items || null,
            parsedAmount,
            details.payment_method || null,
            details.notes || null,
            id
          );

          // Em resubmissão para venda fechada, limpa rejeições anteriores caso existam
          db.prepare('DELETE FROM chat_product_rejections WHERE delivery_id = ?').run(id);
        } else {
          const rejectionsArr = Array.isArray(rejection_details) ? rejection_details : [];
          const rejectionDetailsJson = JSON.stringify(rejectionsArr);
          const primaryReason = unclosed_reason || (rejectionsArr.length > 0 && rejectionsArr[0].reason ? rejectionsArr[0].reason : 'Desistiu');

          db.prepare(`
            UPDATE deliveries SET
              sale_closed = 0,
              status = 'Nao_Fechado',
              review_status = 'reviewed',
              classification_type = 'cotacao',
              rejection_details_json = ?,
              unclosed_reason = ?,
              reviewed_at = CURRENT_TIMESTAMP,
              reviewed_by = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            rejectionDetailsJson,
            primaryReason,
            reviewer,
            id
          );

          // Limpa rejeições prévias dentro da transação para evitar duplicatas em re-submissões
          db.prepare('DELETE FROM chat_product_rejections WHERE delivery_id = ?').run(id);

          if (rejectionsArr.length > 0) {
            const insertRejection = db.prepare(`
              INSERT INTO chat_product_rejections (delivery_id, phone, product_name, reason, notes, created_at)
              VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            for (const rej of rejectionsArr) {
              insertRejection.run(
                id,
                existing.phone,
                rej.product_name || 'Produto não especificado',
                rej.reason || primaryReason,
                rej.notes || ''
              );
            }
          }
        }
      });

      executeTransaction();

      const updatedRecord = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);

      res.json({
        success: true,
        delivery_id: id,
        review_status: 'reviewed',
        delivery: updatedRecord
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao submeter revisão:', err);
      res.status(500).json({ error: 'Erro ao processar submissão de revisão.', details: err.message });
    }
  });

  // GET /api/deliveries/rejection-metrics - Consultar métricas agregadas de rejeição
  app.get('/api/deliveries/rejection-metrics', (req, res) => {
    try {
      const totalRejectionsRow = db.prepare('SELECT COUNT(*) as count FROM chat_product_rejections').get();
      let total_rejections = totalRejectionsRow ? totalRejectionsRow.count : 0;

      const reasonsRows = db.prepare(`
        SELECT reason, COUNT(*) as count
        FROM chat_product_rejections
        WHERE reason IS NOT NULL AND reason != ''
        GROUP BY reason
        ORDER BY count DESC
      `).all();

      const by_reason = {};
      for (const r of reasonsRows) {
        by_reason[r.reason] = r.count;
      }

      if (total_rejections === 0 || Object.keys(by_reason).length === 0) {
        const delivReasons = db.prepare(`
          SELECT unclosed_reason as reason, COUNT(*) as count
          FROM deliveries
          WHERE sale_closed = 0 AND unclosed_reason IS NOT NULL AND unclosed_reason != ''
          GROUP BY unclosed_reason
          ORDER BY count DESC
        `).all();
        for (const r of delivReasons) {
          by_reason[r.reason] = r.count;
        }

        const fallbackTotal = db.prepare('SELECT COUNT(*) as count FROM deliveries WHERE sale_closed = 0').get();
        total_rejections = fallbackTotal ? fallbackTotal.count : 0;
      }

      const productsRows = db.prepare(`
        SELECT 
          p.product_name, 
          COUNT(*) as count,
          COALESCE((
            SELECT r.reason
            FROM chat_product_rejections r
            WHERE r.product_name = p.product_name AND r.reason IS NOT NULL AND r.reason != ''
            GROUP BY r.reason
            ORDER BY COUNT(*) DESC, r.reason ASC
            LIMIT 1
          ), 'Outro') as main_reason
        FROM chat_product_rejections p
        WHERE p.product_name IS NOT NULL AND p.product_name != ''
        GROUP BY p.product_name
        ORDER BY count DESC
        LIMIT 50
      `).all();

      const by_product = productsRows.map(p => ({
        product_name: p.product_name,
        count: p.count,
        main_reason: p.main_reason || 'Outro'
      }));

      res.json({
        success: true,
        metrics: {
          total_rejections,
          by_reason,
          by_product,
          top_rejected_products: by_product
        }
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao carregar métricas de rejeição:', err);
      res.status(500).json({ error: 'Erro ao carregar métricas de rejeição.', details: err.message });
    }
  });

  // GET /api/deliveries/analytics - Inteligência Geográfica, SLA, Produtos e Fidelidade
  app.get('/api/deliveries/analytics', (req, res) => {
    try {
      const { period = 'month' } = req.query;

      let timeClause = '';
      let timeClauseWph = '';
      const dateCol = "COALESCE(conversation_date, date(created_at, 'localtime'))";
      const dateColWph = "COALESCE(interaction_date, date(created_at, 'localtime'))";

      if (period === 'today') {
        timeClause = `AND (${dateCol} = date('now', 'localtime') OR created_at LIKE date('now', 'localtime') || '%')`;
        timeClauseWph = `AND (${dateColWph} = date('now', 'localtime') OR created_at LIKE date('now', 'localtime') || '%')`;
      } else if (period === '7days') {
        timeClause = `AND ${dateCol} >= date('now', '-7 days', 'localtime')`;
        timeClauseWph = `AND ${dateColWph} >= date('now', '-7 days', 'localtime')`;
      } else if (period === '30days') {
        timeClause = `AND ${dateCol} >= date('now', '-30 days', 'localtime')`;
        timeClauseWph = `AND ${dateColWph} >= date('now', '-30 days', 'localtime')`;
      } else if (period === 'month') {
        timeClause = `AND substr(${dateCol}, 1, 7) = strftime('%Y-%m', 'now', 'localtime')`;
        timeClauseWph = `AND substr(${dateColWph}, 1, 7) = strftime('%Y-%m', 'now', 'localtime')`;
      } else if (period === 'prev_month') {
        timeClause = `AND substr(${dateCol}, 1, 7) = strftime('%Y-%m', 'now', 'start of month', '-1 month', 'localtime')`;
        timeClauseWph = `AND substr(${dateColWph}, 1, 7) = strftime('%Y-%m', 'now', 'start of month', '-1 month', 'localtime')`;
      } else if (period && period.match(/^\d{4}-\d{2}$/)) {
        timeClause = `AND substr(${dateCol}, 1, 7) = '${period}'`;
        timeClauseWph = `AND substr(${dateColWph}, 1, 7) = '${period}'`;
      }

      // 1. Geolocalização / Bairros
      const geoRows = db.prepare(`
        SELECT 
          COALESCE(NULLIF(neighborhood, ''), 'Não Informado / Balcão') as neighborhood,
          COUNT(*) as count,
          SUM(CASE WHEN sale_closed = 1 THEN 1 ELSE 0 END) as closedCount,
          SUM(CASE WHEN sale_closed = 1 THEN total_amount ELSE 0 END) as totalAmount,
          AVG(CASE WHEN sale_closed = 1 AND total_amount > 0 THEN total_amount ELSE NULL END) as avgTicket
        FROM deliveries
        WHERE (classification_type IS NULL OR classification_type != 'nao_relevante') ${timeClause}
        GROUP BY neighborhood
        ORDER BY totalAmount DESC, count DESC
        LIMIT 15
      `).all();

      const geoAnalytics = geoRows.map(r => ({
        neighborhood: r.neighborhood,
        count: r.count,
        closedCount: r.closedCount || 0,
        totalAmount: Number((r.totalAmount || 0).toFixed(2)),
        avgTicket: Number((r.avgTicket || 0).toFixed(2))
      }));

      // 2. Top Produtos Vendidos
      const topSoldRows = db.prepare(`
        SELECT product_name, COUNT(*) as count
        FROM whatsapp_product_history
        WHERE status = 'comprado' ${timeClauseWph}
        GROUP BY product_name
        ORDER BY count DESC
        LIMIT 10
      `).all();

      let topSoldProducts = topSoldRows;
      if (topSoldProducts.length === 0) {
        const fallbackSold = db.prepare(`
          SELECT items, total_amount FROM deliveries
          WHERE sale_closed = 1 AND items IS NOT NULL AND items != '' ${timeClause}
          LIMIT 50
        `).all();
        const mapCount = {};
        for (const f of fallbackSold) {
          const name = f.items.split('\n')[0].replace(/^\d+x\s*/, '').trim();
          if (name && name !== 'Receita / Imagem' && name.length > 2) {
            mapCount[name] = (mapCount[name] || 0) + 1;
          }
        }
        topSoldProducts = Object.entries(mapCount)
          .map(([product_name, count]) => ({ product_name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      }

      // 3. Top Produtos Perdidos / Não Fechados
      const topLostRows = db.prepare(`
        SELECT product_name, COUNT(*) as count,
          CASE 
            WHEN status = 'nao_encontrado' THEN 'Falta de Estoque'
            WHEN status = 'cancelado' THEN 'Desistência'
            ELSE 'Preço / Sem Resposta'
          END as reason
        FROM whatsapp_product_history
        WHERE status IN ('nao_encontrado', 'pesquisado', 'cancelado') ${timeClauseWph}
        GROUP BY product_name, reason
        ORDER BY count DESC
        LIMIT 10
      `).all();

      // 4. Fidelidade: Novos vs Recorrentes
      const loyaltyRow = db.prepare(`
        SELECT 
          SUM(CASE WHEN is_new_customer = 1 THEN 1 ELSE 0 END) as newCustomersCount,
          SUM(CASE WHEN is_repeat_customer = 1 OR is_new_customer = 0 THEN 1 ELSE 0 END) as repeatCustomersCount,
          COUNT(*) as totalOrders
        FROM deliveries
        WHERE (classification_type IS NULL OR classification_type != 'nao_relevante') ${timeClause}
      `).get() || { newCustomersCount: 0, repeatCustomersCount: 0, totalOrders: 0 };

      const totalL = (loyaltyRow.newCustomersCount || 0) + (loyaltyRow.repeatCustomersCount || 0);
      const loyaltyRate = totalL > 0 ? ((loyaltyRow.repeatCustomersCount || 0) / totalL) * 100 : 0;

      const topCustomers = db.prepare(`
        SELECT 
          d.phone,
          COALESCE(NULLIF(d.customer_name, ''), 'Cliente') as name,
          COUNT(*) as orderCount,
          SUM(d.total_amount) as totalSpent
        FROM deliveries d
        WHERE d.sale_closed = 1 ${timeClause}
        GROUP BY d.phone
        ORDER BY orderCount DESC, totalSpent DESC
        LIMIT 8
      `).all().map(c => ({
        phone: c.phone,
        name: c.name,
        orderCount: c.orderCount,
        totalSpent: Number((c.totalSpent || 0).toFixed(2))
      }));

      // 5. SLA de Primeira Resposta
      const slaRow = db.prepare(`
        SELECT 
          AVG(first_response_time_seconds) as avgFirstResponseSeconds,
          SUM(CASE WHEN first_response_time_seconds > 0 AND first_response_time_seconds <= 60 THEN 1 ELSE 0 END) as under1Min,
          SUM(CASE WHEN first_response_time_seconds > 60 AND first_response_time_seconds <= 300 THEN 1 ELSE 0 END) as oneToFiveMin,
          SUM(CASE WHEN first_response_time_seconds > 300 AND first_response_time_seconds <= 900 THEN 1 ELSE 0 END) as fiveToFifteenMin,
          SUM(CASE WHEN first_response_time_seconds > 900 THEN 1 ELSE 0 END) as over15Min
        FROM deliveries
        WHERE first_response_time_seconds > 0 ${timeClause}
      `).get() || {};

      // 6. Horários de Pico (0 a 23)
      const hoursRows = db.prepare(`
        SELECT 
          CAST(strftime('%H', created_at, 'localtime') AS INTEGER) as hour,
          COUNT(*) as count
        FROM deliveries
        WHERE (classification_type IS NULL OR classification_type != 'nao_relevante') ${timeClause}
        GROUP BY hour
        ORDER BY hour ASC
      `).all();

      const peakHours = [];
      const hourMap = {};
      for (const h of hoursRows) {
        hourMap[h.hour] = h.count;
      }
      for (let hr = 7; hr <= 22; hr++) {
        peakHours.push({
          hour: hr,
          label: `${String(hr).padStart(2, '0')}h`,
          count: hourMap[hr] || 0
        });
      }

      // 7. Dias da Semana (0=Dom, 1=Seg, ... 6=Sab)
      const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const daysRows = db.prepare(`
        SELECT 
          CAST(strftime('%w', created_at, 'localtime') AS INTEGER) as dayIndex,
          COUNT(*) as count
        FROM deliveries
        WHERE (classification_type IS NULL OR classification_type != 'nao_relevante') ${timeClause}
        GROUP BY dayIndex
      `).all();

      const dayMap = {};
      for (const d of daysRows) {
        dayMap[d.dayIndex] = d.count;
      }
      const peakDays = dayNames.map((name, idx) => ({
        day: name,
        dayIndex: idx,
        count: dayMap[idx] || 0
      }));

      // 8. Funil
      const funnelRow = db.prepare(`
        SELECT 
          COUNT(*) as totalConversations,
          SUM(CASE WHEN total_amount > 0 OR (items IS NOT NULL AND items != '') THEN 1 ELSE 0 END) as quotesGenerated,
          SUM(CASE WHEN sale_closed = 1 THEN 1 ELSE 0 END) as salesClosed
        FROM deliveries
        WHERE (classification_type IS NULL OR classification_type != 'nao_relevante') ${timeClause}
      `).get() || { totalConversations: 0, quotesGenerated: 0, salesClosed: 0 };

      const funnel = {
        totalConversations: funnelRow.totalConversations || 0,
        quotesGenerated: funnelRow.quotesGenerated || 0,
        salesClosed: funnelRow.salesClosed || 0,
        conversionRate: funnelRow.totalConversations > 0
          ? Number(((funnelRow.salesClosed / funnelRow.totalConversations) * 100).toFixed(1))
          : 0
      };

      res.json({
        success: true,
        period,
        analytics: {
          geoAnalytics,
          topSoldProducts,
          topLostProducts: topLostRows,
          customerLoyalty: {
            newCustomersCount: loyaltyRow.newCustomersCount || 0,
            repeatCustomersCount: loyaltyRow.repeatCustomersCount || 0,
            loyaltyRate: Number(loyaltyRate.toFixed(1)),
            topCustomers
          },
          slaAnalytics: {
            avgFirstResponseSeconds: Math.round(slaRow.avgFirstResponseSeconds || 0),
            under1Min: slaRow.under1Min || 0,
            oneToFiveMin: slaRow.oneToFiveMin || 0,
            fiveToFifteenMin: slaRow.fiveToFifteenMin || 0,
            over15Min: slaRow.over15Min || 0
          },
          peakHours,
          peakDays,
          funnel
        }
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao carregar analytics:', err);
      res.status(500).json({ error: 'Erro ao gerar analytics de delivery.', details: err.message });
    }
  });

  // POST /api/deliveries/scan - Gatilho manual para varredura IA (suporta scanCurrentMonth)
  app.post('/api/deliveries/scan', async (req, res) => {
    try {
      const { scanCurrentMonth, hours } = req.body;
      console.log(`[DeliveryEndpoints] 🚀 Varredura IA disparada (${scanCurrentMonth ? 'Mês Atual' : `${hours || 48}h`})...`);

      const stats = await scanDeliveriesFromWhatsApp(db, {
        currentMonth: !!scanCurrentMonth,
        hours: hours ? parseInt(hours, 10) : 48
      });

      res.json({
        success: true,
        message: 'Varredura e auditoria de vendas via IA concluída!',
        stats
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao executar varredura IA:', err);
      res.status(500).json({ error: 'Erro ao executar varredura via IA.', details: err.message });
    }
  });

  // POST /api/deliveries - Criar registro manual
  app.post('/api/deliveries', (req, res) => {
    try {
      const { phone, customer_name, delivery_address, items, total_amount, payment_method, status, sale_closed, unclosed_reason, notes } = req.body;

      if (!phone) {
        return res.status(400).json({ error: 'Telefone é obrigatório.' });
      }

      const id = `deliv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const cleanPhone = phone.replace(/\D/g, '');
      const isClosed = sale_closed !== false && status !== 'Nao_Fechado' && status !== 'Cancelado' ? 1 : 0;

      db.prepare(`
        INSERT INTO deliveries (
          id, phone, customer_name, delivery_address, items,
          total_amount, payment_method, status, sale_closed, unclosed_reason, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        cleanPhone,
        customer_name || 'Cliente',
        delivery_address || 'Endereço a confirmar',
        items || '',
        parseFloat(total_amount) || 0,
        payment_method || 'A combinar',
        status || (isClosed ? 'Pendente' : 'Nao_Fechado'),
        isClosed,
        unclosed_reason || null,
        notes || ''
      );

      const created = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);

      res.json({ success: true, delivery: created });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao criar registro:', err);
      res.status(500).json({ error: 'Erro ao salvar registro.', details: err.message });
    }
  });

  // PUT /api/deliveries/:id - Editar registro ou status
  app.put('/api/deliveries/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { customer_name, phone, delivery_address, items, total_amount, payment_method, status, sale_closed, unclosed_reason, notes } = req.body;

      const existing = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);
      if (!existing) {
        return res.status(404).json({ error: 'Registro não encontrado.' });
      }

      let isClosed = existing.sale_closed;
      if (sale_closed !== undefined) {
        isClosed = sale_closed ? 1 : 0;
      }
      if (status === 'Nao_Fechado' || status === 'Cancelado') {
        isClosed = 0;
      } else if (status === 'Pendente' || status === 'Em Rota' || status === 'Entregue') {
        isClosed = 1;
      }

      db.prepare(`
        UPDATE deliveries
        SET customer_name = COALESCE(?, customer_name),
            phone = COALESCE(?, phone),
            delivery_address = COALESCE(?, delivery_address),
            items = COALESCE(?, items),
            total_amount = COALESCE(?, total_amount),
            payment_method = COALESCE(?, payment_method),
            status = COALESCE(?, status),
            sale_closed = ?,
            unclosed_reason = COALESCE(?, unclosed_reason),
            notes = COALESCE(?, notes),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        customer_name,
        phone ? phone.replace(/\D/g, '') : null,
        delivery_address,
        items,
        total_amount !== undefined ? parseFloat(total_amount) : null,
        payment_method,
        status,
        isClosed,
        unclosed_reason,
        notes,
        id
      );

      const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);

      res.json({ success: true, delivery: updated });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao atualizar:', err);
      res.status(500).json({ error: 'Erro ao atualizar registro.', details: err.message });
    }
  });

  // DELETE /api/deliveries/:id - Excluir registro
  app.delete('/api/deliveries/:id', (req, res) => {
    try {
      const { id } = req.params;
      db.prepare('DELETE FROM deliveries WHERE id = ?').run(id);
      res.json({ success: true, message: 'Registro removido com sucesso.' });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao deletar registro:', err);
      res.status(500).json({ error: 'Erro ao deletar registro.', details: err.message });
    }
  });

  // ─── AGENDAMENTO AUTOMÁTICO: Varredura periódica a cada 30 minutos ────────
  const THIRTY_MINUTES_MS = 30 * 60 * 1000;
  setInterval(async () => {
    try {
      console.log('[DeliveryAIService] ⏰ Executando varredura periódica automática de 30 minutos...');
      await scanDeliveriesFromWhatsApp(db, { hours: 48 });
      console.log('[DeliveryAIService] ✅ Varredura periódica de 30 min concluída!');
    } catch (err) {
      console.warn('[DeliveryAIService] ⚠️ Erro na varredura periódica:', err.message);
    }
  }, THIRTY_MINUTES_MS);

  // Executa uma varredura automática inicial 1 minuto após o servidor inicializar
  setTimeout(async () => {
    try {
      console.log('[DeliveryAIService] 🚀 Executando varredura inicial pós-inicialização do servidor...');
      await scanDeliveriesFromWhatsApp(db, { hours: 48 });
    } catch (err) {}
  }, 60 * 1000);
}

module.exports = {
  initializeDeliveryEndpoints
};
