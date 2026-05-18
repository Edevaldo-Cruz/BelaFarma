const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';
const INSTANCE_NAME = 'belaFarma'; // Trying belaFarma instead of belaAtende
const GROUP_JID = '120363427743006305@g.us';

async function run() {
    console.log(`Sending test message to group: ${GROUP_JID} using instance: ${INSTANCE_NAME}...`);
    try {
        const url = `${API_URL}/message/sendText/${INSTANCE_NAME}`;
        const body = {
            number: GROUP_JID,
            textMessage: {
                text: `🤖 *Teste Antigravity (BelaFarma)*\nEnviando mensagem diretamente para o grupo via Evolution API (instância belaFarma).\nHorário: ${new Date().toLocaleTimeString('pt-BR')}`
            },
            options: {
                delay: 1000,
                presence: 'composing'
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': API_KEY
            },
            body: JSON.stringify(body)
        });

        console.log('Response Status:', res.status);
        const text = await res.text();
        console.log('Response Body:', text);
    } catch (e) {
        console.error('Error sending message:', e.message);
    }
}

run();
