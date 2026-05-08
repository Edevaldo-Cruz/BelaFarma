const API_URL = 'http://192.168.1.10:8080';
const INSTANCE_NAME = 'belafarma';
const API_KEY = 'BelafarmaSul2026';
const GROUP_ID = '120363427743006305@g.us';

async function run() {
    // Teste: Primeiro, enviar uma mensagem pessoal PARA o número que é dono do grupo
    // O dono é 225958246252649@lid, mas isso é Linked ID. O owner do WhatsApp provavelmente é 553299058008
    // Que é o mesmo número conectado na API (Laísa Tech)

    // CRUCIAL: Vamos ver qual versão exata da API está rodando
    console.log('=== INFO DA API ===');
    try {
        const res = await fetch(`${API_URL}/`, { headers: { 'apikey': API_KEY } });
        console.log('Status:', res.status);
        console.log('Body:', await res.text());
    } catch (err) { console.error(err.message); }

    // Testar com todas as variações possíveis do número do grupo
    const groupVariations = [
        GROUP_ID,                               // 120363427743006305@g.us
        GROUP_ID.replace('@g.us', ''),           // 120363427743006305
        '55' + GROUP_ID,                         // 55120363427743006305@g.us - improvável
    ];

    for (const gid of groupVariations) {
        console.log(`\n=== Testando com: ${gid} ===`);
        try {
            const res = await fetch(`${API_URL}/message/sendText/${INSTANCE_NAME}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
                body: JSON.stringify({
                    number: gid,
                    textMessage: { text: `🤖 Teste: ${gid}` }
                })
            });
            console.log('Status:', res.status, '- Body:', await res.text());
        } catch (err) { console.error('Erro:', err.message); }
    }
}

run();
