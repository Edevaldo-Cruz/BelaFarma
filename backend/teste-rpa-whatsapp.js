const puppeteer = require('puppeteer');
const fs = require('fs');

async function testarRPA() {
  // ==============================================================
  // ⚙️ CONFIGURAÇÃO - MUDE AQUI ANTES DE RODAR
  // ==============================================================
  const grupoNome = 'Marketing'; // <-- Exato nome do grupo
  const imagemPath = 'C:\\Users\\Edevaldo\\Downloads\\WhatsApp Image 2026-05-12 at 12.18.56.jpeg'; // <-- Caminho da imagem
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

  // Esperar o WhatsApp carregar visualmente (15 segundos garantidos)
  console.log('⏳ Aguardando 15 segundos para o WhatsApp carregar completamente...');
  await new Promise(r => setTimeout(r, 15000));
  
  console.log('✅ Interface assumida como carregada!');

  // --- BUSCA DO GRUPO (ESTRATÉGIA HUMANA) ---
  console.log(`🔍 Focando na pesquisa com atalho de teclado (Ctrl + Alt + /)...`);
  
  // Atalho universal do WhatsApp Web para focar na busca
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press('/');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  
  await new Promise(r => setTimeout(r, 1000));

  console.log(`⌨️ Digitando o nome do grupo: "${grupoNome}"...`);
  // Digita devagar parecendo humano
  await page.keyboard.type(grupoNome, { delay: 150 });
  
  // Esperar a busca filtrar
  console.log('⏳ Aguardando resultados...');
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('👆 Procurando o chat exato na lista e clicando...');
  
  // Calcula a posição (X, Y) exata do elemento na tela
  const chatRect = await page.evaluate((nome) => {
    const spans = Array.from(document.querySelectorAll('span'));
    const chat = spans.find(s => s.title === nome || s.innerText === nome);
    if (chat) {
      const rect = chat.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }
    return null;
  }, grupoNome);

  if (chatRect) {
    // FIM DA BRINCADEIRA: O robô move o mouse invisível e clica exatamente na palavra
    await page.mouse.click(chatRect.x, chatRect.y);
    console.log('✅ Clique físico realizado com sucesso!');
  } else {
    console.log('⚠️ Aviso: Grupo não visível. Tentando atalho...');
    await page.keyboard.press('ArrowDown');
    await new Promise(r => setTimeout(r, 500));
    await page.keyboard.press('Enter');
  }

  // Esperar a tela do chat abrir
  await new Promise(r => setTimeout(r, 2000));

  // --- ENVIO DA IMAGEM (ESTRATÉGIA CTRL+C / CTRL+V) ---
  console.log('📎 Copiando a imagem para a Área de Transferência do Windows...');
  
  try {
    const psCommand = `powershell -command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${imagemPath}'))"`;
    require('child_process').execSync(psCommand);
    console.log('✅ Imagem copiada para a memória!');
  } catch (err) {
    console.error('❌ Erro ao copiar imagem pro Windows:', err.message);
  }

  // Espera 1 segundinho pra garantir que a memória assimilou
  await new Promise(r => setTimeout(r, 1000));

  console.log('📋 Colando (Ctrl+V) no WhatsApp...');
  await page.keyboard.down('Control');
  await page.keyboard.press('V');
  await page.keyboard.up('Control');

  // Aguardar a tela de pré-visualização carregar
  console.log('⏳ Esperando a janela de pré-visualização da foto abrir...');
  await new Promise(r => setTimeout(r, 4000)); 

  console.log('✍️ Escrevendo a legenda...');
  // O WhatsApp foca automaticamente no campo de legenda da foto colada
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
