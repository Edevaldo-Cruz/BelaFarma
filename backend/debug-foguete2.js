const Database = require('better-sqlite3');
const fs = require('fs');
const db = new Database('./belafarma.db');

let output = '';

output += '\n=== VERIFICANDO PEDIDOS RECENTES ===\n\n';

// 1. Pedidos recentes
const pedidos = db.prepare(`
  SELECT * FROM orders 
  ORDER BY orderDate DESC 
  LIMIT 3
`).all();

output += `Total de pedidos encontrados: ${pedidos.length}\n\n`;
pedidos.forEach((p, i) => {
  output += `PEDIDO ${i + 1}:\n`;
  output += JSON.stringify(p, null, 2) + '\n\n';
});

output += '\n=== VERIFICANDO NOTAS FISCAIS FOGUETE AMARELO ===\n\n';

// 2. Notas fiscais do Foguete Amarelo
const notasFoguete = db.prepare(`
  SELECT * FROM invoices 
  WHERE is_foguete_amarelo = 1
  ORDER BY issue_date DESC
`).all();

output += `Total de notas Foguete Amarelo: ${notasFoguete.length}\n\n`;
notasFoguete.forEach((n, i) => {
  output += `NOTA ${i + 1}:\n`;
  output += JSON.stringify(n, null, 2) + '\n\n';
});

output += '\n=== VERIFICANDO TÍTULOS EM CONTAS A PAGAR ===\n\n';

// 3. Títulos Foguete Amarelo em accounts_payable
const titulosFoguete = db.prepare(`
  SELECT * FROM accounts_payable 
  WHERE is_foguete_amarelo = 1
  ORDER BY created_at DESC
`).all();

output += `Total de títulos Foguete Amarelo: ${titulosFoguete.length}\n\n`;
titulosFoguete.forEach((t, i) => {
  output += `TÍTULO ${i + 1}:\n`;
  output += JSON.stringify(t, null, 2) + '\n\n';
});

fs.writeFileSync('debug-output.txt', output, 'utf8');
console.log('✅ Resultado salvo em debug-output.txt');

db.close();
