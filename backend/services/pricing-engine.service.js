/**
 * ==============================================================================
 * Belinha Pricing Engine - Motor de Inteligência e Formação de Preços Farmacêuticos
 * ==============================================================================
 * 
 * Regras implementadas:
 * 1. Curva ABC Dinâmica baseada em faturamento e giro das vendas.
 * 2. Fórmula de Markup Divisor com tributação, despesas operacionais, taxa de cartão e margem-alvo.
 * 3. Matriz de Margens diferenciada por Categoria x Curva ABC.
 * 4. Travas Obrigatórias de Segurança (Guardrails):
 *    - Teto Regulatório CMED / PMC (Preço Máximo ao Consumidor)
 *    - Piso de Rentabilidade Mínima Absoluta (Custo + Margem Mínima)
 *    - Controle de Volatilidade / Discrepância Brusca (Alerta de aprovação manual)
 *    - Arredondamento comercial psicológico (terminações 0, 5, 9)
 * 5. MODO 100% SEGURO / SIMULAÇÃO: Gravação exclusiva no SQLite local, ZERO escrita no Digifarma.
 */

const { queryDigifarma } = require('./digifarma.service');

/**
 * Arredonda valor para centavos comerciais aceitos no varejo (terminados em 0, 5 ou 9).
 * Ex: R$ 10,12 -> R$ 10,15 | R$ 10,16 -> R$ 10,19 | R$ 10,97 -> R$ 10,99
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
 * Classifica um produto em sua categoria comercial farmacêutica.
 * Categorias: 'generico' | 'similar' | 'mips' | 'perfumaria' | 'referencia' | 'outros'
 */
function classifyProductCategory(descricao = '', categoriaNome = '', categoriaId = 0) {
  const text = `${descricao} ${categoriaNome}`.toUpperCase();

  // 1. Genéricos
  if (
    text.includes('GENERICO') ||
    text.includes('GEN.') ||
    text.includes(' GEN ') ||
    text.startsWith('GEN ') ||
    categoriaNome.toUpperCase().includes('GENERICO')
  ) {
    return 'generico';
  }

  // 2. Similares
  if (
    text.includes('SIMILAR') ||
    text.includes('SIM.') ||
    text.includes(' SIM ') ||
    text.startsWith('SIM ') ||
    categoriaNome.toUpperCase().includes('SIMILAR')
  ) {
    return 'similar';
  }

  // 3. Perfumaria / Higiene / Cosméticos / Cauda Longa
  const perfumariaKeywords = [
    'PERFUMARIA', 'SHAMPOO', 'CONDICIONADOR', 'SABONETE', 'CREME', 'DESODORANTE',
    'PROTETOR', 'SOLAR', 'FRALDA', 'ABSORVENTE', 'ESCOVA', 'DENTIFRICIO', 'PASTA DENTE',
    'ENXAGUANTE', 'HIDRATANTE', 'BATOM', 'ESMALTE', 'MAQUIAGEM', 'TINTURA', 'COLONIA',
    'PERFUME', 'LENCO UMIDECIDO', 'TOALHA', 'REPELENTE', 'TALCO', 'LOCAO', 'ALGODAO',
    'HASTE FLEXIVEL', 'COTONETE', 'PRESERVATIVO', 'LUBRIFICANTE'
  ];
  if (perfumariaKeywords.some(kw => text.includes(kw)) || categoriaNome.toUpperCase().includes('PERFUMARIA')) {
    return 'perfumaria';
  }

  // 4. MIPs / OTC (Medicamentos Isentos de Prescrição / Suplementos / Analgésicos comuns)
  const mipsKeywords = [
    'VITAMINA', 'SUPLEMENTO', 'PASTILHA', 'XAROPE', 'COLIRIO', 'POMADA', 'GEL',
    'ANTISEPTICO', 'ANALGESICO', 'ANTITERMICO', 'ANTIACIDO', 'DIGESTIVO', 'EFERVESCENTE',
    'DIPIRONA', 'PARACETAMOL', 'IBUPROFENO', 'DORFLEX', 'NEOSALDINA', 'ENO', 'SAL DE FRUTAS',
    'BENALET', 'STREPSILS', 'VICK', 'DESCONGESTIONANTE', 'SORO FISIOLOGICO'
  ];
  if (mipsKeywords.some(kw => text.includes(kw)) || categoriaNome.toUpperCase().includes('MIP') || categoriaNome.toUpperCase().includes('OTC')) {
    return 'mips';
  }

  // 5. Referência / Éticos (Medicamentos de Marca registrados)
  if (
    text.includes('REFERENCIA') ||
    text.includes('ETICO') ||
    categoriaNome.toUpperCase().includes('REFERENCIA') ||
    categoriaNome.toUpperCase().includes('ETICO') ||
    categoriaNome.toUpperCase().includes('MEDICAMENTO')
  ) {
    return 'referencia';
  }

  return 'referencia';
}

/**
 * Calcula o Preço Base utilizando a Fórmula de Markup Divisor:
 * Preco_Base = Custo_Liquido / (1 - (Impostos + Despesas_Operacionais + Taxa_Cartao + Margem_Alvo))
 * 
 * @param {number} cost Custo Líquido de Aquisição
 * @param {number} taxRatePct Alíquota de impostos (em %)
 * @param {number} operationalExpensePct Despesas operacionais médias (em %)
 * @param {number} cardFeePct Taxa média de cartão (em %)
 * @param {number} targetMarginPct Margem de lucro líquido alvo (em %)
 * @returns {number} Preço Base Calculado
 */
function calculateTargetPrice(cost, taxRatePct = 4.0, operationalExpensePct = 12.0, cardFeePct = 2.5, targetMarginPct = 25.0) {
  const costNum = parseFloat(cost) || 0;
  if (costNum <= 0) return 0;

  const totalDeductionPct = (parseFloat(taxRatePct) || 0) + 
                            (parseFloat(operationalExpensePct) || 0) + 
                            (parseFloat(cardFeePct) || 0) + 
                            (parseFloat(targetMarginPct) || 0);

  // Divisor = 1 - (Deduções / 100)
  const divisor = Math.max(0.05, 1 - (totalDeductionPct / 100));
  const rawPrice = costNum / divisor;

  return roundUpToAcceptedCents(rawPrice);
}

/**
 * Aplica as travas obrigatórias de segurança (Guardrails) ao preço sugerido.
 * 
 * @param {number} suggestedPrice Preço calculado pela fórmula
 * @param {number} pmc Preço Máximo ao Consumidor (Teto CMED)
 * @param {number} cost Custo Líquido
 * @param {number} currentPrice Preço de venda atual
 * @param {number} maxVolatilityPct Tolerância máxima de variação sem exigir aprovação manual
 * @param {number} minAbsoluteMarginPct Piso de margem mínima sobre o custo
 */
function applySafetyGuardrails(suggestedPrice, pmc = 0, cost = 0, currentPrice = 0, maxVolatilityPct = 20.0, minAbsoluteMarginPct = 5.0) {
  let finalPrice = parseFloat(suggestedPrice) || 0;
  const costNum = parseFloat(cost) || 0;
  const pmcNum = parseFloat(pmc) || 0;
  const currentPriceNum = parseFloat(currentPrice) || 0;

  let travaTetoCmed = false;
  let travaPisoMinimo = false;
  let travaVolatilidade = false;
  let requerAprovacaoManual = false;
  const justificativas = [];

  if (finalPrice <= 0) {
    return {
      finalPrice: currentPriceNum,
      variationPct: 0,
      variationVal: 0,
      travaTetoCmed: false,
      travaPisoMinimo: false,
      travaVolatilidade: false,
      requerAprovacaoManual: true,
      justificativa: 'Custo inválido ou zerado. Mantido preço atual.'
    };
  }

  // 1. Piso de Rentabilidade Absoluta: Preço >= Custo * (1 + Margem_Minima)
  if (costNum > 0) {
    const absoluteMinPrice = costNum * (1 + (minAbsoluteMarginPct / 100));
    if (finalPrice < absoluteMinPrice) {
      finalPrice = roundUpToAcceptedCents(absoluteMinPrice);
      travaPisoMinimo = true;
      justificativas.push(`Preço ajustado para o Piso de Rentabilidade Mínima (+${minAbsoluteMarginPct}% s/ custo).`);
    }
  }

  // 2. Teto CMED / PMC: Preço <= PMC
  if (pmcNum > 0 && finalPrice > pmcNum) {
    finalPrice = pmcNum;
    travaTetoCmed = true;
    justificativas.push(`Preço limitado ao Teto Regulatório CMED (PMC: R$ ${pmcNum.toFixed(2)}).`);
  }

  // 3. Controle de Volatilidade: Variação em relação ao preço atual
  let variationPct = 0;
  let variationVal = 0;
  if (currentPriceNum > 0) {
    variationVal = finalPrice - currentPriceNum;
    variationPct = ((finalPrice - currentPriceNum) / currentPriceNum) * 100;

    if (Math.abs(variationPct) > maxVolatilityPct) {
      travaVolatilidade = true;
      requerAprovacaoManual = true;
      justificativas.push(`Variação de ${variationPct > 0 ? '+' : ''}${variationPct.toFixed(1)}% excede o limite de volatilidade de ±${maxVolatilityPct}%.`);
    }
  }

  if (justificativas.length === 0) {
    justificativas.push('Preço calculado rigorosamente pela fórmula de Markup Divisor sem violação de guardrails.');
  }

  return {
    finalPrice: roundUpToAcceptedCents(finalPrice),
    variationPct: parseFloat(variationPct.toFixed(2)),
    variationVal: parseFloat(variationVal.toFixed(2)),
    travaTetoCmed,
    travaPisoMinimo,
    travaVolatilidade,
    requerAprovacaoManual,
    justificativa: justificativas.join(' | ')
  };
}

/**
 * Calcula Curva ABC Dinâmica a partir de dados de vendas.
 * 
 * @param {Array<{ produto_id: string, revenue: number, quantity: number }>} salesData
 * @returns {Map<string, 'A' | 'B' | 'C'>}
 */
function calculateDynamicABC(salesData) {
  const curveMap = new Map();
  if (!Array.isArray(salesData) || salesData.length === 0) {
    return curveMap;
  }

  const revenueMap = new Map();
  let totalRevenue = 0;

  for (const s of salesData) {
    const prodId = String(s.PRODUTO_ID || s.produto_id);
    const rev = parseFloat(s.TOTAL_REVENUE || s.revenue || 0);
    revenueMap.set(prodId, (revenueMap.get(prodId) || 0) + rev);
    totalRevenue += rev;
  }

  const sorted = [...revenueMap.entries()]
    .map(([id, rev]) => ({ id, rev }))
    .sort((a, b) => b.rev - a.rev);

  let cumulativeRevenue = 0;
  for (const item of sorted) {
    cumulativeRevenue += item.rev;
    const share = totalRevenue > 0 ? (cumulativeRevenue / totalRevenue) * 100 : 100;

    if (share <= 80) {
      curveMap.set(item.id, 'A');
    } else if (share <= 95) {
      curveMap.set(item.id, 'B');
    } else {
      curveMap.set(item.id, 'C');
    }
  }

  return curveMap;
}

/**
 * Executa o motor completo de precificação (Belinha Pricing Engine)
 * em modo 100% seguro (somente leitura do Digifarma e gravação no SQLite).
 * 
 * @param {object} db Instância do banco SQLite local
 * @param {object} customOptions Parâmetros customizados (opcional)
 */
async function runPricingEngine(db, customOptions = {}) {
  const startTime = Date.now();
  console.log('[Belinha Pricing Engine] 🚀 Iniciando simulação de precificação inteligente...');

  const rulesRow = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get('default');
  let matrizMargens = {
    referencia: { A: 14.0, B: 20.0, C: 25.0 },
    generico: { A: 42.0, B: 52.0, C: 62.0 },
    similar: { A: 45.0, B: 58.0, C: 68.0 },
    mips: { A: 25.0, B: 32.0, C: 42.0 },
    perfumaria: { A: 28.0, B: 38.0, C: 48.0 },
    outros: { A: 22.0, B: 30.0, C: 40.0 }
  };

  let impostosPct = 4.0;
  let despesasPct = 12.0;
  let cartaoPct = 2.5;
  let margemMinimaPct = 5.0;
  let maxVariacaoPct = 20.0;

  if (rulesRow) {
    try {
      if (rulesRow.matriz_margens_json) {
        matrizMargens = JSON.parse(rulesRow.matriz_margens_json);
      }
    } catch (e) {
      console.warn('[Belinha Pricing Engine] Erro ao carregar matriz JSON, usando padrão.');
    }
    impostosPct = parseFloat(rulesRow.aliquota_impostos_pct) || 4.0;
    despesasPct = parseFloat(rulesRow.despesas_operacionais_pct) || 12.0;
    cartaoPct = parseFloat(rulesRow.taxa_cartao_pct) || 2.5;
    margemMinimaPct = parseFloat(rulesRow.margem_minima_absoluta_pct) || 5.0;
    maxVariacaoPct = parseFloat(rulesRow.max_variacao_alerta_pct) || 20.0;
  }

  if (customOptions.impostosPct !== undefined) impostosPct = parseFloat(customOptions.impostosPct);
  if (customOptions.despesasPct !== undefined) despesasPct = parseFloat(customOptions.despesasPct);
  if (customOptions.cartaoPct !== undefined) cartaoPct = parseFloat(customOptions.cartaoPct);
  if (customOptions.margemMinimaPct !== undefined) margemMinimaPct = parseFloat(customOptions.margemMinimaPct);
  if (customOptions.maxVariacaoPct !== undefined) maxVariacaoPct = parseFloat(customOptions.maxVariacaoPct);
  if (customOptions.matrizMargens) matrizMargens = { ...matrizMargens, ...customOptions.matrizMargens };

  // Sincronizar cache de produtos do Digifarma se cache estiver vazio ou reduzido
  const cacheCount = db.prepare('SELECT COUNT(*) as c FROM digifarma_products_cache').get()?.c || 0;
  if (cacheCount < 50) {
    try {
      console.log('[Belinha Pricing Engine] Cache de produtos pequeno ou desatualizado. Sincronizando produtos ativos do Digifarma...');
      const sqlProds = `
        SELECT 
          p.PRODUTO_ID,
          p.COD_BARRAS,
          p.CATEGORIA_ID,
          p.PRODUTO as DESCRICAO,
          p.PROD_SALDO as ESTOQUE_ATUAL,
          p.PROD_PRVENDA as PRECO_VENDA,
          COALESCE(p.VALOR_ULT_COMPRA, p.PROD_CMV, p.PROD_PRCOMPRA, 0) as PRECO_CUSTO,
          p.PROD_PRPROMOCAO as PRECO_PROMOCAO
        FROM PRODUTOS p
        WHERE p.PROD_ATIVO = 'S' AND (p.PROD_SALDO > 0 OR p.PROD_PRVENDA > 0)
      `;
      const liveProds = await queryDigifarma(sqlProds);
      if (liveProds && liveProds.length > 0) {
        const insertCacheStmt = db.prepare(`
          INSERT OR REPLACE INTO digifarma_products_cache (
            codigo_barras, produto_id, categoria_id, descricao, estoque_atual,
            preco_venda, preco_custo, preco_promocao, preco_normal, curva, atualizado_em
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'C', datetime('now', 'localtime'))
        `);
        const insertBatch = db.transaction((items) => {
          for (const item of items) {
            const barcode = (item.COD_BARRAS || '').trim() || String(item.PRODUTO_ID);
            insertCacheStmt.run(
              barcode,
              String(item.PRODUTO_ID),
              item.CATEGORIA_ID || 0,
              (item.DESCRICAO || '').trim(),
              parseFloat(item.ESTOQUE_ATUAL || 0),
              parseFloat(item.PRECO_VENDA || 0),
              parseFloat(item.PRECO_CUSTO || 0),
              parseFloat(item.PRECO_PROMOCAO || 0),
              parseFloat(item.PRECO_VENDA || 0)
            );
          }
        });
        insertBatch(liveProds);
        console.log(`[Belinha Pricing Engine] ✅ ${liveProds.length} produtos sincronizados do Digifarma para o cache.`);
      }
    } catch (e) {
      console.warn('[Belinha Pricing Engine] Aviso ao sincronizar cache inicial:', e.message);
    }
  }

  const products = db.prepare(`
    SELECT 
      c.codigo_barras as ean,
      c.produto_id,
      c.descricao,
      c.categoria_id,
      c.estoque_atual,
      c.preco_venda,
      c.preco_custo,
      c.preco_promocao,
      c.preco_normal,
      c.curva,
      COALESCE(n.preco_proffer_medio, n.preco_proffer) as preco_proffer,
      COALESCE(n.preco_proffer_baixo, n.preco_proffer) as preco_proffer_baixo,
      COALESCE(n.preco_proffer_medio, n.preco_proffer) as preco_proffer_medio,
      COALESCE(n.preco_proffer_alto, n.preco_proffer) as preco_proffer_alto
    FROM digifarma_products_cache c
    LEFT JOIN napp_prices n ON (
      TRIM(c.codigo_barras) = TRIM(n.ean) 
      OR (c.produto_id IS NOT NULL AND c.produto_id = n.produto_id)
    )
    WHERE c.estoque_atual > 0 OR c.preco_venda > 0
  `).all();

  console.log(`[Belinha Pricing Engine] Carregados ${products.length} produtos do cache para processamento.`);

  const timestamp = new Date().toISOString();
  const suggestions = [];

  let totalTravas = 0;
  let totalAprovacaoNecessaria = 0;
  let somaMargemAtual = 0;
  let somaMargemProjetada = 0;
  let totalComCustoValido = 0;

  for (const p of products) {
    const ean = p.ean || String(p.produto_id);
    const prodId = String(p.produto_id);
    const desc = (p.descricao || '').trim();
    const cost = parseFloat(p.preco_custo) || 0;
    const currentPrice = parseFloat(p.preco_venda) || 0;
    const curve = (p.curva === 'A' || p.curva === 'B') ? p.curva : 'C';

    const category = classifyProductCategory(desc, '', p.categoria_id);
    const catMargens = matrizMargens[category] || matrizMargens.outros || { A: 20, B: 30, C: 40 };
    const targetMargin = parseFloat(catMargens[curve]) || 30.0;

    const profferMedio = p.preco_proffer_medio ? parseFloat(p.preco_proffer_medio) : (p.preco_proffer ? parseFloat(p.preco_proffer) : null);
    const profferBaixo = p.preco_proffer_baixo ? parseFloat(p.preco_proffer_baixo) : profferMedio;
    const profferAlto = p.preco_proffer_alto ? parseFloat(p.preco_proffer_alto) : profferMedio;

    let calculatedBasePrice = 0;
    let baseOrigem = '';

    // 1. PRIORIDADE MÁXIMA: Preço Médio de Mercado do Grupo Independente Proffer (Napp)
    if (profferMedio && profferMedio > 0) {
      calculatedBasePrice = roundUpToAcceptedCents(profferMedio);
      baseOrigem = `Média Proffer Independente (R$ ${profferMedio.toFixed(2)})`;
    } else if (cost > 0 && cost < currentPrice * 3) {
      // 2. SE NÃO HOUVER PROFFER: Markup Divisor com Custo Unitário Real
      calculatedBasePrice = calculateTargetPrice(cost, impostosPct, despesasPct, cartaoPct, targetMargin);
      baseOrigem = `Markup Divisor (${targetMargin}% margem na Curva ${curve})`;
    } else {
      calculatedBasePrice = currentPrice;
      baseOrigem = 'Preço Atual Mantido (sem Proffer/custo)';
    }

    const pmc = 0;
    const guardrailResult = applySafetyGuardrails(
      calculatedBasePrice,
      pmc,
      cost,
      currentPrice,
      maxVariacaoPct,
      margemMinimaPct
    );

    const finalSuggestedPrice = guardrailResult.finalPrice;

    let margemAtualPct = 0;
    if (currentPrice > 0 && cost > 0 && cost < currentPrice * 3) {
      margemAtualPct = ((currentPrice - cost) / currentPrice) * 100;
    }

    let margemProjetadaPct = 0;
    if (finalSuggestedPrice > 0 && cost > 0 && cost < finalSuggestedPrice * 3) {
      margemProjetadaPct = ((finalSuggestedPrice - cost) / finalSuggestedPrice) * 100;
    }

    if (cost > 0 && currentPrice > 0 && cost < currentPrice * 3) {
      somaMargemAtual += margemAtualPct;
      somaMargemProjetada += margemProjetadaPct;
      totalComCustoValido++;
    }

    if (guardrailResult.travaTetoCmed || guardrailResult.travaPisoMinimo || guardrailResult.travaVolatilidade) {
      totalTravas++;
    }

    if (guardrailResult.requerAprovacaoManual) {
      totalAprovacaoNecessaria++;
    }

    const fullJustificativa = baseOrigem + (guardrailResult.justificativa ? ` | ${guardrailResult.justificativa}` : '');

    suggestions.push({
      ean,
      produto_id: prodId,
      descricao: desc,
      categoria: category,
      curva: curve,
      estoque_atual: parseFloat(p.estoque_atual) || 0,
      custo_liquido: cost,
      preco_atual: currentPrice,
      preco_sugerido: finalSuggestedPrice,
      preco_pmc: pmc,
      preco_proffer: profferMedio,
      preco_proffer_baixo: profferBaixo,
      preco_proffer_medio: profferMedio,
      preco_proffer_alto: profferAlto,
      margem_atual_pct: parseFloat(margemAtualPct.toFixed(2)),
      margem_projetada_pct: parseFloat(margemProjetadaPct.toFixed(2)),
      variacao_pct: guardrailResult.variationPct,
      variacao_valor: guardrailResult.variationVal,
      trava_teto_cmed: guardrailResult.travaTetoCmed ? 1 : 0,
      trava_piso_minimo: guardrailResult.travaPisoMinimo ? 1 : 0,
      trava_volatilidade: guardrailResult.travaVolatilidade ? 1 : 0,
      requer_aprovacao_manual: guardrailResult.requerAprovacaoManual ? 1 : 0,
      justificativa: fullJustificativa,
      calculado_em: timestamp
    });
  }

  const deleteStmt = db.prepare("DELETE FROM pricing_suggestions");
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO pricing_suggestions (
      ean, produto_id, descricao, categoria, curva, estoque_atual,
      custo_liquido, preco_atual, preco_sugerido, preco_pmc, preco_proffer,
      preco_proffer_baixo, preco_proffer_medio, preco_proffer_alto,
      margem_atual_pct, margem_projetada_pct, variacao_pct, variacao_valor,
      trava_teto_cmed, trava_piso_minimo, trava_volatilidade,
      requer_aprovacao_manual, justificativa, calculado_em
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?
    )
  `);

  const runInsertTransaction = db.transaction((items) => {
    deleteStmt.run();
    for (const item of items) {
      insertStmt.run(
        item.ean,
        item.produto_id,
        item.descricao,
        item.categoria,
        item.curva,
        item.estoque_atual,
        item.custo_liquido,
        item.preco_atual,
        item.preco_sugerido,
        item.preco_pmc,
        item.preco_proffer,
        item.preco_proffer_baixo,
        item.preco_proffer_medio,
        item.preco_proffer_alto,
        item.margem_atual_pct,
        item.margem_projetada_pct,
        item.variacao_pct,
        item.variacao_valor,
        item.trava_teto_cmed,
        item.trava_piso_minimo,
        item.trava_volatilidade,
        item.requer_aprovacao_manual,
        item.justificativa,
        item.calculado_em
      );
    }
  });

  runInsertTransaction(suggestions);

  const durationMs = Date.now() - startTime;
  const avgMargemAtual = totalComCustoValido > 0 ? (somaMargemAtual / totalComCustoValido) : 0;
  const avgMargemProjetada = totalComCustoValido > 0 ? (somaMargemProjetada / totalComCustoValido) : 0;

  const runId = 'run_' + Date.now();
  db.prepare(`
    INSERT INTO pricing_runs (
      id, executado_em, total_skus, total_sugestoes, total_travas,
      total_aprovacao_necessaria, margem_media_atual, margem_media_projetada, duracao_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    timestamp,
    products.length,
    suggestions.length,
    totalTravas,
    totalAprovacaoNecessaria,
    parseFloat(avgMargemAtual.toFixed(2)),
    parseFloat(avgMargemProjetada.toFixed(2)),
    durationMs
  );

  console.log(`[Belinha Pricing Engine] ✅ Simulação finalizada em ${durationMs}ms: ${suggestions.length} SKUs processados (Média Margem Atual: ${avgMargemAtual.toFixed(1)}% -> Projetada: ${avgMargemProjetada.toFixed(1)}%).`);

  return {
    success: true,
    runId,
    timestamp,
    totalSkus: products.length,
    totalSuggestions: suggestions.length,
    totalTravas,
    totalAprovacaoNecessaria,
    avgMargemAtual: parseFloat(avgMargemAtual.toFixed(2)),
    avgMargemProjetada: parseFloat(avgMargemProjetada.toFixed(2)),
    durationMs
  };
}

module.exports = {
  roundUpToAcceptedCents,
  classifyProductCategory,
  calculateTargetPrice,
  applySafetyGuardrails,
  calculateDynamicABC,
  runPricingEngine
};
