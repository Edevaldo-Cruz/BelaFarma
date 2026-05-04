const Database = require('../backend/node_modules/better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../data/belafarma.db');

console.log('--- Iniciando Recuperação de Dados ---');
console.log('Banco:', dbPath);

try {
    if (!fs.existsSync(dbPath)) {
        throw new Error('Arquivo belafarma.db não encontrado!');
    }

    // Ao abrir o banco, o better-sqlite3 tenta automaticamente processar o WAL
    const db = new Database(dbPath);
    
    // Forçar o checkpoint do WAL para o arquivo principal
    db.pragma('wal_checkpoint(FULL)');
    console.log('✅ Checkpoint concluído. Dados do WAL integrados ao .db');

    // Verificar se temos dados de hoje (ex: vendas ou logs)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tabelas encontradas:', tables.length);

    // Exemplo: Buscar vendas de hoje
    try {
        const hoje = new Date().toISOString().split('T')[0];
        // Tentar encontrar uma tabela de pedidos
        const possibleTables = ['orders', 'sales', 'vendas', 'transactions'];
        let found = false;
        for (const table of possibleTables) {
            const tableExists = tables.some(t => t.name === table);
            if (tableExists) {
                const count = db.prepare(`SELECT COUNT(*) as total FROM ${table}`).get();
                console.log(`📊 Registros na tabela "${table}":`, count.total);
                found = true;
            }
        }
        if (!found) console.log('⚠️ Nenhuma tabela de vendas padrão encontrada.');
    } catch (e) {
        console.log('⚠️ Erro ao buscar registros:', e.message);
    }

    db.close();
    
    // Verificar novo tamanho do arquivo
    const stats = fs.statSync(dbPath);
    console.log('Novo tamanho do belafarma.db:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

} catch (err) {
    console.error('❌ Erro durante a recuperação:', err.message);
}
