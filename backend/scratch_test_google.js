const fetch = require('node-fetch');

async function testGoogle(ean) {
  const url = `https://www.google.com/search?q=${ean}`;
  console.log(`Fetching ${url}...`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    console.log("Status:", res.status);
    if (!res.ok) {
      console.log("Failed. Status:", res.status);
      return;
    }
    const html = await res.text();
    console.log("HTML length:", html.length);
    
    // Tenta ver se acha referências a Coca-Cola ou similar
    const containsCoca = html.toLowerCase().includes('coca');
    console.log("Contains 'coca':", containsCoca);
    
    // Vamos salvar as primeiras 1000 linhas num arquivo scratch
    const fs = require('fs');
    fs.writeFileSync('google_response.html', html);
    console.log("Saved google_response.html");
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testGoogle('7894900011517');
