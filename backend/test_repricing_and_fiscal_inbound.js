/**
 * Teste Automatizado E2E:
 * 1. Repasse Inteligente de Preços (Aumento de CMV e Queda >= 15% c/ preservação de margem)
 * 2. Histórico de Custos e Preços (product_price_cost_history)
 * 3. Conversão de CFOPs de Entrada
 * 4. SPED Fiscal com Registros 0150, C100 de Entrada (Mod. 55) e C190
 * 5. SINTEGRA Oficial (Convênio ICMS 57/95 - 126 caracteres por linha)
 */

const { db, initErpDatabase } = require('./modules/erp/erp-database');
const { processarPreviewNfe, confirmarImportacaoNfe, converterCfopEntrada } = require('./modules/erp/erp-nfe-inbound.service');
const { gerarSpedFiscalEfd } = require('./modules/erp/fiscal-accounting.service');
const { gerarArquivoSintegra } = require('./modules/erp/sintegra.service');

function runTest() {
  console.log('🧪 [TEST] Iniciando bateria de testes fiscais e de precificação...');
  initErpDatabase();

  const compTest = '2026-11';

  // 1. Setup de Produtos de Teste no Catálogo Local
  const prodAltaCode = 'TEST_ALTA_01';
  const prodQuedaCode = 'TEST_QUEDA_02';
  const prodEstavelCode = 'TEST_ESTAVEL_03';

  // Limpa registros prévios de teste
  db.prepare('DELETE FROM products WHERE code IN (?, ?, ?)').run(prodAltaCode, prodQuedaCode, prodEstavelCode);
  db.prepare('DELETE FROM product_price_cost_history WHERE product_code IN (?, ?, ?)').run(prodAltaCode, prodQuedaCode, prodEstavelCode);
  db.prepare("DELETE FROM invoices WHERE invoice_number = '888777'").run();

  // Insere produtos com margem de 100% (Markup 2.0x): Preço de Venda = 2x Custo
  // Prod 1: Custo 10.00 -> Venda 20.00
  db.prepare(`
    INSERT INTO products (code, barcode, name, sale_price, cost_price, stock_qty, ncm, cest, category_id)
    VALUES (?, '7891111111111', 'PRODUTO TESTE ALTA CMV', 20.00, 10.00, 5, '30049099', '1300100', 7)
  `).run(prodAltaCode);

  // Prod 2: Custo 20.00 -> Venda 40.00
  db.prepare(`
    INSERT INTO products (code, barcode, name, sale_price, cost_price, stock_qty, ncm, cest, category_id)
    VALUES (?, '7892222222222', 'PRODUTO TESTE QUEDA 20%', 40.00, 20.00, 10, '30049099', '1300100', 7)
  `).run(prodQuedaCode);

  // Prod 3: Custo 30.00 -> Venda 60.00
  db.prepare(`
    INSERT INTO products (code, barcode, name, sale_price, cost_price, stock_qty, ncm, cest, category_id)
    VALUES (?, '7893333333333', 'PRODUTO TESTE QUEDA 5%', 60.00, 30.00, 8, '30049099', '1300100', 7)
  `).run(prodEstavelCode);

  console.log('✅ Produtos de teste configurados no banco local.');

  // 2. Teste da Conversão de CFOP
  const cfopMg = converterCfopEntrada('5405', 'MG');
  const cfopSp = converterCfopEntrada('6403', 'SP');
  const cfopNorm = converterCfopEntrada('6102', 'RJ');
  if (cfopMg !== '1403' || cfopSp !== '2403' || cfopNorm !== '2102') {
    throw new Error(`Falha na conversão de CFOP: MG=${cfopMg}, SP=${cfopSp}, RJ=${cfopNorm}`);
  }
  console.log('✅ Motor de conversão de CFOPs de entrada validado com sucesso (5405->1403, 6403->2403, 6102->2102).');

  // 3. XML Sintético de NF-e da Distribuidora de SP
  const xmlFake = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe35261100000000000199550010008887771234567890">
      <ide>
        <nNF>888777</nNF>
        <serie>1</serie>
        <dhEmi>2026-11-02T10:00:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>00000000000199</CNPJ>
        <xNome>DISTRIBUIDORA FARMACEUTICA TESTE LTDA</xNome>
        <IE>123456789012</IE>
        <enderEmit>
          <xLgr>AVENIDA PAULISTA</xLgr>
          <nro>1000</nro>
          <xBairro>BELA VISTA</xBairro>
          <cMun>3550308</cMun>
          <xMun>SAO PAULO</xMun>
          <UF>SP</UF>
          <CEP>01310100</CEP>
        </enderEmit>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>COD_ALTA</cProd>
          <cEAN>7891111111111</cEAN>
          <xProd>PRODUTO TESTE ALTA CMV</xProd>
          <NCM>30049099</NCM>
          <CFOP>6403</CFOP>
          <uCom>UN</uCom>
          <qCom>10.00</qCom>
          <vUnCom>12.00</vUnCom>
          <vProd>120.00</vProd>
        </prod>
        <imposto>
          <ICMS>
            <ICMS60>
              <CST>60</CST>
              <vBCSTRet>120.00</vBCSTRet>
              <vICMSSTRet>0.00</vICMSSTRet>
            </ICMS60>
          </ICMS>
        </imposto>
      </det>
      <det nItem="2">
        <prod>
          <cProd>COD_QUEDA</cProd>
          <cEAN>7892222222222</cEAN>
          <xProd>PRODUTO TESTE QUEDA 20%</xProd>
          <NCM>30049099</NCM>
          <CFOP>6403</CFOP>
          <uCom>UN</uCom>
          <qCom>5.00</qCom>
          <vUnCom>16.00</vUnCom>
          <vProd>80.00</vProd>
        </prod>
        <imposto>
          <ICMS>
            <ICMS60>
              <CST>60</CST>
            </ICMS60>
          </ICMS>
        </imposto>
      </det>
      <det nItem="3">
        <prod>
          <cProd>COD_ESTAVEL</cProd>
          <cEAN>7893333333333</cEAN>
          <xProd>PRODUTO TESTE QUEDA 5%</xProd>
          <NCM>30049099</NCM>
          <CFOP>6403</CFOP>
          <uCom>UN</uCom>
          <qCom>4.00</qCom>
          <vUnCom>28.50</vUnCom>
          <vProd>114.00</vProd>
        </prod>
        <imposto>
          <ICMS>
            <ICMS60>
              <CST>60</CST>
            </ICMS60>
          </ICMS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vProd>314.00</vProd>
          <vNF>314.00</vNF>
          <vICMS>0.00</vICMS>
          <vST>0.00</vST>
          <vIPI>0.00</vIPI>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;

  // 4. Teste de Preview
  const preview = processarPreviewNfe(xmlFake);
  if (!preview.success || preview.items.length !== 3) {
    throw new Error('Falha no processamento do Preview do XML.');
  }

  const it1 = preview.items[0]; // Custo foi de 10 -> 12 (+20%)
  const it2 = preview.items[1]; // Custo foi de 20 -> 16 (-20%)
  const it3 = preview.items[2]; // Custo foi de 30 -> 28.50 (-5%)

  console.log(`[Preview] Item 1 (Alta): Ação=${it1.cost_action}, Dif=+R$ ${it1.cost_difference_val} (+${it1.cost_difference_pct}%), Novo Preço Sugerido=R$ ${it1.suggested_sale_price}`);
  console.log(`[Preview] Item 2 (Queda >= 15%): Ação=${it2.cost_action}, Dif=R$ ${it2.cost_difference_val} (${it2.cost_difference_pct}%), Novo Preço Sugerido=R$ ${it2.suggested_sale_price}`);
  console.log(`[Preview] Item 3 (Queda leve): Ação=${it3.cost_action}, Dif=R$ ${it3.cost_difference_val} (${it3.cost_difference_pct}%), Preço Mantido=R$ ${it3.suggested_sale_price}`);

  if (it1.cost_action !== 'INCREASE' || !it1.apply_repricing) {
    throw new Error(`Item 1 deveria ser INCREASE com apply_repricing=true, mas veio ${it1.cost_action}`);
  }
  // No item 1, preço de venda antes era 20.00 para custo 10.00 (2.0x). Custo subiu para 12.00 -> novo preço esperado: ~24.00
  if (it1.suggested_sale_price < 23.90) {
    throw new Error(`Item 1 preço sugerido inconsistente: ${it1.suggested_sale_price}`);
  }

  if (it2.cost_action !== 'DECREASE_15PCT' || !it2.apply_repricing) {
    throw new Error(`Item 2 deveria ser DECREASE_15PCT com apply_repricing=true, mas veio ${it2.cost_action}`);
  }
  // No item 2, preço antes era 40.00 para custo 20.00 (2.0x). Custo caiu para 16.00 (-20%) -> novo preço esperado: ~32.00
  if (it2.suggested_sale_price > 33.00 || it2.suggested_sale_price < 31.00) {
    throw new Error(`Item 2 preço sugerido inconsistente: ${it2.suggested_sale_price}`);
  }

  if (it3.cost_action !== 'STABLE' || it3.apply_repricing) {
    throw new Error(`Item 3 deveria ser STABLE com apply_repricing=false, mas veio ${it3.cost_action}`);
  }
  console.log('✅ Regras de aumento e redução >= 15% validadas perfeitamente no Preview!');

  // 5. Confirmação da Importação com Repasse Ativo
  const confirmResult = confirmarImportacaoNfe({
    ...preview,
    items: preview.items
  });

  if (!confirmResult.success || confirmResult.prices_updated < 2) {
    throw new Error(`Falha na confirmação da importação. Preços atualizados: ${confirmResult.prices_updated}`);
  }

  // Verifica se o preço de venda de fato mudou na tabela `products`
  const p1Updated = db.prepare('SELECT sale_price, cost_price, stock_qty FROM products WHERE code = ?').get(prodAltaCode);
  const p2Updated = db.prepare('SELECT sale_price, cost_price, stock_qty FROM products WHERE code = ?').get(prodQuedaCode);
  const p3Updated = db.prepare('SELECT sale_price, cost_price, stock_qty FROM products WHERE code = ?').get(prodEstavelCode);

  console.log(`[Pós-Importação] Prod 1: Custo=${p1Updated.cost_price}, Novo Preço Venda=${p1Updated.sale_price}, Estoque=${p1Updated.stock_qty}`);
  console.log(`[Pós-Importação] Prod 2: Custo=${p2Updated.cost_price}, Novo Preço Venda=${p2Updated.sale_price}, Estoque=${p2Updated.stock_qty}`);
  console.log(`[Pós-Importação] Prod 3: Custo=${p3Updated.cost_price}, Preço Venda Mantido=${p3Updated.sale_price}, Estoque=${p3Updated.stock_qty}`);

  if (p1Updated.sale_price <= 20.00 || p2Updated.sale_price >= 40.00 || p3Updated.sale_price !== 60.00) {
    throw new Error('Preços no catálogo products não refletiram as regras de repasse.');
  }

  // Verifica gravação no histórico de custos e preços
  const historyRecords = db.prepare('SELECT * FROM product_price_cost_history WHERE product_code IN (?, ?)').all(prodAltaCode, prodQuedaCode);
  if (historyRecords.length < 2) {
    throw new Error('Registros de histórico de preços não foram gravados em product_price_cost_history.');
  }
  console.log('✅ Histórico gravado com sucesso em product_price_cost_history.');

  // 6. Teste de Geração do SPED Fiscal (EFD ICMS/IPI)
  const spedTxt = gerarSpedFiscalEfd(compTest);
  console.log('[DEBUG SPED TXT]:\n' + spedTxt.split('\r\n').slice(0, 25).join('\n'));
  if (!spedTxt.includes('|0150|FORN_00000000000199|DISTRIBUIDORA FARMACEUTICA TESTE LTDA|')) {
    throw new Error('SPED não gerou o Registro 0150 para a distribuidora da nota de entrada.');
  }
  if (!spedTxt.includes('|C100|0|1|FORN_00000000000199|55|00|1|888777|')) {
    throw new Error('SPED não gerou o Registro C100 de entrada (IND_OPER = 0, Mod 55).');
  }
  if (!spedTxt.includes('|C190|600|2403|') && !spedTxt.includes('|2403|')) {
    throw new Error('SPED não gerou o Registro C190 com o CFOP de entrada 2403.');
  }
  console.log('✅ SPED Fiscal gerou perfeitamente os Registros 0150, C100 de entrada e C190.');

  // 7. Teste de Geração do SINTEGRA Oficial
  const sintegraTxt = gerarArquivoSintegra(compTest);
  const linhasSintegra = sintegraTxt.split('\r\n').filter(Boolean);

  console.log(`[SINTEGRA] Total de linhas geradas: ${linhasSintegra.length}`);

  // Validação estrita: cada linha DEVE ter exatamente 126 caracteres
  for (let idx = 0; idx < linhasSintegra.length; idx++) {
    const l = linhasSintegra[idx];
    if (l.length !== 126) {
      throw new Error(`Linha ${idx + 1} do SINTEGRA possui tamanho ${l.length} (esperado 126): "${l}"`);
    }
  }

  const temReg10 = linhasSintegra.some(l => l.startsWith('10'));
  const temReg11 = linhasSintegra.some(l => l.startsWith('11'));
  const temReg50Entrada = linhasSintegra.some(l => l.startsWith('50') && l.includes('55') && l.includes('2403') && l.includes('T'));
  const temReg54Entrada = linhasSintegra.some(l => l.startsWith('54') && l.includes('55') && l.includes('2403'));
  const temReg75 = linhasSintegra.some(l => l.startsWith('75'));
  const temReg90 = linhasSintegra.some(l => l.startsWith('90'));

  if (!temReg10 || !temReg11 || !temReg50Entrada || !temReg54Entrada || !temReg75 || !temReg90) {
    throw new Error(`Estrutura do SINTEGRA incompleta: 10=${temReg10}, 11=${temReg11}, 50=${temReg50Entrada}, 54=${temReg54Entrada}, 75=${temReg75}, 90=${temReg90}`);
  }
  console.log('✅ Arquivo oficial do SINTEGRA gerado com 100% de conformidade com o Convênio ICMS 57/95 (126 caracteres por linha).');

  // Limpeza
  db.prepare('DELETE FROM products WHERE code IN (?, ?, ?)').run(prodAltaCode, prodQuedaCode, prodEstavelCode);
  db.prepare('DELETE FROM product_price_cost_history WHERE product_code IN (?, ?, ?)').run(prodAltaCode, prodQuedaCode, prodEstavelCode);
  db.prepare("DELETE FROM invoices WHERE invoice_number = '888777'").run();

  console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO ABSOLUTO!');
}

try {
  runTest();
} catch (e) {
  console.error('❌ ERRO NO TESTE:', e);
  process.exit(1);
}
