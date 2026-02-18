const Database = require('better-sqlite3');
const db = new Database('./belafarma.db');

console.log('\n=== VERIFICANDO PEDIDOS RECENTES ===\n');

// 1. Pedidos recentes
const pedidos = db.prepare(`
  SELECT 
    id, 
    orderDate, 
    distributor, 
    totalValue, 
    status, 
    invoiceNumber,
    paymentMonth,
    receiptDate
  FROM orders 
  ORDER BY orderDate DESC 
  LIMIT 5
`).all();

console.log('Últimos 5 pedidos:');
pedidos.forEach(p => {
  console.log(`- ${p.orderDate} | ${p.distributor} | R$ ${p.totalValue} | Status: ${p.status} | NF: ${p.invoiceNumber || 'N/A'}`);
});

console.log('\n=== VERIFICANDO NOTAS FISCAIS FOGUETE AMARELO ===\n');

// 2. Notas fiscais do Foguete Amarelo
const notasFoguete = db.prepare(`
  SELECT 
    id,
    invoice_number,
    supplier_name,
    issue_date,
    total_value,
    payment_due_date,
    status
  FROM invoices 
  WHERE is_foguete_amarelo = 1
  ORDER BY issue_date DESC
  LIMIT 5
`).all();

console.log(`Total de notas Foguete Amarelo: ${notasFoguete.length}`);
notasFoguete.forEach(n => {
  console.log(`- NF ${n.invoice_number} | ${n.supplier_name} | R$ ${n.total_value} | Venc: ${n.payment_due_date} | Status: ${n.status}`);
});

console.log('\n=== VERIFICANDO TÍTULOS EM CONTAS A PAGAR ===\n');

// 3. Títulos Foguete Amarelo em accounts_payable
const titulosFoguete = db.prepare(`
  SELECT 
    id,
    supplier_name,
    description,
    due_date,
    original_value,
    remaining_value,
    status
  FROM accounts_payable 
  WHERE is_foguete_amarelo = 1
  ORDER BY created_at DESC
  LIMIT 5
`).all();

console.log(`Total de títulos Foguete Amarelo: ${titulosFoguete.length}`);
titulosFoguete.forEach(t => {
  console.log(`- ${t.description} | ${t.supplier_name} | Original: R$ ${t.original_value} | Restante: R$ ${t.remaining_value} | Venc: ${t.due_date} | Status: ${t.status}`);
});

console.log('\n=== VERIFICANDO TÍTULOS COM VENCIMENTO EM JUNHO/2026 ===\n');

// 4. Títulos com vencimento em junho de 2026
const titulosJunho = db.prepare(`
  SELECT 
    id,
    supplier_name,
    description,
    due_date,
    original_value,
    remaining_value,
    status,
    is_foguete_amarelo
  FROM accounts_payable 
  WHERE due_date LIKE '2026-06%'
  ORDER BY due_date
`).all();

console.log(`Total de títulos em junho/2026: ${titulosJunho.length}`);
titulosJunho.forEach(t => {
  const tipo = t.is_foguete_amarelo ? '[FOGUETE]' : '[NORMAL]';
  console.log(`${tipo} ${t.description} | ${t.supplier_name} | R$ ${t.remaining_value} | Venc: ${t.due_date}`);
});

db.close();
