const db = require('../database');
const { queryDigifarma } = require('./digifarma.service');

async function syncShortages() {
  console.log('[ShortageSync] Iniciando sincronização em background de saldos e históricos...');
  try {
    const shortagesList = db.prepare('SELECT * FROM shortages WHERE purchased = 0').all();
    if (shortagesList.length === 0) return;

    const productNames = Array.from(new Set(shortagesList.map(s => s.productName).filter(Boolean)));
    if (productNames.length === 0) return;

    const batchSize = 10;
    const nameBatches = [];
    for (let i = 0; i < productNames.length; i += batchSize) {
      nameBatches.push(productNames.slice(i, i + batchSize));
    }

    const dbStatuses = {};
    const histories = {};

    for (const batch of nameBatches) {
      const whereClause = batch.map(() => 'p.PRODUTO LIKE ?').join(' OR ');
      
      const sqlStatus = `
        SELECT p.PRODUTO, p.PROD_SALDO, COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA
        FROM PRODUTOS p
        WHERE ${whereClause}
      `;
      const statusResults = await queryDigifarma(sqlStatus, batch.map(n => n + '%'));
      if (statusResults && Array.isArray(statusResults)) {
        statusResults.forEach(r => {
          const key = r.PRODUTO ? r.PRODUTO.trim().toUpperCase() : '';
          if (key) {
            dbStatuses[key] = {
              saldo: r.PROD_SALDO || 0,
              priceCompra: r.PROD_PRCOMPRA || 0
            };
          }
        });
      }

      const sqlHistory = `
        SELECT 
          P.PRODUTO as "productName",
          C.DATA_EMISSAO as "dataCompra",
          F.FORNECEDOR as "fornecedor",
          C.NOTA_FISCAL as "notaFiscal",
          I.ITEM_NOTAS_QUANT as "quantidade",
          I.ITEM_NOTAS_PRCOMPRA as "precoCompra"
        FROM ITEM_NOTAS I
        JOIN CAB_NOTAS C ON I.CAB_NOTA_ID = C.CAB_NOTA_ID
        JOIN PRODUTOS P ON I.PRODUTO_ID = P.PRODUTO_ID
        LEFT JOIN FORNECEDORES F ON C.FORNECEDOR_ID = F.FORNECEDOR_ID
        WHERE (${whereClause}) AND C.ENTRADA_SAIDA = 'E' AND C.CANCELAMENTO = 'N'
        ORDER BY C.DATA_EMISSAO DESC
      `;
      const historyResults = await queryDigifarma(sqlHistory, batch.map(n => n + '%'));
      if (historyResults && Array.isArray(historyResults)) {
        historyResults.forEach(h => {
          const key = h.productName ? h.productName.trim().toUpperCase() : '';
          if (key) {
            if (!histories[key]) histories[key] = [];
            if (histories[key].length < 6) {
              histories[key].push({
                dataCompra: h.dataCompra,
                fornecedor: h.fornecedor,
                notaFiscal: h.notaFiscal,
                quantidade: h.quantidade,
                precoCompra: h.precoCompra
              });
            }
          }
        });
      }
    }

    const updateStmt = db.prepare(`
      UPDATE shortages 
      SET saldo = ?, valorUltimaCompra = ?, history = ?
      WHERE id = ?
    `);

    db.transaction(() => {
      for (const s of shortagesList) {
        const key = s.productName ? s.productName.trim().toUpperCase() : '';
        const status = dbStatuses[key] || { saldo: 0, priceCompra: 0 };
        const hist = histories[key] || [];
        
        updateStmt.run(status.saldo, status.priceCompra, JSON.stringify(hist), s.id);
      }
    })();
    console.log('[ShortageSync] Sincronização concluída com sucesso.');

  } catch (err) {
    console.error('[ShortageSync] Erro na sincronização:', err.message);
  }
}

module.exports = { syncShortages };
