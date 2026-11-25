// team-schedule-endpoints.js
// Endpoints do Módulo Escala & Equipe (Gestão de Turnos, Folgas e Simulador Financeiro)

const express = require('express');
const security = require('./security.js');

function getCurrentMondayYMD(refDate = new Date()) {
  const local = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const dow = local.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  local.setDate(local.getDate() + offset);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function createEmptyWeek(start = '14:00', end = '20:00') {
  return {
    Seg: { off: true, start, end, lStart: '', lEnd: '' },
    Ter: { off: true, start, end, lStart: '', lEnd: '' },
    Qua: { off: true, start, end, lStart: '', lEnd: '' },
    Qui: { off: true, start, end, lStart: '', lEnd: '' },
    Sex: { off: true, start, end, lStart: '', lEnd: '' },
    Sab: { off: true, start, end, lStart: '', lEnd: '' },
    Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
  };
}

function getDefaultSeed() {
  return {
    presetId: 'clt_44_seg_sab',
    weekAStartDate: getCurrentMondayYMD(),
    roster: [
      { key: 'Edevaldo', name: 'Edevaldo Cruz', roleLabel: 'Sócio · Gestão e Entregas', isHired: false, isRT: false },
      { key: 'Farmaceutica', name: 'Nayane (Farmacêutica RT)', roleLabel: 'Sócia · Assistência Farmacêutica', isHired: false, isRT: true },
      { key: 'Contratado1', name: 'Balconista / Caixa 1', roleLabel: 'Equipe Contratada', isHired: true, isRT: false },
      { key: 'Contratado2', name: 'Apoio / Estagiário 2', roleLabel: 'Equipe Contratada (Opcional)', isHired: true, isRT: false }
    ],
    weekA: {
      Edevaldo: {
        Seg: { off: false, start: '07:30', end: '16:30', lStart: '12:30', lEnd: '13:30' },
        Ter: { off: true, start: '07:30', end: '16:30', lStart: '', lEnd: '' },
        Qua: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '14:30' },
        Qui: { off: false, start: '07:30', end: '16:30', lStart: '12:30', lEnd: '13:30' },
        Sex: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '14:30' },
        Sab: { off: false, start: '07:30', end: '20:00', lStart: '12:30', lEnd: '14:00' },
        Dom: { off: false, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Farmaceutica: {
        Seg: { off: false, start: '09:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Ter: { off: false, start: '07:30', end: '20:00', lStart: '12:30', lEnd: '14:00' },
        Qua: { off: false, start: '07:30', end: '17:00', lStart: '12:00', lEnd: '13:30' },
        Qui: { off: false, start: '09:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Sex: { off: false, start: '07:30', end: '17:00', lStart: '12:00', lEnd: '13:30' },
        Sab: { off: true, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado1: {
        Seg: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Ter: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Qua: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Qui: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Sex: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Sab: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado2: createEmptyWeek()
    },
    weekB: {
      Edevaldo: {
        Seg: { off: false, start: '10:30', end: '20:00', lStart: '12:30', lEnd: '13:30' },
        Ter: { off: true, start: '07:30', end: '16:30', lStart: '', lEnd: '' },
        Qua: { off: false, start: '10:30', end: '20:00', lStart: '12:30', lEnd: '13:30' },
        Qui: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '14:30' },
        Sex: { off: false, start: '10:30', end: '20:00', lStart: '12:30', lEnd: '13:30' },
        Sab: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Farmaceutica: {
        Seg: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Ter: { off: false, start: '07:30', end: '20:00', lStart: '12:30', lEnd: '14:00' },
        Qua: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Qui: { off: false, start: '07:30', end: '15:30', lStart: '12:00', lEnd: '13:00' },
        Sex: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Sab: { off: false, start: '12:30', end: '20:00', lStart: '', lEnd: '' },
        Dom: { off: false, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado1: {
        Seg: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Ter: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Qua: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Qui: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Sex: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Sab: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado2: createEmptyWeek()
    },
    finance: {
      regime: 'clt_integral',
      qtdContratados: 1,
      salarioBase: 1650,
      vtGastoTotal: 0,
      outrosCustos: 40,
      incluirMultaFgts: false,
      diasFolgaMes: 4,
      custoEntregaFolga: 45,
      faturamentoRef: 36000,
      tetoOrcamento: 2500
    }
  };
}

function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

module.exports = (db) => {
  const router = express.Router();

  db.exec(`
    CREATE TABLE IF NOT EXISTS team_schedule_config (
      id TEXT PRIMARY KEY,
      preset_id TEXT NOT NULL,
      week_a_start_date TEXT NOT NULL,
      roster_json TEXT NOT NULL,
      week_a_json TEXT NOT NULL,
      week_b_json TEXT NOT NULL,
      finance_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    )
  `);

  router.get('/', (req, res) => {
    try {
      const isAdmin = security.isAdminUser(req.user);
      const row = db.prepare('SELECT * FROM team_schedule_config WHERE id = ?').get('default');

      let config;
      if (!row) {
        config = {
          ...getDefaultSeed(),
          isDefault: true
        };
      } else {
        const financeParsed = JSON.parse(row.finance_json);
        config = {
          presetId: row.preset_id,
          weekAStartDate: row.week_a_start_date,
          roster: JSON.parse(row.roster_json),
          weekA: JSON.parse(row.week_a_json),
          weekB: JSON.parse(row.week_b_json),
          finance: financeParsed,
          updatedAt: row.updated_at,
          updatedBy: row.updated_by || undefined,
          isDefault: false
        };
      }

      const regime = config.finance?.regime || 'clt_integral';
      const qtdContratados = Number(config.finance?.qtdContratados) === 2 ? 2 : 1;
      config.meta = { regime, qtdContratados };

      if (!isAdmin) {
        config.finance = null;
      }

      res.json({ success: true, isAdmin, config });
    } catch (err) {
      console.error('[TEAM SCHEDULE API] Erro ao buscar escala:', err.message);
      res.status(500).json({ success: false, error: 'Erro ao carregar configuração de escala.' });
    }
  });

  router.put('/', security.requireAdmin, (req, res) => {
    try {
      const body = req.body || {};
      const { presetId, weekAStartDate, roster, weekA, weekB, finance } = body;

      if (typeof presetId !== 'string' || !presetId.trim()) {
        return res.status(400).json({ success: false, error: 'presetId inválido.' });
      }
      if (typeof weekAStartDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekAStartDate)) {
        return res.status(400).json({ success: false, error: 'weekAStartDate deve estar no formato YYYY-MM-DD.' });
      }
      if (!Array.isArray(roster) || roster.length === 0) {
        return res.status(400).json({ success: false, error: 'roster inválido.' });
      }
      if (!isPlainObject(weekA) || !isPlainObject(weekB) || !isPlainObject(finance)) {
        return res.status(400).json({ success: false, error: 'weekA, weekB e finance devem ser objetos válidos.' });
      }

      const updatedAt = new Date().toISOString();
      const updatedBy = (req.user && req.user.name) ? String(req.user.name) : 'Administrador';

      db.prepare(`
        INSERT INTO team_schedule_config (
          id, preset_id, week_a_start_date, roster_json, week_a_json, week_b_json, finance_json, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          preset_id = excluded.preset_id,
          week_a_start_date = excluded.week_a_start_date,
          roster_json = excluded.roster_json,
          week_a_json = excluded.week_a_json,
          week_b_json = excluded.week_b_json,
          finance_json = excluded.finance_json,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `).run(
        'default',
        presetId.trim(),
        weekAStartDate,
        JSON.stringify(roster),
        JSON.stringify(weekA),
        JSON.stringify(weekB),
        JSON.stringify(finance),
        updatedAt,
        updatedBy
      );

      const savedConfig = {
        presetId: presetId.trim(),
        weekAStartDate,
        roster,
        weekA,
        weekB,
        finance,
        meta: {
          regime: finance.regime || 'clt_integral',
          qtdContratados: Number(finance.qtdContratados) === 2 ? 2 : 1
        },
        updatedAt,
        updatedBy,
        isDefault: false
      };

      res.json({ success: true, isAdmin: true, config: savedConfig });
    } catch (err) {
      console.error('[TEAM SCHEDULE API] Erro ao salvar escala:', err.message);
      res.status(500).json({ success: false, error: 'Erro ao salvar configuração de escala.' });
    }
  });

  router.get('/metrics', security.requireAdmin, (req, res) => {
    const fallback = { monthlyRevenueAvg: 36000, deliveriesPerDayAvg: 6.3, sampleMonths: 0 };
    try {
      let monthlyRevenueAvg = fallback.monthlyRevenueAvg;
      let sampleMonths = 0;

      const closingMonths = db.prepare(`
        SELECT substr(date, 1, 7) AS ym, SUM(totalSales) AS total
        FROM cash_closings
        WHERE date IS NOT NULL AND totalSales > 0
        GROUP BY ym
        ORDER BY ym DESC
        LIMIT 3
      `).all();

      if (Array.isArray(closingMonths) && closingMonths.length > 0) {
        const sum = closingMonths.reduce((acc, row) => acc + Number(row.total || 0), 0);
        const avg = sum / closingMonths.length;
        if (avg > 0) {
          monthlyRevenueAvg = Math.round(avg / 100) * 100;
          sampleMonths = closingMonths.length;
        }
      }

      let deliveriesPerDayAvg = fallback.deliveriesPerDayAvg;
      try {
        const delivs = db.prepare(`
          SELECT created_at, delivery_address
          FROM deliveries
          WHERE (sale_closed = 1 OR status NOT IN ('Nao_Fechado', 'Cancelado'))
            AND delivery_address IS NOT NULL
            AND lower(delivery_address) NOT LIKE '%balc%'
            AND lower(delivery_address) NOT LIKE '%loja%'
        `).all();

        if (Array.isArray(delivs) && delivs.length > 0) {
          const days = new Set();
          for (const d of delivs) {
            if (d.created_at) days.add(String(d.created_at).slice(0, 10));
          }
          if (days.size > 0) {
            deliveriesPerDayAvg = Number((delivs.length / days.size).toFixed(1));
          }
        }
      } catch (eDeliv) {
        // Mantém fallback de entregas se tabela deliveries ainda não existir em ambiente novo
      }

      res.json({
        success: true,
        metrics: {
          monthlyRevenueAvg,
          deliveriesPerDayAvg,
          sampleMonths
        }
      });
    } catch (err) {
      res.json({ success: true, metrics: fallback });
    }
  });

  return router;
};
