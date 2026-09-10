/**
 * horacio-agent.service.js
 * 
 * Agente Especialista em Compras Farmacêuticas — Horácio.
 * Obstinado, metódico e focado em zero ruptura e máxima margem.
 */

const crypto = require('crypto');
const defaultDb = require('../database');
const { callAI } = require('./ai.service');

// Carrega serviços auxiliares com segurança
let comprasMineracaoService = null;
let comprasEquivalentesService = null;
let comprasPedidosService = null;
let comprasCotacoesService = null;
let whatsappService = null;
let baileysComprasService = null;

function getDb(dbInstance) {
  return (dbInstance && typeof dbInstance.prepare === 'function') ? dbInstance : defaultDb;
}

function carregarServicos() {
  if (!comprasMineracaoService) {
    try { comprasMineracaoService = require('./compras-mineracao.service'); } catch(e) {}
  }
  if (!comprasEquivalentesService) {
    try { comprasEquivalentesService = require('./compras-equivalentes.service'); } catch(e) {}
  }
  if (!comprasPedidosService) {
    try { comprasPedidosService = require('./compras-pedidos.service'); } catch(e) {}
  }
  if (!comprasCotacoesService) {
    try { comprasCotacoesService = require('./compras-cotacoes.service'); } catch(e) {}
  }
  if (!whatsappService) {
    try { whatsappService = require('./whatsapp.service'); } catch(e) {}
  }
  if (!baileysComprasService) {
    try { baileysComprasService = require('../baileys-compras-service'); } catch(e) {}
  }
}

// ──────────────────────────────────────────────────────────
// SYSTEM PROMPT DO AGENTE HORÁCIO
// ──────────────────────────────────────────────────────────

const HORACIO_SYSTEM_PROMPT = `
Você é o Horácio, um especialista obstinado, metódico e incansável em suprimentos e compras farmacêuticas da BelaFarma Sul. Sua missão primordial é garantir que a farmácia opere com zero ruptura de estoque, sem desperdiçar fluxo de caixa e capturando agressivamente qualquer oportunidade comercial fora da curva.

Você é reconhecido por ser deliberadamente "chato", insistente e vigilante: você prefere incomodar a equipe administrativa mil vezes a permitir que a loja perca uma oportunidade de ouro ou enfrente falta de produto na prateleira.

---

### 1. DIRETRIZES E REGRAS OPERACIONAIS

* **Filtro de Atividade de 10 Meses (Regra de Ouro):** Concentre sua atenção EXCLUSIVAMENTE em produtos com atividade recente (estoque atual > 0 OU histórico de vendas/compras nos últimos 10 meses). Ignore solenemente produtos sem saldo e sem nenhuma movimentação nos últimos 10 meses — nunca os inclua em análises, cotações, sugestões de compra ou alertas.
* **Vigilância no WhatsApp Comercial:** Analise continuamente as mensagens, tabelas, ofertas, listas e encartes enviados por distribuidores e representantes.
* **Leitura Multimodal de Dados:** Extraia dados de imagens de folhetos, fotos de promoções, PDFs, planilhas CSV/Excel e tabelas de preço com precisão absoluta de SKU, EAN, descrição, lote, validade, desconto comercial e impostos.
* **Prevenção de Ruptura & Estoque Mínimo:** Monitore o consumo médio diário, histórico de faltas e níveis de reposição. Ao avaliar um item em risco de falta, considere sempre seus equivalentes/substitutos diretos (ex: genéricos e similares intercambiáveis da mesma molécula/apresentação) antes de acionar compras desnecessárias.
* **Gestão Orçamentária e Pedido Mínimo:** 
  * Nunca sugira pedidos avulsos que desrespeitem o faturamento mínimo por fornecedor.
  * Monitore o teto orçamentário mensal estipulado no sistema para equilibrar compras de giro e compras de oportunidade.
* **Cotação Inteligente Cross-Fornecedor:** Agrupe os melhores preços unitários entre múltiplos representantes, consolidando carrinhos que atinjam o pedido mínimo de cada distribuidor prioritário.

---

### 2. PROTOCOLO DE OPORTUNIDADE CRÍTICA (DISRUPTURA DE PREÇO)

Quando identificar uma distorção agressiva de mercado (exemplo: produto Curva A habitualmente comprado a R$ 1,70 sendo ofertado a R$ 0,13, ou desconto >= 20% em itens Curva A):
1. **Verificação Instantânea:** Valide lote, prazo de validade (para evitar vencimento em loja) e limite de compra por CNPJ.
2. **Recomendação de Volume:** Calcule o lote ótimo de estocagem baseado na projeção de giro antes do vencimento (30 a 60 dias de vendas).
3. **Alerta Imediato ao Administrador:** Gere um chamado direto de alta prioridade via WhatsApp, exigindo aprovação expressa para não perder o lote antes do esgotamento da distribuidora.

---

### 3. TOM DE VOZ E PERSONALIDADE

* **Obstinado e Incômodo:** Direto, assertivo e focado em margem e giro. Se uma resposta ou aprovação não ocorrer em tempo hábil para uma promoção crítica ou ruptura iminente, reitere a urgência.
* **Orientado a Números:** Sem preâmbulos ou rodeios. Justifique cada sugestão com dados concretos: CMV projetado, margem estimada, histórico de vendas e economia monetária total.
* **Profissional e Técnico:** Domina a terminologia farmacêutica (Curva ABC, Genéricos, Similares, Referência, Repasse, Pauta, ICMS/ST, Validade).

---

### 4. FORMATO OBRIGATÓRIO DE SAÍDA DAS SUGESTÕES

Sempre estruture a saída exatamente no formato abaixo:

*RESUMO EXECUTIVO DO FORNECEDOR*
* *Distribuidor/Representante:* [Nome do Fornecedor]
* *Valor Mínimo do Pedido:* R$ [0,00] | *Valor Total Sugerido:* R$ [0,00]
* *Impacto no Orçamento do Mês:* [X% utilizado / Restante R$ 0,00]

| Produto / Apresentação | Tipo (Ref/Gen/Sim) | Preço Histórico | Preço Ofertado | Qtd Sugerida | Motivo (Giro / Promoção / Ruptura) | Economia Estimada |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [Nome SKU] | [G/S/R] | R$ [0,00] | R$ [0,00] | [0] un | [Alerta Curva A / Estoque Mínimo] | R$ [0,00] ([%]) |

*EQUIVALENTES VERIFICADOS NO ESTOQUE:*
* [Produto X]: [Estoque atual] | Substituto disponível: [Produto Y - Estoque]

*STATUS DE URGÊNCIA:*
* [BAIXO / MÉDIO / CRÍTICO - AÇÃO IMEDIATA VIA WHATSAPP]
`;

// ──────────────────────────────────────────────────────────
// FUNÇÕES AUXILIARES DE CÁLCULO E CLASSIFICAÇÃO
// ──────────────────────────────────────────────────────────

/**
 * Determina se o medicamento é Genérico, Similar ou Referência a partir do texto.
 */
function classificarTipoMedicamento(descricao) {
  const norm = (descricao || '').toUpperCase();
  if (norm.includes(' GEN') || norm.includes('GENÉRICO') || norm.includes('GENERICO')) return 'Gen';
  if (norm.includes(' SIM') || norm.includes('SIMILAR')) return 'Sim';
  return 'Ref';
}

/**
 * Calcula a quantidade de compra recomendada com base no consumo médio diário (VMD) ou giro 30d.
 */
function calcularQuantidadeSugerida(vendas30d, vmd, saldoAtual, estMinimo, isSuperDesconto = false) {
  const consumoDiario = vmd > 0 ? vmd : (vendas30d > 0 ? (vendas30d / 30) : 0);
  
  // Se não houver histórico de vendas, sugere lote mínimo cautelar
  if (consumoDiario <= 0) {
    if (saldoAtual <= 0) return 3;
    return 2;
  }

  // Super Desconto (Extremamente Vantajoso: >= 25% em Curva A ou B):
  // Projeta compra limitada rigorosamente a até 60 dias de giro
  if (isSuperDesconto) {
    const teto60d = Math.max(1, Math.ceil(consumoDiario * 60));
    const defasagem = (teto60d + estMinimo) - saldoAtual;
    const loteOportunidade = Math.ceil(consumoDiario * 30);
    const qtd = defasagem > 0 ? Math.min(defasagem, teto60d) : loteOportunidade;
    return Math.max(1, Math.min(qtd, teto60d));
  }

  // Reposição Normal (para 30 dias de giro)
  const necessidade = Math.ceil(consumoDiario * 30);
  const defasagem = necessidade - saldoAtual;
  const qtdFinal = defasagem > 0 ? defasagem : Math.ceil(consumoDiario * 15);
  return Math.max(qtdFinal, 1);
}

/**
 * Avalia as faixas de preço escalonadas por quantidade mínima para determinar a melhor faixa viável.
 * 
 * Regra:
 * 1. Calcula necessidade de compra para reposição base.
 * 2. Se a quantidade necessária já atinge ou supera uma faixa de volume, adota o preço menor dessa faixa.
 * 3. Se a quantidade necessária estiver próxima de uma faixa superior com desconto maior:
 *    - Calcula a autonomia em dias se comprar a quantidade mínima daquela faixa:
 *      diasDuracao = (saldoAtual + faixa.qtdMinima) / consumoDiario
 *    - Teto seguro de giro:
 *      - Curva A ou B com super desconto (>= 20%): até 60 dias de giro.
 *      - Reposição normal / Curva B normal: até 45 dias de giro.
 *      - Curva C: até 30 dias de giro (evita estoque parado).
 *    - Se diasDuracao <= tetoSeguro E o desconto for financeiramente vantajoso (>= 5% extra em relação à faixa anterior):
 *      O Horácio recomenda a faixa superior!
 * 4. Se uma faixa superior violar o teto seguro (ex: 60 un para um item que dura 1 ano), descarta essa faixa.
 */
function avaliarFaixasPrecoEscalonada(faixas, consumoDiario, saldoAtual, precoHistorico, curvaAbc = 'C', qtdBaseSugerida = 1) {
  if (!Array.isArray(faixas) || faixas.length === 0) {
    return null;
  }

  // Ordena faixas por quantidade mínima crescente
  const faixasOrdenadas = faixas
    .map(f => ({
      qtdMinima: parseInt(f.qtdMinima, 10) || 1,
      preco: parseFloat(f.preco) || 0
    }))
    .filter(f => f.qtdMinima > 0 && f.preco > 0)
    .sort((a, b) => a.qtdMinima - b.qtdMinima);

  if (faixasOrdenadas.length === 0) return null;

  const isCurvaA = curvaAbc === 'A';
  const isCurvaB = curvaAbc === 'B';
  const tetoDiasGiro = (isCurvaA || isCurvaB) ? 60 : 30;

  // Faixa padrão: a menor faixa
  let melhorFaixa = faixasOrdenadas[0];
  let qtdRecomendada = Math.max(qtdBaseSugerida, melhorFaixa.qtdMinima);
  let justificativaFaixa = null;

  for (const faixa of faixasOrdenadas) {
    const duracaoEstoqueDias = consumoDiario > 0 ? Math.round((saldoAtual + faixa.qtdMinima) / consumoDiario) : 999;
    const descFaixa = precoHistorico && precoHistorico > faixa.preco 
      ? ((precoHistorico - faixa.preco) / precoHistorico) * 100 
      : 0;

    // Se a quantidade base já atende ou supera a quantidade mínima da faixa
    if (qtdBaseSugerida >= faixa.qtdMinima) {
      melhorFaixa = faixa;
      qtdRecomendada = qtdBaseSugerida;
      justificativaFaixa = `Atende faixa de ${faixa.qtdMinima}+ un (R$ ${faixa.preco.toFixed(2)}) com consumo planejado.`;
      continue;
    }

    // Se estiver abaixo da quantidade mínima da faixa, avalia se compensa subir para a faixa
    const podeAtingirFaixa = duracaoEstoqueDias <= tetoDiasGiro;
    const descontoCompensa = descFaixa >= 10 || (melhorFaixa && faixa.preco < melhorFaixa.preco * 0.95);

    if (podeAtingirFaixa && descontoCompensa) {
      melhorFaixa = faixa;
      qtdRecomendada = faixa.qtdMinima;
      justificativaFaixa = `Ajustado para ${faixa.qtdMinima} un para garantir R$ ${faixa.preco.toFixed(2)} (${descFaixa.toFixed(1)}% desc). Autonomia: ~${duracaoEstoqueDias} dias.`;
    }
  }

  return {
    faixaEscolhida: melhorFaixa,
    qtdSugerida: qtdRecomendada,
    precoOfertado: melhorFaixa.preco,
    justificativaFaixa
  };
}

/**
 * Realiza a auditoria executiva de um combo/pacote promocional.
 * Compara cada item do pacote contra o histórico de CMV (Digifarma).
 * Detecta se a distribuidora embutiu sobrepreço em produtos secundários para compensar o desconto.
 * 
 * @param {Array<{ produtoNome: string, qtdMinima?: number, precoOfertado: number, ean?: string, produtoId?: number }>} comboItens
 * @param {object} db Instância do banco SQLite
 * @param {string} [comboNome]
 * @returns {object} Auditoria com veredito do Horácio
 */
function avaliarAuditoriaCombo(comboItens = [], db = null, comboNome = 'Combo Promocional') {
  const dbInst = getDb(db);
  if (!Array.isArray(comboItens) || comboItens.length === 0) {
    return {
      valido: false,
      comboNome,
      veredito: 'Combo sem itens identificados',
      recomendado: false
    };
  }

  let stmtCacheId = null, stmtCacheEan = null, stmtCacheDesc = null, stmtEstoqueId = null;
  try {
    if (dbInst) {
      stmtCacheId = dbInst.prepare('SELECT preco_unitario_ult_compra, descricao FROM digifarma_ultimas_compras_cache WHERE produto_id = ? AND preco_unitario_ult_compra > 0 LIMIT 1');
      stmtCacheEan = dbInst.prepare('SELECT preco_unitario_ult_compra, descricao FROM digifarma_ultimas_compras_cache WHERE ean = ? AND preco_unitario_ult_compra > 0 LIMIT 1');
      stmtCacheDesc = dbInst.prepare('SELECT preco_unitario_ult_compra, descricao FROM digifarma_ultimas_compras_cache WHERE descricao LIKE ? AND preco_unitario_ult_compra > 0 LIMIT 1');
      stmtEstoqueId = dbInst.prepare('SELECT preco_unitario_ult_compra, ultima_compra_valor, descricao FROM compras_estoque_cache WHERE produto_id = ? OR ean = ? LIMIT 1');
    }
  } catch (e) {}

  let totalOfertado = 0;
  let totalHistoricoCMV = 0;
  let temItemSemCMV = false;
  const itensAuditados = [];

  for (const it of comboItens) {
    const qtd = Number(it.qtdMinima || it.qtd || 1);
    const precoOf = parseFloat(it.precoOfertado || it.preco || 0);

    let precoCMV = null;
    try {
      if (it.produtoId && stmtCacheId) {
        const row = stmtCacheId.get(it.produtoId);
        if (row?.preco_unitario_ult_compra > 0) precoCMV = row.preco_unitario_ult_compra;
      }
      if (!precoCMV && it.ean && stmtCacheEan) {
        const row = stmtCacheEan.get(it.ean);
        if (row?.preco_unitario_ult_compra > 0) precoCMV = row.preco_unitario_ult_compra;
      }
      if (!precoCMV && it.produtoNome && stmtCacheDesc) {
        const row = stmtCacheDesc.get(`%${it.produtoNome.slice(0, 15)}%`);
        if (row?.preco_unitario_ult_compra > 0) precoCMV = row.preco_unitario_ult_compra;
      }
      if (!precoCMV && (it.produtoId || it.ean) && stmtEstoqueId) {
        const row = stmtEstoqueId.get(it.produtoId || 0, it.ean || '');
        const c = parseFloat(row?.preco_unitario_ult_compra || row?.ultima_compra_valor);
        if (c > 0) precoCMV = c;
      }
    } catch(e) {}

    if (!precoCMV || precoCMV <= 0) {
      precoCMV = precoOf; // Sem histórico prévio: assume neutro
      temItemSemCMV = true;
    }

    const subtotalOf = qtd * precoOf;
    const subtotalCMV = qtd * precoCMV;
    totalOfertado += subtotalOf;
    totalHistoricoCMV += subtotalCMV;

    const diffUnit = precoOf - precoCMV;
    const diffPct = precoCMV > 0 ? ((precoOf - precoCMV) / precoCMV) * 100 : 0;
    const isSobrepreco = precoOf > (precoCMV * 1.02); // Mais de 2% acima do CMV histórico
    const isDesconto = precoOf < (precoCMV * 0.98); // Mais de 2% abaixo do CMV

    itensAuditados.push({
      produtoNome: it.produtoNome,
      qtd,
      precoOfertado: precoOf,
      precoCMV,
      subtotalOfertado: Number(subtotalOf.toFixed(2)),
      subtotalCMV: Number(subtotalCMV.toFixed(2)),
      diffUnit: Number(diffUnit.toFixed(2)),
      diffPct: Number(diffPct.toFixed(1)),
      isSobrepreco,
      isDesconto,
      situacao: isSobrepreco ? 'SOBREPRECO' : (isDesconto ? 'DESCONTO' : 'NEUTRO')
    });
  }

  const economiaLiquidaValor = totalHistoricoCMV - totalOfertado;
  const economiaLiquidaPct = totalHistoricoCMV > 0 ? (economiaLiquidaValor / totalHistoricoCMV) * 100 : 0;
  const itensComSobrepreco = itensAuditados.filter(i => i.isSobrepreco);

  let status = 'TOTALMENTE_VANTAJOSO';
  let veredito = '✅ Combo Vantajoso';
  let detalhe = '';
  let recomendado = true;

  if (economiaLiquidaValor <= 0) {
    status = 'DESFAVORAVEL';
    veredito = '❌ Desconto Compensado / Falsa Promoção';
    detalhe = `O custo total do pacote (R$ ${totalOfertado.toFixed(2)}) é superior ou igual ao CMV histórico (R$ ${totalHistoricoCMV.toFixed(2)}). O fornecedor aumentou outros itens para compensar o desconto!`;
    recomendado = false;
  } else if (itensComSobrepreco.length > 0) {
    const nomesSobrepreco = itensComSobrepreco.map(i => `${i.produtoNome} (+${i.diffPct}%)`).join(', ');
    if (economiaLiquidaPct >= 15) {
      status = 'PARCIALMENTE_COMPENSADO';
      veredito = '⚠️ Vantajoso com Ressalva (Compensação Parcial)';
      detalhe = `Atenção: Houve sobrepreço em: ${nomesSobrepreco}. Porém, a economia global líquida do combo ainda é vantajosa (${economiaLiquidaPct.toFixed(1)}% OFF, R$ ${economiaLiquidaValor.toFixed(2)}).`;
      recomendado = true;
    } else {
      status = 'COMPENSADO_DESFAVORAVEL';
      veredito = '⚠️ Desconto Compensado / Não Recomendado';
      detalhe = `O fornecedor deu desconto em chamariz, mas embutiu sobrepreço em: ${nomesSobrepreco}. A economia real de apenas ${economiaLiquidaPct.toFixed(1)}% não compensa a amarração dos itens encarecidos.`;
      recomendado = false;
    }
  } else {
    status = 'TOTALMENTE_VANTAJOSO';
    veredito = '✅ Combo 100% Vantajoso';
    detalhe = `Nenhum produto está com sobrepreço. Economia real garantida de R$ ${economiaLiquidaValor.toFixed(2)} (${economiaLiquidaPct.toFixed(1)}% de desconto líquido).`;
    recomendado = true;
  }

  return {
    valido: true,
    comboNome,
    totalItens: comboItens.length,
    totalOfertado: Number(totalOfertado.toFixed(2)),
    totalHistoricoCMV: Number(totalHistoricoCMV.toFixed(2)),
    economiaLiquidaValor: Number(economiaLiquidaValor.toFixed(2)),
    economiaLiquidaPct: Number(economiaLiquidaPct.toFixed(1)),
    itensAuditados,
    itensComSobreprecoCount: itensComSobrepreco.length,
    temCompensacao: itensComSobrepreco.length > 0,
    status,
    veredito,
    detalhe,
    recomendado
  };
}

// ──────────────────────────────────────────────────────────
// NÚCLEO OPERACIONAL DO AGENTE HORÁCIO
// ──────────────────────────────────────────────────────────

/**
 * Analisa ofertas recebidas em tempo real para disparar alertas de Oportunidade Crítica ou Ruptura.
 * 
 * @param {object} dadosOferta { produtoNome, precoOfertado, distribuidora, representante, telefone, validade, lote }
 * @param {object} db Instância do SQLite
 * @returns {Promise<object|null>} Relatório gerado se for crítico, ou null se for oferta comum
 */
async function analisarOfertasEmTempoReal(dadosOferta, db = null) {
  carregarServicos();
  const dbInst = getDb(db);
  if (!dbInst || !dadosOferta || !dadosOferta.produtoNome || !dadosOferta.precoOfertado) return null;

  try {
    // 1. Validação precisa contra o histórico do Digifarma (inclui notas fiscais ITEM_NOTAS)
    const validacao = await comprasMineracaoService.validarOfertaComDigifarma(
      dadosOferta.produtoNome,
      dadosOferta.ean,
      dadosOferta.precoOfertado,
      dbInst,
      { produtoId: dadosOferta.produtoId || dadosOferta.digifarma_produto_id }
    );

    if (validacao.invalido) return null;

    // 2. Busca informações de estoque, Curva ABC e vendas no cache
    let dadosEstoque = null;
    try {
      if (validacao.produtoId) {
        dadosEstoque = dbInst.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(validacao.produtoId);
      }
      if (!dadosEstoque && validacao.ean) {
        dadosEstoque = dbInst.prepare('SELECT * FROM compras_estoque_cache WHERE ean = ?').get(validacao.ean);
      }
    } catch(e) {}

    const curvaAbc = dadosEstoque?.curva_abc || 'C';
    const vendas30d = dadosEstoque?.vendas_30d || 0;
    const vmd = dadosEstoque?.vmd_ponderado || (vendas30d / 30);
    const saldoAtual = validacao.estoqueAtual || 0;
    const estMinimo = validacao.estMinimo || dadosEstoque?.est_minimo_calculado || 0;
    const precoUltCompra = (dadosEstoque && (dadosEstoque.preco_unitario_ult_compra || dadosEstoque.ultima_compra_valor))
      ? parseFloat(dadosEstoque.preco_unitario_ult_compra || dadosEstoque.ultima_compra_valor)
      : (validacao.precoUltCompra || null);

    // Avaliação de Faixas de Preço Escalonadas (Volume Pricing)
    let faixas = dadosOferta.faixasPreco || dadosOferta.faixas_preco;
    if (typeof faixas === 'string') {
      try { faixas = JSON.parse(faixas); } catch (e) { faixas = null; }
    }
    let avaliacaoFaixa = null;
    let precoEfetivo = dadosOferta.precoOfertado;
    if (Array.isArray(faixas) && faixas.length > 0) {
      const consumoCalc = vmd > 0 ? vmd : (vendas30d > 0 ? vendas30d / 30 : 0.5);
      const qtdBase = calcularQuantidadeSugerida(vendas30d, vmd, saldoAtual, estMinimo, false);
      avaliacaoFaixa = avaliarFaixasPrecoEscalonada(faixas, consumoCalc, saldoAtual, precoUltCompra, curvaAbc, qtdBase);
      if (avaliacaoFaixa) {
        precoEfetivo = avaliacaoFaixa.precoOfertado;
      }
    }

    const descontoPct = precoUltCompra && precoUltCompra > precoEfetivo
      ? ((precoUltCompra - precoEfetivo) / precoUltCompra) * 100
      : (validacao.percentualDesconto || 0);

    // 3. Regras de Classificação de Urgência e Oportunidade
    const isCurvaA = curvaAbc === 'A';
    const isCurvaB = curvaAbc === 'B';
    // Regra Alinhada: Extremamente vantajoso quando desconto >= 25% em Curva A ou B
    const isExtremamenteVantajoso = (isCurvaA || isCurvaB) && descontoPct >= 25;
    const isSuperDesconto = isExtremamenteVantajoso;
    const isRupturaCritica = validacao.emRuptura && saldoAtual <= 0;
    const isRupturaIminente = validacao.emRuptura && saldoAtual > 0;

    // REGRA DE OURO ALINHADA NO GRILL-ME:
    // Se o saldo atual (consolidado dos equivalentes) já cobre o estoque mínimo:
    // Horácio SÓ sugere compra se for EXTREMAMENTE VANTAJOSO (desconto >= 25% em Curva A ou B)!
    if (saldoAtual >= estMinimo && !isExtremamenteVantajoso) {
      return null;
    }

    // Horácio só interrompe o Administrador em tempo real se for CRÍTICO
    if (!isSuperDesconto && !isRupturaCritica && !avaliacaoFaixa) {
      return null; // Oportunidade normal: fica guardada para a consolidação de corte (11h / 16h)
    }

    const statusUrgencia = (isSuperDesconto && isRupturaCritica) ? 'CRÍTICO - AÇÃO IMEDIATA VIA WHATSAPP'
      : isSuperDesconto ? 'CRÍTICO - AÇÃO IMEDIATA VIA WHATSAPP'
      : 'MÉDIO';

    // 4. Verificação de Equivalentes e Previsão de Duração de Estoque
    let equivalentesTexto = 'Nenhum substituto registrado.';
    let grupoEquiv = validacao.grupoEquivalente;
    if (grupoEquiv) {
      equivalentesTexto = `${dadosOferta.produtoNome}: Estoque ${saldoAtual} un | Grupo ${grupoEquiv.nomeGrupo} possui ${grupoEquiv.saldoTotal} un consolidadas em ${grupoEquiv.quantidadeProdutos} marcas.`;
    }

    const consumoDiario = vmd > 0 ? vmd : (vendas30d > 0 ? (vendas30d / 30) : 0);
    const diasDuracaoEstoque = consumoDiario > 0 ? Math.round(saldoAtual / consumoDiario) : (saldoAtual > 0 ? 999 : 0);
    let dataPrevisaoEsgotamento = null;
    if (diasDuracaoEstoque === 0) {
      dataPrevisaoEsgotamento = 'Ruptura (Hoje)';
    } else if (diasDuracaoEstoque >= 365) {
      dataPrevisaoEsgotamento = '+1 ano';
    } else {
      const d = new Date();
      d.setDate(d.getDate() + diasDuracaoEstoque);
      const pad = (n) => String(n).padStart(2, '0');
      dataPrevisaoEsgotamento = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    }
    const previsaoTexto = diasDuracaoEstoque === 0 
      ? '🚨 Estoque ESGOTADO (Ruptura Imediata)' 
      : `📅 Estoque atual dura até ${dataPrevisaoEsgotamento} (${diasDuracaoEstoque} dias restantes)`;

    // 5. Cálculo de Quantidade Sugerida e Economia
    const qtdSugerida = avaliacaoFaixa 
      ? avaliacaoFaixa.qtdSugerida 
      : calcularQuantidadeSugerida(vendas30d, vmd, saldoAtual, estMinimo, isSuperDesconto);
    const precoFinalItem = avaliacaoFaixa ? avaliacaoFaixa.precoOfertado : dadosOferta.precoOfertado;
    const totalSugerido = qtdSugerida * precoFinalItem;
    const economiaPorUnidade = precoUltCompra && precoUltCompra > precoFinalItem ? (precoUltCompra - precoFinalItem) : 0;
    const economiaTotal = economiaPorUnidade * qtdSugerida;

    // 6. Impacto Orçamentário
    const mesAtual = new Date().getMonth() + 1;
    const anoAtual = new Date().getFullYear();
    const orcamentoResumo = comprasPedidosService?.obterResumoOrcamentoMensal ? comprasPedidosService.obterResumoOrcamentoMensal(mesAtual, anoAtual, dbInst) : { limiteMensal: 0, disponivel: 0, pctUso: 0 };
    const pedidoMinimoFornecedor = dadosOferta.pedidoMinimoValor || 0;

    // 7. Montagem do Relatório Executivo Estruturado
    const tipoMed = classificarTipoMedicamento(dadosOferta.produtoNome);
    let motivo = isSuperDesconto && isRupturaCritica ? '🚨 Ruptura + Super Promoção Curva A/B'
      : isSuperDesconto ? `🔥 Oportunidade Curva ${curvaAbc} (${descontoPct.toFixed(1)}% OFF)`
      : `🚨 Ruptura Total (Saldo 0)`;

    if (saldoAtual >= estMinimo && isExtremamenteVantajoso) {
      motivo = `🔥 Compra Estratégica Acima do Mínimo (${descontoPct.toFixed(1)}% OFF em Curva ${curvaAbc})`;
    }

    const itens = [{
      produtoNome: dadosOferta.produtoNome,
      tipo: tipoMed,
      precoHistorico: precoUltCompra || 0,
      precoOfertado: dadosOferta.precoOfertado,
      qtdSugerida,
      motivo,
      diasDuracaoEstoque,
      dataPrevisaoEsgotamento,
      previsaoTexto,
      economiaEstimadaValor: economiaTotal,
      economiaEstimadaPct: descontoPct,
      curvaAbc
    }];

    const distribuidor = dadosOferta.distribuidora || dadosOferta.fornecedorNome || 'Distribuidora Parceira';
    const orcamentoTexto = orcamentoResumo.limiteMensal > 0
      ? `${orcamentoResumo.pctUso}% utilizado / Restante R$ ${orcamentoResumo.disponivel?.toFixed(2)}`
      : `Teto flexível / Disponível`;

    const mensagemFormatada = `
*RESUMO EXECUTIVO DO FORNECEDOR*
* *Distribuidor/Representante:* ${distribuidor} ${dadosOferta.representante ? `(${dadosOferta.representante})` : ''}
* *Valor Mínimo do Pedido:* R$ ${pedidoMinimoFornecedor.toFixed(2)} | *Valor Total Sugerido:* R$ ${totalSugerido.toFixed(2)}
* *Impacto no Orçamento do Mês:* ${orcamentoTexto}

*Produto / Apresentação | Tipo | Histórico | Ofertado | Qtd | Motivo | Economia*
• *${dadosOferta.produtoNome}* [${tipoMed}] | Hist: R$ ${(precoUltCompra || 0).toFixed(2)} | *Hoje: R$ ${dadosOferta.precoOfertado.toFixed(2)}* | Sug: *${qtdSugerida} un* | ${motivo} | *Econ: R$ ${economiaTotal.toFixed(2)} (${descontoPct.toFixed(1)}%)*

*PREVISÃO DO ESTOQUE ATUAL:*
* ${previsaoTexto}

*EQUIVALENTES VERIFICADOS NO ESTOQUE:*
* ${equivalentesTexto}

*STATUS DE URGÊNCIA:*
* *${statusUrgencia}*

🔗 *Abrir cotação na Central de Compras:*
https://app.drogariabelafarma.com.br
`.trim();

    // 8. Gravação no Banco de Dados
    const relatorioId = crypto.randomUUID();
    const now = new Date().toISOString();

    dbInst.prepare(`
      INSERT INTO compras_horacio_relatorios (
        id, tipo, titulo, fornecedor_nome, pedido_minimo, valor_total_sugerido,
        impacto_orcamento_percent, saldo_orcamento_restante, itens_json, equivalentes_json,
        status_urgencia, mensagem_whatsapp, whatsapp_enviado, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      relatorioId,
      'Critico_TempoReal',
      `Oportunidade Crítica: ${dadosOferta.produtoNome}`,
      distribuidor,
      pedidoMinimoFornecedor,
      totalSugerido,
      orcamentoResumo.pctUso || 0,
      orcamentoResumo.disponivel || 0,
      JSON.stringify(itens),
      JSON.stringify(grupoEquiv || {}),
      statusUrgencia,
      mensagemFormatada,
      now
    );

    // 9. Disparo de Alerta no WhatsApp do Administrador
    await dispararAlertaWhatsappAdmin(mensagemFormatada, relatorioId, dbInst);

    return {
      id: relatorioId,
      tipo: 'Critico_TempoReal',
      distribuidora: distribuidor,
      itens,
      totalSugerido,
      statusUrgencia,
      mensagemFormatada
    };

  } catch (err) {
    console.error('[HoracioAgent] Erro ao analisar em tempo real:', err.message);
    return null;
  }
}

/**
 * Executa a consolidação de compras para os horários de corte (11:00 e 16:00) ou sob demanda.
 * Agrupa ofertas, prioriza rupturas e Curva A, e fecha o pedido mínimo de cada fornecedor.
 */
async function executarConsolidacaoHorarioCorte(db = null, options = {}) {
  carregarServicos();
  const dbInst = getDb(db);
  if (!dbInst) return { success: false, error: 'Sem banco de dados' };

  console.log('[HoracioAgent] 📋 Iniciando consolidação executiva de compras (Horário de Corte)...');

  try {
    // 1. Busca oportunidades mineradas recentes que tenham desconto ou ruptura
    const oportunidades = comprasMineracaoService.listarOportunidades(dbInst, {
      limite: 150,
      apenasComDesconto: false
    });

    if (!oportunidades || oportunidades.length === 0) {
      console.log('[HoracioAgent] Nenhuma oportunidade disponível para consolidação neste ciclo.');
      return { success: true, totalRelatorios: 0, mensagem: 'Nenhuma oportunidade disponível no radar.' };
    }

    // 2. Agrupa por Distribuidora / Fornecedor
    const porDistribuidora = {};
    for (const op of oportunidades) {
      const dist = op.fornecedorNome || op.distribuidora || 'Distribuidora';
      if (!porDistribuidora[dist]) {
        porDistribuidora[dist] = [];
      }
      porDistribuidora[dist].push(op);
    }

    const relatoriosGerados = [];
    const mesAtual = new Date().getMonth() + 1;
    const anoAtual = new Date().getFullYear();
    const orcamentoResumo = comprasPedidosService?.obterResumoOrcamentoMensal
      ? comprasPedidosService.obterResumoOrcamentoMensal(mesAtual, anoAtual, dbInst)
      : { limiteMensal: 0, disponivel: 0, pctUso: 0 };

    for (const [distribuidor, listaOfertas] of Object.entries(porDistribuidora)) {
      // Ordena por relevância (Ruptura e Curva A primeiro, depois desconto)
      listaOfertas.sort((a, b) => (b.scoreRelevancia || 0) - (a.scoreRelevancia || 0));

      const itensSugeridos = [];
      let totalSug = 0;
      let economiaTotalDist = 0;

      for (const ofr of listaOfertas) {
        // Regra de Ouro do Horácio: ignora produtos inativos nos últimos 10 meses
        if (ofr.ativo10m === 0) continue;

        // Ignora termos espúrios ou frases sem identificação de produto no catálogo
        if (!ofr.produto_id && !ofr.ean && (!ofr.descontoPercentual || ofr.descontoPercentual <= 0)) continue;
        if (comprasMineracaoService?.isApenasEmbalagemOuQuantidade && comprasMineracaoService.isApenasEmbalagemOuQuantidade(ofr.produtoNome)) continue;

        let precoOf = ofr.precoOfertado || 0;
        if (precoOf <= 0) continue;
        let precoUlt = ofr.precoUltCompraDigifarma || 0;

        // Prioriza o CMV oficial padronizado em compras_estoque_cache e checa atividade
        try {
          const estItem = dbInst.prepare('SELECT saldo, est_minimo_calculado, preco_unitario_ult_compra, ultima_compra_valor, ativo_10m FROM compras_estoque_cache WHERE produto_id = ? OR ean = ? LIMIT 1').get(ofr.produto_id || ofr.digifarma_produto_id, ofr.ean);
          if (estItem) {
            // Se o item estiver categorizado como inativo nos últimos 10 meses, descarta solenemente
            if (estItem.ativo_10m === 0) continue;
            const cmvOficial = parseFloat(estItem.preco_unitario_ult_compra || estItem.ultima_compra_valor) || 0;
            if (cmvOficial > 0) precoUlt = cmvOficial;
          }
        } catch(e) {}

        const saldo = ofr.estoqueAtual || 0;
        const estMin = ofr.estoqueMinimo || 0;
        const isCurvaA = ofr.curvaAbc === 'A';
        const isCurvaB = ofr.curvaAbc === 'B';

        // Avaliação de Faixas de Preço Escalonadas (Volume Pricing)
        let faixas = ofr.faixasPreco || ofr.faixas_preco;
        if (typeof faixas === 'string') {
          try { faixas = JSON.parse(faixas); } catch (e) { faixas = null; }
        }
        let avaliacaoFaixa = null;
        const vmdItem = ofr.vmdPonderado || 0.5;
        const consumoDiario = vmdItem > 0 ? vmdItem : 0.5;

        if (Array.isArray(faixas) && faixas.length > 0) {
          const qtdBasePrevia = calcularQuantidadeSugerida(15, vmdItem, saldo, estMin, false);
          avaliacaoFaixa = avaliarFaixasPrecoEscalonada(faixas, consumoDiario, saldo, precoUlt, ofr.curvaAbc || 'C', qtdBasePrevia);
          if (avaliacaoFaixa) {
            precoOf = avaliacaoFaixa.precoOfertado;
          }
        }

        const desconto = precoUlt > 0 && precoUlt > precoOf ? ((precoUlt - precoOf) / precoUlt) * 100 : (ofr.descontoPercentual || 0);

        // Não sugere compra com preço abusivo (> 15% acima da última compra/CMV registrado)
        if (precoUlt > 0 && precoOf > precoUlt * 1.15) continue;

        const isExtremamenteVantajoso = (isCurvaA || isCurvaB) && desconto >= 25;

        // REGRA DE OURO ALINHADA NO GRILL-ME:
        // Se o saldo atual (incluindo equivalentes) já cobre o estoque mínimo:
        // Horácio SÓ sugere compra se for EXTREMAMENTE VANTAJOSO (desconto >= 25% em Curva A ou B) OU atender faixa de volume vantajosa!
        if (saldo >= estMin && !isExtremamenteVantajoso && !avaliacaoFaixa) {
          continue;
        }

        // Só inclui se for ruptura real de item com giro ou tiver desconto positivo
        if (desconto <= 0 && (!saldo || saldo <= 0) && estMin <= 0 && !isCurvaA) continue;
        if (ofr.justificativa?.badge === 'Sem Vantagem' && desconto <= 0) continue;

        const diasRestantes = consumoDiario > 0 ? Math.round(saldo / consumoDiario) : (saldo > 0 ? 999 : 0);
        let dataPrevisao = null;
        if (diasRestantes === 0) {
          dataPrevisao = 'Ruptura (Hoje)';
        } else if (diasRestantes >= 365) {
          dataPrevisao = '+1 ano';
        } else {
          const d = new Date();
          d.setDate(d.getDate() + diasRestantes);
          const pad = (n) => String(n).padStart(2, '0');
          dataPrevisao = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
        }
        const previsaoTexto = diasRestantes === 0 ? 'Ruptura (0d)' : `${diasRestantes}d (até ${dataPrevisao})`;

        const qtd = avaliacaoFaixa 
          ? avaliacaoFaixa.qtdSugerida 
          : calcularQuantidadeSugerida(15, vmdItem, saldo, estMin, isExtremamenteVantajoso);
        const subtotal = qtd * precoOf;
        const econItem = precoUlt > precoOf ? (precoUlt - precoOf) * qtd : 0;

        // Avaliação de Auditoria de Combos Promocionais
        let auditoriaCombo = null;
        if (ofr.isCombo && Array.isArray(ofr.comboDados) && ofr.comboDados.length > 0) {
          auditoriaCombo = avaliarAuditoriaCombo(ofr.comboDados, dbInst, ofr.comboNome || 'Combo Promocional');
          // Regra Alinhada no Grill-Me: só recomenda compras de combo se o saldo global for comprovadamente vantajoso!
          if (!auditoriaCombo.recomendado) {
            continue;
          }
        }

        let badgeMotivo = ofr.justificativa?.badge || (saldo <= 0 ? '🚨 Ruptura' : '📉 Desconto');
        if (auditoriaCombo) {
          badgeMotivo = auditoriaCombo.temCompensacao
            ? `📦 Combo (${auditoriaCombo.economiaLiquidaPct}% líq - Cuidado com sobrepreço)`
            : `📦 Combo Vantajoso (${auditoriaCombo.economiaLiquidaPct}% líq)`;
        } else if (avaliacaoFaixa?.justificativaFaixa) {
          badgeMotivo = `🎯 Mínimo Escalonado: ${avaliacaoFaixa.justificativaFaixa}`;
        } else if (isExtremamenteVantajoso && saldo >= estMin) {
          badgeMotivo = `🔥 Compra Estratégica (${desconto.toFixed(1)}% OFF Curva ${ofr.curvaAbc || 'A'})`;
        } else if (desconto > 0 && saldo <= estMin) {
          badgeMotivo = '🚨 Ruptura + Desconto';
        } else if (desconto > 0) {
          badgeMotivo = '📉 Desconto';
        } else if (saldo <= 0) {
          badgeMotivo = '🚨 Ruptura Total (Saldo 0)';
        }

        itensSugeridos.push({
          id: ofr.id,
          produtoId: ofr.produto_id || ofr.produtoId || null,
          mensagemId: ofr.mensagemId || ofr.mensagem_id,
          telefone: ofr.telefone,
          distribuidora: ofr.distribuidora || distribuidor,
          representante: ofr.representante,
          ean: ofr.ean,
          produtoNome: ofr.produtoNome,
          tipo: classificarTipoMedicamento(ofr.produtoNome),
          precoUltCompra: precoUlt,
          precoHistorico: precoUlt,
          precoOfertado: precoOf,
          qtdSugerida: qtd,
          qtdMinima: avaliacaoFaixa ? avaliacaoFaixa.faixaEscolhida.qtdMinima : (ofr.qtdMinima || 1),
          faixasPreco: faixas || null,
          isCombo: Boolean(ofr.isCombo),
          comboId: ofr.comboId || null,
          comboNome: ofr.comboNome || null,
          comboDados: ofr.comboDados || null,
          auditoriaCombo: auditoriaCombo || null,
          motivo: badgeMotivo,
          diasDuracaoEstoque: diasRestantes,
          dataPrevisaoEsgotamento: dataPrevisao,
          previsaoTexto,
          economiaEstimadaValor: econItem,
          economiaEstimadaPct: desconto,
          curvaAbc: ofr.curvaAbc || 'C'
        });

        totalSug += subtotal;
        economiaTotalDist += econItem;

        // Limita a até 10 itens por fornecedor no resumo executivo para não poluir
        if (itensSugeridos.length >= 8) break;
      }

      if (itensSugeridos.length === 0) continue;

      // Metadados do fornecedor (pedido mínimo)
      const fornecedorMeta = dbInst.prepare('SELECT * FROM compras_fornecedores_meta WHERE distribuidora LIKE ? LIMIT 1').get('%' + distribuidor + '%');
      const pedidoMinimo = fornecedorMeta?.pedido_minimo_valor || 300.00;

      // Status de urgência do carrinho
      const temRupturaCritica = itensSugeridos.some(i => i.motivo.includes('Ruptura'));
      const statusUrgencia = temRupturaCritica ? 'CRÍTICO - AÇÃO IMEDIATA VIA WHATSAPP' : 'MÉDIO';

      // Monta formato obrigatório de saída
      const orcamentoTexto = orcamentoResumo.limiteMensal > 0
        ? `${orcamentoResumo.pctUso}% utilizado / Restante R$ ${orcamentoResumo.disponivel?.toFixed(2)}`
        : `Teto flexível / Disponível`;

      let tabelaLinhas = itensSugeridos.map(i => {
        const prev = i.previsaoTexto ? ` | Estq: ${i.previsaoTexto}` : '';
        return `• *${i.produtoNome}* [${i.tipo}] | Hist: R$ ${i.precoHistorico.toFixed(2)} | *Hoje: R$ ${i.precoOfertado.toFixed(2)}* | Sug: *${i.qtdSugerida} un* | ${i.motivo}${prev} | *Econ: R$ ${i.economiaEstimadaValor.toFixed(2)}*`;
      }).join('\n');

      const mensagemFormatada = `
*RESUMO EXECUTIVO DO FORNECEDOR*
* *Distribuidor/Representante:* ${distribuidor}
* *Valor Mínimo do Pedido:* R$ ${pedidoMinimo.toFixed(2)} | *Valor Total Sugerido:* R$ ${totalSug.toFixed(2)} ${totalSug >= pedidoMinimo ? '✅ (Atinge Mínimo)' : '⚠️ (Abaixo do Mínimo)'}
* *Impacto no Orçamento do Mês:* ${orcamentoTexto}

*Produtos Sugeridos:*
${tabelaLinhas}

*STATUS DE URGÊNCIA:*
* *${statusUrgencia}*

🔗 *Abrir cotação consolidada com 1 clique:*
https://app.drogariabelafarma.com.br
`.trim();

      const relatorioId = crypto.randomUUID();
      const now = new Date().toISOString();

      try {
        dbInst.prepare("DELETE FROM compras_horacio_relatorios WHERE fornecedor_nome = ? AND tipo IN ('Consolidado_Corte', 'Sob_Demanda')").run(distribuidor);
      } catch (eDel) {}

      dbInst.prepare(`
        INSERT INTO compras_horacio_relatorios (
          id, tipo, titulo, fornecedor_nome, pedido_minimo, valor_total_sugerido,
          impacto_orcamento_percent, saldo_orcamento_restante, itens_json, equivalentes_json,
          status_urgencia, mensagem_whatsapp, whatsapp_enviado, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        relatorioId,
        options.sobDemanda ? 'Sob_Demanda' : 'Consolidado_Corte',
        `Consolidação de Compras: ${distribuidor}`,
        distribuidor,
        pedidoMinimo,
        totalSug,
        orcamentoResumo.pctUso || 0,
        orcamentoResumo.disponivel || 0,
        JSON.stringify(itensSugeridos),
        JSON.stringify({}),
        statusUrgencia,
        mensagemFormatada,
        now
      );

      // Dispara se for corte ou se solicitado
      if (!options.silencioso) {
        await dispararAlertaWhatsappAdmin(mensagemFormatada, relatorioId, dbInst);
      }

      relatoriosGerados.push({
        id: relatorioId,
        distribuidor,
        totalSug,
        pedidoMinimo,
        statusUrgencia,
        mensagemFormatada,
        itens: itensSugeridos
      });
    }

    return {
      success: true,
      totalRelatorios: relatoriosGerados.length,
      relatorios: relatoriosGerados
    };

  } catch (err) {
    console.error('[HoracioAgent] Erro na consolidação de corte:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Dispara uma mensagem executiva formatada para o Administrador via WhatsApp.
 */
async function dispararAlertaWhatsappAdmin(textoMensagem, relatorioId = null, db = null) {
  carregarServicos();
  const dbInst = getDb(db);
  const adminPhonesRaw = process.env.ADMIN_WHATSAPP || process.env.EDEVALDO_WHATSAPP || '5532988634755';
  const adminPhones = adminPhonesRaw.split(',').map(p => p.trim()).filter(Boolean);

  for (const phone of adminPhones) {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const jid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

      // 1. Tenta envio via sessão dedicada de compras do Baileys
      if (baileysComprasService?.isConnected?.()) {
        await baileysComprasService.sendMessage(jid, { text: textoMensagem });
        console.log(`[HoracioAgent] 📲 Alerta enviado via WhatsApp Compras para ${cleanPhone}`);
      } 
      // 2. Fallback para whatsappService padrão (instância principal)
      else if (whatsappService?.enviarMensagemAdmin) {
        await whatsappService.enviarMensagemAdmin(textoMensagem);
        console.log(`[HoracioAgent] 📲 Alerta enviado via WhatsApp Principal para ${cleanPhone}`);
      }

      // Marca como enviado no banco
      if (relatorioId && dbInst) {
        dbInst.prepare('UPDATE compras_horacio_relatorios SET whatsapp_enviado = 1 WHERE id = ?').run(relatorioId);
      }
    } catch (sendErr) {
      console.warn(`[HoracioAgent] Falha ao enviar WhatsApp para ${phone}:`, sendErr.message);
    }
  }
}

/**
 * Processa mídia multimodal (imagens de folhetos, fotos de encartes ou tabelas PDF).
 * Extrai texto e dados estruturados utilizando Gemini Flash Vision como principal.
 */
async function processarMidiaMultimodal(buffer, mimeType, pushName = '', phone = '', db = null) {
  carregarServicos();
  const dbInst = getDb(db);
  if (!buffer || !mimeType) return { success: false, error: 'Mídia não fornecida' };

  console.log(`[HoracioAgent] 👁️ Analisando mídia multimodal (${mimeType}, ${buffer.length} bytes)...`);

  try {
    let textoExtraido = '';

    // Se for PDF
    if (mimeType.includes('pdf') || mimeType === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const parsed = await pdfParse(buffer);
      textoExtraido = parsed.text || '';
    } 
    // Se for Imagem (JPG, PNG, WEBP)
    else if (mimeType.startsWith('image/')) {
      const base64 = buffer.toString('base64');
      const promptVision = `
Você é o Horácio, especialista em compras farmacêuticas.
Analise esta foto/imagem de encarte, tabela promocional ou folheto de medicamentos enviado por um distribuidor.
Extraia com extrema fidelidade:
1. Nome da Distribuidora ou Representante (se visível).
2. Condições comerciais (prazos de pagamento como 28/35/42 dias e pedido mínimo se houver).
3. Lista de produtos com seus respectivos preços promocionais e apresentações.

Retorne no formato de texto limpo:
Representante: [Nome ou Distribuidora se identificada]
Prazos: [Prazos identificados]
- PRODUTO DOSAGEM EMBALAGEM R$ PREÇO
- PRODUTO DOSAGEM EMBALAGEM R$ PREÇO
`;
      // Chama a IA prioritariamente com Gemini Flash Vision
      textoExtraido = await callAI(promptVision, HORACIO_SYSTEM_PROMPT, {
        imageData: base64,
        temperature: 0.1
      });
    }

    if (!textoExtraido || !textoExtraido.trim()) {
      return { success: false, error: 'Não foi possível extrair dados legíveis da mídia.' };
    }

    console.log('[HoracioAgent] ✅ Dados extraídos da mídia. Processando mineração...');

    // Encaminha o texto extraído para o motor de mineração e para o Horácio
    const resultadoMineracao = await comprasMineracaoService.processarMensagemRecebida({
      id: `midia_${Date.now()}`,
      text: textoExtraido,
      phone,
      pushName: pushName || 'Encarte/Mídia Comercial',
      timestamp: Date.now()
    }, dbInst);

    return {
      success: true,
      textoExtraido,
      mineracao: resultadoMineracao
    };

  } catch (err) {
    console.error('[HoracioAgent] Erro na leitura multimodal:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Lista relatórios do Horácio salvos no banco de dados.
 */
function listarRelatorios(db = null, limite = 20) {
  const dbInst = getDb(db);
  if (!dbInst) return [];

  try {
    // Alinhado no Grill-Me: validade de 1 dia civil (apenas relatórios gerados hoje)
    const rows = dbInst.prepare(`
      SELECT * FROM compras_horacio_relatorios
      WHERE tipo IN ('Consolidado_Corte', 'Sob_Demanda', 'Sincronizacao_Estoque')
        AND DATE(created_at, 'localtime') = DATE('now', 'localtime')
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limite * 4);

    const vistos = new Set();
    const relatoriosValidos = [];

    // Prepared statement para verificar se produtos de reposição possuem ofertas ativas vigentes
    let stmtOfertaAtiva = null;
    try {
      stmtOfertaAtiva = dbInst.prepare(`
        SELECT preco_ofertado, distribuidora, percentual_desconto, validade_oferta, is_combo, combo_nome, combo_dados
        FROM compras_oportunidades_mineradas
        WHERE (produto_id = ? OR ean = ? OR produto_nome LIKE ?)
          AND preco_ofertado > 0
          AND (
            (validade_oferta IS NOT NULL AND validade_oferta != '' AND DATE(validade_oferta) >= DATE('now', 'localtime'))
            OR
            ((validade_oferta IS NULL OR validade_oferta = '') AND (DATE(data_oferta, 'localtime') = DATE('now', 'localtime') OR DATE(created_at, 'localtime') = DATE('now', 'localtime')))
          )
        ORDER BY percentual_desconto DESC, preco_ofertado ASC
        LIMIT 1
      `);
    } catch(e) {}

    for (const r of rows) {
      const itens = r.itens_json ? JSON.parse(r.itens_json) : [];
      if (!Array.isArray(itens) || itens.length === 0) continue;

      const chaveFornecedor = (r.fornecedor_nome || r.titulo || '').trim().toLowerCase();
      if (chaveFornecedor && vistos.has(chaveFornecedor)) continue;
      vistos.add(chaveFornecedor);

      const isReposicaoEstoque = r.tipo === 'Sincronizacao_Estoque' || chaveFornecedor.includes('geral');

      // Se for relatório de reposição de estoque, enriquece cada item
      const itensTratados = itens.map((it, idx) => {
        if (isReposicaoEstoque) {
          let melhorOferta = null;
          if (stmtOfertaAtiva) {
            try {
              melhorOferta = stmtOfertaAtiva.get(it.produtoId || 0, it.ean || '', `%${(it.produtoNome || '').slice(0, 15)}%`);
            } catch(e) {}
          }

          if (melhorOferta && melhorOferta.preco_ofertado > 0) {
            const precoOf = Number(melhorOferta.preco_ofertado);
            const precoHist = Number(it.precoHistorico || it.precoUltCompra || 0);
            const econ = precoHist > precoOf ? precoHist - precoOf : 0;
            return {
              ...it,
              id: it.id || `rep_${idx}`,
              precoOfertado: precoOf,
              distribuidora: melhorOferta.distribuidora,
              temOfertaAtiva: true,
              economiaEstimadaValor: econ * (it.qtdSugerida || 1),
              economiaEstimadaPct: precoHist > 0 ? ((precoHist - precoOf) / precoHist) * 100 : 0,
              isCombo: Boolean(melhorOferta.is_combo),
              comboNome: melhorOferta.combo_nome,
              comboDados: melhorOferta.combo_dados ? (typeof melhorOferta.combo_dados === 'string' ? JSON.parse(melhorOferta.combo_dados) : melhorOferta.combo_dados) : null,
              motivo: `🎯 Oferta Ativa: ${melhorOferta.distribuidora}`
            };
          } else {
            return {
              ...it,
              id: it.id || `rep_${idx}`,
              precoOfertado: null, // explicitamente null para NUNCA exibir R$ 0,00!
              temOfertaAtiva: false,
              status: 'A Cotar',
              motivo: (it.saldo || 0) <= 0 ? '🚨 Ruptura (A Cotar)' : '📉 Abaixo do Mínimo (A Cotar)'
            };
          }
        }
        return it;
      });

      relatoriosValidos.push({
        ...r,
        isReposicaoEstoque,
        itens: itensTratados,
        equivalentes: r.equivalentes_json ? JSON.parse(r.equivalentes_json) : {}
      });

      if (relatoriosValidos.length >= limite) break;
    }

    return relatoriosValidos;
  } catch (err) {
    console.error('[HoracioAgent] Erro ao listar relatórios:', err);
    return [];
  }
}

/**
 * Converte os itens de um relatório executivo diretamente em uma Sessão de Cotação aberta.
 */
function criarCotacaoDeRelatorio(relatorioId, db = null) {
  carregarServicos();
  const dbInst = getDb(db);
  if (!dbInst || !relatorioId) throw new Error('ID do relatório não informado');

  const rel = dbInst.prepare('SELECT * FROM compras_horacio_relatorios WHERE id = ?').get(relatorioId);
  if (!rel) throw new Error('Relatório não encontrado');

  const itens = rel.itens_json ? JSON.parse(rel.itens_json) : [];
  if (!itens || itens.length === 0) throw new Error('Relatório não contém itens para cotar');

  const cotacaoId = crypto.randomUUID();
  const numCotacao = `COT-HORACIO-${Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString();

  const itensSolicitados = itens.map(i => ({
    produtoId: 0,
    descricao: i.produtoNome,
    quantidade: i.qtdSugerida || 1,
    precoReferencia: i.precoHistorico || i.precoOfertado,
    curvaAbc: i.curvaAbc || 'C'
  }));

  dbInst.prepare(`
    INSERT INTO compras_cotacoes (
      id, numero_cotacao, titulo, status, itens_solicitados, created_at
    ) VALUES (?, ?, ?, 'Aberta', ?, ?)
  `).run(
    cotacaoId,
    numCotacao,
    `Cotação Automática Horácio: ${rel.fornecedor_nome || 'Oportunidades'}`,
    JSON.stringify(itensSolicitados),
    now
  );

  // Vincula a cotação no relatório
  dbInst.prepare('UPDATE compras_horacio_relatorios SET cotacao_id = ? WHERE id = ?').run(cotacaoId, relatorioId);

  return {
    success: true,
    cotacaoId,
    numeroCotacao: numCotacao,
    totalItens: itensSolicitados.length
  };
}

/**
 * Gera relatório executivo de compras a partir de itens críticos identificados na sincronização.
 * Alimenta o Agente Horácio de forma proativa para reposição de 30 dias sem ruptura.
 * 
 * @param {Array<Object>} itensCriticos Lista de produtos em RUPTURA ou ABAIXO_MINIMO
 * @param {Object} db Instância do banco SQLite
 * @returns {Promise<Object>}
 */
async function gerarRelatorioExecutivoSincronizacao(itensCriticos = [], db = null) {
  const dbInst = getDb(db);
  if (!dbInst) throw new Error('Conexão com banco de dados não disponível');

  const itens = Array.isArray(itensCriticos) ? itensCriticos : [];
  const relatorioId = crypto.randomUUID();
  const now = new Date().toISOString();

  let totalOrcado = 0;
  let temCurvaA = false;

  const itensFormatados = itens.map(i => {
    const qtd = Number(i.qtd_sugerida_compra || i.qtdSugerida || 1);
    const preco = Number(i.preco_unitario_ult_compra || i.custo_unitario || i.precoHistorico || 0);
    const totalItem = qtd * preco;
    totalOrcado += totalItem;

    const curva = (i.curva_abc || i.curvaAbc || 'C').toUpperCase();
    if (curva === 'A' && (i.status_ruptura === 'RUPTURA' || (i.saldo || 0) <= 0)) {
      temCurvaA = true;
    }

    return {
      produtoId: i.produto_id || i.produtoId || 0,
      produtoNome: i.descricao || i.produtoNome || 'Produto',
      ean: i.ean || '',
      saldo: Number(i.saldo || 0),
      estMinimo: Number(i.est_minimo_calculado || i.estMinimo || 0),
      qtdSugerida: qtd,
      precoHistorico: preco,
      curvaAbc: curva,
      statusRuptura: i.status_ruptura || 'RUPTURA'
    };
  });

  const statusUrgencia = temCurvaA
    ? 'CRÍTICO - AÇÃO IMEDIATA VIA WHATSAPP'
    : (itensFormatados.length > 10 ? 'ALTO' : 'MÉDIO');

  const textoRelatorio = `
*📋 RELATÓRIO EXECUTIVO DE REPOSIÇÃO (HORÁCIO)*
*Total de Itens em Risco:* ${itensFormatados.length} produtos
*Necessidade Financeira (30 dias):* R$ ${totalOrcado.toFixed(2)}
*Nível de Urgência:* ${statusUrgencia}

${itensFormatados.slice(0, 15).map(item => 
  `- *[Curva ${item.curvaAbc}]* ${item.produtoNome} (Estoque: ${item.saldo} | Mín 30d: ${item.estMinimo}) -> *Comprar: ${item.qtdSugerida} un* (Últ. R$ ${item.precoHistorico.toFixed(2)})`
).join('\n')}
${itensFormatados.length > 15 ? `\n... e mais ${itensFormatados.length - 15} itens identificados.` : ''}
`.trim();

  try {
    dbInst.prepare("DELETE FROM compras_horacio_relatorios WHERE tipo = 'Sincronizacao_Estoque'").run();
    dbInst.prepare(`
      INSERT INTO compras_horacio_relatorios (
        id, tipo, titulo, fornecedor_nome, pedido_minimo, valor_total_sugerido,
        impacto_orcamento_percent, saldo_orcamento_restante, itens_json, equivalentes_json,
        status_urgencia, mensagem_whatsapp, whatsapp_enviado, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      relatorioId,
      'Sincronizacao_Estoque',
      `Reposição 30 Dias: ${itensFormatados.length} Itens Críticos`,
      'Geral / Múltiplos Fornecedores',
      0,
      Number(totalOrcado.toFixed(2)),
      0,
      0,
      JSON.stringify(itensFormatados),
      JSON.stringify({}),
      statusUrgencia,
      textoRelatorio,
      now
    );
  } catch (errDb) {
    console.warn('[Horacio Agent] Aviso ao salvar compras_horacio_relatorios:', errDb.message);
  }

  return {
    success: true,
    relatorioId,
    totalItens: itensFormatados.length,
    totalOrcado30d: Number(totalOrcado.toFixed(2)),
    relatorioTexto: textoRelatorio,
    statusUrgencia
  };
}

module.exports = {
  HORACIO_SYSTEM_PROMPT,
  analisarOfertasEmTempoReal,
  executarConsolidacaoHorarioCorte,
  processarMidiaMultimodal,
  dispararAlertaWhatsappAdmin,
  listarRelatorios,
  criarCotacaoDeRelatorio,
  gerarRelatorioExecutivoSincronizacao,
  avaliarFaixasPrecoEscalonada,
  calcularQuantidadeSugerida,
  avaliarAuditoriaCombo
};

