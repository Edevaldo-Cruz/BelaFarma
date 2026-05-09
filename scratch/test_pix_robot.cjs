async function testWebhook() {
    console.log('🚀 Iniciando teste de simulação do Robô de PIX...');
    
    const payload = {
        event: 'messages.upsert',
        instance: 'belafarma',
        data: {
            key: {
                remoteJid: '5532999999999@s.whatsapp.net',
                fromMe: false,
                id: 'TEST_PIX_' + Date.now()
            },
            message: {
                imageMessage: {
                    caption: 'Segue o comprovante'
                }
            },
            pushName: 'Cliente Teste'
        }
    };

    try {
        const res = await fetch('http://192.168.1.10:3001/api/webhook/evolution', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        console.log('Status do Webhook:', res.status);
        console.log('Robô acionado com sucesso!');
    } catch (err) {
        console.error('Erro ao testar webhook:', err.message);
    }
}

testWebhook();
