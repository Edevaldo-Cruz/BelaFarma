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
    
    // Testar se extração de mês/ano funciona na query de saídas
    const sql = `
        SELECT 
          COALESCE(SUM(iv.ITEMVEND_QUANT), 0) as TOTAL_SAIDAS
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE v.CANCELADO <> 'S'
          AND EXTRACT(MONTH FROM v.VENDA_DATA_HORA) = EXTRACT(MONTH FROM CAST('NOW' AS TIMESTAMP))
          AND EXTRACT(YEAR FROM v.VENDA_DATA_HORA) = EXTRACT(YEAR FROM CAST('NOW' AS TIMESTAMP))
    `;
    
    db.query(sql, function(err, result) {
        if (err) {
            console.error('Erro na query:', err);
        } else {
            console.log('Saídas no mês atual encontradas:', result);
        }
        db.detach();
    });
});
