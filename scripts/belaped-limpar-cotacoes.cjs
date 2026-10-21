#!/usr/bin/env node
const path = require('path');
const dbPath = path.join(__dirname, '../data/belafarma.db');
const db = require('../backend/node_modules/better-sqlite3')(dbPath);

console.log('\n=========================================');
console.log('🧹 BELAPED: LIMPEZA DE COTAÇÕES NO BANCO');
console.log('=========================================\n');

try {
  const antes = db.prepare('SELECT count(*) as c FROM belaped_cotacoes_reais').get();
  console.log(`Cotações registradas atualmente: ${antes.c}`);

  db.prepare("DELETE FROM belaped_cotacoes_reais WHERE updated_at >= datetime('now', '-24 hours')").run();

  const depois = db.prepare('SELECT count(*) as c FROM belaped_cotacoes_reais').get();
  console.log(`Cotações restantes no banco: ${depois.c}`);
  console.log(`✅ Cotações das últimas 24h expurgadas! A fila voltará a ter 100% dos produtos como 'Aguardando Robô'.`);
} catch (e) {
  console.error('❌ Erro ao limpar cotações:', e.message);
}
