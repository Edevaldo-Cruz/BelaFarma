const baileys = require('./baileys-service.js');
console.log('--- TESTANDO CONEXÃO BAILEYS ---');
baileys.connect().then(() => {
  setTimeout(() => {
    console.log('STATUS ATUAL:', baileys.getStatus());
    process.exit(0);
  }, 5000);
}).catch(err => {
  console.error('ERRO CATCH:', err);
  process.exit(1);
});
