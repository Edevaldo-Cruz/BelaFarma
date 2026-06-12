const fetch = require('node-fetch');

async function testSend() {
  const url = 'http://localhost:3001/api/whatsapp-vendas/send-message';
  const payload = {
    phone: '553288634755', // Número do Edevaldo
    text: 'Olá Edevaldo, este é um teste enviado pelo Baileys local conectado ao celular de teste!'
  };

  console.log('Enviando requisição local para:', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    console.log('Status da resposta:', res.status);
    const data = await res.json();
    console.log('JSON retornado:', data);
  } catch (err) {
    console.error('Erro na requisição:', err.message);
  }
}

testSend();
