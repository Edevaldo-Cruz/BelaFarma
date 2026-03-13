const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('./database');
const marketingAgent = require('./services/marketing-agent.service');

async function simulate() {
    console.log('\n--- 🧪 SIMULAÇÃO LOCAL: BELINHA IA ---');
    
    // 1. GERAÇÃO DE ANÁLISE
    console.log('\n[PASSO 1] Belinha lendo relatórios e gerando sugestões para Nayane...');
    const phone = process.env.NAYANE_WHATSAPP || '+5532988634755';
    const message = await marketingAgent.analisarProdutosParados90Dias(db, phone);
    
    console.log('\n📢 MENSAGEM QUE NAYANE RECEBE NO WHATSAPP:');
    console.log('--------------------------------------------------');
    console.log(message);
    console.log('--------------------------------------------------');

    // 2. SIMULAR RESPOSTA "OK"
    console.log('\n[PASSO 2] Simulando que Nayane respondeu "ok" agora...');
    
    const phoneClean = phone.replace(/\D/g, '');
    const webhookPayload = {
        event: 'messages.upsert',
        data: {
            key: { 
                remoteJid: `${phoneClean}@s.whatsapp.net`, 
                fromMe: false, 
                id: 'SIMULATED_' + Date.now() 
            },
            message: { conversation: 'ok' }
        }
    };

    try {
        const response = await fetch('http://localhost:3001/api/webhook/evolution', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
        });
        const status = await response.text();
        console.log(`Resposta do Webhook: ${status}`);
    } catch (err) {
        console.error('Erro ao chamar webhook:', err.message);
        console.log('Certifique-se que o servidor (npm run dev) está rodando na porta 3001!');
        return;
    }

    // 3. VERIFICAÇÃO FINAL
    console.log('\n[PASSO 3] Verificando se as tarefas foram criadas no banco de dados...');
    setTimeout(() => {
        const tasks = db.prepare("SELECT title, description FROM tasks WHERE creator = 'Belinha (IA)' ORDER BY creationDate DESC LIMIT 5").all();
        
        if (tasks.length > 0) {
            console.log(`✅ SUCESSO! ${tasks.length} novas tarefas encontradas:`);
            tasks.forEach((t, i) => {
                console.log(`${i+1}. ${t.title}`);
            });
            console.log('\nSimulação concluída com sucesso! Agora você pode ver estas tarefas na página de Tarefas do sistema.');
        } else {
            console.log('❌ As tarefas não foram encontradas. Verifique os logs do servidor.');
        }
        process.exit(0);
    }, 1000);
}

simulate();
