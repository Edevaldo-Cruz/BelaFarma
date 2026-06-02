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
    db.query("SELECT TRIM(RDB$RELATION_NAME) AS TNAME FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG=0 ORDER BY RDB$RELATION_NAME", function(err, result) {
        if (err) throw err;
        console.log("Tabelas no Digifarma:");
        console.log(result.map(r => r.TNAME).filter(t => t.includes('CRED') || t.includes('CLIENTE') || t.includes('RECEB') || t.includes('CONTA')).join(', '));
        db.detach();
    });
});
