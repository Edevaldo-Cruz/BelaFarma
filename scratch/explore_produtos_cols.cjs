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
    db.query("SELECT TRIM(RDB$FIELD_NAME) AS FNAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'PRODUTOS' ORDER BY RDB$FIELD_NAME", function(err, result) {
        if (err) {
            console.error('Erro ao obter colunas:', err);
            db.detach();
            return;
        }
        console.log("Colunas em PRODUTOS:");
        console.log(result.map(r => r.FNAME).join(', '));
        db.detach();
    });
});
