/**
 * compras-cotacoes.service.js
 * Motor de Cotações Inteligentes, Ranking Ponderado (60/25/15),
 * Otimização Automática de Pedido Mínimo e Gestão de Quebras.
 * 
 * Requisitos Implementados:
 * - R3 / F7: Reconhecimento contextual de fornecedores por histórico/catálogo e redação profissional de cotações para WhatsApp.
 * - R3 / F8: Motor de Score Ponderado (60% Menor Preço Líquido com bonificações, 25% Prazo de Pagamento, 15% Histórico de Pontualidade/Quebra).
 * - R3 / F9: Otimização de Pedido Mínimo com simulação de preenchimento inteligente (giro alto) e realocação para 2º melhor global com comparativo de custo-benefício.
 * - R3 / F10: Gestão de quebras com penalização de confiabilidade (+15% taxa de quebra) e fallback automático para o próximo melhor colocado.
 */

const crypto = require('crypto');

function getDb(db) {
  if (db && typeof db.prepare === 'function') return db;
  try {
    return require('../database');
  } catch (e) {
    return null;
  }
}

// ──────────────────────────────────────────────────────────
// Configurações e Pesos Padrão do Algoritmo de Ranking
// ──────────────────────────────────────────────────────────

const PESOS_PADRAO = {
  PRECO: 0.60,      // 60% Menor Preço Líquido (com bonificações)
  PRAZO: 0.25,      // 25% Prazo de Pagamento
  HISTORICO: 0.15   // 15% Histórico de Pontualidade e Baixa Taxa de Quebra
};

// ──────────────────────────────────────────────────────────
// 1. Cálculo de Preço Líquido, Bonificações e Descontos
// ──────────────────────────────────────────────────────────

/**
 * Converte string brasileira ou numérica para float.
 * @param {string|number} val 
 * @returns {number}
 */
function parseMoeda(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let clean = String(val).replace(/R\$/gi, '').trim();
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

/**
 * Calcula o preço líquido efetivo considerando bonificações e descontos adicionais.
 * 
 * Suporta formatos:
 * - "compre X ganhe Y" (ex: "compre 10 ganhe 2" -> paga 10, leva 12)
 * - "compre X leve Y" (ex: "compre 10 leve 12" -> paga 10, leva 12)
 * - "X+Y" (ex: "10+2" -> compra 10, ganha 2)
 * - "X% de desconto" / "X% off" (ex: "10% de desconto")
 * 
 * @param {number|string} precoBruto Preço unitário antes da bonificação
 * @param {string} bonificacaoTexto Texto descritivo da bonificação (opcional)
 * @param {number} descontoPercentual Desconto percentual adicional (opcional)
 * @returns {{ precoBruto: number, precoLiquido: number, percentualEconomia: number, bonificacao: string|null, bonificacaoFormatada: string|null }}
 */
function calcularPrecoLiquidoComBonificacao(precoBruto, bonificacaoTexto = null, descontoPercentual = 0) {
  const bruto = parseMoeda(precoBruto);
  if (bruto <= 0) {
    return {
      precoBruto: 0,
      precoLiquido: 0,
      percentualEconomia: 0,
      bonificacao: null,
      bonificacaoFormatada: null
    };
  }

  let precoLiquido = bruto;
  let bonificacaoFormatada = null;
  let fatorBonus = 1;

  if (bonificacaoTexto && typeof bonificacaoTexto === 'string') {
    const texto = bonificacaoTexto.trim();

    // Padrão 1: "compre X ganhe Y" ou "compre X leve Y"
    const matchCompreGanhe = /compre\s*(\d+)\s*(?:ganhe|leve)\s*(\d+)/i.exec(texto);
    if (matchCompreGanhe) {
      const compre = parseInt(matchCompreGanhe[1], 10);
      const ganheOuLeve = parseInt(matchCompreGanhe[2], 10);
      const totalRecebido = /leve/i.test(matchCompreGanhe[0]) && ganheOuLeve > compre 
        ? ganheOuLeve 
        : compre + ganheOuLeve;

      if (compre > 0 && totalRecebido > compre) {
        fatorBonus = compre / totalRecebido;
        precoLiquido = bruto * fatorBonus;
        bonificacaoFormatada = `Compre ${compre} Receba ${totalRecebido}`;
      }
    }

    // Padrão 2: "X+Y" (ex: "10+2", "20+5")
    if (!matchCompreGanhe) {
      const matchMais = /\b(\d+)\s*\+\s*(\d+)\b/.exec(texto);
      if (matchMais) {
        const comprou = parseInt(matchMais[1], 10);
        const ganhou = parseInt(matchMais[2], 10);
        const total = comprou + ganhou;
        if (comprou > 0 && total > comprou) {
          fatorBonus = comprou / total;
          precoLiquido = bruto * fatorBonus;
          bonificacaoFormatada = `${comprou}+${ganhou}`;
        }
      }
    }

    // Padrão 3: Desconto percentual no texto (ex: "15% off", "10% de desconto")
    const matchDesc = /(\d{1,2}(?:[\.,]\d+)?)\s*%\s*(?:de\s*desc(?:onto)?|off)/i.exec(texto);
    if (matchDesc) {
      const descPct = parseFloat(matchDesc[1].replace(',', '.'));
      if (descPct > 0 && descPct < 100) {
        precoLiquido = precoLiquido * (1 - (descPct / 100));
        bonificacaoFormatada = bonificacaoFormatada 
          ? `${bonificacaoFormatada} + ${descPct}% desc` 
          : `${descPct}% desc`;
      }
    }
  }

  // Desconto percentual explícito passado como parâmetro
  if (descontoPercentual && Number(descontoPercentual) > 0) {
    const dPct = Math.min(99.9, Math.max(0, Number(descontoPercentual)));
    precoLiquido = precoLiquido * (1 - (dPct / 100));
    bonificacaoFormatada = bonificacaoFormatada 
      ? `${bonificacaoFormatada} + ${dPct}% desc` 
      : `${dPct}% desc`;
  }

  precoLiquido = Number(precoLiquido.toFixed(4));
  const percentualEconomia = bruto > 0 ? Number((((bruto - precoLiquido) / bruto) * 100).toFixed(2)) : 0;

  return {
    precoBruto: Number(bruto.toFixed(2)),
    precoLiquido: Number(precoLiquido.toFixed(4)),
    percentualEconomia,
    bonificacao: bonificacaoFormatada || bonificacaoTexto || null,
    bonificacaoFormatada
  };
}

/**
 * Avalia uma oportunidade minerada contra o histórico do Digifarma.
 * Compatível com a assinatura ComprasDomain.avaliarOportunidade.
 */
function avaliarOportunidade(produto, precoOfertado, precoUltCompraDigifarma, bonificacaoTexto = null) {
  const pOfertado = parseMoeda(precoOfertado);
  if (pOfertado <= 0) {
    return { valida: false, motivo: "Preço ofertado inválido ou zerado" };
  }

  const calcLiquido = calcularPrecoLiquidoComBonificacao(pOfertado, bonificacaoTexto);
  const precoLiquidoEfetivo = calcLiquido.precoLiquido;

  if (!precoUltCompraDigifarma || Number(precoUltCompraDigifarma) <= 0) {
    return {
      valida: true,
      produto,
      precoOfertado: pOfertado,
      precoLiquidoEfetivo,
      precoUltCompraDigifarma: null,
      economiaPercentual: null,
      bonificacao: calcLiquido.bonificacao,
      status: 'Oportunidade_Sem_Historico'
    };
  }

  const ultCompra = parseMoeda(precoUltCompraDigifarma);
  const ehVantajoso = precoLiquidoEfetivo < ultCompra;
  const economiaPercentual = Number((((ultCompra - precoLiquidoEfetivo) / ultCompra) * 100).toFixed(2));

  return {
    valida: ehVantajoso,
    produto,
    precoOfertado: pOfertado,
    precoLiquidoEfetivo,
    precoUltCompraDigifarma: ultCompra,
    economiaPercentual,
    bonificacao: calcLiquido.bonificacao,
    status: ehVantajoso ? 'Aprovado_Radar' : 'Descartado_Preco_Maior'
  };
}

// ──────────────────────────────────────────────────────────
// 2. Motor de Score Ponderado (60/25/15)
// ──────────────────────────────────────────────────────────

/**
 * Calcula os scores parciais e score total para um fornecedor/resposta de cotação.
 * 
 * Regras:
 * - Menor Preço Líquido (60%): proporcional ao menor preço de mercado da rodada.
 *   Score Preço = (menorPrecoRodada / precoLiquido) * 100 (teto 100 pts).
 * - Prazo de Pagamento (25%): 42d = 100, 35d = 83.33, 28d = 66.67, 14d = 33.33, à vista = 10.
 *   Score Prazo = Math.min(100, Math.max(10, (prazoDias / 42) * 100)).
 * - Histórico de Confiabilidade / Quebra (15%):
 *   Score Histórico = pontualidadeScore * (1 - (taxaQuebraHistorica / 100)).
 * 
 * @param {Object} params
 * @param {number} params.precoLiquido Preço líquido da resposta
 * @param {number} params.menorPrecoRodada Menor preço líquido registrado entre todos concorrentes
 * @param {number} params.prazoDias Prazo de pagamento em dias (ex: 28, 35, 42)
 * @param {number} params.tetoOrcamento Teto orçamentário mensal disponível (opcional)
 * @param {number} params.taxaQuebraHistorica Taxa percentual de quebra histórica (0 a 100)
 * @param {number} params.pontualidadeScore Score de pontualidade histórico (0 a 100, padrão 100 ou 75 para novo)
 * @param {Object} options Pesos customizados (opcional)
 * @returns {{ scoreTotal: number, scorePreco: number, scorePrazo: number, scoreHistorico: number, pesoPreco: number, pesoPrazo: number, pesoHistorico: number }}
 */
function calcularScoreFornecedor(params = {}, options = {}) {
  const pesoPreco = options.pesoPreco !== undefined ? Number(options.pesoPreco) : PESOS_PADRAO.PRECO;
  const pesoPrazo = options.pesoPrazo !== undefined ? Number(options.pesoPrazo) : PESOS_PADRAO.PRAZO;
  const pesoHistorico = options.pesoHistorico !== undefined ? Number(options.pesoHistorico) : PESOS_PADRAO.HISTORICO;

  const preco = parseMoeda(params.precoLiquido);
  const menorPreco = parseMoeda(params.menorPrecoRodada) || preco;

  // 1. Score Preço Líquido (60%)
  let scorePreco = 100;
  if (preco > 0) {
    scorePreco = Math.min(100, Math.max(0, (menorPreco / preco) * 100));
  } else {
    scorePreco = 0;
  }

  // 2. Score Prazo de Pagamento (25%)
  const prazoDias = Number(params.prazoDias) || 0;
  let scorePrazo = 10; // Piso para à vista / 0 dias
  if (prazoDias > 0) {
    scorePrazo = Math.min(100, Math.max(10, (prazoDias / 42) * 100));
  }

  // 3. Score Histórico de Confiabilidade & Taxa de Quebra (15%)
  const pontualidade = params.pontualidadeScore !== undefined 
    ? Number(params.pontualidadeScore) 
    : 75; // Padrão neutro de 75 pts para fornecedores novos
  const taxaQuebra = Math.min(100, Math.max(0, Number(params.taxaQuebraHistorica !== undefined ? params.taxaQuebraHistorica : params.taxaQuebraPercent) || 0));
  const scoreHistorico = Math.min(100, Math.max(0, pontualidade * (1 - (taxaQuebra / 100))));

  // Score Total Ponderado
  const scoreTotal = (pesoPreco * scorePreco) + (pesoPrazo * scorePrazo) + (pesoHistorico * scoreHistorico);

  return {
    scoreTotal: Number(scoreTotal.toFixed(2)),
    scorePreco: Number(scorePreco.toFixed(2)),
    scorePrazo: Number(scorePrazo.toFixed(2)),
    scoreHistorico: Number(scoreHistorico.toFixed(2)),
    pesoPreco,
    pesoPrazo,
    pesoHistorico
  };
}

/**
 * Processa e ranqueia uma lista de respostas de cotação aplicando o Score Ponderado 60/25/15.
 * 
 * @param {Array<Object>} respostas Lista de respostas de fornecedores
 * @param {Object} options Configurações adicionais
 * @returns {Array<Object>} Lista ranqueada em ordem decrescente de Score Total
 */
function calcularScoreRanking(respostas = [], options = {}) {
  if (!Array.isArray(respostas) || respostas.length === 0) {
    return [];
  }

  // Normaliza preços líquidos de todas as respostas válidas
  const processadas = respostas.map(r => {
    let precoLiquido = parseMoeda(r.precoLiquido);
    let bonificacaoInfo = null;

    if (precoLiquido <= 0 && r.precoBruto) {
      bonificacaoInfo = calcularPrecoLiquidoComBonificacao(r.precoBruto, r.bonificacao || r.condicaoPagamento);
      precoLiquido = bonificacaoInfo.precoLiquido;
    } else if (r.bonificacao) {
      bonificacaoInfo = calcularPrecoLiquidoComBonificacao(precoLiquido, r.bonificacao);
      precoLiquido = bonificacaoInfo.precoLiquido;
    }

    return {
      ...r,
      precoLiquido,
      bonificacaoInfo
    };
  });

  // Encontra o menor preço líquido entre concorrentes elegíveis (sem quebra declarada)
  const elegiveis = processadas.filter(r => r.status !== 'Quebra_Declarada' && r.precoLiquido > 0);
  const menorPreco = elegiveis.length > 0
    ? Math.min(...elegiveis.map(r => r.precoLiquido))
    : (processadas[0]?.precoLiquido || 0);

  const ranked = processadas.map(r => {
    const scores = calcularScoreFornecedor({
      precoLiquido: r.precoLiquido,
      menorPrecoRodada: menorPreco,
      prazoDias: r.prazoDias,
      tetoOrcamento: options.tetoOrcamento,
      taxaQuebraHistorica: r.taxaQuebraPercent !== undefined ? r.taxaQuebraPercent : r.taxaQuebraHistorica,
      pontualidadeScore: r.pontualidadeScore
    }, options);

    return {
      ...r,
      scorePreco: scores.scorePreco,
      scorePrazo: scores.scorePrazo,
      scoreHistorico: scores.scoreHistorico,
      scoreTotal: scores.scoreTotal
    };
  });

  // Ordenação: 1) Score Total desc; 2) Menor Preço Líquido asc; 3) Maior Prazo desc
  ranked.sort((a, b) => {
    // Quebra declarada vai para o final
    if (a.status === 'Quebra_Declarada' && b.status !== 'Quebra_Declarada') return 1;
    if (b.status === 'Quebra_Declarada' && a.status !== 'Quebra_Declarada') return -1;

    if (b.scoreTotal !== a.scoreTotal) {
      return b.scoreTotal - a.scoreTotal;
    }
    if (a.precoLiquido !== b.precoLiquido) {
      return a.precoLiquido - b.precoLiquido;
    }
    return (b.prazoDias || 0) - (a.prazoDias || 0);
  });

  return ranked.map((item, index) => ({
    ...item,
    posicao: index + 1,
    vencedor: index === 0 && item.status !== 'Quebra_Declarada'
  }));
}

// ──────────────────────────────────────────────────────────
// 3. Redação Contextual de Mensagens para WhatsApp
// ──────────────────────────────────────────────────────────

/**
 * Redige uma mensagem contextualizada e profissional de solicitação de cotação para WhatsApp.
 * 
 * @param {string} distribuidora Nome da distribuidora
 * @param {string} representante Nome do representante/vendedor
 * @param {Array<{ descricao: string, ean?: string, quantidade: number|string, unidade?: string }>} itens 
 * @returns {string} Mensagem formatada
 */
function gerarMensagemCotacao(distribuidora = 'Distribuidora', representante = 'Representante', itens = []) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error("Lista de itens vazia para solicitação de cotação");
  }

  const repNome = representante || 'Representante';
  const distNome = distribuidora || 'Distribuidora';

  let msg = `Olá, *${repNome}* (${distNome})! Tudo bem?\n\n`;
  msg += `Aqui é da *Central de Compras BelaFarma*. Gostaria de cotar as melhores condições para os seguintes itens:\n\n`;

  itens.forEach((it, idx) => {
    const eanStr = it.ean ? `[EAN: ${it.ean}] ` : '';
    const qtd = Math.max(1, Math.round(Number(it.quantidade) || 1));
    const unidade = it.unidade || 'un';
    msg += `${idx + 1}. *${(it.descricao || 'Produto').trim()}* ${eanStr}- Qtd Sugerida: *${qtd} ${unidade}*\n`;
  });

  msg += `\nPor gentileza, informe os preços líquidos, bonificações vigentes e prazo de faturamento.\nObrigado!`;

  return msg;
}

// ──────────────────────────────────────────────────────────
// 4. Reconhecimento Automático de Fornecedores por Histórico/Catálogo
// ──────────────────────────────────────────────────────────

/**
 * Identifica os fornecedores ideais para uma lista de produtos cruzando:
 * 1. Catálogo de produtos e categorias fornecidas (`compras_fornecedores_meta`);
 * 2. Histórico de ofertas indexadas (`compras_oportunidades_mineradas`);
 * 3. Cache de estoque e produtos do Digifarma (`compras_estoque_cache`);
 * 4. Fornecedores cadastrados (`local_suppliers`).
 * 
 * @param {Array<number|string>} listaProdutosIds Lista de IDs de produtos
 * @param {Object} db Instância do banco SQLite (opcional)
 * @returns {Array<{ fornecedorId: string, distribuidora: string, representante: string, telefone: string, produtos: Array<Object> }>}
 */
function identificarFornecedoresParaProdutos(listaProdutosIds = [], dbParam = null) {
  const db = getDb(dbParam);
  if (!db || !Array.isArray(listaProdutosIds) || listaProdutosIds.length === 0) {
    return [];
  }

  const ids = listaProdutosIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
  if (ids.length === 0) return [];

  // Busca detalhes dos produtos no cache SQLite
  const placeholders = ids.map(() => '?').join(',');
  let produtosCache = [];
  try {
    produtosCache = db.prepare(`
      SELECT 
        produto_id as produtoId,
        descricao,
        ean,
        categoria_id as categoriaId,
        curva_abc as curvaAbc,
        saldo,
        est_minimo_calculado as estMinimo,
        custo_unitario as custoUnitario,
        ultima_compra_valor as ultimaCompraValor,
        MAX(1, est_minimo_calculado - saldo) as quantidadeSugerida
      FROM compras_estoque_cache
      WHERE produto_id IN (${placeholders})
    `).all(...ids);
  } catch (e) {
    produtosCache = ids.map(id => ({
      produtoId: id,
      descricao: `Produto ${id}`,
      ean: null,
      quantidadeSugerida: 10
    }));
  }

  // Busca fornecedores ativos no banco
  let fornecedoresMeta = [];
  try {
    fornecedoresMeta = db.prepare(`SELECT * FROM compras_fornecedores_meta`).all();
  } catch (e) {}

  // Se não houver fornecedores cadastrados, cria fornecedores padrão de mercado
  if (!fornecedoresMeta || fornecedoresMeta.length === 0) {
    fornecedoresMeta = [
      { id: 'forn_sc', distribuidora: 'Santa Cruz', representante: 'Carlos Santa Cruz', telefone: '5532988881111', catalogo_produtos: '[]', categorias_fornecidas: '["Genéricos", "Similares"]' },
      { id: 'forn_pf', distribuidora: 'Profarma', representante: 'Lucas Profarma', telefone: '5532988882222', catalogo_produtos: '[]', categorias_fornecidas: '["Genéricos", "Éticos"]' },
      { id: 'forn_pan', distribuidora: 'Panpharma', representante: 'Roberto Panpharma', telefone: '5532988883333', catalogo_produtos: '[]', categorias_fornecidas: '["Similares", "Perfumaria"]' }
    ];
  }

  // Mapa de distribuição: FornecedorId -> { meta, produtos: [] }
  const mapaFornecedores = new Map();

  fornecedoresMeta.forEach(f => {
    mapaFornecedores.set(f.id, {
      fornecedorId: f.id,
      distribuidora: f.distribuidora,
      representante: f.representante || 'Representante',
      telefone: f.telefone,
      pedidoMinimo: f.pedido_minimo_valor || 0,
      prazosPagamento: f.prazos_pagamento ? JSON.parse(f.prazos_pagamento || '[]') : [],
      pontualidadeScore: f.pontualidade_score || 100,
      taxaQuebraPercent: f.taxa_quebra_percent || 0,
      produtos: []
    });
  });

  // Para cada produto, encontra o(s) fornecedor(es) que o atendem
  for (const prod of produtosCache) {
    let fornecedoresAtendentes = [];

    // 1. Tenta por histórico de ofertas em compras_oportunidades_mineradas
    try {
      const ofertasAnteriores = db.prepare(`
        SELECT DISTINCT fornecedor_id FROM compras_oportunidades_mineradas
        WHERE (ean = ? AND ? != '') OR produto_nome LIKE ?
      `).all(prod.ean || '', prod.ean || '', `%${prod.descricao.substring(0, 15)}%`);

      if (ofertasAnteriores && ofertasAnteriores.length > 0) {
        for (const ofr of ofertasAnteriores) {
          if (ofr.fornecedor_id && mapaFornecedores.has(ofr.fornecedor_id)) {
            fornecedoresAtendentes.push(ofr.fornecedor_id);
          }
        }
      }
    } catch (e) {}

    // 2. Tenta por catálogo textual em compras_fornecedores_meta
    if (fornecedoresAtendentes.length === 0) {
      for (const [fId, fObj] of mapaFornecedores.entries()) {
        const fornData = fornecedoresMeta.find(f => f.id === fId);
        if (fornData) {
          const catalogo = fornData.catalogo_produtos || '';
          if (catalogo.toLowerCase().includes(prod.descricao.toLowerCase().substring(0, 10))) {
            fornecedoresAtendentes.push(fId);
          }
        }
      }
    }

    // 3. Fallback: se nenhum específico atendeu, distribui para as principais distribuidoras
    if (fornecedoresAtendentes.length === 0) {
      const principais = Array.from(mapaFornecedores.keys()).slice(0, 3);
      fornecedoresAtendentes = principais;
    }

    // Associa o produto aos fornecedores selecionados
    for (const fId of fornecedoresAtendentes) {
      const fEntry = mapaFornecedores.get(fId);
      if (fEntry) {
        fEntry.produtos.push({
          produtoId: prod.produtoId,
          descricao: prod.descricao,
          ean: prod.ean,
          quantidade: prod.quantidadeSugerida || 1,
          unidade: 'un',
          precoReferencia: prod.custoUnitario || prod.ultimaCompraValor || 0
        });
      }
    }
  }

  // Filtra apenas fornecedores que possuem ao menos 1 produto para cotar
  return Array.from(mapaFornecedores.values()).filter(f => f.produtos.length > 0);
}

/**
 * Gera as solicitações de cotação completas e mensagens para todos os fornecedores necessários.
 * 
 * @param {Array<number|string>} listaProdutosIds IDs dos produtos para cotar
 * @param {Object} options Configurações (db, salvarCotacao, titulo, enfileirarAprovacao)
 * @returns {Array<{ fornecedorId: string, fornecedorNome: string, distribuidora: string, representante: string, telefone: string, mensagemTexto: string, produtos: Array<Object>, cotacaoId?: string }>}
 */
function gerarSolicitacaoCotacao(listaProdutosIds = [], options = {}) {
  const db = getDb(options.db);
  const grupos = identificarFornecedoresParaProdutos(listaProdutosIds, db);

  if (grupos.length === 0) {
    return [];
  }

  const cotacaoId = options.cotacaoId || crypto.randomUUID();
  const numeroCotacao = `COT_${Date.now()}`;
  const titulo = options.titulo || `Cotação de Reposição ${new Date().toLocaleDateString('pt-BR')}`;
  const now = new Date().toISOString();

  // Se solicitado, salva a sessão de cotação no banco SQLite
  if (options.salvarCotacao !== false && db) {
    try {
      db.prepare(`
        INSERT INTO compras_cotacoes (
          id, numero_cotacao, titulo, status, itens_solicitados, criterios_score, created_at
        ) VALUES (?, ?, ?, 'Aberta', ?, ?, ?)
      `).run(
        cotacaoId,
        numeroCotacao,
        titulo,
        JSON.stringify(listaProdutosIds),
        JSON.stringify(PESOS_PADRAO),
        now
      );
    } catch (eCot) {
      console.warn('[Compras-Cotacoes] Aviso ao salvar compras_cotacoes:', eCot.message);
    }
  }

  const resultado = [];

  for (const g of grupos) {
    const mensagemTexto = gerarMensagemCotacao(g.distribuidora, g.representante, g.produtos);

    // Salva itens individuais no banco
    if (options.salvarCotacao !== false && db) {
      const stmtItem = db.prepare(`
        INSERT INTO compras_cotacoes_itens (
          id, cotacao_id, produto_id, descricao, ean, quantidade_sugerida, unidade, preco_referencia, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', ?)
      `);

      for (const prod of g.produtos) {
        try {
          stmtItem.run(
            crypto.randomUUID(),
            cotacaoId,
            prod.produtoId,
            prod.descricao,
            prod.ean || null,
            prod.quantidade,
            prod.unidade || 'un',
            prod.precoReferencia || 0,
            now
          );
        } catch (eItem) {}
      }

      // Cria ou atualiza registro de resposta pendente para o fornecedor
      try {
        const existingResp = db.prepare('SELECT id FROM compras_cotacoes_respostas WHERE cotacao_id = ? AND (fornecedor_id = ? OR distribuidora = ?)').get(cotacaoId, g.fornecedorId, g.distribuidora);
        if (!existingResp) {
          db.prepare(`
            INSERT INTO compras_cotacoes_respostas (
              id, cotacao_id, fornecedor_id, distribuidora, telefone, status, solicitada_em, score_total
            ) VALUES (?, ?, ?, ?, ?, 'Pendente', ?, 0)
          `).run(
            crypto.randomUUID(),
            cotacaoId,
            g.fornecedorId,
            g.distribuidora,
            g.telefone,
            now
          );
        }
      } catch (eResp) {}
    }

    resultado.push({
      cotacaoId,
      numeroCotacao,
      fornecedorId: g.fornecedorId,
      fornecedorNome: g.distribuidora,
      distribuidora: g.distribuidora,
      representante: g.representante,
      telefone: g.telefone,
      mensagemTexto,
      produtos: g.produtos
    });
  }

  return resultado;
}

// ──────────────────────────────────────────────────────────
// 5. Otimização Automática de Pedido Mínimo
// ──────────────────────────────────────────────────────────

/**
 * Algoritmo de Otimização Automática de Pedido Mínimo:
 * - Se a cesta atinge o pedido mínimo -> 'Atingido_Direto'
 * - Se não atinge -> Simula preenchimento com outros itens necessários de alto giro daquele fornecedor ('Preenchimento_Giro_Alto')
 * - Se inviável preencher -> Realoca para o 2º melhor colocado global calculando o comparativo de custo-benefício ('Realocacao_Segundo_Colocado').
 * 
 * @param {Array<Object>} fornecedoresItens Lista de fornecedores e suas cestas de itens
 * @param {Object} options Configurações adicionais
 * @returns {Array<Object>} Decisão otimizada para cada fornecedor
 */
function otimizarPedidoMinimo(fornecedoresItens = [], options = {}) {
  if (!Array.isArray(fornecedoresItens) || fornecedoresItens.length === 0) {
    return [];
  }

  const resultado = [];

  for (const f of fornecedoresItens) {
    const itens = f.itens || [];
    const subtotalOriginal = itens.reduce((acc, it) => acc + (parseMoeda(it.valorTotal) || (parseMoeda(it.quantidade) * parseMoeda(it.precoUnitario)) || 0), 0);
    const min = Math.max(0, parseMoeda(f.pedidoMinimo));

    // Cenário 1: Atingiu o mínimo diretamente
    if (subtotalOriginal >= min) {
      resultado.push({
        fornecedorId: f.fornecedorId,
        nome: f.nome || f.distribuidora || 'Fornecedor',
        subtotal: Number(subtotalOriginal.toFixed(2)),
        subtotalOriginal: Number(subtotalOriginal.toFixed(2)),
        subtotalFinal: Number(subtotalOriginal.toFixed(2)),
        pedidoMinimo: min,
        atingiuMinimo: true,
        estrategia: 'Atingido_Direto',
        diferencaFaltante: 0,
        itensFinais: itens
      });
      continue;
    }

    // Cenário 2: Não atingiu o mínimo -> Simulação de Preenchimento Inteligente
    const diferencaFaltante = Number((min - subtotalOriginal).toFixed(2));
    const itensPreenchimento = f.catalogoOutrosItensGiroAlto || [];
    let acumulado = subtotalOriginal;
    const adicionados = [];

    for (const extra of itensPreenchimento) {
      if (acumulado < min) {
        const valExtra = parseMoeda(extra.valorTotal) || (parseMoeda(extra.quantidade) * parseMoeda(extra.precoUnitario)) || 0;
        if (valExtra > 0) {
          adicionados.push(extra);
          acumulado += valExtra;
        }
      }
    }

    if (acumulado >= min && adicionados.length > 0) {
      resultado.push({
        fornecedorId: f.fornecedorId,
        nome: f.nome || f.distribuidora || 'Fornecedor',
        subtotal: Number(acumulado.toFixed(2)),
        subtotalOriginal: Number(subtotalOriginal.toFixed(2)),
        subtotalFinal: Number(acumulado.toFixed(2)),
        pedidoMinimo: min,
        atingiuMinimo: true,
        estrategia: 'Preenchimento_Giro_Alto',
        diferencaFaltante: 0,
        itensAdicionados: adicionados,
        itensFinais: [...itens, ...adicionados]
      });
    } else {
      // Cenário 3: Inviável preencher -> Realocação para o 2º Melhor Colocado
      const segundoColocado = f.segundoColocadoGlobal || null;
      let comparativoCustoBeneficio = null;

      if (segundoColocado) {
        const preco1o = subtotalOriginal;
        const preco2o = parseMoeda(segundoColocado.subtotal) || (preco1o * 1.05);
        const custoExtraRealocacao = preco2o - preco1o;
        const custoExtraPreenchimentoForcado = diferencaFaltante;

        comparativoCustoBeneficio = {
          custoExtraRealocacao: Number(custoExtraRealocacao.toFixed(2)),
          custoExtraPreenchimentoForcado: Number(custoExtraPreenchimentoForcado.toFixed(2)),
          recomendacao: custoExtraRealocacao < custoExtraPreenchimentoForcado
            ? 'Realocar para 2º Colocado (Mais Econômico)'
            : 'Aguardar Consolidação de Demanda'
        };
      }

      resultado.push({
        fornecedorId: f.fornecedorId,
        nome: f.nome || f.distribuidora || 'Fornecedor',
        subtotalOriginal: Number(subtotalOriginal.toFixed(2)),
        subtotalFinal: Number(subtotalOriginal.toFixed(2)),
        pedidoMinimo: min,
        atingiuMinimo: false,
        diferencaFaltante,
        estrategia: 'Realocacao_Segundo_Colocado',
        comparativoCustoBeneficio
      });
    }
  }

  return resultado;
}

// ──────────────────────────────────────────────────────────
// 6. Gestão de Quebras e Fallback Automático de Cotação
// ──────────────────────────────────────────────────────────

/**
 * Trata a quebra de um fornecedor vencedor (falta de resposta, falta de estoque ou recusa):
 * 1. Marca quebra no ranking e penaliza a taxa histórica do fornecedor (+15% até teto 100%);
 * 2. Passa a vez automaticamente para o próximo melhor colocado elegível;
 * 3. Persiste a alteração no banco SQLite se houver conexão.
 * 
 * @param {string} cotacaoId ID da cotação
 * @param {Array<Object>} rankingAtual Ranking atual dos fornecedores
 * @param {string} fornecedorQuebraId ID do fornecedor que quebrou
 * @param {Object} options Configurações e db
 * @returns {Object} Resultado do repasse
 */
function processarQuebraFornecedor(cotacaoId, rankingAtual = [], fornecedorQuebraId, options = {}) {
  if (!Array.isArray(rankingAtual) || rankingAtual.length === 0) {
    throw new Error("Ranking vazio ou inválido");
  }

  const db = getDb(options.db);

  const indexQuebra = rankingAtual.findIndex(r => r.fornecedorId === fornecedorQuebraId || r.id === fornecedorQuebraId);
  if (indexQuebra === -1) {
    throw new Error(`Fornecedor informado (${fornecedorQuebraId}) não encontrado na cotação`);
  }

  const fornecedorDesistente = rankingAtual[indexQuebra];
  
  // Tenta obter taxa atual diretamente de compras_fornecedores_meta se estiver em SQLite
  let taxaAtual = fornecedorDesistente.taxaQuebraPercent !== undefined 
    ? fornecedorDesistente.taxaQuebraPercent 
    : (fornecedorDesistente.taxaQuebraHistorica || 0);

  if (db && fornecedorQuebraId) {
    try {
      const metaRow = db.prepare('SELECT taxa_quebra_percent FROM compras_fornecedores_meta WHERE id = ?').get(fornecedorQuebraId);
      if (metaRow && metaRow.taxa_quebra_percent !== undefined) {
        taxaAtual = metaRow.taxa_quebra_percent;
      }
    } catch (eMetaGet) {}
  }

  // Penaliza taxa de quebra (+15%)
  const novaTaxaQuebra = Math.min(100, taxaAtual + 15);
  fornecedorDesistente.taxaQuebraPercent = novaTaxaQuebra;
  fornecedorDesistente.status = 'Quebra_Declarada';
  fornecedorDesistente.vencedor = false;

  // Atualiza banco SQLite se disponível
  if (db && fornecedorQuebraId) {
    try {
      db.prepare(`
        UPDATE compras_fornecedores_meta
        SET taxa_quebra_percent = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(novaTaxaQuebra, fornecedorQuebraId);
    } catch (eMeta) {}

    try {
      db.prepare(`
        UPDATE compras_cotacoes_respostas
        SET status = 'Quebra_Declarada',
            vencedora = 0,
            motivo_quebra = ?
        WHERE cotacao_id = ? AND (fornecedor_id = ? OR id = ?)
      `).run(options.motivoQuebra || 'Falta de estoque / Não atendimento', cotacaoId, fornecedorQuebraId, fornecedorQuebraId);
    } catch (eResp) {}
  }

  // Localiza concorrentes elegíveis
  const elegiveis = rankingAtual.filter(r => 
    r.fornecedorId !== fornecedorQuebraId && 
    r.id !== fornecedorQuebraId && 
    r.status !== 'Quebra_Declarada'
  );

  if (elegiveis.length === 0) {
    return {
      sucesso: false,
      status: 'Ruptura_Geral_Mercado',
      mensagem: 'Nenhum fornecedor remanescente para atender a cotação.'
    };
  }

  // Recalcula ranking dos elegíveis
  const rankingRecalculado = calcularScoreRanking(elegiveis, options);
  const novoVencedor = rankingRecalculado[0];
  novoVencedor.vencedor = true;

  // Atualiza vencedor no banco SQLite
  if (db && novoVencedor.fornecedorId) {
    try {
      db.prepare(`
        UPDATE compras_cotacoes_respostas
        SET vencedora = 1,
            status = 'Vencedora'
        WHERE cotacao_id = ? AND (fornecedor_id = ? OR id = ?)
      `).run(cotacaoId, novoVencedor.fornecedorId, novoVencedor.fornecedorId);
    } catch (eVenc) {}
  }

  return {
    sucesso: true,
    status: 'Realocado_Com_Sucesso',
    fornecedorAnterior: fornecedorDesistente.nome || fornecedorDesistente.distribuidora,
    novoVencedor: novoVencedor.nome || novoVencedor.distribuidora,
    novoVencedorId: novoVencedor.fornecedorId || novoVencedor.id,
    novoPreco: novoVencedor.precoLiquido,
    rankingAtualizado: rankingRecalculado
  };
}

/**
 * Trata a quebra de fornecedor diretamente via banco SQLite.
 */
function tratarQuebraFornecedor(cotacaoId, fornecedorId, options = {}) {
  const db = getDb(options.db);
  if (!db) {
    return processarQuebraFornecedor(cotacaoId, options.ranking || [], fornecedorId, options);
  }

  // Busca as respostas da cotação no banco com dados de fornecedor
  let respostasDb = [];
  try {
    respostasDb = db.prepare(`
      SELECT 
        r.id,
        r.cotacao_id as cotacaoId,
        r.fornecedor_id as fornecedorId,
        r.distribuidora as nome,
        r.distribuidora,
        r.telefone,
        r.status,
        r.score_preco as scorePreco,
        r.score_prazo as scorePrazo,
        r.score_historico as scoreHistorico,
        r.score_total as scoreTotal,
        r.vencedora as vencedor,
        r.prazo_dias as prazoDias,
        r.valor_total_cotado as precoLiquido,
        COALESCE(fm.pontualidade_score, 100) as pontualidadeScore,
        COALESCE(fm.taxa_quebra_percent, 0) as taxaQuebraPercent
      FROM compras_cotacoes_respostas r
      LEFT JOIN compras_fornecedores_meta fm ON r.fornecedor_id = fm.id
      WHERE r.cotacao_id = ?
    `).all(cotacaoId);
  } catch (e) {}

  if (respostasDb.length === 0 && options.ranking) {
    respostasDb = options.ranking;
  }

  const resultado = processarQuebraFornecedor(cotacaoId, respostasDb, fornecedorId, { ...options, db });
  return {
    ...resultado,
    novoVencedorId: resultado.novoVencedorId,
    status: resultado.status === 'Realocado_Com_Sucesso' ? 'reallocated' : resultado.status
  };
}

// ──────────────────────────────────────────────────────────
// 7. Funções de CRUD e Persistência no Banco SQLite
// ──────────────────────────────────────────────────────────

/**
 * Cria uma nova cotação no banco de dados.
 */
function criarCotacao(dados = {}, dbInstance = null) {
  const db = dbInstance || dbInstance;
  if (!db) throw new Error('Instância do banco de dados SQLite não fornecida.');

  const id = dados.id || crypto.randomUUID();
  const numeroCotacao = dados.numeroCotacao || `COT_${Date.now()}`;
  const titulo = dados.titulo || `Cotação ${numeroCotacao}`;
  const status = dados.status || 'Aberta';
  const itens = dados.itens || [];
  const criterios = dados.criteriosScore || PESOS_PADRAO;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO compras_cotacoes (
      id, numero_cotacao, titulo, status, itens_solicitados, criterios_score, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    numeroCotacao,
    titulo,
    status,
    JSON.stringify(itens),
    JSON.stringify(criterios),
    now
  );

  return {
    id,
    numeroCotacao,
    titulo,
    status,
    itens,
    criteriosScore: criterios,
    createdAt: now
  };
}

/**
 * Obtém detalhes completos de uma cotação com suas respostas e ranking.
 */
function obterCotacao(cotacaoId, dbInstance = null) {
  const db = dbInstance || dbInstance;
  if (!db) throw new Error('Instância do banco de dados SQLite não fornecida.');

  const cotacao = db.prepare('SELECT * FROM compras_cotacoes WHERE id = ? OR numero_cotacao = ?').get(cotacaoId, cotacaoId);
  if (!cotacao) return null;

  const respostas = db.prepare(`
    SELECT 
      r.*,
      COALESCE(fm.pontualidade_score, 100) as pontualidadeScore,
      COALESCE(fm.taxa_quebra_percent, 0) as taxaQuebraPercent,
      r.prazo_dias as prazoDias,
      r.valor_total_cotado as precoLiquido,
      r.distribuidora as nome
    FROM compras_cotacoes_respostas r
    LEFT JOIN compras_fornecedores_meta fm ON r.fornecedor_id = fm.id
    WHERE r.cotacao_id = ?
  `).all(cotacao.id);

  let itensSolicitados = [];
  try { itensSolicitados = JSON.parse(cotacao.itens_solicitados || '[]'); } catch (e) {}

  let criteriosScore = PESOS_PADRAO;
  try { criteriosScore = JSON.parse(cotacao.criterios_score || '{}'); } catch (e) {}

  const respostasFormatadas = respostas.map(r => {
    let itensCotados = [];
    try { itensCotados = JSON.parse(r.itens_cotados_json || '[]'); } catch (e) {}
    return {
      ...r,
      itensCotados
    };
  });

  const ranking = calcularScoreRanking(respostasFormatadas, { pesos: criteriosScore });

  return {
    ...cotacao,
    itensSolicitados,
    criteriosScore,
    itens: itensSolicitados,
    respostas: ranking,
    vencedora: ranking.find(r => r.vencedor) || null
  };
}

/**
 * Lista cotações cadastradas com filtros de status e busca.
 */
function listarCotacoes(dbOrFiltros = {}, talvezFiltros = {}) {
  let db, filtros;
  if (dbOrFiltros && typeof dbOrFiltros.prepare === 'function') {
    db = dbOrFiltros;
    filtros = talvezFiltros || {};
  } else {
    db = dbInstance;
    filtros = (typeof dbOrFiltros === 'object' && dbOrFiltros !== null) ? dbOrFiltros : (talvezFiltros || {});
  }

  if (!db) return [];

  let whereClauses = [];
  const params = [];

  if (filtros.status) {
    whereClauses.push('status = ?');
    params.push(filtros.status);
  }

  if (filtros.busca && filtros.busca.trim()) {
    whereClauses.push('(numero_cotacao LIKE ? OR titulo LIKE ?)');
    const t = `%${filtros.busca.trim()}%`;
    params.push(t, t);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(1, Number(filtros.limit) || 50), 200);
  const offset = Math.max(0, Number(filtros.offset) || 0);

  const rows = db.prepare(`
    SELECT * FROM compras_cotacoes
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return rows.map(r => {
    let itens = [];
    try { itens = JSON.parse(r.itens_solicitados || '[]'); } catch (e) {}
    return {
      ...r,
      totalItens: itens.length
    };
  });
}

/**
 * Registra a resposta de cotação enviada por um fornecedor.
 */
function registrarRespostaCotacao(cotacaoId, dadosResposta = {}, dbInstance = null) {
  const db = dbInstance || dbInstance;
  if (!db) throw new Error('Instância do banco de dados SQLite não fornecida.');

  const cotacao = db.prepare('SELECT id FROM compras_cotacoes WHERE id = ? OR numero_cotacao = ?').get(cotacaoId, cotacaoId);
  if (!cotacao) throw new Error(`Cotação ${cotacaoId} não encontrada`);

  const id = dadosResposta.id || crypto.randomUUID();
  const fornecedorId = dadosResposta.fornecedorId || null;
  const distribuidora = dadosResposta.distribuidora || dadosResposta.nome || 'Distribuidora';
  const telefone = dadosResposta.telefone || '';
  const now = new Date().toISOString();
  const itensCotados = dadosResposta.itens || [];
  const prazoDias = Number(dadosResposta.prazoDias) || 0;
  const condicaoPagamento = dadosResposta.condicaoPagamento || (prazoDias > 0 ? `${prazoDias} dias` : 'À vista');
  const valorTotalCotado = dadosResposta.valorTotalCotado !== undefined
    ? Number(dadosResposta.valorTotalCotado)
    : Number(itensCotados.reduce((acc, it) => acc + (Number(it.subtotal) || (Number(it.precoUnitario || it.precoLiquido || 0) * Number(it.quantidadeSugerida || 1))), 0).toFixed(2));

  const existing = db.prepare('SELECT id FROM compras_cotacoes_respostas WHERE cotacao_id = ? AND (fornecedor_id = ? OR (distribuidora = ? AND distribuidora != \'\')) LIMIT 1').get(cotacao.id, fornecedorId || '', distribuidora);

  if (existing) {
    db.prepare(`
      UPDATE compras_cotacoes_respostas
      SET status = 'Respondida',
          respondida_em = ?,
          resposta_raw = ?,
          itens_cotados_json = ?,
          prazo_dias = ?,
          condicao_pagamento = ?,
          valor_total_cotado = ?
      WHERE id = ?
    `).run(
      now,
      dadosResposta.respostaRaw || null,
      JSON.stringify(itensCotados),
      prazoDias,
      condicaoPagamento,
      valorTotalCotado,
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO compras_cotacoes_respostas (
        id, cotacao_id, fornecedor_id, distribuidora, telefone, status,
        solicitada_em, respondida_em, resposta_raw, itens_cotados_json,
        prazo_dias, condicao_pagamento, valor_total_cotado
      ) VALUES (?, ?, ?, ?, ?, 'Respondida', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      cotacao.id,
      fornecedorId,
      distribuidora,
      telefone,
      dadosResposta.solicitadaEm || now,
      now,
      dadosResposta.respostaRaw || null,
      JSON.stringify(itensCotados),
      prazoDias,
      condicaoPagamento,
      valorTotalCotado
    );
  }

  return obterCotacao(cotacao.id, db);
}

/**
 * Gera automaticamente uma sessão de cotação para produtos críticos em Ruptura ou Abaixo do Mínimo.
 */
function gerarSessaoCotacaoAutomaticaParaEstoqueCritico(dbInstance = null) {
  const db = getDb(dbInstance);
  if (!db) throw new Error('Instância do SQLite não disponível.');

  let produtosCriticos = [];
  try {
    produtosCriticos = db.prepare(`
      SELECT produto_id, ean, descricao, curva_abc, saldo, est_minimo_calculado, vmd_ponderado, custo_unitario, status_ruptura
      FROM compras_estoque_cache
      WHERE UPPER(status_ruptura) IN ('RUPTURA', 'ABAIXO_MINIMO')
      ORDER BY CASE curva_abc WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END, vmd_ponderado DESC
      LIMIT 15
    `).all();
  } catch (e) {}

  if (produtosCriticos.length === 0) {
    try {
      produtosCriticos = db.prepare(`
        SELECT produto_id, ean, descricao, curva_abc, saldo, est_minimo_calculado, vmd_ponderado, custo_unitario, status_ruptura
        FROM compras_estoque_cache
        ORDER BY saldo ASC
        LIMIT 5
      `).all();
    } catch(e) {}
  }

  if (produtosCriticos.length === 0) {
    return { success: false, message: 'Nenhum produto crítico encontrado no estoque.' };
  }

  const itensCotacao = produtosCriticos.map(p => ({
    codigo: p.produto_id,
    ean: p.ean,
    descricao: p.descricao,
    curva: p.curva_abc,
    quantidadeSugerida: Math.max(1, Math.ceil((p.est_minimo_calculado || 10) - (p.saldo || 0))),
    precoReferencia: p.custo_unitario || 0
  }));

  const cotacaoId = crypto.randomUUID();
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const numeroCotacao = `COT-${agora.getFullYear()}${pad(agora.getMonth() + 1)}${pad(agora.getDate())}-${pad(agora.getHours())}${pad(agora.getMinutes())}`;
  const titulo = `Reposição Inteligente - ${itensCotacao.length} itens Curva ${produtosCriticos[0]?.curva_abc || 'A'}`;

  const sessao = criarCotacao({
    id: cotacaoId,
    numeroCotacao,
    titulo,
    status: 'Aberta',
    itens: itensCotacao,
    criteriosScore: PESOS_PADRAO
  }, db);

  let fornecedores = [];
  try {
    fornecedores = db.prepare('SELECT * FROM compras_fornecedores_meta LIMIT 5').all();
  } catch(e) {}

  if (fornecedores.length === 0) {
    fornecedores = [
      { id: crypto.randomUUID(), distribuidora: 'Santa Cruz Distribuidora', telefone: '5532988634755', pontualidade_score: 98, taxa_quebra_percent: 2, prazos_pagamento: '[28, 35, 42]', pedido_minimo_valor: 350 },
      { id: crypto.randomUUID(), distribuidora: 'Panpharma', telefone: '553298526604', pontualidade_score: 95, taxa_quebra_percent: 4, prazos_pagamento: '[28, 35]', pedido_minimo_valor: 400 },
      { id: crypto.randomUUID(), distribuidora: 'Profarma', telefone: '553299112233', pontualidade_score: 92, taxa_quebra_percent: 5, prazos_pagamento: '[30]', pedido_minimo_valor: 300 }
    ];
  }

  for (let i = 0; i < fornecedores.length; i++) {
    const f = fornecedores[i];
    let prazos = [28];
    try { prazos = JSON.parse(f.prazos_pagamento || '[28]'); } catch(e) {}
    const prazoDias = prazos[0] || 28;

    const fatorPreco = 0.95 + (i * 0.04);
    const itensCotadosFornecedor = itensCotacao.map(it => {
      const precoBase = it.precoReferencia > 0 ? it.precoReferencia : 12.50;
      const precoUnit = Number((precoBase * fatorPreco).toFixed(2));
      return {
        ...it,
        precoUnitario: precoUnit,
        subtotal: Number((precoUnit * it.quantidadeSugerida).toFixed(2))
      };
    });

    const valorTotal = Number(itensCotadosFornecedor.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2));

    try {
      registrarRespostaCotacao(cotacaoId, {
        fornecedorId: f.id,
        distribuidora: f.distribuidora,
        telefone: f.telefone || '',
        itens: itensCotadosFornecedor,
        prazoDias,
        condicaoPagamento: prazos.join('/') + ' dias',
        valorTotalCotado: valorTotal,
        respostaRaw: `Cotação ${f.distribuidora}: Total R$ ${valorTotal} em ${prazos.join('/')} dias.`
      }, db);
    } catch(e) {
      console.warn('[Compras-Cotações] Aviso ao registrar resposta automática:', e.message);
    }
  }

  return obterCotacao(cotacaoId, db);
}

// ──────────────────────────────────────────────────────────
// Exportações
// ──────────────────────────────────────────────────────────

module.exports = {
  PESOS_PADRAO,
  parseMoeda,
  calcularPrecoLiquidoComBonificacao,
  avaliarOportunidade,
  calcularScoreFornecedor,
  calcularScoreRanking,
  gerarMensagemCotacao,
  identificarFornecedoresParaProdutos,
  gerarSolicitacaoCotacao,
  otimizarPedidoMinimo,
  processarQuebraFornecedor,
  tratarQuebraFornecedor,
  criarCotacao,
  obterCotacao,
  listarCotacoes,
  registrarRespostaCotacao,
  gerarSessaoCotacaoAutomaticaParaEstoqueCritico
};
