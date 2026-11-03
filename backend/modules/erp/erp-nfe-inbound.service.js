/**
 * Belinha ERP - NF-e Inbound Service
 * Processa arquivos XML de notas fiscais eletrônicas de compra (Mod. 55),
 * extrai dados fiscais completos para SPED Fiscal e SINTEGRA (Convênio ICMS 57/95),
 * analisa histórico de custos, preserva margem e executa repasse automático de preços
 * (aumento imediato em alta de CMV e repasse de desconto em quedas >= 15%).
 */

const { XMLParser } = require('fast-xml-parser');
const { db, initErpDatabase } = require('./erp-database');
const { obterProdutoPorCodigo, cadastrarProduto } = require('./erp-products.service');
const { roundUpToAcceptedCents, calcularPrecoSugeridoMarkup } = require('../../services/pricing-customizations.service');
const { atualizarPrecoVendaDigifarma } = require('../../services/digifarma.service');

// Garante colunas adicionais para NF-e em invoices e invoice_items
function ensureNfeColumns() {
  initErpDatabase();
}

/**
 * Converte o CFOP de saída do distribuidor para o CFOP de entrada correspondente da farmácia
 * @param {string} cfopOriginal CFOP informado pelo emitente no XML
 * @param {string} fornecedorUf UF do emitente (ex: 'MG', 'SP', 'RJ')
 * @returns {string} CFOP de entrada oficial
 */
function converterCfopEntrada(cfopOriginal, fornecedorUf = 'MG') {
  const cfopLimpo = String(cfopOriginal || '').replace(/\D/g, '');
  const isDentroEstado = String(fornecedorUf || 'MG').toUpperCase().trim() === 'MG';
  const prefixo = isDentroEstado ? '1' : '2';

  if (!cfopLimpo) return `${prefixo}403`;

  const resto = cfopLimpo.slice(1);

  // Vendas com Substituição Tributária (ex: 5401, 5403, 5405, 6401, 6403, 6404) -> Compra com ST
  if (resto.startsWith('40') || resto.startsWith('41') || resto.startsWith('42')) {
    return `${prefixo}403`;
  }

  // Vendas tributadas normalmente (ex: 5101, 5102, 6101, 6102) -> Compra para comercialização
  if (resto.startsWith('10') || resto.startsWith('11') || resto.startsWith('12')) {
    return `${prefixo}102`;
  }

  // Devoluções de vendas (ex: 5202, 6202) -> Devolução de compra
  if (resto.startsWith('20') || resto.startsWith('21')) {
    return `${prefixo}202`;
  }

  // Bonificações, brindes ou doações (ex: 5910, 6910)
  if (resto.startsWith('91')) {
    return `${prefixo}910`;
  }

  // Fallback padrão: substitui o primeiro dígito
  return `${prefixo}${resto}`;
}

/**
 * Calcula o novo preço de venda preservando rigorosamente a margem de contribuição atual
 * @param {Object} params { currentCost, currentSalePrice, finalUnitCost, categoryId }
 * @returns {number} Preço sugerido comercialmente
 */
function calcularNovoPrecoVendaPreservandoMargem({ currentCost, currentSalePrice, finalUnitCost, categoryId = 0 }) {
  const c = Number(finalUnitCost) || 0;
  if (c <= 0) return 0;

  const costRef = Number(currentCost) || 0;
  const priceRef = Number(currentSalePrice) || 0;

  if (costRef > 0 && priceRef > 0) {
    const markupMultiplier = priceRef / costRef;
    const precoCalculado = c * markupMultiplier;
    return roundUpToAcceptedCents(precoCalculado);
  }

  // Se o item não possuía preço ou custo anterior, usa o motor oficial de markup da categoria
  return calcularPrecoSugeridoMarkup(c, categoryId);
}

/**
 * Obtém o custo de referência que determinou o preço de venda atual do produto
 * Busca prioritariamente no histórico de alterações ou fallback no cadastro
 */
function obterCustoReferenciaPreco(productCode, currentCostCadastrado) {
  try {
    const row = db.prepare(`
      SELECT cost_price_new, sale_price_new
      FROM product_price_cost_history
      WHERE product_code = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(productCode);

    if (row && Number(row.cost_price_new) > 0) {
      return Number(row.cost_price_new);
    }
  } catch (err) {
    // ignora se tabela ainda não tiver dados
  }
  return Number(currentCostCadastrado) || 0;
}

/**
 * Lê e estrutura um arquivo XML de NF-e da SEFAZ para conferência prévia (Preview)
 * @param {string|Buffer} xmlContent Conteúdo em texto ou buffer do arquivo .xml
 * @returns {Object} Dados estruturados da nota e lista de produtos com conferência de estoque
 */
function processarPreviewNfe(xmlContent) {
  ensureNfeColumns();
  initErpDatabase();

  const xmlString = typeof xmlContent === 'string' ? xmlContent : xmlContent.toString('utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    isArray: (name) => ['det', 'dup'].includes(name)
  });

  const parsed = parser.parse(xmlString);

  // Localiza nó raiz <infNFe> (pode estar dentro de nfeProc ou diretamente NFe)
  const nfe = parsed.nfeProc ? parsed.nfeProc.NFe : (parsed.NFe || parsed);
  if (!nfe || !nfe.infNFe) {
    throw new Error('Arquivo XML inválido ou não reconhecido como NF-e da SEFAZ (tag <infNFe> ausente).');
  }

  const infNFe = nfe.infNFe;
  const ide = infNFe.ide || {};
  const emit = infNFe.emit || {};
  const enderEmit = emit.enderEmit || {};
  const total = infNFe.total?.ICMSTot || {};
  const cobr = infNFe.cobr || {};

  // 1. Dados do Cabeçalho e Emitente
  const accessKey = infNFe['@_Id'] ? String(infNFe['@_Id']).replace(/^NFe/i, '') : '';
  const invoiceNumber = String(ide.nNF || 'S/N');
  const series = String(ide.serie || '1');
  const issueDateRaw = ide.dhEmi || ide.dEmi || new Date().toISOString();
  const issueDate = String(issueDateRaw).split('T')[0];

  const supplierCnpj = String(emit.CNPJ || emit.CPF || '');
  const supplierName = String(emit.xNome || emit.xFant || 'FORNECEDOR DESCONHECIDO').trim().toUpperCase();
  const supplierIe = String(emit.IE || '').replace(/\D/g, '');
  const supplierUf = String(enderEmit.UF || 'MG').toUpperCase().trim();
  const supplierIbgeCode = String(enderEmit.cMun || '3136702').trim();
  const supplierAddress = `${enderEmit.xLgr || ''}, ${enderEmit.nro || 'S/N'}${enderEmit.xBairro ? ' - ' + enderEmit.xBairro : ''}`.trim();

  const totalProductsValue = parseFloat(total.vProd || 0);
  const totalST = parseFloat(total.vST || 0);
  const totalIcms = parseFloat(total.vICMS || 0);
  const totalIpi = parseFloat(total.vIPI || 0);
  const totalDiscount = parseFloat(total.vDesc || 0);
  const totalInvoiceValue = parseFloat(total.vNF || (totalProductsValue + totalST - totalDiscount));

  // Duplicatas / Vencimentos
  const duplicatas = [];
  if (cobr.dup) {
    const rawDups = Array.isArray(cobr.dup) ? cobr.dup : [cobr.dup];
    for (const d of rawDups) {
      if (d) {
        duplicatas.push({
          number: String(d.nDup || ''),
          dueDate: String(d.dVenc || ''),
          value: parseFloat(d.vDup || 0)
        });
      }
    }
  }

  // 2. Processar Itens da Nota
  const rawItems = infNFe.det ? (Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det]) : [];
  const processedItems = [];

  for (let i = 0; i < rawItems.length; i++) {
    const det = rawItems[i];
    const prod = det.prod || {};
    const imposto = det.imposto || {};

    const cProd = String(prod.cProd || '').trim();
    let cEAN = String(prod.cEAN || '').trim();
    if (cEAN.toUpperCase() === 'SEM GTIN' || cEAN.toUpperCase() === 'SEM_GTIN') {
      cEAN = '';
    }
    const xProd = String(prod.xProd || '').trim().toUpperCase();
    const ncm = String(prod.NCM || '').trim();
    const cest = String(prod.CEST || '').trim();
    const uCom = String(prod.uCom || 'UN').trim().toUpperCase();
    const qCom = parseFloat(prod.qCom || 0);
    const vUnCom = parseFloat(prod.vUnCom || 0);
    const vProd = parseFloat(prod.vProd || 0);

    // Dados Fiscais de Entrada e Tributos do Item
    const cfopOriginal = String(prod.CFOP || '5405').trim();
    const cfopEntrada = converterCfopEntrada(cfopOriginal, supplierUf);

    // ICMS
    const icmsObj = imposto.ICMS ? Object.values(imposto.ICMS)[0] : {};
    const cstCsosn = String(icmsObj.CST || icmsObj.CSOSN || '500').trim();
    const baseIcms = parseFloat(icmsObj.vBC || 0);
    const aliquotaIcms = parseFloat(icmsObj.pICMS || 0);
    const valorIcms = parseFloat(icmsObj.vICMS || 0);
    const baseSt = parseFloat(icmsObj.vBCST || 0);
    const aliquotaSt = parseFloat(icmsObj.pICMSST || 0);
    const valorSt = parseFloat(icmsObj.vICMSST || 0);

    // IPI
    const ipiObj = imposto.IPI?.IPITrib || {};
    const valorIpi = parseFloat(ipiObj.vIPI || 0);

    // PIS / COFINS
    const pisObj = imposto.PIS ? Object.values(imposto.PIS)[0] : {};
    const cstPis = String(pisObj.CST || '04').trim();
    const cofinsObj = imposto.COFINS ? Object.values(imposto.COFINS)[0] : {};
    const cstCofins = String(cofinsObj.CST || '04').trim();

    // Rastreabilidade (Lote / Validade)
    let lotNumber = '';
    let expirationDate = '';
    if (prod.rastro) {
      const rastro = Array.isArray(prod.rastro) ? prod.rastro[0] : prod.rastro;
      if (rastro) {
        lotNumber = String(rastro.nLote || '').trim();
        expirationDate = String(rastro.dVal || '').trim();
      }
    }

    // Match no catálogo nativo do Belinha (por EAN ou Código)
    let matchedProduct = null;
    if (cEAN) {
      matchedProduct = obterProdutoPorCodigo(cEAN);
    }
    if (!matchedProduct && cProd) {
      matchedProduct = obterProdutoPorCodigo(cProd);
    }

    // Dados de Estoque e Preço Vigentes
    const currentCost = matchedProduct ? Number(matchedProduct.cost_price || 0) : 0;
    const currentStock = matchedProduct ? Number(matchedProduct.stock_qty || 0) : 0;
    const currentSalePrice = matchedProduct ? Number(matchedProduct.sale_price || 0) : 0;
    const categoryId = matchedProduct ? Number(matchedProduct.category_id || 0) : 0;

    // Busca o custo de referência da última correção de preço para medir a queda/aumento com precisão
    const baseReferenceCost = matchedProduct 
      ? obterCustoReferenciaPreco(matchedProduct.code, currentCost)
      : 0;

    const referenceCostToUse = baseReferenceCost > 0 ? baseReferenceCost : currentCost;

    // Cálculo das diferenças e da regra de repasse de preços
    let costVariationPct = 0;
    let costDifferenceVal = 0;
    let costAction = 'STABLE'; // 'INCREASE' | 'DECREASE_15PCT' | 'STABLE' | 'NEW_PRODUCT'
    let suggestedSalePrice = currentSalePrice;
    let applyRepricing = false;

    if (referenceCostToUse > 0 && vUnCom > 0 && currentSalePrice > 0) {
      costDifferenceVal = Math.round((vUnCom - referenceCostToUse) * 100) / 100;
      costVariationPct = Math.round(((vUnCom - referenceCostToUse) / referenceCostToUse) * 1000) / 10;

      if (vUnCom > referenceCostToUse) {
        // 1. Aumento de CMV -> Repasse obrigatório para cima (Preserva Margem)
        costAction = 'INCREASE';
        suggestedSalePrice = calcularNovoPrecoVendaPreservandoMargem({
          currentCost: referenceCostToUse,
          currentSalePrice,
          finalUnitCost: vUnCom,
          categoryId
        });
        applyRepricing = true;
      } else if (costVariationPct <= -15.0) {
        // 2. Queda de custo >= 15% -> Repasse de desconto (Preserva Margem e estimula venda)
        costAction = 'DECREASE_15PCT';
        suggestedSalePrice = calcularNovoPrecoVendaPreservandoMargem({
          currentCost: referenceCostToUse,
          currentSalePrice,
          finalUnitCost: vUnCom,
          categoryId
        });
        applyRepricing = true;
      } else {
        // 3. Variação pequena (< 15% de queda) -> Mantém preço estável
        costAction = 'STABLE';
        suggestedSalePrice = currentSalePrice;
        applyRepricing = false;
      }
    } else if (vUnCom > 0) {
      // Produto novo ou sem preço cadastrado
      costAction = 'NEW_PRODUCT';
      suggestedSalePrice = calcularPrecoSugeridoMarkup(vUnCom, categoryId);
      applyRepricing = true;
    }

    processedItems.push({
      item_index: i + 1,
      supplier_code: cProd,
      barcode: cEAN,
      description: xProd,
      ncm,
      cest,
      unit_measure: uCom,
      quantity_bought: qCom,
      unit_cost: vUnCom,
      total_cost: vProd,
      lot_number: lotNumber,
      expiration_date: expirationDate,

      // Tributos detalhados
      cfop_original: cfopOriginal,
      cfop_entrada: cfopEntrada,
      cst_csosn: cstCsosn,
      base_icms: baseIcms,
      aliquota_icms: aliquotaIcms,
      valor_icms: valorIcms,
      base_st: baseSt,
      aliquota_st: aliquotaSt,
      valor_st: valorSt,
      valor_ipi: valorIpi,
      cst_pis: cstPis,
      cst_cofins: cstCofins,

      // Dados do match e estoque
      is_matched: Boolean(matchedProduct),
      product_code: matchedProduct ? matchedProduct.code : null,
      current_stock: currentStock,
      current_cost: currentCost,
      last_cost: referenceCostToUse,
      current_sale_price: currentSalePrice,

      // Motor de Repasse de Preços
      cost_difference_val: costDifferenceVal,
      cost_difference_pct: costVariationPct,
      cost_variation_pct: costVariationPct,
      cost_action: costAction,
      suggested_sale_price: suggestedSalePrice,
      apply_repricing: applyRepricing,

      // Conversão padrão (1x1)
      conversion_factor: 1,
      quantity_to_add: qCom,
      final_unit_cost: vUnCom
    });
  }

  return {
    success: true,
    access_key: accessKey,
    invoice_number: invoiceNumber,
    series,
    issue_date: issueDate,
    supplier_cnpj: supplierCnpj,
    supplier_name: supplierName,
    supplier_ie: supplierIe,
    supplier_uf: supplierUf,
    supplier_ibge_code: supplierIbgeCode,
    supplier_address: supplierAddress,
    total_products: totalProductsValue,
    total_st: totalST,
    total_icms: totalIcms,
    total_ipi: totalIpi,
    total_discount: totalDiscount,
    total_invoice: totalInvoiceValue,
    duplicatas,
    items_count: processedItems.length,
    items: processedItems,
    xml_raw: xmlString
  };
}

/**
 * Confirma a importação definitiva da NF-e, incrementa o estoque,
 * grava dados fiscais completos para SPED/SINTEGRA e aplica os repasses de preço
 * aprovados no Belinha e no Digifarma.
 *
 * @param {Object} payload Dados confirmados da nota e itens conferidos
 * @returns {Object} Resultado da importação
 */
function confirmarImportacaoNfe(payload) {
  ensureNfeColumns();
  initErpDatabase();

  const {
    access_key,
    invoice_number,
    series = '1',
    issue_date,
    supplier_name,
    supplier_cnpj,
    supplier_ie = '',
    supplier_uf = 'MG',
    supplier_ibge_code = '3136702',
    supplier_address = '',
    total_products = 0,
    total_st = 0,
    total_icms = 0,
    total_ipi = 0,
    total_invoice,
    items = [],
    duplicatas = [],
    created_by = 'Almoxarifado',
    xml_raw = ''
  } = payload;

  if (!invoice_number) {
    throw new Error('Número da Nota Fiscal é obrigatório.');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('A nota deve conter pelo menos 1 item.');
  }

  // Verifica se a nota já foi importada anteriormente pela chave de acesso
  if (access_key) {
    const existing = db.prepare('SELECT id, invoice_number, supplier_name FROM invoices WHERE access_key = ?').get(access_key);
    if (existing) {
      throw new Error(`Esta NF-e (Chave ${access_key}) já foi importada anteriormente como Nota #${existing.invoice_number}.`);
    }
  }

  const invoiceId = `NF-${invoice_number.replace(/\D/g, '') || Date.now()}-${Date.now().toString().slice(-4)}`;
  const now = new Date().toISOString();

  let totalItensAdicionados = 0;
  let totalProdutosNovos = 0;
  let totalPrecosAtualizados = 0;
  const repricingEvents = [];

  // Execução Transacional Atômica
  const executeImportTransaction = db.transaction(() => {
    // 1. Gravar cabeçalho da Nota em `invoices` com metadados fiscais completos
    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, supplier_name, issue_date, total_value,
        status, created_at, created_by, notes, access_key, cnpj_supplier, series,
        supplier_ie, supplier_ibge_code, supplier_address, supplier_uf,
        total_icms, total_icms_st, total_ipi, xml_raw
      ) VALUES (
        ?, ?, ?, ?, ?,
        'Ativa', datetime('now', 'localtime'), ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      invoiceId,
      invoice_number,
      supplier_name,
      issue_date || now.split('T')[0],
      parseFloat(total_invoice) || 0,
      created_by,
      `Importada via XML NF-e em ${new Date().toLocaleString('pt-BR')}`,
      access_key || null,
      supplier_cnpj || null,
      series || '1',
      supplier_ie || null,
      supplier_ibge_code || null,
      supplier_address || null,
      supplier_uf || 'MG',
      parseFloat(total_icms) || 0,
      parseFloat(total_st) || 0,
      parseFloat(total_ipi) || 0,
      xml_raw || null
    );

    // Prepared statements para itens
    const insertInvoiceItemStmt = db.prepare(`
      INSERT INTO invoice_items (
        id, invoice_id, product_code, product_name, quantity,
        unit_cost, total_cost, quantity_sold, quantity_remaining,
        barcode, lot_number, expiration_date,
        cfop_original, cfop_entrada, cst_csosn, base_icms, aliquota_icms, valor_icms,
        base_st, aliquota_st, valor_st, valor_ipi, cst_pis, cst_cofins
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, 0, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    const updateProductStockStmt = db.prepare(`
      UPDATE products 
      SET stock_qty = stock_qty + ?,
          cost_price = ?,
          updated_at = datetime('now', 'localtime')
      WHERE code = ?
    `);

    const updateProductPriceStmt = db.prepare(`
      UPDATE products 
      SET sale_price = ?,
          updated_at = datetime('now', 'localtime')
      WHERE code = ?
    `);

    const insertPriceHistoryStmt = db.prepare(`
      INSERT INTO product_price_cost_history (
        id, product_code, barcode, product_name,
        cost_price_before, cost_price_new, cost_variation_pct,
        sale_price_before, sale_price_new, trigger_type,
        invoice_id, applied_to_digifarma, created_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, datetime('now', 'localtime')
      )
    `);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const convFactor = Math.max(1, parseFloat(it.conversion_factor) || 1);
      const qtdConvertida = (parseFloat(it.quantity_bought) || 0) * convFactor;
      const custoFinalUnitario = (parseFloat(it.unit_cost) || 0) / convFactor;
      const totalCostItem = Math.round((qtdConvertida * custoFinalUnitario) * 100) / 100;

      let targetProductCode = it.product_code;

      // Se o produto não existe no catálogo nativo, cadastra-o automaticamente
      if (!targetProductCode) {
        const novoBarcode = it.barcode || it.supplier_code || String(Date.now());
        const precoSugerido = parseFloat(it.suggested_sale_price) || Math.round((custoFinalUnitario * 1.45) * 100) / 100;

        const novoProduto = cadastrarProduto({
          barcode: novoBarcode,
          name: it.description,
          sale_price: precoSugerido,
          cost_price: custoFinalUnitario,
          stock_qty: 0,
          ncm: it.ncm || null,
          cest: it.cest || null
        });

        targetProductCode = novoProduto.code;
        totalProdutosNovos++;
      }

      const invoiceItemId = `${invoiceId}-ITEM-${i + 1}`;

      // Grava o item da nota com dados fiscais completos
      insertInvoiceItemStmt.run(
        invoiceItemId,
        invoiceId,
        targetProductCode,
        it.description,
        qtdConvertida,
        custoFinalUnitario,
        totalCostItem,
        qtdConvertida,
        it.barcode || null,
        it.lot_number || null,
        it.expiration_date || null,
        it.cfop_original || '5405',
        it.cfop_entrada || converterCfopEntrada(it.cfop_original, supplier_uf),
        it.cst_csosn || '500',
        parseFloat(it.base_icms) || 0,
        parseFloat(it.aliquota_icms) || 0,
        parseFloat(it.valor_icms) || 0,
        parseFloat(it.base_st) || 0,
        parseFloat(it.aliquota_st) || 0,
        parseFloat(it.valor_st) || 0,
        parseFloat(it.valor_ipi) || 0,
        it.cst_pis || '04',
        it.cst_cofins || '04'
      );

      // Incrementa o estoque físico e atualiza preço de custo
      updateProductStockStmt.run(
        qtdConvertida,
        custoFinalUnitario,
        targetProductCode
      );

      // 3. Aplica Repasse de Preço se aprovado pelo usuário
      const shouldApplyRepricing = Boolean(it.apply_repricing) && Number(it.suggested_sale_price) > 0;
      if (shouldApplyRepricing) {
        const novoPrecoVenda = Number(it.suggested_sale_price);
        const precoVendaAnterior = Number(it.current_sale_price || 0);
        const custoAnterior = Number(it.last_cost || it.current_cost || 0);
        const varPct = Number(it.cost_difference_pct || it.cost_variation_pct || 0);

        let triggerType = 'MANUAL';
        if (it.cost_action === 'INCREASE') triggerType = 'AUMENTO_CMV';
        else if (it.cost_action === 'DECREASE_15PCT') triggerType = 'QUEDA_15PCT';
        else if (it.cost_action === 'NEW_PRODUCT') triggerType = 'NOVO_PRODUTO';

        // Atualiza preço de venda no SQLite
        updateProductPriceStmt.run(novoPrecoVenda, targetProductCode);

        // Registra histórico
        const histId = `PRC-${Date.now()}-${i + 1}`;
        insertPriceHistoryStmt.run(
          histId,
          targetProductCode,
          it.barcode || null,
          it.description,
          custoAnterior,
          custoFinalUnitario,
          varPct,
          precoVendaAnterior,
          novoPrecoVenda,
          triggerType,
          invoiceId,
          1
        );

        repricingEvents.push({
          productCode: targetProductCode,
          barcode: it.barcode,
          name: it.description,
          novoPreco: novoPrecoVenda,
          precoAnterior: precoVendaAnterior
        });

        totalPrecosAtualizados++;
      }

      totalItensAdicionados += qtdConvertida;
    }

    // 4. Gravar duplicatas/vencimentos em `accounts_payable` se houver
    if (Array.isArray(duplicatas) && duplicatas.length > 0) {
      try {
        const insertApStmt = db.prepare(`
          INSERT INTO accounts_payable (
            id, type, reference_id, supplier_name, description,
            due_date, original_value, amortized_value, remaining_value,
            status, created_at
          ) VALUES (
            ?, 'invoice', ?, ?, ?,
            ?, ?, 0, ?,
            'Pendente', datetime('now', 'localtime')
          )
        `);

        for (let dIdx = 0; dIdx < duplicatas.length; dIdx++) {
          const dup = duplicatas[dIdx];
          const apId = `AP-${invoiceId}-${dIdx + 1}`;
          const dupNum = dup.number ? ` (Parc. ${dup.number})` : '';
          const valor = parseFloat(dup.value) || 0;
          insertApStmt.run(
            apId,
            invoiceId,
            supplier_name,
            `NF #${invoice_number}${dupNum} - ${supplier_name}`,
            dup.dueDate || now.split('T')[0],
            valor,
            valor
          );
        }
      } catch (apErr) {
        console.warn('[NF-e Inbound] Aviso ao agendar contas a pagar:', apErr.message);
      }
    }
  });

  executeImportTransaction();

  // 5. Envia as atualizações de preço ao ERP Digifarma (Firebird) de forma assíncrona
  if (repricingEvents.length > 0) {
    Promise.allSettled(
      repricingEvents.map(async (ev) => {
        try {
          await atualizarPrecoVendaDigifarma(ev.productCode, ev.novoPreco, ev.precoAnterior);
        } catch (e) {
          console.warn(`[NF-e Repricing] Falha ao enviar preço do prod ${ev.productCode} ao Digifarma:`, e.message);
        }
      })
    ).then((results) => {
      const okCount = results.filter(r => r.status === 'fulfilled').length;
      console.log(`[NF-e Repricing] 🚀 ${okCount}/${repricingEvents.length} preços replicados ao Digifarma com sucesso.`);
    });
  }

  console.log(`[NF-e Inbound] ✅ NF-e #${invoice_number} de ${supplier_name} importada com sucesso! (${items.length} produtos, +${totalItensAdicionados} un no estoque, ${totalPrecosAtualizados} preços repassados).`);

  return {
    success: true,
    invoice_id: invoiceId,
    invoice_number,
    supplier_name,
    items_imported: items.length,
    total_quantity_added: totalItensAdicionados,
    new_products_created: totalProdutosNovos,
    prices_updated: totalPrecosAtualizados
  };
}

/**
 * Lista histórico de notas fiscais de entrada
 */
function listarNotasEntrada({ limit = 50, offset = 0, search = '' } = {}) {
  ensureNfeColumns();
  let where = "status != 'Cancelada'";
  const params = [];

  const clean = (search || '').trim();
  if (clean) {
    where += " AND (invoice_number LIKE ? OR supplier_name LIKE ? OR access_key LIKE ?)";
    const p = `%${clean}%`;
    params.push(p, p, p);
  }

  const sql = `
    SELECT 
      i.*,
      (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) as total_items,
      (SELECT COALESCE(SUM(quantity), 0) FROM invoice_items WHERE invoice_id = i.id) as total_units
    FROM invoices i
    WHERE ${where}
    ORDER BY i.issue_date DESC, i.created_at DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

/**
 * Retorna os detalhes de uma nota fiscal de entrada e todos os seus itens
 */
function obterNotaDetalhada(invoiceId) {
  ensureNfeColumns();
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice) return null;

  const items = db.prepare(`
    SELECT ii.*, p.stock_qty as current_stock, p.sale_price as current_sale_price
    FROM invoice_items ii
    LEFT JOIN products p ON ii.product_code = p.code
    WHERE ii.invoice_id = ?
    ORDER BY ii.product_name ASC
  `).all(invoiceId);

  return {
    ...invoice,
    items
  };
}

module.exports = {
  processarPreviewNfe,
  confirmarImportacaoNfe,
  listarNotasEntrada,
  obterNotaDetalhada,
  converterCfopEntrada,
  calcularNovoPrecoVendaPreservandoMargem
};
