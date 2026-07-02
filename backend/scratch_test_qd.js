const fetch = require('node-fetch');

async function testPBR(ean) {
  const url = `http://produtos-br.com/gtin/${ean}`;
  console.log(`Fetching ${url}...`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    console.log("Status:", res.status);
    if (!res.ok) {
      console.log("Failed. Status:", res.status);
      return;
    }
    const html = await res.text();
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      console.log("Title:", titleMatch[1].trim());
    }
    
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      console.log("H1:", h1Match[1].trim());
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testPBR('7894900011517');
