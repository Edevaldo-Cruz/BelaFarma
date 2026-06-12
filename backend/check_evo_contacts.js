const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';
const INSTANCE = 'belaFarma';

async function main() {
  const url = `${API_URL}/chat/findContacts/${INSTANCE}`;
  console.log(`Buscando contatos na Evolution API: ${url}...`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      },
      body: JSON.stringify({
        where: {}
      })
    });
    if (!res.ok) {
      console.error(`Erro: status ${res.status}`);
      return;
    }
    const data = await res.json();
    const contacts = Array.isArray(data) ? data : (data.contacts || data.data || []);
    console.log(`Retornados ${contacts.length} contatos.`);
    
    // Imprimir amostra de contatos que possam ser LIDs ou normais
    const sample = contacts.slice(0, 10);
    console.log('Amostra de contatos:', JSON.stringify(sample, null, 2));
  } catch (err) {
    console.error('Erro de conexao:', err.message);
  }
}

main();
