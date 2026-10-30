/**
 * Belinha ERP - Teste Automatizado de Assinatura XMLDSig e Certificado A1
 * Valida a extração de PKCS#12, assinatura no padrão estrito da SEFAZ
 * e a geração de NFC-e assinada digitalmente.
 */

const forge = require('node-forge');
const { extrairDadosCertificadoA1, assinarXmlNfe } = require('./modules/erp/erp-sefaz-signer');
const { initErpDatabase, db } = require('./modules/erp/erp-database');
const { emitirCupomFiscal, salvarConfiguracoesFiscais } = require('./modules/erp/erp-fiscal.service');

function gerarCertificadoA1Sintetico(senha = '123456') {
  console.log('[Teste] 🔑 Gerando par de chaves RSA 2048-bit e certificado X.509 autoassinado...');
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [
    { name: 'commonName', value: 'BELA FARMA SUL LTDA:47378578000140' },
    { name: 'countryName', value: 'BR' },
    { shortName: 'ST', value: 'MG' },
    { name: 'localityName', value: 'Juiz de Fora' },
    { name: 'organizationName', value: 'BELA FARMA SUL LTDA' }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // Empacota em container PKCS#12 (.pfx)
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, senha, {
    algorithm: '3des'
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const pfxBuffer = Buffer.from(p12Der, 'binary');

  return {
    pfxBuffer,
    pfxBase64: pfxBuffer.toString('base64'),
    senha
  };
}

async function runTests() {
  console.log('=== INICIANDO TESTES DO MOTOR FISCAL SEFAZ ===');

  // 1. Gera o PFX sintético
  const { pfxBuffer, pfxBase64, senha } = gerarCertificadoA1Sintetico('bela123');

  // 2. Testa extração do certificado
  console.log('[Teste] 📂 Testando extrairDadosCertificadoA1...');
  const certData = extrairDadosCertificadoA1(pfxBase64, senha);

  if (!certData.privateKeyPem.includes('BEGIN RSA PRIVATE KEY') && !certData.privateKeyPem.includes('BEGIN PRIVATE KEY')) {
    throw new Error('Chave privada PEM não extraída corretamente.');
  }
  if (!certData.certificateClean || certData.certificateClean.includes('\n')) {
    throw new Error('Certificado X.509 clean contém quebras de linha ou está vazio.');
  }
  if (certData.cnpjTitular !== '47378578000140') {
    throw new Error(`CNPJ extraído incorreto: esperado 47378578000140, obtido ${certData.cnpjTitular}`);
  }
  console.log('   ✅ Certificado A1 extraído com sucesso: CNPJ', certData.cnpjTitular, '| Expira em:', certData.validTo.toISOString());

  // 3. Testa assinatura XMLDSig
  console.log('[Teste] ✍️ Testando assinarXmlNfe com XMLDSig...');
  const chaveAcesso = '31261047378578000140650010000000011000000019';
  const xmlExemplo = `<?xml version="1.0" encoding="UTF-8"?><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${chaveAcesso}" versao="4.00"><ide><cUF>31</cUF><cNF>00000001</cNF><natOp>VENDA</natOp><mod>65</mod><serie>1</serie><nNF>1</nNF><dhEmi>2026-10-30T12:00:00-03:00</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>3136702</cMunFG><tpImp>4</tpImp><tpEmis>1</tpEmis><cDV>9</cDV><tpAmb>2</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>Belinha_1.0</verProc></ide><emit><CNPJ>47378578000140</CNPJ><xNome>BELA FARMA SUL LTDA</xNome></emit><total><ICMSTot><vNF>50.00</vNF></ICMSTot></total></infNFe></NFe>`;

  const xmlAssinado = assinarXmlNfe(xmlExemplo, chaveAcesso, certData.privateKeyPem, certData.certificateClean);

  if (!xmlAssinado.includes('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">')) {
    throw new Error('XML assinado não contém a tag raiz <Signature>.');
  }
  if (!xmlAssinado.includes('<SignatureValue>')) {
    throw new Error('XML assinado não contém <SignatureValue>.');
  }
  if (!xmlAssinado.includes('<X509Certificate>')) {
    throw new Error('XML assinado não contém <X509Certificate>.');
  }
  if (!xmlAssinado.includes(`URI="#NFe${chaveAcesso}"`)) {
    throw new Error('Referência da assinatura não aponta para o Id da infNFe.');
  }
  console.log('   ✅ XML assinado com sucesso e validado estruturalmente!');

  // 4. Testa configuração no banco e emissão de venda com contingência
  console.log('[Teste] 🛒 Testando emissão de cupom fiscal com o serviço integrado...');
  initErpDatabase();

  salvarConfiguracoesFiscais({
    cnpj: '47378578000140',
    razao_social: 'BELA FARMA SUL LTDA',
    uf: 'MG',
    cod_municipio_ibge: '3136702',
    certificate_pfx_base64: pfxBase64,
    certificate_password: senha
  });

  // Cria uma venda de teste
  const saleId = 'test_fiscal_' + Date.now();
  db.prepare(`
    INSERT INTO sales (id, user_id, sale_date, sale_time, total_items_value, discount_value, total_value, payment_method, user_name, status, fiscal_status, created_at)
    VALUES (?, 'usr_teste', '2026-10-30', '12:00:00', 30.00, 0.00, 30.00, 'PIX', 'Caixa Teste', 'CONCLUIDA', 'NAO_EMITIDO', datetime('now', 'localtime'))
  `).run(saleId);

  db.prepare(`
    INSERT INTO sale_items (id, sale_id, product_code, product_name, barcode, quantity, unit_price, total_price, unit_cost, total_cost, profit)
    VALUES (?, ?, 'PROD01', 'DIPIRONA 500MG 10CPR', '7891234567890', 2, 15.00, 30.00, 10.00, 20.00, 10.00)
  `).run('item_' + saleId, saleId);

  // Emite em contingência para testar a assinatura e persistência no banco
  const danfe = await emitirCupomFiscal(saleId, { contingency: true, contingency_reason: 'TESTE DE CONTINGENCIA OFFLINE' });

  if (danfe.fiscal_status !== 'CONTINGENCIA') {
    throw new Error(`Status fiscal incorreto: esperado CONTINGENCIA, obtido ${danfe.fiscal_status}`);
  }
  if (!danfe.access_key || danfe.access_key.length !== 44) {
    throw new Error(`Chave de acesso inválida no DANFE: ${danfe.access_key}`);
  }
  if (!danfe.qr_code_base64.startsWith('data:image/png;base64,')) {
    throw new Error('QR Code Base64 não gerado.');
  }

  // Verifica o XML salvo no banco
  const saleDb = db.prepare('SELECT xml_content FROM sales WHERE id = ?').get(saleId);
  if (!saleDb.xml_content.includes('<Signature')) {
    throw new Error('XML salvo no banco de dados não está assinado digitalmente!');
  }

  console.log('   ✅ Cupom Fiscal assinado e salvo com sucesso no SQLite!');
  console.log('   Chave:', danfe.access_key);
  console.log('   DANFE:', danfe.empresa.razao_social, '- Total: R$', danfe.total_value || 30.00);

  // Limpa venda de teste
  db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(saleId);
  db.prepare('DELETE FROM sales WHERE id = ?').run(saleId);

  console.log('\n🎉 TODOS OS TESTES FISCAIS SEFAZ PASSARAM COM 100% DE SUCESSO!');
}

runTests().catch(err => {
  console.error('\n❌ ERRO NO TESTE FISCAL:', err);
  process.exit(1);
});
