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
        SELECT r.RDB$RELATION_NAME as TABLE_NAME, r.RDB$FIELD_NAME as FIELD_NAME
        FROM RDB$RELATION_FIELDS r
        WHERE r.RDB$RELATION_NAME IN ('CAIXA', 'MOVIMENTO_CAIXA', 'FLUXO_CAIXA', 'CONFERE_CAIXA')
        ORDER BY r.RDB$RELATION_NAME, r.RDB$FIELD_POSITION
    `, function(err, result) {
        if (err) throw err;
        const tables = {};
        result.forEach(row => {
            const table = row.TABLE_NAME.trim();
            const field = row.FIELD_NAME.trim();
            if (!tables[table]) tables[table] = [];
            tables[table].push(field);
        });
        console.log(JSON.stringify(tables, null, 2));

        // Let's also check some recent rows from CAIXA
        db.query(`SELECT FIRST 5 * FROM CAIXA ORDER BY 1 DESC`, function(err, result) {
            if (err) throw err;
            console.log("\nRecent CAIXA rows:");
            console.log(JSON.stringify(result, null, 2));
            db.detach();
        });
    });
});
