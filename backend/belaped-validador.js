/**
 * belaped-validador.js
 * Inteligência de Validação Estrita e Proteção Anti-Alucinação para Cotações BelaPed
 * Impede sumariamente que robôs aceitem produtos errados ou de outros laboratórios.
 */

// Marcas e laboratórios conhecidos para prevenção de cruzamento indevido
const MARCAS_E_LABORATORIOS = [
  'SALON LINE', 'S LINE', 'MELTHEN', 'YANZ', 'RICCA', 'IDEAL', 'CREMER',
  'CIMED', 'EMS', 'MEDLEY', 'EUROFARMA', 'NEO QUIMICA', 'ACHE', 'BIOLAB',
  'LIBBS', 'SANDOZ', 'TEUTO', 'PRATI', 'GEOLAB', 'GERMED', 'NOVA QUIMICA',
  'LEGRAND', 'HYPERA', 'MANTECORP', 'FARMAX', 'VICEROY', 'GAMA'
];

function normalizarTexto(txt) {
  if (!txt || typeof txt !== 'string') return '';
  return txt
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^A-Z0-9\s]/g, ' ')   // remove pontuação
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Valida se um produto retornado por um robô é de fato o produto esperado.
 * @param {string} descEsperada Descrição do produto no cadastro da BelaFarma
 * @param {string} descEncontrada Descrição do produto retornada pela distribuidora
 * @returns {{ valido: boolean, score: number, motivo: string }}
 */
function validarCorrespondenciaProduto(descEsperada, descEncontrada) {
  const normEsperada = normalizarTexto(descEsperada);
  const normEncontrada = normalizarTexto(descEncontrada);

  if (!normEsperada || !normEncontrada) {
    return { valido: false, score: 0, motivo: 'Descrições vazias' };
  }

  // 1. Checagem de Conflito de Marcas / Laboratórios
  const marcasEsperadas = MARCAS_E_LABORATORIOS.filter(m => normEsperada.includes(m));
  const marcasEncontradas = MARCAS_E_LABORATORIOS.filter(m => normEncontrada.includes(m));

  // Equivalências permitidas (ex: 'S LINE' é abreviação de 'SALON LINE')
  const saoMesmaMarca = (m1, m2) => {
    if (m1 === m2) return true;
    if ((m1 === 'S LINE' && m2 === 'SALON LINE') || (m1 === 'SALON LINE' && m2 === 'S LINE')) return true;
    return false;
  };

  if (marcasEsperadas.length > 0 && marcasEncontradas.length > 0) {
    const temMarcaComum = marcasEsperadas.some(me =>
      marcasEncontradas.some(mf => saoMesmaMarca(me, mf))
    );
    if (!temMarcaComum) {
      return {
        valido: false,
        score: 0,
        motivo: `Conflito de marca/laboratório: esperado "${marcasEsperadas.join(', ')}" vs encontrado "${marcasEncontradas.join(', ')}"`
      };
    }
  }

  // 2. Checagem de Conflito Crítico de Público / Tipo
  const isInfantilEsperado = /\b(INF|INFANTIL|KIDS|BEBE)\b/.test(normEsperada);
  const isAdultoEsperado = /\b(ADULTO|SENIOR)\b/.test(normEsperada);
  const isInfantilEncontrado = /\b(INF|INFANTIL|KIDS|BEBE)\b/.test(normEncontrada);
  const isAdultoEncontrado = /\b(ADULTO|SENIOR)\b/.test(normEncontrada);

  if (isInfantilEsperado && isAdultoEncontrado && !isAdultoEsperado) {
    return { valido: false, score: 0, motivo: 'Conflito de público: esperado Infantil vs encontrado Adulto' };
  }
  if (isAdultoEsperado && isInfantilEncontrado && !isInfantilEsperado) {
    return { valido: false, score: 0, motivo: 'Conflito de público: esperado Adulto vs encontrado Infantil' };
  }

  // 3. Checagem de Função/Categoria Conflitante (ex: Removedor vs Unha Postiça)
  if (normEsperada.includes('UNHA POSTICA') || normEsperada.includes('UNHAS POSTICAS')) {
    const isRemovedorEncontrado = /\b(REMOVE|REMOVEDOR|REMOVEDORA|DILUENTE)\b/.test(normEncontrada);
    const isColaEncontrada = /\b(COLA|ADESIVO)\b/.test(normEncontrada);
    const isRemovedorEsperado = /\b(REMOVE|REMOVEDOR)\b/.test(normEsperada);
    const isColaEsperada = /\b(COLA|ADESIVO)\b/.test(normEsperada);

    if (isRemovedorEncontrado && !isRemovedorEsperado) {
      return { valido: false, score: 0, motivo: 'Conflito de tipo: esperado Unha Postiça vs encontrado Removedor' };
    }
    if (isColaEncontrada && !isColaEsperada) {
      return { valido: false, score: 0, motivo: 'Conflito de tipo: esperado Unha Postiça vs encontrado Cola' };
    }
  }

  // 4. Cálculo de Sobreposição de Tokens (Palavras com 3+ letras)
  const stopWords = new Set(['COM', 'PARA', 'UND', 'UNID', 'UNIDADES', 'UN', 'PCT', 'CX', 'C12', 'C24', 'REF', 'GEL', 'SO', 'EM']);
  const tokensEsperados = normEsperada
    .split(' ')
    .filter(t => t.length >= 3 && !stopWords.has(t));

  if (tokensEsperados.length === 0) {
    return { valido: true, score: 1.0, motivo: 'Poucos tokens para validação estrita' };
  }

  let encontradosCount = 0;
  for (const token of tokensEsperados) {
    if (normEncontrada.includes(token)) {
      encontradosCount++;
    }
  }

  const score = encontradosCount / tokensEsperados.length;

  // Exige que pelo menos 40% dos termos essenciais estejam no título encontrado
  // (produtos cosméticos/medicamentos frequentemente variam na ordem das palavras)
  if (score < 0.40) {
    return {
      valido: false,
      score,
      motivo: `Baixa similaridade (${(score * 100).toFixed(0)}%): termos esperados [${tokensEsperados.join(', ')}] não encontrados no título retornado "${descEncontrada}"`
    };
  }

  return { valido: true, score, motivo: 'Compatível' };
}

/**
 * Varre a tabela belaped_cotacoes_reais e remove cotações inconsistentes com o catálogo do ERP
 */
function expurgarCotacoesInconsistentes(db) {
  try {
    const cotacoes = db.prepare(`
      SELECT c.id, c.ean, c.fornecedor, c.preco, c.descricao as desc_cotada, e.descricao as desc_esperada
      FROM belaped_cotacoes_reais c
      JOIN compras_estoque_cache e ON e.ean = c.ean
      WHERE c.disponivel = 1 AND c.preco > 0
    `).all();

    let removidas = 0;
    const stmtInvalidar = db.prepare(`
      UPDATE belaped_cotacoes_reais
      SET disponivel = 0, preco = NULL, descricao = @motivo, updated_at = datetime('now')
      WHERE id = @id
    `);

    for (const row of cotacoes) {
      const checagem = validarCorrespondenciaProduto(row.desc_esperada, row.desc_cotada);
      if (!checagem.valido) {
        console.warn(`[Expurgo Cotação] 🧹 Invalidando cotação ID ${row.id} (${row.fornecedor}): EAN ${row.ean} - Esperado "${row.desc_esperada}" vs Cotado "${row.desc_cotada}" (${checagem.motivo})`);
        stmtInvalidar.run({
          id: row.id,
          motivo: `[Incompatível] ${checagem.motivo}`
        });
        removidas++;
      }
    }

    if (removidas > 0) {
      console.log(`[Expurgo Cotação] ✅ ${removidas} cotações inconsistentes/fantasmas foram expurgadas com sucesso.`);
    }
    return removidas;
  } catch (err) {
    console.error('[Expurgo Cotação] Erro ao expurgar cotações inconsistentes:', err.message);
    return 0;
  }
}

module.exports = {
  validarCorrespondenciaProduto,
  expurgarCotacoesInconsistentes,
  normalizarTexto
};
