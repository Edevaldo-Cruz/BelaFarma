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
    
    // 1. Testar sem cast (deve dar o erro de Conversion error)
    const sqlError = `
      SELECT FIRST 1 p.PRODUTO_ID 
      FROM PRODUTOS p
      LEFT JOIN (
        SELECT iv.PRODUTO_ID, MAX(v.VENDA_DATA_HORA) as ULTIMA_VENDA 
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE v.CANCELADO <> 'S'
        GROUP BY iv.PRODUTO_ID
      ) uv ON p.PRODUTO_ID = uv.PRODUTO_ID
      WHERE p.PROD_ATIVO = 'S' 
        AND (uv.ULTIMA_VENDA IS NULL OR uv.ULTIMA_VENDA < CAST('NOW' AS TIMESTAMP) - ?)
    `;

    // 2. Testar com cast (deve funcionar)
    const sqlSuccess = `
      SELECT FIRST 1 p.PRODUTO_ID 
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
    `;

    console.log('Testando query sem cast...');
    db.query(sqlError, [90], function(err, res) {
      if (err) {
        console.log('❌ Sem cast deu erro esperado:', err.message);
      } else {
        console.log('✅ Sem cast funcionou:', res);
      }

      console.log('\nTestando query COM CAST...');
      db.query(sqlSuccess, [90], function(err2, res2) {
        if (err2) {
          console.log('❌ Com cast deu erro:', err2.message);
        } else {
          console.log('✅ Com cast funcionou com sucesso!', res2);
        }
        db.detach();
      });
    });
});
