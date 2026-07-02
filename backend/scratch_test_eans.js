const fetch = require('node-fetch');

async function testEAN(ean) {
  const url = `https://www.ean-search.org/?q=${ean}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    console.log("Length of HTML:", html.length);
    
    // Procura por ocorrências de Coca-Cola ou similar
    const containsCoca = html.toLowerCase().includes('coca');
    console.log("Contains 'coca':", containsCoca);
    
    // Vamos imprimir as linhas que contêm texto em tabelas ou listas
    const lines = html.split('\n');
    lines.forEach(l => {
      if (l.includes('Coca') || l.includes('7894900011517') || l.includes('coca-cola') || l.includes('class="product"')) {
        console.log("Match:", l.trim());
      }
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testEAN('7894900011517');
