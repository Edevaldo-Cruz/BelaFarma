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
    
    const limit = 2;
    const offset = 0;
    
    // Concatenando limit e offset diretamente e usando CAST(? AS INTEGER)
    const sql = `
      SELECT FIRST ${limit} SKIP ${offset}
        p.PRODUTO_ID, p.PRODUTO
      FROM PRODUTOS p
      LEFT JOIN (
        SELECT iv.PRODUTO_ID, MAX(v.VENDA_DATA_HORA) as ULTIMA_VENDA 
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE v.CANCELADO <> 'S'
        GROUP BY iv.PRODUTO_ID
      ) uv ON p.PRODUTO_ID = uv.PRODUTO_ID
      WHERE p.PROD_ATIVO = 'S' 
        AND (uv.ULTIMA_VENDA IS NULL OR uv.ULTIMA_VENDA < CAST('NOW' AS TIMESTAMP) - CAST(? AS INTEGER))
      ORDER BY p.PRODUTO ASC
    `;

    console.log('Testando query concatenada com CAST(? AS INTEGER)...');
    db.query(sql, [90], function(err, res) {
      if (err) {
        console.log('❌ Deu erro:', err.message);
      } else {
        console.log('✅ Funcionou com sucesso! Registros retornados:', res.length);
        console.log(res);
      }
      db.detach();
    });
});
