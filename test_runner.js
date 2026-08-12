// Empirical test harness for DeliveryWidget.tsx discussed_products_json parsing

function parseDiscussedProducts(item) {
  let discussedProducts = [];
  try {
    if (item.discussed_products_json) {
      const parsed = JSON.parse(item.discussed_products_json);
      if (Array.isArray(parsed)) {
        discussedProducts = parsed.map(p => typeof p === 'string' ? p : String(p?.name || p?.product_name || p));
      } else if (typeof parsed === 'string' && parsed.trim()) {
        discussedProducts = [parsed.trim()];
      } else if (parsed && typeof parsed === 'object') {
        const val = parsed.name || parsed.product_name || String(parsed);
        if (val && typeof val === 'string' && val.trim()) {
          discussedProducts = [val.trim()];
        }
      }
    }
  } catch (e) {
    console.error('Erro ao parsear produtos discutidos:', e.message);
  }
  return discussedProducts;
}

const testCases = [
  { name: 'Undefined item.discussed_products_json', item: {} },
  { name: 'Null item.discussed_products_json', item: { discussed_products_json: null } },
  { name: 'Empty string', item: { discussed_products_json: '' } },
  { name: 'Whitespace string', item: { discussed_products_json: '   ' } },
  { name: 'JSON null string', item: { discussed_products_json: 'null' } },
  { name: 'JSON number string', item: { discussed_products_json: '123' } },
  { name: 'JSON boolean string', item: { discussed_products_json: 'true' } },
  { name: 'JSON array of strings', item: { discussed_products_json: '["Dipirona", "Paracetamol"]' } },
  { name: 'JSON array of 1 string', item: { discussed_products_json: '["Amoxicilina 500mg"]' } },
  { name: 'JSON empty array', item: { discussed_products_json: '[]' } },
  { name: 'JSON array of objects/mixed', item: { discussed_products_json: '[{"name": "Dorflex"}, {"product_name": "Nimesulida"}, "Neosaldina", 123, null]' } },
  { name: 'JSON single string (CRITICAL BUG CASE)', item: { discussed_products_json: '"Amoxicilina 500mg"' } },
  { name: 'JSON single string with whitespace', item: { discussed_products_json: '"   Dipirona 500mg   "' } },
  { name: 'JSON empty single string', item: { discussed_products_json: '""' } },
  { name: 'JSON single object with name', item: { discussed_products_json: '{"name": "Paracetamol 750mg"}' } },
  { name: 'JSON single object with product_name', item: { discussed_products_json: '{"product_name": "Omeprazol"}' } },
  { name: 'JSON single object without name/product_name', item: { discussed_products_json: '{"other": "value"}' } },
  { name: 'Malformed JSON', item: { discussed_products_json: '{ invalid json }' } },
  { name: 'JSON object with number name', item: { discussed_products_json: '{"name": 999}' } },
  { name: 'Array with null name inside object', item: { discussed_products_json: '[{"name": null}]' } }
];

let passed = 0;
let failed = 0;

console.log('--- STARTING EMPIRICAL TEST SUITE ---');

for (const tc of testCases) {
  try {
    const result = parseDiscussedProducts(tc.item);
    
    // Assertion 1: Must always return an Array
    if (!Array.isArray(result)) {
      throw new Error(`Result is not an array: ${typeof result}`);
    }

    // Assertion 2: .map must be a function and must not throw
    if (typeof result.map !== 'function') {
      throw new Error(`result.map is not a function!`);
    }

    const mapped = result.map((p, idx) => `[${idx}]: ${p}`);

    // Assertion 3: Every element must be a string
    for (const elem of result) {
      if (typeof elem !== 'string') {
        throw new Error(`Array element is not a string: ${typeof elem}`);
      }
    }

    console.log(`[PASS] ${tc.name} -> Output:`, JSON.stringify(result));
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${tc.name} -> Error: ${err.message}`);
    failed++;
  }
}

console.log(`\n--- SUMMARY ---`);
console.log(`Passed: ${passed} / ${testCases.length}`);
console.log(`Failed: ${failed} / ${testCases.length}`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
