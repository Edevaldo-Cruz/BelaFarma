const API_URL = 'http://192.168.1.10:8080';
const INSTANCE_NAME = 'belafarma';
const API_KEY = 'BelafarmaSul2026';
const GROUP_ID = '120363427743006305@g.us';

async function waitForConnection() {
    for (let i = 0; i < 12; i++) {
        try {
            const res = await fetch(`${API_URL}/instance/connectionState/${INSTANCE_NAME}`, {
                headers: { 'apikey': API_KEY }
            });
            const data = await res.json();
            console.log(`Tentativa ${i+1}: ${data.instance?.state}`);
            if (data.instance?.state === 'open') return true;
        } catch (err) { console.log(`Tentativa ${i+1}: erro - ${err.message}`); }
        await new Promise(r => setTimeout(r, 5000));
    }
    return false;
}

async function run() {
    console.log('Aguardando instância ficar online...');
    const connected = await waitForConnection();
    
    if (!connected) {
        console.log('❌ Instância não reconectou a tempo!');
        return;
    }
    
    console.log('✅ Instância online! Enviando para grupo...');
    
    // Aguardar mais 5s para sincronização completa
    await new Promise(r => setTimeout(r, 5000));
    
    try {
        const res = await fetch(`${API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
            body: JSON.stringify({
                number: GROUP_ID,
                textMessage: { text: '🤖 *Teste BelaFarma* - Após restart e sync completo!' }
            })
        });
        console.log('Status:', res.status);
        console.log('Body:', await res.text());
    } catch (err) { console.error('Erro:', err.message); }
}

run();
