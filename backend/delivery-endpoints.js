const express = require('express');
const { scanDeliveriesFromWhatsApp } = require('./services/whatsapp-delivery-service');

function initializeDeliveryEndpoints(app, db) {
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
        SELECT *
        FROM deliveries
        WHERE 1=1 ${timeClause} ${statusClause} ${closedClause} ${searchClause}
        ORDER BY created_at DESC
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

        const st = d.status || (isClosed ? 'Pendente' : 'Nao_Fechado');
        metrics.byStatus[st] = (metrics.byStatus[st] || 0) + 1;

        if (d.payment_method) {
          const pm = d.payment_method;
          metrics.byPaymentMethod[pm] = (metrics.byPaymentMethod[pm] || 0) + 1;
        }
      }

      const totalAnalyzed = metrics.closedSalesCount + metrics.unclosedSalesCount;
      metrics.conversionRate = totalAnalyzed > 0 ? (metrics.closedSalesCount / totalAnalyzed) * 100 : 0;
      metrics.averageTicket = metrics.closedSalesCount > 0 ? (metrics.closedSalesAmount / metrics.closedSalesCount) : 0;

      res.json({
        success: true,
        deliveries,
        metrics
      });
    } catch (err) {
      console.error('[DeliveryEndpoints] Erro ao buscar deliveries:', err);
      res.status(500).json({ error: 'Erro ao carregar entregas.', details: err.message });
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
