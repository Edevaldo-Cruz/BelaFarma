/**
 * Belinha ERP - Controlled Medications Service
 * Gestão sanitária de medicamentos sob controle especial (Portaria 344/98 e RDC 20/2011).
 * Gerencia Livro de Receitas Retidas, Compradores, Prescritores e Perdas Sanitárias (SNGPC / VISA).
 */

const { db } = require('./erp-database');

// Inicializa tabelas SQLite do módulo sanitário
function initControlledTables() {
  // 1. Médicos / Prescritores
  db.prepare(`
    CREATE TABLE IF NOT EXISTS controlled_prescribers (
      id TEXT PRIMARY KEY,
      council_type TEXT NOT NULL DEFAULT 'CRM',
      council_number TEXT NOT NULL,
      council_uf TEXT NOT NULL DEFAULT 'MG',
      name TEXT NOT NULL,
      specialty TEXT,
      phone TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(council_type, council_number, council_uf)
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_prescribers_number ON controlled_prescribers (council_number)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_prescribers_name ON controlled_prescribers (name)`).run();

  // 2. Compradores de Medicamentos Controlados
  db.prepare(`
    CREATE TABLE IF NOT EXISTS controlled_buyers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cpf TEXT UNIQUE,
      rg TEXT,
      rg_issuer TEXT,
      rg_uf TEXT DEFAULT 'MG',
      address TEXT,
      phone TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_buyers_cpf ON controlled_buyers (cpf)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_buyers_name ON controlled_buyers (name)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_buyers_phone ON controlled_buyers (phone)`).run();

  // 3. Receitas Retidas vinculadas a Cupons de Venda
  db.prepare(`
    CREATE TABLE IF NOT EXISTS controlled_sales_recipes (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_code TEXT,
      product_name TEXT NOT NULL,
      recipe_type TEXT NOT NULL, -- 'AMARELA', 'AZUL', 'BRANCA', 'CREME'
      notification_number TEXT,
      prescription_date TEXT NOT NULL,
      buyer_id TEXT,
      buyer_name TEXT NOT NULL,
      buyer_cpf TEXT,
      buyer_rg TEXT,
      buyer_rg_issuer TEXT,
      buyer_address TEXT,
      buyer_phone TEXT,
      prescriber_id TEXT,
      prescriber_council TEXT DEFAULT 'CRM',
      prescriber_number TEXT,
      prescriber_uf TEXT DEFAULT 'MG',
      prescriber_name TEXT NOT NULL,
      patient_name TEXT,
      batch_lot TEXT,
      expiry_date TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_recipes_sale_id ON controlled_sales_recipes (sale_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_recipes_date ON controlled_sales_recipes (prescription_date)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_recipes_type ON controlled_sales_recipes (recipe_type)`).run();

  // 4. Perdas Sanitárias (Validade Vencida, Avarias, Recolhimento para SNGPC / VISA)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS controlled_sanitary_losses (
      id TEXT PRIMARY KEY,
      product_code TEXT,
      product_name TEXT NOT NULL,
      batch_lot TEXT,
      expiry_date TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      loss_reason_code INTEGER NOT NULL, -- 1: Vencimento/Validade, 2: Avaria/Quebra, 3: Recolhimento, 4: Apreensão, 5: Desvio
      loss_reason_label TEXT NOT NULL,
      loss_date TEXT NOT NULL,
      notes TEXT,
      pharmacist_name TEXT,
      pharmacist_crf TEXT,
      document_protocol TEXT,
      status TEXT NOT NULL DEFAULT 'REGISTRADO', -- 'REGISTRADO', 'CONCILIADO_SNGPC', 'INCINERADO'
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_losses_date ON controlled_sanitary_losses (loss_date)`).run();
}

// Executa na inicialização do serviço
initControlledTables();

/**
 * Classifica um produto quanto à exigência de receita e cor temática
 */
function classifyProduct(p) {
  if (!p) return { is_controlado: false, recipe_type: null, label: null, color_theme: null };

  const psico = String(p.psicotropico || p.PSICOTROPICO || '').toUpperCase().trim();
  const anti = String(p.antimicrobiano || p.ANTIMICROBIANO || '').toUpperCase().trim();
  const desc = String(p.name || p.PRODUTO || p.descricao || '').toUpperCase();
  const cat = String(p.category || p.categoria || '').toUpperCase();

  // 1. Notificação de Receita A (Amarela - Entorpecentes / Psicotrópicos A)
  // Listas A1, A2, A3 (ex: Morfina, Metilfenidato, Fentanil, Oxicodona)
  const patternA = /\b(A1|A2|A3)\b|\((A[1-3])\)|METILFENIDATO|RITALINA|MORFINA|DIMORF|FENTANIL|OXICODONA|METADONA|CODEINA 60MG/i;
  if (patternA.test(desc) || patternA.test(cat)) {
    return {
      is_controlado: true,
      recipe_type: 'AMARELA',
      label: 'Notificação de Receita A (Amarela)',
      substancia_classe: 'Entorpecente / Psicotrópico (Lista A)',
      color_theme: {
        bg: 'bg-amber-100',
        text: 'text-amber-900',
        border: 'border-amber-400',
        badge: 'bg-amber-400 text-amber-950 font-bold',
        row_bg: 'bg-amber-50/70 hover:bg-amber-100/70'
      }
    };
  }

  // 2. Notificação de Receita B (Azul - Psicotrópicos B / Anorexígenos)
  // Listas B1, B2 (ex: Clonazepam, Diazepam, Lorazepam, Alprazolam, Zolpidem, Sibutramina, Bromazepam)
  const patternB = /\b(B1|B2)\b|\((B[1-2])\)|CLONAZEPAM|RIVOTRIL|DIAZEPAM|ALPRAZOLAM|FRONTAL|BROMAZEPAM|LEXOTAN|LORAZEPAM|ZOLPIDEM|STILNOX|SIBUTRAMINA|MIDAZOLAM|CLOBAZAM|URBANYL|NITRAZEPAM/i;
  if (patternB.test(desc) || patternB.test(cat)) {
    return {
      is_controlado: true,
      recipe_type: 'AZUL',
      label: 'Notificação de Receita B (Azul)',
      substancia_classe: 'Psicotrópico / Ansiolítico (Lista B)',
      color_theme: {
        bg: 'bg-blue-100',
        text: 'text-blue-900',
        border: 'border-blue-400',
        badge: 'bg-blue-500 text-white font-bold',
        row_bg: 'bg-blue-50/70 hover:bg-blue-100/70'
      }
    };
  }

  // 3. Receita de Controle Especial em 2 vias (Branca Especial - Lista C1, C5)
  // Antidepressivos, Anticonvulsivantes, Anabolizantes (ex: Fluoxetina, Sertralina, Escitalopram, Pregabalina, Gabapentina)
  const patternC = /\b(C1|C2|C3|C4|C5)\b|\((C[1-5])\)|FLUOXETINA|SERTRALINA|ESCITALOPRAM|CITALOPRAM|PAROXETINA|VENLAFAXINA|DESVENLAFAXINA|DULOXETINA|AMITRIPTILINA|NORTRIPTILINA|CLOMIPRAMINA|PREGABALINA|GABAPENTINA|CARBAMAZEPINA|VALPROATO|DIVALPROATO|TOPIRAMATO|LAMOTRIGINA|RISPERIDONA|QUETIAPINA|OLANZAPINA|ARIPIPRAZOL|BUPROPIONA|TRAZODONA|LEVETIRACETAM|TESTOSTERONA|DURATESTON|OXANDROLONA/i;
  if (psico === 'S' || patternC.test(desc) || patternC.test(cat)) {
    return {
      is_controlado: true,
      recipe_type: 'BRANCA',
      label: 'Controle Especial 2 Vias (Branca)',
      substancia_classe: 'Controle Especial (Lista C1/C5)',
      color_theme: {
        bg: 'bg-slate-100',
        text: 'text-slate-800',
        border: 'border-slate-300',
        badge: 'bg-slate-600 text-white font-semibold',
        row_bg: 'bg-slate-50/70 hover:bg-slate-100/70'
      }
    };
  }

  // 4. Antimicrobianos / Antibióticos (Creme - RDC 20/2011)
  const patternAnti = /\b(AMOXICILINA|AZITROMICINA|CEFALEXINA|CIPROFLOXACINO|CLAVULANATO|LEVOFLOXACINO|SULFAMETOXAZOL|TRIMETOPRIMA|AMPICILINA|CLARITROMICINA|DOXICICLINA|METRONIDAZOL|NORFLOXACINO|CEFTRIAXONA|ERITROMICINA|GENTAMICINA|TOBRAMICINA|NEOMICINA|CLINDAMICINA|RIFAMICINA|OXACILINA|PENICILINA|FOSFOMICINA|NITROFURANTOINA|BACTRIM|CLAVULIN|ASTRO|NOVACILINA)\b/i;
  if (anti === 'S' || patternAnti.test(desc) || patternAnti.test(cat)) {
    return {
      is_controlado: true,
      recipe_type: 'CREME',
      label: 'Receita Antimicrobiano (Creme)',
      substancia_classe: 'Antimicrobiano (RDC 20/2011)',
      color_theme: {
        bg: 'bg-amber-50',
        text: 'text-amber-950',
        border: 'border-amber-300',
        badge: 'bg-amber-200 text-amber-950 font-semibold border border-amber-300',
        row_bg: 'bg-amber-50/40 hover:bg-amber-100/40'
      }
    };
  }

  return {
    is_controlado: false,
    recipe_type: null,
    label: null,
    substancia_classe: null,
    color_theme: null
  };
}

/**
 * Busca de Prescritores / Médicos para autocomplete rápido
 */
function searchPrescribers(query = '') {
  const q = String(query).trim();
  if (!q) {
    return db.prepare('SELECT * FROM controlled_prescribers ORDER BY name ASC LIMIT 30').all();
  }
  const term = `%${q}%`;
  return db.prepare(`
    SELECT * FROM controlled_prescribers 
    WHERE council_number LIKE ? OR name LIKE ? 
    ORDER BY name ASC LIMIT 30
  `).all(term, term);
}

/**
 * Salva ou atualiza Prescritor
 */
function upsertPrescriber(data) {
  const council_type = (data.council_type || 'CRM').toUpperCase().trim();
  const council_number = String(data.council_number || '').trim();
  const council_uf = (data.council_uf || 'MG').toUpperCase().trim();
  const name = String(data.name || '').trim();

  if (!council_number || !name) {
    throw new Error('Número de conselho e nome do prescritor são obrigatórios.');
  }

  const existing = db.prepare(`
    SELECT id FROM controlled_prescribers 
    WHERE council_type = ? AND council_number = ? AND council_uf = ?
  `).get(council_type, council_number, council_uf);

  const id = existing ? existing.id : `DOC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  db.prepare(`
    INSERT INTO controlled_prescribers (id, council_type, council_number, council_uf, name, specialty, phone, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(council_type, council_number, council_uf) DO UPDATE SET
      name = excluded.name,
      specialty = COALESCE(excluded.specialty, specialty),
      phone = COALESCE(excluded.phone, phone),
      updated_at = datetime('now', 'localtime')
  `).run(id, council_type, council_number, council_uf, name, data.specialty || null, data.phone || null);

  return { id, council_type, council_number, council_uf, name };
}

/**
 * Busca de Compradores para autocomplete rápido
 */
function searchBuyers(query = '') {
  const q = String(query).trim();
  if (!q) {
    return db.prepare('SELECT * FROM controlled_buyers ORDER BY name ASC LIMIT 30').all();
  }
  const term = `%${q}%`;
  return db.prepare(`
    SELECT * FROM controlled_buyers 
    WHERE cpf LIKE ? OR phone LIKE ? OR name LIKE ? OR rg LIKE ?
    ORDER BY name ASC LIMIT 30
  `).all(term, term, term, term);
}

/**
 * Salva ou atualiza Comprador
 */
function upsertBuyer(data) {
  const name = String(data.name || '').trim();
  const cpf = String(data.cpf || '').replace(/\D/g, '') || null;
  const rg = String(data.rg || '').trim() || null;
  const rg_issuer = String(data.rg_issuer || 'SSP').toUpperCase().trim();
  const rg_uf = String(data.rg_uf || 'MG').toUpperCase().trim();
  const address = String(data.address || '').trim() || null;
  const phone = String(data.phone || '').trim() || null;

  if (!name) {
    throw new Error('Nome do comprador é obrigatório.');
  }

  let existing = null;
  if (cpf) {
    existing = db.prepare('SELECT id FROM controlled_buyers WHERE cpf = ?').get(cpf);
  }

  const id = existing ? existing.id : `BUY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  if (cpf) {
    db.prepare(`
      INSERT INTO controlled_buyers (id, name, cpf, rg, rg_issuer, rg_uf, address, phone, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(cpf) DO UPDATE SET
        name = excluded.name,
        rg = COALESCE(excluded.rg, rg),
        rg_issuer = COALESCE(excluded.rg_issuer, rg_issuer),
        rg_uf = COALESCE(excluded.rg_uf, rg_uf),
        address = COALESCE(excluded.address, address),
        phone = COALESCE(excluded.phone, phone),
        updated_at = datetime('now', 'localtime')
    `).run(id, name, cpf, rg, rg_issuer, rg_uf, address, phone);
  } else {
    db.prepare(`
      INSERT INTO controlled_buyers (id, name, cpf, rg, rg_issuer, rg_uf, address, phone, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(id, name, cpf, rg, rg_issuer, rg_uf, address, phone);
  }

  return { id, name, cpf, rg, rg_issuer, rg_uf, address, phone };
}

/**
 * Grava as receitas retidas vinculadas a uma venda do PDV
 */
function recordSaleRecipes(saleId, recipesList = []) {
  if (!saleId || !Array.isArray(recipesList) || recipesList.length === 0) return [];

  const saved = [];
  const stmt = db.prepare(`
    INSERT INTO controlled_sales_recipes (
      id, sale_id, product_code, product_name, recipe_type, notification_number,
      prescription_date, buyer_id, buyer_name, buyer_cpf, buyer_rg, buyer_rg_issuer,
      buyer_address, buyer_phone, prescriber_id, prescriber_council, prescriber_number,
      prescriber_uf, prescriber_name, patient_name, batch_lot, expiry_date, quantity
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `);

  for (const r of recipesList) {
    const id = `REC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Salva ou atualiza prescritor na tabela local
    let prescriberId = r.prescriber_id;
    if (r.prescriber_number && r.prescriber_name) {
      try {
        const pres = upsertPrescriber({
          council_type: r.prescriber_council || 'CRM',
          council_number: r.prescriber_number,
          council_uf: r.prescriber_uf || 'MG',
          name: r.prescriber_name
        });
        prescriberId = pres.id;
      } catch (_) {}
    }

    // Salva ou atualiza comprador na tabela local
    let buyerId = r.buyer_id;
    if (r.buyer_name) {
      try {
        const buyer = upsertBuyer({
          name: r.buyer_name,
          cpf: r.buyer_cpf,
          rg: r.buyer_rg,
          rg_issuer: r.buyer_rg_issuer || 'SSP',
          rg_uf: r.buyer_rg_uf || 'MG',
          address: r.buyer_address,
          phone: r.buyer_phone
        });
        buyerId = buyer.id;
      } catch (_) {}
    }

    stmt.run(
      id,
      saleId,
      r.product_code || null,
      r.product_name || 'Medicamento Controlado',
      r.recipe_type || 'BRANCA',
      r.notification_number || null,
      r.prescription_date || new Date().toISOString().split('T')[0],
      buyerId || null,
      r.buyer_name || 'Não informado',
      r.buyer_cpf || null,
      r.buyer_rg || null,
      r.buyer_rg_issuer || null,
      r.buyer_address || null,
      r.buyer_phone || null,
      prescriberId || null,
      r.prescriber_council || 'CRM',
      r.prescriber_number || null,
      r.prescriber_uf || 'MG',
      r.prescriber_name || 'Prescritor',
      r.patient_name || null,
      r.batch_lot || null,
      r.expiry_date || null,
      parseFloat(r.quantity || 1)
    );

    saved.push({ id, sale_id: saleId, product_name: r.product_name });
  }

  return saved;
}

/**
 * Consulta o Livro de Receitas Retidas (Vendas)
 */
function listSaleRecipes({ dataInicio, dataFim, recipeType, saleId, search, limit = 100, offset = 0 } = {}) {
  let where = '1=1';
  const params = [];

  if (saleId) {
    where += ' AND r.sale_id = ?';
    params.push(saleId);
  }

  if (dataInicio && dataFim) {
    where += ' AND r.prescription_date BETWEEN ? AND ?';
    params.push(dataInicio, dataFim);
  } else if (dataInicio) {
    where += ' AND r.prescription_date = ?';
    params.push(dataInicio);
  }

  if (recipeType && recipeType !== 'TODOS') {
    where += ' AND r.recipe_type = ?';
    params.push(recipeType);
  }

  if (search) {
    const s = `%${search.trim()}%`;
    where += ` AND (
      r.product_name LIKE ? OR 
      r.buyer_name LIKE ? OR 
      r.buyer_cpf LIKE ? OR 
      r.prescriber_name LIKE ? OR 
      r.prescriber_number LIKE ? OR 
      r.notification_number LIKE ? OR
      r.batch_lot LIKE ? OR
      r.sale_id LIKE ?
    )`;
    params.push(s, s, s, s, s, s, s, s);
  }

  const sql = `
    SELECT r.*, s.sale_time, s.total_value, s.user_name as operator_name
    FROM controlled_sales_recipes r
    LEFT JOIN sales s ON r.sale_id = s.id
    WHERE ${where}
    ORDER BY r.created_at DESC, r.prescription_date DESC
    LIMIT ? OFFSET ?
  `;
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  return db.prepare(sql).all(...params);
}

/**
 * Registra Perda Sanitária (Vencimento, Avaria, Recolhimento) para VISA / SNGPC
 */
function recordSanitaryLoss(data) {
  const {
    product_code,
    product_name,
    batch_lot,
    expiry_date,
    quantity,
    loss_reason_code,
    notes,
    pharmacist_name,
    pharmacist_crf
  } = data;

  if (!product_name) throw new Error('Nome do medicamento é obrigatório.');
  if (!quantity || quantity <= 0) throw new Error('Quantidade da perda deve ser maior que zero.');

  const reasonLabels = {
    1: 'Validade Vencida',
    2: 'Avaria / Quebra / Derrame',
    3: 'Recolhimento pelo Fabricante',
    4: 'Apreensão Sanitária',
    5: 'Desvio / Perda de Processo'
  };

  const code = parseInt(loss_reason_code || 1, 10);
  const label = reasonLabels[code] || 'Perda Sanitária Geral';
  const id = `PERDA-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const protocol = `VISA-SNGPC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const lossDate = data.loss_date || new Date().toISOString().split('T')[0];

  db.prepare(`
    INSERT INTO controlled_sanitary_losses (
      id, product_code, product_name, batch_lot, expiry_date, quantity,
      loss_reason_code, loss_reason_label, loss_date, notes,
      pharmacist_name, pharmacist_crf, document_protocol, status
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, 'REGISTRADO'
    )
  `).run(
    id,
    product_code || null,
    product_name,
    batch_lot || null,
    expiry_date || null,
    parseFloat(quantity),
    code,
    label,
    lossDate,
    notes || null,
    pharmacist_name || 'Farmacêutico Responsável',
    pharmacist_crf || 'CRF-MG',
    protocol
  );

  return { id, document_protocol: protocol, product_name, quantity, loss_reason_label: label };
}

/**
 * Consulta histórico de Perdas Sanitárias
 */
function listSanitaryLosses({ dataInicio, dataFim, search, limit = 100, offset = 0 } = {}) {
  let where = '1=1';
  const params = [];

  if (dataInicio && dataFim) {
    where += ' AND loss_date BETWEEN ? AND ?';
    params.push(dataInicio, dataFim);
  } else if (dataInicio) {
    where += ' AND loss_date = ?';
    params.push(dataInicio);
  }

  if (search) {
    const s = `%${search.trim()}%`;
    where += ` AND (product_name LIKE ? OR batch_lot LIKE ? OR document_protocol LIKE ? OR notes LIKE ?)`;
    params.push(s, s, s, s);
  }

  const sql = `
    SELECT * FROM controlled_sanitary_losses
    WHERE ${where}
    ORDER BY loss_date DESC, created_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  return db.prepare(sql).all(...params);
}

/**
 * Exclui registro de perda sanitária
 */
function deleteSanitaryLoss(id) {
  return db.prepare('DELETE FROM controlled_sanitary_losses WHERE id = ?').run(id);
}

/**
 * Sincroniza compradores e médicos existentes a partir de clientes locais
 */
function syncInitialData() {
  try {
    const customers = db.prepare('SELECT * FROM customers WHERE cpf IS NOT NULL AND name IS NOT NULL').all();
    let imported = 0;
    for (const c of customers) {
      try {
        upsertBuyer({
          name: c.name,
          cpf: c.cpf,
          rg: c.rg,
          phone: c.phone,
          address: c.address
        });
        imported++;
      } catch (_) {}
    }
    return { success: true, imported };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  classifyProduct,
  searchPrescribers,
  upsertPrescriber,
  searchBuyers,
  upsertBuyer,
  recordSaleRecipes,
  listSaleRecipes,
  recordSanitaryLoss,
  listSanitaryLosses,
  deleteSanitaryLoss,
  syncInitialData
};

