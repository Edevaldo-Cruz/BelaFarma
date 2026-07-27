const puppeteer = require('puppeteer');
const db = require('../database');
const watcher = require('./watcher.service');

// Estado global simples para monitorar o status do scraping em tempo real
let scrapeStatus = {
  running: false,
  totalItems: 0,
  currentProgress: 0,
  successCount: 0,
  failedCount: 0,
  startTime: null,
  endTime: null,
  lastError: null
};

/**
 * Função utilitária para aguardar um tempo específico (delay)
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retorna o status atual da raspagem
 */
function getScrapeStatus() {
  return scrapeStatus;
}

/**
 * Executa o robô de raspagem na plataforma Napp Solutions.
 * Busca os preços sugeridos (proffer) dos produtos com EAN cadastrados no cache.
 * @param {Array} eans Opcional. Lista específica de EANs para consultar. Se nulo, consulta todos da curva A/B/C.
 */
async function runNappScraper(eans = null) {
  if (scrapeStatus.running) {
    console.warn('[Napp Scraper] Já existe um processo de raspagem em execução.');
    return scrapeStatus;
  }

  const email = process.env.NAPP_EMAIL;
  const password = process.env.NAPP_PASSWORD;
  const loginUrl = process.env.NAPP_LOGIN_URL || 'https://proffer.napp.solutions/login';
  const searchUrl = process.env.NAPP_SEARCH_URL || 'https://proffer.napp.solutions/produtos';

  // Seletores CSS configuráveis por .env
  const emailSelector = process.env.NAPP_SELECTOR_EMAIL || 'input[type="email"], #email, input[name="email"]';
  const passwordSelector = process.env.NAPP_SELECTOR_PASSWORD || 'input[type="password"], #password, input[name="password"]';
  const loginBtnSelector = process.env.NAPP_SELECTOR_LOGIN_BTN || 'button[type="submit"], .btn-login, #btn-submit';
  const searchInputSelector = process.env.NAPP_SELECTOR_SEARCH || 'input[type="search"], input[placeholder*="Buscar"], #search-input';
  const priceSelector = process.env.NAPP_SELECTOR_PRICE || '.proffer-price, .price-value, td.price, .valor-sugerido';

  if (!email || !password) {
    const errorMsg = 'Credenciais da plataforma Napp (NAPP_EMAIL/NAPP_PASSWORD) não configuradas no .env.';
    console.error(`[Napp Scraper] ❌ ${errorMsg}`);
    watcher.registerServiceRun('napp_scraper', 'FAILED', errorMsg);
    return { error: errorMsg };
  }

  scrapeStatus = {
    running: true,
    totalItems: 0,
    currentProgress: 0,
    successCount: 0,
    failedCount: 0,
    startTime: new Date().toISOString(),
    endTime: null,
    lastError: null
  };

  console.log('[Napp Scraper] 🔄 Iniciando raspagem de preços Napp...');

  let itemsToScrape = [];
  try {
    if (Array.isArray(eans) && eans.length > 0) {
      itemsToScrape = eans.map(ean => ({ codigo_barras: ean }));
    } else {
      // Por padrão, buscar todos os produtos ativos do cache local que têm EAN de 13 dígitos
      itemsToScrape = db.prepare(`
        SELECT codigo_barras, produto_id 
        FROM digifarma_products_cache 
        WHERE LENGTH(codigo_barras) >= 12
        ORDER BY CASE curva WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END
      `).all();
    }

    scrapeStatus.totalItems = itemsToScrape.length;
    if (scrapeStatus.totalItems === 0) {
      const msg = 'Nenhum produto com EAN válido encontrado no cache para pesquisar.';
      console.log(`[Napp Scraper] ${msg}`);
      scrapeStatus.running = false;
      scrapeStatus.endTime = new Date().toISOString();
      watcher.registerServiceRun('napp_scraper', 'SUCCESS', msg);
      return scrapeStatus;
    }

    console.log(`[Napp Scraper] Total de produtos a consultar: ${scrapeStatus.totalItems}`);

    // Configuração de inicialização do Puppeteer
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };

    // No Raspberry Pi 4 (linux ARM), o Puppeteer precisa usar o Chromium do sistema
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      console.log(`[Napp Scraper] Usando Chromium do sistema em: ${launchOptions.executablePath}`);
    } else if (process.platform === 'linux') {
      // Tenta caminhos comuns no Raspberry Pi / Debian
      const commonPaths = ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome'];
      const fs = require('fs');
      for (const p of commonPaths) {
        if (fs.existsSync(p)) {
          launchOptions.executablePath = p;
          console.log(`[Napp Scraper] Chromium linux detectado em: ${p}`);
          break;
        }
      }
    }

    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    // Configura um viewport e user-agent padrão de navegador desktop
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
      // 1. Realizar Login
      console.log(`[Napp Scraper] Acessando tela de login: ${loginUrl}`);
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Esperar e preencher e-mail
      await page.waitForSelector(emailSelector, { timeout: 10000 });
      await page.type(emailSelector, email, { delay: 50 });

      // Preencher senha
      await page.waitForSelector(passwordSelector, { timeout: 10000 });
      await page.type(passwordSelector, password, { delay: 50 });

      // Clicar em login
      console.log('[Napp Scraper] Submetendo formulário de login...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.click(loginBtnSelector)
      ]);

      console.log('[Napp Scraper] Login efetuado com sucesso!');
      await delay(2000);

      // Preparar query de inserção no SQLite
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO napp_prices (ean, produto_id, preco_proffer, atualizado_em)
        VALUES (?, ?, ?, ?)
      `);

      // 2. Iterar sobre os produtos e pesquisar o EAN
      for (const item of itemsToScrape) {
        if (!scrapeStatus.running) {
          console.log('[Napp Scraper] Processo cancelado externamente.');
          break;
        }

        const ean = item.codigo_barras;
        const prodId = item.produto_id;
        scrapeStatus.currentProgress++;

        try {
          console.log(`[Napp Scraper] [${scrapeStatus.currentProgress}/${scrapeStatus.totalItems}] Consultando EAN: ${ean}`);
          
          // Navega para a página de produtos ou busca direta
          // Dependendo da Napp, podemos fazer uma URL de busca direta: ex: searchUrl + '?q=' + ean
          const searchPageUrl = searchUrl.includes('?') ? `${searchUrl}&q=${ean}` : `${searchUrl}?q=${ean}`;
          await page.goto(searchPageUrl, { waitUntil: 'networkidle2', timeout: 15000 });
          await delay(1000);

          // Verifica se o seletor de preço está visível
          const priceElement = await page.waitForSelector(priceSelector, { timeout: 4000 });
          if (priceElement) {
            const priceText = await page.evaluate(el => el.textContent, priceElement);
            
            // Sanitizar o preço extraído (Ex: R$ 25,90 -> 25.90)
            const cleanPriceStr = priceText.replace(/[^\d,.-]/g, '').replace(',', '.');
            const profferPrice = parseFloat(cleanPriceStr);

            if (!isNaN(profferPrice) && profferPrice > 0) {
              // Salvar no SQLite
              insertStmt.run(ean, prodId, profferPrice, new Date().toISOString());
              scrapeStatus.successCount++;
              console.log(`[Napp Scraper] EAN ${ean} -> Preço Proffer: R$ ${profferPrice}`);
            } else {
              throw new Error(`Preço inválido extraído: "${priceText}"`);
            }
          } else {
            throw new Error('Preço não encontrado na página de resultados.');
          }
        } catch (itemErr) {
          scrapeStatus.failedCount++;
          console.warn(`[Napp Scraper] ⚠️ Falha ao obter preço para EAN ${ean}:`, itemErr.message);
        }

        // Delay para não sobrecarregar e evitar bloqueios (1.5 segundos)
        await delay(1500);
      }

    } catch (flowErr) {
      scrapeStatus.lastError = flowErr.message;
      console.error('[Napp Scraper] ❌ Falha crítica no fluxo de raspagem:', flowErr.message);
    } finally {
      await browser.close();
      console.log('[Napp Scraper] Puppeteer fechado.');
    }

  } catch (err) {
    scrapeStatus.lastError = err.message;
    console.error('[Napp Scraper] ❌ Erro geral:', err.message);
  }

  scrapeStatus.running = false;
  scrapeStatus.endTime = new Date().toISOString();

  // Log final no watcher
  const finalMessage = `Concluído. Sucesso: ${scrapeStatus.successCount} | Falhas: ${scrapeStatus.failedCount}`;
  console.log(`[Napp Scraper] ✅ ${finalMessage}`);
  watcher.registerServiceRun('napp_scraper', scrapeStatus.lastError ? 'FAILED' : 'SUCCESS', finalMessage);

  return scrapeStatus;
}

module.exports = {
  getScrapeStatus,
  runNappScraper
};
