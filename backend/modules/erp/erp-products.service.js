/**
 * Belinha ERP - Products Service
 * Gestão rápida de produtos e estoque no banco nativo.
 */

const { db } = require('./erp-database');
const { classifyProduct } = require('./controlled-medications.service');

function enrichProduct(p) {
  if (!p) return null;
  const classification = classifyProduct(p);

  // Regras de Preço Escalonado ativas vinculadas ao produto
  let tieredRules = [];
  try {
    const normCode = p.code ? String(p.code).trim().replace(/\.0+$/, '') : null;
    tieredRules = db.prepare(`
      SELECT id, product_id, barcode, product_name, quantity, package_price, unit_effective_price
      FROM tiered_pricing
      WHERE active = 1
        AND (
          (? IS NOT NULL AND barcode = ?) OR
          (? IS NOT NULL AND product_id = ?)
        )
      ORDER BY quantity ASC
    `).all(p.barcode, p.barcode, normCode, normCode);
  } catch (e) {}

  return {
    ...p,
    is_controlado: classification.is_controlado,
    recipe_type: classification.recipe_type,
    recipe_label: classification.label,
    recipe_color_theme: classification.color_theme,
    substancia_classe: classification.substancia_classe,
    tiered_rules: tieredRules
  };
}

/**
 * Tenta buscar um produto em tempo real no Firebird do Digifarma
 * caso ele tenha acabado de ser cadastrado no Digifarma e ainda não exista no SQLite local.
 */
async function syncSingleProductFromDigifarma(cleanQ) {
  if (!cleanQ) return null;
  try {
    const { queryDigifarma } = require('../../services/digifarma.service');
    const raw = String(cleanQ || '').trim();
    const cleanNoSpaces = raw.replace(/\s+/g, '');
    const isNum = /^\d+$/.test(cleanNoSpaces);
    const numVal = isNum ? Number(cleanNoSpaces) : NaN;
    // PRODUTO_ID no Firebird é INTEGER (32 bits, máx 2.147.483.647).
    // Se for maior (como EAN-13 de 13 dígitos), não pode ser passado para PRODUTO_ID senão causa Integer Overflow!
    const canBeProdutoId = !isNaN(numVal) && numVal > 0 && numVal <= 2147483647;

    let whereCond;
    let params;
    if (canBeProdutoId) {
      whereCond = "(COD_BARRAS = ? OR COD_BARRAS = ? OR PRODUTO_ID = ?)";
      params = [cleanNoSpaces, raw, numVal];
    } else {
      whereCond = "(COD_BARRAS = ? OR COD_BARRAS = ?)";
      params = [cleanNoSpaces, raw];
    }

    const fbNew = await queryDigifarma(`
      SELECT FIRST 1
        PRODUTO_ID, PRODUTO, APRESENTACAO, COD_BARRAS, CATEGORIA_ID,
        PROD_SALDO, PROD_PRVENDA, PROD_PRCOMPRA, VALOR_ULT_COMPRA, PROD_CMV,
        PROD_PRPROMOCAO, TRIBUTACAO_MONOFASICA, CST_PIS, CST_COFINS,
        ALIQUOTA_ST, IMPOSTO_ALIQ, NCM, CEST, PSICOTROPICO, ANTIMICROBIANO
      FROM PRODUTOS
      WHERE ${whereCond} AND PROD_ATIVO = 'S'
    `, params, 2500);

    if (fbNew && fbNew.length > 0) {
      const p = fbNew[0];
      const cmv = parseFloat(p.PROD_CMV || 0);
      const pUlt = parseFloat(p.VALOR_ULT_COMPRA || 0);
      const pCompra = parseFloat(p.PROD_PRCOMPRA || 0);
      const custo = cmv > 0 ? cmv : (pUlt > 0 ? pUlt : pCompra);

      const newProd = {
        code: String(p.PRODUTO_ID).trim().replace(/\.0+$/, ''),
        barcode: (p.COD_BARRAS || '').trim(),
        name: (p.PRODUTO || '').trim(),
        presentation: (p.APRESENTACAO || '').trim(),
        category_id: p.CATEGORIA_ID ? parseInt(p.CATEGORIA_ID, 10) : null,
        sale_price: parseFloat(p.PROD_PRVENDA || 0),
        promo_price: parseFloat(p.PROD_PRPROMOCAO || 0),
        cost_price: custo,
        stock_qty: parseFloat(p.PROD_SALDO || 0),
        curve: 'C',
        tributacao_monofasica: p.TRIBUTACAO_MONOFASICA || null,
        cst_pis: p.CST_PIS || null,
        cst_cofins: p.CST_COFINS || null,
        aliquota_st: p.ALIQUOTA_ST ? parseFloat(p.ALIQUOTA_ST) : null,
        imposto_aliq: p.IMPOSTO_ALIQ ? parseFloat(p.IMPOSTO_ALIQ) : null,
        ncm: p.NCM ? String(p.NCM).trim() : null,
        cest: p.CEST ? String(p.CEST).trim() : null,
        psicotropico: p.PSICOTROPICO === 'S' ? 'S' : 'N',
        antimicrobiano: p.ANTIMICROBIANO === 'S' ? 'S' : 'N',
        is_active: 1
      };

      db.prepare(`
        INSERT OR REPLACE INTO products (
          code, barcode, name, presentation, category_id,
          sale_price, promo_price, cost_price, stock_qty, curve,
          tributacao_monofasica, cst_pis, cst_cofins, aliquota_st, imposto_aliq, ncm, cest,
          psicotropico, antimicrobiano, is_active, updated_at
        ) VALUES (
          @code, @barcode, @name, @presentation, @category_id,
          @sale_price, @promo_price, @cost_price, @stock_qty, @curve,
          @tributacao_monofasica, @cst_pis, @cst_cofins, @aliquota_st, @imposto_aliq, @ncm, @cest,
          @psicotropico, @antimicrobiano, 1, datetime('now', 'localtime')
        )
      `).run(newProd);

      try {
        db.prepare(`
          INSERT OR REPLACE INTO digifarma_products_cache (
            produto_id, descricao, codigo_barras, categoria_id, estoque_atual,
            preco_venda, preco_custo, preco_promocao, preco_normal, curva,
            tributacao_monofasica, cst_pis, cst_cofins, aliquota_st, imposto_aliq, ncm, cest,
            atualizado_em
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `).run(
          newProd.code,
          newProd.name + (newProd.presentation ? ` ${newProd.presentation}` : ''),
          newProd.barcode,
          newProd.category_id,
          newProd.stock_qty,
          newProd.promo_price > 0 ? newProd.promo_price : newProd.sale_price,
          newProd.cost_price,
          newProd.promo_price,
          newProd.sale_price,
          newProd.curve,
          newProd.tributacao_monofasica,
          newProd.cst_pis,
          newProd.cst_cofins,
          newProd.aliquota_st,
          newProd.imposto_aliq,
          newProd.ncm,
          newProd.cest
        );
      } catch (eCache) {}

      console.log(`[Belinha ERP] ⚡ Produto ${newProd.code} - ${newProd.name} auto-importado do Digifarma com sucesso!`);
      return newProd;
    }
  } catch (err) {
    // Digifarma offline ou indisponível
  }
  return null;
}

/**
 * Busca produtos por código de barras, código interno ou nome
 * Otimizado para latência < 20ms no leitor e autocomplete do PDV,
 * priorizando produtos mais vendidos (curva A/volume de vendas) e com estoque.
 */
async function buscarProdutos({ query = '', limit = 30, onlyWithStock = false } = {}) {
  const cleanQ = (query || '').trim();
  const cleanNoSpaces = cleanQ.replace(/\s+/g, '');
  if (!cleanQ && !cleanNoSpaces) {
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

  // Se for código numérico (bipagem de EAN ou código interno, mesmo com espaços acidentais)
  if (/^\d+$/.test(cleanNoSpaces) || /^\d+$/.test(cleanQ)) {
    // 1. Tenta correspondência exata de EAN ou Código no SQLite local
    const exact = db.prepare(`
      SELECT p.*,
             COALESCE(c.vendas_30d, p.vendas_30d, 0) as vendas_30d,
             COALESCE(c.vendas_10m, p.vendas_10m, 0) as vendas_10m
      FROM products p
      LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
      WHERE (p.barcode = ? OR p.barcode = ? OR p.code = ? OR p.code = ?) AND p.is_active = 1
      LIMIT 1
    `).get(cleanQ, cleanNoSpaces, cleanQ, cleanNoSpaces);

    if (exact) {
      return [enrichProduct(exact)];
    }

    // 2. Se não encontrou no SQLite local, busca em tempo real no Firebird do Digifarma!
    const fromDg = await syncSingleProductFromDigifarma(cleanNoSpaces || cleanQ);
    if (fromDg) {
      return [enrichProduct(fromDg)];
    }
  }

  // 3. Busca por termo ou início de código
  const words = cleanQ.split(/\s+/).filter(Boolean);
  let whereClauses = ['p.is_active = 1', "p.code NOT LIKE '%.0'"];
  let params = [];

  if (words.length <= 1) {
    whereClauses.push('(p.barcode LIKE ? OR p.barcode LIKE ? OR p.code LIKE ? OR p.name LIKE ?)');
    const pStr = `%${cleanQ}%`;
    const pNoSpaces = `%${cleanNoSpaces}%`;
    params.push(pStr, pNoSpaces, pStr, pStr);
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
      CASE WHEN p.barcode = ? OR p.barcode = ? OR p.code = ? THEN 0 ELSE 1 END ASC,
      (p.stock_qty > 0) DESC,
      COALESCE(c.vendas_30d, p.vendas_30d, 0) DESC,
      COALESCE(c.vendas_10m, p.vendas_10m, 0) DESC,
      CASE p.curve WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END ASC,
      p.name ASC
    LIMIT ?
  `;

  params.push(cleanQ, cleanNoSpaces, cleanQ, limit);
  const rawResults = db.prepare(sql).all(...params).map(enrichProduct);

  // Deduplicação resiliente por código canônico e EAN (elimina redundâncias e duplicatas)
  const seenKeys = new Set();
  const dedupedResults = [];
  for (const item of rawResults) {
    if (!item) continue;
    const cleanCode = String(item.code || '').trim().replace(/\.0+$/, '');
    const barcode = String(item.barcode || '').trim();
    const primaryKey = barcode ? `ean:${barcode}` : `code:${cleanCode}`;
    if (seenKeys.has(primaryKey) || (cleanCode && seenKeys.has(`code:${cleanCode}`))) {
      continue;
    }
    seenKeys.add(primaryKey);
    if (cleanCode) seenKeys.add(`code:${cleanCode}`);
    dedupedResults.push({
      ...item,
      code: cleanCode
    });
  }

  return dedupedResults;
}

/**
 * Busca um único produto pelo EAN ou Código (com fallback assíncrono ao Digifarma)
 */
async function obterProdutoPorCodigo(codigoOuEan) {
  const raw = String(codigoOuEan || '').trim().replace(/\.0+$/, '');
  const cleanNoSpaces = raw.replace(/\s+/g, '');
  if (!raw && !cleanNoSpaces) return null;

  const found = db.prepare(`
    SELECT p.*,
           COALESCE(c.vendas_30d, p.vendas_30d, 0) as vendas_30d,
           COALESCE(c.vendas_10m, p.vendas_10m, 0) as vendas_10m
    FROM products p 
    LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
    WHERE (p.barcode = ? OR p.barcode = ? OR p.code = ? OR p.code = ? OR p.code = ?) AND p.is_active = 1
    ORDER BY (p.code NOT LIKE '%.0') DESC
    LIMIT 1
  `).get(raw, cleanNoSpaces, raw, cleanNoSpaces, `${raw}.0`);

  if (found) {
    const enriched = enrichProduct(found);
    if (enriched) enriched.code = String(enriched.code).replace(/\.0+$/, '');
    return enriched;
  }

  // Se não encontrou no SQLite local, tenta buscar no Digifarma Firebird em tempo real
  const fromDg = await syncSingleProductFromDigifarma(cleanNoSpaces || raw);
  if (fromDg) {
    return enrichProduct(fromDg);
  }

  return null;
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
    cest = null,
    psicotropico = 'N',
    antimicrobiano = 'N',
    recipe_type = null
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
      ncm, cest, psicotropico, antimicrobiano, recipe_type,
      is_active, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      1, datetime('now', 'localtime'), datetime('now', 'localtime')
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
    cest,
    psicotropico === 'S' || psicotropico === true || psicotropico === '1' ? 'S' : 'N',
    antimicrobiano === 'S' || antimicrobiano === true || antimicrobiano === '1' ? 'S' : 'N',
    recipe_type || null
  );

  return obterProdutoPorCodigo(finalCode);
}

/**
 * Ajusta preço de venda, saldo de estoque, código de barras ou classificação sanitária de um produto
 */
function atualizarPrecoEEstoque(code, { barcode, sale_price, promo_price, stock_qty, cost_price, name, psicotropico, antimicrobiano, recipe_type }) {
  const updates = [];
  const params = [];

  if (typeof barcode === 'string' && barcode.trim()) {
    updates.push('barcode = ?');
    params.push(barcode.trim().replace(/\s+/g, ''));
  }
  if (typeof name === 'string' && name.trim()) {
    updates.push('name = ?');
    params.push(name.trim().toUpperCase());
  }
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
  if (psicotropico !== undefined) {
    updates.push('psicotropico = ?');
    params.push(psicotropico === 'S' || psicotropico === true || psicotropico === '1' ? 'S' : 'N');
  }
  if (antimicrobiano !== undefined) {
    updates.push('antimicrobiano = ?');
    params.push(antimicrobiano === 'S' || antimicrobiano === true || antimicrobiano === '1' ? 'S' : 'N');
  }
  if (recipe_type !== undefined) {
    updates.push('recipe_type = ?');
    params.push(recipe_type || null);
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
 * Vincula um novo código de barras bipado (ex: cartela de medicamento) a um produto existente
 */
async function vincularCodigoBarrasProduto(code, newBarcode) {
  const cleanCode = String(code || '').trim().replace(/\.0+$/, '');
  const cleanBarcode = String(newBarcode || '').trim().replace(/\s+/g, '');
  if (!cleanCode || !cleanBarcode) {
    throw new Error('Código do produto e novo código de barras são obrigatórios.');
  }

  // 1. Atualiza na tabela local products
  db.prepare(`
    UPDATE products 
    SET barcode = ?, updated_at = datetime('now', 'localtime')
    WHERE code = ?
  `).run(cleanBarcode, cleanCode);

  // 2. Atualiza no cache de produtos do Digifarma
  try {
    db.prepare(`
      UPDATE digifarma_products_cache
      SET codigo_barras = ?, atualizado_em = datetime('now', 'localtime')
      WHERE produto_id = ?
    `).run(cleanBarcode, cleanCode);
  } catch (e) {}

  console.log(`[Belinha ERP] 🔗 Código de barras ${cleanBarcode} vinculado com sucesso ao produto #${cleanCode}!`);
  return await obterProdutoPorCodigo(cleanCode);
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
      p.tributacao_monofasica, p.ncm, p.cest, p.psicotropico, p.antimicrobiano, p.recipe_type,
      p.is_active, p.updated_at,
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
  atualizarPrecoEEstoque,
  vincularCodigoBarrasProduto
};

