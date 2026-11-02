/**
 * Belinha ERP - Products Service
 * Gestão rápida de produtos e estoque no banco nativo.
 */

const { db } = require('./erp-database');
const { classifyProduct } = require('./controlled-medications.service');

function enrichProduct(p) {
  if (!p) return null;
  const classification = classifyProduct(p);
  return {
    ...p,
    is_controlado: classification.is_controlado,
    recipe_type: classification.recipe_type,
    recipe_label: classification.label,
    recipe_color_theme: classification.color_theme,
    substancia_classe: classification.substancia_classe
  };
}

/**
 * Busca produtos por código de barras, código interno ou nome
 * Otimizado para latência < 20ms no leitor e autocomplete do PDV,
 * priorizando produtos mais vendidos (curva A/volume de vendas) e com estoque.
 */
function buscarProdutos({ query = '', limit = 30, onlyWithStock = false } = {}) {
  const cleanQ = (query || '').trim();
  if (!cleanQ) {
    let sql = `
      SELECT p.*,
             COALESCE(c.vendas_30d, p.vendas_30d, 0) as vendas_30d,
             COALESCE(c.vendas_10m, p.vendas_10m, 0) as vendas_10m
      FROM products p
      LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
      WHERE p.is_active = 1
    `;
    if (onlyWithStock) sql += ' AND p.stock_qty > 0';
    sql += `
      ORDER BY 
        (p.stock_qty > 0) DESC,
        COALESCE(c.vendas_30d, p.vendas_30d, 0) DESC,
        COALESCE(c.vendas_10m, p.vendas_10m, 0) DESC,
        CASE p.curve WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END ASC,
        p.name ASC
      LIMIT ?
    `;
    return db.prepare(sql).all(limit).map(enrichProduct);
  }

  // Se for código numérico (bipagem de EAN ou código interno)
  if (/^\d+$/.test(cleanQ)) {
    // 1. Tenta correspondência exata de EAN ou Código
    const exact = db.prepare(`
      SELECT p.*,
             COALESCE(c.vendas_30d, p.vendas_30d, 0) as vendas_30d,
             COALESCE(c.vendas_10m, p.vendas_10m, 0) as vendas_10m
      FROM products p
      LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
      WHERE (p.barcode = ? OR p.code = ?) AND p.is_active = 1
      LIMIT 1
    `).get(cleanQ, cleanQ);

    if (exact) {
      return [enrichProduct(exact)];
    }
  }

  // 2. Busca por termo ou início de código
  const words = cleanQ.split(/\s+/).filter(Boolean);
  let whereClauses = ['p.is_active = 1'];
  let params = [];

  if (words.length <= 1) {
    whereClauses.push('(p.barcode LIKE ? OR p.code LIKE ? OR p.name LIKE ?)');
    const pStr = `%${cleanQ}%`;
    params.push(pStr, pStr, pStr);
  } else {
    // Suporte inteligente a múltiplos termos (ex: "amox 500" ou "dipirona gotas")
    const wordClauses = words.map(() => 'p.name LIKE ?').join(' AND ');
    whereClauses.push(`(p.barcode LIKE ? OR p.code LIKE ? OR (${wordClauses}))`);
    params.push(`%${cleanQ}%`, `%${cleanQ}%`);
    words.forEach(w => params.push(`%${w}%`));
  }

  if (onlyWithStock) {
    whereClauses.push('p.stock_qty > 0');
  }

  let sql = `
    SELECT p.*,
           COALESCE(c.vendas_30d, p.vendas_30d, 0) as vendas_30d,
           COALESCE(c.vendas_10m, p.vendas_10m, 0) as vendas_10m
    FROM products p
    LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY 
      CASE WHEN p.barcode = ? OR p.code = ? THEN 0 ELSE 1 END ASC,
      (p.stock_qty > 0) DESC,
      COALESCE(c.vendas_30d, p.vendas_30d, 0) DESC,
      COALESCE(c.vendas_10m, p.vendas_10m, 0) DESC,
      CASE p.curve WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END ASC,
      p.name ASC
    LIMIT ?
  `;

  params.push(cleanQ, cleanQ, limit);
  return db.prepare(sql).all(...params).map(enrichProduct);
}

/**
 * Busca um único produto pelo EAN ou Código
 */
function obterProdutoPorCodigo(codigoOuEan) {
  const clean = String(codigoOuEan || '').trim();
  if (!clean) return null;

  const found = db.prepare(`
    SELECT p.*,
           COALESCE(c.vendas_30d, p.vendas_30d, 0) as vendas_30d,
           COALESCE(c.vendas_10m, p.vendas_10m, 0) as vendas_10m
    FROM products p 
    LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
    WHERE (p.barcode = ? OR p.code = ?) AND p.is_active = 1
    LIMIT 1
  `).get(clean, clean);

  return enrichProduct(found);
}

/**
 * Cadastra um novo produto no Belinha ERP
 */
function cadastrarProduto(dados) {
  const {
    code,
    barcode,
    name,
    presentation = '',
    category_id = null,
    sale_price = 0,
    promo_price = 0,
    cost_price = 0,
    stock_qty = 0,
    ncm = null,
    cest = null
  } = dados;

  if (!name) {
    throw new Error('O nome do produto é obrigatório.');
  }

  const finalCode = code || String(Date.now());
  const finalBarcode = barcode || finalCode;

  db.prepare(`
    INSERT INTO products (
      code, barcode, name, presentation, category_id,
      sale_price, promo_price, cost_price, stock_qty,
      ncm, cest, is_active, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(
    finalCode,
    finalBarcode,
    name.trim().toUpperCase(),
    presentation.trim(),
    category_id,
    parseFloat(sale_price) || 0,
    parseFloat(promo_price) || 0,
    parseFloat(cost_price) || 0,
    parseFloat(stock_qty) || 0,
    ncm,
    cest
  );

  return obterProdutoPorCodigo(finalCode);
}

/**
 * Ajusta preço de venda e/ou saldo de estoque de um produto
 */
function atualizarPrecoEEstoque(code, { sale_price, promo_price, stock_qty, cost_price }) {
  const updates = [];
  const params = [];

  if (typeof sale_price === 'number') {
    updates.push('sale_price = ?');
    params.push(sale_price);
  }
  if (typeof promo_price === 'number') {
    updates.push('promo_price = ?');
    params.push(promo_price);
  }
  if (typeof stock_qty === 'number') {
    updates.push('stock_qty = ?');
    params.push(stock_qty);
  }
  if (typeof cost_price === 'number') {
    updates.push('cost_price = ?');
    params.push(cost_price);
  }

  if (updates.length === 0) {
    return obterProdutoPorCodigo(code);
  }

  updates.push("updated_at = datetime('now', 'localtime')");
  params.push(String(code));

  db.prepare(`
    UPDATE products SET ${updates.join(', ')} WHERE code = ?
  `).run(...params);

  return obterProdutoPorCodigo(code);
}

/**
 * Busca paginada com contagem total e filtros avançados para o catálogo
 */
function buscarProdutosPaginados({
  query = '',
  page = 1,
  limit = 50,
  stockFilter = 'all',
  curve = 'all'
} = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const offset = (p - 1) * lim;

  let whereClauses = ['p.is_active = 1'];
  const params = [];

  const cleanQ = (query || '').trim();
  if (cleanQ) {
    if (/^\d+$/.test(cleanQ)) {
      whereClauses.push('(p.barcode LIKE ? OR p.code = ?)');
      params.push(`%${cleanQ}%`, cleanQ);
    } else {
      const words = cleanQ.split(/\s+/).filter(Boolean);
      if (words.length <= 1) {
        whereClauses.push('(p.barcode LIKE ? OR p.code LIKE ? OR p.name LIKE ?)');
        const term = `%${cleanQ}%`;
        params.push(term, term, term);
      } else {
        const wordClauses = words.map(() => 'p.name LIKE ?').join(' AND ');
        whereClauses.push(`(p.barcode LIKE ? OR p.code LIKE ? OR (${wordClauses}))`);
        params.push(`%${cleanQ}%`, `%${cleanQ}%`);
        words.forEach(w => params.push(`%${w}%`));
      }
    }
  }

  if (stockFilter === 'with_stock') {
    whereClauses.push('p.stock_qty > 0');
  } else if (stockFilter === 'zero_stock') {
    whereClauses.push('p.stock_qty <= 0');
  }

  if (curve && curve !== 'all') {
    whereClauses.push('p.curve = ?');
    params.push(curve.toUpperCase());
  }

  const whereSql = whereClauses.join(' AND ');

  // Contagem Total
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM products p WHERE ${whereSql}`).get(...params);
  const total = countRow ? countRow.total : 0;
  const totalPages = Math.ceil(total / lim);

  // Consulta paginada priorizando mais vendidos e estoque
  const sql = `
    SELECT 
      p.code, p.barcode, p.name, p.presentation, p.category_id,
      p.sale_price, p.promo_price, p.cost_price, p.stock_qty, p.curve,
      p.tributacao_monofasica, p.ncm, p.cest, p.is_active, p.updated_at,
      COALESCE(c.vendas_30d, p.vendas_30d, 0) as vendas_30d,
      COALESCE(c.vendas_10m, p.vendas_10m, 0) as vendas_10m
    FROM products p 
    LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
    WHERE ${whereSql}
    ORDER BY 
      (p.stock_qty > 0) DESC,
      COALESCE(c.vendas_30d, p.vendas_30d, 0) DESC,
      COALESCE(c.vendas_10m, p.vendas_10m, 0) DESC,
      CASE p.curve WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END ASC,
      p.name ASC
    LIMIT ? OFFSET ?
  `;

  const products = db.prepare(sql).all(...params, lim, offset).map(enrichProduct);

  return {
    products,
    total,
    page: p,
    limit: lim,
    totalPages
  };
}

/**
 * Métricas gerais de estoque
 */
function obterMetricasEstoque() {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_produtos,
      SUM(CASE WHEN stock_qty > 0 THEN 1 ELSE 0 END) as produtos_com_estoque,
      COALESCE(SUM(CASE WHEN stock_qty > 0 THEN stock_qty ELSE 0 END), 0) as qtd_total_itens,
      COALESCE(SUM(CASE WHEN stock_qty > 0 THEN stock_qty * cost_price ELSE 0 END), 0) as valor_total_custo,
      COALESCE(SUM(CASE WHEN stock_qty > 0 THEN stock_qty * (CASE WHEN promo_price > 0 THEN promo_price ELSE sale_price END) ELSE 0 END), 0) as valor_total_venda
    FROM products
    WHERE is_active = 1
  `).get();

  return {
    total_produtos: stats.total_produtos || 0,
    produtos_com_estoque: stats.produtos_com_estoque || 0,
    qtd_total_itens: stats.qtd_total_itens || 0,
    valor_total_custo: Math.round((stats.valor_total_custo || 0) * 100) / 100,
    valor_total_venda: Math.round((stats.valor_total_venda || 0) * 100) / 100
  };
}

module.exports = {
  buscarProdutos,
  buscarProdutosPaginados,
  obterMetricasEstoque,
  obterProdutoPorCodigo,
  cadastrarProduto,
  atualizarPrecoEEstoque
};

