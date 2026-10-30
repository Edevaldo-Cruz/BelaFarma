/**
 * Teste Automatizado do Motor Fiscal (NFC-e Modelo 65) do Belinha ERP
 */

const {
  obterConfiguracoesFiscais,
  salvarConfiguracoesFiscais,
  calcularDvModulo11,
  gerarChaveAcessoNfce,
  gerarQrCodeUrl,
  emitirCupomFiscal,
  obterDanfeNfce,
  cancelarCupomFiscal
} = require('./modules/erp/erp-fiscal.service');

const { registrarVenda } = require('./modules/erp/erp-pos.service');
const { cadastrarProduto, obterProdutoPorCodigo } = require('./modules/erp/erp-products.service');
const { db, initErpDatabase } = require('./modules/erp/erp-database');

console.log('--- INICIANDO TESTE DO MÓDULO FISCAL (NFC-e) ---');
initErpDatabase();

// 1. Testa Cálculo do Dígito Verificador Módulo 11
console.log('\n--- 1. Testando Dígito Verificador Módulo 11 da SEFAZ ---');
// Exemplo canônico SEFAZ: Chave de 43 dígitos
const chaveTeste43 = '3126104737857800014065001000000001100000001';
const dv = calcularDvModulo11(chaveTeste43);
console.log(`Chave 43: ${chaveTeste43} -> DV calculado: ${dv}`);
if (typeof dv !== 'number' || dv < 0 || dv > 9) {
  throw new Error(`Dígito verificador inválido: ${dv}`);
}

// 2. Testa Geração de Chave de Acesso Canônica
console.log('\n--- 2. Testando Geração de Chave de 44 dígitos ---');
const chaveCompleta = gerarChaveAcessoNfce({
  uf: 'MG',
  cnpj: '47378578000140',
  mod: '65',
  serie: 1,
  nNF: 123
});
console.log(`Chave completa (44 dígitos): ${chaveCompleta} (Tamanho: ${chaveCompleta.length})`);
if (chaveCompleta.length !== 44) {
  throw new Error(`Chave de acesso com tamanho incorreto: ${chaveCompleta.length}`);
}

// 3. Testa Geração de QR Code com Hash SHA-1 do CSC
console.log('\n--- 3. Testando Geração do Link do QR Code SEFAZ ---');
const qrUrl = gerarQrCodeUrl({
  chaveAcesso: chaveCompleta,
  versao: '2',
  tpAmb: '2',
  idCsc: '000001',
  csc: 'TESTE1234567890ABCDEF',
  uf: 'MG'
});
console.log(`URL do QR Code gerada:\n${qrUrl}`);
if (!qrUrl.includes('qrcode.xhtml?p=') || !qrUrl.includes('|')) {
  throw new Error('URL do QR Code fora do padrão SEFAZ');
}

// 4. Garante produto para venda de teste
let prod = obterProdutoPorCodigo('7891234567890');
if (!prod) {
  prod = cadastrarProduto({
    code: '7891234567890',
    barcode: '7891234567890',
    name: 'PARACETAMOL 750MG 20 COMPRIMIDOS',
    sale_price: 18.50,
    cost_price: 9.00,
    stock_qty: 100,
    ncm: '30049099'
  });
}

// 5. Registra uma venda no PDV
console.log('\n--- 4. Registrando Venda de Teste no PDV ---');
const venda = registrarVenda({
  items: [
    {
      product_code: prod.code,
      quantity: 2,
      unit_price: 18.50
    }
  ],
  payments: [
    {
      payment_method: 'DINHEIRO',
      amount: 37.00
    }
  ],
  user_name: 'Caixa Teste'
});
console.log(`Venda registrada com sucesso! ID: ${venda.sale_id}, Total: R$ ${venda.total_value}`);

// 6. Emite o Cupom Fiscal (NFC-e) para a venda
console.log('\n--- 5. Emitindo Cupom Fiscal (NFC-e Modelo 65) ---');
emitirCupomFiscal(venda.sale_id, {
  customer_cpf: '123.456.789-00'
}).then(danfe => {
  console.log(`NFC-e Emitida com Sucesso!`);
  console.log(`Número: #${danfe.nfe_number} Série: ${danfe.nfe_series}`);
  console.log(`Chave de Acesso: ${danfe.access_key_formatted}`);
  console.log(`Protocolo SEFAZ: ${danfe.protocol_number}`);
  console.log(`Empresa: ${danfe.empresa.razao_social} (CNPJ: ${danfe.empresa.cnpj})`);
  console.log(`Consumidor: ${danfe.consumidor.cpf}`);
  console.log(`QR Code gerado em base64: ${danfe.qr_code_base64?.slice(0, 40)}...`);

  if (!danfe.qr_code_base64 || !danfe.access_key) {
    throw new Error('Falha nos dados do DANFE');
  }

  // 7. Testa Cancelamento de Cupom Fiscal
  console.log('\n--- 6. Testando Cancelamento de Cupom Fiscal ---');
  const cancelResult = cancelarCupomFiscal(venda.sale_id, 'Erro de digitação do operador');
  console.log('Resultado cancelamento:', cancelResult);

  const danfeCancelado = db.prepare('SELECT fiscal_status FROM sales WHERE id = ?').get(venda.sale_id);
  console.log(`Status fiscal após cancelamento: ${danfeCancelado.fiscal_status}`);
  if (danfeCancelado.fiscal_status !== 'CANCELADO') {
    throw new Error('Status fiscal não atualizado para CANCELADO');
  }

  console.log('\n✅ TODOS OS TESTES DO MÓDULO FISCAL (NFC-e) PASSARAM COM SUCESSO!');
}).catch(err => {
  console.error('❌ ERRO NO TESTE FISCAL:', err);
  process.exit(1);
});
