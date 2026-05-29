const fetch = require('node-fetch');
const fs = require('fs');

async function test() {
  const url = 'http://192.168.1.70:8080/message/sendStatus/belaFarma';
  const apikey = 'BelafarmaSul2026';
  const imgPath = 'f:/Documentos/Desenvolvimento/BelaFarma/backend/public/uploads/1779567542457-170992231.jpeg';
  const base64 = fs.readFileSync(imgPath).toString('base64');
  const dataUri = `data:image/jpeg;base64,${base64}`;

  const payloads = [
    // 1. type: "image", content: dataUri
    { statusMessage: { type: "image", content: dataUri, caption: "Teste 1", allContacts: true } },
    // 2. type: "image", content: raw base64
    { statusMessage: { type: "image", content: base64, caption: "Teste 2", allContacts: true } },
    // 3. no type, image object?
    { statusMessage: { image: { url: dataUri }, caption: "Teste 3", allContacts: true } }
  ];

  for (let i = 0; i < payloads.length; i++) {
    console.log(`Testando payload ${i + 1}...`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apikey },
        body: JSON.stringify(payloads[i])
      });
      const txt = await res.text();
      console.log(`Resposta ${i + 1}: ${res.status} - ${txt.substring(0, 200)}`);
      await new Promise(r => setTimeout(r, 2000));
    } catch(e) { console.error(e); }
  }
}
test();
