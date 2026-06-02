const Database = require('better-sqlite3');
const db = new Database('f:\\Documentos\\Desenvolvimento\\BelaFarma\\backend\\database.db');

try {
  const result = db.prepare('DELETE FROM crediario_records').run();
  console.log('Crediários antigos apagados:', result.changes);
} catch (error) {
  console.error('Error clearing crediario records:', error);
}
