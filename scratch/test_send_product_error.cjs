

async function testSendProduct() {
  const url = 'http://localhost:3001/api/whatsapp-vendas/send-product';
  const payload = {
    phone: '5532988634755',
    productId: 17923,
    productName: 'NEOPIRIDIN SPRAY MENTA 50ML NEO QUIMICA',
    price: 19.99,
    stock: 10,
    imageUrl: null,
    status: 'pesquisado'
  };

  console.log('Enviando requisição de teste para', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('Status da Resposta:', res.status);
    const data = await res.text();
    console.log('Corpo da Resposta:', data);
  } catch (err) {
    console.error('Erro ao conectar ao servidor:', err.message);
  }
}

testSendProduct();
