async function test() {
  try {
    console.log('Testando POST /api/whatsapp/offers-bank/offer-1782225568738-ptt1f/status em produção...');
    const postRes = await fetch('http://192.168.1.70:8085/api/whatsapp/offers-bank/offer-1782225568738-ptt1f/status', {
      method: 'POST'
    });
    console.log('HTTP Status Code:', postRes.status);
    const text = await postRes.text();
    console.log('Response Body:', text);
  } catch (err) {
    console.error('Erro:', err);
  }
}

test();
