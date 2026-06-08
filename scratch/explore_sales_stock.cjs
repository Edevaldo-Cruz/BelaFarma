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
    if (err) throw err;
    db.query(`
        SELECT FIRST 5 
            iv.PRODUTO_ID, 
            p.DESCRICAO, 
            p.ESTOQUE_ATUAL,
            iv.QUANTIDADE
        FROM ITENS_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        JOIN PRODUTOS p ON iv.PRODUTO_ID = p.PRODUTO_ID
        WHERE v.VENDA_DATA_HORA >= CURRENT_DATE
    `, function(err, result) {
        if (err) {
            console.error("Error with ITENS_VENDAS:", err.message);
            // Let's try CAB_VENDAS_ITENS
            db.query(`
                SELECT FIRST 5 
                    iv.PRODUTO_ID, 
                    p.DESCRICAO, 
                    p.ESTOQUE_ATUAL,
                    iv.QUANTIDADE
                FROM CAB_VENDAS_ITENS iv
                JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
                JOIN PRODUTOS p ON iv.PRODUTO_ID = p.PRODUTO_ID
                WHERE v.VENDA_DATA_HORA >= CURRENT_DATE
            `, function(err2, result2) {
                if (err2) {
                    console.error("Error with CAB_VENDAS_ITENS:", err2.message);
                } else {
                    console.log("Success with CAB_VENDAS_ITENS:", result2);
                }
                db.detach();
            });
        } else {
            console.log("Success with ITENS_VENDAS:", result);
            db.detach();
        }
    });
});
