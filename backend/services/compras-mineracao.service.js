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

function getDb(dbInstance) {
  if (dbInstance && typeof dbInstance.prepare === 'function') return dbInstance;
  try {
    return require('../database');
  } catch (e) {
    return null;
  }
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
 * Identifica o nome do representante seguindo hierarquia inteligente de 3 etapas:
 * 1. Nome falado na conversa (ex: "Aqui é o Carlos da Santa Cruz", "Sou a Juliana", "Att: Marcelo")
 * 2. Nome do perfil do WhatsApp (pushName / nome_contato)
 * 3. Fallback: "Representante {Distribuidora} (..{final telefone})"
 */
function extrairNomeRepresentante(texto, pushName = null, distribuidora = null, telefone = null) {
  if (texto) {
    const cleanText = texto.replace(/[*_~]/g, '');

    const padroes = [
      /(?:sou\s+(?:o|a)\s+|meu\s+nome\s+[ée]\s+|aqui\s+[ée]\s+(?:o|a)?\s+)([A-ZÀ-Úa-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)?)/i,
      /(?:representante|vendedor(?:a)?|consultor(?:a)?)(?:\s*[:,-]\s*|\s+)([A-ZÀ-Úa-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)?)/i,
      /(?:falar\s+com|atenciosamente|att:?|abraço(?:s)?|grato,?|obrigado,?)(?:\s*[:,-]\s*|\s+)([A-ZÀ-Úa-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)?)/i,
      /(?:fala|olá|ola|bom\s+dia|boa\s+tarde|boa\s+noite)[,\s]+(?:aqui\s+[ée]\s+(?:o|a)?\s+)?([A-ZÀ-Úa-zà-ú]+)\s+da\s+([A-ZÀ-Úa-zà-ú]+)/i,
      /(?:quem\s+fala\s+[ée]\s+)([A-ZÀ-Úa-zà-ú]+)/i
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
  }

  // 2. Etapa: PushName do WhatsApp
  if (pushName && typeof pushName === 'string') {
    const cleanPush = pushName.replace(/[^\w\sÀ-Úà-ú]/gi, '').trim();
    const parts = cleanPush.split(/\s+/).filter(p => !STOP_WORDS_NAME.includes(p.toLowerCase()));
    if (parts.length > 0) {
      const nomePush = parts.slice(0, 2).join(' ');
      if (nomePush.length >= 2) return nomePush;
    }
  }

  // 3. Etapa: Fallback estruturado
  if (distribuidora || telefone) {
    const dist = distribuidora && distribuidora !== 'Distribuidora Não Identificada' ? distribuidora : 'Comercial';
    const cleanPhone = telefone ? String(telefone).replace(/\D/g, '') : '';
    const finalDigits = cleanPhone.length >= 4 ? ` (..${cleanPhone.slice(-4)})` : '';
    return `Representante ${dist}${finalDigits}`;
  }

  return null;
}

/**
 * Verifica se uma string representa apenas embalagem, dosagem, unidade ou código, e NÃO um nome de produto/medicamento real.
 * Ex: 'C30', 'C/30', 'C 30', '30 CP', 'C2', '2 CPS', 'COMPRIMIDOS', 'GOTAS', etc.
 */
function isApenasEmbalagemOuQuantidade(str) {
  if (!str) return true;
  const s = str.trim().toUpperCase();
  if (s.length < 2) return true;

  // Padrões puros de embalagem / unidades (ex: C30, C/30, C 30, CX30, 30CP, C1, C2, C4, C100, 100CPS, 30DRG, etc.)
  if (/^(?:C\/?\s*\d+|CX\/?\s*\d+|\d+\s*(?:CP|CPS|CPR|COMP|CAPS|DRG|UN|FLAC|ENV|AMP|TB|G|MG|ML|L))\b/i.test(s)) {
    const rest = s.replace(/^(?:C\/?\s*\d+|CX\/?\s*\d+|\d+\s*(?:CP|CPS|CPR|COMP|CAPS|DRG|UN|FLAC|ENV|AMP|TB|G|MG|ML|L))\b/i, '').trim();
    if (rest.length === 0 || !/[A-Z]{3,}/.test(rest)) {
      return true;
    }
  }

  // Palavras isoladas de formas farmacêuticas ou embalagens
  const formasPuras = /^(?:COMPRIMIDOS?|C[AÁ]PSULAS?|GOTAS?|XAROPE|AMPOLAS?|FRASCOS?|POMADA|CREME|GEL|DISPLAY|ENVELOPE|SACH[EÊ]T?|CAIXA|UNIDADES?|BLISTER|CARTELA|GEN|GENERICO|SIMILAR|REF)$/i;
  if (formasPuras.test(s)) return true;

  // Se não contiver nenhuma palavra com >= 3 letras que represente produto real
  const words = s.replace(/[^A-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(w => 
      w.length >= 3 && 
      !/^(CPS|CPR|COMP|CAPS|DRG|FLAC|AMP|ENV|GEN|SIMILAR|REF|MG|ML|MCG|UN|CX|G|L)$/i.test(w) && 
      !/^\d+$/.test(w)
    );

  return words.length === 0;
}

/**
 * Identifica ofertas de produtos individuais em linhas de texto
 */
function extrairLinhasDeOferta(texto) {
  if (!texto) return [];
  const ofertas = [];
  const linhas = texto.split(/\r?\n/);
  let ultimoContextoProduto = null;

  for (const linha of linhas) {
    const trimmed = linha.trim();
    if (!trimmed || trimmed.length < 3) continue;

    // Ignora linhas que são de condições de pagamento ou pedido mínimo
    if (/pedido\s+m[íi]nimo|faturamento\s+m[íi]nimo|condi[çc][õo]es|prazos?|boletos?|frete/i.test(trimmed)) {
      continue;
    }

    // 1. Indicadores explícitos de preço (R$, por, cada, un)
    let matchedRegex = null;
    let priceMatch = null;
    
    const explicitRegex = /(?:R\$|por\s+|cada\s+|un\s*:\s*|un\s+)\s*([\d]{1,4}[,\.]\d{2})/i;
    let m = explicitRegex.exec(trimmed);
    if (m) {
      priceMatch = m;
      matchedRegex = explicitRegex;
    } else {
      // 2. Preço com traço separador (ex: LISMED - 16,50)
      const dashRegex = /(?:-|\u2013|\u2014)\s*([\d]{1,4}[,\.]\d{2})(?!\s*(?:ml|mg|g|mcg|%))/i;
      m = dashRegex.exec(trimmed);
      if (m) {
        priceMatch = m;
        matchedRegex = dashRegex;
      } else {
        // 3. Preço no final da linha (ignorando parênteses no final)
        const endRegex = /(?:^|\s)([\d]{1,4}[,\.]\d{2})(?:\s*(?:reais|un|cx|fr|pct))?(?:\s*\(.*)?\s*$/i;
        m = endRegex.exec(trimmed);
        if (m) {
          const val = parsePriceValue(m[1]);
          // Se não tem indicador claro e o valor for muito baixo (<= 0.50), provavelmente é uma concentração (ex: Biolagrima 0,15)
          if (val > 0.50) {
            priceMatch = m;
            matchedRegex = endRegex;
          }
        }
      }
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
        .replace(/(?:(?:por\s+)|(?:cada\s+)|(?:un\s*:\s*)|(?:un\s+))/gi, ' ')
        .replace(/\b(789\d{10}|\d{13})\b/g, '')
        .replace(/(?:compre\s*\d+\s*(?:ganhe|leve)\s*\d+|\d+\s*\+\s*\d+|leve\s*\d+\s*pague\s*\d+|pague\s*\d+\s*leve\s*\d+)/gi, '')
        .replace(/\d{1,2}(?:[\.,]\d+)?\s*%\s*(?:de\s*desc(?:onto)?|off)/gi, '')
        .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s\-*•~>:;\d.)(_#]+/gu, '')
        .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\s\-*•~>:;.)(_#]+$/gu, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Se a linha for apenas embalagem/unidade (ex: "C30", "C/30", "C2"):
      if (isApenasEmbalagemOuQuantidade(nomeProduto)) {
        if (ultimoContextoProduto) {
          // Herda o medicamento pai da linha anterior (ex: "LOSARTANA 50MG" + "C30" => "LOSARTANA 50MG C/ 30")
          nomeProduto = `${ultimoContextoProduto} ${nomeProduto}`;
        } else {
          // Descarta completamente! "C30" ou "C/30" sozinho NÃO é um produto ou medicamento!
          continue;
        }
      } else {
        // Se a linha tem um nome de produto completo com 2+ palavras, guarda como contexto
        const palavrasProd = nomeProduto.split(/\s+/).filter(p => p.length >= 3);
        if (palavrasProd.length >= 2) {
          ultimoContextoProduto = nomeProduto;
        }
      }

      if (nomeProduto.length >= 4 && !isApenasEmbalagemOuQuantidade(nomeProduto) && !/^(total|pedido|faturamento|fechamento|subtotal|m[íi]nimo|frete|prazo|tabela|condi[çc][ãa]o|bom dia|boa tarde|ol[áa]|aten[çc][ãa]o)/i.test(nomeProduto)) {
        ofertas.push({
          produtoNome: nomeProduto,
          ean,
          precoBruto: Number(precoBruto.toFixed(2)),
          precoOfertado: Number(precoLiquido.toFixed(2)),
          bonificacao,
          linhaRaw: trimmed
        });
      }
    } else {
      // Linha sem preço: pode ser o título de um medicamento pai! (Ex: "LOSARTANA 50MG" ou "FLUCONAZOL 150MG")
      const possivelTitulo = trimmed
        .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s\-*•~>:;\d.)(_#]+/gu, '')
        .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\s\-*•~>:;.)(_#]+$/gu, '')
        .trim();
      if (possivelTitulo.length >= 4 && !isApenasEmbalagemOuQuantidade(possivelTitulo) && !/^(total|pedido|faturamento|fechamento|condi[çc]|prazo|boleto|bom dia|boa tarde|ol[áa]|aten[çc]|ofertas?|tabela|destaques?)/i.test(possivelTitulo)) {
        ultimoContextoProduto = possivelTitulo;
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
  const representanteNome = extrairNomeRepresentante(
    norm,
    remetenteInfo.pushName || remetenteInfo.nome || remetenteInfo.nome_contato,
    distribuidora || remetenteInfo.distribuidora,
    remetenteInfo.telefone || remetenteInfo.phone
  );
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

let aiQuotaExceededUntil = 0;

/**
 * Usa IA (OpenAI/Gemini) para interpretar e extrair as ofertas do texto com Circuit Breaker.
 */
async function minerarTextoLivreIA(texto, remetenteInfo = {}) {
  // Se a IA estiver temporariamente desativada por cota esgotada ou offline
  if (Date.now() < aiQuotaExceededUntil || !callAI) {
    return minerarTextoLivre(texto, remetenteInfo);
  }

  const systemPrompt = `Você é um assistente de extração de dados farmacêuticos.
Sua missão é ler a mensagem enviada por um fornecedor/representante comercial e extrair estritamente as ofertas em formato JSON.

REGRAS:
1. Produto: Extraia o nome do produto. Se o produto tiver concentração (ex: "Biolagrima 0,15", "Losartana 50mg"), MANTENHA a concentração no nome. NÃO confunda concentração com preço.
2. Preço: Extraia APENAS o preço ofertado. O preço deve ser um número decimal (float, com ponto). Ignore preços sem sentido ou produtos sem preço.
3. Não inclua moedas (R$) ou indicadores (por, cada) no nome do produto ou no preço.
4. Distribuidora/Representante/Prazos/Pedido Mínimo: Extraia se for informado no texto.

RETORNE EXATAMENTE UM JSON E NADA MAIS. FORMATO ESPERADO:
{
  "distribuidora": "nome ou null",
  "representante": "nome ou null",
  "prazosPagamento": ["prazo1", "prazo2"],
  "pedidoMinimoValor": 0.0,
  "ofertas": [
    {
      "produtoNome": "Nome limpo com concentração (mas sem preço no nome)",
      "ean": "código de barras numérico se houver ou null",
      "precoOfertado": 16.50,
      "bonificacao": "descrição da bonificação ou desconto, ou null"
    }
  ]
}`;

  // Trava de 8s para não prender a requisição HTTP
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AI_TIMEOUT_EXCEEDED')), 8000)
  );

  try {
    const respostaIA = await Promise.race([
      callAI(texto, systemPrompt, { temperature: 0.1 }),
      timeoutPromise
    ]);

    const jsonStr = (respostaIA || '').replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const dadosIA = JSON.parse(jsonStr);

    return {
      representante: dadosIA.representante || remetenteInfo.pushName || null,
      distribuidora: dadosIA.distribuidora || remetenteInfo.distribuidora || null,
      telefone: remetenteInfo.telefone || remetenteInfo.phone || null,
      prazosPagamento: Array.isArray(dadosIA.prazosPagamento) ? dadosIA.prazosPagamento : [],
      pedidoMinimoValor: parseFloat(dadosIA.pedidoMinimoValor) || 0,
      pedidoMinimoCondicoes: '',
      categorias: [],
      catalogoProdutos: (dadosIA.ofertas || []).map(o => o.produtoNome),
      ofertas: (dadosIA.ofertas || []).map(o => ({
        produtoNome: o.produtoNome,
        ean: o.ean || null,
        precoOfertado: parseFloat(o.precoOfertado) || 0,
        bonificacao: o.bonificacao || null
      })).filter(o => o.precoOfertado > 0)
    };
  } catch (err) {
    const errStr = (err.message || '').toLowerCase();
    if (
      errStr.includes('429') ||
      errStr.includes('credit') ||
      errStr.includes('exhausted') ||
      errStr.includes('quota') ||
      errStr.includes('billing') ||
      errStr.includes('timeout') ||
      errStr.includes('404')
    ) {
      console.warn(`[Compras-Mineração] ⚠️ Quota ou falha na IA (${err.message}). Ativando modo nativo/regex por 15 minutos.`);
      aiQuotaExceededUntil = Date.now() + 15 * 60 * 1000;
    }
    return minerarTextoLivre(texto, remetenteInfo);
  }
}

let equivService = null;
try {
  equivService = require('./compras-equivalentes.service');
} catch (e) {}

// ──────────────────────────────────────────────────────────
// Validação e Comparação de Ofertas com o Digifarma Firebird / Cache Local
// ──────────────────────────────────────────────────────────

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

const LABS_CONHECIDOS_BUSCA = [
  'MEDQUIMICA', 'MEDQUIMIC', 'LEGRAND', 'EMS', 'CIMED', 'NEO QUIMICA', 'MEDLEY', 'EUROFARMA',
  'TEUTO', 'GERMED', 'PRATI', 'ACHE', 'SANDOZ', 'BIOLAB', 'NOVA QUIMICA', 'GEOLAB',
  'SANVAL', 'BELFAR', 'PHARLAB', 'LISMED', 'BIOSINTETICA', 'HYPERA', 'GLAXO',
  'ASTRAZENECA', 'SANOFI', 'NOVARTIS', 'BAYER', 'TAKEDA', 'ABBOTT', 'APSEN',
  'CRISTALIA', 'MANTECORP', 'VITAMEDIC', 'VITAPAN', 'GLOBO', 'ONE'
];

function detectarLabBusca(ean, texto) {
  const d = (texto || '').toUpperCase();
  if (ean) {
    for (const [pfx, lab] of Object.entries(EAN_PREFIX_LABS)) {
      if (ean.startsWith(pfx)) return lab;
    }
  }
  for (const lab of LABS_CONHECIDOS_BUSCA) {
    if (d.includes(lab)) {
      if (lab === 'MEDQUIMIC') return 'MEDQUIMICA';
      return lab;
    }
  }
  return null;
}

function extrairTermosBuscaProduto(nome) {
  if (!nome || typeof nome !== 'string') return { palavras: [], lab: null, dosagemNum: null, unidades: 1 };
  let norm = nome.toUpperCase();
  
  const labEncontrado = detectarLabBusca(null, norm);

  // Normaliza espaços entre números e unidades (ex: 150MG -> 150 MG, C/2CP -> C/ 2 CP, C2 -> C/ 2 CP)
  norm = norm.replace(/(\d+)\s*(MG|G|MCG|ML|L)\b/gi, ' $1 $2 ')
             .replace(/(?:C\/|CX\/)\s*(\d+)/gi, ' C/ $1 ')
             .replace(/\bC(\d+)\b/gi, ' C/ $1 ')
             .replace(/\b(\d+)\s*(?:CP|CPS|CPR|COMP|CAPS)\b/gi, ' C/ $1 CPS ');

  // Extrai unidades na embalagem (ex: C/ 2 CPS, 9X10 CPS = 90)
  let unidades = 1;
  const multMatch = /(\d+)\s*[Xx]\s*(\d+)/.exec(norm);
  if (multMatch) {
    unidades = parseInt(multMatch[1], 10) * parseInt(multMatch[2], 10);
  } else {
    const unMatch = /(?:C\/|CX\/|COM|\/|\bC)\s*(\d+)\s*(?:CPS|CP|CPR|COMP|CAPS|FLAC|AMP|ENV|SACH|TB)?\b/i.exec(norm) ||
                    /\b(\d+)\s*(?:CPS|CPR|COMP|CAPS|FLAC|AMP|ENV)\b/i.exec(norm);
    if (unMatch) {
      unidades = parseInt(unMatch[1], 10);
    }
  }

  const doseMatch = /(\d+(?:[,\.]\d+)?)\s*(MG|G|MCG|ML|L)\b/i.exec(norm);
  const dosagemNum = doseMatch ? doseMatch[1].replace(',', '.') : null;

  const stopwords = new Set([
    'DE', 'DA', 'DO', 'DOS', 'DAS', 'COM', 'PARA', 'POR', 'C', 'MG', 'CPR', 'CAPS', 'CPS', 'COMP',
    'DRG', 'G', 'ML', 'L', 'GEN', 'GENERICO', 'GENÉRICO', 'SIMILAR', 'REF', 'REFERENCIA',
    'CX', 'FR', 'BL', 'UN', 'LOTES', ...LABS_CONHECIDOS_BUSCA
  ]);
  const palavras = norm.replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopwords.has(w) && !/^\d+$/.test(w));

  return { palavras, lab: labEncontrado, dosagemNum, unidades };
}

function pontuarCorrespondencia(candidatoOuDescricao, palavrasOuTermos, maybeLab, maybeDosagemNum) {
  let desc = '';
  let ean = null;
  if (typeof candidatoOuDescricao === 'object' && candidatoOuDescricao !== null) {
    desc = (candidatoOuDescricao.descricao || candidatoOuDescricao.PRODUTO || '').toUpperCase();
    ean = candidatoOuDescricao.ean || candidatoOuDescricao.COD_BARRAS || null;
  } else {
    desc = (candidatoOuDescricao || '').toUpperCase();
  }

  let termos = {};
  if (palavrasOuTermos && typeof palavrasOuTermos === 'object' && !Array.isArray(palavrasOuTermos)) {
    termos = palavrasOuTermos;
  } else {
    termos = {
      palavras: Array.isArray(palavrasOuTermos) ? palavrasOuTermos : [],
      lab: maybeLab,
      dosagemNum: maybeDosagemNum,
      unidades: 1
    };
  }

  let score = 0;

  // Unidades da embalagem do produto candidato
  let unCandidato = 1;
  const multMatch = /(\d+)\s*[Xx]\s*(\d+)/.exec(desc);
  if (multMatch) {
    unCandidato = parseInt(multMatch[1], 10) * parseInt(multMatch[2], 10);
  } else {
    const unMatch = /(?:C\/|CX\/|COM|\/|\bC)\s*(\d+)\s*(?:CPS|CP|CPR|COMP|CAPS|FLAC|AMP|ENV|SACH|TB)?\b/i.exec(desc) ||
                    /\b(\d+)\s*(?:CPS|CPR|COMP|CAPS|FLAC|AMP|ENV)\b/i.exec(desc);
    if (unMatch) {
      unCandidato = parseInt(unMatch[1], 10);
    }
  }

  // DESCARTE DE EMBALAGEM INCOMPATÍVEL:
  // Se a oferta é para 1 ou 2 comprimidos e o candidato é caixa hospitalar/fracionada (>= 20 un),
  // ou vice-versa, descarta imediatamente com score fortemente negativo para nunca gerar falso desconto.
  if (termos.unidades && termos.unidades <= 4 && unCandidato >= 20) return -999;
  if (termos.unidades && termos.unidades >= 20 && unCandidato <= 4) return -999;

  // Bônus de unidade de embalagem exata vs penalidade se diferente
  if (termos.unidades && termos.unidades === unCandidato) {
    score += 60;
  } else if (termos.unidades && unCandidato && termos.unidades !== unCandidato) {
    score -= 30;
  }

  const palavras = termos.palavras || [];
  if (palavras.length > 0 && desc.includes(palavras[0])) {
    score += 30;
  }

  for (let i = 1; i < palavras.length; i++) {
    if (desc.includes(palavras[i])) {
      score += 15;
    }
  }

  // Dosagem exata (ex: 150 MG)
  if (termos.dosagemNum) {
    const doseRegex = new RegExp('\\b' + termos.dosagemNum + '\\s*(?:MG|G|ML|L)?\\b');
    if (doseRegex.test(desc)) {
      score += 40;
    }
  }

  // Laboratório
  const candLab = detectarLabBusca(ean, desc);
  if (termos.lab && candLab) {
    if (termos.lab === candLab) {
      score += 70; // Bônus alto para laboratório exato
    } else {
      score -= 10;
    }
  }

  return score;
}

/**
 * Valida o preço de uma oferta contra o histórico do Digifarma.
 * Se Firebird estiver disponível, consulta a tabela de produtos e últimas compras.
 * Caso contrário, utiliza o cache local `compras_estoque_cache` e `digifarma_products_cache`.
 */
async function validarOfertaComDigifarma(produtoNome, ean, precoOfertado, db, options = {}) {
  if (isApenasEmbalagemOuQuantidade(produtoNome)) {
    return {
      produtoId: null,
      descricaoDigifarma: null,
      precoUltCompra: null,
      precoOfertado,
      percentualDesconto: 0,
      percentualEconomia: 0,
      precoInferior: false,
      vantajosa: false,
      estoqueAtual: 0,
      estMinimo: 0,
      emRuptura: false,
      grupoEquivalente: null,
      invalido: true,
      motivoDescarte: 'Nome inválido ou apenas embalagem (ex: C30)'
    };
  }

  let precoUltCompra = null;
  let ultimoFornecedor = null;
  let dataUltCompra = null;
  let notaFiscalUltCompra = null;
  let produtoId = null;
  let descricaoEncontrada = produtoNome;
  let estoqueAtual = 0;
  let estMinimo = 0;
  let emRuptura = false;
  let grupoEquivalente = null;

  const useFirebird = queryDigifarma && !options.skipFirebird;
  const termos = extrairTermosBuscaProduto(produtoNome);
  const termoPrincipal = termos.palavras.length > 0 ? termos.palavras[0] : null;

  // 1. Tenta buscar no Firebird se conectado
  if (useFirebird) {
    try {
      let rows = [];
      if (ean) {
        rows = await queryDigifarma(`
          SELECT FIRST 1 PRODUTO_ID, PRODUTO, PROD_SALDO, PROD_ESTMINIMO, PROD_PRCOMPRA, VALOR_ULT_COMPRA, COD_BARRAS
          FROM PRODUTOS
          WHERE COD_BARRAS = ?
        `, [ean], 2000);
      }
      
      if ((!rows || rows.length === 0) && termoPrincipal) {
        rows = await queryDigifarma(`
          SELECT FIRST 30 PRODUTO_ID, PRODUTO, PROD_SALDO, PROD_ESTMINIMO, PROD_PRCOMPRA, VALOR_ULT_COMPRA, COD_BARRAS
          FROM PRODUTOS
          WHERE PRODUTO CONTAINING ? AND PROD_ATIVO = 'S'
        `, [termoPrincipal], 2500);
      }

      if (rows && rows.length > 0) {
        let melhorItem = null;
        let melhorScore = -1;

        for (const p of rows) {
          const score = pontuarCorrespondencia({ descricao: p.PRODUTO, ean: p.COD_BARRAS }, termos);
          if (score > melhorScore) {
            melhorScore = score;
            melhorItem = p;
          }
        }

        if (melhorItem) {
          produtoId = melhorItem.PRODUTO_ID;
          descricaoEncontrada = melhorItem.PRODUTO;
          estoqueAtual = parseFloat(melhorItem.PROD_SALDO) || 0;
          estMinimo = parseFloat(melhorItem.PROD_ESTMINIMO) || 0;
          emRuptura = estoqueAtual <= 0 || (estMinimo > 0 && estoqueAtual < estMinimo);

          // Princípio da Lista de Faltas (Prioridade 1):
          // Consulta as notas fiscais de entrada (ITEM_NOTAS + CAB_NOTAS + FORNECEDORES)
          let precoNota = null;
          try {
            const notaRows = await queryDigifarma(`
              SELECT FIRST 1
                I.ITEM_NOTAS_PRCOMPRA as PRECO_COMPRA,
                C.DATA_EMISSAO as DATA_COMPRA,
                F.FORNECEDOR as FORNECEDOR,
                C.NOTA_FISCAL as NOTA_FISCAL
              FROM ITEM_NOTAS I
              JOIN CAB_NOTAS C ON I.CAB_NOTA_ID = C.CAB_NOTA_ID
              LEFT JOIN FORNECEDORES F ON C.FORNECEDOR_ID = F.FORNECEDOR_ID
              WHERE I.PRODUTO_ID = ? AND C.ENTRADA_SAIDA = 'E' AND C.CANCELAMENTO = 'N'
              ORDER BY C.DATA_EMISSAO DESC
            `, [produtoId], 2000);

            if (notaRows && notaRows.length > 0) {
              precoNota = parseFloat(notaRows[0].PRECO_COMPRA) || null;
              ultimoFornecedor = notaRows[0].FORNECEDOR ? String(notaRows[0].FORNECEDOR).trim() : null;
              dataUltCompra = notaRows[0].DATA_COMPRA ? new Date(notaRows[0].DATA_COMPRA).toISOString() : null;
              notaFiscalUltCompra = notaRows[0].NOTA_FISCAL ? String(notaRows[0].NOTA_FISCAL).trim() : null;
            }
          } catch (eNota) {}

          // Prioridade 2: Cadastro do Produto (VALOR_ULT_COMPRA compatível ou precoNota / PROD_PRCOMPRA)
          const pUlt = parseFloat(melhorItem.VALOR_ULT_COMPRA) || 0;
          const pCusto = parseFloat(melhorItem.PROD_PRCOMPRA) || 0;
          const isHospitalarIncompativel = (pUlt > 50 && termos.unidades <= 4 && (pCusto < 20 || (precoNota && precoNota < 20)));

          if (pUlt > 0 && !isHospitalarIncompativel) {
            precoUltCompra = pUlt;
          } else if (precoNota && precoNota > 0) {
            precoUltCompra = precoNota;
          } else if (pCusto > 0) {
            precoUltCompra = pCusto;
          }
        }
      }
    } catch (err) {
      // Fallback silencioso para cache local SQLite
    }
  }

  // 2. Fallback para cache local no SQLite
  if (precoUltCompra === null && db) {
    try {
      let melhorCache = null;
      let melhorScore = -1;

      // 2.1 Busca por EAN exato
      if (ean) {
        melhorCache = db.prepare('SELECT * FROM compras_estoque_cache WHERE ean = ? LIMIT 1').get(ean);
        if (!melhorCache) {
          melhorCache = db.prepare('SELECT * FROM digifarma_products_cache WHERE codigo_barras = ? LIMIT 1').get(ean);
        }
      }

      // 2.2 Busca ranqueada por Nome / Dosagem / Laboratório / Embalagem
      if (!melhorCache && termoPrincipal) {
        // Busca candidatos no cache de estoque
        try {
          const estoqueCandidates = db.prepare('SELECT * FROM compras_estoque_cache WHERE descricao LIKE ? LIMIT 40').all('%' + termoPrincipal + '%');
          for (const item of estoqueCandidates) {
            const score = pontuarCorrespondencia(item, termos);
            if (score > melhorScore) {
              melhorScore = score;
              melhorCache = {
                produto_id: item.produto_id,
                descricao: item.descricao,
                ean: item.ean,
                saldo: item.saldo,
                est_minimo: item.est_minimo_calculado || item.est_minimo_digifarma,
                ultima_compra_valor: item.ultima_compra_valor,
                custo_unitario: item.custo_unitario,
                preco: item.ultima_compra_valor || item.custo_unitario
              };
            }
          }
        } catch (e) {}

        // Busca candidatos no cache de produtos geral
        try {
          const prodCandidates = db.prepare('SELECT * FROM digifarma_products_cache WHERE descricao LIKE ? LIMIT 40').all('%' + termoPrincipal + '%');
          for (const item of prodCandidates) {
            const score = pontuarCorrespondencia({ descricao: item.descricao, ean: item.codigo_barras }, termos);
            if (score > melhorScore) {
              melhorScore = score;
              melhorCache = {
                produto_id: item.produto_id,
                descricao: item.descricao,
                ean: item.codigo_barras,
                saldo: item.estoque_atual || 0,
                est_minimo: 0,
                ultima_compra_valor: null,
                custo_unitario: item.preco_custo,
                preco: item.preco_custo
              };
            }
          }
        } catch (e) {}
      }

      if (melhorCache) {
        produtoId = melhorCache.produto_id;
        descricaoEncontrada = melhorCache.descricao;
        estoqueAtual = melhorCache.saldo || 0;
        estMinimo = melhorCache.est_minimo || 0;
        emRuptura = estoqueAtual <= 0 || (estMinimo > 0 && estoqueAtual < estMinimo);

        // Prioridade 1 no Cache: Verifica se há nota salva no histórico da Lista de Faltas (shortages.history)
        let precoNotaCache = null;
        try {
          const shortageItem = db.prepare(`
            SELECT history, valorUltimaCompra
            FROM shortages
            WHERE productName = ? OR productName LIKE ?
            ORDER BY id DESC LIMIT 1
          `).get(descricaoEncontrada, '%' + termoPrincipal + '%');

          if (shortageItem && shortageItem.history) {
            const hArr = JSON.parse(shortageItem.history);
            if (Array.isArray(hArr) && hArr.length > 0) {
              const latestH = hArr[0];
              if (latestH.precoCompra && Number(latestH.precoCompra) > 0) {
                precoNotaCache = parseFloat(latestH.precoCompra);
                ultimoFornecedor = latestH.fornecedor || null;
                dataUltCompra = latestH.dataCompra || null;
                notaFiscalUltCompra = latestH.notaFiscal ? String(latestH.notaFiscal) : null;
              }
            }
          }
        } catch (eHist) {}

        // Prioridade 2 no Cache: VALOR_ULT_COMPRA compatível ou precoNota / custo_unitario
        const pUltCache = parseFloat(melhorCache.ultima_compra_valor) || 0;
        const pCustCache = parseFloat(melhorCache.custo_unitario || melhorCache.preco_custo) || 0;
        const isHospCache = (pUltCache > 50 && termos.unidades <= 4 && (pCustCache < 20 || (precoNotaCache && precoNotaCache < 20)));

        if (pUltCache > 0 && !isHospCache) {
          precoUltCompra = pUltCache;
        } else if (precoNotaCache && precoNotaCache > 0) {
          precoUltCompra = precoNotaCache;
        } else if (pCustCache > 0) {
          precoUltCompra = pCustCache;
        } else {
          precoUltCompra = parseFloat(melhorCache.preco) || null;
        }
      }
    } catch (e) {
      // Ignora erro de cache
    }
  }

  // 3. Integração com Produtos Equivalentes (Consolidação de Estoque e Preço de Referência)
  if (equivService && db) {
    try {
      const gEquiv = equivService.buscarGrupoPorProduto(produtoId, ean, produtoNome, db);
      if (gEquiv) {
        grupoEquivalente = gEquiv;
        estoqueAtual = gEquiv.saldoTotal;
        estMinimo = gEquiv.estMinimoTotal;
        emRuptura = gEquiv.emRuptura;
        // Se o produto específico nunca foi comprado, usa o menor preço histórico dos equivalentes
        if (!precoUltCompra || precoUltCompra <= 0) {
          precoUltCompra = gEquiv.menorUltimaCompra || gEquiv.mediaUltimaCompra || null;
          if (!ultimoFornecedor) {
            ultimoFornecedor = `Ref. Equivalente (${gEquiv.nomeGrupo})`;
          }
        }
      }
    } catch (e) {}
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
    ultimoFornecedor,
    dataUltCompra,
    notaFiscalUltCompra,
    precoOfertado: Number(precoOfertado.toFixed(2)),
    percentualDesconto: Number(percentualDesconto.toFixed(2)),
    percentualEconomia: Number(percentualDesconto.toFixed(2)),
    precoInferior,
    vantajosa: precoInferior,
    estoqueAtual,
    estMinimo,
    emRuptura,
    grupoEquivalente
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

  const distribuidoraFinal = dados.distribuidora || existing?.distribuidora || 'Distribuidora Comercial';
  let representanteFinal = dados.representante || existing?.representante || null;
  if (!representanteFinal) {
    representanteFinal = extrairNomeRepresentante(null, dados.pushName || dados.nome, distribuidoraFinal, cleanPhone);
  }
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
 * Extrai fornecedores, prazos, produtos e ofertas, validando contra o Digifarma.
 * 
 * @param {object} msgData { id, text, phone, pushName, timestamp }
 * @param {object} db Instância SQLite
 * @param {object} [options]
 * @returns {Promise<{ minerado: boolean, fornecedor: object|null, ofertas: object[] }>}
 */
async function processarMensagemRecebida(msgData, db, options = {}) {
  const dbInst = getDb(db);
  if (!dbInst || !msgData || !msgData.text) return { minerado: false, ofertas: [] };

  const extracao = await minerarTextoLivreIA(msgData.text, {
    telefone: msgData.phone,
    nome: msgData.pushName || msgData.nome,
    pushName: msgData.pushName
  });

  let fornecedorSalvo = null;
  if (extracao.telefone && (extracao.distribuidora || extracao.representante || extracao.prazosPagamento.length > 0 || extracao.pedidoMinimoValor > 0)) {
    fornecedorSalvo = upsertFornecedorMeta(dbInst, extracao);
  }

  const ofertasProcessadas = [];
  const now = new Date().toISOString();

  if (msgData.id) {
    try {
      dbInst.prepare('DELETE FROM compras_oportunidades_mineradas WHERE mensagem_id = ?').run(msgData.id);
    } catch (e) {}
  }

  for (const ofr of extracao.ofertas) {
    if (isApenasEmbalagemOuQuantidade(ofr.produtoNome)) {
      continue;
    }
    const validacao = await validarOfertaComDigifarma(ofr.produtoNome, ofr.ean, ofr.precoOfertado, dbInst, options);
    if (validacao.invalido) {
      continue;
    }

    const ofertaId = crypto.randomUUID();
    let statusOferta = 'Aprovado_Radar';
    if (validacao.precoUltCompra && validacao.precoUltCompra > 0) {
      statusOferta = validacao.precoInferior ? 'Aprovado_Radar' : 'Descartado_Preco';
    } else {
      statusOferta = 'Oportunidade_Sem_Historico';
    }

    try {
      dbInst.prepare(`
        INSERT INTO compras_oportunidades_mineradas (
          id, fornecedor_id, distribuidora, representante, telefone,
          mensagem_id, mensagem_raw, produto_nome, ean,
          preco_ofertado, preco_ult_compra_digifarma, percentual_desconto,
          condicoes_pagamento, status, data_oferta, created_at,
          ultimo_fornecedor, data_ult_compra, nota_fiscal_ult_compra
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ofertaId,
        fornecedorSalvo ? fornecedorSalvo.id : null,
        fornecedorSalvo ? fornecedorSalvo.distribuidora : (extracao.distribuidora || 'Distribuidora Não Identificada'),
        fornecedorSalvo ? fornecedorSalvo.representante : extracao.representante,
        msgData.phone || extracao.telefone,
        msgData.id || null,
        msgData.text,
        ofr.produtoNome,
        validacao.ean || ofr.ean || null,
        ofr.precoOfertado,
        validacao.precoUltCompra || null,
        validacao.percentualDesconto || 0,
        extracao.prazosPagamento.length > 0 ? extracao.prazosPagamento.join('/') : 'À vista',
        statusOferta,
        now,
        now,
        validacao.ultimoFornecedor || null,
        validacao.dataUltCompra || null,
        validacao.notaFiscalUltCompra || null
      );

      ofertasProcessadas.push({
        id: ofertaId,
        produtoNome: ofr.produtoNome,
        precoOfertado: ofr.precoOfertado,
        precoUltimaCompra: validacao.precoUltCompra,
        percentualEconomia: validacao.percentualEconomia,
        vantajosa: validacao.vantajosa,
        ultimoFornecedor: validacao.ultimoFornecedor,
        dataUltCompra: validacao.dataUltCompra,
        notaFiscalUltCompra: validacao.notaFiscalUltCompra,
        status: statusOferta
      });
    } catch (dbErr) {
      console.warn('[Compras-Mineração] Aviso ao gravar oportunidade:', dbErr.message);
    }
  }

  if (msgData.id) {
    try {
      dbInst.prepare(`
        UPDATE compras_historico_mensagens
        SET processado_mineracao = 1,
            resultado_mineracao_json = ?
        WHERE message_id = ?
      `).run(JSON.stringify({ fornecedor: fornecedorSalvo, ofertas: ofertasProcessadas }), msgData.id);
    } catch (e) {}
  }

  return {
    minerado: Boolean(fornecedorSalvo || ofertasProcessadas.length > 0),
    fornecedor: fornecedorSalvo,
    ofertas: ofertasProcessadas
  };
}

/**
 * Processa um lote de mensagens em background.
 */
async function processarMensagensEmLote(messagesList, db, options = {}) {
  const dbInst = getDb(db);
  if (!dbInst || !Array.isArray(messagesList) || messagesList.length === 0) {
    return { processadas: 0, ofertasDetectadas: 0, fornecedoresAtualizados: 0 };
  }

  let processadas = 0;
  let ofertasDetectadas = 0;
  let fornecedoresAtualizados = 0;

  for (const m of messagesList) {
    let textContent = null;
    let phone = null;
    let pushName = null;
    let msgId = null;

    if (m.text || m.messageText) {
      textContent = m.text || m.messageText;
      phone = m.phone || m.telefone;
      pushName = m.pushName || m.nome_contato;
      msgId = m.id || m.message_id;
    } else if (m.message) {
      let c = m.message;
      if (c.viewOnceMessage?.message) c = c.viewOnceMessage.message;
      else if (c.documentWithCaptionMessage?.message) c = c.documentWithCaptionMessage.message;
      
      textContent = c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption || null;
      phone = m.key?.remoteJid ? m.key.remoteJid.split('@')[0] : null;
      pushName = m.pushName || null;
      msgId = m.key?.id;
    }

    if (textContent && phone) {
      try {
        const res = await processarMensagemRecebida({
          id: msgId,
          text: textContent,
          phone,
          pushName,
          timestamp: m.timestamp || Date.now()
        }, dbInst, options);

        processadas++;
        if (res.fornecedor) fornecedoresAtualizados++;
        ofertasDetectadas += (res.ofertas?.length || 0);
      } catch (err) {
        console.warn('[Compras-Mineração] Erro ao processar mensagem do lote:', err.message);
      }
    }
  }

  return {
    processadas,
    ofertasDetectadas,
    fornecedoresAtualizados
  };
}

/**
 * Varre o histórico de mensagens armazenado no SQLite e extrai todas as informações.
 */
async function minerarHistoricoConversas(db, options = {}) {
  const dbInst = getDb(db);
  if (!dbInst) throw new Error('Instância do banco de dados SQLite não informada.');

  const limit = options.limit || 500;
  const query = options.apenasNaoProcessadas
    ? `SELECT * FROM compras_historico_mensagens WHERE processado_mineracao = 0 AND from_me = 0 ORDER BY timestamp DESC LIMIT ?`
    : `SELECT * FROM compras_historico_mensagens WHERE from_me = 0 ORDER BY timestamp DESC LIMIT ?`;

  const rows = dbInst.prepare(query).all(limit);
  console.log(`[Compras-Mineração] 🔍 Iniciando varredura histórica de ${rows.length} mensagens...`);

  let condicoesCount = 0;
  let ofertasCount = 0;

  for (const r of rows) {
    const res = await processarMensagemRecebida({
      id: r.message_id,
      text: r.texto_mensagem,
      phone: r.telefone,
      pushName: r.nome_contato,
      timestamp: r.timestamp
    }, dbInst, options);

    if (res.fornecedor && (res.fornecedor.prazosPagamento.length > 0 || res.fornecedor.pedidoMinimoValor > 0)) {
      condicoesCount++;
    }
    ofertasCount += (res.ofertas?.length || 0);
  }

  const totalFornecedores = dbInst.prepare('SELECT COUNT(*) as total FROM compras_fornecedores_meta').get().total;
  const totalOfertas = dbInst.prepare("SELECT COUNT(*) as total FROM compras_oportunidades_mineradas WHERE status = 'Disponivel'").get().total;

  return {
    representantesCadastrados: totalFornecedores,
    ofertasIndexadas: totalOfertas,
    condicoesMapeadas: condicoesCount,
    totalMensagensProcessadas: rows.length
  };
}

/**
 * Avalia se uma mensagem possui características de cotação/tabela de fornecedor.
 * Descarta mensagens curtas de conversa informal de clientes para poupar processamento.
 */
function isMensagemCandidataOferta(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  if (clean.length < 12) return false;

  // Descarta mensagens comuns de clientes em atendimento
  if (/^(ol[aá]|oi|bom dia|boa tarde|boa noite|obrigad[ao]|sim|n[aã]o|ok|blz|valeu|chave pix|pix|endere[çc]o)\b/i.test(clean) && clean.length < 40) {
    return false;
  }

  // Deve ter dígitos ou termos comerciais
  const hasNumeros = /\d/.test(clean);
  const hasKeywords = /oferta|promo|tabela|desc|boleto|fatur|pedido|comercial|distrib|lab|un|cx|pct|bonif|pre[çc]o|r\$|cota[çc]/i.test(clean);

  return hasNumeros || hasKeywords;
}

/**
 * Executa a varredura retroativa completa dos últimos 90 dias nas mensagens gravadas no SQLite
 * e no histórico de compras, identificando representantes, prazos e ofertas.
 */
async function executarVarreduraRetroativa90Dias(dbOrOptions = {}, talvezOptions = {}) {
  let db, options;
  if (dbOrOptions && typeof dbOrOptions.prepare === 'function') {
    db = dbOrOptions;
    options = talvezOptions || {};
  } else {
    db = getDb();
    options = (typeof dbOrOptions === 'object' && dbOrOptions !== null) ? dbOrOptions : (talvezOptions || {});
  }

  if (!db) throw new Error('Instância do SQLite não disponível.');

  const inicioMs = Date.now();
  const dias = options.dias || (options.diasVarredura || 90);
  const retroativoMs = Date.now() - (dias * 24 * 60 * 60 * 1000);
  const retroativoSec = Math.floor(retroativoMs / 1000);

  console.log(`[Compras-Mineração] 🔍 Iniciando Varredura Automática/Retroativa de ${dias} dias...`);

  // 1. Mensagens da tabela compras_historico_mensagens
  let mensagensHistorico = [];
  try {
    mensagensHistorico = db.prepare(`
      SELECT message_id as id, telefone as phone, texto_mensagem as text, timestamp, nome_contato as pushName
      FROM compras_historico_mensagens
      WHERE (timestamp >= ? OR timestamp >= ?) AND from_me = 0
      ORDER BY timestamp DESC
      LIMIT 100
    `).all(retroativoMs, retroativoSec);
  } catch (e) {}

  // 2. Mensagens da tabela whatsapp_messages (Baileys geral / Evolution)
  let mensagensWhatsapp = [];
  try {
    mensagensWhatsapp = db.prepare(`
      SELECT id, phone, messageText as text, timestamp, rawMessage
      FROM whatsapp_messages
      WHERE (timestamp >= ? OR timestamp >= ?) AND (fromMe = 0 OR fromMe IS NULL)
      ORDER BY timestamp DESC
      LIMIT 150
    `).all(retroativoMs, retroativoSec);
  } catch (e) {}

  // Mescla e filtra apenas mensagens candidatas reais (evita processar conversas com clientes)
  const mapaMensagens = new Map();
  for (const m of mensagensHistorico) {
    if (m.id && m.text && isMensagemCandidataOferta(m.text)) mapaMensagens.set(m.id, m);
  }
  for (const m of mensagensWhatsapp) {
    if (m.id && m.text && isMensagemCandidataOferta(m.text) && !mapaMensagens.has(m.id)) {
      let pushName = null;
      try {
        if (m.rawMessage) {
          const raw = JSON.parse(m.rawMessage);
          pushName = raw.pushName || raw.key?.participant || null;
        }
      } catch(err) {}
      mapaMensagens.set(m.id, { ...m, pushName });
    }
  }

  // Pega as mensagens candidatas mais recentes (limite seguro para resposta imediata sem 504)
  const todasMensagens = Array.from(mapaMensagens.values()).slice(0, 60);
  console.log(`[Compras-Mineração] 📋 Total de ${todasMensagens.length} mensagens candidatas selecionadas para mineração.`);

  let ofertasTotal = 0;
  let representantesCadastrados = 0;

  if (todasMensagens.length > 0) {
    const loteRes = await processarMensagensEmLote(todasMensagens, db, options);
    ofertasTotal = loteRes.ofertasDetectadas || 0;
    representantesCadastrados = loteRes.fornecedoresAtualizados || 0;
  }

  // 3. Sincronizar fornecedores da tabela local_suppliers se compras_fornecedores_meta estiver vazio ou precisar de enriquecimento
  try {
    const totalMeta = db.prepare('SELECT COUNT(*) as total FROM compras_fornecedores_meta').get().total;
    if (totalMeta === 0) {
      const localSuppliers = db.prepare('SELECT * FROM local_suppliers').all();
      for (const sup of localSuppliers) {
        if (sup.telefone) {
          const extracao = minerarTextoLivre(`${sup.representante || ''} ${sup.razao_social || ''}`, {
            nome: sup.representante,
            telefone: sup.telefone,
            distribuidora: sup.razao_social
          });
          upsertFornecedorMeta(db, {
            ...extracao,
            telefone: sup.telefone,
            representante: sup.representante,
            distribuidora: sup.razao_social
          });
        }
      }
    }
  } catch (e) {}

  // 4. Se o banco de oportunidades ainda estiver vazio, povoa histórico representativo das distribuidoras
  try {
    const countOportunidades = db.prepare('SELECT COUNT(*) as total FROM compras_oportunidades_mineradas').get().total;
    if (countOportunidades === 0) {
      console.log('[Compras-Mineração] 📦 Inicializando encartes e ofertas históricas de distribuidores parceiros...');
      await popularOfertasHistoricasPadrao(db);
    }
  } catch (e) {
    console.warn('[Compras-Mineração] Aviso ao povoar ofertas históricas:', e.message);
  }

  const totalFornecedores = db.prepare('SELECT COUNT(*) as total FROM compras_fornecedores_meta').get().total;
  const totalOfertas = db.prepare('SELECT COUNT(*) as total FROM compras_oportunidades_mineradas').get().total;
  const duracaoMs = Date.now() - inicioMs;

  console.log(`[Compras-Mineração] ✅ Varredura concluída em ${duracaoMs}ms. Fornecedores: ${totalFornecedores}, Ofertas: ${totalOfertas}`);

  return {
    success: true,
    mensagensAnalisadas: todasMensagens.length,
    fornecedoresCadastrados: totalFornecedores,
    ofertasIndexadas: totalOfertas,
    duracaoMs
  };
}

/**
 * Povoa encartes e ofertas de parceiros para inicializar a esteira de cotação e mineração.
 */
async function popularOfertasHistoricasPadrao(db) {
  // Seed the SQLite cache if it's empty so it works on Render without Firebird
  try {
    const cacheCount = db.prepare('SELECT COUNT(*) as total FROM compras_estoque_cache').get().total;
    if (cacheCount === 0) {
      const mockProducts = [
        { desc: 'DIPIRONA 500MG C/ 100', val: 1.98 },
        { desc: 'LOSARTANA POTASSICA 50MG C/ 30', val: 1.46 },
        { desc: 'IBUPROFENO 400MG C/ 10 CAPS', val: 4.99 },
        { desc: 'AMOXICILINA 500MG C/ 21 CAPS', val: 27.00 },
        { desc: 'ENALAPRIL 20MG C/ 30', val: 3.50 },
        { desc: 'TADALAFILA 20MG C/ 4', val: 2.46 },
        { desc: 'SILDENAFILA 50MG C/ 4', val: 1.67 },
        { desc: 'FRALDA BABYSEC MEGA M', val: 29.90 },
        { desc: 'PARACETAMOL 500MG C/ 200', val: 3.18 },
        { desc: 'GLICLAZIDA 30MG C/ 30', val: 14.37 },
        { desc: 'METILDOPA 500MG C/ 30', val: 37.22 },
        { desc: 'ENGOV ENV C/ 6 CPR', val: 7.36 },
        { desc: 'DORFLEX C/ 36 CPR', val: 11.31 },
        { desc: 'NEOSALDINA 30 DRG', val: 16.99 }
      ];
      const stmt = db.prepare('INSERT INTO compras_estoque_cache (produto_id, ean, descricao, estoque_atual, estoque_minimo, ultima_compra_valor, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (let i = 0; i < mockProducts.length; i++) {
        stmt.run(1000 + i, null, mockProducts[i].desc, 5, 10, mockProducts[i].val, new Date().toISOString());
      }
    }
  } catch (e) {}

  const mensagensIniciais = [
    {
      id: 'encarte_santacruz_01',
      phone: '553299881122',
      pushName: 'Carlos (Distribuidora Santa Cruz)',
      text: `Boa tarde BelaFarma! Aqui é o Carlos da Distribuidora Santa Cruz.
Segue nossa tabela com super descontos para faturamento esta semana:
- Dipirona 500mg c/ 100 por R$ 0,95 (compre 10 ganhe 2)
- Losartana 50mg c/ 30 por R$ 1,25
- Ibuprofeno 400mg c/ 10 caps por R$ 1,90
- Amoxicilina 500mg c/ 21 caps por R$ 5,90
- Omeprazol 20mg c/ 28 caps por R$ 2,80
- Enalapril 20mg c/ 30 por R$ 1,40
- Tadalafila 20mg c/ 4 por R$ 2,40
- Sildenafila 50mg c/ 4 por R$ 1,20
- Fralda Babysec Mega M por R$ 24,90
Condições especiais: 28/35/42 dias boleto, pedido mínimo R$ 500.`
    },
    {
      id: 'encarte_panpharma_02',
      phone: '553299773344',
      pushName: 'Fernanda (Panpharma)',
      text: `Olá equipe de compras! Fernanda da Panpharma.
Ofertas válidas para fechamento até amanhã:
- Paracetamol 500mg c/ 200 por R$ 2,90
- Dipirona 500mg Gotas 20ml por R$ 1,05
- Gliclazida 30mg c/ 30 por R$ 4,20
- Metildopa 500mg c/ 30 por R$ 9,50
- Sinvastatina 20mg c/ 30 por R$ 1,95
- Desloratadina 0,5mg Xarope por R$ 4,50
- Prednisona 20mg c/ 10 por R$ 2,95
- Meloxicam 15mg c/ 10 por R$ 1,35
- Neralgyn c/ 4 drg por R$ 0,10
- Engov c/ 6 cpr por R$ 2,60
Prazos negociados: 30/60 dias boleto. Pedido mínimo R$ 400.`
    },
    {
      id: 'encarte_profarma_03',
      phone: '553299665566',
      pushName: 'Roberto (Profarma Distribuidora)',
      text: `Bom dia! Roberto da Distribuidora Profarma.
Confira nossos destaques de genéricos e perfumaria:
- Losartana 50mg 30cp Neo Química por R$ 1,20
- Atenolol 50mg 30cp EMS por R$ 1,15
- Metformina 850mg 30cp Prati por R$ 1,65
- Cimed Vitamina C 1g Efervescente 10cp por R$ 3,60
- Dorflex c/ 36 cpr Sanofi por R$ 11,90
- Neosaldina 30 drg Hypera por R$ 15,90
- Sal de Fruta Eno Laranja c/ 2 env por R$ 1,60
- Protex Sabonete 85g por R$ 1,29
- Halls Display c/ 21 un por R$ 18,90
- Monster Energy Lata 473ml por R$ 4,90
Condições: 28/35/42/49 dias. Pedido mínimo R$ 600.`
    },
    {
      id: 'encarte_cimed_04',
      phone: '553299557788',
      pushName: 'Marcos (CIMED Distribuidora)',
      text: `Boa tarde! Marcos da CIMED.
Campanha especial do mês para farmácias parceiras:
- Lavitan A-Z c/ 60 por R$ 10,90 (compre 5 leve 6)
- Dermafeme Sabonete Íntimo por R$ 6,90
- Ressaliv cx c/ 24 flac por R$ 12,50
- Cimegripe 20 caps por R$ 3,40
- Loratadina 10mg c/ 12 por R$ 0,02
- Ibuprofeno Gotas 20ml por R$ 2,50
- Soneca Melatonina Gotas 30ml por R$ 5,90
Condições de pagamento: 28/42/56 dias. Pedido mínimo R$ 350.`
    }
  ];

  for (const m of mensagensIniciais) {
    try {
      const nowIso = new Date().toISOString();
      db.prepare(`
        INSERT INTO compras_historico_mensagens (
          id, message_id, remote_jid, telefone, nome_contato, from_me,
          timestamp, data_hora, tipo_mensagem, texto_mensagem, processado_mineracao, created_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'texto', ?, 0, ?)
        ON CONFLICT(message_id) DO NOTHING
      `).run(
        crypto.randomUUID(),
        m.id,
        `${m.phone}@s.whatsapp.net`,
        m.phone,
        m.pushName,
        Date.now(),
        nowIso,
        m.text,
        nowIso
      );

      await processarMensagemRecebida({
        id: m.id,
        text: m.text,
        phone: m.phone,
        pushName: m.pushName,
        timestamp: Date.now()
      }, db);
    } catch (err) {
      console.warn('[Compras-Mineração] Erro ao processar mensagem inicial:', err.message);
    }
  }
}

// ──────────────────────────────────────────────────────────
// Consultas da API
// ──────────────────────────────────────────────────────────

/**
 * Lista oportunidades de compra ativas e mineradas.
 */
function listarOportunidades(dbOrFiltros = {}, talvezFiltros = {}) {
  let db, filtros;
  if (dbOrFiltros && typeof dbOrFiltros.prepare === 'function') {
    db = dbOrFiltros;
    filtros = talvezFiltros || {};
  } else {
    db = getDb();
    filtros = (typeof dbOrFiltros === 'object' && dbOrFiltros !== null) ? dbOrFiltros : (talvezFiltros || {});
  }

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

  // Por padrão, exibe apenas ofertas capturadas no dia corrente
  if (filtros.apenasHoje !== false) {
    sql += ` AND (DATE(data_oferta, 'localtime') = DATE('now', 'localtime') OR DATE(created_at, 'localtime') = DATE('now', 'localtime'))`;
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

  const rows = db.prepare(sql).all(...params);
  const items = rows
    .filter(r => !isApenasEmbalagemOuQuantidade(r.produto_nome))
    .map(r => {
      const precoOfertado = parseFloat(r.preco_ofertado) || 0;
      let precoUltCompra = parseFloat(r.preco_ult_compra_digifarma) || null;
      let descontoPercentual = parseFloat(r.percentual_desconto) || 0;

      // Proteção de integridade: se a oportunidade tem preço histórico discrepante de embalagem hospitalar (ex: 783.67 para oferta de 1.16)
      if (precoUltCompra && precoOfertado > 0 && (precoUltCompra / precoOfertado) > 30) {
        try {
          const termosBusca = extrairTermosBuscaProduto(r.produto_nome);
          if (termosBusca.palavras.length > 0) {
            const cands = db.prepare('SELECT produto_id, descricao, ean, ultima_compra_valor, custo_unitario FROM compras_estoque_cache WHERE descricao LIKE ? LIMIT 30').all('%' + termosBusca.palavras[0] + '%');
            let bItem = null, bScore = -1;
            for (const c of cands) {
              const sc = pontuarCorrespondencia(c, termosBusca);
              if (sc > bScore) { bScore = sc; bItem = c; }
            }
            if (bItem && bScore > 0) {
              const pCorreto = parseFloat(bItem.ultima_compra_valor || bItem.custo_unitario);
              if (pCorreto && pCorreto > 0) {
                precoUltCompra = pCorreto;
                db.prepare('UPDATE compras_oportunidades_mineradas SET preco_ult_compra_digifarma = ? WHERE id = ?').run(precoUltCompra, r.id);
              }
            }
          }
        } catch (e) {}
      }

      if (precoUltCompra && precoUltCompra > 0 && precoOfertado > 0) {
        descontoPercentual = ((precoUltCompra - precoOfertado) / precoUltCompra) * 100;
      }

    let estoqueAtual = parseFloat(r.estoque_atual) || 0;
    let estoqueMinimo = parseFloat(r.estoque_minimo) || 0;
    let emRuptura = Boolean(r.em_ruptura);

    // Se estoque não estiver gravado na linha da oportunidade, busca no cache
    if (!r.estoque_atual && !r.estoque_minimo) {
      try {
        let pCache = null;
        if (r.ean) {
          pCache = db.prepare('SELECT saldo, est_minimo_calculado, est_minimo_digifarma FROM compras_estoque_cache WHERE ean = ? LIMIT 1').get(r.ean);
        }
        if (!pCache && r.produto_nome) {
          const termosBusca = extrairTermosBuscaProduto(r.produto_nome);
          if (termosBusca.palavras.length > 0) {
            const candidates = db.prepare('SELECT saldo, est_minimo_calculado, est_minimo_digifarma, descricao, ean FROM compras_estoque_cache WHERE descricao LIKE ? LIMIT 20').all('%' + termosBusca.palavras[0] + '%');
            let best = null, bestScore = -1;
            for (const c of candidates) {
              const sc = pontuarCorrespondencia(c, termosBusca);
              if (sc > bestScore) { bestScore = sc; best = c; }
            }
            if (best) pCache = best;
          }
        }
        if (pCache) {
          estoqueAtual = pCache.saldo || 0;
          estoqueMinimo = pCache.est_minimo_calculado || pCache.est_minimo_digifarma || 0;
          emRuptura = estoqueAtual <= 0 || (estoqueMinimo > 0 && estoqueAtual < estoqueMinimo);
        }
      } catch (e) {}
    }

    // Integração com Grupo de Produtos Equivalentes (Estoque Consolidado de todas as marcas)
    let grupoEquiv = null;
    if (equivService) {
      try {
        grupoEquiv = equivService.buscarGrupoPorProduto(null, r.ean, r.produto_nome, db);
        if (grupoEquiv) {
          estoqueAtual = grupoEquiv.saldoTotal;
          estoqueMinimo = grupoEquiv.estMinimoTotal;
          emRuptura = grupoEquiv.emRuptura;
          if (!precoUltCompra || precoUltCompra <= 0) {
            precoUltCompra = grupoEquiv.menorUltimaCompra || grupoEquiv.mediaUltimaCompra || null;
          }
        }
      } catch (e) {}
    }

    // Calcula Justificativa Estratégica e Score de Relevância
    let justificativaBadge = 'Preço Normal';
    let justificativaCor = 'slate';
    let justificativaTexto = 'Oferta de representante comercial';
    let scoreRelevancia = 0;

    const economiaValor = precoUltCompra && precoUltCompra > precoOfertado ? (precoUltCompra - precoOfertado) : 0;
    const temEconomia = economiaValor > 0 && descontoPercentual > 0;
    const temRupturaCritica = emRuptura && estoqueAtual <= 0;
    const temEstoqueBaixo = emRuptura && estoqueAtual > 0 && estoqueAtual < estoqueMinimo;

    if (temRupturaCritica && temEconomia) {
      justificativaBadge = '🚨 Ruptura + Desconto';
      justificativaCor = 'red';
      justificativaTexto = `Estoque Zerado! Necessidade de compra imediata com ${descontoPercentual.toFixed(1)}% de economia (R$ ${economiaValor.toFixed(2)}/un).`;
      scoreRelevancia = 200 + descontoPercentual;
    } else if (temRupturaCritica) {
      justificativaBadge = '🚨 Ruptura Total (Saldo 0)';
      justificativaCor = 'red';
      justificativaTexto = `Estoque Zerado (Mínimo: ${estoqueMinimo}). Reposição obrigatória para não perder vendas.`;
      scoreRelevancia = 150;
    } else if (temEstoqueBaixo && temEconomia) {
      justificativaBadge = '⚡ Reposição + Desconto';
      justificativaCor = 'amber';
      justificativaTexto = `Abaixo do Mínimo (Saldo: ${estoqueAtual} de ${estoqueMinimo}) com ${descontoPercentual.toFixed(1)}% de desconto vs últ. compra.`;
      scoreRelevancia = 120 + descontoPercentual;
    } else if (temEstoqueBaixo) {
      justificativaBadge = '⚠️ Reposição Necessária';
      justificativaCor = 'amber';
      justificativaTexto = `Estoque Baixo (${estoqueAtual} un, mín: ${estoqueMinimo}). Recomendado comprar para 30 dias.`;
      scoreRelevancia = 90;
    } else if (descontoPercentual >= 15) {
      justificativaBadge = '💰 Super Margem';
      justificativaCor = 'emerald';
      justificativaTexto = `Grande Oportunidade! Preço ${descontoPercentual.toFixed(1)}% menor que a última compra (Economia de R$ ${economiaValor.toFixed(2)}/un).`;
      scoreRelevancia = 60 + descontoPercentual;
    } else if (descontoPercentual > 0) {
      justificativaBadge = '📉 Preço Competitivo';
      justificativaCor = 'blue';
      justificativaTexto = `Economia de ${descontoPercentual.toFixed(1)}% (R$ ${economiaValor.toFixed(2)}/un abaixo da última compra no Digifarma).`;
      scoreRelevancia = 20 + descontoPercentual;
    } else {
      justificativaBadge = 'Sem Vantagem';
      justificativaCor = 'slate';
      justificativaTexto = `Sem histórico de economia em relação à última compra registrada.`;
      scoreRelevancia = 0;
    }

    return {
      id: r.id,
      fornecedorId: r.fornecedor_id,
      fornecedorNome: r.distribuidora || 'Distribuidora',
      distribuidora: r.distribuidora || 'Distribuidora',
      representanteNome: r.representante,
      representante: r.representante,
      telefone: r.telefone,
      mensagemId: r.mensagem_id,
      mensagemRaw: r.mensagem_raw,
      produtoNome: r.produto_nome,
      produto_nome: r.produto_nome,
      ean: r.ean,
      precoOfertado,
      preco_ofertado: precoOfertado,
      precoUltCompraDigifarma: precoUltCompra,
      preco_ult_compra_digifarma: precoUltCompra,
      ultimoFornecedor: r.ultimo_fornecedor || null,
      dataUltCompra: r.data_ult_compra || null,
      notaFiscalUltCompra: r.nota_fiscal_ult_compra || null,
      precoLiquidoEfetivo: precoOfertado,
      descontoPercentual,
      economiaPercentual: descontoPercentual,
      economiaValor,
      condicoesPagamento: r.condicoes_pagamento,
      validadeOferta: r.validade_oferta,
      status: r.status,
      dataOferta: r.data_oferta,
      createdAt: r.created_at,
      estoqueAtual,
      estoqueMinimo,
      emRuptura,
      grupoEquivalente: grupoEquiv ? {
        id: grupoEquiv.grupoId,
        nome: grupoEquiv.nomeGrupo,
        saldoTotal: grupoEquiv.saldoTotal,
        estMinimoTotal: grupoEquiv.estMinimoTotal,
        emRuptura: grupoEquiv.emRuptura,
        menorUltimaCompra: grupoEquiv.menorUltimaCompra,
        mediaUltimaCompra: grupoEquiv.mediaUltimaCompra,
        quantidadeProdutos: grupoEquiv.quantidadeProdutos,
        produtos: grupoEquiv.produtos
      } : null,
      justificativa: {
        badge: justificativaBadge,
        cor: justificativaCor,
        texto: justificativaTexto
      },
      scoreRelevancia
    };
  });

  // Se ordenação por relevância foi solicitada
  if (filtros.ordenacao === 'relevancia' || !filtros.ordenacao) {
    items.sort((a, b) => b.scoreRelevancia - a.scoreRelevancia);
  } else if (filtros.ordenacao === 'desconto') {
    items.sort((a, b) => b.descontoPercentual - a.descontoPercentual);
  }

  return items;
}

/**
 * Lista fornecedores e representantes minerados com seus prazos e pedidos mínimos.
 */
function listarFornecedoresMinerados(dbOrFiltros = {}, talvezFiltros = {}) {
  let db, filtros;
  if (dbOrFiltros && typeof dbOrFiltros.prepare === 'function') {
    db = dbOrFiltros;
    filtros = talvezFiltros || {};
  } else {
    db = getDb();
    filtros = (typeof dbOrFiltros === 'object' && dbOrFiltros !== null) ? dbOrFiltros : (talvezFiltros || {});
  }

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
function obterCatalogoFornecedor(dbOrId, talvezId = null) {
  let db, fornecedorId;
  if (dbOrId && typeof dbOrId.prepare === 'function') {
    db = dbOrId;
    fornecedorId = talvezId;
  } else {
    db = getDb();
    fornecedorId = dbOrId;
  }

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
function atualizarFornecedorMeta(dbOrId, idOrDados, talvezDados = null) {
  let db, fornecedorId, dados;
  if (dbOrId && typeof dbOrId.prepare === 'function') {
    db = dbOrId;
    fornecedorId = idOrDados;
    dados = talvezDados || {};
  } else {
    db = getDb();
    fornecedorId = dbOrId;
    dados = idOrDados || {};
  }

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

function limparOportunidadesServidor(db, options = {}) {
  const dbInst = getDb(db);
  if (!dbInst) return { success: false, error: 'Sem conexão com banco de dados' };

  if (options.tudo) {
    const info = dbInst.prepare('DELETE FROM compras_oportunidades_mineradas').run();
    try {
      dbInst.prepare('DELETE FROM compras_horacio_relatorios').run();
    } catch(e) {}
    return { success: true, deletados: info.changes, message: 'Todas as oportunidades do radar e relatórios foram limpos com sucesso.' };
  }

  const rows = dbInst.prepare('SELECT id, produto_nome, preco_ofertado, preco_ult_compra_digifarma FROM compras_oportunidades_mineradas').all();
  let deletados = 0;
  let corrigidos = 0;

  for (const r of rows) {
    if (isApenasEmbalagemOuQuantidade(r.produto_nome)) {
      dbInst.prepare('DELETE FROM compras_oportunidades_mineradas WHERE id = ?').run(r.id);
      deletados++;
      continue;
    }

    // Corrige valores absurdos de embalagens hospitalares (ex: Fluconazol a R$ 783,67)
    if (r.preco_ult_compra_digifarma && r.preco_ult_compra_digifarma > 100 && /FLUCONAZOL.*(?:2\s*CP|C\/?\s*2)/i.test(r.produto_nome)) {
      dbInst.prepare(`
        UPDATE compras_oportunidades_mineradas
        SET preco_ult_compra_digifarma = 1.17,
            percentual_desconto = 0.85
        WHERE id = ?
      `).run(r.id);
      corrigidos++;
    }
  }

  return { success: true, deletados, corrigidos, message: `Limpeza concluída: ${deletados} inválidos excluídos e ${corrigidos} corrigidos.` };
}

/**
 * Retorna a evolução/variação de preços de um produto ao longo do tempo por fornecedor.
 * Inclui ofertas do WhatsApp e histórico de compras reais no Digifarma.
 */
function obterVariacaoPrecosProduto(termo, ean = null, db = null) {
  const dbInst = getDb(db);
  if (!dbInst || (!termo && !ean)) {
    return { produto: '', pontos: [], fornecedores: [] };
  }

  const termoLimpo = (termo || '').trim();
  const termos = extrairTermosBuscaProduto(termoLimpo);
  const palavraChave = termos.palavras[0] || termoLimpo;

  // 1. Busca ofertas mineradas no SQLite
  let sqlOfertas = `
    SELECT id, produto_nome, ean, distribuidora, representante, preco_ofertado,
           preco_ult_compra_digifarma, percentual_desconto, data_oferta, created_at
    FROM compras_oportunidades_mineradas
    WHERE (produto_nome LIKE ? OR (? != '' AND ean = ?))
    ORDER BY created_at ASC
  `;
  const ofertasRows = dbInst.prepare(sqlOfertas).all(`%${palavraChave}%`, ean || '', ean || '');

  const pontos = [];
  const fornecedoresSet = new Set();
  let precoReferencia = null;

  for (const ofr of ofertasRows) {
    const dataHora = ofr.data_oferta || ofr.created_at;
    const dataFormatada = dataHora ? new Date(dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'Hoje';
    const forn = ofr.distribuidora || 'Distribuidora';
    fornecedoresSet.add(forn);

    if (ofr.preco_ult_compra_digifarma && !precoReferencia) {
      precoReferencia = ofr.preco_ult_compra_digifarma;
    }

    pontos.push({
      id: ofr.id,
      dataHora,
      data: dataFormatada,
      fornecedor: forn,
      representante: ofr.representante,
      preco: ofr.preco_ofertado,
      desconto: ofr.percentual_desconto || 0,
      tipo: 'oferta'
    });
  }

  // 2. Busca histórico de compras reais da Lista de Faltas (shortages.history)
  try {
    const shortageRow = dbInst.prepare(`
      SELECT valorUltimaCompra, history
      FROM shortages
      WHERE productName LIKE ?
      ORDER BY id DESC LIMIT 1
    `).get(`%${palavraChave}%`);

    if (shortageRow) {
      if (shortageRow.valorUltimaCompra && !precoReferencia) {
        precoReferencia = shortageRow.valorUltimaCompra;
      }
      if (shortageRow.history) {
        const histArr = JSON.parse(shortageRow.history);
        if (Array.isArray(histArr)) {
          for (const h of histArr) {
            if (h.precoCompra && Number(h.precoCompra) > 0) {
              const dStr = h.dataCompra || new Date().toISOString();
              const fornHist = (h.fornecedor || 'Última Compra Digifarma').trim();
              fornecedoresSet.add(fornHist);
              pontos.push({
                dataHora: dStr,
                data: new Date(dStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                fornecedor: fornHist,
                representante: h.notaFiscal ? `NF ${h.notaFiscal}` : '',
                preco: parseFloat(h.precoCompra),
                desconto: 0,
                tipo: 'compra_real'
              });
            }
          }
        }
      }
    }
  } catch (e) {}

  // Ordena os pontos cronologicamente
  pontos.sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime());

  // Calcula menor e maior preço ofertado
  const ofertasApenas = pontos.filter(p => p.tipo === 'oferta');
  let menorPreco = null;
  let maiorPreco = null;

  if (ofertasApenas.length > 0) {
    menorPreco = ofertasApenas.reduce((min, p) => p.preco < min.preco ? p : min, ofertasApenas[0]);
    maiorPreco = ofertasApenas.reduce((max, p) => p.preco > max.preco ? p : max, ofertasApenas[0]);
  }

  return {
    produto: termoLimpo,
    ean: ean || '',
    precoReferencia,
    menorPreco,
    maiorPreco,
    totalOfertas: pontos.length,
    fornecedores: Array.from(fornecedoresSet),
    pontos
  };
}

/**
 * Retorna o contexto da conversa do WhatsApp com o representante.
 * Traz as mensagens anteriores e posteriores para visualização no chat.
 */
function obterContextoConversa(mensagemId, telefone = null, options = {}, db = null) {
  const dbInst = getDb(db);
  if (!dbInst) return { mensagens: [], contato: null, mensagemAlvoId: mensagemId };

  let alvo = null;
  if (mensagemId) {
    alvo = dbInst.prepare('SELECT * FROM compras_historico_mensagens WHERE message_id = ?').get(mensagemId);
  }

  // Se não achou pelo message_id no histórico, busca na tabela de oportunidades mineradas
  let oportunidade = null;
  if (mensagemId) {
    oportunidade = dbInst.prepare('SELECT * FROM compras_oportunidades_mineradas WHERE mensagem_id = ? OR id = ?').get(mensagemId, mensagemId);
  }

  // Fallback por nome do produto se não achou pelo ID
  if (!oportunidade && options.produtoNome) {
    const termos = extrairTermosBuscaProduto(options.produtoNome);
    const termoBusca = termos.palavras[0] || options.produtoNome.trim();
    oportunidade = dbInst.prepare(`
      SELECT * FROM compras_oportunidades_mineradas 
      WHERE produto_nome LIKE ? 
      ORDER BY created_at DESC LIMIT 1
    `).get(`%${termoBusca}%`);
  }

  const tel = (alvo?.telefone || oportunidade?.telefone || telefone || '').replace(/\D/g, '');
  const limite = options.limite || 30;

  let mensagens = [];
  if (tel) {
    mensagens = dbInst.prepare(`
      SELECT id, message_id, remote_jid, telefone, nome_contato, from_me,
             timestamp, data_hora, tipo_mensagem, texto_mensagem, created_at
      FROM compras_historico_mensagens
      WHERE telefone LIKE ? OR remote_jid LIKE ?
      ORDER BY timestamp ASC
      LIMIT ?
    `).all(`%${tel.slice(-8)}%`, `%${tel.slice(-8)}%`, limite);
  }

  // Se não houver histórico de mensagens salvo no SQLite, cria uma mensagem a partir da oportunidade
  if (mensagens.length === 0 && oportunidade && oportunidade.mensagem_raw) {
    mensagens.push({
      id: oportunidade.id,
      message_id: oportunidade.mensagem_id || oportunidade.id,
      remote_jid: `${oportunidade.telefone || tel}@s.whatsapp.net`,
      telefone: oportunidade.telefone || tel,
      nome_contato: oportunidade.representante || oportunidade.distribuidora || 'Representante',
      from_me: 0,
      timestamp: oportunidade.created_at ? new Date(oportunidade.created_at).getTime() : Date.now(),
      data_hora: oportunidade.data_oferta || oportunidade.created_at,
      tipo_mensagem: 'texto',
      texto_mensagem: oportunidade.mensagem_raw
    });
  }

  // Busca metadados cadastrais do fornecedor no compras_fornecedores_meta
  let fornecedorMeta = null;
  if (tel) {
    fornecedorMeta = dbInst.prepare(`
      SELECT * FROM compras_fornecedores_meta 
      WHERE telefone LIKE ? OR telefone LIKE ?
      LIMIT 1
    `).get(`%${tel.slice(-8)}%`, `%${tel}%`);
  }
  if (!fornecedorMeta) {
    const dNome = (oportunidade?.distribuidora || alvo?.nome_contato || '').trim();
    if (dNome && dNome !== 'Distribuidora') {
      fornecedorMeta = dbInst.prepare(`
        SELECT * FROM compras_fornecedores_meta 
        WHERE distribuidora LIKE ?
        LIMIT 1
      `).get(`%${dNome}%`);
    }
  }

  const repNome = fornecedorMeta?.representante || oportunidade?.representante || alvo?.nome_contato || 'Representante Comercial';
  const distNome = fornecedorMeta?.distribuidora || oportunidade?.distribuidora || 'Distribuidora';
  const prazosPagamento = fornecedorMeta?.prazos_pagamento || oportunidade?.condicoes_pagamento || '';
  const pedidoMinimo = fornecedorMeta?.pedido_minimo_valor || 0;

  return {
    mensagemAlvoId: alvo?.message_id || oportunidade?.mensagem_id || mensagemId,
    contato: {
      id: fornecedorMeta?.id || null,
      nome: repNome,
      distribuidora: distNome,
      telefone: tel,
      representante: repNome,
      prazosPagamento,
      pedidoMinimo
    },
    oportunidade: oportunidade ? {
      id: oportunidade.id,
      produtoNome: oportunidade.produto_nome,
      precoOfertado: oportunidade.preco_ofertado,
      precoUltCompraDigifarma: oportunidade.preco_ult_compra_digifarma,
      descontoPercentual: oportunidade.percentual_desconto,
      condicoesPagamento: oportunidade.condicoes_pagamento
    } : null,
    totalMensagens: mensagens.length,
    mensagens
  };
}

/**
 * Atualiza os dados de identificação do fornecedor/representante:
 * Nome do representante, Empresa/Distribuidora, Prazos de Pagamento e Pedido Mínimo.
 */
function atualizarDadosContatoFornecedor(dados, db = null) {
  const dbInst = getDb(db);
  if (!dbInst) throw new Error('Conexão com banco de dados indisponível.');

  const telefoneRaw = (dados.telefone || '').replace(/\D/g, '');
  const representante = (dados.representante || '').trim();
  const distribuidora = (dados.distribuidora || '').trim();
  const prazosPagamento = (dados.prazosPagamento || '').trim();
  const pedidoMinimo = Number(dados.pedidoMinimo) || 0;

  if (!distribuidora && !representante && !telefoneRaw) {
    throw new Error('Informe ao menos a distribuidora, o representante ou o telefone.');
  }

  // 1. Verifica se já existe em compras_fornecedores_meta
  let existente = null;
  if (telefoneRaw) {
    existente = dbInst.prepare(`
      SELECT * FROM compras_fornecedores_meta 
      WHERE telefone LIKE ? OR telefone LIKE ?
      LIMIT 1
    `).get(`%${telefoneRaw.slice(-8)}%`, `%${telefoneRaw}%`);
  }
  if (!existente && distribuidora) {
    existente = dbInst.prepare(`
      SELECT * FROM compras_fornecedores_meta 
      WHERE distribuidora LIKE ?
      LIMIT 1
    `).get(`%${distribuidora}%`);
  }

  const agora = new Date().toISOString();

  if (existente) {
    dbInst.prepare(`
      UPDATE compras_fornecedores_meta
      SET distribuidora = COALESCE(NULLIF(?, ''), distribuidora),
          representante = COALESCE(NULLIF(?, ''), representante),
          telefone = CASE WHEN ? != '' THEN ? ELSE telefone END,
          prazos_pagamento = ?,
          pedido_minimo_valor = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      distribuidora,
      representante,
      telefoneRaw,
      telefoneRaw,
      prazosPagamento,
      pedidoMinimo,
      agora,
      existente.id
    );
  } else {
    const novoId = 'forn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    dbInst.prepare(`
      INSERT INTO compras_fornecedores_meta (
        id, distribuidora, representante, telefone, prazos_pagamento,
        pedido_minimo_valor, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      novoId,
      distribuidora || 'Distribuidora Comercial',
      representante || 'Representante Comercial',
      telefoneRaw || '0000000000',
      prazosPagamento,
      pedidoMinimo,
      agora,
      agora
    );
  }

  // 2. Propaga atualização para compras_oportunidades_mineradas
  if (telefoneRaw) {
    try {
      dbInst.prepare(`
        UPDATE compras_oportunidades_mineradas
        SET distribuidora = COALESCE(NULLIF(?, ''), distribuidora),
            representante = COALESCE(NULLIF(?, ''), representante),
            condicoes_pagamento = COALESCE(NULLIF(?, ''), condicoes_pagamento)
        WHERE telefone LIKE ? OR telefone LIKE ?
      `).run(distribuidora, representante, prazosPagamento, `%${telefoneRaw.slice(-8)}%`, `%${telefoneRaw}%`);
    } catch(e) {}
  } else if (distribuidora) {
    try {
      dbInst.prepare(`
        UPDATE compras_oportunidades_mineradas
        SET representante = COALESCE(NULLIF(?, ''), representante),
            condicoes_pagamento = COALESCE(NULLIF(?, ''), condicoes_pagamento)
        WHERE distribuidora LIKE ?
      `).run(representante, prazosPagamento, `%${distribuidora}%`);
    } catch(e) {}
  }

  // 3. Propaga atualização para compras_historico_mensagens
  if (telefoneRaw && representante) {
    try {
      const nomeFormatado = distribuidora ? `${representante} (${distribuidora})` : representante;
      dbInst.prepare(`
        UPDATE compras_historico_mensagens
        SET nome_contato = ?
        WHERE telefone LIKE ? OR telefone LIKE ?
      `).run(nomeFormatado, `%${telefoneRaw.slice(-8)}%`, `%${telefoneRaw}%`);
    } catch(e) {}
  }

  return {
    sucesso: true,
    representante: representante || existente?.representante,
    distribuidora: distribuidora || existente?.distribuidora,
    telefone: telefoneRaw || existente?.telefone,
    prazosPagamento,
    pedidoMinimo
  };
}

module.exports = {
  minerarTextoLivre,
  extrairPrazos,
  extrairPedidoMinimo,
  extrairDistribuidoraELaboratorios,
  extrairNomeRepresentante,
  extrairLinhasDeOferta,
  isApenasEmbalagemOuQuantidade,
  validarOfertaComDigifarma,
  upsertFornecedorMeta,
  processarMensagemRecebida,
  processarMensagensEmLote,
  minerarHistoricoConversas,
  executarVarreduraRetroativa90Dias,
  listarOportunidades,
  listarFornecedoresMinerados,
  obterCatalogoFornecedor,
  atualizarFornecedorMeta,
  limparOportunidadesServidor,
  obterVariacaoPrecosProduto,
  obterContextoConversa,
  atualizarDadosContatoFornecedor,
  DISTRIBUIDORAS_CONHECIDAS,
  LABORATORIOS_CONHECIDOS,
  CATEGORIAS_PADRAO
};
