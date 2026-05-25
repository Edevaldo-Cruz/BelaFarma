async function listVpsPosts() {
  const url = 'https://app.drogariabelafarma.com.br/api/whatsapp/scheduled-posts';
  console.log(`🌐 Buscando postagens na VPS: ${url}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ Falha ao acessar: HTTP ${res.status}`);
      return;
    }
    const posts = await res.json();
    console.log(`📊 Total na fila: ${posts.length}`);
    
    // Ordena por data decrescente (os mais recentes primeiro)
    posts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    
    // Pega os 10 mais recentes
    const recentPosts = posts.slice(0, 10);
    console.log(`\n📋 Últimas 10 postagens na fila (da mais recente para a mais antiga):`);
    recentPosts.forEach((post, i) => {
      console.log(`-------------------------------------------`);
      console.log(`[#${i + 1}] ID: ${post.id}`);
      console.log(`👥 Grupo: ${post.groupName || post.groupId}`);
      console.log(`📅 Criado em: ${post.createdAt}`);
      console.log(`⏱️ Status: ${post.status}`);
      if (post.errorMessage) {
        console.log(`⚠️ Erro: "${post.errorMessage}"`);
      }
      console.log(`💬 Conteúdo (resumo): "${post.content.slice(0, 70)}..."`);
      console.log(`🖼️ Mídia: ${post.mediaPath || 'Nenhuma'}`);
      console.log(`-------------------------------------------`);
    });
  } catch (err) {
    console.error(`🚨 Erro de rede:`, err.message);
  }
}

listVpsPosts();
