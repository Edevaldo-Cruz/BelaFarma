// Script de teste para verificar conexão com banco de dados
const db = require('./database.js');

console.log('=== Teste de Conexão com Banco de Dados ===\n');

if (!db) {
  console.error('❌ ERRO: db é undefined ou null!');
  console.error('O banco de dados não foi inicializado corretamente.');
  process.exit(1);
}

console.log('✅ Conexão com banco estabelecida\n');

// Testar query simples
try {
  console.log('Testando query SELECT...');
  const stmt = db.prepare('SELECT * FROM users');
  const users = stmt.all();
  console.log(`✅ Query executada com sucesso. ${users.length} usuário(s) encontrado(s)\n`);
  
  if (users.length > 0) {
    console.log('Usuários cadastrados:');
    users.forEach(u => {
      console.log(`  - ${u.name} (${u.role}) - Chave: ${u.accessKey}`);
    });
  } else {
    console.log('⚠️  Nenhum usuário cadastrado no banco.');
    console.log('   Use a chave mestra: belafarma2024');
  }
  
  console.log('\n✅ Teste concluído com sucesso!');
  process.exit(0);
  
} catch (error) {
  console.error('❌ ERRO ao executar query:');
  console.error(error);
  process.exit(1);
}
