/**
 * Gerador de Payload PIX Estático/Com Valor (EMVCo BR Code - Padrão Banco Central)
 * Sem dependências externas. Suporta qualquer chave PIX (CNPJ, CPF, Telefone, E-mail ou EVP).
 */

function stripAccentsAndSanitize(text, maxLen = 25, fallback = '') {
  if (!text) return fallback;
  const cleaned = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 .\-*/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLen).trim();
}

/**
 * Normaliza a chave PIX conforme padrão DICT do Banco Central:
 * - E-mail: minúsculo sem espaços
 * - EVP (chave aleatória UUID com hifens): minúsculo
 * - CNPJ (14 dígitos) / CPF (11 dígitos): somente dígitos
 * - Telefone: preserva '+' se já vier E.164 (ex: +5532999999999), ou limpa
 */
function normalizePixKey(rawKey) {
  if (!rawKey) return '';
  const key = String(rawKey).trim();
  if (!key) return '';

  // E-mail
  if (key.includes('@')) {
    return key.toLowerCase();
  }

  // EVP (UUID 32 hex + hifens)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return key.toLowerCase();
  }

  // Telefone internacional explícito (+55...)
  if (key.startsWith('+')) {
    return '+' + key.replace(/\D/g, '');
  }

  // CNPJ ou CPF com pontuação
  const digits = key.replace(/\D/g, '');
  if (digits.length === 14 || digits.length === 11) {
    // Heurística: 11 dígitos começando com DDD + 9 pode ser telefone se vier formatado com parênteses (32) 9...
    if (key.includes('(') || key.includes(')')) {
      return `+55${digits}`;
    }
    return digits;
  }

  if (digits.length === 10 || digits.length === 13) {
    if (digits.startsWith('55') && digits.length === 13) {
      return `+${digits}`;
    }
    return `+55${digits}`;
  }

  return key;
}

function tlv(id, value) {
  const valStr = String(value);
  const lenStr = String(valStr.length).padStart(2, '0');
  return `${id}${lenStr}${valStr}`;
}

/**
 * CRC-16/CCITT-FALSE (Polinômio 0x1021, Init 0xFFFF) exigido pelo Banco Central no campo 63.
 */
function crc16Ccitt(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Gera string PIX Copia e Cola completa válida nos apps bancários do Brasil.
 */
function generatePixBrCode({
  pixKey,
  merchantName = 'BELAFARMA SUL',
  merchantCity = 'JUIZ DE FORA',
  amount = 0,
  txid = '***',
  description = ''
}) {
  const normalizedKey = normalizePixKey(pixKey);
  if (!normalizedKey) {
    throw new Error('Chave PIX não configurada.');
  }

  const guiField = tlv('00', 'br.gov.bcb.pix');
  const keyField = tlv('01', normalizedKey);
  const descClean = description ? stripAccentsAndSanitize(description, 40, '') : '';
  const descField = descClean ? tlv('02', descClean) : '';
  const merchantAccountInfo = tlv('26', `${guiField}${keyField}${descField}`);

  const safeName = stripAccentsAndSanitize(merchantName, 25, 'BELAFARMA');
  const safeCity = stripAccentsAndSanitize(merchantCity, 15, 'JUIZ DE FORA');

  const cleanTxid = txid && txid !== '***'
    ? String(txid).replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***'
    : '***';

  const numericAmount = Number(amount || 0);
  const amountField = numericAmount > 0 ? tlv('54', numericAmount.toFixed(2)) : '';

  const payloadWithoutCrc =
    tlv('00', '01') +
    merchantAccountInfo +
    tlv('52', '0000') +
    tlv('53', '986') +
    amountField +
    tlv('58', 'BR') +
    tlv('59', safeName) +
    tlv('60', safeCity) +
    tlv('62', tlv('05', cleanTxid)) +
    '6304';

  return payloadWithoutCrc + crc16Ccitt(payloadWithoutCrc);
}

module.exports = {
  generatePixBrCode,
  normalizePixKey,
  crc16Ccitt,
  stripAccentsAndSanitize
};
