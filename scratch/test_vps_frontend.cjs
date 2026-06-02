const http = require('http');

console.log('Verificando HTML servido pela VPS em http://192.168.1.70:8085/ ...');

http.get('http://192.168.1.70:8085/', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(`Status HTTP: ${res.statusCode}`);
    
    // Procurar por scripts JS no HTML
    const match = data.match(/src="\/assets\/index-[a-zA-Z0-9]+\.js"/g);
    console.log('Scripts JS encontrados no HTML da VPS:');
    console.log(match);
    
    console.log('\nHTML completo retornado:');
    console.log(data);
  });
}).on('error', (err) => {
  console.error('Erro ao conectar na VPS:', err.message);
});
