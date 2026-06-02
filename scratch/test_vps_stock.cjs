const http = require('http');

console.log('Testando endpoint de estoque na VPS de produção...');

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.request(url, {
      method: 'GET',
      timeout: 10000 // 10s timeout
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          time: Date.now() - start,
          data: data.slice(0, 200) // apenas os primeiros 200 char
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout depois de ${Date.now() - start}ms`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

async function run() {
  const urls = [
    'http://192.168.1.70:8085/api/stock/summary',
    'http://192.168.1.70:8085/api/stock/products?limit=50&offset=0&search=&daysWithoutSales=90&stockStatus=positivo&categoryId=&sort=tempo_sem_venda:1',
    'http://192.168.1.70:3001/api/stock/summary',
    'http://192.168.1.70:3001/api/stock/products?limit=50&offset=0&search=&daysWithoutSales=90&stockStatus=positivo&categoryId=&sort=tempo_sem_venda:1'
  ];

  for (const url of urls) {
    console.log(`\nBando em: ${url}`);
    try {
      const res = await makeRequest(url);
      console.log(`Status: ${res.statusCode} | Tempo: ${res.time}ms`);
      console.log(`Resposta (amostra): ${res.data}`);
    } catch (err) {
      console.log(`Erro ao testar ${url}: ${err.message}`);
    }
  }
}

run();
