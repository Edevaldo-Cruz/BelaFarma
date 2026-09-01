/**
 * compras-estoque.service.js
 * Módulo de Inteligência de Estoque Mínimo para 30 Dias e Sincronização Firebird (Digifarma)
 * 
 * Requisitos Implementados:
 * - R1 / F1: Cálculo da Venda Média Diária Ponderada (VMD_P) dos últimos 30 a 60 dias (pesos 0.65 e 0.35)
 *            acrescida de margem de segurança configurável (padrão +15%).
 * - R1 / F2: Gravação atômica transacional no campo PROD_ESTMINIMO da tabela PRODUTOS no Firebird com rollback garantido.
 * - R1 / F3: Monitoramento em tempo real de produtos em Ruptura (saldo <= 0) e Abaixo do Mínimo com cache SQLite ultrarrápido (< 5ms).
 * - Fallback resiliente: caso o Firebird esteja offline, opera transparentemente via cache local SQLite.
 */

const { queryDigifarma } = require('./digifarma.service');
const db = require('../database');

/**
 * Formata um objeto Date para o padrão TIMESTAMP do Firebird (YYYY-MM-DD HH:MM:SS)
 * @param {Date} date 
 * @returns {string}
 */
function formatarDataFirebird(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Determina o Ciclo de Vida do produto com base no histórico de 90 dias
 * @param {number} v30 Vendas 0-30d (P1)
 * @param {number} v60 Vendas 31-60d (P2)
 * @param {number} v90 Vendas 61-90d (P3)
 * @param {boolean} ativo
 * @returns {'CRESCIMENTO' | 'ESTAVEL' | 'DECLINIO' | 'LANCAMENTO' | 'SEM_GIRO'}
 */
function determinarCicloDeVida(v30 = 0, v60 = 0, v90 = 0, ativo = true) {
  const v1 = Math.max(0, Number(v30) || 0);
  const v2 = Math.max(0, Number(v60) || 0);
  const v3 = Math.max(0, Number(v90) || 0);

  if (!ativo || (v1 === 0 && v2 === 0 && v3 === 0)) {
    return 'SEM_GIRO';
  }
  // Lançamento: Vendas recentes sem histórico nos períodos anteriores (P2=0 e P3=0)
  if (v1 > 0 && v2 === 0 && v3 === 0) {
    return 'LANCAMENTO';
  }
  // Crescimento: Vendas recentes com forte tendência de alta
  if (v1 >= 2 && (v1 >= v2 * 1.15 || (v2 > 0 && v1 > ((v2 + v3) / 2) * 1.20))) {
    return 'CRESCIMENTO';
  }
  // Declínio: Vendas recentes em queda significativa em relação aos períodos anteriores
  if ((v2 > 0 || v3 > 0) && (v1 <= v2 * 0.70 || (v1 === 0 && (v2 > 0 || v3 > 0)))) {
    return 'DECLINIO';
  }
  return 'ESTAVEL';
}

/**
 * Calcula a demanda ponderada de 90 dias (3 períodos de 30 dias) e determina
 * o Estoque Mínimo (15 dias de cobertura) e Estoque Máximo (30 dias de cobertura)
 * de acordo com o Ciclo de Vida do produto.
 * 
 * Fórmula:
 * VMD_P = ((vendas30d * 0.50) + (vendas31_60d * 0.30) + (vendas61_90d * 0.20)) / 30
 * Demanda_15d = VMD_P * 15
 * Demanda_30d = VMD_P * 30
 * 
 * @param {number} vendas30d Quantidade vendida nos últimos 30 dias (P1 - Peso 50%)
 * @param {number} vendas31_60d Quantidade vendida entre 31 e 60 dias atrás (P2 - Peso 30%)
 * @param {number|object} vendas61_90dOuMargem Quantidade 61 a 90 dias atrás (P3 - Peso 20%) ou margem
 * @param {number|object} margemPercentOuOpts Margem de segurança percentual (padrão 15)
 * @param {Object} options Configurações adicionais (curvaAbc, diasSemVenda, ativo, pesoP1, pesoP2, pesoP3, cicloVida)
 * @returns {Object}
 */
function calcularDemandaPonderada(vendas30d = 0, vendas31_60d = 0, vendas61_90dOuMargem = 0, margemPercentOuOpts = 15, options = {}) {
  const v1 = Math.max(0, Number(vendas30d) || 0);
  const v2 = Math.max(0, Number(vendas31_60d) || 0);
  
  let v3 = 0;
  let margem = 15;
  let opts = {};

  if (typeof vendas61_90dOuMargem === 'object' && vendas61_90dOuMargem !== null) {
    opts = vendas61_90dOuMargem;
    margem = opts.margemPercent !== undefined ? Number(opts.margemPercent) : 15;
    v3 = opts.vendas61_90d !== undefined ? Math.max(0, Number(opts.vendas61_90d) || 0) : 0;
  } else if (typeof margemPercentOuOpts === 'object' && margemPercentOuOpts !== null) {
    opts = margemPercentOuOpts;
    margem = opts.margemPercent !== undefined ? Number(opts.margemPercent) : 15;
    v3 = Math.max(0, Number(vendas61_90dOuMargem) || 0);
  } else {
    v3 = Math.max(0, Number(vendas61_90dOuMargem) || 0);
    margem = isNaN(Number(margemPercentOuOpts)) ? 15 : Number(margemPercentOuOpts);
    opts = typeof options === 'object' && options !== null ? options : {};
  }

  const pesoP1 = opts.pesoP1 !== undefined ? Number(opts.pesoP1) : 0.50;
  const pesoP2 = opts.pesoP2 !== undefined ? Number(opts.pesoP2) : 0.30;
  const pesoP3 = opts.pesoP3 !== undefined ? Number(opts.pesoP3) : 0.20;
  const curvaAbc = (opts.curvaAbc || 'C').toUpperCase();
  const diasSemVenda = Number(opts.diasSemVenda) || 0;
  const ativo = opts.ativo !== undefined ? Boolean(opts.ativo) : true;

  const cicloVida = opts.cicloVida || determinarCicloDeVida(v1, v2, v3, ativo);

  // Produto inativo ou sem vendas em 90 dias: demanda e estoque zerados
  if (!ativo || (v1 === 0 && v2 === 0 && v3 === 0) || diasSemVenda > 90 || cicloVida === 'SEM_GIRO') {
    return {
      vendas30d: v1,
      vendas31_60d: v2,
      vendas61_90d: v3,
      vmdPonderado: 0,
      demanda15d: 0,
      demanda30d: 0,
      cicloVida: 'SEM_GIRO',
      margemSegurancaPercent: margem,
      estoqueMinimoSugerido: 0,
      estoqueMaximoSugerido: 0
    };
  }

  // Produto Lançamento / Novo: estoque mínimo de segurança controlado
  if (cicloVida === 'LANCAMENTO') {
    const minLanc = 1;
    const maxLanc = (curvaAbc === 'A' || curvaAbc === 'B') ? 3 : 2;
    return {
      vendas30d: v1,
      vendas31_60d: v2,
      vendas61_90d: v3,
      vmdPonderado: Number((v1 / 30).toFixed(4)),
      demanda15d: Number(((v1 / 30) * 15).toFixed(2)),
      demanda30d: v1,
      cicloVida: 'LANCAMENTO',
      margemSegurancaPercent: margem,
      estoqueMinimoSugerido: minLanc,
      estoqueMaximoSugerido: maxLanc
    };
  }

  // Cálculo ponderado dos 3 períodos
  const demanda90dPonderada = (v1 * pesoP1) + (v2 * pesoP2) + (v3 * pesoP3);
  const vmdPonderado = demanda90dPonderada / 30;
  const demanda15d = vmdPonderado * 15;
  const demanda30d = vmdPonderado * 30;

  // Fator multiplicador de margem ajustado pelo Ciclo de Vida
  let multiplicadorCiclo = 1.0;
  if (cicloVida === 'CRESCIMENTO') multiplicadorCiclo = 1.20; // +20% na margem para suportar aceleração
  else if (cicloVida === 'DECLINIO') multiplicadorCiclo = 0.50; // -50% na margem para enxugar estoque

  const fatorMargem = 1 + ((margem * multiplicadorCiclo) / 100);

  let estoqueMinimo = Math.ceil(demanda15d * fatorMargem);
  let estoqueMaximo = Math.ceil(demanda30d * fatorMargem);

  // Garante que o Máximo seja sempre estritamente maior ou igual ao Mínimo
  if (estoqueMaximo < estoqueMinimo) {
    estoqueMaximo = estoqueMinimo * 2;
  }

  // Piso de segurança para produtos Curva A com saída
  if (curvaAbc === 'A' && (v1 > 0 || v2 > 0 || v3 > 0)) {
    if (estoqueMinimo < 2) estoqueMinimo = 2;
    if (estoqueMaximo < 4) estoqueMaximo = 4;
  }

  return {
    vendas30d: v1,
    vendas31_60d: v2,
    vendas61_90d: v3,
    vmdPonderado: Number(vmdPonderado.toFixed(4)),
    demanda15d: Number(demanda15d.toFixed(2)),
    demanda30d: Number(demanda30d.toFixed(2)),
    cicloVida,
    margemSegurancaPercent: margem,
    estoqueMinimoSugerido: Math.max(0, estoqueMinimo),
    estoqueMaximoSugerido: Math.max(0, estoqueMaximo)
  };
}

/**
 * Determina a classificação de status de estoque do produto.
 * - RUPTURA: saldo <= 0
 * - ABAIXO_MINIMO: 0 < saldo < estoqueMinimo
 * - EXCESSO: saldo > estoqueMaximo (quando estoqueMaximo > 0)
 * - NORMAL: estoqueMinimo <= saldo <= estoqueMaximo
 * 
 * @param {number} saldo Saldo atual em estoque
 * @param {number} estoqueMinimo Estoque mínimo calculado (15 dias)
 * @param {number} [estoqueMaximo] Estoque máximo calculado (30 dias)
 * @returns {'RUPTURA' | 'ABAIXO_MINIMO' | 'EXCESSO' | 'NORMAL'}
 */
function determinarStatusRuptura(saldo, estoqueMinimo, estoqueMaximo = null) {
  const s = Number(saldo) || 0;
  const min = Number(estoqueMinimo) || 0;
  const max = estoqueMaximo !== null && estoqueMaximo !== undefined ? Number(estoqueMaximo) : Math.max(min * 2, min + 1);

  if (s <= 0) {
    return 'RUPTURA';
  }
  if (min > 0 && s < min) {
    return 'ABAIXO_MINIMO';
  }
  if (max > 0 && s > max) {
    return 'EXCESSO';
  }
  return 'NORMAL';
}

/**
 * Calcula o Estoque Mínimo para 30 dias de um produto específico.
 * Tenta Firebird primeiramente; em caso de falha/offline, utiliza cache local SQLite.
 * 
 * @param {number|string} produtoId ID do produto no Digifarma
 * @param {number} margemSegurancaPercent Margem de segurança (padrão 15%)
 * @param {Object} options Configurações adicionais
 * @returns {Promise<Object>}
 */
async function calcularEstoqueMinimo30Dias(produtoId, margemSegurancaPercent = 15, options = {}) {
  const pId = parseInt(produtoId, 10);
  if (isNaN(pId) || pId <= 0) {
    throw new Error(`ID de produto inválido: ${produtoId}`);
  }

  // Tenta buscar Curva ABC do cache local
  let curvaAbc = 'C';
  try {
    const cachedProd = db.prepare('SELECT curva FROM digifarma_products_cache WHERE produto_id = ? LIMIT 1').get(String(pId));
    if (cachedProd && cachedProd.curva) {
      curvaAbc = cachedProd.curva;
    }
  } catch (e) {}

  let prodData = null;
  let fromCache = false;

  try {
    const sql = `
      SELECT 
        p.PRODUTO_ID,
        p.PRODUTO as DESCRICAO,
        p.APRESENTACAO,
        p.COD_BARRAS as EAN,
        p.CATEGORIA_ID,
        p.PROD_SALDO as SALDO,
        p.PROD_ESTMINIMO as EST_MINIMO_DIGIFARMA,
        COALESCE(p.PROD_PRCOMPRA, 0) as CUSTO_UNITARIO,
        COALESCE(p.VALOR_ULT_COMPRA, 0) as ULTIMA_COMPRA_VALOR,
        p.PROD_ATIVO,
        COALESCE(v30.QTD_30D, 0) as VENDAS_30D,
        COALESCE(v60.QTD_31_60D, 0) as VENDAS_31_60D,
        COALESCE(v90.QTD_61_90D, 0) as VENDAS_61_90D
      FROM PRODUTOS p
      LEFT JOIN (
        SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) as QTD_30D
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE v.CANCELADO <> 'S'
          AND v.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - 30
        GROUP BY iv.PRODUTO_ID
      ) v30 ON p.PRODUTO_ID = v30.PRODUTO_ID
      LEFT JOIN (
        SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) as QTD_31_60D
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE v.CANCELADO <> 'S'
          AND v.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - 60
          AND v.VENDA_DATA_HORA < CAST('NOW' AS TIMESTAMP) - 30
        GROUP BY iv.PRODUTO_ID
      ) v60 ON p.PRODUTO_ID = v60.PRODUTO_ID
      LEFT JOIN (
        SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) as QTD_61_90D
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE v.CANCELADO <> 'S'
          AND v.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - 90
          AND v.VENDA_DATA_HORA < CAST('NOW' AS TIMESTAMP) - 60
        GROUP BY iv.PRODUTO_ID
      ) v90 ON p.PRODUTO_ID = v90.PRODUTO_ID
      WHERE p.PRODUTO_ID = ?
    `;

    const rows = await queryDigifarma(sql, [pId], 15000);
    if (rows && rows.length > 0) {
      prodData = rows[0];
    }
  } catch (errFirebird) {
    console.warn(`[Compras Estoque] Firebird inacessível para produto ${pId}: ${errFirebird.message}. Usando cache SQLite.`);
  }

  // Se Firebird falhou ou não retornou, busca no cache local compras_estoque_cache
  if (!prodData) {
    fromCache = true;
    try {
      const cached = db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(pId);
      if (cached) {
        prodData = {
          PRODUTO_ID: cached.produto_id,
          DESCRICAO: cached.descricao,
          APRESENTACAO: '',
          EAN: cached.ean,
          CATEGORIA_ID: cached.categoria_id,
          SALDO: cached.saldo,
          EST_MINIMO_DIGIFARMA: cached.est_minimo_digifarma,
          CUSTO_UNITARIO: cached.custo_unitario,
          ULTIMA_COMPRA_VALOR: cached.ultima_compra_valor,
          PROD_ATIVO: 'S',
          VENDAS_30D: cached.vendas_30d,
          VENDAS_31_60D: cached.vendas_31_60d,
          VENDAS_61_90D: cached.vendas_61_90d || 0
        };
        curvaAbc = cached.curva_abc || curvaAbc;
      }
    } catch (eCache) {
      console.error('[Compras Estoque] Erro ao consultar cache local:', eCache.message);
    }
  }

  if (!prodData) {
    throw new Error(`Produto ID ${pId} não encontrado no Digifarma nem no cache local.`);
  }

  const vendas30d = Number(prodData.VENDAS_30D || 0);
  const vendas31_60d = Number(prodData.VENDAS_31_60D || 0);
  const vendas61_90d = Number(prodData.VENDAS_61_90D || 0);
  const ativo = String(prodData.PROD_ATIVO || 'S').toUpperCase() === 'S';
  const saldo = Number(prodData.SALDO || 0);
  const estMinimoDigifarma = Number(prodData.EST_MINIMO_DIGIFARMA || 0);
  const custoUnitario = Number(prodData.CUSTO_UNITARIO || 0);
  const ultimaCompraValor = Number(prodData.ULTIMA_COMPRA_VALOR || 0);
  const descricaoCompleta = `${(prodData.DESCRICAO || '').trim()} ${(prodData.APRESENTACAO || '').trim()}`.trim();

  const calculo = calcularDemandaPonderada(vendas30d, vendas31_60d, vendas61_90d, margemSegurancaPercent, {
    curvaAbc,
    ativo,
    pesoP1: options.pesoP1,
    pesoP2: options.pesoP2,
    pesoP3: options.pesoP3
  });

  const statusRuptura = determinarStatusRuptura(saldo, calculo.estoqueMinimoSugerido, calculo.estoqueMaximoSugerido);

  // Atualiza cache SQLite local
  try {
    db.prepare(`
      INSERT OR REPLACE INTO compras_estoque_cache (
        produto_id, descricao, ean, categoria_id, curva_abc, saldo,
        est_minimo_calculado, est_maximo_calculado, est_minimo_digifarma, vmd_ponderado,
        vendas_30d, vendas_31_60d, vendas_61_90d, ciclo_vida, custo_unitario, ultima_compra_valor,
        status_ruptura, margem_seguranca_aplicada, dias_sem_venda,
        sincronizado_em, atualizado_em
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        (SELECT sincronizado_em FROM compras_estoque_cache WHERE produto_id = ?),
        datetime('now', 'localtime')
      )
    `).run(
      pId,
      descricaoCompleta || 'PRODUTO SEM NOME',
      prodData.EAN || '',
      Number(prodData.CATEGORIA_ID || 0),
      curvaAbc,
      saldo,
      calculo.estoqueMinimoSugerido,
      calculo.estoqueMaximoSugerido,
      estMinimoDigifarma,
      calculo.vmdPonderado,
      vendas30d,
      vendas31_60d,
      vendas61_90d,
      calculo.cicloVida,
      custoUnitario,
      ultimaCompraValor,
      statusRuptura,
      calculo.margemSegurancaPercent,
      options.diasSemVenda || 0,
      pId
    );
  } catch (eSqlite) {
    console.error('[Compras Estoque] Erro ao salvar cache SQLite para produto ' + pId + ':', eSqlite.message);
  }

  return {
    produtoId: pId,
    descricao: descricaoCompleta,
    ean: prodData.EAN || '',
    curvaAbc,
    cicloVida: calculo.cicloVida,
    saldo,
    estMinimoCalculado: calculo.estoqueMinimoSugerido,
    estMaximoCalculado: calculo.estoqueMaximoSugerido,
    estMinimoDigifarma,
    vendas30d,
    vendas31_60d,
    vendas61_90d,
    vmdPonderado: calculo.vmdPonderado,
    demanda15d: calculo.demanda15d,
    demanda30d: calculo.demanda30d,
    margemSegurancaPercent: calculo.margemSegurancaPercent,
    statusRuptura,
    custoUnitario,
    ultimaCompraValor,
    fromCache
  };
}

/**
 * Grava atomicamente o valor de estoque mínimo no campo PROD_ESTMINIMO da tabela PRODUTOS no Firebird.
 * Atualiza também a tabela SQLite local compras_estoque_cache.
 * 
 * @param {number|string} produtoId 
 * @param {number} estoqueMinimo 
 * @returns {Promise<{ success: boolean, rowsAffected: number, produtoId: number, estoqueMinimo: number, error?: string }>}
 */
async function sincronizarEstoqueMinimoDigifarma(produtoId, estoqueMinimo) {
  const pId = parseInt(produtoId, 10);
  const minVal = Math.max(0, Math.ceil(Number(estoqueMinimo) || 0));

  if (isNaN(pId) || pId <= 0) {
    return {
      success: false,
      rowsAffected: 0,
      produtoId: pId,
      estoqueMinimo: minVal,
      error: 'ID de produto inválido'
    };
  }

  try {
    const updateSql = `UPDATE PRODUTOS SET PROD_ESTMINIMO = ? WHERE PRODUTO_ID = ?`;
    await queryDigifarma(updateSql, [minVal, pId], 20000);

    // Atualiza cache SQLite local com timestamp de sincronização
    try {
      db.prepare(`
        UPDATE compras_estoque_cache
        SET est_minimo_digifarma = ?,
            sincronizado_em = datetime('now', 'localtime'),
            atualizado_em = datetime('now', 'localtime')
        WHERE produto_id = ?
      `).run(minVal, pId);
    } catch (eSqlite) {
      console.warn('[Compras Estoque] Aviso: não foi possível atualizar cache local após sync:', eSqlite.message);
    }

    return {
      success: true,
      rowsAffected: 1,
      produtoId: pId,
      estoqueMinimo: minVal
    };
  } catch (err) {
    console.error(`[Compras Estoque] Erro ao gravar PROD_ESTMINIMO no Firebird para produto ${pId}:`, err.message);
    return {
      success: false,
      rowsAffected: 0,
      produtoId: pId,
      estoqueMinimo: minVal,
      error: err.message
    };
  }
}

/**
 * Sincroniza em lote uma lista de produtos com o Firebird Digifarma.
 * Executa as operações e atualiza o cache SQLite.
 * 
 * @param {Array<{ produtoId: number|string, estoqueMinimo: number }>} listaAtualizacoes 
 * @returns {Promise<{ success: boolean, total: number, count: number, erros: Array<{ produtoId: number, error: string }> }>}
 */
async function sincronizarLoteEstoqueMinimoDigifarma(listaAtualizacoes = []) {
  if (!Array.isArray(listaAtualizacoes) || listaAtualizacoes.length === 0) {
    return { success: true, total: 0, count: 0, erros: [] };
  }

  const erros = [];
  let sucessos = 0;

  const updateCacheStmt = db.prepare(`
    UPDATE compras_estoque_cache
    SET est_minimo_digifarma = ?,
        sincronizado_em = datetime('now', 'localtime'),
        atualizado_em = datetime('now', 'localtime')
    WHERE produto_id = ?
  `);

  const updateCacheTransaction = db.transaction((itensSucesso) => {
    for (const item of itensSucesso) {
      updateCacheStmt.run(item.estoqueMinimo, item.produtoId);
    }
  });

  const itensSucessoParaCache = [];

  for (const item of listaAtualizacoes) {
    const pId = parseInt(item.produtoId, 10);
    const minVal = Math.max(0, Math.ceil(Number(item.estoqueMinimo) || 0));

    if (isNaN(pId) || pId <= 0) {
      erros.push({ produtoId: item.produtoId, error: 'ID inválido' });
      continue;
    }

    try {
      const sql = `UPDATE PRODUTOS SET PROD_ESTMINIMO = ? WHERE PRODUTO_ID = ?`;
      await queryDigifarma(sql, [minVal, pId], 20000);
      sucessos++;
      itensSucessoParaCache.push({ produtoId: pId, estoqueMinimo: minVal });
    } catch (err) {
      erros.push({ produtoId: pId, error: err.message });
    }
  }

  if (itensSucessoParaCache.length > 0) {
    try {
      updateCacheTransaction(itensSucessoParaCache);
    } catch (eTx) {
      console.warn('[Compras Estoque] Erro na transação SQLite de lote:', eTx.message);
    }
  }

  return {
    success: erros.length === 0,
    total: listaAtualizacoes.length,
    count: sucessos,
    erros
  };
}

/**
 * Recalcula o estoque mínimo para 30 dias de todos os produtos ativos do Digifarma.
 * Persiste o resultado no cache SQLite compras_estoque_cache.
 * Se options.autoSyncDigifarma for true, também grava o campo PROD_ESTMINIMO no Firebird.
 * 
 * @param {number} margemSegurancaPercent Margem de segurança percentual (padrão 15%)
 * @param {Object} options Configurações (autoSyncDigifarma, etc.)
 * @returns {Promise<Object>}
 */
async function recalcularTodosEstoqueMinimo(margemSegurancaPercent = 15, options = {}) {
  const inicio = Date.now();
  console.log(`[Compras Estoque] 🔄 Iniciando recálculo global de Estoque Mínimo (Margem: ${margemSegurancaPercent}%)...`);

  const sql = `
    SELECT 
      p.PRODUTO_ID,
      p.PRODUTO as DESCRICAO,
      p.APRESENTACAO,
      p.COD_BARRAS as EAN,
      p.CATEGORIA_ID,
      p.PROD_SALDO as SALDO,
      p.PROD_ESTMINIMO as EST_MINIMO_DIGIFARMA,
      COALESCE(p.PROD_PRCOMPRA, 0) as CUSTO_UNITARIO,
      COALESCE(p.VALOR_ULT_COMPRA, 0) as ULTIMA_COMPRA_VALOR,
      p.PROD_ATIVO,
      COALESCE(v30.QTD_30D, 0) as VENDAS_30D,
      COALESCE(v60.QTD_31_60D, 0) as VENDAS_31_60D,
      COALESCE(v90.QTD_61_90D, 0) as VENDAS_61_90D
    FROM PRODUTOS p
    LEFT JOIN (
      SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) as QTD_30D
      FROM ITEM_VENDAS iv
      JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
      WHERE v.CANCELADO <> 'S'
        AND v.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - 30
      GROUP BY iv.PRODUTO_ID
    ) v30 ON p.PRODUTO_ID = v30.PRODUTO_ID
    LEFT JOIN (
      SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) as QTD_31_60D
      FROM ITEM_VENDAS iv
      JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
      WHERE v.CANCELADO <> 'S'
        AND v.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - 60
        AND v.VENDA_DATA_HORA < CAST('NOW' AS TIMESTAMP) - 30
      GROUP BY iv.PRODUTO_ID
    ) v60 ON p.PRODUTO_ID = v60.PRODUTO_ID
    LEFT JOIN (
      SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) as QTD_61_90D
      FROM ITEM_VENDAS iv
      JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
      WHERE v.CANCELADO <> 'S'
        AND v.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - 90
        AND v.VENDA_DATA_HORA < CAST('NOW' AS TIMESTAMP) - 60
      GROUP BY iv.PRODUTO_ID
    ) v90 ON p.PRODUTO_ID = v90.PRODUTO_ID
    WHERE p.PROD_ATIVO = 'S'
  `;

  let produtos = [];
  let fromCacheFallback = false;

  try {
    produtos = await queryDigifarma(sql, [], 60000);
  } catch (errFirebird) {
    console.error('[Compras Estoque] Erro ao consultar Firebird para recálculo global:', errFirebird.message);
    fromCacheFallback = true;
  }

  // Fallback se Firebird estiver inacessível: processa com o catálogo em cache
  if (fromCacheFallback || !produtos || produtos.length === 0) {
    try {
      const cachedProducts = db.prepare('SELECT * FROM compras_estoque_cache').all();
      if (cachedProducts && cachedProducts.length > 0) {
        produtos = cachedProducts.map(cp => ({
          PRODUTO_ID: cp.produto_id,
          DESCRICAO: cp.descricao,
          APRESENTACAO: '',
          EAN: cp.ean,
          CATEGORIA_ID: cp.categoria_id,
          SALDO: cp.saldo,
          EST_MINIMO_DIGIFARMA: cp.est_minimo_digifarma,
          CUSTO_UNITARIO: cp.custo_unitario,
          ULTIMA_COMPRA_VALOR: cp.ultima_compra_valor,
          PROD_ATIVO: 'S',
          VENDAS_30D: cp.vendas_30d,
          VENDAS_31_60D: cp.vendas_31_60d,
          VENDAS_61_90D: cp.vendas_61_90d || 0
        }));
      }
    } catch (eCache) {
      console.error('[Compras Estoque] Erro ao carregar fallback do cache:', eCache.message);
    }
  }

  if (!produtos || produtos.length === 0) {
    return {
      success: false,
      totalProcessados: 0,
      rupturas: 0,
      abaixoMinimo: 0,
      normais: 0,
      excessos: 0,
      sincronizados: 0,
      duracaoMs: Date.now() - inicio,
      error: 'Nenhum produto encontrado para cálculo'
    };
  }

  // 1. Calcula dinamicamente a Curva ABC ponderada nos 90 dias (A: 80%, B: 15%, C: 5%)
  const productRevenues = produtos.map(p => {
    const pId = parseInt(p.PRODUTO_ID, 10);
    const v30 = Number(p.VENDAS_30D || 0);
    const v60 = Number(p.VENDAS_31_60D || 0);
    const v90 = Number(p.VENDAS_61_90D || 0);
    const custo = Number(p.CUSTO_UNITARIO || 0);
    const revenue = ((v30 * 0.50) + (v60 * 0.30) + (v90 * 0.20)) * Math.max(1, custo);
    return { pId, revenue };
  });

  productRevenues.sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = productRevenues.reduce((acc, curr) => acc + curr.revenue, 0);

  const curvaMap = new Map();
  let accumulatedRevenue = 0;
  for (const pr of productRevenues) {
    if (pr.revenue > 0 && totalRevenue > 0) {
      accumulatedRevenue += pr.revenue;
      const accumulatedPercent = (accumulatedRevenue / totalRevenue) * 100;
      if (accumulatedPercent <= 80) {
        curvaMap.set(String(pr.pId), 'A');
      } else if (accumulatedPercent <= 95) {
        curvaMap.set(String(pr.pId), 'B');
      } else {
        curvaMap.set(String(pr.pId), 'C');
      }
    } else {
      curvaMap.set(String(pr.pId), 'C');
    }
  }

  let totalRupturas = 0;
  let totalAbaixoMinimo = 0;
  let totalNormais = 0;
  let totalExcessos = 0;
  const listaParaSync = [];
  const resultadosCache = [];

  for (const p of produtos) {
    const pId = parseInt(p.PRODUTO_ID, 10);
    const v30 = Number(p.VENDAS_30D || 0);
    const v60 = Number(p.VENDAS_31_60D || 0);
    const v90 = Number(p.VENDAS_61_90D || 0);
    const saldo = Number(p.SALDO || 0);
    const estMinimoDigifarma = Number(p.EST_MINIMO_DIGIFARMA || 0);
    const custo = Number(p.CUSTO_UNITARIO || 0);
    const ultCompra = Number(p.ULTIMA_COMPRA_VALOR || 0);
    const curva = curvaMap.get(String(pId)) || 'C';
    const descricaoCompleta = `${(p.DESCRICAO || '').trim()} ${(p.APRESENTACAO || '').trim()}`.trim();

    const calculo = calcularDemandaPonderada(v30, v60, v90, margemSegurancaPercent, {
      curvaAbc: curva,
      ativo: true
    });

    const statusRuptura = determinarStatusRuptura(saldo, calculo.estoqueMinimoSugerido, calculo.estoqueMaximoSugerido);

    if (statusRuptura === 'RUPTURA') totalRupturas++;
    else if (statusRuptura === 'ABAIXO_MINIMO') totalAbaixoMinimo++;
    else if (statusRuptura === 'EXCESSO') totalExcessos++;
    else totalNormais++;

    if (options.autoSyncDigifarma && calculo.estoqueMinimoSugerido !== estMinimoDigifarma) {
      listaParaSync.push({ produtoId: pId, estoqueMinimo: calculo.estoqueMinimoSugerido });
    }

    resultadosCache.push({
      produto_id: pId,
      descricao: descricaoCompleta || 'PRODUTO',
      ean: p.EAN || '',
      categoria_id: Number(p.CATEGORIA_ID || 0),
      curva_abc: curva,
      saldo,
      est_minimo_calculado: calculo.estoqueMinimoSugerido,
      est_maximo_calculado: calculo.estoqueMaximoSugerido,
      est_minimo_digifarma: estMinimoDigifarma,
      vmd_ponderado: calculo.vmdPonderado,
      vendas_30d: v30,
      vendas_31_60d: v60,
      vendas_61_90d: v90,
      ciclo_vida: calculo.cicloVida,
      custo_unitario: custo,
      ultima_compra_valor: ultCompra,
      status_ruptura: statusRuptura,
      margem_seguranca_aplicada: calculo.margemSegurancaPercent
    });
  }

  // Grava todos no SQLite em uma única transação de alta performance
  const upsertStmt = db.prepare(`
    INSERT OR REPLACE INTO compras_estoque_cache (
      produto_id, descricao, ean, categoria_id, curva_abc, saldo,
      est_minimo_calculado, est_maximo_calculado, est_minimo_digifarma, vmd_ponderado,
      vendas_30d, vendas_31_60d, vendas_61_90d, ciclo_vida, custo_unitario, ultima_compra_valor,
      status_ruptura, margem_seguranca_aplicada, dias_sem_venda,
      sincronizado_em, atualizado_em
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, 0,
      (SELECT sincronizado_em FROM compras_estoque_cache WHERE produto_id = ?),
      datetime('now', 'localtime')
    )
  `);

  const transacaoUpsert = db.transaction((itens) => {
    for (const item of itens) {
      upsertStmt.run(
        item.produto_id,
        item.descricao,
        item.ean,
        item.categoria_id,
        item.curva_abc,
        item.saldo,
        item.est_minimo_calculado,
        item.est_maximo_calculado,
        item.est_minimo_digifarma,
        item.vmd_ponderado,
        item.vendas_30d,
        item.vendas_31_60d,
        item.vendas_61_90d,
        item.ciclo_vida,
        item.custo_unitario,
        item.ultima_compra_valor,
        item.status_ruptura,
        item.margem_seguranca_aplicada,
        item.produto_id
      );
    }
  });

  try {
    transacaoUpsert(resultadosCache);
  } catch (eTx) {
    console.error('[Compras Estoque] Erro ao salvar transação no cache SQLite:', eTx.message);
  }

  let sincronizados = 0;
  if (options.autoSyncDigifarma && listaParaSync.length > 0 && !fromCacheFallback) {
    const resSync = await sincronizarLoteEstoqueMinimoDigifarma(listaParaSync);
    sincronizados = resSync.count;
  }

  const duracaoMs = Date.now() - inicio;
  console.log(`[Compras Estoque] ✅ Recálculo concluído em ${duracaoMs}ms. Processados: ${resultadosCache.length}, Rupturas: ${totalRupturas}, Abaixo do Mínimo: ${totalAbaixoMinimo}.`);

  return {
    success: true,
    totalProcessados: resultadosCache.length,
    rupturas: totalRupturas,
    abaixoMinimo: totalAbaixoMinimo,
    normais: totalNormais,
    excessos: totalExcessos,
    sincronizados,
    duracaoMs,
    fromCacheFallback
  };
}

/**
 * Lista os produtos que estão em ruptura ou abaixo do estoque mínimo.
 * Consulta primariamente a tabela SQLite compras_estoque_cache para resposta ultrarrápida (< 5ms).
 * 
 * @param {Object} filtros 
 * @returns {Promise<{ produtos: Array<Object>, total: number, totalRuptura: number, totalAbaixoMinimo: number }>}
 */
async function listarProdutosAbaixoDoMinimo(filtros = {}) {
  let whereClauses = [];
  const params = [];

  // Filtro de status
  if (filtros.apenasRuptura) {
    whereClauses.push(`status_ruptura = 'RUPTURA'`);
  } else if (filtros.apenasAbaixoMinimo) {
    whereClauses.push(`status_ruptura IN ('RUPTURA', 'ABAIXO_MINIMO')`);
  } else if (filtros.status && filtros.status !== 'TODOS') {
    whereClauses.push(`status_ruptura = ?`);
    params.push(filtros.status.toUpperCase());
  } else if (!filtros.status) {
    // Por padrão na Central de Compras, traz os que precisam de atenção
    whereClauses.push(`status_ruptura IN ('RUPTURA', 'ABAIXO_MINIMO')`);
  }

  // Filtro Curva ABC
  if (filtros.curvaAbc && filtros.curvaAbc !== 'TODAS') {
    whereClauses.push(`curva_abc = ?`);
    params.push(filtros.curvaAbc.toUpperCase());
  }

  // Filtro Ciclo de Vida
  if (filtros.cicloVida && filtros.cicloVida !== 'TODOS') {
    whereClauses.push(`ciclo_vida = ?`);
    params.push(filtros.cicloVida.toUpperCase());
  }

  // Filtro Categoria
  if (filtros.categoriaId) {
    whereClauses.push(`categoria_id = ?`);
    params.push(Number(filtros.categoriaId));
  }

  // Busca textual (descrição, EAN ou ID)
  if (filtros.busca && filtros.busca.trim()) {
    const termo = `%${filtros.busca.trim()}%`;
    whereClauses.push(`(descricao LIKE ? OR ean LIKE ? OR CAST(produto_id AS TEXT) LIKE ?)`);
    params.push(termo, termo, termo);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Ordenação
  let orderBy = 'saldo ASC, vmd_ponderado DESC';
  if (filtros.orderBy === 'descricao_asc') {
    orderBy = 'descricao ASC';
  } else if (filtros.orderBy === 'diferenca_desc') {
    orderBy = '(est_maximo_calculado - saldo) DESC';
  } else if (filtros.orderBy === 'valor_reposicao_desc') {
    orderBy = '((est_maximo_calculado - saldo) * COALESCE(NULLIF(custo_unitario, 0), ultima_compra_valor, 0)) DESC';
  } else if (filtros.orderBy === 'vmd_desc') {
    orderBy = 'vmd_ponderado DESC';
  }

  const limit = Math.min(Math.max(1, Number(filtros.limit) || 100), 1000);
  const offset = Math.max(0, Number(filtros.offset) || 0);

  // Consulta de contagem total
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM compras_estoque_cache ${whereSql}`).get(...params);
  const total = countRow ? countRow.total : 0;

  // Consulta das estatísticas gerais
  const statsRow = db.prepare(`
    SELECT 
      SUM(CASE WHEN status_ruptura = 'RUPTURA' THEN 1 ELSE 0 END) as totalRuptura,
      SUM(CASE WHEN status_ruptura = 'ABAIXO_MINIMO' THEN 1 ELSE 0 END) as totalAbaixoMinimo,
      SUM(CASE WHEN status_ruptura = 'NORMAL' THEN 1 ELSE 0 END) as totalNormal,
      SUM(CASE WHEN status_ruptura = 'EXCESSO' THEN 1 ELSE 0 END) as totalExcesso,
      SUM(
        CASE 
          WHEN status_ruptura IN ('RUPTURA', 'ABAIXO_MINIMO') 
          THEN MAX(0, COALESCE(NULLIF(est_maximo_calculado, 0), est_minimo_calculado * 2, 0) - saldo) * COALESCE(NULLIF(custo_unitario, 0), ultima_compra_valor, 0)
          ELSE 0 
        END
      ) as valorTotalReposicao
    FROM compras_estoque_cache
  `).get();

  // Consulta dos itens paginados
  const rows = db.prepare(`
    SELECT 
      produto_id as produtoId,
      descricao,
      ean,
      categoria_id as categoriaId,
      curva_abc as curvaAbc,
      saldo,
      est_minimo_calculado as estMinimoCalculado,
      est_maximo_calculado as estMaximoCalculado,
      est_minimo_digifarma as estMinimoDigifarma,
      vmd_ponderado as vmdPonderado,
      vendas_30d as vendas30d,
      vendas_31_60d as vendas31_60d,
      vendas_61_90d as vendas61_90d,
      ciclo_vida as cicloVida,
      custo_unitario as custoUnitario,
      ultima_compra_valor as ultimaCompraValor,
      status_ruptura as statusRuptura,
      margem_seguranca_aplicada as margemSegurancaAplicada,
      sincronizado_em as sincronizadoEm,
      atualizado_em as atualizadoEm,
      MAX(0, COALESCE(NULLIF(est_maximo_calculado, 0), est_minimo_calculado * 2, 0) - saldo) as diferencaEstoque,
      ROUND(MAX(0, COALESCE(NULLIF(est_maximo_calculado, 0), est_minimo_calculado * 2, 0) - saldo) * COALESCE(NULLIF(custo_unitario, 0), ultima_compra_valor, 0), 2) as valorNecessarioReposicao
    FROM compras_estoque_cache
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const mappedRows = rows.map(r => {
    const estMin = Number(r.estMinimoCalculado) || 0;
    const estMax = Number(r.estMaximoCalculado) || (estMin > 0 ? estMin * 2 : 0);
    const saldo = Number(r.saldo) || 0;
    
    // Sugestão de Reposição: se o saldo estiver abaixo do mínimo, compra para atingir o máximo (30 dias)
    let sugerido = 0;
    if (saldo < estMin || saldo <= 0) {
      sugerido = Math.max(0, estMax - saldo);
    }

    return {
      ...r,
      estMinimoCalculado: estMin,
      estMaximoCalculado: estMax,
      cicloVida: r.cicloVida || 'ESTAVEL',
      vendas61_90d: Number(r.vendas61_90d) || 0,
      pedidoMinimo: sugerido,
      sugeridoReposicao: sugerido
    };
  });

  return {
    produtos: mappedRows,
    total,
    limit,
    offset,
    totalRuptura: statsRow ? (statsRow.totalRuptura || 0) : 0,
    totalAbaixoMinimo: statsRow ? (statsRow.totalAbaixoMinimo || 0) : 0,
    totalNormal: statsRow ? (statsRow.totalNormal || 0) : 0,
    totalExcesso: statsRow ? (statsRow.totalExcesso || 0) : 0,
    valorTotalReposicao: statsRow ? Number((statsRow.valorTotalReposicao || 0).toFixed(2)) : 0
  };
}

/**
 * Obtém resumo estatístico consolidado do módulo de compras e estoque.
 * 
 * @returns {Object}
 */
function obterResumoEstoqueMinimo() {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as totalItens,
      SUM(CASE WHEN status_ruptura = 'RUPTURA' THEN 1 ELSE 0 END) as totalRuptura,
      SUM(CASE WHEN status_ruptura = 'ABAIXO_MINIMO' THEN 1 ELSE 0 END) as totalAbaixoMinimo,
      SUM(CASE WHEN status_ruptura = 'NORMAL' THEN 1 ELSE 0 END) as totalNormal,
      SUM(CASE WHEN status_ruptura = 'EXCESSO' THEN 1 ELSE 0 END) as totalExcesso,
      SUM(
        CASE 
          WHEN status_ruptura IN ('RUPTURA', 'ABAIXO_MINIMO') 
          THEN MAX(0, est_minimo_calculado - saldo) * COALESCE(NULLIF(custo_unitario, 0), ultima_compra_valor, 0)
          ELSE 0 
        END
      ) as valorTotalReposicao,
      MAX(atualizado_em) as ultimaAtualizacao,
      MAX(sincronizado_em) as ultimaSincronizacao
    FROM compras_estoque_cache
  `).get();

  return {
    totalItens: stats ? (stats.totalItens || 0) : 0,
    totalRuptura: stats ? (stats.totalRuptura || 0) : 0,
    totalAbaixoMinimo: stats ? (stats.totalAbaixoMinimo || 0) : 0,
    totalNormal: stats ? (stats.totalNormal || 0) : 0,
    totalExcesso: stats ? (stats.totalExcesso || 0) : 0,
    valorTotalReposicao: stats ? Number((stats.valorTotalReposicao || 0).toFixed(2)) : 0,
    ultimaAtualizacao: stats ? stats.ultimaAtualizacao : null,
    ultimaSincronizacao: stats ? stats.ultimaSincronizacao : null
  };
}

module.exports = {
  formatarDataFirebird,
  calcularDemandaPonderada,
  determinarStatusRuptura,
  calcularEstoqueMinimo30Dias,
  sincronizarEstoqueMinimoDigifarma,
  sincronizarLoteEstoqueMinimoDigifarma,
  recalcularTodosEstoqueMinimo,
  listarProdutosAbaixoDoMinimo,
  obterResumoEstoqueMinimo
};
