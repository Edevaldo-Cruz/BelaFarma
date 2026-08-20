// backend/card-machines-endpoints.js
// Gerenciamento e conciliação de repasses de maquininhas de cartão e Pix

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

module.exports = (db) => {
  // Garantir que a tabela existe
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_machine_receivables (
      id TEXT PRIMARY KEY,
      closing_id TEXT,
      sale_date TEXT NOT NULL,
      expected_payment_date TEXT NOT NULL,
      modality TEXT NOT NULL,
      gross_value REAL NOT NULL,
      net_deposited_value REAL,
      fee_value REAL,
      fee_percent REAL,
      status TEXT NOT NULL DEFAULT 'Pendente',
      reconciled_at TEXT,
      reconciled_by TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_card_machine_date ON card_machine_receivables(sale_date);
    CREATE INDEX IF NOT EXISTS idx_card_machine_status ON card_machine_receivables(status);
    CREATE INDEX IF NOT EXISTS idx_card_machine_expected ON card_machine_receivables(expected_payment_date);
  `);

  // Helper para calcular data útil seguinte (pula sábado e domingo para segunda-feira)
  const getNextBusinessDay = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + 1); // Dia seguinte
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 6) {
      // Sábado -> pula para Segunda (+2)
      d.setDate(d.getDate() + 2);
    } else if (dayOfWeek === 0) {
      // Domingo -> pula para Segunda (+1)
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
  };

  // GET /api/card-machine-receivables - Lista recebíveis com filtros
  router.get('/card-machine-receivables', (req, res) => {
    try {
      const { month, year, status, modality, search } = req.query;
      let query = 'SELECT * FROM card_machine_receivables WHERE 1=1';
      const params = [];

      if (year && month) {
        const monthPad = String(month).padStart(2, '0');
        query += ` AND (sale_date LIKE ? OR expected_payment_date LIKE ?)`;
        params.push(`${year}-${monthPad}%`, `${year}-${monthPad}%`);
      } else if (year) {
        query += ` AND (sale_date LIKE ? OR expected_payment_date LIKE ?)`;
        params.push(`${year}%`, `${year}%`);
      }

      if (status && status !== 'all') {
        query += ' AND status = ?';
        params.push(status);
      }

      if (modality && modality !== 'all') {
        query += ' AND modality = ?';
        params.push(modality);
      }

      if (search) {
        query += ' AND (notes LIKE ? OR modality LIKE ? OR reconciled_by LIKE ?)';
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      query += ' ORDER BY sale_date DESC, created_at DESC';

      const stmt = db.prepare(query);
      const rows = stmt.all(...params);

      res.json(rows);
    } catch (err) {
      console.error('[CardMachines] Erro ao listar recebíveis:', err);
      res.status(500).json({ error: 'Erro ao buscar recebíveis de maquininha', details: err.message });
    }
  });

  // GET /api/card-machine-receivables/pending-due - Recebíveis pendentes com repasse até hoje
  router.get('/card-machine-receivables/pending-due', (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const stmt = db.prepare(`
        SELECT * FROM card_machine_receivables 
        WHERE status = 'Pendente' AND expected_payment_date <= ?
        ORDER BY expected_payment_date ASC, sale_date ASC
      `);
      const rows = stmt.all(today);
      res.json(rows);
    } catch (err) {
      console.error('[CardMachines] Erro ao buscar pendências do dia:', err);
      res.status(500).json({ error: 'Erro ao buscar pendências', details: err.message });
    }
  });

  // GET /api/card-machine-receivables/dashboard - Estatísticas e KPIs consolidados
  router.get('/card-machine-receivables/dashboard', (req, res) => {
    try {
      const { month, year } = req.query;
      let query = 'SELECT * FROM card_machine_receivables WHERE 1=1';
      const params = [];

      if (year && month) {
        const monthPad = String(month).padStart(2, '0');
        query += ` AND (sale_date LIKE ? OR expected_payment_date LIKE ?)`;
        params.push(`${year}-${monthPad}%`, `${year}-${monthPad}%`);
      } else if (year) {
        query += ` AND (sale_date LIKE ? OR expected_payment_date LIKE ?)`;
        params.push(`${year}%`, `${year}%`);
      }

      const rows = db.prepare(query).all(...params);

      let totalGross = 0;
      let totalNet = 0;
      let totalFees = 0;
      let totalReconciledGross = 0;
      let totalPendingCount = 0;
      let totalReconciledCount = 0;

      const byModality = {
        'Débito': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
        'Crédito': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
        'Pix Maquininha': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
        'Outro': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
      };

      rows.forEach(item => {
        const gross = Number(item.gross_value) || 0;
        const net = item.net_deposited_value !== null && item.net_deposited_value !== undefined ? Number(item.net_deposited_value) : null;
        const fee = Number(item.fee_value) || 0;

        totalGross += gross;

        const modKey = byModality[item.modality] ? item.modality : 'Outro';
        byModality[modKey].gross += gross;
        byModality[modKey].count += 1;

        if (item.status === 'Conferido' && net !== null) {
          totalNet += net;
          totalFees += fee;
          totalReconciledGross += gross;
          totalReconciledCount += 1;

          byModality[modKey].net += net;
          byModality[modKey].fee += fee;
          byModality[modKey].reconciledGross += gross;
        } else {
          totalPendingCount += 1;
        }
      });

      const avgFeePercent = totalReconciledGross > 0 ? (totalFees / totalReconciledGross) * 100 : 0;

      const modalityStats = {};
      Object.entries(byModality).forEach(([mod, data]) => {
        modalityStats[mod] = {
          gross: data.gross,
          net: data.net,
          fee: data.fee,
          avgFeePercent: data.reconciledGross > 0 ? (data.fee / data.reconciledGross) * 100 : 0,
          count: data.count
        };
      });

      res.json({
        totalGross,
        totalNet,
        totalFees,
        avgFeePercent: Number(avgFeePercent.toFixed(2)),
        totalPendingCount,
        totalReconciledCount,
        byModality: modalityStats
      });
    } catch (err) {
      console.error('[CardMachines] Erro ao calcular dashboard:', err);
      res.status(500).json({ error: 'Erro ao gerar dashboard de maquininhas', details: err.message });
    }
  });

  // POST /api/card-machine-receivables - Criação avulsa manual
  router.post('/card-machine-receivables', (req, res) => {
    try {
      const {
        sale_date,
        expected_payment_date,
        modality,
        gross_value,
        notes
      } = req.body;

      if (!sale_date || !modality || gross_value === undefined) {
        return res.status(400).json({ error: 'Campos obrigatórios: sale_date, modality, gross_value' });
      }

      const id = 'cmr_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
      const expectedDate = expected_payment_date || getNextBusinessDay(sale_date);
      const createdAt = new Date().toISOString();

      const stmt = db.prepare(`
        INSERT INTO card_machine_receivables (
          id, closing_id, sale_date, expected_payment_date, modality,
          gross_value, net_deposited_value, fee_value, fee_percent,
          status, reconciled_at, reconciled_by, notes, created_at
        ) VALUES (
          @id, @closing_id, @sale_date, @expected_payment_date, @modality,
          @gross_value, NULL, NULL, NULL,
          'Pendente', NULL, NULL, @notes, @created_at
        )
      `);

      stmt.run({
        id,
        closing_id: req.body.closing_id || null,
        sale_date,
        expected_payment_date: expectedDate,
        modality,
        gross_value: Number(gross_value),
        notes: notes || null,
        created_at: createdAt
      });

      const created = db.prepare('SELECT * FROM card_machine_receivables WHERE id = ?').get(id);
      res.status(201).json(created);
    } catch (err) {
      console.error('[CardMachines] Erro ao criar recebível:', err);
      res.status(500).json({ error: 'Erro ao criar recebível', details: err.message });
    }
  });

  // PUT /api/card-machine-receivables/:id/reconcile - Conferência e baixa com taxa calculada
  router.put('/card-machine-receivables/:id/reconcile', (req, res) => {
    try {
      const { id } = req.params;
      const { net_deposited_value, reconciled_by, notes, expected_payment_date } = req.body;

      const record = db.prepare('SELECT * FROM card_machine_receivables WHERE id = ?').get(id);
      if (!record) {
        return res.status(404).json({ error: 'Registro não encontrado' });
      }

      const grossValue = Number(record.gross_value) || 0;
      const netValue = Number(net_deposited_value);

      if (isNaN(netValue) || netValue < 0) {
        return res.status(400).json({ error: 'Valor líquido depositado inválido' });
      }

      const feeValue = Number(Math.max(0, grossValue - netValue).toFixed(2));
      const feePercent = grossValue > 0 ? Number(((feeValue / grossValue) * 100).toFixed(2)) : 0;
      const reconciledAt = new Date().toISOString();

      const stmt = db.prepare(`
        UPDATE card_machine_receivables
        SET net_deposited_value = ?,
            fee_value = ?,
            fee_percent = ?,
            status = 'Conferido',
            reconciled_at = ?,
            reconciled_by = ?,
            notes = COALESCE(?, notes),
            expected_payment_date = COALESCE(?, expected_payment_date)
        WHERE id = ?
      `);

      stmt.run(
        netValue,
        feeValue,
        feePercent,
        reconciledAt,
        reconciled_by || 'edevaldo',
        notes !== undefined ? notes : null,
        expected_payment_date || null,
        id
      );

      const updated = db.prepare('SELECT * FROM card_machine_receivables WHERE id = ?').get(id);
      res.json(updated);
    } catch (err) {
      console.error('[CardMachines] Erro ao conciliar recebível:', err);
      res.status(500).json({ error: 'Erro ao conciliar recebível', details: err.message });
    }
  });

  // PUT /api/card-machine-receivables/:id - Edição geral de registro
  router.put('/card-machine-receivables/:id', (req, res) => {
    try {
      const { id } = req.params;
      const {
        sale_date,
        expected_payment_date,
        modality,
        gross_value,
        net_deposited_value,
        status,
        notes,
        reconciled_by
      } = req.body;

      const record = db.prepare('SELECT * FROM card_machine_receivables WHERE id = ?').get(id);
      if (!record) {
        return res.status(404).json({ error: 'Registro não encontrado' });
      }

      const newGross = gross_value !== undefined ? Number(gross_value) : record.gross_value;
      let newNet = net_deposited_value !== undefined ? (net_deposited_value === null ? null : Number(net_deposited_value)) : record.net_deposited_value;
      let newStatus = status || record.status;
      let newFeeValue = record.fee_value;
      let newFeePercent = record.fee_percent;

      if (newNet !== null && newNet !== undefined && !isNaN(newNet)) {
        newFeeValue = Number(Math.max(0, newGross - newNet).toFixed(2));
        newFeePercent = newGross > 0 ? Number(((newFeeValue / newGross) * 100).toFixed(2)) : 0;
      } else {
        newFeeValue = null;
        newFeePercent = null;
      }

      const stmt = db.prepare(`
        UPDATE card_machine_receivables
        SET sale_date = ?,
            expected_payment_date = ?,
            modality = ?,
            gross_value = ?,
            net_deposited_value = ?,
            fee_value = ?,
            fee_percent = ?,
            status = ?,
            notes = ?,
            reconciled_by = COALESCE(?, reconciled_by)
        WHERE id = ?
      `);

      stmt.run(
        sale_date || record.sale_date,
        expected_payment_date || record.expected_payment_date,
        modality || record.modality,
        newGross,
        newNet,
        newFeeValue,
        newFeePercent,
        newStatus,
        notes !== undefined ? notes : record.notes,
        reconciled_by || null,
        id
      );

      const updated = db.prepare('SELECT * FROM card_machine_receivables WHERE id = ?').get(id);
      res.json(updated);
    } catch (err) {
      console.error('[CardMachines] Erro ao atualizar recebível:', err);
      res.status(500).json({ error: 'Erro ao atualizar recebível', details: err.message });
    }
  });

  // DELETE /api/card-machine-receivables/:id - Exclusão de registro
  router.delete('/api/card-machine-receivables/:id', (req, res) => {
    try {
      const { id } = req.params;
      const stmt = db.prepare('DELETE FROM card_machine_receivables WHERE id = ?');
      const result = stmt.run(id);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Registro não encontrado' });
      }
      res.json({ success: true, message: 'Registro removido com sucesso' });
    } catch (err) {
      console.error('[CardMachines] Erro ao excluir recebível:', err);
      res.status(500).json({ error: 'Erro ao excluir recebível', details: err.message });
    }
  });

  return router;
};
