async function run() {
  try {
    console.log('Triggering reconnect on http://192.168.1.70:3001/api/whatsapp/baileys/reconnect...');
    const res = await fetch('http://192.168.1.70:3001/api/whatsapp/baileys/reconnect', { method: 'POST' });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Result:', data);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
