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
    
    // Testar ordenação por subquery de última venda
    const sql = `
      SELECT FIRST ${limit} SKIP ${offset}
        p.PRODUTO_ID,
        p.PRODUTO,
        (
          SELECT FIRST 1 v2.VENDA_DATA_HORA 
          FROM ITEM_VENDAS iv2
          JOIN CAB_VENDAS v2 ON iv2.VENDA_NOTA_ID = v2.VENDA_NOTA_ID
          WHERE iv2.PRODUTO_ID = p.PRODUTO_ID 
            AND v2.CANCELADO <> 'S'
          ORDER BY v2.VENDA_DATA_HORA DESC
        ) as ULTIMA_VENDA
      FROM PRODUTOS p
      WHERE p.PROD_ATIVO = 'S' 
        AND p.PROD_SALDO > 0
      ORDER BY 3 ASC NULLS FIRST
    `;

    console.log('Testando ordenação por posição de coluna da subquery correlacionada...');
    const start = Date.now();
    
    db.query(sql, function(err, res) {
      const duration = Date.now() - start;
      if (err) {
        console.error('❌ Erro na ordenação:', err.message);
      } else {
        console.log(`✅ Sucesso! Tempo de execução: ${duration}ms. Registros retornados:`, res.length);
        console.log('Dados:', res);
      }
      db.detach();
    });
});
