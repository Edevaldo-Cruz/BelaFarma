/**
 * backend/services/crediario-unified.service.js
 *
 * Motor Unificado do Crediário BelaFarma:
 * - Sincronização híbrida com o Digifarma (CLIENTES, FICHARIO + PRODUTOS, CONTAS_RECEBIDAS)
 * - Motor de cálculo de vencimentos flexíveis (automático ou dia fixo) + juros/multa/carência/isenção
 * - Extrato Simples (marco "Conta Zerada" para idosos) & Extrato Completo (Auditoria estilo banco)
 * - Geração de PIX BR Code, Templates WhatsApp e Cupom Térmico 80mm / A4
 */

const crypto = require('crypto');
const { queryDigifarma } = require('./digifarma.service');
const { generatePixBrCode } = require('../utils/pix-brcode');

const CONFIG_KEY = 'crediario_unified_config';
const CREDIARIO_CUTOFF_DATE = '2025-10-01';

const DEFAULT_TEMPLATES = {
  purchase:
    'Olá, *{primeiro_nome}*! 😊\n\nRegistramos sua compra no crediário da *Bela Farma* no valor de *{valor_compra}*:\n{itens_compra}\n\n💰 *Saldo atualizado:* {saldo_atual}\n📅 *Vencimento:* {vencimento}\n\n🔗 *Acompanhe seu extrato ou pague com PIX:*\n{link_portal}\n\nMuito obrigado pela preferência! 💚',
  statement:
    'Olá, *{primeiro_nome}*! 😊\n\nSegue o resumo atualizado do seu crediário na *Bela Farma*:\n\n{resumo_marco}\n💰 *Total a pagar:* {saldo_atual}\n📅 *Vencimento:* {vencimento}\n\n⚡ *Chave PIX (CNPJ):* `{chave_pix}`\n🔗 *Acesse seu extrato simples e QR Code PIX:*\n{link_portal}\n\nQualquer dúvida estamos à disposição! 💚',
  due_reminder:
    '🔔 *Lembrete de Vencimento — Bela Farma*\n\nOlá, *{primeiro_nome}*! Passando para lembrar com carinho que sua conta no valor de *{saldo_atual}* vence em *{vencimento}*.\n\n⚡ *Pague fácil pelo link com PIX Copia e Cola:*\n{link_portal}\n\n💳 *Chave PIX:* `{chave_pix}`\n*(Ou diretamente no caixa da farmácia)* 💚',
  overdue:
    '⚠️ *Aviso Amigável — Bela Farma*\n\nOlá, *{primeiro_nome}*! Constatamos uma pendência no seu crediário ({dias_atraso} dia(s) após o vencimento) no valor atualizado de *{saldo_atual}*.\n\n🔗 *Confira os itens e gere seu PIX por aqui:*\n{link_portal}\n\nSe já efetuou o pagamento, por favor desconsidere esta mensagem. Qualquer dúvida fale com a gente! 💚',
  payment_receipt:
    '✅ *Pagamento Confirmado — Bela Farma*\n\nOlá, *{primeiro_nome}*! Confirmamos o recebimento do seu pagamento!\n\n💰 *Saldo atual restante:* {saldo_atual}\n🔗 *Seu extrato atualizado:*\n{link_portal}\n\nMuito obrigado pela confiança! 💚'
};

const DEFAULT_CONFIG = {
  interestEnabled: false,
  lateFinePercent: 2.0,
  lateInterestMonthlyPercent: 1.0,
  graceDays: 5,
  autoBlockDays: 0,
  pixKey: '31144152000144',
  pixMerchantName: 'BELAFARMA SUL',
  pixMerchantCity: 'JUIZ DE FORA',
  storeWhatsapp: '',
  publicBaseUrl: 'https://app.drogariabelafarma.com.br',
  autoNotifyNewPurchase: false,
  autoNotifyDueDay: false,
  autoNotifyOverdue: false,
  templates: DEFAULT_TEMPLATES
};

let isSyncingDigifarma = false;

// ============================================================================
// Utilitários Numéricos e de Data (sem desvios de fuso horário UTC/Local)
// ============================================================================
function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function formatCurrency(val) {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function sanitizeDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function normalizePhoneBr(phone) {
  const digits = sanitizeDigits(phone);
  if (!digits) return '';
  if (digits.length >= 12 && digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function toLocalDateYMD(input) {
  if (!input) return '';
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return '';
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(input).trim();
  const ymdMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
  }
  const brMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isBeforeCrediarioCutoff(input) {
  const ymd = toLocalDateYMD(input);
  return Boolean(ymd && ymd < CREDIARIO_CUTOFF_DATE);
}

function formatDateBR(input) {
  const ymd = toLocalDateYMD(input);
  if (!ymd) return '-';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

function addDaysYMD(ymd, days) {
  const base = toLocalDateYMD(ymd);
  if (!base) return '';
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function diffCalendarDays(laterYMD, earlierYMD) {
  const a = toLocalDateYMD(laterYMD);
  const b = toLocalDateYMD(earlierYMD);
  if (!a || !b) return 0;
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((t1 - t2) / (1000 * 60 * 60 * 24));
}

function computeFixedDueDate(purchaseYMD, dueDay = 20, closingOffsetDays = 10) {
  const base = toLocalDateYMD(purchaseYMD) || toLocalDateYMD(new Date());
  const [y, m] = base.split('-').map(Number);
  const clampedDay = Math.min(28, Math.max(1, Number(dueDay || 20)));
  const thisMonthDue = `${y}-${String(m).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
  const thisMonthClosing = addDaysYMD(thisMonthDue, -Math.max(1, Number(closingOffsetDays || 10)));

  if (base <= thisMonthClosing) {
    return thisMonthDue;
  }
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================================
// Migração Idempotente (útil tanto no servidor real quanto em DBs de teste)
// ============================================================================
function ensureCrediarioUnifiedSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      nickname TEXT,
      cpf TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      creditLimit REAL DEFAULT 300,
      dueDay INTEGER DEFAULT 20,
      createdAt TEXT DEFAULT (datetime('now', 'localtime')),
      updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS digifarma_sync_metadata (
      tabela TEXT PRIMARY KEY,
      ultima_sincronizacao TEXT,
      total_registros INTEGER DEFAULT 0,
      duracao_ms INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ok',
      mensagem_erro TEXT
    );

    CREATE TABLE IF NOT EXISTS digifarma_crediario_cache (
      id TEXT PRIMARY KEY,
      cliente_id INTEGER,
      cliente_nome TEXT,
      telefone TEXT,
      valor REAL NOT NULL,
      data_compra TEXT,
      data_vencimento TEXT,
      venda_nota_id INTEGER,
      atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS digifarma_crediario_pagamentos_cache (
      contrec_id INTEGER PRIMARY KEY,
      cliente_id INTEGER NOT NULL,
      total_debito REAL DEFAULT 0,
      valor_pago REAL DEFAULT 0,
      tipo_pag TEXT DEFAULT 'P',
      data_pag TEXT,
      vencimento TEXT,
      dinheiro REAL DEFAULT 0,
      cartao REAL DEFAULT 0,
      cheque REAL DEFAULT 0,
      outros REAL DEFAULT 0,
      vendedor INTEGER,
      n_recibo TEXT,
      atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS belafarma_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      cpf TEXT,
      card_uid TEXT UNIQUE,
      card_number TEXT NOT NULL,
      credit_limit REAL NOT NULL DEFAULT 300.0,
      used_limit REAL NOT NULL DEFAULT 0.0,
      due_day INTEGER NOT NULL DEFAULT 20,
      closing_offset_days INTEGER NOT NULL DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'active',
      active_fee_amount REAL NOT NULL DEFAULT 0.0,
      late_fine_percent REAL NOT NULL DEFAULT 2.00,
      late_interest_monthly_percent REAL NOT NULL DEFAULT 1.00,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS card_invoices (
      id TEXT PRIMARY KEY,
      card_id INTEGER NOT NULL,
      customer_id TEXT,
      reference_month TEXT NOT NULL,
      closing_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      purchases_total REAL NOT NULL DEFAULT 0.0,
      fee_active_invoice REAL NOT NULL DEFAULT 0.0,
      late_interest REAL NOT NULL DEFAULT 0.0,
      late_fine REAL NOT NULL DEFAULT 0.0,
      total_due REAL NOT NULL DEFAULT 0.0,
      paid_amount REAL NOT NULL DEFAULT 0.0,
      paid_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      boleto_id TEXT,
      boleto_url TEXT,
      boleto_barcode TEXT,
      pix_copia_cola TEXT,
      serasa_status TEXT DEFAULT 'none',
      serasa_notified_at TEXT,
      serasa_negativado_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS card_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT NOT NULL,
      card_id INTEGER NOT NULL,
      sale_id TEXT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'CREDITO_PROPRIO',
      purchased_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS card_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      invoice_id TEXT,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'DINHEIRO',
      paid_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      origin TEXT DEFAULT 'BALCAO_CAIXA',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS crediario_local_purchases (
      id TEXT PRIMARY KEY,
      card_id INTEGER NOT NULL,
      sale_id TEXT,
      buyer_name TEXT DEFAULT '',
      description TEXT NOT NULL,
      items_json TEXT DEFAULT '[]',
      amount REAL NOT NULL,
      paid_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'open',
      purchased_at TEXT DEFAULT (datetime('now', 'localtime')),
      due_date TEXT,
      created_by TEXT DEFAULT 'Balcão',
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS crediario_message_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      phone TEXT,
      template_type TEXT,
      sale_id TEXT,
      message_text TEXT NOT NULL,
      channel TEXT DEFAULT 'wa_me',
      status TEXT DEFAULT 'sent',
      error_message TEXT,
      sent_by TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  const alterColumns = [
    'ALTER TABLE digifarma_crediario_cache ADD COLUMN produto_id INTEGER',
    "ALTER TABLE digifarma_crediario_cache ADD COLUMN produto_nome TEXT DEFAULT ''",
    "ALTER TABLE digifarma_crediario_cache ADD COLUMN apresentacao TEXT DEFAULT ''",
    'ALTER TABLE digifarma_crediario_cache ADD COLUMN quantidade REAL DEFAULT 1',
    'ALTER TABLE digifarma_crediario_cache ADD COLUMN preco_unitario REAL DEFAULT 0',
    'ALTER TABLE digifarma_crediario_cache ADD COLUMN desconto REAL DEFAULT 0',
    "ALTER TABLE digifarma_crediario_cache ADD COLUMN comprador TEXT DEFAULT ''",

    'ALTER TABLE belafarma_cards ADD COLUMN digifarma_cliente_id INTEGER',
    'ALTER TABLE belafarma_cards ADD COLUMN portal_token TEXT',
    "ALTER TABLE belafarma_cards ADD COLUMN nickname TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN rg TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN birth_date TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN email TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN phone_fixed TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN address TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN address_number TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN address_complement TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN neighborhood TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN city TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN state TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN zip_code TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN address_reference TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN responsible_name TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN authorized_buyers TEXT DEFAULT '[]'",
    "ALTER TABLE belafarma_cards ADD COLUMN due_day_mode TEXT DEFAULT 'auto'",
    'ALTER TABLE belafarma_cards ADD COLUMN interest_exempt INTEGER DEFAULT 0',
    "ALTER TABLE belafarma_cards ADD COLUMN interest_exempt_reason TEXT DEFAULT ''",
    "ALTER TABLE belafarma_cards ADD COLUMN last_purchase_notified_sale_id TEXT DEFAULT ''",
    'ALTER TABLE belafarma_cards ADD COLUMN local_credit_balance REAL DEFAULT 0',

    'ALTER TABLE card_payments ADD COLUMN interest_amount REAL DEFAULT 0',
    'ALTER TABLE card_payments ADD COLUMN waived_interest REAL DEFAULT 0',
    "ALTER TABLE card_payments ADD COLUMN operator_name TEXT DEFAULT ''",
    'ALTER TABLE card_payments ADD COLUMN synced_digifarma INTEGER DEFAULT 0',
    'ALTER TABLE card_payments ADD COLUMN is_full_settlement INTEGER DEFAULT 0'
  ];

  for (const sql of alterColumns) {
    try { db.exec(sql); } catch (_) {}
  }

  try { db.exec('CREATE INDEX IF NOT EXISTS idx_df_pag_cli ON digifarma_crediario_pagamentos_cache(cliente_id, data_pag)'); } catch (_) {}
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_bf_cards_portal_token ON belafarma_cards(portal_token)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_bf_cards_df_cli ON belafarma_cards(digifarma_cliente_id)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_cred_local_card ON crediario_local_purchases(card_id, status)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_cred_msg_card ON crediario_message_log(card_id, created_at DESC)'); } catch (_) {}
  try {
    db.prepare('DELETE FROM digifarma_crediario_cache WHERE data_compra IS NOT NULL AND substr(data_compra, 1, 10) < ?')
      .run(CREDIARIO_CUTOFF_DATE);
  } catch (_) {}
  try {
    db.prepare('DELETE FROM digifarma_crediario_pagamentos_cache WHERE data_pag IS NOT NULL AND substr(data_pag, 1, 10) < ?')
      .run(CREDIARIO_CUTOFF_DATE);
  } catch (_) {}
}

// ============================================================================
// Configuração Global de Regras, Juros, PIX e Automação
// ============================================================================
function getCrediarioConfig(db) {
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(CONFIG_KEY);
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        templates: {
          ...DEFAULT_TEMPLATES,
          ...(parsed.templates || {})
        }
      };
    }
  } catch (_) {}
  return {
    ...DEFAULT_CONFIG,
    templates: { ...DEFAULT_TEMPLATES }
  };
}

function saveCrediarioConfig(db, partialConfig) {
  const current = getCrediarioConfig(db);
  const next = {
    ...current,
    interestEnabled:
      partialConfig.interestEnabled !== undefined
        ? Boolean(partialConfig.interestEnabled)
        : current.interestEnabled,
    lateFinePercent:
      partialConfig.lateFinePercent !== undefined
        ? Math.max(0, Number(partialConfig.lateFinePercent) || 0)
        : current.lateFinePercent,
    lateInterestMonthlyPercent:
      partialConfig.lateInterestMonthlyPercent !== undefined
        ? Math.max(0, Number(partialConfig.lateInterestMonthlyPercent) || 0)
        : current.lateInterestMonthlyPercent,
    graceDays:
      partialConfig.graceDays !== undefined
        ? Math.max(0, parseInt(partialConfig.graceDays, 10) || 0)
        : current.graceDays,
    autoBlockDays:
      partialConfig.autoBlockDays !== undefined
        ? Math.max(0, parseInt(partialConfig.autoBlockDays, 10) || 0)
        : current.autoBlockDays,
    pixKey:
      partialConfig.pixKey !== undefined ? String(partialConfig.pixKey).trim() : current.pixKey,
    pixMerchantName:
      partialConfig.pixMerchantName !== undefined
        ? String(partialConfig.pixMerchantName).trim() || 'BELAFARMA SUL'
        : current.pixMerchantName,
    pixMerchantCity:
      partialConfig.pixMerchantCity !== undefined
        ? String(partialConfig.pixMerchantCity).trim() || 'JUIZ DE FORA'
        : current.pixMerchantCity,
    storeWhatsapp:
      partialConfig.storeWhatsapp !== undefined
        ? String(partialConfig.storeWhatsapp).trim()
        : current.storeWhatsapp,
    publicBaseUrl:
      partialConfig.publicBaseUrl !== undefined
        ? String(partialConfig.publicBaseUrl).trim().replace(/\/+$/, '') || DEFAULT_CONFIG.publicBaseUrl
        : current.publicBaseUrl,
    autoNotifyNewPurchase:
      partialConfig.autoNotifyNewPurchase !== undefined
        ? Boolean(partialConfig.autoNotifyNewPurchase)
        : current.autoNotifyNewPurchase,
    autoNotifyDueDay:
      partialConfig.autoNotifyDueDay !== undefined
        ? Boolean(partialConfig.autoNotifyDueDay)
        : current.autoNotifyDueDay,
    autoNotifyOverdue:
      partialConfig.autoNotifyOverdue !== undefined
        ? Boolean(partialConfig.autoNotifyOverdue)
        : current.autoNotifyOverdue,
    templates: {
      ...current.templates,
      ...(partialConfig.templates || {})
    }
  };

  db.prepare(`
    INSERT INTO system_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(CONFIG_KEY, JSON.stringify(next));

  return next;
}

function generatePortalToken() {
  return crypto.randomBytes(12).toString('hex');
}

function generateCardNumber() {
  const rand4 = () => String(Math.floor(1000 + Math.random() * 9000));
  return `5489 ${rand4()} ${rand4()} ${rand4()}`;
}

function ensurePortalTokens(db) {
  const missing = db.prepare("SELECT id FROM belafarma_cards WHERE portal_token IS NULL OR portal_token = ''").all();
  if (missing.length === 0) return 0;
  const stmt = db.prepare('UPDATE belafarma_cards SET portal_token = ? WHERE id = ?');
  db.transaction(() => {
    for (const row of missing) {
      stmt.run(generatePortalToken(), row.id);
    }
  })();
  return missing.length;
}

function parseAuthorizedBuyers(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

// ============================================================================
// Motor Financeiro: Vencimentos, Atraso, Multa, Juros Pro-Rata e Isenção
// ============================================================================
function calculateAccountFinancials(card, digifarmaItems = [], localPurchases = [], config = DEFAULT_CONFIG, nowDate = new Date()) {
  const todayYMD = toLocalDateYMD(nowDate);
  const graceDays = Math.max(0, Number(config.graceDays ?? 5));
  const fineRate = Math.max(0, Number(config.lateFinePercent ?? 2.0)) / 100;
  const monthlyRate = Math.max(0, Number(config.lateInterestMonthlyPercent ?? 1.0)) / 100;
  const isFixedDue = card.due_day_mode === 'fixed' && Number(card.due_day) >= 1 && Number(card.due_day) <= 28;
  const localCreditBalance = Math.max(0, Number(card.local_credit_balance || 0));

  // Normalizar todos os lançamentos em aberto
  const rawItems = [];

  for (const it of digifarmaItems) {
    const qty = Number(it.quantidade || 1);
    const unit = Number(it.preco_unitario || 0);
    const storedLineTotal = Number(it.valor || 0);
    const amount = round2(storedLineTotal > 0 ? storedLineTotal : qty * unit);
    if (amount <= 0) continue;

    const rawPurchaseYMD = toLocalDateYMD(it.data_compra);
    if (rawPurchaseYMD && rawPurchaseYMD < CREDIARIO_CUTOFF_DATE) continue;
    const purchaseYMD = rawPurchaseYMD || todayYMD;
    const dueDateYMD = isFixedDue
      ? computeFixedDueDate(purchaseYMD, card.due_day, card.closing_offset_days || 10)
      : (toLocalDateYMD(it.data_vencimento) || addDaysYMD(purchaseYMD, 30));

    rawItems.push({
      id: `df_${it.id}`,
      rawId: String(it.id),
      source: 'DIGIFARMA',
      saleId: it.venda_nota_id ? String(it.venda_nota_id) : '',
      buyerName: String(it.comprador || '').trim(),
      productName: String(it.produto_nome || '').trim() || `Item #${it.produto_id || it.id}`,
      presentation: String(it.apresentacao || '').trim(),
      quantity: qty,
      unitPrice: round2(unit > 0 ? unit : amount / (qty || 1)),
      originalAmount: amount,
      remainingAmount: amount,
      purchaseDate: purchaseYMD,
      dueDate: dueDateYMD
    });
  }

  for (const lp of localPurchases) {
    if (lp.status === 'paid') continue;
    const rem = round2(Number(lp.amount || 0) - Number(lp.paid_amount || 0));
    if (rem <= 0.009) continue;

    const rawPurchaseYMD = toLocalDateYMD(lp.purchased_at);
    if (rawPurchaseYMD && rawPurchaseYMD < CREDIARIO_CUTOFF_DATE) continue;
    const purchaseYMD = rawPurchaseYMD || todayYMD;
    const dueDateYMD = isFixedDue
      ? computeFixedDueDate(purchaseYMD, card.due_day, card.closing_offset_days || 10)
      : (toLocalDateYMD(lp.due_date) || addDaysYMD(purchaseYMD, 30));

    let parsedItems = [];
    try {
      const p = JSON.parse(lp.items_json || '[]');
      if (Array.isArray(p)) parsedItems = p;
    } catch (_) {}

    rawItems.push({
      id: `local_${lp.id}`,
      rawId: String(lp.id),
      source: 'BELINHA',
      saleId: lp.sale_id ? String(lp.sale_id) : String(lp.id),
      buyerName: String(lp.buyer_name || '').trim(),
      productName: String(lp.description || 'Compra no Balcão').trim(),
      presentation: '',
      quantity: 1,
      unitPrice: rem,
      originalAmount: Number(lp.amount || rem),
      remainingAmount: rem,
      purchaseDate: purchaseYMD,
      dueDate: dueDateYMD,
      subItems: parsedItems
    });
  }

  // Ordenar mais antigos primeiro para aplicar eventual abatimento local (FIFO)
  rawItems.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));

  let creditToApply = localCreditBalance;
  const openItems = [];

  for (const item of rawItems) {
    let rem = item.remainingAmount;
    if (creditToApply > 0) {
      const absorbed = Math.min(rem, creditToApply);
      rem = round2(rem - absorbed);
      creditToApply = round2(creditToApply - absorbed);
    }
    if (rem <= 0.009) continue;

    const daysLate = Math.max(0, diffCalendarDays(todayYMD, item.dueDate));
    const isOverdue = daysLate > 0;
    let simFine = 0;
    let simInterest = 0;

    if (daysLate > graceDays) {
      simFine = round2(rem * fineRate);
      simInterest = round2(rem * (monthlyRate / 30) * daysLate);
    }

    openItems.push({
      ...item,
      remainingAmount: rem,
      daysLate,
      isOverdue,
      simulatedFine: simFine,
      simulatedInterest: simInterest
    });
  }

  const principalBalance = round2(openItems.reduce((acc, it) => acc + it.remainingAmount, 0));
  const overduePrincipal = round2(
    openItems.filter(it => it.isOverdue).reduce((acc, it) => acc + it.remainingAmount, 0)
  );
  const simulatedFine = round2(openItems.reduce((acc, it) => acc + it.simulatedFine, 0));
  const simulatedInterest = round2(openItems.reduce((acc, it) => acc + it.simulatedInterest, 0));

  const chargesActive = Boolean(config.interestEnabled) && !Number(card.interest_exempt);
  const lateFine = chargesActive ? simulatedFine : 0;
  const lateInterest = chargesActive ? simulatedInterest : 0;
  const totalBalance = round2(principalBalance + lateFine + lateInterest);

  const overdueItems = openItems.filter(it => it.isOverdue);
  const maxDaysLate = openItems.reduce((m, it) => Math.max(m, it.daysLate), 0);

  // Próximo vencimento (ou vencimento mais antigo em aberto)
  const sortedDueDates = openItems
    .map(it => it.dueDate)
    .filter(Boolean)
    .sort();
  const nextDueDate = sortedDueDates[0] || '';

  const creditLimit = Number(card.credit_limit || 0);
  const availableCredit = Math.max(0, round2(creditLimit - principalBalance));

  const isManuallyBlocked = card.status === 'blocked' || card.status === 'blocked_late';
  const isAutoBlocked =
    Number(config.autoBlockDays || 0) > 0 && maxDaysLate >= Number(config.autoBlockDays);
  const isBlocked = isManuallyBlocked || isAutoBlocked;

  let accountStatus = 'em_dia';
  if (isBlocked) accountStatus = 'bloqueado';
  else if (principalBalance <= 0) accountStatus = 'zerado';
  else if (overdueItems.length > 0) accountStatus = 'vencido';

  return {
    principalBalance,
    overduePrincipal,
    lateFine,
    lateInterest,
    totalCharges: round2(lateFine + lateInterest),
    simulatedFine,
    simulatedInterest,
    simulatedCharges: round2(simulatedFine + simulatedInterest),
    chargesApplied: chargesActive,
    interestExempt: Boolean(Number(card.interest_exempt)),
    totalBalance,
    maxDaysLate,
    overdueCount: overdueItems.length,
    openItemsCount: openItems.length,
    nextDueDate,
    creditLimit,
    availableCredit,
    isBlocked,
    accountStatus,
    localCreditApplied: round2(localCreditBalance - creditToApply),
    openItems
  };
}

// ============================================================================
// Construção dos Extratos (Simples p/ Idosos vs Completo p/ Auditoria)
// ============================================================================
function groupItemsBySale(openItems) {
  const groupsMap = new Map();
  for (const item of openItems) {
    const key = `${item.purchaseDate}__${item.saleId || item.id}__${(item.buyerName || '').toUpperCase()}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        key,
        date: item.purchaseDate,
        saleId: item.saleId || '',
        buyerName: item.buyerName || '',
        dueDate: item.dueDate,
        daysLate: item.daysLate,
        subtotal: 0,
        items: []
      });
    }
    const grp = groupsMap.get(key);
    grp.subtotal = round2(grp.subtotal + item.remainingAmount);
    if (item.daysLate > grp.daysLate) grp.daysLate = item.daysLate;

    if (Array.isArray(item.subItems) && item.subItems.length > 0) {
      const useRemainingAsTotal = item.subItems.length === 1;
      for (const si of item.subItems) {
        const qty = Number(si.quantity || 1);
        const totalP = useRemainingAsTotal ? item.remainingAmount : round2(Number(si.amount || item.remainingAmount));
        const unitP = Number(si.unitPrice || (qty > 0 ? round2(totalP / qty) : totalP));
        grp.items.push({
          id: `${item.id}_${grp.items.length}`,
          productName: si.description || si.productName || item.productName,
          quantity: qty,
          unitPrice: unitP,
          totalPrice: totalP
        });
      }
    } else {
      grp.items.push({
        id: item.id,
        productName: item.productName,
        presentation: item.presentation,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.remainingAmount
      });
    }
  }

  const groups = Array.from(groupsMap.values());
  groups.sort((a, b) => a.date.localeCompare(b.date) || String(a.saleId).localeCompare(String(b.saleId)));
  return groups;
}

function normalizePaymentEvents(digifarmaPayments = [], localPayments = []) {
  const events = [];

  for (const p of digifarmaPayments) {
    const val = round2(p.valor_pago || 0);
    const totalDeb = round2(p.total_debito || 0);
    if (val <= 0) continue;

    const dateYMD = toLocalDateYMD(p.data_pag);
    if (dateYMD && dateYMD < CREDIARIO_CUTOFF_DATE) continue;
    const isZeroed =
      String(p.tipo_pag || '').toUpperCase() === 'T' ||
      (totalDeb > 0 && Math.abs(totalDeb - val) <= 0.05);

    let method = 'Dinheiro';
    if (Number(p.cartao || 0) > 0 && Number(p.dinheiro || 0) <= 0) method = 'Cartão';
    else if (Number(p.cheque || 0) > 0) method = 'Cheque';
    else if (Number(p.dinheiro || 0) <= 0 && Number(p.cartao || 0) <= 0) method = 'Baixa Caixa / PIX';

    events.push({
      id: `df_pag_${p.contrec_id}`,
      source: 'DIGIFARMA',
      date: dateYMD,
      rawTimestamp: String(p.data_pag || dateYMD),
      amountPaid: val,
      debtBefore: totalDeb,
      remainingAfter: Math.max(0, round2(totalDeb - val)),
      isFullSettlement: isZeroed,
      method,
      receiptNumber: p.n_recibo || String(p.contrec_id)
    });
  }

  for (const lp of localPayments) {
    const val = round2(lp.amount || 0);
    if (val <= 0) continue;
    const dateYMD = toLocalDateYMD(lp.paid_at || lp.created_at);
    if (dateYMD && dateYMD < CREDIARIO_CUTOFF_DATE) continue;
    const isZeroed =
      Boolean(Number(lp.is_full_settlement)) ||
      String(lp.notes || '').toLowerCase().includes('quitação total');

    events.push({
      id: `loc_pag_${lp.id}`,
      source: 'BELINHA',
      date: dateYMD,
      rawTimestamp: String(lp.paid_at || lp.created_at || dateYMD),
      amountPaid: val,
      debtBefore: 0,
      remainingAfter: 0,
      isFullSettlement: isZeroed,
      method: lp.payment_method || 'BALCÃO',
      notes: lp.notes || '',
      receiptNumber: `BEL-${lp.id}`
    });
  }

  events.sort((a, b) => {
    const c = b.date.localeCompare(a.date);
    if (c !== 0) return c;
    return String(b.rawTimestamp).localeCompare(String(a.rawTimestamp));
  });

  return events;
}

function buildSimpleStatement(financials, paymentEvents) {
  const zeroedPayment = paymentEvents.find(p => p.isFullSettlement);
  let milestone = null;
  let paymentsAfterMilestone = [];

  if (financials.principalBalance <= 0 && paymentEvents.length > 0) {
    const latest = zeroedPayment || paymentEvents[0];
    milestone = {
      type: 'zeroed',
      date: latest.date,
      amountPaid: latest.amountPaid,
      remainingAfter: 0,
      label: `Conta totalmente zerada em ${formatDateBR(latest.date)}`,
      sublabel: `Último pagamento de ${formatCurrency(latest.amountPaid)} quitou todo o saldo.`
    };
  } else if (zeroedPayment) {
    milestone = {
      type: 'zeroed',
      date: zeroedPayment.date,
      amountPaid: zeroedPayment.amountPaid,
      remainingAfter: 0,
      label: `Conta estava totalmente zerada em ${formatDateBR(zeroedPayment.date)}`,
      sublabel: `Pagamento de ${formatCurrency(zeroedPayment.amountPaid)} (${zeroedPayment.method}) quitou todo o saldo anterior.`
    };
    paymentsAfterMilestone = paymentEvents.filter(
      p => p.id !== zeroedPayment.id && p.date >= zeroedPayment.date && String(p.rawTimestamp) > String(zeroedPayment.rawTimestamp)
    );
  } else if (paymentEvents.length > 0) {
    const latest = paymentEvents[0];
    const hasRemainingInfo = latest.debtBefore > 0;
    milestone = {
      type: 'last_payment',
      date: latest.date,
      amountPaid: latest.amountPaid,
      remainingAfter: latest.remainingAfter,
      label: `Último pagamento em ${formatDateBR(latest.date)}`,
      sublabel: hasRemainingInfo
        ? `Pago ${formatCurrency(latest.amountPaid)} (${latest.method}) — restavam ${formatCurrency(latest.remainingAfter)} na data.`
        : `Pago ${formatCurrency(latest.amountPaid)} (${latest.method}).`
    };
  } else {
    const earliest = financials.openItems[0]?.purchaseDate || '';
    milestone = {
      type: 'opening',
      date: earliest,
      amountPaid: 0,
      remainingAfter: 0,
      label: 'Compras em aberto na sua conta',
      sublabel: 'Acompanhe abaixo os itens em aberto para pagamento.'
    };
  }

  const purchaseGroups = groupItemsBySale(financials.openItems);

  return {
    milestone,
    purchaseGroups,
    paymentsAfterMilestone,
    localCreditApplied: financials.localCreditApplied,
    principalBalance: financials.principalBalance,
    lateFine: financials.lateFine,
    lateInterest: financials.lateInterest,
    totalCharges: financials.totalCharges,
    totalBalance: financials.totalBalance,
    nextDueDate: financials.nextDueDate
  };
}

function buildCompleteStatement(financials, paymentEvents, purchaseGroups) {
  const entries = [];

  for (const p of paymentEvents) {
    entries.push({
      id: p.id,
      date: p.date,
      sortKey: `${p.date}T1_${p.rawTimestamp}`,
      type: 'CREDITO',
      source: p.source,
      title: p.isFullSettlement
        ? `PAGAMENTO RECEBIDO — QUITAÇÃO TOTAL (${p.method})`
        : `PAGAMENTO RECEBIDO (${p.method})`,
      subtitle: p.debtBefore > 0
        ? `Recibo #${p.receiptNumber} • Saldo na época: ${formatCurrency(p.debtBefore)} -> ${formatCurrency(p.remainingAfter)}`
        : p.notes || `Recibo #${p.receiptNumber}`,
      amount: p.amountPaid,
      runningBalance: p.debtBefore > 0 ? p.remainingAfter : null,
      items: []
    });
  }

  for (const grp of purchaseGroups) {
    const buyerTag = grp.buyerName ? ` — Retirado por: ${grp.buyerName}` : '';
    const cupomTag = grp.saleId ? `Cupom #${grp.saleId}` : 'Lançamento no Balcão';
    entries.push({
      id: `deb_${grp.key}`,
      date: grp.date,
      sortKey: `${grp.date}T2_${grp.saleId}`,
      type: 'DEBITO',
      source: 'COMPRA',
      title: `COMPRA ${cupomTag}${buyerTag}`,
      subtitle: `Vencimento: ${formatDateBR(grp.dueDate)}${grp.daysLate > 0 ? ` (${grp.daysLate}d atraso)` : ''}`,
      amount: grp.subtotal,
      runningBalance: null,
      items: grp.items
    });
  }

  if (financials.totalCharges > 0) {
    entries.push({
      id: 'encargos_atuais',
      date: toLocalDateYMD(new Date()),
      sortKey: `${toLocalDateYMD(new Date())}T9_ENCARGO`,
      type: 'ENCARGO',
      source: 'JUROS',
      title: 'MULTA E JUROS POR ATRASO',
      subtitle: `Multa (${formatCurrency(financials.lateFine)}) + Juros pro-rata (${formatCurrency(financials.lateInterest)})`,
      amount: financials.totalCharges,
      runningBalance: financials.totalBalance,
      items: []
    });
  }

  // Ordenar cronologicamente crescente (como extrato bancário) e preencher saldo corrente na parte aberta
  entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  let openRunning = 0;
  for (const e of entries) {
    if (e.type === 'DEBITO') {
      openRunning = round2(openRunning + e.amount);
      e.runningBalance = openRunning;
    } else if (e.type === 'ENCARGO') {
      e.runningBalance = financials.totalBalance;
    }
  }

  const today = new Date();
  const y90 = addDaysYMD(toLocalDateYMD(today), -90);
  const totalPaid90d = round2(
    paymentEvents.filter(p => p.date >= y90).reduce((acc, p) => acc + p.amountPaid, 0)
  );

  return {
    entries,
    summary: {
      totalPaid90d,
      openPrincipal: financials.principalBalance,
      totalCharges: financials.totalCharges,
      totalDue: financials.totalBalance
    }
  };
}

// ============================================================================
// Sincronização Híbrida com Digifarma (CLIENTES, FICHARIO+PRODUTOS, CONTAS_RECEBIDAS)
// ============================================================================
async function syncAllFromDigifarma(db, { notifyNewPurchases = false } = {}) {
  if (isSyncingDigifarma) {
    return { success: false, busy: true, message: 'Sincronização com Digifarma já está em andamento.' };
  }

  isSyncingDigifarma = true;
  const start = Date.now();
  ensureCrediarioUnifiedSchema(db);
  ensurePortalTokens(db);

  try {
    const previouslyOpenSaleIds = new Set(
      db.prepare('SELECT DISTINCT venda_nota_id FROM digifarma_crediario_cache WHERE venda_nota_id IS NOT NULL')
        .all()
        .map(r => String(r.venda_nota_id))
    );

    // 1. Buscar FICHARIO a partir da data de corte com nome real dos PRODUTOS e CLIENTES
    const ficharioRows = await queryDigifarma(`
      SELECT
        f.FICHARIO_ID,
        f.CLIENTE_ID,
        f.VENDA_NOTA_ID,
        f.PRODUTO_ID,
        f.FICHARIO_QUANTIDADE,
        f.FICHARIO_VALOR,
        f.FICHARIO_DESCONTO,
        f.FICHARIO_FRETE,
        f.FICHARIO_DATACOMPRA,
        f.FICHARIO_VENCIMENTO,
        f.FICHARIO_COMPRADOR,
        p.PRODUTO,
        p.APRESENTACAO,
        cli.CLIENTE,
        cli.CLI_CELULAR,
        cli.CLI_TELEFONE
      FROM FICHARIO f
      LEFT JOIN PRODUTOS p ON f.PRODUTO_ID = p.PRODUTO_ID
      LEFT JOIN CLIENTES cli ON f.CLIENTE_ID = cli.CLIENTE_ID
      WHERE CAST(f.FICHARIO_DATACOMPRA AS DATE) >= DATE '${CREDIARIO_CUTOFF_DATE}'
      ORDER BY f.FICHARIO_VENCIMENTO ASC, f.FICHARIO_ID ASC
    `, [], 25000);

    // 2. Buscar CONTAS_RECEBIDAS a partir da data de corte (01/10/2025)
    const pagamentosRows = await queryDigifarma(`
      SELECT
        CONTREC_ID,
        CLIENTE_ID,
        CONTREC_TOTALDEBITO,
        CONTREC_VALORPAG,
        CONTREC_TIPOPAG,
        CONTREC_DATAPAG,
        CONTREC_VENCIMENTO,
        DINHEIRO,
        CARTAO,
        CHEQUE,
        OUTROS,
        CONTREC_VENDEDOR,
        CONTREC_NRECIBO
      FROM CONTAS_RECEBIDAS
      WHERE CAST(CONTREC_DATAPAG AS DATE) >= DATE '${CREDIARIO_CUTOFF_DATE}'
      ORDER BY CONTREC_DATAPAG DESC
    `, [], 25000);

    // 3. Buscar dados cadastrais de CLIENTES que possuem crediário ou histórico após o corte
    const clientIdsSet = new Set();
    for (const r of ficharioRows) {
      if (r.CLIENTE_ID && !isBeforeCrediarioCutoff(r.FICHARIO_DATACOMPRA)) {
        clientIdsSet.add(Number(r.CLIENTE_ID));
      }
    }
    for (const p of pagamentosRows) {
      if (p.CLIENTE_ID && !isBeforeCrediarioCutoff(p.CONTREC_DATAPAG)) {
        clientIdsSet.add(Number(p.CLIENTE_ID));
      }
    }

    const clientesRows = await queryDigifarma(`
      SELECT
        CLIENTE_ID, CLIENTE, CLI_CPF, CLI_RG, CLI_NASCIMENTO,
        CLI_TELEFONE, CLI_CELULAR, CLI_EMAIL,
        CLI_ENDERECO, CLI_NUMERO, CLI_COMPLEMENTO, CLI_BAIRRO,
        CLI_CIDADE, CLI_UF, CLI_CEP, CLI_REFERENCIA,
        RESPONSAVEL, CLI_LIMITE, CLI_DIA_PAGAMENTO, CLI_OBSERVACAO, CLI_BLOQUEADO
      FROM CLIENTES
      WHERE PERMITIR_CREDIARIO = 'S'
         OR CLIENTE_ID IN (
           SELECT DISTINCT CLIENTE_ID
           FROM FICHARIO
           WHERE CAST(FICHARIO_DATACOMPRA AS DATE) >= DATE '${CREDIARIO_CUTOFF_DATE}'
         )
    `, [], 25000);

    // Transação atômica local (só executa depois de todas as leituras do Firebird terem sucesso)
    const todayYMD = toLocalDateYMD(new Date());
    const newlyDetectedSales = [];
    let insertedItemsCount = 0;
    let insertedPaymentsCount = 0;

    db.transaction(() => {
      // A) Atualizar digifarma_crediario_cache com itens + nomes de produtos
      db.prepare('DELETE FROM digifarma_crediario_cache').run();
      const insertItemStmt = db.prepare(`
        INSERT INTO digifarma_crediario_cache (
          id, cliente_id, cliente_nome, telefone, valor, data_compra, data_vencimento,
          venda_nota_id, produto_id, produto_nome, apresentacao, quantidade, preco_unitario,
          desconto, comprador, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `);

      const buyersByClienteId = new Map();
      const openSumByClienteId = new Map();

      for (const row of ficharioRows) {
        const purchaseYMD = toLocalDateYMD(row.FICHARIO_DATACOMPRA);
        if (purchaseYMD && purchaseYMD < CREDIARIO_CUTOFF_DATE) continue;

        const cliId = row.CLIENTE_ID ? Number(row.CLIENTE_ID) : null;
        const qty = Number(row.FICHARIO_QUANTIDADE || 1);
        const unitPrice = Number(row.FICHARIO_VALOR || 0);
        const discount = Number(row.FICHARIO_DESCONTO || 0);
        const freight = Number(row.FICHARIO_FRETE || 0);
        const lineTotal = Math.max(0, round2((qty * unitPrice) - discount + freight));

        const buyer = String(row.FICHARIO_COMPRADOR || '').trim().toUpperCase();
        const phone = sanitizeDigits(row.CLI_CELULAR) || sanitizeDigits(row.CLI_TELEFONE) || '';
        const dueYMD = toLocalDateYMD(row.FICHARIO_VENCIMENTO) || (purchaseYMD ? addDaysYMD(purchaseYMD, 30) : '');
        const prodName = String(row.PRODUTO || '').trim() || `Produto #${row.PRODUTO_ID || ''}`;
        const pres = String(row.APRESENTACAO || '').trim();
        const saleIdStr = row.VENDA_NOTA_ID ? String(row.VENDA_NOTA_ID) : '';

        insertItemStmt.run(
          String(row.FICHARIO_ID),
          cliId,
          String(row.CLIENTE || 'Desconhecido').trim(),
          phone,
          lineTotal,
          purchaseYMD || (row.FICHARIO_DATACOMPRA ? String(row.FICHARIO_DATACOMPRA) : null),
          dueYMD || (row.FICHARIO_VENCIMENTO ? String(row.FICHARIO_VENCIMENTO) : null),
          row.VENDA_NOTA_ID || null,
          row.PRODUTO_ID || null,
          prodName,
          pres,
          qty,
          round2(unitPrice),
          round2(discount),
          buyer
        );
        insertedItemsCount++;

        if (cliId) {
          openSumByClienteId.set(cliId, round2((openSumByClienteId.get(cliId) || 0) + lineTotal));
          if (buyer) {
            if (!buyersByClienteId.has(cliId)) buyersByClienteId.set(cliId, new Set());
            buyersByClienteId.get(cliId).add(buyer);
          }
        }

        if (notifyNewPurchases && saleIdStr && purchaseYMD === todayYMD && !previouslyOpenSaleIds.has(saleIdStr)) {
          newlyDetectedSales.push({
            clienteId: cliId,
            saleId: saleIdStr,
            buyerName: buyer,
            productName: prodName,
            amount: lineTotal
          });
        }
      }

      // B) Atualizar digifarma_crediario_pagamentos_cache
      db.prepare('DELETE FROM digifarma_crediario_pagamentos_cache').run();
      const insertPagStmt = db.prepare(`
        INSERT INTO digifarma_crediario_pagamentos_cache (
          contrec_id, cliente_id, total_debito, valor_pago, tipo_pag, data_pag,
          vencimento, dinheiro, cartao, cheque, outros, vendedor, n_recibo, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `);

      for (const p of pagamentosRows) {
        if (!p.CLIENTE_ID) continue;
        const payYMD = toLocalDateYMD(p.CONTREC_DATAPAG);
        if (payYMD && payYMD < CREDIARIO_CUTOFF_DATE) continue;
        insertPagStmt.run(
          Number(p.CONTREC_ID),
          Number(p.CLIENTE_ID),
          round2(p.CONTREC_TOTALDEBITO || 0),
          round2(p.CONTREC_VALORPAG || 0),
          String(p.CONTREC_TIPOPAG || 'P').trim().toUpperCase(),
          payYMD || String(p.CONTREC_DATAPAG || ''),
          toLocalDateYMD(p.CONTREC_VENCIMENTO) || null,
          round2(p.DINHEIRO || 0),
          round2(p.CARTAO || 0),
          round2(p.CHEQUE || 0),
          round2(p.OUTROS || 0),
          p.CONTREC_VENDEDOR || null,
          p.CONTREC_NRECIBO ? String(p.CONTREC_NRECIBO).trim() : null
        );
        insertedPaymentsCount++;
      }

      // C) Merge inteligente em customers e belafarma_cards
      for (const dc of clientesRows) {
        const dfId = Number(dc.CLIENTE_ID);
        const hasOpenDebt = openSumByClienteId.has(dfId);
        // Só manter no Crediário quem tem débito aberto, limite cadastrado, histórico recente ou já existe em belafarma_cards
        const cleanName = String(dc.CLIENTE || '').trim().toUpperCase();
        if (!cleanName) continue;

        const cleanCpf = sanitizeDigits(dc.CLI_CPF);
        const cleanCel = sanitizeDigits(dc.CLI_CELULAR);
        const cleanTel = sanitizeDigits(dc.CLI_TELEFONE);
        const primaryPhone = cleanCel || cleanTel || '';
        const birthYMD = toLocalDateYMD(dc.CLI_NASCIMENTO);
        const street = String(dc.CLI_ENDERECO || '').trim();
        const fullAddr = [street, dc.CLI_NUMERO, dc.CLI_BAIRRO].filter(Boolean).join(', ');
        const dfLimit = Number(dc.CLI_LIMITE || 0) > 0 ? Number(dc.CLI_LIMITE) : 300;
        const dfDueDay = Number(dc.CLI_DIA_PAGAMENTO) >= 1 && Number(dc.CLI_DIA_PAGAMENTO) <= 28
          ? Number(dc.CLI_DIA_PAGAMENTO)
          : null;

        // Tentar localizar em belafarma_cards por digifarma_cliente_id, customer_id, CPF ou nome exato
        let card = db.prepare('SELECT * FROM belafarma_cards WHERE digifarma_cliente_id = ?').get(dfId);
        if (!card) {
          card = db.prepare('SELECT * FROM belafarma_cards WHERE customer_id = ?').get(String(dfId));
        }
        if (!card && cleanCpf.length >= 11) {
          card = db.prepare("SELECT * FROM belafarma_cards WHERE REPLACE(REPLACE(REPLACE(COALESCE(cpf, ''), '.', ''), '-', ''), ' ', '') = ?").get(cleanCpf);
        }
        if (!card) {
          card = db.prepare('SELECT * FROM belafarma_cards WHERE UPPER(TRIM(customer_name)) = ?').get(cleanName);
        }

        const shouldAutoCreate = hasOpenDebt || clientIdsSet.has(dfId) || Number(dc.CLI_LIMITE || 0) > 0;
        if (!card && !shouldAutoCreate) continue;

        const buyersSeen = buyersByClienteId.get(dfId) ? Array.from(buyersByClienteId.get(dfId)) : [];

        if (card) {
          const mergedBuyers = Array.from(
            new Set([...parseAuthorizedBuyers(card.authorized_buyers), ...buyersSeen])
          );
          const nextDueDay = card.due_day || dfDueDay || 20;
          const nextLimit = Number(card.credit_limit || 0) > 0 ? Number(card.credit_limit) : dfLimit;
          const token = card.portal_token || generatePortalToken();

          db.prepare(`
            UPDATE belafarma_cards
            SET digifarma_cliente_id = ?,
                portal_token = ?,
                cpf = COALESCE(NULLIF(TRIM(cpf), ''), NULLIF(?, '')),
                phone = COALESCE(NULLIF(TRIM(phone), ''), ?),
                phone_fixed = COALESCE(NULLIF(TRIM(phone_fixed), ''), ?),
                rg = COALESCE(NULLIF(TRIM(rg), ''), ?),
                birth_date = COALESCE(NULLIF(TRIM(birth_date), ''), ?),
                email = COALESCE(NULLIF(TRIM(email), ''), ?),
                address = COALESCE(NULLIF(TRIM(address), ''), ?),
                address_number = COALESCE(NULLIF(TRIM(address_number), ''), ?),
                address_complement = COALESCE(NULLIF(TRIM(address_complement), ''), ?),
                neighborhood = COALESCE(NULLIF(TRIM(neighborhood), ''), ?),
                city = COALESCE(NULLIF(TRIM(city), ''), ?),
                state = COALESCE(NULLIF(TRIM(state), ''), ?),
                zip_code = COALESCE(NULLIF(TRIM(zip_code), ''), ?),
                address_reference = COALESCE(NULLIF(TRIM(address_reference), ''), ?),
                responsible_name = COALESCE(NULLIF(TRIM(responsible_name), ''), ?),
                notes = COALESCE(NULLIF(TRIM(notes), ''), ?),
                authorized_buyers = ?,
                due_day = ?,
                credit_limit = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(
            dfId,
            token,
            cleanCpf,
            primaryPhone,
            cleanTel,
            String(dc.CLI_RG || '').trim(),
            birthYMD,
            String(dc.CLI_EMAIL || '').trim(),
            street,
            String(dc.CLI_NUMERO || '').trim(),
            String(dc.CLI_COMPLEMENTO || '').trim(),
            String(dc.CLI_BAIRRO || '').trim(),
            String(dc.CLI_CIDADE || '').trim(),
            String(dc.CLI_UF || '').trim(),
            sanitizeDigits(dc.CLI_CEP),
            String(dc.CLI_REFERENCIA || '').trim(),
            String(dc.RESPONSAVEL || '').trim(),
            String(dc.CLI_OBSERVACAO || '').trim(),
            JSON.stringify(mergedBuyers),
            nextDueDay,
            nextLimit,
            card.id
          );
        } else {
          // Garantir customer em customers também
          const custIdStr = String(dfId);
          const existingCust = db.prepare('SELECT id FROM customers WHERE id = ?').get(custIdStr);
          if (!existingCust) {
            db.prepare(`
              INSERT INTO customers (id, name, cpf, phone, email, address, notes, creditLimit, dueDay, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
            `).run(
              custIdStr,
              cleanName,
              cleanCpf || null,
              primaryPhone || null,
              String(dc.CLI_EMAIL || '').trim() || null,
              fullAddr || null,
              String(dc.CLI_OBSERVACAO || '').trim() || null,
              dfLimit,
              dfDueDay || 20
            );
          }

          db.prepare(`
            INSERT INTO belafarma_cards (
              customer_id, digifarma_cliente_id, portal_token, customer_name, phone, phone_fixed,
              cpf, rg, birth_date, email, address, address_number, address_complement, neighborhood,
              city, state, zip_code, address_reference, responsible_name, authorized_buyers,
              card_number, credit_limit, used_limit, due_day, due_day_mode, closing_offset_days,
              status, active_fee_amount, late_fine_percent, late_interest_monthly_percent, notes,
              created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?,
              ?, ?, 0, ?, ?, 10,
              ?, 0, 2.0, 1.0, ?,
              datetime('now', 'localtime'), datetime('now', 'localtime')
            )
          `).run(
            custIdStr,
            dfId,
            generatePortalToken(),
            cleanName,
            primaryPhone,
            cleanTel,
            cleanCpf || null,
            String(dc.CLI_RG || '').trim(),
            birthYMD,
            String(dc.CLI_EMAIL || '').trim(),
            street,
            String(dc.CLI_NUMERO || '').trim(),
            String(dc.CLI_COMPLEMENTO || '').trim(),
            String(dc.CLI_BAIRRO || '').trim(),
            String(dc.CLI_CIDADE || '').trim(),
            String(dc.CLI_UF || '').trim(),
            sanitizeDigits(dc.CLI_CEP),
            String(dc.CLI_REFERENCIA || '').trim(),
            String(dc.RESPONSAVEL || '').trim(),
            JSON.stringify(buyersSeen),
            generateCardNumber(),
            dfLimit,
            dfDueDay || 20,
            dfDueDay ? 'fixed' : 'auto',
            String(dc.CLI_BLOQUEADO || '').toUpperCase() === 'S' ? 'blocked' : 'active',
            String(dc.CLI_OBSERVACAO || '').trim()
          );
        }
      }

      // D) Recalcular used_limit de todas as contas com base nos caches reais + compras locais
      const allCards = db.prepare('SELECT id, digifarma_cliente_id, customer_id, local_credit_balance FROM belafarma_cards').all();
      const updateUsedStmt = db.prepare('UPDATE belafarma_cards SET used_limit = ?, local_credit_balance = ? WHERE id = ?');

      for (const c of allCards) {
        const dfId = c.digifarma_cliente_id || (c.customer_id && /^\d+$/.test(String(c.customer_id)) ? Number(c.customer_id) : null);
        const dfOpen = dfId ? (openSumByClienteId.get(dfId) || 0) : 0;
        const localRow = db.prepare(
          "SELECT COALESCE(SUM(amount - paid_amount), 0) as total FROM crediario_local_purchases WHERE card_id = ? AND status != 'paid'"
        ).get(c.id);
        const localOpen = round2(localRow?.total || 0);
        // Se Digifarma zerou o saldo lá, zera eventual crédito de compensação pendente aqui
        const nextLocalCredit = dfOpen <= 0 ? 0 : Math.min(dfOpen, Number(c.local_credit_balance || 0));
        const realUsed = Math.max(0, round2(dfOpen + localOpen - nextLocalCredit));
        updateUsedStmt.run(realUsed, nextLocalCredit, c.id);
      }

      const duracaoMs = Date.now() - start;
      db.prepare(`
        INSERT OR REPLACE INTO digifarma_sync_metadata (
          tabela, ultima_sincronizacao, total_registros, duracao_ms, status, mensagem_erro
        ) VALUES ('crediario', datetime('now', 'localtime'), ?, ?, 'ok', NULL)
      `).run(insertedItemsCount, duracaoMs);
    })();

    const duracaoMs = Date.now() - start;
    console.log(`[Crediário Unificado] ✅ Sync concluído em ${duracaoMs}ms (${insertedItemsCount} itens em aberto, ${insertedPaymentsCount} pagamentos desde ${CREDIARIO_CUTOFF_DATE}).`);

    // Notificações automáticas opcionais para compras novas do dia (se habilitado nas configurações)
    const config = getCrediarioConfig(db);
    if (notifyNewPurchases && config.autoNotifyNewPurchase && newlyDetectedSales.length > 0) {
      await notifyDetectedSales(db, newlyDetectedSales, config).catch(err =>
        console.warn('[Crediário Unificado] Aviso ao notificar novas compras:', err.message)
      );
    }

    return {
      success: true,
      offline: false,
      itemsCount: insertedItemsCount,
      paymentsCount: insertedPaymentsCount,
      clientsCount: clientesRows.length,
      duracaoMs
    };
  } catch (err) {
    const duracaoMs = Date.now() - start;
    try {
      db.prepare(`
        INSERT OR REPLACE INTO digifarma_sync_metadata (
          tabela, ultima_sincronizacao, total_registros, duracao_ms, status, mensagem_erro
        ) VALUES ('crediario', datetime('now', 'localtime'), 0, ?, 'erro', ?)
      `).run(duracaoMs, String(err.message));
    } catch (_) {}

    console.warn(`[Crediário Unificado] ⚠️ Digifarma inacessível/timeout (${err.message}). Operando com cache SQLite local.`);
    return {
      success: false,
      offline: true,
      error: err.message,
      duracaoMs
    };
  } finally {
    isSyncingDigifarma = false;
  }
}

async function notifyDetectedSales(db, detectedItems, config) {
  const bySaleKey = new Map();
  for (const item of detectedItems) {
    if (!item.clienteId || !item.saleId) continue;
    const k = `${item.clienteId}_${item.saleId}`;
    if (!bySaleKey.has(k)) bySaleKey.set(k, item.clienteId);
  }

  for (const [key, clienteId] of bySaleKey.entries()) {
    const saleId = key.split('_')[1];
    const card = db.prepare('SELECT id, phone, last_purchase_notified_sale_id FROM belafarma_cards WHERE digifarma_cliente_id = ?').get(clienteId);
    if (!card || !card.phone) continue;
    if (card.last_purchase_notified_sale_id === saleId) continue;

    const alreadySent = db.prepare(
      "SELECT id FROM crediario_message_log WHERE card_id = ? AND template_type = 'purchase' AND sale_id = ? AND status = 'sent'"
    ).get(card.id, saleId);
    if (alreadySent) continue;

    const statementData = buildClientStatement(db, card.id);
    if (!statementData) continue;
    const grp = statementData.simpleStatement.purchaseGroups.find(g => String(g.saleId) === String(saleId));
    const msg = renderWhatsAppMessage('purchase', {
      card: statementData.card,
      financials: statementData.financials,
      simpleStatement: statementData.simpleStatement,
      saleGroup: grp,
      config
    });

    const result = await sendCrediarioWhatsApp(db, {
      cardId: card.id,
      phone: card.phone,
      templateType: 'purchase',
      saleId,
      messageText: msg,
      sentBy: 'Automação BelaFarma'
    });

    if (result.sentViaServer) {
      db.prepare('UPDATE belafarma_cards SET last_purchase_notified_sale_id = ? WHERE id = ?').run(saleId, card.id);
    }
  }
}

// ============================================================================
// Consultas de Perfil, Extrato, Carteira e Lançamentos
// ============================================================================
function findCard(db, idOrToken, { tokenOnly = false } = {}) {
  const key = String(idOrToken || '').trim();
  if (!key) return null;
  if (tokenOnly) {
    if (key.length < 16) return null;
    return db.prepare('SELECT * FROM belafarma_cards WHERE portal_token = ?').get(key) || null;
  }
  let card = null;
  if (/^\d+$/.test(key)) {
    card = db.prepare('SELECT * FROM belafarma_cards WHERE id = ?').get(Number(key));
  }
  if (!card) {
    card = db.prepare('SELECT * FROM belafarma_cards WHERE portal_token = ?').get(key);
  }
  if (!card) {
    card = db.prepare('SELECT * FROM belafarma_cards WHERE customer_id = ? OR digifarma_cliente_id = ?').get(key, Number(key) || -1);
  }
  return card || null;
}

function buildClientStatementByToken(db, token) {
  return buildClientStatement(db, token, { tokenOnly: true });
}

function getDigifarmaDataForCard(db, card) {
  const dfId = card.digifarma_cliente_id || (/^\d+$/.test(String(card.customer_id || '')) ? Number(card.customer_id) : null);
  let dfItems = [];
  let dfPayments = [];

  if (dfId) {
    dfItems = db
      .prepare('SELECT * FROM digifarma_crediario_cache WHERE cliente_id = ? AND (data_compra IS NULL OR substr(data_compra, 1, 10) >= ?) ORDER BY data_compra ASC, id ASC')
      .all(dfId, CREDIARIO_CUTOFF_DATE);
    dfPayments = db
      .prepare('SELECT * FROM digifarma_crediario_pagamentos_cache WHERE cliente_id = ? AND (data_pag IS NULL OR substr(data_pag, 1, 10) >= ?) ORDER BY data_pag DESC, contrec_id DESC')
      .all(dfId, CREDIARIO_CUTOFF_DATE);
  }

  const localPurchases = db
    .prepare('SELECT * FROM crediario_local_purchases WHERE card_id = ? AND (purchased_at IS NULL OR substr(purchased_at, 1, 10) >= ?) ORDER BY purchased_at ASC')
    .all(card.id, CREDIARIO_CUTOFF_DATE);
  const localPayments = db
    .prepare('SELECT * FROM card_payments WHERE card_id = ? AND (paid_at IS NULL OR substr(paid_at, 1, 10) >= ?) ORDER BY paid_at DESC, id DESC')
    .all(card.id, CREDIARIO_CUTOFF_DATE);
  return { dfItems, dfPayments, localPurchases, localPayments };
}

function getSyncMetadata(db) {
  try {
    return db.prepare("SELECT * FROM digifarma_sync_metadata WHERE tabela = 'crediario'").get() || null;
  } catch (_) {
    return null;
  }
}

function buildClientStatement(db, idOrToken, opts = {}) {
  ensurePortalTokens(db);
  const card = findCard(db, idOrToken, opts);
  if (!card) return null;

  const config = getCrediarioConfig(db);
  const { dfItems, dfPayments, localPurchases, localPayments } = getDigifarmaDataForCard(db, card);
  const financials = calculateAccountFinancials(card, dfItems, localPurchases, config);
  const paymentEvents = normalizePaymentEvents(dfPayments, localPayments);
  const simpleStatement = buildSimpleStatement(financials, paymentEvents);
  const completeStatement = buildCompleteStatement(financials, paymentEvents, simpleStatement.purchaseGroups);

  let messageHistory = [];
  try {
    messageHistory = db.prepare(
      'SELECT * FROM crediario_message_log WHERE card_id = ? ORDER BY created_at DESC, id DESC LIMIT 30'
    ).all(card.id);
  } catch (_) {}

  const portalUrl = `${config.publicBaseUrl}/minha-conta/${card.portal_token}`;

  let pixBrCode = '';
  if (config.pixKey && financials.totalBalance > 0) {
    try {
      pixBrCode = generatePixBrCode({
        pixKey: config.pixKey,
        merchantName: config.pixMerchantName,
        merchantCity: config.pixMerchantCity,
        amount: financials.totalBalance,
        txid: `BFCREDIARIO${card.id}`
      });
    } catch (_) {}
  }

  const enrichedCard = {
    ...card,
    authorized_buyers: parseAuthorizedBuyers(card.authorized_buyers),
    has_cpf: Boolean(sanitizeDigits(card.cpf).length >= 3),
    has_phone: Boolean(sanitizeDigits(card.phone).length >= 4),
    portal_url: portalUrl
  };

  return {
    card: enrichedCard,
    financials,
    simpleStatement,
    completeStatement,
    messageHistory,
    portalUrl,
    pix: {
      pixKey: config.pixKey,
      merchantName: config.pixMerchantName,
      merchantCity: config.pixMerchantCity,
      brcode: pixBrCode
    },
    configPublic: {
      interestEnabled: config.interestEnabled,
      lateFinePercent: config.lateFinePercent,
      lateInterestMonthlyPercent: config.lateInterestMonthlyPercent,
      graceDays: config.graceDays,
      storeWhatsapp: config.storeWhatsapp
    }
  };
}

function listUnifiedClients(db, { q = '', filter = 'all', onlyCurrentYear = false } = {}) {
  ensurePortalTokens(db);
  const config = getCrediarioConfig(db);
  const cards = db.prepare('SELECT * FROM belafarma_cards ORDER BY customer_name ASC').all();

  const dfItemsAll = db
    .prepare('SELECT * FROM digifarma_crediario_cache WHERE (data_compra IS NULL OR substr(data_compra, 1, 10) >= ?) ORDER BY data_compra ASC, id ASC')
    .all(CREDIARIO_CUTOFF_DATE);
  const localPurchasesAll = db
    .prepare('SELECT * FROM crediario_local_purchases WHERE (purchased_at IS NULL OR substr(purchased_at, 1, 10) >= ?) ORDER BY purchased_at ASC')
    .all(CREDIARIO_CUTOFF_DATE);
  const dfPaymentsAll = db
    .prepare('SELECT cliente_id, valor_pago, data_pag, contrec_id FROM digifarma_crediario_pagamentos_cache WHERE (data_pag IS NULL OR substr(data_pag, 1, 10) >= ?)')
    .all(CREDIARIO_CUTOFF_DATE);
  const localPaymentsAll = db
    .prepare('SELECT card_id, amount, paid_at FROM card_payments WHERE (paid_at IS NULL OR substr(paid_at, 1, 10) >= ?)')
    .all(CREDIARIO_CUTOFF_DATE);

  const dfByCli = new Map();
  for (const it of dfItemsAll) {
    if (!it.cliente_id) continue;
    const cid = Number(it.cliente_id);
    if (!dfByCli.has(cid)) dfByCli.set(cid, []);
    dfByCli.get(cid).push(it);
  }

  const localByCard = new Map();
  for (const lp of localPurchasesAll) {
    if (!localByCard.has(lp.card_id)) localByCard.set(lp.card_id, []);
    localByCard.get(lp.card_id).push(lp);
  }

  const localPayByCard = new Map();
  for (const lp of localPaymentsAll) {
    if (!localPayByCard.has(lp.card_id)) localPayByCard.set(lp.card_id, []);
    localPayByCard.get(lp.card_id).push(lp);
  }

  const lastPaymentByCli = new Map();
  for (const p of dfPaymentsAll) {
    const cid = Number(p.cliente_id);
    const d = toLocalDateYMD(p.data_pag);
    const prev = lastPaymentByCli.get(cid);
    if (!prev || d > prev.date) {
      lastPaymentByCli.set(cid, { date: d, amount: round2(p.valor_pago) });
    }
  }

  const todayYMD = toLocalDateYMD(new Date());
  const currentYear = todayYMD.slice(0, 4);
  const yearStartYMD = `${currentYear}-01-01`;
  const currentMonthPrefix = todayYMD.slice(0, 7);

  // Recebido no mês (Digifarma + local sem duplicação evidente)
  let paidThisMonth = 0;
  for (const p of dfPaymentsAll) {
    if (toLocalDateYMD(p.data_pag).startsWith(currentMonthPrefix)) {
      paidThisMonth = round2(paidThisMonth + Number(p.valor_pago || 0));
    }
  }
  for (const lp of localPaymentsAll) {
    if (toLocalDateYMD(lp.paid_at).startsWith(currentMonthPrefix)) {
      paidThisMonth = round2(paidThisMonth + Number(lp.amount || 0));
    }
  }

  let kpiTotalPrincipal = 0;
  let kpiTotalCharges = 0;
  let kpiTotalOverdue = 0;
  let kpiOverdueClients = 0;
  let kpiActiveOpenClients = 0;

  const computed = cards.map(card => {
    const dfId = card.digifarma_cliente_id || (/^\d+$/.test(String(card.customer_id || '')) ? Number(card.customer_id) : null);
    const dfItems = dfId ? (dfByCli.get(dfId) || []) : [];
    const localPurchases = localByCard.get(card.id) || [];
    const localPayments = localPayByCard.get(card.id) || [];
    const fin = calculateAccountFinancials(card, dfItems, localPurchases, config);

    const boughtToday = fin.openItems.some(it => it.purchaseDate === todayYMD);
    const lastPay = dfId ? lastPaymentByCli.get(dfId) || null : null;

    const movementDates = [];
    for (const it of dfItems) {
      const d = toLocalDateYMD(it.data_compra);
      if (d) movementDates.push(d);
    }
    for (const lp of localPurchases) {
      const d = toLocalDateYMD(lp.purchased_at);
      if (d) movementDates.push(d);
    }
    if (lastPay?.date) movementDates.push(lastPay.date);
    for (const lpay of localPayments) {
      const d = toLocalDateYMD(lpay.paid_at);
      if (d) movementDates.push(d);
    }
    movementDates.sort();
    const lastMovementDate = movementDates.length > 0 ? movementDates[movementDates.length - 1] : '';
    const hasMovementThisYear = Boolean(lastMovementDate && lastMovementDate >= yearStartYMD);

    const cleanCpf = sanitizeDigits(card.cpf);
    const cleanPhone = sanitizeDigits(card.phone);
    const missingContact = cleanCpf.length < 11 || cleanPhone.length < 8;

    return {
      id: card.id,
      digifarma_cliente_id: dfId,
      customer_id: card.customer_id,
      portal_token: card.portal_token,
      portal_url: `${config.publicBaseUrl}/minha-conta/${card.portal_token}`,
      customer_name: card.customer_name,
      nickname: card.nickname || '',
      phone: card.phone || '',
      cpf: card.cpf || '',
      responsible_name: card.responsible_name || '',
      authorized_buyers: parseAuthorizedBuyers(card.authorized_buyers),
      due_day: card.due_day,
      due_day_mode: card.due_day_mode || 'auto',
      credit_limit: fin.creditLimit,
      principal_balance: fin.principalBalance,
      late_fine: fin.lateFine,
      late_interest: fin.lateInterest,
      total_charges: fin.totalCharges,
      simulated_charges: fin.simulatedCharges,
      total_balance: fin.totalBalance,
      available_credit: fin.availableCredit,
      overdue_principal: fin.overduePrincipal,
      max_days_late: fin.maxDaysLate,
      next_due_date: fin.nextDueDate,
      open_items_count: fin.openItemsCount,
      account_status: fin.accountStatus,
      is_blocked: fin.isBlocked,
      interest_exempt: fin.interestExempt,
      bought_today: boughtToday,
      missing_contact: missingContact,
      has_movement_this_year: hasMovementThisYear,
      last_movement_date: lastMovementDate,
      last_payment: lastPay
    };
  });

  // Ordenação padrão: vencidos com maior atraso/saldo primeiro, depois quem tem saldo, depois alfabético
  computed.sort((a, b) => {
    if (b.max_days_late !== a.max_days_late) return b.max_days_late - a.max_days_late;
    if (b.total_balance !== a.total_balance) return b.total_balance - a.total_balance;
    return a.customer_name.localeCompare(b.customer_name);
  });

  const activeThisYearCount = computed.filter(c => c.has_movement_this_year).length;
  const applyYearScope = Boolean(onlyCurrentYear) || filter === 'movimento_ano';
  const scoped = applyYearScope ? computed.filter(c => c.has_movement_this_year) : computed;

  for (const c of scoped) {
    kpiTotalPrincipal = round2(kpiTotalPrincipal + c.principal_balance);
    kpiTotalCharges = round2(kpiTotalCharges + c.total_charges);
    if (c.overdue_principal > 0) {
      kpiTotalOverdue = round2(kpiTotalOverdue + c.overdue_principal + c.total_charges);
      kpiOverdueClients++;
    }
    if (c.principal_balance > 0) kpiActiveOpenClients++;
  }

  const cleanQ = String(q || '').trim().toLowerCase();
  const digitsQ = sanitizeDigits(q);

  const filtered = scoped.filter(c => {
    if (cleanQ) {
      const nameMatch = c.customer_name.toLowerCase().includes(cleanQ) || c.nickname.toLowerCase().includes(cleanQ);
      const buyerMatch = c.authorized_buyers.some(b => String(b).toLowerCase().includes(cleanQ));
      const digitMatch = digitsQ.length >= 2 && (sanitizeDigits(c.phone).includes(digitsQ) || sanitizeDigits(c.cpf).includes(digitsQ));
      if (!nameMatch && !buyerMatch && !digitMatch) return false;
    }

    if (filter === 'movimento_ano') return c.has_movement_this_year;
    if (filter === 'vencidos') return c.overdue_principal > 0;
    if (filter === 'em_dia') return c.principal_balance > 0 && c.overdue_principal <= 0 && !c.is_blocked;
    if (filter === 'compras_hoje') return c.bought_today;
    if (filter === 'bloqueados') return c.is_blocked;
    if (filter === 'incompletos') return c.missing_contact && c.principal_balance > 0;
    if (filter === 'com_saldo') return c.principal_balance > 0;
    return true;
  });

  return {
    clients: filtered,
    kpis: {
      totalPrincipal: kpiTotalPrincipal,
      totalCharges: kpiTotalCharges,
      totalReceivable: round2(kpiTotalPrincipal + kpiTotalCharges),
      totalOverdue: kpiTotalOverdue,
      overdueClientsCount: kpiOverdueClients,
      activeOpenClientsCount: kpiActiveOpenClients,
      activeThisYearClientsCount: activeThisYearCount,
      currentYear: Number(currentYear),
      totalClientsCount: scoped.length,
      allClientsCount: computed.length,
      onlyCurrentYear: applyYearScope,
      paidThisMonth,
      interestEnabled: config.interestEnabled
    },
    sync: getSyncMetadata(db)
  };
}

function listUnifiedTransactions(db, { periodDays = 60, q = '' } = {}) {
  const rawCutoff = addDaysYMD(toLocalDateYMD(new Date()), -Math.max(1, Number(periodDays || 60)));
  const effectiveCutoff = rawCutoff < CREDIARIO_CUTOFF_DATE ? CREDIARIO_CUTOFF_DATE : rawCutoff;
  const cards = db.prepare('SELECT id, digifarma_cliente_id, customer_name, phone FROM belafarma_cards').all();
  const cardByDfId = new Map();
  const cardById = new Map();
  for (const c of cards) {
    cardById.set(c.id, c);
    if (c.digifarma_cliente_id) cardByDfId.set(Number(c.digifarma_cliente_id), c);
  }

  // Compras em aberto (agrupadas por venda) respeitando o corte global (>= 01/10/2025)
  const dfItems = db
    .prepare('SELECT * FROM digifarma_crediario_cache WHERE (data_compra IS NULL OR substr(data_compra, 1, 10) >= ?) ORDER BY data_compra DESC, id ASC')
    .all(effectiveCutoff);
  const localPurchases = db
    .prepare('SELECT * FROM crediario_local_purchases WHERE (purchased_at IS NULL OR substr(purchased_at, 1, 10) >= ?) ORDER BY purchased_at DESC')
    .all(effectiveCutoff);

  const purchasesMap = new Map();
  for (const it of dfItems) {
    const dYMD = toLocalDateYMD(it.data_compra);
    if (dYMD && dYMD < effectiveCutoff) continue;
    const card = cardByDfId.get(Number(it.cliente_id));
    const saleKey = `df_${it.cliente_id}_${it.venda_nota_id || it.id}`;
    if (!purchasesMap.has(saleKey)) {
      purchasesMap.set(saleKey, {
        id: saleKey,
        cardId: card?.id || null,
        clientName: card?.customer_name || it.cliente_nome || 'Cliente',
        phone: card?.phone || it.telefone || '',
        saleId: it.venda_nota_id ? String(it.venda_nota_id) : String(it.id),
        date: dYMD,
        dueDate: toLocalDateYMD(it.data_vencimento),
        buyerName: String(it.comprador || '').trim(),
        source: 'DIGIFARMA',
        totalAmount: 0,
        items: []
      });
    }
    const g = purchasesMap.get(saleKey);
    const qty = Number(it.quantidade || 1);
    const lineVal = round2(Number(it.valor || 0));
    g.totalAmount = round2(g.totalAmount + lineVal);
    g.items.push({
      productName: it.produto_nome || `Item #${it.produto_id || it.id}`,
      quantity: qty,
      amount: lineVal
    });
  }

  for (const lp of localPurchases) {
    const dYMD = toLocalDateYMD(lp.purchased_at);
    if (dYMD && dYMD < effectiveCutoff) continue;
    const card = cardById.get(lp.card_id);
    const key = `loc_${lp.id}`;
    let parsedItems = [];
    try {
      const rawParsed = JSON.parse(lp.items_json || '[]');
      if (Array.isArray(rawParsed) && rawParsed.length > 0) {
        parsedItems = rawParsed.map(it => ({
          productName: it.productName || it.description || lp.description,
          quantity: Number(it.quantity || 1),
          amount: round2(it.amount ?? lp.amount)
        }));
      }
    } catch (_) {}
    if (parsedItems.length === 0) {
      parsedItems = [{ productName: lp.description, quantity: 1, amount: round2(lp.amount) }];
    }
    purchasesMap.set(key, {
      id: key,
      cardId: lp.card_id,
      clientName: card?.customer_name || 'Cliente',
      phone: card?.phone || '',
      saleId: lp.sale_id || lp.id,
      date: dYMD,
      dueDate: toLocalDateYMD(lp.due_date),
      buyerName: lp.buyer_name || '',
      source: 'BELINHA',
      totalAmount: round2(lp.amount),
      items: parsedItems
    });
  }

  // Pagamentos recebidos no período (>= effectiveCutoff)
  const dfPayments = db
    .prepare('SELECT * FROM digifarma_crediario_pagamentos_cache WHERE substr(data_pag, 1, 10) >= ? ORDER BY data_pag DESC LIMIT 200')
    .all(effectiveCutoff);
  const localPayments = db
    .prepare('SELECT * FROM card_payments WHERE substr(paid_at, 1, 10) >= ? ORDER BY paid_at DESC LIMIT 200')
    .all(effectiveCutoff);

  const payments = [];
  for (const p of dfPayments) {
    const card = cardByDfId.get(Number(p.cliente_id));
    let method = 'Dinheiro';
    if (Number(p.cartao || 0) > 0 && Number(p.dinheiro || 0) <= 0) method = 'Cartão';
    else if (Number(p.dinheiro || 0) <= 0 && Number(p.cartao || 0) <= 0) method = 'Baixa Caixa / PIX';

    payments.push({
      id: `df_pag_${p.contrec_id}`,
      cardId: card?.id || null,
      clientName: card?.customer_name || `Cliente #${p.cliente_id}`,
      date: toLocalDateYMD(p.data_pag),
      amount: round2(p.valor_pago),
      debtBefore: round2(p.total_debito),
      isFullSettlement: String(p.tipo_pag || '').toUpperCase() === 'T' || Math.abs(Number(p.total_debito || 0) - Number(p.valor_pago || 0)) <= 0.05,
      method,
      source: 'DIGIFARMA'
    });
  }

  for (const lp of localPayments) {
    const card = cardById.get(lp.card_id);
    payments.push({
      id: `loc_pag_${lp.id}`,
      cardId: lp.card_id,
      clientName: card?.customer_name || `Conta #${lp.card_id}`,
      date: toLocalDateYMD(lp.paid_at || lp.created_at),
      amount: round2(lp.amount),
      debtBefore: 0,
      isFullSettlement: Boolean(lp.is_full_settlement),
      method: lp.payment_method || 'BALCÃO',
      source: 'BELINHA'
    });
  }

  const term = String(q || '').trim().toLowerCase();
  const purchases = Array.from(purchasesMap.values())
    .filter(p => !term || p.clientName.toLowerCase().includes(term) || p.buyerName.toLowerCase().includes(term) || p.items.some(i => i.productName.toLowerCase().includes(term)))
    .sort((a, b) => b.date.localeCompare(a.date));

  const filteredPayments = payments
    .filter(p => !term || p.clientName.toLowerCase().includes(term) || p.method.toLowerCase().includes(term))
    .sort((a, b) => b.date.localeCompare(a.date));

  return { purchases, payments: filteredPayments };
}

// ============================================================================
// Mensagens WhatsApp & Impressão Térmica 80mm
// ============================================================================
function renderWhatsAppMessage(templateType, { card, financials, simpleStatement, saleGroup, config }) {
  const templates = { ...DEFAULT_TEMPLATES, ...(config?.templates || {}) };
  const template = templates[templateType] || templates.statement;

  const fullName = String(card.customer_name || 'Cliente').trim();
  const firstName = fullName.split(/\s+/)[0] || 'Cliente';
  const portalUrl = `${config.publicBaseUrl || DEFAULT_CONFIG.publicBaseUrl}/minha-conta/${card.portal_token}`;

  const targetGroup = saleGroup || simpleStatement?.purchaseGroups?.[simpleStatement.purchaseGroups.length - 1] || null;
  const valorCompra = targetGroup ? formatCurrency(targetGroup.subtotal) : formatCurrency(financials.principalBalance);

  let itensCompra = '';
  if (targetGroup && targetGroup.items.length > 0) {
    itensCompra = targetGroup.items
      .slice(0, 10)
      .map(it => `• ${it.quantity}x ${it.productName} — ${formatCurrency(it.totalPrice)}`)
      .join('\n');
    if (targetGroup.items.length > 10) {
      itensCompra += `\n... e mais ${targetGroup.items.length - 10} item(ns)`;
    }
    if (targetGroup.buyerName) {
      itensCompra = `_(Retirado por: ${targetGroup.buyerName})_\n${itensCompra}`;
    }
  } else {
    itensCompra = '• Compras registradas no balcão da farmácia';
  }

  const resumoMarco = simpleStatement?.milestone
    ? `📌 *${simpleStatement.milestone.label}*\n${simpleStatement.milestone.sublabel}\n`
    : '';

  let pixBr = '';
  try {
    if (config.pixKey && financials.totalBalance > 0) {
      pixBr = generatePixBrCode({
        pixKey: config.pixKey,
        merchantName: config.pixMerchantName,
        merchantCity: config.pixMerchantCity,
        amount: financials.totalBalance,
        txid: `BFCREDIARIO${card.id}`
      });
    }
  } catch (_) {}

  const replacements = {
    '{nome}': fullName,
    '{primeiro_nome}': firstName,
    '{valor_compra}': valorCompra,
    '{itens_compra}': itensCompra,
    '{resumo_marco}': resumoMarco,
    '{saldo_atual}': formatCurrency(financials.totalBalance),
    '{vencimento}': financials.nextDueDate ? formatDateBR(financials.nextDueDate) : `Todo dia ${card.due_day || 20}`,
    '{link_portal}': portalUrl,
    '{chave_pix}': config.pixKey || '31.144.152/0001-44',
    '{pix_copia_cola}': pixBr || config.pixKey || '31.144.152/0001-44',
    '{dias_atraso}': String(financials.maxDaysLate || 0)
  };

  let output = template;
  for (const [token, val] of Object.entries(replacements)) {
    output = output.split(token).join(val);
  }
  return output;
}

async function sendCrediarioWhatsApp(db, { cardId, phone, templateType = 'statement', saleId = '', messageText, channel = 'auto', sentBy = 'Operador' }) {
  const card = findCard(db, cardId);
  if (!card) throw new Error('Conta de crediário não encontrada.');

  const targetPhone = phone || card.phone;
  const cleanPhone = normalizePhoneBr(targetPhone);
  const waMeUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`
    : `https://wa.me/?text=${encodeURIComponent(messageText)}`;

  // Se o operador apenas registrou envio pelo WhatsApp Web ou Cópia
  if (channel === 'wa_me' || channel === 'copy') {
    db.prepare(`
      INSERT INTO crediario_message_log (card_id, phone, template_type, sale_id, message_text, channel, status, sent_by)
      VALUES (?, ?, ?, ?, ?, ?, 'opened', ?)
    `).run(card.id, cleanPhone || targetPhone || '', templateType, saleId || '', messageText, channel, sentBy);

    return {
      success: true,
      sentViaServer: false,
      channel,
      waMeUrl,
      messageText
    };
  }

  if (!cleanPhone) {
    return {
      success: false,
      sentViaServer: false,
      channel: 'none',
      waMeUrl,
      messageText,
      error: 'Cliente sem número de WhatsApp cadastrado.'
    };
  }

  let sentChannel = null;
  let lastErr = '';

  // 1. Tentar Baileys conectado
  try {
    const baileys = require('../baileys-service');
    const status = typeof baileys.getStatus === 'function' ? baileys.getStatus() : { connected: false };
    if (status && status.connected && typeof baileys.sendText === 'function') {
      await baileys.sendText(cleanPhone, messageText);
      sentChannel = 'baileys';
    } else {
      lastErr = 'WhatsApp do servidor (Baileys) não está conectado.';
    }
  } catch (e) {
    lastErr = e.message;
  }

  // 2. Fallback Evolution API sem gerar arquivo pendente na fila de retry
  if (!sentChannel) {
    try {
      const msgSender = require('./message-sender.service');
      if (msgSender && typeof msgSender.sendMessage === 'function') {
        const resEvo = await msgSender.sendMessage(`+${cleanPhone}`, messageText, true);
        if (resEvo && resEvo.success) {
          sentChannel = 'evolution';
        } else if (resEvo?.error) {
          lastErr = resEvo.error;
        }
      }
    } catch (e) {
      lastErr = e.message;
    }
  }

  db.prepare(`
    INSERT INTO crediario_message_log (card_id, phone, template_type, sale_id, message_text, channel, status, error_message, sent_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    card.id,
    cleanPhone,
    templateType,
    saleId || '',
    messageText,
    sentChannel || 'server',
    sentChannel ? 'sent' : 'failed',
    sentChannel ? null : lastErr,
    sentBy
  );

  return {
    success: Boolean(sentChannel),
    sentViaServer: Boolean(sentChannel),
    channel: sentChannel || 'failed',
    waMeUrl,
    messageText,
    error: sentChannel ? null : `${lastErr} Use o botão "Abrir WhatsApp Web" ou "Copiar Mensagem".`
  };
}

function buildThermalReceiptHtml(statementData, mode = 'simple') {
  const { card, financials, simpleStatement, completeStatement, pix } = statementData;
  const nowStr = new Date().toLocaleString('pt-BR');

  let bodyHtml = '';

  if (mode === 'simple') {
    bodyHtml += `
      <div style="border: 1.5px solid #000; padding: 6px; margin-bottom: 8px; background: #f8fafc;">
        <div style="font-weight: 900; font-size: 12px;">${escapeHtml(simpleStatement.milestone.label)}</div>
        <div style="font-size: 11px; margin-top: 2px;">${escapeHtml(simpleStatement.milestone.sublabel)}</div>
      </div>
      <div style="font-weight: 900; font-size: 11px; margin-bottom: 4px; text-transform: uppercase; border-bottom: 1px solid #000;">
        Compras em Aberto:
      </div>
    `;

    if (simpleStatement.purchaseGroups.length === 0) {
      bodyHtml += `<div style="font-size: 11px; padding: 4px 0;">Nenhum débito em aberto.</div>`;
    } else {
      for (const grp of simpleStatement.purchaseGroups) {
        const buyer = grp.buyerName ? ` (${escapeHtml(grp.buyerName)})` : '';
        bodyHtml += `
          <div style="margin-bottom: 6px; border-bottom: 1px dashed #666; padding-bottom: 4px;">
            <div style="font-weight: 900; font-size: 11px;">${formatDateBR(grp.date)}${buyer}</div>
            ${grp.items.map(it => `
              <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px;">
                <span>${it.quantity}x ${escapeHtml(it.productName).slice(0, 26)}</span>
                <span style="font-weight: bold;">${formatCurrency(it.totalPrice)}</span>
              </div>
            `).join('')}
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 900; margin-top: 2px;">
              <span>Subtotal compra:</span>
              <span>${formatCurrency(grp.subtotal)}</span>
            </div>
          </div>
        `;
      }
    }
  } else {
    bodyHtml += `
      <div style="font-weight: 900; font-size: 11px; margin-bottom: 4px; text-transform: uppercase; border-bottom: 1px solid #000;">
        Extrato Completo (Auditoria):
      </div>
    `;
    for (const entry of completeStatement.entries.slice(-30)) {
      const sign = entry.type === 'CREDITO' ? '-' : '+';
      bodyHtml += `
        <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 3px; border-bottom: 1px dotted #999; padding-bottom: 2px;">
          <span style="max-width: 190px;">${formatDateBR(entry.date)} ${escapeHtml(entry.title).slice(0, 28)}</span>
          <span style="font-weight: bold;">${sign} ${formatCurrency(entry.amount)}</span>
        </div>
      `;
    }
  }

  return `
    <div style="font-family: monospace, sans-serif; width: 280px; font-size: 12px; color: #000; line-height: 1.35; padding: 4px;">
      <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
        <div style="font-weight: 900; font-size: 15px;">DROGARIA BELAFARMA</div>
        <div style="font-size: 11px; font-weight: bold;">EXTRATO DO CREDIÁRIO (${mode === 'simple' ? 'SIMPLES' : 'COMPLETO'})</div>
        <div style="font-size: 10px;">Emitido em ${nowStr}</div>
      </div>

      <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; font-size: 11px;">
        <div><strong>CLIENTE:</strong> ${escapeHtml(card.customer_name)}</div>
        ${card.cpf ? `<div><strong>CPF:</strong> ${escapeHtml(card.cpf)}</div>` : ''}
        ${card.phone ? `<div><strong>WHATSAPP:</strong> ${escapeHtml(card.phone)}</div>` : ''}
        <div><strong>VENCIMENTO:</strong> ${financials.nextDueDate ? formatDateBR(financials.nextDueDate) : `Todo dia ${card.due_day}`}</div>
      </div>

      ${bodyHtml}

      <div style="border-top: 2px solid #000; padding-top: 6px; margin-top: 6px;">
        ${financials.totalCharges > 0 ? `
          <div style="display: flex; justify-content: space-between; font-size: 11px;">
            <span>Compras em aberto:</span>
            <span>${formatCurrency(financials.principalBalance)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px;">
            <span>Multa e juros atraso:</span>
            <span>${formatCurrency(financials.totalCharges)}</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; margin-top: 3px;">
          <span>TOTAL A PAGAR:</span>
          <span>${formatCurrency(financials.totalBalance)}</span>
        </div>
      </div>

      <div style="text-align: center; border-top: 1px dashed #000; margin-top: 8px; padding-top: 6px; font-size: 10px;">
        <div><strong>PAGUE VIA PIX (CHAVE):</strong></div>
        <div style="font-weight: 900; font-size: 12px; margin: 2px 0;">${escapeHtml(pix.pixKey || '31.144.152/0001-44')}</div>
        <div>Ou no caixa da Bela Farma. Obrigado!</div>
      </div>
    </div>
  `;
}

// ============================================================================
// Lançamento de Compra e Recebimento no Belinha (+ Baixa Digifarma)
// ============================================================================
function createLocalPurchase(db, {
  cardId,
  amount,
  unitPrice,
  quantity = 1,
  description,
  buyerName = '',
  saleId = '',
  dueDate = '',
  createdBy = 'Balcão',
  bypassLock = false,
  isAnnotation = false
}) {
  const card = findCard(db, cardId);
  if (!card) throw new Error('Conta de crediário não encontrada.');

  const cleanDesc = String(description || '').trim();
  if (isAnnotation && !cleanDesc) {
    throw new Error('Informe a descrição do produto ou anotação.');
  }
  const finalDesc = cleanDesc || 'Compra no Balcão';

  const qty = Math.max(1, Number(quantity) || 1);
  let unitVal = 0;
  let val = 0;
  if (unitPrice !== undefined && unitPrice !== null && Number(unitPrice) > 0) {
    unitVal = round2(unitPrice);
    val = round2(qty * unitVal);
  } else {
    val = round2(amount);
    unitVal = qty > 0 ? round2(val / qty) : val;
  }
  if (val <= 0) throw new Error('Informe um preço/valor válido maior que zero.');

  const config = getCrediarioConfig(db);
  const { dfItems, localPurchases } = getDigifarmaDataForCard(db, card);
  const fin = calculateAccountFinancials(card, dfItems, localPurchases, config);

  const isManuallyBlocked = card.status === 'blocked' || card.status === 'blocked_late';
  if ((isAnnotation ? isManuallyBlocked : fin.isBlocked) && !bypassLock) {
    throw new Error('Cliente está com o crediário bloqueado. Apenas Administrador pode liberar.');
  }
  const exceededLimit = val > fin.availableCredit;
  if (!isAnnotation && exceededLimit && !bypassLock) {
    throw new Error(`Limite insuficiente. Disponível: ${formatCurrency(fin.availableCredit)}.`);
  }

  const todayYMD = toLocalDateYMD(new Date());
  const computedDue = dueDate
    ? toLocalDateYMD(dueDate)
    : (card.due_day_mode === 'fixed'
      ? computeFixedDueDate(todayYMD, card.due_day, card.closing_offset_days || 10)
      : addDaysYMD(todayYMD, 30));

  const id = `lp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const itemsJson = JSON.stringify([
    {
      productName: finalDesc,
      description: finalDesc,
      quantity: qty,
      unitPrice: unitVal,
      amount: val
    }
  ]);

  db.prepare(`
    INSERT INTO crediario_local_purchases (
      id, card_id, sale_id, buyer_name, description, items_json, amount, paid_amount, status, purchased_at, due_date, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'open', datetime('now', 'localtime'), ?, ?)
  `).run(
    id,
    card.id,
    saleId || `BEL-${Date.now().toString().slice(-6)}`,
    String(buyerName || '').trim().toUpperCase(),
    finalDesc,
    itemsJson,
    val,
    computedDue,
    createdBy
  );

  db.prepare("UPDATE belafarma_cards SET used_limit = used_limit + ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
    .run(val, card.id);

  return {
    success: true,
    purchaseId: id,
    description: finalDesc,
    quantity: qty,
    unitPrice: unitVal,
    amount: val,
    newBalance: round2(fin.totalBalance + val),
    dueDate: computedDue,
    exceededLimit
  };
}

function deleteLocalPurchase(db, { cardId, purchaseId, isAdmin = false }) {
  const card = findCard(db, cardId);
  if (!card) throw new Error('Conta de crediário não encontrada.');

  const lp = db
    .prepare('SELECT * FROM crediario_local_purchases WHERE id = ? AND card_id = ?')
    .get(String(purchaseId), card.id);
  if (!lp) throw new Error('Anotação/compra não encontrada.');

  if (lp.status === 'paid' || Number(lp.paid_amount || 0) > 0) {
    throw new Error('Não é possível excluir uma anotação que já possui pagamento.');
  }

  const todayYMD = toLocalDateYMD(new Date());
  const purchaseYMD = toLocalDateYMD(lp.purchased_at);
  if (!isAdmin && purchaseYMD && purchaseYMD !== todayYMD) {
    const err = new Error('Apenas Administradores podem excluir anotações de dias anteriores.');
    err.code = 'FORBIDDEN_DELETE_OLD_PURCHASE';
    throw err;
  }

  db.transaction(() => {
    db.prepare('DELETE FROM crediario_local_purchases WHERE id = ? AND card_id = ?').run(lp.id, card.id);
    db.prepare("UPDATE belafarma_cards SET used_limit = MAX(0, used_limit - ?), updated_at = datetime('now', 'localtime') WHERE id = ?")
      .run(round2(lp.amount || 0), card.id);
  })();

  return { success: true, deletedId: lp.id };
}

async function receiveCrediarioPayment(db, {
  cardId,
  amount,
  paymentMethod = 'DINHEIRO',
  waiveInterest = false,
  waivedInterestAmount = 0,
  itemIds = [],
  notes = '',
  operatorName = 'Balcão',
  isAdmin = false
}) {
  const card = findCard(db, cardId);
  if (!card) throw new Error('Conta de crediário não encontrada.');

  const payVal = round2(amount);
  const requestedWaive = waiveInterest || Number(waivedInterestAmount || 0) > 0;
  if (requestedWaive && !isAdmin) {
    throw new Error('FORBIDDEN_WAIVE_INTEREST');
  }
  if (payVal <= 0 && !requestedWaive) {
    throw new Error('Valor do pagamento deve ser maior que zero.');
  }

  const config = getCrediarioConfig(db);
  const { dfItems, localPurchases } = getDigifarmaDataForCard(db, card);
  const fin = calculateAccountFinancials(card, dfItems, localPurchases, config);

  const chargesDue = fin.totalCharges;
  let waivedAmount = 0;
  if (requestedWaive) {
    waivedAmount = Number(waivedInterestAmount) > 0 ? Math.min(chargesDue, round2(waivedInterestAmount)) : chargesDue;
  }
  const effectiveChargesDue = Math.max(0, round2(chargesDue - waivedAmount));
  const totalRequiredToZero = round2(fin.principalBalance + effectiveChargesDue);
  const isFullSettlement = payVal + 0.05 >= totalRequiredToZero && fin.principalBalance > 0;

  let remainingToAllocate = payVal;
  const paidCharges = Math.min(remainingToAllocate, effectiveChargesDue);
  remainingToAllocate = round2(remainingToAllocate - paidCharges);

  // 1. Abater compras locais (FIFO)
  db.transaction(() => {
    for (const lp of localPurchases) {
      if (lp.status === 'paid' || remainingToAllocate <= 0) continue;
      const openVal = round2(Number(lp.amount) - Number(lp.paid_amount || 0));
      if (openVal <= 0) continue;

      const payOnLp = Math.min(remainingToAllocate, openVal);
      const nextPaid = round2(Number(lp.paid_amount || 0) + payOnLp);
      const nextStatus = nextPaid >= Number(lp.amount) - 0.01 ? 'paid' : 'partial';

      db.prepare('UPDATE crediario_local_purchases SET paid_amount = ?, status = ? WHERE id = ?')
        .run(nextPaid, nextStatus, lp.id);
      remainingToAllocate = round2(remainingToAllocate - payOnLp);
    }
  })();

  // 2. Dar baixa de itens específicos do Digifarma (ou todos se quitação total) quando Digifarma acessível
  const selectedDfIds = Array.isArray(itemIds)
    ? itemIds.map(id => String(id).replace(/^df_/, '')).filter(Boolean)
    : [];

  let dfItemsToClose = [];
  if (isFullSettlement) {
    dfItemsToClose = dfItems.map(i => String(i.id));
  } else if (selectedDfIds.length > 0) {
    dfItemsToClose = selectedDfIds;
  }

  let syncedDigifarmaCount = 0;
  let digifarmaOfflineWarning = null;

  if (dfItemsToClose.length > 0) {
    const dfIdSet = new Set(dfItemsToClose);
    const matchedDfRows = dfItems.filter(it => dfIdSet.has(String(it.id)));

    for (const row of matchedDfRows) {
      const itemVal = round2(Number(row.valor || 0));
      if (!isFullSettlement && remainingToAllocate + 0.05 < itemVal && selectedDfIds.length === 0) {
        continue;
      }
      try {
        await queryDigifarma('DELETE FROM FICHARIO WHERE FICHARIO_ID = ?', [Number(row.id)], 5000);
        db.prepare('DELETE FROM digifarma_crediario_cache WHERE id = ?').run(String(row.id));
        remainingToAllocate = Math.max(0, round2(remainingToAllocate - itemVal));
        syncedDigifarmaCount++;
      } catch (errDf) {
        digifarmaOfflineWarning = errDf.message;
        break;
      }
    }
  }

  // 3. Registrar pagamento em card_payments e ajustar local_credit_balance + used_limit
  db.transaction(() => {
    const nextLocalCredit = isFullSettlement && syncedDigifarmaCount === dfItems.length
      ? 0
      : round2(Number(card.local_credit_balance || 0) + remainingToAllocate);

    db.prepare(`
      INSERT INTO card_payments (
        card_id, invoice_id, amount, payment_method, paid_at, origin, notes,
        interest_amount, waived_interest, operator_name, synced_digifarma, is_full_settlement
      ) VALUES (?, NULL, ?, ?, datetime('now', 'localtime'), 'BALCAO_CAIXA', ?, ?, ?, ?, ?, ?)
    `).run(
      card.id,
      payVal,
      paymentMethod,
      notes || (isFullSettlement ? `Quitação total (${paymentMethod})` : `Pagamento balcão (${paymentMethod})`),
      paidCharges,
      waivedAmount,
      operatorName,
      syncedDigifarmaCount > 0 ? 1 : 0,
      isFullSettlement ? 1 : 0
    );

    const { dfItems: remDf, localPurchases: remLocal } = getDigifarmaDataForCard(db, card);
    const updatedCardSnapshot = { ...card, local_credit_balance: nextLocalCredit };
    const nextFin = calculateAccountFinancials(updatedCardSnapshot, remDf, remLocal, config);

    db.prepare(`
      UPDATE belafarma_cards
      SET local_credit_balance = ?,
          used_limit = ?,
          status = CASE WHEN status = 'blocked_late' THEN 'active' ELSE status END,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(nextLocalCredit, nextFin.principalBalance, card.id);
  })();

  const updatedStatement = buildClientStatement(db, card.id);
  return {
    success: true,
    isFullSettlement,
    paidAmount: payVal,
    paidCharges,
    waivedInterest: waivedAmount,
    syncedDigifarmaCount,
    digifarmaOfflineWarning,
    statement: updatedStatement
  };
}

/**
 * Automações diárias (executadas apenas quando o Administrador ativar os toggles na Aba 3)
 */
async function runUnifiedDailyNotifications(db) {
  const config = getCrediarioConfig(db);
  if (!config.autoNotifyDueDay && !config.autoNotifyOverdue) {
    return { skipped: true, reason: 'Automações de WhatsApp desligadas nas configurações.' };
  }

  const todayYMD = toLocalDateYMD(new Date());
  const { clients } = listUnifiedClients(db);
  const results = { dueSent: 0, overdueSent: 0, errors: 0 };

  for (const c of clients) {
    if (!c.phone || c.principal_balance <= 0) continue;

    try {
      // 1. Lembrete no dia do vencimento
      if (config.autoNotifyDueDay && c.next_due_date === todayYMD) {
        const already = db.prepare(
          "SELECT id FROM crediario_message_log WHERE card_id = ? AND template_type = 'due_reminder' AND date(created_at) = ? AND status = 'sent'"
        ).get(c.id, todayYMD);
        if (!already) {
          const st = buildClientStatement(db, c.id);
          const msg = renderWhatsAppMessage('due_reminder', {
            card: st.card,
            financials: st.financials,
            simpleStatement: st.simpleStatement,
            config
          });
          const res = await sendCrediarioWhatsApp(db, {
            cardId: c.id,
            phone: c.phone,
            templateType: 'due_reminder',
            messageText: msg,
            sentBy: 'Cron Diário'
          });
          if (res.sentViaServer) results.dueSent++;
        }
      }

      // 2. Avisos amigáveis de atraso (D+1, D+3, D+5)
      if (config.autoNotifyOverdue && [1, 3, 5].includes(c.max_days_late)) {
        const already = db.prepare(
          "SELECT id FROM crediario_message_log WHERE card_id = ? AND template_type = 'overdue' AND date(created_at) = ? AND status = 'sent'"
        ).get(c.id, todayYMD);
        if (!already) {
          const st = buildClientStatement(db, c.id);
          const msg = renderWhatsAppMessage('overdue', {
            card: st.card,
            financials: st.financials,
            simpleStatement: st.simpleStatement,
            config
          });
          const res = await sendCrediarioWhatsApp(db, {
            cardId: c.id,
            phone: c.phone,
            templateType: 'overdue',
            messageText: msg,
            sentBy: 'Cron Diário'
          });
          if (res.sentViaServer) results.overdueSent++;
        }
      }
    } catch (_) {
      results.errors++;
    }
  }

  return results;
}

module.exports = {
  CONFIG_KEY,
  CREDIARIO_CUTOFF_DATE,
  isBeforeCrediarioCutoff,
  DEFAULT_CONFIG,
  DEFAULT_TEMPLATES,
  round2,
  formatCurrency,
  sanitizeDigits,
  normalizePhoneBr,
  toLocalDateYMD,
  formatDateBR,
  addDaysYMD,
  diffCalendarDays,
  computeFixedDueDate,
  ensureCrediarioUnifiedSchema,
  getCrediarioConfig,
  saveCrediarioConfig,
  ensurePortalTokens,
  calculateAccountFinancials,
  buildClientStatement,
  buildClientStatementByToken,
  listUnifiedClients,
  listUnifiedTransactions,
  syncAllFromDigifarma,
  renderWhatsAppMessage,
  sendCrediarioWhatsApp,
  buildThermalReceiptHtml,
  createLocalPurchase,
  deleteLocalPurchase,
  receiveCrediarioPayment,
  runUnifiedDailyNotifications
};
