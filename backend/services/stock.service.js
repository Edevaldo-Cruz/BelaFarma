const { queryDigifarma } = require('./digifarma.service');

/**
 * Cache em memória simples para as consultas pesadas de estoque
 */
const cacheStorage = {
  resumo: { data: null, expireAt: 0 },
  categorias: { data: null, expireAt: 0 },
  produtos: new Map() // chave: string de params, valor: { data, expireAt }
};

function formatarDataFirebird(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Limpa todo o cache em memória
 */
function limparCacheEstoque() {
  console.log('[Stock Cache] Limpando todo o cache em memória do estoque.');
  cacheStorage.resumo = { data: null, expireAt: 0 };
  cacheStorage.categorias = { data: null, expireAt: 0 };
  cacheStorage.produtos.clear();
  return true;
}

/**
 * Obtém o resumo consolidador do estoque (cards estatísticos)
 * @param {boolean} bypassCache 
 * @returns {Promise<Object>}
 */
async function obterResumoEstoque(bypassCache = false) {
  if (!bypassCache && cacheStorage.resumo.data && Date.now() < cacheStorage.resumo.expireAt) {
    console.log('[Stock Service] Devolvendo resumo de estoque do cache.');
    return cacheStorage.resumo.data;
  }

  const sqlAtivos = `
    SELECT COUNT(*) as TOTAL_ATIVOS
    FROM PRODUTOS
    WHERE PROD_ATIVO = 'S' AND PROD_SALDO > 0
  `;
  
  const data30DiasAtras = new Date();
  data30DiasAtras.setDate(data30DiasAtras.getDate() - 30);
  data30DiasAtras.setHours(0, 0, 0, 0);
  const inicio30Dias = formatarDataFirebird(data30DiasAtras);

  const sqlSaidasMes = `
    SELECT COALESCE(SUM(iv.ITEMVEND_QUANT), 0) as TOTAL_SAIDAS
    FROM ITEM_VENDAS iv
    JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
    WHERE v.CANCELADO <> 'S'
      AND v.VENDA_DATA_HORA >= ?
  `;

  const sqlParados = `
    SELECT 
      COUNT(*) as QTD_PARADA,
      COALESCE(SUM(p.PROD_SALDO * COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0)), 0) as VALOR_PARADO
    FROM PRODUTOS p
    WHERE p.PROD_ATIVO = 'S'
      AND p.PROD_SALDO > 0
      AND NOT EXISTS (
        SELECT FIRST 1 1 
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE iv.PRODUTO_ID = p.PRODUTO_ID 
          AND v.CANCELADO <> 'S'
          AND v.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - 90
      )
  `;

  const [ativosResult, saidasResult, paradosResult] = await Promise.all([
    queryDigifarma(sqlAtivos),
    queryDigifarma(sqlSaidasMes, [inicio30Dias]),
    queryDigifarma(sqlParados)
  ]);

  const result = {
    totalAtivos: ativosResult[0].TOTAL_ATIVOS || 0,
    totalSaidasMes: saidasResult[0].TOTAL_SAIDAS || 0,
    qtdParados: paradosResult[0].QTD_PARADA || 0,
    valorParado: paradosResult[0].VALOR_PARADO || 0
  };

  // Salva no cache por 5 minutos
  cacheStorage.resumo = { data: result, expireAt: Date.now() + 300000 };

  return result;
}

/**
 * Lista produtos do estoque com paginação e filtros
 * @param {Object} params 
 * @returns {Promise<Object>}
 */
async function listarProdutosEstoque(params = {}) {
  const limit = parseInt(params.limit) || 50;
  const offset = parseInt(params.offset) || 0;
  const search = params.search ? params.search.toUpperCase().trim() : '';
  const daysWithoutSales = parseInt(params.daysWithoutSales);
  const stockStatus = params.stockStatus || 'positivo'; // 'todos', 'positivo', 'zerado'
  const categoryId = params.categoryId;
  const sort = params.sort || 'nome_asc';
  const sortKey = sort.split(':')[0]; // Trata modificadores como "tempo_sem_venda:1"
  const bypassCache = params.bypassCache === 'true' || params.bypassCache === true;

  // Se não for forçada atualização, verifica cache
  const cacheKey = JSON.stringify({ limit, offset, search, daysWithoutSales, stockStatus, categoryId, sortKey });
  if (!bypassCache) {
    const cachedItem = cacheStorage.produtos.get(cacheKey);
    if (cachedItem && Date.now() < cachedItem.expireAt) {
      console.log('[Stock Service] Devolvendo listagem de produtos do cache.');
      return cachedItem.data;
    }
  }

  let whereClause = `p.PROD_ATIVO = 'S'`;
  const sqlParams = [];

  // Filtro de Busca
  if (search) {
    whereClause += ` AND (p.PRODUTO LIKE ? OR p.COD_BARRAS = ?)`;
    sqlParams.push(`%${search}%`, search);
  }

  // Filtro por quantidade em estoque
  if (stockStatus === 'positivo') {
    whereClause += ` AND p.PROD_SALDO > 0`;
  } else if (stockStatus === 'zerado') {
    whereClause += ` AND p.PROD_SALDO <= 0`;
  }

  // Filtro de Categoria
  if (categoryId) {
    whereClause += ` AND p.CATEGORIA_ID = ?`;
    sqlParams.push(parseInt(categoryId));
  }

  // Filtro de giro / inatividade (positivo = sem venda, negativo = com venda)
  if (!isNaN(daysWithoutSales) && daysWithoutSales !== 0) {
    if (daysWithoutSales > 0) {
      whereClause += ` AND NOT EXISTS (
        SELECT FIRST 1 1 
        FROM ITEM_VENDAS iv2
        JOIN CAB_VENDAS v2 ON iv2.VENDA_NOTA_ID = v2.VENDA_NOTA_ID
        WHERE iv2.PRODUTO_ID = p.PRODUTO_ID 
          AND v2.CANCELADO <> 'S'
          AND v2.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - CAST(? AS INTEGER)
      )`;
      sqlParams.push(daysWithoutSales);
    } else {
      const days = Math.abs(daysWithoutSales);
      whereClause += ` AND EXISTS (
        SELECT FIRST 1 1 
        FROM ITEM_VENDAS iv2
        JOIN CAB_VENDAS v2 ON iv2.VENDA_NOTA_ID = v2.VENDA_NOTA_ID
        WHERE iv2.PRODUTO_ID = p.PRODUTO_ID 
          AND v2.CANCELADO <> 'S'
          AND v2.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - CAST(? AS INTEGER)
      )`;
      sqlParams.push(days);
    }
  }

  // Ordenação
  let orderBy = 'p.PRODUTO ASC';
  const needsUltimaVenda = sortKey === 'tempo_sem_venda';

  if (sortKey === 'tempo_sem_venda') {
    orderBy = '9 ASC NULLS FIRST, p.PRODUTO ASC';
  } else if (sortKey === 'saldo_desc') {
    orderBy = 'p.PROD_SALDO DESC, p.PRODUTO ASC';
  } else if (sortKey === 'saldo_asc') {
    orderBy = 'p.PROD_SALDO ASC, p.PRODUTO ASC';
  } else if (sortKey === 'preco_desc') {
    orderBy = 'p.PROD_PRVENDA DESC, p.PRODUTO ASC';
  } else if (sortKey === 'preco_asc') {
    orderBy = 'p.PROD_PRVENDA ASC, p.PRODUTO ASC';
  } else if (sortKey === 'nome_desc') {
    orderBy = 'p.PRODUTO DESC';
  }

  // 1. Query para total count (paginação)
  const sqlCount = `
    SELECT COUNT(*) as TOTAL_COUNT
    FROM PRODUTOS p
    WHERE ${whereClause}
  `;

  // 2. Query de dados paginados (Otimização Suprema: remove subquery pesada de ULTIMA_VENDA se não for ordenar por ela)
  const sqlData = `
    SELECT FIRST ${limit} SKIP ${offset}
      p.PRODUTO_ID,
      p.PRODUTO,
      p.APRESENTACAO,
      p.COD_BARRAS,
      p.PROD_SALDO,
      CASE 
        WHEN p.PROD_PRPROMOCAO > 0 
             AND (p.INICIO_PROMOCAO IS NULL OR p.INICIO_PROMOCAO <= CURRENT_DATE) 
             AND (p.TERMINO_PROMOCAO IS NULL OR p.TERMINO_PROMOCAO >= CURRENT_DATE)
        THEN p.PROD_PRPROMOCAO
        ELSE p.PROD_PRVENDA
      END as PROD_PRVENDA,
      COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA,
      c.CATEGORIA as CATEGORIA_NOME
      ${needsUltimaVenda ? `, (
        SELECT FIRST 1 v.VENDA_DATA_HORA 
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE iv.PRODUTO_ID = p.PRODUTO_ID 
          AND v.CANCELADO <> 'S'
        ORDER BY v.VENDA_DATA_HORA DESC
      ) as ULTIMA_VENDA` : ''}
    FROM PRODUTOS p
    LEFT JOIN CATEGORIA c ON p.CATEGORIA_ID = c.CATEGORIA_ID
    WHERE ${whereClause}
    ORDER BY ${orderBy}
  `;

  const [countResult, dataResult] = await Promise.all([
    queryDigifarma(sqlCount, sqlParams),
    queryDigifarma(sqlData, sqlParams)
  ]);

  const total = countResult[0].TOTAL_COUNT || 0;

  const items = dataResult.map(r => ({
    id: r.PRODUTO_ID,
    name: r.PRODUTO ? r.PRODUTO.trim() : 'Sem Nome',
    presentation: r.APRESENTACAO ? r.APRESENTACAO.trim() : '',
    barcode: r.COD_BARRAS ? r.COD_BARRAS.trim() : '',
    saldo: r.PROD_SALDO || 0,
    priceVenda: r.PROD_PRVENDA || 0,
    priceCompra: r.PROD_PRCOMPRA || 0,
    categoryName: r.CATEGORIA_NOME ? r.CATEGORIA_NOME.trim() : 'Sem Categoria',
    // Retorna lastSale apenas se veio no select, caso contrário nulo para o frontend preencher via lazy load
    lastSale: needsUltimaVenda ? r.ULTIMA_VENDA : null,
    saidasMes: null // Preenchido inteiramente via lazy load no frontend
  }));

  const response = { total, items };

  // Cache da listagem por 2 minutos
  cacheStorage.produtos.set(cacheKey, { data: response, expireAt: Date.now() + 120000 });

  return response;
}

/**
 * Busca as informações de vendas (última venda e saídas do mês) para uma lista de produtos específicos
 * Método rápido que usa chaves primárias e agrupamento leve indexado.
 * @param {Array<number>} productIds 
 * @returns {Promise<Object>}
 */
async function obterInformacoesVendasProdutos(productIds) {
  if (!productIds || productIds.length === 0) return {};

  const placeholders = productIds.map(() => '?').join(', ');
  
  const data30DiasAtras = new Date();
  data30DiasAtras.setDate(data30DiasAtras.getDate() - 30);
  data30DiasAtras.setHours(0, 0, 0, 0);
  const inicio30Dias = formatarDataFirebird(data30DiasAtras);

  // Query 1: Saídas dos últimos 30 dias em lote
  const sqlSaidas = `
    SELECT 
      iv.PRODUTO_ID,
      SUM(iv.ITEMVEND_QUANT) as SAIDAS_MES
    FROM ITEM_VENDAS iv
    JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
    WHERE v.CANCELADO <> 'S'
      AND iv.PRODUTO_ID IN (${placeholders})
      AND v.VENDA_DATA_HORA >= ?
    GROUP BY iv.PRODUTO_ID
  `;

  // Query 2: Última venda em lote
  const sqlUltimasVendas = `
    SELECT 
      iv.PRODUTO_ID,
      MAX(v.VENDA_DATA_HORA) as ULTIMA_VENDA
    FROM ITEM_VENDAS iv
    JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
    WHERE v.CANCELADO <> 'S'
      AND iv.PRODUTO_ID IN (${placeholders})
    GROUP BY iv.PRODUTO_ID
  `;

  const [saidasResult, ultimasResult] = await Promise.all([
    queryDigifarma(sqlSaidas, [...productIds, inicio30Dias]),
    queryDigifarma(sqlUltimasVendas, productIds)
  ]);

  const result = {};
  
  // Inicializa o objeto de retorno
  productIds.forEach(id => {
    result[id] = { saidasMes: 0, lastSale: null };
  });

  if (saidasResult && saidasResult.length > 0) {
    saidasResult.forEach(row => {
      if (result[row.PRODUTO_ID]) {
        result[row.PRODUTO_ID].saidasMes = row.SAIDAS_MES || 0;
      }
    });
  }

  if (ultimasResult && ultimasResult.length > 0) {
    ultimasResult.forEach(row => {
      if (result[row.PRODUTO_ID]) {
        result[row.PRODUTO_ID].lastSale = row.ULTIMA_VENDA || null;
      }
    });
  }

  return result;
}

/**
 * Obtém a lista de categorias do Digifarma
 * @param {boolean} bypassCache 
 * @returns {Promise<Array>}
 */
async function obterCategorias(bypassCache = false) {
  if (!bypassCache && cacheStorage.categorias.data && Date.now() < cacheStorage.categorias.expireAt) {
    console.log('[Stock Service] Devolvendo categorias do cache.');
    return cacheStorage.categorias.data;
  }

  const sql = `
    SELECT CATEGORIA_ID, CATEGORIA 
    FROM CATEGORIA 
    WHERE CATEGORIA IS NOT NULL 
    ORDER BY CATEGORIA ASC
  `;
  const result = await queryDigifarma(sql);
  const data = result.map(r => ({
    id: r.CATEGORIA_ID,
    name: r.CATEGORIA ? r.CATEGORIA.trim() : ''
  }));

  // Salva no cache por 1 hora
  cacheStorage.categorias = { data, expireAt: Date.now() + 3600000 };

  return data;
}

module.exports = {
  obterResumoEstoque,
  listarProdutosEstoque,
  obterInformacoesVendasProdutos,
  obterCategorias,
  limparCacheEstoque
};
