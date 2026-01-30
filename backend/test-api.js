// Script para testar a API e simular o que o frontend vê
const fetch = require('node-fetch');

async function testAPI() {
  console.log('=== TESTE COMPLETO DA API ===\n');
  
  try {
    console.log('1. Testando endpoint /api/all-data...');
    const response = await fetch('http://localhost:3001/api/all-data');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('\n✅ Dados recebidos com sucesso!\n');
    console.log('📊 Resumo dos dados:');
    console.log(`   - Usuários: ${data.users?.documents?.length || 0}`);
    console.log(`   - Fechamentos de caixa: ${data.cashClosings?.documents?.length || 0}`);
    console.log(`   - Lançamentos diários: ${data.dailyRecords?.documents?.length || 0}`);
    console.log(`   - Pedidos: ${data.orders?.documents?.length || 0}`);
    console.log(`   - Boletos: ${data.boletos?.documents?.length || 0}`);
    console.log(`   - Contas fixas: ${data.fixedAccounts?.documents?.length || 0}`);
    
    if (data.users?.documents?.length > 0) {
      console.log('\n👥 Usuários encontrados:');
      data.users.documents.forEach(u => {
        console.log(`   - ${u.name} (${u.role}) - Chave: ${u.accessKey}`);
      });
    }
    
    if (data.cashClosings?.documents?.length > 0) {
      console.log('\n💰 Últimos 5 fechamentos de caixa:');
      data.cashClosings.documents.slice(0, 5).forEach(c => {
        console.log(`   - ${c.date} | R$ ${c.totalSales} | ${c.userName}`);
      });
    }
    
    console.log('\n✅ TESTE CONCLUÍDO!');
    console.log('\n📌 CONCLUSÃO:');
    
    if (data.users?.documents?.length === 3 && data.cashClosings?.documents?.length === 30) {
      console.log('   ✅ O backend está retornando os dados de PRODUÇÃO corretamente!');
      console.log('   ✅ O banco de dados está configurado corretamente!');
      console.log('\n   Se o frontend não está mostrando estes dados:');
      console.log('   1. Limpe o cache do navegador (Ctrl+Shift+Del)');
      console.log('   2. Verifique o Console do navegador (F12) para erros');
      console.log('   3. Verifique se há localStorage antigo');
    } else {
      console.log('   ⚠️  Os dados não correspondem ao esperado!');
      console.log('   ⚠️  Esperado: 3 usuários e 30 fechamentos');
      console.log(`   ⚠️  Recebido: ${data.users?.documents?.length || 0} usuários e ${data.cashClosings?.documents?.length || 0} fechamentos`);
    }
    
  } catch (error) {
    console.error('❌ ERRO ao testar API:', error.message);
    console.error('\n📌 Possíveis causas:');
    console.error('   - O servidor backend não está rodando');
    console.error('   - O servidor está em outra porta');
    console.error('   - Há um problema de rede/firewall');
  }
}

testAPI();
