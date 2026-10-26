/**
 * belinha-compras.service.js
 * Especialista autônoma em inteligência de compras e suprimentos da BelaFarma.
 * 
 * Funcionalidades:
 * - Milestone M1: Motor Especializado de Extração Comercial (JSON Schema estrito, anti-ruído, EAN-13 Módulo 10, BRL decimal, bonificações, fallback determinístico).
 * - Milestone M2: Pipeline Multimodal (Single-pass Gemini Vision com OCR Confidence 0.0 - 1.0 e detecção resiliente).
 * - Milestone M3: Persistência & Radar BelaPed (compras_historico_mensagens, compras_fornecedores_meta, compras_oportunidades_mineradas, waterfall de catálogo, upsert atômico em belaped_cotacoes_reais).
 */

const crypto = require('crypto');
const comprasMineracaoService = require('./compras-mineracao.service');
const aiService = require('./ai.service');

// ──────────────────────────────────────────────────────────
// 1. Dicionários e Constantes Especializadas
// ──────────────────────────────────────────────────────────

const DISTRIBUIDORAS_CONHECIDAS = comprasMineracaoService.DISTRIBUIDORAS_CONHECIDAS || [
  'Santa Cruz', 'Panpharma', 'Profarma', 'Gam', 'Genesio A Mendes', 'Genésio A. Mendes',
  'Medcom', 'Medcomce', 'Dimebras', 'Emona', 'Emphar', 'Oncoprod', 'Dislab', 'Ativa',
  'Total Distribuidora', 'Servmed', 'Mafra', 'Dental Cremer', 'Orgafarma', 'Riofarmac',
  'Dispensa', 'Multiplus Distribuidora', 'Decacenter', 'Distribuidora Minas', 'Drogacenter',
  'Costa Camargo', 'Meridional', 'Unilider', 'Sertaneja', 'Nova Farma', 'Farma Supply',
  'Distrimed', 'Divimed', 'DPC', 'Martins', 'Soton', 'Farmix', 'Hymparhub', 'MG Medicamentos'
];

const LABORATORIOS_CONHECIDOS = comprasMineracaoService.LABORATORIOS_CONHECIDOS || [
  'EMS', 'Neo Química', 'NeoQuimica', 'Eurofarma', 'Medley', 'Aché', 'Ache', 'Cimed',
  'Teva', 'Sandoz', 'Prati-Donaduzzi', 'Prati', 'Hypera', 'Biolab', 'União Química',
  'Uniao Quimica', 'Legrand', 'Germed', 'Torrent', 'Abbott', 'Sanofi', 'Bayer',
  'Novartis', 'AstraZeneca', 'GlaxoSmithKline', 'GSK', 'Pfizer', 'Mantecorp', 'Momenta',
  'Geolab', 'Brainfarma', 'Vitamedic', 'Kley Hertz', 'Catarinense', 'Herbarium'
];

const EAN_PREFIX_LABS = {
  '78968629': 'MEDQUIMICA',
  '78965232': 'CIMED',
  '78967142': 'NEO QUIMICA',
  '7891317': 'EUROFARMA',
  '7896112': 'TEUTO',
  '78981483': 'PRATI',
  '7898495': 'GERMED',
  '78990952': 'GEOLAB',
  '78980497': 'VITAMEDIC',
  '78996209': 'GLOBO',
  '78966580': 'ACHE',
  '78961819': 'BIOLAB',
  '78975956': 'SANDOZ'
};

const SYSTEM_PROMPT_BELINHA_TEXTO = `Você é a "Belinha Compras", especialista autônoma em inteligência de compras e suprimentos farmacêuticos da BelaFarma.
Sua missão é analisar mensagens enviadas por fornecedores, distribuidoras e representantes comerciais farmacêuticos e extrair com rigor matemático oportunidades comerciais no schema JSON estrito.

DIRETRIZES FUNDAMENTAIS:
1. DETECÇÃO DE RUÍDO: Se a mensagem for conversa casual ("bom dia", "como vai", "tudo bem?", "boa tarde"), cobrança, comprovante de pix/pagamento, aviso de entrega ou pergunta operacional sem ofertas de produtos com preço, retorne:
   {
     "sucesso": true,
     "ehOfertaComercial": false,
     "fornecedor": { "distribuidora": null, "representante": null, "condicaoPagamento": null, "pedidoMinimo": null, "validadeOferta": null },
     "produtosOfertados": []
   }
2. PREÇOS LÍQUIDOS:
   - Extraia o valor numérico float em Reais (ex: 14.50 para "R$ 14,50").
   - Se houver bonificação (ex: "compre 10 ganhe 2 por R$ 12,00" ou "10+2 a R$ 12,00"), calcule o preço líquido unitário efetivo: (10 * 12.00) / 12 = 10.00.
   - NUNCA confunda dosagem ou apresentação com preço: "CLONAZEPAM 2,00" ou "DIPIRONA 500,00" são dosagens (2mg/ml, 500mg), NÃO preços. Preços exigem indicador (R$, por, cada, un, traço ou final de linha explícito com valor monetário).
3. VALIDAÇÃO DE EAN:
   - Só extraia EAN se houver sequência numérica de 13 dígitos válida com dígito verificador módulo 10. Caso contrário, retorne null.
4. LABORATÓRIOS:
   - Identifique laboratórios conhecidos (EMS, Neo Química, Eurofarma, Cimed, Medley, Prati, Aché, Sandoz, Teuto, Biolab, Geolab, Hypera, etc.).
5. ESCALONAMENTO E DESCONTOS PROGRESSIVOS:
   - Quando houver faixas de quantidade mínima (ex: "1 un: 8,29 / 6 un: 7,69 / 60 un: 7,19"), use o preço base (menor volume) em precoOfertado e descreva as faixas em "descontoProgressivo".
6. CONFIAÇÃO OCR:
   - Para mensagens de texto nativo, defina "confiancaOcr": null.

RETORNE ESTRITAMENTE UM OBJETO JSON VÁLIDO. NADA DE TEXTO ADICIONAL ANTES OU DEPOIS.`;

const SYSTEM_PROMPT_BELINHA_VISION = `Você é a "Belinha Compras", módulo de visão computacional da BelaFarma especializado em leitura de encartes, tabelas e folhetos fotográficos de distribuidores de medicamentos.
Sua missão é analisar a imagem fotográfica do anúncio farmacêutico e extrair a tabela de produtos no schema JSON estrito.

DIRETRIZES PARA ENCARTE E TABELAS:
1. DETECÇÃO COMERCIAL:
   - Se a imagem for foto pessoal, comprovante bancário, meme ou foto ilegível sem ofertas, retorne "ehOfertaComercial": false e "produtosOfertados": [].
2. MULTI-ITENS:
   - Encartes de farmácia frequentemente possuem de 10 a 50 itens em grade. Extraia CADA PRODUTO individualmente no array "produtosOfertados".
3. COLUNAS DE PREÇO:
   - Se a tabela contiver preço de fábrica ("PF"), preço máximo ao consumidor ("PMC") e preço líquido ("Líquido" / "Oferta" / "Por"), EXTRAIA SEMPRE O PREÇO LÍQUIDO OFERTADO.
4. CONFIAÇÃO DO OCR (confiancaOcr):
   - Atribua um valor numérico float entre 0.0 e 1.0 para cada produto baseado na nitidez da leitura:
     * 0.95 - 1.00: Texto perfeitamente legível, alto contraste e tipografia padrão.
     * 0.80 - 0.94: Foto levemente inclinada ou compressão comum de WhatsApp, mas números e letras inequívocos.
     * 0.60 - 0.79: Trecho parcialmente embaçado, reflexo de luz ou letras pequenas com leve ambiguidade.
     * < 0.60: Baixa legibilidade com risco de erro numérico.
5. SCHEMA OBRIGATÓRIO:
   Retorne o schema estrito com sucesso, ehOfertaComercial, fornecedor (distribuidora, representante, condicaoPagamento, pedidoMinimo, validadeOferta) e produtosOfertados (nomeComercial, ean, laboratorio, precoOfertado, unidade, bonificacao, descontoProgressivo, confiancaOcr).

RETORNE EXATAMENTE O OBJETO JSON PADRONIZADO.`;

// ──────────────────────────────────────────────────────────
// 2. Validações Estritas (EAN-13, BRL Decimal, Anti-Ruído)
// ──────────────────────────────────────────────────────────

/**
 * Valida se uma string é um EAN-13 numérico válido através do algoritmo Módulo 10 da GS1.
 * @param {string} ean - Código EAN candidato
 * @returns {boolean}
 */
function validarEan13(ean) {
  if (!ean || typeof ean !== 'string') return false;
  const clean = ean.trim();
  if (!/^\d{13}$/.test(clean)) return false;

  let soma = 0;
  for (let i = 0; i < 12; i++) {
    const digito = parseInt(clean[i], 10);
    // Posições ímpares (índices 0, 2, 4...) peso 1; pares (índices 1, 3, 5...) peso 3
    soma += (i % 2 === 0) ? digito : (digito * 3);
  }

  const resto = soma % 10;
  const digitoEsperado = resto === 0 ? 0 : 10 - resto;
  const digitoReal = parseInt(clean[12], 10);

  return digitoEsperado === digitoReal;
}

/**
 * Converte string brasileira de moeda ("R$ 14,50" ou "1.250,50") para float.
 * @param {string|number} priceStr
 * @returns {number}
 */
function parsePriceValue(priceStr) {
  if (typeof priceStr === 'number') return isNaN(priceStr) || priceStr <= 0 ? 0 : priceStr;
  if (!priceStr) return 0;
  
  const raw = String(priceStr).trim();
  if (raw.startsWith('-') || raw.includes('-R$')) return 0;

  let clean = raw.replace(/R\$/gi, '').trim();
  if (clean.startsWith('-')) return 0;

  if (clean.includes(',') && clean.includes('.')) {
    // 1.250,50 -> 1250.50
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const val = parseFloat(clean);
  return isNaN(val) || val <= 0 ? 0 : val;
}

/**
 * Verifica se um número isolado no final da linha é dosagem/concentração e NÃO preço.
 * @param {number} valor
 * @param {string} linha
 * @returns {boolean}
 */
function isPossivelDosagemOuConcentracao(valor, linha) {
  if (!linha || typeof linha !== 'string') return false;
  // Se tem indicador explícito de preço ou moeda, NÃO é apenas dosagem
  if (/(?:R\$|por\s+|cada\s+|un\s*:\s*|un\s+|valor\s*:?|pre[çc]o\s*:?|p\/\s*|promo[çc][ãa]o\s*:?)/i.test(linha)) {
    return false;
  }
  // Se tem traço, seta ou dois pontos separando claramente (ex: "LISMED - 16,50" ou "ITEM -> 12,30")
  if (/(?:-|\u2013|\u2014|->|→|:)\s*[\d]{1,4}[,\.]\d{2}/i.test(linha)) {
    return false;
  }
  const DOSAGENS_COMUNS = new Set([
    0.15, 0.20, 0.25, 0.30, 0.50, 0.75, 1.00, 1.50, 2.00, 2.50, 3.00, 4.00, 5.00, 6.00, 7.50, 8.00, 10.00,
    12.50, 15.00, 20.00, 25.00, 30.00, 35.00, 40.00, 45.00, 50.00, 60.00, 75.00, 80.00, 90.00,
    100.00, 120.00, 125.00, 150.00, 200.00, 250.00, 300.00, 400.00, 500.00, 600.00, 750.00, 800.00, 850.00, 1000.00
  ]);
  if (DOSAGENS_COMUNS.has(valor)) {
    return true;
  }
  const hasMedicalTerms = /(?:gotas|gts|comprimidos?|comp|cps|cpr|caps|frasco|fr|ampola|pomada|gel|creme|xarope|solu[çc][ãa]o|spray|col[ií]rio|injet[aá]vel|oral|mg|mcg|ml|g\b)/i.test(linha);
  if (hasMedicalTerms && !/(?:reais|un|cada|por|r\$)/i.test(linha)) {
    return true;
  }
  return false;
}

/**
 * Filtro Heurístico Anti-Ruído Ultra-Rápido (Zero Token / Regex)
 * Rejeita saudações casuais, avisos operacionais e perguntas de balcão.
 * @param {string} text
 * @returns {boolean} true se for ruído, false se tiver indícios de oferta
 */
function isNoiseMessage(text) {
  if (!text || typeof text !== 'string') return true;
  const clean = text.trim();
  if (clean.length < 5) return true;

  const hasMoneyPattern = /(?:R\$\s*[\d]{1,4}[,\.]\d{2}|(?:por|cada|un\s*:?|p\/)\s*[\d]{1,4}[,\.]\d{2}|[\d]{1,4}[,\.]\d{2}\s*(?:reais|cada|un|cx|fr)|\b\d{1,4}[,\.]\d{2}\b)/i;

  // Saudações casuais com ou sem nome de interlocutor
  const greetingKeywords = /^(?:bom\s*dia|boa\s*tarde|boa\s*noite|ol[áa]|oi|oii+|tudo\s*bem\??|como\s*vai\??|e\s*a[íi]|fala\s*amigo|opa)\b/i;
  if (greetingKeywords.test(clean) && !hasMoneyPattern.test(clean)) {
    return true;
  }

  // Saudações casuais puras de 1 linha
  const casualGreetingRegex = /^(?:bom\s*dia|boa\s*tarde|boa\s*noite|ol[áa]|oi|oii+|tudo\s*bem\??|como\s*vai\??|ok|obrigado|valeu|beleza|blz|joinha|boa\s*semana|bom\s*trabalho|bom\s*fds|tchau|valeu\s*amigo|abra[çc]o)[\s!.,?:;)]*$/i;
  if (casualGreetingRegex.test(clean)) return true;

  // Mensagens operacionais de transporte/comprovante
  const operationalNoticeRegex = /^(?:segue\s+(?:o\s+)?comprovante|comprovante\s+anexo|nota\s+fiscal\s+anexa|mercadoria\s+entregue|motorista\s+na\s+rota|chegou\s+a\s+mercadoria|pedido\s+faturado|boleto\s+em\s+anexo)[\s!.]*$/i;
  if (operationalNoticeRegex.test(clean)) return true;

  // Perguntas sobre estoque sem anúncio de preço
  const queryWithoutOfferRegex = /^(?:voc[êe]s?\s+t[êe]m?|tem\s+a[íi]|qual\s+o\s+pre[çc]o|quanto\s+t[áa]|quanto\s+custa)\b/i;
  if (queryWithoutOfferRegex.test(clean) && !/(?:R\$|\b(?:por|a|cada)\s+[\d]{1,4}[,\.]\d{2})/i.test(clean)) {
    return true;
  }

  // Se a mensagem não possui NENHUM número que possa ser preço monetário
  if (!hasMoneyPattern.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Normaliza e formata condições de pagamento capturadas
 * @param {string[]} prazos
 * @param {string} texto
 * @returns {string|null}
 */
function formatarCondicaoPagamento(prazos, texto) {
  if (!Array.isArray(prazos) || prazos.length === 0) return null;
  
  if (texto) {
    const mComposto = /\b(\d{1,3}(?:\/\d{1,3})+)\s*(?:dias|ddl|dd|d)?\b/i.exec(texto);
    if (mComposto) {
      const rawMatch = mComposto[0].trim();
      if (/dias$/i.test(rawMatch) || new RegExp(`(?:prazo|condi[çc][ãa]o|pagamento)?\\s*${mComposto[1]}\\s+dias`, 'i').test(texto)) {
        return rawMatch.toLowerCase().includes('dias') ? rawMatch : `${mComposto[1]} dias`;
      }
    }
  }

  const compostos = prazos.filter(p => p.includes('/'));
  const simples = prazos.filter(p => !p.includes('/'));
  
  const filtrados = [...compostos];
  for (const s of simples) {
    const num = s.replace(/\D/g, '');
    const jaEstaNoComposto = compostos.some(c => c.split('/').includes(num));
    if (!jaEstaNoComposto) {
      filtrados.push(s);
    }
  }

  if (filtrados.length === 1 && compostos.length === 1 && texto) {
    if (new RegExp(`${compostos[0]}\\s+dias`, 'i').test(texto)) {
      return `${compostos[0]} dias`;
    }
  }

  return filtrados.length > 0 ? filtrados.join(', ') : prazos.join(', ');
}

/**
 * Infere o laboratório a partir do nome do produto ou prefixo EAN GS1 Brasil.
 * @param {string} nomeProduto
 * @param {string|null} ean
 * @returns {string|null}
 */
function inferirLaboratorio(nomeProduto, ean) {
  if (ean && typeof ean === 'string') {
    const cleanEan = ean.trim();
    for (const [prefix, lab] of Object.entries(EAN_PREFIX_LABS)) {
      if (cleanEan.startsWith(prefix)) return lab;
    }
  }
  if (!nomeProduto || typeof nomeProduto !== 'string') return null;
  const upper = nomeProduto.toUpperCase();
  for (const lab of LABORATORIOS_CONHECIDOS) {
    const regex = new RegExp(`\\b${lab.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (regex.test(upper)) return lab;
  }
  return null;
}

/**
 * Extrai e normaliza a unidade de apresentação do produto.
 * @param {string} nomeProduto
 * @param {string} linhaRaw
 * @returns {string|null}
 */
function inferirUnidade(nomeProduto, linhaRaw) {
  const combined = `${nomeProduto || ''} ${linhaRaw || ''}`.toLowerCase();
  if (/\b(?:cx|caixa|cxs|caixas)\b/i.test(combined)) return 'cx';
  if (/\b(?:fr|frasco|frascos|vidro)\b/i.test(combined)) return 'frasco';
  if (/\b(?:cartela|cartelas|blist|blister|blíster)\b/i.test(combined)) return 'cartela';
  if (/\b(?:display|disp)\b/i.test(combined)) return 'display';
  if (/\b(?:ampola|ampolas|amp)\b/i.test(combined)) return 'ampola';
  if (/\b(?:bisnaga|bisnagas|tubo|tubos)\b/i.test(combined)) return 'bisnaga';
  if (/\b(?:un|unidade|unidades)\b/i.test(combined)) return 'un';
  return 'un';
}

/**
 * Formata descrição legível de faixas de desconto progressivo por volume.
 * @param {Array<{qtdMinima: number, preco: number}>} faixasPreco
 * @returns {string|null}
 */
function formatarDescontoProgressivo(faixasPreco) {
  if (!Array.isArray(faixasPreco) || faixasPreco.length <= 1) return null;
  const sorted = faixasPreco.slice().sort((a, b) => a.qtdMinima - b.qtdMinima);
  const faixasSuperiores = sorted.filter((f, idx) => idx > 0 || f.qtdMinima > 1);
  if (faixasSuperiores.length === 0) return null;
  return faixasSuperiores
    .map(f => `${f.qtdMinima} un: R$ ${Number(f.preco).toFixed(2).replace('.', ',')}`)
    .join(' | ');
}

// ──────────────────────────────────────────────────────────
// 3. Motores de Extração (Determinístico & IA Multimodal)
// ──────────────────────────────────────────────────────────

/**
 * Parser Determinístico Offline de Alta Precisão (Milestone M1)
 * @param {string} text
 * @param {object} remetenteInfo
 * @returns {object} Schema estrito
 */
function extrairOfertasDeterministicas(text, remetenteInfo = {}) {
  const pushName = remetenteInfo.pushName || remetenteInfo.contactName || '';
  const phone = remetenteInfo.phone || '';

  if (isNoiseMessage(text)) {
    return {
      sucesso: true,
      ehOfertaComercial: false,
      fornecedor: {
        distribuidora: null,
        representante: pushName || null,
        condicaoPagamento: null,
        pedidoMinimo: null,
        validadeOferta: null
      },
      produtosOfertados: []
    };
  }

  // 1. Extração de Fornecedor
  const distELabs = comprasMineracaoService.extrairDistribuidoraELaboratorios(text);
  let distribuidora = distELabs.distribuidora || null;

  if (!distribuidora) {
    const INDUSTRIAS = [
      { name: 'EMS', regex: /\bEMS\b/i },
      { name: 'CIMED', regex: /\bCIMED\b/i },
      { name: 'NEO QUIMICA', regex: /\bNEO\s*QU[ÍI]MICA\b/i },
      { name: 'EUROFARMA', regex: /\bEUROFARMA\b/i },
      { name: 'MEDLEY', regex: /\bMEDLEY\b/i },
      { name: 'ACHE', regex: /\bACH[EÉ]\b/i },
      { name: 'PRATI', regex: /\bPRATI(?:-DONADUZZI)?\b/i },
      { name: 'TEUTO', regex: /\bTEUTO\b/i },
      { name: 'SANDOZ', regex: /\bSANDOZ\b/i },
      { name: 'BIOLAB', regex: /\bBIOLAB\b/i }
    ];

    if (pushName) {
      for (const ind of INDUSTRIAS) {
        if (ind.regex.test(pushName)) {
          distribuidora = ind.name;
          break;
        }
      }
    }
    if (!distribuidora) {
      const topLines = text.split('\n').slice(0, 3).join(' ');
      for (const ind of INDUSTRIAS) {
        if (ind.regex.test(topLines)) {
          distribuidora = ind.name;
          break;
        }
      }
    }
    if (!distribuidora) {
      for (const ind of INDUSTRIAS) {
        if (ind.regex.test(text) && /(?:ind[úu]stria|laborat[óo]rio|direto\s+da\s+ind|tabela\s+exclusiva|combo|amarelinho|gen[ée]ricos)/i.test(text)) {
          distribuidora = ind.name;
          break;
        }
      }
    }
  }

  const representante = comprasMineracaoService.extrairNomeRepresentante(text, pushName, distribuidora, phone);
  const prazos = comprasMineracaoService.extrairPrazos(text);
  const condicaoPagamento = formatarCondicaoPagamento(prazos, text);
  const pedMin = comprasMineracaoService.extrairPedidoMinimo(text);
  const pedidoMinimo = pedMin && pedMin.valor > 0 ? pedMin.valor : null;

  let validadeOferta = null;
  try {
    const valObj = comprasMineracaoService.extrairValidadeDaMensagem ? comprasMineracaoService.extrairValidadeDaMensagem(text) : null;
    validadeOferta = valObj?.validadeOferta || valObj?.validadeTexto || null;
  } catch (e) {}

  // 2. Extração de Produtos
  const linhasMineradas = comprasMineracaoService.extrairLinhasDeOferta(text);
  const produtosOfertados = [];

  for (const ofr of linhasMineradas) {
    if (!ofr.produtoNome || ofr.produtoNome.length < 3) continue;
    const preco = ofr.precoOfertado > 0 ? ofr.precoOfertado : ofr.precoBruto;
    if (!preco || preco <= 0) continue;

    // Strict EAN-13 validation
    let ean = ofr.ean ? String(ofr.ean).trim() : null;
    if (ean && !validarEan13(ean)) {
      ean = null;
    }

    const lab = inferirLaboratorio(ofr.produtoNome, ean);
    const unidade = inferirUnidade(ofr.produtoNome, ofr.linhaRaw);
    const descProg = formatarDescontoProgressivo(ofr.faixasPreco);

    produtosOfertados.push({
      nomeComercial: ofr.produtoNome,
      ean: ean || null,
      laboratorio: lab,
      precoOfertado: Number(preco.toFixed(2)),
      unidade: unidade || 'un',
      bonificacao: ofr.bonificacao || null,
      descontoProgressivo: descProg,
      confiancaOcr: null
    });
  }

  const ehOferta = produtosOfertados.length > 0;

  return {
    sucesso: true,
    ehOfertaComercial: ehOferta,
    fornecedor: {
      distribuidora: distribuidora,
      representante: representante || pushName || null,
      condicaoPagamento: condicaoPagamento,
      pedidoMinimo: pedidoMinimo,
      validadeOferta: validadeOferta
    },
    produtosOfertados: ehOferta ? produtosOfertados : []
  };
}

/**
 * Sanitiza e valida o payload retornado pela IA para conformidade 100% com o Schema.
 * @param {any} rawResponse
 * @param {object} context
 * @returns {object}
 */
function sanitizarRespostaSchema(rawResponse, context = {}) {
  let parsed = null;
  if (typeof rawResponse === 'object' && rawResponse !== null) {
    parsed = rawResponse;
  } else if (typeof rawResponse === 'string') {
    let clean = rawResponse.trim();
    if (clean.startsWith('```json')) clean = clean.slice(7);
    else if (clean.startsWith('```')) clean = clean.slice(3);
    if (clean.endsWith('```')) clean = clean.slice(0, -3);
    clean = clean.trim();
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return extrairOfertasDeterministicas(context.text || '', context);
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return extrairOfertasDeterministicas(context.text || '', context);
  }

  const ehOferta = Boolean(parsed.ehOfertaComercial);
  const fornecedorRaw = parsed.fornecedor || {};
  const fornecedor = {
    distribuidora: fornecedorRaw.distribuidora ? String(fornecedorRaw.distribuidora).trim() : null,
    representante: fornecedorRaw.representante ? String(fornecedorRaw.representante).trim() : (context.pushName || null),
    condicaoPagamento: fornecedorRaw.condicaoPagamento ? String(fornecedorRaw.condicaoPagamento).trim() : null,
    pedidoMinimo: typeof fornecedorRaw.pedidoMinimo === 'number' && !isNaN(fornecedorRaw.pedidoMinimo) && fornecedorRaw.pedidoMinimo > 0 ? Number(fornecedorRaw.pedidoMinimo.toFixed(2)) : null,
    validadeOferta: fornecedorRaw.validadeOferta ? String(fornecedorRaw.validadeOferta).trim() : null
  };

  const rawProdutos = Array.isArray(parsed.produtosOfertados) ? parsed.produtosOfertados : [];
  const produtosOfertados = [];

  for (const item of rawProdutos) {
    if (!item || typeof item !== 'object') continue;
    const nome = String(item.nomeComercial || item.produtoNome || '').trim();
    if (nome.length < 3) continue;

    const precoNum = parsePriceValue(item.precoOfertado !== undefined ? item.precoOfertado : item.preco);
    if (precoNum <= 0) continue;

    // Strict EAN-13 validation
    let ean = item.ean ? String(item.ean).trim() : null;
    if (ean && !validarEan13(ean)) {
      ean = null;
    }

    let confOcr = item.confiancaOcr !== undefined ? item.confiancaOcr : context.confiancaOcrDefault;
    if (confOcr !== null && confOcr !== undefined) {
      confOcr = Math.min(1.0, Math.max(0.0, parseFloat(confOcr) || 0.95));
    } else {
      confOcr = null;
    }

    produtosOfertados.push({
      nomeComercial: nome,
      ean: ean || null,
      laboratorio: item.laboratorio ? String(item.laboratorio).trim() : inferirLaboratorio(nome, ean),
      precoOfertado: Number(precoNum.toFixed(2)),
      unidade: item.unidade ? String(item.unidade).trim() : inferirUnidade(nome, ''),
      bonificacao: item.bonificacao ? String(item.bonificacao).trim() : null,
      descontoProgressivo: item.descontoProgressivo ? String(item.descontoProgressivo).trim() : null,
      confiancaOcr: confOcr
    });
  }

  const temProdutosValidos = produtosOfertados.length > 0;
  const ehOfertaFinal = ehOferta && temProdutosValidos;

  return {
    sucesso: true,
    ehOfertaComercial: ehOfertaFinal,
    fornecedor: fornecedor,
    produtosOfertados: ehOfertaFinal ? produtosOfertados : []
  };
}

/**
 * Extração de Texto via IA (Milestone M1)
 * @param {string} text
 * @param {object} remetenteInfo
 * @param {object} options
 * @returns {Promise<object>}
 */
async function extrairOfertasIA(text, remetenteInfo = {}, options = {}) {
  const pushName = remetenteInfo.pushName || remetenteInfo.contactName || '';
  const phone = remetenteInfo.phone || '';

  const userPrompt = `Analise a mensagem de compras abaixo enviada pelo remetente:
Remetente WhatsApp (pushName): ${pushName}
Telefone: ${phone}

Mensagem recebida:
"""
${text}
"""`;

  const aiResponse = await aiService.callAI(userPrompt, SYSTEM_PROMPT_BELINHA_TEXTO, {
    temperature: 0.1,
    maxTokens: 4096,
    responseMimeType: 'application/json',
    jsonMode: true,
    ...options
  });

  return sanitizarRespostaSchema(aiResponse, { text, pushName, phone, confiancaOcrDefault: null });
}

/**
 * Extração Multimodal de Imagem / Encarte via Gemini Vision (Milestone M2)
 * @param {Buffer|string} buffer
 * @param {string} mimeType
 * @param {object} remetenteInfo
 * @param {object} options
 * @returns {Promise<object>}
 */
async function extrairOfertasMultimodal(buffer, mimeType = 'image/jpeg', remetenteInfo = {}, options = {}) {
  const pushName = remetenteInfo.pushName || remetenteInfo.contactName || '';
  const phone = remetenteInfo.phone || '';
  const caption = remetenteInfo.caption || '';

  const prompt = `Analise a foto do encarte/tabela de compras enviada pelo fornecedor farmacêutico.
Remetente: ${pushName} (${phone})
Legenda da Imagem: "${caption}"

Extraia todas as ofertas no schema JSON estrito com "confiancaOcr" para cada produto.`;

  const aiResponse = await aiService.callAI(prompt, SYSTEM_PROMPT_BELINHA_VISION, {
    imageData: buffer,
    mimeType: mimeType || 'image/jpeg',
    temperature: 0.1,
    maxTokens: 8192,
    responseMimeType: 'application/json',
    jsonMode: true,
    ...options
  });

  return sanitizarRespostaSchema(aiResponse, { text: caption, pushName, phone, confiancaOcrDefault: 0.95 });
}

// ──────────────────────────────────────────────────────────
// 4. Persistência, Waterfall de Catálogo & Radar BelaPed (Milestone M3)
// ──────────────────────────────────────────────────────────

/**
 * Garante que a tabela compras_oportunidades_mineradas possua colunas auxiliares
 * @param {any} db
 */
function garantirColunasOportunidades(db) {
  if (!db) return;
  const colunas = [
    { name: 'laboratorio', type: 'TEXT' },
    { name: 'unidade', type: 'TEXT' },
    { name: 'confianca_ocr', type: 'REAL' },
    { name: 'midia_tipo', type: 'TEXT' }
  ];
  for (const col of colunas) {
    try {
      db.prepare(`ALTER TABLE compras_oportunidades_mineradas ADD COLUMN ${col.name} ${col.type}`).run();
    } catch (e) {
      // Coluna já existente
    }
  }
}

/**
 * Executa o waterfall de correspondência contra os caches do Digifarma para localizar produto_id e backfill de EAN.
 * @param {string} produtoNome
 * @param {string|null} ean
 * @param {any} db
 * @returns {object|null}
 */
function executarWaterfallCatalogo(produtoNome, ean, db) {
  if (!db) return null;

  // 1. Busca por EAN-13 válido
  if (ean && validarEan13(ean)) {
    try {
      const rowUlt = db.prepare('SELECT produto_id, ean, descricao, preco_unitario_ult_compra, fornecedor_nome FROM digifarma_ultimas_compras_cache WHERE ean = ? LIMIT 1').get(ean);
      if (rowUlt) return { produtoId: rowUlt.produto_id, ean: rowUlt.ean, descricao: rowUlt.descricao, precoUlt: rowUlt.preco_unitario_ult_compra, fornecedor: rowUlt.fornecedor_nome };

      const rowEst = db.prepare('SELECT produto_id, ean, descricao, preco_unitario_ult_compra, custo_unitario, ultima_compra_valor, ultima_compra_fornecedor FROM compras_estoque_cache WHERE ean = ? LIMIT 1').get(ean);
      if (rowEst) return { produtoId: rowEst.produto_id, ean: rowEst.ean, descricao: rowEst.descricao, precoUlt: rowEst.preco_unitario_ult_compra || rowEst.custo_unitario || rowEst.ultima_compra_valor, fornecedor: rowEst.ultima_compra_fornecedor };

      const rowProd = db.prepare('SELECT produto_id, codigo_barras as ean, descricao, preco_custo FROM digifarma_products_cache WHERE codigo_barras = ? LIMIT 1').get(ean);
      if (rowProd) return { produtoId: rowProd.produto_id, ean: rowProd.ean, descricao: rowProd.descricao, precoUlt: rowProd.preco_custo, fornecedor: null };
    } catch (e) {}
  }

  // 2. Busca por Descrição Exata
  if (produtoNome) {
    try {
      const rowUlt = db.prepare('SELECT produto_id, ean, descricao, preco_unitario_ult_compra, fornecedor_nome FROM digifarma_ultimas_compras_cache WHERE descricao = ? LIMIT 1').get(produtoNome);
      if (rowUlt) return { produtoId: rowUlt.produto_id, ean: rowUlt.ean, descricao: rowUlt.descricao, precoUlt: rowUlt.preco_unitario_ult_compra, fornecedor: rowUlt.fornecedor_nome };

      const rowEst = db.prepare('SELECT produto_id, ean, descricao, preco_unitario_ult_compra, custo_unitario, ultima_compra_valor, ultima_compra_fornecedor FROM compras_estoque_cache WHERE descricao = ? LIMIT 1').get(produtoNome);
      if (rowEst) return { produtoId: rowEst.produto_id, ean: rowEst.ean, descricao: rowEst.descricao, precoUlt: rowEst.preco_unitario_ult_compra || rowEst.custo_unitario || rowEst.ultima_compra_valor, fornecedor: rowEst.ultima_compra_fornecedor };

      const rowProd = db.prepare('SELECT produto_id, codigo_barras as ean, descricao, preco_custo FROM digifarma_products_cache WHERE descricao = ? LIMIT 1').get(produtoNome);
      if (rowProd) return { produtoId: rowProd.produto_id, ean: rowProd.ean, descricao: rowProd.descricao, precoUlt: rowProd.preco_custo, fornecedor: null };
    } catch (e) {}
  }

  // 3. Busca Fuzzy por palavras-chave relevantes
  if (produtoNome && produtoNome.length >= 4) {
    try {
      const termos = produtoNome.split(/\s+/).filter(w => w.length >= 3 && !/^(para|com|sem|de|da|do|dos|das|cx|un|cpr|mg|ml)$/i.test(w));
      const termoPrincipal = termos.slice().sort((a, b) => b.length - a.length)[0];
      if (termoPrincipal) {
        const candidates = db.prepare('SELECT produto_id, ean, descricao, preco_unitario_ult_compra, fornecedor_nome FROM digifarma_ultimas_compras_cache WHERE descricao LIKE ? LIMIT 20').all('%' + termoPrincipal + '%');
        if (candidates.length > 0) {
          let best = null, bestScore = -1;
          for (const c of candidates) {
            let score = 0;
            const cDesc = (c.descricao || '').toUpperCase();
            for (const t of termos) {
              if (cDesc.includes(t.toUpperCase())) score += t.length;
            }
            if (score > bestScore) {
              bestScore = score;
              best = c;
            }
          }
          if (best && bestScore > 0) {
            return {
              produtoId: best.produto_id,
              ean: best.ean,
              descricao: best.descricao,
              precoUlt: best.preco_unitario_ult_compra,
              fornecedor: best.fornecedor_nome
            };
          }
        }
      }
    } catch (e) {}
  }

  return null;
}

/**
 * Persiste ofertas comerciais, atualiza metadados do fornecedor e alimenta cotações reais do BelaPed.
 * @param {object} resultado - Schema JSON estrito
 * @param {object} meta - Metadados da mensagem e canal
 * @param {any} db
 */
function persistirOfertasComerciais(resultado, meta = {}, db) {
  if (!db || !resultado || !resultado.ehOfertaComercial || !Array.isArray(resultado.produtosOfertados)) return;

  const dataOferta = new Date().toISOString();

  // Executa toda a persistência de forma atômica
  const transaction = db.transaction(() => {
    garantirColunasOportunidades(db);

    // 1. Atualiza histórico da mensagem com JSON estrito
    if (meta.messageId) {
      try {
        db.prepare(`
          UPDATE compras_historico_mensagens
          SET processado_mineracao = 1,
              resultado_mineracao_json = ?
          WHERE message_id = ?
        `).run(JSON.stringify(resultado), meta.messageId);
      } catch (eHist) {}
    }

    // 2. Atualiza / Cadastra Fornecedor em compras_fornecedores_meta
    let fornecedorId = null;
    const distribuidora = resultado.fornecedor?.distribuidora;
    const telefone = meta.phone || '';

    if (distribuidora || telefone) {
      let existing = null;
      if (distribuidora) {
        existing = db.prepare('SELECT id FROM compras_fornecedores_meta WHERE distribuidora = ? LIMIT 1').get(distribuidora);
      }
      if (!existing && telefone) {
        existing = db.prepare('SELECT id FROM compras_fornecedores_meta WHERE telefone = ? LIMIT 1').get(telefone);
      }

      if (existing) {
        fornecedorId = existing.id;
        db.prepare(`
          UPDATE compras_fornecedores_meta
          SET representante = COALESCE(?, representante),
              prazos_pagamento = COALESCE(?, prazos_pagamento),
              pedido_minimo_valor = COALESCE(?, pedido_minimo_valor),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(
          resultado.fornecedor?.representante || null,
          resultado.fornecedor?.condicaoPagamento || null,
          resultado.fornecedor?.pedidoMinimo || null,
          fornecedorId
        );
      } else {
        fornecedorId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO compras_fornecedores_meta (
            id, distribuidora, representante, telefone, prazos_pagamento,
            pedido_minimo_valor, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          fornecedorId,
          distribuidora || 'FORNECEDOR_WHATSAPP',
          resultado.fornecedor?.representante || meta.pushName || null,
          telefone,
          resultado.fornecedor?.condicaoPagamento || null,
          resultado.fornecedor?.pedidoMinimo || 0
        );
      }
    }

    // 3. Processa cada produto ofertado
    for (const prod of resultado.produtosOfertados) {
      if (!prod || !prod.nomeComercial || prod.precoOfertado <= 0) continue;

      // Waterfall de catálogo
      const match = executarWaterfallCatalogo(prod.nomeComercial, prod.ean, db);
      let produtoId = null;
      let precoUltCompra = null;
      let percentualDesconto = 0;
      let status = 'Oportunidade_Sem_Historico';
      let precisaRevisao = 0;
      let motivoRevisao = null;

      if (match) {
        produtoId = match.produtoId || null;
        // Backfill de EAN se o produto minerado não tinha EAN e o catálogo possui EAN-13 válido
        if (!prod.ean && match.ean && validarEan13(match.ean)) {
          prod.ean = match.ean;
        }

        if (match.precoUlt && match.precoUlt > 0) {
          precoUltCompra = Number(match.precoUlt.toFixed(2));
          if (precoUltCompra > 0) {
            percentualDesconto = ((precoUltCompra - prod.precoOfertado) / precoUltCompra) * 100;
            percentualDesconto = Number(percentualDesconto.toFixed(2));

            if (prod.precoOfertado < precoUltCompra) {
              if (percentualDesconto > 40) {
                status = 'Revisao_Manual';
                precisaRevisao = 1;
                motivoRevisao = `Desconto de ${percentualDesconto}% acima da trava de segurança (40%).`;
              } else {
                status = 'Aprovado_Radar';
              }
            } else {
              status = 'Descartado_Preco_Maior';
            }
          }
        }
      }

      const oportunidadeId = crypto.randomUUID();

      // Grava em compras_oportunidades_mineradas
      db.prepare(`
        INSERT INTO compras_oportunidades_mineradas (
          id, fornecedor_id, distribuidora, representante, telefone,
          mensagem_id, mensagem_raw, produto_nome, ean, preco_ofertado,
          preco_ult_compra_digifarma, percentual_desconto, condicoes_pagamento,
          validade_oferta, status, data_oferta, created_at, bonificacao,
          preco_bruto, produto_id, laboratorio, unidade, confianca_ocr,
          midia_tipo, preco_liquido_efetivo, precisa_revisao, motivo_revisao
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `).run(
        oportunidadeId,
        fornecedorId,
        resultado.fornecedor?.distribuidora || null,
        resultado.fornecedor?.representante || null,
        meta.phone || null,
        meta.messageId || null,
        meta.text || null,
        prod.nomeComercial,
        prod.ean || null,
        prod.precoOfertado,
        precoUltCompra,
        percentualDesconto,
        resultado.fornecedor?.condicaoPagamento || null,
        resultado.fornecedor?.validadeOferta || null,
        status,
        dataOferta,
        dataOferta,
        prod.bonificacao || null,
        prod.precoOfertado,
        produtoId,
        prod.laboratorio || null,
        prod.unidade || null,
        prod.confiancaOcr || null,
        meta.mediaType || 'texto',
        prod.precoOfertado,
        precisaRevisao,
        motivoRevisao
      );

      // 4. Upsert Atômico no BelaPed Cotacoes Reais (Milestone M3)
      if (prod.ean && validarEan13(prod.ean) && prod.precoOfertado > 0) {
        const fornecedorNome = (resultado.fornecedor?.distribuidora || meta.pushName || 'WHATSAPP').toUpperCase().trim();
        db.prepare(`
          INSERT INTO belaped_cotacoes_reais (
            ean, fornecedor, preco, disponivel, descricao, updated_at,
            condicao_comercial, preco_padrao, laboratorio
          ) VALUES (
            ?, ?, ?, 1, ?, datetime('now', 'localtime'),
            ?, ?, ?
          ) ON CONFLICT(ean, fornecedor) DO UPDATE SET
            preco = excluded.preco,
            descricao = excluded.descricao,
            updated_at = excluded.updated_at,
            condicao_comercial = excluded.condicao_comercial,
            laboratorio = COALESCE(excluded.laboratorio, belaped_cotacoes_reais.laboratorio)
        `).run(
          prod.ean,
          fornecedorNome,
          prod.precoOfertado,
          prod.nomeComercial,
          resultado.fornecedor?.condicaoPagamento || null,
          prod.precoOfertado,
          prod.laboratorio || null
        );
      }
    }
  });

  transaction();
}

/**
 * Método Principal da Belinha Compras (Ponto de Entrada Unificado)
 * @param {object} params
 * @returns {Promise<object>} Schema JSON estrito
 */
async function processarMensagemComercial(params = {}) {
  const {
    text,
    buffer,
    mimeType = 'image/jpeg',
    pushName = '',
    phone = '',
    messageId,
    remoteJid,
    caption = '',
    db: dbParam,
    options = {}
  } = params;

  let db = null;
  if (dbParam && typeof dbParam.prepare === 'function') {
    db = dbParam;
  } else {
    try {
      db = require('../database');
    } catch (e) {}
  }

  const cleanPhone = (phone || (remoteJid ? remoteJid.split('@')[0] : '')).replace(/\D/g, '');
  const remetenteInfo = { pushName, phone: cleanPhone, caption, messageId, remoteJid };

  let resultado = null;

  const hasImage = Boolean(buffer) || (typeof params.imageData === 'string' && params.imageData.length > 0) || Buffer.isBuffer(params.imageData);

  // 1. Processamento de Mídia / Imagem Multimodal (Milestone M2)
  if (hasImage) {
    const imgBuffer = buffer || params.imageData;
    try {
      resultado = await extrairOfertasMultimodal(imgBuffer, mimeType, remetenteInfo, options);
    } catch (errAi) {
      console.warn('[Belinha-Compras] Falha no Gemini Vision multimodal:', errAi.message);
      // Fallback: se houver caption, processa o texto da legenda
      if (caption || text) {
        resultado = extrairOfertasDeterministicas(caption || text, remetenteInfo);
      } else {
        resultado = {
          sucesso: true,
          ehOfertaComercial: false,
          fornecedor: {
            distribuidora: null,
            representante: pushName || null,
            condicaoPagamento: null,
            pedidoMinimo: null,
            validadeOferta: null
          },
          produtosOfertados: []
        };
      }
    }
  } else {
    // 2. Processamento de Mensagem de Texto (Milestone M1)
    const msgText = text || '';

    // Pré-filtro anti-ruído (zero tokens / imediato)
    if (isNoiseMessage(msgText)) {
      resultado = {
        sucesso: true,
        ehOfertaComercial: false,
        fornecedor: {
          distribuidora: null,
          representante: pushName || null,
          condicaoPagamento: null,
          pedidoMinimo: null,
          validadeOferta: null
        },
        produtosOfertados: []
      };
    } else {
      // Tenta extração com IA especializada
      try {
        resultado = await extrairOfertasIA(msgText, remetenteInfo, options);
      } catch (errAi) {
        // Fallback determinístico offline / quota esgotada
        resultado = extrairOfertasDeterministicas(msgText, remetenteInfo);
      }
    }
  }

  // 3. Persistência & Radar BelaPed (Milestone M3)
  if (resultado && resultado.sucesso && resultado.ehOfertaComercial && resultado.produtosOfertados.length > 0 && db) {
    try {
      persistirOfertasComerciais(resultado, {
        phone: cleanPhone,
        pushName,
        messageId,
        text: text || caption,
        mediaType: buffer ? 'imagem' : 'texto'
      }, db);
    } catch (persistErr) {
      console.error('[Belinha-Compras] Erro ao persistir ofertas / BelaPed:', persistErr.message);
    }
  }

  return resultado;
}

module.exports = {
  processarMensagemComercial,
  extrairOfertasDeterministicas,
  extrairOfertasIA,
  extrairOfertasMultimodal,
  persistirOfertasComerciais,
  executarWaterfallCatalogo,
  validarEan13,
  parsePriceValue,
  isPossivelDosagemOuConcentracao,
  isNoiseMessage,
  inferirLaboratorio,
  inferirUnidade,
  formatarDescontoProgressivo,
  DISTRIBUIDORAS_CONHECIDAS,
  LABORATORIOS_CONHECIDOS,
  EAN_PREFIX_LABS
};
