import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function testarBuscaEANValido(ean = '7896241225523') {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    await page.goto('https://pedido.profarma.com.br/?callbackUrl=%2Fnovo-pedido', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    await page.waitForSelector('input#email', { timeout: 15000 });
    await page.type('input#email', '47378578000140', { delay: 15 });
    await page.type('input#password', 'Primusdrogaria2022@', { delay: 15 });
    await page.click('button[type="submit"]');

    const searchInputSel = 'input[placeholder="O que você está buscando?"]';
    await page.waitForSelector(searchInputSel, { timeout: 30000 });

    console.log(`Buscando EAN válido: ${ean}...`);
    await page.focus(searchInputSel);
    await page.type(searchInputSel, ean, { delay: 30 });

    // Clica na lupa verde
    await page.evaluate((sel) => {
      const input = document.querySelector(sel);
      const container = input.closest('div').parentElement;
      const buttons = Array.from(container.querySelectorAll('button'));
      if (buttons.length > 0) buttons[0].click();
    }, searchInputSel);

    console.log('Aguardando carregamento...');
    await page.waitForFunction(() => !document.body.innerText.includes('Carregando produtos'), {
      timeout: 25000
    }).catch(e => console.log('Timeout aguardando...'));

    await new Promise(r => setTimeout(r, 2000));

    await page.screenshot({ path: path.resolve('profarma-resultado-valido.png') });
    console.log('Screenshot salvo em profarma-resultado-valido.png');

    // Extrai os dados do produto encontrado
    const resultado = await page.evaluate(() => {
      // Como vimos no cabeçalho:
      // Tag, EAN, Descrição / Nome, Quantidade, Preço Final, Desc %, Preço Fabr., Repasse %, ST R$, PMC R$, Cx. Emb., Fornecedor, Categoria, Importado
      const textoCompleto = document.body.innerText;
      
      // Procura linha da tabela ou blocos
      const linhasTabela = Array.from(document.querySelectorAll('div, tr'))
        .filter(el => {
          const t = el.innerText || '';
          return t.includes('7896241225523') && t.includes('29,82');
        });

      return {
        temProdutoNaTela: textoCompleto.includes('7896241225523'),
        amostraLinha: linhasTabela.length > 0 ? linhasTabela[0].innerText : 'Não encontrou container específico'
      };
    });

    console.log('Resultado da busca por EAN válido:', JSON.stringify(resultado, null, 2));

  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    if (browser) await browser.close();
  }
}

testarBuscaEANValido('7896241225523');
