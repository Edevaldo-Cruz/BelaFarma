/**
 * BelaFarma - Boleto Bancário & Concessionárias Parser (FEBRABAN Standard)
 * Suporta:
 * 1. Linha Digitável de Cobrança Bancária (47 dígitos)
 * 2. Código de Barras de Cobrança Bancária (44 dígitos)
 * 3. Linha Digitável de Arrecadação / Concessionárias / Tributos (48 dígitos)
 * 4. Código de Barras de Arrecadação (44 dígitos)
 *
 * Suporta o novo ciclo de Fator de Vencimento FEBRABAN pós-2025.
 */

export interface ParsedBoleto {
  raw: string;
  cleanCode: string;
  type: 'bancario' | 'arrecadacao';
  barcode: string; // 44 dígitos
  linhaDigitavel: string; // 47 ou 48 dígitos formatados
  bankCode?: string;
  bankName?: string;
  segmentName?: string;
  dueDate: string | null; // YYYY-MM-DD
  dueDaysRemaining?: number;
  value: number; // Ex: 150.25
  campoLivre?: string;
  convenioKey: string; // Chave para memória de fornecedor
  isValid: boolean;
  errorMessage?: string;
}

const BRAZILIAN_BANKS: Record<string, string> = {
  '001': 'Banco do Brasil',
  '003': 'Banco da Amazônia',
  '004': 'Banco do Nordeste',
  '033': 'Santander',
  '041': 'Banrisul',
  '070': 'BRB - Banco de Brasília',
  '077': 'Banco Inter',
  '085': 'Ailos / Viacredi',
  '104': 'Caixa Econômica Federal',
  '136': 'Unicred',
  '208': 'BTG Pactual',
  '212': 'Banco Original',
  '237': 'Bradesco',
  '260': 'Nubank',
  '336': 'C6 Bank',
  '341': 'Itaú Unibanco',
  '389': 'Banco Mercantil do Brasil',
  '422': 'Banco Safra',
  '633': 'Banco Rendimento',
  '655': 'Banco Votorantim',
  '748': 'Sicredi',
  '756': 'Sicoob',
};

const ARRECADACAO_SEGMENTS: Record<string, string> = {
  '1': 'Prefeitura / IPTU / ISS',
  '2': 'Saneamento / Água / Esgoto',
  '3': 'Energia Elétrica / Gás',
  '4': 'Telecomunicações / Internet / Telefone',
  '5': 'Órgão Governamental / Tributos / GPS / DAS',
  '6': 'Carnês / Outras Taxas',
  '7': 'Multas de Trânsito',
  '9': 'Outros Órgãos / Bancos',
};

/**
 * Calcula Módulo 10 de um bloco numérico
 */
export function modulo10(bloco: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = bloco.length - 1; i >= 0; i--) {
    let mul = parseInt(bloco[i], 10) * peso;
    if (mul > 9) mul = Math.floor(mul / 10) + (mul % 10);
    soma += mul;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

/**
 * Converte fator FEBRABAN para data ISO (YYYY-MM-DD)
 * Trata o novo ciclo FEBRABAN iniciado em 22/02/2025 (fator 1000).
 */
export function febrabanFactorToDate(factorStr: string): string | null {
  const factor = parseInt(factorStr, 10);
  if (!factor || isNaN(factor) || factor <= 0) return null;

  // Ciclo 1 (Base original): 07/10/1997
  const base1997 = new Date(Date.UTC(1997, 9, 7));
  const date1997 = new Date(base1997.getTime() + factor * 86400000);

  // Ciclo 2 (Novo ciclo 2025): 22/02/2025 para fator 1000
  const base2025 = new Date(Date.UTC(2025, 1, 22));
  const date2025 = new Date(base2025.getTime() + (factor - 1000) * 86400000);

  const currentYear = new Date().getFullYear();
  const diff1997 = Math.abs(date1997.getUTCFullYear() - currentYear);
  const diff2025 = Math.abs(date2025.getUTCFullYear() - currentYear);

  const chosenDate = diff2025 < diff1997 ? date2025 : date1997;
  return chosenDate.toISOString().split('T')[0];
}

/**
 * Extrai a chave de convênio / cedente para inteligência de memória do fornecedor
 */
function extractConvenioKey(bankCode: string, campoLivre: string): string {
  if (!campoLivre) return `BANCO_${bankCode}`;

  // Bradesco (237): Agência (4) + Carteira (2) + Conta/Cedente (7) = primeiros 13 caracteres
  if (bankCode === '237') {
    const agencia = campoLivre.slice(0, 4);
    const conta = campoLivre.slice(6, 13);
    return `237_AG${agencia}_CC${conta}`;
  }

  // Itaú (341): Carteira (3) + Nosso Número (8) + Agência (4) + Conta (5)
  if (bankCode === '341') {
    const agencia = campoLivre.slice(11, 15);
    const conta = campoLivre.slice(15, 20);
    return `341_AG${agencia}_CC${conta}`;
  }

  // Banco do Brasil (001): Primeiros 7 ou 6 dígitos geralmente são o número do Convênio
  if (bankCode === '001') {
    const convenio = campoLivre.slice(0, 7);
    return `001_CONV${convenio}`;
  }

  // Santander (033): Código do Cedente (7 dígitos)
  if (bankCode === '033') {
    const cedente = campoLivre.slice(0, 7);
    return `033_CED${cedente}`;
  }

  // Caixa (104): Código do Beneficiário (6 dígitos)
  if (bankCode === '104') {
    const beneficiario = campoLivre.slice(0, 6);
    return `104_BEN${beneficiario}`;
  }

  // Sicoob (756): Cooperativa (4) + Cliente (7)
  if (bankCode === '756') {
    const coop = campoLivre.slice(0, 4);
    const cliente = campoLivre.slice(4, 11);
    return `756_COOP${coop}_CLI${cliente}`;
  }

  // Sicredi (748): Agência (4) + Posto (2) + Cedente (5)
  if (bankCode === '748') {
    const agencia = campoLivre.slice(0, 4);
    const cedente = campoLivre.slice(6, 11);
    return `748_AG${agencia}_CED${cedente}`;
  }

  // Genérico: Banco + primeiros 12 dígitos do campo livre
  return `${bankCode}_${campoLivre.slice(0, 12)}`;
}

/**
 * Formata linha digitável bancária (47 dígitos)
 */
export function formatLinhaBancaria(d: string): string {
  if (d.length !== 47) return d;
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33)}`;
}

/**
 * Formata linha digitável de concessionária (48 dígitos)
 */
export function formatLinhaArrecadacao(d: string): string {
  if (d.length !== 48) return d;
  return `${d.slice(0, 12)} ${d.slice(12, 24)} ${d.slice(24, 36)} ${d.slice(36, 48)}`;
}

/**
 * Função principal para parser de qualquer boleto digitado ou bipado
 */
export function parseBoleto(input: string): ParsedBoleto {
  const raw = String(input || '').trim();
  const cleanCode = raw.replace(/\D/g, '');

  if (!cleanCode) {
    return {
      raw,
      cleanCode: '',
      type: 'bancario',
      barcode: '',
      linhaDigitavel: '',
      dueDate: null,
      value: 0,
      convenioKey: '',
      isValid: false,
      errorMessage: 'Código vazio ou inválido',
    };
  }

  // Identifica se é Arrecadação / Concessionária (começa com 8)
  const isArrecadacao = cleanCode.startsWith('8');

  if (isArrecadacao) {
    return parseArrecadacao(cleanCode, raw);
  } else {
    return parseBoletoBancario(cleanCode, raw);
  }
}

/**
 * Parser de Título Bancário (47 dígitos linha digitável ou 44 dígitos código de barras)
 */
function parseBoletoBancario(cleanCode: string, raw: string): ParsedBoleto {
  let barcode = '';
  let linhaDigitavel = '';
  let bankCode = '';
  let campoLivre = '';
  let factorStr = '';
  let valueStr = '';

  if (cleanCode.length === 47) {
    // Linha Digitável: 47 dígitos
    // [0..2] Banco, [3] Moeda, [4..8] CampoLivre1, [9] DV1
    // [10..19] CampoLivre2, [20] DV2
    // [21..30] CampoLivre3, [31] DV3
    // [32] DV Geral
    // [33..36] Fator Vencimento
    // [37..46] Valor (10 dígitos)
    bankCode = cleanCode.slice(0, 3);
    const moeda = cleanCode.slice(3, 4);
    const cl1 = cleanCode.slice(4, 9);
    const cl2 = cleanCode.slice(10, 20);
    const cl3 = cleanCode.slice(21, 31);
    const dvGeral = cleanCode.slice(32, 33);
    factorStr = cleanCode.slice(33, 37);
    valueStr = cleanCode.slice(37, 47);

    campoLivre = cl1 + cl2 + cl3;
    barcode = bankCode + moeda + dvGeral + factorStr + valueStr + campoLivre;
    linhaDigitavel = formatLinhaBancaria(cleanCode);
  } else if (cleanCode.length === 44) {
    // Código de Barras puro: 44 dígitos
    // [0..2] Banco, [3] Moeda, [4] DV Geral
    // [5..8] Fator Vencimento
    // [9..18] Valor
    // [19..43] Campo Livre (25 dígitos)
    bankCode = cleanCode.slice(0, 3);
    const moeda = cleanCode.slice(3, 4);
    const dvGeral = cleanCode.slice(4, 5);
    factorStr = cleanCode.slice(5, 9);
    valueStr = cleanCode.slice(9, 19);
    campoLivre = cleanCode.slice(19, 44);
    barcode = cleanCode;

    // Reconstrói Linha Digitável com DVs dos blocos
    const c1 = bankCode + moeda + campoLivre.slice(0, 5);
    const dv1 = modulo10(c1);

    const c2 = campoLivre.slice(5, 15);
    const dv2 = modulo10(c2);

    const c3 = campoLivre.slice(15, 25);
    const dv3 = modulo10(c3);

    const fullLinha = `${c1}${dv1}${c2}${dv2}${c3}${dv3}${dvGeral}${factorStr}${valueStr}`;
    linhaDigitavel = formatLinhaBancaria(fullLinha);
  } else {
    return {
      raw,
      cleanCode,
      type: 'bancario',
      barcode: '',
      linhaDigitavel: cleanCode,
      dueDate: null,
      value: 0,
      convenioKey: '',
      isValid: false,
      errorMessage: `Tamanho inválido para boleto bancário (${cleanCode.length} dígitos. Esperado 47 ou 44 dígitos).`,
    };
  }

  const bankName = BRAZILIAN_BANKS[bankCode] || `Banco (${bankCode})`;
  const dueDate = febrabanFactorToDate(factorStr);
  const rawValue = parseInt(valueStr, 10);
  const value = isNaN(rawValue) ? 0 : rawValue / 100;

  let dueDaysRemaining: number | undefined;
  if (dueDate) {
    const dueTime = new Date(dueDate + 'T00:00:00').getTime();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDaysRemaining = Math.round((dueTime - today.getTime()) / 86400000);
  }

  const convenioKey = extractConvenioKey(bankCode, campoLivre);

  return {
    raw,
    cleanCode,
    type: 'bancario',
    barcode,
    linhaDigitavel,
    bankCode,
    bankName,
    dueDate,
    dueDaysRemaining,
    value,
    campoLivre,
    convenioKey,
    isValid: true,
  };
}

/**
 * Parser de Concessionária / Arrecadação (48 dígitos ou 44 dígitos)
 */
function parseArrecadacao(cleanCode: string, raw: string): ParsedBoleto {
  let barcode = '';
  let linhaDigitavel = '';
  let valueStr = '';

  const segmentCode = cleanCode.slice(1, 2);
  const segmentName = ARRECADACAO_SEGMENTS[segmentCode] || 'Arrecadação / Tributo';

  if (cleanCode.length === 48) {
    // 4 blocos de 12 (11 dados + 1 DV em cada)
    linhaDigitavel = formatLinhaArrecadacao(cleanCode);
    const b1 = cleanCode.slice(0, 11);
    const b2 = cleanCode.slice(12, 23);
    const b3 = cleanCode.slice(24, 35);
    const b4 = cleanCode.slice(36, 47);
    barcode = b1 + b2 + b3 + b4;
    valueStr = barcode.slice(4, 15);
  } else if (cleanCode.length === 44) {
    barcode = cleanCode;
    linhaDigitavel = cleanCode;
    valueStr = cleanCode.slice(4, 15);
  } else {
    return {
      raw,
      cleanCode,
      type: 'arrecadacao',
      barcode: '',
      linhaDigitavel: cleanCode,
      segmentName,
      dueDate: null,
      value: 0,
      convenioKey: `ARREC_${segmentCode}`,
      isValid: false,
      errorMessage: `Tamanho inválido para boleto de concessionária (${cleanCode.length} dígitos. Esperado 48 ou 44 dígitos).`,
    };
  }

  const rawVal = parseInt(valueStr, 10);
  const value = isNaN(rawVal) ? 0 : rawVal / 100;

  // Concessionárias possuem o código da empresa nas posições 15 a 19 do barcode
  const empresaId = barcode.slice(15, 19);
  const convenioKey = `ARREC_SEG${segmentCode}_EMP${empresaId}`;

  // Tentativa de extrair vencimento se estiver formatado no campo livre (geralmente YYYYMMDD em concessionárias)
  let dueDate: string | null = null;
  const potentialDateStr = barcode.slice(19, 27);
  if (/^202[4-9](0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(potentialDateStr)) {
    dueDate = `${potentialDateStr.slice(0, 4)}-${potentialDateStr.slice(4, 6)}-${potentialDateStr.slice(6, 8)}`;
  }

  return {
    raw,
    cleanCode,
    type: 'arrecadacao',
    barcode,
    linhaDigitavel,
    segmentName,
    bankName: segmentName,
    dueDate,
    value,
    convenioKey,
    isValid: true,
  };
}
