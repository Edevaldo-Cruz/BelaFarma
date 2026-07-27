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

/**
 * Execute a query on Digifarma Firebird DB.
 * Gracefully handles offline scenarios.
 * Para comandos de escrita (UPDATE/INSERT/DELETE), usa db.execute() que faz
 * auto-commit imediato sem abrir transação longa que possa travar com locks.
 * @param {string} sql 
 * @param {Array} params 
 * @param {number} timeoutMs - Timeout em milissegundos (padrão 60000)
 * @returns {Promise<Array>}
 */
async function queryDigifarma(sql, params = [], timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        let finished = false;

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                console.error(`[Digifarma DB] Query Timeout (${timeoutMs}ms exceeded) for SQL:`, sql);
                reject(new Error(`Timeout de ${timeoutMs}ms excedido na consulta ao Digifarma.`));
            }
        }, timeoutMs);

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

            const isWrite = /^\s*(UPDATE|INSERT|DELETE)/i.test(sql);

            if (isWrite) {
                // Para escrita, usa db.execute() que faz auto-commit
                // Isso evita locks de transação longa que travam o Firebird
                db.execute(sql, params, function(err, result) {
                    if (finished) {
                        try { db.detach(); } catch (e) {}
                        return;
                    }

                    finished = true;
                    clearTimeout(timer);

                    if (err) {
                        console.error('[Digifarma DB] Execute Error:', err.message);
                        try { db.detach(); } catch (e) {}
                        return reject(err);
                    }

                    try { db.detach(); } catch (e) {}
                    resolve(result || []);
                });
            } else {
                // Para leitura, usa db.query() normal
                db.query(sql, params, function(err, result) {
                    if (finished) {
                        try { db.detach(); } catch (e) {}
                        return;
                    }

                    finished = true;
                    clearTimeout(timer);

                    if (err) {
                        console.error('[Digifarma DB] Query Error:', err.message);
                        try { db.detach(); } catch (e) {}
                        return reject(err);
                    }

                    try { db.detach(); } catch (e) {}
                    resolve(result);
                });
            }
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
