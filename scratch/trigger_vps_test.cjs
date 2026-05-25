// Script para consultar as ofertas da VPS e disparar uma de teste com imagem
async function triggerVpsTest() {
  const offersUrl = 'https://app.drogariabelafarma.com.br/api/whatsapp/offers-bank';
  const triggerUrl = 'https://app.drogariabelafarma.com.br/api/whatsapp/send-immediate-bank';

  console.log(`🌐 Consultando ofertas disponíveis em produção...`);
  try {
    const res = await fetch(offersUrl);
    if (!res.ok) {
      console.error(`❌ Falha ao buscar ofertas: HTTP ${res.status}`);
      return;
    }
    const offers = await res.json();
    console.log(`📊 Encontradas ${offers.length} ofertas no banco.`);

    if (offers.length === 0) {
      console.error('❌ Nenhuma oferta cadastrada no banco da VPS. Cadastre uma oferta primeiro!');
      return;
    }

    // Pega a oferta mais recente
    const targetOffer = offers[0];
    console.log(`🎯 Oferta selecionada para o teste:`);
    console.log(`   - ID: ${targetOffer.id}`);
    console.log(`   - Produto: ${targetOffer.productName}`);
    console.log(`   - Categoria: ${targetOffer.category}`);
    console.log(`   - Imagem: ${targetOffer.mediaPath}`);

    // Dispara a oferta para o grupo "Marketing"
    const payload = {
      offerId: targetOffer.id,
      groupId: 'Marketing',
      groupName: 'Marketing'
    };

    console.log(`\n🚀 Enviando requisição de disparo imediato para o grupo "Marketing"...`);
    const triggerRes = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!triggerRes.ok) {
      console.error(`❌ Falha ao solicitar disparo: HTTP ${triggerRes.status}`);
      const errTxt = await triggerRes.text();
      console.error(`Detalhes: ${errTxt}`);
      return;
    }

    const triggerResult = await triggerRes.json();
    console.log(`🎉 Sucesso! Oferta enfileirada.`);
    console.log(`   - Post ID gerado: ${triggerResult.postId}`);
    console.log(`   - Mensagem: "${triggerResult.message}"`);
  } catch (err) {
    console.error(`🚨 Erro durante o teste:`, err.message);
  }
}

triggerVpsTest();
