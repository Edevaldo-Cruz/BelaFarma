import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../backend/belafarma.db');

console.log('--- Iniciando Recuperação de Dados ---');
console.log('Banco:', dbPath);

try {
    // Ao abrir o banco, o better-sqlite3 tenta automaticamente processar o WAL
    const db = new Database(dbPath, { verbose: console.log });
    
    // Forçar o checkpoint do WAL para o arquivo principal
    db.pragma('wal_checkpoint(FULL)');
    console.log('✅ Checkpoint concluído. Dados do WAL integrados ao .db');

    // Verificar se temos dados de hoje (ex: vendas ou logs)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tabelas encontradas:', tables.map(t => t.name).join(', '));

    // Exemplo: Buscar vendas de hoje
    // Ajuste o nome da tabela se for diferente (ex: orders, sales, etc)
    try {
        const hoje = new Date().toISOString().split('T')[0];
        const count = db.prepare("SELECT COUNT(*) as total FROM orders WHERE date LIKE ?").get(hoje + '%');
        console.log(`📊 Vendas encontradas hoje (${hoje}):`, count.total);
    } catch (e) {
        console.log('⚠️ Tabela "orders" não encontrada ou erro ao buscar vendas.');
    }

    db.close();
    
    // Verificar novo tamanho do arquivo
    const stats = fs.statSync(dbPath);
    console.log('Novo tamanho do belafarma.db:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

} catch (err) {
    console.error('❌ Erro durante a recuperação:', err.message);
}
