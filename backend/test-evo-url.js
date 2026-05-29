const fetch = require('node-fetch');

async function test() {
  const url = 'http://192.168.1.70:8080/message/sendStatus/belaFarma';
  const apikey = 'BelafarmaSul2026';
  
  // URL to a known valid image on the internet just to test the Evolution API
  const imgUrl = 'https://picsum.photos/400/400';

  const payloads = [
    { statusMessage: { type: "image", content: imgUrl, caption: "Teste URL externa", allContacts: true } }
  ];

  for (let i = 0; i < payloads.length; i++) {
    console.log(`Testando payload URL...`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apikey },
        body: JSON.stringify(payloads[i])
      });
      const txt = await res.text();
      console.log(`Resposta: ${res.status} - ${txt.substring(0, 200)}`);
    } catch(e) { console.error(e); }
  }
}
test();
