

const EVOLUTION_URL = 'http://192.168.1.70:8080';
const EVOLUTION_API_KEY = 'BelafarmaSul2026';
const INSTANCE = 'belaFarma';

async function checkStatus() {
  console.log(`Buscando status da instância ${INSTANCE}...`);
  try {
    const response = await fetch(`${EVOLUTION_URL}/instance/connectionState/${INSTANCE}`, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY
      }
    });

    console.log('Status da Resposta:', response.status);
    const data = await response.json();
    console.log('Dados de Conexão:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Erro ao conectar à Evolution API:', err.message);
  }
}

checkStatus();
