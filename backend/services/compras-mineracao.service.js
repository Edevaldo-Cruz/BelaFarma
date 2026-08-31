/**
 * compras-mineracao.service.js
 * Motor de Mineração Histórica de Conversas e Radar de Oportunidades WhatsApp.
 * 
 * Funcionalidades:
 * 1. Extração de Representantes, Distribuidoras e Laboratórios (R2 / F5);
 * 2. Mapeamento de Prazos Médios e Condições de Pagamento (ex: 28/35/42, boleto, à vista);
 * 3. Extração de Valores e Condições de Pedido Mínimo por Distribuidora;
 * 4. Catalogação Histórica de Produtos e Categorias fornecidas por cada vendedor;
 * 5. Indexador Contínuo de Ofertas e Oportunidades com validação contra última compra no Digifarma (R2 / F6);
 * 6. Suporte Híbrido: Parser Determinístico / Regex Especializado + IA Opcional.
 */

const crypto = require('crypto');
let queryDigifarma = null;
try {
  const digiService = require('./digifarma.service');
  queryDigifarma = digiService.queryDigifarma;
} catch (e) {
  // Opcional em ambiente de teste sem Firebird
}

let callAI = null;
try {
  const aiService = require('./ai.service');
  callAI = aiService.callAI;
} catch (e) {
  // Opcional
}

// ──────────────────────────────────────────────────────────
// Dicionários Especializados do Mercado Farmacêutico Brasileiro
// ──────────────────────────────────────────────────────────

const DISTRIBUIDORAS_CONHECIDAS = [
  'Santa Cruz', 'Panpharma', 'Profarma', 'Gam', 'Genesio A Mendes', 'Genésio A. Mendes',
  'Medcom', 'Medcomce', 'Dimebras', 'Emona', 'Emphar', 'Oncoprod', 'Dislab', 'Ativa',
  'Total Distribuidora', 'Servmed', 'Mafra', 'Dental Cremer', 'Orgafarma', 'Riofarmac',
  'Dispensa', 'Multiplus Distribuidora', 'Decacenter', 'Distribuidora Minas', 'Drogacenter',
  'Costa Camargo', 'Meridional', 'Unilider', 'Sertaneja', 'Nova Farma', 'Farma Supply'
];

const LABORATORIOS_CONHECIDOS = [
  'EMS', 'Neo Química', 'NeoQuimica', 'Eurofarma', 'Medley', 'Aché', 'Ache', 'Cimed',
  'Teva', 'Sandoz', 'Prati-Donaduzzi', 'Prati', 'Hypera', 'Biolab', 'União Química',
  'Uniao Quimica', 'Legrand', 'Germed', 'Torrent', 'Abbott', 'Sanofi', 'Bayer',
  'Novartis', 'AstraZeneca', 'GlaxoSmithKline', 'GSK', 'Pfizer', 'Mantecorp', 'Momenta',
  'Geolab', 'Brainfarma', 'Vitamedic', 'Kley Hertz', 'Catarinense', 'Herbarium'
];

const CATEGORIAS_PADRAO = [
  'Genéricos', 'Similares', 'Referência', 'Éticos', 'MIP (Isentos de Prescrição)',
  'Perfumaria', 'Higiene Pessoal', 'Dermocosméticos', 'Suplementos e Vitaminas',
  'Nutrição Infantil', 'Ortopedia e Primeiros Socorros', 'Aparelhos e Acessórios'
];

const STOP_WORDS_NAME = [
  'da', 'do', 'de', 'dos', 'das', 'e', 'representante', 'vendedor', 'vendedora',
  'consultor', 'consultora', 'comercial', 'vendas', 'regional', 'gerente', 'atendimento',
  'contato', 'equipe', 'supervisor', 'supervisora', 'diretor', 'diretora',
  'santa', 'cruz', 'profarma', 'panpharma', 'cimed',
  'ems', 'medcom', 'gam', 'dimebras', 'eurofarma', 'distribuidora', 'laboratorio',
  'com', 'para', 'em', 'tudo', 'bem', 'ola', 'olá', 'bom', 'dia', 'tarde', 'noite'
];

// ──────────────────────────────────────────────────────────
// Parser Determinístico de Texto / Mensagens
// ──────────────────────────────────────────────────────────

/**
 * Limpa e normaliza string de texto
 */
function normalizeText(str) {
  if (!str) return '';
  return str
    .replace(/[\r\n]+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Converte valor em formato string brasileira ("1.250,50" ou "12,90" ou "12.90") para Number.
 */
function parsePriceValue(priceStr) {
  if (typeof priceStr === 'number') return priceStr;
  if (!priceStr) return 0;
  
  let clean = String(priceStr).replace(/R\$/gi, '').trim();
  if (clean.includes(',') && clean.includes('.')) {
    // Ex: 1.250,50 -> 1250.50
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    // Ex: 12,90 -> 12.90
    clean = clean.replace(',', '.');
  }
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

/**
 * Extrai prazos de pagamento de um texto (ex: "28/35/42", "30/60/90", "28 ddl", "boleto 30 dias", "à vista")
 */
function extrairPrazos(texto) {
  if (!texto) return [];
  const prazosEncontrados = new Set();

  // Padrão 1: Múltiplos prazos separados por barra (ex: 28/35/42, 30/60/90, 21/28/35/42, 14/28)
  const regexBarras = /\b(\d{1,3}(?:\/\d{1,3})+)(?:\s*(?:dias|ddl|dd|d))?\b/gi;
  let match;
  while ((match = regexBarras.exec(texto)) !== null) {
    prazosEncontrados.add(match[1]);
  }

  // Padrão 2: Prazo único explícito (ex: 28 dias, 30 ddl, boleto 42 dias)
  const regexUnico = /\b(?:boleto\s*)?(\d{1,3})\s*(?:dias|ddl|dd)\b/gi;
  while ((match = regexUnico.exec(texto)) !== null) {
    prazosEncontrados.add(`${match[1]} dias`);
  }

  // Padrão 3: Menção à vista / antecipado / pix
  if (/(?:[aà]\s*vista|antecipado|pix\s*com\s*desconto|via\s*pix)/i.test(texto)) {
    prazosEncontrados.add('À vista');
  }

  return Array.from(prazosEncontrados);
}

/**
 * Extrai pedido mínimo e faturamento mínimo de um texto
 */
function extrairPedidoMinimo(texto) {
  if (!texto) return { valor: 0, condicoes: null };

  const regexMinimo = /(?:pedido\s*m[íi]n(?:imo)?|faturamento\s*m[íi]n(?:imo)?|fechamento\s*m[íi]n(?:imo)?|m[íi]nimo\s*(?:de)?|m[íi]n\s*(?:de)?)\s*(?:[eé:]|\s+de)?\s*(?:r\$)?\s*([\d\.,]+)(?:\s*(?:reais))?/i;
  const match = regexMinimo.exec(texto);

  if (match && match[1]) {
    const valor = parsePriceValue(match[1]);
    
    // Captura a linha inteira da condição para manter o contexto (ex: "com frete grátis")
    let condicoes = match[0].trim();
    const linhas = texto.split(/\r?\n/);
    for (const linha of linhas) {
      if (/(?:pedido|faturamento|fechamento)\s*m[íi]n(?:imo)?|m[íi]nimo/i.test(linha)) {
        condicoes = linha.trim();
        break;
      }
    }

    return { valor, condicoes };
  }

  return { valor: 0, condicoes: null };
}

/**
 * Identifica Distribuidora ou Laboratório mencionado no texto
 */
function extrairDistribuidoraELaboratorios(texto) {
  if (!texto) return { distribuidora: null, laboratorios: [] };

  let distribuidoraDetectada = null;
  const labsDetectados = new Set();

  for (const dist of DISTRIBUIDORAS_CONHECIDAS) {
    const escaped = dist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(texto)) {
      distribuidoraDetectada = dist;
      break;
    }
  }

  for (const lab of LABORATORIOS_CONHECIDOS) {
    const escaped = lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(texto)) {
      labsDetectados.add(lab);
    }
  }

  // Se não achou distribuidora, mas achou termos genéricos (ex: "Distribuidora XPTO")
  if (!distribuidoraDetectada) {
    const genericDistMatch = /\b(?:distribuidora|rep|representante)\s+([A-ZÀ-Úa-zà-ú0-9\s]{3,25})\b/i.exec(texto);
    if (genericDistMatch && genericDistMatch[1]) {
      const candidato = genericDistMatch[1].trim();
      if (!['de', 'da', 'do', 'com', 'para', 'em'].includes(candidato.toLowerCase())) {
        distribuidoraDetectada = candidato;
      }
    }
  }

  return {
    distribuidora: distribuidoraDetectada,
    laboratorios: Array.from(labsDetectados)
  };
}

/**
 * Identifica o nome do representante em apresentações (ex: "Sou o Carlos da Santa Cruz", "Aqui é a Juliana / Profarma")
 */
function extrairNomeRepresentante(texto) {
  if (!texto) return null;

  // Remove formatações comuns de markdown do WhatsApp (*, _, ~) para facilitar o casamento de nomes
  const cleanText = texto.replace(/[*_~]/g, '');

  const padroes = [
    /(?:sou\s+(?:o|a)\s+|meu\s+nome\s+[ée]\s+|aqui\s+[ée]\s+(?:o|a)?\s+)([A-ZÀ-Úa-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)?)/i,
    /(?:representante|vendedor(?:a)?|consultor(?:a)?)(?:\s*[:,-]\s*|\s+)([A-ZÀ-Úa-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)?)/i,
    /(?:falar\s+com|atenciosamente|att:?)(?:\s*[:,-]\s*|\s+)([A-ZÀ-Úa-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)?)/i
  ];

  for (const regex of padroes) {
    const match = regex.exec(cleanText);
    if (match && match[1]) {
      const parts = match[1].trim().split(/\s+/);
      const validParts = [];
      for (const p of parts) {
        if (STOP_WORDS_NAME.includes(p.toLowerCase())) break;
        validParts.push(p);
      }
      if (validParts.length > 0) {
        const nome = validParts.join(' ');
        if (nome.length >= 2) return nome;
      }
    }
  }

  return null;
}

/**
 * Identifica ofertas de produtos individuais em linhas de texto
 */
function extrairLinhasDeOferta(texto) {
  if (!texto) return [];
  const ofertas = [];
  const linhas = texto.split(/\r?\n/);

  for (const linha of linhas) {
    const trimmed = linha.trim();
    if (!trimmed || trimmed.length < 5) continue;

    // Prioridade 1: Preço explícito com R$ (ex: R$ 2,00)
    let priceMatch = /R\$\s*([\d\.,]+)/i.exec(trimmed);
    let matchedRegex = /R\$\s*[\d\.,]+/i;

    // Prioridade 2: Preço com palavra-chave "por", "cada", "un:" ou "un R$"
    if (!priceMatch) {
      priceMatch = /(?:(?:por\s+)|(?:cada\s+)|(?:un\s*:\s*)|(?:un\s+))R?\$?\s*([\d\.,]+)/i.exec(trimmed);
      matchedRegex = /(?:(?:por\s+)|(?:cada\s+)|(?:un\s*:\s*)|(?:un\s+))R?\$?\s*[\d\.,]+/i;
    }

    // Prioridade 3: Preço numérico no final da linha (ex: "Dipirona 500mg c/ 100 1,45")
    if (!priceMatch) {
      priceMatch = /(?:^|\s)([\d]{1,4}[,\.]\d{2})(?:\s*(?:reais|un|cx|fr|pct))?\s*$/i.exec(trimmed);
      matchedRegex = /(?:^|\s)([\d]{1,4}[,\.]\d{2})(?:\s*(?:reais|un|cx|fr|pct))?\s*$/i;
    }

    if (priceMatch && priceMatch[1]) {
      const precoBruto = parsePriceValue(priceMatch[1]);
      if (precoBruto <= 0 || precoBruto > 10000) continue;

      // Busca EAN se houver (sequência de 13 dígitos)
      let ean = null;
      const eanMatch = /\b(789\d{10}|\d{13})\b/.exec(trimmed);
      if (eanMatch) {
        ean = eanMatch[1];
      }

      // Busca bonificação ou desconto percentual
      let bonificacao = null;
      let precoLiquido = precoBruto;

      // "compre 10 ganhe 2" ou "compre 10 leve 12" ou "10+2" ou "leve 12 pague 10" ou "pague 10 leve 12"
      const bonusMatch = /(?:compre\s*(\d+)\s*(?:ganhe|leve)\s*(\d+)|(\d+)\s*\+\s*(\d+)|leve\s*(\d+)\s*pague\s*(\d+)|pague\s*(\d+)\s*leve\s*(\d+))/i.exec(trimmed);
      if (bonusMatch) {
        if (bonusMatch[1] && bonusMatch[2]) {
          const comprou = parseInt(bonusMatch[1], 10);
          const ganhouOuLevou = parseInt(bonusMatch[2], 10);
          const totalRecebido = ganhouOuLevou > comprou ? ganhouOuLevou : comprou + ganhouOuLevou;
          if (totalRecebido > 0 && comprou > 0) {
            precoLiquido = (comprou * precoBruto) / totalRecebido;
            bonificacao = `Compre ${comprou} Receba ${totalRecebido}`;
          }
        } else if (bonusMatch[3] && bonusMatch[4]) {
          const comprou = parseInt(bonusMatch[3], 10);
          const ganhou = parseInt(bonusMatch[4], 10);
          const totalRecebido = comprou + ganhou;
          if (totalRecebido > 0 && comprou > 0) {
            precoLiquido = (comprou * precoBruto) / totalRecebido;
            bonificacao = `${comprou}+${ganhou}`;
          }
        } else if (bonusMatch[5] && bonusMatch[6]) {
          const totalRecebido = parseInt(bonusMatch[5], 10);
          const comprou = parseInt(bonusMatch[6], 10);
          if (totalRecebido > 0 && comprou > 0) {
            precoLiquido = (comprou * precoBruto) / totalRecebido;
            bonificacao = `Leve ${totalRecebido} Pague ${comprou}`;
          }
        } else if (bonusMatch[7] && bonusMatch[8]) {
          const comprou = parseInt(bonusMatch[7], 10);
          const totalRecebido = parseInt(bonusMatch[8], 10);
          if (totalRecebido > 0 && comprou > 0) {
            precoLiquido = (comprou * precoBruto) / totalRecebido;
            bonificacao = `Pague ${comprou} Leve ${totalRecebido}`;
          }
        }
      }

      // Desconto percentual direto: "10% de desconto", "desc 15%", "20% off"
      const descMatch = /(\d{1,2}(?:[\.,]\d+)?)\s*%\s*(?:de\s*desc(?:onto)?|off)/i.exec(trimmed);
      if (descMatch) {
        const perc = parseFloat(descMatch[1].replace(',', '.'));
        if (perc > 0 && perc < 100) {
          precoLiquido = precoLiquido * (1 - perc / 100);
          bonificacao = bonificacao ? `${bonificacao} + ${perc}% desc` : `${perc}% desc`;
        }
      }

      // Extrai o nome do produto removendo preços, ean e bonificações da linha
      let nomeProduto = trimmed
        .replace(matchedRegex, '')
        .replace(/\b(789\d{10}|\d{13})\b/g, '')
        .replace(/(?:compre\s*\d+\s*(?:ganhe|leve)\s*\d+|\d+\s*\+\s*\d+|leve\s*\d+\s*pague\s*\d+|pague\s*\d+\s*leve\s*\d+)/gi, '')
        .replace(/\d{1,2}(?:[\.,]\d+)?\s*%\s*(?:de\s*desc(?:onto)?|off)/gi, '')
        .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s\-*•~>:;\d.)(_#]+/gu, '')
        .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\s\-*•~>:;.)(_#]+$/gu, '')
        .trim();

      if (nomeProduto.length >= 3 && !/^(total|pedido|faturamento|fechamento|subtotal|m[íi]nimo|frete|prazo|tabela|condi[çc][ãa]o|bom dia|boa tarde|ol[áa]|aten[çc][ãa]o)/i.test(nomeProduto)) {
        ofertas.push({
          produtoNome: nomeProduto,
          ean,
          precoBruto: Number(precoBruto.toFixed(2)),
          precoOfertado: Number(precoLiquido.toFixed(2)),
          bonificacao,
          linhaRaw: trimmed
        });
      }
    }
  }

  return ofertas;
}

/**
 * Minera texto livre extraindo todas as informações comerciais de forma estruturada.
 */
function minerarTextoLivre(texto, remetenteInfo = {}) {
  const norm = normalizeText(texto);
  const prazos = extrairPrazos(norm);
  const pedidoMinimo = extrairPedidoMinimo(norm);
  const { distribuidora, laboratorios } = extrairDistribuidoraELaboratorios(norm);
  const representanteNome = extrairNomeRepresentante(norm) || remetenteInfo.nome || null;
  const ofertas = extrairLinhasDeOferta(norm);

  const categoriasEncontradas = new Set();
  const produtosEncontrados = new Set();

  if (laboratorios.length > 0) {
    laboratorios.forEach(lab => categoriasEncontradas.add(`Laboratório ${lab}`));
  }

  for (const cat of CATEGORIAS_PADRAO) {
    const escaped = cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(norm)) {
      categoriasEncontradas.add(cat);
    }
  }

  for (const ofr of ofertas) {
    produtosEncontrados.add(ofr.produtoNome);
  }

  return {
    representante: representanteNome,
    distribuidora: distribuidora || remetenteInfo.distribuidora || null,
    telefone: remetenteInfo.telefone || remetenteInfo.phone || null,
    prazosPagamento: prazos,
    pedidoMinimoValor: pedidoMinimo.valor,
    pedidoMinimoCondicoes: pedidoMinimo.condicoes,
    categorias: Array.from(categoriasEncontradas),
    catalogoProdutos: Array.from(produtosEncontrados),
    ofertas
  };
}

// ──────────────────────────────────────────────────────────
// Validação e Comparação de Ofertas com o Digifarma Firebird / Cache Local
// ──────────────────────────────────────────────────────────

/**
 * Valida o preço de uma oferta contra o histórico do Digifarma.
 * Se Firebird estiver disponível, consulta a tabela de produtos e últimas compras.
 * Caso contrário, utiliza o cache local `compras_estoque_cache` e `digifarma_products_cache`.
 */
async function validarOfertaComDigifarma(produtoNome, ean, precoOfertado, db, options = {}) {
  let precoUltCompra = null;
  let produtoId = null;
  let descricaoEncontrada = produtoNome;
  let estoqueAtual = 0;
  let estMinimo = 0;
  let emRuptura = false;

  const useFirebird = queryDigifarma && !options.skipFirebird;

  // 1. Tenta buscar no Firebird se conectado
  if (useFirebird) {
    try {
      let rows = [];
      if (ean) {
        rows = await queryDigifarma(`
          SELECT FIRST 1 PRODUTO_ID, PRODUTO, PROD_SALDO, PROD_ESTMINIMO, PROD_PRCOMPRA, VALOR_ULT_COMPRA
          FROM PRODUTOS
          WHERE COD_BARRAS = ?
        `, [ean], 2000);
      }
      
      if (!rows || rows.length === 0) {
        const cleanName = produtoNome.replace(/[\%_]/g, '').substring(0, 20);
        rows = await queryDigifarma(`
          SELECT FIRST 1 PRODUTO_ID, PRODUTO, PROD_SALDO, PROD_ESTMINIMO, PROD_PRCOMPRA, VALOR_ULT_COMPRA
          FROM PRODUTOS
          WHERE PRODUTO CONTAINING ? AND PROD_ATIVO = 'S'
        `, [cleanName], 2000);
      }

      if (rows && rows.length > 0) {
        const p = rows[0];
        produtoId = p.PRODUTO_ID;
        descricaoEncontrada = p.PRODUTO;
        estoqueAtual = parseFloat(p.PROD_SALDO) || 0;
        estMinimo = parseFloat(p.PROD_ESTMINIMO) || 0;
        precoUltCompra = parseFloat(p.VALOR_ULT_COMPRA || p.PROD_PRCOMPRA) || null;
        emRuptura = estoqueAtual <= 0 || estoqueAtual < estMinimo;
      }
    } catch (err) {
      // Fallback silencioso para cache local SQLite
    }
  }

  // 2. Fallback para cache local no SQLite
  if (precoUltCompra === null && db) {
    try {
      let cacheRow = null;
      if (ean) {
        cacheRow = db.prepare('SELECT * FROM compras_estoque_cache WHERE ean = ? LIMIT 1').get(ean);
      }
      if (!cacheRow && produtoNome) {
        const cleanName = produtoNome.substring(0, 15);
        cacheRow = db.prepare('SELECT * FROM compras_estoque_cache WHERE descricao LIKE ? LIMIT 1').get(`%${cleanName}%`);
      }

      if (cacheRow) {
        produtoId = cacheRow.produto_id;
        descricaoEncontrada = cacheRow.descricao;
        estoqueAtual = cacheRow.saldo || 0;
        estMinimo = cacheRow.est_minimo_calculado || cacheRow.est_minimo_digifarma || 0;
        precoUltCompra = cacheRow.ultima_compra_valor || cacheRow.custo_unitario || null;
        emRuptura = estoqueAtual <= 0 || estoqueAtual < estMinimo;
      } else {
        let prodCache = null;
        if (ean) {
          prodCache = db.prepare('SELECT * FROM digifarma_products_cache WHERE codigo_barras = ? LIMIT 1').get(ean);
        }
        if (!prodCache && produtoNome) {
          prodCache = db.prepare('SELECT * FROM digifarma_products_cache WHERE nome LIKE ? LIMIT 1').get(`%${produtoNome.substring(0, 15)}%`);
        }
        if (prodCache) {
          produtoId = prodCache.produto_id;
          descricaoEncontrada = prodCache.nome;
          estoqueAtual = prodCache.estoque || 0;
          precoUltCompra = prodCache.preco_custo || null;
          emRuptura = estoqueAtual <= 0;
        }
      }
    } catch (e) {
      // Ignora erro de cache
    }
  }

  // Calcula a economia percentual
  let percentualDesconto = 0;
  let precoInferior = false;

  if (precoUltCompra && precoUltCompra > 0) {
    if (precoOfertado < precoUltCompra) {
      percentualDesconto = ((precoUltCompra - precoOfertado) / precoUltCompra) * 100;
      precoInferior = true;
    } else {
      percentualDesconto = -(((precoOfertado - precoUltCompra) / precoUltCompra) * 100);
    }
  }

  return {
    produtoId,
    descricaoDigifarma: descricaoEncontrada,
    precoUltCompra: precoUltCompra ? Number(precoUltCompra.toFixed(2)) : null,
    precoOfertado: Number(precoOfertado.toFixed(2)),
    percentualDesconto: Number(percentualDesconto.toFixed(2)),
    precoInferior,
    estoqueAtual,
    estMinimo,
    emRuptura
  };
}

// ──────────────────────────────────────────────────────────
// Processamento de Mensagens e Persistência
// ──────────────────────────────────────────────────────────

/**
 * Atualiza ou insere metadados do fornecedor no SQLite (`compras_fornecedores_meta`).
 */
function upsertFornecedorMeta(db, dados) {
  if (!db || !dados.telefone) return null;

  const now = new Date().toISOString();
  const cleanPhone = String(dados.telefone).replace(/\D/g, '');
  if (!cleanPhone) return null;

  let existing = db.prepare(`
    SELECT * FROM compras_fornecedores_meta
    WHERE telefone = ? OR (distribuidora IS NOT NULL AND distribuidora = ? AND ? != '')
    LIMIT 1
  `).get(cleanPhone, dados.distribuidora || '', dados.distribuidora || '');

  let prazosArr = [];
  let categoriasArr = [];
  let catalogoArr = [];

  if (existing) {
    try { prazosArr = JSON.parse(existing.prazos_pagamento || '[]'); } catch (e) {}
    try { categoriasArr = JSON.parse(existing.categorias_fornecidas || '[]'); } catch (e) {}
    try { catalogoArr = JSON.parse(existing.catalogo_produtos || '[]'); } catch (e) {}
  }

  if (Array.isArray(dados.prazosPagamento)) {
    for (const p of dados.prazosPagamento) {
      if (!prazosArr.includes(p)) prazosArr.push(p);
    }
  }

  if (Array.isArray(dados.categorias)) {
    for (const c of dados.categorias) {
      if (!categoriasArr.includes(c)) categoriasArr.push(c);
    }
  }

  if (Array.isArray(dados.catalogoProdutos)) {
    for (const prod of dados.catalogoProdutos) {
      if (!catalogoArr.includes(prod)) catalogoArr.push(prod);
    }
  }

  const distribuidoraFinal = dados.distribuidora || existing?.distribuidora || 'Distribuidora Não Identificada';
  const representanteFinal = dados.representante || existing?.representante || null;
  const pedidoMinimoValorFinal = (dados.pedidoMinimoValor && dados.pedidoMinimoValor > 0)
    ? dados.pedidoMinimoValor
    : (existing?.pedido_minimo_valor || 0);
  const pedidoMinimoCondicoesFinal = dados.pedidoMinimoCondicoes || existing?.pedido_minimo_condicoes || null;

  const id = existing ? existing.id : crypto.randomUUID();

  if (existing) {
    db.prepare(`
      UPDATE compras_fornecedores_meta
      SET distribuidora = ?,
          representante = COALESCE(?, representante),
          prazos_pagamento = ?,
          pedido_minimo_valor = ?,
          pedido_minimo_condicoes = COALESCE(?, pedido_minimo_condicoes),
          categorias_fornecidas = ?,
          catalogo_produtos = ?,
          ultima_varredura_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      distribuidoraFinal,
      representanteFinal,
      JSON.stringify(prazosArr),
      pedidoMinimoValorFinal,
      pedidoMinimoCondicoesFinal,
      JSON.stringify(categoriasArr),
      JSON.stringify(catalogoArr),
      now,
      now,
      id
    );
  } else {
    db.prepare(`
      INSERT INTO compras_fornecedores_meta (
        id, digifarma_id, distribuidora, representante, telefone,
        prazos_pagamento, pedido_minimo_valor, pedido_minimo_condicoes,
        taxa_quebra_percent, pontualidade_score, categorias_fornecidas,
        catalogo_produtos, ultima_varredura_at, created_at, updated_at
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 0, 100, ?, ?, ?, ?, ?)
    `).run(
      id,
      distribuidoraFinal,
      representanteFinal,
      cleanPhone,
      JSON.stringify(prazosArr),
      pedidoMinimoValorFinal,
      pedidoMinimoCondicoesFinal,
      JSON.stringify(categoriasArr),
      JSON.stringify(catalogoArr),
      now,
      now,
      now
    );
  }

  try {
    const locExisting = db.prepare('SELECT id FROM local_suppliers WHERE telefone = ? LIMIT 1').get(cleanPhone);
    if (!locExisting && representanteFinal) {
      db.prepare(`
        INSERT INTO local_suppliers (id, digifarma_id, representante, telefone, prazo_boletos, createdAt)
        VALUES (?, NULL, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), representanteFinal, cleanPhone, prazosArr.join(', '), now);
    }
  } catch (e) {}

  return {
    id,
    distribuidora: distribuidoraFinal,
    representante: representanteFinal,
    telefone: cleanPhone,
    prazosPagamento: prazosArr,
    pedidoMinimoValor: pedidoMinimoValorFinal,
    pedidoMinimoCondicoes: pedidoMinimoCondicoesFinal,
    categorias: categoriasArr,
    catalogoProdutos: catalogoArr
  };
}

/**
 * Processa uma única mensagem recebida pelo WhatsApp de compras.
 */
async function processarMensagemRecebida(msgData, db, options = {}) {
  if (!db || !msgData || !msgData.text) return { minerado: false, ofertas: [] };

  const texto = msgData.text;
  const telefone = String(msgData.phone || '').replace(/\D/g, '');
  const nomeContato = msgData.contactName || '';

  const extracao = minerarTextoLivre(texto, {
    telefone,
    nome: nomeContato
  });

  let fornecedorSalvo = null;
  if (telefone) {
    fornecedorSalvo = upsertFornecedorMeta(db, extracao);
  }

  const ofertasIndexadas = [];
  const now = new Date().toISOString();

  for (const ofr of extracao.ofertas) {
    const validacao = await validarOfertaComDigifarma(ofr.produtoNome, ofr.ean, ofr.precoOfertado, db, options);

    const oportunidadeId = crypto.randomUUID();
    const dataOferta = new Date(msgData.timestamp || Date.now()).toISOString();

    try {
      db.prepare(`
        INSERT INTO compras_oportunidades_mineradas (
          id, fornecedor_id, distribuidora, representante, telefone,
          mensagem_id, mensagem_raw, produto_nome, ean, preco_ofertado,
          preco_ult_compra_digifarma, percentual_desconto, condicoes_pagamento,
          validade_oferta, status, data_oferta, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Disponivel', ?, ?)
      `).run(
        oportunidadeId,
        fornecedorSalvo ? fornecedorSalvo.id : null,
        fornecedorSalvo ? fornecedorSalvo.distribuidora : extracao.distribuidora,
        fornecedorSalvo ? fornecedorSalvo.representante : extracao.representante,
        telefone,
        msgData.messageId || null,
        ofr.linhaRaw || texto,
        ofr.produtoNome,
        ofr.ean || null,
        ofr.precoOfertado,
        validacao.precoUltCompra,
        validacao.percentualDesconto,
        extracao.prazosPagamento.length > 0 ? extracao.prazosPagamento.join(', ') : ofr.bonificacao,
        null,
        dataOferta,
        now
      );

      ofertasIndexadas.push({
        id: oportunidadeId,
        produtoNome: ofr.produtoNome,
        ean: ofr.ean,
        precoOfertado: ofr.precoOfertado,
        precoUltCompra: validacao.precoUltCompra,
        percentualDesconto: validacao.percentualDesconto,
        precoInferior: validacao.precoInferior,
        emRuptura: validacao.emRuptura,
        bonificacao: ofr.bonificacao
      });
    } catch (dbErr) {
      console.warn('[Compras-Mineração] Aviso ao gravar oportunidade:', dbErr.message);
    }
  }

  if (msgData.messageId) {
    try {
      db.prepare(`
        UPDATE compras_historico_mensagens
        SET processado_mineracao = 1,
            resultado_mineracao_json = ?
        WHERE message_id = ?
      `).run(JSON.stringify({
        fornecedor: fornecedorSalvo,
        ofertasContadas: ofertasIndexadas.length,
        prazos: extracao.prazosPagamento,
        pedidoMinimo: extracao.pedidoMinimoValor
      }), msgData.messageId);
    } catch (e) {}
  }

  return {
    minerado: true,
    fornecedor: fornecedorSalvo,
    ofertas: ofertasIndexadas
  };
}

/**
 * Processa um lote de mensagens.
 */
async function processarMensagensEmLote(messagesList, db, options = {}) {
  if (!db || !Array.isArray(messagesList) || messagesList.length === 0) {
    return { processadas: 0, ofertas: 0 };
  }

  let processadas = 0;
  let totalOfertas = 0;

  for (const rawMsg of messagesList) {
    try {
      if (!rawMsg.message || !rawMsg.key) continue;

      const remoteJid = rawMsg.key.remoteJid;
      if (!remoteJid || remoteJid.endsWith('@broadcast') || remoteJid.endsWith('@g.us')) continue;

      let contentMsg = rawMsg.message;
      if (contentMsg?.viewOnceMessage?.message) contentMsg = contentMsg.viewOnceMessage.message;
      else if (contentMsg?.viewOnceMessageV2?.message) contentMsg = contentMsg.viewOnceMessageV2.message;
      else if (contentMsg?.ephemeralMessage?.message) contentMsg = contentMsg.ephemeralMessage.message;
      else if (contentMsg?.documentWithCaptionMessage?.message) contentMsg = contentMsg.documentWithCaptionMessage.message;

      const messageType = Object.keys(contentMsg)[0] || '';
      let text = null;

      if (messageType === 'conversation') text = contentMsg.conversation;
      else if (messageType === 'extendedTextMessage') text = contentMsg.extendedTextMessage?.text;
      else if (messageType === 'imageMessage') text = contentMsg.imageMessage?.caption;
      else if (messageType === 'documentMessage') text = contentMsg.documentMessage?.caption;

      if (!text || text.trim().length < 3) continue;

      const phone = remoteJid.split('@')[0];
      const messageId = rawMsg.key.id;
      const timestamp = rawMsg.messageTimestamp ? (rawMsg.messageTimestamp * 1000) : Date.now();
      const fromMe = rawMsg.key.fromMe ? 1 : 0;

      if (!fromMe) {
        const res = await processarMensagemRecebida({
          messageId,
          remoteJid,
          phone,
          contactName: rawMsg.pushName || '',
          text,
          timestamp
        }, db, options);
        processadas++;
        totalOfertas += (res.ofertas?.length || 0);
      }
    } catch (err) {
      // Continua
    }
  }

  console.log(`[Compras-Mineração] 📦 Lote de histórico concluído: ${processadas} mensagens analisadas, ${totalOfertas} ofertas indexadas.`);
  return { processadas, ofertas: totalOfertas };
}

/**
 * Varredura histórica de conversas armazenadas no SQLite (`compras_historico_mensagens`).
 */
async function minerarHistoricoConversas(db, options = {}) {
  if (!db) throw new Error('Instância do banco de dados SQLite não informada.');

  const limit = options.limit || 500;
  const reprocessarTudo = options.reprocessarTudo || false;

  let query = `
    SELECT * FROM compras_historico_mensagens
    WHERE from_me = 0 AND texto_mensagem IS NOT NULL AND texto_mensagem != ''
  `;
  if (!reprocessarTudo) {
    query += ` AND processado_mineracao = 0`;
  }
  query += ` ORDER BY timestamp ASC LIMIT ?`;

  const rows = db.prepare(query).all(limit);
  console.log(`[Compras-Mineração] 🔍 Iniciando varredura histórica de ${rows.length} mensagens...`);

  let representantesCount = 0;
  let ofertasCount = 0;
  let condicoesCount = 0;

  for (const row of rows) {
    const res = await processarMensagemRecebida({
      messageId: row.message_id,
      remoteJid: row.remote_jid,
      phone: row.telefone,
      contactName: row.nome_contato,
      text: row.texto_mensagem,
      timestamp: row.timestamp
    }, db, options);

    if (res.fornecedor) {
      representantesCount++;
      if (res.fornecedor.prazosPagamento.length > 0 || res.fornecedor.pedidoMinimoValor > 0) {
        condicoesCount++;
      }
    }
    ofertasCount += (res.ofertas?.length || 0);
  }

  const totalFornecedores = db.prepare('SELECT COUNT(*) as total FROM compras_fornecedores_meta').get().total;
  const totalOfertas = db.prepare("SELECT COUNT(*) as total FROM compras_oportunidades_mineradas WHERE status = 'Disponivel'").get().total;

  return {
    representantesCadastrados: totalFornecedores,
    ofertasIndexadas: totalOfertas,
    condicoesMapeadas: condicoesCount,
    totalMensagensProcessadas: rows.length
  };
}

// ──────────────────────────────────────────────────────────
// Consultas da API
// ──────────────────────────────────────────────────────────

/**
 * Lista oportunidades de compra ativas e mineradas.
 */
function listarOportunidades(db, filtros = {}) {
  if (!db) return [];

  let sql = `SELECT * FROM compras_oportunidades_mineradas WHERE 1=1`;
  const params = [];

  if (filtros.status) {
    sql += ` AND status = ?`;
    params.push(filtros.status);
  }

  if (filtros.apenasComDesconto) {
    sql += ` AND percentual_desconto > 0`;
  }

  if (filtros.busca) {
    sql += ` AND (produto_nome LIKE ? OR distribuidora LIKE ? OR representante LIKE ?)`;
    const b = `%${filtros.busca}%`;
    params.push(b, b, b);
  }

  sql += ` ORDER BY percentual_desconto DESC, created_at DESC`;

  if (filtros.limite) {
    sql += ` LIMIT ?`;
    params.push(filtros.limite);
  }

  return db.prepare(sql).all(...params);
}

/**
 * Lista fornecedores e representantes minerados com seus prazos e pedidos mínimos.
 */
function listarFornecedoresMinerados(db, filtros = {}) {
  if (!db) return [];

  let sql = `SELECT * FROM compras_fornecedores_meta WHERE 1=1`;
  const params = [];

  if (filtros.busca) {
    sql += ` AND (distribuidora LIKE ? OR representante LIKE ? OR telefone LIKE ?)`;
    const b = `%${filtros.busca}%`;
    params.push(b, b, b);
  }

  if (filtros.comPedidoMinimo) {
    sql += ` AND pedido_minimo_valor > 0`;
  }

  sql += ` ORDER BY distribuidora ASC`;

  const rows = db.prepare(sql).all(...params);

  return rows.map(r => {
    let prazos = [];
    let categorias = [];
    let catalogo = [];
    try { prazos = JSON.parse(r.prazos_pagamento || '[]'); } catch (e) {}
    try { categorias = JSON.parse(r.categorias_fornecidas || '[]'); } catch (e) {}
    try { catalogo = JSON.parse(r.catalogo_produtos || '[]'); } catch (e) {}

    return {
      id: r.id,
      digifarmaId: r.digifarma_id,
      distribuidora: r.distribuidora,
      representante: r.representante,
      telefone: r.telefone,
      prazosPagamento: prazos,
      pedidoMinimoValor: r.pedido_minimo_valor,
      pedidoMinimoCondicoes: r.pedido_minimo_condicoes,
      taxaQuebraPercent: r.taxa_quebra_percent,
      pontualidadeScore: r.pontualidade_score,
      categorias,
      catalogoProdutos: catalogo,
      ultimaVarreduraAt: r.ultima_varredura_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  });
}

/**
 * Retorna catálogo e histórico de produtos de um fornecedor específico.
 */
function obterCatalogoFornecedor(db, fornecedorId) {
  if (!db || !fornecedorId) return { produtos: [], categorias: [], ofertasRecentes: [] };

  const forn = db.prepare('SELECT * FROM compras_fornecedores_meta WHERE id = ?').get(fornecedorId);
  if (!forn) return { produtos: [], categorias: [], ofertasRecentes: [] };

  let catalogo = [];
  let categorias = [];
  try { catalogo = JSON.parse(forn.catalogo_produtos || '[]'); } catch (e) {}
  try { categorias = JSON.parse(forn.categorias_fornecidas || '[]'); } catch (e) {}

  const ofertasRecentes = db.prepare(`
    SELECT * FROM compras_oportunidades_mineradas
    WHERE fornecedor_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(fornecedorId);

  return {
    fornecedor: {
      id: forn.id,
      distribuidora: forn.distribuidora,
      representante: forn.representante,
      telefone: forn.telefone,
      pedidoMinimoValor: forn.pedido_minimo_valor
    },
    produtos: catalogo,
    categorias,
    ofertasRecentes
  };
}

/**
 * Atualiza manualmente ou confirma dados de um fornecedor.
 */
function atualizarFornecedorMeta(db, fornecedorId, dados) {
  if (!db || !fornecedorId) throw new Error('ID do fornecedor não informado.');

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE compras_fornecedores_meta
    SET distribuidora = COALESCE(?, distribuidora),
        representante = COALESCE(?, representante),
        telefone = COALESCE(?, telefone),
        prazos_pagamento = COALESCE(?, prazos_pagamento),
        pedido_minimo_valor = COALESCE(?, pedido_minimo_valor),
        pedido_minimo_condicoes = COALESCE(?, pedido_minimo_condicoes),
        pontualidade_score = COALESCE(?, pontualidade_score),
        taxa_quebra_percent = COALESCE(?, taxa_quebra_percent),
        updated_at = ?
    WHERE id = ?
  `).run(
    dados.distribuidora || null,
    dados.representante || null,
    dados.telefone || null,
    dados.prazosPagamento ? JSON.stringify(dados.prazosPagamento) : null,
    dados.pedidoMinimoValor !== undefined ? dados.pedidoMinimoValor : null,
    dados.pedidoMinimoCondicoes || null,
    dados.pontualidadeScore !== undefined ? dados.pontualidadeScore : null,
    dados.taxaQuebraPercent !== undefined ? dados.taxaQuebraPercent : null,
    now,
    fornecedorId
  );

  return { success: true, id: fornecedorId, updatedAt: now };
}

module.exports = {
  minerarTextoLivre,
  extrairPrazos,
  extrairPedidoMinimo,
  extrairDistribuidoraELaboratorios,
  extrairNomeRepresentante,
  extrairLinhasDeOferta,
  validarOfertaComDigifarma,
  upsertFornecedorMeta,
  processarMensagemRecebida,
  processarMensagensEmLote,
  minerarHistoricoConversas,
  listarOportunidades,
  listarFornecedoresMinerados,
  obterCatalogoFornecedor,
  atualizarFornecedorMeta,
  DISTRIBUIDORAS_CONHECIDAS,
  LABORATORIOS_CONHECIDOS,
  CATEGORIAS_PADRAO
};
