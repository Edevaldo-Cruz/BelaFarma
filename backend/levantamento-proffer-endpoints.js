/**
 * levantamento-proffer-endpoints.js
 * Módulo: Levantamento de Produtos Ativos & Comparativo Proffer
 * /api/levantamento-proffer/*
 */

const express = require('express');
const crypto = require('crypto');
const { queryDigifarma } = require('./services/digifarma.service');
const {
  runNappScraper,
  getScrapeStatus,
  testProfferConnection,
  stopNappScraper
} = require('./services/napp-scraper.service');
const { recalcularTodosEstoqueMinimo } = require('./services/compras-estoque.service');
const {
  roundUpToAcceptedCents,
  calcularPrecoSugeridoMarkup
} = require('./services/pricing-customizations.service');
const { classifyProductCategory } = require('./services/pricing-engine.service');

const PRECO_LOJA_EXPR = 'COALESCE(NULLIF(c.preco_venda_vigente, 0), NULLIF(d.preco_venda, 0), NULLIF(c.preco_normal, 0), NULLIF(d.preco_normal, 0), 0)';
const CUSTO_EFETIVO_EXPR = 'COALESCE(NULLIF(c.custo_unitario, 0), NULLIF(uc.preco_unitario_ult_compra, 0), NULLIF(c.preco_unitario_ult_compra, 0), NULLIF(c.ultima_compra_valor, 0), NULLIF(d.preco_custo, 0), 0)';
const PROFFER_MEDIO_EXPR = 'COALESCE(n.preco_proffer_medio, n.preco_proffer)';
const PROFFER_BAIXO_EXPR = 'COALESCE(n.preco_proffer_baixo, n.preco_proffer_medio, n.preco_proffer)';
const PROFFER_ALTO_EXPR = 'COALESCE(n.preco_proffer_alto, n.preco_proffer_medio, n.preco_proffer)';
const VALID_FAIXA_REAL_EXPR = `((${PROFFER_BAIXO_EXPR} != ${PROFFER_ALTO_EXPR}) OR n.fonte = 'importacao_planilha')`;
const INDEPENDENTE_EXPR = `(COALESCE(n.proffer_grupo, 'INDEPENDENTE') = 'INDEPENDENTE')`;

const FROM_JOINS_SQL = `
  FROM levantamento_proffer_itens li
  INNER JOIN compras_estoque_cache c ON c.produto_id = li.produto_id
  LEFT JOIN digifarma_products_cache d ON d.rowid = (
    SELECT d2.rowid FROM digifarma_products_cache d2
    WHERE CAST(d2.produto_id AS INTEGER) = c.produto_id
    LIMIT 1
  )
  LEFT JOIN digifarma_ultimas_compras_cache uc ON uc.produto_id = c.produto_id
  LEFT JOIN napp_prices n ON n.ean = c.ean AND c.ean != ''
`;

const SORT_WHITELIST = {
  desvio_abs: {
    asc: `CASE WHEN ${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 THEN ABS((${PRECO_LOJA_EXPR} - ${PROFFER_MEDIO_EXPR}) / ${PROFFER_MEDIO_EXPR}) ELSE 999 END ASC, c.descricao ASC`,
    desc: `CASE WHEN ${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 THEN ABS((${PRECO_LOJA_EXPR} - ${PROFFER_MEDIO_EXPR}) / ${PROFFER_MEDIO_EXPR}) ELSE -1 END DESC, c.descricao ASC`
  },
  desvio: {
    asc: `CASE WHEN ${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 THEN ((${PRECO_LOJA_EXPR} - ${PROFFER_MEDIO_EXPR}) / ${PROFFER_MEDIO_EXPR}) ELSE 999 END ASC, c.descricao ASC`,
    desc: `CASE WHEN ${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 THEN ((${PRECO_LOJA_EXPR} - ${PROFFER_MEDIO_EXPR}) / ${PROFFER_MEDIO_EXPR}) ELSE -999 END DESC, c.descricao ASC`
  },
  descricao: { asc: 'c.descricao ASC', desc: 'c.descricao DESC' },
  curva: { asc: 'c.curva_abc ASC, c.descricao ASC', desc: 'c.curva_abc DESC, c.descricao ASC' },
  saldo: { asc: 'c.saldo ASC, c.descricao ASC', desc: 'c.saldo DESC, c.descricao ASC' },
  vendas30d: { asc: 'COALESCE(c.vendas_30d, 0) ASC, c.descricao ASC', desc: 'COALESCE(c.vendas_30d, 0) DESC, c.descricao ASC' },
  vendas10m: { asc: 'COALESCE(c.vendas_10m, 0) ASC, c.descricao ASC', desc: 'COALESCE(c.vendas_10m, 0) DESC, c.descricao ASC' },
  custo: { asc: `${CUSTO_EFETIVO_EXPR} ASC, c.descricao ASC`, desc: `${CUSTO_EFETIVO_EXPR} DESC, c.descricao ASC` },
  preco: { asc: `${PRECO_LOJA_EXPR} ASC, c.descricao ASC`, desc: `${PRECO_LOJA_EXPR} DESC, c.descricao ASC` },
  margem: {
    asc: `CASE WHEN ${PRECO_LOJA_EXPR} > 0 AND ${CUSTO_EFETIVO_EXPR} > 0 THEN ((${PRECO_LOJA_EXPR} - ${CUSTO_EFETIVO_EXPR}) / ${PRECO_LOJA_EXPR}) ELSE -999 END ASC, c.descricao ASC`,
    desc: `CASE WHEN ${PRECO_LOJA_EXPR} > 0 AND ${CUSTO_EFETIVO_EXPR} > 0 THEN ((${PRECO_LOJA_EXPR} - ${CUSTO_EFETIVO_EXPR}) / ${PRECO_LOJA_EXPR}) ELSE -999 END DESC, c.descricao ASC`
  },
  proffer: {
    asc: `COALESCE(${PROFFER_MEDIO_EXPR}, 0) ASC, c.descricao ASC`,
    desc: `COALESCE(${PROFFER_MEDIO_EXPR}, 0) DESC, c.descricao ASC`
  },
  ganho_mensal: {
    asc: `CASE WHEN ${PROFFER_MEDIO_EXPR} > ${PRECO_LOJA_EXPR} AND ${PRECO_LOJA_EXPR} > 0 THEN (${PROFFER_MEDIO_EXPR} - ${PRECO_LOJA_EXPR}) * MAX(1, COALESCE(c.vendas_30d, 0)) ELSE 0 END ASC, c.descricao ASC`,
    desc: `CASE WHEN ${PROFFER_MEDIO_EXPR} > ${PRECO_LOJA_EXPR} AND ${PRECO_LOJA_EXPR} > 0 THEN (${PROFFER_MEDIO_EXPR} - ${PRECO_LOJA_EXPR}) * MAX(1, COALESCE(c.vendas_30d, 0)) ELSE 0 END DESC, c.descricao ASC`
  },
  status: { asc: 'li.status_conferencia ASC, c.descricao ASC', desc: 'li.status_conferencia DESC, c.descricao ASC' }
};

/**
 * Sincroniza produtos com saldo != 0 existentes em digifarma_products_cache mas ausentes de compras_estoque_cache.
 */
function sincronizarFaltantesNoCacheCompras(db) {
  try {
    const info = db.prepare(`
      INSERT OR IGNORE INTO compras_estoque_cache (
        produto_id, descricao, ean, categoria_id, curva_abc, saldo,
        preco_venda_vigente, preco_normal, preco_promocional, custo_unitario,
        ativo_10m, atualizado_em
      )
      SELECT
        CAST(d.produto_id AS INTEGER),
        COALESCE(NULLIF(TRIM(d.descricao), ''), 'PRODUTO ' || d.produto_id),
        TRIM(COALESCE(d.codigo_barras, '')),
        COALESCE(d.categoria_id, 0),
        COALESCE(NULLIF(d.curva, ''), 'C'),
        COALESCE(d.estoque_atual, 0),
        COALESCE(d.preco_venda, 0),
        COALESCE(NULLIF(d.preco_normal, 0), d.preco_venda, 0),
        COALESCE(d.preco_promocao, 0),
        COALESCE(d.preco_custo, 0),
        1,
        datetime('now', 'localtime')
      FROM digifarma_products_cache d
      WHERE d.estoque_atual != 0
        AND CAST(d.produto_id AS INTEGER) > 0
        AND NOT EXISTS (
          SELECT 1 FROM compras_estoque_cache c
          WHERE c.produto_id = CAST(d.produto_id AS INTEGER)
        )
    `).run();
    return info.changes || 0;
  } catch (err) {
    console.warn('[Levantamento Proffer] Aviso ao sincronizar faltantes:', err.message);
    return 0;
  }
}

/**
 * Retorna a cláusula SQL de escopo para popular uma sessão de levantamento.
 */
function getScopeWhereSql(criterioEscopo) {
  switch (criterioEscopo) {
    case 'saldo_nao_zero':
      return '(c.saldo != 0)';
    case 'saldo_positivo':
      return '(c.saldo > 0)';
    case 'saldo_negativo':
      return '(c.saldo < 0)';
    case 'somente_movimentacao':
      return '(COALESCE(c.vendas_30d, 0) > 0 OR COALESCE(c.vendas_31_60d, 0) > 0 OR COALESCE(c.vendas_61_90d, 0) > 0 OR COALESCE(c.vendas_10m, 0) > 0 OR COALESCE(c.entradas_10m, 0) > 0)';
    case 'ativos_movimentacao':
    default:
      return '(c.saldo != 0 OR COALESCE(c.vendas_30d, 0) > 0 OR COALESCE(c.vendas_31_60d, 0) > 0 OR COALESCE(c.vendas_61_90d, 0) > 0 OR COALESCE(c.vendas_10m, 0) > 0 OR COALESCE(c.entradas_10m, 0) > 0 OR c.ativo_10m = 1)';
  }
}

/**
 * Recalcula e persiste os contadores consolidados da sessão.
 */
function atualizarContadoresSessao(db, sessaoId) {
  const counts = db.prepare(`
    SELECT
      COUNT(1) as total_itens,
      SUM(CASE WHEN li.status_conferencia IN ('conferido', 'ajustado') THEN 1 ELSE 0 END) as total_conferidos,
      SUM(CASE WHEN li.status_conferencia = 'ajustado' THEN 1 ELSE 0 END) as total_ajustados,
      SUM(CASE WHEN ${PROFFER_MEDIO_EXPR} > 0 THEN 1 ELSE 0 END) as total_com_proffer
    FROM levantamento_proffer_itens li
    INNER JOIN compras_estoque_cache c ON c.produto_id = li.produto_id
    LEFT JOIN napp_prices n ON n.ean = c.ean AND c.ean != ''
    WHERE li.sessao_id = ?
  `).get(sessaoId);

  db.prepare(`
    UPDATE levantamento_proffer_sessoes
    SET
      total_itens = ?,
      total_conferidos = ?,
      total_ajustados = ?,
      total_com_proffer = ?,
      atualizado_em = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    counts?.total_itens || 0,
    counts?.total_conferidos || 0,
    counts?.total_ajustados || 0,
    counts?.total_com_proffer || 0,
    sessaoId
  );

  return db.prepare('SELECT * FROM levantamento_proffer_sessoes WHERE id = ?').get(sessaoId);
}

/**
 * Popula os itens elegíveis em uma sessão usando INSERT OR IGNORE (preserva conferências já feitas).
 */
function popularItensSessao(db, sessaoId, criterioEscopo = 'ativos_movimentacao') {
  sincronizarFaltantesNoCacheCompras(db);
  const scopeSql = getScopeWhereSql(criterioEscopo);

  const tx = db.transaction(() => {
    const res = db.prepare(`
      INSERT OR IGNORE INTO levantamento_proffer_itens (
        sessao_id, produto_id, ean, status_conferencia, preco_antes_levantamento, atualizado_em
      )
      SELECT
        ?,
        c.produto_id,
        TRIM(COALESCE(c.ean, '')),
        'pendente',
        ${PRECO_LOJA_EXPR},
        datetime('now', 'localtime')
      FROM compras_estoque_cache c
      LEFT JOIN digifarma_products_cache d ON d.rowid = (
        SELECT d2.rowid FROM digifarma_products_cache d2
        WHERE CAST(d2.produto_id AS INTEGER) = c.produto_id
        LIMIT 1
      )
      WHERE ${scopeSql}
    `).run(sessaoId);
    return res.changes || 0;
  });

  const inseridos = tx();
  const sessao = atualizarContadoresSessao(db, sessaoId);
  return { inseridos, sessao };
}

/**
 * Garante que exista ao menos uma sessão padrão populada.
 */
function garantirSessaoPadrao(db) {
  const existing = db.prepare(`
    SELECT * FROM levantamento_proffer_sessoes
    ORDER BY CASE WHEN status = 'aberto' THEN 0 ELSE 1 END, criado_em DESC
    LIMIT 1
  `).get();

  if (existing) {
    return existing;
  }

  const sessaoId = `lev_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  db.prepare(`
    INSERT INTO levantamento_proffer_sessoes (
      id, titulo, status, criterio_escopo, criado_por, criado_em, atualizado_em
    ) VALUES (?, ?, 'aberto', 'ativos_movimentacao', 'Sistema', datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(sessaoId, 'Levantamento Geral — Ativos & Movimentação');

  const { sessao } = popularItensSessao(db, sessaoId, 'ativos_movimentacao');
  return sessao;
}

/**
 * Resolve qual sessaoId usar na requisição, criando a padrão se necessário.
 */
function resolverSessao(db, sessaoIdParam) {
  if (sessaoIdParam) {
    const found = db.prepare('SELECT * FROM levantamento_proffer_sessoes WHERE id = ?').get(String(sessaoIdParam));
    if (found) return found;
  }
  return garantirSessaoPadrao(db);
}

/**
 * Constrói cláusula WHERE e ORDER BY parametrizadas para consultas do levantamento.
 */
function buildLevantamentoBaseQuery(sessaoId, queryParams = {}) {
  const whereClauses = ['li.sessao_id = ?'];
  const params = [sessaoId];

  const search = String(queryParams.search || '').trim();
  if (search) {
    const like = `%${search}%`;
    whereClauses.push('(c.descricao LIKE ? OR c.ean LIKE ? OR CAST(c.produto_id AS TEXT) LIKE ?)');
    params.push(like, like, like);
  }

  const recorte = String(queryParams.recorte || 'TODOS').toUpperCase();
  if (recorte === 'SALDO_POSITIVO') {
    whereClauses.push('c.saldo > 0');
  } else if (recorte === 'SALDO_NEGATIVO') {
    whereClauses.push('c.saldo < 0');
  } else if (recorte === 'SALDO_NAO_ZERO') {
    whereClauses.push('c.saldo != 0');
  } else if (recorte === 'ZERADO_COM_MOV') {
    whereClauses.push('c.saldo = 0 AND (COALESCE(c.vendas_10m, 0) > 0 OR COALESCE(c.entradas_10m, 0) > 0 OR COALESCE(c.vendas_30d, 0) > 0 OR COALESCE(c.vendas_31_60d, 0) > 0 OR COALESCE(c.vendas_61_90d, 0) > 0)');
  } else if (recorte === 'COM_MOVIMENTACAO') {
    whereClauses.push('(COALESCE(c.vendas_30d, 0) > 0 OR COALESCE(c.vendas_31_60d, 0) > 0 OR COALESCE(c.vendas_61_90d, 0) > 0 OR COALESCE(c.vendas_10m, 0) > 0 OR COALESCE(c.entradas_10m, 0) > 0)');
  } else if (recorte === 'GIRO_ALTA') {
    whereClauses.push("c.ciclo_vida IN ('CRESCIMENTO', 'LANCAMENTO')");
  } else if (recorte === 'GIRO_QUEDA') {
    whereClauses.push("c.ciclo_vida = 'DECLINIO'");
  }

  const curva = String(queryParams.curva || 'ALL').toUpperCase();
  if (curva === 'A' || curva === 'B' || curva === 'C') {
    whereClauses.push('c.curva_abc = ?');
    params.push(curva);
  }

  const categoria = String(queryParams.categoria || 'ALL').toUpperCase();
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

  const toleranciaPct = Math.min(50, Math.max(1, parseFloat(queryParams.toleranciaPct) || 5));
  const tolFrac = toleranciaPct / 100;
  const apenasFaixaReal = queryParams.apenasFaixaReal === 'true' || queryParams.apenasFaixaReal === true;
  const acaoFilter = String(queryParams.acaoFilter || 'ALL').toUpperCase();
  const profferStatus = String(queryParams.profferStatus || 'ALL').toUpperCase();

  if (acaoFilter !== 'ALL') {
    whereClauses.push(`${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND ${INDEPENDENTE_EXPR}`);
    if (apenasFaixaReal) {
      whereClauses.push(VALID_FAIXA_REAL_EXPR);
    }
    if (acaoFilter === 'FORA_DA_MEDIA') {
      whereClauses.push(`ABS((${PRECO_LOJA_EXPR} - ${PROFFER_MEDIO_EXPR}) / ${PROFFER_MEDIO_EXPR}) > ?`);
      params.push(tolFrac);
    } else if (acaoFilter === 'AUMENTAR') {
      whereClauses.push(`${PRECO_LOJA_EXPR} < ${PROFFER_MEDIO_EXPR} * (1 - ?)`);
      params.push(tolFrac);
    } else if (acaoFilter === 'DIMINUIR') {
      whereClauses.push(`${PRECO_LOJA_EXPR} > ${PROFFER_MEDIO_EXPR} * (1 + ?)`);
      params.push(tolFrac);
    } else if (acaoFilter === 'NA_MEDIA') {
      whereClauses.push(`ABS((${PRECO_LOJA_EXPR} - ${PROFFER_MEDIO_EXPR}) / ${PROFFER_MEDIO_EXPR}) <= ?`);
      params.push(tolFrac);
    }
  } else if (apenasFaixaReal && profferStatus !== 'SEM_PROFFER' && profferStatus !== 'ALL') {
    whereClauses.push(`${VALID_FAIXA_REAL_EXPR} AND ${INDEPENDENTE_EXPR}`);
  }

  if (profferStatus === 'COM_PROFFER') {
    whereClauses.push(`${PROFFER_MEDIO_EXPR} > 0`);
  } else if (profferStatus === 'SEM_PROFFER') {
    whereClauses.push(`(${PROFFER_MEDIO_EXPR} IS NULL OR ${PROFFER_MEDIO_EXPR} <= 0)`);
  } else if (profferStatus === 'ABAIXO_MINIMO') {
    whereClauses.push(`${PROFFER_BAIXO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND ${PRECO_LOJA_EXPR} < ${PROFFER_BAIXO_EXPR}`);
  } else if (profferStatus === 'ABAIXO_MEDIA') {
    whereClauses.push(`${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND ${PRECO_LOJA_EXPR} < ${PROFFER_MEDIO_EXPR}`);
  } else if (profferStatus === 'NA_MEDIA') {
    whereClauses.push(`${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND ABS((${PRECO_LOJA_EXPR} - ${PROFFER_MEDIO_EXPR}) / ${PROFFER_MEDIO_EXPR}) <= ?`);
    params.push(tolFrac);
  } else if (profferStatus === 'ACIMA_MEDIA') {
    whereClauses.push(`${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > ${PROFFER_MEDIO_EXPR}`);
  } else if (profferStatus === 'ACIMA_MAXIMO') {
    whereClauses.push(`${PROFFER_ALTO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > ${PROFFER_ALTO_EXPR}`);
  }

  const desvioMinPct = parseFloat(queryParams.desvioMinPct || 0);
  if (!isNaN(desvioMinPct) && desvioMinPct > 0) {
    if (acaoFilter === 'DIMINUIR') {
      whereClauses.push(`${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND (((${PRECO_LOJA_EXPR} - ${PROFFER_MEDIO_EXPR}) / ${PROFFER_MEDIO_EXPR}) * 100) >= ?`);
    } else if (acaoFilter === 'FORA_DA_MEDIA') {
      whereClauses.push(`${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND (ABS((${PRECO_LOJA_EXPR} - ${PROFFER_MEDIO_EXPR}) / ${PROFFER_MEDIO_EXPR}) * 100) >= ?`);
    } else {
      whereClauses.push(`${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND (((${PROFFER_MEDIO_EXPR} - ${PRECO_LOJA_EXPR}) / ${PROFFER_MEDIO_EXPR}) * 100) >= ?`);
    }
    params.push(desvioMinPct);
  }

  const margemFilter = String(queryParams.margemFilter || 'ALL').toUpperCase();
  if (margemFilter === 'ABAIXO_CUSTO') {
    whereClauses.push(`${CUSTO_EFETIVO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND ${PRECO_LOJA_EXPR} < ${CUSTO_EFETIVO_EXPR}`);
  } else if (margemFilter === 'MARGEM_BAIXA') {
    whereClauses.push(`${CUSTO_EFETIVO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} >= ${CUSTO_EFETIVO_EXPR} AND (((${PRECO_LOJA_EXPR} - ${CUSTO_EFETIVO_EXPR}) / ${PRECO_LOJA_EXPR}) * 100) < 20`);
  } else if (margemFilter === 'MARGEM_OK') {
    whereClauses.push(`${CUSTO_EFETIVO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND (((${PRECO_LOJA_EXPR} - ${CUSTO_EFETIVO_EXPR}) / ${PRECO_LOJA_EXPR}) * 100) BETWEEN 20 AND 50`);
  } else if (margemFilter === 'MARGEM_ALTA') {
    whereClauses.push(`${CUSTO_EFETIVO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND (((${PRECO_LOJA_EXPR} - ${CUSTO_EFETIVO_EXPR}) / ${PRECO_LOJA_EXPR}) * 100) > 50`);
  }

  const statusConferencia = String(queryParams.statusConferencia || 'ALL').toLowerCase();
  if (['pendente', 'conferido', 'ajustado', 'ignorado'].includes(statusConferencia)) {
    whereClauses.push('li.status_conferencia = ?');
    params.push(statusConferencia);
  }

  const sortByRaw = String(queryParams.sortBy || 'desvio').toLowerCase();
  const defaultDir = sortByRaw === 'desvio' ? 'asc' : 'desc';
  const sortDirRaw = queryParams.sortDir
    ? (String(queryParams.sortDir).toLowerCase() === 'asc' ? 'asc' : 'desc')
    : defaultDir;
  const sortConfig = SORT_WHITELIST[sortByRaw] || SORT_WHITELIST.desvio;
  const orderBySql = sortConfig[sortDirRaw];

  return {
    whereSql: `WHERE ${whereClauses.join(' AND ')}`,
    params,
    orderBySql,
    toleranciaPct
  };
}

/**
 * Enriquece uma linha SQL com cálculos financeiros, faixa Proffer e sugestões de preço.
 */
function enriquecerItemLevantamento(row, toleranciaPct = 5) {
  const precoLoja = Number(row.preco_loja || 0);
  const custo = Number(row.custo_efetivo || 0);
  const profferMedio = row.proffer_medio > 0 ? Number(row.proffer_medio) : null;
  const profferBaixo = row.proffer_baixo > 0 ? Number(row.proffer_baixo) : profferMedio;
  const profferAlto = row.proffer_alto > 0 ? Number(row.proffer_alto) : profferMedio;
  const vendas30d = Number(row.vendas_30d || 0);

  let margemAtualPct = 0;
  if (precoLoja > 0 && custo > 0 && custo < precoLoja * 5) {
    margemAtualPct = Number((((precoLoja - custo) / precoLoja) * 100).toFixed(2));
  } else if (precoLoja > 0 && custo > 0 && custo >= precoLoja) {
    margemAtualPct = Number((((precoLoja - custo) / precoLoja) * 100).toFixed(2));
  }

  let diffProfferValor = null;
  let diffProfferPct = null;
  let posicaoProffer = 'SEM_PROFFER';
  let acaoRecomendada = 'SEM_PROFFER';

  if (profferMedio && profferMedio > 0) {
    if (precoLoja > 0) {
      diffProfferValor = Number((precoLoja - profferMedio).toFixed(2));
      diffProfferPct = Number((((precoLoja - profferMedio) / profferMedio) * 100).toFixed(2));
      const relacaoPct = ((precoLoja - profferMedio) / profferMedio) * 100;

      if (profferBaixo && precoLoja < profferBaixo) {
        posicaoProffer = 'ABAIXO_MINIMO';
      } else if (Math.abs(relacaoPct) <= toleranciaPct) {
        posicaoProffer = 'NA_MEDIA';
      } else if (precoLoja < profferMedio) {
        posicaoProffer = 'ABAIXO_MEDIA';
      } else if (profferAlto && precoLoja > profferAlto) {
        posicaoProffer = 'ACIMA_MAXIMO';
      } else {
        posicaoProffer = 'ACIMA_MEDIA';
      }

      if (diffProfferPct < -toleranciaPct) {
        acaoRecomendada = 'AUMENTAR';
      } else if (diffProfferPct > toleranciaPct) {
        acaoRecomendada = 'DIMINUIR';
      } else {
        acaoRecomendada = 'MANTER';
      }
    } else {
      posicaoProffer = 'ABAIXO_MEDIA';
      acaoRecomendada = 'AUMENTAR';
    }
  }

  const temFaixaReal = Boolean(
    profferBaixo !== null &&
    profferAlto !== null &&
    Math.abs(profferAlto - profferBaixo) > 0.009
  );

  const precoSugeridoMedia = profferMedio ? roundUpToAcceptedCents(profferMedio) : null;
  const precoSugeridoMenos5 = profferMedio ? roundUpToAcceptedCents(profferMedio * 0.95) : null;
  const precoSugeridoMenos10 = profferMedio ? roundUpToAcceptedCents(profferMedio * 0.90) : null;
  const precoSugeridoBaixo = profferBaixo ? roundUpToAcceptedCents(profferBaixo) : null;
  const precoSugeridoAlto = profferAlto ? roundUpToAcceptedCents(profferAlto) : null;
  const precoSugeridoMarkup = custo > 0 ? calcularPrecoSugeridoMarkup(custo, Number(row.categoria_id || 0)) : null;

  let ganhoMensalEstimado = 0;
  if (precoLoja > 0 && precoSugeridoMedia && precoSugeridoMedia > precoLoja) {
    ganhoMensalEstimado = Number(((precoSugeridoMedia - precoLoja) * Math.max(1, vendas30d)).toFixed(2));
  }

  const categoriaClass = classifyProductCategory(row.descricao || '', '', Number(row.categoria_id || 0));

  return {
    produto_id: Number(row.produto_id),
    ean: String(row.ean || '').trim(),
    descricao: String(row.descricao || '').trim(),
    categoria_id: Number(row.categoria_id || 0),
    categoria_class: categoriaClass,
    curva_abc: row.curva_abc || 'C',
    saldo: Number(row.saldo || 0),
    vendas_30d: vendas30d,
    vendas_31_60d: Number(row.vendas_31_60d || 0),
    vendas_61_90d: Number(row.vendas_61_90d || 0),
    vendas_10m: Number(row.vendas_10m || 0),
    entradas_10m: Number(row.entradas_10m || 0),
    vmd_ponderado: Number(row.vmd_ponderado || 0),
    ciclo_vida: row.ciclo_vida || 'SEM_GIRO',
    status_ruptura: row.status_ruptura || 'NORMAL',
    custo_efetivo: Number(custo.toFixed(2)),
    preco_loja: Number(precoLoja.toFixed(2)),
    preco_normal: Number(row.preco_normal || precoLoja || 0),
    preco_promocional: Number(row.preco_promocional || 0),
    margem_atual_pct: margemAtualPct,
    abaixo_custo: Boolean(custo > 0 && precoLoja > 0 && precoLoja < custo),
    proffer_baixo: profferBaixo !== null ? Number(profferBaixo.toFixed(2)) : null,
    proffer_medio: profferMedio !== null ? Number(profferMedio.toFixed(2)) : null,
    proffer_alto: profferAlto !== null ? Number(profferAlto.toFixed(2)) : null,
    proffer_rede_medio: row.proffer_rede_medio ? Number(Number(row.proffer_rede_medio).toFixed(2)) : null,
    proffer_grupo: row.proffer_grupo || 'INDEPENDENTE',
    proffer_fonte: row.proffer_fonte || null,
    proffer_atualizado_em: row.proffer_atualizado_em || null,
    tem_faixa_real: temFaixaReal,
    diff_proffer_valor: diffProfferValor,
    diff_proffer_pct: diffProfferPct,
    posicao_proffer: posicaoProffer,
    acao_recomendada: acaoRecomendada,
    preco_sugerido_media: precoSugeridoMedia,
    preco_sugerido_menos_5: precoSugeridoMenos5,
    preco_sugerido_proffer_menos_10: precoSugeridoMenos10,
    preco_sugerido_baixo: precoSugeridoBaixo,
    preco_sugerido_alto: precoSugeridoAlto,
    preco_sugerido_markup: precoSugeridoMarkup,
    ganho_mensal_estimado: ganhoMensalEstimado,
    ultima_compra_data: row.ultima_compra_data || null,
    ultima_compra_fornecedor: row.ultima_compra_fornecedor || null,
    status_conferencia: row.status_conferencia || 'pendente',
    preco_antes_levantamento: Number(row.preco_antes_levantamento || 0),
    preco_aplicado: row.preco_aplicado !== null && row.preco_aplicado !== undefined ? Number(row.preco_aplicado) : null,
    observacao: row.observacao || '',
    conferido_por: row.conferido_por || null,
    conferido_em: row.conferido_em || null
  };
}

/**
 * Aplica alteração de preço diretamente no Digifarma Firebird com snapshot de backup, log e sync nos caches SQLite.
 * Nunca altera os caches locais se o Firebird estiver offline ou falhar.
 */
async function aplicarPrecoSeguroNoDigifarma(db, { produtoId, novoPreco, motivo, usuario, sessaoId, arredondarComercial = true }) {
  const prodId = parseInt(produtoId, 10);
  const parsedPrice = parseFloat(novoPreco);
  if (isNaN(prodId) || prodId <= 0 || isNaN(parsedPrice) || parsedPrice <= 0) {
    const err = new Error('Produto ID e Novo Preço válido (> 0) são obrigatórios.');
    err.statusCode = 400;
    throw err;
  }

  const finalPrice = arredondarComercial === false
    ? Number(parsedPrice.toFixed(2))
    : roundUpToAcceptedCents(parsedPrice);
  if (finalPrice <= 0) {
    const err = new Error('Preço arredondado inválido.');
    err.statusCode = 400;
    throw err;
  }

  const cacheRow = db.prepare(`
    SELECT
      c.produto_id,
      c.descricao,
      c.ean,
      ${PRECO_LOJA_EXPR} as preco_loja,
      ${CUSTO_EFETIVO_EXPR} as custo_efetivo
    FROM compras_estoque_cache c
    LEFT JOIN digifarma_products_cache d ON d.rowid = (
      SELECT d2.rowid FROM digifarma_products_cache d2
      WHERE CAST(d2.produto_id AS INTEGER) = c.produto_id
      LIMIT 1
    )
    LEFT JOIN digifarma_ultimas_compras_cache uc ON uc.produto_id = c.produto_id
    WHERE c.produto_id = ?
    LIMIT 1
  `).get(prodId);

  let descricao = cacheRow?.descricao || '';
  let codBarras = cacheRow?.ean || '';
  let previousPrice = Number(cacheRow?.preco_loja || 0);
  let precoCusto = Number(cacheRow?.custo_efetivo || 0);

  if (!descricao || !previousPrice) {
    try {
      const fbProd = await queryDigifarma(
        'SELECT PRODUTO, APRESENTACAO, COD_BARRAS, PROD_PRVENDA, PROD_PRPROMOCAO, PROD_PRCOMPRA FROM PRODUTOS WHERE PRODUTO_ID = ?',
        [prodId],
        8000
      );
      if (fbProd && fbProd[0]) {
        const p = fbProd[0];
        if (!descricao) descricao = (p.PRODUTO || '').trim() + (p.APRESENTACAO ? ` ${(p.APRESENTACAO).trim()}` : '');
        if (!previousPrice) previousPrice = (p.PROD_PRPROMOCAO > 0 ? p.PROD_PRPROMOCAO : p.PROD_PRVENDA) || 0;
        if (!codBarras) codBarras = (p.COD_BARRAS || '').trim();
        if (!precoCusto) precoCusto = Number(p.PROD_PRCOMPRA || 0);
      }
    } catch (fbErr) {}
  }

  if (!descricao) descricao = `Produto Cód ${prodId}`;
  if (!previousPrice) previousPrice = finalPrice;

  // 1. Atualiza no Digifarma Firebird primeiro (se offline/timeout, interrompe antes de alterar caches)
  try {
    await queryDigifarma(`
      UPDATE PRODUTOS
      SET
        PROD_PRVENDA = ?,
        PROD_PRPROMOCAO = CASE WHEN PROD_PRPROMOCAO > 0 THEN ? ELSE PROD_PRPROMOCAO END,
        PRECO_ANTERIOR = COALESCE(?, PROD_PRVENDA),
        LASTUPDATE = CURRENT_TIMESTAMP,
        ATUALIZAR_PRECO = 'S',
        ITEM_REAJUSTADO = 1
      WHERE PRODUTO_ID = ?
    `, [finalPrice, finalPrice, previousPrice, prodId], 15000);
  } catch (fbWriteErr) {
    const err = new Error(`Digifarma indisponível ou recusou atualização: ${fbWriteErr.message}`);
    err.statusCode = 503;
    throw err;
  }

  // 2. Grava Snapshot de Backup (compatível com rollback em Gestão de Preços)
  const snapId = `snap_${Date.now()}_${prodId}`;
  db.prepare(`
    INSERT INTO price_change_snapshots (
      id, produto_id, descricao, cod_barras, preco_anterior, novo_preco, preco_custo, tipo, motivo, usuario
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'levantamento_proffer', ?, ?)
  `).run(
    snapId,
    prodId,
    descricao,
    codBarras,
    previousPrice,
    finalPrice,
    precoCusto,
    motivo || 'Reajuste via Levantamento & Comparativo Proffer',
    usuario || 'Administrador'
  );

  // 3. Log de Auditoria
  const logId = `log_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  try {
    db.prepare(`
      INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
      VALUES (?, datetime('now', 'localtime'), ?, ?, 'PRICE_UPDATE', 'PRECOS', ?)
    `).run(
      logId,
      usuario || 'Administrador',
      'admin',
      `[Levantamento Proffer] "${descricao}" (Cód ${prodId}) alterado de R$ ${previousPrice.toFixed(2)} para R$ ${finalPrice.toFixed(2)}. Motivo: ${motivo || 'Comparativo Proffer'}`
    );
  } catch (logErr) {}

  // 4. Atualiza caches locais SQLite
  db.prepare(`
    UPDATE digifarma_products_cache
    SET
      preco_venda = ?,
      preco_normal = ?,
      preco_promocao = CASE WHEN preco_promocao > 0 THEN ? ELSE preco_promocao END,
      atualizado_em = datetime('now', 'localtime')
    WHERE produto_id = ? OR CAST(produto_id AS INTEGER) = ? OR (codigo_barras != '' AND codigo_barras = ?)
  `).run(finalPrice, finalPrice, finalPrice, String(prodId), prodId, String(codBarras || ''));

  db.prepare(`
    UPDATE compras_estoque_cache
    SET
      preco_venda_vigente = ?,
      preco_normal = ?,
      preco_promocional = CASE WHEN preco_promocional > 0 THEN ? ELSE preco_promocional END,
      atualizado_em = datetime('now', 'localtime')
    WHERE produto_id = ? OR (ean != '' AND ean = ?)
  `).run(finalPrice, finalPrice, finalPrice, prodId, String(codBarras || ''));

  // 5. Atualiza status do item na sessão do levantamento
  if (sessaoId) {
    db.prepare(`
      UPDATE levantamento_proffer_itens
      SET
        status_conferencia = 'ajustado',
        preco_aplicado = ?,
        conferido_por = ?,
        conferido_em = datetime('now', 'localtime'),
        atualizado_em = datetime('now', 'localtime')
      WHERE sessao_id = ? AND produto_id = ?
    `).run(finalPrice, usuario || 'Administrador', sessaoId, prodId);
    atualizarContadoresSessao(db, sessaoId);
  }

  return {
    success: true,
    snapshotId: snapId,
    produtoId: prodId,
    descricao,
    previousPrice,
    newPrice: finalPrice
  };
}

module.exports = function (db) {
  const router = express.Router();

  const SELECT_ITENS_SQL = `
    SELECT
      li.produto_id,
      COALESCE(NULLIF(TRIM(c.ean), ''), TRIM(li.ean), '') as ean,
      c.descricao,
      c.categoria_id,
      c.curva_abc,
      c.saldo,
      c.vendas_30d,
      c.vendas_31_60d,
      c.vendas_61_90d,
      c.vendas_10m,
      c.entradas_10m,
      c.vmd_ponderado,
      c.ciclo_vida,
      c.status_ruptura,
      ${CUSTO_EFETIVO_EXPR} as custo_efetivo,
      ${PRECO_LOJA_EXPR} as preco_loja,
      c.preco_normal,
      c.preco_promocional,
      ${PROFFER_BAIXO_EXPR} as proffer_baixo,
      ${PROFFER_MEDIO_EXPR} as proffer_medio,
      ${PROFFER_ALTO_EXPR} as proffer_alto,
      n.preco_proffer_rede_medio as proffer_rede_medio,
      n.proffer_grupo as proffer_grupo,
      n.fonte as proffer_fonte,
      n.atualizado_em as proffer_atualizado_em,
      COALESCE(NULLIF(c.ultima_compra_data, ''), uc.data_compra) as ultima_compra_data,
      COALESCE(NULLIF(c.ultima_compra_fornecedor, ''), uc.fornecedor_nome) as ultima_compra_fornecedor,
      li.status_conferencia,
      li.preco_antes_levantamento,
      li.preco_aplicado,
      li.observacao,
      li.conferido_por,
      li.conferido_em
    ${FROM_JOINS_SQL}
  `;

  // 1. GET /api/levantamento-proffer/proffer-health
  router.get('/proffer-health', async (req, res) => {
    try {
      const localStats = db.prepare(`
        SELECT
          COUNT(1) as total,
          SUM(CASE WHEN COALESCE(preco_proffer_baixo, preco_proffer_medio, preco_proffer) != COALESCE(preco_proffer_alto, preco_proffer_medio, preco_proffer) THEN 1 ELSE 0 END) as comFaixaReal,
          MAX(atualizado_em) as ultimaAtualizacao,
          MIN(atualizado_em) as primeiraAtualizacao
        FROM napp_prices
      `).get();

      const fontesRows = db.prepare(`
        SELECT COALESCE(fonte, 'napp_proffer_api') as fonte, COUNT(1) as total
        FROM napp_prices
        GROUP BY COALESCE(fonte, 'napp_proffer_api')
      `).all();

      let health = null;
      let healthError = null;
      try {
        health = await testProfferConnection();
      } catch (err) {
        healthError = err.message;
      }

      res.json({
        success: true,
        health: health || {
          nappAuthOk: false,
          profferApiOk: false,
          errorCode: 'TEST_FAILED',
          errorMessage: healthError || 'Falha ao testar conexão com Napp/Proffer.',
          testedAt: new Date().toISOString()
        },
        localBase: {
          total: localStats?.total || 0,
          comFaixaReal: localStats?.comFaixaReal || 0,
          ultimaAtualizacao: localStats?.ultimaAtualizacao || null,
          primeiraAtualizacao: localStats?.primeiraAtualizacao || null,
          fontes: fontesRows || []
        }
      });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro em /proffer-health:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. GET /api/levantamento-proffer/sessoes
  router.get('/sessoes', (req, res) => {
    try {
      garantirSessaoPadrao(db);
      const sessoes = db.prepare(`
        SELECT * FROM levantamento_proffer_sessoes
        ORDER BY CASE WHEN status = 'aberto' THEN 0 ELSE 1 END, criado_em DESC
      `).all();

      const atualizadas = sessoes.map(s => atualizarContadoresSessao(db, s.id));
      res.json({ success: true, data: atualizadas });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro em /sessoes:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. POST /api/levantamento-proffer/sessoes
  router.post('/sessoes', (req, res) => {
    try {
      const { titulo, criterioEscopo = 'ativos_movimentacao', criadoPor = 'Administrador' } = req.body || {};
      const validScopes = ['ativos_movimentacao', 'saldo_nao_zero', 'saldo_positivo', 'saldo_negativo', 'somente_movimentacao'];
      const escopo = validScopes.includes(criterioEscopo) ? criterioEscopo : 'ativos_movimentacao';
      const finalTitulo = String(titulo || '').trim() || `Levantamento Proffer (${new Date().toLocaleDateString('pt-BR')})`;
      const sessaoId = `lev_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;

      db.prepare(`
        INSERT INTO levantamento_proffer_sessoes (
          id, titulo, status, criterio_escopo, criado_por, criado_em, atualizado_em
        ) VALUES (?, ?, 'aberto', ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
      `).run(sessaoId, finalTitulo, escopo, String(criadoPor || 'Administrador'));

      const { inseridos, sessao } = popularItensSessao(db, sessaoId, escopo);
      res.json({
        success: true,
        message: `Levantamento "${finalTitulo}" criado com ${inseridos} produtos.`,
        sessao
      });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro ao criar sessão:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. PATCH /api/levantamento-proffer/sessoes/:sessaoId
  router.patch('/sessoes/:sessaoId', (req, res) => {
    try {
      const { sessaoId } = req.params;
      const existing = db.prepare('SELECT * FROM levantamento_proffer_sessoes WHERE id = ?').get(sessaoId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Sessão não encontrada.' });
      }

      const { titulo, status } = req.body || {};
      const novoTitulo = titulo !== undefined && String(titulo).trim() ? String(titulo).trim() : existing.titulo;
      const novoStatus = status === 'concluido' || status === 'aberto' ? status : existing.status;
      const finalizadoEm = novoStatus === 'concluido' ? new Date().toISOString() : null;

      db.prepare(`
        UPDATE levantamento_proffer_sessoes
        SET titulo = ?, status = ?, finalizado_em = ?, atualizado_em = datetime('now', 'localtime')
        WHERE id = ?
      `).run(novoTitulo, novoStatus, finalizadoEm, sessaoId);

      const updated = atualizarContadoresSessao(db, sessaoId);
      res.json({ success: true, sessao: updated });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro ao atualizar sessão:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. DELETE /api/levantamento-proffer/sessoes/:sessaoId
  router.delete('/sessoes/:sessaoId', (req, res) => {
    try {
      const { sessaoId } = req.params;
      const totalSessoes = db.prepare('SELECT COUNT(1) as total FROM levantamento_proffer_sessoes').get()?.total || 0;
      if (totalSessoes <= 1) {
        return res.status(400).json({ success: false, error: 'Não é possível excluir a única sessão de levantamento existente.' });
      }

      const tx = db.transaction(() => {
        db.prepare('DELETE FROM levantamento_proffer_itens WHERE sessao_id = ?').run(sessaoId);
        return db.prepare('DELETE FROM levantamento_proffer_sessoes WHERE id = ?').run(sessaoId);
      });
      const result = tx();
      if (result.changes === 0) {
        return res.status(404).json({ success: false, error: 'Sessão não encontrada.' });
      }
      res.json({ success: true, message: 'Sessão removida com sucesso.' });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro ao remover sessão:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. POST /api/levantamento-proffer/sessoes/:sessaoId/sincronizar-digifarma
  router.post('/sessoes/:sessaoId/sincronizar-digifarma', async (req, res) => {
    try {
      const sessao = resolverSessao(db, req.params.sessaoId);
      let recalculoInfo = null;
      let fromCacheFallback = false;

      try {
        recalculoInfo = await recalcularTodosEstoqueMinimo(15, { autoSyncDigifarma: false });
        fromCacheFallback = Boolean(recalculoInfo?.fromCacheFallback);
      } catch (errRecalc) {
        fromCacheFallback = true;
      }

      const { inseridos, sessao: sessaoAtualizada } = popularItensSessao(db, sessao.id, sessao.criterio_escopo);

      res.json({
        success: true,
        fromCacheFallback,
        novosItensInseridos: inseridos,
        sessao: sessaoAtualizada,
        message: fromCacheFallback
          ? `Cache local reconciliado (${inseridos} novos itens vinculados). Digifarma Firebird estava offline.`
          : `Digifarma sincronizado em tempo real! ${inseridos} novos itens adicionados ao levantamento.`
      });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro ao sincronizar Digifarma:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. GET /api/levantamento-proffer/resumo
  router.get('/resumo', (req, res) => {
    try {
      const sessao = resolverSessao(db, req.query.sessaoId);
      const toleranciaPct = Math.min(50, Math.max(1, parseFloat(req.query.toleranciaPct) || 5));
      const tolFrac = toleranciaPct / 100;
      const apenasFaixaReal = req.query.apenasFaixaReal === undefined
        ? true
        : (req.query.apenasFaixaReal === 'true' || req.query.apenasFaixaReal === true);

      const validProfferCond = apenasFaixaReal
        ? `${PROFFER_MEDIO_EXPR} > 0 AND ${INDEPENDENTE_EXPR} AND ${VALID_FAIXA_REAL_EXPR}`
        : `${PROFFER_MEDIO_EXPR} > 0 AND ${INDEPENDENTE_EXPR}`;

      const row = db.prepare(`
        SELECT
          COUNT(1) as totalItens,
          SUM(CASE WHEN c.saldo > 0 THEN 1 ELSE 0 END) as saldoPositivo,
          SUM(CASE WHEN c.saldo < 0 THEN 1 ELSE 0 END) as saldoNegativo,
          SUM(CASE WHEN c.saldo = 0 AND (COALESCE(c.vendas_10m, 0) > 0 OR COALESCE(c.entradas_10m, 0) > 0 OR COALESCE(c.vendas_30d, 0) > 0 OR COALESCE(c.vendas_31_60d, 0) > 0 OR COALESCE(c.vendas_61_90d, 0) > 0) THEN 1 ELSE 0 END) as zeradosComMov,
          SUM(CASE WHEN (COALESCE(c.vendas_30d, 0) > 0 OR COALESCE(c.vendas_31_60d, 0) > 0 OR COALESCE(c.vendas_61_90d, 0) > 0 OR COALESCE(c.vendas_10m, 0) > 0 OR COALESCE(c.entradas_10m, 0) > 0) THEN 1 ELSE 0 END) as comMovimentacao,
          SUM(CASE WHEN ${PROFFER_MEDIO_EXPR} > 0 THEN 1 ELSE 0 END) as comProffer,
          SUM(CASE WHEN (${PROFFER_MEDIO_EXPR} IS NULL OR ${PROFFER_MEDIO_EXPR} <= 0) THEN 1 ELSE 0 END) as semProffer,
          SUM(CASE WHEN (${validProfferCond}) THEN 1 ELSE 0 END) as comFaixaRealIndependentes,
          MAX(n.atualizado_em) as profferUltimaAtualizacao,
          SUM(CASE WHEN ${PROFFER_BAIXO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND ${PRECO_LOJA_EXPR} < ${PROFFER_BAIXO_EXPR} THEN 1 ELSE 0 END) as abaixoMinimoProffer,
          SUM(CASE WHEN ${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND ${PRECO_LOJA_EXPR} < ${PROFFER_MEDIO_EXPR} THEN 1 ELSE 0 END) as abaixoMediaProffer,
          SUM(CASE WHEN ${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND ABS((${PRECO_LOJA_EXPR} - ${PROFFER_MEDIO_EXPR}) / ${PROFFER_MEDIO_EXPR}) <= ? THEN 1 ELSE 0 END) as naMediaProffer,
          SUM(CASE WHEN ${PROFFER_MEDIO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > ${PROFFER_MEDIO_EXPR} THEN 1 ELSE 0 END) as acimaMediaProffer,
          SUM(CASE WHEN ${PROFFER_ALTO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > ${PROFFER_ALTO_EXPR} THEN 1 ELSE 0 END) as acimaMaximoProffer,
          SUM(CASE WHEN (${validProfferCond}) AND ${PRECO_LOJA_EXPR} > 0 AND ${PRECO_LOJA_EXPR} < ${PROFFER_MEDIO_EXPR} * (1 - ?) THEN 1 ELSE 0 END) as ondeAumentar,
          SUM(CASE WHEN (${validProfferCond}) AND ${PRECO_LOJA_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > ${PROFFER_MEDIO_EXPR} * (1 + ?) THEN 1 ELSE 0 END) as ondeDiminuir,
          SUM(CASE WHEN (${validProfferCond}) AND ${PRECO_LOJA_EXPR} > 0 AND ABS((${PRECO_LOJA_EXPR} - ${PROFFER_MEDIO_EXPR}) / ${PROFFER_MEDIO_EXPR}) <= ? THEN 1 ELSE 0 END) as naMediaIndependentes,
          SUM(CASE WHEN (${validProfferCond}) AND ${PRECO_LOJA_EXPR} > 0 AND ${PRECO_LOJA_EXPR} < ${PROFFER_MEDIO_EXPR} * (1 - ?) THEN (${PROFFER_MEDIO_EXPR} - ${PRECO_LOJA_EXPR}) * MAX(1, COALESCE(c.vendas_30d, 0)) ELSE 0 END) as potencialAumentoMensal,
          AVG(CASE WHEN (${validProfferCond}) AND ${PRECO_LOJA_EXPR} > ${PROFFER_MEDIO_EXPR} * (1 + ?) THEN (((${PRECO_LOJA_EXPR} - ${PROFFER_MEDIO_EXPR}) / ${PROFFER_MEDIO_EXPR}) * 100) ELSE NULL END) as excessoMedioPctPesados,
          SUM(CASE WHEN ${CUSTO_EFETIVO_EXPR} > 0 AND ${PRECO_LOJA_EXPR} > 0 AND ${PRECO_LOJA_EXPR} < ${CUSTO_EFETIVO_EXPR} THEN 1 ELSE 0 END) as abaixoCusto,
          SUM(CASE WHEN ${PROFFER_MEDIO_EXPR} > ${PRECO_LOJA_EXPR} AND ${PRECO_LOJA_EXPR} > 0 THEN (${PROFFER_MEDIO_EXPR} - ${PRECO_LOJA_EXPR}) * MAX(1, COALESCE(c.vendas_30d, 0)) ELSE 0 END) as potencialGanhoMensal,
          SUM(CASE WHEN c.curva_abc = 'A' THEN 1 ELSE 0 END) as curvaA,
          SUM(CASE WHEN c.curva_abc = 'B' THEN 1 ELSE 0 END) as curvaB,
          SUM(CASE WHEN COALESCE(c.curva_abc, 'C') = 'C' THEN 1 ELSE 0 END) as curvaC,
          SUM(CASE WHEN li.status_conferencia = 'pendente' THEN 1 ELSE 0 END) as confPendente,
          SUM(CASE WHEN li.status_conferencia = 'conferido' THEN 1 ELSE 0 END) as confConferido,
          SUM(CASE WHEN li.status_conferencia = 'ajustado' THEN 1 ELSE 0 END) as confAjustado,
          SUM(CASE WHEN li.status_conferencia = 'ignorado' THEN 1 ELSE 0 END) as confIgnorado
        ${FROM_JOINS_SQL}
        WHERE li.sessao_id = ?
      `).get(tolFrac, tolFrac, tolFrac, tolFrac, tolFrac, tolFrac, sessao.id);

      const totalItens = row?.totalItens || 0;
      const comProffer = row?.comProffer || 0;
      const ondeAumentar = row?.ondeAumentar || 0;
      const ondeDiminuir = row?.ondeDiminuir || 0;
      const concluidos = (row?.confConferido || 0) + (row?.confAjustado || 0) + (row?.confIgnorado || 0);

      res.json({
        success: true,
        sessaoId: sessao.id,
        data: {
          totalItens,
          toleranciaPct,
          apenasFaixaReal,
          saldoPositivo: row?.saldoPositivo || 0,
          saldoNegativo: row?.saldoNegativo || 0,
          zeradosComMov: row?.zeradosComMov || 0,
          comMovimentacao: row?.comMovimentacao || 0,
          comProffer,
          semProffer: row?.semProffer || 0,
          comFaixaRealIndependentes: row?.comFaixaRealIndependentes || 0,
          coberturaProfferPct: totalItens > 0 ? Number(((comProffer / totalItens) * 100).toFixed(1)) : 0,
          profferUltimaAtualizacao: row?.profferUltimaAtualizacao || null,
          abaixoMinimoProffer: row?.abaixoMinimoProffer || 0,
          abaixoMediaProffer: row?.abaixoMediaProffer || 0,
          naMediaProffer: row?.naMediaProffer || 0,
          acimaMediaProffer: row?.acimaMediaProffer || 0,
          acimaMaximoProffer: row?.acimaMaximoProffer || 0,
          ondeAumentar,
          ondeDiminuir,
          naMediaIndependentes: row?.naMediaIndependentes || 0,
          foraDaMediaTotal: ondeAumentar + ondeDiminuir,
          potencialAumentoMensal: Number((row?.potencialAumentoMensal || 0).toFixed(2)),
          excessoMedioPctPesados: row?.excessoMedioPctPesados ? Number(row.excessoMedioPctPesados.toFixed(1)) : 0,
          abaixoCusto: row?.abaixoCusto || 0,
          potencialGanhoMensal: Number((row?.potencialGanhoMensal || 0).toFixed(2)),
          curvas: {
            A: row?.curvaA || 0,
            B: row?.curvaB || 0,
            C: row?.curvaC || 0
          },
          conferencia: {
            pendente: row?.confPendente || 0,
            conferido: row?.confConferido || 0,
            ajustado: row?.confAjustado || 0,
            ignorado: row?.confIgnorado || 0,
            progressoPct: totalItens > 0 ? Number(((concluidos / totalItens) * 100).toFixed(1)) : 0
          }
        }
      });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro em /resumo:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8. GET /api/levantamento-proffer/produtos
  router.get('/produtos', (req, res) => {
    try {
      const sessao = resolverSessao(db, req.query.sessaoId);
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(250, Math.max(10, parseInt(req.query.limit, 10) || 50));
      const offset = (page - 1) * limit;

      const { whereSql, params, orderBySql, toleranciaPct } = buildLevantamentoBaseQuery(sessao.id, req.query);

      const countRow = db.prepare(`
        SELECT COUNT(1) as total
        ${FROM_JOINS_SQL}
        ${whereSql}
      `).get(...params);

      const totalItems = countRow?.total || 0;

      const rows = db.prepare(`
        ${SELECT_ITENS_SQL}
        ${whereSql}
        ORDER BY ${orderBySql}
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      const enriched = rows.map(r => enriquecerItemLevantamento(r, toleranciaPct));

      res.json({
        success: true,
        sessaoId: sessao.id,
        data: enriched,
        pagination: {
          totalItems,
          totalPages: Math.max(1, Math.ceil(totalItems / limit)),
          currentPage: page,
          limit
        }
      });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro em /produtos:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 9. PATCH /api/levantamento-proffer/itens/:produtoId/status
  router.patch('/itens/:produtoId/status', (req, res) => {
    try {
      const prodId = parseInt(req.params.produtoId, 10);
      const { sessaoId, statusConferencia, observacao, usuario = 'Administrador' } = req.body || {};
      if (isNaN(prodId) || prodId <= 0) {
        return res.status(400).json({ success: false, error: 'produtoId inválido.' });
      }
      const validStatuses = ['pendente', 'conferido', 'ajustado', 'ignorado'];
      if (!validStatuses.includes(statusConferencia)) {
        return res.status(400).json({ success: false, error: 'statusConferencia inválido.' });
      }

      const sessao = resolverSessao(db, sessaoId);
      const info = db.prepare(`
        UPDATE levantamento_proffer_itens
        SET
          status_conferencia = ?,
          observacao = COALESCE(?, observacao),
          conferido_por = ?,
          conferido_em = CASE WHEN ? = 'pendente' THEN NULL ELSE datetime('now', 'localtime') END,
          atualizado_em = datetime('now', 'localtime')
        WHERE sessao_id = ? AND produto_id = ?
      `).run(
        statusConferencia,
        observacao !== undefined ? String(observacao) : null,
        statusConferencia === 'pendente' ? null : String(usuario || 'Administrador'),
        statusConferencia,
        sessao.id,
        prodId
      );

      if (info.changes === 0) {
        return res.status(404).json({ success: false, error: 'Item não encontrado nesta sessão.' });
      }

      const sessaoAtualizada = atualizarContadoresSessao(db, sessao.id);
      res.json({ success: true, sessao: sessaoAtualizada });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro ao atualizar status do item:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 10. POST /api/levantamento-proffer/itens/status-lote
  router.post('/itens/status-lote', (req, res) => {
    try {
      const { sessaoId, produtoIds, statusConferencia, usuario = 'Administrador' } = req.body || {};
      if (!Array.isArray(produtoIds) || produtoIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Informe ao menos um produto.' });
      }
      const validStatuses = ['pendente', 'conferido', 'ajustado', 'ignorado'];
      if (!validStatuses.includes(statusConferencia)) {
        return res.status(400).json({ success: false, error: 'statusConferencia inválido.' });
      }

      const sessao = resolverSessao(db, sessaoId);
      const stmt = db.prepare(`
        UPDATE levantamento_proffer_itens
        SET
          status_conferencia = ?,
          conferido_por = ?,
          conferido_em = CASE WHEN ? = 'pendente' THEN NULL ELSE datetime('now', 'localtime') END,
          atualizado_em = datetime('now', 'localtime')
        WHERE sessao_id = ? AND produto_id = ?
      `);

      const tx = db.transaction((ids) => {
        let updated = 0;
        for (const rawId of ids) {
          const pId = parseInt(rawId, 10);
          if (isNaN(pId)) continue;
          const r = stmt.run(
            statusConferencia,
            statusConferencia === 'pendente' ? null : String(usuario || 'Administrador'),
            statusConferencia,
            sessao.id,
            pId
          );
          updated += r.changes || 0;
        }
        return updated;
      });

      const updatedCount = tx(produtoIds);
      const sessaoAtualizada = atualizarContadoresSessao(db, sessao.id);
      res.json({ success: true, updatedCount, sessao: sessaoAtualizada });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro ao atualizar status em lote:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 11. POST /api/levantamento-proffer/aplicar-preco
  router.post('/aplicar-preco', async (req, res) => {
    try {
      const { produtoId, novoPreco, motivo, usuario, sessaoId, arredondarComercial = true } = req.body || {};
      const sessao = resolverSessao(db, sessaoId);
      const result = await aplicarPrecoSeguroNoDigifarma(db, {
        produtoId,
        novoPreco,
        motivo,
        usuario,
        sessaoId: sessao.id,
        arredondarComercial: arredondarComercial !== false
      });
      res.json({
        ...result,
        message: `Preço de "${result.descricao}" alterado de R$ ${result.previousPrice.toFixed(2)} para R$ ${result.newPrice.toFixed(2)} no Digifarma com backup registrado.`
      });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro em /aplicar-preco:', err.message);
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  });

  // 12. POST /api/levantamento-proffer/aplicar-preco-lote
  router.post('/aplicar-preco-lote', async (req, res) => {
    try {
      const {
        sessaoId,
        produtoIds,
        estrategia = 'proffer_medio',
        respeitarPisoCusto = true,
        usuario = 'Administrador'
      } = req.body || {};

      if (!Array.isArray(produtoIds) || produtoIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Selecione ao menos um produto para reajuste em lote.' });
      }

      const validStrategies = ['proffer_medio', 'proffer_menos_10', 'proffer_baixo', 'markup_loja'];
      if (!validStrategies.includes(estrategia)) {
        return res.status(400).json({ success: false, error: 'Estratégia de preço inválida.' });
      }

      const sessao = resolverSessao(db, sessaoId);
      const cleanIds = produtoIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
      if (cleanIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Nenhum produto válido informado.' });
      }

      const placeholders = cleanIds.map(() => '?').join(',');
      const rows = db.prepare(`
        ${SELECT_ITENS_SQL}
        WHERE li.sessao_id = ? AND li.produto_id IN (${placeholders})
      `).all(sessao.id, ...cleanIds);

      let sucessos = 0;
      const ignorados = [];
      const erros = [];

      for (const rawRow of rows) {
        const item = enriquecerItemLevantamento(rawRow);
        let precoAlvo = null;
        let motivoStr = '';

        if (estrategia === 'proffer_medio') {
          precoAlvo = item.preco_sugerido_media;
          motivoStr = 'Lote Levantamento: Média Proffer';
        } else if (estrategia === 'proffer_menos_10') {
          precoAlvo = item.preco_sugerido_proffer_menos_10;
          motivoStr = 'Lote Levantamento: Proffer -10%';
        } else if (estrategia === 'proffer_baixo') {
          precoAlvo = item.proffer_baixo ? roundUpToAcceptedCents(item.proffer_baixo) : null;
          motivoStr = 'Lote Levantamento: Mínimo Proffer';
        } else if (estrategia === 'markup_loja') {
          precoAlvo = item.preco_sugerido_markup;
          motivoStr = 'Lote Levantamento: Markup Padrão BelaFarma';
        }

        if (!precoAlvo || precoAlvo <= 0) {
          ignorados.push({ produtoId: item.produto_id, descricao: item.descricao, motivo: 'Sem referência válida para a estratégia.' });
          continue;
        }

        if (respeitarPisoCusto && item.custo_efetivo > 0 && precoAlvo < item.custo_efetivo) {
          ignorados.push({
            produtoId: item.produto_id,
            descricao: item.descricao,
            motivo: `Preço alvo (R$ ${precoAlvo.toFixed(2)}) ficaria abaixo do custo (R$ ${item.custo_efetivo.toFixed(2)}).`
          });
          continue;
        }

        if (Math.abs(precoAlvo - item.preco_loja) < 0.01) {
          ignorados.push({ produtoId: item.produto_id, descricao: item.descricao, motivo: 'Preço loja já está igual ao alvo.' });
          continue;
        }

        try {
          await aplicarPrecoSeguroNoDigifarma(db, {
            produtoId: item.produto_id,
            novoPreco: precoAlvo,
            motivo: motivoStr,
            usuario,
            sessaoId: sessao.id
          });
          sucessos++;
        } catch (errApply) {
          erros.push({ produtoId: item.produto_id, descricao: item.descricao, error: errApply.message });
          if (errApply.statusCode === 503) {
            break;
          }
        }
      }

      const sessaoAtualizada = atualizarContadoresSessao(db, sessao.id);
      res.json({
        success: erros.length === 0,
        total: cleanIds.length,
        sucessos,
        ignorados,
        erros,
        sessao: sessaoAtualizada
      });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro em /aplicar-preco-lote:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13. POST /api/levantamento-proffer/importar-proffer
  router.post('/importar-proffer', (req, res) => {
    try {
      const { itens, sessaoId } = req.body || {};
      if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ success: false, error: 'Envie uma lista válida de itens para importação.' });
      }

      const prodRows = db.prepare(`
        SELECT produto_id, TRIM(ean) as ean FROM compras_estoque_cache WHERE LENGTH(TRIM(ean)) >= 7
      `).all();
      const eanToProdId = new Map();
      for (const p of prodRows) {
        eanToProdId.set(p.ean, String(p.produto_id));
      }

      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO napp_prices (
          ean, produto_id, preco_proffer, preco_proffer_baixo, preco_proffer_medio, preco_proffer_alto,
          fonte, proffer_grupo, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, 'importacao_planilha', 'INDEPENDENTE', ?)
      `);

      const nowIso = new Date().toISOString();
      let importados = 0;
      let ignorados = 0;
      const erros = [];

      const tx = db.transaction((lista) => {
        for (let idx = 0; idx < lista.length; idx++) {
          const row = lista[idx] || {};
          const rawEan = String(row.ean || '').replace(/\D/g, '').trim();
          const medio = parseFloat(String(row.medio ?? '').replace(',', '.'));
          const baixoRaw = parseFloat(String(row.baixo ?? '').replace(',', '.'));
          const altoRaw = parseFloat(String(row.alto ?? '').replace(',', '.'));

          if (rawEan.length < 7) {
            ignorados++;
            if (erros.length < 20) erros.push(`Linha ${idx + 1}: EAN inválido (${row.ean || 'vazio'}).`);
            continue;
          }
          if (isNaN(medio) || medio <= 0) {
            ignorados++;
            if (erros.length < 20) erros.push(`Linha ${idx + 1} (EAN ${rawEan}): Preço médio inválido.`);
            continue;
          }

          const finalBaixo = !isNaN(baixoRaw) && baixoRaw > 0 ? Math.min(baixoRaw, medio) : medio;
          const finalAlto = !isNaN(altoRaw) && altoRaw > 0 ? Math.max(altoRaw, medio) : medio;
          const prodId = eanToProdId.get(rawEan) || null;

          insertStmt.run(rawEan, prodId, medio, finalBaixo, medio, finalAlto, nowIso);
          importados++;
        }
      });

      tx(itens);

      let vinculadosAoLevantamento = 0;
      if (sessaoId) {
        const sessaoAtualizada = atualizarContadoresSessao(db, sessaoId);
        vinculadosAoLevantamento = sessaoAtualizada?.total_com_proffer || 0;
      }

      res.json({
        success: true,
        importados,
        ignorados,
        vinculadosAoLevantamento,
        erros,
        message: `${importados} preços Proffer importados com sucesso (${ignorados} ignorados).`
      });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro em /importar-proffer:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 14. POST /api/levantamento-proffer/disparar-coleta-proffer
  router.post('/disparar-coleta-proffer', async (req, res) => {
    try {
      const { sessaoId, escopo = 'sem_proffer' } = req.body || {};
      const statusAtual = getScrapeStatus();
      if (statusAtual.running) {
        return res.status(409).json({
          success: false,
          error: 'Já existe uma coleta Proffer em andamento.'
        });
      }

      let health;
      try {
        health = await testProfferConnection();
      } catch (healthErr) {
        return res.status(400).json({
          success: false,
          profferOffline: true,
          error: `Falha ao testar Proffer: ${healthErr.message}`,
          health: { nappAuthOk: false, profferApiOk: false, errorMessage: healthErr.message }
        });
      }

      if (!health.profferApiOk) {
        return res.status(400).json({
          success: false,
          profferOffline: true,
          health,
          error: `Proffer indisponível (${health.errorMessage || 'erro desconhecido'}). Coleta não iniciada para proteger os preços reais salvos.`
        });
      }

      let eansFilter = null;
      if (escopo === 'sem_proffer' || escopo === 'levantamento') {
        const sessao = resolverSessao(db, sessaoId);
        const extraWhere = escopo === 'sem_proffer' ? ` AND (${PROFFER_MEDIO_EXPR} IS NULL OR ${PROFFER_MEDIO_EXPR} <= 0)` : '';
        const eanRows = db.prepare(`
          SELECT DISTINCT TRIM(c.ean) as ean
          FROM levantamento_proffer_itens li
          INNER JOIN compras_estoque_cache c ON c.produto_id = li.produto_id
          LEFT JOIN napp_prices n ON n.ean = c.ean AND c.ean != ''
          WHERE li.sessao_id = ?
            AND LENGTH(TRIM(COALESCE(c.ean, ''))) >= 7
            ${extraWhere}
        `).all(sessao.id);
        eansFilter = eanRows.map(r => r.ean).filter(Boolean);

        if (eansFilter.length === 0) {
          return res.json({
            success: true,
            nothingToCollect: true,
            health,
            message: 'Todos os produtos com EAN válido deste levantamento já possuem preço Proffer!'
          });
        }
      }

      runNappScraper(eansFilter, { targetScope: escopo }).catch(err => {
        console.error('[Levantamento Proffer] Erro assíncrono na coleta Proffer:', err.message);
      });

      res.json({
        success: true,
        health,
        targetCount: eansFilter ? eansFilter.length : health.catalogTotal,
        message: eansFilter
          ? `Coleta Proffer iniciada para ${eansFilter.length} EANs (${escopo === 'sem_proffer' ? 'somente faltantes' : 'todo o levantamento'}).`
          : 'Coleta Proffer geral iniciada em segundo plano!'
      });
    } catch (err) {
      console.error('[Levantamento Proffer] Erro em /disparar-coleta-proffer:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 15. POST /api/levantamento-proffer/parar-coleta-proffer
  router.post('/parar-coleta-proffer', (req, res) => {
    try {
      const result = stopNappScraper();
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 16. GET /api/levantamento-proffer/coleta-status
  router.get('/coleta-status', (req, res) => {
    try {
      res.json({ success: true, status: getScrapeStatus() });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 17. GET /api/levantamento-proffer/exportar
  router.get('/exportar', (req, res) => {
    try {
      const sessao = resolverSessao(db, req.query.sessaoId);
      const format = String(req.query.format || 'csv').toLowerCase();
      const { whereSql, params, orderBySql, toleranciaPct } = buildLevantamentoBaseQuery(sessao.id, req.query);

      const rows = db.prepare(`
        ${SELECT_ITENS_SQL}
        ${whereSql}
        ORDER BY ${orderBySql}
        LIMIT 10000
      `).all(...params);

      const enriched = rows.map(r => enriquecerItemLevantamento(r, toleranciaPct));

      if (format === 'json') {
        return res.json({
          success: true,
          sessaoId: sessao.id,
          sessaoTitulo: sessao.titulo,
          total: enriched.length,
          data: enriched
        });
      }

      const headers = [
        'Código', 'EAN', 'Descrição', 'Categoria', 'Curva ABC',
        'Saldo', 'Vendas 30d', 'Vendas 10m', 'Entradas 10m', 'Ciclo',
        'Custo (R$)', 'Preço Loja (R$)', 'Margem (%)',
        'Proffer Baixo (R$)', 'Proffer Médio (R$)', 'Proffer Alto (R$)',
        'Desvio vs Média (R$)', 'Desvio vs Média (%)', 'Posição Proffer', 'Ação Recomendada',
        'Sugestão Média Proffer (R$)', 'Sugestão Proffer -10% (R$)', 'Ganho Mensal Est. (R$)',
        'Status Levantamento', 'Proffer Atualizado Em'
      ];

      const fmtNum = (val) => (val !== null && val !== undefined && !isNaN(val)) ? Number(val).toFixed(2).replace('.', ',') : '';
      const escCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

      const csvLines = [headers.join(';')];
      for (const item of enriched) {
        csvLines.push([
          escCsv(item.produto_id),
          escCsv(item.ean),
          escCsv(item.descricao),
          escCsv(item.categoria_class),
          escCsv(item.curva_abc),
          String(item.saldo).replace('.', ','),
          String(item.vendas_30d).replace('.', ','),
          String(item.vendas_10m).replace('.', ','),
          String(item.entradas_10m).replace('.', ','),
          escCsv(item.ciclo_vida),
          fmtNum(item.custo_efetivo),
          fmtNum(item.preco_loja),
          fmtNum(item.margem_atual_pct),
          fmtNum(item.proffer_baixo),
          fmtNum(item.proffer_medio),
          fmtNum(item.proffer_alto),
          fmtNum(item.diff_proffer_valor),
          fmtNum(item.diff_proffer_pct),
          escCsv(item.posicao_proffer),
          escCsv(item.acao_recomendada),
          fmtNum(item.preco_sugerido_media),
          fmtNum(item.preco_sugerido_proffer_menos_10),
          fmtNum(item.ganho_mensal_estimado),
          escCsv(item.status_conferencia),
          escCsv(item.proffer_atualizado_em || '')
        ].join(';'));
      }

      const csvContent = '\uFEFF' + csvLines.join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=levantamento_proffer_${sessao.id}.csv`);
      res.send(csvContent);
    } catch (err) {
      console.error('[Levantamento Proffer] Erro em /exportar:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
