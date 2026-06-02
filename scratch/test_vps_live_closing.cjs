const http = require('http');

console.log('Buscando /api/finance-agent/live-closing na VPS de produção...');

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.request(url, { method: 'GET' }, (res) => {
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
  const url = 'http://192.168.1.70:8085/api/finance-agent/live-closing';
  try {
    const res = await makeRequest(url);
    console.log(`Status: ${res.statusCode} | Tempo: ${res.time}ms`);
    console.log('Resposta JSON:', res.data);
  } catch (err) {
    console.error('Erro:', err.message);
  }
}

run();
