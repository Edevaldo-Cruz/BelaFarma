const token = 'BelafarmaSul2026';
const serverUrl = 'https://app.drogariabelafarma.com.br';
const pendingUrl = `${serverUrl}/api/whatsapp/agent/pending?token=${token}`;

async function testPending() {
  console.log(`Buscando pendentes da VPS: ${pendingUrl}`);
  try {
    const res = await fetch(pendingUrl);
    console.log(`HTTP Status: ${res.status} ${res.statusText}`);
    
    if (res.ok) {
      const data = await res.json();
      console.log('Resposta da VPS:', JSON.stringify(data, null, 2));
    } else {
      const text = await res.text();
      console.log('Erro retornado pela VPS:', text);
    }
  } catch (err) {
    console.error('Erro de conexão com a VPS:', err.message);
  }
}

testPending();
