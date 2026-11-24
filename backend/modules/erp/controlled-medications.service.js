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

  try {
    const bCols = db.pragma('table_info(controlled_buyers)').map(c => c.name);
    if (!bCols.includes('doc_type')) db.prepare(`ALTER TABLE controlled_buyers ADD COLUMN doc_type TEXT DEFAULT 'RG'`).run();
    if (!bCols.includes('doc_number')) db.prepare(`ALTER TABLE controlled_buyers ADD COLUMN doc_number TEXT`).run();
    if (!bCols.includes('neighborhood')) db.prepare(`ALTER TABLE controlled_buyers ADD COLUMN neighborhood TEXT`).run();
    if (!bCols.includes('city')) db.prepare(`ALTER TABLE controlled_buyers ADD COLUMN city TEXT DEFAULT 'JUIZ DE FORA'`).run();
    if (!bCols.includes('uf')) db.prepare(`ALTER TABLE controlled_buyers ADD COLUMN uf TEXT DEFAULT 'MG'`).run();
    if (!bCols.includes('digifarma_cliente_id')) db.prepare(`ALTER TABLE controlled_buyers ADD COLUMN digifarma_cliente_id TEXT`).run();
  } catch (err) {
    console.warn('[Controlled] Aviso ao migrar colunas de controlled_buyers:', err.message);
  }

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

  try {
    const rCols = db.pragma('table_info(controlled_sales_recipes)').map(c => c.name);
    if (!rCols.includes('registro_ms')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN registro_ms TEXT`).run();
    if (!rCols.includes('therapeutic_class')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN therapeutic_class TEXT`).run();
    if (!rCols.includes('notification_uf')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN notification_uf TEXT DEFAULT 'MG'`).run();
    if (!rCols.includes('prescribed_qty')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN prescribed_qty REAL DEFAULT 1`).run();
    if (!rCols.includes('medicine_use')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN medicine_use TEXT DEFAULT 'HUMANO'`).run();
    if (!rCols.includes('buyer_doc_type')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN buyer_doc_type TEXT DEFAULT 'RG'`).run();
    if (!rCols.includes('buyer_doc_number')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN buyer_doc_number TEXT`).run();
    if (!rCols.includes('buyer_doc_uf')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN buyer_doc_uf TEXT DEFAULT 'MG'`).run();
    if (!rCols.includes('buyer_neighborhood')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN buyer_neighborhood TEXT`).run();
    if (!rCols.includes('buyer_city')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN buyer_city TEXT DEFAULT 'JUIZ DE FORA'`).run();
    if (!rCols.includes('buyer_uf')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN buyer_uf TEXT DEFAULT 'MG'`).run();
    if (!rCols.includes('patient_age')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN patient_age INTEGER`).run();
    if (!rCols.includes('patient_age_unit')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN patient_age_unit TEXT DEFAULT 'ANOS'`).run();
    if (!rCols.includes('patient_sex')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN patient_sex TEXT`).run();
    if (!rCols.includes('cid')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN cid TEXT`).run();
    if (!rCols.includes('prolonged_use')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN prolonged_use INTEGER DEFAULT 0`).run();
    if (!rCols.includes('lots_json')) db.prepare(`ALTER TABLE controlled_sales_recipes ADD COLUMN lots_json TEXT`).run();
  } catch (err) {
    console.warn('[Controlled] Aviso ao migrar colunas de controlled_sales_recipes:', err.message);
  }

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
  const customRecipeType = String(p.recipe_type || '').toUpperCase().trim();
  const desc = String(p.name || p.PRODUTO || p.descricao || '').toUpperCase();
  const cat = String(p.category || p.categoria || '').toUpperCase();

  // Se o tipo de receita foi explicitamente definido no cadastro
  if (customRecipeType === 'AMARELA') {
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
  if (customRecipeType === 'AZUL') {
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
  if (customRecipeType === 'CREME' || anti === 'S' || anti === '1' || anti === 'TRUE') {
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
  if (customRecipeType === 'BRANCA' || psico === 'S' || psico === '1' || psico === 'TRUE') {
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

  // 0. EXCLUSÃO EXPLÍCITA: Medicamentos Isentos de Prescrição (MIPs) e comuns NUNCA são controlados
  // Ibuprofeno, Dipirona, Paracetamol, Malvona, etc., se não forem marcados no Digifarma como psicotrópico/antimicrobiano
  const isMIP = /\b(IBUPROFENO|PARACETAMOL|DIPIRONA|MALVONA|DORFLEX|NEOSALGINA|AAS|ASPIRINA|BUSCOPAN|SIMETICONA|LUFTAL|LORATADINA|CETIRIZINA|ACETILCISTEINA|AMBROXOL|BROMEXINA|DEXPANTENOL|BEPANTOL|HIDROCORTISONA|PASTILHA|COLIRIO|SORO|VITAMINA)\b/i.test(desc);
  if (isMIP && psico !== 'S' && anti !== 'S' && !customRecipeType) {
    return {
      is_controlado: false,
      recipe_type: null,
      label: null,
      substancia_classe: null,
      color_theme: null
    };
  }

  // Se o cadastro do Digifarma já definiu explicitamente 'N' para Psicotrópico e Antimicrobiano, respeita a configuração do Digifarma
  if (psico === 'N' && anti === 'N' && !customRecipeType) {
    return {
      is_controlado: false,
      recipe_type: null,
      label: null,
      substancia_classe: null,
      color_theme: null
    };
  }

  // 1. Notificação de Receita A (Amarela - Entorpecentes / Psicotrópicos A)
  // Listas A1, A2, A3 (ex: Morfina, Metilfenidato, Fentanil, Oxicodona, Codeína)
  const patternA = /\b(A[1-3])\b|\((A[1-3])\)|(\*A[1-3])|P344.*A[1-3]|METILFENIDATO|RITALINA|CONCERTA|VENVANSE|MORFINA|DIMORF|FENTANIL|OXICODONA|OXYCONTIN|METADONA|CODEINA|DOLANTINA|MEPERIDINA|DURAGESIC/i;
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
  const patternB = /\b(B[1-2])\b|\((B[1-2])\)|(\*B[1-2])|P344.*B[1-2]|CLONAZEPAM|RIVOTRIL|DIAZEPAM|VALIUM|ALPRAZOLAM|FRONTAL|BROMAZEPAM|LEXOTAN|LORAZEPAM|LORAX|ZOLPIDEM|STILNOX|SIBUTRAMINA|MIDAZOLAM|DORMONID|CLOBAZAM|URBANYL|NITRAZEPAM|FLUNITRAZEPAM|ROHYPNOL|FEMPROPOREX|ANFEPRAMONA|MAZINDOL|BROTIZOLAM|ESTAZOLAM|CLORDIAZEPOXIDO/i;
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
  // NOTA: Usamos \bBUP\b com delimitador de palavra para nunca casar com 'IBUPROFENO'
  const patternC = /\b(C[1-5])\b|\((C[1-5])\)|(\*C[1-5])|P344.*C[1-5]|FLUOXETINA|PROZAC|DAFORIN|SERTRALINA|ZOLOFT|ASSERT|TOLREST|ESCITALOPRAM|LEXAPRO|RECONTER|EXODUS|CITALOPRAM|CIPRAMIL|PAROXETINA|AROPAX|PONDERA|VENLAFAXINA|EFEXOR|ALENTHUS|DESVENLAFAXINA|PRISTIQ|DULOXETINA|CYMBALTA|VELIJA|AMITRIPTILINA|TRYPTANOL|NORTRIPTILINA|PAMELOR|CLOMIPRAMINA|ANAFRANIL|IMIPRAMINA|TOFRANIL|PREGABALINA|LYRICA|PREGAB|GABAPENTINA|NEURONTIN|CARBAMAZEPINA|TEGRETOL|VALPROATO|DEPAKENE|DIVALPROATO|DEPAKOTE|TOPIRAMATO|TOPAMAX|LAMOTRIGINA|LAMICTAL|RISPERIDONA|RISPERDAL|QUETIAPINA|SEROQUEL|OLANZAPINA|ZYPREXA|ARIPIPRAZOL|ABILIFY|BUPROPIONA|WELLBUTRIN|\bBUP\b|TRAZODONA|DONAREN|LEVETIRACETAM|KEPPRA|TESTOSTERONA|DURATESTON|NEBIDO|DEPOSTERON|OXANDROLONA|HALOPERIDOL|HALDOL|CLORPROMAZINA|AMPLICTIL|LEVOMEPROMAZINA|NEOZINE|TIAPRIDA|SULPIRIDA|EQUILID|PIMOZIDA|ORAP|ZUCLOPENTIXOL|CLOZAPINA|LEPONEX|LURASIDONA|LATUDA|LITIOCARB|CARBONATO DE LITIO|LITIO|CARBOLITIO|VORTIOXETINA|BRINTELLIX|AGOMELATINA|VALDOXAN|MIRTAZAPINA|REMERON|MENECLIN|TRAMADOL|TRAMAL|PACO|TYLEX/i;
  if (patternC.test(desc) || patternC.test(cat)) {
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
  const patternAnti = /AMOX|AMOXICIL|CLAVUL|CLAVU|AZITRO|CEFALEX|CIPRO|LEVOFLOX|SULFA|TRIMETOPRIM|AMPICIL|CLARITRO|DOXICICL|METRONIDAZOL|NORFLOX|CEFTRIAX|ERITROMIC|GENTAMIC|TOBRAMIC|NEOMIC|CLINDAMIC|RIFAMIC|OXACIL|PENICIL|FOSFOMIC|NITROFURANT|BACTRIM|CLAVULIN|ASTRO|NOVACILINA|AMOXIL|ROCEFIN|ZITROMAX|MACRODANTINA|KEFLEX/i;
  if (patternAnti.test(desc) || patternAnti.test(cat)) {
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

function formatRegistroMs(raw) {
  const str = String(raw || '').trim();
  if (!str) return '';
  if (/^isento$/i.test(str)) return 'ISENTO';
  const digits = str.replace(/\D/g, '');
  if (digits.length === 13) {
    return `${digits.slice(0, 1)}.${digits.slice(1, 5)}.${digits.slice(5, 9)}.${digits.slice(9, 12)}-${digits.slice(12, 13)}`;
  }
  return str;
}

function formatFirebirdDateIso(val) {
  if (!val) return '';
  try {
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch (_) {
    return '';
  }
}

function formatBuyerPhone(ddd, num) {
  const cleanNum = String(num || '').trim();
  if (!cleanNum) return '';
  const digits = cleanNum.replace(/\D/g, '');
  const cleanDdd = String(ddd || '').replace(/\D/g, '');
  if (cleanDdd && digits.length > 0 && digits.length <= 9) {
    return `(${cleanDdd}) ${cleanNum}`;
  }
  return cleanNum;
}

function deriveTherapeuticClass(localProd, fbProd, classification) {
  const anti = String(fbProd?.ANTIMICROBIANO || localProd?.antimicrobiano || '').toUpperCase().trim();
  const psico = String(fbProd?.PSICOTROPICO || localProd?.psicotropico || '').toUpperCase().trim();
  if (anti === 'S' || classification?.recipe_type === 'CREME') return 'ANTIMICROBIANO';
  if (classification?.recipe_type === 'AMARELA') return 'ENTORPECENTE / LISTA A';
  if (classification?.recipe_type === 'AZUL') return 'PSICOTRÓPICO / LISTA B';
  if (psico === 'S' || classification?.recipe_type === 'BRANCA') return 'CONTROLE ESPECIAL (C1/C5)';
  if (classification?.substancia_classe) return String(classification.substancia_classe).toUpperCase();
  return 'CONTROLADO';
}

/**
 * Consulta Registro MS, Classe Terapêutica e Lotes disponíveis (Digifarma Firebird + fallback histórico local)
 */
async function getProductLotsAndMs(productCode) {
  const cleanCode = String(productCode || '').trim().replace(/\.0+$/, '');
  const localProd = cleanCode
    ? db.prepare(`SELECT * FROM products WHERE code = ? OR barcode = ? LIMIT 1`).get(cleanCode, cleanCode)
    : null;
  const effectiveCode = localProd?.code ? String(localProd.code).trim().replace(/\.0+$/, '') : cleanCode;

  let fbProd = null;
  let fbLots = [];
  let source = 'LOCAL';

  if (/^\d+$/.test(effectiveCode)) {
    const prodId = Number(effectiveCode);
    if (prodId > 0 && prodId <= 2147483647) {
      try {
        const { queryDigifarma } = require('../../services/digifarma.service');
        const prodRows = await queryDigifarma(`
          SELECT FIRST 1
            p.PRODUTO_ID, p.PRODUTO, p.APRESENTACAO,
            COALESCE(NULLIF(TRIM(p.REGISTRO_MS), ''), ps.REGISTRO_MS) AS REGISTRO_MS,
            p.PSICOTROPICO, p.ANTIMICROBIANO, p.CLASS_MED,
            COALESCE(p.LISTA, ps.LISTA) AS LISTA
          FROM PRODUTOS p
          LEFT JOIN PSICOTROPICOS ps ON ps.PRODUTO_ID = p.PRODUTO_ID
          WHERE p.PRODUTO_ID = ?
        `, [prodId], 8000);
        if (prodRows && prodRows.length > 0) {
          fbProd = prodRows[0];
          source = 'FIREBIRD';
        }
        const lotsRows = await queryDigifarma(`
          SELECT LOTE_ID, PRODUTO_ID, NUM_LOTE, LOTE_QUANTIDADE, LOTE_FABRICACAO, LOTE_VENCIMENTO, REGISTRO_MS, ENTRADA_SAIDA
          FROM LOTES
          WHERE PRODUTO_ID = ?
            AND COALESCE(ENTRADA_SAIDA, 'E') = 'E'
            AND COALESCE(LOTE_QUANTIDADE, 0) > 0
          ORDER BY LOTE_VENCIMENTO ASC, LOTE_ID DESC
        `, [prodId], 6000);
        if (Array.isArray(lotsRows)) {
          fbLots = lotsRows;
          if (lotsRows.length > 0) source = 'FIREBIRD';
        }
      } catch (fbErr) {
        // Firebird offline ou timeout — segue graciosamente com fallback local
      }
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const mappedLots = fbLots
    .filter(l => String(l.NUM_LOTE || '').trim() !== '')
    .map(l => {
      const mfg = formatFirebirdDateIso(l.LOTE_FABRICACAO);
      const exp = formatFirebirdDateIso(l.LOTE_VENCIMENTO);
      return {
        lote_id: l.LOTE_ID ?? null,
        batch_lot: String(l.NUM_LOTE || '').trim(),
        available_qty: Number(l.LOTE_QUANTIDADE || 0),
        manufacture_date: mfg,
        expiry_date: exp,
        is_expired: Boolean(exp && exp < todayIso),
        registro_ms: formatRegistroMs(l.REGISTRO_MS),
        source: 'FIREBIRD'
      };
    });

  if (mappedLots.length === 0 && effectiveCode) {
    try {
      const recent = db.prepare(`
        SELECT DISTINCT batch_lot, expiry_date
        FROM controlled_sales_recipes
        WHERE product_code = ? AND batch_lot IS NOT NULL AND TRIM(batch_lot) != ''
        ORDER BY created_at DESC
        LIMIT 10
      `).all(effectiveCode);
      for (const r of recent) {
        const exp = r.expiry_date ? String(r.expiry_date).slice(0, 10) : '';
        mappedLots.push({
          lote_id: null,
          batch_lot: String(r.batch_lot).trim(),
          available_qty: null,
          manufacture_date: '',
          expiry_date: exp,
          is_expired: Boolean(exp && exp < todayIso),
          registro_ms: '',
          source: 'HISTORICO'
        });
      }
      if (recent.length > 0) source = 'HISTORICO';
    } catch (_) {}
  }

  const mergedForClassify = {
    ...(localProd || {}),
    psicotropico: fbProd?.PSICOTROPICO || localProd?.psicotropico,
    antimicrobiano: fbProd?.ANTIMICROBIANO || localProd?.antimicrobiano
  };
  const classification = classifyProduct(mergedForClassify);

  let registroMs = formatRegistroMs(fbProd?.REGISTRO_MS);
  if (!registroMs) {
    const lotWithMs = mappedLots.find(l => l.registro_ms && l.registro_ms !== 'ISENTO');
    if (lotWithMs) registroMs = lotWithMs.registro_ms;
  }

  return {
    product_code: effectiveCode,
    product_name: fbProd?.PRODUTO ? String(fbProd.PRODUTO).trim() : (localProd?.name || ''),
    registro_ms: registroMs,
    therapeutic_class: deriveTherapeuticClass(localProd, fbProd, classification),
    recipe_type: classification.recipe_type || localProd?.recipe_type || null,
    source,
    lots: mappedLots
  };
}

/**
 * Busca de Prescritores / Médicos para autocomplete rápido (SQLite local)
 */
function searchPrescribers(query = '') {
  const q = String(query || '').trim();
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
 * Busca unificada de Prescritores (SQLite local + histórico Digifarma VENDAS_PSICOTROPICOS)
 */
async function searchPrescribersUnified(query = '') {
  const local = searchPrescribers(query);
  const q = String(query || '').trim();
  const seen = new Set();
  const merged = [];

  for (const row of local) {
    const key = `${String(row.council_type || 'CRM').toUpperCase()}|${String(row.council_number || '').trim()}|${String(row.council_uf || 'MG').toUpperCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...row, source: 'LOCAL' });
    }
  }

  if (q.length >= 2) {
    try {
      const { queryDigifarma } = require('../../services/digifarma.service');
      const qUpper = q.toUpperCase();
      const digits = q.replace(/\D/g, '');
      const numFilter = digits || qUpper;
      const fbRows = await queryDigifarma(`
        SELECT FIRST 25 DISTINCT CONSELHO_TIPO, CONSELHO_NUMERO, CONSELHO_UF, PRESCRITOR
        FROM VENDAS_PSICOTROPICOS
        WHERE PRESCRITOR IS NOT NULL
          AND TRIM(PRESCRITOR) <> ''
          AND (UPPER(PRESCRITOR) CONTAINING ? OR CONSELHO_NUMERO STARTING WITH ?)
      `, [qUpper, numFilter], 5000);

      for (const r of fbRows || []) {
        const councilType = String(r.CONSELHO_TIPO || 'CRM').trim().toUpperCase() || 'CRM';
        const councilNumber = String(r.CONSELHO_NUMERO || '').trim();
        const councilUf = String(r.CONSELHO_UF || 'MG').trim().toUpperCase() || 'MG';
        const name = String(r.PRESCRITOR || '').trim();
        if (!name || !councilNumber) continue;
        const key = `${councilType}|${councilNumber}|${councilUf}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({
          id: `DG-DOC-${councilType}-${councilNumber}-${councilUf}`,
          council_type: councilType,
          council_number: councilNumber,
          council_uf: councilUf,
          name,
          specialty: null,
          source: 'DIGIFARMA'
        });
      }
    } catch (_) {}
  }

  return merged.slice(0, 30);
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

function normalizeLocalBuyerRow(b) {
  return {
    id: b.id,
    code: b.digifarma_cliente_id ? String(b.digifarma_cliente_id) : '',
    digifarma_cliente_id: b.digifarma_cliente_id ? String(b.digifarma_cliente_id) : null,
    name: b.name || '',
    cpf: b.cpf || '',
    rg: b.rg || '',
    doc_type: b.doc_type || (b.rg ? 'RG' : (b.cpf ? 'CPF' : 'RG')),
    doc_number: b.doc_number || b.rg || b.cpf || '',
    rg_issuer: b.rg_issuer || 'SSP',
    rg_uf: b.rg_uf || 'MG',
    address: b.address || '',
    neighborhood: b.neighborhood || '',
    city: b.city || 'JUIZ DE FORA',
    uf: b.uf || 'MG',
    phone: b.phone || '',
    sex: '',
    source: 'CONTROLLED_BUYERS'
  };
}

/**
 * Busca de Compradores locais para autocomplete rápido (SQLite local)
 */
function searchBuyers(query = '') {
  const q = String(query || '').trim();
  if (!q) {
    return db.prepare('SELECT * FROM controlled_buyers ORDER BY name ASC LIMIT 30').all().map(normalizeLocalBuyerRow);
  }
  const term = `%${q}%`;
  return db.prepare(`
    SELECT * FROM controlled_buyers 
    WHERE cpf LIKE ? OR phone LIKE ? OR name LIKE ? OR rg LIKE ? OR doc_number LIKE ? OR digifarma_cliente_id = ?
    ORDER BY name ASC LIMIT 30
  `).all(term, term, term, term, term, q).map(normalizeLocalBuyerRow);
}

/**
 * Busca unificada de Compradores / Clientes (controlled_buyers + Digifarma CLIENTES + customers SQLite)
 */
async function searchBuyersUnified(query = '') {
  const q = String(query || '').trim();
  const localBuyers = searchBuyers(q);

  if (!q) {
    return localBuyers;
  }

  const results = [];
  const seenKeys = new Set();
  const pushUnique = (item) => {
    const cleanCpf = String(item.cpf || '').replace(/\D/g, '');
    const dgKey = item.digifarma_cliente_id ? `DG:${item.digifarma_cliente_id}` : '';
    const nameKey = `NM:${String(item.name || '').trim().toUpperCase()}|${String(item.doc_number || '').trim().toUpperCase()}`;
    if (dgKey && seenKeys.has(dgKey)) return;
    if (cleanCpf.length === 11 && seenKeys.has(`CPF:${cleanCpf}`)) return;
    if (seenKeys.has(nameKey)) return;
    if (dgKey) seenKeys.add(dgKey);
    if (cleanCpf.length === 11) seenKeys.add(`CPF:${cleanCpf}`);
    seenKeys.add(nameKey);
    results.push(item);
  };

  for (const lb of localBuyers) pushUnique(lb);

  // Consulta ao vivo na tabela CLIENTES do Digifarma
  try {
    const { queryDigifarma } = require('../../services/digifarma.service');
    const digits = q.replace(/\D/g, '');
    const isPureNum = /^\d+$/.test(q);
    const numVal = isPureNum ? Number(q) : NaN;
    const canBeId = !isNaN(numVal) && numVal > 0 && numVal <= 2147483647;
    const qUpper = q.toUpperCase();

    let whereSql = '';
    let orderSql = 'ORDER BY CLIENTE ASC';
    let params = [];
    if (canBeId) {
      whereSql = `(CLIENTE_ID = ? OR CLI_CPF CONTAINING ? OR CLI_RG CONTAINING ? OR CLI_CELULAR CONTAINING ? OR CLI_TELEFONE CONTAINING ?)`;
      orderSql = `ORDER BY CASE WHEN CLIENTE_ID = ? THEN 0 ELSE 1 END ASC, CLIENTE ASC`;
      params = [numVal, q, q, q, q, numVal];
    } else if (digits.length >= 3) {
      whereSql = `(CLI_CPF CONTAINING ? OR CLI_RG CONTAINING ? OR CLI_CELULAR CONTAINING ? OR CLI_TELEFONE CONTAINING ? OR UPPER(CLIENTE) CONTAINING ?)`;
      params = [digits, digits, digits, digits, qUpper];
    } else if (q.length >= 2) {
      whereSql = `(UPPER(CLIENTE) CONTAINING ? OR CLI_CPF CONTAINING ? OR CLI_RG CONTAINING ?)`;
      params = [qUpper, qUpper, qUpper];
    }

    if (whereSql) {
      const fbClientes = await queryDigifarma(`
        SELECT FIRST 15
          CLIENTE_ID, CLIENTE, CLI_CPF, CLI_RG,
          CLI_ENDERECO, CLI_NUMERO, CLI_COMPLEMENTO, CLI_BAIRRO, CLI_CIDADE, CLI_UF,
          DDD_CELULAR, CLI_CELULAR, DDD_TELEFONE, CLI_TELEFONE, CLI_SEXO
        FROM CLIENTES
        WHERE ${whereSql} AND COALESCE(CLI_INATIVO, 'N') <> 'S'
        ${orderSql}
      `, params, 5000);

      for (const c of fbClientes || []) {
        const cid = String(c.CLIENTE_ID).trim().replace(/\.0+$/, '');
        const cleanRg = String(c.CLI_RG || '').trim();
        const cleanCpf = String(c.CLI_CPF || '').trim();
        const streetParts = [c.CLI_ENDERECO, c.CLI_NUMERO, c.CLI_COMPLEMENTO]
          .map(v => String(v || '').trim())
          .filter(Boolean);
        const phone = formatBuyerPhone(c.DDD_CELULAR, c.CLI_CELULAR) || formatBuyerPhone(c.DDD_TELEFONE, c.CLI_TELEFONE);
        const rawSex = String(c.CLI_SEXO || '').trim().toUpperCase();
        const sex = rawSex === 'M' || rawSex === 'F' ? rawSex : '';
        pushUnique({
          id: `DG-${cid}`,
          code: cid,
          digifarma_cliente_id: cid,
          name: String(c.CLIENTE || '').trim(),
          cpf: cleanCpf,
          rg: cleanRg,
          doc_type: cleanRg ? 'RG' : (cleanCpf ? 'CPF' : 'RG'),
          doc_number: cleanRg || cleanCpf,
          rg_issuer: 'SSP',
          rg_uf: String(c.CLI_UF || 'MG').trim().toUpperCase() || 'MG',
          address: streetParts.join(', '),
          neighborhood: String(c.CLI_BAIRRO || '').trim(),
          city: String(c.CLI_CIDADE || 'JUIZ DE FORA').trim() || 'JUIZ DE FORA',
          uf: String(c.CLI_UF || 'MG').trim().toUpperCase() || 'MG',
          phone,
          sex,
          source: 'DIGIFARMA'
        });
      }
    }
  } catch (_) {}

  // Também consulta clientes cadastrados localmente em customers
  try {
    const term = `%${q}%`;
    const localCusts = db.prepare(`
      SELECT id, digifarma_id, name, cpf, phone, address
      FROM customers
      WHERE id = ? OR digifarma_id = ? OR cpf LIKE ? OR phone LIKE ? OR name LIKE ?
      ORDER BY name ASC
      LIMIT 15
    `).all(q, q, term, term, term);
    for (const c of localCusts) {
      const cleanCpf = String(c.cpf || '').trim();
      const dgId = c.digifarma_id ? String(c.digifarma_id).trim().replace(/\.0+$/, '') : '';
      pushUnique({
        id: c.id,
        code: dgId || String(c.id),
        digifarma_cliente_id: dgId || null,
        name: c.name || '',
        cpf: cleanCpf,
        rg: '',
        doc_type: cleanCpf ? 'CPF' : 'RG',
        doc_number: cleanCpf,
        rg_issuer: 'SSP',
        rg_uf: 'MG',
        address: c.address || '',
        neighborhood: '',
        city: 'JUIZ DE FORA',
        uf: 'MG',
        phone: c.phone || '',
        sex: '',
        source: 'CUSTOMERS'
      });
    }
  } catch (_) {}

  results.sort((a, b) => {
    const aExact = String(a.code || '') === q || String(a.digifarma_cliente_id || '') === q ? 0 : 1;
    const bExact = String(b.code || '') === q || String(b.digifarma_cliente_id || '') === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return 0;
  });

  return results.slice(0, 25);
}

/**
 * Salva ou atualiza Comprador
 */
function upsertBuyer(data) {
  const name = String(data.name || '').trim();
  const doc_type = String(data.doc_type || 'RG').trim().toUpperCase();
  const doc_number = String(data.doc_number || '').trim() || null;
  const cpfFromDoc = doc_type === 'CPF' && doc_number ? doc_number.replace(/\D/g, '') : '';
  const cpf = String(data.cpf || '').replace(/\D/g, '') || (cpfFromDoc.length === 11 ? cpfFromDoc : null);
  const rg = String(data.rg || '').trim() || (doc_type !== 'CPF' ? doc_number : null);
  const rg_issuer = String(data.rg_issuer || 'SSP').toUpperCase().trim();
  const rg_uf = String(data.rg_uf || 'MG').toUpperCase().trim();
  const address = String(data.address || '').trim() || null;
  const neighborhood = String(data.neighborhood || '').trim() || null;
  const city = String(data.city || 'JUIZ DE FORA').trim() || 'JUIZ DE FORA';
  const uf = String(data.uf || 'MG').toUpperCase().trim() || 'MG';
  const phone = String(data.phone || '').trim() || null;
  const digifarma_cliente_id = data.digifarma_cliente_id ? String(data.digifarma_cliente_id).trim() : null;

  if (!name) {
    throw new Error('Nome do comprador é obrigatório.');
  }

  let existing = null;
  if (cpf) {
    existing = db.prepare('SELECT id FROM controlled_buyers WHERE cpf = ?').get(cpf);
  } else if (digifarma_cliente_id) {
    existing = db.prepare('SELECT id FROM controlled_buyers WHERE digifarma_cliente_id = ?').get(digifarma_cliente_id);
  }

  const id = existing ? existing.id : `BUY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  if (cpf) {
    db.prepare(`
      INSERT INTO controlled_buyers (
        id, name, cpf, rg, rg_issuer, rg_uf, address, phone,
        doc_type, doc_number, neighborhood, city, uf, digifarma_cliente_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(cpf) DO UPDATE SET
        name = excluded.name,
        rg = COALESCE(excluded.rg, rg),
        rg_issuer = COALESCE(excluded.rg_issuer, rg_issuer),
        rg_uf = COALESCE(excluded.rg_uf, rg_uf),
        address = COALESCE(excluded.address, address),
        phone = COALESCE(excluded.phone, phone),
        doc_type = COALESCE(excluded.doc_type, doc_type),
        doc_number = COALESCE(excluded.doc_number, doc_number),
        neighborhood = COALESCE(excluded.neighborhood, neighborhood),
        city = COALESCE(excluded.city, city),
        uf = COALESCE(excluded.uf, uf),
        digifarma_cliente_id = COALESCE(excluded.digifarma_cliente_id, digifarma_cliente_id),
        updated_at = datetime('now', 'localtime')
    `).run(
      id, name, cpf, rg, rg_issuer, rg_uf, address, phone,
      doc_type, doc_number, neighborhood, city, uf, digifarma_cliente_id
    );
  } else if (existing) {
    db.prepare(`
      UPDATE controlled_buyers SET
        name = ?,
        rg = COALESCE(?, rg),
        rg_issuer = COALESCE(?, rg_issuer),
        rg_uf = COALESCE(?, rg_uf),
        address = COALESCE(?, address),
        phone = COALESCE(?, phone),
        doc_type = COALESCE(?, doc_type),
        doc_number = COALESCE(?, doc_number),
        neighborhood = COALESCE(?, neighborhood),
        city = COALESCE(?, city),
        uf = COALESCE(?, uf),
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(name, rg, rg_issuer, rg_uf, address, phone, doc_type, doc_number, neighborhood, city, uf, id);
  } else {
    db.prepare(`
      INSERT INTO controlled_buyers (
        id, name, cpf, rg, rg_issuer, rg_uf, address, phone,
        doc_type, doc_number, neighborhood, city, uf, digifarma_cliente_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(
      id, name, cpf, rg, rg_issuer, rg_uf, address, phone,
      doc_type, doc_number, neighborhood, city, uf, digifarma_cliente_id
    );
  }

  return {
    id,
    name,
    cpf,
    rg,
    doc_type,
    doc_number,
    rg_issuer,
    rg_uf,
    address,
    neighborhood,
    city,
    uf,
    phone,
    digifarma_cliente_id
  };
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
      prescriber_uf, prescriber_name, patient_name, batch_lot, expiry_date, quantity,
      registro_ms, therapeutic_class, notification_uf, prescribed_qty, medicine_use,
      buyer_doc_type, buyer_doc_number, buyer_doc_uf, buyer_neighborhood, buyer_city, buyer_uf,
      patient_age, patient_age_unit, patient_sex, cid, prolonged_use, lots_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
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
          rg: r.buyer_rg || (r.buyer_doc_type !== 'CPF' ? r.buyer_doc_number : undefined),
          doc_type: r.buyer_doc_type || 'RG',
          doc_number: r.buyer_doc_number || r.buyer_rg || r.buyer_cpf,
          rg_issuer: r.buyer_rg_issuer || 'SSP',
          rg_uf: r.buyer_doc_uf || 'MG',
          address: r.buyer_address,
          neighborhood: r.buyer_neighborhood,
          city: r.buyer_city,
          uf: r.buyer_uf,
          phone: r.buyer_phone,
          digifarma_cliente_id: r.buyer_code || r.digifarma_cliente_id || undefined
        });
        buyerId = buyer.id;
      } catch (_) {}
    }

    const selectedLots = Array.isArray(r.selected_lots) ? r.selected_lots : null;
    const derivedBatchLot = r.batch_lot || (selectedLots && selectedLots.length > 0
      ? selectedLots.map(l => l.batch_lot).filter(Boolean).join(', ')
      : null);
    const derivedExpiry = r.expiry_date || (selectedLots && selectedLots.length > 0
      ? selectedLots.map(l => l.expiry_date).filter(Boolean)[0] || null
      : null);

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
      r.buyer_rg || r.buyer_doc_number || null,
      r.buyer_rg_issuer || null,
      r.buyer_address || null,
      r.buyer_phone || null,
      prescriberId || null,
      r.prescriber_council || 'CRM',
      r.prescriber_number || null,
      r.prescriber_uf || 'MG',
      r.prescriber_name || 'Prescritor',
      r.patient_name || null,
      derivedBatchLot,
      derivedExpiry,
      parseFloat(r.quantity || 1),
      r.registro_ms || null,
      r.therapeutic_class || null,
      r.notification_uf || r.prescriber_uf || 'MG',
      parseFloat(r.prescribed_qty || r.quantity || 1),
      r.medicine_use || 'HUMANO',
      r.buyer_doc_type || 'RG',
      r.buyer_doc_number || r.buyer_rg || r.buyer_cpf || null,
      r.buyer_doc_uf || 'MG',
      r.buyer_neighborhood || null,
      r.buyer_city || 'JUIZ DE FORA',
      r.buyer_uf || 'MG',
      r.patient_age !== undefined && r.patient_age !== '' && r.patient_age !== null ? parseInt(r.patient_age, 10) : null,
      r.patient_age_unit || 'ANOS',
      r.patient_sex || null,
      r.cid || null,
      r.prolonged_use ? 1 : 0,
      selectedLots ? JSON.stringify(selectedLots) : null
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
  getProductLotsAndMs,
  searchPrescribers,
  searchPrescribersUnified,
  upsertPrescriber,
  searchBuyers,
  searchBuyersUnified,
  upsertBuyer,
  recordSaleRecipes,
  listSaleRecipes,
  recordSanitaryLoss,
  listSanitaryLosses,
  deleteSanitaryLoss,
  syncInitialData
};

