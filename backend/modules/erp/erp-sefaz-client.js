/**
 * Belinha ERP - SEFAZ WebService Client (SOAP 1.2 / mTLS)
 * Comunicação direta com os servidores da SEFAZ-MG e território nacional
 * para autorização síncrona de NFC-e (Modelo 65), cancelamento e checagem de status.
 */

const https = require('https');
const { URL } = require('url');
const { XMLParser } = require('fast-xml-parser');

// Endpoints Oficiais SEFAZ-MG para NFC-e Modelo 65
const WEBSERVICES_SEFAZ_MG = {
  homologacao: {
    statusServico: 'https://hnfce.fazenda.mg.gov.br/nfce/services/NFeStatusServico4',
    autorizacao: 'https://hnfce.fazenda.mg.gov.br/nfce/services/NFeAutorizacao4',
    recepcaoEvento: 'https://hnfce.fazenda.mg.gov.br/nfce/services/NFeRecepcaoEvento4'
  },
  producao: {
    statusServico: 'https://nfce.fazenda.mg.gov.br/nfce/services/NFeStatusServico4',
    autorizacao: 'https://nfce.fazenda.mg.gov.br/nfce/services/NFeAutorizacao4',
    recepcaoEvento: 'https://nfce.fazenda.mg.gov.br/nfce/services/NFeRecepcaoEvento4'
  }
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  removeNSPrefix: true,
  parseTagValue: false
});

/**
 * Executa uma requisição SOAP 1.2 sobre HTTPS com mTLS para a SEFAZ
 */
function enviarRequisicaoSoapSefaz(endpointUrl, soapAction, xmlDadosMsg, pfxBuffer, passphrase, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const urlParsed = new URL(endpointUrl);

    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="${soapAction}">
      ${xmlDadosMsg}
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;

    const postData = Buffer.from(soapEnvelope, 'utf-8');

    // Configura o agente HTTPS com autenticação mTLS via Certificado A1 (.pfx)
    const agentOptions = {
      rejectUnauthorized: false, // Aceita as cadeias intermediárias da ICP-Brasil
      keepAlive: true
    };

    if (pfxBuffer) {
      agentOptions.pfx = pfxBuffer;
      agentOptions.passphrase = passphrase || '';
    }

    const agent = new https.Agent(agentOptions);

    const reqOptions = {
      hostname: urlParsed.hostname,
      port: urlParsed.port || 443,
      path: urlParsed.pathname + (urlParsed.search || ''),
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': postData.length
      },
      timeout: timeoutMs
    };

    const req = https.request(reqOptions, (res) => {
      let responseBody = '';
      res.setEncoding('utf-8');

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseBody
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout de conexão com a SEFAZ (${timeoutMs}ms excedidos).`));
    });

    req.on('error', (err) => {
      reject(new Error(`Erro de comunicação com a SEFAZ: ${err.message}`));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Consulta o status operacional do WebService da SEFAZ-MG
 */
async function consultarStatusServicoSefaz(pfxBuffer, passphrase, ambiente = 'homologacao', uf = 'MG') {
  const ws = (WEBSERVICES_SEFAZ_MG[ambiente] || WEBSERVICES_SEFAZ_MG.homologacao).statusServico;
  const tpAmb = ambiente === 'producao' ? '1' : '2';
  const cUF = '31'; // MG

  const xmlMsg = `<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${tpAmb}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ></consStatServ>`;
  const soapAction = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4';

  const t0 = Date.now();
  const resp = await enviarRequisicaoSoapSefaz(ws, soapAction, xmlMsg, pfxBuffer, passphrase, 6000);
  const tempoRespostaMs = Date.now() - t0;

  const parsed = xmlParser.parse(resp.body);
  const retConsStatServ = parsed.Envelope?.Body?.nfeResultMsg?.retConsStatServ 
    || parsed['soap12:Envelope']?.['soap12:Body']?.nfeResultMsg?.retConsStatServ 
    || parsed['S:Envelope']?.['S:Body']?.nfeResultMsg?.retConsStatServ 
    || parsed.retConsStatServ;

  if (!retConsStatServ) {
    throw new Error(`Resposta inesperada da SEFAZ: ${resp.body.slice(0, 200)}`);
  }

  const cStat = String(retConsStatServ.cStat || '');
  const xMotivo = String(retConsStatServ.xMotivo || '');

  return {
    online: cStat === '107', // 107 = Serviço em Operação
    cStat,
    xMotivo,
    tempoRespostaMs,
    dhRecbto: retConsStatServ.dhRecbto || new Date().toISOString(),
    ambiente: ambiente === 'producao' ? 'Produção' : 'Homologação'
  };
}

/**
 * Transmite o lote síncrono de NFC-e para autorização imediata na SEFAZ-MG
 * @param {string} xmlNfeAssinado XML completo da NF-e assinado com <Signature>
 * @param {Buffer} pfxBuffer Buffer do certificado A1
 * @param {string} passphrase Senha do certificado
 * @param {string} ambiente 'homologacao' | 'producao'
 * @returns {Object} Resultado da autorização oficial da SEFAZ
 */
async function transmitirNfceSefaz(xmlNfeAssinado, pfxBuffer, passphrase, ambiente = 'homologacao') {
  const ws = (WEBSERVICES_SEFAZ_MG[ambiente] || WEBSERVICES_SEFAZ_MG.homologacao).autorizacao;
  const idLote = String(Date.now()).slice(-15);

  // Limpa declaracao <?xml ...?> duplicada para nao invalidar o schema do lote enviNFe
  const xmlSemDeclaracao = xmlNfeAssinado.replace(/<\?xml[^>]*\?>/g, '').trim();

  // Monta o lote síncrono (indSinc=1)
  const xmlLote = `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>${idLote}</idLote><indSinc>1</indSinc>${xmlSemDeclaracao}</enviNFe>`;
  const soapAction = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4';

  const resp = await enviarRequisicaoSoapSefaz(ws, soapAction, xmlLote, pfxBuffer, passphrase, 6000);
  const parsed = xmlParser.parse(resp.body);

  const retEnviNFe = parsed.Envelope?.Body?.nfeResultMsg?.retEnviNFe
    || parsed['soap12:Envelope']?.['soap12:Body']?.nfeResultMsg?.retEnviNFe
    || parsed['S:Envelope']?.['S:Body']?.nfeResultMsg?.retEnviNFe
    || parsed.retEnviNFe;
  if (!retEnviNFe) {
    throw new Error(`Resposta inválida da SEFAZ ao transmitir lote: ${resp.body.slice(0, 300)}`);
  }

  const cStatLote = String(retEnviNFe.cStat || '');
  const xMotivoLote = String(retEnviNFe.xMotivo || '');

  // 104 = Lote processado
  const protNFe = retEnviNFe.protNFe?.infProt || retEnviNFe.protNFe;
  if (!protNFe) {
    throw new Error(`SEFAZ retornou lote sem protocolo: [${cStatLote}] ${xMotivoLote}`);
  }

  const cStatNota = String(protNFe.cStat || cStatLote);
  const xMotivoNota = String(protNFe.xMotivo || xMotivoLote);
  const nProt = String(protNFe.nProt || '');
  const dhRecbto = String(protNFe.dhRecbto || new Date().toISOString());

  // 100 = Autorizado o uso da NF-e
  const isAutorizado = cStatNota === '100';

  let xmlDistribuicao = null;
  if (isAutorizado) {
    // Monta o XML oficial de distribuição (nfeProc)
    const protXml = `<protNFe versao="4.00"><infProt><tpAmb>${retEnviNFe.tpAmb || '2'}</tpAmb><verAplic>${retEnviNFe.verAplic || 'MG'}</verAplic><chNFe>${protNFe.chNFe}</chNFe><dhRecbto>${dhRecbto}</dhRecbto><nProt>${nProt}</nProt><digVal>${protNFe.digVal || ''}</digVal><cStat>${cStatNota}</cStat><xMotivo>${xMotivoNota}</xMotivo></infProt></protNFe>`;
    xmlDistribuicao = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${xmlNfeAssinado}${protXml}</nfeProc>`;
  }

  return {
    success: isAutorizado,
    cStat: cStatNota,
    xMotivo: xMotivoNota,
    nProt,
    dhRecbto,
    chaveAcesso: protNFe.chNFe,
    xmlDistribuicao
  };
}

/**
 * Transmite o Evento de Cancelamento (tpEvento 110111) para a SEFAZ
 * @param {Object} params { chaveAcesso, nProt, motivo, pfxBuffer, passphrase, ambiente, cUF, cnpj, privateKeyPem, certificateClean }
 * @returns {Promise<Object>} Resultado oficial da homologação do cancelamento
 */
async function transmitirCancelamentoSefaz(params) {
  const {
    chaveAcesso,
    nProt,
    motivo,
    pfxBuffer,
    passphrase,
    ambiente = 'homologacao',
    cUF = '31', // MG
    cnpj,
    privateKeyPem,
    certificateClean
  } = params;

  if (!chaveAcesso || chaveAcesso.length !== 44) {
    throw new Error('Chave de acesso da NFC-e inválida para cancelamento.');
  }

  if (!nProt) {
    throw new Error('Protocolo de autorização da SEFAZ não informado para cancelamento.');
  }

  const cleanMotivo = String(motivo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (cleanMotivo.length < 15) {
    throw new Error(`A justificativa de cancelamento deve conter no mínimo 15 caracteres (atual: ${cleanMotivo.length}).`);
  }

  const { assinarXmlEvento } = require('./erp-sefaz-signer');
  const ws = (WEBSERVICES_SEFAZ_MG[ambiente] || WEBSERVICES_SEFAZ_MG.homologacao).recepcaoEvento;
  const tpAmb = ambiente === 'producao' ? '1' : '2';

  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date(Date.now() - 10000); // 10s de margem para não exceder o relógio da SEFAZ (Rejeição 578)
  const dhEvento = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}-03:00`;
  const idLote = String(Date.now()).slice(-15);
  const idEvento = `ID110111${chaveAcesso}01`;

  // XML canônico do evento a ser assinado
  const xmlEventoBruto = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="${idEvento}"><cOrgao>${cUF}</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${cnpj.replace(/\D/g, '')}</CNPJ><chNFe>${chaveAcesso}</chNFe><dhEvento>${dhEvento}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${nProt}</nProt><xJust>${cleanMotivo.slice(0, 255)}</xJust></detEvento></infEvento></evento>`;

  // Assinatura digital XMLDSig
  const xmlEventoAssinado = assinarXmlEvento(xmlEventoBruto, idEvento, privateKeyPem, certificateClean);
  const xmlSemDeclaracao = xmlEventoAssinado.replace(/<\?xml[^>]*\?>/g, '').trim();

  // Envelopamento no lote de eventos (envEvento)
  const xmlEnvEvento = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${idLote}</idLote>${xmlSemDeclaracao}</envEvento>`;
  const soapAction = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4';

  const resp = await enviarRequisicaoSoapSefaz(ws, soapAction, xmlEnvEvento, pfxBuffer, passphrase, 25000);
  const parsed = xmlParser.parse(resp.body);

  const retEnvEvento = parsed.Envelope?.Body?.nfeResultMsg?.retEnvEvento
    || parsed['soap12:Envelope']?.['soap12:Body']?.nfeResultMsg?.retEnvEvento
    || parsed['S:Envelope']?.['S:Body']?.nfeResultMsg?.retEnvEvento
    || parsed.retEnvEvento;

  if (!retEnvEvento) {
    throw new Error(`Resposta inválida da SEFAZ ao registrar evento: ${resp.body.slice(0, 300)}`);
  }

  const retEvento = retEnvEvento.retEvento?.infEvento || retEnvEvento.retEvento;
  if (!retEvento) {
    const cStatLote = String(retEnvEvento.cStat || '');
    const xMotivoLote = String(retEnvEvento.xMotivo || '');
    throw new Error(`Lote de evento rejeitado pela SEFAZ: [${cStatLote}] ${xMotivoLote}`);
  }

  const cStatEvento = String(retEvento.cStat || '');
  const xMotivoEvento = String(retEvento.xMotivo || '');
  const nProtEvento = String(retEvento.nProt || '');
  const dhRegEvento = String(retEvento.dhRegEvento || new Date().toISOString());

  // 135 = Evento registrado e vinculado a NF-e
  const isHomologado = cStatEvento === '135';

  let xmlProcEvento = null;
  if (isHomologado) {
    const retEventoXml = `<retEvento versao="1.00"><infEvento><tpAmb>${tpAmb}</tpAmb><verAplic>${retEnvEvento.verAplic || 'MG'}</verAplic><cOrgao>${cUF}</cOrgao><cStat>${cStatEvento}</cStat><xMotivo>${xMotivoEvento}</xMotivo><chNFe>${chaveAcesso}</chNFe><tpEvento>110111</tpEvento><xEvento>Cancelamento</xEvento><nSeqEvento>1</nSeqEvento><dhRegEvento>${dhRegEvento}</dhRegEvento><nProt>${nProtEvento}</nProt></infEvento></retEvento>`;
    xmlProcEvento = `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">${xmlEventoAssinado}${retEventoXml}</procEventoNFe>`;
  }

  return {
    success: isHomologado,
    cStat: cStatEvento,
    xMotivo: xMotivoEvento,
    nProtEvento,
    dhRegEvento,
    xmlProcEvento
  };
}

module.exports = {
  consultarStatusServicoSefaz,
  transmitirNfceSefaz,
  transmitirCancelamentoSefaz,
  enviarRequisicaoSoapSefaz
};
