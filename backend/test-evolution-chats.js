const fetch = require('node-fetch');
const EVOLUTION_MAIN_INSTANCE = 'belaFarma';
const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';

async function test() {
  const url = `${API_URL}/chat/findChats/${EVOLUTION_MAIN_INSTANCE}`;
  console.log('Fetching from:', url);
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
    
    // Print first 3 keys if object or first 3 items if array
    if (Array.isArray(data)) {
      console.log('Array length:', data.length);
      if (data.length > 0) {
        console.log('First chat sample:', JSON.stringify(data[0], null, 2));
      }
    } else {
      console.log('Object keys:', Object.keys(data));
      const chats = data.chats || data.data || [];
      console.log('Chats list length:', chats.length);
      if (chats.length > 0) {
        console.log('First chat sample:', JSON.stringify(chats[0], null, 2));
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
