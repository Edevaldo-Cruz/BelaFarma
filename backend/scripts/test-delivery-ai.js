const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('../database');
const { scanDeliveriesFromWhatsApp } = require('../services/whatsapp-delivery-service');

async function testMonthlyScan() {
  console.log('🧪 Testando varredura do Mês Atual (Mês 08/2026)...');

  const stats = await scanDeliveriesFromWhatsApp(db, { currentMonth: true });
  console.log('📊 Estatísticas do mês atual:', stats);

  const deliveries = db.prepare(`
    SELECT * FROM deliveries 
    WHERE strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
    ORDER BY created_at DESC
  `).all();

  console.log(`📦 Encontrados ${deliveries.length} registros de delivery/atendimento no mês atual:`);
  console.table(deliveries);

  console.log('🎉 Teste da varredura do mês concluído com sucesso!');
  process.exit(0);
}

testMonthlyScan().catch(err => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
