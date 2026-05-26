const Database = require('better-sqlite3');
const path = require('path');
const config = require('./config.js');

const db = new Database(config.dbPath);

console.log('--- 15 MENSAGENS RECENTES SALVAS NO HISTÓRICO ---');
try {
  const messages = db.prepare(`
    SELECT phone, fromMe, messageText, timestamp 
    FROM whatsapp_messages 
    ORDER BY timestamp DESC 
    LIMIT 15
  `).all();
  
  if (messages.length === 0) {
    console.log('Nenhuma mensagem no histórico.');
  } else {
    messages.forEach((m, i) => {
      const date = new Date(m.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      console.log(`[${i+1}] ${date} | De: ${m.phone} | deMim: ${m.fromMe ? 'Sim' : 'Não'} | Msg: ${m.messageText}`);
    });
  }
} catch (err) {
  console.error('Erro ao ler mensagens:', err.message);
}

db.close();
