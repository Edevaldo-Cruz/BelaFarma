async function checkMessages() {
  const chatId = '146853823787031@s.whatsapp.net';
  console.log(`Buscando mensagens do chat ${chatId}...`);
  try {
    const response = await fetch(`http://localhost:3001/api/whatsapp-vendas/messages/${encodeURIComponent(chatId)}`);
    if (response.ok) {
      const data = await response.json();
      console.log('Total de mensagens retornadas:', data.messages ? data.messages.length : 0);
      console.log('Mensagens:', JSON.stringify(data.messages, null, 2));
    } else {
      console.error('Erro na resposta do backend:', response.status);
    }
  } catch (err) {
    console.error('Erro ao conectar ao backend:', err.message);
  }
}

checkMessages();
