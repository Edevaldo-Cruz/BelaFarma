const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('../database');
const watcher = require('./watcher.service');

// Estado global para monitorar o status do scraping/sincronização em tempo real
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
 * Autentica na plataforma Napp Solutions e obtém o token JWT.
 */
async function getNappToken() {
  const email = process.env.NAPP_EMAIL;
  const password = process.env.NAPP_PASSWORD;

  if (!email || !password) {
    throw new Error('Credenciais da Napp (NAPP_EMAIL / NAPP_PASSWORD) não configuradas no .env.');
  }

  const loginRes = await fetch('https://api-app-public.nappsolutions.com/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!loginRes.ok) {
    const errText = await loginRes.text();
    throw new Error(`Falha na autenticação da Napp (Status ${loginRes.status}): ${errText}`);
  }

  const loginData = await loginRes.json();
  if (!loginData.token) {
    throw new Error('Token de acesso não retornado pela Napp.');
  }

  return loginData.token;
}

/**
 * Consulta o preço regional Proffer de um produto específico na Napp.
 */
async function fetchProductProfferPrice(sellerId, catalogId, token) {
  try {
    const url = `https://api-app-public.nappsolutions.com/v1/sellers/${sellerId}/catalogs/${catalogId}/proffer/price`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const items = data[0];
      // 1. Prioridade: Farmácias Independentes
      const indep = items.find(i => i.grupo === 'INDEPENDENTE' && typeof i.medio === 'number' && i.medio > 0);
      if (indep) return indep.medio;

      // 2. Fallback: Redes/Grupo
      const grupo = items.find(i => typeof i.medio === 'number' && i.medio > 0);
      if (grupo) return grupo.medio;
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Executa a coleta direta e performática de preços da concorrência via API REST Napp Proffer.
 * @param {Array<string>} eansFilter Lista opcional de EANs para filtrar a coleta.
 */
async function runNappScraper(eansFilter = null) {
  if (scrapeStatus.running) {
    console.warn('[Napp Scraper] ⚠️ Já existe uma sincronização de preços Napp em andamento.');
    return scrapeStatus;
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

  console.log('[Napp Scraper] 🚀 Iniciando coleta de preços concorrentes via API Direta Napp Proffer...');

  try {
    const token = await getNappToken();
    const sellerId = '20a28238-fea5-11f0-b8ef-cb8fa8305438';

    // 1. Mapear EAN -> Produto ID do cache local
    const digifarmaProducts = db.prepare(`
      SELECT codigo_barras, produto_id 
      FROM digifarma_products_cache 
      WHERE LENGTH(codigo_barras) >= 7
    `).all();
    const eanToProdIdMap = new Map();
    digifarmaProducts.forEach(p => eanToProdIdMap.set(p.codigo_barras, p.produto_id));

    // 2. Buscar total de itens no catálogo Napp
    const initialCatRes = await fetch(`https://api-app-public.nappsolutions.com/v2/sellers/${sellerId}/catalogs?limit=100&offset=0`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!initialCatRes.ok) {
      throw new Error(`Erro ao obter catálogo Napp (Status ${initialCatRes.status})`);
    }

    const initialCatData = await initialCatRes.json();
    const totalCatalogItems = initialCatData?.pagination?.total || 0;
    console.log(`[Napp Scraper] 📦 Total de itens disponíveis no catálogo Napp: ${totalCatalogItems}`);

    scrapeStatus.totalItems = totalCatalogItems;

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO napp_prices (ean, produto_id, preco_proffer, atualizado_em)
      VALUES (?, ?, ?, ?)
    `);

    let offset = 0;
    const limit = 100;
    const concurrency = 6; // Lote de consultas simultâneas para máxima performance sem sobrecarregar a API

    while (offset < totalCatalogItems && scrapeStatus.running) {
      const pageRes = await fetch(`https://api-app-public.nappsolutions.com/v2/sellers/${sellerId}/catalogs?limit=${limit}&offset=${offset}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!pageRes.ok) {
        console.warn(`[Napp Scraper] Erro ao carregar página offset ${offset}`);
        offset += limit;
        continue;
      }

      const pageData = await pageRes.json();
      const items = pageData?.data || [];

      // Processar itens da página em lotes concorrentes
      for (let i = 0; i < items.length; i += concurrency) {
        if (!scrapeStatus.running) break;

        const chunk = items.slice(i, i + concurrency);
        const promises = chunk.map(async (item) => {
          const ean = item.ean || item.sku;
          if (!ean) return;

          if (Array.isArray(eansFilter) && eansFilter.length > 0 && !eansFilter.includes(ean)) {
            return;
          }

          // Consultar preço médio regional Proffer
          const profferPrice = await fetchProductProfferPrice(sellerId, item.id, token);
          const finalPrice = profferPrice || parseFloat(item.price || item.list_price || 0);

          if (finalPrice > 0) {
            const prodId = eanToProdIdMap.get(ean) || null;
            insertStmt.run(ean, prodId, finalPrice, new Date().toISOString());
            scrapeStatus.successCount++;
          } else {
            scrapeStatus.failedCount++;
          }
          scrapeStatus.currentProgress++;
        });

        await Promise.all(promises);
        await delay(50); // Pausa leve para respeitar a taxa da API
      }

      offset += limit;
      console.log(`[Napp Scraper] ⏳ Progresso: ${scrapeStatus.currentProgress} / ${totalCatalogItems} produtos processados (Sucesso: ${scrapeStatus.successCount}).`);
    }

    scrapeStatus.running = false;
    scrapeStatus.endTime = new Date().toISOString();
    const successMsg = `Coleta Napp Proffer finalizada com sucesso! ${scrapeStatus.successCount} preços concorrentes atualizados em napp_prices.`;
    console.log(`[Napp Scraper] ✅ ${successMsg}`);
    watcher.registerServiceRun('napp_scraper', 'SUCCESS', successMsg);

    return scrapeStatus;

  } catch (err) {
    console.error('[Napp Scraper] ❌ Erro ao coletar preços Napp:', err.message);
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
