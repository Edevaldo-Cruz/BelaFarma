const fetch = require('node-fetch');

async function testOFF(ean) {
  // 1. Tenta Open Food Facts
  const urlFood = `https://world.openfoodfacts.org/api/v0/product/${ean}.json`;
  console.log(`Fetching ${urlFood}...`);
  try {
    const res = await fetch(urlFood, {
      headers: { 'User-Agent': 'BelaFarmaInventoryApp/1.0 (contact@belafarma.com.br)' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product && data.product.product_name) {
        console.log("SUCCESS (Food):", data.product.product_name);
        return;
      }
    }
  } catch (err) {
    console.error("Food err:", err.message);
  }

  // 2. Tenta Open Beauty Facts
  const urlBeauty = `https://world.openbeautyfacts.org/api/v0/product/${ean}.json`;
  console.log(`Fetching ${urlBeauty}...`);
  try {
    const res = await fetch(urlBeauty, {
      headers: { 'User-Agent': 'BelaFarmaInventoryApp/1.0 (contact@belafarma.com.br)' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product && data.product.product_name) {
        console.log("SUCCESS (Beauty):", data.product.product_name);
        return;
      }
    }
  } catch (err) {
    console.error("Beauty err:", err.message);
  }

  console.log("Product not found in Open Facts databases.");
}

// Teste com Coca-Cola 2L
testOFF('7894900011517');
