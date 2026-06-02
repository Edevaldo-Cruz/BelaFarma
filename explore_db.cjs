const firebird = require('node-firebird');

const options = {
    host: '192.168.1.7',
    port: 3050,
    database: 'C:\\Digifarma\\Dados\\digifarma6.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

firebird.attach(options, function(err, db) {
    if (err) throw err;
    db.query(`SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE TRIM(RDB$RELATION_NAME) = 'CREDIARIO'`, function(err, result) {
        if (!err && result.length > 0) {
            console.log(result.map(r => r['RDB$FIELD_NAME'].trim()).join(', '));
        }
        db.detach();
    });
});
