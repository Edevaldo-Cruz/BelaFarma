const firebird = require('node-firebird');

const options = {
    host: '192.168.1.7',
    port: 3050,
    database: 'C:\\Digifarma\\Dados\\digifarma6.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
};

firebird.attach(options, function(err, db) {
    if (err) {
        console.error('Erro ao conectar:', err);
        return;
    }
    
    // Vamos testar a query completa com limit e skip
    const sqlCount = `
      SELECT COUNT(*) as TOTAL_COUNT
      FROM PRODUTOS p
      LEFT JOIN (
        SELECT 
          iv.PRODUTO_ID, 
          MAX(v.VENDA_DATA_HORA) as ULTIMA_VENDA 
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE v.CANCELADO <> 'S'
        GROUP BY iv.PRODUTO_ID
      ) uv ON p.PRODUTO_ID = uv.PRODUTO_ID
      WHERE p.PROD_ATIVO = 'S' AND p.PROD_SALDO > 0
        AND (uv.ULTIMA_VENDA IS NULL OR uv.ULTIMA_VENDA < CAST('NOW' AS TIMESTAMP) - 90)
    `;

    const sqlData = `
      SELECT FIRST 2 SKIP 0
        p.PRODUTO_ID,
        p.PRODUTO,
        p.APRESENTACAO,
        p.COD_BARRAS,
        p.PROD_SALDO,
        p.PROD_PRVENDA,
        COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA,
        c.CATEGORIA as CATEGORIA_NOME,
        uv.ULTIMA_VENDA,
        COALESCE(sm.SAIDAS_MES, 0) as SAIDAS_MES
      FROM PRODUTOS p
      LEFT JOIN CATEGORIA c ON p.CATEGORIA_ID = c.CATEGORIA_ID
      LEFT JOIN (
        SELECT 
          iv.PRODUTO_ID, 
          MAX(v.VENDA_DATA_HORA) as ULTIMA_VENDA 
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE v.CANCELADO <> 'S'
        GROUP BY iv.PRODUTO_ID
      ) uv ON p.PRODUTO_ID = uv.PRODUTO_ID
      LEFT JOIN (
        SELECT 
          iv.PRODUTO_ID,
          SUM(iv.ITEMVEND_QUANT) as SAIDAS_MES
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE v.CANCELADO <> 'S'
          AND EXTRACT(MONTH FROM v.VENDA_DATA_HORA) = EXTRACT(MONTH FROM CURRENT_TIMESTAMP)
          AND EXTRACT(YEAR FROM v.VENDA_DATA_HORA) = EXTRACT(YEAR FROM CURRENT_TIMESTAMP)
        GROUP BY iv.PRODUTO_ID
      ) sm ON p.PRODUTO_ID = sm.PRODUTO_ID
      WHERE p.PROD_ATIVO = 'S' AND p.PROD_SALDO > 0
        AND (uv.ULTIMA_VENDA IS NULL OR uv.ULTIMA_VENDA < CAST('NOW' AS TIMESTAMP) - 90)
      ORDER BY p.PRODUTO ASC
    `;

    console.log('Testando query de COUNT...');
    db.query(sqlCount, function(err, resultCount) {
      if (err) {
        console.error('❌ Erro no COUNT:', err);
        db.detach();
        return;
      }
      console.log('✅ COUNT ok:', resultCount);
      
      console.log('Testando query de DATA...');
      db.query(sqlData, function(err, resultData) {
        if (err) {
          console.error('❌ Erro no DATA:', err);
        } else {
          console.log('✅ DATA ok, total retornado:', resultData.length);
          console.log('Exemplo do primeiro item:', resultData[0]);
        }
        db.detach();
      });
    });
});
