const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { runAutoShortages } = require('../services/auto-shortages.service');

async function main() {
  console.log('[Sync Delayed] Iniciando importação das faltas dos últimos 5 dias...');
  try {
    const result = await runAutoShortages(5);
    console.log('[Sync Delayed] Resultado:', result);
  } catch (err) {
    console.error('[Sync Delayed] Erro:', err);
  }
  process.exit(0);
}

main();
