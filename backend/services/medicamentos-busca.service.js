/**
 * medicamentos-busca.service.js
 * Motor Centralizado de Busca e Inteligência de Estoque de Medicamentos (BelaFarma)
 * 
 * Responsabilidades:
 * 1. Inteligência de Estoque:
 *    - Estoque Mínimo para 30 dias sem ruptura: Math.ceil(VMD_P * 30 * (1 + margem/100))
 *    - Piso para Curva A: Math.max(2, est_minimo_calculado) se ativo e VMD > 0
 *    - Estoque Máximo rigorosamente 2x Mínimo (est_maximo_calculado == est_minimo_calculado * 2)
 *    - Quantidade sugerida de compra: Math.max(0, est_minimo_calculado - saldo)
 *    - Matriz de 4 Status: RUPTURA (saldo <= 0), ABAIXO_MINIMO (0 < saldo < min), NORMAL (min <= saldo <= max), EXCESSO (saldo > max)
 * 2. Resolução de Preço de Venda Vigente:
 *    - Avaliação precisa de vigência promocional com data e hora (23:59:59.999)
 * 3. Busca Ultrarrápida (< 10ms SLA) indexada em SQLite local (compras_estoque_cache)
 * 4. Sincronização em Lote Resiliente:
 *    - Extração do Firebird com fallback automático e transparente no cache SQLite local
 */

const db = require('../database');
const { queryDigifarma } = require('./digifarma.service');

/**
 * Calcula a inteligência de reposição e estoque para 30 dias de giro sem ruptura.
 * 
 * @param {number} saldo Saldo atual em estoque
 * @param {number} vmd Venda Média Diária ponderada
 * @param {number} [margem=15] Margem de segurança percentual (padrão 15)
 * @param {string} [curvaAbc='C'] Curva ABC ('A', 'B', 'C')
 * @param {boolean} [ativo=true] Se o produto está ativo no catálogo
 * @returns {Object}
 */
function calcularInteligenciaEstoque(saldo, vmd, margem = 15, curvaAbc = 'C', ativo = true) {
  const saldoNum = (saldo !== null && saldo !== undefined && !isNaN(Number(saldo))) ? Number(saldo) : 0;
  const vmdNum = Math.max(0, Number(vmd) || 0);
  const margemNum = (margem !== null && margem !== undefined && !isNaN(Number(margem))) ? Number(margem) : 15;
  const curva = (curvaAbc || 'C').toString().toUpperCase();
  const isAtivo = ativo !== undefined ? Boolean(ativo) : true;

  let estMinimoCalculado = 0;
  if (vmdNum > 0 && isAtivo) {
    estMinimoCalculado = Math.ceil(vmdNum * 30 * (1 + margemNum / 100));
    if (curva === 'A') {
      estMinimoCalculado = Math.max(2, estMinimoCalculado);
    }
  }

  // Rigorosamente 2x o estoque mínimo
  const estMaximoCalculado = estMinimoCalculado * 2;

  // Defasagem para suprir 30 dias de giro sem ruptura
  const qtdSugeridaCompra = Math.max(0, estMinimoCalculado - saldoNum);

  // Matriz dos 4 status
  let statusRuptura = 'NORMAL';
  if (saldoNum <= 0) {
    statusRuptura = 'RUPTURA';
  } else if (saldoNum < estMinimoCalculado) {
    statusRuptura = 'ABAIXO_MINIMO';
  } else if (saldoNum <= estMaximoCalculado) {
    statusRuptura = 'NORMAL';
  } else {
    statusRuptura = 'EXCESSO';
  }

  return {
    est_minimo_calculado: estMinimoCalculado,
    est_maximo_calculado: estMaximoCalculado,
    qtd_sugerida_compra: qtdSugeridaCompra,
    status_ruptura: statusRuptura,
    vmd_ponderado: vmdNum,
    margem_aplicada: margemNum
  };
}

/**
 * Resolve o preço de venda vigente para um medicamento com precisão de data/hora (23:59:59.999).
 * Se dentro do período de vigência e preço promocional for positivo, retorna preco_promocional.
 * Caso contrário, retorna o preço normal de venda.
 * 
 * @param {Object} produto Objeto com campos preco_normal/preco_venda, preco_promocional, inicio_promocao, termino_promocao
 * @param {Date|string|number} [dataRef=new Date()] Data de referência para a validação da vigência
 * @returns {number} Preço vigente em formato numérico
 */
function resolverPrecoVigente(produto, dataRef = new Date()) {
  if (!produto || typeof produto !== 'object') return 0;

  const now = dataRef instanceof Date ? dataRef : new Date(dataRef);
  const precoNormal = Number(produto.preco_normal) || Number(produto.preco_venda) || 0;
  const precoPromocional = Number(produto.preco_promocional) || 0;

  if (precoPromocional > 0 && produto.inicio_promocao && produto.termino_promocao) {
    let inicioStr = String(produto.inicio_promocao).trim();
    let terminoStr = String(produto.termino_promocao).trim();

    if (inicioStr.length === 10) inicioStr += 'T00:00:00';
    if (terminoStr.length === 10) terminoStr += 'T23:59:59.999';

    const inicio = new Date(inicioStr);
    const termino = new Date(terminoStr);

    if (!isNaN(inicio.getTime()) && !isNaN(termino.getTime()) && !isNaN(now.getTime())) {
      if (now.getTime() >= inicio.getTime() && now.getTime() <= termino.getTime()) {
        return precoPromocional;
      }
    }
  }

  return precoNormal;
}

/**
 * Versão detalhada de resolução de preço vigente
 * @returns {{ precoVigente: number, preco_venda_vigente: number, promocaoAtiva: boolean, precoNormal: number, precoPromocional: number }}
 */
function resolverPrecoVigenteDetalhado(produto, dataRef = new Date()) {
  const precoVigente = resolverPrecoVigente(produto, dataRef);
  const precoPromocional = Number(produto?.preco_promocional) || 0;
  const promocaoAtiva = precoVigente === precoPromocional && precoPromocional > 0;
  return {
    precoVigente,
    preco_venda_vigente: precoVigente,
    promocaoAtiva,
    precoNormal: Number(produto?.preco_normal) || Number(produto?.preco_venda) || 0,
    precoPromocional
  };
}

/**
 * Busca medicamentos no cache local SQLite com SLA < 10ms, filtros de status, curva e busca textual flexível.
 * 
 * @param {Object} database Instância do SQLite (ou null para usar singleton)
 * @param {Object} params { q, status, curva, limit, offset }
 * @returns {{ success: boolean, total: number, page: number, limit: number, items: Array }}
 */
function buscarMedicamentos(database, { q, status, curva, limit = 20, offset = 0 } = {}) {
  const sqlite = database || db;
  const lim = Math.min(Math.max(1, Number(limit) || 20), 500);
  const off = Math.max(0, Number(offset) || 0);
  const page = Math.floor(off / lim) + 1;

  const whereParts = ['1=1'];
  let queryParams = [];
  let isNumeric = false;
  let trimmed = '';

  if (q) {
    trimmed = String(q).trim();
    isNumeric = /^\d+$/.test(trimmed);
    if (isNumeric) {
      const num = Number(trimmed);
      whereParts.push('(produto_id = ? OR ean = ?)');
      queryParams.push(num, trimmed);
    } else {
      whereParts.push('(descricao LIKE ? OR ean = ?)');
      queryParams.push(`${trimmed}%`, trimmed);
    }
  }

  if (status) {
    whereParts.push('status_ruptura = ?');
    queryParams.push(String(status).trim());
  }

  if (curva) {
    whereParts.push('curva_abc = ?');
    queryParams.push(String(curva).trim().toUpperCase());
  }

  let whereSql = `WHERE ${whereParts.join(' AND ')}`;

  let items = sqlite.prepare(`
    SELECT *
    FROM compras_estoque_cache
    ${whereSql}
    ORDER BY produto_id ASC
    LIMIT ? OFFSET ?
  `).all(...queryParams, lim, off);

  // Fallback para busca por fragmento (%termo%) se busca por prefixo não retornar itens
  if (items.length === 0 && q && !isNumeric) {
    const fallbackWhereParts = ['1=1'];
    const fallbackParams = [];
    fallbackWhereParts.push('(descricao LIKE ? OR ean = ?)');
    fallbackParams.push(`%${trimmed}%`, trimmed);
    if (status) {
      fallbackWhereParts.push('status_ruptura = ?');
      fallbackParams.push(String(status).trim());
    }
    if (curva) {
      fallbackWhereParts.push('curva_abc = ?');
      fallbackParams.push(String(curva).trim().toUpperCase());
    }
    const fallbackWhereSql = `WHERE ${fallbackWhereParts.join(' AND ')}`;
    items = sqlite.prepare(`
      SELECT *
      FROM compras_estoque_cache
      ${fallbackWhereSql}
      ORDER BY produto_id ASC
      LIMIT ? OFFSET ?
    `).all(...fallbackParams, lim, off);
    whereSql = fallbackWhereSql;
    queryParams = fallbackParams;
  }

  let total = 0;
  if (isNumeric || items.length < lim) {
    total = off + items.length;
  } else {
    const countRow = sqlite.prepare(`SELECT COUNT(*) as c FROM compras_estoque_cache ${whereSql}`).get(...queryParams);
    total = countRow ? countRow.c : 0;
  }

  return {
    success: true,
    total,
    page,
    limit: lim,
    items
  };
}

/**
 * Obtém detalhe consolidado de um medicamento por ID primário ou código de barras EAN.
 * 
 * @param {Object} database Instância do SQLite
 * @param {number|string} id ID Digifarma ou EAN
 * @returns {Object|null}
 */
function obterMedicamentoPorId(database, id) {
  const sqlite = database || db;
  if (id === null || id === undefined || id === '') return null;

  const idStr = String(id).trim();
  const idNum = Number(idStr);

  let row = null;
  if (!isNaN(idNum) && /^\d+$/.test(idStr)) {
    row = sqlite.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(idNum);
  }

  if (!row) {
    row = sqlite.prepare('SELECT * FROM compras_estoque_cache WHERE ean = ?').get(idStr);
  }

  return row || null;
}

/**
 * Lista medicamentos com status crítico ('RUPTURA' ou 'ABAIXO_MINIMO') e calcula montante financeiro total de reposição para 30 dias.
 * 
 * @param {Object} database Instância do SQLite
 * @param {Object} options { curva, limit, offset }
 * @returns {{ success: boolean, total: number, total_orcado_30d: number, items: Array }}
 */
function obterRupturas(database, { curva, limit, offset } = {}) {
  const sqlite = database || db;
  const hasLimit = limit !== undefined && limit !== null && limit !== '';
  const lim = hasLimit ? Math.max(1, Number(limit) || 50) : null;
  const off = offset !== undefined && offset !== null && offset !== '' ? Math.max(0, Number(offset) || 0) : 0;

  const whereParts = ["status_ruptura IN ('RUPTURA', 'ABAIXO_MINIMO')"];
  const params = [];

  if (curva) {
    whereParts.push("curva_abc = ?");
    params.push(String(curva).trim().toUpperCase());
  }

  const whereSql = `WHERE ${whereParts.join(' AND ')}`;

  const statsRow = sqlite.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(
        qtd_sugerida_compra * COALESCE(NULLIF(preco_unitario_ult_compra, 0), NULLIF(custo_unitario, 0), ultima_compra_valor, 0)
      ) as total_orcado_30d
    FROM compras_estoque_cache
    ${whereSql}
  `).get(...params);

  let sql = `
    SELECT *
    FROM compras_estoque_cache
    ${whereSql}
    ORDER BY CASE WHEN status_ruptura = 'RUPTURA' THEN 1 ELSE 2 END, curva_abc ASC, qtd_sugerida_compra DESC
  `;
  const queryParams = [...params];

  if (hasLimit) {
    sql += ` LIMIT ? OFFSET ?`;
    queryParams.push(lim, off);
  }

  const items = sqlite.prepare(sql).all(...queryParams);

  const total = statsRow ? statsRow.total : 0;
  const totalOrcado = statsRow ? Number(((statsRow.total_orcado_30d) || 0).toFixed(2)) : 0;

  return {
    success: true,
    total,
    total_orcado_30d: totalOrcado,
    items
  };
}

/**
 * Formata valores de data/timestamp para string ISO aceita pelo SQLite.
 * Trata objetos Date nativos retornados pelo driver Firebird.
 */
function formatarDataParaSqlite(val) {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString();
  }
  return String(val).trim();
}

/**
 * Sincroniza o estoque de medicamentos de forma atômica e resiliente.
 * Consulta o Firebird para dados de catálogo, vendas 30/60/90d, promoções e notas de entrada.
 * Em caso de indisponibilidade/timeout do Firebird ou flag forceOffline, processa 100% via cache local SQLite.
 * 
 * @param {Object} database Instância do banco SQLite (better-sqlite3)
 * @param {Object} options Configurações ({ forceOffline, margemSegurancaPercent, notificarHoracio })
 * @returns {Promise<{ success: boolean, fromCache: boolean, totalSincronizados: number, itensCriticos: number, durationMs: number }>}
 */
async function sincronizarEstoqueMedicamentos(database, options = {}) {
  const inicio = Date.now();
  const sqlite = database || db;
  const margem = Number(options.margemSegurancaPercent || options.margem) || 15;
  const forceOffline = Boolean(options.forceOffline);

  let produtos = [];
  let fromCache = false;

  if (!forceOffline) {
    try {
      const sqlFirebird = `
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
          COALESCE(p.PROD_PRVENDA, 0) as PRECO_NORMAL,
          COALESCE(p.PROD_PRPROMOCAO, 0) as PRECO_PROMOCIONAL,
          p.INICIO_PROMOCAO,
          p.TERMINO_PROMOCAO,
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
      produtos = await queryDigifarma(sqlFirebird, [], 60000);
    } catch (errFb) {
      console.warn(`[Medicamentos Busca] Firebird indisponível (${errFb.message}). Operando em modo de resiliência SQLite local.`);
      fromCache = true;
    }
  } else {
    fromCache = true;
  }

  // Fallback transparente: extrai do SQLite existente se Firebird falhou ou forceOffline
  if (fromCache || !produtos || produtos.length === 0) {
    fromCache = true;
    try {
      const cached = sqlite.prepare('SELECT * FROM compras_estoque_cache').all();
      produtos = cached.map(c => ({
        PRODUTO_ID: c.produto_id,
        DESCRICAO: c.descricao,
        APRESENTACAO: c.apresentacao || '',
        EAN: c.ean || '',
        CATEGORIA_ID: c.categoria_id || 0,
        CURVA_ABC: c.curva_abc || 'C',
        curva_abc: c.curva_abc || 'C',
        SALDO: c.saldo || 0,
        EST_MINIMO_DIGIFARMA: c.est_minimo_digifarma || 0,
        CUSTO_UNITARIO: c.custo_unitario || 0,
        ULTIMA_COMPRA_VALOR: c.ultima_compra_valor || 0,
        PRECO_NORMAL: c.preco_normal || 0,
        PRECO_PROMOCIONAL: c.preco_promocional || 0,
        INICIO_PROMOCAO: c.inicio_promocao,
        TERMINO_PROMOCAO: c.termino_promocao,
        PROD_ATIVO: 'S',
        VENDAS_30D: c.vendas_30d || 0,
        VENDAS_31_60D: c.vendas_31_60d || 0,
        VENDAS_61_90D: c.vendas_61_90d || 0,
        PRECO_UNITARIO_ULT_COMPRA: c.preco_unitario_ult_compra,
        ULTIMA_COMPRA_FORNECEDOR: c.ultima_compra_fornecedor,
        ULTIMA_COMPRA_DATA: c.ultima_compra_data,
        ULTIMA_COMPRA_NF: c.ultima_compra_nf
      }));
    } catch (errCache) {
      console.error('[Medicamentos Busca] Erro ao carregar dados do cache SQLite local:', errCache.message);
      produtos = [];
    }
  }

  // Mapa de últimas compras da tabela especializada (digifarma_ultimas_compras_cache)
  const ultimasComprasMap = new Map();
  try {
    let ultimas;
    try {
      ultimas = sqlite.prepare(`
        SELECT produto_id, preco_unitario_ult_compra, fornecedor_nome, data_compra, numero_nota_fiscal, fonte
        FROM digifarma_ultimas_compras_cache
      `).all();
    } catch (eCol) {
      ultimas = sqlite.prepare(`
        SELECT produto_id, preco_unitario_ult_compra, fornecedor_nome, data_compra, numero_nota_fiscal
        FROM digifarma_ultimas_compras_cache
      `).all();
    }
    for (const uc of ultimas) {
      if (uc.produto_id) {
        ultimasComprasMap.set(Number(uc.produto_id), uc);
      }
    }
  } catch (e) {}

  // Cálculo de Curva ABC por faturamento estimado nos 90 dias
  const revenues = produtos.map(p => {
    const pId = Number(p.PRODUTO_ID || p.produto_id);
    const v30 = Number(p.VENDAS_30D || 0);
    const v60 = Number(p.VENDAS_31_60D || 0);
    const v90 = Number(p.VENDAS_61_90D || 0);
    const custo = Number(p.CUSTO_UNITARIO || 0);
    const rev = ((v30 * 0.50) + (v60 * 0.30) + (v90 * 0.20)) * Math.max(1, custo);
    return { pId, rev };
  });

  revenues.sort((a, b) => b.rev - a.rev);
  const totalRev = revenues.reduce((acc, curr) => acc + curr.rev, 0);

  const curvaMap = new Map();
  let accumulated = 0;
  for (const item of revenues) {
    if (item.rev > 0 && totalRev > 0) {
      accumulated += item.rev;
      const pct = (accumulated / totalRev) * 100;
      if (pct <= 80) curvaMap.set(item.pId, 'A');
      else if (pct <= 95) curvaMap.set(item.pId, 'B');
      else curvaMap.set(item.pId, 'C');
    } else {
      curvaMap.set(item.pId, 'C');
    }
  }

  // Processamento e consolidação dos produtos
  const itensParaSalvar = [];
  let totalCriticos = 0;
  const itensCriticosList = [];

  for (const p of produtos) {
    const pId = Number(p.PRODUTO_ID || p.produto_id);
    if (!pId || isNaN(pId)) continue;

    const saldo = Number(p.SALDO !== undefined ? p.SALDO : p.saldo) || 0;
    const v30 = Number(p.VENDAS_30D !== undefined ? p.VENDAS_30D : p.vendas_30d) || 0;
    const v60 = Number(p.VENDAS_31_60D !== undefined ? p.VENDAS_31_60D : p.vendas_31_60d) || 0;
    const v90 = Number(p.VENDAS_61_90D !== undefined ? p.VENDAS_61_90D : p.vendas_61_90d) || 0;
    const custoUnitario = Number(p.CUSTO_UNITARIO !== undefined ? p.CUSTO_UNITARIO : p.custo_unitario) || 0;
    const ultCompraValor = Number(p.ULTIMA_COMPRA_VALOR !== undefined ? p.ULTIMA_COMPRA_VALOR : p.ultima_compra_valor) || 0;
    const precoNormal = Number(p.PRECO_NORMAL !== undefined ? p.PRECO_NORMAL : p.preco_normal) || 0;
    const precoPromocional = Number(p.PRECO_PROMOCIONAL !== undefined ? p.PRECO_PROMOCIONAL : p.preco_promocional) || 0;
    const inicioPromocao = formatarDataParaSqlite(p.INICIO_PROMOCAO !== undefined ? p.INICIO_PROMOCAO : p.inicio_promocao);
    const terminoPromocao = formatarDataParaSqlite(p.TERMINO_PROMOCAO !== undefined ? p.TERMINO_PROMOCAO : p.termino_promocao);
    const curvaAbc = p.curva_abc || p.CURVA_ABC || curvaMap.get(pId) || 'C';
    const ativo = String(p.PROD_ATIVO || 'S').toUpperCase() === 'S';

    const uc = ultimasComprasMap.get(pId);
    const precoUnitarioUltCompra = uc && Number(uc.preco_unitario_ult_compra) > 0
      ? Number(uc.preco_unitario_ult_compra)
      : (Number(p.PRECO_UNITARIO_ULT_COMPRA || p.preco_unitario_ult_compra) > 0
          ? Number(p.PRECO_UNITARIO_ULT_COMPRA || p.preco_unitario_ult_compra)
          : (ultCompraValor > 0 ? ultCompraValor : custoUnitario));

    const ucTemNfReal = uc && (uc.fonte === 'NOTA_FISCAL' || uc.fonte === undefined) && uc.fornecedor_nome && uc.fornecedor_nome !== 'Cadastro Geral Digifarma';
    const ultFornecedor = ucTemNfReal ? uc.fornecedor_nome : (p.ULTIMA_COMPRA_FORNECEDOR || p.ultima_compra_fornecedor || (uc ? uc.fornecedor_nome : null));
    const rawUltData = ucTemNfReal ? uc.data_compra : (p.ULTIMA_COMPRA_DATA || p.ultima_compra_data || (uc ? uc.data_compra : null));
    const ultData = formatarDataParaSqlite(rawUltData);
    const ultNf = ucTemNfReal ? uc.numero_nota_fiscal : (p.ULTIMA_COMPRA_NF || p.ultima_compra_nf || (uc ? uc.numero_nota_fiscal : null));

    const precoVigente = resolverPrecoVigente({
      preco_normal: precoNormal,
      preco_promocional: precoPromocional,
      inicio_promocao: inicioPromocao,
      termino_promocao: terminoPromocao
    });

    const vmdPonderado = Number((((v30 * 0.50) + (v60 * 0.30) + (v90 * 0.20)) / 30).toFixed(4));
    const intel = calcularInteligenciaEstoque(saldo, vmdPonderado, margem, curvaAbc, ativo);

    const temGiroOuEstoque = v30 > 0 || vmdPonderado > 0 || saldo > 0;
    if ((intel.status_ruptura === 'RUPTURA' || intel.status_ruptura === 'ABAIXO_MINIMO') && temGiroOuEstoque) {
      totalCriticos++;
      itensCriticosList.push({
        produto_id: pId,
        descricao: String(p.DESCRICAO || p.descricao || '').trim(),
        ean: String(p.EAN || p.COD_BARRAS || p.ean || '').trim(),
        saldo,
        est_minimo_calculado: intel.est_minimo_calculado,
        qtd_sugerida_compra: intel.qtd_sugerida_compra,
        preco_unitario_ult_compra: precoUnitarioUltCompra,
        status_ruptura: intel.status_ruptura,
        curva_abc: curvaAbc
      });
    }

    itensParaSalvar.push({
      produto_id: pId,
      descricao: String(p.DESCRICAO || p.descricao || 'PRODUTO').trim(),
      apresentacao: String(p.APRESENTACAO || p.apresentacao || '').trim(),
      ean: String(p.EAN || p.COD_BARRAS || p.ean || '').trim(),
      categoria_id: Number(p.CATEGORIA_ID || p.categoria_id || 0),
      curva_abc: curvaAbc,
      saldo,
      est_minimo_calculado: intel.est_minimo_calculado,
      est_maximo_calculado: intel.est_maximo_calculado,
      est_minimo_digifarma: Number(p.EST_MINIMO_DIGIFARMA || p.est_minimo_digifarma || 0),
      vmd_ponderado: vmdPonderado,
      vendas_30d: v30,
      vendas_31_60d: v60,
      vendas_61_90d: v90,
      ciclo_vida: 'ESTAVEL',
      custo_unitario: custoUnitario,
      ultima_compra_valor: ultCompraValor,
      preco_unitario_ult_compra: precoUnitarioUltCompra,
      ultima_compra_fornecedor: ultFornecedor,
      ultima_compra_data: ultData,
      ultima_compra_nf: ultNf,
      preco_normal: precoNormal,
      preco_promocional: precoPromocional,
      inicio_promocao: inicioPromocao,
      termino_promocao: terminoPromocao,
      preco_venda_vigente: precoVigente,
      qtd_sugerida_compra: intel.qtd_sugerida_compra,
      status_ruptura: intel.status_ruptura,
      margem_seguranca_aplicada: margem
    });
  }

  // Upsert atômico de alta performance no SQLite
  if (itensParaSalvar.length > 0) {
    const upsertStmt = sqlite.prepare(`
      INSERT INTO compras_estoque_cache (
        produto_id, descricao, apresentacao, ean, categoria_id, curva_abc,
        saldo, est_minimo_calculado, est_maximo_calculado, est_minimo_digifarma,
        vmd_ponderado, vendas_30d, vendas_31_60d, vendas_61_90d, ciclo_vida,
        custo_unitario, ultima_compra_valor, preco_unitario_ult_compra,
        ultima_compra_fornecedor, ultima_compra_data, ultima_compra_nf,
        preco_normal, preco_promocional, inicio_promocao, termino_promocao,
        preco_venda_vigente, qtd_sugerida_compra, status_ruptura,
        margem_seguranca_aplicada, dias_sem_venda, atualizado_em
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, 0, datetime('now', 'localtime')
      )
      ON CONFLICT(produto_id) DO UPDATE SET
        descricao = excluded.descricao,
        apresentacao = excluded.apresentacao,
        ean = excluded.ean,
        categoria_id = excluded.categoria_id,
        curva_abc = excluded.curva_abc,
        saldo = excluded.saldo,
        est_minimo_calculado = excluded.est_minimo_calculado,
        est_maximo_calculado = excluded.est_maximo_calculado,
        est_minimo_digifarma = excluded.est_minimo_digifarma,
        vmd_ponderado = excluded.vmd_ponderado,
        vendas_30d = excluded.vendas_30d,
        vendas_31_60d = excluded.vendas_31_60d,
        vendas_61_90d = excluded.vendas_61_90d,
        ciclo_vida = excluded.ciclo_vida,
        custo_unitario = excluded.custo_unitario,
        ultima_compra_valor = excluded.ultima_compra_valor,
        preco_unitario_ult_compra = excluded.preco_unitario_ult_compra,
        ultima_compra_fornecedor = excluded.ultima_compra_fornecedor,
        ultima_compra_data = excluded.ultima_compra_data,
        ultima_compra_nf = excluded.ultima_compra_nf,
        preco_normal = excluded.preco_normal,
        preco_promocional = excluded.preco_promocional,
        inicio_promocao = excluded.inicio_promocao,
        termino_promocao = excluded.termino_promocao,
        preco_venda_vigente = excluded.preco_venda_vigente,
        qtd_sugerida_compra = excluded.qtd_sugerida_compra,
        status_ruptura = excluded.status_ruptura,
        margem_seguranca_aplicada = excluded.margem_seguranca_aplicada,
        atualizado_em = datetime('now', 'localtime')
    `);

    const tx = sqlite.transaction((items) => {
      for (const i of items) {
        upsertStmt.run(
          i.produto_id, i.descricao, i.apresentacao, i.ean, i.categoria_id, i.curva_abc,
          i.saldo, i.est_minimo_calculado, i.est_maximo_calculado, i.est_minimo_digifarma,
          i.vmd_ponderado, i.vendas_30d, i.vendas_31_60d, i.vendas_61_90d, i.ciclo_vida,
          i.custo_unitario, i.ultima_compra_valor, i.preco_unitario_ult_compra,
          i.ultima_compra_fornecedor, i.ultima_compra_data, i.ultima_compra_nf,
          i.preco_normal, i.preco_promocional, i.inicio_promocao, i.termino_promocao,
          i.preco_venda_vigente, i.qtd_sugerida_compra, i.status_ruptura,
          i.margem_seguranca_aplicada
        );
      }
    });

    try {
      tx(itensParaSalvar);
    } catch (errTx) {
      console.error('[Medicamentos Busca] Erro na transação de salvamento SQLite:', errTx.message);
      return {
        success: false,
        error: errTx.message,
        fromCache,
        totalSincronizados: 0,
        itensCriticos: 0,
        durationMs: Date.now() - inicio
      };
    }
  }

  // Notificação proativa ao Agente Horácio se configurado
  if (options.notificarHoracio && itensCriticosList.length > 0) {
    try {
      const horacioAgent = require('./horacio-agent.service');
      if (horacioAgent && typeof horacioAgent.gerarRelatorioExecutivoSincronizacao === 'function') {
        await horacioAgent.gerarRelatorioExecutivoSincronizacao(itensCriticosList, sqlite);
      }
    } catch (eHoracio) {
      console.warn('[Medicamentos Busca] Horácio agent não notificado:', eHoracio.message);
    }
  }

  const durationMs = Date.now() - inicio;

  return {
    success: true,
    fromCache,
    totalSincronizados: itensParaSalvar.length,
    itensCriticos: totalCriticos,
    durationMs
  };
}

module.exports = {
  calcularInteligenciaEstoque,
  resolverPrecoVigente,
  resolverPrecoVigenteDetalhado,
  buscarMedicamentos,
  obterMedicamentoPorId,
  obterRupturas,
  sincronizarEstoqueMedicamentos
};
