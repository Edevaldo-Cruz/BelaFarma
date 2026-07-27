const firebird = require('node-firebird');

const options = {
    host: '192.168.1.10',
    port: 3050,
    database: 'C:\\Digifarma\\Dados\\digifarma6.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

firebird.attach(options, function(err, db) {
    if (err) {
        console.error('Attach error:', err.message);
        return;
    }
    console.log('Attached to Firebird DB successfully.');

    // Fetch product 186253 current price
    db.query('SELECT PRODUTO_ID, PROD_PRVENDA, PROD_PRPROMOCAO FROM PRODUTOS WHERE PRODUTO_ID = ?', ['186253'], function(err, res) {
        if (err) {
            console.error('Select error:', err.message);
            db.detach();
            return;
        }
        console.log('Current product data:', res);

        // Try transaction update
        db.transaction(firebird.ISOLATION_READ_COMMITTED, function(err, transaction) {
            if (err) {
                console.error('Transaction start error:', err.message);
                db.detach();
                return;
            }

            const sql = 'UPDATE PRODUTOS SET PROD_PRVENDA = ? WHERE PRODUTO_ID = ?';
            const currentPrice = res[0] ? res[0].PROD_PRVENDA : 10;
            
            transaction.query(sql, [currentPrice, '186253'], function(err, result) {
                if (err) {
                    console.error('Update query error:', err.message);
                    transaction.rollback();
                    db.detach();
                    return;
                }
                console.log('Update query executed, committing...');
                transaction.commit(function(err) {
                    if (err) {
                        console.error('Commit error:', err.message);
                        transaction.rollback();
                    } else {
                        console.log('✅ Commit successful!');
                    }
                    db.detach();
                });
            });
        });
    });
});
