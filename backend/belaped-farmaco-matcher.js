/**
 * belaped-farmaco-matcher.js
 * Módulo inteligente de normalização, extração de dados farmacêuticos
 * e validação de equivalência para cotação do genérico mais barato e perfumaria.
 */

// Lista de principais laboratórios conhecidos para identificação e limpeza
const LABORATORIOS_CONHECIDOS = [
  'EMS', 'EUROFARMA', 'MEDLEY', 'NEO QUIMICA', 'NEOQUIMICA', 'TEUTO', 'CIMED', 'PRATI DONADUZZI',
  'PRATI', 'ACHE', 'BIOSINTETICA', 'BIOLAB', 'SANDOZ', 'LEGRAND', 'GERMED', 'NOVA QUIMICA',
  'NOVAQUIMICA', 'GLOBO', 'GEOLAB', 'ZODIAC', 'ALCON', 'TORRENT', 'MANTECORP', 'HYPERA',
  'CRISTALIA', 'UNIAO QUIMICA', 'VITAMEDIC', 'BRAINFARMA', ' Aspen', 'ABBOTT', 'SANOFI',
  'PFIZER', 'BAYER', 'NOVARTIS', 'GSK', 'ASTRAZENECA', 'TAKEDA', 'BOEHRINGER'
];

/**
 * Normaliza string removendo acentos, pontuações desnecessárias e múltiplos espaços
 */
function normalizarTexto(txt) {
  if (!txt) return '';
  return txt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s\.\,\-\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai a dosagem de uma descrição farmacêutica (ex: "50MG", "500MG", "10MG/ML", "5%", "0.5MG")
 */
function extrairDosagem(txt) {
  const norm = normalizarTexto(txt);
  // Procura padrões como "500MG", "50 MG", "10MG/ML", "50 MCG", "10 UI", "0,5%", "5%"
  const regex = /(\b\d+([.,]\d+)?\s*(MG\/ML|MCG\/ML|G\/ML|MG|MCG|G|UI|ML|%)\b)/i;
  const match = norm.match(regex);
  if (match) {
    return match[1].replace(/\s+/g, '').replace(',', '.').toUpperCase();
  }
  return null;
}

/**
 * Extrai a quantidade e forma farmacêutica (ex: "30 CPR", "60 CAPS", "100 ML", "1 FRASCO")
 */
function extrairQuantidadeEForma(txt) {
  const norm = normalizarTexto(txt);
  
  // Procura quantidade de comprimidos/cápsulas/sachês/flaconetes
  const regexQtd = /(\b\d+\s*(COMPRIMIDOS|COMPRIMIDO|COMP|CPR|CPS|CAPSULAS|CAPSULA|CAP|SACHES|SACHE|ENV|FLAC|AMP|TUBOS|TUBO)\b)/i;
  const matchQtd = norm.match(regexQtd);
  if (matchQtd) {
    const raw = matchQtd[1].toUpperCase();
    const numero = raw.match(/\d+/)[0];
    let forma = 'CPR';
    if (raw.includes('CAP')) forma = 'CAP';
    if (raw.includes('SACH') || raw.includes('ENV')) forma = 'SACHE';
    if (raw.includes('FLAC') || raw.includes('AMP')) forma = 'AMP';
    return { numero: parseInt(numero, 10), forma };
  }

  // Procura volume em ML/G (gotas, xaropes, cremes)
  const regexVol = /(\b\d+([.,]\d+)?\s*(ML|G)\b)/i;
  const matchVol = norm.match(regexVol);
  if (matchVol) {
    const numero = parseFloat(matchVol[1].replace(',', '.'));
    const unidade = matchVol[3].toUpperCase();
    return { numero, forma: unidade };
  }

  return null;
}

/**
 * Extrai o princípio ativo ou termo base de busca da descrição, removendo laboratórios e dosagens
 */
function extrairTermoBuscaGenerico(descricao) {
  let termo = normalizarTexto(descricao);

  // Remove termos como GENERICO, GEN, SIMILAR, SIM, REF, CPR, CAPS, COMP, CX, DISPLAY
  const termosRemover = [
    'GENERICO', 'GEN', 'SIMILAR', 'SIM', 'REFERENCIA', 'REF', 'COMPRIMIDOS', 'COMPRIMIDO',
    'COMP', 'CPR', 'CAPSULAS', 'CAPSULA', 'CAPS', 'CPS', 'BLIST', 'CX', 'DISPLAY', 'EMB'
  ];

  for (const t of termosRemover) {
    termo = termo.replace(new RegExp(`\\b${t}\\b`, 'gi'), ' ');
  }

  // Remove nomes de laboratórios no final ou meio da string
  for (const lab of LABORATORIOS_CONHECIDOS) {
    termo = termo.replace(new RegExp(`\\b${lab}\\b`, 'gi'), ' ');
  }

  // Remove dosagens e volumes (ex: 50MG, 500MG, 30CPR)
  termo = termo.replace(/\b\d+([.,]\d+)?\s*(MG\/ML|MCG\/ML|G\/ML|MG|MCG|G|UI|ML|%)\b/gi, ' ');
  termo = termo.replace(/\b\d+\s*(CPR|COMP|CAPS|CPS|ENV|SACHE)\b/gi, ' ');
  termo = termo.replace(/\b\d+\b/g, ' '); // remove números soltos

  termo = termo.replace(/\s+/g, ' ').trim();

  // Pega os 2 a 3 primeiros termos significativos (ex: "LOSARTANA POTASSICA", "DIPIRONA MONOIDRATADA")
  const partes = termo.split(' ').filter(p => p.length >= 3);
  if (partes.length >= 2) {
    return partes.slice(0, 2).join(' ');
  }
  return partes[0] || normalizarTexto(descricao).split(' ')[0] || '';
}

/**
 * Extrai marca de perfumaria da descrição
 */
function extrairMarcaPerfumaria(descricao) {
  const norm = normalizarTexto(descricao);
  const marcas = [
    'DOVE', 'REXONA', 'SEDA', 'TRESEMME', 'CLEAR', 'LUX', 'NIVEA', 'COLGATE', 'ORAL-B',
    'ORAL B', 'SENSODYNE', 'CLOSE UP', 'CLOSEUP', 'PAMPERS', 'HUGGIES', 'BABYSEC',
    'INTIMUS', 'ALWAYS', 'SUNDOWN', 'CENOURA & BRONZE', 'NEUTROGENA', 'JOHNSON', 'PALMOLIVE',
    'DARLENE', 'FARMAX', 'COPERALCOOL', 'CREMER', 'GRANADO', 'GIOVANNA BABY'
  ];

  for (const m of marcas) {
    if (new RegExp(`\\b${m}\\b`, 'i').test(norm)) {
      return m;
    }
  }
  return null;
}

/**
 * Valida se um produto encontrado no portal é equivalente ao produto desejado
 * @param {Object} itemOriginal - { descricao, ean, tipo_categoria }
 * @param {Object} itemCandidato - { descricao, ean, preco, estoque }
 * @returns {Boolean}
 */
function validarEquivalencia(itemOriginal, itemCandidato) {
  if (!itemOriginal || !itemCandidato) return false;

  // Se o EAN for exatamente idêntico, é 100% equivalente
  if (itemOriginal.ean && itemCandidato.ean && itemOriginal.ean === itemCandidato.ean) {
    return true;
  }

  const descOrig = itemOriginal.descricao || '';
  const descCand = itemCandidato.descricao || '';

  // Caso 1: Medicamentos (Princípio Ativo / Genéricos)
  if (itemOriginal.tipo_categoria === 'MEDICAMENTO' || !itemOriginal.tipo_categoria) {
    const dosagemOrig = extrairDosagem(descOrig);
    const dosagemCand = extrairDosagem(descCand);

    // Se o original tem dosagem, o candidato DEVE ter exatamente a mesma dosagem
    if (dosagemOrig && dosagemCand) {
      if (dosagemOrig !== dosagemCand) {
        return false; // Dosagens diferentes (ex: 50mg vs 100mg)
      }
    } else if (dosagemOrig && !dosagemCand) {
      return false;
    }

    const qtdOrig = extrairQuantidadeEForma(descOrig);
    const qtdCand = extrairQuantidadeEForma(descCand);

    // Se ambos têm quantidade/forma, validar correspondência
    if (qtdOrig && qtdCand) {
      if (qtdOrig.numero !== qtdCand.numero) {
        return false; // Quantidades diferentes (ex: 30 cpr vs 60 cpr)
      }
      if (qtdOrig.forma !== qtdCand.forma) {
        // Tolera CPR vs CAP se a dosagem bater, mas não CPR vs ML/Gotas
        if ((qtdOrig.forma === 'CPR' || qtdOrig.forma === 'CAP') && (qtdCand.forma === 'ML' || qtdCand.forma === 'G')) {
          return false;
        }
      }
    }

    // Valida que o candidato é genérico ou similar do mesmo ativo
    const termoOrig = extrairTermoBuscaGenerico(descOrig);
    const normCand = normalizarTexto(descCand);
    if (termoOrig && !normCand.includes(termoOrig)) {
      // Verifica se pelo menos o primeiro nome bate (ex: LOSARTANA)
      const primeiraPalavra = termoOrig.split(' ')[0];
      if (primeiraPalavra.length >= 4 && !normCand.includes(primeiraPalavra)) {
        return false;
      }
    }

    return true;
  }

  // Caso 2: Perfumaria
  if (itemOriginal.tipo_categoria === 'PERFUMARIA') {
    const marcaOrig = extrairMarcaPerfumaria(descOrig);
    const marcaCand = extrairMarcaPerfumaria(descCand);

    // Na perfumaria, a marca DEVE ser a mesma
    if (marcaOrig && marcaCand) {
      if (marcaOrig !== marcaCand) return false;
    } else if (marcaOrig && !marcaCand) {
      return false;
    }

    // Valida volume / quantidade se aplicável (ex: 200ml, 400ml, 50g)
    const volOrig = extrairDosagem(descOrig) || extrairQuantidadeEForma(descOrig);
    const volCand = extrairDosagem(descCand) || extrairQuantidadeEForma(descCand);
    if (volOrig && volCand) {
      const v1 = typeof volOrig === 'string' ? volOrig : `${volOrig.numero}${volOrig.forma}`;
      const v2 = typeof volCand === 'string' ? volCand : `${volCand.numero}${volCand.forma}`;
      if (v1 !== v2) return false;
    }

    return true;
  }

  return false;
}

module.exports = {
  normalizarTexto,
  extrairDosagem,
  extrairQuantidadeEForma,
  extrairTermoBuscaGenerico,
  extrairMarcaPerfumaria,
  validarEquivalencia
};
