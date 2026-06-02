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
    
    const limit = 5;
    const offset = 0;
    const daysWithoutSales = 90;
    
    // Query otimizada usando subqueries correlacionadas indexadas
    const sql = `
      SELECT FIRST ${limit} SKIP ${offset}
        p.PRODUTO_ID,
        p.PRODUTO,
        p.APRESENTACAO,
        p.COD_BARRAS,
        p.PROD_SALDO,
        p.PROD_PRVENDA,
        COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA,
        c.CATEGORIA as CATEGORIA_NOME,
        (
          SELECT FIRST 1 v.VENDA_DATA_HORA 
          FROM ITEM_VENDAS iv
          JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
          WHERE iv.PRODUTO_ID = p.PRODUTO_ID 
            AND v.CANCELADO <> 'S'
          ORDER BY v.VENDA_DATA_HORA DESC
        ) as ULTIMA_VENDA
      FROM PRODUTOS p
      LEFT JOIN CATEGORIA c ON p.CATEGORIA_ID = c.CATEGORIA_ID
      WHERE p.PROD_ATIVO = 'S' 
        AND p.PROD_SALDO > 0
        AND NOT EXISTS (
          SELECT FIRST 1 1 
          FROM ITEM_VENDAS iv2
          JOIN CAB_VENDAS v2 ON iv2.VENDA_NOTA_ID = v2.VENDA_NOTA_ID
          WHERE iv2.PRODUTO_ID = p.PRODUTO_ID 
            AND v2.CANCELADO <> 'S'
            AND v2.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - CAST(? AS INTEGER)
        )
      ORDER BY p.PRODUTO ASC
    `;

    console.log('Testando query de estoque otimizada com subqueries correlacionadas...');
    const start = Date.now();
    
    db.query(sql, [daysWithoutSales], function(err, res) {
      const duration = Date.now() - start;
      if (err) {
        console.error('❌ Erro na query otimizada:', err.message);
      } else {
        console.log(`✅ Sucesso! Tempo de execução: ${duration}ms. Registros retornados:`, res.length);
        console.log('Dados:', res);
      }
      db.detach();
    });
});
