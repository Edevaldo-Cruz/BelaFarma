async function test() {
  try {
    console.log('1. Buscando ofertas de produção...');
    const offersRes = await fetch('http://192.168.1.70:8085/api/whatsapp/offers-bank');
    const offers = await offersRes.json();
    console.log(`Encontradas ${offers.length} ofertas.`);

    for (let i = 0; i < Math.min(5, offers.length); i++) {
      const offer = offers[i];
      console.log(`\nTestando Oferta #${i + 1} (${offer.id}): ${offer.productName}`);
      console.log(`mediaPath no Banco: "${offer.mediaPath}"`);

      const statusRes = await fetch(`http://192.168.1.70:8085/api/whatsapp/offers-bank/${offer.id}/status`, {
        method: 'POST'
      });
      console.log(`HTTP Status: ${statusRes.status}`);
      const body = await statusRes.text();
      console.log(`Resposta: ${body}`);
      if (statusRes.status === 200) {
        console.log('🎉 SUCESSO! Oferta postada no status!');
        break;
      }
    }
  } catch (err) {
    console.error('Erro na requisição API:', err.message);
  }
}

test();
