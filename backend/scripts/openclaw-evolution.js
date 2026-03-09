#!/usr/bin/env node

const url = "http://localhost:8080";
const instance = "belafarma";
const apikey = "BelafarmaSul2026";

const [,, phone, ...messageParts] = process.argv;

if (!phone || messageParts.length === 0) {
  console.log("Uso: node openclaw-evolution.js <numero_com_ddd> <mensagem...>");
  process.exit(1);
}

const message = messageParts.join(" ");

fetch(`${url}/message/sendText/${instance}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': apikey
  },
  body: JSON.stringify({
    number: phone.replace(/\D/g, ''),
    textMessage: { text: message },
    options: { delay: 1200, presence: "composing" }
  })
}).then(async res => {
  const json = await res.json();
  if (res.ok) console.log("OK:", json?.key?.id);
  else console.error("Erro:", json);
}).catch(console.error);
