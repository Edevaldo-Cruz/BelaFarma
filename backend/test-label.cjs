const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'backend', 'belafarma.db');
const db = new Database(dbPath);

const LabelBotService = require('../backend/services/label-bot.service.js');
const service = new LabelBotService(db);

async function test() {
  const query = "Antitranspirante Aerossol My Health Mood Impact Men 150ml";
  console.log("Testando lookupProductInStock para:", query);
  
  const result = await service.lookupProductInStock(query, null);
  console.log("Resultado final:", result);
}

test().catch(console.error);
