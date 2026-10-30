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
  trimValues: true
});

/**
 * Executa uma requisição SOAP 1.2 sobre HTTPS com mTLS para a SEFAZ
 */
function enviarRequisicaoSoapSefaz(endpointUrl, soapAction, xmlDadosMsg, pfxBuffer, passphrase, timeoutMs = 8000) {
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
      rejectUnauthorized: false // Aceita as cadeias intermediárias da ICP-Brasil
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
  const retConsStatServ = parsed['soap12:Envelope']?.['soap12:Body']?.nfeResultMsg?.retConsStatServ || parsed.retConsStatServ;

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

  // Monta o lote síncrono (indSinc=1)
  const xmlLote = `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>${idLote}</idLote><indSinc>1</indSinc>${xmlNfeAssinado}</enviNFe>`;
  const soapAction = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4';

  const resp = await enviarRequisicaoSoapSefaz(ws, soapAction, xmlLote, pfxBuffer, passphrase, 8000);
  const parsed = xmlParser.parse(resp.body);

  const retEnviNFe = parsed['soap12:Envelope']?.['soap12:Body']?.nfeResultMsg?.retEnviNFe || parsed.retEnviNFe;
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

module.exports = {
  consultarStatusServicoSefaz,
  transmitirNfceSefaz,
  enviarRequisicaoSoapSefaz
};
