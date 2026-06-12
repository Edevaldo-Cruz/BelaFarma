const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';
const INSTANCE = 'belaFarma';
const LID = '262165407768632@s.whatsapp.net';

async function tryGet(url) {
  try {
    console.log(`\nGET: ${url}`);
    const res = await fetch(url, {
      headers: { 'apikey': API_KEY }
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text.substring(0, 500));
  } catch (err) {
    console.log('Error:', err.message);
  }
}

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
  // 1. Testar GET /contact/profile
  await tryGet(`${API_URL}/contact/profile/${INSTANCE}?number=${LID}`);
  await tryGet(`${API_URL}/contact/profile/${INSTANCE}?number=262165407768632`);

  // 2. Testar POST /contact/profile
  await tryPost(`${API_URL}/contact/profile/${INSTANCE}`, { number: LID });
  await tryPost(`${API_URL}/contact/profile/${INSTANCE}`, { number: "262165407768632" });

  // 3. Testar /chat/profile
  await tryGet(`${API_URL}/chat/profile/${INSTANCE}?number=${LID}`);
}

main();
