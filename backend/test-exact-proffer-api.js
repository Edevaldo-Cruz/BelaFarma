const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  console.log('Testing exact POST proffer endpoint captured during Consultar click...');

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
    
    // Product ID for Neosoro: 0f155b4e-006c-11f1-9fd8-a35e2a10b5e1
    // Product ID for Impala: 1264ee0e-006c-11f1-a28b-23b1d8fd2b8c
    const testProducts = [
      { name: 'Neosoro', id: '0f155b4e-006c-11f1-9fd8-a35e2a10b5e1' },
      { name: 'Impala', id: '1264ee0e-006c-11f1-a28b-23b1d8fd2b8c' }
    ];

    for (const prod of testProducts) {
      console.log(`\nTesting POST proffer for ${prod.name} (${prod.id})...`);
      
      const profferUrl = `https://api-app-public.nappsolutions.com/v1/sellers/${sellerId}/catalogs/${prod.id}/proffer`;
      
      const res = await fetch(profferUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      console.log(`HTTP Status: ${res.status}`);
      const json = await res.json().catch(() => null);
      console.log('Response JSON:\n', JSON.stringify(json, null, 2));
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
})();
