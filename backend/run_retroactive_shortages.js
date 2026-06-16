const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const autoShortages = require('./services/auto-shortages.service.js');

async function run() {
  console.log('=== INICIANDO IMPORTAÇÃO RETROATIVA DE FALTAS AUTOMÁTICAS ===');
  console.log('Período: de 08/06/2026 a 16/06/2026 (últimos 8 dias)');
  
  try {
    const result = await autoShortages.runAutoShortages(8);
    console.log('\n=== RESULTADO DA IMPORTAÇÃO RETROATIVA ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.error) {
      console.error('Ocorreu um erro durante a execução:', result.error);
      process.exit(1);
    } else {
      console.log('Importação concluída com sucesso!');
      process.exit(0);
    }
  } catch (err) {
    console.error('Erro fatal ao rodar script:', err);
    process.exit(1);
  }
}

run();
