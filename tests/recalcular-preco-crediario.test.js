import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  roundCrediario,
  isPromoActive,
  buildCrediarioPlan
} = require('../backend/scripts/recalcular-preco-crediario.js');

describe('Recálculo de Preços de Crediário (+20% com final 0, 5 ou 9)', () => {
  it('RCR-01: roundCrediario aplica +20% e arredonda para cima terminando em 0, 5 ou 9', () => {
    assert.strictEqual(roundCrediario(0), 0);
    assert.strictEqual(roundCrediario(-5), 0);
    assert.strictEqual(roundCrediario(10.0), 12.0);
    assert.strictEqual(roundCrediario(12.0), 14.4);
    assert.strictEqual(roundCrediario(13.99), 16.79);
    assert.strictEqual(roundCrediario(139.9), 167.89);
    assert.strictEqual(roundCrediario(11.84), 14.25);
    assert.strictEqual(roundCrediario(11.88), 14.29);
    assert.strictEqual(roundCrediario(84.99), 101.99);
    assert.strictEqual(roundCrediario(79.9), 95.89);
  });

  it('RCR-02: isPromoActive respeita PROMOCAO_PERMANENTE e janela de datas', () => {
    const refNow = new Date('2026-11-26T15:00:00');
    assert.strictEqual(isPromoActive({ PROD_PRPROMOCAO: 0 }, refNow), false);
    assert.strictEqual(
      isPromoActive({ PROD_PRPROMOCAO: 10, PROMOCAO_PERMANENTE: 'S', TERMINO_PROMOCAO: '2025-01-01' }, refNow),
      true
    );
    assert.strictEqual(isPromoActive({ PROD_PRPROMOCAO: 10, TERMINO_PROMOCAO: '2026-11-25' }, refNow), false);
    assert.strictEqual(isPromoActive({ PROD_PRPROMOCAO: 10, TERMINO_PROMOCAO: '2026-11-26' }, refNow), true);
    assert.strictEqual(isPromoActive({ PROD_PRPROMOCAO: 10, INICIO_PROMOCAO: '2026-12-01' }, refNow), false);
  });

  it('RCR-03: buildCrediarioPlan aplica regras de aumento, redução, novo, sem teto M e anomalia promo > venda', () => {
    const refNow = new Date('2026-11-26T15:00:00');
    const rows = [
      {
        PRODUTO_ID: 28726,
        PRODUTO: 'TRAMAL RETARD',
        PROD_PRVENDA: 149.24,
        PROD_PRPROMOCAO: 139.9,
        PROD_PRCREDIARIO: 145.0,
        PROD_SALDO: 1,
        TIPO_PRECO: 'M'
      },
      {
        PRODUTO_ID: 100,
        PRODUTO: 'PRODUTO CARO NO CREDIARIO',
        PROD_PRVENDA: 20.0,
        PROD_PRPROMOCAO: 10.0,
        PROD_PRCREDIARIO: 18.0,
        PROD_SALDO: 3,
        TIPO_PRECO: 'L'
      },
      {
        PRODUTO_ID: 2332,
        PRODUTO: 'ESC DENTE COLGATE',
        PROD_PRVENDA: 21.5,
        PROD_PRPROMOCAO: 26.9,
        PROD_PRCREDIARIO: 22.5,
        PROD_SALDO: 2,
        TIPO_PRECO: 'L'
      },
      {
        PRODUTO_ID: 200,
        PRODUTO: 'PRODUTO NOVO',
        PROD_PRVENDA: 12.5,
        PROD_PRPROMOCAO: 0,
        PROD_PRCREDIARIO: null,
        PROD_SALDO: 5,
        TIPO_PRECO: 'L'
      },
      {
        PRODUTO_ID: 300,
        PRODUTO: 'JA NO PADRAO',
        PROD_PRVENDA: 12.5,
        PROD_PRPROMOCAO: 0,
        PROD_PRCREDIARIO: 15.0,
        PROD_SALDO: 1,
        TIPO_PRECO: 'L'
      },
      {
        PRODUTO_ID: 400,
        PRODUTO: 'SEM PRECO',
        PROD_PRVENDA: 0,
        PROD_PRPROMOCAO: 0,
        PROD_PRCREDIARIO: 0,
        PROD_SALDO: 1,
        TIPO_PRECO: 'L'
      }
    ];

    const plan = buildCrediarioPlan(rows, refNow);

    assert.strictEqual(plan.stats.totalAnalisados, 6);
    assert.strictEqual(plan.stats.totalAtualizaveis, 4);
    assert.strictEqual(plan.stats.totalSemAlteracao, 1);
    assert.strictEqual(plan.stats.totalSemPreco, 1);
    assert.strictEqual(plan.stats.aumentos, 2);
    assert.strictEqual(plan.stats.reducoes, 1);
    assert.strictEqual(plan.stats.novosDoZero, 1);
    assert.strictEqual(plan.stats.anomaliasPromoMaior, 1);
    assert.strictEqual(plan.stats.terminacoes.invalido, 0);

    const tramal = plan.items.find(i => i.produtoId === 28726);
    assert.strictEqual(tramal.precoBase, 139.9);
    assert.strictEqual(tramal.precoCrediarioNovo, 167.89);
    assert.strictEqual(tramal.direcao, 'AUMENTO');

    const reducao = plan.items.find(i => i.produtoId === 100);
    assert.strictEqual(reducao.precoCrediarioNovo, 12.0);
    assert.strictEqual(reducao.direcao, 'REDUCAO');

    const anom = plan.anomalies[0];
    assert.strictEqual(anom.produtoId, 2332);
    assert.strictEqual(anom.origemBase, 'VENDA_ANOMALIA_PROMO_MAIOR');
    assert.strictEqual(anom.precoBase, 21.5);
    assert.strictEqual(anom.precoCrediarioNovo, 25.8);
  });
});
