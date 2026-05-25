const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function detectSelectors() {
  console.log('🤖 Iniciando Diagnóstico de Seletores do WhatsApp Web...');
  
  const chromeSessionDir = path.resolve(__dirname, '../whatsapp-session-rpa');
  
  const launchOptions = {
    headless: false,
    userDataDir: chromeSessionDir,
    defaultViewport: null,
    args: ['--start-maximized']
  };

  // Autodetecta o Google Chrome no Windows
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
  ];
  for (const p of paths) {
    if (p && fs.existsSync(p)) {
      launchOptions.executablePath = p;
      break;
    }
  }

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log('🌐 Abrindo WhatsApp Web. Por favor aguarde o carregamento completo...');
  await page.goto('https://web.whatsapp.com');

  // Espera carregar e estar logado
  console.log('⏳ Aguardando 15 segundos para carregar e logar...');
  await new Promise(r => setTimeout(r, 15000));

  console.log('🔍 Pesquisando e abrindo o grupo "Marketing" para ativar a barra de conversa...');
  try {
    // Abre a busca de chats (Ctrl + Alt + /)
    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await page.keyboard.press('/');
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 1000));

    // Digita "Marketing"
    await page.keyboard.type('Marketing', { delay: 100 });
    await new Promise(r => setTimeout(r, 3000));

    // Localiza e clica no grupo correspondente na lista
    const chatRect = await page.evaluate((nome) => {
      const spans = Array.from(document.querySelectorAll('span'));
      const chat = spans.find(s => s.title === nome || s.innerText === nome);
      if (chat) {
        const rect = chat.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
      return null;
    }, 'Marketing');

    if (chatRect) {
      await page.mouse.click(chatRect.x, chatRect.y);
      console.log('🎯 Clique físico realizado com sucesso no grupo "Marketing".');
    } else {
      console.log('⚠️ Grupo não apareceu na lista, tentando ArrowDown + Enter...');
      await page.keyboard.press('ArrowDown');
      await new Promise(r => setTimeout(r, 500));
      await page.keyboard.press('Enter');
    }

    // Espera transição da conversa
    await new Promise(r => setTimeout(r, 3000));

    console.log('🔍 Mapeando elementos da barra de conversa inferior...');
    const elementsInfo = await page.evaluate(() => {
      // Procura pela barra de texto inferior do WhatsApp Web
      const footer = document.querySelector('footer');
      if (!footer) return '❌ Rodapé (footer) do chat não encontrado. Certifique-se de que está com algum chat aberto!';

      // Busca todos os botões, spans e divs interativos dentro do rodapé
      const buttons = Array.from(footer.querySelectorAll('button, div[role="button"], span[data-icon], div[aria-label]'));
      const details = buttons.map((el, i) => {
        const dataIcon = el.getAttribute('data-icon') || el.querySelector('span[data-icon]')?.getAttribute('data-icon');
        const ariaLabel = el.getAttribute('aria-label');
        const testId = el.getAttribute('data-testid');
        const outerHTML = el.outerHTML.slice(0, 150); // Pega apenas o começo do HTML para não lotar
        
        return `#${i + 1} | Tag: ${el.tagName} | Icon: ${dataIcon || 'N/A'} | Label: ${ariaLabel || 'N/A'} | TestId: ${testId || 'N/A'} | HTML: ${outerHTML}`;
      });

      return details.join('\n');
    });

    console.log('\n📊 Elementos Encontrados na Barra de Conversa:');
    console.log(elementsInfo);
  } catch (err) {
    console.error('❌ Erro no evaluate:', err.message);
  }

  console.log('\n✅ Fim do Diagnóstico. Fechando navegador em 5 segundos...');
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
}

detectSelectors();
