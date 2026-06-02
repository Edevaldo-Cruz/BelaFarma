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
    db.query("SELECT TRIM(RDB$FIELD_NAME) AS FNAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CREDIARIO' ORDER BY RDB$FIELD_NAME", function(err, result) {
        if (err) throw err;
        console.log("Colunas em CREDIARIO:");
        console.log(result.map(r => r.FNAME).join(', '));
        
        db.query("SELECT FIRST 5 * FROM CREDIARIO WHERE QUITADO = 'N'", function(err, res2) {
             if (err) console.error(err);
             else {
                console.log("Sample Data (Nao Quitados):", res2);
             }
             
             db.query("SELECT TRIM(RDB$FIELD_NAME) AS FNAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CLIENTES' ORDER BY RDB$FIELD_NAME", function(err, result3) {
                 if (err) throw err;
                 console.log("Colunas em CLIENTES:");
                 console.log(result3.map(r => r.FNAME).join(', '));
                 db.detach();
             });
        });
    });
});
