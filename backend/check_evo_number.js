const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';
const INSTANCE = 'belaFarma';

async function main() {
  const url = `${API_URL}/contact/checkNumbers/${INSTANCE}`;
  console.log(`Verificando numero na Evolution API: ${url}...`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      },
      body: JSON.stringify({
        numbers: ["262165407768632"] // LID da Nayane
      })
    });
    if (!res.ok) {
      console.error(`Erro: status ${res.status}`);
      return;
    }
    const data = await res.json();
    console.log('Resultado:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Erro de conexao:', err.message);
  }
}

main();
