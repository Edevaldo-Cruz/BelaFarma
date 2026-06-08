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
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStart = `${year}-${month}-${day} 00:00:00`;

    db.query(`
        SELECT COALESCE(SUM(VALOR_ABERTURA), 0) as FUNDO_CAIXA 
        FROM CAIXA 
        WHERE ABERTURA >= ? 
          AND FECHAMENTO IS NULL
    `, [todayStart], function(err, result) {
        if (err) throw err;
        console.log("Fundo de caixa (aberto hoje e sem fechamento):", result);
        
        db.query(`
            SELECT COALESCE(SUM(VALOR_ABERTURA), 0) as FUNDO_CAIXA_HOJE 
            FROM CAIXA 
            WHERE ABERTURA >= ? 
        `, [todayStart], function(err, result2) {
            if (err) throw err;
            console.log("Fundo de caixa (todos os abertos hoje):", result2);
            db.detach();
        });
    });
});
