const { queryDigifarma } = require('./digifarma.service');

/**
 * Obtém o resumo consolidador do estoque (cards estatísticos)
 * @returns {Promise<Object>}
 */
async function obterResumoEstoque() {
  const sqlAtivos = `
    SELECT COUNT(*) as TOTAL_ATIVOS
    FROM PRODUTOS
    WHERE PROD_ATIVO = 'S' AND PROD_SALDO > 0
  `;
  
  const sqlSaidasMes = `
    SELECT COALESCE(SUM(iv.ITEMVEND_QUANT), 0) as TOTAL_SAIDAS
    FROM ITEM_VENDAS iv
    JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
    WHERE v.CANCELADO <> 'S'
      AND EXTRACT(MONTH FROM v.VENDA_DATA_HORA) = EXTRACT(MONTH FROM CURRENT_TIMESTAMP)
      AND EXTRACT(YEAR FROM v.VENDA_DATA_HORA) = EXTRACT(YEAR FROM CURRENT_TIMESTAMP)
  `;

  const sqlParados = `
    SELECT 
      COUNT(*) as QTD_PARADA,
      COALESCE(SUM(p.PROD_SALDO * COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0)), 0) as VALOR_PARADO
    FROM PRODUTOS p
    LEFT JOIN (
      SELECT 
        iv.PRODUTO_ID, 
        MAX(v.VENDA_DATA_HORA) as ULTIMA_VENDA 
      FROM ITEM_VENDAS iv
      JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
      WHERE v.CANCELADO <> 'S'
      GROUP BY iv.PRODUTO_ID
    ) uv ON p.PRODUTO_ID = uv.PRODUTO_ID
    WHERE p.PROD_ATIVO = 'S'
      AND p.PROD_SALDO > 0
      AND (uv.ULTIMA_VENDA IS NULL OR uv.ULTIMA_VENDA < CAST('NOW' AS TIMESTAMP) - 90)
  `;

  const [ativosResult, saidasResult, paradosResult] = await Promise.all([
    queryDigifarma(sqlAtivos),
    queryDigifarma(sqlSaidasMes),
    queryDigifarma(sqlParados)
  ]);

  return {
    totalAtivos: ativosResult[0].TOTAL_ATIVOS || 0,
    totalSaidasMes: saidasResult[0].TOTAL_SAIDAS || 0,
    qtdParados: paradosResult[0].QTD_PARADA || 0,
    valorParado: paradosResult[0].VALOR_PARADO || 0
  };
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

  // Filtro de dias sem venda
  if (!isNaN(daysWithoutSales) && daysWithoutSales > 0) {
    whereClause += ` AND (uv.ULTIMA_VENDA IS NULL OR uv.ULTIMA_VENDA < CAST('NOW' AS TIMESTAMP) - CAST(? AS INTEGER))`;
    sqlParams.push(daysWithoutSales);
  }

  // Ordenação
  let orderBy = 'p.PRODUTO ASC';
  if (sort === 'tempo_sem_venda') {
    orderBy = 'uv.ULTIMA_VENDA ASC NULLS FIRST, p.PRODUTO ASC';
  } else if (sort === 'saldo_desc') {
    orderBy = 'p.PROD_SALDO DESC, p.PRODUTO ASC';
  } else if (sort === 'saldo_asc') {
    orderBy = 'p.PROD_SALDO ASC, p.PRODUTO ASC';
  } else if (sort === 'preco_desc') {
    orderBy = 'p.PROD_PRVENDA DESC, p.PRODUTO ASC';
  } else if (sort === 'preco_asc') {
    orderBy = 'p.PROD_PRVENDA ASC, p.PRODUTO ASC';
  } else if (sort === 'nome_desc') {
    orderBy = 'p.PRODUTO DESC';
  }

  // 1. Query para total count (paginação)
  const sqlCount = `
    SELECT COUNT(*) as TOTAL_COUNT
    FROM PRODUTOS p
    LEFT JOIN (
      SELECT 
        iv.PRODUTO_ID, 
        MAX(v.VENDA_DATA_HORA) as ULTIMA_VENDA 
      FROM ITEM_VENDAS iv
      JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
      WHERE v.CANCELADO <> 'S'
      GROUP BY iv.PRODUTO_ID
    ) uv ON p.PRODUTO_ID = uv.PRODUTO_ID
    WHERE ${whereClause}
  `;

  // 2. Query de dados paginados (sem o join pesado de saídas globais)
  const sqlData = `
    SELECT FIRST ${limit} SKIP ${offset}
      p.PRODUTO_ID,
      p.PRODUTO,
      p.APRESENTACAO,
      p.COD_BARRAS,
      p.PROD_SALDO,
      p.PROD_PRVENDA,
      COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA,
      c.CATEGORIA as CATEGORIA_NOME,
      uv.ULTIMA_VENDA
    FROM PRODUTOS p
    LEFT JOIN CATEGORIA c ON p.CATEGORIA_ID = c.CATEGORIA_ID
    LEFT JOIN (
      SELECT 
        iv.PRODUTO_ID, 
        MAX(v.VENDA_DATA_HORA) as ULTIMA_VENDA 
      FROM ITEM_VENDAS iv
      JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
      WHERE v.CANCELADO <> 'S'
      GROUP BY iv.PRODUTO_ID
    ) uv ON p.PRODUTO_ID = uv.PRODUTO_ID
    WHERE ${whereClause}
    ORDER BY ${orderBy}
  `;

  const [countResult, dataResult] = await Promise.all([
    queryDigifarma(sqlCount, sqlParams),
    queryDigifarma(sqlData, sqlParams)
  ]);

  const total = countResult[0].TOTAL_COUNT || 0;

  // Busca saídas no mês apenas para os produtos da página atual (muito mais rápido e indexado)
  const saidasMap = {};
  if (dataResult.length > 0) {
    const productIds = dataResult.map(r => r.PRODUTO_ID);
    const placeholders = productIds.map(() => '?').join(', ');
    
    const sqlSaidas = `
      SELECT 
        iv.PRODUTO_ID,
        SUM(iv.ITEMVEND_QUANT) as SAIDAS_MES
      FROM ITEM_VENDAS iv
      JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
      WHERE v.CANCELADO <> 'S'
        AND iv.PRODUTO_ID IN (${placeholders})
        AND EXTRACT(MONTH FROM v.VENDA_DATA_HORA) = EXTRACT(MONTH FROM CURRENT_TIMESTAMP)
        AND EXTRACT(YEAR FROM v.VENDA_DATA_HORA) = EXTRACT(YEAR FROM CURRENT_TIMESTAMP)
      GROUP BY iv.PRODUTO_ID
    `;

    try {
      const saidasResult = await queryDigifarma(sqlSaidas, productIds);
      if (saidasResult && saidasResult.length > 0) {
        saidasResult.forEach(row => {
          saidasMap[row.PRODUTO_ID] = row.SAIDAS_MES || 0;
        });
      }
    } catch (err) {
      console.warn('[Stock Service] Erro ao buscar saídas mensais dos itens da página:', err.message);
    }
  }
  
  const items = dataResult.map(r => ({
    id: r.PRODUTO_ID,
    name: r.PRODUTO ? r.PRODUTO.trim() : 'Sem Nome',
    presentation: r.APRESENTACAO ? r.APRESENTACAO.trim() : '',
    barcode: r.COD_BARRAS ? r.COD_BARRAS.trim() : '',
    saldo: r.PROD_SALDO || 0,
    priceVenda: r.PROD_PRVENDA || 0,
    priceCompra: r.PROD_PRCOMPRA || 0,
    categoryName: r.CATEGORIA_NOME ? r.CATEGORIA_NOME.trim() : 'Sem Categoria',
    lastSale: r.ULTIMA_VENDA || null,
    saidasMes: saidasMap[r.PRODUTO_ID] || 0
  }));

  return { total, items };
}

/**
 * Obtém a lista de categorias do Digifarma
 * @returns {Promise<Array>}
 */
async function obterCategorias() {
  const sql = `
    SELECT CATEGORIA_ID, CATEGORIA 
    FROM CATEGORIA 
    WHERE CATEGORIA IS NOT NULL 
    ORDER BY CATEGORIA ASC
  `;
  const result = await queryDigifarma(sql);
  return result.map(r => ({
    id: r.CATEGORIA_ID,
    name: r.CATEGORIA ? r.CATEGORIA.trim() : ''
  }));
}

module.exports = {
  obterResumoEstoque,
  listarProdutosEstoque,
  obterCategorias
};
