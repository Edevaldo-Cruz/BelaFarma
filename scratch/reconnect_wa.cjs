const API_URL = 'http://192.168.1.10:8080';
const INSTANCE_NAME = 'belafarma';
const API_KEY = 'BelafarmaSul2026';
const GROUP_ID = '120363427743006305@g.us';

async function run() {
    // Passo 1: Desconectar
    console.log('=== Desconectando instância ===');
    try {
        const res = await fetch(`${API_URL}/instance/logout/${INSTANCE_NAME}`, {
            method: 'DELETE',
            headers: { 'apikey': API_KEY }
        });
        console.log('Logout:', res.status, await res.text());
    } catch (err) { console.error(err.message); }

    console.log('Aguardando 5s...');
    await new Promise(r => setTimeout(r, 5000));

    // Passo 2: Reconectar (pedir QR code)
    console.log('\n=== Solicitando reconexão ===');
    try {
        const res = await fetch(`${API_URL}/instance/connect/${INSTANCE_NAME}`, {
            headers: { 'apikey': API_KEY }
        });
        const data = await res.json();
        console.log('Connect status:', res.status);
        
        if (data.base64) {
            console.log('\n⚠️  QR CODE GERADO!');
            console.log('Abra http://192.168.1.10:8080/manager para escanear o QR code.');
            console.log('Ou use o código de pareamento abaixo se disponível:');
        }
        if (data.pairingCode) {
            console.log('📱 CÓDIGO DE PAREAMENTO:', data.pairingCode);
        }
        console.log('Dados:', JSON.stringify(data, null, 2).substring(0, 500));
    } catch (err) { console.error(err.message); }
}

run();
