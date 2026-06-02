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
    timeout: 5000 // 5 seconds timeout for offline server
};

/**
 * Execute a query on Digifarma Firebird DB.
 * Gracefully handles offline scenarios.
 * @param {string} sql 
 * @param {Array} params 
 * @returns {Promise<Array>}
 */
async function queryDigifarma(sql, params = []) {
    return new Promise((resolve, reject) => {
        firebird.attach(options, function(err, db) {
            if (err) {
                console.error('[Digifarma DB] Connection Error:', err.message);
                return reject(new Error('Servidor do Digifarma Offline ou Inacessível.'));
            }

            db.query(sql, params, function(err, result) {
                if (err) {
                    console.error('[Digifarma DB] Query Error:', err.message);
                    db.detach();
                    return reject(err);
                }
                
                db.detach();
                resolve(result);
            });
        });
    });
}

module.exports = {
    queryDigifarma
};
