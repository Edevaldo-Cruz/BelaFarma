/**
 * Script para Inicializar o Banco de Dados MongoDB Atlas de Produção
 * com Dados Essenciais
 * 
 * Este script cria os dados mínimos necessários para o sistema funcionar:
 * - Usuário administrador padrão
 * 
 * Uso:
 *   node scripts/init-production-db.js
 */

const ATLAS_CONFIG = {
  endpoint: 'https://sa-east-1.aws.data.mongodb-api.com/app/data-bhzrbfe/endpoint/data/v1',
  apiKey: 'mdb_sa_sk_rXt_BACYUMGw1ZIHduNx1TVF4eXoANI08qTrLKT4',
  cluster: 'BancoBela',
  database: 'belafarma',
  dataSource: 'BancoBela'
};

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

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

async function initializeDatabase() {
  console.log('🚀 Inicializando banco de dados de produção...\n');
  console.log(`📊 Banco: ${ATLAS_CONFIG.database}`);
  console.log(`🌐 Cluster: ${ATLAS_CONFIG.dataSource}\n`);

  const results = [];

  // 1. Criar usuário administrador padrão
  try {
    console.log('👤 Criando usuário administrador...');
    
    const adminUser = {
      id: generateId(),
      name: 'Administrador',
      role: 'admin',
      accessKey: 'admin123' // IMPORTANTE: Altere esta senha após o primeiro acesso!
    };

    const result = await atlasRequest('insertOne', 'users', {
      document: adminUser
    });

    results.push({
      item: 'Usuário Admin',
      status: '✅',
      details: `Chave de acesso: ${adminUser.accessKey}`
    });

    console.log(`   ✅ Usuário criado com sucesso!`);
    console.log(`   📝 Nome: ${adminUser.name}`);
    console.log(`   🔑 Chave de acesso: ${adminUser.accessKey}`);
    console.log(`   ⚠️  IMPORTANTE: Altere a chave de acesso após o primeiro login!\n`);
  } catch (error) {
    results.push({
      item: 'Usuário Admin',
      status: '❌',
      error: error.message
    });
    console.log(`   ❌ Erro: ${error.message}\n`);
  }

  // 2. Criar conta fixa de exemplo (opcional - comentado por padrão)
  /*
  try {
    console.log('💰 Criando conta fixa de exemplo...');
    
    const fixedAccount = {
      id: generateId(),
      name: 'Aluguel',
      value: 1500.00,
      dueDay: 10,
      isActive: 1
    };

    await atlasRequest('insertOne', 'fixed_accounts', {
      document: fixedAccount
    });

    results.push({
      item: 'Conta Fixa Exemplo',
      status: '✅'
    });

    console.log(`   ✅ Conta fixa criada: ${fixedAccount.name}\n`);
  } catch (error) {
    results.push({
      item: 'Conta Fixa Exemplo',
      status: '❌',
      error: error.message
    });
    console.log(`   ❌ Erro: ${error.message}\n`);
  }
  */

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DA INICIALIZAÇÃO');
  console.log('='.repeat(60) + '\n');

  results.forEach(r => {
    const status = r.status === '✅' ? '✅' : '❌';
    const details = r.details ? ` - ${r.details}` : '';
    const error = r.error ? ` (${r.error})` : '';
    console.log(`${status} ${r.item}${details}${error}`);
  });

  console.log('\n' + '='.repeat(60));

  const successCount = results.filter(r => r.status === '✅').length;
  const failCount = results.filter(r => r.status === '❌').length;

  if (failCount === 0) {
    console.log('✨ Banco de dados inicializado com sucesso!');
  } else {
    console.log(`⚠️  Inicialização concluída com ${failCount} erro(s).`);
  }

  console.log('\n⚠️  LEMBRETE IMPORTANTE:');
  console.log('   - Altere a chave de acesso do administrador após o primeiro login');
  console.log('   - Configure os usuários adicionais conforme necessário');
  console.log('   - Revise as configurações de segurança do MongoDB Atlas\n');
}

// Executa o script
initializeDatabase()
  .then(() => {
    console.log('✅ Script finalizado.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });
