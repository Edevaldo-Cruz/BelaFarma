const API_URL = 'http://192.168.1.10:8080';
const INSTANCE_NAME = 'belafarma';
const API_KEY = 'BelafarmaSul2026';
const GROUP_ID = '120363427743006305@g.us';

async function run() {
    // Passo 1: Reiniciar a instância (restart)
    console.log('=== PASSO 1: Reiniciar instância ===');
    try {
        const res = await fetch(`${API_URL}/instance/restart/${INSTANCE_NAME}`, {
            method: 'PUT',
            headers: { 'apikey': API_KEY }
        });
        console.log('Restart Status:', res.status, await res.text());
    } catch (err) { console.error('Erro:', err.message); }

    // Aguardar 10 segundos para a instância reiniciar
    console.log('\nAguardando 10 segundos para a instância reiniciar...');
    await new Promise(r => setTimeout(r, 10000));

    // Passo 2: Verificar se voltou
    console.log('\n=== PASSO 2: Verificar estado ===');
    try {
        const res = await fetch(`${API_URL}/instance/connectionState/${INSTANCE_NAME}`, {
            headers: { 'apikey': API_KEY }
        });
        console.log('connectionState Status:', res.status, await res.text());
    } catch (err) { console.error('Erro:', err.message); }

    // Passo 3: Tentar enviar para o grupo
    console.log('\n=== PASSO 3: Enviar para grupo ===');
    try {
        const res = await fetch(`${API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
            body: JSON.stringify({
                number: GROUP_ID,
                textMessage: { text: '🤖 *Teste após restart* - BelaFarma Grupos' }
            })
        });
        console.log('sendText Status:', res.status);
        console.log('Body:', await res.text());
    } catch (err) { console.error('Erro:', err.message); }
}

run();
