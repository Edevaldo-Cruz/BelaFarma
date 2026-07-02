const fetch = require('node-fetch');

async function testCosmos(ean) {
  const url = `https://cosmos.bluesoft.com.br/produtos/${ean}`;
  console.log(`Fetching ${url}...`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      console.log(`Failed to fetch. Status: ${res.status}`);
      return;
    }
    const html = await res.text();
    
    // Tenta capturar o nome do produto no título ou nos cabeçalhos
    // O título do Cosmos costuma ser: "<Nome do Produto> - Código de Barras <EAN> - Cosmos"
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      console.log("Title found:", title);
      
      // Remover sufixo do Cosmos
      const name = title.split(' - Código de Barras')[0].trim();
      console.log("Extracted Product Name:", name);
    } else {
      console.log("No title found in HTML.");
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testCosmos('7899095201255');
