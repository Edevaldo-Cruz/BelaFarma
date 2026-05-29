const fetch = require('node-fetch');

async function test() {
  const url = 'http://192.168.1.70:8080/message/sendStatus/belaFarma';
  const apikey = 'BelafarmaSul2026';

  const payloads = [
    { type: "text", content: "Teste 1 (direto)", backgroundColor: "#000000", font: 1, allContacts: true },
    { statusMessage: { type: "text", content: "Teste 2 (wrapper)", backgroundColor: "#000000", font: 1, allContacts: true } }
  ];

  for (let i = 0; i < payloads.length; i++) {
    console.log(`Testando payload ${i + 1}...`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': apikey },
      body: JSON.stringify(payloads[i])
    });
    const txt = await res.text();
    console.log(`Resposta ${i + 1}: ${res.status} - ${txt}`);
  }
}
test();
