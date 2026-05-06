const sender = require('../backend/services/message-sender.service');
const path = require('path');
const fs = require('fs');

async function testGroups() {
  console.log('--- TESTE DE GRUPOS WHATSAPP ---');
  
  try {
    const groups = await sender.fetchGroups();
    console.log(`Grupos encontrados: ${groups.length}`);
    
    if (groups.length > 0) {
      // Procura por um grupo que não seja muito grande ou específico se possível
      const testGroup = groups.find(g => g.subject.toLowerCase().includes('teste')) || groups[0];
      
      console.log(`Testando envio para o grupo: ${testGroup.subject} (${testGroup.id})`);
      
      const message = '🤖 *Teste de Integração BelaFarma*\nEste é um teste automático do novo módulo de agendamento de grupos.\n\n✅ Envio direto via Backend funcionando!';
      
      const result = await sender.sendMessage(testGroup.id, message);
      
      if (result.success) {
        console.log('✅ Mensagem enviada com sucesso!');
      } else {
        console.log(`❌ Falha no envio: ${result.error}`);
      }
    } else {
      console.log('Nenhum grupo encontrado na instância ativa.');
    }
  } catch (err) {
    console.error('Erro no teste:', err.message);
  }
}

testGroups();
