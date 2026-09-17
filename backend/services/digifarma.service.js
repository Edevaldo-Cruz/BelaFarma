const firebird = require('node-firebird');

const options = {
    host: '127.0.0.1',
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
const pool = firebird.pool(10, options);

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
    const isWrite = /^\s*(UPDATE|INSERT|DELETE)/i.test(sql);

    // Se o Circuit Breaker estiver ativo, permite que escritas ou consultas pontuais prioritárias tentem conectar
    if (Date.now() < firebirdOfflineUntil && !isWrite) {
        return Promise.reject(new Error('Circuit Breaker: Servidor do Digifarma Offline.'));
    }

    return new Promise((resolve, reject) => {
        let finished = false;

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                // Query timeout não significa que o servidor físico caiu, apenas que a consulta demorou muito
                console.warn(`[Digifarma DB] Query Timeout (${timeoutMs}ms exceeded) for SQL:`, (sql || '').substring(0, 100));
                reject(new Error(`Timeout de ${timeoutMs}ms excedido na consulta ao Digifarma.`));
            }
        }, timeoutMs);

        const done = (err, result) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (err) return reject(err);
            // Se respondeu com sucesso, garante que o circuit breaker seja limpo
            if (firebirdOfflineUntil > 0) {
                firebirdOfflineUntil = 0;
            }
            resolve(result || []);
        };

        pool.get((err, db) => {
            if (finished) {
                if (db) try { db.detach(); } catch(e) {}
                return;
            }

            if (err) {
                // Erro real de rede/conexão física no pool -> ativa circuit breaker por 20s
                firebirdOfflineUntil = Date.now() + 20000;
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

/**
 * Helper para separar Rua e Número de um endereço texto
 */
function splitAddressNumber(rawAddress) {
  if (!rawAddress) return { street: '', number: 'S/N' };
  const clean = rawAddress.replace(/Balcão\s*\/?\s*Loja|Endereço a confirmar/gi, '').trim();
  if (!clean) return { street: '', number: 'S/N' };
  
  const match = clean.match(/^(.*?)[,\s]+(?:n[ºo°]?\s*)?(\d+[a-zA-Z]?)(.*)$/i);
  if (match) {
    return {
      street: match[1].trim(),
      number: match[2].trim(),
      complement: (match[3] || '').replace(/^[,\-\s]+/, '').trim()
    };
  }
  return { street: clean, number: 'S/N' };
}

/**
 * Localiza ou Cadastra automaticamente um cliente no ERP Digifarma (Firebird)
 */
async function findOrCreateDigifarmaCustomer(customerData = {}) {
  const { name, phone, address, neighborhood } = customerData;
  if (!phone) {
    return { success: false, message: 'Telefone não informado.' };
  }

  // Normalização do telefone e DDD
  let cleanPhone = String(phone).replace(/\D/g, '');
  if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
    cleanPhone = cleanPhone.substring(2);
  }

  let ddd = '32';
  let phoneNum = cleanPhone;
  if (cleanPhone.length >= 10) {
    ddd = cleanPhone.substring(0, 2);
    phoneNum = cleanPhone.substring(2);
  }

  const phoneSuffix = phoneNum.length >= 8 ? phoneNum.slice(-8) : phoneNum;
  const parsed = splitAddressNumber(address);
  const street = parsed.street || '';
  const number = parsed.number || 'S/N';
  const cleanNeighborhood = (neighborhood || '').trim();
  const cleanName = (name || '').trim();
  const isGenericName = !cleanName || ['cliente', 'cliente whatsapp', 'atendente'].includes(cleanName.toLowerCase());

  try {
    // 1. Buscar se o cliente já existe no Digifarma
    const searchSql = `
      SELECT FIRST 1 CLIENTE_ID, CLIENTE, CLI_CELULAR, CLI_TELEFONE, CLI_ENDERECO, CLI_NUMERO, CLI_BAIRRO
      FROM CLIENTES
      WHERE CLI_CELULAR LIKE ? OR CLI_TELEFONE LIKE ?
    `;
    const existing = await queryDigifarma(searchSql, [`%${phoneSuffix}%`, `%${phoneSuffix}%`]);

    if (existing && existing.length > 0) {
      const cli = existing[0];
      const cliId = cli.CLIENTE_ID;
      const updates = [];
      const params = [];

      // Se o Digifarma está sem endereço e temos um novo, atualiza
      if ((!cli.CLI_ENDERECO || cli.CLI_ENDERECO.trim() === '') && street) {
        updates.push('CLI_ENDERECO = ?');
        params.push(street.toUpperCase().substring(0, 50));
        if (number && number !== 'S/N') {
          updates.push('CLI_NUMERO = ?');
          params.push(number.substring(0, 10));
        }
      }

      // Se está sem bairro e temos um novo, atualiza
      if ((!cli.CLI_BAIRRO || cli.CLI_BAIRRO.trim() === '') && cleanNeighborhood) {
        updates.push('CLI_BAIRRO = ?');
        params.push(cleanNeighborhood.toUpperCase().substring(0, 30));
      }

      // Se no Digifarma está sem nome ou genérico e temos um nome válido, atualiza
      if ((!cli.CLIENTE || cli.CLIENTE.trim() === '' || cli.CLIENTE.toUpperCase().includes('CONSUMIDOR')) && !isGenericName) {
        updates.push('CLIENTE = ?');
        params.push(cleanName.toUpperCase().substring(0, 50));
      }

      if (updates.length > 0) {
        updates.push('LASTUPDATE = CURRENT_TIMESTAMP');
        params.push(cliId);
        const updateSql = `UPDATE CLIENTES SET ${updates.join(', ')} WHERE CLIENTE_ID = ?`;
        await queryDigifarma(updateSql, params);
        console.log(`[Digifarma Sync] 🔄 Cliente #${cliId} (${cli.CLIENTE}) atualizado com dados do WhatsApp.`);
      }

      return {
        success: true,
        action: 'existing',
        cliente_id: cliId,
        cliente_nome: cli.CLIENTE
      };
    }

    // 2. Se NÃO existe no Digifarma, cria um novo cadastro
    const finalName = !isGenericName ? cleanName.toUpperCase().substring(0, 50) : `CLIENTE WHATSAPP ${phoneSuffix}`;

    // Obter próximo ID do gerador oficial do Digifarma
    const genRes = await queryDigifarma('SELECT GEN_ID(GEN_CLIENTES, 1) AS NEXT_ID FROM RDB$DATABASE');
    const nextId = (genRes && genRes[0] && genRes[0].NEXT_ID) ? genRes[0].NEXT_ID : null;

    if (!nextId) {
      throw new Error('Não foi possível obter o próximo ID do gerador GEN_CLIENTES no Digifarma.');
    }

    const insertSql = `
      INSERT INTO CLIENTES (
        CLIENTE_ID, CLIENTE, CLI_CELULAR, DDD_CELULAR, CLI_ENDERECO, CLI_NUMERO, CLI_BAIRRO,
        CLI_CIDADE, CLI_UF, CLI_DATA_CADASTRO, ORIGEM_CADASTRO_ID, PERMITIR_CREDIARIO,
        GERA_PONTOS_FIDELIDADE, STATUS_TRANSF, LASTUPDATE
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, 'JUIZ DE FORA', 'MG', CURRENT_DATE, 1, 'S', 'S', 'I', CURRENT_TIMESTAMP
      )
    `;

    await queryDigifarma(insertSql, [
      nextId,
      finalName,
      phoneNum.substring(0, 15),
      ddd,
      street ? street.toUpperCase().substring(0, 50) : null,
      number ? number.substring(0, 10) : null,
      cleanNeighborhood ? cleanNeighborhood.toUpperCase().substring(0, 30) : null
    ]);

    console.log(`[Digifarma Sync] ✅ Novo cliente #${nextId} (${finalName}) cadastrado com sucesso no Digifarma!`);

    return {
      success: true,
      action: 'created',
      cliente_id: nextId,
      cliente_nome: finalName
    };
  } catch (err) {
    console.error('[Digifarma Sync] ⚠️ Erro ao sincronizar cliente com Digifarma:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

module.exports = {
    queryDigifarma,
    findOrCreateDigifarmaCustomer,
    splitAddressNumber,
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

