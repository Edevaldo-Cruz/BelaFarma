const PixBotService = require('./services/pix-bot.service');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Inicializa o banco de dados para o teste
const config = require('./config.js');
const dbPath = config.dbPath;
const db = new Database(dbPath);

const pixBot = new PixBotService(db);

async function runTest() {
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.log('❌ Erro: Forneça o caminho de uma imagem de comprovante.');
    console.log('Uso: node test-pix-bot-manual.js ./caminho/para/imagem.jpg');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.log(`❌ Erro: Arquivo não encontrado em ${imagePath}`);
    process.exit(1);
  }

  console.log(`🚀 Iniciando teste do Robô de PIX com a imagem: ${imagePath}`);
  
  try {
    // 1. Ler imagem e converter para Base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString('base64');
    
    // 2. Simular o processamento da imagem (pulando o download da Evolution API)
    console.log('🤖 Enviando para análise da IA (GPT/Gemini)...');
    
    // Mock do messageData para simular o que vem do WhatsApp
    const phone = '5532999999999';
    const messageId = `TEST_${Date.now()}`;
    
    // Sobrescrever temporariamente o método de download para usar o nosso base64 local
    pixBot.getBase64FromEvolution = async () => base64;
    
    await pixBot.handleImageMessage({ key: { id: messageId } }, phone);
    
    console.log('\n✅ Teste finalizado! Verifique as mensagens acima para ver o resultado da IA.');
    console.log('Se a IA aprovou, um lançamento foi criado no "Pix Direto" de hoje no sistema.');

  } catch (err) {
    console.error('💥 Erro durante o teste:', err);
  } finally {
    db.close();
  }
}

runTest();
