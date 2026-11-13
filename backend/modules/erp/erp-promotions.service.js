/**
 * Belinha ERP - Promotions & Tiered Pricing Management Service
 * Gerenciamento centralizado de Promoções Comuns (Preço De/Por) e Promoções Escalonadas (Leve X por R$ Y)
 * com suporte completo a Validade (Início e Término) e sincronização bidirecional com o Digifarma.
 */

const { db } = require('./erp-database');
const { queryDigifarma } = require('../../services/digifarma.service');

// Helper para obter a data local no formato YYYY-MM-DD
function getLocalDateStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Avalia o status de vigência de uma promoção baseado na data de hoje
 * @returns {'ATIVA' | 'EXPIRADA' | 'AGENDADA' | 'PERMANENTE'}
 */
function calcularStatusValidade({ startDate, endDate, isPermanent, active = 1 }) {
  if (active === 0) return 'PAUSADA';
  if (isPermanent) return 'PERMANENTE';

  const today = getLocalDateStr();

  if (endDate && endDate < today) {
    return 'EXPIRADA';
  }
  if (startDate && startDate > today) {
    return 'AGENDADA';
  }
  return 'ATIVA';
}

/**
 * ============================================================================
 * 1. PROMOÇÕES COMUNS (PREÇO DE / POR)
 * ============================================================================
 */

/**
 * Lista todas as promoções comuns com status de vigência
 */
function listarPromocoesComuns({ apenasAtivas = false, busca = '' } = {}) {
  let sql = `
    SELECT 
      code,
      barcode,
      name,
      sale_price,
      promo_price,
      cost_price,
      stock_qty,
      promo_start_date,
      promo_end_date,
      promo_permanent
    FROM products
    WHERE promo_price > 0
  `;
  const params = [];

  if (busca && busca.trim()) {
    sql += ` AND (name LIKE ? OR barcode LIKE ? OR code LIKE ?)`;
    const term = `%${busca.trim()}%`;
    params.push(term, term, term);
  }

  sql += ` ORDER BY name ASC`;

  const prods = db.prepare(sql).all(...params);
  const hoje = getLocalDateStr();

  const formatados = prods.map(p => {
    const isPermanent = p.promo_permanent === 1 || (!p.promo_start_date && !p.promo_end_date);
    const status = calcularStatusValidade({
      startDate: p.promo_start_date,
      endDate: p.promo_end_date,
      isPermanent
    });

    const descontoReais = Math.max(0, p.sale_price - p.promo_price);
    const descontoPct = p.sale_price > 0 ? Math.round((descontoReais / p.sale_price) * 100) : 0;

    let diasRestantes = null;
    if (p.promo_end_date && !isPermanent) {
      const diffMs = new Date(p.promo_end_date).getTime() - new Date(hoje).getTime();
      diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    return {
      code: p.code,
      barcode: p.barcode,
      name: p.name,
      cost_price: p.cost_price || 0,
      sale_price: p.sale_price || 0,
      promo_price: p.promo_price,
      desconto_reais: Math.round(descontoReais * 100) / 100,
      desconto_pct: descontoPct,
      promo_start_date: p.promo_start_date || null,
      promo_end_date: p.promo_end_date || null,
      promo_permanent: isPermanent ? 1 : 0,
      status,
      dias_restantes: diasRestantes,
      is_vigente: status === 'ATIVA' || status === 'PERMANENTE'
    };
  });

  if (apenasAtivas) {
    return formatados.filter(f => f.is_vigente);
  }
  return formatados;
}

/**
 * Salva ou atualiza uma promoção comum para um produto
 */
async function salvarPromocaoComum({
  product_code,
  promo_price,
  start_date = null,
  end_date = null,
  is_permanent = false
}) {
  if (!product_code) throw new Error('Código do produto é obrigatório.');
  const preco = parseFloat(promo_price);
  if (isNaN(preco) || preco <= 0) {
    throw new Error('Preço promocional deve ser maior que zero.');
  }

  const prod = db.prepare('SELECT * FROM products WHERE code = ?').get(product_code);
  if (!prod) throw new Error(`Produto #${product_code} não encontrado no catálogo.`);

  const hoje = getLocalDateStr();
  const dataInicio = start_date || hoje;
  const dataFim = is_permanent ? null : (end_date || null);
  const permanenteFlag = is_permanent ? 1 : 0;

  // 1. Atualiza no SQLite do BelaFarma
  db.prepare(`
    UPDATE products 
    SET 
      promo_price = ?,
      promo_start_date = ?,
      promo_end_date = ?,
      promo_permanent = ?
    WHERE code = ?
  `).run(preco, dataInicio, dataFim, permanenteFlag, product_code);

  console.log(`[ERP Promoções] 🏷️ Promoção Comum salva para ${prod.name}: De R$ ${prod.sale_price} Por R$ ${preco} (Válida até: ${dataFim || 'Permanente'})`);

  // 2. Sincroniza com o Digifarma Firebird se possível
  let digifarmaSincronizado = false;
  let digifarmaErro = null;

  try {
    const permDigi = is_permanent ? 'S' : 'N';
    // Se tiver data de início/fim, formata
    const dtInicioDigi = dataInicio ? `${dataInicio} 00:00:00` : null;
    const dtFimDigi = dataFim ? `${dataFim} 23:59:59` : null;

    // Tenta pelo código de barras ou pelo ID
    const resDigi = await queryDigifarma(`
      UPDATE PRODUTOS
      SET 
        PROD_PRPROMOCAO = ?,
        INICIO_PROMOCAO = ?,
        TERMINO_PROMOCAO = ?,
        PROMOCAO_PERMANENTE = ?
      WHERE (CODIGO_BARRAS = ? AND CODIGO_BARRAS IS NOT NULL AND CODIGO_BARRAS <> '')
         OR (PRODUTO_ID = ?)
    `, [preco, dtInicioDigi, dtFimDigi, permDigi, prod.barcode, parseInt(prod.code, 10) || 0], 8000);

    digifarmaSincronizado = true;
    console.log(`[ERP Promoções] ✅ Promoção Comum replicada no Digifarma com sucesso.`);
  } catch (err) {
    digifarmaErro = err.message;
    console.warn(`[ERP Promoções] ⚠️ Não foi possível sincronizar promoção comum com o Digifarma:`, err.message);
  }

  return {
    success: true,
    product_code,
    promo_price: preco,
    promo_start_date: dataInicio,
    promo_end_date: dataFim,
    is_permanent: Boolean(is_permanent),
    digifarma_sync: digifarmaSincronizado,
    digifarma_error: digifarmaErro
  };
}

/**
 * Remove a promoção comum de um produto (volta ao preço normal)
 */
async function removerPromocaoComum(product_code) {
  const prod = db.prepare('SELECT * FROM products WHERE code = ?').get(product_code);
  if (!prod) throw new Error('Produto não encontrado.');

  db.prepare(`
    UPDATE products 
    SET 
      promo_price = 0,
      promo_start_date = NULL,
      promo_end_date = NULL,
      promo_permanent = 0
    WHERE code = ?
  `).run(product_code);

  let digifarmaRemovido = false;
  try {
    await queryDigifarma(`
      UPDATE PRODUTOS
      SET 
        PROD_PRPROMOCAO = 0,
        INICIO_PROMOCAO = NULL,
        TERMINO_PROMOCAO = NULL,
        PROMOCAO_PERMANENTE = 'N'
      WHERE (CODIGO_BARRAS = ? AND CODIGO_BARRAS IS NOT NULL AND CODIGO_BARRAS <> '')
         OR (PRODUTO_ID = ?)
    `, [prod.barcode, parseInt(prod.code, 10) || 0], 8000);
    digifarmaRemovido = true;
  } catch (err) {
    console.warn('[ERP Promoções] Aviso ao limpar promoção comum no Digifarma:', err.message);
  }

  return { success: true, digifarma_sync: digifarmaRemovido };
}

/**
 * ============================================================================
 * 2. PROMOÇÕES ESCALONADAS (LEVE X POR R$ Y)
 * ============================================================================
 */

/**
 * Lista todas as promoções escalonadas cadastradas
 */
function listarPromocoesEscalonadas({ apenasAtivas = false, busca = '' } = {}) {
  let sql = `
    SELECT 
      t.id,
      t.digifarma_id,
      t.product_id,
      t.product_code,
      t.barcode,
      COALESCE(p.name, t.product_name) as product_name,
      t.quantity,
      t.package_price,
      t.unit_effective_price,
      t.active,
      t.start_date,
      t.end_date,
      t.is_permanent,
      t.created_at,
      p.sale_price,
      p.promo_price,
      p.cost_price,
      p.stock_qty
    FROM tiered_pricing t
    LEFT JOIN products p ON (
      p.code = t.product_code 
      OR p.code = CAST(t.product_id AS TEXT) 
      OR (t.barcode IS NOT NULL AND p.barcode = t.barcode)
    )
    WHERE 1=1
  `;
  const params = [];

  if (busca && busca.trim()) {
    sql += ` AND (
      t.product_name LIKE ? 
      OR t.barcode LIKE ? 
      OR t.product_code LIKE ? 
      OR CAST(t.product_id AS TEXT) LIKE ? 
      OR p.code LIKE ? 
      OR p.name LIKE ?
    )`;
    const term = `%${busca.trim()}%`;
    params.push(term, term, term, term, term, term);
  }

  sql += ` ORDER BY COALESCE(p.name, t.product_name) ASC, t.quantity ASC`;

  const rows = db.prepare(sql).all(...params);
  const hoje = getLocalDateStr();

  const formatados = rows.map(r => {
    const precoNormalUnit = r.sale_price || (r.unit_effective_price * 1.2);
    const totalSemDesconto = precoNormalUnit * r.quantity;
    const economia = Math.max(0, totalSemDesconto - r.package_price);
    const economiaPct = totalSemDesconto > 0 ? Math.round((economia / totalSemDesconto) * 100) : 0;

    const isPermanent = r.is_permanent === 1 || (!r.start_date && !r.end_date);
    const status = calcularStatusValidade({
      startDate: r.start_date,
      endDate: r.end_date,
      isPermanent,
      active: r.active
    });

    let diasRestantes = null;
    if (r.end_date && !isPermanent) {
      const diffMs = new Date(r.end_date).getTime() - new Date(hoje).getTime();
      diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    return {
      id: r.id,
      digifarma_id: r.digifarma_id,
      product_code: r.product_code || String(r.product_id),
      product_id: r.product_id,
      barcode: r.barcode,
      product_name: r.product_name || `Produto #${r.product_code}`,
      quantity: r.quantity,
      package_price: r.package_price,
      unit_effective_price: r.unit_effective_price,
      unit_normal_price: precoNormalUnit,
      economia_reais: Math.round(economia * 100) / 100,
      economia_pct: economiaPct,
      active: r.active,
      start_date: r.start_date || null,
      end_date: r.end_date || null,
      is_permanent: isPermanent ? 1 : 0,
      status,
      dias_restantes: diasRestantes,
      is_vigente: status === 'ATIVA' || status === 'PERMANENTE'
    };
  });

  if (apenasAtivas) {
    return formatados.filter(f => f.is_vigente);
  }
  return formatados;
}

/**
 * Salva ou atualiza uma regra de promoção escalonada
 */
async function salvarPromocaoEscalonada({
  id = null,
  product_code,
  quantity,
  package_price,
  start_date = null,
  end_date = null,
  is_permanent = false,
  active = 1
}) {
  if (!product_code) throw new Error('Código do produto é obrigatório.');
  const qtd = parseInt(quantity, 10);
  const vlrPacote = parseFloat(package_price);

  if (isNaN(qtd) || qtd < 2) {
    throw new Error('A quantidade para promoção escalonada deve ser no mínimo 2 unidades.');
  }
  if (isNaN(vlrPacote) || vlrPacote <= 0) {
    throw new Error('O valor do pacote deve ser maior que zero.');
  }

  const prod = db.prepare('SELECT * FROM products WHERE code = ? OR barcode = ?').get(product_code, product_code);
  if (!prod) throw new Error(`Produto #${product_code} não encontrado no catálogo.`);

  const precoEfetivo = Math.round((vlrPacote / qtd) * 100) / 100;
  const hoje = getLocalDateStr();
  const dataInicio = start_date || hoje;
  const dataFim = is_permanent ? null : (end_date || null);
  const permFlag = is_permanent ? 1 : 0;
  const prodIdNum = parseInt(prod.code, 10) || 0;

  let ruleId = id;
  let digifarmaId = null;

  if (ruleId) {
    const existing = db.prepare('SELECT * FROM tiered_pricing WHERE id = ?').get(ruleId);
    if (existing) digifarmaId = existing.digifarma_id;

    db.prepare(`
      UPDATE tiered_pricing
      SET 
        quantity = ?,
        package_price = ?,
        unit_effective_price = ?,
        active = ?,
        start_date = ?,
        end_date = ?,
        is_permanent = ?,
        synced_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(qtd, vlrPacote, precoEfetivo, active ? 1 : 0, dataInicio, dataFim, permFlag, ruleId);
  } else {
    // Verifica se já existe regra para este produto e esta mesma quantidade
    const existing = db.prepare('SELECT * FROM tiered_pricing WHERE (product_code = ? OR product_id = ?) AND quantity = ?')
      .get(prod.code, prodIdNum, qtd);

    if (existing) {
      ruleId = existing.id;
      digifarmaId = existing.digifarma_id;
      db.prepare(`
        UPDATE tiered_pricing
        SET 
          package_price = ?,
          unit_effective_price = ?,
          active = ?,
          start_date = ?,
          end_date = ?,
          is_permanent = ?,
          synced_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(vlrPacote, precoEfetivo, active ? 1 : 0, dataInicio, dataFim, permFlag, ruleId);
    } else {
      const ins = db.prepare(`
        INSERT INTO tiered_pricing (
          product_id, product_code, barcode, product_name,
          quantity, package_price, unit_effective_price,
          active, start_date, end_date, is_permanent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        prodIdNum, prod.code, prod.barcode, prod.name,
        qtd, vlrPacote, precoEfetivo,
        active ? 1 : 0, dataInicio, dataFim, permFlag
      );
      ruleId = ins.lastInsertRowid;
    }
  }

  // Sincroniza com o Digifarma na tabela DESCONTO_ESCALONADO
  let digifarmaSync = false;
  let digifarmaErro = null;

  try {
    // Descobre o PRODUTO_ID correspondente no Firebird
    let pIdDigi = prodIdNum;
    const digiProdRows = await queryDigifarma(`
      SELECT FIRST 1 PRODUTO_ID FROM PRODUTOS 
      WHERE (CODIGO_BARRAS = ? AND CODIGO_BARRAS IS NOT NULL AND CODIGO_BARRAS <> '')
         OR (PRODUTO_ID = ?)
    `, [prod.barcode, prodIdNum], 8000);

    if (digiProdRows && digiProdRows.length > 0) {
      pIdDigi = digiProdRows[0].PRODUTO_ID;
    }

    if (pIdDigi > 0) {
      if (digifarmaId) {
        // Atualiza regra existente
        await queryDigifarma(`
          UPDATE DESCONTO_ESCALONADO
          SET QUANTIDADE = ?, VALOR_PACOTE = ?
          WHERE DESCONTO_ESCALONADO_ID = ?
        `, [qtd, vlrPacote, digifarmaId], 8000);
        digifarmaSync = true;
      } else {
        // Obtém novo ID
        const maxRows = await queryDigifarma('SELECT MAX(DESCONTO_ESCALONADO_ID) as MAX_ID FROM DESCONTO_ESCALONADO', [], 8000);
        const novoDigiId = ((maxRows && maxRows[0] && maxRows[0].MAX_ID) || 0) + 1;

        await queryDigifarma(`
          INSERT INTO DESCONTO_ESCALONADO (DESCONTO_ESCALONADO_ID, PRODUTO_ID, QUANTIDADE, VALOR_PACOTE)
          VALUES (?, ?, ?, ?)
        `, [novoDigiId, pIdDigi, qtd, vlrPacote], 8000);

        digifarmaId = novoDigiId;
        db.prepare('UPDATE tiered_pricing SET digifarma_id = ? WHERE id = ?').run(novoDigiId, ruleId);
        digifarmaSync = true;
      }
      console.log(`[ERP Promoções] ⚡ Promoção escalonada sincronizada no Digifarma (ID: ${digifarmaId}, Produto: ${pIdDigi}, Qtd: ${qtd}, R$ ${vlrPacote})`);
    }
  } catch (err) {
    digifarmaErro = err.message;
    console.warn('[ERP Promoções] Aviso ao sincronizar promoção escalonada com o Digifarma:', err.message);
  }

  return {
    success: true,
    id: ruleId,
    digifarma_id: digifarmaId,
    product_code: prod.code,
    product_name: prod.name,
    quantity: qtd,
    package_price: vlrPacote,
    unit_effective_price: precoEfetivo,
    start_date: dataInicio,
    end_date: dataFim,
    is_permanent: Boolean(is_permanent),
    active: Boolean(active),
    digifarma_sync: digifarmaSync,
    digifarma_error: digifarmaErro
  };
}

/**
 * Remove uma promoção escalonada
 */
async function removerPromocaoEscalonada(id) {
  const row = db.prepare('SELECT * FROM tiered_pricing WHERE id = ?').get(id);
  if (!row) throw new Error('Regra escalonada não encontrada.');

  db.prepare('DELETE FROM tiered_pricing WHERE id = ?').run(id);

  let digifarmaRemovido = false;
  if (row.digifarma_id) {
    try {
      await queryDigifarma(`
        DELETE FROM DESCONTO_ESCALONADO 
        WHERE DESCONTO_ESCALONADO_ID = ?
      `, [row.digifarma_id], 8000);
      digifarmaRemovido = true;
    } catch (err) {
      console.warn('[ERP Promoções] Aviso ao deletar DESCONTO_ESCALONADO no Digifarma:', err.message);
    }
  }

  return { success: true, digifarma_sync: digifarmaRemovido };
}

/**
 * Helper para verificar se a promoção comum de um item está vigente hoje
 */
function verificarValidadePromocaoItem(product) {
  if (!product || !product.promo_price || product.promo_price <= 0) {
    return { em_promocao: false, preco_aplicavel: product ? product.sale_price : 0 };
  }

  const isPermanent = product.promo_permanent === 1 || (!product.promo_start_date && !product.promo_end_date);
  if (isPermanent) {
    return { em_promocao: true, preco_aplicavel: product.promo_price };
  }

  const hoje = getLocalDateStr();
  if (product.promo_end_date && product.promo_end_date < hoje) {
    return { em_promocao: false, preco_aplicavel: product.sale_price, motivo: 'EXPIRADA' };
  }
  if (product.promo_start_date && product.promo_start_date > hoje) {
    return { em_promocao: false, preco_aplicavel: product.sale_price, motivo: 'AGENDADA' };
  }

  return { em_promocao: true, preco_aplicavel: product.promo_price };
}

module.exports = {
  listarPromocoesComuns,
  salvarPromocaoComum,
  removerPromocaoComum,
  listarPromocoesEscalonadas,
  salvarPromocaoEscalonada,
  removerPromocaoEscalonada,
  verificarValidadePromocaoItem,
  calcularStatusValidade
};
