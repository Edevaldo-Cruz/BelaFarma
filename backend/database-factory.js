/**
 * Database Factory
 * 
 * Seleciona o adapter de banco de dados correto baseado em variáveis de ambiente.
 * - Desenvolvimento: SQLite (padrão)
 * - Produção: MongoDB Atlas (quando USE_MONGODB=true)
 */

const USE_MONGODB = process.env.USE_MONGODB === 'true';

let db;

if (USE_MONGODB) {
  console.log('🌐 [Database] Using MongoDB Atlas (Production Mode)');
  db = require('./mongodb-adapter');
} else {
  console.log('💾 [Database] Using SQLite (Development Mode)');
  db = require('./database');
}

module.exports = db;
