const db = require('../database');
const { queryDigifarma } = require('./digifarma.service');
let equivService = null;
try {
  equivService = require('./compras-equivalentes.service');
} catch (e) {}

async function syncShortages() {
  console.log('[ShortageSync] Iniciando sincronização em background de saldos, históricos e cobertura equivalente...');
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
        SELECT p.PRODUTO_ID, p.PRODUTO, p.APRESENTACAO, p.COD_BARRAS, p.CATEGORIA_ID,
               p.PROD_SALDO, COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA
        FROM PRODUTOS p
        WHERE ${whereClause}
      `;
      const cleanParams = batch.map(n => (String(n || '').trim().slice(0, 45)) + '%');
      const statusResults = await queryDigifarma(sqlStatus, cleanParams);
      if (statusResults && Array.isArray(statusResults)) {
        statusResults.forEach(r => {
          const key = r.PRODUTO ? r.PRODUTO.trim().toUpperCase() : '';
          if (key) {
            dbStatuses[key] = {
              produto_id: r.PRODUTO_ID,
              descricao: key,
              apresentacao: (r.APRESENTACAO || '').trim(),
              ean: (r.COD_BARRAS || '').trim(),
              categoria_id: Number(r.CATEGORIA_ID || 0),
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
      const historyResults = await queryDigifarma(sqlHistory, cleanParams);
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

    // Pré-carrega saldos reais dos membros equivalentes em lote
    const saldosReaisMap = new Map();
    const idsEquiv = new Set();
    for (const st of Object.values(dbStatuses)) {
      if (st.produto_id) {
        saldosReaisMap.set(Number(st.produto_id), Number(st.saldo) || 0);
        try {
          const vinc = db.prepare('SELECT grupo_id FROM compras_produtos_equivalentes WHERE produto_id = ? LIMIT 1').get(st.produto_id);
          if (vinc) {
            const membros = db.prepare('SELECT produto_id FROM compras_produtos_equivalentes WHERE grupo_id = ?').all(vinc.grupo_id);
            for (const m of membros) idsEquiv.add(Number(m.produto_id));
          }
        } catch (e) {}
      }
    }

    const idsFaltantes = [...idsEquiv].filter(id => id > 0 && !saldosReaisMap.has(id));
    for (let i = 0; i < idsFaltantes.length; i += 100) {
      const lote = idsFaltantes.slice(i, i + 100);
      const placeholders = lote.map(() => '?').join(',');
      try {
        const fbRows = await queryDigifarma(`SELECT PRODUTO_ID, PROD_SALDO FROM PRODUTOS WHERE PRODUTO_ID IN (${placeholders})`, lote, 10000);
        for (const r of (fbRows || [])) {
          saldosReaisMap.set(Number(r.PRODUTO_ID), Number(r.PROD_SALDO) || 0);
        }
      } catch (e) {}
    }

    const updateStmt = db.prepare(`
      UPDATE shortages 
      SET saldo = ?,
          valorUltimaCompra = ?,
          history = ?,
          coberto_por_equivalente = ?,
          equivalente_info = ?,
          purchased = ?,
          notes = ?
      WHERE id = ?
    `);

    let baixasEquiv = 0;
    db.transaction(() => {
      for (const s of shortagesList) {
        const key = s.productName ? s.productName.trim().toUpperCase() : '';
        const status = dbStatuses[key] || { saldo: 0, priceCompra: 0 };
        const hist = histories[key] || [];

        let cobertoFlag = 0;
        let equivInfoJson = null;
        let purchasedVal = s.purchased ? 1 : 0;
        let notesVal = s.notes || '';

        if (equivService && typeof equivService.avaliarCoberturaEquivalente === 'function') {
          const alvo = status.produto_id
            ? status
            : { produto_id: 0, descricao: key, saldo: status.saldo, categoria_id: s.type === 'Genérico' ? 7 : (s.type === 'Similar' ? 2 : (s.type === 'Marca (Referência)' ? 1 : (s.type === 'Perfumaria' ? 5 : 0))) };
          const aval = equivService.avaliarCoberturaEquivalente(alvo, {
            limiteMinimoSaldoGrupo: 1,
            saldosReaisMap
          }, db);

          if (aval.coberto && aval.equivalentesComEstoque.length > 0) {
            cobertoFlag = 1;
            equivInfoJson = JSON.stringify({
              coberto: true,
              grupoNome: aval.grupoNome,
              saldoGrupo: aval.saldoGrupo,
              equivalentesComEstoque: aval.equivalentesComEstoque.slice(0, 5)
            });

            if (s.source === 'auto' && !s.ordered) {
              purchasedVal = 1;
              baixasEquiv++;
              const labsResumo = aval.equivalentesComEstoque.slice(0, 2).map(e => `${e.descricao} (${e.saldo} un)`).join(' | ');
              if (!notesVal.includes('[Coberto por equivalente:')) {
                notesVal = `${notesVal ? notesVal + ' ' : ''}[Coberto por equivalente: ${labsResumo}]`.trim();
              }
            }
          }
        }

        updateStmt.run(status.saldo, status.priceCompra, JSON.stringify(hist), cobertoFlag, equivInfoJson, purchasedVal, notesVal, s.id);
      }
    })();

    console.log(`[ShortageSync] Sincronização concluída com sucesso. Baixas automáticas por equivalente: ${baixasEquiv}.`);

  } catch (err) {
    console.error('[ShortageSync] Erro na sincronização:', err.message);
  }
}

module.exports = { syncShortages };
