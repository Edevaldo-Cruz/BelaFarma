/**
 * backend/crediario-card-endpoints.js
 *
 * Módulo de Endpoints do Crediário 2.0 / Cartão BelaFarma (Private Label) & Fidelidade NFC
 * Gerencia:
 * - Limites de crédito flexíveis e controle de saldo em tempo real
 * - Identificação rápida por Nome, Telefone, CPF ou Aproximação NFC no balcão
 * - Ciclo de faturamento (vencimentos 10 e 20 com fechamento 10 dias antes)
 * - Tolerância estendida de atraso (bloqueio automático de novas compras em D+5)
 * - Emissão de Boletos Híbridos pelo Banco Inter (com QR Code Pix, juros 2.9% a.m. e multa 2%)
 * - Baixa e liquidação de faturas (no balcão ou via conciliação)
 * - Régua de comunicação e envio de boletos/Pix via WhatsApp (Baileys)
 * - Cadastro rápido e alerta de CPF pendente
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const bancoInterService = require('./services/banco-inter.service');

function createCardEndpoints(db, whatsappService = null) {
  const router = express.Router();

  function sanitizePhone(phone) {
    if (!phone) return '';
    return String(phone).replace(/\D/g, '');
  }

  function formatCurrency(val) {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function generateCardNumber() {
    const p1 = '5489';
    const p2 = Math.floor(1000 + Math.random() * 9000);
    const p3 = Math.floor(1000 + Math.random() * 9000);
    const p4 = Math.floor(1000 + Math.random() * 9000);
    return `${p1} ${p2} ${p3} ${p4}`;
  }

  /**
   * 1. GET /api/cards/by-uid/:uid
   * Leitura rápida do leitor USB NFC no caixa.
   */
  router.get('/by-uid/:uid', (req, res) => {
    try {
      const uid = String(req.params.uid || '').trim().toUpperCase();
      if (!uid) {
        return res.status(400).json({ error: 'UID do cartão é obrigatório.' });
      }

      const card = db.prepare(`
        SELECT c.*, cust.name as customer_db_name, cust.address as customer_address, cust.neighborhood as customer_neighborhood
        FROM belafarma_cards c
        LEFT JOIN customers cust ON (c.customer_id = cust.id OR c.phone = cust.phone)
        WHERE UPPER(c.card_uid) = ?
      `).get(uid);

      if (!card) {
        return res.json({
          success: true,
          registered: false,
          card_uid: uid,
          message: 'Cartão/chaveiro virgem detectado no leitor.'
        });
      }

      // 1. Checagem de Faturas em Atraso (Tolerância estendida até D+5)
      const today = new Date().toISOString().split('T')[0];
      const overdueInvoice = db.prepare(`
        SELECT id, reference_month, due_date, total_due, paid_amount,
               CAST((julianday(?) - julianday(due_date)) AS INTEGER) as days_late
        FROM card_invoices
        WHERE card_id = ? AND status != 'paid' AND due_date < ?
        ORDER BY due_date ASC LIMIT 1
      `).get(today, card.id, today);

      const daysLate = overdueInvoice ? Math.max(0, overdueInvoice.days_late) : 0;
      const isBlockedLate = daysLate >= 5;

      // 2. Saldo de Cashback Disponível
      const cbRows = db.prepare(`
        SELECT SUM(balance_available) as total_cashback
        FROM nfc_loyalty_cashback
        WHERE phone = ? AND status = 'active' AND expires_at >= date('now', 'localtime')
      `).get(card.phone);
      const availableCashback = Number(cbRows?.total_cashback || 0);

      const availableCredit = Math.max(0, Number((card.credit_limit - card.used_limit).toFixed(2)));

      res.json({
        success: true,
        registered: true,
        card: {
          id: card.id,
          customer_name: card.customer_name,
          phone: card.phone,
          cpf: card.cpf,
          has_cpf: !!card.cpf,
          needs_cpf: !card.cpf,
          card_number: card.card_number,
          card_uid: card.card_uid,
          credit_limit: card.credit_limit,
          used_limit: card.used_limit,
          available_credit: availableCredit,
          due_day: card.due_day,
          status: card.status,
          active_fee_amount: card.active_fee_amount || 0.0,
          available_cashback: availableCashback,
          is_blocked_late: isBlockedLate,
          days_late: daysLate,
          overdue_invoice: overdueInvoice || null
        }
      });
    } catch (err) {
      console.error('[Crediário 2.0] Erro ao buscar por UID:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 2. GET /api/cards/search?q=...
   * Busca ágil no balcão por Nome, Telefone ou CPF.
   */
  router.get('/search', (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const today = new Date().toISOString().split('T')[0];

      let cards = [];
      if (!q) {
        cards = db.prepare(`
          SELECT id, customer_id, customer_name, phone, cpf, card_number, card_uid,
                 credit_limit, used_limit, status, due_day, active_fee_amount
          FROM belafarma_cards
          ORDER BY used_limit DESC, customer_name ASC LIMIT 25
        `).all();
      } else {
        const cleanQ = q.replace(/\D/g, '');
        cards = db.prepare(`
          SELECT id, customer_id, customer_name, phone, cpf, card_number, card_uid,
                 credit_limit, used_limit, status, due_day, active_fee_amount
          FROM belafarma_cards
          WHERE customer_name LIKE ? OR phone LIKE ? OR cpf LIKE ? OR card_uid LIKE ?
          ORDER BY customer_name ASC LIMIT 25
        `).all(`%${q}%`, `%${cleanQ || q}%`, `%${cleanQ || q}%`, `%${q}%`);
      }

      // Enriquecer com métricas de crédito e faturas
      const enriched = cards.map(c => {
        const availableCredit = Math.max(0, Number((c.credit_limit - c.used_limit).toFixed(2)));
        
        const overdueInvoice = db.prepare(`
          SELECT id, reference_month, due_date, total_due, paid_amount,
                 CAST((julianday(?) - julianday(due_date)) AS INTEGER) as days_late
          FROM card_invoices
          WHERE card_id = ? AND status != 'paid' AND due_date < ?
          ORDER BY due_date ASC LIMIT 1
        `).get(today, c.id, today);

        const daysLate = overdueInvoice ? Math.max(0, overdueInvoice.days_late) : 0;
        const isBlockedLate = daysLate >= 5;
        const isBlockedLimit = availableCredit <= 0;

        return {
          id: c.id,
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          phone: c.phone || '',
          cpf: c.cpf || '',
          has_cpf: !!c.cpf,
          needs_cpf: !c.cpf,
          card_number: c.card_number,
          card_uid: c.card_uid,
          credit_limit: c.credit_limit,
          used_limit: c.used_limit,
          available_credit: availableCredit,
          due_day: c.due_day,
          status: c.status,
          is_blocked: isBlockedLate || isBlockedLimit,
          is_blocked_late: isBlockedLate,
          is_blocked_limit: isBlockedLimit,
          days_late: daysLate,
          overdue_invoice: overdueInvoice || null
        };
      });

      res.json({ success: true, cards: enriched });
    } catch (err) {
      console.error('[Crediário 2.0] Erro ao buscar clientes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 3. GET /api/cards/:cardId/details
   * Retorna perfil completo do cliente, extrato e todas as faturas.
   */
  router.get('/:cardId/details', (req, res) => {
    try {
      const { cardId } = req.params;
      const card = db.prepare('SELECT * FROM belafarma_cards WHERE id = ?').get(cardId);
      if (!card) {
        return res.status(404).json({ error: 'Conta de crediário não encontrada.' });
      }

      const invoices = db.prepare(`
        SELECT * FROM card_invoices WHERE card_id = ? ORDER BY due_date DESC
      `).all(cardId);

      // Itens da fatura mais recente
      const latestInvoice = invoices[0];
      let items = [];
      if (latestInvoice) {
        items = db.prepare(`
          SELECT * FROM card_invoice_items WHERE invoice_id = ? ORDER BY purchased_at DESC
        `).all(latestInvoice.id);
      }

      const today = new Date().toISOString().split('T')[0];
      const overdueInvoice = invoices.find(inv => inv.status !== 'paid' && inv.due_date < today);
      const daysLate = overdueInvoice
        ? Math.max(0, Math.floor((new Date(today) - new Date(overdueInvoice.due_date)) / (1000 * 60 * 60 * 24)))
        : 0;

      res.json({
        success: true,
        card: {
          ...card,
          has_cpf: !!card.cpf,
          needs_cpf: !card.cpf,
          available_credit: Math.max(0, Number((card.credit_limit - card.used_limit).toFixed(2))),
          is_blocked_late: daysLate >= 5,
          days_late: daysLate
        },
        invoices,
        latestInvoiceItems: items
      });
    } catch (err) {
      console.error('[Crediário 2.0] Erro ao buscar detalhes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 4. POST /api/cards/:cardId/update-profile
   * Atualização cadastral rápida pelo balcão (cadastra CPF, telefone, limite e data de vencimento).
   */
  router.post('/:cardId/update-profile', (req, res) => {
    try {
      const { cardId } = req.params;
      const { cpf, phone, dueDay, creditLimit, customerName, address } = req.body;

      const card = db.prepare('SELECT * FROM belafarma_cards WHERE id = ?').get(cardId);
      if (!card) {
        return res.status(404).json({ error: 'Conta de crediário não encontrada.' });
      }

      const cleanCpf = cpf ? cpf.replace(/\D/g, '') : card.cpf;
      const cleanPhone = phone ? sanitizePhone(phone) : card.phone;
      const dueDayVal = dueDay && [10, 20].includes(Number(dueDay)) ? Number(dueDay) : card.due_day;
      const limitVal = creditLimit !== undefined ? Number(creditLimit) : card.credit_limit;
      const nameVal = customerName ? customerName.trim().toUpperCase() : card.customer_name;

      db.prepare(`
        UPDATE belafarma_cards
        SET customer_name = ?,
            cpf = ?,
            phone = ?,
            due_day = ?,
            credit_limit = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(nameVal, cleanCpf || null, cleanPhone || '', dueDayVal, limitVal, cardId);

      // Sincronizar em customers
      if (card.customer_id) {
        db.prepare(`
          UPDATE customers
          SET name = COALESCE(?, name),
              cpf = COALESCE(?, cpf),
              phone = COALESCE(?, phone),
              address = COALESCE(?, address),
              updatedAt = datetime('now', 'localtime')
          WHERE id = ?
        `).run(nameVal, cleanCpf || null, cleanPhone || null, address || null, card.customer_id);
      }

      res.json({
        success: true,
        message: 'Cadastro atualizado com sucesso!',
        card: {
          id: card.id,
          customer_name: nameVal,
          cpf: cleanCpf,
          phone: cleanPhone,
          due_day: dueDayVal,
          credit_limit: limitVal,
          has_cpf: !!cleanCpf
        }
      });
    } catch (err) {
      console.error('[Crediário 2.0] Erro ao atualizar cadastro:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 5. POST /api/cards/authorize-sale
   * Valida e debita o limite no caixa para compras no crediário próprio.
   */
  router.post('/authorize-sale', (req, res) => {
    try {
      const { cardId, saleId, amount, description } = req.body;
      const saleVal = Number(amount || 0);

      if (!cardId || saleVal <= 0) {
        return res.status(400).json({ error: 'cardId e valor da compra válido são obrigatórios.' });
      }

      const card = db.prepare('SELECT * FROM belafarma_cards WHERE id = ?').get(cardId);
      if (!card) {
        return res.status(404).json({ error: 'Conta de crediário não encontrada.' });
      }

      // Checar se há fatura vencida há mais de 5 dias (Tolerância estendida D+5)
      const today = new Date().toISOString().split('T')[0];
      const overdueInvoice = db.prepare(`
        SELECT id, due_date, total_due, paid_amount,
               CAST((julianday(?) - julianday(due_date)) AS INTEGER) as days_late
        FROM card_invoices
        WHERE card_id = ? AND status != 'paid' AND due_date < ?
        ORDER BY due_date ASC LIMIT 1
      `).get(today, card.id, today);

      if (overdueInvoice && overdueInvoice.days_late >= 5) {
        return res.status(403).json({
          authorized: false,
          reason: `Bloqueado por fatura em atraso há ${overdueInvoice.days_late} dias (${formatCurrency(overdueInvoice.total_due - overdueInvoice.paid_amount)} pendente desde ${overdueInvoice.due_date}).`
        });
      }

      const availableLimit = Number((card.credit_limit - card.used_limit).toFixed(2));
      if (saleVal > availableLimit) {
        return res.status(403).json({
          authorized: false,
          reason: `Limite de crédito insuficiente. Limite disponível: ${formatCurrency(availableLimit)}, compra solicitada: ${formatCurrency(saleVal)}.`
        });
      }

      // Executar autorização em transação
      const executeAuth = db.transaction(() => {
        // 1. Atualizar limite utilizado
        db.prepare(`
          UPDATE belafarma_cards
          SET used_limit = used_limit + ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(saleVal, card.id);

        // 2. Determinar ou criar fatura aberta
        const now = new Date();
        const refMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const invoiceId = `inv_${card.id}_${refMonth}`;

        let invoice = db.prepare('SELECT * FROM card_invoices WHERE id = ?').get(invoiceId);
        if (!invoice) {
          const dueDay = card.due_day || 20;
          let dueYear = now.getFullYear();
          let dueMonth = now.getMonth() + 1;
          if (now.getDate() > dueDay - 10) {
            dueMonth += 1;
            if (dueMonth > 12) { dueMonth = 1; dueYear += 1; }
          }
          const dueDateStr = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;

          const closingDate = new Date(dueDateStr);
          closingDate.setDate(closingDate.getDate() - 10);
          const closingDateStr = closingDate.toISOString().split('T')[0];

          db.prepare(`
            INSERT INTO card_invoices (
              id, card_id, customer_id, reference_month, closing_date, due_date,
              purchases_total, fee_active_invoice, total_due, status, created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?,
              ?, 0.0, ?, 'open', datetime('now', 'localtime'), datetime('now', 'localtime')
            )
          `).run(
            invoiceId, card.id, card.customer_id, refMonth, closingDateStr, dueDateStr,
            saleVal, saleVal
          );
        } else {
          db.prepare(`
            UPDATE card_invoices
            SET purchases_total = purchases_total + ?,
                total_due = total_due + ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(saleVal, saleVal, invoiceId);
        }

        // 3. Inserir item da fatura
        db.prepare(`
          INSERT INTO card_invoice_items (
            invoice_id, card_id, sale_id, description, amount, payment_method, purchased_at
          ) VALUES (?, ?, ?, ?, ?, 'CREDIARIO_2.0', datetime('now', 'localtime'))
        `).run(
          invoiceId, card.id, saleId || `pdv_${Date.now()}`,
          description || 'Compra no Balcão BelaFarma', saleVal
        );

        return { invoiceId, newUsed: card.used_limit + saleVal };
      });

      const result = executeAuth();
      const newRemaining = Math.max(0, Number((card.credit_limit - result.newUsed).toFixed(2)));

      res.json({
        authorized: true,
        message: 'Venda aprovada com sucesso no Crediário BelaFarma!',
        saleAmount: saleVal,
        usedLimit: result.newUsed,
        remainingLimit: newRemaining,
        invoiceId: result.invoiceId
      });
    } catch (err) {
      console.error('[Crediário 2.0] Erro ao autorizar venda:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 6. POST /api/cards/invoices/:invoiceId/issue-inter-boleto
   * Emissão do Boleto Híbrido (com QR Code Pix) pelo Banco Inter.
   */
  router.post('/invoices/:invoiceId/issue-inter-boleto', async (req, res) => {
    try {
      const { invoiceId } = req.params;
      const invoice = db.prepare('SELECT * FROM card_invoices WHERE id = ?').get(invoiceId);
      if (!invoice) {
        return res.status(404).json({ error: 'Fatura não encontrada.' });
      }

      const card = db.prepare('SELECT * FROM belafarma_cards WHERE id = ?').get(invoice.card_id);
      if (!card) {
        return res.status(404).json({ error: 'Cartão vinculado à fatura não encontrado.' });
      }

      if (!card.cpf) {
        return res.status(400).json({
          error: `Cliente ${card.customer_name} não possui CPF cadastrado. Cadastre o CPF no balcão antes de emitir o boleto bancário do Banco Inter.`,
          needs_cpf: true
        });
      }

      const saldoAPagar = Number((invoice.total_due - invoice.paid_amount).toFixed(2));
      if (saldoAPagar <= 0) {
        return res.status(400).json({ error: 'Esta fatura já se encontra quitada.' });
      }

      const cust = card.customer_id
        ? db.prepare('SELECT * FROM customers WHERE id = ?').get(card.customer_id)
        : null;

      const interBoleto = await bancoInterService.emitirBoletoHibrido({
        seuNumero: invoice.id.replace(/\W/g, '').substring(0, 15),
        valor: saldoAPagar,
        dataVencimento: invoice.due_date,
        cliente: {
          nome: card.customer_name,
          cpf: card.cpf,
          telefone: card.phone,
          endereco: cust?.address || 'Rua Principal',
          bairro: cust?.neighborhood || 'Centro',
          cidade: 'Muriaé',
          uf: 'MG',
          cep: '36880000'
        }
      });

      db.prepare(`
        UPDATE card_invoices
        SET boleto_id = ?,
            boleto_barcode = ?,
            pix_copia_cola = ?,
            status = 'closed',
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        interBoleto.nossoNumero || interBoleto.codigoBarras,
        interBoleto.linhaDigitavel || interBoleto.codigoBarras,
        interBoleto.pixCopiaECola,
        invoiceId
      );

      res.json({
        success: true,
        message: 'Boleto Híbrido Banco Inter emitido com sucesso!',
        boleto: {
          nossoNumero: interBoleto.nossoNumero,
          codigoBarras: interBoleto.codigoBarras,
          linhaDigitavel: interBoleto.linhaDigitavel,
          pixCopiaECola: interBoleto.pixCopiaECola
        }
      });
    } catch (err) {
      console.error('[Crediário 2.0] Erro ao emitir boleto Banco Inter:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 7. GET /api/cards/invoices/:invoiceId/boleto-pdf
   * Download / Visualização direta do PDF do boleto gerado.
   */
  router.get('/invoices/:invoiceId/boleto-pdf', async (req, res) => {
    try {
      const { invoiceId } = req.params;
      const invoice = db.prepare('SELECT * FROM card_invoices WHERE id = ?').get(invoiceId);
      if (!invoice || !invoice.boleto_id) {
        return res.status(404).json({ error: 'Boleto ainda não emitido para esta fatura.' });
      }

      const pdfBuffer = await bancoInterService.obterBoletoPdf(invoice.boleto_id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Boleto_BelaFarma_${invoiceId}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error('[Crediário 2.0] Erro ao obter PDF do boleto:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 8. POST /api/cards/invoices/:invoiceId/pay
   * Liquidação / Baixa de pagamento realizada no balcão da farmácia (dinheiro, Pix, débito).
   */
  router.post('/invoices/:invoiceId/pay', (req, res) => {
    try {
      const { invoiceId } = req.params;
      const { amount, paymentMethod = 'DINHEIRO', notes = '' } = req.body;
      const payVal = Number(amount || 0);

      if (payVal <= 0) {
        return res.status(400).json({ error: 'Valor pago inválido.' });
      }

      const invoice = db.prepare('SELECT * FROM card_invoices WHERE id = ?').get(invoiceId);
      if (!invoice) {
        return res.status(404).json({ error: 'Fatura não encontrada.' });
      }

      const card = db.prepare('SELECT * FROM belafarma_cards WHERE id = ?').get(invoice.card_id);
      if (!card) {
        return res.status(404).json({ error: 'Cartão não encontrado.' });
      }

      const newPaid = Number((invoice.paid_amount + payVal).toFixed(2));
      const isTotal = newPaid >= invoice.total_due;
      const newStatus = isTotal ? 'paid' : invoice.status;

      db.transaction(() => {
        db.prepare(`
          UPDATE card_invoices
          SET paid_amount = ?,
              paid_at = CASE WHEN ? THEN datetime('now', 'localtime') ELSE paid_at END,
              status = ?,
              updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(newPaid, isTotal ? 1 : 0, newStatus, invoiceId);

        const newUsed = Math.max(0, Number((card.used_limit - payVal).toFixed(2)));
        db.prepare(`
          UPDATE belafarma_cards
          SET used_limit = ?,
              status = 'active',
              updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(newUsed, card.id);
      })();

      res.json({
        success: true,
        message: isTotal
          ? 'Fatura quitada integralmente! Limite liberado.'
          : `Pagamento parcial de ${formatCurrency(payVal)} registrado com sucesso!`,
        invoiceId,
        paidAmount: payVal,
        totalPaid: newPaid,
        totalDue: invoice.total_due,
        remainingInvoiceDue: Math.max(0, Number((invoice.total_due - newPaid).toFixed(2))),
        newUsedLimit: Math.max(0, Number((card.used_limit - payVal).toFixed(2))),
        newAvailableLimit: Math.max(0, Number((card.credit_limit - (card.used_limit - payVal)).toFixed(2)))
      });
    } catch (err) {
      console.error('[Crediário 2.0] Erro ao baixar fatura:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 9. POST /api/cards/invoices/:invoiceId/send-whatsapp
   * Disparo manual ou sob demanda de extrato + código Pix/boleto para o WhatsApp do cliente.
   */
  router.post('/invoices/:invoiceId/send-whatsapp', async (req, res) => {
    try {
      const { invoiceId } = req.params;
      const invoice = db.prepare('SELECT * FROM card_invoices WHERE id = ?').get(invoiceId);
      if (!invoice) {
        return res.status(404).json({ error: 'Fatura não encontrada.' });
      }

      const card = db.prepare('SELECT * FROM belafarma_cards WHERE id = ?').get(invoice.card_id);
      if (!card || !card.phone) {
        return res.status(400).json({ error: 'Telefone do cliente não encontrado.' });
      }

      const items = db.prepare('SELECT * FROM card_invoice_items WHERE invoice_id = ? ORDER BY purchased_at ASC').all(invoiceId);

      const cleanPhone = sanitizePhone(card.phone);
      const baileys = require('./baileys-service');

      let itensTexto = '';
      items.slice(0, 10).forEach(it => {
        itensTexto += `• ${it.description}: R$ ${Number(it.amount).toFixed(2)}\n`;
      });
      if (items.length > 10) {
        itensTexto += `... e mais ${items.length - 10} item(ns)\n`;
      }

      const saldoRestante = Number((invoice.total_due - invoice.paid_amount).toFixed(2));
      const [ano, mes, dia] = invoice.due_date.split('-');
      const dataVencFormat = `${dia}/${mes}/${ano}`;

      let msg = `🧾 *Fatura BelaFarma - Crediário*\n\n` +
        `Olá, *${card.customer_name.split(' ')[0]}*! Segue o resumo da sua fatura com vencimento em *${dataVencFormat}*:\n\n` +
        `💰 *Valor Total a Pagar:* R$ ${saldoRestante.toFixed(2)}\n` +
        `📅 *Vencimento:* ${dataVencFormat}\n\n` +
        `🛍️ *Detalhamento das Compras:*\n` +
        `${itensTexto || '• Compras consolidadas no balcão\n'}\n`;

      if (invoice.pix_copia_cola) {
        msg += `⚡ *Pague via PIX Copia e Cola (Aprovação Instantânea):*\n` +
          `\`${invoice.pix_copia_cola}\`\n\n`;
      } else {
        msg += `💳 *Chave PIX BelaFarma (CNPJ):*\n` +
          `\`31.144.152/0001-44\`\n\n` +
          `_(Ou realize o pagamento diretamente no balcão da farmácia)_\n\n`;
      }

      msg += `Qualquer dúvida estamos à disposição! Muito obrigado pela parceria e preferência! 💚`;

      await baileys.sendText(cleanPhone, msg);

      let sentPdf = false;
      if (invoice.boleto_id && typeof baileys.sendDocument === 'function') {
        try {
          const pdfBuf = await bancoInterService.obterBoletoPdf(invoice.boleto_id);
          await baileys.sendDocument(cleanPhone, pdfBuf, `Boleto_BelaFarma_${invoice.reference_month}.pdf`, 'Boleto bancário da sua fatura BelaFarma.');
          sentPdf = true;
        } catch (pdfErr) {
          console.warn('[Crediário 2.0] Aviso: Não foi possível anexar PDF no WhatsApp:', pdfErr.message);
        }
      }

      res.json({
        success: true,
        message: 'Fatura e cobrança enviadas com sucesso no WhatsApp!',
        sentPdf
      });
    } catch (err) {
      console.error('[Crediário 2.0] Erro ao enviar WhatsApp:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 10. GET /api/cards/dashboard
   * Visão geral de métricas, limites e cobranças do Crediário 2.0.
   */
  router.get('/dashboard', (req, res) => {
    try {
      const totalCards = db.prepare('SELECT COUNT(*) as cnt FROM belafarma_cards').get().cnt;
      const activeCards = db.prepare("SELECT COUNT(*) as cnt FROM belafarma_cards WHERE status = 'active'").get().cnt;
      const semCpfCount = db.prepare("SELECT COUNT(*) as cnt FROM belafarma_cards WHERE cpf IS NULL OR cpf = ''").get().cnt;

      const limitStats = db.prepare(`
        SELECT SUM(credit_limit) as total_granted, SUM(used_limit) as total_used
        FROM belafarma_cards
      `).get();

      const today = new Date().toISOString().split('T')[0];
      const overdueStats = db.prepare(`
        SELECT COUNT(*) as overdue_count, SUM(total_due - paid_amount) as overdue_amount
        FROM card_invoices
        WHERE status != 'paid' AND due_date < ?
      `).get(today);

      const blockedStats = db.prepare(`
        SELECT COUNT(DISTINCT card_id) as cnt
        FROM card_invoices
        WHERE status != 'paid' AND (julianday(?) - julianday(due_date)) >= 5
      `).get(today).cnt;

      res.json({
        success: true,
        cards: {
          total: totalCards,
          active: activeCards,
          sem_cpf: semCpfCount,
          total_credit_granted: Number(limitStats?.total_granted || 0),
          total_credit_used: Number(limitStats?.total_used || 0)
        },
        billing: {
          overdue_count: overdueStats?.overdue_count || 0,
          overdue_amount: Number(overdueStats?.overdue_amount || 0),
          blocked_overdue_clients: blockedStats
        }
      });
    } catch (err) {
      console.error('[Crediário 2.0] Erro ao carregar dashboard:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 11. POST /api/cards/webhook/inter
   * Endpoint de Webhook oficial para receber notificações de pagamento do Banco Inter em tempo real.
   */
  router.post('/webhook/inter', async (req, res) => {
    try {
      const { processarWebhookPayload } = require('./services/crediario-conciliacao.service');
      const results = await processarWebhookPayload(db, req.body);
      res.status(200).json({ success: true, processed: results });
    } catch (err) {
      console.error('[Webhook Inter] Erro ao processar:', err.message);
      // Retorna 200 para o Inter não ficar retentando indefinidamente se for erro de payload
      res.status(200).json({ success: false, error: err.message });
    }
  });

  /**
   * 12. POST /api/cards/conciliacao/run
   * Dispara a conciliação ativa imediata com o Banco Inter para verificar pagamentos pendentes.
   */
  router.post('/conciliacao/run', async (req, res) => {
    try {
      const { executarConciliacaoAtiva } = require('./services/crediario-conciliacao.service');
      const relatorio = await executarConciliacaoAtiva(db);
      res.json({ success: true, relatorio });
    } catch (err) {
      console.error('[Conciliação Inter] Erro manual:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 13. GET /api/cards/webhook/status
   * Consulta a situação do Webhook registrado no Banco Inter.
   */
  router.get('/webhook/status', async (req, res) => {
    try {
      const status = await bancoInterService.consultarWebhook();
      res.json({ success: true, status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 14. POST /api/cards/webhook/register
   * Configura/Atualiza a URL pública do Webhook no Banco Inter.
   */
  router.post('/webhook/register', async (req, res) => {
    try {
      const { webhookUrl } = req.body;
      if (!webhookUrl) {
        return res.status(400).json({ error: 'URL do Webhook é obrigatória.' });
      }
      const result = await bancoInterService.criarWebhook(webhookUrl);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createCardEndpoints;
