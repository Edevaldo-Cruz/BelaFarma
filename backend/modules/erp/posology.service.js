/**
 * Belinha ERP - Guia Farmacêutico & Posologia Service (PDV Balcão)
 * - Ficha clínica completa por produto com cache definitivo em SQLite
 * - Captura gradual via IA (OpenAI -> Gemini) com deduplicação de requisições
 * - Busca unificada por nome, EAN, código, princípio ativo e sinônimos comerciais
 * - Cruzamento de equivalentes/genéricos disponíveis no estoque da BelaFarma
 * - Pergunta Rápida / Busca Livre de balcão com cache local
 */

const express = require('express');
const { db } = require('./erp-database');
const { callAI } = require('../../services/ai.service');
const { enrichProduct } = require('./erp-products.service');

// Evita chamadas duplicadas simultâneas à IA para o mesmo produto
const inFlightRequests = new Map();

function normalizeCode(code) {
  return String(code || '').trim().replace(/\.0+$/, '');
}

function normalizeBarcode(barcode) {
  return String(barcode || '').trim();
}

function normalizeQuestionKey(q) {
  return String(q || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPosologyRow(row) {
  if (!row) return null;
  return {
    product_code: row.product_code,
    barcode: row.barcode || '',
    product_name: row.product_name || '',
    is_medication: Number(row.is_medication) === 1,
    active_ingredient: row.active_ingredient || '',
    concentration: row.concentration || '',
    therapeutic_class: row.therapeutic_class || '',
    prescription_stripe: row.prescription_stripe || '',
    indication: row.indication || '',
    adult_dosage: row.adult_dosage || '',
    pediatric_dosage: row.pediatric_dosage || '',
    usage_instructions: row.usage_instructions || '',
    warnings: row.warnings || '',
    interactions: row.interactions || '',
    contraindications: row.contraindications || '',
    side_effects: row.side_effects || '',
    storage_care: row.storage_care || '',
    brand_synonyms: row.brand_synonyms || '',
    source: row.source || 'AI',
    ai_model: row.ai_model || '',
    reviewed_by_pharmacist: Number(row.reviewed_by_pharmacist) === 1,
    updated_by: row.updated_by || 'Sistema IA',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function getPosologyByProduct(productCode, barcode = '') {
  const cleanCode = normalizeCode(productCode);
  const cleanBarcode = normalizeBarcode(barcode);

  if (cleanCode) {
    const byCode = db.prepare('SELECT * FROM product_posologies WHERE product_code = ? LIMIT 1').get(cleanCode);
    if (byCode) return formatPosologyRow(byCode);
  }
  if (cleanBarcode) {
    const byBarcode = db.prepare('SELECT * FROM product_posologies WHERE barcode = ? AND barcode != "" LIMIT 1').get(cleanBarcode);
    if (byBarcode) return formatPosologyRow(byBarcode);
  }
  return null;
}

function resolveLocalProductInfo(productCode, barcode = '', fallbackName = '') {
  const cleanCode = normalizeCode(productCode);
  const cleanBarcode = normalizeBarcode(barcode);
  let prod = null;

  if (cleanCode) {
    prod = db.prepare('SELECT code, barcode, name, presentation, category_id, psicotropico, antimicrobiano FROM products WHERE code = ? LIMIT 1').get(cleanCode);
  }
  if (!prod && cleanBarcode) {
    prod = db.prepare('SELECT code, barcode, name, presentation, category_id, psicotropico, antimicrobiano FROM products WHERE barcode = ? LIMIT 1').get(cleanBarcode);
  }

  return {
    product_code: prod ? normalizeCode(prod.code) : (cleanCode || cleanBarcode),
    barcode: prod ? normalizeBarcode(prod.barcode) : cleanBarcode,
    product_name: prod
      ? `${String(prod.name || '').trim()}${prod.presentation ? ` ${String(prod.presentation).trim()}` : ''}`.trim()
      : String(fallbackName || '').trim(),
    category_id: prod?.category_id ?? null,
    psicotropico: prod?.psicotropico || 'N',
    antimicrobiano: prod?.antimicrobiano || 'N'
  };
}

function extractJsonObject(rawText) {
  const text = String(rawText || '').trim();
  if (!text) throw new Error('Resposta vazia da IA.');

  try {
    return JSON.parse(text);
  } catch (_) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Não foi possível interpretar JSON da resposta da IA.');
  }
}

async function invokeCloudAI(userPrompt, systemPrompt, maxTokens = 1100) {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('placeholder'));
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  let lastError = null;

  if (hasOpenAI) {
    try {
      const text = await callAI(userPrompt, systemPrompt, {
        provider: 'openai',
        temperature: 0.1,
        jsonMode: true,
        maxTokens
      });
      const usedModel = process.env.GPT_MODEL && process.env.GPT_MODEL !== 'gpt-3.5-turbo' ? process.env.GPT_MODEL : 'gpt-4o-mini';
      return { text, model: usedModel };
    } catch (err) {
      lastError = err;
      console.warn('[Guia Farmacêutico IA] OpenAI indisponível, tentando Gemini:', err.message);
    }
  }

  if (hasGemini) {
    try {
      const text = await callAI(userPrompt, systemPrompt, {
        provider: 'gemini',
        temperature: 0.1,
        jsonMode: true,
        maxTokens
      });
      return { text, model: process.env.GEMINI_MODEL || 'gemini-flash' };
    } catch (err) {
      lastError = err;
      console.warn('[Guia Farmacêutico IA] Gemini indisponível:', err.message);
    }
  }

  const msg = String(lastError?.message || '');
  if (/credit|402|429|quota|depleted|billing/i.test(msg)) {
    throw new Error('Créditos de IA esgotados na OpenAI e no Gemini. Recarregue os créditos para gerar novas consultas automaticamente (fichas já salvas continuam funcionando normalmente).');
  }
  throw lastError || new Error('Nenhum provedor de IA (OpenAI/Gemini) disponível no momento.');
}

async function callPosologyAI(productInfo) {
  const systemPrompt = [
    'Você é um farmacêutico clínico brasileiro especializado no Bulário Eletrônico da ANVISA e orientação profissional de balcão de drogaria.',
    'Classifique se o item é um MEDICAMENTO (ou suplemento/fitoterápico com posologia definida) ou NÃO-MEDICAMENTO (perfumaria, higiene, cosmético, fralda, conveniência, teste diagnóstico).',
    'Responda ESTRITAMENTE em JSON válido com exatamente estas chaves:',
    '{',
    '  "is_medication": true | false,',
    '  "active_ingredient": "Princípio(s) ativo(s) em DCB (ex.: Dipirona monoidratada)",',
    '  "concentration": "Concentração e forma farmacêutica (ex.: 500 mg comprimido)",',
    '  "therapeutic_class": "Classe terapêutica resumida (ex.: Analgésico e antitérmico)",',
    '  "prescription_stripe": "MIP (Isento de Prescrição) | Tarja Vermelha (Venda sob Prescrição) | Tarja Vermelha (Retenção de Receita) | Antimicrobiano (RDC 20/2011) | Tarja Preta (Notificação B/A)",',
    '  "indication": "Para que serve em linguagem clara e objetiva (1 a 2 frases)",',
    '  "adult_dosage": "Posologia usual para adultos com dose, intervalo e máximo diário conforme bula ANVISA",',
    '  "pediatric_dosage": "Posologia pediátrica por faixa etária/peso, ou \'Uso exclusivamente adulto\' / \'Somente sob prescrição médica\'",',
    '  "usage_instructions": "Modo de usar, relação com refeições/jejum, intervalo e cuidados práticos",',
    '  "warnings": "Alertas principais de balcão (gestantes/lactantes, álcool, sonolência/direção, alergias)",',
    '  "interactions": "Principais interações medicamentosas relevantes no balcão",',
    '  "contraindications": "Principais contraindicações da bula",',
    '  "side_effects": "Efeitos colaterais mais comuns",',
    '  "storage_care": "Cuidados de conservação (ex.: temperatura ambiente 15°C a 30°C, proteger da luz/umidade ou geladeira 2°C a 8°C)",',
    '  "brand_synonyms": "Principais marcas de referência e similares equivalentes separados por vírgula (ex.: Novalgina, Anador, Maxalgina)"',
    '}',
    'Se NÃO for medicamento, retorne "is_medication": false e strings vazias nos demais campos.'
  ].join('\n');

  const userPrompt = [
    `Produto da farmácia: ${productInfo.product_name}`,
    productInfo.barcode ? `EAN: ${productInfo.barcode}` : null,
    productInfo.psicotropico === 'S' ? 'Classificação Digifarma: Psicotrópico / Controle Especial' : null,
    productInfo.antimicrobiano === 'S' ? 'Classificação Digifarma: Antimicrobiano (RDC 20/2011)' : null,
    'Retorne apenas o objeto JSON.'
  ].filter(Boolean).join('\n');

  const { text, model } = await invokeCloudAI(userPrompt, systemPrompt, 1200);
  const parsed = extractJsonObject(text);
  const isMedication = Boolean(parsed.is_medication);

  return {
    is_medication: isMedication,
    active_ingredient: isMedication ? String(parsed.active_ingredient || '').trim() : '',
    concentration: isMedication ? String(parsed.concentration || '').trim() : '',
    therapeutic_class: isMedication ? String(parsed.therapeutic_class || '').trim() : '',
    prescription_stripe: isMedication ? String(parsed.prescription_stripe || '').trim() : '',
    indication: isMedication ? String(parsed.indication || '').trim() : '',
    adult_dosage: isMedication ? String(parsed.adult_dosage || '').trim() : '',
    pediatric_dosage: isMedication ? String(parsed.pediatric_dosage || '').trim() : '',
    usage_instructions: isMedication ? String(parsed.usage_instructions || '').trim() : '',
    warnings: isMedication ? String(parsed.warnings || '').trim() : '',
    interactions: isMedication ? String(parsed.interactions || '').trim() : '',
    contraindications: isMedication ? String(parsed.contraindications || '').trim() : '',
    side_effects: isMedication ? String(parsed.side_effects || '').trim() : '',
    storage_care: isMedication ? String(parsed.storage_care || '').trim() : '',
    brand_synonyms: isMedication ? String(parsed.brand_synonyms || '').trim() : '',
    ai_model: model
  };
}

function upsertPosologyRecord(record) {
  db.prepare(`
    INSERT INTO product_posologies (
      product_code, barcode, product_name, is_medication,
      active_ingredient, concentration, therapeutic_class, prescription_stripe,
      indication, adult_dosage, pediatric_dosage, usage_instructions,
      warnings, interactions, contraindications, side_effects,
      storage_care, brand_synonyms, source, ai_model,
      reviewed_by_pharmacist, updated_by, updated_at
    ) VALUES (
      @product_code, @barcode, @product_name, @is_medication,
      @active_ingredient, @concentration, @therapeutic_class, @prescription_stripe,
      @indication, @adult_dosage, @pediatric_dosage, @usage_instructions,
      @warnings, @interactions, @contraindications, @side_effects,
      @storage_care, @brand_synonyms, @source, @ai_model,
      @reviewed_by_pharmacist, @updated_by, datetime('now', 'localtime')
    )
    ON CONFLICT(product_code) DO UPDATE SET
      barcode = CASE WHEN excluded.barcode != '' THEN excluded.barcode ELSE product_posologies.barcode END,
      product_name = excluded.product_name,
      is_medication = excluded.is_medication,
      active_ingredient = excluded.active_ingredient,
      concentration = excluded.concentration,
      therapeutic_class = excluded.therapeutic_class,
      prescription_stripe = excluded.prescription_stripe,
      indication = excluded.indication,
      adult_dosage = excluded.adult_dosage,
      pediatric_dosage = excluded.pediatric_dosage,
      usage_instructions = excluded.usage_instructions,
      warnings = excluded.warnings,
      interactions = excluded.interactions,
      contraindications = excluded.contraindications,
      side_effects = excluded.side_effects,
      storage_care = excluded.storage_care,
      brand_synonyms = excluded.brand_synonyms,
      source = excluded.source,
      ai_model = excluded.ai_model,
      reviewed_by_pharmacist = excluded.reviewed_by_pharmacist,
      updated_by = excluded.updated_by,
      updated_at = datetime('now', 'localtime')
  `).run({
    product_code: record.product_code,
    barcode: record.barcode || '',
    product_name: record.product_name,
    is_medication: record.is_medication ? 1 : 0,
    active_ingredient: record.active_ingredient || '',
    concentration: record.concentration || '',
    therapeutic_class: record.therapeutic_class || '',
    prescription_stripe: record.prescription_stripe || '',
    indication: record.indication || '',
    adult_dosage: record.adult_dosage || '',
    pediatric_dosage: record.pediatric_dosage || '',
    usage_instructions: record.usage_instructions || '',
    warnings: record.warnings || '',
    interactions: record.interactions || '',
    contraindications: record.contraindications || '',
    side_effects: record.side_effects || '',
    storage_care: record.storage_care || '',
    brand_synonyms: record.brand_synonyms || '',
    source: record.source || 'AI',
    ai_model: record.ai_model || '',
    reviewed_by_pharmacist: record.reviewed_by_pharmacist ? 1 : 0,
    updated_by: record.updated_by || 'Sistema IA'
  });

  return getPosologyByProduct(record.product_code, record.barcode);
}

/**
 * Busca no cache local; se ausente (ou force=true), consulta IA com deduplicação e persiste no SQLite.
 */
async function lookupOrGeneratePosology({ product_code, barcode = '', product_name = '', force = false }) {
  const info = resolveLocalProductInfo(product_code, barcode, product_name);
  if (!info.product_code || !info.product_name) {
    throw new Error('Código e nome do produto são obrigatórios para consultar posologia.');
  }

  if (!force) {
    const cached = getPosologyByProduct(info.product_code, info.barcode);
    if (cached) {
      return { from_cache: true, data: cached };
    }
  }

  const key = info.product_code;
  if (inFlightRequests.has(key)) {
    const data = await inFlightRequests.get(key);
    return { from_cache: false, deduplicated: true, data };
  }

  const promise = (async () => {
    const aiData = await callPosologyAI(info);
    return upsertPosologyRecord({
      product_code: info.product_code,
      barcode: info.barcode,
      product_name: info.product_name,
      ...aiData,
      source: 'AI',
      reviewed_by_pharmacist: false,
      updated_by: 'Sistema IA'
    });
  })();

  inFlightRequests.set(key, promise);
  try {
    const saved = await promise;
    return { from_cache: false, data: saved };
  } finally {
    inFlightRequests.delete(key);
  }
}

/**
 * Salva edição manual realizada na modal do PDV com selo "Revisado pelo Farmacêutico"
 */
function saveManualPosology(productCode, payload = {}) {
  const existing = getPosologyByProduct(productCode, payload.barcode);
  const info = resolveLocalProductInfo(productCode, payload.barcode, payload.product_name || existing?.product_name);
  if (!info.product_code) {
    throw new Error('Código do produto inválido.');
  }

  return upsertPosologyRecord({
    product_code: info.product_code,
    barcode: info.barcode || existing?.barcode || '',
    product_name: String(payload.product_name || info.product_name || existing?.product_name || `Produto ${info.product_code}`).trim(),
    is_medication: payload.is_medication !== undefined ? Boolean(payload.is_medication) : true,
    active_ingredient: String(payload.active_ingredient ?? existing?.active_ingredient ?? '').trim(),
    concentration: String(payload.concentration ?? existing?.concentration ?? '').trim(),
    therapeutic_class: String(payload.therapeutic_class ?? existing?.therapeutic_class ?? '').trim(),
    prescription_stripe: String(payload.prescription_stripe ?? existing?.prescription_stripe ?? '').trim(),
    indication: String(payload.indication ?? existing?.indication ?? '').trim(),
    adult_dosage: String(payload.adult_dosage ?? existing?.adult_dosage ?? '').trim(),
    pediatric_dosage: String(payload.pediatric_dosage ?? existing?.pediatric_dosage ?? '').trim(),
    usage_instructions: String(payload.usage_instructions ?? existing?.usage_instructions ?? '').trim(),
    warnings: String(payload.warnings ?? existing?.warnings ?? '').trim(),
    interactions: String(payload.interactions ?? existing?.interactions ?? '').trim(),
    contraindications: String(payload.contraindications ?? existing?.contraindications ?? '').trim(),
    side_effects: String(payload.side_effects ?? existing?.side_effects ?? '').trim(),
    storage_care: String(payload.storage_care ?? existing?.storage_care ?? '').trim(),
    brand_synonyms: String(payload.brand_synonyms ?? existing?.brand_synonyms ?? '').trim(),
    source: 'MANUAL',
    ai_model: existing?.ai_model || '',
    reviewed_by_pharmacist: true,
    updated_by: String(payload.updated_by || 'Farmacêutico').trim()
  });
}

/**
 * Busca unificada do Guia Farmacêutico:
 * pesquisa por nome, EAN, código, princípio ativo, classe terapêutica ou sinônimo comercial
 */
function searchPharmaceuticalGuide(query = '', limit = 25) {
  const q = String(query || '').trim();
  const safeLimit = Math.max(1, Math.min(60, parseInt(limit, 10) || 25));

  if (!q) {
    // Sem filtro: exibe primeiro as fichas já salvas (mais vendidas no topo)
    const savedRows = db.prepare(`
      SELECT pos.*,
             p.sale_price, p.promo_price, p.crediario_price, p.promo_vista, p.promo_convenio,
             p.cost_price, p.stock_qty, p.curve, p.psicotropico, p.antimicrobiano, p.recipe_type,
             COALESCE(c.vendas_30d, p.vendas_30d, 0) AS vendas_30d
      FROM product_posologies pos
      LEFT JOIN products p ON p.code = pos.product_code
      LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
      WHERE pos.is_medication = 1
      ORDER BY COALESCE(c.vendas_30d, p.vendas_30d, 0) DESC,
               pos.reviewed_by_pharmacist DESC,
               pos.updated_at DESC
      LIMIT ?
    `).all(safeLimit);

    return savedRows.map(r => ({
      code: r.product_code,
      barcode: r.barcode || '',
      name: r.product_name,
      has_posology: true,
      is_medication: Number(r.is_medication) === 1,
      reviewed_by_pharmacist: Number(r.reviewed_by_pharmacist) === 1,
      active_ingredient: r.active_ingredient || '',
      concentration: r.concentration || '',
      therapeutic_class: r.therapeutic_class || '',
      prescription_stripe: r.prescription_stripe || '',
      brand_synonyms: r.brand_synonyms || '',
      stock_qty: Number(r.stock_qty || 0),
      sale_price: Number(r.sale_price || 0),
      promo_price: Number(r.promo_price || 0),
      crediario_price: Number(r.crediario_price || 0),
      promo_vista: r.promo_vista || 'N',
      vendas_30d: Number(r.vendas_30d || 0)
    }));
  }

  const term = `%${q}%`;
  const merged = [];
  const seen = new Set();

  // 1. Fichas já salvas que casam com nome, princípio ativo, classe, indicação ou sinônimos comerciais
  const posMatches = db.prepare(`
    SELECT pos.*,
           p.sale_price, p.promo_price, p.crediario_price, p.promo_vista, p.promo_convenio,
           p.cost_price, p.stock_qty, p.curve,
           COALESCE(c.vendas_30d, p.vendas_30d, 0) AS vendas_30d
    FROM product_posologies pos
    LEFT JOIN products p ON p.code = pos.product_code
    LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
    WHERE pos.product_code = ?
       OR pos.barcode LIKE ?
       OR pos.product_name LIKE ?
       OR pos.active_ingredient LIKE ?
       OR pos.therapeutic_class LIKE ?
       OR pos.brand_synonyms LIKE ?
       OR pos.indication LIKE ?
    ORDER BY (pos.is_medication = 1) DESC,
             (COALESCE(p.stock_qty, 0) > 0) DESC,
             COALESCE(c.vendas_30d, p.vendas_30d, 0) DESC
    LIMIT ?
  `).all(q, term, term, term, term, term, term, safeLimit);

  for (const r of posMatches) {
    seen.add(r.product_code);
    merged.push({
      code: r.product_code,
      barcode: r.barcode || '',
      name: r.product_name,
      has_posology: true,
      is_medication: Number(r.is_medication) === 1,
      reviewed_by_pharmacist: Number(r.reviewed_by_pharmacist) === 1,
      active_ingredient: r.active_ingredient || '',
      concentration: r.concentration || '',
      therapeutic_class: r.therapeutic_class || '',
      prescription_stripe: r.prescription_stripe || '',
      brand_synonyms: r.brand_synonyms || '',
      stock_qty: Number(r.stock_qty || 0),
      sale_price: Number(r.sale_price || 0),
      promo_price: Number(r.promo_price || 0),
      crediario_price: Number(r.crediario_price || 0),
      promo_vista: r.promo_vista || 'N',
      vendas_30d: Number(r.vendas_30d || 0)
    });
  }

  // 2. Complementa com catálogo geral de produtos (para permitir consultar qualquer produto ainda sem ficha)
  if (merged.length < safeLimit) {
    const remaining = safeLimit - merged.length;
    const words = q.split(/\s+/).filter(Boolean);
    let whereSql = `p.is_active = 1 AND p.code NOT LIKE '%.0'`;
    const params = [];
    if (words.length <= 1) {
      whereSql += ` AND (p.code = ? OR p.barcode LIKE ? OR p.name LIKE ?)`;
      params.push(q, term, term);
    } else {
      const wClauses = words.map(() => 'p.name LIKE ?').join(' AND ');
      whereSql += ` AND (p.code = ? OR p.barcode LIKE ? OR (${wClauses}))`;
      params.push(q, term, ...words.map(w => `%${w}%`));
    }
    params.push(remaining + 10);

    const prodMatches = db.prepare(`
      SELECT p.code, p.barcode, p.name, p.presentation, p.sale_price, p.promo_price,
             p.crediario_price, p.promo_vista, p.stock_qty, p.curve, p.category_id,
             COALESCE(c.vendas_30d, p.vendas_30d, 0) AS vendas_30d
      FROM products p
      LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
      WHERE ${whereSql}
      ORDER BY (p.category_id IN (1, 2, 7)) DESC,
               (p.stock_qty > 0) DESC,
               COALESCE(c.vendas_30d, p.vendas_30d, 0) DESC,
               p.name ASC
      LIMIT ?
    `).all(...params);

    for (const p of prodMatches) {
      const cCode = normalizeCode(p.code);
      if (seen.has(cCode)) continue;
      seen.add(cCode);
      merged.push({
        code: cCode,
        barcode: p.barcode || '',
        name: `${String(p.name || '').trim()}${p.presentation ? ` ${String(p.presentation).trim()}` : ''}`.trim(),
        has_posology: false,
        is_medication: [1, 2, 7].includes(Number(p.category_id)),
        reviewed_by_pharmacist: false,
        active_ingredient: '',
        concentration: '',
        therapeutic_class: '',
        prescription_stripe: '',
        brand_synonyms: '',
        stock_qty: Number(p.stock_qty || 0),
        sale_price: Number(p.sale_price || 0),
        promo_price: Number(p.promo_price || 0),
        crediario_price: Number(p.crediario_price || 0),
        promo_vista: p.promo_vista || 'N',
        vendas_30d: Number(p.vendas_30d || 0)
      });
      if (merged.length >= safeLimit) break;
    }
  }

  return merged;
}

/**
 * Cruza princípio ativo / sinônimos com o estoque real da BelaFarma para sugerir equivalentes/genéricos
 */
function findInStockEquivalents(productCode, limit = 12) {
  const cleanCode = normalizeCode(productCode);
  const pos = getPosologyByProduct(cleanCode);
  const localProd = db.prepare('SELECT code, name, presentation FROM products WHERE code = ? LIMIT 1').get(cleanCode);

  const tokens = new Set();
  const stopWords = new Set(['DE', 'DA', 'DO', 'COM', 'SEM', 'PARA', 'MG', 'ML', 'MCG', 'UI', 'CPR', 'CAPS', 'GTS', 'XPE', 'SOL', 'SUSP', 'POMADA', 'CREME', 'GEL', 'USO', 'ADULTO', 'INFANTIL', 'ORAL', 'SODICA', 'SODICO', 'POTASSICA', 'POTASSICO', 'MONOIDRATADA', 'CLORIDRATO', 'MALEATO', 'BESILATO', 'CITRATO', 'FUMARATO', 'SULFATO', 'FOSFATO', 'ACETATO', 'DIPROPIONATO', 'ASSOCIACAO']);

  if (pos?.active_ingredient) {
    // Extrai os principais tokens do princípio ativo (antes de "+" ou parênteses)
    const parts = pos.active_ingredient
      .split(/[+,;/()]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 4);
    for (const part of parts) {
      const firstWord = part.split(/\s+/)[0]?.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';
      if (firstWord.length >= 4 && !stopWords.has(firstWord)) {
        tokens.add(firstWord);
      }
    }
  }

  if (pos?.brand_synonyms) {
    const syns = pos.brand_synonyms.split(/[,;/]+/).map(s => s.trim()).filter(s => s.length >= 4);
    for (const s of syns.slice(0, 4)) {
      const cleanSyn = s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (cleanSyn.length >= 4 && !stopWords.has(cleanSyn)) {
        tokens.add(cleanSyn);
      }
    }
  }

  if (tokens.size === 0 && localProd?.name) {
    const firstWord = String(localProd.name).trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z]/g, '') || '';
    if (firstWord.length >= 4 && !stopWords.has(firstWord)) {
      tokens.add(firstWord);
    }
  }

  if (tokens.size === 0) return [];

  const tokenArr = Array.from(tokens).slice(0, 5);
  const likeClauses = tokenArr.map(() => 'UPPER(p.name) LIKE ?').join(' OR ');
  const likeParams = tokenArr.map(t => `%${t}%`);

  const rows = db.prepare(`
    SELECT p.*,
           COALESCE(c.vendas_30d, p.vendas_30d, 0) AS vendas_30d
    FROM products p
    LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
    WHERE p.is_active = 1
      AND p.code != ?
      AND p.code NOT LIKE '%.0'
      AND p.stock_qty > 0
      AND p.category_id IN (1, 2, 7)
      AND (${likeClauses})
    ORDER BY COALESCE(c.vendas_30d, p.vendas_30d, 0) DESC,
             p.stock_qty DESC,
             p.sale_price ASC
    LIMIT ?
  `).all(cleanCode, ...likeParams, limit);

  return rows.map(enrichProduct);
}

/**
 * Aba 2 — Pergunta Rápida / Busca Livre de Balcão (com cache SQLite)
 */
async function askClinicalQuestion(question, askedBy = 'Caixa') {
  const cleanQ = String(question || '').trim();
  if (cleanQ.length < 3) {
    throw new Error('Digite uma pergunta com pelo menos 3 caracteres.');
  }
  const qKey = normalizeQuestionKey(cleanQ);

  // 1. Verifica cache local primeiro
  const cached = db.prepare('SELECT * FROM posology_qa_history WHERE question_key = ? LIMIT 1').get(qKey);
  if (cached) {
    db.prepare(`UPDATE posology_qa_history SET updated_at = datetime('now', 'localtime') WHERE id = ?`).run(cached.id);
    return { from_cache: true, data: cached };
  }

  // 2. Consulta IA na nuvem
  const systemPrompt = [
    'Você é um farmacêutico clínico brasileiro auxiliando um atendente de drogaria no balcão em tempo real.',
    'Responda de forma profissional, direta, segura e baseada em bulário ANVISA e diretrizes clínicas brasileiras.',
    'Responda ESTRITAMENTE em JSON válido com estas chaves:',
    '{',
    '  "answer_summary": "Resposta direta e objetiva em 2 a 4 frases para leitura rápida no balcão",',
    '  "clinical_details": "Detalhes práticos complementares (princípio ativo, dose usual ou conduta farmacêutica)",',
    '  "warnings": "Alertas de segurança, contraindicações ou quando encaminhar ao médico/farmacêutico",',
    '  "related_ingredients": "Princípios ativos citados separados por vírgula (ex.: Dipirona, Paracetamol)"',
    '}'
  ].join('\n');

  const { text, model } = await invokeCloudAI(`Dúvida de balcão: ${cleanQ}`, systemPrompt, 900);
  const parsed = extractJsonObject(text);

  db.prepare(`
    INSERT INTO posology_qa_history (
      question_key, question, answer_summary, clinical_details, warnings, related_ingredients, ai_model, asked_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(question_key) DO UPDATE SET
      answer_summary = excluded.answer_summary,
      clinical_details = excluded.clinical_details,
      warnings = excluded.warnings,
      related_ingredients = excluded.related_ingredients,
      ai_model = excluded.ai_model,
      updated_at = datetime('now', 'localtime')
  `).run(
    qKey,
    cleanQ,
    String(parsed.answer_summary || '').trim(),
    String(parsed.clinical_details || '').trim(),
    String(parsed.warnings || '').trim(),
    String(parsed.related_ingredients || '').trim(),
    model,
    String(askedBy || 'Caixa').trim()
  );

  const saved = db.prepare('SELECT * FROM posology_qa_history WHERE question_key = ? LIMIT 1').get(qKey);
  return { from_cache: false, data: saved };
}

function listQaHistory(limit = 20) {
  return db.prepare(`
    SELECT * FROM posology_qa_history
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(50, parseInt(limit, 10) || 20)));
}

function getPosologyStats() {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_medication = 1 THEN 1 ELSE 0 END) AS medications,
      SUM(CASE WHEN is_medication = 0 THEN 1 ELSE 0 END) AS non_medications,
      SUM(CASE WHEN reviewed_by_pharmacist = 1 THEN 1 ELSE 0 END) AS reviewed
    FROM product_posologies
  `).get();

  return {
    total: row?.total || 0,
    medications: row?.medications || 0,
    non_medications: row?.non_medications || 0,
    reviewed: row?.reviewed || 0,
    in_flight: inFlightRequests.size
  };
}

/**
 * Popula gradualmente os N medicamentos mais vendidos da farmácia via IA
 */
async function populateTopMedicationsPosology({ limit = 50, force = false, concurrency = 3, onProgress = null } = {}) {
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));

  const sql = force
    ? `
      SELECT p.code, p.barcode, p.name, p.presentation
      FROM products p
      LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
      WHERE p.is_active = 1
        AND p.category_id IN (1, 2, 7)
      ORDER BY COALESCE(c.vendas_30d, p.vendas_30d, 0) DESC,
               COALESCE(c.vendas_10m, p.vendas_10m, 0) DESC,
               CASE p.curve WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END ASC
      LIMIT ?
    `
    : `
      SELECT p.code, p.barcode, p.name, p.presentation
      FROM products p
      LEFT JOIN compras_estoque_cache c ON (c.ean = p.barcode AND c.ean IS NOT NULL AND c.ean != '')
      LEFT JOIN product_posologies pos ON pos.product_code = p.code
      WHERE p.is_active = 1
        AND p.category_id IN (1, 2, 7)
        AND pos.product_code IS NULL
      ORDER BY COALESCE(c.vendas_30d, p.vendas_30d, 0) DESC,
               COALESCE(c.vendas_10m, p.vendas_10m, 0) DESC,
               CASE p.curve WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END ASC
      LIMIT ?
    `;

  const candidates = db.prepare(sql).all(safeLimit);
  const results = {
    requested: safeLimit,
    found_to_process: candidates.length,
    processed: 0,
    medications_saved: 0,
    non_medications_saved: 0,
    errors: []
  };

  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, candidates.length)) }, async () => {
    while (cursor < candidates.length) {
      const idx = cursor++;
      const item = candidates[idx];
      const fullName = `${String(item.name || '').trim()}${item.presentation ? ` ${String(item.presentation).trim()}` : ''}`.trim();
      try {
        const res = await lookupOrGeneratePosology({
          product_code: item.code,
          barcode: item.barcode,
          product_name: fullName,
          force
        });
        results.processed++;
        if (res.data?.is_medication) results.medications_saved++;
        else results.non_medications_saved++;
        if (typeof onProgress === 'function') {
          onProgress({ index: idx + 1, total: candidates.length, code: item.code, name: fullName, is_medication: res.data?.is_medication });
        }
      } catch (err) {
        results.errors.push({ code: item.code, name: fullName, error: err.message });
      }
    }
  });

  await Promise.all(workers);
  return results;
}

function createPosologyRouter() {
  const router = express.Router();

  router.get('/stats', (req, res) => {
    try {
      res.json({ success: true, data: getPosologyStats() });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/search', (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const data = searchPharmaceuticalGuide(req.query.q || '', req.query.limit || 25);
      res.json({ success: true, count: data.length, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/status-batch', (req, res) => {
    try {
      const raw = String(req.query.codes || '');
      const codes = raw.split(',').map(normalizeCode).filter(Boolean).slice(0, 100);
      if (codes.length === 0) return res.json({ success: true, data: {} });

      const placeholders = codes.map(() => '?').join(',');
      const rows = db.prepare(`
        SELECT product_code, is_medication, reviewed_by_pharmacist
        FROM product_posologies
        WHERE product_code IN (${placeholders})
      `).all(...codes);

      const map = {};
      for (const r of rows) {
        map[r.product_code] = {
          exists: true,
          is_medication: Number(r.is_medication) === 1,
          reviewed_by_pharmacist: Number(r.reviewed_by_pharmacist) === 1,
          in_flight: inFlightRequests.has(r.product_code)
        };
      }
      for (const c of codes) {
        if (!map[c] && inFlightRequests.has(c)) {
          map[c] = { exists: false, is_medication: true, reviewed_by_pharmacist: false, in_flight: true };
        }
      }
      res.json({ success: true, data: map });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/ask/history', (req, res) => {
    try {
      res.json({ success: true, data: listQaHistory(req.query.limit || 20) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/ask', async (req, res) => {
    try {
      const { question, asked_by } = req.body || {};
      const result = await askClinicalQuestion(question, asked_by);
      res.json({ success: true, from_cache: result.from_cache, data: result.data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/:productCode/equivalents', (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const list = findInStockEquivalents(req.params.productCode, parseInt(req.query.limit, 10) || 12);
      res.json({ success: true, count: list.length, data: list });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/:productCode', (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const cleanCode = normalizeCode(req.params.productCode);
      const barcode = normalizeBarcode(req.query.barcode || '');
      const cached = getPosologyByProduct(cleanCode, barcode);
      res.json({
        success: true,
        found: Boolean(cached),
        in_flight: inFlightRequests.has(cleanCode),
        data: cached
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/lookup', async (req, res) => {
    try {
      const { product_code, barcode = '', product_name = '', wait = true, force = false } = req.body || {};
      const cleanCode = normalizeCode(product_code);
      if (!cleanCode && !barcode) {
        return res.status(400).json({ success: false, error: 'Informe product_code ou barcode.' });
      }

      if (!force) {
        const cached = getPosologyByProduct(cleanCode, barcode);
        if (cached) {
          return res.json({ success: true, status: 'CACHED', from_cache: true, data: cached });
        }
      }

      if (wait === false) {
        if (!inFlightRequests.has(cleanCode)) {
          lookupOrGeneratePosology({ product_code: cleanCode, barcode, product_name, force })
            .catch(err => console.warn(`[Posologia BG] Falha ao capturar posologia de ${cleanCode}:`, err.message));
        }
        return res.status(202).json({ success: true, status: 'QUEUED', in_flight: true });
      }

      const result = await lookupOrGeneratePosology({ product_code: cleanCode, barcode, product_name, force });
      return res.json({
        success: true,
        status: result.from_cache ? 'CACHED' : 'GENERATED',
        from_cache: result.from_cache,
        data: result.data
      });
    } catch (err) {
      console.error('[Posologia API] Erro em /lookup:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/:productCode', (req, res) => {
    try {
      const saved = saveManualPosology(req.params.productCode, req.body || {});
      res.json({ success: true, data: saved });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post('/populate-top', async (req, res) => {
    try {
      const { limit = 50, force = false } = req.body || {};
      const result = await populateTopMedicationsPosology({ limit, force });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = {
  getPosologyByProduct,
  upsertPosologyRecord,
  lookupOrGeneratePosology,
  saveManualPosology,
  searchPharmaceuticalGuide,
  findInStockEquivalents,
  askClinicalQuestion,
  listQaHistory,
  getPosologyStats,
  populateTopMedicationsPosology,
  createPosologyRouter
};
