require('dotenv').config();
const db = require('./database.js'); // Uses the real DB
const LabelBotService = require('./services/label-bot.service.js');
const service = new LabelBotService(db);

async function test() {
  const extractedData = {
    name: "Antitranspirante Aerossol My Health Mood Impact Men 150ml",
    barcode: null,
    search_keywords: ["MOOD", "IMPACT", "MEN", "150ML", "AER", "DES"]
  };

  console.log("Testando lookupProductInStock com keywords:", extractedData.search_keywords);
  
  const result = await service.lookupProductInStock(extractedData.name, extractedData.barcode, extractedData.search_keywords);
  console.log("================================");
  if (result) {
    console.log("✅ RESULTADO ENCONTRADO:", result.name);
  } else {
    console.log("❌ NENHUM RESULTADO ENCONTRADO.");
  }
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
