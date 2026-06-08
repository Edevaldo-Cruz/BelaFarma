const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./database.js');
const { queryDigifarma } = require('./services/digifarma.service');

(async () => {
  try {
    console.log('[AUTO-SHORTAGES TEST] Iniciando teste...');
    const sqlFaltas = `
      SELECT DISTINCT p.PRODUTO_ID, p.PRODUTO as PROD_NOME, p.PROD_SALDO
      FROM ITEM_VENDAS iv
      JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
      JOIN PRODUTOS p ON iv.PRODUTO_ID = p.PRODUTO_ID
      WHERE v.CANCELADO <> 'S'
        AND v.VENDA_DATA_HORA >= CURRENT_DATE
        AND p.PROD_SALDO <= 1
    `;
    const resultFaltas = await queryDigifarma(sqlFaltas);
    
    if (resultFaltas && resultFaltas.length > 0) {
      console.log(`[AUTO-SHORTAGES TEST] Encontrados ${resultFaltas.length} produtos com saldo <= 1.`);
      const insertShortageStmt = db.prepare(`
        INSERT INTO shortages (id, productName, type, clientInquiry, notes, createdAt, userName, source, purchased, ordered)
        VALUES (@id, @productName, @type, @clientInquiry, @notes, @createdAt, @userName, @source, @purchased, @ordered)
      `);
      
      for (const item of resultFaltas) {
        const prodName = (item.PROD_NOME || '').trim();
        const saldo = item.PROD_SALDO || 0;
        
        const existing = db.prepare(`SELECT id FROM shortages WHERE productName = ? AND purchased = 0 AND ordered = 0 LIMIT 1`).get(prodName);
        
        if (!existing) {
          const notes = saldo === 1 ? 'Atenção: Resta 1 unidade no estoque.' : '';
          insertShortageStmt.run({
            id: 'sht_' + Date.now().toString() + '_' + Math.floor(Math.random() * 1000),
            productName: prodName,
            type: 'Sistema',
            clientInquiry: '',
            notes: notes,
            createdAt: new Date().toISOString(),
            userName: 'Sistema (Fechamento)',
            source: 'auto',
            purchased: 0,
            ordered: 0
          });
          console.log(`[AUTO-SHORTAGES TEST] Adicionado à lista de faltas: ${prodName} (Saldo: ${saldo})`);
        } else {
          console.log(`[AUTO-SHORTAGES TEST] Já existe na lista: ${prodName}`);
        }
      }
    } else {
        console.log('[AUTO-SHORTAGES TEST] Nenhum produto com saldo <= 1 vendido hoje.');
    }
  } catch (e) {
    console.error('[AUTO-SHORTAGES TEST] Erro:', e);
  }
})();
