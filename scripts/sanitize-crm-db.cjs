/**
 * sanitize-crm-db.cjs
 * Script para higienizar o banco de dados SQLite (local ou VPS),
 * corrigindo formatos de telefones incorretos, removendo LIDs de poluição
 * e mesclando registros duplicados de forma inteligente.
 * 
 * Uso:
 *   node scripts/sanitize-crm-db.cjs
 */

let Database;
try {
  Database = require('better-sqlite3');
} catch (err) {
  try {
    Database = require('../backend/node_modules/better-sqlite3');
  } catch (err2) {
    try {
      Database = require('./backend/node_modules/better-sqlite3');
    } catch (err3) {
      console.error('❌ Não foi possível carregar o módulo better-sqlite3.');
      process.exit(1);
    }
  }
}
const path = require('path');
const fs = require('fs');

// Helpers de formatação e limpeza
function formatToUserPhone(phone) {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  
  // Ignorar LIDs e números inválidos
  if (clean.length > 13 || clean.length < 10) return '';
  
  // Remover DDI brasileiro (55)
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    clean = clean.slice(2);
  }
  
  // prepend 0 se DDD + Numero
  if (clean.length === 10 || clean.length === 11) {
    if (!clean.startsWith('0')) {
      clean = '0' + clean;
    }
  } else {
    return '';
  }
  
  return clean;
}

function isGenericName(name) {
  if (!name) return true;
  const lower = name.toLowerCase().trim();
  return lower === 'contato whatsapp' || lower === 'cliente whatsapp' || lower === 'whatsapp' || lower === 'contato' || lower === 'contato whatsapp crm';
}

// Descobrir caminho do banco SQLite
let dbPath = process.env.DB_PATH;
if (!dbPath) {
  const localDataDir = path.join(__dirname, '..', 'data');
  if (fs.existsSync(localDataDir)) {
    dbPath = path.join(localDataDir, 'belafarma.db');
  } else {
    dbPath = path.join(__dirname, '..', 'backend', 'belafarma.db');
    if (!fs.existsSync(dbPath)) {
      dbPath = path.join(__dirname, '..', 'belafarma.db');
    }
  }
}

console.log('==================================================');
console.log('   🔍 HIGIENIZAÇÃO DE BANCO DE DADOS CRM WHATSAPP');
console.log('==================================================');
console.log(`📂 Arquivo do Banco de Dados: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
  console.error('❌ Erro: O arquivo do banco de dados não foi encontrado.');
  process.exit(1);
}

const db = new Database(dbPath);

db.transaction(() => {
  console.log('\n🧹 1. Removendo LIDs gigantes e contatos de poluição...');
  
  // Encontrar telefones inválidos/LIDs
  const polutionCustomers = db.prepare(`
    SELECT id, name, phone FROM customers 
    WHERE source = 'WhatsApp' AND (length(phone) > 13 OR phone LIKE '%@lid')
  `).all();
  
  let deletedCustomersCount = 0;
  let deletedHistoryCount = 0;
  
  for (const cust of polutionCustomers) {
    // Excluir histórico de produtos
    const delHistory = db.prepare('DELETE FROM whatsapp_product_history WHERE phone = ? OR customer_id = ?').run(cust.phone, cust.id);
    deletedHistoryCount += delHistory.changes;
    
    // Excluir cliente
    const delCust = db.prepare('DELETE FROM customers WHERE id = ?').run(cust.id);
    deletedCustomersCount += delCust.changes;
    
    console.log(`   🗑️ Contato removido: ${cust.name} (Telefone: ${cust.phone})`);
  }
  
  console.log(`   ✅ Total de contatos de poluição removidos: ${deletedCustomersCount}`);
  console.log(`   ✅ Total de registros de histórico de produtos deletados: ${deletedHistoryCount}`);

  console.log('\n🔄 2. Corrigindo formatação de telefones e mesclando contatos duplicados...');
  
  const allCustomers = db.prepare("SELECT * FROM customers WHERE source = 'WhatsApp' OR whatsapp_name IS NOT NULL").all();
  
  let updatedCount = 0;
  let mergedCount = 0;
  
  for (const cust of allCustomers) {
    const formatted = formatToUserPhone(cust.phone);
    
    if (!formatted) {
      // Se não for possível formatar e for de WhatsApp, removemos por segurança ou pulamos
      if (cust.source === 'WhatsApp') {
        db.prepare('DELETE FROM whatsapp_product_history WHERE phone = ? OR customer_id = ?').run(cust.phone, cust.id);
        db.prepare('DELETE FROM customers WHERE id = ?').run(cust.id);
        deletedCustomersCount++;
        console.log(`   🗑️ Contato inválido removido no refino: ${cust.name} (${cust.phone})`);
      }
      continue;
    }
    
    // Se o telefone já estiver no formato correto, pulamos
    if (cust.phone === formatted) {
      continue;
    }
    
    // Verificar se já existe OUTRO cliente cadastrado com o telefone formatado correto
    const existingCorrect = db.prepare('SELECT * FROM customers WHERE phone = ? AND id != ?').get(formatted, cust.id);
    
    if (existingCorrect) {
      console.log(`   🔀 Mesclando duplicados para: ${cust.name || existingCorrect.name} (${formatted})`);
      
      // Mesclar histórico de produtos: apontar todos os históricos do contato incorreto para o contato correto
      const updateHistoryId = db.prepare('UPDATE whatsapp_product_history SET customer_id = ?, phone = ? WHERE customer_id = ? OR phone = ?')
        .run(existingCorrect.id, formatted, cust.id, cust.phone);
      
      // Atualizar o nome do cliente correto se o nome atual for genérico e o incorreto for real/melhor
      if (isGenericName(existingCorrect.name) && !isGenericName(cust.name)) {
        db.prepare('UPDATE customers SET name = ?, whatsapp_name = ?, updatedAt = datetime(\'now\') WHERE id = ?')
          .run(cust.name, cust.name, existingCorrect.id);
      }
      
      // Deletar o cliente duplicado com telefone incorreto
      db.prepare('DELETE FROM customers WHERE id = ?').run(cust.id);
      
      mergedCount++;
    } else {
      // Se não houver duplicidade, apenas atualiza o telefone do cliente e seu histórico
      console.log(`   📝 Corrigindo telefone: ${cust.name} (${cust.phone} -> ${formatted})`);
      
      // Atualizar telefone do cliente
      db.prepare('UPDATE customers SET phone = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(formatted, cust.id);
      
      // Atualizar telefone no histórico de produtos
      db.prepare('UPDATE whatsapp_product_history SET phone = ? WHERE customer_id = ? OR phone = ?')
        .run(formatted, cust.id, cust.phone);
        
      updatedCount++;
    }
  }
  
  console.log(`\n📊 RESUMO DA OPERAÇÃO:`);
  console.log(`   - Contatos limpos/removidos (LIDs/Inválidos): ${deletedCustomersCount}`);
  console.log(`   - Telefones de clientes corrigidos: ${updatedCount}`);
  console.log(`   - Contatos duplicados mesclados: ${mergedCount}`);
  console.log('==================================================');
  console.log('✨ BANCO DE DADOS HIGIENIZADO COM SUCESSO!');
})();

db.close();
