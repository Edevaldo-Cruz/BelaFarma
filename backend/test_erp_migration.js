/**
 * Teste automatizado para o serviço de migração do Belinha ERP
 */

const { executarMigracaoErp, getMigrationHistory } = require('./modules/erp/erp-migration.service');
const { db } = require('./modules/erp/erp-database');

async function testMigration() {
  console.log('--- INICIANDO TESTE DE MIGRAÇÃO ERP ---');
  
  // Executa com forceCacheOnly para teste rápido no ambiente local
  const result = await executarMigracaoErp({ forceCacheOnly: true, resetTables: false });
  
  console.log('\nResultado do teste:', result);

  // Verificações de integridade
  const countProducts = db.prepare('SELECT count(*) as total FROM products').get().total;
  const countDebts = db.prepare('SELECT count(*) as total, sum(balance) as totalVal FROM customer_debts').get();
  const sampleProduct = db.prepare('SELECT * FROM products WHERE stock_qty > 0 LIMIT 1').get();

  console.log('\n--- VERIFICAÇÃO DE INTEGRIDADE NO BANCO NATIVO ---');
  console.log(`Total de produtos em 'products': ${countProducts}`);
  console.log(`Total de débitos em 'customer_debts': ${countDebts.total} (R$ ${countDebts.totalVal})`);
  console.log('Amostra de produto com estoque:', sampleProduct);

  if (countProducts > 0 && result.success) {
    console.log('\n✅ TESTE DE MIGRAÇÃO CONCLUÍDO COM SUCESSO ABSOLUTO!');
    process.exit(0);
  } else {
    console.error('\n❌ Falha na contagem de produtos migrados.');
    process.exit(1);
  }
}

testMigration().catch(err => {
  console.error('❌ Erro no teste de migração:', err);
  process.exit(1);
});
