const puppeteer = require('puppeteer');
const db = require('../database');
const watcher = require('./watcher.service');

// Estado global para monitorar o status do scraping em tempo real
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

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function getScrapeStatus() {
  return scrapeStatus;
}

/**
 * Executa o robô de raspagem na plataforma Napp Solutions / Proffer.
 * Extrai a Matriz de Preços Regionais (Foco: Preço Médio em Farmácias Independentes).
 * @param {Array} eans Opcional. Lista específica de EANs para consultar.
 */
async function runNappScraper(eans = null) {
  if (scrapeStatus.running) {
    console.warn('[Napp Scraper] ⚠️ Já existe um processo de raspagem em execução.');
    return scrapeStatus;
  }

  const email = process.env.NAPP_EMAIL;
  const password = process.env.NAPP_PASSWORD;

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

  console.log('[Napp Scraper] 🔄 Iniciando raspagem da Matriz de Preços Regionais Proffer (Farmácias Independentes)...');

  try {
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else if (process.platform === 'linux') {
      const commonPaths = ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome'];
      const fs = require('fs');
      for (const p of commonPaths) {
        if (fs.existsSync(p)) {
          launchOptions.executablePath = p;
          break;
        }
      }
    }

    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });

    const marketPricesMap = new Map(); // ean -> preco_medio_independentes

    // Capturar dados RPC do dataset Looker Studio (contém preço médio de mercado para farmácias independentes)
    page.on('response', async res => {
      const url = res.url();
      if (url.includes('batchedDataV2') || url.includes('getData')) {
        try {
          const text = await res.text();
          const cleanJson = text.replace(/^\)\]\}'/, '').trim();
          const json = JSON.parse(cleanJson);

          if (json.dataResponse) {
            for (const dr of json.dataResponse) {
              for (const ds of (dr.dataSubset || [])) {
                const table = ds.dataset?.tableDataset;
                if (table && table.column && table.column.length >= 4) {
                  const cols = table.column;
                  let productCol = null;
                  let marketPriceCol = null;

                  // Identificar coluna de texto com EAN/Produto e coluna numérica com preço médio mercado
                  cols.forEach(col => {
                    if (col.stringColumn?.values) {
                      const sampleStr = col.stringColumn.values.find(v => typeof v === 'string' && v.match(/\d{8,14}/));
                      if (sampleStr) productCol = col.stringColumn.values;
                    }
                    if (col.doubleColumn?.values && col.doubleColumn.values.length > 5) {
                      // Se for coluna de preços com valores plausíveis (ex: 2 a 300)
                      if (!marketPriceCol || col.doubleColumn.values.some(v => v > 1 && v < 500)) {
                        marketPriceCol = col.doubleColumn.values;
                      }
                    }
                  });

                  if (productCol && marketPriceCol) {
                    productCol.forEach((prodStr, idx) => {
                      if (!prodStr) return;
                      const match = prodStr.match(/\b(\d{8,14})\b/);
                      if (match) {
                        const ean = match[1];
                        const price = marketPriceCol[idx];
                        if (price && typeof price === 'number' && price > 0) {
                          marketPricesMap.set(ean, Math.round(price * 100) / 100);
                        }
                      }
                    });
                  }
                }
              }
            }
          }
        } catch (e) {}
      }
    });

    console.log('[Napp Scraper] Acessando relatório Proffer Painel de Mercado...');
    const embedUrl = 'https://datastudio.google.com/embed/reporting/ea0ed2d1-00d0-4e47-9fc6-8c5028e6af02/page/NtRGD?params=%7B%22ds0.store_ref%22:%226b2be7f8-dea7-4da9-99e1-60139701736e%22,%22ds0.store_group%22:%225599%22,%22ds1.store_ref%22:%226b2be7f8-dea7-4da9-99e1-60139701736e%22,%22ds1.store_group%22:%225599%22,%22ds2.store_ref%22:%226b2be7f8-dea7-4da9-99e1-60139701736e%22,%22ds3.store_ref%22:%226b2be7f8-dea7-4da9-99e1-60139701736e%22,%22ds4.store_ref%22:%226b2be7f8-dea7-4da9-99e1-60139701736e%22,%22ds4.store_group%22:%225599%22,%22ds6.store_ref%22:%226b2be7f8-dea7-4da9-99e1-60139701736e%22,%22ds6.store_group%22:%225599%22%7D';
    
    await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    await delay(12000);

    await browser.close();

    console.log(`[Napp Scraper] Proffer Regional Matrix capturado! Total de preços médios em farmácias independentes: ${marketPricesMap.size}`);

    // Autenticar via API REST Napp para catálogo complementar
    const loginRes = await fetch('https://api-app-public.nappsolutions.com/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    const sellerId = '20a28238-fea5-11f0-b8ef-cb8fa8305438';

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO napp_prices (ean, produto_id, preco_proffer, atualizado_em)
      VALUES (?, ?, ?, ?)
    `);

    const digifarmaProducts = db.prepare(`
      SELECT codigo_barras, produto_id FROM digifarma_products_cache WHERE LENGTH(codigo_barras) >= 12
    `).all();
    const eanToProdIdMap = new Map();
    digifarmaProducts.forEach(p => eanToProdIdMap.set(p.codigo_barras, p.produto_id));

    // Processar os itens capturados no mapa de preços médios
    for (const [ean, profferPrice] of marketPricesMap.entries()) {
      if (Array.isArray(eans) && eans.length > 0 && !eans.includes(ean)) continue;

      const prodId = eanToProdIdMap.get(ean) || null;
      insertStmt.run(ean, prodId, profferPrice, new Date().toISOString());
      scrapeStatus.successCount++;
      scrapeStatus.currentProgress++;
    }

    // Se houver mais itens no catálogo Napp, complementar com preço base
    if (token) {
      const catRes = await fetch(`https://api-app-public.nappsolutions.com/v2/sellers/${sellerId}/catalogs?limit=100&offset=0`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (catRes.ok) {
        const catData = await catRes.json();
        const totalItems = catData?.pagination?.total || 0;
        scrapeStatus.totalItems = Math.max(totalItems, marketPricesMap.size);

        let offset = 0;
        while (offset < totalItems && scrapeStatus.running) {
          const res = await fetch(`https://api-app-public.nappsolutions.com/v2/sellers/${sellerId}/catalogs?limit=100&offset=${offset}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            for (const item of (data.data || [])) {
              const ean = item.ean || item.sku;
              if (!ean || marketPricesMap.has(ean)) continue; // Priorizar o Preço Médio de Farmácias Independentes

              const price = parseFloat(item.price || item.list_price || 0);
              if (price > 0) {
                const prodId = eanToProdIdMap.get(ean) || item.id || null;
                insertStmt.run(ean, prodId, price, new Date().toISOString());
                scrapeStatus.successCount++;
              }
              scrapeStatus.currentProgress++;
            }
          }
          offset += 100;
          await delay(100);
        }
      }
    }

    scrapeStatus.running = false;
    scrapeStatus.endTime = new Date().toISOString();
    const successMsg = `Sincronização Napp (Preço Médio Farmácias Independentes) concluída com sucesso! Total processado: ${scrapeStatus.successCount} produtos.`;
    console.log(`[Napp Scraper] ✅ ${successMsg}`);
    watcher.registerServiceRun('napp_scraper', 'SUCCESS', successMsg);
    return scrapeStatus;

  } catch (err) {
    console.error('[Napp Scraper] ❌ Erro ao executar raspagem Napp:', err.message);
    scrapeStatus.running = false;
    scrapeStatus.endTime = new Date().toISOString();
    scrapeStatus.lastError = err.message;
    watcher.registerServiceRun('napp_scraper', 'FAILED', err.message);
    return { error: err.message };
  }
}

module.exports = {
  runNappScraper,
  getScrapeStatus
};
