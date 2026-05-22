const fetch = require('node-fetch');
const EVOLUTION_MAIN_INSTANCE = 'belaFarma';
const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';

async function test() {
  const urls = [
    `${API_URL}/contact/getContacts/${EVOLUTION_MAIN_INSTANCE}`,
    `${API_URL}/chat/getChats/${EVOLUTION_MAIN_INSTANCE}`,
  ];
  
  for (const url of urls) {
    console.log('\nFetching from:', url);
    try {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'apikey': API_KEY,
        }
      });
      console.log('Status:', res.status);
      const data = await res.json();
      console.log('Data type:', typeof data, Array.isArray(data) ? 'Array' : 'Object');
      if (Array.isArray(data)) {
        console.log('Length:', data.length);
        if (data.length > 0) {
          console.log('Sample:', JSON.stringify(data[0], null, 2));
        }
      } else {
        console.log('Keys:', Object.keys(data));
        const items = data.contacts || data.chats || data.data || [];
        console.log('List length:', items.length);
        if (items.length > 0) {
          console.log('Sample:', JSON.stringify(items[0], null, 2));
        }
      }
    } catch (err) {
      console.error('Error:', err.message);
    }
  }
}

test();
