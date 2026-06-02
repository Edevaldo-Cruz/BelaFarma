const http = require('http');

console.log('Testando requisição HTTP para a VPS em http://192.168.1.70:3001/api/finance-agent/sync-crediario ...');

const req = http.request({
  hostname: '192.168.1.70',
  port: 3001,
  path: '/api/finance-agent/sync-crediario',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`Status HTTP: ${res.statusCode}`);
    console.log(`Resposta: ${data}`);
  });
});

req.on('error', (err) => {
  console.error('Erro na requisição:', err.message);
});

req.end();
