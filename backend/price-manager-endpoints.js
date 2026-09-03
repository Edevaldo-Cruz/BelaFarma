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
  const search = (query.search || '').trim();
  const curva = query.curva || 'ALL';
  const filterNapp = query.filterNapp || query.profferFilter || 'ALL';
  const profferDiffPercent = parseFloat(query.profferDiffPercent || 0);
  const marginFilter = query.marginFilter || query.costFilter || 'ALL';
  const minPrice = parseFloat(query.minPrice);
  const maxPrice = parseFloat(query.maxPrice);
  const categoria = query.categoria || 'ALL';
  const stockFilter = query.stockFilter || 'IN_STOCK';
  const isNewFilter = query.isNewFilter || 'ALL';

  let whereClauses = [];
  let params = [];

  // Filtro de Estoque
  if (stockFilter === 'IN_STOCK') {
    whereClauses.push('c.estoque_atual > 0');
  } else if (stockFilter === 'OUT_OF_STOCK') {
    whereClauses.push('(c.estoque_atual IS NULL OR c.estoque_atual <= 0)');
  }

  // Busca textual / código / barras
  if (search) {
    whereClauses.push('(c.descricao LIKE ? OR c.codigo_barras LIKE ? OR c.produto_id LIKE ?)');
    const searchLike = `%${search}%`;
    params.push(searchLike, searchLike, searchLike);
  }

  // Curva ABC
  if (curva !== 'ALL') {
    whereClauses.push('c.curva = ?');
    params.push(curva);
  }

  // Filtros Avançados Proffer / NAPP
  if (filterNapp === 'WITH_NAPP') {
    whereClauses.push('n.preco_proffer IS NOT NULL');
  } else if (filterNapp === 'WITHOUT_NAPP') {
    whereClauses.push('n.preco_proffer IS NULL');
  } else if (filterNapp === 'BELOW_AVG') {
    whereClauses.push('COALESCE(n.preco_proffer_medio, n.preco_proffer) IS NOT NULL AND c.preco_venda < COALESCE(n.preco_proffer_medio, n.preco_proffer)');
  } else if (filterNapp === 'BELOW_MIN') {
    whereClauses.push('COALESCE(n.preco_proffer_baixo, n.preco_proffer) IS NOT NULL AND c.preco_venda < COALESCE(n.preco_proffer_baixo, n.preco_proffer)');
  } else if (filterNapp === 'ABOVE_AVG') {
    whereClauses.push('COALESCE(n.preco_proffer_medio, n.preco_proffer) IS NOT NULL AND c.preco_venda > COALESCE(n.preco_proffer_medio, n.preco_proffer)');
  } else if (filterNapp === 'ABOVE_MAX') {
    whereClauses.push('COALESCE(n.preco_proffer_alto, n.preco_proffer) IS NOT NULL AND c.preco_venda > COALESCE(n.preco_proffer_alto, n.preco_proffer)');
  } else if (filterNapp === 'DISCREPANT') {
    whereClauses.push('n.preco_proffer IS NOT NULL AND ABS(c.preco_venda - n.preco_proffer) / c.preco_venda > 0.01');
  }

  // Desvio percentual em relação à média Proffer
  if (!isNaN(profferDiffPercent) && profferDiffPercent > 0) {
    whereClauses.push('COALESCE(n.preco_proffer_medio, n.preco_proffer) IS NOT NULL AND (((COALESCE(n.preco_proffer_medio, n.preco_proffer) - c.preco_venda) / COALESCE(n.preco_proffer_medio, n.preco_proffer)) * 100) >= ?');
    params.push(profferDiffPercent);
  }

  // Filtros de Margem
  if (marginFilter === 'BELOW_COST') {
    whereClauses.push('c.preco_custo > 0 AND c.preco_venda < c.preco_custo');
  } else if (marginFilter === 'LOW_MARGIN') {
    whereClauses.push('c.preco_custo > 0 AND ((c.preco_venda - c.preco_custo) / c.preco_venda * 100) < 20');
  } else if (marginFilter === 'HIGH_MARGIN') {
    whereClauses.push('c.preco_custo > 0 AND ((c.preco_venda - c.preco_custo) / c.preco_venda * 100) > 50');
  }

  // Filtro de Novos Produtos / Entradas Recentes
  if (isNewFilter === 'NEW_ENTRIES') {
    whereClauses.push("c.produto_id IN (SELECT DISTINCT produto_id FROM mural_variacao_precos WHERE status = 'pendente')");
  }

  // Faixa de Preço
  if (!isNaN(minPrice) && minPrice >= 0) {
    whereClauses.push('c.preco_venda >= ?');
    params.push(minPrice);
  }

  if (!isNaN(maxPrice) && maxPrice > 0) {
    whereClauses.push('c.preco_venda <= ?');
    params.push(maxPrice);
  }

  // Categoria
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

/**
 * Executa as etapas de reajuste gradual que venceram a data de execução
 */
async function processScheduledPriceSteps(db) {
  try {
    const nowIso = new Date().toISOString();
    const dueSteps = db.prepare(`
      SELECT * FROM price_scheduled_steps 
      WHERE status = 'ativo' AND proxima_execucao <= ?
    `).all(nowIso);

    if (!dueSteps || dueSteps.length === 0) return;

    console.log(`[PriceManager Engine] Processando ${dueSteps.length} etapas de reajuste escalonado agendadas...`);

    const updateCacheStmt = db.prepare(`
      UPDATE digifarma_products_cache 
      SET preco_venda = ?,
          preco_normal = ?,
          atualizado_em = ?
      WHERE produto_id = ?
    `);

    const insertSnapshotStmt = db.prepare(`
      INSERT INTO price_change_snapshots (
        id, produto_id, descricao, cod_barras, preco_anterior, novo_preco, preco_custo, tipo, motivo, usuario, data_alteracao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'escalonado', ?, ?, datetime('now', 'localtime'))
    `);

    const updateScheduleStmt = db.prepare(`
      UPDATE price_scheduled_steps 
      SET preco_atual = ?,
          etapa_atual = ?,
          proxima_execucao = ?,
          status = ?,
          ultima_atualizacao = datetime('now', 'localtime')
      WHERE id = ?
    `);

    for (const step of dueSteps) {
      try {
        const prodId = step.produto_id;
        const currentPrice = Number(step.preco_atual);
        const targetPrice = Number(step.preco_alvo);
        const maxPct = Number(step.max_pct_por_etapa || 5);
        const intervalDays = Number(step.intervalo_dias || 7);

        // Calcula próximo preço
        let nextPrice = currentPrice * (1 + maxPct / 100);
        if (targetPrice > currentPrice && nextPrice >= targetPrice) {
          nextPrice = targetPrice;
        } else if (targetPrice < currentPrice && nextPrice <= targetPrice) {
          nextPrice = targetPrice;
        }
        nextPrice = roundUpToAcceptedCents(nextPrice);

        // Grava Snapshot de Backup
        const snapId = `snap_${Date.now()}_${prodId}`;
        insertSnapshotStmt.run(
          snapId,
          prodId,
          step.descricao,
          step.cod_barras,
          currentPrice,
          nextPrice,
          0,
          `Etapa ${step.etapa_atual} de ${step.total_etapas} (Reajuste Escalonado)`,
          step.criado_por || 'Sistema Automático'
        );

        // Atualiza Digifarma Firebird
        await queryDigifarma('UPDATE PRODUTOS SET PROD_PRVENDA = ? WHERE PRODUTO_ID = ?', [nextPrice, prodId]);
        await queryDigifarma('UPDATE PRODUTOS SET PROD_PRPROMOCAO = ? WHERE PRODUTO_ID = ? AND PROD_PRPROMOCAO > 0', [nextPrice, prodId]);

        // Atualiza SQLite cache
        updateCacheStmt.run(nextPrice, nextPrice, new Date().toISOString(), prodId);

        // Atualiza status do agendamento
        const isComplete = nextPrice === targetPrice || step.etapa_atual >= step.total_etapas;
        const nextExec = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString();

        updateScheduleStmt.run(
          nextPrice,
          step.etapa_atual + 1,
          nextExec,
          isComplete ? 'concluido' : 'ativo',
          step.id
        );

        console.log(`[PriceManager Engine] ✅ Produto ${prodId} (${step.descricao}) reajustado de R$ ${currentPrice} para R$ ${nextPrice} (Etapa ${step.etapa_atual}).`);
      } catch (stepErr) {
        console.error(`[PriceManager Engine] Erro ao executar etapa do produto ${step.produto_id}:`, stepErr.message);
      }
    }
  } catch (err) {
    console.error('[PriceManager Engine] Erro ao processar etapas de reajuste:', err);
  }
}

module.exports = function (db) {
  const router = express.Router();

  /**
   * 1. GET /api/price-manager/search
   * Busca rápida e otimizada por nome, código EAN e ID para autocomplete
   */
  router.get('/search', (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      const limit = parseInt(req.query.limit) || 12;

      if (!q || q.length < 2) {
        return res.json([]);
      }

      const searchLike = `%${q}%`;
      const rows = db.prepare(`
        SELECT 
          c.produto_id as PRODUTO_ID,
          c.descricao as PRODUTO,
          c.codigo_barras as COD_BARRAS,
          c.preco_venda as PROD_PRVENDA,
          c.preco_promocao as PROD_PRPROMOCAO,
          c.preco_custo as PROD_PRCOMPRA,
          c.estoque_atual as ESTOQUE,
          c.curva as CURVA,
          COALESCE(n.preco_proffer_medio, n.preco_proffer) as PRECO_PROFFER_MEDIO,
          COALESCE(n.preco_proffer_baixo, n.preco_proffer) as PRECO_PROFFER_BAIXO,
          COALESCE(n.preco_proffer_alto, n.preco_proffer) as PRECO_PROFFER_ALTO
        FROM digifarma_products_cache c
        LEFT JOIN napp_prices n ON c.codigo_barras = n.ean
        WHERE c.descricao LIKE ? OR c.codigo_barras LIKE ? OR c.produto_id LIKE ?
        ORDER BY 
          CASE WHEN c.produto_id = ? THEN 1
               WHEN c.codigo_barras = ? THEN 2
               WHEN c.descricao LIKE ? THEN 3
               ELSE 4 END,
          c.curva ASC, c.descricao ASC
        LIMIT ?
      `).all(searchLike, searchLike, searchLike, q, q, `${q}%`, limit);

      res.json(rows);
    } catch (err) {
      console.error('[Price Manager API] Erro na busca rápida:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 2. GET /api/price-manager/products
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
        LEFT JOIN napp_prices n ON c.codigo_barras = n.ean
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
        LEFT JOIN napp_prices n ON c.codigo_barras = n.ean
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
   * 3. GET /api/price-manager/stats
   * Retorna estatísticas resumidas do catálogo
   */
  router.get('/stats', (req, res) => {
    try {
      const prodStats = db.prepare(`
        SELECT 
          COUNT(1) as total,
          SUM(CASE WHEN curva = 'A' THEN 1 ELSE 0 END) as curveA,
          SUM(CASE WHEN curva = 'B' THEN 1 ELSE 0 END) as curveB,
          SUM(CASE WHEN curva = 'C' THEN 1 ELSE 0 END) as curveC,
          SUM(CASE WHEN preco_custo > 0 AND preco_venda < preco_custo THEN 1 ELSE 0 END) as belowCost
        FROM digifarma_products_cache
      `).get();

      const nappStats = db.prepare(`
        SELECT 
          COUNT(1) as withNapp,
          SUM(CASE WHEN c.preco_venda < COALESCE(n.preco_proffer_medio, n.preco_proffer) THEN 1 ELSE 0 END) as belowMarketAvg,
          SUM(CASE WHEN c.preco_venda < COALESCE(n.preco_proffer_baixo, n.preco_proffer) THEN 1 ELSE 0 END) as belowMarketMin,
          SUM(CASE WHEN ABS(c.preco_venda - COALESCE(n.preco_proffer_medio, n.preco_proffer)) / c.preco_venda > 0.01 THEN 1 ELSE 0 END) as discrepant
        FROM napp_prices n
        JOIN digifarma_products_cache c ON n.ean = c.codigo_barras
        WHERE COALESCE(n.preco_proffer_medio, n.preco_proffer) IS NOT NULL
      `).get();

      const scheduledCountRow = db.prepare(`SELECT COUNT(1) as total FROM price_scheduled_steps WHERE status = 'ativo'`).get();
      const snapshotsCountRow = db.prepare(`SELECT COUNT(1) as total FROM price_change_snapshots`).get();

      res.json({
        total: prodStats ? prodStats.total || 0 : 0,
        curveA: prodStats ? prodStats.curveA || 0 : 0,
        curveB: prodStats ? prodStats.curveB || 0 : 0,
        curveC: prodStats ? prodStats.curveC || 0 : 0,
        belowCost: prodStats ? prodStats.belowCost || 0 : 0,
        withNapp: nappStats ? nappStats.withNapp || 0 : 0,
        belowMarketAvg: nappStats ? nappStats.belowMarketAvg || 0 : 0,
        belowMarketMin: nappStats ? nappStats.belowMarketMin || 0 : 0,
        discrepant: nappStats ? nappStats.discrepant || 0 : 0,
        activeSchedules: scheduledCountRow ? scheduledCountRow.total : 0,
        totalSnapshots: snapshotsCountRow ? snapshotsCountRow.total : 0
      });
    } catch (err) {
      console.error('[Price Manager API] Erro ao obter estatísticas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 4. POST /api/price-manager/apply-price
   * Aplica preço direto para 1 produto com snapshot de backup e log de auditoria
   */
  router.post('/apply-price', async (req, res) => {
    try {
      const { produtoId, novoPreco, motivo, usuario, tipo } = req.body;

      if (!produtoId || isNaN(novoPreco) || novoPreco <= 0) {
        return res.status(400).json({ error: 'Produto ID e Novo Preço válido são obrigatórios.' });
      }

      const prodId = parseInt(produtoId);
      const finalPrice = roundUpToAcceptedCents(parseFloat(novoPreco));

      // Obter produto atual para snapshot de backup (tentando cache e Firebird)
      let descricao = req.body.descricao || '';
      let codBarras = req.body.codBarras || '';
      let previousPrice = parseFloat(req.body.precoAnterior) || 0;
      let precoCusto = parseFloat(req.body.precoCusto) || 0;

      const prodCache = db.prepare(`
        SELECT * FROM digifarma_products_cache 
        WHERE produto_id = ? OR CAST(produto_id AS INTEGER) = ? OR (codigo_barras != '' AND codigo_barras = ?)
      `).get(String(prodId), prodId, String(codBarras));

      if (prodCache) {
        if (!previousPrice) previousPrice = prodCache.preco_venda || prodCache.preco_normal || 0;
        if (!descricao) descricao = prodCache.descricao;
        if (!codBarras) codBarras = prodCache.codigo_barras;
        if (!precoCusto) precoCusto = prodCache.preco_custo;
      }

      // Se ainda não tiver nome ou preço anterior, consulta o Firebird do Digifarma diretamente
      if (!descricao || !previousPrice) {
        try {
          const fbProd = await queryDigifarma('SELECT PRODUTO, APRESENTACAO, COD_BARRAS, PROD_PRVENDA, PROD_PRPROMOCAO, PROD_PRCOMPRA FROM PRODUTOS WHERE PRODUTO_ID = ?', [prodId]);
          if (fbProd && fbProd[0]) {
            const p = fbProd[0];
            if (!descricao) descricao = (p.PRODUTO || '').trim() + (p.APRESENTACAO ? ` ${(p.APRESENTACAO).trim()}` : '');
            if (!previousPrice) previousPrice = (p.PROD_PRPROMOCAO > 0 ? p.PROD_PRPROMOCAO : p.PROD_PRVENDA) || 0;
            if (!codBarras) codBarras = (p.COD_BARRAS || '').trim();
            if (!precoCusto) precoCusto = p.PROD_PRCOMPRA || 0;
          }
        } catch (fbErr) {}
      }

      if (!descricao) descricao = `Produto Cód ${prodId}`;
      if (!previousPrice) previousPrice = finalPrice;

      // 1. Gravar Snapshot de Backup
      const snapId = `snap_${Date.now()}_${prodId}`;
      db.prepare(`
        INSERT INTO price_change_snapshots (
          id, produto_id, descricao, cod_barras, preco_anterior, novo_preco, preco_custo, tipo, motivo, usuario
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        snapId,
        prodId,
        descricao,
        codBarras,
        previousPrice,
        finalPrice,
        precoCusto,
        tipo || 'direto',
        motivo || 'Alteração manual no Gestão de Preços / Simulador',
        usuario || 'Administrador'
      );

      // 2. Gravar Log de Auditoria em logs
      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      try {
        db.prepare(`
          INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
          VALUES (?, datetime('now', 'localtime'), ?, ?, 'PRICE_UPDATE', 'PRECOS', ?)
        `).run(
          logId,
          usuario || 'Administrador',
          'admin',
          `Preço de "${descricao}" (Cód ${prodId}) alterado de R$ ${previousPrice.toFixed(2)} para R$ ${finalPrice.toFixed(2)}. Motivo: ${motivo || 'Reajuste'}`
        );
      } catch (logErr) {}

      // 3. Atualizar no Digifarma Firebird
      await queryDigifarma('UPDATE PRODUTOS SET PROD_PRVENDA = ? WHERE PRODUTO_ID = ?', [finalPrice, prodId]);
      await queryDigifarma('UPDATE PRODUTOS SET PROD_PRPROMOCAO = ? WHERE PRODUTO_ID = ? AND PROD_PRPROMOCAO > 0', [finalPrice, prodId]);

      // 4. Atualizar no SQLite Cache Local
      db.prepare(`
        UPDATE digifarma_products_cache 
        SET preco_venda = ?, preco_normal = ?, atualizado_em = datetime('now', 'localtime')
        WHERE produto_id = ?
      `).run(finalPrice, finalPrice, prodId);

      res.json({
        success: true,
        message: `✅ Preço de "${descricao}" alterado para R$ ${finalPrice.toFixed(2)} com backup registrado!`,
        snapshotId: snapId,
        newPrice: finalPrice,
        previousPrice
      });
    } catch (err) {
      console.error('[Price Manager API] Erro ao aplicar preço:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 5. POST /api/price-manager/schedule-step
   * Cria agendamento de reajuste escalonado (gradual)
   */
  router.post('/schedule-step', async (req, res) => {
    try {
      const { produtoId, precoAlvo, maxPctPorEtapa, intervaloDias, usuario, motivo } = req.body;

      if (!produtoId || isNaN(precoAlvo) || precoAlvo <= 0) {
        return res.status(400).json({ error: 'Produto ID e Preço Alvo válido são obrigatórios.' });
      }

      const prodId = parseInt(produtoId);
      const targetPrice = roundUpToAcceptedCents(parseFloat(precoAlvo));
      const maxPct = Math.max(1, parseFloat(maxPctPorEtapa) || 5.0);
      const intervalDays = Math.max(1, parseInt(intervaloDias) || 7);

      const prodCache = db.prepare('SELECT * FROM digifarma_products_cache WHERE produto_id = ?').get(prodId);
      if (!prodCache) {
        return res.status(404).json({ error: 'Produto não encontrado no cache.' });
      }

      const currentPrice = Number(prodCache.preco_venda);
      if (currentPrice === targetPrice) {
        return res.status(400).json({ error: 'O preço atual já é igual ao preço alvo.' });
      }

      // Calcula número total de etapas
      let simPrice = currentPrice;
      let totalSteps = 0;
      while ((targetPrice > simPrice && simPrice < targetPrice) || (targetPrice < simPrice && simPrice > targetPrice)) {
        totalSteps++;
        let stepPrice = simPrice * (1 + maxPct / 100);
        if (stepPrice >= targetPrice) break;
        simPrice = stepPrice;
        if (totalSteps > 20) break; // Segurança
      }
      totalSteps = Math.max(1, totalSteps);

      // Aplica a primeira etapa imediatamente
      let firstStepPrice = currentPrice * (1 + maxPct / 100);
      if (firstStepPrice >= targetPrice) firstStepPrice = targetPrice;
      firstStepPrice = roundUpToAcceptedCents(firstStepPrice);

      const schedId = `sched_${Date.now()}_${prodId}`;
      const nextExec = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString();
      const isCompleted = firstStepPrice === targetPrice || totalSteps <= 1;

      // 1. Grava Snapshot de Backup
      const snapId = `snap_${Date.now()}_${prodId}`;
      db.prepare(`
        INSERT INTO price_change_snapshots (
          id, produto_id, descricao, cod_barras, preco_anterior, novo_preco, preco_custo, tipo, motivo, usuario
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'escalonado', ?, ?)
      `).run(
        snapId,
        prodId,
        prodCache.descricao,
        prodCache.codigo_barras,
        currentPrice,
        firstStepPrice,
        prodCache.preco_custo,
        `Reajuste Escalonado Etapa 1/${totalSteps}: ${motivo || 'Subida gradual'}`,
        usuario || 'Administrador'
      );

      // 2. Atualiza Digifarma Firebird na 1ª etapa
      await queryDigifarma('UPDATE PRODUTOS SET PROD_PRVENDA = ? WHERE PRODUTO_ID = ?', [firstStepPrice, prodId]);
      await queryDigifarma('UPDATE PRODUTOS SET PROD_PRPROMOCAO = ? WHERE PRODUTO_ID = ? AND PROD_PRPROMOCAO > 0', [firstStepPrice, prodId]);

      // 3. Atualiza SQLite Cache
      db.prepare(`
        UPDATE digifarma_products_cache 
        SET preco_venda = ?, preco_normal = ?, atualizado_em = datetime('now', 'localtime')
        WHERE produto_id = ?
      `).run(firstStepPrice, firstStepPrice, prodId);

      // 4. Insere registro de agendamento escalonado
      db.prepare(`
        INSERT INTO price_scheduled_steps (
          id, produto_id, descricao, cod_barras, preco_inicial, preco_alvo, preco_atual,
          max_pct_por_etapa, intervalo_dias, etapa_atual, total_etapas, proxima_execucao,
          status, criado_por, ultima_atualizacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(
        schedId,
        prodId,
        prodCache.descricao,
        prodCache.codigo_barras,
        currentPrice,
        targetPrice,
        firstStepPrice,
        maxPct,
        intervalDays,
        totalSteps,
        nextExec,
        isCompleted ? 'concluido' : 'ativo',
        usuario || 'Administrador'
      );

      res.json({
        success: true,
        message: `✅ 1ª Etapa aplicada: R$ ${currentPrice.toFixed(2)} ➔ R$ ${firstStepPrice.toFixed(2)}. ${isCompleted ? 'Preço alvo atingido!' : `Próximo reajuste (+${maxPct}%) agendado para daqui a ${intervalDays} dias.`}`,
        firstStepPrice,
        totalSteps,
        isCompleted
      });
    } catch (err) {
      console.error('[Price Manager API] Erro ao agendar reajuste escalonado:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 6. GET /api/price-manager/scheduled-steps
   * Lista todos os reajustes escalonados ativos e recentes
   */
  router.get('/scheduled-steps', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT * FROM price_scheduled_steps 
        ORDER BY CASE WHEN status = 'ativo' THEN 1 ELSE 2 END, proxima_execucao ASC 
        LIMIT 50
      `).all();
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('[Price Manager API] Erro ao listar agendamentos:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 7. POST /api/price-manager/scheduled-steps/cancel
   * Cancela um agendamento escalonado
   */
  router.post('/scheduled-steps/cancel', (req, res) => {
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'ID do agendamento é obrigatório.' });

      db.prepare(`UPDATE price_scheduled_steps SET status = 'cancelado' WHERE id = ?`).run(id);
      res.json({ success: true, message: 'Agendamento cancelado com sucesso.' });
    } catch (err) {
      console.error('[Price Manager API] Erro ao cancelar agendamento:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 8. GET /api/price-manager/snapshots
   * Lista o histórico de snapshots de backup de preços e calcula impacto no faturamento
   */
  router.get('/snapshots', (req, res) => {
    try {
      // Auto-recupera nomes de produtos que ficaram como 'Produto ID %' se existirem no cache
      try {
        db.prepare(`
          UPDATE price_change_snapshots 
          SET descricao = (
            SELECT c.descricao FROM digifarma_products_cache c 
            WHERE c.produto_id = price_change_snapshots.produto_id OR CAST(c.produto_id AS TEXT) = CAST(price_change_snapshots.produto_id AS TEXT) 
            LIMIT 1
          )
          WHERE (descricao LIKE 'Produto ID%' OR descricao LIKE 'Produto Cód%') 
            AND EXISTS (
              SELECT 1 FROM digifarma_products_cache c 
              WHERE c.produto_id = price_change_snapshots.produto_id OR CAST(c.produto_id AS TEXT) = CAST(price_change_snapshots.produto_id AS TEXT)
            )
        `).run();
      } catch (autoErr) {}

      const limit = parseInt(req.query.limit) || 100;
      const period = req.query.period || 'all'; // 'today', '7d', '30d', 'month', 'all'
      const search = (req.query.search || '').trim();

      let whereClauses = [];
      let params = [];

      if (period === 'today') {
        whereClauses.push("date(s.data_alteracao) = date('now', 'localtime')");
      } else if (period === '7d') {
        whereClauses.push("s.data_alteracao >= datetime('now', '-7 days', 'localtime')");
      } else if (period === '30d') {
        whereClauses.push("s.data_alteracao >= datetime('now', '-30 days', 'localtime')");
      } else if (period === 'month') {
        whereClauses.push("strftime('%Y-%m', s.data_alteracao) = strftime('%Y-%m', 'now', 'localtime')");
      }

      if (search) {
        whereClauses.push("(s.descricao LIKE ? OR s.cod_barras LIKE ? OR CAST(s.produto_id AS TEXT) LIKE ?)");
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
      }

      const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const query = `
        SELECT 
          s.id,
          s.produto_id,
          COALESCE(NULLIF(c.descricao, ''), NULLIF(s.descricao, ''), 'Produto Cód ' || s.produto_id) as descricao,
          COALESCE(NULLIF(s.cod_barras, ''), c.codigo_barras, '') as cod_barras,
          CASE 
            WHEN s.preco_anterior > 0 THEN s.preco_anterior 
            WHEN c.preco_normal > 0 THEN c.preco_normal
            ELSE s.novo_preco 
          END as preco_anterior,
          s.novo_preco,
          s.preco_custo,
          s.tipo,
          s.motivo,
          s.usuario,
          s.data_alteracao,
          s.revertido,
          s.revertido_em,
          s.revertido_por,
          c.curva,
          c.estoque_atual,
          CASE 
            WHEN s.preco_anterior > 0 THEN (s.novo_preco - s.preco_anterior)
            ELSE 0 
          END as diff_preco,
          CASE 
            WHEN s.preco_anterior > 0 THEN round(((s.novo_preco - s.preco_anterior) / s.preco_anterior) * 100, 2)
            ELSE 0 
          END as diff_percentual,
          CASE 
            WHEN c.curva = 'A' THEN 35
            WHEN c.curva = 'B' THEN 15
            ELSE 5 
          END as volume_mensal_estimado,
          round((CASE WHEN s.preco_anterior > 0 THEN (s.novo_preco - s.preco_anterior) ELSE 0 END) * (CASE WHEN c.curva = 'A' THEN 35 WHEN c.curva = 'B' THEN 15 ELSE 5 END), 2) as impacto_mensal_faturamento,
          round(((CASE WHEN s.preco_anterior > 0 THEN (s.novo_preco - s.preco_anterior) ELSE 0 END) * (CASE WHEN c.curva = 'A' THEN 35 WHEN c.curva = 'B' THEN 15 ELSE 5 END)) * 0.85, 2) as impacto_mensal_lucro
        FROM price_change_snapshots s
        LEFT JOIN digifarma_products_cache c ON (s.produto_id = c.produto_id OR CAST(s.produto_id AS TEXT) = c.produto_id OR (s.cod_barras != '' AND s.cod_barras = c.codigo_barras))
        ${whereSQL}
        ORDER BY s.data_alteracao DESC 
        LIMIT ?
      `;

      const rows = db.prepare(query).all(...params, limit);

      // Métricas Consolidadas do Impacto
      let totalChanges = rows.length;
      let totalIncrease = 0;
      let totalDecrease = 0;
      let totalReverted = 0;
      let totalMonthlyRevenueImpact = 0;
      let totalMonthlyProfitImpact = 0;
      let sumPct = 0;

      for (const r of rows) {
        if (r.revertido) {
          totalReverted++;
        } else {
          if (r.diff_preco > 0) totalIncrease++;
          else if (r.diff_preco < 0) totalDecrease++;

          totalMonthlyRevenueImpact += (r.impacto_mensal_faturamento || 0);
          totalMonthlyProfitImpact += (r.impacto_mensal_lucro || 0);
          sumPct += (r.diff_percentual || 0);
        }
      }

      const averagePriceChangePct = (totalChanges - totalReverted) > 0 
        ? roundUpToAcceptedCents(sumPct / (totalChanges - totalReverted)) 
        : 0;

      res.json({ 
        success: true, 
        data: rows,
        summary: {
          totalChanges,
          totalIncrease,
          totalDecrease,
          totalReverted,
          activeChanges: totalChanges - totalReverted,
          totalMonthlyRevenueImpact: roundUpToAcceptedCents(totalMonthlyRevenueImpact),
          totalMonthlyProfitImpact: roundUpToAcceptedCents(totalMonthlyProfitImpact),
          averagePriceChangePct
        }
      });
    } catch (err) {
      console.error('[Price Manager API] Erro ao listar snapshots e calcular impacto:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 9. POST /api/price-manager/rollback
   * Reverte o preço de um produto de volta para o snapshot gravado no Digifarma
   */
  router.post('/rollback', async (req, res) => {
    try {
      const { snapshotId, usuario } = req.body;
      if (!snapshotId) return res.status(400).json({ error: 'ID do snapshot é obrigatório.' });

      const snap = db.prepare('SELECT * FROM price_change_snapshots WHERE id = ?').get(snapshotId);
      if (!snap) {
        return res.status(404).json({ error: 'Snapshot de backup não encontrado.' });
      }

      if (snap.revertido) {
        return res.status(400).json({ error: 'Este snapshot já foi revertido anteriormente.' });
      }

      const prodId = snap.produto_id;
      let revertPrice = parseFloat(snap.preco_anterior) || 0;

      // Se o preco_anterior estava zerado no snapshot, tenta recuperar o preço real
      if (revertPrice <= 0) {
        // 1. Tentar achar snapshot anterior deste produto que tenha preço válido
        const prevSnap = db.prepare(`
          SELECT preco_anterior, novo_preco FROM price_change_snapshots 
          WHERE produto_id = ? AND id != ? AND (preco_anterior > 0 OR novo_preco > 0)
          ORDER BY data_alteracao DESC LIMIT 1
        `).get(prodId, snapshotId);

        if (prevSnap && prevSnap.preco_anterior > 0) {
          revertPrice = parseFloat(prevSnap.preco_anterior);
        } else if (prevSnap && prevSnap.novo_preco > 0) {
          revertPrice = parseFloat(prevSnap.novo_preco);
        }

        // 2. Tentar buscar no cache do Digifarma
        if (revertPrice <= 0) {
          const cacheProd = db.prepare(`
            SELECT preco_normal, preco_venda FROM digifarma_products_cache 
            WHERE produto_id = ? OR CAST(produto_id AS INTEGER) = ?
          `).get(String(prodId), prodId);

          if (cacheProd && cacheProd.preco_normal > 0) {
            revertPrice = parseFloat(cacheProd.preco_normal);
          } else if (cacheProd && cacheProd.preco_venda > 0) {
            revertPrice = parseFloat(cacheProd.preco_venda);
          }
        }

        // 3. Tentar buscar no Firebird direto
        if (revertPrice <= 0) {
          try {
            const fbProd = await queryDigifarma('SELECT PROD_PRVENDA, PROD_PRPROMOCAO FROM PRODUTOS WHERE PRODUTO_ID = ?', [prodId]);
            if (fbProd && fbProd[0]) {
              const p = fbProd[0];
              if (p.PROD_PRVENDA > 0) revertPrice = parseFloat(p.PROD_PRVENDA);
              else if (p.PROD_PRPROMOCAO > 0) revertPrice = parseFloat(p.PROD_PRPROMOCAO);
            }
          } catch (fbErr) {}
        }
      }

      // TRAVA DE SEGURANÇA: NUNCA permitir reverter para R$ 0,00
      if (isNaN(revertPrice) || revertPrice <= 0) {
        return res.status(400).json({
          error: `⚠️ Não é possível reverter: o preço anterior deste registro está zerado (R$ 0,00). Por segurança da loja, o Digifarma não aceita preço zero.`
        });
      }

      revertPrice = roundUpToAcceptedCents(revertPrice);

      // 1. Reverte no Digifarma Firebird
      await queryDigifarma('UPDATE PRODUTOS SET PROD_PRVENDA = ? WHERE PRODUTO_ID = ?', [revertPrice, prodId]);
      await queryDigifarma('UPDATE PRODUTOS SET PROD_PRPROMOCAO = ? WHERE PRODUTO_ID = ? AND PROD_PRPROMOCAO > 0', [revertPrice, prodId]);

      // 2. Reverte no SQLite Cache
      db.prepare(`
        UPDATE digifarma_products_cache 
        SET preco_venda = ?, preco_normal = ?, atualizado_em = datetime('now', 'localtime')
        WHERE produto_id = ?
      `).run(revertPrice, revertPrice, prodId);

      // 3. Atualiza o snapshot com o preco_anterior corrigido e marca como Revertido
      db.prepare(`
        UPDATE price_change_snapshots 
        SET preco_anterior = ?, revertido = 1, revertido_em = datetime('now', 'localtime'), revertido_por = ?
        WHERE id = ?
      `).run(revertPrice, usuario || 'Administrador', snapshotId);

      // 4. Log de Auditoria
      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      try {
        db.prepare(`
          INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
          VALUES (?, datetime('now', 'localtime'), ?, ?, 'PRICE_ROLLBACK', 'PRECOS', ?)
        `).run(
          logId,
          usuario || 'Administrador',
          'admin',
          `REVERSÃO (ROLLBACK): Preço de "${snap.descricao}" (Cód ${prodId}) revertido com segurança para R$ ${revertPrice.toFixed(2)}.`
        );
      } catch (logErr) {}

      res.json({
        success: true,
        message: `✅ Preço de "${snap.descricao}" revertido para R$ ${revertPrice.toFixed(2)} no Digifarma com sucesso!`,
        revertedPrice: revertPrice
      });
    } catch (err) {
      console.error('[Price Manager API] Erro ao reverter preço:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 10. POST /api/price-manager/sync-cache
   * Recalcula Curva ABC e sincroniza cache Digifarma
   */
  router.post('/sync-cache', async (req, res) => {
    try {
      console.log('[Price Manager API] Iniciando sincronização e recálculo da Curva ABC...');
      
      const digifarmaProducts = await queryDigifarma(`
        SELECT 
          PRODUTO_ID,
          PRODUTO,
          APRESENTACAO,
          COD_BARRAS,
          CATEGORIA_ID,
          ESTOQUE,
          PROD_PRVENDA,
          PROD_PRCOMPRA,
          PROD_PRPROMOCAO,
          INICIO_PROMOCAO,
          TERMINO_PROMOCAO,
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

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dataInicioStr = formatarDataFirebird(thirtyDaysAgo);

      let salesData = [];
      try {
        salesData = await queryDigifarma(`
          SELECT 
            iv.PRODUTO_ID,
            SUM(iv.ITEMVEND_QUANT) as TOTAL_QTD,
            SUM(iv.ITEMVEND_PRVENDA * iv.ITEMVEND_QUANT) as TOTAL_VALOR
          FROM ITEM_VENDAS iv
          JOIN CAB_VENDAS cv ON iv.VENDA_NOTA_ID = cv.VENDA_NOTA_ID
          WHERE cv.CANCELADO <> 'S' AND cv.VENDA_DATA_HORA >= '${dataInicioStr}'
          GROUP BY iv.PRODUTO_ID
        `, [], 60000);
      } catch (salesErr) {
        console.warn('[Price Manager API] Aviso ao obter histórico de vendas para Curva ABC:', salesErr.message);
      }

      const salesMap = new Map();
      let totalRevenue = 0;

      for (const sale of salesData) {
        const val = parseFloat(sale.TOTAL_VALOR || 0);
        salesMap.set(sale.PRODUTO_ID, val);
        totalRevenue += val;
      }

      const productsWithSales = digifarmaProducts.map(p => {
        const revenue = salesMap.get(p.PRODUTO_ID) || 0;
        return { ...p, revenue };
      });

      productsWithSales.sort((a, b) => b.revenue - a.revenue);

      let accumulated = 0;
      const productsWithCurve = productsWithSales.map(p => {
        accumulated += p.revenue;
        const accumulatedPercent = totalRevenue > 0 ? (accumulated / totalRevenue) * 100 : 100;
        
        let curve = 'C';
        if (accumulatedPercent <= 80) {
          curve = 'A';
        } else if (accumulatedPercent <= 95) {
          curve = 'B';
        }

        return { ...p, curve };
      });

      const insertOrReplaceStmt = db.prepare(`
        INSERT OR REPLACE INTO digifarma_products_cache (
          produto_id, descricao, codigo_barras, categoria_id, estoque_atual,
          preco_venda, preco_custo, preco_promocao, preco_normal, curva, 
          tributacao_monofasica, cst_pis, cst_cofins, aliquota_st, imposto_aliq, ncm, cest,
          atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((prods) => {
        for (const p of prods) {
          const effectivePrice = getEffectivePrice(p);
          const normalPrice = parseFloat(p.PROD_PRVENDA || 0);
          const promoPrice = parseFloat(p.PROD_PRPROMOCAO || 0);

          insertOrReplaceStmt.run(
            p.PRODUTO_ID,
            (p.PRODUTO || '').trim() + (p.APRESENTACAO ? ` ${(p.APRESENTACAO).trim()}` : ''),
            (p.COD_BARRAS || '').trim(),
            p.CATEGORIA_ID ? parseInt(p.CATEGORIA_ID) : null,
            parseFloat(p.ESTOQUE || 0),
            effectivePrice,
            parseFloat(p.PROD_PRCOMPRA || 0),
            promoPrice,
            normalPrice,
            p.curve,
            p.TRIBUTACAO_MONOFASICA || null,
            p.CST_PIS || null,
            p.CST_COFINS || null,
            p.ALIQUOTA_ST ? parseFloat(p.ALIQUOTA_ST) : null,
            p.IMPOSTO_ALIQ ? parseFloat(p.IMPOSTO_ALIQ) : null,
            p.NCM ? String(p.NCM).trim() : null,
            p.CEST ? String(p.CEST).trim() : null,
            new Date().toISOString()
          );
        }
      });

      insertMany(productsWithCurve);

      res.json({
        success: true,
        message: 'Cache atualizado e Curva ABC recalculada com sucesso!',
        count: digifarmaProducts.length
      });
    } catch (err) {
      console.error('[Price Manager API] Erro ao sincronizar cache local:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 11. POST /api/price-manager/trigger-napp-scrape
   */
  router.post('/trigger-napp-scrape', (req, res) => {
    try {
      const { eans } = req.body;
      const status = getScrapeStatus();
      if (status.running) {
        return res.status(400).json({ error: 'Um processo de raspagem já está em execução.' });
      }

      runNappScraper(eans).catch(err => {
        console.error('[Price Manager API] Erro assíncrono na raspagem Napp:', err);
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
   * 12. GET /api/price-manager/scrape-status
   */
  router.get('/scrape-status', (req, res) => {
    try {
      res.json(getScrapeStatus());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 13. GET /api/price-manager/categories
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
   * 14. POST /api/price-manager/update-category
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

module.exports.processScheduledPriceSteps = processScheduledPriceSteps;
