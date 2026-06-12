const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';
const INSTANCE = 'belaFarma';
const LID = '262165407768632@s.whatsapp.net';

async function main() {
  const url = `${API_URL}/chat/findContact/${INSTANCE}/${encodeURIComponent(LID)}`;
  console.log(`Buscando contato na Evolution API: ${url}...`);
  try {
    const res = await fetch(url, {
      headers: { 'apikey': API_KEY }
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', JSON.stringify(JSON.parse(text), null, 2));
  } catch (err) {
    console.error('Erro de conexao:', err.message);
  }
}

main();
