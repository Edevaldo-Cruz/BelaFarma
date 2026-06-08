const fetch = require('node-fetch');

const dummyBase64Jpeg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const payload = {
  event: 'messages.upsert',
  instance: 'belaFarma',
  data: {
    key: {
      remoteJid: '5532988634755@s.whatsapp.net',
      fromMe: false,
      id: 'SIMULATED_PIX_' + Date.now()
    },
    messageType: 'imageMessage',
    message: {
      base64: dummyBase64Jpeg,
      imageMessage: {
        mimetype: 'image/jpeg',
        caption: 'Aqui está meu comprovante PIX'
      }
    }
  }
};

async function runTest() {
  console.log('Enviando webhook simulado com base64 direto...');
  try {
    const res = await fetch('http://localhost:3001/api/webhook/evolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`Resposta HTTP: ${res.status}`);
  } catch(err) {
    console.error('Erro de conexão:', err.message);
  }
}

runTest();
