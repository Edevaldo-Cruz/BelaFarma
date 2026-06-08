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
        SELECT FIRST 1 VALOR_ABERTURA, ABERTURA, FECHAMENTO
        FROM CAIXA 
        ORDER BY ABERTURA DESC
    `, function(err, result) {
        if (err) throw err;
        console.log("Último caixa aberto:", result);
        db.detach();
    });
});
