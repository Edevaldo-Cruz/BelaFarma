const db = require('../backend/database');

function verify() {
  console.log('=== VERIFICANDO RESULTADOS NO BANCO SQLITE LOCAL ===');
  
  // 1. Verificar contagem total de shortages com source = 'auto'
  try {
    const totalAuto = db.prepare("SELECT count(*) as count FROM shortages WHERE source = 'auto'").get();
    console.log(`Total de shortages automáticos cadastrados: ${totalAuto.count}`);
  } catch (err) {
    console.error('Erro na contagem:', err);
  }

  // 2. Mostrar últimas 15 shortages adicionadas hoje
  try {
    const latest = db.prepare(`
      SELECT id, productName, notes, createdAt, userName, clientInquiry 
      FROM shortages 
      WHERE source = 'auto'
      ORDER BY createdAt DESC 
      LIMIT 15
    `).all();
    console.log('\nÚltimas 15 shortages inseridas (retroativas/atuais):');
    console.table(latest);
  } catch (err) {
    console.error('Erro ao listar últimas shortages:', err);
  }

  // 3. Verificar se há algum registro com clientInquiry diferente de 0/1 (tipo string vazia '')
  try {
    const invalidClientInquiry = db.prepare(`
      SELECT count(*) as count FROM shortages WHERE clientInquiry = '' OR clientInquiry IS NULL
    `).get();
    console.log(`\nRegistros com clientInquiry inválido ('') no SQLite: ${invalidClientInquiry.count}`);
  } catch (err) {
    console.error('Erro ao verificar clientInquiry:', err);
  }
}

verify();
