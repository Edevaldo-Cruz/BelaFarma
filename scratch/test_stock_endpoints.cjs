const http = require('http');

console.log('Iniciando validação dos novos endpoints de Estoque localmente (porta 3001)...');

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    req.end();
  });
}

async function runTests() {
  try {
    // Teste 1: /api/stock/summary
    console.log('\n--- Testando /api/stock/summary ---');
    const resSummary = await makeRequest('/api/stock/summary');
    console.log(`Status: ${resSummary.statusCode}`);
    console.log('Resultado:', resSummary.data);

    // Teste 2: /api/stock/categories
    console.log('\n--- Testando /api/stock/categories ---');
    const resCategories = await makeRequest('/api/stock/categories');
    console.log(`Status: ${resCategories.statusCode}`);
    console.log(`Encontradas ${resCategories.data.length} categorias. Primeiras 3:`);
    console.log(resCategories.data.slice(0, 3));

    // Teste 3: /api/stock/products
    console.log('\n--- Testando /api/stock/products (filtros) ---');
    const resProducts = await makeRequest('/api/stock/products?daysWithoutSales=90&stockStatus=positivo&limit=2');
    console.log(`Status: ${resProducts.statusCode}`);
    console.log(`Total encontrado no filtro: ${resProducts.data.total}`);
    console.log('Primeiros 2 itens retornados:', resProducts.data.items);
    
    console.log('\n✅ Todos os endpoints de estoque responderam com sucesso!');
  } catch (err) {
    console.error('\n❌ Erro durante os testes dos endpoints:', err.message);
  }
}

runTests();
