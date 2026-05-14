const rpaWhatsapp = require('./services/rpa-whatsapp.service');

(async () => {
  console.log('🧪 Iniciando teste de envio para o grupo Marketing via RPA...');
  const groupName = 'Marketing';
  const message = 'Teste de envio automático via RPA - BelaFarma ' + new Date().toLocaleString();
  
  try {
    const result = await rpaWhatsapp.sendGroupMessage(groupName, message);
    console.log('✅ Resultado do teste:', result);
    if (result.success) {
      console.log('🚀 Sucesso! A mensagem deve aparecer no WhatsApp em breve.');
    } else {
      console.log('❌ Falha no envio:', result.error);
    }
  } catch (error) {
    console.error('💥 Erro catastrófico no script de teste:', error);
  }
})();
