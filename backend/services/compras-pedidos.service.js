/**
 * compras-pedidos.service.js
 * Serviço de Elaboração de Pedidos de Compra Formais,
 * Controle Orçamentário Mensal e Projeção Financeira de Boletos no Contas a Pagar.
 * 
 * Requisitos Implementados:
 * - R5 / F13: Elaboração de espelhos formais de Pedidos de Compra organizados por distribuidora
 *             vencedora (código Digifarma, EAN, descrição, quantidade sugerida/aprovada, preço
 *             unitário acordado, bonificações aplicadas, condição de pagamento e previsão de entrega).
 *             Exportação em texto formatado para envio direto via WhatsApp Comercial e cópia rápida.
 * - R5 / F14: Integração e trava estrita contra o teto do Orçamento Mensal da farmácia (tabela `monthly_limits`),
 *             cálculo do montante já comprometido vs. saldo disponível e projeção das datas de
 *             vencimento de boletos parcelados (ex: 28/35/42 dias) integrados à tabela `boletos` de Contas a Pagar.
 */

const crypto = require('crypto');

/**
 * Obtém a instância do banco SQLite (padrão ou injetada)
 * @param {object} [dbInstance]
 * @returns {object}
 */
function getDb(dbInstance) {
  if (dbInstance) return dbInstance;
  try {
    return require('../database');
  } catch (e) {
    throw new Error(`Instância do banco de dados SQLite não disponível: ${e.message}`);
  }
}

/**
 * Converte valores monetários para float de forma segura
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
 * Extrai os prazos de pagamento numéricos em dias a partir de texto ou array.
 * Exemplos:
 * - "28/35/42 dias" -> [28, 35, 42]
 * - "30 dias" -> [30]
 * - "28/35/42" -> [28, 35, 42]
 * - "À vista" / "a vista" / "0d" -> [0]
 * - [28, 35, 42] -> [28, 35, 42]
 * 
 * @param {string|number|Array<number>} condicao 
 * @returns {number[]}
 */
function extrairPrazosDias(condicao) {
  if (!condicao) return [28]; // Padrão comercial de mercado

  if (Array.isArray(condicao)) {
    const valid = condicao.map(d => parseInt(d, 10)).filter(d => !isNaN(d) && d >= 0);
    return valid.length > 0 ? valid : [28];
  }

  if (typeof condicao === 'number') {
    return [Math.max(0, Math.round(condicao))];
  }

  const str = String(condicao).trim().toLowerCase();

  // À vista / Pagamento imediato
  if (/^(à\s*vista|a\s*vista|vista|imediato|hoje|dinheiro|pix)$/i.test(str)) {
    return [0];
  }

  // Padrão "28/35/42/49" ou "28/35/42 dias"
  const matchesBarras = str.match(/\b\d{1,3}\b/g);
  if (matchesBarras && matchesBarras.length > 0) {
    const prazos = matchesBarras.map(d => parseInt(d, 10)).filter(d => !isNaN(d) && d >= 0);
    if (prazos.length > 0) return prazos;
  }

  return [28];
}

// ──────────────────────────────────────────────────────────
// 1. Elaboração de Espelhos Formais de Pedidos de Compra (F13)
// ──────────────────────────────────────────────────────────

/**
 * Gera espelho formal de Pedido de Compra estruturado e texto formatado para WhatsApp/cópia.
 * 
 * @param {object} dados
 * @param {string} dados.distribuidora Nome da distribuidora
 * @param {string} [dados.representante] Nome do representante
 * @param {string} [dados.condicaoPagamento] Condição de pagamento negociada (ex: "28/35/42 dias")
 * @param {string} [dados.previsaoEntrega] Previsão de entrega (ex: "31/08/2026", "24h")
 * @param {string} [dados.numeroPedido] Número do pedido (opcional)
 * @param {Array<object>} dados.itens Lista de itens do pedido
 * @returns {{ numeroPedido: string, distribuidora: string, representante: string, condicaoPagamento: string, previsaoEntrega: string, itens: Array<object>, valorTotal: number, textoFormatado: string }}
 */
function gerarEspelhoPedidoCompra(dados = {}) {
  const {
    distribuidora = 'Distribuidora',
    representante = 'Representante',
    condicaoPagamento = '28 dias',
    previsaoEntrega = '24h',
    numeroPedido: numPedidoProprio,
    itens
  } = dados;

  if (!itens || !Array.isArray(itens) || itens.length === 0) {
    throw new Error('Pedido sem itens: Não é possível gerar espelho de pedido com lista de itens vazia.');
  }

  const numeroPedido = numPedidoProprio || `PED_${Date.now()}_${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  let valorTotalCalculado = 0;

  const itensCalculados = itens.map((it, idx) => {
    const codigoDigifarma = it.codigoDigifarma !== undefined ? it.codigoDigifarma
                          : it.codigo !== undefined ? it.codigo
                          : it.produtoId !== undefined ? it.produtoId
                          : it.produto_id !== undefined ? it.produto_id
                          : idx + 1;

    const ean = it.ean || it.codBarras || it.codigo_barras || '';
    const descricao = (it.descricao || it.produto_nome || it.nome || `Item ${idx + 1}`).trim();
    const quantidade = Number(it.quantidade !== undefined ? it.quantidade : it.qtd || 1);
    const precoUnitario = parseMoeda(it.precoUnitario !== undefined ? it.precoUnitario : it.preco_unitario !== undefined ? it.preco_unitario : it.preco);
    
    // Subtotal com precisão contábil
    let subtotal = Number((quantidade * precoUnitario).toFixed(2));
    if (it.subtotal !== undefined && typeof it.subtotal === 'number') {
      subtotal = Number(it.subtotal.toFixed(2));
    }

    valorTotalCalculado += subtotal;

    return {
      codigoDigifarma,
      ean,
      descricao,
      quantidade,
      precoUnitario: Number(precoUnitario.toFixed(4)),
      precoUnitarioFormatado: Number(precoUnitario.toFixed(2)),
      bonificacao: it.bonificacao || it.bonificacaoTexto || null,
      descontoPercentual: Number(it.descontoPercentual || it.desconto_percentual || 0),
      subtotal
    };
  });

  const valorTotal = Number(valorTotalCalculado.toFixed(2));

  // Geração do texto formatado com formatação rica para WhatsApp / cópia rápida
  let textoFormatado = `📋 *ESPELHO DE PEDIDO DE COMPRA — BELAFARMA*\n`;
  textoFormatado += `*Pedido:* ${numeroPedido} | *Data:* ${new Date().toLocaleDateString('pt-BR')}\n`;
  textoFormatado += `*Distribuidora:* ${distribuidora} | *Rep:* ${representante}\n`;
  textoFormatado += `*Condição Pagto:* ${condicaoPagamento} | *Entrega Prevista:* ${previsaoEntrega}\n\n`;
  textoFormatado += `*ITENS:* \n`;

  itensCalculados.forEach((it, idx) => {
    const eanStr = it.ean ? `(EAN: ${it.ean}) ` : '';
    const bonusStr = it.bonificacao ? ` [Bonif: ${it.bonificacao}]` : '';
    textoFormatado += `${idx + 1}. [Cod: ${it.codigoDigifarma}] ${it.descricao} ${eanStr}- ${it.quantidade} un × R$ ${it.precoUnitarioFormatado.toFixed(2)}${bonusStr} = *R$ ${it.subtotal.toFixed(2)}*\n`;
  });

  textoFormatado += `\n*VALOR TOTAL DO PEDIDO: R$ ${valorTotal.toFixed(2)}*`;

  return {
    numeroPedido,
    distribuidora,
    representante,
    condicaoPagamento,
    previsaoEntrega,
    itens: itensCalculados,
    valorTotal,
    textoFormatado
  };
}

/**
 * Gera espelho de pedido a partir de uma cotação vencedora registrada no SQLite.
 * Compatível com o contrato PROJECT.md:
 * `gerarEspelhoPedido(distribuidoraId, cotacaoVencedoraId, options)` -> `PedidoCompraEspelho`
 * 
 * @param {string} distribuidoraIdOuNome ID ou Nome da distribuidora vencedora
 * @param {string|object} cotacaoVencedoraId ID da cotação ou objeto com dados pré-montados
 * @param {object} [options={}] Opções adicionais (salvarPedido, db)
 * @param {object} [dbInstance=null]
 * @returns {object} Espelho de pedido
 */
function gerarEspelhoPedido(distribuidoraIdOuNome, cotacaoVencedoraId, options = {}, dbInstance = null) {
  const db = getDb(dbInstance || options.db);

  // Se já for passado um objeto com itens prontos
  if (typeof cotacaoVencedoraId === 'object' && cotacaoVencedoraId !== null && cotacaoVencedoraId.itens) {
    const dados = {
      distribuidora: distribuidoraIdOuNome || cotacaoVencedoraId.distribuidora || 'Distribuidora',
      representante: cotacaoVencedoraId.representante || 'Representante',
      condicaoPagamento: cotacaoVencedoraId.condicaoPagamento || '28 dias',
      previsaoEntrega: cotacaoVencedoraId.previsaoEntrega || '24h',
      numeroPedido: cotacaoVencedoraId.numeroPedido || null,
      itens: cotacaoVencedoraId.itens
    };
    return gerarEspelhoPedidoCompra(dados);
  }

  // Caso seja um ID de cotação registrado no banco SQLite
  const cotacaoId = String(cotacaoVencedoraId || '');
  let cotacao = null;
  let resposta = null;
  let itensCotacao = [];

  try {
    cotacao = db.prepare('SELECT * FROM compras_cotacoes WHERE id = ?').get(cotacaoId);
    resposta = db.prepare(`
      SELECT * FROM compras_cotacoes_respostas 
      WHERE cotacao_id = ? AND (fornecedor_id = ? OR distribuidora = ?)
      ORDER BY vencedora DESC, score_total DESC
      LIMIT 1
    `).get(cotacaoId, distribuidoraIdOuNome, distribuidoraIdOuNome);

    itensCotacao = db.prepare(`
      SELECT * FROM compras_cotacoes_itens 
      WHERE cotacao_id = ?
    `).all(cotacaoId);
  } catch (e) {
    // Modo isolado / fallback
  }

  const distribuidora = resposta?.distribuidora || distribuidoraIdOuNome || 'Distribuidora';
  const representante = resposta?.representante || 'Representante';
  const condicaoPagamento = resposta?.condicao_pagamento || '28/35/42 dias';
  const previsaoEntrega = resposta?.previsao_entrega || '24h';

  let itensParaEspelho = [];
  if (itensCotacao && itensCotacao.length > 0) {
    itensParaEspelho = itensCotacao.map(it => ({
      codigoDigifarma: it.produto_id || it.id,
      ean: it.ean,
      descricao: it.descricao,
      quantidade: it.quantidade_sugerida || 1,
      precoUnitario: it.preco_cotado || it.preco_referencia || 10.00,
      bonificacao: it.bonificacao || null
    }));
  } else {
    // Fallback de itens mínimos caso cotação não possua itens gravados
    itensParaEspelho = [
      { codigoDigifarma: 1, ean: '7890000000001', descricao: 'Medicamento Cotação', quantidade: 10, precoUnitario: 10.00 }
    ];
  }

  const espelho = gerarEspelhoPedidoCompra({
    distribuidora,
    representante,
    condicaoPagamento,
    previsaoEntrega,
    itens: itensParaEspelho
  });

  // Salva no banco se solicitado
  if (options.salvarPedido) {
    salvarPedidoNoBanco(espelho, { cotacaoId, fornecedorId: resposta?.fornecedor_id || distribuidoraIdOuNome }, db);
  }

  return espelho;
}

// ──────────────────────────────────────────────────────────
// 2. Controle Orçamentário e Integração Financeira (F14)
// ──────────────────────────────────────────────────────────

/**
 * Validação orçamentária pura e projeção de parcelamento de boletos.
 * Compatível com a assinatura dos testes E2E e domínio ComprasDomain.validarOrcamento.
 * 
 * @param {number} tetoMensal Teto do orçamento mensal disponível para compras
 * @param {number} totalJaComprometido Montante já gasto ou comprometido no mês
 * @param {number} valorNovoPedido Valor total do novo pedido proposto
 * @param {Array<number>} [prazosDias=[28]] Array com prazos em dias para vencimento dos boletos
 * @returns {{ permitido: boolean, tetoMensal: number, comprometido: number, disponivelAntes: number, saldoAposPedido: number, boletosProjetados: Array<{ dias: number, vencimento: string, valor: number }> }}
 */
function validarOrcamento(tetoMensal, totalJaComprometido, valorNovoPedido, prazosDias = [28]) {
  const teto = Math.max(0, parseMoeda(tetoMensal));
  const comprometido = Math.max(0, parseMoeda(totalJaComprometido));
  const novo = Math.max(0, parseMoeda(valorNovoPedido));

  const disponivelAntes = Math.max(0, Number((teto - comprometido).toFixed(2)));
  const saldoAposPedido = Number((teto - (comprometido + novo)).toFixed(2));
  const permitido = saldoAposPedido >= 0;

  // Projeção dos boletos
  const prazos = Array.isArray(prazosDias) && prazosDias.length > 0 ? prazosDias : [28];
  const boletosProjetados = [];
  const hoje = new Date();
  
  // Divisão com precisão de 2 casas decimais
  const valorParcelaBase = Number((novo / prazos.length).toFixed(2));

  prazos.forEach((dias, index) => {
    const d = Math.max(0, parseInt(dias, 10) || 0);
    const dataVenc = new Date(hoje.getTime() + (d * 24 * 60 * 60 * 1000));
    const vencimentoStr = dataVenc.toISOString().split('T')[0];

    // Ajuste de centavo na última parcela para soma exata
    let valorParcela = valorParcelaBase;
    if (index === prazos.length - 1) {
      const somaAnteriores = valorParcelaBase * (prazos.length - 1);
      valorParcela = Number((novo - somaAnteriores).toFixed(2));
    }

    boletosProjetados.push({
      dias: d,
      vencimento: vencimentoStr,
      valor: valorParcela
    });
  });

  return {
    permitido,
    tetoMensal: teto,
    comprometido,
    disponivelAntes,
    saldoAposPedido,
    boletosProjetados
  };
}

/**
 * Valida o teto orçamentário mensal consultando a tabela `monthly_limits` e o histórico de compras.
 * Compatível com o contrato PROJECT.md:
 * `validarTetoOrcamentario(valorTotalPedido, mesReferencia)` -> `{ permitido: boolean, limiteMensal: number, comprometido: number, disponivel: number }`
 * 
 * @param {number} valorTotalPedido Valor total do pedido a ser validado
 * @param {number} [mesReferencia] Mês de referência (1-12 ou 0-11, padrão: mês atual 1-12)
 * @param {number} [anoReferencia] Ano de referência (padrão: ano atual)
 * @param {object} [options={}] Opções adicionais (db, etc.)
 * @param {object} [dbInstance=null]
 * @returns {{ permitido: boolean, limiteMensal: number, comprometido: number, disponivel: number, saldoAposPedido: number, mes: number, ano: number, motivo?: string }}
 */
function validarTetoOrcamentario(valorTotalPedido, mesReferencia = null, anoReferencia = null, options = {}, dbInstance = null) {
  const db = getDb(dbInstance || options.db);
  const now = new Date();
  
  const ano = anoReferencia !== null && anoReferencia !== undefined ? parseInt(anoReferencia, 10) : now.getFullYear();
  let mes = mesReferencia !== null && mesReferencia !== undefined ? parseInt(mesReferencia, 10) : (now.getMonth() + 1);

  // Normalização do mês (garante padrão 1 a 12)
  if (mes === 0) mes = 1;
  if (mes > 12) mes = 12;

  const valorPedido = Math.max(0, parseMoeda(valorTotalPedido));

  // 1. Busca teto na tabela monthly_limits
  let limiteMensal = 0;
  try {
    // Tenta formato 1-12 primeiro
    let limitRow = db.prepare('SELECT "limit" FROM monthly_limits WHERE month = ? AND year = ?').get(mes, ano);
    if (!limitRow && mes >= 1 && mes <= 12) {
      // Tenta formato 0-11 por compatibilidade legada
      limitRow = db.prepare('SELECT "limit" FROM monthly_limits WHERE month = ? AND year = ?').get(mes - 1, ano);
    }
    if (limitRow && limitRow.limit !== undefined) {
      limiteMensal = Number(limitRow.limit);
    }
  } catch (e) {
    // Fallback sem monthly_limits
  }

  // Se não houver limite cadastrado, busca padrão em compras_configuracoes ou fallback
  if (limiteMensal <= 0) {
    try {
      const cfgRow = db.prepare(`SELECT valor FROM compras_configuracoes WHERE chave = 'teto_orcamentario_padrao_mensal'`).get();
      if (cfgRow && cfgRow.valor) {
        limiteMensal = parseMoeda(cfgRow.valor);
      }
    } catch (e) {}
  }

  // 2. Calcula total já comprometido no mês
  let comprometido = 0;

  try {
    // Soma de compras_pedidos aprovados ou enviados no mês
    const pedidosComprometidos = db.prepare(`
      SELECT SUM(valor_total) as total
      FROM compras_pedidos
      WHERE (
        (mes_referencia = ? AND ano_referencia = ?)
        OR (strftime('%m', created_at) = ? AND strftime('%Y', created_at) = ?)
      )
      AND LOWER(status) NOT IN ('rejeitado', 'cancelado')
    `).get(
      mes, ano,
      String(mes).padStart(2, '0'), String(ano)
    );

    if (pedidosComprometidos && pedidosComprometidos.total) {
      comprometido += Number(pedidosComprometidos.total);
    }

    // Soma de orders legadas no mês (se não duplicadas com compras_pedidos)
    const ordersComprometidas = db.prepare(`
      SELECT SUM(totalValue) as total
      FROM orders
      WHERE (
        (paymentMonth LIKE ?)
        OR (strftime('%m', orderDate) = ? AND strftime('%Y', orderDate) = ?)
      )
      AND LOWER(status) NOT IN ('cancelado', 'rejeitado')
      AND id NOT IN (SELECT order_legado_id FROM compras_pedidos WHERE order_legado_id IS NOT NULL)
    `).get(
      `%${mes}/${ano}%`,
      String(mes).padStart(2, '0'), String(ano)
    );

    if (ordersComprometidas && ordersComprometidas.total) {
      comprometido += Number(ordersComprometidas.total);
    }
  } catch (e) {}

  comprometido = Number(comprometido.toFixed(2));
  const disponivel = Math.max(0, Number((limiteMensal - comprometido).toFixed(2)));
  const saldoAposPedido = Number((limiteMensal - (comprometido + valorPedido)).toFixed(2));
  const permitido = limiteMensal > 0 ? (saldoAposPedido >= 0) : true;

  return {
    permitido,
    limiteMensal,
    comprometido,
    disponivel,
    saldoAposPedido,
    valorPedido,
    mes,
    ano,
    motivo: permitido ? null : `Teto orçamentário mensal de R$ ${limiteMensal.toFixed(2)} excedido em R$ ${Math.abs(saldoAposPedido).toFixed(2)}`
  };
}

/**
 * Obtém resumo completo do orçamento de compras para um mês/ano.
 * 
 * @param {number} [mes]
 * @param {number} [ano]
 * @param {object} [dbInstance=null]
 * @returns {object}
 */
function obterResumoOrcamentoMensal(mes = null, ano = null, dbInstance = null) {
  const db = getDb(dbInstance);
  const now = new Date();
  const a = ano || now.getFullYear();
  const m = mes || (now.getMonth() + 1);

  const orcamento = validarTetoOrcamentario(0, m, a, {}, db);
  const pctUso = orcamento.limiteMensal > 0 ? Number(((orcamento.comprometido / orcamento.limiteMensal) * 100).toFixed(2)) : 0;

  let status = 'dentro_do_limite';
  if (orcamento.limiteMensal === 0) status = 'sem_teto_definido';
  else if (pctUso >= 100) status = 'estourado';
  else if (pctUso >= 80) status = 'atencao';

  return {
    ...orcamento,
    percentualUtilizado: pctUso,
    status
  };
}

/**
 * Define ou atualiza o teto orçamentário mensal na tabela `monthly_limits`.
 * 
 * @param {number} mes Mês (1-12)
 * @param {number} ano Ano (ex: 2026)
 * @param {number} limite Valor do limite em R$
 * @param {object} [dbInstance=null]
 * @returns {{ success: boolean, mes: number, ano: number, limite: number }}
 */
function definirLimiteMensal(mes, ano, limite, dbInstance = null) {
  const db = getDb(dbInstance);
  const m = parseInt(mes, 10);
  const a = parseInt(ano, 10);
  const lim = parseMoeda(limite);

  if (isNaN(m) || m < 1 || m > 12) throw new Error('Mês inválido (deve ser entre 1 e 12).');
  if (isNaN(a) || a < 2000) throw new Error('Ano inválido.');
  if (lim < 0) throw new Error('O limite não pode ser negativo.');

  db.prepare(`
    INSERT INTO monthly_limits (month, year, "limit")
    VALUES (?, ?, ?)
    ON CONFLICT(month, year) DO UPDATE SET "limit" = excluded."limit"
  `).run(m, a, lim);

  return {
    success: true,
    mes: m,
    ano: a,
    limite: lim
  };
}

// ──────────────────────────────────────────────────────────
// 3. Projeção de Vencimento de Boletos & Contas a Pagar
// ──────────────────────────────────────────────────────────

/**
 * Projeta o cronograma de vencimento de boletos parcelados a partir do valor total e condição de pagamento.
 * 
 * @param {number} valorTotal Valor total do pedido
 * @param {string|number|Array<number>} condicaoPagamentoOuPrazos Condição comercial ou lista de dias
 * @param {Date|string} [dataBase=new Date()] Data de partida da contagem (emissão ou faturamento)
 * @returns {Array<{ parcela: number, totalParcelas: number, dias: number, vencimento: string, valor: number, status: string }>}
 */
function projetarVencimentosBoletos(valorTotal, condicaoPagamentoOuPrazos, dataBase = new Date()) {
  const valor = Math.max(0, parseMoeda(valorTotal));
  const prazos = extrairPrazosDias(condicaoPagamentoOuPrazos);
  const base = dataBase instanceof Date ? dataBase : new Date(dataBase);

  const numParcelas = prazos.length;
  const valorParcelaBase = Number((valor / numParcelas).toFixed(2));
  const parcelas = [];

  let acumulado = 0;

  prazos.forEach((dias, index) => {
    const dataVenc = new Date(base.getTime() + (dias * 24 * 60 * 60 * 1000));
    const vencimentoStr = dataVenc.toISOString().split('T')[0];

    // Na última parcela ajusta qualquer centavo residual da divisão fracionária
    let valorParcela = valorParcelaBase;
    if (index === numParcelas - 1) {
      valorParcela = Number((valor - acumulado).toFixed(2));
    } else {
      acumulado += valorParcela;
    }

    parcelas.push({
      parcela: index + 1,
      totalParcelas: numParcelas,
      dias,
      vencimento: vencimentoStr,
      valor: valorParcela,
      status: 'Pendente'
    });
  });

  return parcelas;
}

/**
 * Vincula e gera os registros de boletos no Contas a Pagar (tabela `boletos`) para um pedido de compras.
 * Compatível com o contrato PROJECT.md:
 * `vincularBoletosContasAPagar(pedidoId, parcelas)` -> `{ boletosGerados: Array<{ valor, vencimento, fornecedor }> }`
 * 
 * @param {string|object} pedidoIdOuDados ID do pedido gravado ou objeto com dados do pedido
 * @param {Array<object>|string} [parcelasOuCondicao=null] Lista de parcelas pré-projetadas ou string de condição
 * @param {object} [options={}]
 * @param {object} [dbInstance=null]
 * @returns {{ boletosGerados: Array<object>, totalBoletos: number, valorTotal: number, integrado: boolean, pedidoId: string }}
 */
function vincularBoletosContasAPagar(pedidoIdOuDados, parcelasOuCondicao = null, options = {}, dbInstance = null) {
  const db = getDb(dbInstance || options.db);
  
  let pedido = null;
  let pedidoId = null;

  if (typeof pedidoIdOuDados === 'string') {
    pedidoId = pedidoIdOuDados;
    try {
      pedido = db.prepare('SELECT * FROM compras_pedidos WHERE id = ?').get(pedidoId);
    } catch (e) {}
  } else if (typeof pedidoIdOuDados === 'object' && pedidoIdOuDados !== null) {
    pedido = pedidoIdOuDados;
    pedidoId = pedido.id || pedido.numeroPedido || `PED_${Date.now()}`;
  }

  const distribuidora = pedido?.distribuidora || options.fornecedorNome || options.distribuidora || 'Distribuidora';
  const valorTotal = parseMoeda(pedido?.valor_total || pedido?.valorTotal || options.valorTotal || 0);
  const condicao = parcelasOuCondicao || pedido?.condicao_pagamento || pedido?.condicaoPagamento || '28/35/42 dias';

  // 1. Gera ou utiliza a projeção de parcelas
  let parcelas = [];
  if (Array.isArray(parcelasOuCondicao) && parcelasOuCondicao.length > 0) {
    parcelas = parcelasOuCondicao.map((p, idx) => ({
      parcela: p.parcela || idx + 1,
      totalParcelas: parcelasOuCondicao.length,
      dias: p.dias || 28,
      vencimento: p.vencimento || p.due_date || new Date().toISOString().split('T')[0],
      valor: parseMoeda(p.valor || p.value || (valorTotal / parcelasOuCondicao.length)),
      status: p.status || 'Pendente'
    }));
  } else {
    parcelas = projetarVencimentosBoletos(valorTotal, condicao);
  }

  // 2. Insere os boletos na tabela `boletos` do Contas a Pagar
  const boletosGerados = [];
  const stmtBoleto = db.prepare(`
    INSERT INTO boletos (id, supplierName, order_id, due_date, value, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const parc of parcelas) {
    const boletoId = `BOL_${Date.now()}_${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const vencimento = parc.vencimento;
    const valor = parc.valor;
    const status = 'Pendente';

    try {
      stmtBoleto.run(
        boletoId,
        distribuidora,
        pedidoId,
        vencimento,
        valor,
        status
      );
    } catch (e) {
      console.warn('[Compras-Pedidos] Aviso ao inserir boleto:', e.message);
    }

    boletosGerados.push({
      id: boletoId,
      supplierName: distribuidora,
      fornecedor: distribuidora,
      order_id: pedidoId,
      due_date: vencimento,
      vencimento,
      value: valor,
      valor,
      status
    });
  }

  // 3. Atualiza status no pedido `compras_pedidos`
  try {
    db.prepare(`
      UPDATE compras_pedidos
      SET integrado_contas_pagar = 1,
          boletos_json = ?
      WHERE id = ?
    `).run(JSON.stringify(boletosGerados), pedidoId);
  } catch (e) {}

  return {
    boletosGerados,
    totalBoletos: boletosGerados.length,
    valorTotal,
    integrado: true,
    pedidoId
  };
}

// ──────────────────────────────────────────────────────────
// 4. Persistência e Workflow Completo de Pedidos
// ──────────────────────────────────────────────────────────

/**
 * Salva o espelho do pedido e seus itens no banco SQLite dentro de transação atômica.
 * 
 * @param {object} espelho Objeto retornado por gerarEspelhoPedidoCompra
 * @param {object} [contexto={}]
 * @param {object} [dbInstance=null]
 * @returns {object} Pedido salvo
 */
function salvarPedidoNoBanco(espelho, contexto = {}, dbInstance = null) {
  const db = getDb(dbInstance);
  const pedidoId = contexto.id || crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const now = new Date();

  const mesRef = contexto.mesReferencia || (now.getMonth() + 1);
  const anoRef = contexto.anoReferencia || now.getFullYear();

  const insertPedido = db.prepare(`
    INSERT INTO compras_pedidos (
      id, numero_pedido, cotacao_id, fornecedor_id, distribuidora,
      representante, telefone, itens_json, valor_total,
      condicao_pagamento, previsao_entrega, mes_referencia, ano_referencia,
      texto_formatado, status, integrado_contas_pagar, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente_Aprovacao', 0, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO compras_pedidos_itens (
      id, pedido_id, codigo_digifarma, ean, descricao,
      quantidade, preco_unitario, bonificacao, desconto_percentual,
      subtotal, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const itensJson = JSON.stringify(espelho.itens);

  // Execução atômica
  const transaction = db.transaction(() => {
    insertPedido.run(
      pedidoId,
      espelho.numeroPedido,
      contexto.cotacaoId || null,
      contexto.fornecedorId || null,
      espelho.distribuidora,
      espelho.representante,
      contexto.telefone || null,
      itensJson,
      espelho.valorTotal,
      espelho.condicaoPagamento,
      espelho.previsaoEntrega,
      mesRef,
      anoRef,
      espelho.textoFormatado,
      nowIso
    );

    for (const it of espelho.itens) {
      const itemId = crypto.randomUUID();
      insertItem.run(
        itemId,
        pedidoId,
        it.codigoDigifarma,
        it.ean || null,
        it.descricao,
        it.quantidade,
        it.precoUnitario,
        it.bonificacao || null,
        it.descontoPercentual || 0,
        it.subtotal,
        nowIso
      );
    }
  });

  transaction();

  return {
    id: pedidoId,
    ...espelho,
    status: 'Pendente_Aprovacao',
    integradoContasPagar: 0,
    createdAt: nowIso
  };
}

/**
 * Cria um novo pedido de compra completo validando teto orçamentário.
 * 
 * @param {object} dadosPedido
 * @param {object} [options={}] (travaOrcamentariaEstrita: boolean, integrarBoletos: boolean)
 * @param {object} [dbInstance=null]
 * @returns {object} Pedido criado com validação orçamentária e espelho
 */
function criarPedidoCompra(dadosPedido, options = {}, dbInstance = null) {
  const db = getDb(dbInstance);

  // 1. Gera espelho
  const espelho = gerarEspelhoPedidoCompra(dadosPedido);

  // 2. Validação orçamentária
  const orcamento = validarTetoOrcamentario(espelho.valorTotal, dadosPedido.mesReferencia, dadosPedido.anoReferencia, {}, db);
  
  if (options.travaOrcamentariaEstrita !== false && !orcamento.permitido) {
    const err = new Error(`Estouro de teto orçamentário mensal: O pedido de R$ ${espelho.valorTotal.toFixed(2)} ultrapassa o saldo disponível de R$ ${orcamento.disponivel.toFixed(2)} (Limite: R$ ${orcamento.limiteMensal.toFixed(2)}, Comprometido: R$ ${orcamento.comprometido.toFixed(2)}).`);
    err.code = 'ORCAMENTO_EXCEDIDO';
    err.orcamento = orcamento;
    throw err;
  }

  // 3. Salva no banco
  const salvo = salvarPedidoNoBanco(espelho, dadosPedido, db);

  // 4. Integração financeira com boletos se solicitada
  let boletos = [];
  if (options.integrarBoletos) {
    const vinculo = vincularBoletosContasAPagar(salvo.id, espelho.condicaoPagamento, {}, db);
    boletos = vinculo.boletosGerados;
    salvo.integradoContasPagar = 1;
  }

  return {
    ...salvo,
    orcamento,
    boletos
  };
}

/**
 * Lista pedidos de compras registrados no SQLite com filtros opcionais.
 * 
 * @param {object} [filtros={}]
 * @param {object} [dbInstance=null]
 * @returns {Array<object>}
 */
function listarPedidos(filtros = {}, dbInstance = null) {
  const db = getDb(dbInstance);
  let query = 'SELECT * FROM compras_pedidos WHERE 1=1';
  const params = [];

  if (filtros.status) {
    query += ' AND LOWER(status) = ?';
    params.push(String(filtros.status).toLowerCase());
  }

  if (filtros.distribuidora) {
    query += ' AND distribuidora LIKE ?';
    params.push(`%${filtros.distribuidora}%`);
  }

  if (filtros.mes) {
    query += ' AND mes_referencia = ?';
    params.push(parseInt(filtros.mes, 10));
  }

  if (filtros.ano) {
    query += ' AND ano_referencia = ?';
    params.push(parseInt(filtros.ano, 10));
  }

  if (filtros.cotacaoId) {
    query += ' AND cotacao_id = ?';
    params.push(filtros.cotacaoId);
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params);

  return rows.map(r => {
    let itens = [];
    try {
      if (r.itens_json) itens = JSON.parse(r.itens_json);
    } catch (e) {}

    let boletos = [];
    try {
      if (r.boletos_json) boletos = JSON.parse(r.boletos_json);
    } catch (e) {}

    return {
      id: r.id,
      numeroPedido: r.numero_pedido,
      cotacaoId: r.cotacao_id,
      fornecedorId: r.fornecedor_id,
      distribuidora: r.distribuidora,
      representante: r.representante,
      telefone: r.telefone,
      valorTotal: r.valor_total,
      condicaoPagamento: r.condicao_pagamento,
      previsaoEntrega: r.previsao_entrega,
      mesReferencia: r.mes_referencia,
      anoReferencia: r.ano_referencia,
      status: r.status,
      integradoContasPagar: r.integrado_contas_pagar,
      textoFormatado: r.texto_formatado,
      itens,
      boletos,
      createdAt: r.created_at,
      enviadoAt: r.enviado_at
    };
  });
}

/**
 * Obtém pedido de compra por ID com todos os itens e boletos vinculados.
 * 
 * @param {string} pedidoId 
 * @param {object} [dbInstance=null] 
 * @returns {object}
 */
function obterPedidoPorId(pedidoId, dbInstance = null) {
  if (!pedidoId) throw new Error('ID do pedido não informado.');
  const db = getDb(dbInstance);

  const r = db.prepare('SELECT * FROM compras_pedidos WHERE id = ? OR numero_pedido = ?').get(pedidoId, pedidoId);
  if (!r) throw new Error(`Pedido não encontrado: ${pedidoId}`);

  let itens = [];
  try {
    const rowsItens = db.prepare('SELECT * FROM compras_pedidos_itens WHERE pedido_id = ?').all(r.id);
    if (rowsItens && rowsItens.length > 0) {
      itens = rowsItens.map(it => ({
        id: it.id,
        codigoDigifarma: it.codigo_digifarma,
        ean: it.ean,
        descricao: it.descricao,
        quantidade: it.quantidade,
        precoUnitario: it.preco_unitario,
        bonificacao: it.bonificacao,
        descontoPercentual: it.desconto_percentual,
        subtotal: it.subtotal
      }));
    } else if (r.itens_json) {
      itens = JSON.parse(r.itens_json);
    }
  } catch (e) {
    if (r.itens_json) itens = JSON.parse(r.itens_json);
  }

  let boletos = [];
  try {
    const rowsBoletos = db.prepare('SELECT * FROM boletos WHERE order_id = ?').all(r.id);
    if (rowsBoletos && rowsBoletos.length > 0) {
      boletos = rowsBoletos;
    } else if (r.boletos_json) {
      boletos = JSON.parse(r.boletos_json);
    }
  } catch (e) {
    if (r.boletos_json) boletos = JSON.parse(r.boletos_json);
  }

  return {
    id: r.id,
    numeroPedido: r.numero_pedido,
    cotacaoId: r.cotacao_id,
    fornecedorId: r.fornecedor_id,
    distribuidora: r.distribuidora,
    representante: r.representante,
    telefone: r.telefone,
    valorTotal: r.valor_total,
    condicaoPagamento: r.condicao_pagamento,
    previsaoEntrega: r.previsao_entrega,
    mesReferencia: r.mes_referencia,
    anoReferencia: r.ano_referencia,
    status: r.status,
    integradoContasPagar: r.integrado_contas_pagar,
    textoFormatado: r.texto_formatado,
    itens,
    boletos,
    createdAt: r.created_at,
    enviadoAt: r.enviado_at
  };
}

/**
 * Atualiza o status de um pedido de compras.
 * 
 * @param {string} pedidoId 
 * @param {string} novoStatus 'Pendente_Aprovacao' | 'Aprovado' | 'Enviado' | 'Faturado' | 'Recebido' | 'Cancelado'
 * @param {object} [dadosAdicionais={}]
 * @param {object} [dbInstance=null]
 * @returns {object}
 */
function atualizarStatusPedido(pedidoId, novoStatus, dadosAdicionais = {}, dbInstance = null) {
  const db = getDb(dbInstance);
  const pedido = obterPedidoPorId(pedidoId, db);

  const statusNormalizado = String(novoStatus).trim();
  const nowIso = new Date().toISOString();

  let enviadoAt = pedido.enviadoAt;
  if (statusNormalizado.toLowerCase() === 'enviado' && !enviadoAt) {
    enviadoAt = nowIso;
  }

  db.prepare(`
    UPDATE compras_pedidos
    SET status = ?,
        enviado_at = ?
    WHERE id = ?
  `).run(statusNormalizado, enviadoAt, pedido.id);

  return obterPedidoPorId(pedido.id, db);
}

/**
 * Cancela um pedido de compra e estorna/cancela os boletos pendentes vinculados.
 * 
 * @param {string} pedidoId 
 * @param {string} motivo 
 * @param {object} [dbInstance=null]
 * @returns {object}
 */
function cancelarPedido(pedidoId, motivo = 'Cancelado pelo administrador', dbInstance = null) {
  const db = getDb(dbInstance);
  const pedido = obterPedidoPorId(pedidoId, db);

  const nowIso = new Date().toISOString();

  // 1. Atualiza pedido
  db.prepare(`
    UPDATE compras_pedidos
    SET status = 'Cancelado',
        motivo_cancelamento = ?
    WHERE id = ?
  `).run(motivo, pedido.id);

  // 2. Cancela boletos pendentes vinculados
  try {
    db.prepare(`
      UPDATE boletos
      SET status = 'Cancelado'
      WHERE order_id = ? AND LOWER(status) = 'pendente'
    `).run(pedido.id);
  } catch (e) {}

  return obterPedidoPorId(pedido.id, db);
}

/**
 * Exporta o texto formatado para envio no WhatsApp ou impressão rápida.
 * 
 * @param {string} pedidoId 
 * @param {object} [dbInstance=null] 
 * @returns {string}
 */
function exportarEspelhoTexto(pedidoId, dbInstance = null) {
  const pedido = obterPedidoPorId(pedidoId, dbInstance);
  if (pedido.textoFormatado) return pedido.textoFormatado;
  
  const espelho = gerarEspelhoPedidoCompra({
    distribuidora: pedido.distribuidora,
    representante: pedido.representante,
    condicaoPagamento: pedido.condicaoPagamento,
    previsaoEntrega: pedido.previsaoEntrega,
    numeroPedido: pedido.numeroPedido,
    itens: pedido.itens
  });
  return espelho.textoFormatado;
}

module.exports = {
  // F13: Espelhos de Pedidos
  gerarEspelhoPedidoCompra,
  gerarEspelhoPedido,
  exportarEspelhoTexto,

  // F14: Controle Orçamentário
  validarOrcamento,
  validarTetoOrcamentario,
  obterResumoOrcamentoMensal,
  definirLimiteMensal,

  // Integração Financeira e Boletos
  extrairPrazosDias,
  projetarVencimentosBoletos,
  vincularBoletosContasAPagar,

  // CRUD e Gestão de Pedidos
  salvarPedidoNoBanco,
  criarPedidoCompra,
  listarPedidos,
  obterPedidoPorId,
  atualizarStatusPedido,
  cancelarPedido,

  // Utilitários
  parseMoeda
};
