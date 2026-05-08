const API_URL = 'http://192.168.1.10:8080';
const INSTANCE_NAME = 'belafarma';
const API_KEY = 'BelafarmaSul2026';
const GROUP_ID = '120363427743006305@g.us';

async function run() {
    // Verificar versão
    console.log('=== Versão da API ===');
    let res = await fetch(`${API_URL}/`);
    console.log(await res.text());

    // Verificar estado
    console.log('\n=== Estado ===');
    res = await fetch(`${API_URL}/instance/connectionState/${INSTANCE_NAME}`, {
        headers: { 'apikey': API_KEY }
    });
    console.log(await res.text());

    // Teste v2 formato: { number, text }
    console.log('\n=== Teste formato v2: { number, text } ===');
    res = await fetch(`${API_URL}/message/sendText/${INSTANCE_NAME}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
        body: JSON.stringify({
            number: GROUP_ID,
            text: '🤖 Teste v2 - formato { number, text }'
        })
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.text());

    // Se falhou, testar formato v1 para comparar
    console.log('\n=== Teste formato v1: { number, textMessage: { text } } ===');
    res = await fetch(`${API_URL}/message/sendText/${INSTANCE_NAME}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
        body: JSON.stringify({
            number: GROUP_ID,
            textMessage: { text: '🤖 Teste v1 - formato { textMessage }' }
        })
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
}

run();
