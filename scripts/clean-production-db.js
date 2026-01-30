/**
 * Script para Limpar o Banco de Dados MongoDB Atlas de Produção
 * 
 * ATENÇÃO: Este script remove TODOS os dados do banco de produção!
 * Use com extremo cuidado.
 * 
 * Uso:
 *   node scripts/clean-production-db.js
 */

const ATLAS_CONFIG = {
  endpoint: 'https://sa-east-1.aws.data.mongodb-api.com/app/data-bhzrbfe/endpoint/data/v1',
  apiKey: 'mdb_sa_sk_rXt_BACYUMGw1ZIHduNx1TVF4eXoANI08qTrLKT4',
  cluster: 'BancoBela',
  database: 'belafarma',
  dataSource: 'BancoBela'
};

// Lista de todas as coleções do sistema
const COLLECTIONS = [
  'users',
  'orders',
  'shortages',
  'logs',
  'cash_closings',
  'crediario_records',
  'tasks',
  'checking_account_transactions',
  'boletos',
  'monthly_limits',
  'daily_records',
  'fixed_accounts',
  'customers',
  'customer_debts',
  'safe_entries',
  'bugs',
  'flyering_tasks'
];

async function atlasRequest(action, collection, body = {}) {
  try {
    const response = await fetch(`${ATLAS_CONFIG.endpoint}/action/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': ATLAS_CONFIG.apiKey,
      },
      body: JSON.stringify({
        dataSource: ATLAS_CONFIG.dataSource,
        database: ATLAS_CONFIG.database,
        collection: collection,
        ...body
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ Erro ao executar ${action} em ${collection}:`, error.message);
    throw error;
  }
}

async function cleanDatabase() {
  console.log('🚨 ATENÇÃO: Este script irá DELETAR TODOS OS DADOS do banco de produção!');
  console.log(`📊 Banco: ${ATLAS_CONFIG.database}`);
  console.log(`🌐 Cluster: ${ATLAS_CONFIG.dataSource}`);
  console.log('');
  console.log('⏳ Aguardando 5 segundos antes de iniciar...');
  console.log('   (Pressione Ctrl+C para cancelar)');
  console.log('');

  // Aguarda 5 segundos para dar tempo de cancelar
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('🧹 Iniciando limpeza do banco de dados...\n');

  let totalDeleted = 0;
  const results = [];

  for (const collection of COLLECTIONS) {
    try {
      console.log(`📦 Limpando coleção: ${collection}...`);
      
      const result = await atlasRequest('deleteMany', collection, {
        filter: {} // Deleta todos os documentos
      });

      const deletedCount = result.deletedCount || 0;
      totalDeleted += deletedCount;
      
      results.push({
        collection,
        deleted: deletedCount,
        status: '✅'
      });

      console.log(`   ✅ ${deletedCount} documento(s) deletado(s)\n`);
    } catch (error) {
      results.push({
        collection,
        deleted: 0,
        status: '❌',
        error: error.message
      });
      console.log(`   ❌ Erro: ${error.message}\n`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DA LIMPEZA');
  console.log('='.repeat(60) + '\n');

  results.forEach(r => {
    const status = r.status === '✅' ? '✅' : '❌';
    const msg = r.error ? ` (${r.error})` : ` - ${r.deleted} deletados`;
    console.log(`${status} ${r.collection.padEnd(30)} ${msg}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log(`🎯 Total de documentos deletados: ${totalDeleted}`);
  console.log('='.repeat(60) + '\n');

  const successCount = results.filter(r => r.status === '✅').length;
  const failCount = results.filter(r => r.status === '❌').length;

  if (failCount === 0) {
    console.log('✨ Banco de dados limpo com sucesso!');
  } else {
    console.log(`⚠️  Limpeza concluída com ${failCount} erro(s).`);
  }
}

// Executa o script
cleanDatabase()
  .then(() => {
    console.log('\n✅ Script finalizado.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });
