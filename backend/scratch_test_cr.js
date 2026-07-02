const fetch = require('node-fetch');

async function testCR(ean) {
  const url = `https://consultaremedios.com.br/busca?termo=${ean}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    
    // Tenta obter o primeiro h2 que costuma ser o título do produto
    const h2Match = html.match(/<h2[^>]*class="[^"]*(?:font-medium|product|title)[^"]*"[^>]*>([\s\S]*?)<\/h2>/i) 
                 || html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
                 
    if (h2Match) {
      const productName = h2Match[1].replace(/<[^>]+>/g, '').trim();
      console.log("SUCCESS! Extracted Product Name:", productName);
    } else {
      console.log("No h2 found.");
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testCR('7899095201255');
