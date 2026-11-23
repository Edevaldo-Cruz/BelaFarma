import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const Database = backendRequire('better-sqlite3');
const express = backendRequire('express');

const security = require('../backend/security.js');
const caderninho = require('../backend/modules/erp/caderninho.service.js');

function createTestRegistrarVenda(memDb) {
  let seq = 1;
  return function registrarVendaMock(payload) {
    const {
      items = [],
      payments = [],
      customer_name = null,
      discount_value = 0,
      user_name = 'Caixa',
      seller_name = null,
      notes = ''
    } = payload;

    let totalItemsValue = 0;
    const processedItems = [];

    for (const it of items) {
      const qty = Math.max(1, parseFloat(it.quantity) || 1);
      const unitPrice = Math.round((parseFloat(it.unit_price) || 0) * 100) / 100;
      const subtotal = Math.round(qty * unitPrice * 100) / 100;
      totalItemsValue = Math.round((totalItemsValue + subtotal) * 100) / 100;

      processedItems.push({
        product_code: String(it.code || it.product_code || '').trim(),
        barcode: String(it.barcode || ''),
        product_name: String(it.product_name || it.name || 'PRODUTO'),
        quantity: qty,
        unit_price: unitPrice,
        total_price: subtotal,
        unit_cost: Number(it.unit_cost || 0),
        total_cost: Math.round(qty * Number(it.unit_cost || 0) * 100) / 100,
        profit: subtotal
      });
    }

    const desconto = Math.max(0, Math.round((parseFloat(discount_value) || 0) * 100) / 100);
    const totalFinal = Math.max(0, Math.round((totalItemsValue - desconto) * 100) / 100);

    const totalPago = Math.round(
      payments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0) * 100
    ) / 100;

    if (Math.round((totalFinal - totalPago) * 100) > 5) {
      throw new Error(`Valor pago (${totalPago.toFixed(2)}) inferior ao total (${totalFinal.toFixed(2)}).`);
    }

    const saleId = `VND-TEST-${seq++}`;
    const today = caderninho.getLocalDateStr();
    const pmSummary = payments.map(p => p.payment_method).join(', ') || 'DINHEIRO';

    memDb.prepare(`
      INSERT INTO sales (
        id, sale_date, sale_time, total_items_value, discount_value, total_value,
        payment_method, customer_name, user_name, seller_name, status, notes
      ) VALUES (?, ?, '12:00:00', ?, ?, ?, ?, ?, ?, ?, 'CONCLUIDA', ?)
    `).run(
      saleId,
      today,
      totalItemsValue,
      desconto,
      totalFinal,
      pmSummary,
      customer_name || null,
      user_name,
      seller_name || user_name,
      notes || ''
    );

    const insItem = memDb.prepare(`
      INSERT INTO sale_items (
        id, sale_id, product_code, barcode, product_name,
        quantity, unit_price, total_price, unit_cost, total_cost, profit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updStock = memDb.prepare(`
      UPDATE products SET stock_qty = stock_qty - ? WHERE code = ?
    `);

    processedItems.forEach((it, idx) => {
      insItem.run(
        `${saleId}-${idx + 1}`,
        saleId,
        it.product_code,
        it.barcode,
        it.product_name,
        it.quantity,
        it.unit_price,
        it.total_price,
        it.unit_cost,
        it.total_cost,
        it.profit
      );
      if (it.product_code !== 'AVULSO-CADERNINHO') {
        updStock.run(it.quantity, it.product_code);
      }
    });

    const insPay = memDb.prepare(`
      INSERT INTO sale_payments (id, sale_id, payment_method, amount, change_amount, card_brand, installments)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    payments.forEach((p, idx) => {
      insPay.run(
        `${saleId}-PAY-${idx + 1}`,
        saleId,
        p.payment_method,
        Number(p.amount || 0),
        Number(p.change_amount || 0),
        p.card_brand || null,
        Number(p.installments || 1)
      );
    });

    return {
      success: true,
      sale_id: saleId,
      sale_date: today,
      total_value: totalFinal
    };
  };
}

describe('Caderninho do PDV — Anotação, Estoque, Pagamento Parcial, Histórico & Segurança', () => {
  let memDb;
  let server;
  let baseUrl;
  let opToken;
  let adminToken;

  const getProductStock = code =>
    memDb.prepare('SELECT stock_qty FROM products WHERE code = ?').get(code).stock_qty;

  const getSalesStats = () =>
    memDb
      .prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(total_value), 0) as total FROM sales WHERE status = 'CONCLUIDA'")
      .get();

  before(async () => {
    memDb = new Database(':memory:');
    memDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        accessKey TEXT,
        accessKeyHash TEXT
      );
      CREATE TABLE products (
        code TEXT PRIMARY KEY,
        barcode TEXT,
        name TEXT NOT NULL,
        sale_price REAL NOT NULL DEFAULT 0,
        cost_price REAL DEFAULT 0,
        stock_qty REAL NOT NULL DEFAULT 0
      );
      CREATE TABLE sales (
        id TEXT PRIMARY KEY,
        sale_date TEXT NOT NULL,
        sale_time TEXT NOT NULL,
        total_items_value REAL NOT NULL DEFAULT 0,
        discount_value REAL NOT NULL DEFAULT 0,
        total_value REAL NOT NULL DEFAULT 0,
        payment_method TEXT,
        customer_id TEXT,
        customer_name TEXT,
        user_name TEXT NOT NULL DEFAULT 'Caixa',
        seller_name TEXT,
        status TEXT NOT NULL DEFAULT 'CONCLUIDA',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        product_code TEXT NOT NULL,
        barcode TEXT,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        unit_cost REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        profit REAL DEFAULT 0
      );
      CREATE TABLE sale_payments (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        amount REAL NOT NULL,
        change_amount REAL DEFAULT 0,
        card_brand TEXT,
        installments INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
    `);

    const adminHash = security.hashAccessKey('admin-secret-99');
    memDb
      .prepare('INSERT INTO users (id, name, role, accessKey, accessKeyHash) VALUES (?, ?, ?, ?, ?)')
      .run('adm-1', 'Edevaldo', 'Administrador', null, adminHash);
    memDb
      .prepare('INSERT INTO users (id, name, role, accessKey, accessKeyHash) VALUES (?, ?, ?, ?, ?)')
      .run('op-1', 'Caixa Operador', 'Operador', '1234', null);

    memDb
      .prepare('INSERT INTO products (code, barcode, name, sale_price, cost_price, stock_qty) VALUES (?, ?, ?, ?, ?, ?)')
      .run('DIP-01', '7890001', 'DIPIRONA SODICA 500MG', 25.0, 12.0, 20);
    memDb
      .prepare('INSERT INTO products (code, barcode, name, sale_price, cost_price, stock_qty) VALUES (?, ?, ?, ?, ?, ?)')
      .run('VIT-02', '7890002', 'VITAMINA C 1G 30CP', 40.0, 20.0, 10);

    caderninho.ensureCaderninhoSchema(memDb);

    opToken = security.signToken({ id: 'op-1', name: 'Caixa Operador', role: 'Operador' });
    adminToken = security.signToken({ id: 'adm-1', name: 'Edevaldo', role: 'Administrador' });

    const app = express();
    app.use(express.json());
    app.use('/api', security.apiAuthMiddleware);
    app.use(
      '/api/erp/pos/caderninho',
      caderninho.createCaderninhoRouter(memDb, {
        registrarVendaFn: createTestRegistrarVenda(memDb)
      })
    );

    await new Promise(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    if (memDb) memDb.close();
  });

  it('CAD-01: Anotar no Caderninho não cria venda nem baixa estoque, unifica nome e alerta acima de R$ 100 sem bloquear; evita desconto duplo', async () => {
    // 1) Compra 2x DIP-01 (50) + 1x VIT-02 (40), com desconto de R$ 5 no item VIT-02 + R$ 10 desconto geral = total R$ 75
    // Como cartDiscount no PDV soma itemDiscounts + generalDiscountAmount (5 + 10 = 15), discount_includes_items=true evita cobrar 15 + 5 = 20 de desconto
    const r1 = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({
        personName: 'José da Silva',
        discount_value: 15,
        discount_includes_items: true,
        items: [
          { code: 'DIP-01', barcode: '7890001', name: 'DIPIRONA SODICA 500MG', quantity: 2, unit_price: 25.0, unit_cost: 12.0, total_price: 50.0 },
          { code: 'VIT-02', barcode: '7890002', name: 'VITAMINA C 1G 30CP', quantity: 1, unit_price: 40.0, unit_cost: 20.0, total_price: 35.0 }
        ]
      })
    });
    assert.strictEqual(r1.status, 201);
    const d1 = await r1.json();
    assert.strictEqual(d1.entry.total_amount, 75);
    assert.strictEqual(d1.newOpenBalance, 75);
    assert.strictEqual(d1.exceededLimit, false);

    // Estoque e vendas do dia permanecem intactos
    assert.strictEqual(getProductStock('DIP-01'), 20);
    assert.strictEqual(getProductStock('VIT-02'), 10);
    assert.strictEqual(getSalesStats().cnt, 0);

    // 2) Segunda anotação para "jose da silva" (sem acento, minúsculo) somando R$ 40 -> acumulado R$ 115 (> R$ 100)
    const r2 = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({
        personName: '  jose   da  silva ',
        items: [{ code: 'VIT-02', barcode: '7890002', name: 'VITAMINA C 1G 30CP', quantity: 1, unit_price: 40.0, unit_cost: 20.0 }]
      })
    });
    assert.strictEqual(r2.status, 201);
    const d2 = await r2.json();
    assert.strictEqual(d2.person.id, d1.person.id, 'Nomes equivalentes devem apontar para a mesma pessoa');
    assert.strictEqual(d2.newOpenBalance, 115);
    assert.strictEqual(d2.exceededLimit, true, 'Deve sinalizar ultrapassagem do limite brando de R$ 100 sem bloquear');
    assert.strictEqual(getProductStock('VIT-02'), 10);
    assert.strictEqual(getSalesStats().cnt, 0);
  });

  it('CAD-02: Quitação total registra venda oficial única em sales e baixa stock_qty dos produtos exatamente 1 vez', async () => {
    const peopleRes = await fetch(`${baseUrl}/api/erp/pos/caderninho/people?q=Jose&onlyOpen=1`, {
      headers: { Authorization: `Bearer ${opToken}` }
    });
    const peopleJson = await peopleRes.json();
    assert.strictEqual(peopleJson.people.length, 1);
    const joseId = peopleJson.people[0].id;
    assert.strictEqual(peopleJson.people[0].openBalance, 115);

    const payRes = await fetch(`${baseUrl}/api/erp/pos/caderninho/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({
        personId: joseId,
        mode: 'total',
        payment_method: 'PIX'
      })
    });
    assert.strictEqual(payRes.status, 200);
    const payJson = await payRes.json();
    assert.strictEqual(payJson.paidAmount, 115);
    assert.strictEqual(payJson.remainingBalance, 0);

    // Verifica que 1 venda foi gerada em sales com R$ 115,00 e baixa única de 2x DIP-01 e 2x VIT-02
    const stats = getSalesStats();
    assert.strictEqual(stats.cnt, 1);
    assert.strictEqual(stats.total, 115);
    assert.strictEqual(getProductStock('DIP-01'), 18); // 20 - 2
    assert.strictEqual(getProductStock('VIT-02'), 8);  // 10 - 2

    const listOpenAgain = await fetch(`${baseUrl}/api/erp/pos/caderninho/people?onlyOpen=1`, {
      headers: { Authorization: `Bearer ${opToken}` }
    });
    const openJson = await listOpenAgain.json();
    assert.strictEqual(openJson.people.length, 0);
  });

  it('CAD-03: Pagamento parcial livre (R$ 40 em PIX + R$ 35 em Dinheiro com troco) fecha R$ 75 sem duplicar receita nem estoque', async () => {
    const salesBefore = getSalesStats().total; // 115
    const dipBefore = getProductStock('DIP-01'); // 18

    // Anota R$ 75 para Maria Clara (3x Dipirona R$ 25 = R$ 75)
    const entryRes = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({
        personName: 'Maria Clara',
        items: [{ code: 'DIP-01', barcode: '7890001', name: 'DIPIRONA SODICA 500MG', quantity: 3, unit_price: 25.0, unit_cost: 12.0 }]
      })
    });
    assert.strictEqual(entryRes.status, 201);
    const entryJson = await entryRes.json();
    const mariaId = entryJson.person.id;
    const entryId = entryJson.entry.id;
    assert.strictEqual(getProductStock('DIP-01'), dipBefore);

    // 1º Pagamento parcial de R$ 40,00 em PIX
    const p1Res = await fetch(`${baseUrl}/api/erp/pos/caderninho/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({
        personId: mariaId,
        mode: 'partial',
        amount: 40,
        payment_method: 'PIX'
      })
    });
    assert.strictEqual(p1Res.status, 200);
    const p1 = await p1Res.json();
    assert.strictEqual(p1.paidAmount, 40);
    assert.strictEqual(p1.remainingBalance, 35);

    // Estoque real de DIP-01 ainda não foi baixado porque a anotação ficou PARCIAL
    assert.strictEqual(getProductStock('DIP-01'), dipBefore);
    assert.strictEqual(getSalesStats().total, salesBefore + 40);

    const partialRow = memDb.prepare('SELECT status, paid_amount, remaining_amount FROM caderninho_entries WHERE id = ?').get(entryId);
    assert.strictEqual(partialRow.status, 'PARCIAL');
    assert.strictEqual(partialRow.paid_amount, 40);
    assert.strictEqual(partialRow.remaining_amount, 35);

    // 2º Pagamento quitando os R$ 35,00 restantes em DINHEIRO (com nota de R$ 50 -> troco R$ 15)
    const p2Res = await fetch(`${baseUrl}/api/erp/pos/caderninho/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({
        personId: mariaId,
        mode: 'partial',
        amount: 35,
        payment_method: 'DINHEIRO',
        amount_received: 50
      })
    });
    assert.strictEqual(p2Res.status, 200);
    const p2 = await p2Res.json();
    assert.strictEqual(p2.paidAmount, 35);
    assert.strictEqual(p2.changeAmount, 15);
    assert.strictEqual(p2.remainingBalance, 0);

    // Soma das vendas desta quitação = 40 + 35 = exatamente 75,00, e DIP-01 baixado exatamente 3 unidades
    assert.strictEqual(getSalesStats().total, salesBefore + 75);
    assert.strictEqual(getProductStock('DIP-01'), dipBefore - 3);

    const paidRow = memDb.prepare('SELECT status, paid_amount, remaining_amount FROM caderninho_entries WHERE id = ?').get(entryId);
    assert.strictEqual(paidRow.status, 'PAGA');
    assert.strictEqual(paidRow.paid_amount, 75);
    assert.strictEqual(paidRow.remaining_amount, 0);
  });

  it('CAD-04: Cancelamento exige motivo, permite no mesmo dia, bloqueia dia anterior sem Admin (403) e impede cancelar item já pago', async () => {
    // Cria 2 anotações para Carlos Alberto
    const eTodayRes = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({
        personName: 'Carlos Alberto',
        items: [{ code: 'DIP-01', barcode: '7890001', name: 'DIPIRONA SODICA 500MG', quantity: 1, unit_price: 25.0 }]
      })
    });
    const eToday = (await eTodayRes.json()).entry;

    const eOldRes = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({
        personName: 'Carlos Alberto',
        items: [{ code: 'VIT-02', barcode: '7890002', name: 'VITAMINA C 1G 30CP', quantity: 1, unit_price: 40.0 }]
      })
    });
    const eOld = (await eOldRes.json()).entry;

    // Retroage created_at da segunda anotação em 4 dias
    memDb.prepare("UPDATE caderninho_entries SET created_at = datetime('now', 'localtime', '-4 days') WHERE id = ?").run(eOld.id);

    // Sem motivo -> 400
    const noReasonRes = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries/${eToday.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({ reason: '' })
    });
    assert.strictEqual(noReasonRes.status, 400);

    // Operador cancela do mesmo dia com motivo -> 200
    const cancelTodayRes = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries/${eToday.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({ reason: 'Cliente desistiu no balcão' })
    });
    assert.strictEqual(cancelTodayRes.status, 200);

    // Operador tenta cancelar anotação de 4 dias atrás sem chave Admin -> 403 ADMIN_KEY_REQUIRED
    const cancelOldDenied = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries/${eOld.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({ reason: 'Erro antigo' })
    });
    assert.strictEqual(cancelOldDenied.status, 403);
    const deniedJson = await cancelOldDenied.json();
    assert.strictEqual(deniedJson.code, 'ADMIN_KEY_REQUIRED');

    // Com adminAccessKey válida do Admin ('admin-secret-99'), Operador autoriza e cancela (não antes de checarmos isOverdue no CAD-05? Criaremos outra para CAD-05)
    const cancelOldOk = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries/${eOld.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({ reason: 'Erro antigo autorizado', adminAccessKey: 'admin-secret-99' })
    });
    assert.strictEqual(cancelOldOk.status, 200);

    // Anotação com pagamento parcial não pode ser cancelada
    const partRes = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({
        personName: 'Carlos Alberto',
        items: [{ code: 'DIP-01', barcode: '7890001', name: 'DIPIRONA SODICA 500MG', quantity: 1, unit_price: 25.0 }]
      })
    });
    const partJson = await partRes.json();
    await fetch(`${baseUrl}/api/erp/pos/caderninho/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({ personId: partJson.person.id, mode: 'partial', amount: 10, payment_method: 'PIX' })
    });

    const cancelPaidAttempt = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries/${partJson.entry.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ reason: 'Tentativa indevida após pagamento' })
    });
    assert.strictEqual(cancelPaidAttempt.status, 400);
  });

  it('CAD-05: Histórico completo por pessoa retorna movimentações e sinaliza isOverdue e overduePeopleCount quando > 2 dias em aberto', async () => {
    const overdueRes = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
      body: JSON.stringify({
        personName: 'Dona Helena',
        items: [{ code: 'DIP-01', barcode: '7890001', name: 'DIPIRONA SODICA 500MG', quantity: 1, unit_price: 25.0 }]
      })
    });
    const overdueJson = await overdueRes.json();
    const helenaId = overdueJson.person.id;

    // Simula anotação feita há 3 dias (> CADERNINHO_OVERDUE_DAYS = 2)
    memDb
      .prepare("UPDATE caderninho_entries SET created_at = datetime('now', 'localtime', '-3 days') WHERE id = ?")
      .run(overdueJson.entry.id);

    const summaryRes = await fetch(`${baseUrl}/api/erp/pos/caderninho/summary`, {
      headers: { Authorization: `Bearer ${opToken}` }
    });
    const summaryJson = await summaryRes.json();
    assert.ok(summaryJson.summary.overduePeopleCount >= 1);

    const histHelena = await fetch(`${baseUrl}/api/erp/pos/caderninho/people/${helenaId}/history`, {
      headers: { Authorization: `Bearer ${opToken}` }
    });
    assert.strictEqual(histHelena.status, 200);
    const hh = await histHelena.json();
    assert.strictEqual(hh.openEntries[0].is_overdue, true);
    assert.ok(hh.openEntries[0].days_open >= 3);

    const listHelena = await fetch(`${baseUrl}/api/erp/pos/caderninho/people?q=Dona%20Helena&onlyOpen=1`, {
      headers: { Authorization: `Bearer ${opToken}` }
    });
    const hl = await listHelena.json();
    assert.strictEqual(hl.people[0].isOverdue, true);
    assert.ok(hl.people[0].maxDaysOpen >= 3);

    // Verifica histórico completo de Maria Clara com movimentos ANOTACAO, PAGAMENTO_PARCIAL e PAGAMENTO_TOTAL
    const peopleRes = await fetch(`${baseUrl}/api/erp/pos/caderninho/people?q=Maria%20Clara`, {
      headers: { Authorization: `Bearer ${opToken}` }
    });
    const mariaId = (await peopleRes.json()).people[0].id;

    const histMariaRes = await fetch(`${baseUrl}/api/erp/pos/caderninho/people/${mariaId}/history`, {
      headers: { Authorization: `Bearer ${opToken}` }
    });
    const hm = await histMariaRes.json();
    const types = hm.movements.map(m => m.type);
    assert.ok(types.includes('ANOTACAO'));
    assert.ok(types.includes('PAGAMENTO_PARCIAL'));
    assert.ok(types.includes('PAGAMENTO_TOTAL'));
  });

  it('CAD-06: Bloqueia acesso anônimo sem JWT (401) em todas as rotas do Caderninho', async () => {
    const anonSummary = await fetch(`${baseUrl}/api/erp/pos/caderninho/summary`);
    assert.strictEqual(anonSummary.status, 401);

    const anonEntry = await fetch(`${baseUrl}/api/erp/pos/caderninho/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personName: 'Teste', items: [{ name: 'X', quantity: 1, unit_price: 10 }] })
    });
    assert.strictEqual(anonEntry.status, 401);
  });
});
