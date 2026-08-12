/**
 * Verification Test Suite for Milestone 2 (M2) REST Endpoints & AI Scanner Logic
 * Extended Empirical Test Suite covering core requirements and edge cases.
 */

const express = require('express');
const http = require('http');
const Database = require('better-sqlite3');

function setupTestDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY,
      phone TEXT,
      customer_name TEXT,
      delivery_address TEXT,
      items TEXT,
      total_amount REAL,
      payment_method TEXT,
      status TEXT,
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

    CREATE TABLE IF NOT EXISTS whatsapp_contacts (
      id TEXT PRIMARY KEY,
      name TEXT,
      pushName TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id TEXT PRIMARY KEY,
      phone TEXT,
      fromMe INTEGER,
      messageText TEXT,
      timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      status TEXT
    );
  `);
  return db;
}

const { initializeDeliveryEndpoints } = require('./delivery-endpoints');

async function runTestSuite() {
  const db = setupTestDatabase();
  const app = express();
  app.use(express.json());
  initializeDeliveryEndpoints(app, db);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  let passed = 0;
  let failed = 0;

  function assert(condition, description) {
    if (condition) {
      console.log(`  PASS: ${description}`);
      passed++;
    } else {
      console.error(`  FAIL: ${description}`);
      failed++;
    }
  }

  console.log(`\n==================================================`);
  console.log(`  MILESTONE 2 (M2) EXTENDED VERIFICATION SUITE  `);
  console.log(`==================================================\n`);

  // SCENARIO 1: Empty state pending reviews
  {
    console.log(`--- Scenario 1: GET /api/deliveries/pending-reviews on empty DB ---`);
    const res = await makeRequest('GET', '/api/deliveries/pending-reviews');
    assert(res.status === 200, 'HTTP status is 200');
    assert(res.data.success === true, 'Response contains success: true');
    assert(res.data.count === 0, 'Initial count is 0');
    assert(Array.isArray(res.data.pending_reviews), 'pending_reviews is array');
  }

  // SCENARIO 2: Seed data and query pending reviews
  {
    console.log(`\n--- Scenario 2: GET /api/deliveries/pending-reviews with seeded records ---`);
    db.prepare(`
      INSERT INTO deliveries (
        id, phone, customer_name, items, total_amount, status, sale_closed,
        unclosed_reason, review_status, is_new_customer, chat_duration_seconds,
        chat_message_count, discussed_products_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'deliv_m2_001',
      '5511988887777',
      'Ana Souza',
      'Neosaldina 20 drágeas',
      19.90,
      'Nao_Fechado',
      0,
      'Preço Alto',
      'pending_review',
      1,
      240,
      8,
      JSON.stringify(['Neosaldina 20 drágeas'])
    );

    db.prepare(`
      INSERT INTO deliveries (
        id, phone, customer_name, items, total_amount, status, sale_closed,
        review_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'deliv_m2_002',
      '5511977776666',
      'Bruno Lima',
      'Tylenol 500mg',
      15.00,
      'Pendente',
      1,
      null // Not pending review
    );

    const res = await makeRequest('GET', '/api/deliveries/pending-reviews');
    assert(res.status === 200, 'HTTP status is 200');
    assert(res.data.count === 1, 'Returns exactly 1 pending review item');
    assert(res.data.pending_reviews[0].id === 'deliv_m2_001', 'Correct delivery ID returned');
    assert(res.data.pending_reviews[0].review_status === 'pending_review', 'review_status is pending_review');
    assert(res.data.pending_reviews[0].is_new_customer === 1, 'is_new_customer is 1');
    assert(res.data.pending_reviews[0].chat_duration_seconds === 240, 'chat_duration_seconds is 240');
    assert(res.data.pending_reviews[0].chat_message_count === 8, 'chat_message_count is 8');
  }

  // SCENARIO 3: GET /api/deliveries/pending-reviews/:id
  {
    console.log(`\n--- Scenario 3: GET /api/deliveries/pending-reviews/:id ---`);
    const resFound = await makeRequest('GET', '/api/deliveries/pending-reviews/deliv_m2_001');
    assert(resFound.status === 200, 'HTTP status 200 for existing ID');
    assert(resFound.data.success === true, 'success is true');
    assert(resFound.data.delivery.customer_name === 'Ana Souza', 'customer_name matches Ana Souza');

    const resNotFound = await makeRequest('GET', '/api/deliveries/pending-reviews/non_existent_id');
    assert(resNotFound.status === 404, 'HTTP status 404 for non-existent ID');
    assert(resNotFound.data.error !== undefined, 'Contains error message');
  }

  // SCENARIO 4: POST /api/deliveries/:id/submit-review with gerou_entrega: false
  {
    console.log(`\n--- Scenario 4: POST /api/deliveries/:id/submit-review (gerou_entrega: false) ---`);
    const payload = {
      gerou_entrega: false,
      rejection_details: [
        { product_name: 'Neosaldina 20 drágeas', reason: 'Preço Alto', notes: 'Achou caro R$ 19,90' }
      ],
      unclosed_reason: 'Preço Alto',
      reviewed_by: 'Atendente João'
    };

    const res = await makeRequest('POST', '/api/deliveries/deliv_m2_001/submit-review', payload);
    assert(res.status === 200, 'HTTP status 200');
    assert(res.data.success === true, 'success is true');
    assert(res.data.review_status === 'reviewed', 'review_status updated to reviewed');
    assert(res.data.delivery.sale_closed === 0, 'sale_closed remains 0');
    assert(res.data.delivery.status === 'Nao_Fechado', 'status set to Nao_Fechado');
    assert(res.data.delivery.reviewed_by === 'Atendente João', 'reviewed_by updated correctly');
    assert(res.data.delivery.reviewed_at !== null, 'reviewed_at timestamp recorded');

    // Verify DB insertion into chat_product_rejections
    const rejections = db.prepare('SELECT * FROM chat_product_rejections WHERE delivery_id = ?').all('deliv_m2_001');
    assert(rejections.length === 1, '1 record inserted into chat_product_rejections');
    assert(rejections[0].product_name === 'Neosaldina 20 drágeas', 'Rejection product_name matches');
    assert(rejections[0].reason === 'Preço Alto', 'Rejection reason matches');
    assert(rejections[0].notes === 'Achou caro R$ 19,90', 'Rejection notes match');
  }

  // SCENARIO 5: POST /api/deliveries/:id/submit-review with gerou_entrega: true
  {
    console.log(`\n--- Scenario 5: POST /api/deliveries/:id/submit-review (gerou_entrega: true) ---`);
    // Seed another pending review
    db.prepare(`
      INSERT INTO deliveries (
        id, phone, customer_name, items, total_amount, status, sale_closed,
        unclosed_reason, review_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'deliv_m2_003',
      '5511966665555',
      'Carla Mendes',
      'Dipirona 500mg',
      12.00,
      'Nao_Fechado',
      0,
      'Sem Resposta do Cliente',
      'pending_review'
    );

    const payload = {
      gerou_entrega: true,
      delivery_details: {
        customer_name: 'Carla Mendes Silva',
        delivery_address: 'Rua das Flores 123',
        items: 'Dipirona 500mg + Paracetamol 750mg',
        total_amount: 25.00,
        payment_method: 'Pix',
        notes: 'Cliente decidiu fechar via Pix'
      },
      reviewed_by: 'Atendente Carlos'
    };

    const res = await makeRequest('POST', '/api/deliveries/deliv_m2_003/submit-review', payload);
    assert(res.status === 200, 'HTTP status 200');
    assert(res.data.success === true, 'success is true');
    assert(res.data.review_status === 'reviewed', 'review_status is reviewed');
    assert(res.data.delivery.sale_closed === 1, 'sale_closed converted to 1');
    assert(res.data.delivery.status === 'Pendente', 'status set to Pendente delivery');
    assert(res.data.delivery.total_amount === 25.00, 'total_amount updated to 25.00');
    assert(res.data.delivery.payment_method === 'Pix', 'payment_method updated to Pix');

    // Verify NO rejections inserted for closed sale
    const rejections = db.prepare('SELECT * FROM chat_product_rejections WHERE delivery_id = ?').all('deliv_m2_003');
    assert(rejections.length === 0, 'No rejections inserted for closed delivery');
  }

  // SCENARIO 6: GET /api/deliveries/rejection-metrics
  {
    console.log(`\n--- Scenario 6: GET /api/deliveries/rejection-metrics ---`);
    const res = await makeRequest('GET', '/api/deliveries/rejection-metrics');
    assert(res.status === 200, 'HTTP status 200');
    assert(res.data.success === true, 'success is true');
    assert(res.data.metrics.total_rejections === 1, 'total_rejections is 1');
    assert(res.data.metrics.by_reason['Preço Alto'] === 1, 'by_reason contains Preço Alto: 1');
    assert(Array.isArray(res.data.metrics.by_product), 'by_product is array');
    assert(res.data.metrics.by_product[0].product_name === 'Neosaldina 20 drágeas', 'Top rejected product matches');
  }

  // SCENARIO 7: Error handling for non-existent delivery ID submission
  {
    console.log(`\n--- Scenario 7: POST /api/deliveries/:id/submit-review non-existent ID ---`);
    const res = await makeRequest('POST', '/api/deliveries/fake_id_999/submit-review', { gerou_entrega: false });
    assert(res.status === 404, 'Returns 404 for invalid delivery ID');
  }

  server.close();

  console.log(`\n==================================================`);
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED  `);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exitCode = 1;
});
