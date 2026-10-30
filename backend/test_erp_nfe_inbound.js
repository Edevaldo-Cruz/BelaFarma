/**
 * Teste Automatizado do Motor de Entrada de Notas Fiscais (NF-e)
 */

const fs = require('fs');
const path = require('path');
const {
  processarPreviewNfe,
  confirmarImportacaoNfe,
  listarNotasEntrada,
  obterNotaDetalhada
} = require('./modules/erp/erp-nfe-inbound.service');
const { obterProdutoPorCodigo, cadastrarProduto } = require('./modules/erp/erp-products.service');
const { db, initErpDatabase } = require('./modules/erp/erp-database');

console.log('--- INICIANDO TESTE DO MÓDULO DE ENTRADA DE NOTAS FISCAIS (NF-e) ---');

initErpDatabase();

// 1. Gera um XML sintético válido de NF-e (Mod 55) com 2 produtos
const syntheticNfeXml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe35260100000000000191550010000123451000012345" versao="4.00">
      <ide>
        <nNF>12345</nNF>
        <serie>1</serie>
        <dhEmi>2026-10-30T10:00:00-03:00</dhEmi>
        <tpNF>1</tpNF>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>DISTRIBUIDORA DE MEDICAMENTOS FARMA TESTE LTDA</xNome>
        <xFant>FARMA TESTE</xFant>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>DIP500</cProd>
          <cEAN>7896714201015</cEAN>
          <xProd>DIPIRONA MONOIDRATADA 500MG 10 COMPRIMIDOS</xProd>
          <NCM>30049099</NCM>
          <CFOP>5102</CFOP>
          <uCom>CX</uCom>
          <qCom>5.0000</qCom>
          <vUnCom>12.0000</vUnCom>
          <vProd>60.00</vProd>
          <cEANTrib>7896714201015</cEANTrib>
          <uTrib>CX</uTrib>
          <qTrib>5.0000</qTrib>
          <vUnTrib>12.0000</vUnTrib>
          <rastro>
            <nLote>LT9988</nLote>
            <dVal>2027-12-31</dVal>
          </rastro>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <vBC>60.00</vBC>
              <pICMS>18.00</pICMS>
              <vICMS>10.80</vICMS>
            </ICMS00>
          </ICMS>
        </imposto>
      </det>
      <det nItem="2">
        <prod>
          <cProd>NOVOPROD</cProd>
          <cEAN>7899999900011</cEAN>
          <xProd>VITAMINA C 1G EFERVESCENTE 10 CPR - MARCA NOVA</xProd>
          <NCM>21069030</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>10.0000</qCom>
          <vUnCom>8.5000</vUnCom>
          <vProd>85.00</vProd>
          <cEANTrib>7899999900011</cEANTrib>
          <uTrib>UN</uTrib>
          <qTrib>10.0000</qTrib>
          <vUnTrib>8.5000</vUnTrib>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vProd>145.00</vProd>
          <vNF>145.00</vNF>
          <vDesc>0.00</vDesc>
          <vST>0.00</vST>
        </ICMSTot>
      </total>
      <cobr>
        <dup>
          <nDup>001</nDup>
          <dVenc>2026-11-20</dVenc>
          <vDup>145.00</vDup>
        </dup>
      </cobr>
    </infNFe>
  </NFe>
</nfeProc>`;

// Limpeza inicial para o teste ser idempotente
db.prepare('DELETE FROM invoices WHERE invoice_number = ?').run('12345');
db.prepare('DELETE FROM products WHERE barcode = ?').run('7899999900011');
db.prepare('DELETE FROM products WHERE barcode = ?').run('7896714201015');

// 2. Garante produto 1 no banco para testar o match
let prodExistente = obterProdutoPorCodigo('7896714201015');
if (!prodExistente) {
  cadastrarProduto({
    code: '7896714201015',
    barcode: '7896714201015',
    name: 'DIPIRONA MONOIDRATADA 500MG 10 COMPRIMIDOS',
    sale_price: 15.00,
    cost_price: 10.00,
    stock_qty: 10,
    presentation: '10 COMP'
  });
}
prodExistente = obterProdutoPorCodigo('7896714201015');
const stockAntes = prodExistente.stock_qty;
console.log(`Estoque anterior do produto 7896714201015: ${stockAntes}`);

// 3. Testa processarPreviewNfe
console.log('\n--- 1. Testando Preview do XML ---');
const preview = processarPreviewNfe(syntheticNfeXml);
console.log(`Fornecedor: ${preview.supplier_name} (CNPJ: ${preview.supplier_cnpj})`);
console.log(`Nota: ${preview.invoice_number} Série: ${preview.series} Total: R$ ${preview.total_invoice}`);
console.log(`Itens extraídos: ${preview.items.length}`);

if (preview.items.length !== 2) {
  throw new Error(`Esperado 2 itens, obtido ${preview.items.length}`);
}

const item1 = preview.items[0];
console.log(`Item 1: ${item1.description} (EAN: ${item1.barcode}) - Match: ${item1.is_matched} (Code: ${item1.product_code})`);
console.log(`Lote detectado: ${item1.lot_number}, Validade: ${item1.expiration_date}`);

const item2 = preview.items[1];
console.log(`Item 2: ${item2.description} (EAN: ${item2.barcode}) - Match: ${item2.is_matched}`);

// 4. Testa confirmação da importação
console.log('\n--- 2. Testando Confirmação de Entrada ---');
// Configura payload com conversão: item 1 compramos 5 caixas com fator 2 (10 unidades no estoque)
const payloadImportacao = {
  ...preview,
  items: [
    {
      ...item1,
      conversion_factor: 2 // 5 caixas * 2 = 10 unidades
    },
    {
      ...item2,
      conversion_factor: 1 // 10 unidades
    }
  ]
};

const resultadoImport = confirmarImportacaoNfe(payloadImportacao);
console.log('Resultado importação:', resultadoImport);

// 5. Verifica estoque atualizado
const prod1Depois = obterProdutoPorCodigo('7896714201015');
console.log(`Estoque depois do produto 7896714201015: ${prod1Depois.stock_qty} (Esperado: ${stockAntes + 10})`);
if (prod1Depois.stock_qty !== stockAntes + 10) {
  throw new Error(`Estoque incorreto! Esperado ${stockAntes + 10}, obtido ${prod1Depois.stock_qty}`);
}

// Custo unitário recalculado considerando fator 2: vUnCom era 12, com fator 2 vira 6.00
console.log(`Custo unitário recalculado produto 1: R$ ${prod1Depois.cost_price}`);

const prod2Depois = obterProdutoPorCodigo('7899999900011');
console.log(`Novo produto cadastrado: ${prod2Depois?.name}, Estoque: ${prod2Depois?.stock_qty}, Preço: R$ ${prod2Depois?.sale_price}, Custo: R$ ${prod2Depois?.cost_price}`);
if (!prod2Depois || prod2Depois.stock_qty !== 10) {
  throw new Error(`Novo produto não cadastrado com estoque correto!`);
}

// 6. Testa listagem e detalhes
console.log('\n--- 3. Testando Listagem de Notas Fiscais ---');
const lista = listarNotasEntrada({ page: 1, limit: 5 });
console.log(`Total de notas encontradas: ${lista.total}`);
const notaSalva = obterNotaDetalhada(resultadoImport.invoice_id);
console.log(`Nota ${notaSalva.invoice_number} carregada com ${notaSalva.items?.length} itens.`);

console.log('\n✅ TODOS OS TESTES DE ENTRADA DE NOTAS FISCAIS PASSARAM COM SUCESSO!');
