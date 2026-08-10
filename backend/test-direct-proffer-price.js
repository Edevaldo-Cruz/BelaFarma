const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  console.log('Testing DIRECT HTTP POST to proffer/price API...');

  try {
    // 1. Login to get token
    const loginRes = await fetch('https://api-app-public.nappsolutions.com/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.NAPP_EMAIL,
        password: process.env.NAPP_PASSWORD
      })
    });
    const { token } = await loginRes.json();
    const sellerId = '20a28238-fea5-11f0-b8ef-cb8fa8305438';

    // Product IDs:
    // Neosoro: 0f155b4e-006c-11f1-9fd8-a35e2a10b5e1
    // Impala: 1264ee0e-006c-11f1-a28b-23b1d8fd2b8c
    const products = [
      { name: 'Neosoro 30ml', id: '0f155b4e-006c-11f1-9fd8-a35e2a10b5e1' },
      { name: 'Esmalte Impala Amarelo', id: '1264ee0e-006c-11f1-a28b-23b1d8fd2b8c' }
    ];

    for (const prod of products) {
      console.log(`\nQuerying Proffer Price for ${prod.name} (${prod.id})...`);
      const url = `https://api-app-public.nappsolutions.com/v1/sellers/${sellerId}/catalogs/${prod.id}/proffer/price`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      console.log(`HTTP Status: ${res.status}`);
      const data = await res.json();
      console.log('Response:\n', JSON.stringify(data, null, 2));

      // Extract Independent Medium Price
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const independentInfo = data[0].find(item => item.grupo === 'INDEPENDENTE');
        if (independentInfo) {
          console.log(`🎯 ${prod.name} -> PREÇO MÉDIO FARMÁCIAS INDEPENDENTES: R$ ${independentInfo.medio}`);
        }
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
})();
