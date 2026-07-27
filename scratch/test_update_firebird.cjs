// Script para testar UPDATE no Firebird via API do backend e confirmar no banco
const { Client } = require('ssh2');

const PRODUCT_ID = '186253';
const NEW_PRICE = 99.99; // preço bem diferente para confirmar mudança

async function main() {
    console.log(`\n=== TESTE COMPLETO DE UPDATE NO FIREBIRD ===\n`);
    
    // 1. Ler preço atual direto do Firebird (antes)
    console.log('1. Lendo preço ANTES do update no Firebird...');
    const before = await readFromFirebird();
    console.log('   ANTES:', JSON.stringify(before));
    
    // 2. Chamar API de update
    console.log(`\n2. Chamando API update-prices com novo preço R$ ${NEW_PRICE}...`);
    const start = Date.now();
    const resp = await fetch('http://192.168.1.70:8085/api/price-manager/update-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ id: PRODUCT_ID, price: NEW_PRICE }] })
    });
    const apiResult = await resp.json();
    console.log(`   API Response (${Date.now()-start}ms):`, JSON.stringify(apiResult, null, 2));
    
    // 3. Esperar 2 segundos para garantir commit
    console.log('\n3. Aguardando 2s para confirmar commit...');
    await new Promise(r => setTimeout(r, 2000));
    
    // 4. Ler preço atual direto do Firebird (depois)
    console.log('\n4. Lendo preço DEPOIS do update no Firebird...');
    const after = await readFromFirebird();
    console.log('   DEPOIS:', JSON.stringify(after));
    
    // 5. Comparar
    console.log('\n=== RESULTADO ===');
    if (after && before) {
        const changed = after.PROD_PRVENDA !== before.PROD_PRVENDA || after.PROD_PRPROMOCAO !== before.PROD_PRPROMOCAO;
        if (changed) {
            console.log('✅ PREÇO FOI ATUALIZADO NO FIREBIRD!');
            console.log(`   PROD_PRVENDA: ${before.PROD_PRVENDA} -> ${after.PROD_PRVENDA}`);
            console.log(`   PROD_PRPROMOCAO: ${before.PROD_PRPROMOCAO} -> ${after.PROD_PRPROMOCAO}`);
        } else {
            console.log('❌ PREÇO NÃO MUDOU NO FIREBIRD - COMMIT NÃO FUNCIONOU!');
            console.log(`   PROD_PRVENDA: ${before.PROD_PRVENDA} (sem mudança)`);
            console.log(`   PROD_PRPROMOCAO: ${before.PROD_PRPROMOCAO} (sem mudança)`);
        }
    }
    
    // 6. Restaurar preço original
    console.log('\n5. Restaurando preço original...');
    if (before) {
        await fetch('http://192.168.1.70:8085/api/price-manager/update-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: [{ id: PRODUCT_ID, price: before.PROD_PRVENDA }] })
        });
        console.log('   Preço restaurado.');
    }
}

function readFromFirebird() {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        conn.on('ready', () => {
            const cmd = `cd /home/ed/projects/BelaFarma && sudo docker-compose exec -T backend node -e "
const fb = require('node-firebird');
const opts = { host: '192.168.1.10', port: 3050, database: 'C:\\\\\\\\Digifarma\\\\\\\\Dados\\\\\\\\digifarma6.fdb', user: 'SYSDBA', password: 'masterkey' };
fb.attach(opts, function(err, db) {
    if (err) { console.error(JSON.stringify({error: err.message})); process.exit(1); }
    db.query('SELECT PRODUTO_ID, PROD_PRVENDA, PROD_PRPROMOCAO FROM PRODUTOS WHERE PRODUTO_ID = ${PRODUCT_ID}', [], function(err, rows) {
        if (err) { console.error(JSON.stringify({error: err.message})); db.detach(); process.exit(1); }
        console.log(JSON.stringify(rows[0]));
        db.detach();
    });
});
"`;
            conn.exec(cmd, (err, stream) => {
                if (err) { conn.end(); return reject(err); }
                let output = '';
                stream.on('data', (data) => { output += data.toString(); });
                stream.stderr.on('data', (data) => { /* ignore stderr */ });
                stream.on('close', () => {
                    conn.end();
                    try {
                        const parsed = JSON.parse(output.trim());
                        resolve(parsed);
                    } catch(e) {
                        console.error('Parse error, raw output:', output);
                        resolve(null);
                    }
                });
            });
        }).on('error', reject).connect({
            host: '192.168.1.70', port: 22, username: 'ed', password: '2494'
        });
    });
}

main().catch(console.error);
