const fetch = require('node-fetch');
require('dotenv').config();

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://192.168.1.70:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'belaFarma';

async function setWebhook() {
  console.log(`Configurando webhook para a instância ${INSTANCE}...`);
  try {
    const response = await fetch(`${EVOLUTION_URL}/webhook/set/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        enabled: true,
        url: 'http://backend:3001/api/webhook/evolution',
        byEvents: false,
        base64: true,
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE"
        ]
      })
    });

    const data = await response.json();
    console.log('Resultado:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Erro:', err.message);
  }
}

setWebhook();
