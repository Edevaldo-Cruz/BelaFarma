const serverUrl = 'https://app.drogariabelafarma.com.br';
const postsUrl = `${serverUrl}/api/whatsapp/scheduled-posts`;

async function listPosts() {
  console.log(`Buscando posts agendados da VPS: ${postsUrl}`);
  try {
    const res = await fetch(postsUrl);
    console.log(`HTTP Status: ${res.status} ${res.statusText}`);
    
    if (res.ok) {
      const data = await res.json();
      console.log(`Retornados ${data.length} posts do servidor de produção.`);
      console.log('Últimos 5 posts no servidor de produção:');
      console.log(JSON.stringify(data.slice(-5), null, 2));
    } else {
      const text = await res.text();
      console.log('Erro retornado pela VPS:', text);
    }
  } catch (err) {
    console.error('Erro de conexão com a VPS:', err.message);
  }
}

listPosts();
