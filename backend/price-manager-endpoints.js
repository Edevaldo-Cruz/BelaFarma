const express = require('express');
const { queryDigifarma } = require('./services/digifarma.service');
const { runNappScraper, getScrapeStatus } = require('./services/napp-scraper.service');

function formatarDataFirebird(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Arredonda um valor numérico para cima garantindo que os centavos terminem
 * em 0, 5 ou 9. (ex: R$ 10,12 -> R$ 10,15 | R$ 10,16 -> R$ 10,19 | R$ 10,97 -> R$ 10,99).
 */
function roundUpToAcceptedCents(val) {
  if (isNaN(val) || val <= 0) return 0;
  let totalCents = Math.round(val * 100);
  let integerPart = Math.floor(totalCents / 100);
  let centsPart = totalCents % 100;

  let lastDigit = centsPart % 10;
  if (lastDigit === 0 || lastDigit === 5 || lastDigit === 9) {
    return totalCents / 100;
  }
  if (lastDigit > 0 && lastDigit < 5) {
    centsPart += (5 - lastDigit);
  } else if (lastDigit > 5 && lastDigit < 9) {
    centsPart += (9 - lastDigit);
  }

  return (integerPart * 100 + centsPart) / 100;
}

/**
 * Calcula o preço efetivo do produto (Preço de promoção se houver e ativo, caso contrário Preço de venda normal)
 */
function getEffectivePrice(p) {
  const normalPrice = parseFloat(p.PROD_PRVENDA || 0);
  const promoPrice = parseFloat(p.PROD_PRPROMOCAO || 0);

  if (promoPrice > 0) {
    const now = new Date();
    let isPromoActive = true;
    if (p.INICIO_PROMOCAO) {
      const inicio = new Date(p.INICIO_PROMOCAO);
      if (now < inicio) isPromoActive = false;
    }
    if (p.TERMINO_PROMOCAO) {
      const termino = new Date(p.TERMINO_PROMOCAO);
      termino.setHours(23, 59, 59, 999);
      if (now > termino) isPromoActive = false;
    }
    if (isPromoActive) {
      return promoPrice;
    }
  }
  return normalPrice;
}

/**
 * Constrói a cláusula WHERE em SQL SQLite com base nos filtros da requisição
 */
function buildWhereClause(query) {
  const search = query.search || '';
  const curva = query.curva || 'ALL';
  const filterNapp = query.filterNapp || 'ALL';
  const costFilter = query.costFilter || 'ALL';
  const minPrice = parseFloat(query.minPrice);
  const maxPrice = parseFloat(query.maxPrice);
  const categoria = query.categoria || 'ALL';

  let whereClauses = [];
  let params = [];

  whereClauses.push('c.estoque_atual > 0');

  if (search) {
    whereClauses.push('(c.descricao LIKE ? OR c.codigo_barras LIKE ? OR c.produto_id LIKE ?)');
    const searchLike = `%${search}%`;
    params.push(searchLike, searchLike, searchLike);
  }

  if (curva !== 'ALL') {
    whereClauses.push('c.curva = ?');
    params.push(curva);
  }

  if (filterNapp === 'WITH_NAPP') {
    whereClauses.push('n.preco_proffer IS NOT NULL');
  } else if (filterNapp === 'WITHOUT_NAPP') {
    whereClauses.push('n.preco_proffer IS NULL');
  } else if (filterNapp === 'DISCREPANT') {
    whereClauses.push('n.preco_proffer IS NOT NULL AND ABS(c.preco_venda - n.preco_proffer) / c.preco_venda > 0.01');
  }

  if (costFilter === 'BELOW_COST') {
    whereClauses.push('c.preco_custo > 0 AND c.preco_venda < c.preco_custo');
  }

  if (!isNaN(minPrice) && minPrice >= 0) {
    whereClauses.push('c.preco_venda >= ?');
    params.push(minPrice);
  }

  if (!isNaN(maxPrice) && maxPrice > 0) {
    whereClauses.push('c.preco_venda <= ?');
    params.push(maxPrice);
  }

  if (categoria === 'GENERICO') {
    whereClauses.push('(c.descricao LIKE ? OR c.descricao LIKE ? OR c.descricao LIKE ?)');
    params.push('%GENERICO%', '% GEN %', '%GEN %');
  } else if (categoria === 'SIMILAR') {
    whereClauses.push('c.descricao LIKE ?');
    params.push('%SIMILAR%');
  } else if (categoria === 'PERFUMARIA') {
    whereClauses.push('(c.descricao LIKE ? OR c.descricao LIKE ? OR c.descricao LIKE ? OR c.descricao LIKE ? OR c.descricao LIKE ? OR c.descricao LIKE ? OR c.descricao LIKE ? OR c.descricao LIKE ?)');
    params.push('%PERFUMARIA%', '%SHAMPOO%', '%SABONETE%', '%CREME%', '%DESODORANTE%', '%PROTETOR%', '%FRALDA%', '%PERFUME%');
  } else if (categoria === 'MARCA') {
    whereClauses.push('(c.descricao NOT LIKE ? AND c.descricao NOT LIKE ? AND c.descricao NOT LIKE ?)');
    params.push('%GENERICO%', '%SIMILAR%', '%PERFUMARIA%');
  }

  const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereSQL, params };
}

module.exports = function (db) {
  const router = express.Router();

  /**
   * 1. GET /api/price-manager/products
   * Retorna lista paginada e filtrada de produtos unindo o cache SQLite e preços da Napp
   */
  router.get('/products', (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;
      
      const { whereSQL, params } = buildWhereClause(req.query);

      // Query para total de registros
      const totalQuery = `
        SELECT COUNT(1) as total 
        FROM digifarma_products_cache c
        LEFT JOIN napp_prices n ON (TRIM(c.codigo_barras) = TRIM(n.ean) OR (c.produto_id IS NOT NULL AND c.produto_id = n.produto_id))
        ${whereSQL}
      `;
      const totalRow = db.prepare(totalQuery).get(...params);
      const totalItems = totalRow ? totalRow.total : 0;

      // Query paginada
      const query = `
        SELECT 
          c.codigo_barras as ean,
          c.produto_id as id,
          c.categoria_id,
          c.descricao as name,
          c.estoque_atual as stock,
          c.preco_venda as price,
          c.preco_custo as cost_price,
          c.preco_promocao as promo_price,
          c.preco_normal as normal_price,
          c.curva as curve,
          c.tributacao_monofasica,
          c.cst_pis,
          c.cst_cofins,
          c.aliquota_st,
          c.imposto_aliq,
          c.ncm,
          c.cest,
          c.atualizado_em as cached_at,
          COALESCE(n.preco_proffer_medio, n.preco_proffer) as region_price,
          COALESCE(n.preco_proffer_baixo, n.preco_proffer) as region_price_baixo,
          COALESCE(n.preco_proffer_medio, n.preco_proffer) as region_price_medio,
          COALESCE(n.preco_proffer_alto, n.preco_proffer) as region_price_alto,
          n.atualizado_em as region_updated_at
        FROM digifarma_products_cache c
        LEFT JOIN napp_prices n ON (TRIM(c.codigo_barras) = TRIM(n.ean) OR (c.produto_id IS NOT NULL AND c.produto_id = n.produto_id))
        ${whereSQL}
        ORDER BY c.curva ASC, c.descricao ASC
        LIMIT ? OFFSET ?
      `;
      
      const products = db.prepare(query).all(...params, limit, offset);

      res.json({
        success: true,
        data: products,
        pagination: {
          totalItems,
          totalPages: Math.ceil(totalItems / limit) || 1,
          currentPage: page,
          limit
        }
      });
    } catch (err) {
      console.error('[Price Manager API] Erro ao obter produtos:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 1b. GET /api/price-manager/stats
   * Retorna estatísticas resumidas do catálogo
   */
  router.get('/stats', (req, res) => {
    try {
      const row = db.prepare(`
        SELECT 
          COUNT(1) as total,
          SUM(CASE WHEN c.curva = 'A' THEN 1 ELSE 0 END) as curveA,
          SUM(CASE WHEN c.curva = 'B' THEN 1 ELSE 0 END) as curveB,
          SUM(CASE WHEN c.curva = 'C' THEN 1 ELSE 0 END) as curveC,
          SUM(CASE WHEN c.preco_custo > 0 AND c.preco_venda < c.preco_custo THEN 1 ELSE 0 END) as belowCost,
          SUM(CASE WHEN COALESCE(n.preco_proffer_medio, n.preco_proffer) IS NOT NULL THEN 1 ELSE 0 END) as withNapp,
          SUM(CASE WHEN COALESCE(n.preco_proffer_medio, n.preco_proffer) IS NOT NULL AND ABS(c.preco_venda - COALESCE(n.preco_proffer_medio, n.preco_proffer)) / c.preco_venda > 0.01 THEN 1 ELSE 0 END) as discrepant
        FROM digifarma_products_cache c
        LEFT JOIN napp_prices n ON (TRIM(c.codigo_barras) = TRIM(n.ean) OR (c.produto_id IS NOT NULL AND c.produto_id = n.produto_id))
      `).get();

      res.json({
        success: true,
        data: {
          total: row ? row.total || 0 : 0,
          curveA: row ? row.curveA || 0 : 0,
          curveB: row ? row.curveB || 0 : 0,
          curveC: row ? row.curveC || 0 : 0,
          belowCost: row ? row.belowCost || 0 : 0,
          withNapp: row ? row.withNapp || 0 : 0,
          discrepant: row ? row.discrepant || 0 : 0
        }
      });
    } catch (err) {
      console.error('[Price Manager API] Erro ao obter estatísticas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 2. POST /api/price-manager/sync-cache
   * Recalcula a curva ABC das vendas de 60 dias no Digifarma (Firebird) e atualiza o SQLite local
   * Considera o Preço de Promoção ativo (PROD_PRPROMOCAO) se houver, caso contrário o Preço de Venda (PROD_PRVENDA)
   */
  router.post('/sync-cache', async (req, res) => {
    try {
      console.log('[Price Manager API] Iniciando sincronização e recálculo da Curva ABC (Preço de Promoção/Venda)...');
      
      // 1. Obter todos os produtos ativos do Digifarma incluindo preços de promoção, custos e dados fiscais
      const digifarmaProducts = await queryDigifarma(`
        SELECT 
          COD_BARRAS, 
          PRODUTO_ID, 
          CATEGORIA_ID,
          PRODUTO, 
          PROD_SALDO, 
          PROD_PRVENDA, 
          PROD_PRPROMOCAO,
          INICIO_PROMOCAO,
          TERMINO_PROMOCAO,
          PROD_PRCOMPRA,
          VALOR_ULT_COMPRA,
          PROD_CMV,
          TRIBUTACAO_MONOFASICA,
          CST_PIS,
          CST_COFINS,
          ALIQUOTA_ST,
          IMPOSTO_ALIQ,
          NCM,
          CEST
        FROM PRODUTOS 
        WHERE PROD_ATIVO = 'S'
      `);

      console.log(`[Price Manager API] Obtidos ${digifarmaProducts.length} produtos do Digifarma.`);

      // 2. Obter faturamento dos últimos 60 dias das vendas do Firebird
      const data60DiasAtras = new Date();
      data60DiasAtras.setDate(data60DiasAtras.getDate() - 60);
      const data60dStr = formatarDataFirebird(data60DiasAtras);

      const salesRevenue = await queryDigifarma(`
        SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT * iv.ITEMVEND_PRVENDA) as TOTAL_REVENUE
        FROM ITEM_VENDAS iv
        INNER JOIN CAB_VENDAS cv ON cv.VENDA_NOTA_ID = iv.VENDA_NOTA_ID
        WHERE cv.CANCELADO <> 'S' AND cv.VENDA_DATA_HORA >= ?
        GROUP BY iv.PRODUTO_ID
      `, [data60dStr]);

      console.log(`[Price Manager API] Vendas registradas para ${salesRevenue.length} produtos nos últimos 60 dias.`);

      // Criar mapa de faturamento de produtos
      const revenueMap = new Map();
      let totalRevenueGeral = 0;
      for (const r of salesRevenue) {
        const prodId = String(r.PRODUTO_ID);
        const revenue = parseFloat(r.TOTAL_REVENUE || 0);
        revenueMap.set(prodId, revenue);
        totalRevenueGeral += revenue;
      }

      // Ordenar produtos vendidos por faturamento decrescente para calcular curva ABC
      const soldProductsSorted = [...revenueMap.entries()]
        .map(([id, rev]) => ({ id, revenue: rev }))
        .sort((a, b) => b.revenue - a.revenue);

      // Mapear classificação da curva ABC para cada produto
      const curveMap = new Map();
      let cumulativeRevenue = 0;
      for (const p of soldProductsSorted) {
        cumulativeRevenue += p.revenue;
        const percentage = totalRevenueGeral > 0 ? (cumulativeRevenue / totalRevenueGeral) * 100 : 0;
        
        let curve = 'C';
        if (percentage <= 80) {
          curve = 'A';
        } else if (percentage <= 95) {
          curve = 'B';
        }
        curveMap.set(p.id, curve);
      }

      // 3. Atualizar no SQLite local (digifarma_products_cache)
      const deleteStmt = db.prepare("DELETE FROM digifarma_products_cache");
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO digifarma_products_cache 
        (
          codigo_barras, produto_id, categoria_id, descricao, estoque_atual, 
          preco_venda, preco_custo, preco_promocao, preco_normal, curva, 
          tributacao_monofasica, cst_pis, cst_cofins, aliquota_st, imposto_aliq, ncm, cest,
          atualizado_em
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const timestamp = new Date().toISOString();

      // Executa em uma transação SQLite para melhor performance
      const runTransaction = db.transaction((prods) => {
        deleteStmt.run();
        for (const p of prods) {
          const barcode = (p.COD_BARRAS || '').trim() || String(p.PRODUTO_ID);
          if (!barcode) continue;
          
          const prodId = String(p.PRODUTO_ID);
          const curve = curveMap.get(prodId) || 'C';
          
          const normalPrice = parseFloat(p.PROD_PRVENDA || 0);
          const promoPrice = parseFloat(p.PROD_PRPROMOCAO || 0);
          const effectivePrice = getEffectivePrice(p);
          const refPrice = effectivePrice > 0 ? effectivePrice : normalPrice;

          // CORREÇÃO DE CUSTO: Priorizar VALOR_ULT_COMPRA (Custo Líquido Real na NF com Descontos)
          const prCompra = parseFloat(p.PROD_PRCOMPRA || 0);
          const ultCompra = parseFloat(p.VALOR_ULT_COMPRA || 0);
          const cmv = parseFloat(p.PROD_CMV || 0);

          let unitCost = ultCompra > 0 ? ultCompra : (cmv > 0 ? cmv : prCompra);

          // Se o custo ainda for maior que o preço de venda de balcão, trata-se de caixa master/display fracionado
          if (refPrice > 0 && unitCost > refPrice * 1.2) {
            const desc = (p.PRODUTO || '').toUpperCase();
            const match = desc.match(/(?:C\/|COM|CX COM|\/)\s*(\d{1,4})\s*(?:UN|CPR|DRG|ENV|CAP|PC|FL|PCT|AMP)?/);
            if (match && parseInt(match[1]) > 1) {
              const qty = parseInt(match[1]);
              unitCost = unitCost / qty;
            } else if (cmv > 0 && cmv < refPrice) {
              unitCost = cmv;
            } else {
              unitCost = Math.min(unitCost, refPrice * 0.65);
            }
          }
          
          insertStmt.run(
            barcode,
            prodId,
            parseInt(p.CATEGORIA_ID) || 0,
            (p.PRODUTO || '').trim(),
            parseFloat(p.PROD_SALDO || 0),
            effectivePrice,
            unitCost,
            promoPrice,
            normalPrice,
            curve,
            (p.TRIBUTACAO_MONOFASICA || '').trim(),
            (p.CST_PIS || '').trim(),
            (p.CST_COFINS || '').trim(),
            parseFloat(p.ALIQUOTA_ST || 0),
            parseFloat(p.IMPOSTO_ALIQ || 0),
            (p.NCM || '').trim(),
            (p.CEST || '').trim(),
            timestamp
          );
        }
      });

      runTransaction(digifarmaProducts);
      console.log(`[Price Manager API] Cache atualizado: ${digifarmaProducts.length} produtos gravados (considerando Preço de Promoção/Venda).`);

      res.json({
        success: true,
        message: 'Cache atualizado e Curva ABC recalculada com sucesso (Preço de Promoção considerado quando ativo)!',
        count: digifarmaProducts.length
      });

    } catch (err) {
      console.error('[Price Manager API] Erro ao sincronizar cache local:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 3. POST /api/price-manager/update-prices
   * Executa atualização de preços de produtos específicos no Firebird (Digifarma) e no cache SQLite local
   */
  router.post('/update-prices', async (req, res) => {
    try {
      const { updates } = req.body;
      
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: 'Nenhum reajuste de preço foi enviado.' });
      }

      console.log(`[Price Manager API] Recebido pedido de reajuste individual/específico para ${updates.length} produtos.`);

      const successUpdates = [];
      const failedUpdates = [];

      const updateCacheStmt = db.prepare(`
        UPDATE digifarma_products_cache 
        SET preco_venda = ?,
            preco_normal = ?,
            preco_promocao = CASE WHEN preco_promocao > 0 THEN ? ELSE preco_promocao END,
            atualizado_em = ?
        WHERE produto_id = ?
      `);

      for (const item of updates) {
        const prodId = String(item.id);
        const rawPrice = parseFloat(item.price);

        if (isNaN(rawPrice) || rawPrice <= 0) {
          failedUpdates.push({ id: prodId, error: 'Preço inválido.' });
          continue;
        }

        // Aplica regra de arredondamento (finais 0, 5, 9)
        const finalPrice = roundUpToAcceptedCents(rawPrice);

        try {
          // Atualiza Digifarma (Firebird) - Preço de Venda

          await queryDigifarma(
            'UPDATE PRODUTOS SET PROD_PRVENDA = ? WHERE PRODUTO_ID = ?', 
            [finalPrice, prodId]
          );

          // Atualiza Preço de Promoção se o produto possuir promoção ativa
          await queryDigifarma(
            'UPDATE PRODUTOS SET PROD_PRPROMOCAO = ? WHERE PRODUTO_ID = ? AND PROD_PRPROMOCAO > 0', 
            [finalPrice, prodId]
          );

          // Atualiza cache SQLite local
          updateCacheStmt.run(finalPrice, finalPrice, finalPrice, new Date().toISOString(), prodId);

          successUpdates.push({ id: prodId, price: finalPrice });
        } catch (dbErr) {

          console.error(`[Price Manager API] Erro ao atualizar produto ${prodId} no Digifarma:`, dbErr.message);
          failedUpdates.push({ id: prodId, error: dbErr.message });
        }
      }

      res.json({
        success: true,
        message: `Reajuste concluído. Sucesso: ${successUpdates.length} | Falha: ${failedUpdates.length}`,
        successCount: successUpdates.length,
        failedCount: failedUpdates.length,
        failures: failedUpdates
      });
    } catch (err) {
      console.error('[Price Manager API] Erro ao atualizar preços:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 3b. POST /api/price-manager/update-prices-by-filter
   * Aplica reajustes de preço a TODOS os produtos que correspondem aos filtros atuais
   */
  router.post('/update-prices-by-filter', async (req, res) => {
    try {
      const { filter, operationType, value } = req.body;
      if (!filter || !operationType) {
        return res.status(400).json({ error: 'Filtro e tipo de operação são obrigatórios.' });
      }

      const { whereSQL, params } = buildWhereClause(filter);

      // Buscar todos os produtos afetados no SQLite local
      const selectQuery = `
        SELECT 
          c.produto_id as id,
          c.preco_venda as price,
          n.preco_proffer as region_price
        FROM digifarma_products_cache c
        LEFT JOIN napp_prices n ON c.codigo_barras = n.ean
        ${whereSQL}
      `;

      const targetProducts = db.prepare(selectQuery).all(...params);

      if (targetProducts.length === 0) {
        return res.status(400).json({ error: 'Nenhum produto corresponde aos filtros informados.' });
      }

      console.log(`[Price Manager API] Reajustando por filtro ${targetProducts.length} produtos (Operação: ${operationType}, Valor: ${value})...`);

      const updates = [];
      const valNumber = parseFloat(value);

      for (const prod of targetProducts) {
        let newPrice = prod.price;

        if (operationType === 'percentage') {
          if (!isNaN(valNumber)) {
            newPrice = prod.price * (1 + valNumber / 100);
          }
        } else if (operationType === 'fixed') {
          if (!isNaN(valNumber) && valNumber > 0) {
            newPrice = valNumber;
          }
        } else if (operationType === 'region') {
          if (prod.region_price && prod.region_price > 0) {
            newPrice = prod.region_price;
          }
        }

        // Aplica regra de arredondamento para centavos terminados em 0, 5, 9
        newPrice = roundUpToAcceptedCents(newPrice);

        if (newPrice > 0) {
          updates.push({ id: String(prod.id), price: newPrice });
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'Nenhum reajuste válido pôde ser calculado para os produtos filtrados.' });
      }

      const successUpdates = [];
      const failedUpdates = [];

      const updateCacheStmt = db.prepare(`
        UPDATE digifarma_products_cache 
        SET preco_venda = ?,
            preco_normal = ?,
            preco_promocao = CASE WHEN preco_promocao > 0 THEN ? ELSE preco_promocao END,
            atualizado_em = ?
        WHERE produto_id = ?
      `);

      for (const item of updates) {
        try {
          await queryDigifarma(
            'UPDATE PRODUTOS SET PROD_PRVENDA = ? WHERE PRODUTO_ID = ?', 
            [item.price, item.id]
          );

          await queryDigifarma(
            'UPDATE PRODUTOS SET PROD_PRPROMOCAO = ? WHERE PRODUTO_ID = ? AND PROD_PRPROMOCAO > 0', 
            [item.price, item.id]
          );


          updateCacheStmt.run(item.price, item.price, item.price, new Date().toISOString(), item.id);
          successUpdates.push(item);
        } catch (dbErr) {
          console.error(`[Price Manager API] Erro ao atualizar produto ${item.id} no Digifarma:`, dbErr.message);
          failedUpdates.push({ id: item.id, error: dbErr.message });
        }
      }

      res.json({
        success: true,
        message: `Reajuste em lote por filtro concluído! Sucesso: ${successUpdates.length} | Falhas: ${failedUpdates.length}`,
        totalAffected: targetProducts.length,
        successCount: successUpdates.length,
        failedCount: failedUpdates.length,
        failures: failedUpdates
      });

    } catch (err) {
      console.error('[Price Manager API] Erro ao atualizar preços por filtro:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 4. POST /api/price-manager/trigger-napp-scrape
   * Dispara a raspagem da Napp Solutions em background
   */
  router.post('/trigger-napp-scrape', (req, res) => {
    try {
      const { eans } = req.body;
      
      const status = getScrapeStatus();
      if (status.running) {
        return res.status(400).json({ error: 'Um processo de raspagem já está em execução.' });
      }

      runNappScraper(eans).catch(err => {
        console.error('[Price Manager API] Erro assíncrono na raspagem da Napp:', err);
      });

      res.json({
        success: true,
        message: 'Raspagem de preços Napp iniciada em background!'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 5. GET /api/price-manager/scrape-status
   * Retorna o status atual da raspagem
   */
  router.get('/scrape-status', (req, res) => {
    try {
      res.json(getScrapeStatus());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 6. GET /api/price-manager/categories
   * Retorna lista de categorias do Firebird
   */
  router.get('/categories', async (req, res) => {
    try {
        const categories = await queryDigifarma('SELECT CATEGORIA_ID, CATEGORIA FROM CATEGORIA ORDER BY CATEGORIA');
        res.json({
            success: true,
            data: categories.map(c => ({ id: c.CATEGORIA_ID, name: (c.CATEGORIA || '').trim() }))
        });
    } catch (err) {
        console.error('[Price Manager API] Erro ao buscar categorias:', err);
        res.status(500).json({ error: err.message });
    }
  });

  /**
   * 7. POST /api/price-manager/update-category
   * Atualiza a categoria de um produto no Firebird e no cache
   */
  router.post('/update-category', async (req, res) => {
    try {
        const { productId, categoryId } = req.body;
        if (!productId || categoryId === undefined) {
            return res.status(400).json({ error: 'productId e categoryId são obrigatórios.' });
        }
        await queryDigifarma(
            'UPDATE PRODUTOS SET CATEGORIA_ID = ? WHERE PRODUTO_ID = ?',
            [parseInt(categoryId), parseInt(productId)]
        );
        // Atualiza cache SQLite local
        db.prepare('UPDATE digifarma_products_cache SET categoria_id = ? WHERE produto_id = ?')
            .run(parseInt(categoryId), String(productId));
        
        res.json({ success: true, message: 'Categoria atualizada com sucesso!' });
    } catch (err) {
        console.error('[Price Manager API] Erro ao atualizar categoria:', err);
        res.status(500).json({ error: err.message });
    }
  });

  return router;
};
