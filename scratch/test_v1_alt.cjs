const API_URL = 'http://192.168.1.10:8080';
const INSTANCE_NAME = 'belafarma';
const API_KEY = 'BelafarmaSul2026';
const GROUP_ID = '120363427743006305@g.us';

async function run() {
    console.log('--- TESTE DE ALTERNATIVAS (v1.8.2) ---');

    // Teste 1: Endpoint /group/sendMessage
    console.log('\n1. Testando /group/sendMessage...');
    try {
        const res = await fetch(`${API_URL}/group/sendMessage/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
            body: JSON.stringify({
                number: GROUP_ID,
                textMessage: { text: '🤖 Teste via /group/sendMessage' }
            })
        });
        console.log('Status:', res.status, await res.text());
    } catch (e) { console.log('Erro 1:', e.message); }

    // Teste 2: sendText com formato simplificado (algumas builds 1.8 aceitam)
    console.log('\n2. Testando sendText simplificado...');
    try {
        const res = await fetch(`${API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
            body: JSON.stringify({
                number: GROUP_ID,
                text: '🤖 Teste via sendText simplificado'
            })
        });
        console.log('Status:', res.status, await res.text());
    } catch (e) { console.log('Erro 2:', e.message); }

    // Teste 3: Mencionando o próprio ID no grupo (força sync)
    console.log('\n3. Testando menção (force sync)...');
    try {
        const res = await fetch(`${API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
            body: JSON.stringify({
                number: GROUP_ID,
                textMessage: { 
                    text: '🤖 Teste com menção @553299058008',
                    mentions: ['553299058008@s.whatsapp.net']
                }
            })
        });
        console.log('Status:', res.status, await res.text());
    } catch (e) { console.log('Erro 3:', e.message); }
}

run();
