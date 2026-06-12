const EVOLUTION_URL = 'http://192.168.1.70:8080';
const EVOLUTION_API_KEY = 'BelafarmaSul2026';
const INSTANCE = 'belaFarma';

async function testSend(number) {
  console.log(`\n--- Testando envio para: ${number} ---`);
  const payload = {
    number: number,
    options: { delay: 500, linkPreview: false },
    textMessage: {
      text: 'Teste de compatibilidade Evolution API com número LID BelaFarma'
    }
  };

  try {
    const response = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify(payload)
    });

    console.log('Status:', response.status);
    const data = await response.text();
    console.log('Dados retornados:', data);
  } catch (err) {
    console.error('Erro na requisição:', err.message);
  }
}

async function run() {
  // Teste 1: Apenas o número de 15 dígitos
  await testSend('146853823787031');
  // Teste 2: O número com o sufixo @lid
  await testSend('146853823787031@lid');
}

run();
