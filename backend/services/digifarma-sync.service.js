const { queryDigifarma } = require('./digifarma.service');

function formatarDataFirebird(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

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
 * Atualiza o registro de metadados da tabela sincronizada
 */
function updateSyncMetadata(db, tabela, total, duracaoMs, status = 'ok', erro = null) {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO digifarma_sync_metadata (
        tabela, ultima_sincronizacao, total_registros, duracao_ms, status, mensagem_erro
      ) VALUES (?, datetime('now', 'localtime'), ?, ?, ?, ?)
    `).run(tabela, total, duracaoMs, status, erro ? String(erro) : null);
  } catch (e) {
    console.error(`[Digifarma Sync] Erro ao atualizar metadata para ${tabela}:`, e.message);
  }
}

/**
 * 1. Sincroniza Catálogo de Produtos e Curva ABC para digifarma_products_cache
 */
async function syncProdutos(db) {
  const start = Date.now();
  console.log('[Digifarma Sync] 🔄 Iniciando sincronização de Produtos & Curva ABC...');
  try {
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
    `, [], 60000);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dataInicioStr = formatarDataFirebird(thirtyDaysAgo);

    let salesData = [];
    try {
      salesData = await queryDigifarma(`
        SELECT 
          iv.PRODUTO_ID,
          SUM(iv.ITEM_VENDAS_QUANT) as TOTAL_QTD,
          SUM(iv.ITEM_VENDAS_VALOR) as TOTAL_VALOR
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS cv ON iv.CAB_VENDAS_ID = cv.CAB_VENDAS_ID
        WHERE cv.DATA_EMISSAO >= '${dataInicioStr}'
        GROUP BY iv.PRODUTO_ID
      `, [], 45000);
    } catch (sErr) {
      console.warn('[Digifarma Sync] Aviso: Não foi possível obter histórico de vendas para Curva ABC:', sErr.message);
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
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
          p.CEST ? String(p.CEST).trim() : null
        );
      }
    });

    insertMany(productsWithCurve);

    const duracaoMs = Date.now() - start;
    updateSyncMetadata(db, 'produtos', productsWithCurve.length, duracaoMs, 'ok');
    console.log(`[Digifarma Sync] ✅ ${productsWithCurve.length} Produtos sincronizados no cache SQLite em ${duracaoMs}ms!`);

    return { success: true, count: productsWithCurve.length, duracaoMs };
  } catch (err) {
    const duracaoMs = Date.now() - start;
    updateSyncMetadata(db, 'produtos', 0, duracaoMs, 'erro', err.message);
    console.error('[Digifarma Sync] ❌ Erro ao sincronizar produtos:', err.message);
    throw err;
  }
}

/**
 * 2. Sincroniza Crediário / Devedores para digifarma_crediario_cache
 */
async function syncCrediario(db) {
  const start = Date.now();
  console.log('[Digifarma Sync] 🔄 Iniciando sincronização do Crediário...');
  try {
    const ficharioData = await queryDigifarma(`
      SELECT 
        c.FICHARIO_ID as ID,
        c.CLIENTE_ID as CLIENTID,
        cli.CLIENTE as CLIENTNAME,
        cli.CLI_CELULAR as PHONE,
        c.FICHARIO_VALOR as AMOUNT,
        c.FICHARIO_DATACOMPRA as PURCHASEDATE,
        c.FICHARIO_VENCIMENTO as DUEDATE,
        c.VENDA_NOTA_ID as SALEID
      FROM FICHARIO c
      LEFT JOIN CLIENTES cli ON c.CLIENTE_ID = cli.CLIENTE_ID
      ORDER BY c.FICHARIO_VENCIMENTO ASC
    `, [], 30000);

    const replaceMany = db.transaction((items) => {
      db.prepare('DELETE FROM digifarma_crediario_cache').run();
      const insertStmt = db.prepare(`
        INSERT INTO digifarma_crediario_cache (
          id, cliente_id, cliente_nome, telefone, valor, data_compra, data_vencimento, venda_nota_id, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `);

      for (const item of items) {
        insertStmt.run(
          String(item.ID),
          item.CLIENTID || null,
          item.CLIENTNAME ? String(item.CLIENTNAME).trim() : 'Desconhecido',
          item.PHONE ? String(item.PHONE).trim() : '',
          parseFloat(item.AMOUNT || 0),
          item.PURCHASEDATE ? String(item.PURCHASEDATE) : null,
          item.DUEDATE ? String(item.DUEDATE) : null,
          item.SALEID || null
        );
      }
    });

    replaceMany(ficharioData);

    const duracaoMs = Date.now() - start;
    updateSyncMetadata(db, 'crediario', ficharioData.length, duracaoMs, 'ok');
    console.log(`[Digifarma Sync] ✅ ${ficharioData.length} registros de Crediário sincronizados em ${duracaoMs}ms!`);

    return { success: true, count: ficharioData.length, duracaoMs };
  } catch (err) {
    const duracaoMs = Date.now() - start;
    updateSyncMetadata(db, 'crediario', 0, duracaoMs, 'erro', err.message);
    console.error('[Digifarma Sync] ❌ Erro ao sincronizar crediário:', err.message);
    throw err;
  }
}

/**
 * 3. Sincroniza Vendas do Dia Atual para digifarma_vendas_hoje_cache
 */
async function syncVendasHoje(db) {
  const start = Date.now();
  try {
    const vendasData = await queryDigifarma(`
      SELECT 
        v.VENDA_NOTA_ID,
        v.VENDA_DATA_HORA,
        COALESCE(v.VENDA_TOTAL, 0) as VENDA_TOTAL_LIQUIDO,
        v.CANCELADO,
        (SELECT COUNT(1) FROM ITEM_VENDAS iv WHERE iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID) as TOTAL_ITENS
      FROM CAB_VENDAS v
      WHERE CAST(v.VENDA_DATA_HORA AS DATE) = CURRENT_DATE
      ORDER BY v.VENDA_DATA_HORA DESC
    `, [], 25000);

    const pagtosData = await queryDigifarma(`
      SELECT 
        fp.VENDA_NOTA_ID,
        fp.TIPO_PAGAMENTO_ID as FPAGTO_ID,
        fp.VALOR as VENDA_FPAGTO_VALOR,
        fp.BANDEIRA as FPAGTO_DESCRICAO
      FROM CAB_VENDAS_FPAGTOS fp
      JOIN CAB_VENDAS v ON fp.VENDA_NOTA_ID = v.VENDA_NOTA_ID
      WHERE CAST(v.VENDA_DATA_HORA AS DATE) = CURRENT_DATE
    `, [], 25000);

    const pagtoMap = new Map();
    for (const p of pagtosData) {
      if (!pagtoMap.has(p.VENDA_NOTA_ID)) pagtoMap.set(p.VENDA_NOTA_ID, []);
      pagtoMap.get(p.VENDA_NOTA_ID).push({
        id: p.FPAGTO_ID,
        descricao: (p.FPAGTO_DESCRICAO || '').trim(),
        valor: parseFloat(p.VENDA_FPAGTO_VALOR || 0)
      });
    }

    const replaceVendas = db.transaction((vendas) => {
      db.prepare('DELETE FROM digifarma_vendas_hoje_cache').run();
      const insertStmt = db.prepare(`
        INSERT INTO digifarma_vendas_hoje_cache (
          venda_nota_id, data_hora, valor_total, cancelado, formas_pagamento, total_itens, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `);

      for (const v of vendas) {
        const pagtos = pagtoMap.get(v.VENDA_NOTA_ID) || [];
        insertStmt.run(
          v.VENDA_NOTA_ID,
          String(v.VENDA_DATA_HORA),
          parseFloat(v.VENDA_TOTAL_LIQUIDO || 0),
          v.CANCELADO || 'N',
          JSON.stringify(pagtos),
          parseInt(v.TOTAL_ITENS || 0)
        );
      }
    });

    replaceVendas(vendasData);

    const duracaoMs = Date.now() - start;
    updateSyncMetadata(db, 'vendas_hoje', vendasData.length, duracaoMs, 'ok');
    return { success: true, count: vendasData.length, duracaoMs };
  } catch (err) {
    const duracaoMs = Date.now() - start;
    updateSyncMetadata(db, 'vendas_hoje', 0, duracaoMs, 'erro', err.message);
    console.error('[Digifarma Sync] ❌ Erro ao sincronizar vendas de hoje:', err.message);
    throw err;
  }
}

/**
 * 4. Sincroniza Resumo de Estoque & Parados para digifarma_stock_summary_cache
 */
async function syncEstoqueResumo(db) {
  const start = Date.now();
  try {
    // Calcula diretamente com base no cache SQLite já atualizado para ser instantâneo
    const rowAtivos = db.prepare('SELECT COUNT(1) as total FROM digifarma_products_cache WHERE estoque_atual > 0').get();
    
    // Consulta produtos parados do Firebird de forma segura
    const paradosResult = await queryDigifarma(`
      SELECT 
        COUNT(*) as QTD_PARADA,
        COALESCE(SUM(p.ESTOQUE * COALESCE(p.PROD_PRCOMPRA, 0)), 0) as VALOR_PARADO
      FROM PRODUTOS p
      WHERE p.PROD_ATIVO = 'S'
        AND p.ESTOQUE > 0
        AND NOT EXISTS (
          SELECT FIRST 1 1 
          FROM ITEM_VENDAS iv
          JOIN CAB_VENDAS v ON iv.CAB_VENDAS_ID = v.CAB_VENDAS_ID
          WHERE iv.PRODUTO_ID = p.PRODUTO_ID 
            AND v.DATA_EMISSAO >= CAST('NOW' AS TIMESTAMP) - 90
        )
    `, [], 45000);

    const qtdParados = paradosResult[0] ? parseInt(paradosResult[0].QTD_PARADA || 0) : 0;
    const valorParado = paradosResult[0] ? parseFloat(paradosResult[0].VALOR_PARADO || 0) : 0;

    db.prepare(`
      INSERT OR REPLACE INTO digifarma_stock_summary_cache (
        id, total_ativos, total_saidas_mes, qtd_parados_90d, valor_parado_90d, atualizado_em
      ) VALUES ('current', ?, 0, ?, ?, datetime('now', 'localtime'))
    `).run(rowAtivos.total || 0, qtdParados, valorParado);

    const duracaoMs = Date.now() - start;
    updateSyncMetadata(db, 'estoque_resumo', 1, duracaoMs, 'ok');
    return { success: true, duracaoMs };
  } catch (err) {
    const duracaoMs = Date.now() - start;
    updateSyncMetadata(db, 'estoque_resumo', 0, duracaoMs, 'erro', err.message);
    console.error('[Digifarma Sync] ❌ Erro ao sincronizar resumo de estoque:', err.message);
  }
}

/**
 * 5. Executa todas as sincronizações de uma só vez
 */
async function syncTudo(db) {
  const results = {};
  try {
    results.produtos = await syncProdutos(db);
  } catch (e) { results.produtos = { erro: e.message }; }

  try {
    results.crediario = await syncCrediario(db);
  } catch (e) { results.crediario = { erro: e.message }; }

  try {
    results.vendasHoje = await syncVendasHoje(db);
  } catch (e) { results.vendasHoje = { erro: e.message }; }

  try {
    results.estoque = await syncEstoqueResumo(db);
  } catch (e) { results.estoque = { erro: e.message }; }

  return results;
}

/**
 * 6. Obtém o status de sincronização de cada tabela
 */
function getSyncStatus(db) {
  try {
    const rows = db.prepare('SELECT * FROM digifarma_sync_metadata ORDER BY tabela ASC').all();
    return rows;
  } catch (e) {
    return [];
  }
}

module.exports = {
  syncProdutos,
  syncCrediario,
  syncVendasHoje,
  syncEstoqueResumo,
  syncTudo,
  getSyncStatus
};
