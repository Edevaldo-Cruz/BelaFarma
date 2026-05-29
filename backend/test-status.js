require('dotenv').config({ path: '../.env' });
const { postarStatusDiario } = require('./services/whatsapp-status.service');

async function runTest() {
  console.log('Iniciando teste manual de envio de status...');
  await postarStatusDiario();
  console.log('Teste concluído.');
  process.exit(0);
}

runTest();
