/**
 * Belinha ERP - Caderninho Service
 * Controle ágil de pequenas anotações no balcão (apenas nome + produtos levados):
 * - Ao anotar: NÃO entra nas vendas nem dá baixa no estoque do dia.
 * - Ao pagar (total, por anotações selecionadas ou parcial livre): registra venda no caixa do dia
 *   e baixa o estoque dos produtos pagos sem duplicar receita nem estoque.
 * - Alerta acima de R$ 100,00 acumulados (permite operador confirmar) e destaque > 2 dias em aberto.
 */

const security = require('../../security');

const CADERNINHO_SOFT_LIMIT = 100.0;
const CADERNINHO_OVERDUE_DAYS = 2;

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

function getLocalDateStr(date = new Date()) {
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function diffDaysYMD(laterYMD, earlierYMD) {
  const m1 = String(laterYMD || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const m2 = String(earlierYMD || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m1 || !m2) return 0;
  const t1 = Date.UTC(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
  const t2 = Date.UTC(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
  return Math.max(0, Math.floor((t1 - t2) / (1000 * 60 * 60 * 24)));
}

function normalizePersonName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function cleanDisplayName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function safeParseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function ensureCaderninhoSchema(database) {
  const db = getDb(database);
  db.exec(`
    CREATE TABLE IF NOT EXISTS caderninho_people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS caderninho_entries (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      discount_value REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ABERTA',
      items_json TEXT NOT NULL DEFAULT '[]',
      operator_name TEXT DEFAULT 'Caixa',
      seller_id TEXT,
      seller_name TEXT,
      notes TEXT DEFAULT '',
      sale_id TEXT,
      paid_at TEXT,
      cancelled_at TEXT,
      cancelled_by TEXT,
      cancel_reason TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS caderninho_movements (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      entry_id TEXT,
      type TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT,
      sale_id TEXT,
      operator_name TEXT DEFAULT 'Caixa',
      reason TEXT DEFAULT '',
      details_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_cad_entries_person ON caderninho_entries (person_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cad_entries_status ON caderninho_entries (status);
    CREATE INDEX IF NOT EXISTS idx_cad_mov_person ON caderninho_movements (person_id, created_at DESC);
  `);

  // Migração idempotente para regra de acréscimo de crediário após o mesmo dia
  // Registros anteriores a hoje permanecem com crediario_rule_enabled = 0 (não retroage)
  try {
    const cols = db.prepare('PRAGMA table_info(caderninho_entries)').all().map(c => c.name);
    if (!cols.includes('crediario_rule_enabled')) {
      db.prepare('ALTER TABLE caderninho_entries ADD COLUMN crediario_rule_enabled INTEGER NOT NULL DEFAULT 0').run();
    }
    if (!cols.includes('crediario_total_amount')) {
      db.prepare('ALTER TABLE caderninho_entries ADD COLUMN crediario_total_amount REAL NOT NULL DEFAULT 0').run();
    }
    if (!cols.includes('crediario_surcharge')) {
      db.prepare('ALTER TABLE caderninho_entries ADD COLUMN crediario_surcharge REAL NOT NULL DEFAULT 0').run();
    }
    if (!cols.includes('crediario_applied')) {
      db.prepare('ALTER TABLE caderninho_entries ADD COLUMN crediario_applied INTEGER NOT NULL DEFAULT 0').run();
    }
  } catch (err) {
    console.warn('[Caderninho] Aviso ao verificar colunas de crediário:', err.message);
  }
}

/**
 * Resolve o preço unitário na tabela de crediário (mesma regra do Digifarma/PDV):
 * 1) Se crediario_price > 0 -> usa crediario_price
 * 2) Senão, se promo_price > 0 e promo_vista === 'S' -> volta para sale_price
 * 3) Senão -> mantém o preço à vista (sem acréscimo)
 */
function resolveItemCrediarioUnitPrice(db, item, cashUnitPrice) {
  let salePrice = Number(item.sale_price || 0);
  let promoPrice = Number(item.promo_price || 0);
  let credPrice = Number(item.crediario_price || 0);
  let promoVista = String(item.promo_vista || '').toUpperCase() === 'S';

  const hasExplicitPricing = credPrice > 0 || (promoPrice > 0 && promoVista && salePrice > 0);

  if (!hasExplicitPricing && db) {
    try {
      const code = String(item.code || item.product_code || '').trim().replace(/\.0+$/, '');
      const barcode = String(item.barcode || '').trim();
      let prod = null;
      if (code && !code.startsWith('CAD-') && !code.startsWith('AVULSO')) {
        prod = db.prepare('SELECT * FROM products WHERE code = ? LIMIT 1').get(code);
      }
      if (!prod && barcode && !barcode.startsWith('*')) {
        prod = db.prepare('SELECT * FROM products WHERE barcode = ? LIMIT 1').get(barcode);
      }
      if (prod) {
        if (salePrice <= 0) salePrice = Number(prod.sale_price || 0);
        if (promoPrice <= 0) promoPrice = Number(prod.promo_price || 0);
        if (credPrice <= 0) credPrice = Number(prod.crediario_price || 0);
        if (!promoVista) promoVista = String(prod.promo_vista || '').toUpperCase() === 'S';
      }
    } catch {
      // Bancos minimalistas ou tabela products sem colunas opcionais: mantém preço à vista
    }
  }

  let credUnit = cashUnitPrice;
  if (credPrice > 0) {
    credUnit = credPrice;
  } else if (promoPrice > 0 && promoVista && salePrice > 0) {
    credUnit = salePrice;
  }

  // Nunca reduz o valor anotado (apenas aplica acréscimo quando tabela crediário for maior)
  return round2(Math.max(cashUnitPrice, credUnit));
}

function computeEffectiveEntryAmounts(entry, todayYMD) {
  const createdYMD = String(entry.created_at || '').slice(0, 10);
  const isOpen = entry.status === 'ABERTA' || entry.status === 'PARCIAL';
  const ruleEnabled = Number(entry.crediario_rule_enabled || 0) === 1;
  const baseTotal = round2(entry.total_amount);
  const storedCredTotal = round2(entry.crediario_total_amount || 0);
  const storedSurcharge = round2(entry.crediario_surcharge || 0);
  const alreadyApplied = Number(entry.crediario_applied || 0) === 1;

  // Regra: compras anotadas com a regra ativa que NÃO forem pagas no mesmo dia
  // recebem automaticamente o acréscimo da tabela de crediário.
  const isAfterSameDay = Boolean(createdYMD && todayYMD && createdYMD < todayYMD);
  const hasSurcharge = storedSurcharge > 0.004 && storedCredTotal > 0;
  const shouldApplyCrediario = Boolean(
    ruleEnabled &&
    hasSurcharge &&
    ((isOpen && isAfterSameDay) || alreadyApplied)
  );

  // Se já foi gravado como applied no pagamento, baseTotal já é o valor atualizado;
  // caso ainda esteja em aberto e virou o dia, o total efetivo sobe para storedCredTotal.
  const effectiveTotal = shouldApplyCrediario
    ? (alreadyApplied ? baseTotal : storedCredTotal)
    : baseTotal;

  const originalTotal = shouldApplyCrediario && alreadyApplied
    ? Math.max(0, round2(effectiveTotal - storedSurcharge))
    : baseTotal;

  const paidAmount = round2(entry.paid_amount);
  const effectiveRemaining = isOpen
    ? Math.max(0, round2(effectiveTotal - paidAmount))
    : 0;

  return {
    createdYMD,
    isOpen,
    ruleEnabled,
    shouldApplyCrediario,
    originalTotal,
    effectiveTotal,
    effectiveRemaining,
    crediarioTotal: storedCredTotal > 0 ? storedCredTotal : baseTotal,
    crediarioSurcharge: storedSurcharge
  };
}

function findOrCreatePerson(database, rawName) {
  const db = getDb(database);
  const display = cleanDisplayName(rawName);
  const normalized = normalizePersonName(rawName);

  if (!normalized || normalized.length < 2) {
    throw new Error('Informe o nome do cliente para anotar no Caderninho.');
  }

  let person = db
    .prepare('SELECT * FROM caderninho_people WHERE normalized_name = ?')
    .get(normalized);

  if (person) {
    db.prepare("UPDATE caderninho_people SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(person.id);
    return person;
  }

  const personId = `CADP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  db.prepare(`
    INSERT INTO caderninho_people (id, name, normalized_name, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(personId, display, normalized);

  return db.prepare('SELECT * FROM caderninho_people WHERE id = ?').get(personId);
}

function enrichEntryRow(entry, todayYMD) {
  const eff = computeEffectiveEntryAmounts(entry, todayYMD);
  const daysOpen = eff.createdYMD ? diffDaysYMD(todayYMD, eff.createdYMD) : 0;
  const rawItems = safeParseJson(entry.items_json, []);
  const items = rawItems.map(it => {
    const qty = Math.max(1, Number(it.quantity || 1));
    const cashUnit = round2(it.cash_unit_price ?? it.unit_price ?? 0);
    const credUnit = round2(it.crediario_unit_price ?? cashUnit);
    const effectiveUnit = eff.shouldApplyCrediario && credUnit > cashUnit ? credUnit : cashUnit;
    const itemDiscount = round2(it.discount || 0);
    const effectiveLineTotal = Math.max(0, round2(qty * effectiveUnit - itemDiscount));
    return {
      ...it,
      cash_unit_price: cashUnit,
      crediario_unit_price: credUnit,
      unit_price: effectiveUnit,
      total_price: effectiveLineTotal
    };
  });

  return {
    ...entry,
    original_total_amount: eff.originalTotal,
    total_amount: eff.effectiveTotal,
    discount_value: round2(entry.discount_value),
    paid_amount: round2(entry.paid_amount),
    remaining_amount: eff.effectiveRemaining,
    crediario_rule_enabled: eff.ruleEnabled,
    crediario_total_amount: eff.crediarioTotal,
    crediario_surcharge: eff.crediarioSurcharge,
    crediario_applied: eff.shouldApplyCrediario,
    items,
    created_ymd: eff.createdYMD,
    days_open: daysOpen,
    is_today: eff.createdYMD === todayYMD,
    is_overdue: Boolean(eff.isOpen && daysOpen > CADERNINHO_OVERDUE_DAYS)
  };
}

function getCaderninhoSummary(database) {
  const db = getDb(database);
  ensureCaderninhoSchema(db);
  const todayYMD = getLocalDateStr();

  const openEntries = db
    .prepare("SELECT * FROM caderninho_entries WHERE status IN ('ABERTA', 'PARCIAL') AND remaining_amount > 0")
    .all();

  const peopleSet = new Set();
  const overduePeopleSet = new Set();
  let overdueEntriesCount = 0;
  let totalOpenAmount = 0;

  for (const e of openEntries) {
    const eff = computeEffectiveEntryAmounts(e, todayYMD);
    if (eff.effectiveRemaining <= 0) continue;
    peopleSet.add(e.person_id);
    totalOpenAmount = round2(totalOpenAmount + eff.effectiveRemaining);
    const daysOpen = diffDaysYMD(todayYMD, eff.createdYMD);
    if (daysOpen > CADERNINHO_OVERDUE_DAYS) {
      overdueEntriesCount++;
      overduePeopleSet.add(e.person_id);
    }
  }

  return {
    openPeopleCount: peopleSet.size,
    openEntriesCount: openEntries.length,
    overduePeopleCount: overduePeopleSet.size,
    overdueEntriesCount,
    totalOpenAmount,
    softLimit: CADERNINHO_SOFT_LIMIT,
    overdueDays: CADERNINHO_OVERDUE_DAYS
  };
}

function listCaderninhoPeople(database, { q = '', onlyOpen = false } = {}) {
  const db = getDb(database);
  ensureCaderninhoSchema(db);
  const todayYMD = getLocalDateStr();

  const people = db.prepare('SELECT * FROM caderninho_people ORDER BY name ASC').all();
  const allEntries = db
    .prepare('SELECT * FROM caderninho_entries ORDER BY created_at ASC, id ASC')
    .all();
  const movCountsRows = db
    .prepare('SELECT person_id, COUNT(*) as total, MAX(created_at) as last_at FROM caderninho_movements GROUP BY person_id')
    .all();

  const movStatsByPerson = new Map();
  for (const m of movCountsRows) {
    movStatsByPerson.set(m.person_id, { total: Number(m.total || 0), lastAt: m.last_at || null });
  }

  const openEntriesByPerson = new Map();
  for (const raw of allEntries) {
    if (raw.status !== 'ABERTA' && raw.status !== 'PARCIAL') continue;
    if (round2(raw.remaining_amount) <= 0) continue;
    const enriched = enrichEntryRow(raw, todayYMD);
    if (!openEntriesByPerson.has(raw.person_id)) openEntriesByPerson.set(raw.person_id, []);
    openEntriesByPerson.get(raw.person_id).push(enriched);
  }

  const normalizedQ = normalizePersonName(q);

  const list = people
    .filter(p => !normalizedQ || String(p.normalized_name || '').includes(normalizedQ))
    .map(p => {
      const openEntries = openEntriesByPerson.get(p.id) || [];
      const openBalance = round2(openEntries.reduce((acc, e) => acc + e.remaining_amount, 0));
      const maxDaysOpen = openEntries.reduce((m, e) => Math.max(m, e.days_open), 0);
      const oldestOpenDate = openEntries.length > 0 ? openEntries[0].created_at : null;
      const stats = movStatsByPerson.get(p.id) || { total: 0, lastAt: null };

      return {
        id: p.id,
        name: p.name,
        openBalance,
        openEntriesCount: openEntries.length,
        oldestOpenDate,
        maxDaysOpen,
        isOverdue: openBalance > 0 && maxDaysOpen > CADERNINHO_OVERDUE_DAYS,
        exceededLimit: openBalance > CADERNINHO_SOFT_LIMIT,
        totalMovementsCount: stats.total,
        lastMovementAt: stats.lastAt || p.updated_at,
        entries: openEntries
      };
    })
    .filter(item => (!onlyOpen ? true : item.openBalance > 0));

  if (onlyOpen) {
    list.sort((a, b) => {
      if (b.maxDaysOpen !== a.maxDaysOpen) return b.maxDaysOpen - a.maxDaysOpen;
      if (b.openBalance !== a.openBalance) return b.openBalance - a.openBalance;
      return a.name.localeCompare(b.name);
    });
  } else {
    list.sort((a, b) => {
      if (b.openBalance !== a.openBalance) return b.openBalance - a.openBalance;
      return a.name.localeCompare(b.name);
    });
  }

  return list;
}

function getPersonHistory(database, personId) {
  const db = getDb(database);
  ensureCaderninhoSchema(db);
  const todayYMD = getLocalDateStr();

  const person = db.prepare('SELECT * FROM caderninho_people WHERE id = ?').get(personId);
  if (!person) {
    throw new Error('Pessoa não encontrada no Caderninho.');
  }

  const allEntries = db
    .prepare('SELECT * FROM caderninho_entries WHERE person_id = ? ORDER BY created_at DESC, id DESC')
    .all(personId)
    .map(row => enrichEntryRow(row, todayYMD));

  const openEntries = allEntries.filter(e => (e.status === 'ABERTA' || e.status === 'PARCIAL') && e.remaining_amount > 0);
  const openBalance = round2(openEntries.reduce((acc, e) => acc + e.remaining_amount, 0));

  const movements = db
    .prepare('SELECT * FROM caderninho_movements WHERE person_id = ? ORDER BY created_at DESC, id DESC')
    .all(personId)
    .map(m => ({
      ...m,
      amount: round2(m.amount),
      details: safeParseJson(m.details_json, {})
    }));

  return {
    person,
    openBalance,
    exceededLimit: openBalance > CADERNINHO_SOFT_LIMIT,
    openEntries,
    allEntries,
    movements
  };
}

function createCaderninhoEntry(database, {
  personName,
  items = [],
  discount_value = 0,
  discount_includes_items = false,
  operator_name = 'Caixa',
  seller_id = null,
  seller_name = null,
  notes = ''
}) {
  const db = getDb(database);
  ensureCaderninhoSchema(db);

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Adicione ao menos um produto antes de anotar no Caderninho.');
  }

  const normalizedItems = [];
  let rawLinesTotal = 0;
  let perItemDiscounts = 0;
  let totalCrediarioSurcharge = 0;

  for (const it of items) {
    const qty = Math.max(1, parseFloat(it.quantity) || 1);
    const unitPrice = round2(it.unit_price ?? it.price ?? 0);
    const lineGross = round2(qty * unitPrice);
    const explicitTotal = it.total_price !== undefined ? round2(it.total_price) : lineGross;
    const itemDiscount = Math.max(0, round2(lineGross - explicitTotal));
    const unitCost = round2(it.unit_cost ?? 0);

    const credUnitPrice = resolveItemCrediarioUnitPrice(db, it, unitPrice);
    const lineSurcharge = Math.max(0, round2(qty * (credUnitPrice - unitPrice)));

    rawLinesTotal = round2(rawLinesTotal + lineGross);
    perItemDiscounts = round2(perItemDiscounts + itemDiscount);
    totalCrediarioSurcharge = round2(totalCrediarioSurcharge + lineSurcharge);

    normalizedItems.push({
      code: String(it.code || it.product_code || it.barcode || `CAD-${normalizedItems.length + 1}`).trim(),
      barcode: String(it.barcode || '').trim(),
      name: String(it.name || it.product_name || 'PRODUTO').trim(),
      quantity: qty,
      unit_price: unitPrice,
      cash_unit_price: unitPrice,
      crediario_unit_price: credUnitPrice,
      unit_cost: unitCost,
      discount: itemDiscount,
      total_price: Math.max(0, round2(lineGross - itemDiscount)),
      is_unregistered: it.is_unregistered ? 1 : 0
    });
  }

  const rawDiscount = Math.max(0, round2(discount_value));
  const totalDiscount = discount_includes_items
    ? Math.max(rawDiscount, perItemDiscounts)
    : round2(rawDiscount + perItemDiscounts);
  const totalAmount = Math.max(0, round2(rawLinesTotal - totalDiscount));
  const crediarioTotalAmount = round2(totalAmount + totalCrediarioSurcharge);

  if (totalAmount <= 0) {
    throw new Error('O valor total da anotação deve ser maior que zero.');
  }

  const opName = String(seller_name || operator_name || 'Caixa').trim() || 'Caixa';
  const entryId = `CAD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const movId = `CADM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  let result = null;
  const todayYMD = getLocalDateStr();
  db.transaction(() => {
    const person = findOrCreatePerson(db, personName);

    const prevOpenRows = db
      .prepare("SELECT * FROM caderninho_entries WHERE person_id = ? AND status IN ('ABERTA', 'PARCIAL') AND remaining_amount > 0")
      .all(person.id);
    const previousBalance = round2(
      prevOpenRows.reduce((acc, row) => acc + computeEffectiveEntryAmounts(row, todayYMD).effectiveRemaining, 0)
    );

    db.prepare(`
      INSERT INTO caderninho_entries (
        id, person_id, total_amount, discount_value, paid_amount, remaining_amount,
        status, items_json, operator_name, seller_id, seller_name, notes,
        crediario_rule_enabled, crediario_total_amount, crediario_surcharge, crediario_applied,
        created_at
      ) VALUES (
        ?, ?, ?, ?, 0, ?,
        'ABERTA', ?, ?, ?, ?, ?,
        1, ?, ?, 0,
        datetime('now', 'localtime')
      )
    `).run(
      entryId,
      person.id,
      totalAmount,
      totalDiscount,
      totalAmount,
      JSON.stringify(normalizedItems),
      opName,
      seller_id || null,
      seller_name || opName,
      String(notes || '').trim(),
      crediarioTotalAmount,
      totalCrediarioSurcharge
    );

    db.prepare(`
      INSERT INTO caderninho_movements (
        id, person_id, entry_id, type, amount, payment_method, sale_id, operator_name, reason, details_json, created_at
      ) VALUES (
        ?, ?, ?, 'ANOTACAO', ?, 'CADERNINHO', NULL, ?, ?, ?, datetime('now', 'localtime')
      )
    `).run(
      movId,
      person.id,
      entryId,
      totalAmount,
      opName,
      '',
      JSON.stringify({
        items: normalizedItems,
        discount_value: totalDiscount,
        crediario_total_amount: crediarioTotalAmount,
        crediario_surcharge: totalCrediarioSurcharge
      })
    );

    const newOpenBalance = round2(previousBalance + totalAmount);
    const entry = enrichEntryRow(
      db.prepare('SELECT * FROM caderninho_entries WHERE id = ?').get(entryId),
      todayYMD
    );

    result = {
      success: true,
      entry,
      person,
      previousBalance,
      newOpenBalance,
      exceededLimit: newOpenBalance > CADERNINHO_SOFT_LIMIT,
      softLimit: CADERNINHO_SOFT_LIMIT
    };
  })();

  return result;
}

function payCaderninho(database, {
  personId,
  mode = 'total',
  entryIds = [],
  amount,
  payment_method = 'DINHEIRO',
  amount_received = null,
  card_brand = null,
  installments = 1,
  operator_name = 'Caixa',
  seller_id = null,
  seller_name = null,
  registrarVendaFn = null
}) {
  const db = getDb(database);
  ensureCaderninhoSchema(db);

  const person = db.prepare('SELECT * FROM caderninho_people WHERE id = ?').get(personId);
  if (!person) throw new Error('Pessoa não encontrada no Caderninho.');

  const todayYMD = getLocalDateStr();
  const allOpenRaw = db
    .prepare("SELECT * FROM caderninho_entries WHERE person_id = ? AND status IN ('ABERTA', 'PARCIAL') AND remaining_amount > 0 ORDER BY created_at ASC, id ASC")
    .all(person.id);

  const allOpen = allOpenRaw
    .map(raw => ({
      ...raw,
      _eff: computeEffectiveEntryAmounts(raw, todayYMD)
    }))
    .filter(e => e._eff.effectiveRemaining > 0);

  if (allOpen.length === 0) {
    throw new Error(`${person.name} não possui anotações em aberto no Caderninho.`);
  }

  let targetMode = mode;
  let candidates = allOpen;

  if (mode === 'entries') {
    const idSet = new Set(Array.isArray(entryIds) ? entryIds.map(String) : []);
    candidates = allOpen.filter(e => idSet.has(String(e.id)));
    if (candidates.length === 0) {
      throw new Error('Selecione ao menos uma anotação em aberto para receber.');
    }
  }

  const candidateTotal = round2(candidates.reduce((acc, e) => acc + e._eff.effectiveRemaining, 0));
  let chargeAmount = candidateTotal;

  if (targetMode === 'partial') {
    const requested = round2(amount);
    if (requested <= 0) {
      throw new Error('Informe um valor válido maior que zero para o pagamento parcial.');
    }
    if (requested > candidateTotal + 0.01) {
      throw new Error(`Valor informado (R$ ${requested.toFixed(2)}) excede o saldo em aberto (R$ ${candidateTotal.toFixed(2)}).`);
    }
    chargeAmount = Math.min(requested, candidateTotal);
    if (Math.abs(chargeAmount - candidateTotal) <= 0.01) {
      targetMode = 'total';
      chargeAmount = candidateTotal;
    }
  }

  const settledEntries = [];
  let partialEntry = null;
  let leftoverAmount = 0;

  if (targetMode === 'total' || targetMode === 'entries') {
    settledEntries.push(...candidates);
  } else {
    let budget = chargeAmount;
    for (const e of candidates) {
      const rem = e._eff.effectiveRemaining;
      if (budget >= rem - 0.009) {
        settledEntries.push(e);
        budget = round2(budget - rem);
      } else if (budget > 0.009) {
        partialEntry = e;
        leftoverAmount = round2(budget);
        budget = 0;
        break;
      } else {
        break;
      }
    }
  }

  const saleItems = [];
  let totalDiscountForSale = 0;
  let totalCrediarioSurchargeApplied = 0;

  for (const e of settledEntries) {
    const applyCred = e._eff.shouldApplyCrediario;
    if (applyCred) {
      totalCrediarioSurchargeApplied = round2(totalCrediarioSurchargeApplied + e._eff.crediarioSurcharge);
    }
    const parsedItems = safeParseJson(e.items_json, []);
    for (const it of parsedItems) {
      const cashUnit = round2(it.cash_unit_price ?? it.unit_price ?? 0);
      const credUnit = round2(it.crediario_unit_price ?? cashUnit);
      const billedUnit = applyCred && credUnit > cashUnit ? credUnit : cashUnit;
      saleItems.push({
        code: it.code,
        barcode: it.barcode || '',
        product_name: it.name,
        name: it.name,
        quantity: Number(it.quantity || 1),
        unit_price: billedUnit,
        unit_cost: round2(it.unit_cost || 0),
        is_unregistered: it.is_unregistered ? 1 : 0
      });
    }
    totalDiscountForSale = round2(totalDiscountForSale + Number(e.discount_value || 0) + Number(e.paid_amount || 0));
  }

  if (partialEntry && leftoverAmount > 0.009) {
    saleItems.push({
      code: 'AVULSO-CADERNINHO',
      barcode: '*CADERNINHO',
      product_name: `PAGAMENTO PARCIAL CADERNINHO - ${person.name}`,
      name: `PAGAMENTO PARCIAL CADERNINHO - ${person.name}`,
      quantity: 1,
      unit_price: leftoverAmount,
      unit_cost: 0,
      is_unregistered: 1
    });
  }

  if (saleItems.length === 0) {
    throw new Error('Não foi possível montar os itens para faturamento no caixa.');
  }

  const pmNormalized = String(payment_method || 'DINHEIRO').toUpperCase();
  const receivedNum = amount_received !== null && amount_received !== undefined ? round2(amount_received) : chargeAmount;
  const changeAmount = pmNormalized === 'DINHEIRO' && receivedNum > chargeAmount
    ? round2(receivedNum - chargeAmount)
    : 0;

  const finalRegistrarVenda = registrarVendaFn || require('./erp-pos.service').registrarVenda;
  const opName = String(seller_name || operator_name || 'Caixa').trim() || 'Caixa';

  const execPay = db.transaction(() => {
    const saleResult = finalRegistrarVenda({
      items: saleItems,
      payments: [
        {
          payment_method: pmNormalized,
          amount: chargeAmount,
          change_amount: changeAmount,
          card_brand: card_brand || null,
          installments: parseInt(installments, 10) || 1
        }
      ],
      customer_name: person.name,
      discount_value: totalDiscountForSale,
      user_name: opName,
      seller_id: seller_id || opName,
      seller_name: seller_name || opName,
      notes: totalCrediarioSurchargeApplied > 0
        ? `Recebimento Caderninho (c/ acréscimo crediário R$ ${totalCrediarioSurchargeApplied.toFixed(2)}) - ${person.name}`
        : `Recebimento Caderninho - ${person.name}`
    });

    for (const e of settledEntries) {
      const effTotal = e._eff.effectiveTotal;
      const appliedFlag = e._eff.shouldApplyCrediario ? 1 : Number(e.crediario_applied || 0);
      db.prepare(`
        UPDATE caderninho_entries
        SET total_amount = ?,
            paid_amount = ?,
            remaining_amount = 0,
            crediario_applied = ?,
            status = 'PAGA',
            sale_id = ?,
            paid_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(effTotal, effTotal, appliedFlag, saleResult.sale_id, e.id);
    }

    if (partialEntry && leftoverAmount > 0.009) {
      const effTotal = partialEntry._eff.effectiveTotal;
      const appliedFlag = partialEntry._eff.shouldApplyCrediario ? 1 : Number(partialEntry.crediario_applied || 0);
      const nextPaid = round2(Number(partialEntry.paid_amount || 0) + leftoverAmount);
      const nextRem = Math.max(0, round2(effTotal - nextPaid));
      db.prepare(`
        UPDATE caderninho_entries
        SET total_amount = ?,
            paid_amount = ?,
            remaining_amount = ?,
            crediario_applied = ?,
            status = ?
        WHERE id = ?
      `).run(effTotal, nextPaid, nextRem, appliedFlag, nextRem <= 0.009 ? 'PAGA' : 'PARCIAL', partialEntry.id);
    }

    db.prepare("UPDATE caderninho_people SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(person.id);

    const movType = partialEntry || targetMode === 'entries' || targetMode === 'partial'
      ? (settledEntries.length === allOpen.length && !partialEntry ? 'PAGAMENTO_TOTAL' : 'PAGAMENTO_PARCIAL')
      : 'PAGAMENTO_TOTAL';

    const movId = `CADM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    db.prepare(`
      INSERT INTO caderninho_movements (
        id, person_id, entry_id, type, amount, payment_method, sale_id, operator_name, reason, details_json, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, '', ?, datetime('now', 'localtime')
      )
    `).run(
      movId,
      person.id,
      settledEntries[0]?.id || partialEntry?.id || null,
      movType,
      chargeAmount,
      pmNormalized,
      saleResult.sale_id,
      opName,
      JSON.stringify({
        settledEntryIds: settledEntries.map(e => e.id),
        partialEntryId: partialEntry?.id || null,
        partialApplied: leftoverAmount,
        crediarioSurchargeApplied: totalCrediarioSurchargeApplied
      })
    );

    const remRows = db
      .prepare("SELECT * FROM caderninho_entries WHERE person_id = ? AND status IN ('ABERTA', 'PARCIAL') AND remaining_amount > 0")
      .all(person.id);
    const remainingBalance = round2(
      remRows.reduce((acc, row) => acc + computeEffectiveEntryAmounts(row, todayYMD).effectiveRemaining, 0)
    );

    return {
      success: true,
      sale: saleResult,
      person,
      paidAmount: chargeAmount,
      changeAmount,
      remainingBalance,
      crediarioSurchargeApplied: totalCrediarioSurchargeApplied,
      settledEntryIds: settledEntries.map(e => e.id),
      partialEntryId: partialEntry?.id || null,
      hasRealProducts: settledEntries.length > 0,
      receiptItems: saleItems.map(it => ({
        name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: round2(it.quantity * it.unit_price)
      })),
      totalDiscountApplied: totalDiscountForSale
    };
  });

  return execPay();
}

function verifyAdminKey(database, accessKey) {
  const db = getDb(database);
  const keyStr = String(accessKey || '').trim();
  if (!keyStr) return false;

  const MASTER_KEY = process.env.MASTER_ACCESS_KEY || 'belafarma2024';
  if (security.verifyAccessKey(keyStr, MASTER_KEY)) {
    return true;
  }

  try {
    const users = db.prepare('SELECT id, name, role, accessKey, accessKeyHash FROM users').all();
    return users.some(
      u => security.isAdminUser(u) && security.verifyAccessKey(keyStr, u.accessKey, u.accessKeyHash)
    );
  } catch {
    return false;
  }
}

function cancelCaderninhoEntry(database, {
  entryId,
  reason = '',
  operator_name = 'Caixa',
  isAdmin = false,
  adminAccessKey = ''
}) {
  const db = getDb(database);
  ensureCaderninhoSchema(db);

  const entry = db.prepare('SELECT * FROM caderninho_entries WHERE id = ?').get(String(entryId));
  if (!entry) {
    throw new Error('Anotação não encontrada no Caderninho.');
  }
  if (entry.status === 'PAGA' || Number(entry.paid_amount || 0) > 0) {
    throw new Error('Não é possível cancelar uma anotação que já possui pagamento registrado.');
  }
  if (entry.status === 'CANCELADA') {
    throw new Error('Esta anotação já foi cancelada.');
  }

  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 3) {
    throw new Error('Informe o motivo do cancelamento.');
  }

  const todayYMD = getLocalDateStr();
  const entryYMD = String(entry.created_at || '').slice(0, 10);
  const isPreviousDay = Boolean(entryYMD && entryYMD < todayYMD);

  if (isPreviousDay && !isAdmin && !verifyAdminKey(db, adminAccessKey)) {
    const err = new Error('Anotações de dias anteriores exigem chave de Administrador para cancelamento.');
    err.code = 'ADMIN_KEY_REQUIRED';
    err.statusCode = 403;
    throw err;
  }

  const opName = String(operator_name || 'Caixa').trim() || 'Caixa';
  const movId = `CADM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  db.transaction(() => {
    db.prepare(`
      UPDATE caderninho_entries
      SET status = 'CANCELADA',
          remaining_amount = 0,
          cancelled_at = datetime('now', 'localtime'),
          cancelled_by = ?,
          cancel_reason = ?
      WHERE id = ?
    `).run(opName, cleanReason, entry.id);

    db.prepare(`
      INSERT INTO caderninho_movements (
        id, person_id, entry_id, type, amount, payment_method, sale_id, operator_name, reason, details_json, created_at
      ) VALUES (
        ?, ?, ?, 'CANCELAMENTO', ?, NULL, NULL, ?, ?, ?, datetime('now', 'localtime')
      )
    `).run(
      movId,
      entry.person_id,
      entry.id,
      round2(entry.total_amount),
      opName,
      cleanReason,
      JSON.stringify({ previousDay: isPreviousDay, authorizedByAdmin: isAdmin || isPreviousDay })
    );

    db.prepare("UPDATE caderninho_people SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(entry.person_id);
  })();

  return { success: true, cancelledEntryId: entry.id };
}

function createCaderninhoRouter(database = null, deps = {}) {
  const express = require('express');
  const router = express.Router();

  const resolveOpName = (req, body = {}) =>
    String(body.seller_name || req.headers['x-user-name'] || body.user_name || req.user?.name || 'Caixa').trim() ||
    'Caixa';

  router.get('/summary', (req, res) => {
    try {
      res.json({ success: true, summary: getCaderninhoSummary(database) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/people', (req, res) => {
    try {
      const { q = '', onlyOpen = '0' } = req.query;
      const people = listCaderninhoPeople(database, {
        q: String(q || ''),
        onlyOpen: onlyOpen === '1' || onlyOpen === 'true'
      });
      res.json({ success: true, people, summary: getCaderninhoSummary(database) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/people/:personId/history', (req, res) => {
    try {
      const hist = getPersonHistory(database, req.params.personId);
      res.json({ success: true, ...hist });
    } catch (err) {
      res.status(404).json({ success: false, error: err.message });
    }
  });

  router.post('/entries', (req, res) => {
    try {
      const body = req.body || {};
      const resEntry = createCaderninhoEntry(database, {
        personName: body.personName ?? body.person_name ?? body.name,
        items: body.items,
        discount_value: body.discount_value,
        discount_includes_items: Boolean(body.discount_includes_items),
        operator_name: resolveOpName(req, body),
        seller_id: body.seller_id || req.user?.id || null,
        seller_name: body.seller_name || resolveOpName(req, body),
        notes: body.notes
      });
      res.status(201).json({ ...resEntry, summary: getCaderninhoSummary(database) });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post('/pay', async (req, res) => {
    try {
      const body = req.body || {};
      const payResult = payCaderninho(database, {
        personId: body.personId ?? body.person_id,
        mode: body.mode || 'total',
        entryIds: body.entryIds || body.entry_ids || [],
        amount: body.amount,
        payment_method: body.payment_method || 'DINHEIRO',
        amount_received: body.amount_received,
        card_brand: body.card_brand || null,
        installments: body.installments || 1,
        operator_name: resolveOpName(req, body),
        seller_id: body.seller_id || req.user?.id || null,
        seller_name: body.seller_name || resolveOpName(req, body),
        registrarVendaFn: deps.registrarVendaFn || null
      });

      let danfe = null;
      let fiscalResult = null;
      if (body.emit_nfce && payResult.hasRealProducts && typeof deps.emitirCupomFiscalFn === 'function') {
        try {
          const isOfflineForced = Boolean(body.force_contingency || body.contingency);
          danfe = await deps.emitirCupomFiscalFn(payResult.sale.sale_id, {
            customer_cpf: body.customer_cpf || null,
            customer_name: payResult.person.name,
            contingency: isOfflineForced
          });
          if (danfe && danfe.non_fiscal) {
            fiscalResult = { success: true, non_fiscal: true };
          } else if (danfe) {
            fiscalResult = {
              success: true,
              chave: danfe.access_key || danfe.chave_acesso,
              nfe_number: danfe.nfe_number,
              serie: danfe.nfe_series,
              protocolo: danfe.protocol_number,
              url_qrcode: danfe.qr_code_url,
              status: danfe.fiscal_status
            };
          }
        } catch (fiscalErr) {
          fiscalResult = { success: false, error: fiscalErr.message };
        }
      }

      res.json({
        ...payResult,
        fiscal: fiscalResult,
        danfe: danfe || null,
        summary: getCaderninhoSummary(database)
      });

      if (payResult.hasRealProducts && typeof deps.sincronizarVendaDigifarmaFn === 'function') {
        setImmediate(async () => {
          try {
            await deps.sincronizarVendaDigifarmaFn(payResult.sale, fiscalResult);
          } catch (_) {}
        });
      }
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post('/entries/:entryId/cancel', (req, res) => {
    try {
      const body = req.body || {};
      const result = cancelCaderninhoEntry(database, {
        entryId: req.params.entryId,
        reason: body.reason,
        operator_name: resolveOpName(req, body),
        isAdmin: security.isAdminUser(req.user),
        adminAccessKey: body.adminAccessKey || body.admin_access_key || ''
      });
      res.json({ ...result, summary: getCaderninhoSummary(database) });
    } catch (err) {
      const codeNum = err.statusCode || (err.code === 'ADMIN_KEY_REQUIRED' ? 403 : 400);
      res.status(codeNum).json({ success: false, error: err.message, code: err.code || undefined });
    }
  });

  return router;
}

module.exports = {
  CADERNINHO_SOFT_LIMIT,
  CADERNINHO_OVERDUE_DAYS,
  getLocalDateStr,
  normalizePersonName,
  ensureCaderninhoSchema,
  findOrCreatePerson,
  getCaderninhoSummary,
  listCaderninhoPeople,
  getPersonHistory,
  createCaderninhoEntry,
  payCaderninho,
  verifyAdminKey,
  cancelCaderninhoEntry,
  createCaderninhoRouter
};
