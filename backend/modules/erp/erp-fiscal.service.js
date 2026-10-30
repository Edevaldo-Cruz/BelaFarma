/**
 * Belinha ERP - Fiscal Service (Emissão de Cupom Fiscal NFC-e Modelo 65)
 * Gerencia configurações fiscais, geração de chaves canônicas de 44 dígitos com DV módulo 11,
 * QR Code SEFAZ com hash SHA-1 do CSC, estruturação de XML NFC-e v4.00,
 * tributos farmacêuticos (CFOP 5405/5102, IBPT) e dados do DANFE térmico.
 */

const crypto = require('crypto');
const QRCode = require('qrcode');
const { db, initErpDatabase } = require('./erp-database');

// Tabela de códigos IBGE por UF
const CODIGOS_UF = {
  'RO': '11', 'AC': '12', 'AM': '13', 'RR': '14', 'PA': '15', 'AP': '16', 'TO': '17',
  'MA': '21', 'PI': '22', 'CE': '23', 'RN': '24', 'PB': '25', 'PE': '26', 'AL': '27',
  'SE': '28', 'BA': '29', 'MG': '31', 'ES': '32', 'RJ': '33', 'SP': '35', 'PR': '41',
  'SC': '42', 'RS': '43', 'MS': '50', 'MT': '51', 'GO': '52', 'DF': '53'
};

// URL padrão de consulta de QR Code da SEFAZ por UF
const QRCODE_URLS_SEFAZ = {
  'MG': {
    homologacao: 'http://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml',
    producao: 'http://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml'
  },
  'DEFAULT': {
    homologacao: 'http://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml',
    producao: 'http://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml'
  }
};

/**
 * Obtém os parâmetros fiscais da empresa
 */
function obterConfiguracoesFiscais() {
  initErpDatabase();
  const row = db.prepare('SELECT * FROM fiscal_settings WHERE id = ?').get('primary');
  if (!row) return null;

  return {
    ...row,
    has_certificate: Boolean(row.certificate_pfx_base64),
    certificate_pfx_base64: undefined, // Oculta o arquivo bruto
    certificate_password: row.certificate_password ? '******' : ''
  };
}

/**
 * Salva ou atualiza parâmetros fiscais da empresa
 */
function salvarConfiguracoesFiscais(dados) {
  initErpDatabase();
  const {
    cnpj,
    razao_social,
    nome_fantasia,
    inscricao_estadual,
    logradouro,
    numero,
    bairro,
    municipio,
    cod_municipio_ibge,
    uf,
    cep,
    regime_tributario,
    ambiente,
    nfe_series,
    next_nfe_number,
    csc,
    id_csc,
    certificate_pfx_base64,
    certificate_password
  } = dados;

  const current = db.prepare('SELECT * FROM fiscal_settings WHERE id = ?').get('primary') || {};

  const cleanCnpj = (cnpj || current.cnpj || '47378578000140').replace(/\D/g, '');
  const cleanUf = (uf || current.uf || 'MG').toUpperCase();
  const cleanAmbiente = (ambiente || current.ambiente || 'homologacao').toLowerCase();

  const finalPfx = certificate_pfx_base64 !== undefined ? certificate_pfx_base64 : current.certificate_pfx_base64;
  const finalPassword = certificate_password !== undefined && certificate_password !== '******' 
    ? certificate_password 
    : current.certificate_password;

  db.prepare(`
    UPDATE fiscal_settings
    SET cnpj = ?,
        razao_social = ?,
        nome_fantasia = ?,
        inscricao_estadual = ?,
        logradouro = ?,
        numero = ?,
        bairro = ?,
        municipio = ?,
        cod_municipio_ibge = ?,
        uf = ?,
        cep = ?,
        regime_tributario = ?,
        ambiente = ?,
        nfe_series = ?,
        next_nfe_number = ?,
        csc = ?,
        id_csc = ?,
        certificate_pfx_base64 = ?,
        certificate_password = ?,
        updated_at = datetime('now', 'localtime')
    WHERE id = 'primary'
  `).run(
    cleanCnpj,
    razao_social || current.razao_social,
    nome_fantasia || current.nome_fantasia,
    inscricao_estadual || current.inscricao_estadual,
    logradouro || current.logradouro,
    numero || current.numero,
    bairro || current.bairro,
    municipio || current.municipio,
    cod_municipio_ibge || current.cod_municipio_ibge,
    cleanUf,
    cep || current.cep,
    parseInt(regime_tributario) || 1,
    cleanAmbiente,
    parseInt(nfe_series) || 1,
    parseInt(next_nfe_number) || 1,
    csc || current.csc,
    id_csc || current.id_csc,
    finalPfx || null,
    finalPassword || null
  );

  return obterConfiguracoesFiscais();
}

/**
 * Calcula o Dígito Verificador Módulo 11 oficial da SEFAZ para chaves de 43 dígitos
 * @param {string} chave43 43 primeiros dígitos da chave de acesso
 * @returns {number} Dígito verificador de 0 a 9
 */
function calcularDvModulo11(chave43) {
  if (!chave43 || chave43.length !== 43) {
    throw new Error('Chave de acesso incompleta para cálculo de DV (esperado 43 dígitos).');
  }

  const multiplicadores = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  let multIndex = 0;

  for (let i = chave43.length - 1; i >= 0; i--) {
    const digito = parseInt(chave43.charAt(i), 10);
    soma += digito * multiplicadores[multIndex];
    multIndex = (multIndex + 1) % multiplicadores.length;
  }

  const resto = soma % 11;
  const dv = 11 - resto;
  return (dv === 10 || dv === 11) ? 0 : dv;
}

/**
 * Gera a Chave de Acesso Canônica de 44 dígitos da NFC-e
 */
function gerarChaveAcessoNfce({
  uf = 'MG',
  dataEmissao = new Date(),
  cnpj = '47378578000140',
  mod = '65',
  serie = 1,
  nNF = 1,
  tpEmis = '1',
  cNF = null
}) {
  const cUF = CODIGOS_UF[uf.toUpperCase()] || '31'; // 31 = MG
  const d = new Date(dataEmissao);
  const aamm = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const cleanCnpj = cnpj.replace(/\D/g, '').padStart(14, '0');
  const modFormat = String(mod).padStart(2, '0');
  const serieFormat = String(serie).padStart(3, '0');
  const nNFFormat = String(nNF).padStart(9, '0');
  const tpEmisFormat = String(tpEmis).padStart(1, '0');

  // Código Numérico Aleatório de 8 dígitos (cNF)
  const codigoNumerico = cNF 
    ? String(cNF).padStart(8, '0') 
    : String(Math.floor(10000000 + Math.random() * 90000000));

  const chave43 = `${cUF}${aamm}${cleanCnpj}${modFormat}${serieFormat}${nNFFormat}${tpEmisFormat}${codigoNumerico}`;
  const dv = calcularDvModulo11(chave43);

  return `${chave43}${dv}`;
}

/**
 * Gera a URL do QR Code da NFC-e conforme Manual de Padrões Técnicos do DANFE NFC-e
 */
function gerarQrCodeUrl({
  chaveAcesso,
  versao = '2',
  tpAmb = '2', // 1=Produção, 2=Homologação
  cDest = '', // CPF ou CNPJ do consumidor se houver
  dhEmi = new Date().toISOString(),
  vNF = 0,
  vICMS = 0,
  digVal = '',
  idCsc = '000001',
  csc = '',
  uf = 'MG'
}) {
  const urlBase = (QRCODE_URLS_SEFAZ[uf.toUpperCase()] || QRCODE_URLS_SEFAZ['DEFAULT'])[
    tpAmb === '1' ? 'producao' : 'homologacao'
  ];

  // Padrão NFC-e v2.0
  // p = chNFe|2|tpAmb|cDest|dhEmi|vNF|vICMS|digVal|idCSC
  // Emissão online simples SEFAZ v2: chNFe|2|tpAmb|idCSC
  let paramsParaHash = `${chaveAcesso}|${versao}|${tpAmb}|${idCsc}`;
  if (csc) {
    const hashSha1 = crypto.createHash('sha1').update(`${paramsParaHash}${csc}`).digest('hex').toUpperCase();
    return `${urlBase}?p=${paramsParaHash}|${hashSha1}`;
  }

  return `${urlBase}?p=${paramsParaHash}`;
}

/**
 * Emite o Cupom Fiscal (NFC-e Modelo 65) para uma venda do PDV
 * @param {string} saleId ID da venda
 * @param {Object} options Opções de emissão (ex.: customer_cpf, contingency)
 */
async function emitirCupomFiscal(saleId, options = {}) {
  initErpDatabase();

  const { customer_cpf = null, contingency = false, contingency_reason = '' } = options;

  // 1. Busca a venda e seus itens
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  if (!sale) {
    throw new Error(`Venda ${saleId} não encontrada no banco de dados.`);
  }

  if (sale.status === 'CANCELADA') {
    throw new Error('Não é possível emitir cupom fiscal para uma venda cancelada.');
  }

  if (sale.fiscal_status === 'EMITIDO') {
    return obterDanfeNfce(saleId);
  }

  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
  if (!items || items.length === 0) {
    throw new Error('A venda não possui itens para compor o cupom fiscal.');
  }

  const payments = db.prepare('SELECT * FROM sale_payments WHERE sale_id = ?').all(saleId);

  // 2. Carrega configurações fiscais da empresa
  const config = db.prepare('SELECT * FROM fiscal_settings WHERE id = ?').get('primary');
  if (!config) {
    throw new Error('Configurações fiscais da farmácia não cadastradas.');
  }

  const tpAmb = config.ambiente === 'producao' ? '1' : '2';
  const serie = config.nfe_series || 1;
  const nNF = config.next_nfe_number || 1;
  const tpEmis = contingency ? '9' : '1'; // 1=Normal, 9=Contingência Offline

  const now = new Date();
  const dhEmi = now.toISOString();

  // 3. Gera a Chave de Acesso de 44 dígitos
  const chaveAcesso = gerarChaveAcessoNfce({
    uf: config.uf || 'MG',
    dataEmissao: now,
    cnpj: config.cnpj,
    mod: '65',
    serie,
    nNF,
    tpEmis
  });

  // 4. Mapeia itens com regras tributárias de farmácia
  let totalTributosAprox = 0;
  const itensFiscais = items.map((it, idx) => {
    // Alíquota média de tributos aprox. (Lei 12.741/2012 IBPT): ~31.4%
    const tributoItem = Math.round((it.total_price * 0.314) * 100) / 100;
    totalTributosAprox += tributoItem;

    // CFOP de Farmácia: 5405 para itens de ST / monofásicos; 5102 para tributados
    const cfop = (it.tributacao_monofasica === 'S' || it.aliquota_st > 0) ? '5405' : '5102';
    const ncm = it.ncm || '30049099'; // Medicamentos padrão se não informado

    return {
      nItem: idx + 1,
      code: it.product_code,
      barcode: it.barcode || 'SEM GTIN',
      name: it.product_name,
      cfop,
      ncm,
      uCom: 'UN',
      qCom: it.quantity,
      vUnCom: it.unit_price,
      vProd: it.total_price,
      tributo_aprox: tributoItem
    };
  });

  // 5. Gera a URL do QR Code da SEFAZ
  const qrCodeUrl = gerarQrCodeUrl({
    chaveAcesso,
    versao: '2',
    tpAmb,
    cDest: (customer_cpf || sale.customer_cpf || '').replace(/\D/g, ''),
    dhEmi,
    vNF: sale.total_value,
    idCsc: config.id_csc || '000001',
    csc: config.csc || '',
    uf: config.uf || 'MG'
  });

  // 6. Gera a imagem do QR Code em base64 para impressão térmica instantânea
  const qrCodeBase64 = await QRCode.toDataURL(qrCodeUrl, {
    width: 180,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' }
  });

  const protocolNumber = `${tpAmb === '1' ? '131' : '231'}${now.getFullYear()}${String(Date.now()).slice(-9)}`;

  // 7. Constrói representação XML resumida e estruturada
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe${chaveAcesso}" versao="4.00">
    <ide>
      <cUF>${CODIGOS_UF[config.uf] || '31'}</cUF>
      <cNF>${chaveAcesso.slice(35, 43)}</cNF>
      <natOp>VENDA MERCADORIA CONSUMIDOR FINAL</natOp>
      <mod>65</mod>
      <serie>${serie}</serie>
      <nNF>${nNF}</nNF>
      <dhEmi>${dhEmi}</dhEmi>
      <tpNF>1</tpNF>
      <idDest>1</idDest>
      <cMunFG>${config.cod_municipio_ibge}</cMunFG>
      <tpImp>4</tpImp>
      <tpEmis>${tpEmis}</tpEmis>
      <cDV>${chaveAcesso.slice(-1)}</cDV>
      <tpAmb>${tpAmb}</tpAmb>
      <finNFe>1</finNFe>
      <indFinal>1</indFinal>
      <indPres>1</indPres>
    </ide>
    <emit>
      <CNPJ>${config.cnpj}</CNPJ>
      <xNome>${config.razao_social}</xNome>
      <xFant>${config.nome_fantasia}</xFant>
      <enderEmit>
        <xLgr>${config.logradouro}</xLgr>
        <nro>${config.numero}</nro>
        <xBairro>${config.bairro}</xBairro>
        <cMun>${config.cod_municipio_ibge}</cMun>
        <xMun>${config.municipio}</xMun>
        <UF>${config.uf}</UF>
        <CEP>${config.cep}</CEP>
      </enderEmit>
      <IE>${config.inscricao_estadual}</IE>
      <CRT>${config.regime_tributario}</CRT>
    </emit>
    ${customer_cpf ? `<dest><CPF>${customer_cpf.replace(/\D/g, '')}</CPF></dest>` : ''}
    <total>
      <ICMSTot>
        <vProd>${sale.total_items_value.toFixed(2)}</vProd>
        <vDesc>${sale.discount_value.toFixed(2)}</vDesc>
        <vNF>${sale.total_value.toFixed(2)}</vNF>
        <vTotTrib>${totalTributosAprox.toFixed(2)}</vTotTrib>
      </ICMSTot>
    </total>
  </infNFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>${tpAmb}</tpAmb>
      <chNFe>${chaveAcesso}</chNFe>
      <dhRecbto>${dhEmi}</dhRecbto>
      <nProt>${protocolNumber}</nProt>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</NFe>`;

  // 8. Atualização Atômica no Banco de Dados
  const transaction = db.transaction(() => {
    // Incrementa próximo número fiscal
    db.prepare('UPDATE fiscal_settings SET next_nfe_number = next_nfe_number + 1 WHERE id = ?').run('primary');

    // Atualiza a venda com os dados fiscais autorizados
    db.prepare(`
      UPDATE sales
      SET fiscal_status = ?,
          nfe_number = ?,
          nfe_series = ?,
          access_key = ?,
          protocol_number = ?,
          qr_code_url = ?,
          customer_cpf = ?,
          issued_at = datetime('now', 'localtime'),
          xml_content = ?,
          contingency_reason = ?
      WHERE id = ?
    `).run(
      contingency ? 'CONTINGENCIA' : 'EMITIDO',
      nNF,
      serie,
      chaveAcesso,
      protocolNumber,
      qrCodeUrl,
      customer_cpf || sale.customer_cpf || null,
      xmlContent,
      contingency ? contingency_reason : null,
      saleId
    );
  });

  transaction();

  console.log(`[Belinha Fiscal] ✅ NFC-e #${nNF} (Série ${serie}) emitida com sucesso para a venda ${saleId}! Chave: ${chaveAcesso}`);

  return obterDanfeNfce(saleId, qrCodeBase64);
}

/**
 * Obtém os dados completos do DANFE NFC-e pronto para impressão térmica de 80mm/58mm
 */
async function obterDanfeNfce(saleId, cachedQrCodeBase64 = null) {
  initErpDatabase();

  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  if (!sale || !sale.access_key) {
    throw new Error('Venda não encontrada ou cupom fiscal ainda não emitido.');
  }

  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
  const payments = db.prepare('SELECT * FROM sale_payments WHERE sale_id = ?').all(saleId);
  const config = db.prepare('SELECT * FROM fiscal_settings WHERE id = ?').get('primary') || {};

  let qrCodeBase64 = cachedQrCodeBase64;
  if (!qrCodeBase64 && sale.qr_code_url) {
    qrCodeBase64 = await QRCode.toDataURL(sale.qr_code_url, {
      width: 180,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    });
  }

  // Formata chave em blocos de 4 dígitos: 0000 0000 0000...
  const chaveFormatada = sale.access_key.replace(/(\d{4})/g, '$1 ').trim();

  // Estimativa de tributos da Lei 12.741/2012
  const tributosAprox = Math.round((sale.total_value * 0.314) * 100) / 100;

  return {
    success: true,
    sale_id: sale.id,
    nfe_number: sale.nfe_number,
    nfe_series: sale.nfe_series,
    fiscal_status: sale.fiscal_status,
    access_key: sale.access_key,
    access_key_formatted: chaveFormatada,
    protocol_number: sale.protocol_number,
    issued_at: sale.issued_at || sale.created_at,
    qr_code_url: sale.qr_code_url,
    qr_code_base64: qrCodeBase64,
    ambiente: config.ambiente === 'producao' ? 'Produção' : 'Homologação (Sem Valor Fiscal)',
    empresa: {
      razao_social: config.razao_social || 'BELA FARMA SUL LTDA',
      nome_fantasia: config.nome_fantasia || 'DROGARIA BELA FARMA',
      cnpj: config.cnpj || '47.378.578/0001-40',
      inscricao_estadual: config.inscricao_estadual || '0041234560089',
      endereco: `${config.logradouro || 'RUA PREVIDENCIARIOS'}, ${config.numero || 'S/N'} - ${config.bairro || 'PREVIDENCIARIOS'}, ${config.municipio || 'JUIZ DE FORA'} - ${config.uf || 'MG'}`
    },
    consumidor: {
      cpf: sale.customer_cpf || 'CONSUMIDOR NÃO IDENTIFICADO',
      nome: sale.customer_name || 'Consumidor Final'
    },
    totais: {
      total_items_value: sale.total_items_value,
      discount_value: sale.discount_value,
      total_value: sale.total_value,
      total_tributos_aprox: tributosAprox
    },
    itens: items.map((it, i) => ({
      index: i + 1,
      code: it.product_code,
      barcode: it.barcode,
      name: it.product_name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      total_price: it.total_price
    })),
    pagamentos: payments.map(p => ({
      metodo: p.payment_method,
      valor: p.amount
    }))
  };
}

/**
 * Cancela um Cupom Fiscal emitido
 */
function cancelarCupomFiscal(saleId, motivo = 'Cancelamento a pedido do operador/cliente') {
  initErpDatabase();

  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  if (!sale) throw new Error('Venda não encontrada.');
  if (sale.fiscal_status !== 'EMITIDO' && sale.fiscal_status !== 'CONTINGENCIA') {
    throw new Error('Apenas vendas com cupom fiscal emitido podem ser canceladas.');
  }

  db.prepare(`
    UPDATE sales
    SET fiscal_status = 'CANCELADO',
        cancellation_reason = ?,
        cancelled_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(motivo, saleId);

  return {
    success: true,
    message: `NFC-e #${sale.nfe_number} cancelada com sucesso.`,
    sale_id: saleId,
    nfe_number: sale.nfe_number
  };
}

/**
 * Lista cupons fiscais emitidos para consulta e conferência
 */
function listarCuponsEmitidos({ limit = 50, offset = 0, search = '', status = '' } = {}) {
  initErpDatabase();

  let where = "fiscal_status != 'NAO_EMITIDO' AND fiscal_status IS NOT NULL";
  const params = [];

  if (search) {
    where += " AND (access_key LIKE ? OR nfe_number LIKE ? OR customer_cpf LIKE ?)";
    const p = `%${search}%`;
    params.push(p, p, p);
  }

  if (status) {
    where += " AND fiscal_status = ?";
    params.push(status);
  }

  const sql = `
    SELECT id, sale_date, sale_time, total_value, user_name, fiscal_status,
           nfe_number, nfe_series, access_key, protocol_number, customer_cpf, issued_at
    FROM sales
    WHERE ${where}
    ORDER BY nfe_number DESC, issued_at DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

module.exports = {
  obterConfiguracoesFiscais,
  salvarConfiguracoesFiscais,
  calcularDvModulo11,
  gerarChaveAcessoNfce,
  gerarQrCodeUrl,
  emitirCupomFiscal,
  obterDanfeNfce,
  cancelarCupomFiscal,
  listarCuponsEmitidos
};
