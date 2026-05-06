const sender = require('./backend/services/message-sender.service');
const db = require('./backend/database');

async function testGroups() {
  console.log('--- TESTE DE GRUPOS WHATSAPP ---');
  
  const groups = await sender.fetchGroups();
  console.log(`Grupos encontrados: ${groups.length}`);
  
  if (groups.length > 0) {
    const firstGroup = groups[0];
    console.log(`Testando envio para o grupo: ${firstGroup.subject} (${firstGroup.id})`);
    
    // Tenta enviar uma mensagem de texto simples
    const result = await sender.sendMessage(firstGroup.id, '🤖 *Teste de Integração BelaFarma*\nEste é um teste automático do novo módulo de agendamento de grupos.');
    
    if (result.success) {
      console.log('✅ Mensagem enviada com sucesso!');
    } else {
      console.log(`❌ Falha no envio: ${result.error}`);
    }
  } else {
    console.log('Nenhum grupo encontrado na instância ativa.');
  }
}

testGroups();
