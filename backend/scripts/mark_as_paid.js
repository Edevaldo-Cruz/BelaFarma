const Database = require('better-sqlite3');
const path = require('path');

// Caminho do banco de dados (pode precisar ajustar caso rode dentro do Docker no Raspberry)
const dbPath = path.join(__dirname, '..', 'belafarma.db');
const db = new Database(dbPath);

// Define a data limite como ontem
const today = new Date();
today.setDate(today.getDate() - 1);
const limitDateStr = today.toISOString().split('T')[0]; // Formato YYYY-MM-DD

console.log(`\n=== INICIANDO BAIXA AUTOMÁTICA ATÉ ${limitDateStr} ===\n`);

try {
  // 1. Atualizar boletos
  const boletosPendente = db.prepare(`SELECT COUNT(*) as count FROM boletos WHERE status = 'Pendente' AND due_date <= ?`).get(limitDateStr);
  
  if (boletosPendente.count > 0) {
    const infoBoletos = db.prepare(`UPDATE boletos SET status = 'Pago' WHERE status = 'Pendente' AND due_date <= ?`).run(limitDateStr);
    console.log(`✅ Foram baixados ${infoBoletos.changes} boletos que estavam vencendo até ontem.`);
  } else {
    console.log(`ℹ️ Nenhum boleto pendente encontrado até ${limitDateStr}.`);
  }

  // 2. Atualizar contas a pagar (accounts_payable)
  const contasPendente = db.prepare(`SELECT COUNT(*) as count FROM accounts_payable WHERE status = 'Pendente' AND due_date <= ?`).get(limitDateStr);

  if (contasPendente.count > 0) {
    // Usamos paid_at com a data atual para registrar quando foi dada a baixa
    const infoContas = db.prepare(`UPDATE accounts_payable SET status = 'Pago', paid_at = ?, remaining_value = 0 WHERE status = 'Pendente' AND due_date <= ?`).run(new Date().toISOString(), limitDateStr);
    console.log(`✅ Foram baixadas ${infoContas.changes} contas a pagar que estavam vencendo até ontem.`);
  } else {
    console.log(`ℹ️ Nenhuma conta a pagar pendente encontrada até ${limitDateStr}.`);
  }

  console.log(`\n🎉 Processo concluído com sucesso!`);
} catch (error) {
  console.error(`❌ Erro ao atualizar o banco de dados:`, error.message);
}
