// Script para verificar preço atual do produto 186253 no Firebird via SSH
const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH conectado. Executando query no Firebird via container...');
    const cmd = `cd /home/ed/projects/BelaFarma && sudo docker-compose exec -T backend node -e "
const fb = require('node-firebird');
const opts = { host: '192.168.1.10', port: 3050, database: 'C:\\\\\\\\Digifarma\\\\\\\\Dados\\\\\\\\digifarma6.fdb', user: 'SYSDBA', password: 'masterkey' };
fb.attach(opts, function(err, db) {
    if (err) { console.error('CONN ERR:', err.message); process.exit(1); }
    db.query('SELECT PRODUTO_ID, PROD_PRVENDA, PROD_PRPROMOCAO FROM PRODUTOS WHERE PRODUTO_ID = 186253', [], function(err, rows) {
        if (err) { console.error('QUERY ERR:', err.message); db.detach(); process.exit(1); }
        console.log('RESULTADO FIREBIRD:', JSON.stringify(rows, null, 2));
        db.detach();
    });
});
"`;
    conn.exec(cmd, (err, stream) => {
        if (err) { console.error('SSH exec err:', err.message); conn.end(); return; }
        stream.on('data', (data) => { process.stdout.write(data); });
        stream.stderr.on('data', (data) => { process.stderr.write(data); });
        stream.on('close', () => { conn.end(); });
    });
}).on('error', (err) => {
    console.error('SSH Error:', err.message);
}).connect({
    host: '192.168.1.70',
    port: 22,
    username: 'ed',
    password: '2494'
});
