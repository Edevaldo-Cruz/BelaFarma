
const { parsePriceValue } = require('./backend/services/compras-mineracao.service.js');
// Mocking the parsePriceValue for isolated testing
function parsePrice(str) {
  let clean = String(str).replace(/R\$/gi, '').trim();
  if (clean.includes(',') && clean.includes('.')) clean = clean.replace(/\./g, '').replace(',', '.');
  else if (clean.includes(',')) clean = clean.replace(',', '.');
  return parseFloat(clean) || 0;
}

function extract(texto) {
  const ofertas = [];
  const linhas = texto.split(/\r?\n/);
  for (const linha of linhas) {
    const trimmed = linha.trim();
    if (!trimmed || trimmed.length < 5) continue;
    if (/pedido\s+m[i]nimo|faturamento\s+m[i]nimo|condi[c][o]es|prazos?|boletos?|frete/i.test(trimmed)) continue;

    let priceMatch = null;
    let matchedRegex = null;

    // 1. Explicit indicators (R$, por, cada) anywhere
    const explicitRegex = /(?:R\$|por\s+|cada\s+|un\s*:\s*|un\s+)([\d]{1,4}[,\.]\d{2})/i;
    let m = explicitRegex.exec(trimmed);
    if (m) {
      priceMatch = m;
      matchedRegex = explicitRegex;
    } else {
      // 2. Dash/Hyphen indicator
      const dashRegex = /(?:-|\u2013|\u2014)\s*([\d]{1,4}[,\.]\d{2})(?!\s*(?:ml|mg|g|mcg|%))/i;
      m = dashRegex.exec(trimmed);
      if (m) {
        priceMatch = m;
        matchedRegex = dashRegex;
      } else {
        // 3. Price at the end of the line (ignoring trailing parenthesis)
        const endRegex = /(?:^|\s)([\d]{1,4}[,\.]\d{2})(?:\s*(?:reais|un|cx|fr|pct))?(?:\s*\(.*)?\s*$/i;
        m = endRegex.exec(trimmed);
        if (m) {
          // If it's a number <= 0.50 without explicit currency, it's likely a concentration (like 0,15%). Skip it.
          const val = parsePrice(m[1]);
          if (val > 0.50) {
            priceMatch = m;
            matchedRegex = endRegex;
          }
        }
      }
    }

    if (priceMatch) {
       let nomeProduto = trimmed.replace(matchedRegex, ' ').replace(/\s+/g, ' ').trim();
       ofertas.push({ nomeProduto, precoBruto: parsePrice(priceMatch[1]) });
    }
  }
  return ofertas;
}

console.log(extract('BOLSA AGUA QUENTE 2L BORDO LISMED- 16,50 ( DAS 7 OU 12'));
console.log(extract('Biolagrima 0,15'));
console.log(extract('Dipirona 500mg c/ 100 12,50'));
console.log(extract('Amoxicilina 500mg por 15,90'));
console.log(extract('Dorflex c/ 36 R$ 18,90'));
