const express = require('express');
const {
  scanDeliveriesFromWhatsApp,
  syncAndEnqueueChats,
  analyzeSingleChatWithAI
} = require('./services/whatsapp-delivery-service');

function initializeDeliveryEndpoints(app, db) {
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
      if (period === 'today') {
        timeClause = `AND (
          date(created_at, 'localtime') = date('now', 'localtime') OR
          date(created_at) = date('now') OR
          created_at >= date('now', 'start of day') OR
          created_at LIKE date('now', 'localtime') || '%'
        )`;
      } else if (period === '7days') {
        timeClause = "AND created_at >= datetime('now', '-7 days')";
      } else if (period === '30days') {
        timeClause = "AND created_at >= datetime('now', '-30 days')";
      } else if (period === 'month') {
        timeClause = "AND (strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime') OR strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now'))";
      } else if (period === 'prev_month') {
        // Mês anterior
        timeClause = "AND strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'start of month', '-1 month', 'localtime')";
      } else if (period && period.match(/^\d{4}-\d{2}$/)) {
        // Mês específico YYYY-MM (ex: 2026-07)
        timeClause = `AND strftime('%Y-%m', created_at, 'localtime') = '${period}'`;
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
