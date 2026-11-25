import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  analyzeTeamWeek,
  buildDefaultTeamScheduleConfig,
  computeTeamFinance,
  DEFAULT_ROSTER,
  getCurrentWeekType,
  TEAM_PRESETS
} from '../utils/teamSchedule.ts';

const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const express = backendRequire('express');
const Database = backendRequire('better-sqlite3');
const createTeamScheduleRouter = backendRequire('./team-schedule-endpoints.js');

describe('Módulo Escala & Equipe (BelaFarma)', () => {
  describe('1. Presets e Cobertura Quinzenal', () => {
    it('todos os 4 presets possuem 0 buracos, 5/5 dias úteis RT e zero alertas críticos', () => {
      for (const preset of Object.values(TEAM_PRESETS)) {
        const aA = analyzeTeamWeek(preset.weekA, DEFAULT_ROSTER, preset.finance.regime, preset.finance.qtdContratados);
        const aB = analyzeTeamWeek(preset.weekB, DEFAULT_ROSTER, preset.finance.regime, preset.finance.qtdContratados);

        assert.equal(aA.gapSlots, 0, `${preset.id} Semana A deveria ter 0 gaps`);
        assert.equal(aB.gapSlots, 0, `${preset.id} Semana B deveria ter 0 gaps`);
        assert.equal(aA.rtDaysSegSex, 5, `${preset.id} Semana A deveria ter 5/5 dias úteis RT`);
        assert.equal(aB.rtDaysSegSex, 5, `${preset.id} Semana B deveria ter 5/5 dias úteis RT`);

        const badA = aA.alerts.filter(a => a.level !== 'ok');
        const badB = aB.alerts.filter(a => a.level !== 'ok');
        assert.deepEqual(badA, [], `${preset.id} Semana A gerou alertas inesperados`);
        assert.deepEqual(badB, [], `${preset.id} Semana B gerou alertas inesperados`);
      }
    });

    it('preset recomendado clt_44_seg_sab fecha horas exatas nas Semanas A e B', () => {
      const p = TEAM_PRESETS.clt_44_seg_sab;
      const aA = analyzeTeamWeek(p.weekA, DEFAULT_ROSTER, p.finance.regime, p.finance.qtdContratados);
      const aB = analyzeTeamWeek(p.weekB, DEFAULT_ROSTER, p.finance.regime, p.finance.qtdContratados);

      assert.equal(aA.personHours.Contratado1, 44);
      assert.equal(aB.personHours.Contratado1, 44);
      assert.equal(aA.personHours.Edevaldo, 49.5);
      assert.equal(aB.personHours.Edevaldo, 40);
      assert.equal(aA.personHours.Farmaceutica, 45);
      assert.equal(aB.personHours.Farmaceutica, 49);
    });
  });

  describe('2. Auditor Automático CLT & CRF-MG', () => {
    it('detecta excesso de 44h, falta de intervalo de 1h, interjornada < 11h, falta de DSR e dia útil sem RT', () => {
      const base = buildDefaultTeamScheduleConfig(new Date(2026, 10, 23));
      const week = JSON.parse(JSON.stringify(base.weekA));

      // Remove RT na quarta-feira -> alerta CRF-MG
      week.Farmaceutica.Qua.off = true;
      // Balconista CLT trabalhando 7 dias, sem almoço na segunda, fechando 23:00 terça e abrindo 07:30 quarta -> interjornada < 11h + >44h + sem DSR
      week.Contratado1.Dom = { off: false, start: '07:30', end: '13:00', lStart: '', lEnd: '' };
      week.Contratado1.Seg = { off: false, start: '11:40', end: '20:00', lStart: '', lEnd: '' };
      week.Contratado1.Ter = { off: false, start: '11:40', end: '23:00', lStart: '15:00', lEnd: '16:00' };
      week.Contratado1.Qua = { off: false, start: '07:30', end: '16:30', lStart: '12:00', lEnd: '13:00' };

      const analysis = analyzeTeamWeek(week, base.roster, 'clt_integral', 1);
      const msgs = analysis.alerts.map(a => a.text).join('\n');

      assert.match(msgs, /CRF-MG: Qua/);
      assert.match(msgs, /ultrapassa o teto de 44h\/sem/);
      assert.match(msgs, /intervalo mínimo de 1h00/);
      assert.match(msgs, /descanso entre turnos/);
      assert.match(msgs, /trabalha os 7 dias sem Descanso Semanal Remunerado/);
    });
  });

  describe('3. Cálculos Financeiros (Simples Nacional)', () => {
    it('calcula CLT R$ 1.650 sem VT + entregas na folga em R$ 2.348,50', () => {
      const fin = computeTeamFinance(TEAM_PRESETS.clt_44_seg_sab.finance);
      assert.equal(Number(fin.desembolsoTotal.toFixed(2)), 2002.0);
      assert.equal(Number(fin.provisaoTotal.toFixed(2)), 346.5);
      assert.equal(Number(fin.custoTotalReal.toFixed(2)), 2348.5);
      assert.ok(fin.margemTeto > 0);
    });

    it('aplica desconto legal de até 6% do salário no Vale-Transporte CLT', () => {
      const fin = computeTeamFinance({
        ...TEAM_PRESETS.clt_44_seg_sab.finance,
        vtGastoTotal: 200
      });
      // 6% de 1650 = 99 -> empresa paga 200 - 99 = 101
      assert.equal(Number(fin.vtNetUnit.toFixed(2)), 101.0);
    });

    it('zera FGTS/13º no Estágio (Lei 11.788) e soma multa FGTS 40% opcional na CLT', () => {
      const est = computeTeamFinance(TEAM_PRESETS.estagio_30h.finance);
      assert.equal(est.fgtsUnit, 0);
      assert.equal(est.decimoUnit, 0);
      assert.equal(est.vtNetUnit, 80);
      assert.equal(Number(est.desembolsoTotal.toFixed(2)), 1270.0);
      assert.equal(Number(est.custoTotalReal.toFixed(2)), 1353.33);

      const cltMulta = computeTeamFinance({
        ...TEAM_PRESETS.clt_44_seg_sab.finance,
        incluirMultaFgts: true
      });
      assert.equal(Number((cltMulta.multaUnit).toFixed(2)), 63.07);
    });
  });

  describe('4. Alternância Quinzenal Semana A / B', () => {
    it('alterna corretamente Semana A -> Semana B (+7d) -> Semana A (+14d)', () => {
      assert.equal(getCurrentWeekType('2026-11-23', new Date(2026, 10, 25)), 'A');
      assert.equal(getCurrentWeekType('2026-11-23', new Date(2026, 11, 2)), 'B');
      assert.equal(getCurrentWeekType('2026-11-23', new Date(2026, 11, 9)), 'A');
    });
  });

  describe('5. API REST e Controle de Acesso (ADM vs Operador)', () => {
    it('retorna seed padrão, protege salários de Operador e persiste alterações do ADM no SQLite', async () => {
      const db = new Database(':memory:');
      db.exec(`
        CREATE TABLE cash_closings (id TEXT PRIMARY KEY, date TEXT, totalSales REAL);
        INSERT INTO cash_closings (id, date, totalSales) VALUES
          ('1', '2026-10-15T20:00:00Z', 32000),
          ('2', '2026-09-15T20:00:00Z', 34000);
        CREATE TABLE deliveries (id TEXT PRIMARY KEY, created_at TEXT, delivery_address TEXT, sale_closed INTEGER, status TEXT);
        INSERT INTO deliveries (id, created_at, delivery_address, sale_closed, status) VALUES
          ('d1', '2026-10-06 13:00:00', 'Rua A, 10', 1, 'Entregue'),
          ('d2', '2026-10-06 16:00:00', 'Rua B, 20', 1, 'Entregue'),
          ('d3', '2026-10-06 17:00:00', 'Balcão / Loja', 1, 'Entregue');
      `);

      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        const roleHeader = req.headers['x-test-role'] || 'Administrador';
        req.user = {
          id: 'u1',
          name: roleHeader === 'Administrador' ? 'Edevaldo Cruz' : 'Operador Caixa',
          role: String(roleHeader)
        };
        next();
      });
      app.use('/api/team-schedule', createTeamScheduleRouter(db));

      const server = await new Promise(resolve => {
        const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
      });
      const baseUrl = `http://127.0.0.1:${server.address().port}/api/team-schedule`;

      try {
        // 1) GET ADM
        const resAdm = await fetch(baseUrl, { headers: { 'x-test-role': 'Administrador' } });
        assert.equal(resAdm.status, 200);
        const dataAdm = await resAdm.json();
        assert.equal(dataAdm.isAdmin, true);
        assert.equal(dataAdm.config.finance.salarioBase, 1650);

        // 2) GET Operador não pode receber salários
        const resOp = await fetch(baseUrl, { headers: { 'x-test-role': 'Operador' } });
        assert.equal(resOp.status, 200);
        const dataOp = await resOp.json();
        assert.equal(dataOp.isAdmin, false);
        assert.equal(dataOp.config.finance, null);
        assert.equal(dataOp.config.meta.qtdContratados, 1);

        // 3) PUT Operador retorna 403
        const resPutOp = await fetch(baseUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-test-role': 'Operador' },
          body: JSON.stringify(dataAdm.config)
        });
        assert.equal(resPutOp.status, 403);

        // 4) PUT ADM persiste no SQLite
        const updatedPayload = {
          ...dataAdm.config,
          finance: { ...dataAdm.config.finance, salarioBase: 1780 }
        };
        const resPutAdm = await fetch(baseUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-test-role': 'Administrador' },
          body: JSON.stringify(updatedPayload)
        });
        assert.equal(resPutAdm.status, 200);

        const resAfter = await fetch(baseUrl, { headers: { 'x-test-role': 'Administrador' } });
        const dataAfter = await resAfter.json();
        assert.equal(dataAfter.config.finance.salarioBase, 1780);
        assert.equal(dataAfter.config.updatedBy, 'Edevaldo Cruz');

        const resOpAfter = await fetch(baseUrl, { headers: { 'x-test-role': 'Operador' } });
        const dataOpAfter = await resOpAfter.json();
        assert.equal(dataOpAfter.config.finance, null);

        // 5) Metrics: 403 para Operador, 200 com cálculo real para ADM
        const resMetOp = await fetch(`${baseUrl}/metrics`, { headers: { 'x-test-role': 'Operador' } });
        assert.equal(resMetOp.status, 403);

        const resMetAdm = await fetch(`${baseUrl}/metrics`, { headers: { 'x-test-role': 'Administrador' } });
        assert.equal(resMetAdm.status, 200);
        const metData = await resMetAdm.json();
        assert.equal(metData.metrics.monthlyRevenueAvg, 33000);
        assert.equal(metData.metrics.deliveriesPerDayAvg, 2);
      } finally {
        await new Promise(resolve => server.close(resolve));
        db.close();
      }
    });
  });
});
