const fetch = require('node-fetch');
const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';

async function testInstance(instanceName) {
  const url = `${API_URL}/chat/findChats/${instanceName}`;
  console.log(`\nFetching chats from ${instanceName}:`, url);
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
      const chats = data.chats || data.data || [];
      console.log('Chats length:', chats.length);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function run() {
  await testInstance('belaFarma');
  await testInstance('belaAtende');
}

run();
