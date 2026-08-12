const db = require('../../backend/database.js');

let failures = [];
let passes = [];

function assert(condition, message) {
  if (condition) {
    passes.push(message);
    console.log(`[PASS] ${message}`);
  } else {
    failures.push(message);
    console.error(`[FAIL] ${message}`);
  }
}

console.log("=== EMPIRICAL SCHEMA VERIFICATION FOR MILESTONE 1 ===");

// 1. Inspect PRAGMA table_info(deliveries)
const deliveriesCols = db.prepare('PRAGMA table_info(deliveries)').all();
console.log("\nDeliveries columns found:", deliveriesCols.map(c => `${c.name} (${c.type})`).join(', '));

const expectedDeliveriesCols = [
  { name: 'review_status', type: 'TEXT' },
  { name: 'is_new_customer', type: 'INTEGER' },
  { name: 'chat_duration_seconds', type: 'INTEGER' },
  { name: 'chat_message_count', type: 'INTEGER' },
  { name: 'discussed_products_json', type: 'TEXT' },
  { name: 'rejection_details_json', type: 'TEXT' },
  { name: 'reviewed_by', type: 'TEXT' },
  { name: 'reviewed_at', type: 'DATETIME' }
];

expectedDeliveriesCols.forEach(col => {
  const found = deliveriesCols.find(c => c.name === col.name);
  assert(found !== undefined, `deliveries column '${col.name}' exists`);
  if (found) {
    assert(found.type.toUpperCase() === col.type.toUpperCase(), `deliveries column '${col.name}' type is ${col.type} (found: ${found.type})`);
  }
});

// 2. Inspect PRAGMA table_info(chat_product_rejections)
const rejectionsCols = db.prepare('PRAGMA table_info(chat_product_rejections)').all();
console.log("\nchat_product_rejections columns found:", rejectionsCols.map(c => `${c.name} (${c.type})`).join(', '));

const expectedRejectionsCols = [
  { name: 'id', type: 'INTEGER', pk: 1 },
  { name: 'delivery_id', type: 'INTEGER' },
  { name: 'phone', type: 'TEXT' },
  { name: 'product_name', type: 'TEXT' },
  { name: 'reason', type: 'TEXT' },
  { name: 'notes', type: 'TEXT' },
  { name: 'created_at', type: 'DATETIME' }
];

expectedRejectionsCols.forEach(col => {
  const found = rejectionsCols.find(c => c.name === col.name);
  assert(found !== undefined, `chat_product_rejections column '${col.name}' exists`);
  if (found) {
    assert(found.type.toUpperCase() === col.type.toUpperCase(), `chat_product_rejections column '${col.name}' type is ${col.type} (found: ${found.type})`);
    if (col.pk) {
      assert(found.pk === 1, `chat_product_rejections column '${col.name}' is primary key`);
    }
  }
});

// 3. Inspect PRAGMA index_list(deliveries)
const deliveriesIndexes = db.prepare('PRAGMA index_list(deliveries)').all();
console.log("\nDeliveries indexes found:", deliveriesIndexes.map(i => i.name).join(', '));
assert(deliveriesIndexes.some(i => i.name === 'idx_deliveries_review_status'), "idx_deliveries_review_status index exists on deliveries");

// 4. Inspect PRAGMA index_list(chat_product_rejections)
const rejectionsIndexes = db.prepare('PRAGMA index_list(chat_product_rejections)').all();
console.log("\nchat_product_rejections indexes found:", rejectionsIndexes.map(i => i.name).join(', '));
assert(rejectionsIndexes.some(i => i.name === 'idx_cpr_delivery'), "idx_cpr_delivery index exists on chat_product_rejections");
assert(rejectionsIndexes.some(i => i.name === 'idx_cpr_phone'), "idx_cpr_phone index exists on chat_product_rejections");
assert(rejectionsIndexes.some(i => i.name === 'idx_cpr_reason'), "idx_cpr_reason index exists on chat_product_rejections");

// 5. Test Insertion and Query (Empirical Functional Verification)
console.log("\n--- Testing Empirical Data Insertion & Query ---");
const testId = 'test_m1_verify_' + Date.now();
try {
  // Insert test delivery
  db.prepare(`
    INSERT INTO deliveries (
      id, phone, customer_name, status, review_status, is_new_customer,
      chat_duration_seconds, chat_message_count, discussed_products_json,
      rejection_details_json, reviewed_by, reviewed_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    testId,
    '5511999999999',
    'Test Customer M1',
    'Pendente',
    'pending',
    1,
    180,
    12,
    JSON.stringify(['Paracetamol', 'Dipirona']),
    JSON.stringify([{ product_name: 'Dipirona', reason: 'Preço' }]),
    'auditor_test',
    new Date().toISOString()
  );

  const insertedDelivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(testId);
  assert(insertedDelivery !== undefined, "Test delivery row successfully inserted and queried");
  assert(insertedDelivery.review_status === 'pending', "review_status saved correctly");
  assert(insertedDelivery.is_new_customer === 1, "is_new_customer saved correctly");
  assert(insertedDelivery.chat_duration_seconds === 180, "chat_duration_seconds saved correctly");
  assert(insertedDelivery.chat_message_count === 12, "chat_message_count saved correctly");
  assert(JSON.parse(insertedDelivery.discussed_products_json).length === 2, "discussed_products_json parsed correctly");

  // Insert test product rejection
  const rejResult = db.prepare(`
    INSERT INTO chat_product_rejections (
      delivery_id, phone, product_name, reason, notes
    ) VALUES (
      ?, ?, ?, ?, ?
    )
  `).run(
    testId,
    '5511999999999',
    'Dipirona',
    'Preço',
    'Achei caro na concorrencia'
  );

  const insertedRej = db.prepare('SELECT * FROM chat_product_rejections WHERE id = ?').get(rejResult.lastInsertRowid);
  assert(insertedRej !== undefined, "Test product rejection row successfully inserted and queried");
  assert(insertedRej.product_name === 'Dipirona', "product_name saved correctly");
  assert(insertedRej.reason === 'Preço', "reason saved correctly");

  // Clean up
  db.prepare('DELETE FROM chat_product_rejections WHERE id = ?').run(rejResult.lastInsertRowid);
  db.prepare('DELETE FROM deliveries WHERE id = ?').run(testId);
  console.log("Test data cleaned up successfully.");

} catch (err) {
  assert(false, `Data insertion/query test failed with error: ${err.message}`);
}

console.log("\n=== SUMMARY ===");
console.log(`Total Passes: ${passes.length}`);
console.log(`Total Failures: ${failures.length}`);

if (failures.length > 0) {
  console.error("VERDICT: REQUEST_CHANGES");
  process.exit(1);
} else {
  console.log("VERDICT: APPROVE");
  process.exit(0);
}
