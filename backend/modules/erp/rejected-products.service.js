/**
 * Belinha ERP - Rejected Products Service (Produtos Recusados no PDV)
 * Registra e analisa produtos recusados pelos clientes no balcão (preço fora de mercado,
 * concorrência ou desistência), calculando margem, impacto financeiro e permitindo
 * ajuste rápido de preço diretamente pela análise.
 */

const VALID_REASONS = new Set(['PRECO_ALTO', 'CONCORRENCIA', 'DESISTENCIA', 'OUTRO']);
const VALID_STATUSES = new Set(['PENDENTE', 'PRECO_AJUSTADO', 'MANTIDO']);

let cachedDefaultDb = null;
function getDb(database) {
  if (database) return database;
  if (!cachedDefaultDb) {
    cachedDefaultDb = require('./erp-database').db;
  }
  return cachedDefaultDb;
}

function round2(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function round3(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 1000) / 1000;
}

function cleanProductCode(code) {
  return String(code || '').trim().replace(/\.0+$/, '');
}

function ensureRejectedSchema(database) {
  const db = getDb(database);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pdv_product_rejections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_code TEXT NOT NULL,
      barcode TEXT DEFAULT '',
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      competitor_price REAL DEFAULT NULL,
      competitor_name TEXT DEFAULT '',
      reason TEXT NOT NULL DEFAULT 'PRECO_ALTO',
      notes TEXT DEFAULT '',
      seller_id TEXT,
      seller_name TEXT DEFAULT 'Caixa',
      operator_name TEXT DEFAULT 'Caixa',
      status TEXT NOT NULL DEFAULT 'PENDENTE',
      review_notes TEXT DEFAULT '',
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_pdv_rej_code ON pdv_product_rejections (product_code);
    CREATE INDEX IF NOT EXISTS idx_pdv_rej_barcode ON pdv_product_rejections (barcode);
    CREATE INDEX IF NOT EXISTS idx_pdv_rej_status ON pdv_product_rejections (status);
    CREATE INDEX IF NOT EXISTS idx_pdv_rej_created ON pdv_product_rejections (created_at DESC);
  `);
  return true;
}

function getRejectedSummary(database) {
  const db = getDb(database);
  ensureRejectedSchema(db);

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END) as pendentes,
      SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN 1 ELSE 0 END) as hoje,
      COUNT(DISTINCT product_code) as produtosUnicos
    FROM pdv_product_rejections
  `).get();

  const lostRow = db.prepare(`
    SELECT
      COALESCE(SUM(unit_price * quantity), 0) as valorPerdido30d
    FROM pdv_product_rejections
    WHERE date(created_at) >= date('now', 'localtime', '-30 days')
  `).get();

  return {
    total: Number(totals?.total || 0),
    pendentes: Number(totals?.pendentes || 0),
    hoje: Number(totals?.hoje || 0),
    produtosUnicos: Number(totals?.produtosUnicos || 0),
    valorPerdido30d: round2(lostRow?.valorPerdido30d || 0)
  };
}

function registerRejection(database, payload = {}) {
  const db = getDb(database);
  ensureRejectedSchema(db);

  const rawName = String(payload.product_name || payload.name || '').trim();
  if (!rawName) {
    throw new Error('O nome do produto é obrigatório para registrar a recusa.');
  }

  const cleanBarcode = String(payload.barcode || '').trim().replace(/\s+/g, '');
  let cleanCode = cleanProductCode(payload.product_code || payload.code || cleanBarcode || 'AVULSO');
  if (!cleanCode) cleanCode = 'AVULSO';

  const rawQty = Number(payload.quantity);
  const quantity = Number.isFinite(rawQty) && rawQty > 0 ? round3(rawQty) : 1;

  let unitPrice = round2(Math.max(0, Number(payload.unit_price) || 0));
  let unitCost = round2(Math.max(0, Number(payload.unit_cost) || 0));

  // Enriquecimento automático de custo/preço via catálogo nativo quando necessário
  if (unitCost === 0 || unitPrice === 0) {
    try {
      const catProd = db.prepare(`
        SELECT code, sale_price, promo_price, cost_price
        FROM products
        WHERE code = ? OR (barcode != '' AND barcode = ?)
        LIMIT 1
      `).get(cleanCode, cleanBarcode || cleanCode);

      if (catProd) {
        if (cleanCode === 'AVULSO' && catProd.code) {
          cleanCode = cleanProductCode(catProd.code);
        }
        if (unitCost === 0 && Number(catProd.cost_price) > 0) {
          unitCost = round2(catProd.cost_price);
        }
        if (unitPrice === 0) {
          const eff = Number(catProd.promo_price) > 0 ? Number(catProd.promo_price) : Number(catProd.sale_price || 0);
          if (eff > 0) unitPrice = round2(eff);
        }
      }
    } catch (_) {}
  }

  let competitorPrice = null;
  if (payload.competitor_price !== undefined && payload.competitor_price !== null && payload.competitor_price !== '') {
    const parsedComp = Number(String(payload.competitor_price).replace(',', '.'));
    if (Number.isFinite(parsedComp) && parsedComp > 0) {
      competitorPrice = round2(parsedComp);
    }
  }

  const rawReason = String(payload.reason || 'PRECO_ALTO').trim().toUpperCase();
  const reason = VALID_REASONS.has(rawReason) ? rawReason : 'PRECO_ALTO';

  const competitorName = String(payload.competitor_name || '').trim().slice(0, 120);
  const notes = String(payload.notes || '').trim().slice(0, 500);
  const sellerId = payload.seller_id ? String(payload.seller_id).trim() : null;
  const sellerName = String(payload.seller_name || payload.operator_name || 'Caixa').trim() || 'Caixa';
  const operatorName = String(payload.operator_name || sellerName || 'Caixa').trim() || 'Caixa';

  const info = db.prepare(`
    INSERT INTO pdv_product_rejections (
      product_code, barcode, product_name, quantity,
      unit_price, unit_cost, competitor_price, competitor_name,
      reason, notes, seller_id, seller_name, operator_name,
      status, created_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      'PENDENTE', datetime('now', 'localtime')
    )
  `).run(
    cleanCode,
    cleanBarcode,
    rawName.toUpperCase(),
    quantity,
    unitPrice,
    unitCost,
    competitorPrice,
    competitorName,
    reason,
    notes,
    sellerId,
    sellerName,
    operatorName
  );

  const rejection = db.prepare('SELECT * FROM pdv_product_rejections WHERE id = ?').get(info.lastInsertRowid);
  const summary = getRejectedSummary(db);

  return { rejection, summary };
}

function listRejections(database, { dataInicio, dataFim, status = 'TODOS', reason = 'TODOS', q = '' } = {}) {
  const db = getDb(database);
  ensureRejectedSchema(db);

  const where = ['1=1'];
  const params = [];

  if (dataInicio && dataFim) {
    where.push('date(r.created_at) BETWEEN ? AND ?');
    params.push(String(dataInicio).slice(0, 10), String(dataFim).slice(0, 10));
  } else if (dataInicio) {
    where.push('date(r.created_at) >= ?');
    params.push(String(dataInicio).slice(0, 10));
  } else if (dataFim) {
    where.push('date(r.created_at) <= ?');
    params.push(String(dataFim).slice(0, 10));
  }

  const st = String(status || 'TODOS').trim().toUpperCase();
  if (st && st !== 'TODOS' && VALID_STATUSES.has(st)) {
    where.push('r.status = ?');
    params.push(st);
  }

  const rs = String(reason || 'TODOS').trim().toUpperCase();
  if (rs && rs !== 'TODOS' && VALID_REASONS.has(rs)) {
    where.push('r.reason = ?');
    params.push(rs);
  }

  const cleanQ = String(q || '').trim();
  if (cleanQ) {
    const term = `%${cleanQ}%`;
    where.push('(r.product_name LIKE ? OR r.barcode LIKE ? OR r.product_code LIKE ? OR r.competitor_name LIKE ? OR r.notes LIKE ?)');
    params.push(term, term, term, term, term);
  }

  const whereSql = where.join(' AND ');

  const rows = db.prepare(`
    SELECT
      r.*,
      p.sale_price as catalog_sale_price,
      p.promo_price as catalog_promo_price,
      p.cost_price as catalog_cost_price,
      p.stock_qty as catalog_stock_qty,
      p.barcode as catalog_barcode
    FROM pdv_product_rejections r
    LEFT JOIN products p ON p.code = r.product_code
    WHERE ${whereSql}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT 1000
  `).all(...params);

  const items = rows.slice(0, 300).map(r => {
    const currentSale = Number(r.catalog_sale_price ?? r.unit_price ?? 0);
    const currentPromo = Number(r.catalog_promo_price ?? 0);
    const currentCost = Number(r.catalog_cost_price ?? r.unit_cost ?? 0);
    return {
      ...r,
      current_sale_price: round2(currentSale),
      current_promo_price: round2(currentPromo),
      current_cost_price: round2(currentCost),
      current_stock_qty: Number(r.catalog_stock_qty ?? 0)
    };
  });

  // Agrupamento (Ranking por produto) sobre todos os registros filtrados (até 1000)
  const groupedMap = new Map();
  let totalLostRevenue = 0;
  let totalPending = 0;

  for (const r of rows) {
    const codeKey = cleanProductCode(r.product_code) || String(r.barcode || r.product_name);
    const lost = round2(Number(r.unit_price || 0) * Number(r.quantity || 1));
    totalLostRevenue = round2(totalLostRevenue + lost);
    if (r.status === 'PENDENTE') totalPending += 1;

    let entry = groupedMap.get(codeKey);
    if (!entry) {
      const catalogSale = Number(r.catalog_sale_price ?? r.unit_price ?? 0);
      const catalogPromo = Number(r.catalog_promo_price ?? 0);
      const catalogCost = Number(r.catalog_cost_price ?? r.unit_cost ?? 0);
      const effectivePrice = catalogPromo > 0 ? catalogPromo : catalogSale;

      entry = {
        product_code: codeKey,
        barcode: String(r.barcode || r.catalog_barcode || '').trim(),
        product_name: r.product_name,
        rejection_count: 0,
        pending_count: 0,
        total_qty_rejected: 0,
        lost_revenue: 0,
        rejected_price_sum: 0,
        competitor_price_sum: 0,
        competitor_price_count: 0,
        min_competitor_price: null,
        current_sale_price: round2(catalogSale),
        current_promo_price: round2(catalogPromo),
        current_cost_price: round2(catalogCost),
        current_stock_qty: Number(r.catalog_stock_qty ?? 0),
        effective_price: round2(effectivePrice),
        last_rejected_at: r.created_at,
        latest_status: r.status,
        reasons_map: {},
        competitors_set: new Set()
      };
      groupedMap.set(codeKey, entry);
    }

    entry.rejection_count += 1;
    if (r.status === 'PENDENTE') entry.pending_count += 1;
    entry.total_qty_rejected = round3(entry.total_qty_rejected + Number(r.quantity || 1));
    entry.lost_revenue = round2(entry.lost_revenue + lost);
    entry.rejected_price_sum += Number(r.unit_price || 0);

    if (!entry.barcode && (r.barcode || r.catalog_barcode)) {
      entry.barcode = String(r.barcode || r.catalog_barcode).trim();
    }

    if (r.competitor_price !== null && r.competitor_price !== undefined && Number(r.competitor_price) > 0) {
      const cp = Number(r.competitor_price);
      entry.competitor_price_sum += cp;
      entry.competitor_price_count += 1;
      if (entry.min_competitor_price === null || cp < entry.min_competitor_price) {
        entry.min_competitor_price = round2(cp);
      }
    }

    if (r.reason) {
      entry.reasons_map[r.reason] = (entry.reasons_map[r.reason] || 0) + 1;
    }
    if (r.competitor_name && String(r.competitor_name).trim()) {
      entry.competitors_set.add(String(r.competitor_name).trim());
    }
  }

  const ranking = Array.from(groupedMap.values()).map(g => {
    const avgRejectedPrice = g.rejection_count > 0 ? round2(g.rejected_price_sum / g.rejection_count) : 0;
    const avgCompetitorPrice = g.competitor_price_count > 0 ? round2(g.competitor_price_sum / g.competitor_price_count) : null;
    const marginPercent =
      g.effective_price > 0 && g.current_cost_price > 0
        ? Math.round(((g.effective_price - g.current_cost_price) / g.effective_price) * 1000) / 10
        : null;
    const diffVsCompetitorPercent =
      g.min_competitor_price !== null && g.min_competitor_price > 0 && g.effective_price > 0
        ? Math.round(((g.effective_price - g.min_competitor_price) / g.min_competitor_price) * 1000) / 10
        : null;

    return {
      product_code: g.product_code,
      barcode: g.barcode,
      product_name: g.product_name,
      rejection_count: g.rejection_count,
      pending_count: g.pending_count,
      total_qty_rejected: g.total_qty_rejected,
      lost_revenue: g.lost_revenue,
      avg_rejected_price: avgRejectedPrice,
      avg_competitor_price: avgCompetitorPrice,
      min_competitor_price: g.min_competitor_price,
      current_sale_price: g.current_sale_price,
      current_promo_price: g.current_promo_price,
      current_cost_price: g.current_cost_price,
      current_stock_qty: g.current_stock_qty,
      effective_price: g.effective_price,
      margin_percent: marginPercent,
      diff_vs_competitor_percent: diffVsCompetitorPercent,
      last_rejected_at: g.last_rejected_at,
      consolidated_status: g.pending_count > 0 ? 'PENDENTE' : g.latest_status,
      reasons_summary: g.reasons_map,
      competitors_summary: Array.from(g.competitors_set)
    };
  });

  ranking.sort((a, b) => {
    if (b.pending_count !== a.pending_count) return b.pending_count - a.pending_count;
    if (b.rejection_count !== a.rejection_count) return b.rejection_count - a.rejection_count;
    return b.lost_revenue - a.lost_revenue;
  });

  return {
    items,
    ranking,
    kpis: {
      totalRecusas: rows.length,
      produtosUnicos: ranking.length,
      valorPerdido: totalLostRevenue,
      pendentes: totalPending
    },
    summary: getRejectedSummary(db)
  };
}

function updateRejectionStatus(database, id, { status, review_notes = '', reviewed_by = 'Gestor' } = {}) {
  const db = getDb(database);
  ensureRejectedSchema(db);

  const st = String(status || '').trim().toUpperCase();
  if (!VALID_STATUSES.has(st)) {
    throw new Error('Status inválido. Use PENDENTE, PRECO_AJUSTADO ou MANTIDO.');
  }

  const existing = db.prepare('SELECT * FROM pdv_product_rejections WHERE id = ?').get(id);
  if (!existing) {
    throw new Error('Registro de recusa não encontrado.');
  }

  db.prepare(`
    UPDATE pdv_product_rejections
    SET status = ?,
        review_notes = ?,
        reviewed_by = ?,
        reviewed_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    st,
    String(review_notes || '').trim().slice(0, 400),
    String(reviewed_by || 'Gestor').trim(),
    id
  );

  return {
    rejection: db.prepare('SELECT * FROM pdv_product_rejections WHERE id = ?').get(id),
    summary: getRejectedSummary(db)
  };
}

function updateProductRejectionsStatus(database, productCode, { status, review_notes = '', reviewed_by = 'Gestor' } = {}) {
  const db = getDb(database);
  ensureRejectedSchema(db);

  const cleanCode = cleanProductCode(productCode);
  const st = String(status || '').trim().toUpperCase();
  if (!VALID_STATUSES.has(st)) {
    throw new Error('Status inválido. Use PENDENTE, PRECO_AJUSTADO ou MANTIDO.');
  }

  const res = db.prepare(`
    UPDATE pdv_product_rejections
    SET status = ?,
        review_notes = CASE WHEN ? != '' THEN ? ELSE review_notes END,
        reviewed_by = ?,
        reviewed_at = datetime('now', 'localtime')
    WHERE product_code = ? AND status = 'PENDENTE'
  `).run(
    st,
    String(review_notes || '').trim(),
    String(review_notes || '').trim().slice(0, 400),
    String(reviewed_by || 'Gestor').trim(),
    cleanCode
  );

  return {
    updatedCount: res.changes || 0,
    summary: getRejectedSummary(db)
  };
}

async function adjustProductPriceFromRejections(
  database,
  productCode,
  { sale_price, promo_price, review_notes = '', reviewed_by = 'Gestor' } = {},
  deps = {}
) {
  const db = getDb(database);
  ensureRejectedSchema(db);

  const cleanCode = cleanProductCode(productCode);
  if (!cleanCode) {
    throw new Error('Código do produto inválido.');
  }

  const updateBody = {};
  if (sale_price !== undefined && sale_price !== null && sale_price !== '') {
    const numSale = round2(Number(String(sale_price).replace(',', '.')));
    if (!Number.isFinite(numSale) || numSale <= 0) {
      throw new Error('Preço de venda deve ser maior que zero.');
    }
    updateBody.sale_price = numSale;
  }
  if (promo_price !== undefined && promo_price !== null && promo_price !== '') {
    const numPromo = round2(Number(String(promo_price).replace(',', '.')));
    if (!Number.isFinite(numPromo) || numPromo < 0) {
      throw new Error('Preço promocional inválido.');
    }
    updateBody.promo_price = numPromo;
  }

  if (updateBody.sale_price === undefined && updateBody.promo_price === undefined) {
    throw new Error('Informe ao menos o novo preço de venda ou promocional.');
  }

  const atualizarFn = deps.atualizarPrecoEEstoqueFn || require('./erp-products.service').atualizarPrecoEEstoque;
  const updatedProduct = await atualizarFn(cleanCode, updateBody);

  // Mantém digifarma_products_cache coerente para o PDV e consultas
  try {
    const currentProd = updatedProduct || db.prepare('SELECT sale_price, promo_price FROM products WHERE code = ?').get(cleanCode);
    if (currentProd) {
      const nextNormal = round2(updateBody.sale_price ?? currentProd.sale_price ?? 0);
      const nextPromo = round2(updateBody.promo_price ?? currentProd.promo_price ?? 0);
      const nextEffective = nextPromo > 0 ? nextPromo : nextNormal;
      db.prepare(`
        UPDATE digifarma_products_cache
        SET preco_normal = ?,
            preco_promocao = ?,
            preco_venda = ?,
            atualizado_em = datetime('now', 'localtime')
        WHERE produto_id = ?
      `).run(nextNormal, nextPromo, nextEffective, cleanCode);
    }
  } catch (_) {}

  const autoNote = String(review_notes || '').trim() || 'Preço ajustado via Análise de Produtos Recusados';
  const updRes = db.prepare(`
    UPDATE pdv_product_rejections
    SET status = 'PRECO_AJUSTADO',
        review_notes = ?,
        reviewed_by = ?,
        reviewed_at = datetime('now', 'localtime')
    WHERE product_code = ? AND status = 'PENDENTE'
  `).run(autoNote.slice(0, 400), String(reviewed_by || 'Gestor').trim(), cleanCode);

  return {
    product: updatedProduct,
    updatedCount: updRes.changes || 0,
    summary: getRejectedSummary(db)
  };
}

function deleteRejection(database, id) {
  const db = getDb(database);
  ensureRejectedSchema(db);

  const info = db.prepare('DELETE FROM pdv_product_rejections WHERE id = ?').run(id);
  return {
    deleted: info.changes > 0,
    summary: getRejectedSummary(db)
  };
}

function resolveActorName(req, body = {}) {
  return (
    req.headers['x-user-name'] ||
    body.reviewed_by ||
    body.seller_name ||
    body.operator_name ||
    (req.user && req.user.name) ||
    'Caixa'
  );
}

function createRejectedProductsRouter(database, deps = {}) {
  const express = require('express');
  const router = express.Router();

  router.get('/summary', (req, res) => {
    try {
      res.json({ success: true, summary: getRejectedSummary(database) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/', (req, res) => {
    try {
      const { dataInicio, dataFim, status, reason, q } = req.query || {};
      const data = listRejections(database, { dataInicio, dataFim, status, reason, q });
      res.json({ success: true, ...data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/', (req, res) => {
    try {
      const body = req.body || {};
      const actor = resolveActorName(req, body);
      const result = registerRejection(database, {
        ...body,
        operator_name: body.operator_name || actor,
        seller_name: body.seller_name || actor
      });
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.patch('/product/:code/status', (req, res) => {
    try {
      const body = req.body || {};
      const result = updateProductRejectionsStatus(database, req.params.code, {
        status: body.status,
        review_notes: body.review_notes,
        reviewed_by: resolveActorName(req, body)
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post('/product/:code/adjust-price', async (req, res) => {
    try {
      const body = req.body || {};
      const result = await adjustProductPriceFromRejections(
        database,
        req.params.code,
        {
          sale_price: body.sale_price,
          promo_price: body.promo_price,
          review_notes: body.review_notes,
          reviewed_by: resolveActorName(req, body)
        },
        deps
      );
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.patch('/:id', (req, res) => {
    try {
      const body = req.body || {};
      const result = updateRejectionStatus(database, Number(req.params.id), {
        status: body.status,
        review_notes: body.review_notes,
        reviewed_by: resolveActorName(req, body)
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      const result = deleteRejection(database, Number(req.params.id));
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = {
  VALID_REASONS,
  VALID_STATUSES,
  ensureRejectedSchema,
  getRejectedSummary,
  registerRejection,
  listRejections,
  updateRejectionStatus,
  updateProductRejectionsStatus,
  adjustProductPriceFromRejections,
  deleteRejection,
  createRejectedProductsRouter
};
