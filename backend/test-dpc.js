const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function testarLoginEImportarDPC() {
  console.log('--- Testando Login Real e Telas da DPC Distribuidora ---');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    console.log('Acessando tela de login da DPC...');
    await page.goto('https://cliente.dpcnet.com.br/?redirect=https%3A%2F%2Fdpcnet.com.br%2F', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    console.log('Preenchendo credenciais...');
    await page.waitForSelector('input#email', { timeout: 15000 });
    await page.type('input#email', '47378578000140', { delay: 20 });
    await page.type('input#password', 'Primus2022@', { delay: 20 });

    console.log('Submetendo login...');
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }).catch(e => console.log('Aguardando redirecionamento...', e.message))
    ]);

    await new Promise(r => setTimeout(r, 5000));

    console.log('URL após login na DPC:', page.url());
    console.log('Título:', await page.title());

    // Screenshot da home logada da DPC
    const screenshotHome = path.resolve('dpc-home-pos-login.png');
    await page.screenshot({ path: screenshotHome });
    console.log('Screenshot salvo em:', screenshotHome);

    // Agora navega para a tela de importar carrinho indicada pelo usuário
    console.log('Navegando para https://dpcnet.com.br/minha-conta/carrinhos-salvos/importar-carrinho...');
    await page.goto('https://dpcnet.com.br/minha-conta/carrinhos-salvos/importar-carrinho', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    await new Promise(r => setTimeout(r, 4000));

    const screenshotImport = path.resolve('dpc-tela-importar-carrinho.png');
    await page.screenshot({ path: screenshotImport });
    console.log('Screenshot de importar carrinho salvo em:', screenshotImport);

    // Inspeciona os inputs e botões da tela de importação
    const elementosImport = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        accept: i.accept
      }));

      const buttons = Array.from(document.querySelectorAll('button, a')).map(b => ({
        tag: b.tagName,
        texto: (b.innerText || '').trim(),
        href: b.href
      })).filter(b => b.texto.length > 2 && b.texto.length < 50);

      return {
        inputs,
        buttons: buttons.slice(0, 20),
        bodySnippet: document.body.innerText.substring(0, 600)
      };
    });

    console.log('Elementos da tela de importar carrinho:', JSON.stringify(elementosImport, null, 2));

  } catch (err) {
    console.error('Erro na DPC:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

testarLoginEImportarDPC();
