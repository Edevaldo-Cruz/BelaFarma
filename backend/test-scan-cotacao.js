const Database = require('better-sqlite3');
const path = require('path');

// Carregar variáveis de ambiente do arquivo .env no diretório raiz
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { executarVarreduraWhatsApp } = require('./services/whatsapp-shortage.service.js');

const dbPath = path.join(__dirname, '..', 'data', 'belafarma.db');
const db = new Database(dbPath);

console.log('--- TESTANDO VARREDURA DE COTAÇÃO (DIPIRONA EM PÓ) ---');

const testPhone = '5532988634712'; // Nayane
const now = Date.now();

async function run() {
  try {
    // 1. Limpar mensagens anteriores desse número de teste
    db.prepare('DELETE FROM whatsapp_messages WHERE phone = ?').run(testPhone);
    db.prepare("DELETE FROM shortages WHERE productName = 'DIPIRONA EM PÓ A GRANEL'").run();

    // 2. Inserir o diálogo de cotação do print do usuário
    // Atendente: "boa noite Nayane, voce tem dipirona em pó a granel ??"
    // Cliente (Nayane): "nao tenho"
    db.prepare(`
      INSERT INTO whatsapp_messages (id, phone, fromMe, messageText, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run('msg_cotacao_1', testPhone, 1, 'boa noite Nayane, voce tem dipirona em pó a granel ??', now - 60000);

    db.prepare(`
      INSERT INTO whatsapp_messages (id, phone, fromMe, messageText, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run('msg_cotacao_2', testPhone, 0, 'nao tenho', now);

    console.log('✅ Diálogo de teste inserido com sucesso.');

    // 3. Cadastrar a Nayane na tabela customers para termos o nome correto no log
    db.prepare("DELETE FROM customers WHERE phone = ?").run(testPhone);
    db.prepare(`
      INSERT INTO customers (id, name, phone, source, createdAt, updatedAt)
      VALUES (?, ?, ?, 'WhatsApp', datetime('now'), datetime('now'))
    `).run('cust_nayane_test', 'Nayane Fornecedora', testPhone);
    console.log('✅ Cliente Nayane cadastrado na tabela customers.');

    // 4. Rodar a varredura direcionada para este telefone
    console.log('\n🔍 Iniciando varredura direcionada...');
    const result = await executarVarreduraWhatsApp(db, { phone: testPhone });

    console.log('\n📊 Estatísticas da varredura:', JSON.stringify(result.stats, null, 2));

    // 5. Verificar se o produto foi inserido na tabela shortages
    const shortages = db.prepare("SELECT * FROM shortages WHERE productName = 'DIPIRONA EM PÓ A GRANEL'").all();
    console.log('\n💊 Produtos em falta cadastrados no banco:', JSON.stringify(shortages, null, 2));

  } catch (err) {
    console.error('❌ Erro no teste:', err);
  } finally {
    db.close();
  }
}

run();
