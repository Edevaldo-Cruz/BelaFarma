/**
 * Empirical Stress Test for M1 Database Schema & Data Models
 * Author: challenger_m1_2
 */

const db = require('../database.js');

function runTests() {
  console.log('=== Starting M1 Database Schema Empirical Stress Test ===\n');

  const results = {
    schemaChecks: [],
    insertionTests: [],
    roundtripTests: [],
    metricsQueryTests: [],
    edgeCaseTests: [],
    cleanupTests: [],
    passed: 0,
    failed: 0
  };

  function assert(condition, message, category = 'general') {
    if (condition) {
      console.log(`[PASS] ${message}`);
      results.passed++;
      if (results[category]) results[category].push({ status: 'PASS', message });
    } else {
      console.error(`[FAIL] ${message}`);
      results.failed++;
      if (results[category]) results[category].push({ status: 'FAIL', message });
    }
  }

  // -------------------------------------------------------------
  // 1. Schema & Table Structure Inspection
  // -------------------------------------------------------------
  console.log('--- Step 1: Inspecting Schema & Table Structure ---');
  try {
    const deliveriesColumns = db.prepare("PRAGMA table_info(deliveries)").all().map(c => c.name);
    const expectedDeliveryCols = [
      'review_status',
      'is_new_customer',
      'chat_duration_seconds',
      'chat_message_count',
      'discussed_products_json',
      'rejection_details_json',
      'reviewed_by',
      'reviewed_at'
    ];

    expectedDeliveryCols.forEach(col => {
      assert(deliveriesColumns.includes(col), `deliveries table has column '${col}'`, 'schemaChecks');
    });

    const rejectionsColumns = db.prepare("PRAGMA table_info(chat_product_rejections)").all().map(c => c.name);
    const expectedRejectionCols = ['id', 'delivery_id', 'phone', 'product_name', 'reason', 'notes', 'created_at'];

    expectedRejectionCols.forEach(col => {
      assert(rejectionsColumns.includes(col), `chat_product_rejections table has column '${col}'`, 'schemaChecks');
    });

    // Check indexes
    const deliveryIndexes = db.prepare("PRAGMA index_list(deliveries)").all().map(i => i.name);
    assert(deliveryIndexes.includes('idx_deliveries_review_status'), `Index idx_deliveries_review_status exists on deliveries`, 'schemaChecks');

    const rejectionIndexes = db.prepare("PRAGMA index_list(chat_product_rejections)").all().map(i => i.name);
    assert(rejectionIndexes.includes('idx_cpr_delivery'), `Index idx_cpr_delivery exists on chat_product_rejections`, 'schemaChecks');
    assert(rejectionIndexes.includes('idx_cpr_reason'), `Index idx_cpr_reason exists on chat_product_rejections`, 'schemaChecks');
  } catch (err) {
    assert(false, `Schema inspection threw error: ${err.message}`, 'schemaChecks');
  }

  // -------------------------------------------------------------
  // 2. Insert Mock Delivery Records & Audit Data
  // -------------------------------------------------------------
  console.log('\n--- Step 2: Inserting Mock Delivery & Rejection Records ---');
  const TEST_ID_1 = 'TEST_M1_DELIVERY_001';
  const TEST_ID_2 = 'TEST_M1_DELIVERY_002';
  const TEST_PHONE_1 = '5511999990001';
  const TEST_PHONE_2 = '5511999990002';

  const mockDiscussedProducts = [
    { name: 'Dorflex 30 comprimidos', category: 'Analgesicos', price: 18.50 },
    { name: 'Dipirona 500mg', category: 'Analgesicos', price: 8.90 },
    { name: 'Vitamina C 1g', category: 'Vitaminas', price: 25.00 }
  ];

  const mockRejections = [
    { product_name: 'Dorflex 30 comprimidos', reason: 'Preço', notes: 'Achou caro demais em relação à concorrência' },
    { product_name: 'Vitamina C 1g', reason: 'Falta de Estoque', notes: 'Sem estoque da marca solicitada' }
  ];

  try {
    // Clean up any stale test records first
    db.prepare("DELETE FROM deliveries WHERE id LIKE 'TEST_M1_%'").run();
    db.prepare("DELETE FROM chat_product_rejections WHERE phone LIKE '551199999000%' OR notes LIKE 'TEST_M1_%'").run();

    // Insert Record 1: Pending Review
    const stmtInsertDelivery = db.prepare(`
      INSERT INTO deliveries (
        id, phone, customer_name, delivery_address, items, total_amount, payment_method,
        status, sale_closed, unclosed_reason, review_status, is_new_customer,
        chat_duration_seconds, chat_message_count, discussed_products_json, rejection_details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res1 = stmtInsertDelivery.run(
      TEST_ID_1,
      TEST_PHONE_1,
      'Cliente Teste Silva',
      'Rua Teste, 123',
      'Dorflex, Dipirona, Vitamina C',
      52.40,
      'Pix',
      'Pendente',
      0, // Venda não fechada
      'Orçamento não respondido',
      'pending_review',
      1, // Cliente Novo
      240, // 4 minutos
      14,
      JSON.stringify(mockDiscussedProducts),
      JSON.stringify(mockRejections)
    );
    assert(res1.changes === 1, `Inserted mock delivery record 1 (${TEST_ID_1})`, 'insertionTests');

    // Insert Record 2: Reviewed Record
    const res2 = stmtInsertDelivery.run(
      TEST_ID_2,
      TEST_PHONE_2,
      'Cliente Teste Santos',
      'Av Principal, 456',
      'Omeprazol 20mg',
      15.00,
      'Dinheiro',
      'Entregue',
      0,
      'Preço alto',
      'reviewed',
      0, // Cliente Recorrente
      120, // 2 minutos
      8,
      JSON.stringify([{ name: 'Omeprazol 20mg', category: 'Estômago', price: 15.00 }]),
      JSON.stringify([{ product_name: 'Omeprazol 20mg', reason: 'Apenas Dúvida', notes: 'Cliente tirou dúvidas de posologia' }])
    );
    assert(res2.changes === 1, `Inserted mock delivery record 2 (${TEST_ID_2})`, 'insertionTests');

    // Insert into chat_product_rejections
    const stmtInsertRejection = db.prepare(`
      INSERT INTO chat_product_rejections (delivery_id, phone, product_name, reason, notes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const rejRes1 = stmtInsertRejection.run(TEST_ID_1, TEST_PHONE_1, 'Dorflex 30 comprimidos', 'Preço', 'TEST_M1_Achou caro demais');
    const rejRes2 = stmtInsertRejection.run(TEST_ID_1, TEST_PHONE_1, 'Vitamina C 1g', 'Falta de Estoque', 'TEST_M1_Sem estoque');
    const rejRes3 = stmtInsertRejection.run(TEST_ID_2, TEST_PHONE_2, 'Omeprazol 20mg', 'Apenas Dúvida', 'TEST_M1_Dúvida posologia');

    assert(rejRes1.changes === 1 && rejRes2.changes === 1 && rejRes3.changes === 1, `Inserted 3 mock rejection records into chat_product_rejections`, 'insertionTests');

  } catch (err) {
    assert(false, `Mock insertion failed: ${err.message}`, 'insertionTests');
  }

  // -------------------------------------------------------------
  // 3. Verify Data Roundtrip & Integrity
  // -------------------------------------------------------------
  console.log('\n--- Step 3: Verifying Data Roundtrip & Integrity ---');
  try {
    const fetched1 = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(TEST_ID_1);
    assert(fetched1 !== undefined, `Fetched record 1 from DB`, 'roundtripTests');
    assert(fetched1.review_status === 'pending_review', `review_status matches 'pending_review'`, 'roundtripTests');
    assert(fetched1.is_new_customer === 1, `is_new_customer matches 1`, 'roundtripTests');
    assert(fetched1.chat_duration_seconds === 240, `chat_duration_seconds matches 240`, 'roundtripTests');
    assert(fetched1.chat_message_count === 14, `chat_message_count matches 14`, 'roundtripTests');

    // JSON parsing check
    const parsedDiscussed = JSON.parse(fetched1.discussed_products_json);
    assert(Array.isArray(parsedDiscussed) && parsedDiscussed.length === 3, `discussed_products_json parsed correctly (length 3)`, 'roundtripTests');
    assert(parsedDiscussed[0].name === 'Dorflex 30 comprimidos', `parsed discussed product 0 name accurate`, 'roundtripTests');

    const parsedRejections = JSON.parse(fetched1.rejection_details_json);
    assert(Array.isArray(parsedRejections) && parsedRejections.length === 2, `rejection_details_json parsed correctly (length 2)`, 'roundtripTests');
    assert(parsedRejections[0].reason === 'Preço', `parsed rejection 0 reason accurate`, 'roundtripTests');

    // Verify chat_product_rejections roundtrip
    const rejectionsList = db.prepare("SELECT * FROM chat_product_rejections WHERE delivery_id = ?").all(TEST_ID_1);
    assert(rejectionsList.length === 2, `Retrieved 2 rejection entries for ${TEST_ID_1}`, 'roundtripTests');
    assert(rejectionsList[0].product_name === 'Dorflex 30 comprimidos', `Rejection entry product name verified`, 'roundtripTests');

  } catch (err) {
    assert(false, `Data roundtrip check failed: ${err.message}`, 'roundtripTests');
  }

  // -------------------------------------------------------------
  // 4. Test Metrics Aggregation Queries
  // -------------------------------------------------------------
  console.log('\n--- Step 4: Testing Metrics Aggregation Queries ---');
  try {
    // Pending review count metric query
    const pendingCountRow = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE review_status = 'pending_review'").get();
    assert(typeof pendingCountRow.count === 'number' && pendingCountRow.count >= 1, `Pending review count query returned valid number (${pendingCountRow.count})`, 'metricsQueryTests');

    // Rejection metrics aggregation query (by reason)
    const reasonMetrics = db.prepare(`
      SELECT reason, COUNT(*) as count
      FROM chat_product_rejections
      WHERE notes LIKE 'TEST_M1_%'
      GROUP BY reason
      ORDER BY count DESC
    `).all();

    assert(reasonMetrics.length >= 3, `Group by reason aggregation returned ${reasonMetrics.length} reason categories`, 'metricsQueryTests');
    const precoMetric = reasonMetrics.find(r => r.reason === 'Preço');
    assert(precoMetric && precoMetric.count === 1, `Aggregation for 'Preço' correctly counted 1 rejection`, 'metricsQueryTests');

    // Rejection metrics aggregation query (by product)
    const productMetrics = db.prepare(`
      SELECT product_name, COUNT(*) as count, reason as main_reason
      FROM chat_product_rejections
      WHERE notes LIKE 'TEST_M1_%'
      GROUP BY product_name
    `).all();

    assert(productMetrics.length === 3, `Group by product_name returned 3 distinct products`, 'metricsQueryTests');

    // Average duration metric query
    const avgDurationRow = db.prepare(`
      SELECT AVG(chat_duration_seconds) as avg_duration, SUM(is_new_customer) as new_customers
      FROM deliveries
      WHERE id LIKE 'TEST_M1_%'
    `).get();

    assert(avgDurationRow.avg_duration === 180, `Average chat duration calculated correctly (180s)`, 'metricsQueryTests');
    assert(avgDurationRow.new_customers === 1, `Sum of new customers calculated correctly (1)`, 'metricsQueryTests');

  } catch (err) {
    assert(false, `Metrics query tests failed: ${err.message}`, 'metricsQueryTests');
  }

  // -------------------------------------------------------------
  // 5. Stress & Edge Case Tests
  // -------------------------------------------------------------
  console.log('\n--- Step 5: Stress & Edge Case Testing ---');
  try {
    // Edge case A: Empty JSON arrays and NULL audit values
    const TEST_ID_3 = 'TEST_M1_DELIVERY_003';
    db.prepare(`
      INSERT INTO deliveries (id, phone, status, review_status, is_new_customer, chat_duration_seconds, discussed_products_json, rejection_details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(TEST_ID_3, '5511999990003', 'Pendente', 'pending_review', 0, 0, '[]', '[]');

    const fetched3 = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(TEST_ID_3);
    assert(fetched3.discussed_products_json === '[]', `Empty JSON array string preserved`, 'edgeCaseTests');
    assert(JSON.parse(fetched3.discussed_products_json).length === 0, `Parsed empty JSON array has 0 elements`, 'edgeCaseTests');

    // Edge case B: Special characters and Unicode in product names / notes
    const TEST_ID_4 = 'TEST_M1_DELIVERY_004';
    const unicodeProductName = 'Analgésico Bálsamo nº 5 & Cia (São João)';
    const unicodeNotes = 'Cliente disse: "Tá muito caro! R$ 50,00 😱"';
    
    db.prepare(`
      INSERT INTO chat_product_rejections (delivery_id, phone, product_name, reason, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(TEST_ID_4, '5511999990004', unicodeProductName, 'Preço', unicodeNotes);

    const unicodeRow = db.prepare("SELECT * FROM chat_product_rejections WHERE delivery_id = ?").get(TEST_ID_4);
    assert(unicodeRow.product_name === unicodeProductName, `Unicode & special chars in product_name preserved`, 'edgeCaseTests');
    assert(unicodeRow.notes === unicodeNotes, `Unicode & emojis in notes preserved`, 'edgeCaseTests');

    // Cleanup Edge Case 3 & 4
    db.prepare("DELETE FROM deliveries WHERE id IN (?, ?)").run(TEST_ID_3, TEST_ID_4);
    db.prepare("DELETE FROM chat_product_rejections WHERE delivery_id IN (?, ?)").run(TEST_ID_3, TEST_ID_4);

  } catch (err) {
    assert(false, `Stress & edge case tests failed: ${err.message}`, 'edgeCaseTests');
  }

  // -------------------------------------------------------------
  // 6. Cleanup Verification
  // -------------------------------------------------------------
  console.log('\n--- Step 6: Cleaning Up Test Records ---');
  try {
    const delRes = db.prepare("DELETE FROM deliveries WHERE id LIKE 'TEST_M1_%'").run();
    const rejRes = db.prepare("DELETE FROM chat_product_rejections WHERE notes LIKE 'TEST_M1_%' OR phone LIKE '551199999000%'").run();

    console.log(`Deleted ${delRes.changes} test delivery records.`);
    console.log(`Deleted ${rejRes.changes} test rejection records.`);

    const remainingDeliveries = db.prepare("SELECT COUNT(*) as c FROM deliveries WHERE id LIKE 'TEST_M1_%'").get().c;
    const remainingRejections = db.prepare("SELECT COUNT(*) as c FROM chat_product_rejections WHERE notes LIKE 'TEST_M1_%' OR phone LIKE '551199999000%'").get().c;

    assert(remainingDeliveries === 0, `0 test delivery records remaining after cleanup`, 'cleanupTests');
    assert(remainingRejections === 0, `0 test rejection records remaining after cleanup`, 'cleanupTests');

  } catch (err) {
    assert(false, `Cleanup failed: ${err.message}`, 'cleanupTests');
  }

  // Summary
  console.log('\n=============================================================');
  console.log(`TEST SUMMARY: TOTAL = ${results.passed + results.failed} | PASSED = ${results.passed} | FAILED = ${results.failed}`);
  console.log('=============================================================');

  return results;
}

if (require.main === module) {
  const summary = runTests();
  process.exit(summary.failed === 0 ? 0 : 1);
}

module.exports = { runTests };
