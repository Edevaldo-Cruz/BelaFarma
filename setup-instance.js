import fs from 'fs';

async function setup() {
  try {
    // 3. Pegar e salvar o QR Code em um arquivo HTML para o usuário escanear
    console.log('⏳ Gerando novo QR Code...');
    const connectRes = await fetch('http://127.0.0.1:8080/instance/connect/belafarma_principal', {
      headers: { apikey: 'BelafarmaSul2026' }
    });
    const connectData = await connectRes.json();
    
    if (connectData && connectData.base64) {
      const html = `<html style="background: #222; color: #fff; text-align: center; padding: 50px; font-family: sans-serif;"><head><title>QR Code Farmácia</title></head><body><h1>Escaneie com o WhatsApp da Farmácia (32) 99822-8189</h1><br/><img src="${connectData.base64}" style="border-radius: 10px; border: 10px solid white; max-width: 350px;"/><br/><br/><p>Aguarde a conexão...</p></body></html>`;
      fs.writeFileSync('qrcode-farmacia.html', html);
      console.log('✅ NOVO QR Code salvo em qrcode-farmacia.html');
    } else {
      console.log('Nenhum base64 retornado. A instância já está conectada?', connectData);
    }
  } catch (err) {
    console.error('Erro na configuração:', err);
  }
}
setup();
