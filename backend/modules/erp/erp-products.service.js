/**
 * Belinha ERP - Products Service
 * Gestão rápida de produtos e estoque no banco nativo.
 */

const { db } = require('./erp-database');

/**
 * Busca produtos por código de barras, código interno ou nome
 * Otimizado para latência < 5ms no leitor do PDV
 */
function buscarProdutos({ query = '', limit = 30, onlyWithStock = false } = {}) {
  const cleanQ = (query || '').trim();
  if (!cleanQ) {
    let sql = 'SELECT * FROM products WHERE is_active = 1';
    if (onlyWithStock) sql += ' AND stock_qty > 0';
    sql += ' ORDER BY name ASC LIMIT ?';
    return db.prepare(sql).all(limit);
  }

  // Se for código numérico (bipagem de EAN ou código interno)
  if (/^\d+$/.test(cleanQ)) {
    // 1. Tenta correspondência exata de EAN ou Código
    const exact = db.prepare(`
      SELECT * FROM products 
      WHERE (barcode = ? OR code = ?) AND is_active = 1
      LIMIT 1
    `).get(cleanQ, cleanQ);

    if (exact) {
      return [exact];
    }
  }

  // 2. Busca por termo ou início de código
  let sql = `
    SELECT * FROM products 
    WHERE (barcode LIKE ? OR code LIKE ? OR name LIKE ?) 
      AND is_active = 1
  `;
  if (onlyWithStock) {
    sql += ' AND stock_qty > 0';
  }
  sql += ' ORDER BY name ASC LIMIT ?';

  const param = `%${cleanQ}%`;
  return db.prepare(sql).all(param, param, param, limit);
}

/**
 * Busca um único produto pelo EAN ou Código
 */
function obterProdutoPorCodigo(codigoOuEan) {
  const clean = String(codigoOuEan || '').trim();
  if (!clean) return null;

  return db.prepare(`
    SELECT * FROM products 
    WHERE (barcode = ? OR code = ?) AND is_active = 1
    LIMIT 1
  `).get(clean, clean);
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

module.exports = {
  buscarProdutos,
  obterProdutoPorCodigo,
  cadastrarProduto,
  atualizarPrecoEEstoque
};
