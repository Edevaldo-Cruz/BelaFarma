async function checkChats() {
  console.log('Buscando chats no backend...');
  try {
    const response = await fetch('http://localhost:3001/api/whatsapp-vendas/chats');
    if (response.ok) {
      const data = await response.json();
      console.log('Total de chats retornados:', data.chats ? data.chats.length : 0);
      
      const lara = data.chats.find(c => c.phone === '146853823787031');
      if (lara) {
        console.log('✅ Lara Oliveira encontrada na listagem!');
        console.log(JSON.stringify(lara, null, 2));
      } else {
        console.warn('❌ Lara Oliveira não encontrada na listagem.');
        console.log('Primeiros 5 chats:', JSON.stringify(data.chats.slice(0, 5), null, 2));
      }
    } else {
      console.error('Erro na resposta do backend:', response.status);
    }
  } catch (err) {
    console.error('Erro ao conectar ao backend:', err.message);
  }
}

checkChats();
