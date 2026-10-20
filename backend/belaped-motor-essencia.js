/**
 * belaped-motor-essencia.js
 * Motor central de Cotação por Essência & Menor Preço Geral no BelaPed.
 * Gerencia preparação de busca, filtragem estrita, ranking de menores preços,
 * desempate por histórico da loja e registro automático de vínculos no banco local.
 */

const farmacoMatcher = require('./belaped-farmaco-matcher.js');

/**
 * Prepara o termo de busca por essência
 * @param {string} ean 
 * @param {string} descricao 
 */
function prepararBuscaEssencia(ean, descricao) {
  const eanLimpo = String(ean || '').trim();
  const descLimpa = String(descricao || '').trim();
  const termoBusca = farmacoMatcher.construirTermoBuscaEssencia(descLimpa);
  const dosagem = farmacoMatcher.extrairDosagem(descLimpa);
  const qtdForma = farmacoMatcher.extrairQuantidadeEForma(descLimpa);
  const ativo = farmacoMatcher.extrairTermoBuscaGenerico(descLimpa);

  return {
    eanLimpo,
    descLimpa,
    termoBusca,
    dosagem,
    qtdForma,
    ativo
  };
}

let defaultDb = null;
function getDb(db) {
  if (db) return db;
  if (!defaultDb) {
    try {
      const Database = require('better-sqlite3');
      const path = require('path');
      defaultDb = new Database(path.resolve(__dirname, '../data/belafarma.db'));
    } catch (e) {}
  }
  return defaultDb;
}

/**
 * Verifica se a farmácia já comprou, vendeu ou movimentou este EAN no passado
 * @param {object} db - Instância SQLite do BelaFarma
 * @param {string} ean 
 */
function verificarSeJaTeveNaLoja(db, ean) {
  const activeDb = getDb(db);
  if (!activeDb || !ean) return false;
  try {
    const eanLimpo = String(ean).replace(/\D/g, '');
    if (!eanLimpo || eanLimpo.length < 7) return false;
    const row = activeDb.prepare(`
      SELECT 1 FROM compras_estoque_cache 
      WHERE (ean = ? OR ean LIKE ?) 
        AND (vendas_10m > 0 OR entradas_10m > 0 OR saldo > 0 OR ultima_compra_data IS NOT NULL)
      LIMIT 1
    `).get(eanLimpo, `%${eanLimpo}%`);
    return Boolean(row);
  } catch (e) {
    return false;
  }
}

/**
 * Filtra e classifica candidatos de acordo com as diretrizes do BelaPed:
 * 1. Equivalência técnica estrita (mesmo ativo, mesma dosagem, mesma apresentação/quantidade de comprimidos).
 * 2. Ordenação por menor preço absoluto.
 * 3. Desempate a R$ 0,00 favorecendo produto que a loja já trabalhou.
 * 
 * @param {Array} candidatos - Lista de itens retornados pela distribuidora [{ ean, descricao, preco, ... }]
 * @param {object} itemOriginal - { ean, descricao, precoOriginal, tipo_categoria }
 * @param {object} db - Conexão SQLite
 */
function filtrarEClassificarCandidatos(candidatos, itemOriginal, db) {
  if (!Array.isArray(candidatos) || candidatos.length === 0) {
    return { vencedor: null, todosConcorrentes: [] };
  }

  const validos = [];

  for (const c of candidatos) {
    if (!c || !c.preco || c.preco <= 0) continue;

    // Se o EAN for exatamente idêntico ao original, é automaticamente equivalente
    const isEanExato = itemOriginal.ean && c.ean && String(itemOriginal.ean).replace(/\D/g, '') === String(c.ean).replace(/\D/g, '');
    
    if (isEanExato || farmacoMatcher.validarEquivalenciaEstrita(itemOriginal, c)) {
      const lab = c.laboratorio || farmacoMatcher.extrairLaboratorio(c.descricao);
      const jaTeve = verificarSeJaTeveNaLoja(db, c.ean);

      validos.push({
        ...c,
        laboratorio: lab,
        jaTeveNaLoja: jaTeve,
        isEanOriginal: isEanExato
      });
    }
  }

  if (validos.length === 0) {
    return { vencedor: null, todosConcorrentes: [] };
  }

  // Ordenação pelo critério de Menor Preço e Desempate por Histórico
  validos.sort((a, b) => {
    const diff = a.preco - b.preco;
    if (Math.abs(diff) >= 0.005) {
      return diff; // Menor preço absoluto sempre vence
    }
    // Empate a R$ 0,00: se um já teve histórico na farmácia e o outro não, o histórico vence
    if (a.jaTeveNaLoja && !b.jaTeveNaLoja) return -1;
    if (!a.jaTeveNaLoja && b.jaTeveNaLoja) return 1;
    // Se ambos tiverem histórico ou nenhum tiver, prioriza o EAN original da lista
    if (a.isEanOriginal && !b.isEanOriginal) return -1;
    if (!a.isEanOriginal && b.isEanOriginal) return 1;
    return 0;
  });

  const vencedor = validos[0];
  const eanOriginalLimpo = String(itemOriginal.ean || '').replace(/\D/g, '');
  const eanVencedorLimpo = String(vencedor.ean || '').replace(/\D/g, '');
  const isSubstituto = Boolean(eanOriginalLimpo && eanVencedorLimpo && eanOriginalLimpo !== eanVencedorLimpo);

  // Calcula economia se houver preço original do EAN de referência
  let precoReferencia = itemOriginal.precoOriginal || null;
  if (!precoReferencia) {
    const itemOrigLista = validos.find(v => v.isEanOriginal);
    if (itemOrigLista) precoReferencia = itemOrigLista.preco;
  }

  let economiaReais = 0;
  let economiaPct = 0;
  if (precoReferencia && precoReferencia > vencedor.preco) {
    economiaReais = Number((precoReferencia - vencedor.preco).toFixed(2));
    economiaPct = Number((((precoReferencia - vencedor.preco) / precoReferencia) * 100).toFixed(1));
  }

  // Mapeia todos os concorrentes para exibição
  const todosConcorrentes = validos.map(v => ({
    ean: v.ean,
    descricao: v.descricao,
    preco: v.preco,
    laboratorio: v.laboratorio,
    jaTeveNaLoja: v.jaTeveNaLoja,
    isVencedor: v.ean === vencedor.ean,
    economiaVsVencedor: Number((v.preco - vencedor.preco).toFixed(2))
  }));

  return {
    vencedor: {
      ...vencedor,
      eanVencedor: vencedor.ean,
      eanOriginal: itemOriginal.ean,
      isSubstituto,
      economiaReais,
      economiaPct,
      precoReferencia
    },
    todosConcorrentes
  };
}

/**
 * Registra ou atualiza no banco local o vínculo de equivalência entre os produtos
 */
function registrarEquivalenciaNoBanco(db, eanOriginal, vencedor, descOriginal, portal) {
  const activeDb = getDb(db);
  if (!activeDb || !eanOriginal || !vencedor || !vencedor.isSubstituto) return;
  try {
    const stmt = activeDb.prepare(`
      INSERT INTO belaped_equivalencias (
        ean_original, ean_substituto, descricao_original, descricao_substituto,
        laboratorio, principio_ativo, origem_portal, preco_original,
        preco_substituto, economia_reais, data_vinculo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(ean_original, ean_substituto) DO UPDATE SET
        preco_original = excluded.preco_original,
        preco_substituto = excluded.preco_substituto,
        economia_reais = excluded.economia_reais,
        data_vinculo = CURRENT_TIMESTAMP
    `);

    const ativo = farmacoMatcher.extrairTermoBuscaGenerico(descOriginal || vencedor.descricao);
    stmt.run(
      String(eanOriginal).trim(),
      String(vencedor.ean).trim(),
      descOriginal || '',
      vencedor.descricao || '',
      vencedor.laboratorio || '',
      ativo || '',
      portal || '',
      vencedor.precoReferencia || null,
      vencedor.preco || null,
      vencedor.economiaReais || 0
    );
  } catch (err) {
    console.warn('[belaped-motor-essencia] Erro ao registrar equivalência:', err.message);
  }
}

module.exports = {
  prepararBuscaEssencia,
  verificarSeJaTeveNaLoja,
  filtrarEClassificarCandidatos,
  registrarEquivalenciaNoBanco
};
