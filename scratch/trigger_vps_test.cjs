const serverUrl = 'https://app.drogariabelafarma.com.br';
const triggerUrl = `${serverUrl}/api/whatsapp/send-immediate`;

async function triggerTest() {
  console.log(`Enfileirando disparo de teste via FormData na VPS: ${triggerUrl}`);
  try {
    const formData = new FormData();
    formData.append('groupId', 'Marketing');
    formData.append('groupName', 'Marketing');
    formData.append('content', '🤖 Teste do Robô Bela Farma: Conexão ativa e integrada com sucesso!');

    const res = await fetch(triggerUrl, {
      method: 'POST',
      body: formData
    });
    
    console.log(`HTTP Status: ${res.status} ${res.statusText}`);
    const data = await res.json();
    console.log('Resposta da VPS:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Erro ao chamar a VPS:', err.message);
  }
}

triggerTest();
