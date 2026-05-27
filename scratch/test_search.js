const Database = require('better-sqlite3');
const path = require('path');

const dbPath = 'F:\\Documentos\\Desenvolvimento\\BelaFarma\\data\\belafarma.db';
const db = new Database(dbPath);

console.log('--- DATABASE CONECTADO ---');

const SIZE_TOKENS = new Set(['p', 'm', 'g', 'gg', 'rn']);
const STOP_WORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'em', 'um', 'uma', 'uns', 'umas', 
  'o', 'a', 'os', 'as', 'e', 'para', 'com', 'sem', 'sob', 'sobre'
]);

const SYNONYMS = {
  // Fraldas
  'fralda': ['fralda'], 'fraldas': ['fralda'], 'fr': ['fralda', 'frasco'],
  // Shampoo
  'shampoo': ['shampoo'], 'shamp': ['shampoo'], 'sh': ['shampoo'], 'xamp': ['shampoo'],
  // Creme / Condicionador / Sabonete / Gel
  'creme': ['creme'], 'crem': ['creme'], 'cr': ['creme'],
  'condicionador': ['condicionador'], 'cond': ['condicionador'], 'condic': ['condicionador'],
  'sabonete': ['sabonete'], 'sab': ['sabonete'],
  'hidratante': ['hidratante'], 'hidr': ['hidratante'], 'hidrat': ['hidratante'],
  'gel': ['gel'],
  // Xaropes e Soluções
  'xarope': ['xarope'], 'xpe': ['xarope'], 'xar': ['xarope'],
  'solucao': ['solucao'], 'solucoes': ['solucao'], 'sol': ['solucao'], 'soluc': ['solucao'],
  'suspensao': ['suspensao'], 'susp': ['suspensao'],
  'gotas': ['gotas'], 'gts': ['gotas'], 'gt': ['gotas'],
  'colirio': ['colirio'], 'col': ['colirio'],
  // Comprimidos / Cápsulas / Drágeas / Envelopes
  'comprimido': ['comprimido'], 'comprimidos': ['comprimido'], 'cpr': ['comprimido'], 'cp': ['comprimido'], 'comp': ['comprimido'], 'cprs': ['comprimido'], 'cps': ['comprimido'],
  'capsula': ['capsula'], 'capsulas': ['capsula'], 'cap': ['capsula'], 'caps': ['capsula'],
  'dragea': ['comprimido'], 'drageas': ['comprimido'], 'drg': ['comprimido'], 'drgs': ['comprimido'],
  'envelope': ['envelope'], 'envelopes': ['envelope'], 'env': ['envelope'],
  'pastilha': ['pastilha'], 'past': ['pastilha'],
  // Formatos / Recipientes
  'frasco': ['frasco'], 'frascos': ['frasco'], 'frc': ['frasco'],
  'ampola': ['ampola'], 'ampolas': ['ampola'], 'amp': ['ampola'],
  'pomada': ['pomada'], 'pom': ['pomada'],
  'caixa': ['caixa'], 'cx': ['caixa'],
  // Unidades / Quantidades
  'unidade': ['unidade'], 'unidades': ['unidade'], 'un': ['unidade'], 'und': ['unidade'], 'unid': ['unidade'],
  // Uso / Público
  'adulto': ['adulto'], 'adt': ['adulto'], 'ad': ['adulto'],
  'infantil': ['infantil'], 'inf': ['infantil'], 'pediatrico': ['infantil'], 'ped': ['infantil'],
  // Vários / Conectivos
  'com': ['com'], 'c/': ['com'], 'c': ['com'], 'contem': ['com'],
  'para': ['para'], 'p/': ['para'], 'p': ['para', 'p_size'],
  'injetavel': ['injetavel'], 'inj': ['injetavel'], 'injet': ['injetavel'],
  'desodorante': ['desodorante'], 'des': ['desodorante'], 'desod': ['desodorante'],
  'protetor': ['protetor'], 'prot': ['protetor'],
  // Controle / Queda
  'controle': ['controle'], 'control': ['controle'], 'cont': ['controle']
};

function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d+)([a-zA-Z]+)/g, '$1 $2')
    .replace(/([a-zA-Z]+)(\d+)/g, '$1 $2')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(str) {
  return normalizeText(str).split(' ').filter(t => t && !STOP_WORDS.has(t));
}

function tokensMatch(tokenA, tokenB) {
  if (tokenA === tokenB) return true;
  
  const canonicalA = SYNONYMS[tokenA] || [tokenA];
  const canonicalB = SYNONYMS[tokenB] || [tokenB];
  
  for (const a of canonicalA) {
    if (canonicalB.includes(a)) {
      return true;
    }
  }
  
  return false;
}

function getTokenWeight(token) {
  if (/^\d+$/.test(token)) {
    return 6;
  }
  if (SIZE_TOKENS.has(token)) {
    return 5;
  }
  if (token.length >= 5) {
    return 4;
  }
  if (token.length === 4) {
    return 3;
  }
  if (token.length === 3) {
    return 2;
  }
  return 1;
}

function calculateMatchScore(queryTokens, candidateName) {
  const candidateTokens = tokenize(candidateName);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;
  
  let totalQueryWeight = 0;
  let matchedWeight = 0;
  
  for (const qToken of queryTokens) {
    const weight = getTokenWeight(qToken);
    totalQueryWeight += weight;
    
    let isMatched = false;
    for (const cToken of candidateTokens) {
      if (tokensMatch(qToken, cToken)) {
        isMatched = true;
        break;
      }
    }
    
    if (isMatched) {
      matchedWeight += weight;
    }
  }
  
  let score = matchedWeight / totalQueryWeight;
  
  let unmatchedCandidateCount = 0;
  for (const cToken of candidateTokens) {
    let matched = false;
    for (const qToken of queryTokens) {
      if (tokensMatch(qToken, cToken)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      unmatchedCandidateCount++;
    }
  }
  
  const penalty = Math.min(unmatchedCandidateCount * 0.02, 0.20);
  score = Math.max(0, score - penalty);
  
  return score;
}

function lookupProductInStock(searchName) {
  const tokens = tokenize(searchName);
  if (tokens.length === 0) return null;

  // 1. Extrair os tokens significativos
  const sigTokens = tokens.filter(t => t.length >= 3 && !STOP_WORDS.has(t));
  sigTokens.sort((a, b) => b.length - a.length);

  let candidates = [];
  if (sigTokens.length > 0) {
    const topTokens = sigTokens.slice(0, 3);
    const conditions = topTokens.map(() => 'name LIKE ?').join(' OR ');
    const params = topTokens.map(t => `%${t}%`);
    
    console.log(`[SQL Query] Filtrando com: ${conditions} params: ${JSON.stringify(params)}`);
    candidates = db.prepare(`SELECT * FROM stock_products WHERE ${conditions}`).all(...params);
  }

  if (candidates.length === 0) {
    console.log('[SQL Query] Fallback: buscando todos os produtos do estoque...');
    candidates = db.prepare('SELECT * FROM stock_products').all();
  }

  console.log(`[Lookup] Total de candidatos encontrados: ${candidates.length}`);

  const scoredCandidates = candidates.map(prod => {
    const score = calculateMatchScore(tokens, prod.name);
    return { product: prod, score };
  });

  const threshold = 0.45;
  const validMatches = scoredCandidates.filter(c => c.score >= threshold);

  if (validMatches.length === 0) return null;

  validMatches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const diffA = Math.abs(a.product.name.length - searchName.length);
    const diffB = Math.abs(b.product.name.length - searchName.length);
    if (diffA !== diffB) {
      return diffA - diffB;
    }
    return b.product.stock_qty - a.product.stock_qty;
  });

  console.log('[Matches Top 3]');
  validMatches.slice(0, 3).forEach((m, idx) => {
    console.log(`  ${idx + 1}. Nome: "${m.product.name}" | EAN: ${m.product.code} | Preço: R$ ${m.product.sale_price} | Score: ${m.score.toFixed(4)}`);
  });

  return validMatches[0].product;
}

// ---- TESTANDO ALGUNS CENÁRIOS ----

const testCases = [
  "Fralda Capricho Baby Jumbinho P 24 Unidades",
  "Dorflex com 10 comprimidos",
  "Shampoo Clear Men Queda Control 400ml",
  "Neosaldina com 20 drageas"
];

for (const t of testCases) {
  console.log(`\n🔎 BUSCA: "${t}"`);
  const result = lookupProductInStock(t);
  if (result) {
    console.log(`✅ RESULTADO FINAL: "${result.name}" (EAN: ${result.code}) - R$ ${result.sale_price}`);
  } else {
    console.log(`❌ NENHUM PRODUTO ENCONTRADO`);
  }
}
