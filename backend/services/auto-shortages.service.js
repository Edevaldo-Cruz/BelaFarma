const db = require('../database');
const { queryDigifarma } = require('./digifarma.service');

/**
 * Busca vendas no Digifarma dos últimos X dias onde o estoque atual <= 1
 * e os insere na tabela product_shortages silenciosamente.
 * @param {number} daysAgo - Quantos dias atrás (0 para hoje apenas, 5 para últimos 5 dias, etc.)
 */
async function runAutoShortages(daysAgo = 0) {
  try {
    console.log(`[AutoShortages] Buscando itens vendidos nos últimos ${daysAgo} dias com estoque crítico (<= 1)...`);
    
    const days = Number(daysAgo) || 0;
    const sql = `
      SELECT DISTINCT
        P.PRODUTO_ID, 
        P.PRODUTO as DESCRICAO, 
        P.PROD_SALDO as ESTOQUE,
        COALESCE(P.PROD_PRCOMPRA, P.VALOR_ULT_COMPRA, 0) as VALOR_COMPRA
      FROM CAB_VENDAS C
      JOIN ITEM_VENDAS I ON C.VENDA_NOTA_ID = I.VENDA_NOTA_ID
      JOIN PRODUTOS P ON I.PRODUTO_ID = P.PRODUTO_ID
      WHERE 
        CAST(C.VENDA_DATA_HORA AS DATE) >= DATEADD(-${days} DAY TO CURRENT_DATE)
        AND C.CANCELADO <> 'S'
        AND P.PROD_SALDO <= 1
    `;
    
    // In Firebird, DATEADD is available. If it fails, we can use CURRENT_DATE - ?
    let results = [];
    try {
      results = await queryDigifarma(sql, []);
    } catch (fallbackErr) {
      // Fallback for older Firebird versions if DATEADD is not supported
      const sqlFallback = `
        SELECT DISTINCT
          P.PRODUTO_ID, 
          P.PRODUTO as DESCRICAO, 
          P.PROD_SALDO as ESTOQUE,
          COALESCE(P.PROD_PRCOMPRA, P.VALOR_ULT_COMPRA, 0) as VALOR_COMPRA
        FROM CAB_VENDAS C
        JOIN ITEM_VENDAS I ON C.VENDA_NOTA_ID = I.VENDA_NOTA_ID
        JOIN PRODUTOS P ON I.PRODUTO_ID = P.PRODUTO_ID
        WHERE 
          CAST(C.VENDA_DATA_HORA AS DATE) >= CURRENT_DATE - ${days}
          AND C.CANCELADO <> 'S'
          AND P.PROD_SALDO <= 1
      `;
      results = await queryDigifarma(sqlFallback, []);
    }

    if (!results || results.length === 0) {
      console.log(`[AutoShortages] Nenhum item crítico encontrado.`);
      return { added: 0, attention: 0 };
    }

    // Prepare SQLite statement
    const insertShortage = db.prepare(`
      INSERT INTO shortages (id, productName, type, clientInquiry, notes, createdAt, userName, source, purchased, ordered, saldo, valorUltimaCompra)
      VALUES (?, ?, 'Sistema', 0, ?, ?, 'Sistema (Automático)', 'auto', 0, 0, ?, ?)
    `);

    // Check if product exists and is pending
    const checkExisting = db.prepare(`
      SELECT id FROM shortages 
      WHERE productName = ? AND purchased = 0 AND ordered = 0
    `);

    let countZero = 0;
    let countOne = 0;
    const now = new Date().toISOString();

    db.transaction(() => {
      for (const row of results) {
        const productName = (row.DESCRICAO || '').trim();
        if (!productName) continue;
        
        const existing = checkExisting.get(productName);
        if (existing) continue; // Already in shortages and not handled

        const isZero = row.ESTOQUE <= 0;
        const notes = isZero ? '' : '[ATENÇÃO: RESTA 1 NO ESTOQUE]';
        const id = 'sh_auto_' + Date.now().toString() + '_' + Math.random().toString(36).substring(2, 10);
        
        insertShortage.run(id, productName, notes, now, row.ESTOQUE || 0, row.VALOR_COMPRA || 0);
        
        if (isZero) countZero++;
        else countOne++;
      }
    })();

    console.log(`[AutoShortages] Concluído. Adicionados ${countZero} itens zerados e ${countOne} itens com atenção.`);
    
    // Avisa o Vigilante em caso de sucesso
    try {
      const watcher = require('./watcher.service');
      watcher.registerServiceRun('auto_shortages', 'SUCCESS');
      
      const adminPhone = (process.env.ADMIN_WHATSAPP || '').replace(/\D/g, '');
      if (adminPhone) {
        const baileys = require('../baileys-service');
        const msg = `🛡️ *[Vigilante BelaFarma]*\n\nA rotina de faltas automáticas (últimos ${days} dias) foi finalizada.\n\n✅ *${countZero}* itens zerados inseridos.\n⚠️ *${countOne}* itens com atenção inseridos.`;
        if (baileys.getStatus().connected) {
          baileys.sendTextMessage(adminPhone, msg).catch(e => console.error('Erro ao enviar whatsapp auto-shortages:', e));
        }
      }
    } catch (watcherErr) {
      console.error('[AutoShortages] Erro ao registrar sucesso no Vigilante:', watcherErr.message);
    }

    return { added: countZero, attention: countOne };

  } catch (err) {
    console.error('[AutoShortages] Erro ao rodar rotina:', err);
    
    // Avisa o Vigilante em caso de falha
    try {
      const watcher = require('./watcher.service');
      watcher.registerServiceRun('auto_shortages', 'FAILED', err.message);
    } catch (watcherErr) {
      console.error('[AutoShortages] Erro ao registrar falha no Vigilante:', watcherErr.message);
    }

    return { error: err.message };
  }
}

module.exports = {
  runAutoShortages
};
