const { Client } = require('ssh2');
const conn = new Client();

const code = `
const firebird = require('node-firebird');
const options = {
    host: '192.168.1.10',
    port: 3050,
    database: 'C:\\\\Digifarma\\\\Dados\\\\digifarma6.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

firebird.attach(options, function(err, db) {
    if (err) { console.error('Attach error:', err.message); return; }
    console.log('Attached to Firebird DB successfully.');

    db.query('SELECT FIRST 1 PRODUTO_ID, PROD_PRVENDA, PROD_PRPROMOCAO FROM PRODUTOS WHERE PROD_ATIVO = \\'S\\'', [], function(err, res) {
        if (err) { console.error('Select error:', err.message); db.detach(); return; }
        console.log('Current product data:', res);
        if (!res || res.length === 0) { db.detach(); return; }
        const prodId = String(res[0].PRODUTO_ID);
        const price = res[0].PROD_PRVENDA;

        console.log('Testing transaction update for product:', prodId);
        db.transaction(firebird.ISOLATION_READ_COMMITTED, function(err, transaction) {
            if (err) { console.error('Tx error:', err.message); db.detach(); return; }
            transaction.query('UPDATE PRODUTOS SET PROD_PRVENDA = ? WHERE PRODUTO_ID = ?', [price, prodId], function(err, result) {
                if (err) {
                    console.error('Update error:', err.message);
                    transaction.rollback();
                    db.detach();
                    return;
                }
                transaction.commit(function(err) {
                    if (err) console.error('Commit error:', err.message);
                    else console.log('✅ COMMIT SUCCESSFUL IN < 1 SECOND!');
                    db.detach();
                });
            });
        });
    });
});
`;

conn.on('ready', () => {
  const cmd = `sudo docker exec belafarma-backend-1 node -e "${code.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('Exec error:', err); conn.end(); return; }
    stream.on('close', () => conn.end())
      .on('data', (d) => process.stdout.write(d.toString()))
      .stderr.on('data', (d) => process.stderr.write(d.toString()));
  });
}).on('error', (err) => console.error(err.message)).connect({
  host: '192.168.1.70',
  port: 22,
  username: 'ed',
  password: '2494'
});
