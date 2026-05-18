const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function pairVisual() {
  console.log('=============================================');
  console.log('🤖 INICIANDO PAREAMENTO VISUAL DO WHATSAPP RPA');
  console.log('=============================================');

  // Define a pasta de sessão correta que o Docker também usa
  const sessionPath = path.join(__dirname, '..', 'data', 'whatsapp-session-rpa');
  console.log(`📂 Salvando sessão em: ${sessionPath}`);

  // Limpa travas antigas de forma robusta
  const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  for (const lockFile of lockFiles) {
    const lockFilePath = path.join(sessionPath, lockFile);
    try {
      fs.unlinkSync(lockFilePath);
      console.log(`♻️ Trava ${lockFile} limpa.`);
    } catch (e) {}
  }

  console.log('🌐 Abrindo Chromium visível na tela...');
  console.log('⏳ Por favor, escaneie o QR Code na janela do navegador que se abriu.');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      userDataDir: sessionPath,
      defaultViewport: null,
      args: ['--start-maximized', '--no-sandbox']
    });
  } catch (err) {
    console.error('❌ Erro ao lançar o browser:', err.message);
    console.log('Tentando lançar sem flags extras...');
    browser = await puppeteer.launch({
      headless: false,
      userDataDir: sessionPath
    });
  }

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  await page.goto('https://web.whatsapp.com');

  console.log('\n=============================================');
  console.log('📲 ESCANEIE O QR CODE NO SEU CELULAR!');
  console.log('⌨️  Após logar com sucesso e carregar as conversas,');
  console.log('   volte aqui neste terminal e aperte [ENTER] para fechar o navegador.');
  console.log('=============================================');

  // Aguarda o usuário apertar ENTER no terminal
  await new Promise(resolve => {
    process.stdin.once('data', () => {
      resolve();
    });
  });

  console.log('💾 Salvando sessão e fechando navegador...');
  await browser.close();
  console.log('✅ Concluído! O robô agora está pareado e o Docker usará a mesma sessão.');
  process.exit(0);
}

pairVisual().catch(err => {
  console.error('❌ Ocorreu um erro:', err);
  process.exit(1);
});
