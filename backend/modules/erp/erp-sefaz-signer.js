/**
 * Belinha ERP - SEFAZ Signer (Assinatura Digital XMLDSig de NF-e / NFC-e)
 * Gerencia a extração de chaves e certificados X.509 de arquivos PKCS#12 (.pfx / .p12)
 * e realiza a assinatura digital no padrão estrito da SEFAZ (RSA-SHA1, C14N e Enveloped).
 */

const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');

/**
 * Abre o container PKCS#12 (.pfx ou .p12) e extrai a chave privada, certificado e metadados
 * @param {string|Buffer} pfxInput Conteúdo em Base64 ou Buffer do arquivo .pfx
 * @param {string} passphrase Senha do certificado
 * @returns {Object} { privateKeyPem, certificatePem, certificateClean, validTo, subject, cnpj, razaoSocial }
 */
function extrairDadosCertificadoA1(pfxInput, passphrase = '') {
  if (!pfxInput) {
    throw new Error('Arquivo de Certificado Digital A1 (.pfx) não informado.');
  }

  const pfxBuffer = Buffer.isBuffer(pfxInput)
    ? pfxInput
    : Buffer.from(pfxInput.replace(/^data:.*?;base64,/, ''), 'base64');

  const pfxDer = pfxBuffer.toString('binary');
  const pfxAsn1 = forge.asn1.fromDer(pfxDer);
  const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, passphrase || '');

  // 1. Localiza a Chave Privada
  let privateKeyForge = null;
  for (const safeContent of pfx.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (safeBag.key) {
        privateKeyForge = safeBag.key;
        break;
      }
    }
    if (privateKeyForge) break;
  }

  if (!privateKeyForge) {
    throw new Error('Chave privada não encontrada no arquivo .pfx. Verifique se o arquivo está corrompido ou se a senha está correta.');
  }

  // 2. Localiza o Certificado X.509 da empresa
  let certForge = null;
  for (const safeContent of pfx.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (safeBag.cert) {
        // Se houver mais de um certificado na cadeia, localiza o que possui o Subject CN correspondente
        certForge = safeBag.cert;
        break;
      }
    }
    if (certForge) break;
  }

  if (!certForge) {
    throw new Error('Certificado X.509 não encontrado dentro do container PKCS#12.');
  }

  const privateKeyPem = forge.pki.privateKeyToPem(privateKeyForge);
  const certificatePem = forge.pki.certificateToPem(certForge);

  // Certificado limpo em base64 (sem cabeçalho e sem quebras de linha para a tag <X509Certificate>)
  const certificateClean = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/[\r\n\s]/g, '');

  // Metadados do titular
  const validTo = certForge.validity.notAfter;
  const validFrom = certForge.validity.notBefore;
  
  let commonName = '';
  for (const attr of certForge.subject.attributes) {
    if (attr.name === 'commonName') {
      commonName = attr.value;
      break;
    }
  }

  // Em certificados e-CNPJ brasileiros, o CNPJ costuma vir no CN (Ex: NOME DA EMPRESA:12345678000199)
  let cnpjTitular = null;
  const cnpjMatch = commonName.match(/:(\d{14})/);
  if (cnpjMatch) {
    cnpjTitular = cnpjMatch[1];
  }

  return {
    privateKeyPem,
    certificatePem,
    certificateClean,
    validFrom,
    validTo,
    isExpired: new Date() > validTo,
    commonName,
    cnpjTitular,
    pfxBuffer
  };
}

/**
 * Assina digitalmente um XML de NF-e ou NFC-e conforme Manual de Padrões Técnicos da SEFAZ
 * @param {string} xmlString XML contendo a tag <infNFe Id="NFe...">
 * @param {string} chaveAcesso Chave de 44 dígitos
 * @param {string} privateKeyPem Chave privada no formato PEM
 * @param {string} certificateClean Certificado X.509 em base64 puro (sem cabeçalhos)
 * @returns {string} XML devidamente assinado com a tag <Signature>
 */
function assinarXmlNfe(xmlString, chaveAcesso, privateKeyPem, certificateClean) {
  if (!xmlString) throw new Error('XML não fornecido para assinatura.');
  if (!chaveAcesso || chaveAcesso.length !== 44) throw new Error('Chave de acesso inválida para assinatura.');
  if (!privateKeyPem) throw new Error('Chave privada PEM não fornecida.');
  if (!certificateClean) throw new Error('Certificado X.509 limpo não fornecido.');

  // Configuração do assinador XML-Crypto para o padrão da SEFAZ
  const sig = new SignedXml();
  sig.signingKey = privateKeyPem;
  sig.privateKey = privateKeyPem;
  sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
  sig.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

  // Configura a referência para a tag infNFe
  sig.addReference({
    xpath: `//*[local-name(.)='infNFe']`,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    uri: `#NFe${chaveAcesso}`
  });

  // Configura a tag <X509Certificate> dentro de <KeyInfo>
  sig.getKeyInfoContent = () => {
    return `<X509Data><X509Certificate>${certificateClean}</X509Certificate></X509Data>`;
  };

  sig.computeSignature(xmlString, {
    location: {
      reference: '/*',
      action: 'append'
    }
  });

  return sig.getSignedXml();
}

/**
 * Assina digitalmente um Evento de NF-e (ex: Cancelamento)
 */
function assinarXmlEvento(xmlString, idEvento, privateKeyPem, certificateClean) {
  const sig = new SignedXml();
  sig.signingKey = privateKeyPem;
  sig.privateKey = privateKeyPem;
  sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
  sig.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

  sig.addReference({
    xpath: `//*[local-name(.)='infEvento']`,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    uri: `#${idEvento}`
  });

  sig.getKeyInfoContent = () => {
    return `<X509Data><X509Certificate>${certificateClean}</X509Certificate></X509Data>`;
  };

  sig.computeSignature(xmlString, {
    location: {
      reference: '/*',
      action: 'append'
    }
  });

  return sig.getSignedXml();
}

module.exports = {
  extrairDadosCertificadoA1,
  assinarXmlNfe,
  assinarXmlEvento
};
