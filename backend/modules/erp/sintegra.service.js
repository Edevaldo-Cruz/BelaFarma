/**
 * Belinha ERP - SINTEGRA Generator Service
 * Gera o arquivo oficial magnético do SINTEGRA conforme layout do Convênio ICMS 57/95 e alterações.
 * 
 * Registros suportados:
 * - 10: Mestre do Estabelecimento
 * - 11: Dados Complementares do Estabelecimento
 * - 50: Totalizadores de Notas Fiscais (Entradas Mod. 55 e Saídas Mod. 65)
 * - 54: Itens das Notas Fiscais
 * - 75: Cadastro de Mercadorias e Produtos movimentados
 * - 90: Totalização do Arquivo
 * 
 * Regra do padrão SINTEGRA: Cada linha possui EXATAMENTE 126 caracteres terminados com CRLF (\r\n).
 */

const { db, initErpDatabase } = require('./erp-database');
const { classificarItemFiscal } = require('./fiscal-accounting.service');

// Helpers de formatação posicional rígida (largura fixa)
function padStr(val, len) {
  const s = String(val || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return s.padEnd(len, ' ').slice(0, len);
}

function padNum(val, len) {
  const n = String(val || '').replace(/\D/g, '');
  return n.padStart(len, '0').slice(-len);
}

function padDec(val, len, decimals = 2) {
  const num = Number(val) || 0;
  const factor = Math.pow(10, decimals);
  const intVal = Math.round(num * factor);
  return String(intVal).padStart(len, '0').slice(-len);
}

function fmtDataSintegra(dataIso) {
  if (!dataIso) return '00000000';
  const limpa = String(dataIso).split('T')[0].replace(/\D/g, ''); // YYYYMMDD
  if (limpa.length === 8) {
    return limpa; // AAAAMMDD
  }
  return '00000000';
}

/**
 * Gera o conteúdo em texto (.TXT) no layout oficial do SINTEGRA para a competência informada
 * @param {string} competencia 'YYYY-MM'
 * @returns {string} Conteúdo em texto puro do arquivo SINTEGRA
 */
function gerarArquivoSintegra(competencia) {
  initErpDatabase();
  const config = db.prepare('SELECT * FROM fiscal_settings WHERE id = ?').get('primary') || {};

  const [ano, mes] = competencia.split('-');
  const ultimoDia = new Date(parseInt(ano, 10), parseInt(mes, 10), 0).getDate();
  const dtIni = `${ano}${mes}01`;
  const dtFin = `${ano}${mes}${String(ultimoDia).padStart(2, '0')}`;

  const cnpjEmpresa = padNum(config.cnpj || '47378578000140', 14);
  const ieEmpresa = padStr((config.inscricao_estadual || '').replace(/\D/g, ''), 14);

  const linhas = [];
  const totalizadores = {
    '50': 0,
    '54': 0,
    '75': 0
  };

  function addLinha(linhaStr) {
    if (linhaStr.length !== 126) {
      console.warn(`[SINTEGRA] Linha com tamanho incorreto (${linhaStr.length} != 126): "${linhaStr}"`);
    }
    linhas.push(linhaStr);
  }

  // === REGISTRO 10: Mestre do Estabelecimento ===
  // 01-02: '10'
  // 03-16: CNPJ (14)
  // 17-30: IE (14)
  // 31-65: Nome Comercial / Razão Social (35)
  // 66-95: Município (30)
  // 96-97: UF (2)
  // 98-107: Fax (10 zeros)
  // 108-115: Data Inicial (8)
  // 116-123: Data Final (8)
  // 124: Código Identificação Convênio ('3' para Convênio 57/95 com alterações 76/03)
  // 125: Natureza das Operações ('3' - Totalidade das operações do informante)
  // 126: Finalidade do Arquivo ('1' - Normal)
  const reg10 = '10' +
    cnpjEmpresa +
    ieEmpresa +
    padStr(config.razao_social || 'DROGARIA BELA FARMA LTDA', 35) +
    padStr(config.municipio || 'JUIZ DE FORA', 30) +
    padStr(config.uf || 'MG', 2) +
    padNum('0', 10) +
    dtIni +
    dtFin +
    '3' +
    '3' +
    '1';
  addLinha(reg10);

  // === REGISTRO 11: Dados Complementares ===
  // 01-02: '11'
  // 03-36: Logradouro (34)
  // 37-41: Número (5)
  // 42-63: Complemento (22)
  // 64-78: Bairro (15)
  // 79-86: CEP (8)
  // 87-114: Responsável / Contato (28)
  // 115-126: Telefone (12)
  const reg11 = '11' +
    padStr(config.logradouro || 'RUA PREVIDENCIARIOS', 34) +
    padNum(config.numero || '100', 5) +
    padStr('', 22) +
    padStr(config.bairro || 'PREVIDENCIARIOS', 15) +
    padNum(config.cep || '36033000', 8) +
    padStr('EDIVALDO CRUZ', 28) +
    padNum('3232150000', 12);
  addLinha(reg11);

  // === REGISTRO 50 e 54: Notas Fiscais e Itens ===
  const produtosSet = new Set();

  // 1. Entradas (Modelo 55 - Compra de Fornecedor)
  const notasEntrada = db.prepare(`
    SELECT i.*
    FROM invoices i
    WHERE strftime('%Y-%m', i.issue_date) = ? AND i.status != 'Cancelada'
    ORDER BY i.issue_date ASC
  `).all(competencia);

  for (const inv of notasEntrada) {
    const cnpjForn = padNum(inv.cnpj_supplier || '0', 14);
    const ieForn = padStr(inv.supplier_ie || 'ISENTO', 14);
    const dtDoc = fmtDataSintegra(inv.issue_date);
    const ufForn = padStr(inv.supplier_uf || 'MG', 2);
    const serieNf = padStr(inv.series || '1', 3);
    const numNf = padNum(inv.invoice_number || '1', 6);

    const itens = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(inv.id);

    // Agrupa itens por CFOP e Alíquota para gerar o Registro 50
    const agPorCfopAliq = {};
    for (let idx = 0; idx < itens.length; idx++) {
      const it = itens[idx];
      const cfop = padNum(it.cfop_entrada || '1403', 4);
      const aliq = Number(it.aliquota_icms || 0);
      const chaveAg = `${cfop}_${aliq}`;

      if (!agPorCfopAliq[chaveAg]) {
        agPorCfopAliq[chaveAg] = {
          cfop,
          aliq,
          valorContabil: 0,
          baseIcms: 0,
          valorIcms: 0,
          outras: 0
        };
      }

      const totalItem = Number(it.total_cost || 0);
      const vIcms = Number(it.valor_icms || 0);
      const bIcms = Number(it.base_icms || 0);

      agPorCfopAliq[chaveAg].valorContabil += totalItem;
      agPorCfopAliq[chaveAg].baseIcms += bIcms;
      agPorCfopAliq[chaveAg].valorIcms += vIcms;
      if (bIcms <= 0) {
        agPorCfopAliq[chaveAg].outras += totalItem;
      }

      // Registro 54 - Item da Nota de Entrada
      // 01-02: '54'
      // 03-16: CNPJ/CPF (14)
      // 17-18: Modelo '55' (2)
      // 19-21: Série (3)
      // 22-27: Número (6)
      // 28-31: CFOP (4)
      // 32-34: CST (3)
      // 35-37: Número do item (3)
      // 38-51: Código do produto (14)
      // 52-62: Quantidade (11 com 3 decimais)
      // 63-74: Valor Bruto (12 com 2 decimais)
      // 75-86: Desconto (12 com 2 decimais)
      // 87-98: Base ICMS (12 com 2 decimais)
      // 99-110: Base ST (12 com 2 decimais)
      // 111-122: Valor IPI (12 com 2 decimais)
      // 123-126: Alíquota ICMS (4 com 2 decimais)
      const cstLimpo = padNum(it.cst_csosn || '500', 3);
      const codProd = padStr(it.product_code || it.barcode || 'S/COD', 14);
      produtosSet.add(it.product_code);

      const reg54 = '54' +
        cnpjForn +
        '55' +
        serieNf +
        numNf +
        cfop +
        cstLimpo +
        padNum(idx + 1, 3) +
        codProd +
        padDec(it.quantity, 11, 3) +
        padDec(totalItem, 12, 2) +
        padDec(0, 12, 2) +
        padDec(bIcms, 12, 2) +
        padDec(it.base_st || 0, 12, 2) +
        padDec(it.valor_ipi || 0, 12, 2) +
        padDec(aliq, 4, 2);

      addLinha(reg54);
      totalizadores['54']++;
    }

    // Registros 50 de Entrada para a nota
    for (const k of Object.keys(agPorCfopAliq)) {
      const g = agPorCfopAliq[k];
      const reg50 = '50' +
        cnpjForn +
        ieForn +
        dtDoc +
        ufForn +
        '55' +
        serieNf +
        numNf +
        g.cfop +
        'T' + // T = Emissão de terceiros
        padDec(g.valorContabil, 13, 2) +
        padDec(g.baseIcms, 13, 2) +
        padDec(g.valorIcms, 13, 2) +
        padDec(0, 13, 2) + // Isentas
        padDec(g.outras, 13, 2) + // Outras
        padDec(g.aliq, 4, 2) +
        'N'; // Situação Normal

      addLinha(reg50);
      totalizadores['50']++;
    }
  }

  // 2. Saídas (Modelo 65 - NFC-e PDV)
  const vendasMes = db.prepare(`
    SELECT s.*
    FROM sales s
    WHERE strftime('%Y-%m', s.sale_date) = ?
    ORDER BY s.sale_date ASC
  `).all(competencia);

  for (const v of vendasMes) {
    const isCancelada = v.status === 'CANCELADA';
    const numNf = padNum(v.nfe_number || v.id.slice(-6), 6);
    const serieNf = padStr(v.nfe_series || '1', 3);
    const dtDoc = fmtDataSintegra(v.sale_date);

    const itensVenda = db.prepare(`
      SELECT si.*, p.ncm, p.cest, p.aliquota_st, p.tributacao_monofasica, p.cst_pis
      FROM sale_items si
      LEFT JOIN products p ON p.code = si.product_code
      WHERE si.sale_id = ?
    `).all(v.id);

    const agPorCfopAliq = {};

    for (let idx = 0; idx < itensVenda.length; idx++) {
      const it = itensVenda[idx];
      const classif = classificarItemFiscal(it);
      const cfop = padNum(classif.cfop || '5405', 4);
      const aliq = 0; // Farmácia Simples Nacional no cupom
      const chaveAg = `${cfop}_${aliq}`;

      if (!agPorCfopAliq[chaveAg]) {
        agPorCfopAliq[chaveAg] = {
          cfop,
          aliq,
          valorContabil: 0,
          baseIcms: 0,
          valorIcms: 0,
          outras: 0
        };
      }

      const totalItem = Number(it.total_price || 0);
      agPorCfopAliq[chaveAg].valorContabil += totalItem;
      agPorCfopAliq[chaveAg].outras += totalItem;

      if (!isCancelada) {
        produtosSet.add(it.product_code);

        // Registro 54 - Item da Saída
        const codProd = padStr(it.product_code || it.barcode || 'S/COD', 14);
        const cstLimpo = padNum(classif.csosn || '500', 3);

        const reg54 = '54' +
          cnpjEmpresa +
          '65' +
          serieNf +
          numNf +
          cfop +
          cstLimpo +
          padNum(idx + 1, 3) +
          codProd +
          padDec(it.quantity, 11, 3) +
          padDec(totalItem, 12, 2) +
          padDec(0, 12, 2) +
          padDec(0, 12, 2) +
          padDec(0, 12, 2) +
          padDec(0, 12, 2) +
          padDec(aliq, 4, 2);

        addLinha(reg54);
        totalizadores['54']++;
      }
    }

    // Registros 50 de Saída
    for (const k of Object.keys(agPorCfopAliq)) {
      const g = agPorCfopAliq[k];
      const reg50 = '50' +
        cnpjEmpresa +
        ieEmpresa +
        dtDoc +
        'MG' +
        '65' +
        serieNf +
        numNf +
        g.cfop +
        'P' + // P = Emissão própria
        padDec(g.valorContabil, 13, 2) +
        padDec(0, 13, 2) +
        padDec(0, 13, 2) +
        padDec(0, 13, 2) +
        padDec(g.outras, 13, 2) +
        padDec(g.aliq, 4, 2) +
        (isCancelada ? 'S' : 'N');

      addLinha(reg50);
      totalizadores['50']++;
    }
  }

  // === REGISTRO 75: Cadastro de Produtos Movimentados ===
  const produtosArray = Array.from(produtosSet).filter(Boolean);
  if (produtosArray.length > 0) {
    const placeholders = produtosArray.map(() => '?').join(',');
    const produtosInfo = db.prepare(`
      SELECT code, barcode, name, ncm, cest
      FROM products
      WHERE code IN (${placeholders})
      ORDER BY name ASC
    `).all(...produtosArray);

    for (const p of produtosInfo) {
      // 01-02: '75'
      // 03-10: Data Inicial (8)
      // 11-18: Data Final (8)
      // 19-32: Código (14)
      // 33-40: NCM (8)
      // 41-93: Descrição (53)
      // 94-99: Unidade de Medida (6)
      // 100-104: Alíquota IPI (5)
      // 105-109: Alíquota ICMS (5)
      // 110-115: Redução BC (6)
      // 116-126: Base ST (11)
      const reg75 = '75' +
        dtIni +
        dtFin +
        padStr(p.code, 14) +
        padNum((p.ncm || '30049099').replace(/\D/g, ''), 8) +
        padStr(p.name, 53) +
        padStr('UN', 6) +
        padDec(0, 5, 2) +
        padDec(0, 5, 2) +
        padDec(0, 6, 2) +
        padDec(0, 11, 2);

      addLinha(reg75);
      totalizadores['75']++;
    }
  }

  // === REGISTRO 90: Totalizadores do Arquivo ===
  // 01-02: '90'
  // 03-16: CNPJ (14)
  // 17-30: IE (14)
  // 31-32: Tipo (ex: '50')
  // 33-40: Qtd (8)
  // ...
  // Total de linhas 90
  const reg90_1 = '90' +
    cnpjEmpresa +
    ieEmpresa +
    '50' + padNum(totalizadores['50'], 8) +
    '54' + padNum(totalizadores['54'], 8) +
    '75' + padNum(totalizadores['75'], 8) +
    '99' + padNum(linhas.length + 1, 8) +
    '1'; // 1 = Arquivo com 1 registro tipo 90

  addLinha(padStr(reg90_1, 126));

  return linhas.join('\r\n');
}

module.exports = {
  gerarArquivoSintegra
};
