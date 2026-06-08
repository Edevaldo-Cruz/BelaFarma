const db = require('better-sqlite3')('./data/belafarma.db');

console.log('=== Limpando dados fake na VPS ===');

// Deleta record fake
const del1 = db.prepare("DELETE FROM daily_records WHERE id LIKE 'test_crediario_%' OR id = '1780525510700'").run();
console.log(`Deletados ${del1.changes} daily records de teste`);

// Deleta debito fake
const del2 = db.prepare("DELETE FROM customer_debts WHERE description LIKE '%TESTE%' OR id = '1780525510654'").run();
console.log(`Deletadas ${del2.changes} dividas de teste`);

console.log('\n=== Capturando crediarios de hoje ===');
const todayStr = new Date().toISOString().split('T')[0];

const records = db.prepare("SELECT id, date, crediarioList, lancado FROM daily_records WHERE date LIKE ?").all(todayStr + '%');

if (records.length === 0) {
    console.log('Nenhum daily_record encontrado para hoje.');
} else {
    records.forEach(r => {
        const list = JSON.parse(r.crediarioList || '[]');
        console.log(`\nRecord ID: ${r.id} (Lançado: ${r.lancado})`);
        console.log(`Crediários cadastrados (${list.length}):`);
        console.log(JSON.stringify(list, null, 2));
    });
}
