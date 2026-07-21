const firebird = require('node-firebird');

const options = {
    host: '192.168.1.10',
    port: 3050,
    database: 'C:\\Digifarma\\Dados\\digifarma6.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
    timeout: 20000 // 20 seconds timeout for offline server
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
        let finished = false;

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                console.error('[Digifarma DB] Query Timeout (20000ms exceeded) for SQL:', sql);
                reject(new Error('Timeout de 20000ms excedido na consulta ao Digifarma.'));
            }
        }, 20000);

        firebird.attach(options, function(err, db) {
            if (finished) {
                if (db) {
                    try { db.detach(); } catch (e) {}
                }
                return;
            }

            if (err) {
                finished = true;
                clearTimeout(timer);
                console.error('[Digifarma DB] Connection Error:', err.message);
                return reject(new Error('Servidor do Digifarma Offline ou Inacessível.'));
            }

            db.query(sql, params, function(err, result) {
                if (finished) {
                    try { db.detach(); } catch (e) {}
                    return;
                }

                finished = true;
                clearTimeout(timer);

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
    queryDigifarma,
    getDigifarmaConnection: function() {
        return new Promise((resolve, reject) => {
            firebird.attach(options, function(err, db) {
                if (err) {
                    console.error('[Digifarma DB] Connection Error:', err.message);
                    return reject(new Error('Servidor do Digifarma Offline ou Inacessível.'));
                }
                
                // Retorna um wrapper para executar queries com timeout
                resolve({
                    query: function(sql, params = []) {
                        return new Promise((resQuery, rejQuery) => {
                            db.query(sql, params, function(err, result) {
                                if (err) {
                                    console.error('[Digifarma DB] Query Error:', err.message);
                                    return rejQuery(err);
                                }
                                resQuery(result);
                            });
                        });
                    },
                    detach: function() {
                        try { db.detach(); } catch(e) {}
                    }
                });
            });
        });
    }
};
