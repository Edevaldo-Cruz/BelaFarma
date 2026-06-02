const http = require('http');

http.get('http://localhost:3001/api/stock/products?daysWithoutSales=90&stockStatus=positivo&limit=2', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status HTTP:', res.statusCode);
    console.log('Resposta bruta do servidor:', data);
  });
});
