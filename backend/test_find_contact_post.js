const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';
const INSTANCE = 'belaFarma';
const LID = '262165407768632@s.whatsapp.net';

async function tryPost(url, body) {
  try {
    console.log(`\nPOST: ${url} with ${JSON.stringify(body)}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      },
      body: JSON.stringify(body)
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text.substring(0, 500));
  } catch (err) {
    console.log('Error:', err.message);
  }
}

async function main() {
  await tryPost(`${API_URL}/chat/findContact/${INSTANCE}`, { number: LID });
  await tryPost(`${API_URL}/chat/findContact/${INSTANCE}`, { jid: LID });
  await tryPost(`${API_URL}/chat/findContact/${INSTANCE}`, { jid: "262165407768632" });
}

main();
