const firebird = require('node-firebird');

const options = {
    host: '192.168.1.7',
    port: 3050,
    database: 'C:\\Digifarma\\Dados\\digifarma6.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

firebird.attach(options, function(err, db) {
    if (err) throw err;
    
    console.log('--- AMOSTRA DE PRODUTOS E ESTOQUE ---');
    // We assume DESCRICAO or NOME exists, and ESTOQUE or QTD_ESTOQUE
    db.query('SELECT FIRST 5 * FROM PRODUTOS WHERE ESTOQUE > 0', function(err, result) {
        if (err) {
            console.error('Erro ao ler PRODUTOS:', err.message);
        } else {
            result.forEach(row => {
                // Just print the keys to see the structure if we don't know it
                const keys = Object.keys(row);
                // Try to find description and stock
                const descKey = keys.find(k => k.includes('DESC') || k.includes('NOME') || k.includes('PROD'));
                const stockKey = keys.find(k => k.includes('ESTOQUE') || k.includes('QTD'));
                const priceKey = keys.find(k => k.includes('PRECO') || k.includes('VALOR'));
                console.log(`Produto: ${row[descKey]} | Estoque: ${row[stockKey]} | Preço: R$ ${row[priceKey]}`);
            });
        }
        
        console.log('\n--- ÚLTIMAS 3 VENDAS ---');
        db.query('SELECT FIRST 3 * FROM CAB_VENDAS ORDER BY 1 DESC', function(err, vendas) {
            if (err) {
                console.error('Erro ao ler CAB_VENDAS:', err.message);
            } else {
                vendas.forEach(v => {
                    const keys = Object.keys(v);
                    const dataKey = keys.find(k => k.includes('DATA'));
                    const valorKey = keys.find(k => k.includes('VALOR') || k.includes('TOTAL') || k.includes('LIQ'));
                    const clienteKey = keys.find(k => k.includes('CLIENTE') || k.includes('NOME'));
                    console.log(`Data: ${v[dataKey]} | Valor: R$ ${v[valorKey]} | Cliente ID: ${v[clienteKey] || 'Balcão'}`);
                });
            }
            db.detach();
        });
    });
});
