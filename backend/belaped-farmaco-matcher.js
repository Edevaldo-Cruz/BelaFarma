/**
 * belaped-farmaco-matcher.js
 * Módulo inteligente de normalização farmacêutica, desvinculação de marcas comerciais,
 * extração de essência/DCB e validação estrita de equivalência para cotação do menor preço geral.
 */

// Lista de principais laboratórios conhecidos para identificação e limpeza
const LABORATORIOS_CONHECIDOS = [
  'EMS', 'EUROFARMA', 'MEDLEY', 'NEO QUIMICA', 'NEOQUIMICA', 'TEUTO', 'CIMED', 'PRATI DONADUZZI',
  'PRATI', 'ACHE', 'BIOSINTETICA', 'BIOLAB', 'SANDOZ', 'LEGRAND', 'GERMED', 'NOVA QUIMICA',
  'NOVAQUIMICA', 'GLOBO', 'GEOLAB', 'ZODIAC', 'ALCON', 'TORRENT', 'MANTECORP', 'HYPERA',
  'CRISTALIA', 'UNIAO QUIMICA', 'VITAMEDIC', 'BRAINFARMA', 'ASPEN', 'ABBOTT', 'SANOFI',
  'PFIZER', 'BAYER', 'NOVARTIS', 'GSK', 'ASTRAZENECA', 'TAKEDA', 'BOEHRINGER', 'ALTHAIA',
  'MOMENTA', 'MULTILAB', 'KLEY HERTZ', 'HERTZ', 'CATARINENSE', 'AIRELA', 'NATULAB', 'CIFARMA',
  'PHARLAB', 'AUROBINDO', 'APSEN', 'GLENMARK', 'RANBAXY', 'ACCORD', 'BLAU', 'VIATRIS', 'TEVA',
  'CELLERA', 'SUPERA', 'FARMACE', 'HALEX ISTAR', 'HIPOLABOR', 'EQUIPLEX', 'SAMTEC',
  'NOVA QUIM', 'NOVAQUI', 'MEDQUIMICA', 'FARMAX'
];

// Dicionário de sinonímias entre medicamentos de Marca/Referência e a DCB (Princípio Ativo)
const MAPA_MARCAS_REFERENCIA = {
  'FORXIGA': 'DAPAGLIFLOZINA',
  'JARDIANCE': 'EMPAGLIFLOZINA',
  'GLIFAGE': 'METFORMINA',
  'CRESTOR': 'ROSUVASTATINA',
  'LIPITOR': 'ATORVASTATINA',
  'SELOZOK': 'METOPROLOL',
  'ARADOIS': 'LOSARTANA',
  'DIOVAN': 'VALSARTANA',
  'COZAAR': 'LOSARTANA',
  'DAFLON': 'DIOSMINA HESPERIDINA',
  'PLAVIX': 'CLOPIDOGREL',
  'ELIQUIS': 'APIXABANA',
  'XARELTO': 'RIVAROXABANA',
  'PANTOCAL': 'PANTOPRAZOL',
  'NEXIUM': 'ESOMEPRAZOL',
  'LOSEC': 'OMEPRAZOL',
  'TYLENOL': 'PARACETAMOL',
  'NOVALGINA': 'DIPIRONA',
  'ANADOR': 'DIPIRONA',
  'DORFLEX': 'DIPIRONA ORFENADRINA CAFEINA',
  'NEOSALGINA': 'DIPIRONA ISOMETEPTENO CAFEINA',
  'TORSILAX': 'CAFEINA CARISOPRODOL DICLOFENACO PARACETAMOL',
  'TANDRILAX': 'CAFEINA CARISOPRODOL DICLOFENACO PARACETAMOL',
  'RIVOTRIL': 'CLONAZEPAM',
  'FRONTAL': 'ALPRAZOLAM',
  'LEXOTAN': 'BROMAZEPAM',
  'VALIUM': 'DIAZEPAM',
  'STILNOX': 'ZOLPIDEM',
  'PROZAC': 'FLUOXETINA',
  'ZOLOFT': 'SERTRALINA',
  'LEXAPRO': 'ESCITALOPRAM',
  'EFEXOR': 'VENLAFAXINA',
  'PRISTIQ': 'DESVENLAFAXINA',
  'CYMBALTA': 'DULOXETINA',
  'LYRICA': 'PREGABALINA',
  'NEURONTIN': 'GABAPENTINA',
  'TOPAMAX': 'TOPIRAMATO',
  'TEGRETOL': 'CARBAMAZEPINA',
  'DEPAKOTE': 'DIVALPROATO',
  'DEPAKENE': 'ACIDO VALPROICO',
  'LAMICTAL': 'LAMOTRIGINA',
  'KEPPRA': 'LEVETIRACETAM',
  'TRILEPTAL': 'OXCARBAZEPINA',
  'AEROLIN': 'SALBUTAMOL',
  'BUSCOPAN': 'ESCOPOLAMINA',
  'LUFTAL': 'SIMETICONA',
  'FLORATIL': 'SACCHAROMYCES BOULARDII',
  'DRAMIN': 'DIMENIDRINATO',
  'VONAU': 'ONDANSETRONA',
  'PLASIL': 'METOCLOPRAMIDA',
  'MOTILIUM': 'DOMPERIDONA',
  'ALLEGRA': 'FEXOFENADINA',
  'CLARITIN': 'LORATADINA',
  'DESALEX': 'DESLORATADINA',
  'ZITROMAX': 'AZITROMICINA',
  'AMOXIL': 'AMOXICILINA',
  'CLAVULIN': 'AMOXICILINA CLAVULANATO',
  'CIPRO': 'CIPROFLOXACINO',
  'LEVAQUIN': 'LEVOFLOXACINO',
  'KEFLEX': 'CEFALEXINA',
  'BACTRIM': 'SULFAMETOXAZOL TRIMETOPRIMA',
  'NISULID': 'NIMESULIDA',
  'CATAFLAM': 'DICLOFENACO POTASSICO',
  'VOLTAREN': 'DICLOFENACO SODICO',
  'ALIVIUM': 'IBUPROFENO',
  'ADVIL': 'IBUPROFENO',
  'FLANAX': 'NAPROXENO',
  'CELEBRA': 'CELECOXIBE',
  'ARCOXIA': 'ETORICOXIBE',
  'VIAGRA': 'SILDENAFILA',
  'CIALIS': 'TADALAFILA',
  'BETASERC': 'BETAISTINA',
  'LABIRIN': 'BETAISTINA'
};

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
 * Extrai a dosagem de uma descrição farmacêutica (ex: "50MG", "500MG", "10MG/ML", "5%", "0.5MG", "50MCG")
 */
function extrairDosagem(txt) {
  const norm = normalizarTexto(txt);
  
  // Trata casos comuns de abreviação como "16 M C/" ou "16M "
  const normAjustada = norm.replace(/\b(\d+)\s*M\s*(?:C\/|CPR|COMP|\/)\b/i, '$1MG ');

  // Procura padrões como "500MG", "50 MG", "10MG/ML", "50 MCG", "10 UI", "0,5%", "5%"
  const regex = /(\b\d+([.,]\d+)?\s*(MG\/ML|MCG\/ML|G\/ML|MG|MCG|G|UI|ML|%)\b)/i;
  const match = normAjustada.match(regex);
  if (match) {
    return match[1].replace(/\s+/g, '').replace(',', '.').toUpperCase();
  }
  return null;
}

/**
 * Extrai a quantidade e forma farmacêutica (ex: "30 CPR", "60 CAPS", "100 ML", "1 BL X 30")
 */
function extrairQuantidadeEForma(txt) {
  const norm = normalizarTexto(txt);

  // Caso: "1 BL X 30" ou "2 BL X 15"
  const regexBlister = /\b\d+\s*BL\s*X\s*(\d+)\b/i;
  const matchBlister = norm.match(regexBlister);
  if (matchBlister) {
    return { numero: parseInt(matchBlister[1], 10), forma: 'CPR' };
  }

  // Caso: "2X56UNID" ou "2X60" (ex: fraldas)
  const regexPacote = /\b\d+\s*X\s*(\d+)\s*(?:UNID|UN)?\b/i;
  const matchPacote = norm.match(regexPacote);
  if (matchPacote) {
    return { numero: parseInt(matchPacote[1], 10), forma: 'UN' };
  }

  // Caso: "C/ 30 CPR", "C/ 60 COMP", "30 CPR", "60 CAPS", "10 COMP"
  const regexQtd = /(\b(?:C\/\s*)?(\d+)\s*(COMPRIMIDOS|COMPRIMIDO|COMP|CPR|CPS|CAPSULAS|CAPSULA|CAP|SACHES|SACHE|ENV|FLAC|AMP|TUBOS|TUBO)\b)/i;
  const matchQtd = norm.match(regexQtd);
  if (matchQtd) {
    const numero = matchQtd[2];
    const rawForma = matchQtd[3].toUpperCase();
    let forma = 'CPR';
    if (rawForma.includes('CAP')) forma = 'CAP';
    if (rawForma.includes('SACH') || rawForma.includes('ENV')) forma = 'SACHE';
    if (rawForma.includes('FLAC') || rawForma.includes('AMP')) forma = 'AMP';
    return { numero: parseInt(numero, 10), forma };
  }

  // Caso: Volume em ML / G / GR (ex: "60ML", "15 ML", "60 GR", "90G")
  const regexVol = /(\b\d+([.,]\d+)?\s*(ML|GR|G)\b)/i;
  const matchVol = norm.match(regexVol);
  if (matchVol) {
    const numero = parseFloat(matchVol[1].replace(',', '.'));
    let unidade = matchVol[3].toUpperCase();
    if (unidade === 'GR') unidade = 'G';
    return { numero, forma: unidade };
  }

  return null;
}

/**
 * Identifica o laboratório / fabricante em uma descrição
 */
function extrairLaboratorio(descricao) {
  const norm = normalizarTexto(descricao);
  for (const lab of LABORATORIOS_CONHECIDOS) {
    if (new RegExp(`\\b${lab}\\b`, 'i').test(norm)) {
      return lab;
    }
  }
  // Suffixos comuns de distribuidoras: -MQG (Neo Química), -NVG (Nova Química), -TUS (Teuto), -EMS, etc.
  if (norm.includes('-MQG')) return 'NEO QUIMICA';
  if (norm.includes('-NVG')) return 'NOVA QUIMICA';
  if (norm.includes('-TUS')) return 'TEUTO';
  if (norm.includes('-EMS')) return 'EMS';
  if (norm.includes('-EGF')) return 'EUROFARMA';
  if (norm.includes('-MDL')) return 'MEDLEY';
  if (norm.includes('-PRT')) return 'PRATI';
  if (norm.includes('-CMD')) return 'CIMED';
  return 'GENÉRICO';
}

/**
 * Extrai o princípio ativo ou termo base de busca da descrição, removendo laboratórios e dosagens
 */
function extrairTermoBuscaGenerico(descricao) {
  let termo = normalizarTexto(descricao);

  // Remove prefixos de distribuidora como FP (Farmácia Popular), GEN, GN
  termo = termo.replace(/^(FP|GEN|GN)\s+/i, '');

  // Verifica se a primeira palavra é uma marca de referência conhecida (ex: FORXIGA -> DAPAGLIFLOZINA)
  const primeiraPalavra = termo.split(' ')[0];
  if (MAPA_MARCAS_REFERENCIA[primeiraPalavra]) {
    return MAPA_MARCAS_REFERENCIA[primeiraPalavra];
  }

  // Remove termos operacionais e radicais de sais farmacêuticos comuns que variam por distribuidora
  const termosRemover = [
    'GENERICO', 'GEN', 'SIMILAR', 'SIM', 'REFERENCIA', 'REF', 'COMPRIMIDOS', 'COMPRIMIDO',
    'COMP', 'CPR', 'CAPSULAS', 'CAPSULA', 'CAPS', 'CPS', 'BLIST', 'CX', 'DISPLAY', 'EMB',
    'REV', 'REVESTIDO', 'REVESTIDOS', 'SOLUCAO', 'SUSPENSAO', 'GOTAS', 'GTS', 'XAROPE', 'XPE',
    'DICLORIDRATO', 'DICLORID', 'DICLOR', 'CLORIDRATO', 'CLORID', 'CLOR',
    'CALCICA', 'CALCICO', 'CAL', 'SODICA', 'SODICO', 'SOD',
    'POTASSICA', 'POTASSICO', 'BESILATO', 'MESILATO', 'MALEATO', 'OXALATO', 'BISSULFATO', 'BISSULF', 'BROMIDRATO', 'FUROATO',
    'SUCCINATO', 'HEMITARTARATO', 'FOSFATO', 'TARTRATO', 'MONOIDRATADO', 'HEMIDRATADO',
    'DIPROPIONATO', 'PROPIONATO', 'VALERATO', 'ACETONIDO'
  ];

  for (const t of termosRemover) {
    termo = termo.replace(new RegExp(`\\b${t}\\b`, 'gi'), ' ');
  }

  // Remove laboratórios conhecidos
  for (const lab of LABORATORIOS_CONHECIDOS) {
    termo = termo.replace(new RegExp(`\\b${lab}\\b`, 'gi'), ' ');
  }

  // Remove sufixos tipo "-MQG", "-NVG", "-TUS", "-TRL"
  termo = termo.replace(/-[A-Z0-9]{2,4}\b/gi, ' ');

  // Remove dosagens e volumes (ex: 50MG, 500MG, 30CPR, 1 BL X 30)
  termo = termo.replace(/\b\d+([.,]\d+)?\s*(MG\/ML|MCG\/ML|G\/ML|MG|MCG|G|GR|UI|ML|%)\b/gi, ' ');
  termo = termo.replace(/\b\d+\s*BL\s*X\s*\d+\b/gi, ' ');
  termo = termo.replace(/\b\d+\s*(CPR|COMP|CAPS|CPS|ENV|SACHE|UNID)\b/gi, ' ');
  termo = termo.replace(/\bC\/\s*\d+\b/gi, ' ');
  termo = termo.replace(/\b\d+\b/g, ' '); // remove números soltos

  termo = termo.replace(/\s+/g, ' ').trim();

  // Pega os termos significativos (ex: "ROSUVASTATINA CALCICA", "DAPAGLIFLOZINA", "ACIDO MEFENAMICO")
  const partes = termo.split(' ').filter(p => p.length >= 3 && !p.startsWith('-'));
  if (partes.length >= 2) {
    return partes.slice(0, 2).join(' ');
  }
  return partes[0] || normalizarTexto(descricao).split(' ')[0] || '';
}

/**
 * Constrói o termo de busca ideal para disparar nos motores de busca das distribuidoras
 * Ex: "ROSUVASTATINA 20MG" ou "DAPAGLIFLOZINA 10MG" ou "METFORMINA 500MG"
 */
function construirTermoBuscaEssencia(descricao) {
  const ativo = extrairTermoBuscaGenerico(descricao);
  const dosagem = extrairDosagem(descricao);
  if (ativo && dosagem) {
    return `${ativo} ${dosagem}`.trim();
  }
  if (ativo) {
    return ativo.trim();
  }
  return normalizarTexto(descricao).split(' ').slice(0, 2).join(' ');
}

/**
 * Validação rigorosa de equivalência técnica para cotação por essência / menor preço
 * Exige:
 * 1. Mesmo princípio ativo / essência.
 * 2. Mesma dosagem rigorosa (ex: 20mg não substitui 10mg ou 40mg).
 * 3. Mesma quantidade na embalagem (ex: 30 cpr não substitui 60 cpr).
 * 4. Mesma forma farmacêutica compatível (comprimido com comprimido, gotas com gotas).
 */
function validarEquivalenciaEstrita(itemOriginal, candidato) {
  if (!itemOriginal || !candidato) return false;

  const descOrig = itemOriginal.descricao || '';
  const descCand = candidato.descricao || '';

  const normOrig = normalizarTexto(descOrig);
  const normCand = normalizarTexto(descCand);

  // 1. Validação de Princípio Ativo / Ativo Base
  let termoOrig = extrairTermoBuscaGenerico(descOrig);
  let termoCand = extrairTermoBuscaGenerico(descCand);

  // Se o original é marca de referência, já foi convertido para o ativo (ex: FORXIGA -> DAPAGLIFLOZINA)
  const primeiraPalavraOrig = normOrig.split(' ')[0];
  if (MAPA_MARCAS_REFERENCIA[primeiraPalavraOrig]) {
    termoOrig = MAPA_MARCAS_REFERENCIA[primeiraPalavraOrig];
  }

  const primeiraPalavraCand = normCand.split(' ')[0];
  if (MAPA_MARCAS_REFERENCIA[primeiraPalavraCand]) {
    termoCand = MAPA_MARCAS_REFERENCIA[primeiraPalavraCand];
  }

  // Verifica se o ativo coincide (pelo menos o primeiro termo radical do princípio, ex: ROSUVASTATINA)
  const raizOrig = termoOrig.split(' ')[0];
  const raizCand = termoCand.split(' ')[0];

  if (raizOrig.length >= 4 && raizCand.length >= 4) {
    if (!normCand.includes(raizOrig) && raizOrig !== raizCand) {
      return false;
    }
  }

  // 2. Validação Rigorosa de Dosagem
  const dosagemOrig = extrairDosagem(descOrig);
  const dosagemCand = extrairDosagem(descCand);

  if (dosagemOrig || dosagemCand) {
    if (!dosagemOrig || !dosagemCand) return false;
    if (dosagemOrig !== dosagemCand) return false; // dosagens distintas rejeitadas imediatamente
  }

  // 3. Validação Rigorosa de Quantidade na Embalagem e Forma Farmacêutica
  const qtdOrig = extrairQuantidadeEForma(descOrig);
  const qtdCand = extrairQuantidadeEForma(descCand);

  if (qtdOrig && qtdCand) {
    // Quantidade de comprimidos ou volume: tolera equivalência de 28 vs 30 comprimidos (tratamento mensal crônico)
    const ehEquivalenteMensal = (qtdOrig.numero === 28 && qtdCand.numero === 30) || (qtdOrig.numero === 30 && qtdCand.numero === 28);
    if (qtdOrig.numero !== qtdCand.numero && !ehEquivalenteMensal) {
      return false; // rejeita 30 vs 60 cpr, ou 15ml vs 30ml
    }

    // Forma farmacêutica
    if (qtdOrig.forma !== qtdCand.forma) {
      // Tolera apenas CPR vs CAP se a dosagem bater, mas nunca CPR vs ML/G/GTS
      const formasSolid = ['CPR', 'CAP'];
      const origSolid = formasSolid.includes(qtdOrig.forma);
      const candSolid = formasSolid.includes(qtdCand.forma);
      if (origSolid !== candSolid) {
        return false;
      }
    }
  } else if (qtdOrig && !qtdCand) {
    // Se o original especifica quantidade e o candidato não, rejeita por segurança
    return false;
  }

  return true;
}

module.exports = {
  normalizarTexto,
  extrairDosagem,
  extrairQuantidadeEForma,
  extrairLaboratorio,
  extrairTermoBuscaGenerico,
  construirTermoBuscaEssencia,
  validarEquivalenciaEstrita,
  MAPA_MARCAS_REFERENCIA,
  LABORATORIOS_CONHECIDOS
};
