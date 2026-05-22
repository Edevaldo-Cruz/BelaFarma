const fetch = require('node-fetch');
const EVOLUTION_MAIN_INSTANCE = 'belaFarma';
const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';

async function test() {
  const url = `${API_URL}/chat/findContacts/${EVOLUTION_MAIN_INSTANCE}`;
  console.log('Fetching contacts from:', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY,
      },
      body: JSON.stringify({ where: {} })
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Data type:', typeof data, Array.isArray(data) ? 'Array' : 'Object');
    
    const contacts = Array.isArray(data) ? data : (data.contacts || data.data || []);
    console.log('Contacts list length:', contacts.length);
    if (contacts.length > 0) {
      console.log('First 5 contacts:');
      contacts.slice(0, 5).forEach((c, idx) => {
        console.log(`${idx + 1}. Name: ${c.name || c.pushName}, JID: ${c.id || c.remoteJid}`);
      });
      
      // Look for "Nayane"
      const nayane = contacts.find(c => (c.name && c.name.toLowerCase().includes('nayane')) || (c.pushName && c.pushName.toLowerCase().includes('nayane')));
      if (nayane) {
        console.log('\nFOUND NAYANE:', JSON.stringify(nayane, null, 2));
      } else {
        console.log('\nNayane not found in address book list.');
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
