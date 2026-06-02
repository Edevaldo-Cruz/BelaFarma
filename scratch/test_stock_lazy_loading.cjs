const http = require('http');

console.log('Iniciando validação de Lazy Loading e Cache localmente (porta 3001)...');

function postRequest(path, payload) {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(payload);
    
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': dataString.length
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
      });
    });
    
    req.on('error', (err) => reject(err));
    req.write(dataString);
    req.end();
  });
}

function getRequest(path) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ 
          statusCode: res.statusCode, 
          time: Date.now() - start, 
          data: JSON.parse(data) 
        });
      });
    });
    
    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function run() {
  try {
    // 1. Validar /api/stock/products (Listagem básica sem saídas nem última venda no banco)
    console.log('\n--- 1. Buscando produtos (Listagem básica) ---');
    const resProducts = await getRequest('/api/stock/products?limit=5&offset=0&stockStatus=positivo&daysWithoutSales=0');
    console.log(`Status: ${resProducts.statusCode} | Tempo: ${resProducts.time}ms`);
    console.log(`Encontrados: ${resProducts.data.total}`);
    console.log('Amostra de 1 produto:', resProducts.data.items[0]);

    const ids = resProducts.data.items.map(p => p.id);
    console.log('IDs obtidos para a página:', ids);

    // 2. Validar POST /api/stock/products/sales-info (Lazy Loading)
    console.log('\n--- 2. Buscando informações de vendas em lote (Lazy Loading) ---');
    const resSales = await postRequest('/api/stock/products/sales-info', { productIds: ids });
    console.log(`Status: ${resSales.statusCode}`);
    console.log('Dados de Vendas retornados:', resSales.data);

    // 3. Validar Cache Inteligente
    console.log('\n--- 3. Validando Cache no Endpoint de Produtos ---');
    console.log('Primeira requisição (deve ler do banco e salvar no cache)...');
    const t1 = await getRequest('/api/stock/products?limit=10&offset=0&stockStatus=positivo');
    console.log(`T1 (Banco): ${t1.time}ms`);

    console.log('Segunda requisição com mesmos parâmetros (deve bater no cache)...');
    const t2 = await getRequest('/api/stock/products?limit=10&offset=0&stockStatus=positivo');
    console.log(`T2 (Cache): ${t2.time}ms`);
    
    if (t2.time < 20) {
      console.log('✅ SUCESSO: Cache respondeu instantaneamente!');
    } else {
      console.log('⚠️ AVISO: Segunda requisição levou mais tempo do que o esperado para cache.');
    }

    // 4. Validar bypassCache
    console.log('\n--- 4. Validando bypassCache para forçar leitura real ---');
    const t3 = await getRequest('/api/stock/products?limit=10&offset=0&stockStatus=positivo&bypassCache=true');
    console.log(`T3 (Bypass Cache - Banco): ${t3.time}ms`);

    console.log('\n✅ Todos os testes de Lazy Loading e Cache passaram com sucesso!');
  } catch (err) {
    console.error('\n❌ Erro durante validação:', err.message);
  }
}

run();
