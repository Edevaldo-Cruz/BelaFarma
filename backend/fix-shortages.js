const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/belafarma.db'); // assuming standard path
const db = new Database(dbPath);

console.log('Iniciando correção de tipos na tabela shortages...');

const records = db.prepare(`SELECT id, productName FROM shortages WHERE type = 'Sistema'`).all();
console.log(`Encontrados ${records.length} registros com tipo "Sistema".`);

const updateStmt = db.prepare(`UPDATE shortages SET type = ? WHERE id = ?`);

let updated = 0;
for (const r of records) {
  let productType = 'Marca (Referência)';
  const nomeLower = (r.productName || '').toLowerCase();
  
  if (nomeLower.includes('generico') || nomeLower.includes('genérico')) {
    productType = 'Genérico';
  } else if (
    nomeLower.includes('shampoo') || 
    nomeLower.includes('condicionador') ||
    nomeLower.includes('sabonete') ||
    nomeLower.includes('desodorante') ||
    nomeLower.includes('fralda') ||
    nomeLower.includes('creme') ||
    nomeLower.includes('perfume') ||
    nomeLower.includes('absorvente') ||
    nomeLower.includes('escova') ||
    nomeLower.includes('pasta') ||
    nomeLower.includes('gillette') ||
    nomeLower.includes('prestobarba')
  ) {
    productType = 'Perfumaria';
  }

  updateStmt.run(productType, r.id);
  updated++;
}

console.log(`Correção finalizada. ${updated} registros atualizados.`);
db.close();
