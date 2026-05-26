const Database = require('better-sqlite3');
const path = require('path');
const config = require('./config.js');

const db = new Database(config.dbPath);

console.log('--- 5 TAREFAS DE FRAUDE/RECUSA PIX MAIS RECENTES ---');
try {
  const tasks = db.prepare(`
    SELECT title, description, creationDate 
    FROM tasks 
    WHERE title LIKE '%ALERTA DE FRAUDE%' 
    ORDER BY creationDate DESC 
    LIMIT 5
  `).all();
  
  if (tasks.length === 0) {
    console.log('Nenhuma recusa/alerta de fraude registrado no banco de tarefas.');
  } else {
    tasks.forEach((t, i) => {
      console.log(`\n[${i+1}] Data: ${t.creationDate}`);
      console.log(`Título: ${t.title}`);
      console.log(`Descrição:\n${t.description}`);
    });
  }
} catch (err) {
  console.error('Erro ao ler tarefas:', err.message);
}

console.log('\n--- 10 ÚLTIMOS PIX CONFIRMADOS ---');
try {
  const pix = db.prepare(`
    SELECT phone, value, senderName, pixDate, status, aiAnalysis, createdAt 
    FROM pix_confirmations 
    ORDER BY createdAt DESC 
    LIMIT 10
  `).all();
  
  if (pix.length === 0) {
    console.log('Nenhum PIX confirmado no banco.');
  } else {
    pix.forEach((p, i) => {
      console.log(`[${i+1}] ${p.createdAt} | De: ${p.phone} | R$ ${p.value} | Remetente: ${p.senderName} | Data Pix: ${p.pixDate} | Status: ${p.status} | IA: ${p.aiAnalysis}`);
    });
  }
} catch (err) {
  console.error('Erro ao ler confirmações de PIX:', err.message);
}

db.close();
