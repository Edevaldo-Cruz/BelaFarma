const fetch = require('node-fetch');

async function lookupEanInChain(ean) {
  console.log(`Starting chain lookup for EAN: ${ean}`);

  // 1. Tenta Consulta Remédios
  console.log("Checking Consulta Remédios...");
  try {
    const targetUrl = `https://consultaremedios.com.br/busca?termo=${encodeURIComponent(ean)}`;
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    if (response.ok) {
      const html = await response.text();
      const h2Match = html.match(/<h2[^>]*class="[^"]*(?:font-medium|product|title)[^"]*"[^>]*>([\s\S]*?)<\/h2>/i) 
                   || html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      if (h2Match) {
        const productName = h2Match[1].replace(/<[^>]+>/g, '').trim();
        console.log("-> FOUND in Consulta Remédios:", productName);
        return productName;
      }
    }
  } catch (err) {
    console.error("Consulta Remédios error:", err.message);
  }

  // 2. Tenta Open Food Facts (Alimentos, Bebidas, Doces)
  console.log("Checking Open Food Facts...");
  try {
    const urlFood = `https://world.openfoodfacts.org/api/v0/product/${ean}.json`;
    const res = await fetch(urlFood, {
      headers: { 'User-Agent': 'BelaFarmaInventoryApp/1.0 (contact@belafarma.com.br)' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product && data.product.product_name) {
        let name = data.product.product_name;
        if (data.product.brands) {
          name = `${name} (${data.product.brands})`;
        }
        console.log("-> FOUND in Open Food Facts:", name);
        return name;
      }
    }
  } catch (err) {
    console.error("Open Food Facts error:", err.message);
  }

  // 3. Tenta Open Beauty Facts (Higiene, Perfumaria, Beleza)
  console.log("Checking Open Beauty Facts...");
  try {
    const urlBeauty = `https://world.openbeautyfacts.org/api/v0/product/${ean}.json`;
    const res = await fetch(urlBeauty, {
      headers: { 'User-Agent': 'BelaFarmaInventoryApp/1.0 (contact@belafarma.com.br)' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product && data.product.product_name) {
        let name = data.product.product_name;
        if (data.product.brands) {
          name = `${name} (${data.product.brands})`;
        }
        console.log("-> FOUND in Open Beauty Facts:", name);
        return name;
      }
    }
  } catch (err) {
    console.error("Open Beauty Facts error:", err.message);
  }

  console.log("-> NOT FOUND in any source.");
  return null;
}

async function runTests() {
  console.log("--- TEST 1: Medicine ---");
  await lookupEanInChain('7899095201255'); // Flexalgin
  
  console.log("\n--- TEST 2: Soda ---");
  await lookupEanInChain('7894900011517'); // Coca-Cola 2L
}

runTests();
