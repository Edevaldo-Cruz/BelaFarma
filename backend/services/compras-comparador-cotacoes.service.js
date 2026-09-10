/**
 * compras-comparador-cotacoes.service.js
 * Serviço de comparação de cotações em texto de múltiplos fornecedores.
 * 
 * Funcionalidades:
 * 1. Identifica blocos e nomes de fornecedores em textos livres.
 * 2. Extrai produtos e seus respectivos preços (suportando R$, vírgulas, decimais).
 * 3. Normaliza os nomes dos produtos para agrupar ofertas concorrentes.
 * 4. Determina o menor preço unitário para cada produto e calcula a economia.
 * 5. Agrupa os produtos vencedores por fornecedor.
 * 6. Gera o texto formatado para envio direto com campos '[ Qtd: _____ ]'.
 * 7. Suporte a enriquecimento/fallback via IA (Gemini/OpenAI) para textos altamente informais.
 */

const { callAI } = require('./ai.service');

/**
 * Converte string de preço (R$ 12,50, 12.50, 12,50) para float.
 */
function parsePrice(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let clean = String(val).replace(/R\$/gi, '').replace(/\s+/g, '').trim();
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

/**
 * Formata número em moeda BRL (ex: R$ 12,50).
 */
function formatMoney(num) {
  return (Number(num) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Lista de palavras que indicam forma farmacêutica ou produto e nunca são nomes isolados de fornecedores
const PALAVRAS_NAO_FORNECEDOR = new Set([
  'COMP', 'COMPRIMIDO', 'COMPRIMIDOS', 'CAPS', 'CAPSULA', 'CAPSULAS', 'CPR', 'CPS',
  'COLIRIO', 'COLÍRIO', 'GOTAS', 'GTS', 'CREME', 'POMADA', 'GEL',
  'XAROPE', 'XPE', 'SUSP', 'SUSPENSAO', 'SUSPENSÃO', 'SOL', 'SOLUCAO', 'SOLUÇÃO',
  'OFT', 'OFTALMICO', 'VAG', 'VAGINAL', 'DERM', 'DERMATOLOGICO',
  'INJETAVEL', 'AMPOLA', 'SPRAY', 'AEROSOL', 'ENEMA', 'SUPOSITORIO',
  'GENERICO', 'GENÉRICO', 'SIMILAR', 'REFERENCIA', 'REFERÊNCIA'
]);

function ehCabecalhoFornecedor(linha) {
  const trimmed = linha.trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 40) return false;

  // Se tiver números, raramente é apenas o nome do fornecedor/representante
  if (/\d/.test(trimmed)) return false;

  // Se tiver indicação de preço
  if (/R\$|[\,\.]\d{2}/.test(trimmed)) return false;

  // Prefixos explícitos
  if (/^(?:FORNECEDOR|DISTRIBUIDORA|DISTRIB|COTACAO|REP|REPRESENTANTE|EMPRESA)\s*[:\-_]/i.test(trimmed)) {
    return true;
  }

  // Palavras de produtos/formas farmacêuticas
  const partes = trimmed.toUpperCase().split(/\s+/);
  for (const p of partes) {
    if (PALAVRAS_NAO_FORNECEDOR.has(p)) return false;
  }

  // Se for de 1 a 4 palavras (ex: SILAS, FELIPE, FRAN, GUILHERME, PANPHARMA, SANTA CRUZ)
  // E não terminar com ponto ou vírgula
  if (partes.length <= 4 && !/[,\.]$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Normaliza o nome do produto para fins de agrupamento e comparação entre fornecedores.
 */
function normalizarNomeProduto(nome) {
  if (!nome) return '';
  let str = String(nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toUpperCase()
    // Sinônimos comuns de farmácia
    .replace(/\bHIDRO\b/g, 'HIDROCLOROTIAZIDA')
    .replace(/\bDIENOGESTE\b/g, 'DIENOGEST')
    .replace(/\bACU\s*FRESH\b/g, 'ACUFRESH')
    .replace(/\bCARMELOSE\b/g, 'ACUFRESH CARMELOSE')
    // Remove marcas de laboratórios secundárias para cruzar genéricos equivalentes
    .replace(/\b(UNICHEM|PHARLAB|MEDQUIMICA|MEDLEY|GEOLAB|EUROFARMA|MULTILAB|BRASTERAPICA|FORTLIFE|VITAMEDIC|GREENPHARMA|TEUTO|NEO QUIMICA|NEOQUIMICA|BIOLAB|NATIVITA|GLEN|BIOSINTETICA|LEGRAND|ARTE NATIVA|MUNDIAL)\b/g, '')
    .replace(/^[0-9\.\-\_\s]{2,10}(?=[A-Z])/g, '') // remove códigos no início
    .replace(/[:\-–—=]+$/, '') // remove pontuação no final
    .replace(/\b(COMPRIMIDOS|COMPRIMIDO|COMP|CPR|CPS|CAPSULAS|CAPSULA|CAPS|DRAGEAS|DRG)\b/g, '')
    .replace(/\b(CX|CX\.|CAIXA|COM)\b/g, 'C/')
    .replace(/\bC\/\s*/g, 'C/')
    .replace(/\bBLX\d+\b/g, '')
    .replace(/(\d+)\s*(MG|ML|G|MCG)\b/g, '$1$2')
    .replace(/C\/\s*(\d+)/g, 'C/$1')
    .replace(/[^\w\d\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return str;
}

/**
 * Parser heurístico e local de texto com múltiplos fornecedores.
 */
function parsearTextoLocal(texto) {
  const linhas = String(texto || '').split(/\r?\n/);
  const fornecedoresMap = new Map();
  let fornecedorAtual = 'FORNECEDOR';
  let produtoPendente = '';

  for (let i = 0; i < linhas.length; i++) {
    const rawLinha = linhas[i].trim();
    if (!rawLinha || rawLinha.length < 2) continue;

    // Ignora linhas decorativas
    if (/^[=\-_*#]{3,}$/.test(rawLinha)) continue;

    // 1. Identifica se a linha é cabeçalho de Fornecedor / Representante
    if (ehCabecalhoFornecedor(rawLinha)) {
      fornecedorAtual = rawLinha
        .replace(/^(?:FORNECEDOR|DISTRIBUIDORA|DISTRIB|COTACAO|REP|REPRESENTANTE|EMPRESA)\s*[:\-_]?\s*/i, '')
        .replace(/[\*#_:]/g, '')
        .trim()
        .toUpperCase();

      if (!fornecedoresMap.has(fornecedorAtual)) {
        fornecedoresMap.set(fornecedorAtual, []);
      }
      produtoPendente = '';
      continue;
    }

    // 2. Corrige linhas grudadas como "Betaistina 16,7,92" -> "Betaistina 16 7,92"
    let linhaTratada = rawLinha.replace(/(\d+),(\d{1,4},\d{2})\b/, '$1 $2');

    // 3. Procura preços na linha
    const regexPrecoGeral = /(?:R\$\s*)?(\d{1,4}[,\.]\d{2})\b/g;
    const matchesPreco = [];
    let m;
    while ((m = regexPrecoGeral.exec(linhaTratada)) !== null) {
      const val = parsePrice(m[1]);
      if (val > 0.40) {
        matchesPreco.push({ index: m.index, match: m[0], valor: val });
      }
    }

    if (matchesPreco.length > 0) {
      // Pega o melhor/menor preço se houver subitens na mesma linha
      let precoEscolhido = matchesPreco[0].valor;
      if (matchesPreco.length > 1) {
        precoEscolhido = Math.min(...matchesPreco.map(p => p.valor));
      }

      let nomeProduto = '';
      if (produtoPendente && /^(?:\d+[\s:]*)+/.test(linhaTratada)) {
        nomeProduto = produtoPendente;
      } else {
        const primeiroMatch = matchesPreco[0];
        nomeProduto = linhaTratada.slice(0, primeiroMatch.index).replace(/[\*\-–—:\|]/g, ' ').trim();
        if (!nomeProduto && matchesPreco.length > 0) {
          nomeProduto = linhaTratada.replace(matchesPreco[0].match, '').trim();
        }
      }

      // Limpeza de prefixos numéricos de lista (ex: "1. ", "02 - ")
      nomeProduto = nomeProduto
        .replace(/^[0-9\.\)\-\s]+/, '')
        .replace(/[:\-–—=]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (nomeProduto && nomeProduto.length >= 3) {
        if (!fornecedoresMap.has(fornecedorAtual)) {
          fornecedoresMap.set(fornecedorAtual, []);
        }

        fornecedoresMap.get(fornecedorAtual).push({
          fornecedor: fornecedorAtual,
          produtoOriginal: nomeProduto,
          produtoNormalizado: normalizarNomeProduto(nomeProduto),
          preco: precoEscolhido
        });
      }
    } else {
      // Linha sem preço: armazena como nome pendente se a próxima linha tiver o preço (ex: Carmelose colírio ou Clotrimazol vag)
      if (rawLinha.length >= 4 && !/^(?:obs|frete|prazo|pedido|condicoes)/i.test(rawLinha)) {
        produtoPendente = rawLinha;
      }
    }
  }

  // Converte Map para array de itens
  const todosItens = [];
  for (const [fornecedor, itens] of fornecedoresMap.entries()) {
    for (const it of itens) {
      todosItens.push(it);
    }
  }

  return {
    fornecedores: Array.from(fornecedoresMap.keys()),
    itens: todosItens
  };
}

/**
 * Parser via Inteligência Artificial (Gemini/OpenAI) para textos altamente desestruturados.
 */
async function parsearTextoComIA(texto) {
  const prompt = `Você é um assistente especialista em compras de farmácia.
Analise o texto abaixo que contém cotações de um ou mais fornecedores/distribuidoras de medicamentos.
Extraia todos os produtos, preços e o respectivo fornecedor.

Se o nome do fornecedor não for explícito para algum item, associe ao fornecedor do bloco ou chame de "FORNECEDOR PADRAO".
Padronize os preços para números com ponto decimal (ex: 12.50).

TEXTO DA COTAÇÃO:
"""
${texto}
"""

Retorne APENAS um JSON válido no seguinte formato exato, sem comentários ou markdown:
{
  "itens": [
    {
      "fornecedor": "NOME DO FORNECEDOR",
      "produto": "NOME DO MEDICAMENTO OU PRODUTO",
      "preco": 12.50
    }
  ]
}`;

  try {
    const resposta = await callAI(prompt, 'Você é um extrator de dados JSON estrito.', {
      temperature: 0.1,
      maxTokens: 4000
    });

    // Limpa delimitadores de código markdown caso venha com ```json
    let cleanJson = resposta.replace(/^```json/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleanJson);

    if (parsed && Array.isArray(parsed.itens)) {
      const fornecedoresSet = new Set();
      const itens = parsed.itens.map(it => {
        const fornecedor = String(it.fornecedor || 'FORNECEDOR').toUpperCase().trim();
        fornecedoresSet.add(fornecedor);
        return {
          fornecedor,
          produtoOriginal: it.produto,
          produtoNormalizado: normalizarNomeProduto(it.produto),
          preco: parsePrice(it.preco)
        };
      }).filter(it => it.preco > 0 && it.produtoOriginal);

      return {
        fornecedores: Array.from(fornecedoresSet),
        itens
      };
    }
  } catch (err) {
    console.warn('[Comparador-Cotacoes] Falha no parse por IA, usando fallback local:', err.message);
  }

  return parsearTextoLocal(texto);
}

/**
 * Agrupa as ofertas por produto, identifica o menor preço e calcula economias.
 */
function processarComparativo(itens) {
  // 1. Agrupa ofertas pelo produto normalizado
  const grupos = new Map();

  for (const item of itens) {
    const chave = item.produtoNormalizado || normalizarNomeProduto(item.produtoOriginal);
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        produtoNormalizado: chave,
        produtoExibicao: item.produtoOriginal,
        ofertas: []
      });
    }
    grupos.get(chave).ofertas.push(item);
  }

  const itensComparados = [];
  const vencedoresPorFornecedor = new Map();
  let totalEconomiaEstimada = 0;

  for (const [chave, grupo] of grupos.entries()) {
    // Ordena as ofertas do produto pelo menor preço
    const ofertasOrdenadas = [...grupo.ofertas].sort((a, b) => a.preco - b.preco);
    const melhorOferta = ofertasOrdenadas[0];
    const segundoMelhor = ofertasOrdenadas.length > 1 ? ofertasOrdenadas[1] : null;

    let economiaUnitario = 0;
    let economiaPercentual = 0;
    let concorrenteInfo = '';

    if (segundoMelhor && segundoMelhor.preco > melhorOferta.preco) {
      economiaUnitario = segundoMelhor.preco - melhorOferta.preco;
      economiaPercentual = ((economiaUnitario / segundoMelhor.preco) * 100);
      totalEconomiaEstimada += economiaUnitario;
      concorrenteInfo = `Melhor preço vs ${segundoMelhor.fornecedor} (${formatMoney(segundoMelhor.preco)}) | -${economiaPercentual.toFixed(1)}%`;
    } else if (ofertasOrdenadas.length > 1 && segundoMelhor && segundoMelhor.preco === melhorOferta.preco) {
      concorrenteInfo = `Empate de menor preço com ${segundoMelhor.fornecedor}`;
    } else {
      concorrenteInfo = `Cotado exclusivamente em ${melhorOferta.fornecedor}`;
    }

    const itemResultado = {
      produto: grupo.produtoExibicao,
      produtoNormalizado: chave,
      vencedor: melhorOferta.fornecedor,
      menorPreco: melhorOferta.preco,
      concorrenteInfo,
      economiaUnitario,
      economiaPercentual: Math.round(economiaPercentual * 10) / 10,
      totalCotantes: ofertasOrdenadas.length,
      todasOfertas: ofertasOrdenadas.map(o => ({
        fornecedor: o.fornecedor,
        preco: o.preco,
        isVencedor: o.fornecedor === melhorOferta.fornecedor && o.preco === melhorOferta.preco
      }))
    };

    itensComparados.push(itemResultado);

    // Agrupa nos vencedores por fornecedor
    if (!vencedoresPorFornecedor.has(melhorOferta.fornecedor)) {
      vencedoresPorFornecedor.set(melhorOferta.fornecedor, []);
    }
    vencedoresPorFornecedor.get(melhorOferta.fornecedor).push(itemResultado);
  }

  return {
    itensComparados,
    vencedoresPorFornecedor,
    totalEconomiaEstimada
  };
}

/**
 * Gera o texto final formatado pronto para cópia e preenchimento de quantidades.
 */
function gerarTextoFormatadoPedidos(vencedoresPorFornecedor, itensQuantidades = {}) {
  const blocosTexto = [];
  const fornecedoresResumo = [];

  for (const [fornecedor, produtosVencedores] of vencedoresPorFornecedor.entries()) {
    let bloco = `==================================================\n`;
    bloco += `🏢 FORNECEDOR: ${fornecedor}\n`;
    bloco += `==================================================\n`;

    let totalItens = produtosVencedores.length;
    let subtotalFornecedor = 0;
    let temQuantidadePreenchida = false;

    produtosVencedores.forEach((item, index) => {
      const idx = String(index + 1).padStart(2, '0');
      const qtdInformada = itensQuantidades[item.produtoNormalizado] || '';
      const qtdStr = qtdInformada ? String(qtdInformada).padStart(5, ' ') : '_____';

      if (qtdInformada && !isNaN(Number(qtdInformada)) && Number(qtdInformada) > 0) {
        temQuantidadePreenchida = true;
        subtotalFornecedor += Number(qtdInformada) * item.menorPreco;
      }

      bloco += `[ Qtd: ${qtdStr} ] ${idx}. ${item.produto} — ${formatMoney(item.menorPreco)}`;
      if (item.concorrenteInfo) {
        bloco += ` (${item.concorrenteInfo})`;
      }
      bloco += `\n`;
    });

    bloco += `--------------------------------------------------\n`;
    bloco += `Total de itens com melhor preço: ${totalItens}\n`;
    if (temQuantidadePreenchida && subtotalFornecedor > 0) {
      bloco += `Valor estimado do pedido: ${formatMoney(subtotalFornecedor)}\n`;
    }
    bloco += `==================================================\n`;

    blocosTexto.push(bloco);
    fornecedoresResumo.push({
      fornecedor,
      totalItens,
      textoIndividual: bloco,
      produtos: produtosVencedores
    });
  }

  const textoCompleto = blocosTexto.join('\n\n');
  return {
    textoCompleto,
    fornecedoresResumo
  };
}

/**
 * Ponto de entrada principal do serviço:
 * Recebe o texto livre, analisa, compara e gera o texto para pedidos.
 */
async function compararCotacoesTexto(texto, options = {}) {
  if (!texto || !String(texto).trim()) {
    throw new Error('Texto de cotação não fornecido.');
  }

  const usarIA = options.usarIA === true;
  let dadosExtraidos;

  if (usarIA) {
    dadosExtraidos = await parsearTextoComIA(texto);
  } else {
    dadosExtraidos = parsearTextoLocal(texto);
    // Se o parser local não encontrou quase nada mas o texto é longo, tenta IA se configurada
    if (dadosExtraidos.itens.length === 0 && texto.length > 50 && (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY)) {
      dadosExtraidos = await parsearTextoComIA(texto);
    }
  }

  if (!dadosExtraidos || dadosExtraidos.itens.length === 0) {
    return {
      success: false,
      mensagem: 'Nenhum produto ou preço foi identificado no texto fornecido. Verifique o formato e tente novamente.',
      fornecedoresEncontrados: [],
      itensComparados: [],
      textoFormatado: '',
      fornecedoresResumo: []
    };
  }

  const comparativo = processarComparativo(dadosExtraidos.itens);
  const resultadoTexto = gerarTextoFormatadoPedidos(
    comparativo.vencedoresPorFornecedor,
    options.quantidades || {}
  );

  return {
    success: true,
    estatisticas: {
      totalFornecedores: dadosExtraidos.fornecedores.length,
      totalOfertas: dadosExtraidos.itens.length,
      totalProdutosUnicos: comparativo.itensComparados.length,
      economiaTotalEstimada: comparativo.totalEconomiaEstimada
    },
    fornecedoresEncontrados: dadosExtraidos.fornecedores,
    itensComparados: comparativo.itensComparados,
    textoFormatado: resultadoTexto.textoCompleto,
    fornecedoresResumo: resultadoTexto.fornecedoresResumo
  };
}

module.exports = {
  parsePrice,
  formatMoney,
  normalizarNomeProduto,
  parsearTextoLocal,
  parsearTextoComIA,
  processarComparativo,
  gerarTextoFormatadoPedidos,
  compararCotacoesTexto
};
