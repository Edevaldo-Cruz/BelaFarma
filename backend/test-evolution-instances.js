const fetch = require('node-fetch');
const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';

async function test() {
  const url = `${API_URL}/instance/fetchInstances`;
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
    console.log('Instances:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
