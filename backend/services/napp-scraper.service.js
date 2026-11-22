const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('../database');
const watcher = require('./watcher.service');

const SELLER_ID = '20a28238-fea5-11f0-b8ef-cb8fa8305438';

// Estado global para monitorar o status do scraping/sincronização em tempo real
let scrapeStatus = {
  running: false,
  totalItems: 0,
  currentProgress: 0,
  successCount: 0,
  failedCount: 0,
  skippedNoProffer: 0,
  abortedByHealthcheck: false,
  profferHealth: null,
  targetScope: 'all',
  startTime: null,
  endTime: null,
  lastError: null
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function getScrapeStatus() {
  return scrapeStatus;
}

function stopNappScraper() {
  if (scrapeStatus.running) {
    scrapeStatus.running = false;
    scrapeStatus.endTime = new Date().toISOString();
    if (!scrapeStatus.lastError) {
      scrapeStatus.lastError = 'Coleta interrompida manualmente pelo usuário.';
    }
    console.log('[Napp Scraper] ⏹️ Coleta interrompida manualmente.');
    return { stopped: true, status: scrapeStatus };
  }
  return { stopped: false, status: scrapeStatus };
}

/**
 * Fetch robusto com timeout e retentativas automáticas
 */
async function fetchWithRetry(url, options = {}, maxRetries = 3, timeoutMs = 12000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await delay(1000 * attempt);
      }
    }
  }
  throw lastError;
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

  const loginRes = await fetchWithRetry('https://api-app-public.nappsolutions.com/v1/auth/login', {
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
 * Consulta os preços regionais Proffer de um produto específico na Napp (Baixo, Médio, Alto).
 * Retorna objeto padronizado com { ok: true, ... } ou { ok: false, status, errorKey, errorMessage }.
 */
async function fetchProductProfferPrice(sellerId, catalogId, token, maxRetries = 2) {
  try {
    const url = `https://api-app-public.nappsolutions.com/v1/sellers/${sellerId}/catalogs/${catalogId}/proffer/price`;
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    }, maxRetries, 15000);

    if (!res.ok) {
      let parsed = null;
      let rawText = '';
      try {
        rawText = await res.text();
        parsed = JSON.parse(rawText);
      } catch (e) {}
      return {
        ok: false,
        status: res.status,
        errorKey: parsed?.key || null,
        errorMessage: parsed?.message || rawText || `HTTP ${res.status}`
      };
    }

    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const items = data[0];
      const indep = items.find(i => i.grupo === 'INDEPENDENTE' && typeof i.medio === 'number' && i.medio > 0);
      const otherGroup = items.find(i => i.grupo !== 'INDEPENDENTE' && typeof i.medio === 'number' && i.medio > 0);

      if (indep) {
        return {
          ok: true,
          baixo: typeof indep.baixo === 'number' && indep.baixo > 0 ? indep.baixo : indep.medio,
          medio: indep.medio,
          alto: typeof indep.alto === 'number' && indep.alto > 0 ? indep.alto : indep.medio,
          grupo: 'INDEPENDENTE',
          redeMedio: otherGroup ? otherGroup.medio : null
        };
      }

      const grupo = items.find(i => typeof i.medio === 'number' && i.medio > 0);
      if (grupo) {
        return {
          ok: true,
          baixo: typeof grupo.baixo === 'number' && grupo.baixo > 0 ? grupo.baixo : grupo.medio,
          medio: grupo.medio,
          alto: typeof grupo.alto === 'number' && grupo.alto > 0 ? grupo.alto : grupo.medio,
          grupo: 'GRUPO',
          redeMedio: grupo.medio
        };
      }
    }

    return {
      ok: false,
      status: res.status,
      errorKey: 'EMPTY_PROFFER_RESPONSE',
      errorMessage: 'Proffer não retornou faixa de preços para este item.'
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      errorKey: 'NETWORK_ERROR',
      errorMessage: err.message
    };
  }
}

/**
 * Executa teste leve (somente 1 item do catálogo) para verificar se a integração Napp -> Proffer
 * está respondendo normalmente antes de disparar coletas ou para diagnóstico na interface.
 */
async function testProfferConnection() {
  const token = await getNappToken();

  let profferServiceStatus = 'UNKNOWN';
  try {
    const svcRes = await fetchWithRetry(
      `https://api-app-public.nappsolutions.com/v1/sellers/${SELLER_ID}/services/code/PROFFER/status`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } },
      2,
      8000
    );
    if (svcRes.ok) {
      const svcData = await svcRes.json();
      profferServiceStatus = svcData?.status || 'UNKNOWN';
    }
  } catch (e) {}

  const catRes = await fetchWithRetry(
    `https://api-app-public.nappsolutions.com/v2/sellers/${SELLER_ID}/catalogs?limit=1&offset=0`,
    { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } },
    2,
    10000
  );

  if (!catRes.ok) {
    const errText = await catRes.text().catch(() => '');
    throw new Error(`Erro ao consultar catálogo Napp (HTTP ${catRes.status}): ${errText}`);
  }

  const catData = await catRes.json();
  const catalogTotal = catData?.pagination?.total || 0;
  const sample = Array.isArray(catData?.data) && catData.data.length > 0 ? catData.data[0] : null;

  if (!sample) {
    return {
      nappAuthOk: true,
      catalogTotal,
      profferServiceStatus,
      profferApiOk: false,
      httpStatus: 0,
      sampleProduct: null,
      samplePrices: null,
      errorCode: 'EMPTY_CATALOG',
      errorMessage: 'Catálogo da Napp retornou vazio.',
      testedAt: new Date().toISOString()
    };
  }

  const profferRes = await fetchProductProfferPrice(SELLER_ID, sample.id, token, 1);
  const profferApiOk = Boolean(profferRes?.ok && profferRes.medio > 0);

  return {
    nappAuthOk: true,
    catalogTotal,
    profferServiceStatus,
    profferApiOk,
    httpStatus: profferRes?.ok ? 200 : (profferRes?.status || 0),
    sampleProduct: {
      id: sample.id,
      ean: String(sample.ean || sample.sku || '').trim(),
      name: sample.name || ''
    },
    samplePrices: profferApiOk
      ? { baixo: profferRes.baixo, medio: profferRes.medio, alto: profferRes.alto }
      : null,
    errorCode: profferApiOk ? null : (profferRes?.errorKey || 'PROFFER_UNAVAILABLE'),
    errorMessage: profferApiOk ? null : (profferRes?.errorMessage || 'Proffer indisponível'),
    testedAt: new Date().toISOString()
  };
}

/**
 * Executa a coleta direta, resiliente e blindada de preços da concorrência via API REST Napp Proffer.
 * @param {Array<string>} eansFilter Lista opcional de EANs para filtrar a coleta.
 * @param {object} options Opções adicionais (ex: { targetScope: 'sem_proffer' | 'levantamento' | 'all' }).
 */
async function runNappScraper(eansFilter = null, options = {}) {
  if (scrapeStatus.running) {
    console.warn('[Napp Scraper] ⚠️ Já existe uma sincronização de preços Napp em andamento.');
    return scrapeStatus;
  }

  const normalizedFilter = Array.isArray(eansFilter)
    ? eansFilter.map(e => String(e || '').trim()).filter(Boolean)
    : [];
  const eansSet = normalizedFilter.length > 0 ? new Set(normalizedFilter) : null;
  const targetScope = options?.targetScope || (eansSet ? 'filtered' : 'all');

  scrapeStatus = {
    running: true,
    totalItems: eansSet ? eansSet.size : 0,
    currentProgress: 0,
    successCount: 0,
    failedCount: 0,
    skippedNoProffer: 0,
    abortedByHealthcheck: false,
    profferHealth: null,
    targetScope,
    startTime: new Date().toISOString(),
    endTime: null,
    lastError: null
  };

  console.log('[Napp Scraper] 🚀 Iniciando coleta blindada de preços concorrentes via API Direta Napp Proffer...');

  try {
    // 0. Pré-teste obrigatório de saúde do conector Proffer antes de tocar na base
    const health = await testProfferConnection();
    scrapeStatus.profferHealth = health;

    if (!health.profferApiOk) {
      const abortMsg = `Proffer indisponível (${health.errorMessage}). Coleta abortada para proteger os preços reais salvos.`;
      scrapeStatus.running = false;
      scrapeStatus.abortedByHealthcheck = true;
      scrapeStatus.endTime = new Date().toISOString();
      scrapeStatus.lastError = abortMsg;
      console.warn(`[Napp Scraper] 🛡️ ${abortMsg}`);
      watcher.registerServiceRun('napp_scraper', 'FAILED', abortMsg);
      return { aborted: true, error: abortMsg, health };
    }

    let token = await getNappToken();
    const sellerId = SELLER_ID;

    // 1. Mapear EAN -> Produto ID do cache local
    const digifarmaProducts = db.prepare(`
      SELECT TRIM(codigo_barras) as codigo_barras, produto_id 
      FROM digifarma_products_cache 
      WHERE LENGTH(TRIM(codigo_barras)) >= 7
    `).all();
    const eanToProdIdMap = new Map();
    digifarmaProducts.forEach(p => eanToProdIdMap.set(p.codigo_barras, p.produto_id));

    // 2. Buscar total de itens no catálogo Napp
    const initialCatRes = await fetchWithRetry(`https://api-app-public.nappsolutions.com/v2/sellers/${sellerId}/catalogs?limit=100&offset=0`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!initialCatRes.ok) {
      throw new Error(`Erro ao obter catálogo Napp (Status ${initialCatRes.status})`);
    }

    const initialCatData = await initialCatRes.json();
    const totalCatalogItems = initialCatData?.pagination?.total || 0;
    console.log(`[Napp Scraper] 📦 Total de itens disponíveis no catálogo Napp: ${totalCatalogItems}${eansSet ? ` (Filtro ativo: ${eansSet.size} EANs)` : ''}`);

    if (!eansSet) {
      scrapeStatus.totalItems = totalCatalogItems;
    }

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO napp_prices (
        ean, produto_id, preco_proffer, preco_proffer_baixo, preco_proffer_medio, preco_proffer_alto,
        fonte, proffer_grupo, preco_proffer_rede_medio, catalog_id, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, 'napp_proffer_api', ?, ?, ?, ?)
    `);

    let offset = 0;
    const limit = 100;
    const concurrency = 6;
    let consecutiveConnectorErrors = 0;
    let circuitBrokenMsg = null;

    while (offset < totalCatalogItems && scrapeStatus.running) {
      if (eansSet && scrapeStatus.currentProgress >= eansSet.size) {
        break;
      }

      let pageData = null;
      try {
        const pageRes = await fetchWithRetry(`https://api-app-public.nappsolutions.com/v2/sellers/${sellerId}/catalogs?limit=${limit}&offset=${offset}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }, 3, 10000);

        if (pageRes.status === 401) {
          console.log('[Napp Scraper] 🔄 Token expirado, renovando credenciais...');
          token = await getNappToken();
          continue;
        }

        if (pageRes.ok) {
          pageData = await pageRes.json();
        }
      } catch (pageErr) {
        console.warn(`[Napp Scraper] ⚠️ Aviso: Falha temporária no offset ${offset}, tentando próximo lote...`);
      }

      const items = pageData?.data || [];
      if (items.length === 0) {
        offset += limit;
        continue;
      }

      const matchedItems = items.filter(item => {
        const ean = String(item.ean || item.sku || '').trim();
        if (!ean) return false;
        if (eansSet && !eansSet.has(ean)) return false;
        return true;
      });

      // Processar itens da página em lotes concorrentes
      for (let i = 0; i < matchedItems.length; i += concurrency) {
        if (!scrapeStatus.running) break;

        const chunk = matchedItems.slice(i, i + concurrency);
        const promises = chunk.map(async (item) => {
          const ean = String(item.ean || item.sku || '').trim();
          try {
            const profferRes = await fetchProductProfferPrice(sellerId, item.id, token);

            if (profferRes && profferRes.ok && profferRes.medio > 0) {
              consecutiveConnectorErrors = 0;
              const prodId = eanToProdIdMap.get(ean) || null;
              insertStmt.run(
                ean,
                prodId,
                profferRes.medio,
                profferRes.baixo,
                profferRes.medio,
                profferRes.alto,
                profferRes.grupo || 'INDEPENDENTE',
                profferRes.redeMedio || null,
                item.id || null,
                new Date().toISOString()
              );
              scrapeStatus.successCount++;
            } else {
              // BLINDAGEM: Nunca usar item.price / item.list_price como fallback; preserva dados reais já salvos
              scrapeStatus.skippedNoProffer++;
              scrapeStatus.failedCount++;

              const isConnectorErr =
                profferRes?.errorKey === 'error.connector.proffer.monitoring.prices.request' ||
                profferRes?.status === 400 ||
                (profferRes?.status >= 500);

              if (isConnectorErr) {
                consecutiveConnectorErrors++;
              } else {
                consecutiveConnectorErrors = 0;
              }
            }
          } catch (e) {
            scrapeStatus.failedCount++;
            scrapeStatus.skippedNoProffer++;
            consecutiveConnectorErrors++;
          }
          scrapeStatus.currentProgress++;
        });

        await Promise.all(promises);

        if (consecutiveConnectorErrors >= 15) {
          circuitBrokenMsg = 'Coleta interrompida automaticamente após 15 erros consecutivos no conector Proffer. Os preços reais salvos foram preservados.';
          scrapeStatus.lastError = circuitBrokenMsg;
          scrapeStatus.running = false;
          console.warn(`[Napp Scraper] 🛡️ ${circuitBrokenMsg}`);
          break;
        }

        await delay(50);
      }

      if (circuitBrokenMsg) break;

      offset += limit;
      if (offset % 500 === 0 || offset >= totalCatalogItems) {
        console.log(`[Napp Scraper] ⏳ Progresso: ${scrapeStatus.currentProgress} / ${scrapeStatus.totalItems} (Sucesso: ${scrapeStatus.successCount}, Sem Proffer/Ignorados: ${scrapeStatus.skippedNoProffer}).`);
      }
    }

    scrapeStatus.running = false;
    scrapeStatus.endTime = new Date().toISOString();

    if (circuitBrokenMsg) {
      watcher.registerServiceRun('napp_scraper', 'FAILED', circuitBrokenMsg);
      return { ...scrapeStatus, aborted: true, error: circuitBrokenMsg };
    }

    const successMsg = `Coleta Napp Proffer finalizada! ${scrapeStatus.successCount} preços reais atualizados em napp_prices (${scrapeStatus.skippedNoProffer} ignorados sem sobrescrever).`;
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
  getScrapeStatus,
  testProfferConnection,
  stopNappScraper
};
