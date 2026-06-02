const http = require('http');

console.log('Testando requisição HTTP para o servidor LOCAL em http://localhost:3001/api/finance-agent/live-closing ...');

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/finance-agent/live-closing',
  method: 'GET'
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
  console.error('Erro na requisição local:', err.message);
});

req.end();
