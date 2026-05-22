const fetch = require('node-fetch');
const EVOLUTION_MAIN_INSTANCE = 'belaFarma';
const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';

async function test() {
  const url = `${API_URL}/chat/findChats/${EVOLUTION_MAIN_INSTANCE}`;
  console.log('Posting to:', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY,
      },
      body: JSON.stringify({
        where: {}
      })
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Data type:', typeof data, Array.isArray(data) ? 'Array' : 'Object');
    
    const chats = Array.isArray(data) ? data : (data.chats || data.data || []);
    console.log('Chats list length:', chats.length);
    if (chats.length > 0) {
      console.log('First 5 chats:');
      chats.slice(0, 5).forEach((c, idx) => {
        console.log(`${idx + 1}. JID: ${c.id || c.remoteJid || c.key?.remoteJid}, Name: ${c.name || c.pushName}`);
      });
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
