const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sqlite = require('better-sqlite3');
const crypto = require('crypto');
const { listarCrediarioAtivo } = require('./services/crediario.service');

const config = require('./config.js');
const dbPath = config.dbPath;
const db = sqlite(dbPath);

async function syncCrediario() {
  try {
    console.log('Iniciando sincronização de Crediário do Digifarma...');

    console.log('1. Buscando dados do Digifarma...');
    const crediarios = await listarCrediarioAtivo();
    console.log(`Encontrados ${crediarios.length} crediários em aberto.`);

    console.log('2. Apagando dados de dívidas locais (customer_debts)...');
    // Só apagamos customer_debts. Não apagamos customers pois isso quebraria outras chaves (como CRM, history, etc)
    db.prepare('DELETE FROM customer_debts').run();

    let newCustomersCount = 0;
    let newDebtsCount = 0;

    const insertCustomer = db.prepare(`
      INSERT INTO customers (id, name, phone, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertDebt = db.prepare(`
      INSERT INTO customer_debts (id, customerId, purchaseDate, description, totalValue, status, userName)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const cred of crediarios) {
        if (!cred.clientId) continue; // Pula se não tiver cliente

        let customerId = String(cred.clientId);

        // Verifica se cliente existe
        const existingCustomer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
        
        if (!existingCustomer) {
          insertCustomer.run(
            customerId, 
            cred.clientName || 'Desconhecido', 
            cred.phone || '', 
            new Date().toISOString(), 
            new Date().toISOString()
          );
          newCustomersCount++;
        }

        // Insere a dívida no sistema
        const debtId = String(cred.id || crypto.randomUUID());
        const description = `Importado do Digifarma - Venda #${cred.saleId || 'Desconhecida'} (Venc. ${cred.dueDate ? new Date(cred.dueDate).toLocaleDateString('pt-BR') : 'N/D'})`;
        
        insertDebt.run(
          debtId,
          customerId,
          new Date().toISOString(), // Usando data atual para criação, já que o digifarma não enviou a data de compra
          description,
          cred.balance, // Valor a pagar (saldo)
          'Pendente',
          'SISTEMA (Sincronização)'
        );
        newDebtsCount++;
      }
    })();

    console.log(`Sincronização concluída com sucesso!`);
    console.log(`- Clientes Novos Inseridos: ${newCustomersCount}`);
    console.log(`- Títulos (Dívidas) Inseridos: ${newDebtsCount}`);

  } catch (error) {
    console.error('Erro na sincronização:', error);
  }
}

syncCrediario().then(() => process.exit(0));
