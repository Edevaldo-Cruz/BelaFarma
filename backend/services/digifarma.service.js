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
 * Cria um pool de conexões reutilizáveis para evitar abrir/fechar conexão a cada query.
 */
const pool = firebird.pool(5, options);

let firebirdOfflineUntil = 0;

/**
 * Execute a query on Digifarma Firebird DB.
 * Para comandos de escrita (UPDATE/INSERT/DELETE), abre transação explícita
 * com commit imediato para garantir persistência.
 * @param {string} sql 
 * @param {Array} params 
 * @param {number} timeoutMs
 * @returns {Promise<Array>}
 */
async function queryDigifarma(sql, params = [], timeoutMs = 30000) {
    if (Date.now() < firebirdOfflineUntil) {
        return Promise.reject(new Error('Circuit Breaker: Servidor do Digifarma Offline.'));
    }

    return new Promise((resolve, reject) => {
        let finished = false;

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                firebirdOfflineUntil = Date.now() + 60000; // Circuit breaker 1 min
                console.error(`[Digifarma DB] Query Timeout (${timeoutMs}ms exceeded) for SQL:`, sql);
                reject(new Error(`Timeout de ${timeoutMs}ms excedido na consulta ao Digifarma.`));
            }
        }, timeoutMs);

        const done = (err, result) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (err) return reject(err);
            resolve(result || []);
        };

        pool.get((err, db) => {
            if (finished) {
                if (db) try { db.detach(); } catch(e) {}
                return;
            }

            if (err) {
                firebirdOfflineUntil = Date.now() + 60000; // Circuit breaker 1 min
                console.error('[Digifarma DB] Connection Error:', err.message);
                return done(new Error('Servidor do Digifarma Offline ou Inacessível.'));
            }

            const isWrite = /^\s*(UPDATE|INSERT|DELETE)/i.test(sql);

            if (isWrite) {
                // Para escrita: transação explícita com commit
                db.transaction(firebird.ISOLATION_READ_COMMITTED, function(err, tr) {
                    if (err) {
                        console.error('[Digifarma DB] Transaction Error:', err.message);
                        try { db.detach(); } catch(e) {}
                        return done(err);
                    }

                    if (finished) {
                        try { tr.rollback(function() { db.detach(); }); } catch(e) {}
                        return;
                    }

                    tr.query(sql, params, function(err, result) {
                        if (finished) {
                            try { tr.rollback(function() { db.detach(); }); } catch(e) {}
                            return;
                        }

                        if (err) {
                            console.error('[Digifarma DB] Write Query Error:', err.message);
                            try { tr.rollback(function() { db.detach(); }); } catch(e) {}
                            return done(err);
                        }

                        tr.commit(function(err) {
                            if (err) {
                                console.error('[Digifarma DB] Commit Error:', err.message);
                                try { tr.rollback(function() { db.detach(); }); } catch(e) {}
                                return done(err);
                            }
                            try { db.detach(); } catch(e) {}
                            console.log('[Digifarma DB] ✅ Write committed successfully for:', sql.substring(0, 60));
                            done(null, result);
                        });
                    });
                });
            } else {
                // Para leitura: query simples
                db.query(sql, params, function(err, result) {
                    if (err) {
                        console.error('[Digifarma DB] Query Error:', err.message);
                    }
                    try { db.detach(); } catch(e) {}
                    done(err, result);
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
