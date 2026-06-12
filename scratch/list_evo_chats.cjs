const EVOLUTION_URL = 'http://192.168.1.70:8080';
const EVOLUTION_API_KEY = 'BelafarmaSul2026';
const INSTANCE = 'belaFarma';

async function listChats() {
  console.log(`Buscando chats da instância ${INSTANCE}...`);
  try {
    const response = await fetch(`${EVOLUTION_URL}/chat/findChats/${INSTANCE}`, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY
      }
    });

    if (response.ok) {
      const data = await response.json();
      const chatsList = Array.isArray(data) ? data : (data.chats || data.data || []);
      console.log(`Total de chats retornados: ${chatsList.length}`);
      
      chatsList.forEach((c, idx) => {
        const jid = c.id || c.remoteJid || '';
        const name = c.name || c.pushName || 'Sem nome';
        console.log(`[${idx}] JID: ${jid} | Nome: ${name}`);
      });
    } else {
      console.error(`Erro: ${response.status} - ${await response.text()}`);
    }
  } catch (err) {
    console.error('Erro na chamada:', err.message);
  }
}

listChats();
