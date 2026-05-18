const rpaWhatsapp = require('./services/rpa-whatsapp.service');

(async () => {
  const args = process.argv.slice(2);
  const groupName = args[0] || 'Marketing';
  const message = args[1] || ('Teste de envio automático via RPA - BelaFarma ' + new Date().toLocaleString());
  const imagePath = args[2] || null;
  
  console.log(`🧪 Iniciando teste de envio para o grupo "${groupName}" via RPA...`);
  if (imagePath) {
    console.log(`📎 Com imagem: ${imagePath}`);
  }
  
  try {
    const result = await rpaWhatsapp.sendGroupMessage(groupName, message, imagePath);
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

