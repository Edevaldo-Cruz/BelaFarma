const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'belafarma.db');
const db = new Database(dbPath);

console.log('--- BUSCANDO MENSAGENS RECENTES NO SQLITE ---');

try {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM whatsapp_messages').get();
  console.log(`Total de mensagens salvas: ${count.cnt}`);
  
  if (count.cnt > 0) {
    console.log('\nMensagens salvas nas últimas 2 horas:');
    const agora = Date.now();
    const duasHorasAtras = agora - (2 * 60 * 60 * 1000);
    
    const msgs = db.prepare('SELECT * FROM whatsapp_messages WHERE timestamp > ? ORDER BY timestamp DESC').all(duasHorasAtras);
    console.log(JSON.stringify(msgs, null, 2));
    
    console.log('\nÚltimas 5 mensagens gerais:');
    const ultimas = db.prepare('SELECT * FROM whatsapp_messages ORDER BY timestamp DESC LIMIT 5').all();
    console.log(JSON.stringify(ultimas, null, 2));
  } else {
    console.log('Nenhuma mensagem na tabela.');
  }
} catch (err) {
  console.error('Erro ao ler mensagens:', err.message);
}

db.close();
