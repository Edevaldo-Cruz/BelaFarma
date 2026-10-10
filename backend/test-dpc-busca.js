const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function testarEANDPC(ean = '7891010087722') {
  console.log(`--- Testando Busca de EAN na DPC: ${ean} ---`);
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    console.log('Login DPC...');
    await page.goto('https://cliente.dpcnet.com.br/?redirect=https%3A%2F%2Fdpcnet.com.br%2F', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    await page.waitForSelector('input#email', { timeout: 15000 });
    await page.type('input#email', '47378578000140', { delay: 15 });
    await page.type('input#password', 'Primus2022@', { delay: 15 });

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 })
    ]);

    // Navega diretamente para a URL de catálogo com o EAN
    const urlBusca = `https://dpcnet.com.br/catalogo?busca=${ean}&visualizacao=bloco-1&ordenacao=ordem-0`;
    console.log(`Navegando para busca do EAN: ${urlBusca}`);
    await page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 30000 });

    await new Promise(r => setTimeout(r, 4000));

    await page.screenshot({ path: path.resolve('dpc-busca-ean.png') });
    console.log('Screenshot salvo em dpc-busca-ean.png');

    // Extrai o produto e preço
    const resultado = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      if (bodyText.includes('Nenhum resultado encontrado') || bodyText.includes('Foram encontrados 0 produtos')) {
        return { encontrado: false, motivo: 'SEM_RESULTADOS' };
      }

      // Procura preços R$ na área principal
      const precos = Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const t = el.innerText || '';
          return t.startsWith('R$') && el.children.length === 0;
        })
        .map(el => el.innerText.trim());

      // Procura títulos dos cards
      const titulos = Array.from(document.querySelectorAll('h2, h3, h4, p, a'))
        .filter(el => {
          const t = el.innerText || '';
          return t.length > 5 && t.length < 120 && (t.toLowerCase().includes('carefree') || t.toLowerCase().includes('protetor') || t.toLowerCase().includes('absorvente'));
        })
        .map(el => el.innerText.trim());

      return {
        encontrado: precos.length > 0,
        precos,
        titulos: Array.from(new Set(titulos)).slice(0, 5)
      };
    });

    console.log('Resultado da busca por EAN:', JSON.stringify(resultado, null, 2));

  } catch (err) {
    console.error('Erro:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

testarEANDPC('7891010087722');
