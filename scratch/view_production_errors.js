// Usa o fetch nativo do Node 18+ / Node 24+
async function checkProductionErrors() {
  const url = 'https://app.drogariabelafarma.com.br/api/whatsapp/scheduled-posts';
  console.log(`🌐 Buscando postagens em produção: ${url}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ Falha ao acessar produção: HTTP ${res.status}`);
      return;
    }
    const posts = await res.json();
    console.log(`📊 Total de postagens na fila em produção: ${posts.length}`);
    
    const errors = posts.filter(p => p.status === 'Erro');
    console.log(`🚨 Total de postagens com ERRO: ${errors.length}\n`);

    if (errors.length === 0) {
      console.log('✅ Nenhuma postagem com erro encontrada!');
      return;
    }

    errors.forEach((post, i) => {
      console.log(`-------------------------------------------`);
      console.log(`[Erro ${i + 1}] ID: ${post.id}`);
      console.log(`👥 Grupo: ${post.groupName || post.groupId}`);
      console.log(`📅 Agendado para: ${post.scheduledAt}`);
      console.log(`⚠️ Mensagem de Erro: "${post.errorMessage}"`);
      console.log(`💬 Conteúdo (resumo): "${post.content.slice(0, 80)}..."`);
      console.log(`🖼️ Mídia: ${post.mediaPath || 'Nenhuma'}`);
      console.log(`-------------------------------------------`);
    });
  } catch (err) {
    console.error(`🚨 Erro de rede ao buscar dados do servidor de produção:`, err.message);
  }
}

checkProductionErrors();
