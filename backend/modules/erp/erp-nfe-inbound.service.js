/**
 * Belinha ERP - NF-e Inbound Service
 * Processa arquivos XML de notas fiscais eletrônicas de compra (Mod. 55),
 * faz o match automático por EAN com o catálogo nativo, converte embalagens,
 * incrementa o estoque físico e recalcula preços de custo.
 */

const { XMLParser } = require('fast-xml-parser');
const { db, initErpDatabase } = require('./erp-database');
const { obterProdutoPorCodigo, cadastrarProduto } = require('./erp-products.service');

// Garante colunas adicionais para NF-e em invoices e invoice_items
function ensureNfeColumns() {
  try {
    const invCols = db.pragma('table_info(invoices)').map(c => c.name);
    if (!invCols.includes('access_key')) {
      db.prepare(`ALTER TABLE invoices ADD COLUMN access_key TEXT`).run();
    }
    if (!invCols.includes('cnpj_supplier')) {
      db.prepare(`ALTER TABLE invoices ADD COLUMN cnpj_supplier TEXT`).run();
    }
    if (!invCols.includes('series')) {
      db.prepare(`ALTER TABLE invoices ADD COLUMN series TEXT`).run();
    }

    const itemCols = db.pragma('table_info(invoice_items)').map(c => c.name);
    if (!itemCols.includes('barcode')) {
      db.prepare(`ALTER TABLE invoice_items ADD COLUMN barcode TEXT`).run();
    }
    if (!itemCols.includes('lot_number')) {
      db.prepare(`ALTER TABLE invoice_items ADD COLUMN lot_number TEXT`).run();
    }
    if (!itemCols.includes('expiration_date')) {
      db.prepare(`ALTER TABLE invoice_items ADD COLUMN expiration_date TEXT`).run();
    }
  } catch (e) {
    console.warn('[NF-e Inbound] Aviso ao verificar colunas de notas fiscais:', e.message);
  }
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
  const total = infNFe.total?.ICMSTot || {};
  const cobr = infNFe.cobr || {};

  // 1. Dados do Cabeçalho
  const accessKey = infNFe['@_Id'] ? String(infNFe['@_Id']).replace(/^NFe/i, '') : '';
  const invoiceNumber = String(ide.nNF || 'S/N');
  const series = String(ide.serie || '1');
  const issueDateRaw = ide.dhEmi || ide.dEmi || new Date().toISOString();
  const issueDate = String(issueDateRaw).split('T')[0];

  const supplierCnpj = String(emit.CNPJ || emit.CPF || '');
  const supplierName = String(emit.xNome || emit.xFant || 'FORNECEDOR DESCONHECIDO').trim().toUpperCase();

  const totalProductsValue = parseFloat(total.vProd || 0);
  const totalST = parseFloat(total.vST || 0);
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

    // Cálculo de variação de custo
    const currentCost = matchedProduct ? matchedProduct.cost_price : 0;
    const currentStock = matchedProduct ? matchedProduct.stock_qty : 0;
    const currentSalePrice = matchedProduct ? matchedProduct.sale_price : 0;

    let costVariationPct = 0;
    if (currentCost > 0 && vUnCom > 0) {
      costVariationPct = Math.round(((vUnCom - currentCost) / currentCost) * 1000) / 10;
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
      // Dados do match
      is_matched: Boolean(matchedProduct),
      product_code: matchedProduct ? matchedProduct.code : null,
      current_stock: currentStock,
      current_cost: currentCost,
      current_sale_price: currentSalePrice,
      cost_variation_pct: costVariationPct,
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
    total_products: totalProductsValue,
    total_st: totalST,
    total_discount: totalDiscount,
    total_invoice: totalInvoiceValue,
    duplicatas,
    items_count: processedItems.length,
    items: processedItems
  };
}

/**
 * Confirma a importação definitiva da NF-e, incrementa o estoque e atualiza custos
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
    total_invoice,
    items = [],
    duplicatas = [],
    created_by = 'Almoxarifado'
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

  // Execução Transacional Atômica
  const executeImportTransaction = db.transaction(() => {
    // 1. Gravar cabeçalho da Nota em `invoices`
    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, supplier_name, issue_date, total_value,
        status, created_at, created_by, notes, access_key, cnpj_supplier, series
      ) VALUES (
        ?, ?, ?, ?, ?,
        'Ativa', datetime('now', 'localtime'), ?, ?, ?, ?, ?
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
      series || '1'
    );

    // Prepared statements para itens
    const insertInvoiceItemStmt = db.prepare(`
      INSERT INTO invoice_items (
        id, invoice_id, product_code, product_name, quantity,
        unit_cost, total_cost, quantity_sold, quantity_remaining,
        barcode, lot_number, expiration_date
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, 0, ?,
        ?, ?, ?
      )
    `);

    const updateProductStockStmt = db.prepare(`
      UPDATE products 
      SET stock_qty = stock_qty + ?,
          cost_price = ?,
          updated_at = datetime('now', 'localtime')
      WHERE code = ?
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
        const precoSugerido = Math.round((custoFinalUnitario * 1.45) * 100) / 100; // Markup padrão de 45%

        const novoProduto = cadastrarProduto({
          barcode: novoBarcode,
          name: it.description,
          sale_price: precoSugerido,
          cost_price: custoFinalUnitario,
          stock_qty: 0, // Será incrementado abaixo
          ncm: it.ncm || null,
          cest: it.cest || null
        });

        targetProductCode = novoProduto.code;
        totalProdutosNovos++;
      }

      const invoiceItemId = `${invoiceId}-ITEM-${i + 1}`;

      // Grava o item da nota
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
        it.expiration_date || null
      );

      // Incrementa o estoque físico e atualiza preço de custo
      updateProductStockStmt.run(
        qtdConvertida,
        custoFinalUnitario,
        targetProductCode
      );

      totalItensAdicionados += qtdConvertida;
    }

    // 2. Gravar duplicatas/vencimentos em `accounts_payable` se houver
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

  console.log(`[NF-e Inbound] ✅ NF-e #${invoice_number} de ${supplier_name} importada com sucesso! (${items.length} produtos, +${totalItensAdicionados} un no estoque).`);

  return {
    success: true,
    invoice_id: invoiceId,
    invoice_number,
    supplier_name,
    items_imported: items.length,
    total_quantity_added: totalItensAdicionados,
    new_products_created: totalProdutosNovos
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
  obterNotaDetalhada
};
