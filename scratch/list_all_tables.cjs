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
    db.query("SELECT TRIM(RDB$RELATION_NAME) AS TNAME FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG=0 ORDER BY RDB$RELATION_NAME", function(err, result) {
        if (err) {
            console.error('Erro ao buscar tabelas:', err);
            db.detach();
            return;
        }
        console.log("Todas as tabelas no Digifarma:");
        console.log(result.map(r => r.TNAME).join(', '));
        db.detach();
    });
});
