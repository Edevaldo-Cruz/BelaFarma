const token = 'BelafarmaSul2026';
const baseUrl = 'http://192.168.1.70:8085';

async function purgeAllOldGroupPosts() {
  console.log('=== LIMPANDO TODOS OS POSTS ANTIGOS DE GRUPO DA FILA ===');
  let clearedCount = 0;

  while (true) {
    const res = await fetch(`${baseUrl}/api/whatsapp/agent/pending?token=${token}`);
    if (!res.ok) {
      console.error('Erro na resposta:', res.status);
      break;
    }
    const data = await res.json();
    if (!data.hasPending) {
      console.log('Nenhum item pendente restante.');
      break;
    }

    const { post } = data;
    if (post.type === 'status') {
      console.log(`🎯 Post de STATUS encontrado! ID=${post.id}. Mantendo na fila.`);
      break;
    }

    await fetch(`${baseUrl}/api/whatsapp/agent/report?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: post.id,
        status: 'Cancelado',
        errorMessage: 'Limpeza de teste antigo de grupo'
      })
    });
    clearedCount++;
    if (clearedCount % 50 === 0) {
      console.log(`Cancelados até agora: ${clearedCount}...`);
    }
  }

  console.log(`\n🎉 Limpeza concluída! Total de ${clearedCount} mensagens de grupo canceladas.`);
}

purgeAllOldGroupPosts();
