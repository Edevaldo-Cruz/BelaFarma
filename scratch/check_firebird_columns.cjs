const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
    const cmd = `cd /home/ed/projects/BelaFarma && sudo docker-compose exec -T backend node -e "
const fb = require('node-firebird');
const opts = { host: '192.168.1.10', port: 3050, database: 'C:\\\\\\\\Digifarma\\\\\\\\Dados\\\\\\\\digifarma6.fdb', user: 'SYSDBA', password: 'masterkey' };
fb.attach(opts, function(err, db) {
    if (err) { console.error('ERR:', err.message); process.exit(1); }
    // 1. Listar todas as categorias
    db.query('SELECT * FROM CATEGORIA ORDER BY CATEGORIA_ID', [], function(err, rows) {
        if (err) { console.error('ERR:', err.message); db.detach(); process.exit(1); }
        console.log('CATEGORIAS:', JSON.stringify(rows, null, 2));
        // 2. Listar sub_categorias
        db.query('SELECT FIRST 10 * FROM SUB_CATEGORIAS ORDER BY 1', [], function(err, rows2) {
            if (err) { console.error('SUB ERR:', err.message); db.detach(); process.exit(1); }
            console.log('SUB_CATEGORIAS:', JSON.stringify(rows2, null, 2));
            db.detach();
        });
    });
});
"`;
    conn.exec(cmd, (err, stream) => {
        if (err) { console.error('ERR:', err.message); conn.end(); return; }
        stream.on('data', (data) => { process.stdout.write(data); });
        stream.stderr.on('data', (data) => { process.stderr.write(data); });
        stream.on('close', () => { conn.end(); });
    });
}).on('error', (err) => { console.error('ERR:', err.message); }).connect({ host: '192.168.1.70', port: 22, username: 'ed', password: '2494' });
