// backend/card-machines-endpoints.js
// Gerenciamento e conciliação de repasses de maquininhas de cartão, taxas e acumulados

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

module.exports = (db) => {
  // Garantir que a tabela existe com todas as colunas
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_machine_receivables (
      id TEXT PRIMARY KEY,
      closing_id TEXT,
      sale_date TEXT NOT NULL,
      expected_payment_date TEXT NOT NULL,
      modality TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT 'Outros',
      machine_name TEXT NOT NULL DEFAULT 'M1',
      is_weekend_accumulated INTEGER DEFAULT 0,
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
    CREATE INDEX IF NOT EXISTS idx_card_machine_brand ON card_machine_receivables(brand);
    CREATE INDEX IF NOT EXISTS idx_card_machine_machine ON card_machine_receivables(machine_name);
  `);

  // Migração: Limpar registros pendentes de Pix e consolidar pendências de cartão em Débito Geral e Crédito Geral
  try {
    // 1. Remover Pix da tabela de recebíveis de maquininha
    db.exec(`
      DELETE FROM card_machine_receivables 
      WHERE status = 'Pendente' 
        AND (
          modality LIKE '%Pix%' 
          OR modality = 'Pix' 
          OR notes LIKE '%Pix Maquininha%'
        );
    `);

    // 2. Consolidar registros pendentes que estão divididos por máquina/bandeira
    const pendingRows = db.prepare(`SELECT * FROM card_machine_receivables WHERE status = 'Pendente'`).all();
    if (pendingRows.length > 0) {
      const groups = {};
      pendingRows.forEach(row => {
        const key = `${row.sale_date}_${row.expected_payment_date}`;
        if (!groups[key]) {
          groups[key] = {
            sale_date: row.sale_date,
            expected_payment_date: row.expected_payment_date,
            is_weekend_accumulated: row.is_weekend_accumulated || 0,
            debits: [],
            credits: [],
            other: []
          };
        }
        const mod = (row.modality || '').toLowerCase();
        if (mod.includes('deb') || mod.includes('déb')) {
          groups[key].debits.push(row);
        } else if (mod.includes('cred') || mod.includes('créd') || mod.includes('inst')) {
          groups[key].credits.push(row);
        } else {
          groups[key].other.push(row);
        }
      });

      const insertConsolidatedStmt = db.prepare(`
        INSERT INTO card_machine_receivables (
          id, closing_id, sale_date, expected_payment_date, modality, brand, machine_name, is_weekend_accumulated,
          gross_value, net_deposited_value, fee_value, fee_percent,
          status, reconciled_at, reconciled_by, notes, created_at
        ) VALUES (
          @id, @closing_id, @sale_date, @expected_payment_date, @modality, @brand, @machine_name, @is_weekend_accumulated,
          @gross_value, NULL, NULL, NULL,
          'Pendente', NULL, NULL, @notes, @created_at
        )
      `);

      const deleteIdsStmt = (ids) => {
        if (!ids.length) return;
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`DELETE FROM card_machine_receivables WHERE id IN (${placeholders})`).run(...ids);
      };

      db.transaction(() => {
        Object.values(groups).forEach(g => {
          // Processar Débitos
          if (g.debits.length > 0) {
            const needsMigration = g.debits.length > 1 || g.debits[0].modality !== 'Débito Geral';
            if (needsMigration) {
              const totalDeb = g.debits.reduce((sum, r) => sum + (Number(r.gross_value) || 0), 0);
              const debIds = g.debits.map(r => r.id);
              deleteIdsStmt(debIds);
              if (totalDeb > 0) {
                insertConsolidatedStmt.run({
                  id: `cmr_mig_deb_${g.sale_date.replace(/-/g, '')}_${g.expected_payment_date.replace(/-/g, '')}`,
                  closing_id: g.debits[0].closing_id || null,
                  sale_date: g.sale_date,
                  expected_payment_date: g.expected_payment_date,
                  modality: 'Débito Geral',
                  brand: 'Geral',
                  machine_name: 'Geral',
                  is_weekend_accumulated: g.is_weekend_accumulated,
                  gross_value: totalDeb,
                  notes: `Fechamento ${g.sale_date} - Débito Geral`,
                  created_at: new Date().toISOString()
                });
              }
            }
          }

          // Processar Créditos
          if (g.credits.length > 0) {
            const needsMigration = g.credits.length > 1 || g.credits[0].modality !== 'Crédito Geral';
            if (needsMigration) {
              const totalCred = g.credits.reduce((sum, r) => sum + (Number(r.gross_value) || 0), 0);
              const credIds = g.credits.map(r => r.id);
              deleteIdsStmt(credIds);
              if (totalCred > 0) {
                insertConsolidatedStmt.run({
                  id: `cmr_mig_cred_${g.sale_date.replace(/-/g, '')}_${g.expected_payment_date.replace(/-/g, '')}`,
                  closing_id: g.credits[0].closing_id || null,
                  sale_date: g.sale_date,
                  expected_payment_date: g.expected_payment_date,
                  modality: 'Crédito Geral',
                  brand: 'Geral',
                  machine_name: 'Geral',
                  is_weekend_accumulated: g.is_weekend_accumulated,
                  gross_value: totalCred,
                  notes: `Fechamento ${g.sale_date} - Crédito Geral`,
                  created_at: new Date().toISOString()
                });
              }
            }
          }
        });
      })();
    }
  } catch (migErr) {
    console.error('[CardMachines] Erro na migração de consolidação:', migErr.message);
  }

  // Helper para calcular data útil seguinte (pula sábado e domingo para segunda-feira)
  const getNextBusinessDayInfo = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = d.getDay(); // 0: Dom, 1: Seg, 2: Ter, 3: Qua, 4: Qui, 5: Sex, 6: Sab
    let isWeekendAcc = 0;
    if (dayOfWeek === 5) {
      // Sexta -> pula para Segunda (+3)
      d.setDate(d.getDate() + 3);
      isWeekendAcc = 1;
    } else if (dayOfWeek === 6) {
      // Sábado -> pula para Segunda (+2)
      d.setDate(d.getDate() + 2);
      isWeekendAcc = 1;
    } else if (dayOfWeek === 0) {
      // Domingo -> pula para Segunda (+1)
      d.setDate(d.getDate() + 1);
      isWeekendAcc = 1;
    } else {
      d.setDate(d.getDate() + 1);
    }
    return {
      nextDate: d.toISOString().split('T')[0],
      isWeekendAccumulated: isWeekendAcc
    };
  };

  // GET /api/card-machine-receivables - Lista recebíveis com filtros
  router.get('/card-machine-receivables', (req, res) => {
    try {
      const { month, year, status, modality, brand, machine, search } = req.query;
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
        if (modality === 'Débito Geral' || modality === 'Débito') {
          query += " AND (modality LIKE '%Débito%' OR modality LIKE '%Debito%')";
        } else if (modality === 'Crédito Geral' || modality === 'Crédito') {
          query += " AND (modality LIKE '%Crédito%' OR modality LIKE '%Credito%')";
        } else {
          query += ' AND modality = ?';
          params.push(modality);
        }
      }

      if (brand && brand !== 'all') {
        query += ' AND brand = ?';
        params.push(brand);
      }

      if (machine && machine !== 'all') {
        query += ' AND machine_name = ?';
        params.push(machine);
      }

      if (search) {
        query += ' AND (notes LIKE ? OR modality LIKE ? OR brand LIKE ? OR machine_name LIKE ? OR reconciled_by LIKE ?)';
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      query += ' ORDER BY expected_payment_date DESC, sale_date DESC, created_at DESC';

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
        ORDER BY expected_payment_date ASC, is_weekend_accumulated DESC, brand ASC, modality ASC, sale_date ASC
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
      const { month, year, machine } = req.query;
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

      if (machine && machine !== 'all') {
        query += ' AND machine_name = ?';
        params.push(machine);
      }

      const rows = db.prepare(query).all(...params);

      let totalGross = 0;
      let totalNet = 0;
      let totalFees = 0;
      let totalReconciledGross = 0;
      let totalPendingCount = 0;
      let totalReconciledCount = 0;

      const byModality = {
        'Débito Geral': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
        'Crédito Geral': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
        'Outros': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
      };

      const byBrand = {
        'Geral': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
        'Visa': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
        'Master': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
        'Elo': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
        'Outros': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
      };

      const byMachine = {
        'Geral': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
        'M1': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 },
        'M2': { gross: 0, net: 0, fee: 0, reconciledGross: 0, count: 0 }
      };

      rows.forEach(item => {
        const gross = Number(item.gross_value) || 0;
        const net = item.net_deposited_value !== null && item.net_deposited_value !== undefined ? Number(item.net_deposited_value) : null;
        const fee = Number(item.fee_value) || 0;

        totalGross += gross;

        const mLower = (item.modality || '').toLowerCase();
        let modKey = 'Outros';
        if (mLower.includes('deb') || mLower.includes('déb')) {
          modKey = 'Débito Geral';
        } else if (mLower.includes('cred') || mLower.includes('créd') || mLower.includes('inst')) {
          modKey = 'Crédito Geral';
        }

        byModality[modKey].gross += gross;
        byModality[modKey].count += 1;

        const brandKey = byBrand[item.brand] ? item.brand : 'Outros';
        byBrand[brandKey].gross += gross;
        byBrand[brandKey].count += 1;

        const machKey = byMachine[item.machine_name] ? item.machine_name : 'Geral';
        byMachine[machKey].gross += gross;
        byMachine[machKey].count += 1;

        if (item.status === 'Conferido' && net !== null) {
          totalNet += net;
          totalFees += fee;
          totalReconciledGross += gross;
          totalReconciledCount += 1;

          byModality[modKey].net += net;
          byModality[modKey].fee += fee;
          byModality[modKey].reconciledGross += gross;

          byBrand[brandKey].net += net;
          byBrand[brandKey].fee += fee;
          byBrand[brandKey].reconciledGross += gross;

          byMachine[machKey].net += net;
          byMachine[machKey].fee += fee;
          byMachine[machKey].reconciledGross += gross;
        } else {
          totalPendingCount += 1;
        }
      });

      const avgFeePercent = totalReconciledGross > 0 ? (totalFees / totalReconciledGross) * 100 : 0;

      const modalityStats = {};
      Object.entries(byModality).forEach(([mod, data]) => {
        if (data.count > 0 || ['Débito Geral', 'Crédito Geral'].includes(mod)) {
          modalityStats[mod] = {
            gross: data.gross,
            net: data.net,
            fee: data.fee,
            avgFeePercent: data.reconciledGross > 0 ? (data.fee / data.reconciledGross) * 100 : 0,
            count: data.count
          };
        }
      });

      const brandStats = {};
      Object.entries(byBrand).forEach(([brand, data]) => {
        brandStats[brand] = {
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
        byModality: modalityStats,
        byBrand: brandStats,
        byMachine
      });
    } catch (err) {
      console.error('[CardMachines] Erro ao calcular dashboard:', err);
      res.status(500).json({ error: 'Erro ao gerar dashboard de maquininhas', details: err.message });
    }
  });

  // GET /api/card-machine-receivables/fee-audit - Dados completos para a Guia de Auditoria de Taxas
  router.get('/card-machine-receivables/fee-audit', (req, res) => {
    try {
      const { month, year } = req.query;
      let query = "SELECT * FROM card_machine_receivables WHERE status = 'Conferido'";
      const params = [];

      if (year && month) {
        const monthPad = String(month).padStart(2, '0');
        query += ` AND (sale_date LIKE ? OR expected_payment_date LIKE ?)`;
        params.push(`${year}-${monthPad}%`, `${year}-${monthPad}%`);
      } else if (year) {
        query += ` AND (sale_date LIKE ? OR expected_payment_date LIKE ?)`;
        params.push(`${year}%`, `${year}%`);
      }

      query += ' ORDER BY expected_payment_date DESC, sale_date DESC';
      const rows = db.prepare(query).all(...params);

      let totalGross = 0;
      let totalNet = 0;
      let totalFees = 0;

      const byModality = {
        'Débito Geral': { gross: 0, net: 0, fee: 0, avgFeePercent: 0, count: 0 },
        'Crédito Geral': { gross: 0, net: 0, fee: 0, avgFeePercent: 0, count: 0 },
        'Outros': { gross: 0, net: 0, fee: 0, avgFeePercent: 0, count: 0 },
      };

      const byBrand = {
        'Geral': { gross: 0, net: 0, fee: 0, avgFeePercent: 0, count: 0 },
        'Visa': { gross: 0, net: 0, fee: 0, avgFeePercent: 0, count: 0 },
        'Master': { gross: 0, net: 0, fee: 0, avgFeePercent: 0, count: 0 },
        'Elo': { gross: 0, net: 0, fee: 0, avgFeePercent: 0, count: 0 },
        'Outros': { gross: 0, net: 0, fee: 0, avgFeePercent: 0, count: 0 },
      };

      const dailyMap = {};

      rows.forEach(item => {
        const gross = Number(item.gross_value) || 0;
        const net = Number(item.net_deposited_value) || 0;
        const fee = Number(item.fee_value) || 0;

        totalGross += gross;
        totalNet += net;
        totalFees += fee;

        const mLower = (item.modality || '').toLowerCase();
        let modKey = 'Outros';
        if (mLower.includes('deb') || mLower.includes('déb')) {
          modKey = 'Débito Geral';
        } else if (mLower.includes('cred') || mLower.includes('créd') || mLower.includes('inst')) {
          modKey = 'Crédito Geral';
        }

        byModality[modKey].gross += gross;
        byModality[modKey].net += net;
        byModality[modKey].fee += fee;
        byModality[modKey].count += 1;

        const brandKey = byBrand[item.brand] ? item.brand : 'Outros';
        byBrand[brandKey].gross += gross;
        byBrand[brandKey].net += net;
        byBrand[brandKey].fee += fee;
        byBrand[brandKey].count += 1;

        const dateKey = item.expected_payment_date || item.sale_date;
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = { date: dateKey, gross: 0, fee: 0 };
        }
        dailyMap[dateKey].gross += gross;
        dailyMap[dateKey].fee += fee;
      });

      Object.values(byModality).forEach(m => {
        m.avgFeePercent = m.gross > 0 ? Number(((m.fee / m.gross) * 100).toFixed(2)) : 0;
      });

      Object.values(byBrand).forEach(b => {
        b.avgFeePercent = b.gross > 0 ? Number(((b.fee / b.gross) * 100).toFixed(2)) : 0;
      });

      const dailyTrend = Object.values(dailyMap)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(d => ({
          date: d.date,
          gross: d.gross,
          fee: d.fee,
          feePercent: d.gross > 0 ? Number(((d.fee / d.gross) * 100).toFixed(2)) : 0
        }));

      const overallAvgFeePercent = totalGross > 0 ? Number(((totalFees / totalGross) * 100).toFixed(2)) : 0;

      res.json({
        overallAvgFeePercent,
        totalGrossReconciled: totalGross,
        totalNetReconciled: totalNet,
        totalFeesPaid: totalFees,
        byModality,
        byBrand,
        dailyTrend,
        recentAudits: rows.slice(0, 50)
      });
    } catch (err) {
      console.error('[CardMachines] Erro ao calcular auditoria de taxas:', err);
      res.status(500).json({ error: 'Erro ao gerar auditoria de taxas', details: err.message });
    }
  });

  // POST /api/card-machine-receivables/reconcile-consolidated - Conciliação em lote/acumulada
  router.post('/card-machine-receivables/reconcile-consolidated', (req, res) => {
    try {
      const { itemIds, total_net_deposited, reconciled_by, notes } = req.body;

      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: 'itemIds é obrigatório e deve ser um array não vazio' });
      }

      const netTotal = Number(total_net_deposited);
      if (isNaN(netTotal) || netTotal < 0) {
        return res.status(400).json({ error: 'Valor líquido total depositado inválido' });
      }

      const placeholders = itemIds.map(() => '?').join(',');
      const items = db.prepare(`SELECT * FROM card_machine_receivables WHERE id IN (${placeholders})`).all(...itemIds);

      if (items.length === 0) {
        return res.status(404).json({ error: 'Nenhum item encontrado para conciliação' });
      }

      const totalGross = items.reduce((sum, item) => sum + (Number(item.gross_value) || 0), 0);
      const totalFee = Math.max(0, totalGross - netTotal);
      const overallFeePercent = totalGross > 0 ? (totalFee / totalGross) * 100 : 0;
      const reconciledAt = new Date().toISOString();

      const updateStmt = db.prepare(`
        UPDATE card_machine_receivables
        SET net_deposited_value = ?,
            fee_value = ?,
            fee_percent = ?,
            status = 'Conferido',
            reconciled_at = ?,
            reconciled_by = ?,
            notes = COALESCE(?, notes)
        WHERE id = ?
      `);

      db.transaction(() => {
        let distributedNet = 0;
        let distributedFee = 0;

        items.forEach((item, index) => {
          const itemGross = Number(item.gross_value) || 0;
          let itemNet = 0;
          let itemFee = 0;

          if (index === items.length - 1) {
            // Último item recebe a diferença residual para evitar arredondamento de centavos
            itemNet = Number((netTotal - distributedNet).toFixed(2));
            itemFee = Number((totalFee - distributedFee).toFixed(2));
          } else {
            const ratio = totalGross > 0 ? (itemGross / totalGross) : (1 / items.length);
            itemNet = Number((netTotal * ratio).toFixed(2));
            itemFee = Number((totalFee * ratio).toFixed(2));
            distributedNet += itemNet;
            distributedFee += itemFee;
          }

          const itemFeePercent = itemGross > 0 ? Number(((itemFee / itemGross) * 100).toFixed(2)) : Number(overallFeePercent.toFixed(2));

          updateStmt.run(
            itemNet,
            itemFee,
            itemFeePercent,
            reconciledAt,
            reconciled_by || 'edevaldo',
            notes || null,
            item.id
          );
        });
      })();

      const updatedItems = db.prepare(`SELECT * FROM card_machine_receivables WHERE id IN (${placeholders})`).all(...itemIds);
      res.json({
        success: true,
        totalGross,
        totalNet: netTotal,
        totalFee,
        overallFeePercent: Number(overallFeePercent.toFixed(2)),
        items: updatedItems
      });
    } catch (err) {
      console.error('[CardMachines] Erro na conciliação consolidada:', err);
      res.status(500).json({ error: 'Erro ao conciliar lote', details: err.message });
    }
  });

  // POST /api/card-machine-receivables - Criação avulsa manual
  router.post('/card-machine-receivables', (req, res) => {
    try {
      const {
        sale_date,
        expected_payment_date,
        modality,
        brand,
        machine_name,
        gross_value,
        notes
      } = req.body;

      if (!sale_date || !modality || gross_value === undefined) {
        return res.status(400).json({ error: 'Campos obrigatórios: sale_date, modality, gross_value' });
      }

      const id = 'cmr_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
      const busDayInfo = getNextBusinessDayInfo(sale_date);
      const expectedDate = expected_payment_date || busDayInfo.nextDate;
      const isWeekendAcc = req.body.is_weekend_accumulated !== undefined ? req.body.is_weekend_accumulated : busDayInfo.isWeekendAccumulated;
      const createdAt = new Date().toISOString();

      const stmt = db.prepare(`
        INSERT INTO card_machine_receivables (
          id, closing_id, sale_date, expected_payment_date, modality, brand, machine_name, is_weekend_accumulated,
          gross_value, net_deposited_value, fee_value, fee_percent,
          status, reconciled_at, reconciled_by, notes, created_at
        ) VALUES (
          @id, @closing_id, @sale_date, @expected_payment_date, @modality, @brand, @machine_name, @is_weekend_accumulated,
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
        brand: brand || 'Outros',
        machine_name: machine_name || 'M1',
        is_weekend_accumulated: isWeekendAcc,
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

  // PUT /api/card-machine-receivables/:id/reconcile - Conferência individual
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
        brand,
        machine_name,
        is_weekend_accumulated,
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
            brand = ?,
            machine_name = ?,
            is_weekend_accumulated = ?,
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
        brand || record.brand,
        machine_name || record.machine_name || 'M1',
        is_weekend_accumulated !== undefined ? is_weekend_accumulated : record.is_weekend_accumulated,
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
  router.delete('/card-machine-receivables/:id', (req, res) => {
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
