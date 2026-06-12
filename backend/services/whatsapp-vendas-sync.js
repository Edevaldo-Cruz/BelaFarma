const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const db = require('../database');

const JSON_PATH = 'f:\\Documentos\\Desenvolvimento\\siteBelaFarmaSul\\js\\scraped_products.json';

/**
 * Extrai o código de barras (EAN-13 brasileiro) da URL da imagem ou do nome.
 * Geralmente começa com 789 ou 790 e possui 13 dígitos.
 * @param {string} imageUrl 
 * @param {string} productName 
 * @returns {string|null}
 */
function extractEAN(imageUrl = '', productName = '') {
  // Regex para buscar sequências de 13 dígitos iniciadas com 789 ou 790 (EAN-13 brasileiro)
  const eanRegex = /\b(789\d{10}|790\d{10})\b/;
  
  // Tenta extrair da URL da imagem
  const matchImg = imageUrl.match(eanRegex);
  if (matchImg) return matchImg[1];
  
  // Tenta extrair do nome do produto (caso tenha o código lá)
  const matchName = productName.match(eanRegex);
  if (matchName) return matchName[1];
  
  // Se não encontrar com 789/790, tenta qualquer sequência de 13 dígitos na URL da imagem
  const generic13Regex = /\b(\d{13})\b/;
  const matchGeneric = imageUrl.match(generic13Regex);
  if (matchGeneric) return matchGeneric[1];

  return null;
}

/**
 * Lê o arquivo JSON do siteBelaFarmaSul e insere/atualiza os produtos na tabela scraped_images
 */
async function syncScrapedImages() {
  console.log('[Sync-Images] 🔄 Iniciando sincronização de fotos do site...');
  
  if (!fs.existsSync(JSON_PATH)) {
    console.warn(`[Sync-Images] ⚠️ Arquivo de raspagem não encontrado em: ${JSON_PATH}`);
    return { success: false, error: 'Arquivo JSON não encontrado.' };
  }

  try {
    const rawData = fs.readFileSync(JSON_PATH, 'utf-8');
    const products = JSON.parse(rawData);
    
    if (!Array.isArray(products)) {
      throw new Error('O formato do arquivo JSON de produtos é inválido (deve ser um Array).');
    }

    console.log(`[Sync-Images] Lidos ${products.length} produtos do JSON de raspagem.`);
    
    let processed = 0;
    let synchronized = 0;
    
    // Preparar statements do SQLite
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO scraped_images (ean, name, image_url, category, brand, last_updated)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Iniciar uma transação para máxima performance
    const transaction = db.transaction((items) => {
      for (const item of items) {
        processed++;
        const ean = extractEAN(item.image, item.name);
        
        // Só sincronizamos se conseguirmos obter um código de barras EAN-13
        // para garantir que a associação com o Digifarma seja consistente.
        if (ean && item.image) {
          insertStmt.run(
            ean,
            item.name,
            item.image,
            item.category || null,
            item.brand || null,
            new Date().toISOString()
          );
          synchronized++;
        }
      }
    });

    transaction(products);

    console.log(`[Sync-Images] ✅ Sincronização concluída com sucesso!`);
    console.log(`[Sync-Images] Processados: ${processed} | Sincronizados com EAN: ${synchronized}`);
    
    return { success: true, processed, synchronized };
  } catch (err) {
    console.error('[Sync-Images] ❌ Erro ao sincronizar fotos do site:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Inicializa a tarefa agendada (Cron Job) para rodar toda madrugada às 04:00
 */
function initSyncCron() {
  // Cron: '0 4 * * *' -> Todos os dias às 04:00 da manhã
  cron.schedule('0 4 * * *', async () => {
    console.log('[Cron Job] ⏰ Disparando sincronização diária de fotos...');
    await syncScrapedImages();
  });
  console.log('[Sync-Images] 📅 Cron Job de sincronização configurado (diariamente às 04:00).');
}

module.exports = {
  syncScrapedImages,
  initSyncCron
};
