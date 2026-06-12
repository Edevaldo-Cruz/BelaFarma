const Database = require('better-sqlite3');
const path = require('path');

const dbPath = 'f:\\Documentos\\Desenvolvimento\\BelaFarma\\belafarma.db';
const db = new Database(dbPath);

console.log('--- 10 Últimas mensagens salvas no SQLite ---');
try {
  const messages = db.prepare(`
    SELECT id, phone, fromMe, messageText, timestamp 
    FROM whatsapp_messages 
    ORDER BY timestamp DESC 
    LIMIT 10
  `).all();

  messages.forEach(msg => {
    console.log(`ID: ${msg.id}`);
    console.log(`Phone: ${msg.phone}`);
    console.log(`FromMe: ${msg.fromMe}`);
    console.log(`Text: ${msg.messageText}`);
    console.log(`Date: ${new Date(msg.timestamp).toLocaleString('pt-BR')}`);
    console.log('-------------------------------------------');
  });
} catch (err) {
  console.error('Erro ao consultar banco:', err.message);
}
