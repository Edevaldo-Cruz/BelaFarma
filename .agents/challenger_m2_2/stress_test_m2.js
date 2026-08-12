const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Path to test DB file in challenger directory
const TEST_DB_PATH = path.join(__dirname, 'test_m2_audit.db');

// Remove leftover test DB if exists
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

// 1. Initialize SQLite test database
const db = new Database(TEST_DB_PATH);
db.pragma('journal_mode = WAL');

// 2. Create required tables for M2 testing
db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_contacts (
    id TEXT PRIMARY KEY,
    name TEXT,
    pushName TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS deliveries (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    customer_name TEXT,
    delivery_address TEXT,
    items TEXT,
    total_amount REAL DEFAULT 0,
    payment_method TEXT,
    status TEXT DEFAULT 'Pendente',
    sale_closed INTEGER DEFAULT 1,
    unclosed_reason TEXT,
    last_message_id TEXT,
    notes TEXT,
    review_status TEXT,
    is_new_customer INTEGER DEFAULT 0,
    chat_duration_seconds INTEGER DEFAULT 0,
    chat_message_count INTEGER DEFAULT 0,
    discussed_products_json TEXT,
    rejection_details_json TEXT,
    reviewed_by TEXT,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_product_rejections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id TEXT,
    phone TEXT,
    product_name TEXT,
    reason TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('✅ SQLite Test DB schema initialized.');

// Mock scanDeliveriesFromWhatsApp since we are testing endpoints directly
const deliveryEndpoints = require(path.join(__dirname, '../../backend/delivery-endpoints.js'));

const app = express();
app.use(express.json());

// Initialize delivery endpoints with our test app and test db
deliveryEndpoints.initializeDeliveryEndpoints(app, db);

// Helper function to make HTTP requests to test server
function makeRequest(serverUrl, pathName, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, serverUrl);
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Start test server on ephemeral port
const server = app.listen(0, async () => {
  const port = server.address().port;
  const serverUrl = `http://127.0.0.1:${port}`;
  console.log(`🚀 Test server listening on ${serverUrl}`);

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    failures: []
  };

  function assert(condition, testName, details = '') {
    results.total++;
    if (condition) {
      results.passed++;
      console.log(`  [PASS] ${testName}`);
    } else {
      results.failed++;
      console.error(`  [FAIL] ${testName} - ${details}`);
      results.failures.push({ testName, details });
    }
  }

  try {
    console.log('\n--- SUITE 1: Seed Initial Pending Deliveries ---');
    // Insert 3 pending review deliveries
    db.prepare(`
      INSERT INTO deliveries (
        id, phone, customer_name, delivery_address, items, total_amount, payment_method,
        status, sale_closed, review_status, is_new_customer, chat_duration_seconds,
        chat_message_count, discussed_products_json, created_at
      ) VALUES (
        'deliv_test_1', '5544999990001', 'Maria Oliveira', 'Rua Brasil 100', 'Dorflex 10 cprs', 15.50, 'Pix',
        'Pendente', 0, 'pending_review', 1, 300, 12, '["Dorflex 10 cprs", "Dipirona 1g", "Paracetamol 500mg"]', '2026-08-12 10:00:00'
      )
    `).run();

    db.prepare(`
      INSERT INTO deliveries (
        id, phone, customer_name, delivery_address, items, total_amount, payment_method,
        status, sale_closed, review_status, is_new_customer, chat_duration_seconds,
        chat_message_count, discussed_products_json, created_at
      ) VALUES (
        'deliv_test_2', '5544999990002', 'João Silva', 'Av Paraná 500', 'Vitamina C 1g', 29.90, 'Cartao',
        'Pendente', 0, 'pending_review', 0, 180, 6, '["Vitamina C 1g", "Omeprazol 20mg"]', '2026-08-12 10:15:00'
      )
    `).run();

    db.prepare(`
      INSERT INTO deliveries (
        id, phone, customer_name, delivery_address, items, total_amount, payment_method,
        status, sale_closed, review_status, is_new_customer, chat_duration_seconds,
        chat_message_count, discussed_products_json, created_at
      ) VALUES (
        'deliv_test_3', '5544999990003', 'Ana Costa', 'Rua Santos 250', 'Protetor Solar Sundown', 59.90, 'Dinheiro',
        'Pendente', 0, 'pending_review', 1, 450, 15, '["Protetor Solar Sundown", "Dorflex 10 cprs"]', '2026-08-12 10:30:00'
      )
    `).run();

    console.log('\n--- TEST 1: GET /api/deliveries/pending-reviews ---');
    const resPending = await makeRequest(serverUrl, '/api/deliveries/pending-reviews');
    assert(resPending.status === 200, 'Pending reviews HTTP status is 200', `Got ${resPending.status}`);
    assert(resPending.body.success === true, 'Pending reviews response success is true');
    assert(resPending.body.count === 3, 'Pending reviews count is 3', `Got ${resPending.body.count}`);
    assert(resPending.body.pending_reviews.length === 3, 'Pending reviews list length is 3');

    console.log('\n--- TEST 2: GET /api/deliveries/pending-reviews/:id ---');
    const resSingle = await makeRequest(serverUrl, '/api/deliveries/pending-reviews/deliv_test_1');
    assert(resSingle.status === 200, 'Single pending review HTTP status is 200');
    assert(resSingle.body.delivery.id === 'deliv_test_1', 'Correct delivery ID returned');
    assert(resSingle.body.delivery.customer_name === 'Maria Oliveira', 'Correct customer name');

    console.log('\n--- TEST 3: Submit Rejection (gerou_entrega: false) with Multiple Products & Reasons ---');
    // Maria Oliveira audit: rejected Dorflex (Preço), Dipirona (Falta de Estoque), Paracetamol (Apenas Dúvida)
    const reviewData1 = {
      gerou_entrega: false,
      reviewed_by: 'Atendente Carlos',
      unclosed_reason: 'Preço',
      rejection_details: [
        { product_name: 'Dorflex 10 cprs', reason: 'Preço', notes: 'Achei caro demais' },
        { product_name: 'Dipirona 1g', reason: 'Falta de Estoque', notes: 'Sem estoque na farmácia' },
        { product_name: 'Paracetamol 500mg', reason: 'Apenas Dúvida', notes: 'Cliente só queria saber o valor' }
      ]
    };
    const resSubmit1 = await makeRequest(serverUrl, '/api/deliveries/deliv_test_1/submit-review', 'POST', reviewData1);
    assert(resSubmit1.status === 200, 'Submit review 1 HTTP status is 200', `Got ${resSubmit1.status}`);
    assert(resSubmit1.body.success === true, 'Submit review 1 success is true');
    assert(resSubmit1.body.review_status === 'reviewed', 'Submit review 1 review_status is reviewed');
    assert(resSubmit1.body.delivery.sale_closed === 0, 'Submit review 1 sale_closed is 0');
    assert(resSubmit1.body.delivery.status === 'Nao_Fechado', 'Submit review 1 status is Nao_Fechado');
    assert(resSubmit1.body.delivery.reviewed_by === 'Atendente Carlos', 'Submit reviewer updated');

    // Submit second rejection for deliv_test_2
    const reviewData2 = {
      gerou_entrega: false,
      reviewed_by: 'Atendente Ana',
      unclosed_reason: 'Preço',
      rejection_details: [
        { product_name: 'Vitamina C 1g', reason: 'Preço', notes: 'Preço concorrente menor' },
        { product_name: 'Omeprazol 20mg', reason: 'Falta de Estoque', notes: 'Falta de caixa 56cps' }
      ]
    };
    const resSubmit2 = await makeRequest(serverUrl, '/api/deliveries/deliv_test_2/submit-review', 'POST', reviewData2);
    assert(resSubmit2.status === 200, 'Submit review 2 HTTP status is 200');

    console.log('\n--- TEST 4: Query GET /api/deliveries/rejection-metrics ---');
    const resMetrics = await makeRequest(serverUrl, '/api/deliveries/rejection-metrics');
    assert(resMetrics.status === 200, 'Rejection metrics HTTP status is 200');
    assert(resMetrics.body.success === true, 'Rejection metrics success is true');
    const metrics = resMetrics.body.metrics;
    assert(metrics.total_rejections === 5, 'Total rejections count is 5 (3 from deliv 1 + 2 from deliv 2)', `Got ${metrics.total_rejections}`);
    assert(metrics.by_reason['Preço'] === 2, 'Reason Preço count is 2', `Got ${metrics.by_reason['Preço']}`);
    assert(metrics.by_reason['Falta de Estoque'] === 2, 'Reason Falta de Estoque count is 2', `Got ${metrics.by_reason['Falta de Estoque']}`);
    assert(metrics.by_reason['Apenas Dúvida'] === 1, 'Reason Apenas Dúvida count is 1', `Got ${metrics.by_reason['Apenas Dúvida']}`);
    assert(metrics.by_product.length === 5, 'by_product has 5 items');
    assert(metrics.top_rejected_products.length === 5, 'top_rejected_products matches by_product');

    console.log('\n--- TEST 5: Submit Delivery Closed (gerou_entrega: true) ---');
    // Ana Costa audit: gerou_entrega = true
    const reviewData3 = {
      gerou_entrega: true,
      reviewed_by: 'Atendente Beatriz',
      delivery_details: {
        customer_name: 'Ana Costa Silva',
        delivery_address: 'Rua Santos 250, Apt 12',
        items: 'Protetor Solar Sundown 200ml',
        total_amount: 59.90,
        payment_method: 'Pix',
        notes: 'Entregar na portaria'
      }
    };
    const resSubmit3 = await makeRequest(serverUrl, '/api/deliveries/deliv_test_3/submit-review', 'POST', reviewData3);
    assert(resSubmit3.status === 200, 'Submit review 3 (gerou_entrega: true) HTTP status is 200');
    assert(resSubmit3.body.success === true, 'Submit review 3 success is true');
    assert(resSubmit3.body.delivery.sale_closed === 1, 'Submit review 3 sale_closed is 1');
    assert(resSubmit3.body.delivery.status === 'Pendente', 'Submit review 3 status updated to Pendente');
    assert(resSubmit3.body.delivery.customer_name === 'Ana Costa Silva', 'Updated customer_name saved');
    assert(resSubmit3.body.delivery.delivery_address === 'Rua Santos 250, Apt 12', 'Updated delivery_address saved');

    console.log('\n--- TEST 6: Verify Items Leave Pending Queue Cleanly ---');
    const resPendingAfter = await makeRequest(serverUrl, '/api/deliveries/pending-reviews');
    assert(resPendingAfter.status === 200, 'Pending reviews HTTP status 200');
    assert(resPendingAfter.body.count === 0, 'Pending reviews count is now 0 after reviewing all 3 items', `Got ${resPendingAfter.body.count}`);
    assert(resPendingAfter.body.pending_reviews.length === 0, 'Pending reviews array is empty');

    console.log('\n--- TEST 7: Adversarial Edge Cases & Stress Scenarios ---');

    // Edge Case 7.1: Non-existent delivery ID
    const res404 = await makeRequest(serverUrl, '/api/deliveries/non_existent_id/submit-review', 'POST', { gerou_entrega: false });
    assert(res404.status === 404, 'Non-existent delivery submit-review returns HTTP 404', `Got ${res404.status}`);

    // Edge Case 7.2: Submission with empty rejection_details array
    db.prepare(`
      INSERT INTO deliveries (id, phone, customer_name, review_status)
      VALUES ('deliv_test_4', '5544999990004', 'Carlos Ramos', 'pending_review')
    `).run();
    const resEmptyRej = await makeRequest(serverUrl, '/api/deliveries/deliv_test_4/submit-review', 'POST', {
      gerou_entrega: false,
      unclosed_reason: 'Apenas Dúvida',
      rejection_details: []
    });
    assert(resEmptyRej.status === 200, 'Empty rejection_details array handles cleanly without crashing');
    assert(resEmptyRej.body.delivery.unclosed_reason === 'Apenas Dúvida', 'Unclosed reason stored correctly');

    // Edge Case 7.3: Rejection with special characters / unicode / injection strings
    db.prepare(`
      INSERT INTO deliveries (id, phone, customer_name, review_status)
      VALUES ('deliv_test_5', '5544999990005', 'Júlia François', 'pending_review')
    `).run();
    const resUnicode = await makeRequest(serverUrl, '/api/deliveries/deliv_test_5/submit-review', 'POST', {
      gerou_entrega: false,
      rejection_details: [
        { product_name: "Neosaldina ' OR 1=1 --", reason: "Preço & Dúvida", notes: "Test drop table deliveries; --" },
        { product_name: "Remédio Coração ❤️ 100mg", reason: "Falta de Estoque", notes: "Sem estoque no fornecedor!" }
      ]
    });
    assert(resUnicode.status === 200, 'Special characters & SQL safety test passed without error');

    // Verify rejection metrics updated after edge cases
    const resMetrics2 = await makeRequest(serverUrl, '/api/deliveries/rejection-metrics');
    assert(resMetrics2.status === 200, 'Final metrics query HTTP 200');
    assert(resMetrics2.body.metrics.total_rejections === 7, 'Total rejections updated to 7 (5 + 2)', `Got ${resMetrics2.body.metrics.total_rejections}`);

  } catch (err) {
    console.error('CRITICAL UNHANDLED ERROR IN SUITE:', err);
    results.failed++;
    results.failures.push({ testName: 'Unhandled Suite Exception', details: err.stack || err.message });
  } finally {
    server.close(() => {
      db.close();
      console.log('\n==================================================');
      console.log(`SUMMARY: Total=${results.total}, Passed=${results.passed}, Failed=${results.failed}`);
      console.log('==================================================\n');
      if (results.failed > 0) {
        console.error('FAILURES:', JSON.stringify(results.failures, null, 2));
        process.exit(1);
      } else {
        console.log('🎉 ALL STRESS TESTS PASSED SUCCESSFULLY!');
        process.exit(0);
      }
    });
  }
});
