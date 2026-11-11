/**
 * backend/scripts/migrar-crediario-v2.js
 *
 * Script de Migração do Fichário Legado para o Crediário 2.0 (BelaFarma)
 * - Migra os 22 clientes da base do Digifarma
 * - Unifica os 316 títulos pendentes
 * - Atribui limite de crédito proporcional/flexível
 * - Gera a primeira fatura consolidada com vencimento no dia 20/11
 * - Isenção total de taxas e encargos ajustados (Multa 2% + Juros 2,9% a.m.)
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const config = require('../config.js');

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 30000');

function generateCardNumber() {
  const p1 = '5489';
  const p2 = Math.floor(1000 + Math.random() * 9000);
  const p3 = Math.floor(1000 + Math.random() * 9000);
  const p4 = Math.floor(1000 + Math.random() * 9000);
  return `${p1} ${p2} ${p3} ${p4}`;
}

function sanitizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

async function migrarCrediarioParaV2() {
  console.log('🚀 Iniciando Migração do Crediário para o Crediário 2.0...');

  // 1. Buscar títulos do cache do Digifarma
  const rows = db.prepare(`
    SELECT 
      id,
      cliente_id as clientId,
      cliente_nome as clientName,
      telefone as phone,
      valor as amount,
      data_compra as purchaseDate,
      data_vencimento as dueDate,
      venda_nota_id as saleId
    FROM digifarma_crediario_cache
    ORDER BY cliente_id, data_vencimento ASC
  `).all();

  if (!rows || rows.length === 0) {
    console.warn('⚠️ Nenhum título encontrado em digifarma_crediario_cache!');
    return;
  }

  console.log(`📦 Carregados ${rows.length} títulos de crediário.`);

  // 2. Agrupar por cliente
  const clientGroups = new Map();
  for (const r of rows) {
    const cid = String(r.clientId);
    if (!clientGroups.has(cid)) {
      clientGroups.set(cid, {
        clientId: cid,
        clientName: (r.clientName || 'Desconhecido').trim().toUpperCase(),
        phone: sanitizePhone(r.phone),
        items: [],
        totalDivida: 0.0
      });
    }
    const group = clientGroups.get(cid);
    const valor = Number(r.amount || 0);
    group.items.push(r);
    group.totalDivida = Number((group.totalDivida + valor).toFixed(2));
  }

  console.log(`👥 Total de clientes identificados para migração: ${clientGroups.size}`);

  const insertCard = db.prepare(`
    INSERT INTO belafarma_cards (
      customer_id, customer_name, phone, cpf, card_number,
      credit_limit, used_limit, due_day, closing_offset_days, status,
      active_fee_amount, late_fine_percent, late_interest_monthly_percent,
      notes, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, 10, 'active',
      0.0, 2.0, 2.9,
      ?, datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `);

  const updateCard = db.prepare(`
    UPDATE belafarma_cards
    SET credit_limit = ?, used_limit = ?, status = 'active',
        active_fee_amount = 0.0, late_fine_percent = 2.0, late_interest_monthly_percent = 2.9,
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `);

  const insertInvoice = db.prepare(`
    INSERT INTO card_invoices (
      id, card_id, customer_id, reference_month, closing_date, due_date,
      purchases_total, fee_active_invoice, late_interest, late_fine,
      total_due, paid_amount, status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, 0.0, 0.0, 0.0,
      ?, 0.0, 'closed', datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `);

  const insertInvoiceItem = db.prepare(`
    INSERT INTO card_invoice_items (
      invoice_id, card_id, sale_id, description, amount, payment_method, purchased_at
    ) VALUES (
      ?, ?, ?, ?, ?, 'MIGRACAO_DIGIFARMA', ?
    )
  `);

  let migrados = 0;
  let faturasCriadas = 0;
  let itensCriados = 0;

  const migracaoTx = db.transaction(() => {
    for (const [cid, group] of clientGroups.entries()) {
      // Checar se cliente já existe em customers
      let cust = db.prepare('SELECT id, name, phone, cpf FROM customers WHERE id = ? OR name = ?').get(cid, group.clientName);
      if (!cust) {
        db.prepare(`
          INSERT INTO customers (id, name, phone, createdAt, updatedAt)
          VALUES (?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `).run(cid, group.clientName, group.phone || null);
      }

      // Definir limite proporcional:
      // Se dívida > 300, concede margem adicional mínima arredondada para cima
      // Se dívida <= 300, limite base de R$ 300,00
      let creditLimit = 300.0;
      if (group.totalDivida > 300.0) {
        creditLimit = Math.ceil((group.totalDivida * 1.05) / 50) * 50;
      }
      const usedLimit = group.totalDivida;

      // Checar se já tem cartão criado
      let card = db.prepare('SELECT * FROM belafarma_cards WHERE customer_id = ? OR customer_name = ?').get(cid, group.clientName);
      let cardId;

      const clientPhone = group.phone || cust?.phone || '';

      if (!card) {
        const cardNumber = generateCardNumber();
        const note = `Migrado do Fichário Digifarma (${group.items.length} títulos)`;
        const res = insertCard.run(
          cid,
          group.clientName,
          clientPhone,
          cust?.cpf || null,
          cardNumber,
          creditLimit,
          usedLimit,
          20, // Vencimento padrão dia 20 (ajustável para dia 10)
          note
        );
        cardId = res.lastInsertRowid;
      } else {
        cardId = card.id;
        updateCard.run(creditLimit, usedLimit, cardId);
      }

      // Criar a primeira fatura consolidada (se ainda não existir para este mês)
      const invoiceId = `inv_migracao_${cardId}_202611`;
      const existingInvoice = db.prepare('SELECT id FROM card_invoices WHERE id = ?').get(invoiceId);

      if (!existingInvoice) {
        insertInvoice.run(
          invoiceId,
          cardId,
          cid,
          '2026-11',
          '2026-11-10', // Data de fechamento
          '2026-11-20', // Data de vencimento
          group.totalDivida,
          group.totalDivida
        );
        faturasCriadas++;

        // Inserir itens da fatura
        for (const item of group.items) {
          const desc = `Venda #${item.saleId || item.id} (Original Digifarma)`;
          const purchasedAt = item.purchaseDate ? new Date(item.purchaseDate).toISOString().split('T')[0] : '2026-11-01';
          insertInvoiceItem.run(
            invoiceId,
            cardId,
            String(item.saleId || item.id),
            desc,
            Number(item.amount || 0),
            purchasedAt
          );
          itensCriados++;
        }
      }

      migrados++;
    }
  });

  migracaoTx();

  console.log(`\n✅ Migração Concluída com Sucesso!`);
  console.log(`- Clientes com Contas Crediário 2.0 ativadas: ${migrados}`);
  console.log(`- Faturas Consolidadas criadas: ${faturasCriadas}`);
  console.log(`- Itens de fatura importados: ${itensCriados}`);
}

migrarCrediarioParaV2().catch(err => {
  console.error('❌ Erro durante a migração:', err);
  process.exit(1);
});
