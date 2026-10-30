/**
 * backend/crediario-card-endpoints.js
 *
 * Módulo de Endpoints do Cartão BelaFarma (Private Label) & Fidelidade NFC
 * Gerencia limites de crédito, leitura NFC no caixa, termos jurídicos com aceite no WhatsApp,
 * faturas mensais, tarifas de fatura ativa, encargos de atraso e negativação no Serasa.
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');

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

      // 1. Checagem de Faturas em Atraso
      const today = new Date().toISOString().split('T')[0];
      const overdueInvoice = db.prepare(`
        SELECT id, reference_month, due_date, total_due, paid_amount,
               CAST((julianday(?) - julianday(due_date)) AS INTEGER) as days_late
        FROM card_invoices
        WHERE card_id = ? AND status != 'paid' AND due_date < ?
        ORDER BY due_date ASC LIMIT 1
      `).get(today, card.id, today);

      const daysLate = overdueInvoice ? Math.max(0, overdueInvoice.days_late) : 0;
      const isBlockedLate = daysLate >= 2;

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
          card_number: card.card_number,
          card_uid: card.card_uid,
          credit_limit: card.credit_limit,
          used_limit: card.used_limit,
          available_credit: availableCredit,
          due_day: card.due_day,
          status: card.status,
          active_fee_amount: card.active_fee_amount,
          available_cashback: availableCashback,
          is_blocked_late: isBlockedLate,
          days_late: daysLate,
          overdue_invoice: overdueInvoice || null
        }
      });
    } catch (err) {
      console.error('[Cartao BelaFarma] Erro ao buscar por UID:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 2. GET /api/cards/search?q=...
   * Fallback de busca no balcão por Nome, Telefone ou CPF.
   */
  router.get('/search', (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q || q.length < 2) {
        return res.json({ success: true, cards: [] });
      }

      const cleanQ = q.replace(/\D/g, '');
      const cards = db.prepare(`
        SELECT id, customer_name, phone, cpf, card_number, card_uid, credit_limit, used_limit, status, due_day
        FROM belafarma_cards
        WHERE customer_name LIKE ? OR phone LIKE ? OR cpf LIKE ? OR card_uid LIKE ?
        ORDER BY customer_name ASC LIMIT 10
      `).all(`%${q}%`, `%${cleanQ || q}%`, `%${cleanQ || q}%`, `%${q}%`);

      res.json({ success: true, cards });
    } catch (err) {
      console.error('[Cartao BelaFarma] Erro ao buscar clientes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 3. POST /api/cards/issue
   * Emissão expressa de cartão no balcão (vincula chip virgem, gera termo e dispara WhatsApp).
   */
  router.post('/issue', async (req, res) => {
    try {
      const {
        customerName,
        phone,
        cpf,
        address,
        neighborhood,
        cardUid,
        creditLimit = 300.0,
        dueDay = 10,
        sendWhatsApp = true
      } = req.body;

      if (!customerName || !phone) {
        return res.status(400).json({ error: 'Nome do cliente e telefone são obrigatórios.' });
      }

      const cleanPhone = sanitizePhone(phone);
      const cleanUid = (cardUid || '').trim().toUpperCase();

      // Checar se o UID já está em uso
      if (cleanUid) {
        const existingCard = db.prepare('SELECT id, customer_name FROM belafarma_cards WHERE UPPER(card_uid) = ?').get(cleanUid);
        if (existingCard) {
          return res.status(400).json({ error: `Este chip NFC já está vinculado ao cliente ${existingCard.customer_name}.` });
        }
      }

      // Obter ou criar cliente na tabela customers
      let cust = db.prepare('SELECT id, name FROM customers WHERE phone LIKE ? LIMIT 1').get(`%${cleanPhone.slice(-8)}%`);
      let customerId = cust ? cust.id : null;
      if (!customerId) {
        customerId = `cust_${Date.now()}`;
        db.prepare(`
          INSERT INTO customers (id, name, phone, address, neighborhood, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `).run(customerId, customerName.toUpperCase(), cleanPhone, address || null, neighborhood || null);
      }

      const cardNumber = generateCardNumber();
      const token = crypto.randomBytes(16).toString('hex');
      const limitVal = Number(creditLimit) || 300.0;
      const dueDayVal = [10, 20].includes(Number(dueDay)) ? Number(dueDay) : 10;

      // 1. Inserir Cartão
      const insertCard = db.prepare(`
        INSERT INTO belafarma_cards (
          customer_id, customer_name, phone, cpf, card_uid, card_number,
          credit_limit, used_limit, due_day, closing_offset_days, status,
          active_fee_amount, late_fine_percent, late_interest_monthly_percent,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, 0.0, ?, 10, 'pending_signature',
          4.90, 2.00, 2.90,
          datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `).run(
        customerId,
        customerName.trim().toUpperCase(),
        cleanPhone,
        cpf ? cpf.replace(/\D/g, '') : null,
        cleanUid || null,
        cardNumber,
        limitVal,
        dueDayVal
      );

      const cardId = insertCard.lastInsertRowid;

      // 2. Inserir Termo Jurídico de Assinatura Eletrônica
      const termsText = `TERMO DE ADESÃO AO CARTÃO BELAFARMA (PRIVATE LABEL)
Cliente: ${customerName.toUpperCase()} - CPF: ${cpf || 'A confirmar'}
Limite Concedido: R$ ${limitVal.toFixed(2)} - Vencimento da Fatura: Todo dia ${dueDayVal}
Tarifa de Fatura Ativa: R$ 4,90 (devida apenas nos meses em que houver compras faturadas).
Encargos de Atraso: Multa de 2% (Art. 52 CDC) e Juros de Mora de 2,9% ao mês.
CLÁUSULA DE NEGATIVAÇÃO: Em caso de inadimplência superior a 30 dias contados do vencimento da fatura, o(a) titular autoriza expressamente a inscrição de seu nome e CPF nos órgãos de proteção ao crédito (SPC/Serasa) e o protesto do respectivo título.`;

      db.prepare(`
        INSERT INTO card_legal_signatures (
          card_id, customer_id, token, full_name, cpf, phone, address,
          due_day, credit_limit, active_fee_amount, late_fine_percent, late_interest_monthly_percent,
          terms_text, status, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, 4.90, 2.00, 2.90,
          ?, 'pending', datetime('now', 'localtime')
        )
      `).run(
        cardId,
        customerId,
        token,
        customerName.trim().toUpperCase(),
        cpf ? cpf.replace(/\D/g, '') : null,
        cleanPhone,
        address ? `${address} - ${neighborhood || ''}` : null,
        dueDayVal,
        limitVal,
        termsText
      );

      // 3. Creditar Bônus de Boas-Vindas de R$ 3,00 (Cashback Fidelidade válido por 30 dias)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const expiresStr = expiresAt.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO nfc_loyalty_cashback (
          customer_id, customer_name, phone, card_uid, sale_id,
          purchase_amount, payment_method, cashback_percent, cashback_amount,
          balance_available, expires_at, status, created_at
        ) VALUES (
          ?, ?, ?, ?, 'BONUS_BOAS_VINDAS',
          0.0, 'BONUS', 100.0, 3.00,
          3.00, ?, 'active', datetime('now', 'localtime')
        )
      `).run(
        customerId,
        customerName.trim().toUpperCase(),
        cleanPhone,
        cleanUid || null,
        expiresStr
      );

      // 4. Link do Termo para o WhatsApp
      const signatureUrl = `/cartao/termo.html?token=${token}`;

      // Enviar WhatsApp se o serviço estiver ativo
      let sentWhatsApp = false;
      try {
        const baileys = require('./baileys-service');
        if (baileys && typeof baileys.enviarMensagemTexto === 'function' && sendWhatsApp) {
          const jid = cleanPhone.includes('@') ? cleanPhone : `55${cleanPhone}@s.whatsapp.net`;
          const msg = `🎉 Olá, *${customerName.split(' ')[0]}*! Seu *Cartão BelaFarma* está pronto!\n\n` +
            `💳 *Limite Aprovado:* R$ ${limitVal.toFixed(2)}\n` +
            `📅 *Vencimento da Fatura:* Todo dia ${dueDayVal}\n` +
            `🎁 *Presente:* Liberamos *R$ 3,00 de Bônus* para você aproveitar nos próximos 30 dias!\n\n` +
            `👉 Para ativar seu cartão agora com segurança, clique no link e confirme seu aceite:\n` +
            `http://localhost:3001${signatureUrl}\n\n` +
            `Qualquer dúvida, conte sempre com a BelaFarma! 💚`;

          await baileys.enviarMensagemTexto(jid, msg);
          sentWhatsApp = true;
        }
      } catch (errWpp) {
        console.warn('[Cartao BelaFarma] Aviso: Falha ao enviar WhatsApp de boas-vindas:', errWpp.message);
      }

      res.json({
        success: true,
        message: 'Cartão emitido com sucesso e bônus de R$ 3,00 creditado!',
        cardId,
        token,
        signatureUrl,
        sentWhatsApp,
        card: {
          id: cardId,
          customer_name: customerName,
          phone: cleanPhone,
          card_number: cardNumber,
          card_uid: cleanUid,
          credit_limit: limitVal,
          due_day: dueDayVal,
          status: 'pending_signature',
          bonus_cashback: 3.00
        }
      });
    } catch (err) {
      console.error('[Cartao BelaFarma] Erro ao emitir cartão:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 4. GET /api/cards/terms/:token
   * Retorna os dados do termo para exibição no celular do cliente.
   */
  router.get('/terms/:token', (req, res) => {
    try {
      const { token } = req.params;
      const term = db.prepare(`
        SELECT s.*, c.card_number, c.status as card_status
        FROM card_legal_signatures s
        JOIN belafarma_cards c ON s.card_id = c.id
        WHERE s.token = ?
      `).get(token);

      if (!term) {
        return res.status(404).json({ error: 'Termo de adesão não encontrado ou expirado.' });
      }

      res.json({
        success: true,
        term: {
          token: term.token,
          full_name: term.full_name,
          cpf: term.cpf,
          phone: term.phone,
          address: term.address,
          card_number: term.card_number,
          due_day: term.due_day,
          credit_limit: term.credit_limit,
          active_fee_amount: term.active_fee_amount,
          late_fine_percent: term.late_fine_percent,
          late_interest_monthly_percent: term.late_interest_monthly_percent,
          terms_text: term.terms_text,
          status: term.status,
          signed_at: term.signed_at
        }
      });
    } catch (err) {
      console.error('[Cartao BelaFarma] Erro ao buscar termo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 5. POST /api/cards/terms/:token/sign
   * Assinatura eletrônica realizada pelo cliente no celular (com gravação de IP e Data/Hora).
   */
  router.post('/terms/:token/sign', async (req, res) => {
    try {
      const { token } = req.params;
      const { cpf, address } = req.body;

      const term = db.prepare('SELECT * FROM card_legal_signatures WHERE token = ?').get(token);
      if (!term) {
        return res.status(404).json({ error: 'Termo de adesão inválido.' });
      }

      if (term.status === 'signed') {
        return res.json({ success: true, message: 'Este termo já foi assinado anteriormente!', alreadySigned: true });
      }

      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'Desconhecido';
      const cleanCpf = cpf ? cpf.replace(/\D/g, '') : term.cpf;

      // 1. Atualizar assinatura jurídica
      db.prepare(`
        UPDATE card_legal_signatures
        SET status = 'signed',
            cpf = COALESCE(?, cpf),
            address = COALESCE(?, address),
            ip_address = ?,
            user_agent = ?,
            signed_at = datetime('now', 'localtime')
        WHERE token = ?
      `).run(cleanCpf || null, address || null, String(clientIp), String(userAgent), token);

      // 2. Ativar o Cartão
      db.prepare(`
        UPDATE belafarma_cards
        SET status = 'active',
            cpf = COALESCE(?, cpf),
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(cleanCpf || null, term.card_id);

      // 3. Atualizar cadastro do cliente
      if (cleanCpf) {
        db.prepare('UPDATE customers SET cpf = ? WHERE phone LIKE ?').run(cleanCpf, `%${term.phone.slice(-8)}%`);
      }

      // 4. Mensagem de Confirmação no WhatsApp
      try {
        const baileys = require('./baileys-service');
        if (baileys && typeof baileys.enviarMensagemTexto === 'function') {
          const jid = term.phone.includes('@') ? term.phone : `55${term.phone}@s.whatsapp.net`;
          const msg = `✅ *Tudo certo, ${term.full_name.split(' ')[0]}!* Seu *Cartão BelaFarma* foi ATIVADO com sucesso!\n\n` +
            `🔒 *Limite Liberado:* R$ ${term.credit_limit.toFixed(2)}\n` +
            `📅 *Vencimento:* Todo dia ${term.due_day}\n\n` +
            `Basta aproximar o cartão ou passar o seu WhatsApp no balcão da farmácia para comprar a prazo com comodidade. Muito obrigado pela confiança! 💚`;
          await baileys.enviarMensagemTexto(jid, msg);
        }
      } catch (eWpp) {}

      res.json({
        success: true,
        message: 'Cartão BelaFarma ativado com sucesso! Você já pode realizar compras.',
        signedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('[Cartao BelaFarma] Erro ao assinar termo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 6. POST /api/cards/authorize-sale
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
        return res.status(404).json({ error: 'Cartão não encontrado.' });
      }

      if (card.status !== 'active') {
        return res.status(403).json({
          authorized: false,
          reason: card.status === 'pending_signature'
            ? 'Cartão aguardando aceite do termo no WhatsApp.'
            : 'Cartão bloqueado ou cancelado.'
        });
      }

      // Checar se há fatura vencida há mais de 2 dias
      const today = new Date().toISOString().split('T')[0];
      const overdueInvoice = db.prepare(`
        SELECT id, due_date, total_due, paid_amount,
               CAST((julianday(?) - julianday(due_date)) AS INTEGER) as days_late
        FROM card_invoices
        WHERE card_id = ? AND status != 'paid' AND due_date < ?
        ORDER BY due_date ASC LIMIT 1
      `).get(today, card.id, today);

      if (overdueInvoice && overdueInvoice.days_late >= 2) {
        return res.status(403).json({
          authorized: false,
          reason: `Bloqueado por fatura em atraso há ${overdueInvoice.days_late} dias (${formatCurrency(overdueInvoice.total_due - overdueInvoice.paid_amount)} pendente).`
        });
      }

      const availableLimit = Number((card.credit_limit - card.used_limit).toFixed(2));
      if (saleVal > availableLimit) {
        return res.status(403).json({
          authorized: false,
          reason: `Limite insuficiente. Limite disponível: ${formatCurrency(availableLimit)}, compra: ${formatCurrency(saleVal)}.`
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
          // Data de vencimento no mês corrente ou seguinte
          const dueDay = card.due_day;
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
              ?, ?, ?, 'open', datetime('now', 'localtime'), datetime('now', 'localtime')
            )
          `).run(
            invoiceId, card.id, card.customer_id, refMonth, closingDateStr, dueDateStr,
            saleVal, card.active_fee_amount, saleVal + card.active_fee_amount
          );
        } else {
          // Atualiza total da fatura existente
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
          ) VALUES (?, ?, ?, ?, ?, 'CREDITO_PROPRIO', datetime('now', 'localtime'))
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
        message: 'Venda aprovada com sucesso no Cartão BelaFarma!',
        saleAmount: saleVal,
        usedLimit: result.newUsed,
        remainingLimit: newRemaining,
        invoiceId: result.invoiceId
      });
    } catch (err) {
      console.error('[Cartao BelaFarma] Erro ao autorizar venda:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 7. POST /api/cards/redeem-cashback
   * Resgata saldo de cashback acumulado na tela do caixa.
   */
  router.post('/redeem-cashback', (req, res) => {
    try {
      const { phone, amount, saleId } = req.body;
      const cleanPhone = sanitizePhone(phone);
      const redeemVal = Number(amount || 0);

      if (!cleanPhone || redeemVal <= 0) {
        return res.status(400).json({ error: 'Telefone e valor do resgate são obrigatórios.' });
      }

      // Buscar lotes de cashback ativos
      const lots = db.prepare(`
        SELECT id, balance_available
        FROM nfc_loyalty_cashback
        WHERE phone = ? AND status = 'active' AND expires_at >= date('now', 'localtime') AND balance_available > 0
        ORDER BY expires_at ASC
      `).all(cleanPhone);

      const totalAvail = lots.reduce((acc, l) => acc + l.balance_available, 0);
      if (redeemVal > totalAvail) {
        return res.status(400).json({
          error: `Saldo de cashback insuficiente. Disponível: ${formatCurrency(totalAvail)}.`
        });
      }

      let remainingToDeduct = redeemVal;
      const deductTx = db.transaction(() => {
        for (const lot of lots) {
          if (remainingToDeduct <= 0) break;
          const deductFromLot = Math.min(lot.balance_available, remainingToDeduct);
          const newBal = lot.balance_available - deductFromLot;
          const newStatus = newBal <= 0 ? 'redeemed' : 'active';

          db.prepare(`
            UPDATE nfc_loyalty_cashback
            SET balance_available = ?, status = ?
            WHERE id = ?
          `).run(newBal, newStatus, lot.id);

          remainingToDeduct -= deductFromLot;
        }
      });

      deductTx();

      res.json({
        success: true,
        message: `${formatCurrency(redeemVal)} de Cashback resgatado com sucesso!`,
        redeemedAmount: redeemVal,
        remainingCashback: Number((totalAvail - redeemVal).toFixed(2))
      });
    } catch (err) {
      console.error('[Cartao BelaFarma] Erro ao resgatar cashback:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 8. GET /api/cards/dashboard
   * Visão geral de métricas, limites e cobranças do Cartão BelaFarma.
   */
  router.get('/dashboard', (req, res) => {
    try {
      const totalCards = db.prepare('SELECT COUNT(*) as cnt FROM belafarma_cards').get().cnt;
      const activeCards = db.prepare("SELECT COUNT(*) as cnt FROM belafarma_cards WHERE status = 'active'").get().cnt;
      const pendingCards = db.prepare("SELECT COUNT(*) as cnt FROM belafarma_cards WHERE status = 'pending_signature'").get().cnt;

      const limitStats = db.prepare(`
        SELECT SUM(credit_limit) as total_granted, SUM(used_limit) as total_used
        FROM belafarma_cards WHERE status = 'active'
      `).get();

      const today = new Date().toISOString().split('T')[0];
      const overdueStats = db.prepare(`
        SELECT COUNT(*) as overdue_count, SUM(total_due - paid_amount) as overdue_amount
        FROM card_invoices
        WHERE status != 'paid' AND due_date < ?
      `).get(today);

      const serasaCandidates = db.prepare(`
        SELECT i.id, i.due_date, (i.total_due - i.paid_amount) as debt_amount,
               c.customer_name, c.phone, c.cpf,
               CAST((julianday(?) - julianday(i.due_date)) AS INTEGER) as days_late
        FROM card_invoices i
        JOIN belafarma_cards c ON i.card_id = c.id
        WHERE i.status != 'paid' AND (julianday(?) - julianday(i.due_date)) >= 30
        ORDER BY days_late DESC LIMIT 20
      `).all(today, today);

      res.json({
        success: true,
        cards: {
          total: totalCards,
          active: activeCards,
          pending: pendingCards,
          total_credit_granted: Number(limitStats?.total_granted || 0),
          total_credit_used: Number(limitStats?.total_used || 0)
        },
        billing: {
          overdue_count: overdueStats?.overdue_count || 0,
          overdue_amount: Number(overdueStats?.overdue_amount || 0),
          serasa_candidates_count: serasaCandidates.length,
          serasa_candidates: serasaCandidates
        }
      });
    } catch (err) {
      console.error('[Cartao BelaFarma] Erro ao carregar dashboard:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createCardEndpoints;
