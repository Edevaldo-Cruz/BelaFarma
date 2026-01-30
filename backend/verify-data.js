// Script para verificar todos os dados do banco
const db = require('./database.js');

console.log('=== VERIFICAÇÃO COMPLETA DO BANCO DE DADOS ===\n');

try {
  // Usuários
  const users = db.prepare('SELECT * FROM users').all();
  console.log(`✅ USUÁRIOS: ${users.length} encontrado(s)`);
  users.forEach(u => console.log(`   - ${u.name} (${u.role})`));
  
  // Fechamentos de caixa
  const closings = db.prepare('SELECT * FROM cash_closings ORDER BY date DESC LIMIT 5').all();
  console.log(`\n✅ FECHAMENTOS DE CAIXA: ${closings.length} encontrado(s) (mostrando últimos 5)`);
  closings.forEach(c => console.log(`   - ${c.date} | R$ ${c.totalSales} | ${c.userName}`));
  
  // Lançamentos diários
  const dailyRecords = db.prepare('SELECT * FROM daily_records ORDER BY date DESC LIMIT 5').all();
  console.log(`\n✅ LANÇAMENTOS DIÁRIOS: ${dailyRecords.length} encontrado(s) (mostrando últimos 5)`);
  dailyRecords.forEach(r => console.log(`   - ${r.date} | ${r.userName}`));
  
  // Pedidos
  const orders = db.prepare('SELECT COUNT(*) as count FROM orders').get();
  console.log(`\n✅ PEDIDOS: ${orders.count} encontrado(s)`);
  
  // Boletos
  const boletos = db.prepare('SELECT COUNT(*) as count FROM boletos').get();
  console.log(`✅ BOLETOS: ${boletos.count} encontrado(s)`);
  
  // Contas fixas
  const fixedAccounts = db.prepare('SELECT COUNT(*) as count FROM fixed_accounts').get();
  console.log(`✅ CONTAS FIXAS: ${fixedAccounts.count} encontrado(s)`);
  
  // Clientes
  const customers = db.prepare('SELECT COUNT(*) as count FROM customers').get();
  console.log(`✅ CLIENTES: ${customers.count} encontrado(s)`);
  
  console.log('\n=== TESTE DO ENDPOINT /api/all-data ===');
  console.log('Simulando requisição...\n');
  
  const allData = {
    users: db.prepare('SELECT * FROM users').all(),
    cashClosings: db.prepare('SELECT * FROM cash_closings ORDER BY date DESC').all(),
    dailyRecords: db.prepare('SELECT * FROM daily_records ORDER BY date DESC').all(),
    orders: db.prepare('SELECT * FROM orders ORDER BY orderDate DESC').all(),
    boletos: db.prepare('SELECT * FROM boletos ORDER BY due_date').all(),
    fixedAccounts: db.prepare('SELECT * FROM fixed_accounts').all(),
  };
  
  console.log('Dados que seriam retornados:');
  console.log(`  - users: ${allData.users.length} registros`);
  console.log(`  - cashClosings: ${allData.cashClosings.length} registros`);
  console.log(`  - dailyRecords: ${allData.dailyRecords.length} registros`);
  console.log(`  - orders: ${allData.orders.length} registros`);
  console.log(`  - boletos: ${allData.boletos.length} registros`);
  console.log(`  - fixedAccounts: ${allData.fixedAccounts.length} registros`);
  
  console.log('\n✅ VERIFICAÇÃO CONCLUÍDA COM SUCESSO!');
  console.log('\n📌 PRÓXIMOS PASSOS:');
  console.log('   1. Reinicie o servidor backend (Ctrl+C e npm run dev)');
  console.log('   2. Limpe o cache do navegador (Ctrl+Shift+R)');
  console.log('   3. Verifique o console do navegador para erros');
  
} catch (error) {
  console.error('❌ ERRO:', error);
  process.exit(1);
}
