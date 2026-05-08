const API_URL = 'http://192.168.1.10:8080';
const INSTANCE_NAME = 'belafarma';
const API_KEY = 'BelafarmaSul2026';
const GROUP_ID = '120363427743006305@g.us';

async function run() {
    // Verificar estado
    console.log('Verificando estado...');
    const stateRes = await fetch(`${API_URL}/instance/connectionState/${INSTANCE_NAME}`, {
        headers: { 'apikey': API_KEY }
    });
    console.log('Estado:', await stateRes.text());

    console.log('\nEnviando mensagem para o grupo...');
    const res = await fetch(`${API_URL}/message/sendText/${INSTANCE_NAME}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
        body: JSON.stringify({
            number: GROUP_ID,
            textMessage: { text: '🤖 *Teste BelaFarma* - Mensagem de teste para o grupo!' }
        })
    });
    console.log('Status:', res.status);
    const body = await res.text();
    console.log('Body:', body);
    
    if (res.status !== 201) {
        console.log('\n❌ FALHOU! Erro provavelmente causado por dessincronização Baileys.');
        console.log('SOLUÇÃO: Envie uma mensagem manualmente no grupo pelo celular e tente novamente.');
    } else {
        console.log('\n✅ SUCESSO! Mensagem enviada para o grupo!');
    }
}

run();
