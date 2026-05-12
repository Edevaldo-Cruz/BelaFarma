const puppeteer = require('puppeteer');
const fs = require('fs');

async function testarRPA() {
  // ==============================================================
  // ⚙️ CONFIGURAÇÃO - MUDE AQUI ANTES DE RODAR
  // ==============================================================
  const grupoNome = 'NOME_DO_SEU_GRUPO'; // <-- Exato nome do grupo
  const imagemPath = 'C:\\Users\\Edevaldo\\Downloads\\WhatsApp Image 2026-05-12 at 12.18.56.jpg'; // <-- Caminho da imagem
  const mensagem = '🚀 Olá! Este é um teste do Robô RPA da BelaFarma enviando imagem sozinho!';
  // ==============================================================

  if (!fs.existsSync(imagemPath)) {
    console.error(`❌ IMAGEM NÃO ENCONTRADA: ${imagemPath}`);
    console.log(`Por favor, coloque o caminho de uma imagem que exista no seu PC.`);
    return;
  }

  console.log('🤖 Iniciando Robô RPA do WhatsApp...');
  
  // Abre o Chrome de forma visível
  const browser = await puppeteer.launch({
    headless: false, 
    userDataDir: './whatsapp-session-rpa', // Salva seu login na pasta
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  // Disfarça para o WhatsApp não barrar
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log('🌐 Abrindo WhatsApp Web...');
  await page.goto('https://web.whatsapp.com');

  console.log('⏳ Aguardando login... (Na primeira vez, escaneie o QR Code na tela)');
  
  // Esperar até a barra de pesquisa carregar
  await page.waitForSelector('#side div[contenteditable="true"]', { timeout: 120000 });
  console.log('✅ Login confirmado!');

  // --- BUSCA DO GRUPO ---
  console.log(`🔍 Pesquisando pelo grupo: "${grupoNome}"...`);
  await page.click('#side div[contenteditable="true"]');
  
  // Limpar campo de busca
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');

  // Digita devagar parecendo humano
  await page.keyboard.type(grupoNome, { delay: 100 });
  
  // Esperar o grupo aparecer nos resultados
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('👆 Clicando no grupo...');
  const grupoSelector = `span[title="${grupoNome}"]`;
  await page.waitForSelector(grupoSelector, { timeout: 10000 });
  await page.click(grupoSelector);

  // --- ENVIO DA IMAGEM ---
  console.log('📎 Clicando no botão de Anexar (+)...');
  await new Promise(r => setTimeout(r, 2000));
  
  // Abre o menu de anexos (Layout novo é o 'plus', o antigo era 'clip')
  try {
    await page.waitForSelector('span[data-icon="plus"]', { timeout: 3000 });
    await page.click('span[data-icon="plus"]');
  } catch (e) {
    await page.waitForSelector('span[data-icon="clip"]', { timeout: 3000 });
    await page.click('span[data-icon="clip"]');
  }
  
  await new Promise(r => setTimeout(r, 1000));

  console.log('🖼️ Fazendo upload da imagem direto no input invisível...');
  // O WhatsApp usa um input invisível para Fotos e Vídeos
  const uploadInputSelector = 'input[accept="image/*,video/mp4,video/3gpp,video/quicktime"]';
  await page.waitForSelector(uploadInputSelector);
  
  const fileInput = await page.$(uploadInputSelector);
  await fileInput.uploadFile(imagemPath);

  // Aguardar a tela de pré-visualização carregar
  console.log('✍️ Escrevendo a legenda...');
  await new Promise(r => setTimeout(r, 3000));
  
  // Clica no campo de adicionar legenda
  try {
    // Tenta pelo texto comum no Brasil
    await page.waitForSelector('div[aria-placeholder="Adicione uma legenda"]', { timeout: 5000 });
    await page.click('div[aria-placeholder="Adicione uma legenda"]');
  } catch(e) {
    console.log('⚠️ Aviso: Focando usando tabulação...');
  }
  
  // Digita a legenda da foto
  await page.keyboard.type(mensagem, { delay: 50 });

  console.log('🚀 Apertando Enter para enviar!');
  await new Promise(r => setTimeout(r, 1000));
  
  // Enter para enviar a foto
  await page.keyboard.press('Enter');

  console.log('✅ Tudo feito! Aguardando 5 segundos antes de fechar o robô...');
  await new Promise(r => setTimeout(r, 5000));

  await browser.close();
  console.log('🤖 Teste do Robô Finalizado com Sucesso!');
}

testarRPA().catch(console.error);
