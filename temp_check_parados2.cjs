const fs = require('fs');
const config = require('./backend/config.js');
const Database = require('./backend/node_modules/better-sqlite3');

const db = new Database(config.dbPath);

console.log('=== ESQUEMA DE MURAL_PRODUTOS_PARADOS ===');
console.log(db.prepare("PRAGMA table_info(mural_produtos_parados)").all().map(c => c.name).join(', '));

const parados = db.prepare("SELECT count(*) as total, sum(valor_custo_total) as somaCusto, sum(valor_venda_total) as somaVenda FROM mural_produtos_parados").get();
console.log('Mural produtos parados tabela:', parados);

const paradosPorStatus = db.prepare("SELECT status, count(*) as qtd, sum(valor_custo_total) as custo FROM mural_produtos_parados GROUP BY status").all();
console.log('Mural parados por status:', paradosPorStatus);

console.log('\n=== ESQUEMA DE LIQUIDACAO_CAMPANHAS ===');
console.log(db.prepare("PRAGMA table_info(liquidacao_campanhas)").all().map(c => c.name).join(', '));
const camps = db.prepare("SELECT * FROM liquidacao_campanhas").all();
console.log('Campanhas:', camps);

console.log('\n=== ESQUEMA DE LIQUIDACAO_CAMPANHAS_ITENS ===');
console.log(db.prepare("PRAGMA table_info(liquidacao_campanhas_itens)").all().map(c => c.name).join(', '));
const itensLiq = db.prepare("SELECT status, count(*) as count, sum(valor_desconto) as descTotal FROM liquidacao_campanhas_itens GROUP BY status").all();
console.log('Itens campanha:', itensLiq);

console.log('\n=== RECEBIMENTOS DIGITAIS E ANTECIPAÇÃO ===');
// Verificar se maquininha antecipa crédito (recebimento em D+1)
const receivables = db.prepare("SELECT count(*) as count, min(due_date) as minDate, max(due_date) as maxDate FROM card_machine_receivables").get();
console.log('Card machine receivables:', receivables);

fs.unlinkSync('temp_check_parados2.cjs');
