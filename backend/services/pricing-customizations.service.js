/**
 * backend/services/pricing-customizations.service.js
 *
 * Serviço centralizado de Inteligência e Sincronização de Porcentagens de Precificação da BelaFarma.
 * Garante que TODO produto que entrar na loja (novo produto, entrada de nota fiscal,
 * atualização periódica com o ERP Digifarma ou reajuste de custo/estoque)
 * obedeça rigorosamente às porcentagens estabelecidas:
 *
 * - Custo Fixo Médio: ~30,00%
 * - Pró-Labore Total Médio: ~16,00% (Sócio 1: ~8,00%, Sócio 2: ~8,00% com piso mínimo de 2%)
 * - Lucro Líquido Médio: ~2,50%
 * - Impostos: 4,00% (5,00% para Perfumarias e Cosméticos)
 * - Taxa de Cartão: 2,50%
 * - Custos Variáveis: 1,00%
 */

/**
 * Arredonda valor para centavos comerciais aceitos no varejo (terminados em 0, 5 ou 9).
 */
function roundUpToAcceptedCents(val) {
  if (isNaN(val) || val <= 0) return 0;
  const totalCents = Math.round(val * 100);
  const integerPart = Math.floor(totalCents / 100);
  let centsPart = totalCents % 100;

  const lastDigit = centsPart % 10;
  if (lastDigit === 0 || lastDigit === 5 || lastDigit === 9) {
    return totalCents / 100;
  }
  if (lastDigit > 0 && lastDigit < 5) {
    centsPart += (5 - lastDigit);
  } else if (lastDigit > 5 && lastDigit < 9) {
    centsPart += (9 - lastDigit);
  }

  return (integerPart * 100 + centsPart) / 100;
}

/**
 * Decompõe e calcula as porcentagens de um produto de acordo com o padrão estabelecido da loja.
 *
 * @param {number} precoVenda Preço de venda atual do produto
 * @param {number} cmv Custo de mercadoria vendida (última compra / custo unitário)
 * @param {number} categoriaId ID da categoria do produto no ERP
 * @returns {object} Decomposição detalhada dos percentuais
 */
function calcularPorcentagensProduto(precoVenda, cmv, categoriaId) {
  const p = Number(precoVenda) || 0;
  const c = Number(cmv) || 0;
  const catId = Number(categoriaId) || 0;

  const isPerfumaria = catId === 5 || catId === 6;
  const impostoPct = isPerfumaria ? 5.0 : 4.0;
  const taxaCartaoPct = 2.5;
  const custosVarPct = 1.0;
  const taxes = impostoPct + taxaCartaoPct + custosVarPct;

  let fixo = 0;
  let pro = 0;
  let lucro = 0;

  if (p <= 0 || c >= p) {
    // Produto sem margem positiva imediata ou sem preço
    fixo = 15.0;
    pro = 2.0;
    lucro = 0.0;
  } else {
    const cmvRatio = c / p;
    const m = cmvRatio < 1 ? Math.max(0, 100 - (cmvRatio * 100) - taxes) : 0;

    if (m <= 0) {
      fixo = 15.0;
      pro = 2.0;
      lucro = 0.0;
    } else {
      fixo = parseFloat((m * 0.8140).toFixed(2));
      pro = parseFloat((m * 0.4415).toFixed(2));
      lucro = parseFloat((m * 0.0695).toFixed(2));

      // Garante piso de pró-labore
      if (pro < 2) {
        const diff = 2 - pro;
        pro = 2.0;
        fixo = Math.max(0, parseFloat((fixo - diff).toFixed(2)));
      }
    }
  }

  const s1 = parseFloat((pro / 2).toFixed(2));
  const s2 = parseFloat((pro - s1).toFixed(2));

  const totalDeductions = taxes + fixo + pro + lucro;
  const markupDiv = parseFloat((1 - (totalDeductions / 100)).toFixed(4));
  const markupMult = markupDiv > 0 ? parseFloat((1 / markupDiv).toFixed(2)) : 1.0;

  let catPreset = 'outros';
  let catNome = 'Outros & Acessórios';
  if (catId === 7) {
    catPreset = 'genericos';
    catNome = 'Genéricos (Alta Absorção)';
  } else if (catId === 2 || catId === 1) {
    catPreset = 'referencia';
    catNome = 'Referência / Marca (Alto Giro)';
  } else if (catId === 5 || catId === 6) {
    catPreset = 'perfumaria';
    catNome = 'Perfumarias & Higiene';
  }

  return {
    impostoPct,
    taxaCartaoPct,
    custosVarPct,
    custoFixoPct: fixo,
    proLaboreTotalPct: pro,
    proLabore1Pct: s1,
    proLabore2Pct: s2,
    margemLiquidaPct: lucro,
    markupDivisor: markupDiv,
    markupMultiplicador: markupMult,
    categoriaPreset: catPreset,
    categoriaNome: catNome
  };
}

/**
 * Calcula o Preço Sugerido por Markup Divisor baseado nas porcentagens estabelecidas da BelaFarma.
 * Usado quando um produto dá entrada na loja sem preço de venda prévio.
 *
 * Deduções oficiais:
 * - Impostos: 4% (5% perfumaria)
 * - Taxa Cartão: 2.5%
 * - Custos Variáveis: 1.0%
 * - Custo Fixo Alvo: 30.0%
 * - Pró-Labore Alvo: 16.0%
 * - Lucro Líquido Alvo: 2.5%
 * Total = 56.0% (ou 57.0% perfumaria) -> Divisor: 0.44 -> Multiplicador ~2.27x
 *
 * @param {number} cmv Custo de Aquisição
 * @param {number} categoriaId Categoria do produto
 * @returns {number} Preço sugerido comercialmente
 */
function calcularPrecoSugeridoMarkup(cmv, categoriaId = 0) {
  const c = Number(cmv) || 0;
  if (c <= 0) return 0;

  const isPerfumaria = categoriaId === 5 || categoriaId === 6;
  const imposto = isPerfumaria ? 5.0 : 4.0;
  const totalDeducoes = imposto + 2.5 + 1.0 + 30.0 + 16.0 + 2.5; // 56% ou 57%
  const divisor = Math.max(0.05, 1 - (totalDeducoes / 100));

  const precoBruto = c / divisor;
  return roundUpToAcceptedCents(precoBruto);
}

/**
 * Sincroniza em lote ou individualmente todos os produtos ativos da loja
 * de compras_estoque_cache para product_pricing_customizations.
 *
 * @param {object} db Instância do banco SQLite local (better-sqlite3)
 * @param {object} options Opções de sincronização ({ apenasFaltantes: boolean, produtoId?: number })
 * @returns {object} Resumo com quantidade de atualizados e médias
 */
function sincronizarPorcentagensProdutos(db, options = {}) {
  if (!db) {
    console.warn('[Pricing Sync] Banco de dados não fornecido.');
    return { success: false, error: 'Database not provided' };
  }

  const inicio = Date.now();

  try {
    // 1. Identificar quais produtos precisam ser sincronizados
    let querySql = `
      SELECT 
        c.produto_id, 
        c.descricao, 
        c.ean, 
        COALESCE(c.preco_venda_vigente, c.preco_normal, 0) as preco, 
        COALESCE(c.custo_unitario, c.ultima_compra_valor, 0) as cmv, 
        COALESCE(c.saldo, 0) as estoque,
        c.categoria_id
      FROM compras_estoque_cache c
      WHERE (c.saldo > 0 OR c.vendas_10m > 0 OR c.ativo_10m = 1)
        AND COALESCE(c.preco_venda_vigente, c.preco_normal, 0) > 0
    `;

    if (options.produtoId) {
      querySql += ` AND c.produto_id = ${parseInt(options.produtoId, 10)}`;
    } else if (options.apenasFaltantes) {
      querySql += ` AND NOT EXISTS (SELECT 1 FROM product_pricing_customizations p WHERE p.produto_id = c.produto_id)`;
    }

    const produtos = db.prepare(querySql).all();

    if (!produtos || produtos.length === 0) {
      return {
        success: true,
        sincronizados: 0,
        duracaoMs: Date.now() - inicio,
        message: 'Nenhum produto precisou de sincronização de porcentagens.'
      };
    }

    const upsertStmt = db.prepare(`
      INSERT INTO product_pricing_customizations (
        produto_id, descricao, cod_barras, cmv, imposto_pct, taxa_cartao_pct, custos_variaveis_pct,
        custo_fixo_pct, pro_labore_1_pct, pro_labore_2_pct, pro_labore_total_pct, margem_liquida_pct,
        preco_venda, preco_anterior, markup_divisor, markup_multiplicador, categoria_preset, categoria_nome,
        estoque, atualizado_por, atualizado_em
      ) VALUES (
        @produto_id, @descricao, @cod_barras, @cmv, @imposto_pct, @taxa_cartao_pct, @custos_variaveis_pct,
        @custo_fixo_pct, @pro_labore_1_pct, @pro_labore_2_pct, @pro_labore_total_pct, @margem_liquida_pct,
        @preco_venda, @preco_anterior, @markup_divisor, @markup_multiplicador, @categoria_preset, @categoria_nome,
        @estoque, @atualizado_por, datetime('now', 'localtime')
      )
      ON CONFLICT(produto_id) DO UPDATE SET
        descricao = excluded.descricao,
        cod_barras = excluded.cod_barras,
        cmv = excluded.cmv,
        imposto_pct = excluded.imposto_pct,
        taxa_cartao_pct = excluded.taxa_cartao_pct,
        custos_variaveis_pct = excluded.custos_variaveis_pct,
        custo_fixo_pct = excluded.custo_fixo_pct,
        pro_labore_1_pct = excluded.pro_labore_1_pct,
        pro_labore_2_pct = excluded.pro_labore_2_pct,
        pro_labore_total_pct = excluded.pro_labore_total_pct,
        margem_liquida_pct = excluded.margem_liquida_pct,
        preco_venda = excluded.preco_venda,
        markup_divisor = excluded.markup_divisor,
        markup_multiplicador = excluded.markup_multiplicador,
        estoque = excluded.estoque,
        atualizado_por = excluded.atualizado_por,
        atualizado_em = datetime('now', 'localtime')
    `);

    const runBatch = db.transaction((itens) => {
      let count = 0;
      for (const it of itens) {
        const perc = calcularPorcentagensProduto(it.preco, it.cmv, it.categoria_id);
        upsertStmt.run({
          produto_id: it.produto_id,
          descricao: it.descricao || `Produto ${it.produto_id}`,
          cod_barras: it.ean || '',
          cmv: it.cmv || 0,
          imposto_pct: perc.impostoPct,
          taxa_cartao_pct: perc.taxaCartaoPct,
          custos_variaveis_pct: perc.custosVarPct,
          custo_fixo_pct: perc.custoFixoPct,
          pro_labore_1_pct: perc.proLabore1Pct,
          pro_labore_2_pct: perc.proLabore2Pct,
          pro_labore_total_pct: perc.proLaboreTotalPct,
          margem_liquida_pct: perc.margemLiquidaPct,
          preco_venda: it.preco,
          preco_anterior: it.preco,
          markup_divisor: perc.markupDivisor,
          markup_multiplicador: perc.markupMultiplicador,
          categoria_preset: perc.categoriaPreset,
          categoria_nome: perc.categoriaNome,
          estoque: it.estoque || 0,
          atualizado_por: options.atualizadoPor || 'Auto-Sync BelaFarma'
        });
        count++;
      }
      return count;
    });

    const totalAtualizados = runBatch(produtos);

    console.log(`[Pricing Sync] ✅ Sincronização concluída: ${totalAtualizados} produtos atualizados com as porcentagens estabelecidas (${Date.now() - inicio}ms).`);

    return {
      success: true,
      sincronizados: totalAtualizados,
      duracaoMs: Date.now() - inicio
    };
  } catch (err) {
    console.error('[Pricing Sync] ⚠️ Erro ao sincronizar porcentagens de produtos:', err.message);
    return {
      success: false,
      error: err.message,
      duracaoMs: Date.now() - inicio
    };
  }
}

module.exports = {
  roundUpToAcceptedCents,
  calcularPorcentagensProduto,
  calcularPrecoSugeridoMarkup,
  sincronizarPorcentagensProdutos
};
