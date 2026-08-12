const express = require('express');
const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');

// 1. Instanciar banco de dados em memória para teste isolado
const db = new Database(':memory:');

// Criar tabelas necessárias
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

// Inserir dados de teste em deliveries
db.prepare(`
  INSERT INTO deliveries (
    id, phone, customer_name, items, total_amount, status, sale_closed,
    unclosed_reason, review_status, is_new_customer, chat_duration_seconds,
    chat_message_count, discussed_products_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'deliv_test_101',
  '5551999990000',
  'Carlos Silva',
  'Dorflex 30 comp, Dipirona 500mg',
  25.50,
  'Nao_Fechado',
  0,
  'Preço Alto',
  'pending_review',
  1,
  180,
  5,
  JSON.stringify(['Dorflex 30 comp', 'Dipirona 500mg'])
);

const { initializeDeliveryEndpoints } = require('./delivery-endpoints');
const { scanDeliveriesFromWhatsApp } = require('./services/whatsapp-delivery-service');

const app = express();
app.use(express.json());

initializeDeliveryEndpoints(app, db);

const server = http.createServer(app);

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 0, // será substituído após escutar
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const addr = server.address();
    options.port = addr.port;

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
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`🧪 Servidor de Teste M2 rodando na porta ${port}...`);

  try {
    // Teste 1: GET /api/deliveries/pending-reviews
    console.log('\n--- Teste 1: GET /api/deliveries/pending-reviews ---');
    const res1 = await makeRequest('GET', '/api/deliveries/pending-reviews');
    console.log('Status:', res1.status);
    console.log('Response:', JSON.stringify(res1.data, null, 2));
    if (res1.status !== 200 || !res1.data.success || res1.data.count !== 1) {
      throw new Error('Falha no Teste 1');
    }

    // Teste 2: GET /api/deliveries/pending-reviews/:id
    console.log('\n--- Teste 2: GET /api/deliveries/pending-reviews/deliv_test_101 ---');
    const res2 = await makeRequest('GET', '/api/deliveries/pending-reviews/deliv_test_101');
    console.log('Status:', res2.status);
    console.log('Response:', JSON.stringify(res2.data, null, 2));
    if (res2.status !== 200 || !res2.data.success || res2.data.delivery.id !== 'deliv_test_101') {
      throw new Error('Falha no Teste 2');
    }

    // Teste 3: POST /api/deliveries/:id/submit-review (com gerou_entrega: false)
    console.log('\n--- Teste 3: POST /api/deliveries/deliv_test_101/submit-review (gerou_entrega: false) ---');
    const res3 = await makeRequest('POST', '/api/deliveries/deliv_test_101/submit-review', {
      gerou_entrega: false,
      rejection_details: [
        { product_name: 'Dorflex 30 comp', reason: 'Preço Alto', notes: 'Achou R$ 18 caro' },
        { product_name: 'Dipirona 500mg', reason: 'Falta de Estoque', notes: 'Sem caixa 20 comp' }
      ],
      unclosed_reason: 'Preço Alto',
      reviewed_by: 'Atendente Maria'
    });
    console.log('Status:', res3.status);
    console.log('Response:', JSON.stringify(res3.data, null, 2));
    if (res3.status !== 200 || !res3.data.success || res3.data.review_status !== 'reviewed') {
      throw new Error('Falha no Teste 3');
    }

    // Teste 4: GET /api/deliveries/pending-reviews (deve retornar 0 agora)
    console.log('\n--- Teste 4: GET /api/deliveries/pending-reviews (após revisão) ---');
    const res4 = await makeRequest('GET', '/api/deliveries/pending-reviews');
    console.log('Count:', res4.data.count);
    if (res4.data.count !== 0) {
      throw new Error('Falha no Teste 4: item pendente deveria ter sido removido da fila');
    }

    // Teste 5: GET /api/deliveries/rejection-metrics
    console.log('\n--- Teste 5: GET /api/deliveries/rejection-metrics ---');
    const res5 = await makeRequest('GET', '/api/deliveries/rejection-metrics');
    console.log('Status:', res5.status);
    console.log('Response:', JSON.stringify(res5.data, null, 2));
    if (res5.status !== 200 || !res5.data.success || res5.data.metrics.total_rejections !== 2) {
      throw new Error('Falha no Teste 5: total de rejeições incorreto');
    }

    // Teste 6: Verificar inserção em chat_product_rejections
    const rejections = db.prepare('SELECT * FROM chat_product_rejections WHERE delivery_id = ?').all('deliv_test_101');
    console.log('\n--- Teste 6: Verificação no SQLite chat_product_rejections ---');
    console.log('Rejections in DB:', rejections);
    if (rejections.length !== 2) {
      throw new Error('Falha no Teste 6: rejeições não inseridas no SQLite');
    }

    console.log('\n✅ TODOS OS TESTES DO MILESTONE 2 PASSARAM COM SUCESSO!');
  } catch (err) {
    console.error('❌ ERRO NO TESTE:', err.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests();
