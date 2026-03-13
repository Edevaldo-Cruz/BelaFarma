const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('./database');
const marketingAgent = require('./services/marketing-agent.service');
const sender = require('./services/message-sender.service');

async function test() {
    console.log('--- TESTE BELINHA: ANÁLISE DE PRODUTOS ---');
    console.log('1. Iniciando análise de venda parada (90 dias)...');
    
    // Pegar telefone da Nayane
    const phone = process.env.NAYANE_WHATSAPP || process.env.ADMIN_WHATSAPP;
    console.log(`Destinatário: ${phone}`);

    try {
        const analise = await marketingAgent.analisarProdutosParados90Dias(db, phone);
        
        if (analise) {
            console.log('\n2. Mensagem gerada com sucesso pela Belinha:');
            console.log('--------------------------------------------------');
            console.log(analise);
            console.log('--------------------------------------------------');
            
            console.log('\n3. Simulando envio para WhatsApp...');
            const result = await sender.sendMessage(phone, analise);
            
            if (result.success) {
                console.log('✅ Mensagem ENVIADA (ou salva em fallback)!');
                console.log('\n--- PRÓXIMO PASSO ---');
                console.log('Responda com "ok" no WhatsApp para testar a criação de tarefas.');
                console.log('Nota: Certifique-se que o webhook da Evolution API está apontando para o seu servidor.');
            } else {
                console.log('❌ Falha no envio:', result.error);
            }
        } else {
            console.log('⚠️ Nenhuma análise gerada (verifique os PDFs em reports/digifarma).');
        }
    } catch (e) {
        console.error('❌ Erro durante o teste:', e);
    }
}

test();
