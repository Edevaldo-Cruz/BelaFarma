/**
 * backend/crediario-unified-endpoints.js
 *
 * Rotas REST Unificadas do Crediário BelaFarma (/api/crediario-v2)
 * Controla permissões Operador vs. Administrador e rotas públicas LGPD do Portal do Cliente.
 */

const express = require('express');
const crypto = require('crypto');
const security = require('./security');
const { generatePixBrCode } = require('./utils/pix-brcode');
const unified = require('./services/crediario-unified.service');

function createUnifiedCrediarioEndpoints(db, options = {}) {
  const router = express.Router();
  const requireAdminMw = options.requireAdmin || security.requireAdmin;

  unified.ensureCrediarioUnifiedSchema(db);
  unified.ensurePortalTokens(db);

  // ============================================================================
  // ROTAS PÚBLICAS DO PORTAL DO CLIENTE (/api/crediario-v2/public/*)
  // ============================================================================

  /**
   * GET /public/account/:token
   * Retorna APENAS saldo, vencimento, status e PIX. Nunca vaza nomes de produtos antes do unlock
   * e aceita exclusivamente portal_token (>= 16 chars) para impedir enumeração por ID.
   */
  router.get('/public/account/:token', (req, res) => {
    try {
      const statement = unified.buildClientStatementByToken(db, req.params.token);
      if (!statement || !statement.card) {
        return res.status(404).json({ success: false, error: 'Conta não encontrada. Verifique o link recebido.' });
      }

      const { card, financials, pix, configPublic } = statement;
      const cleanCpf = unified.sanitizeDigits(card.cpf);
      const cleanPhone = unified.sanitizeDigits(card.phone);

      let unlockMethod = 'none';
      let maskedHint = '';
      if (cleanCpf.length >= 3) {
        unlockMethod = 'cpf';
        // Oculta os 3 primeiros dígitos pedidos no desbloqueio
        maskedHint = cleanCpf.length >= 11
          ? `***.***.***-${cleanCpf.slice(-2)}`
          : '***.***.***-**';
      } else if (cleanPhone.length >= 4) {
        unlockMethod = 'phone';
        // Oculta os 4 últimos dígitos pedidos no desbloqueio
        maskedHint = cleanPhone.length >= 10
          ? `(${cleanPhone.slice(0, 2)}) *****-****`
          : '*****-****';
      }

      const firstName = String(card.customer_name || 'Cliente').trim().split(/\s+/)[0];

      res.json({
        success: true,
        account: {
          firstName,
          accountStatus: financials.accountStatus,
          dueDay: card.due_day,
          dueDayMode: card.due_day_mode || 'auto',
          unlockMethod,
          maskedHint,
          financials: {
            principalBalance: financials.principalBalance,
            lateFine: financials.lateFine,
            lateInterest: financials.lateInterest,
            totalCharges: financials.totalCharges,
            totalBalance: financials.totalBalance,
            nextDueDate: financials.nextDueDate,
            maxDaysLate: financials.maxDaysLate,
            interestExempt: financials.interestExempt
          },
          pix: {
            pixKey: pix.pixKey,
            merchantName: pix.merchantName,
            merchantCity: pix.merchantCity,
            brcode: pix.brcode
          },
          storeWhatsapp: unified.normalizePhoneBr(configPublic.storeWhatsapp),
          storeName: 'Farmácia Bela Farma Sul',
          storeCnpj: '31.144.152/0001-44'
        }
      });
    } catch (err) {
      console.error('[Crediário Público] Erro em GET /public/account:', err);
      res.status(500).json({ success: false, error: 'Erro interno ao consultar conta.' });
    }
  });

  /**
   * POST /public/account/:token/unlock
   * Valida 3 primeiros dígitos do CPF (ou 4 últimos do telefone quando sem CPF)
   * para revelar o Extrato Simples com nomes dos produtos.
   */
  router.post('/public/account/:token/unlock', (req, res) => {
    try {
      const statement = unified.buildClientStatementByToken(db, req.params.token);
      if (!statement || !statement.card) {
        return res.status(404).json({ success: false, error: 'Conta não encontrada.' });
      }

      const { card, simpleStatement } = statement;
      const cleanCpf = unified.sanitizeDigits(card.cpf);
      const cleanPhone = unified.sanitizeDigits(card.phone);
      const inputDigits = unified.sanitizeDigits(req.body?.digits ?? req.body?.cpfDigits ?? '');

      if (cleanCpf.length >= 3) {
        if (inputDigits.length < 3 || !cleanCpf.startsWith(inputDigits.slice(0, 3))) {
          return res.status(403).json({
            success: false,
            error: 'Os 3 primeiros dígitos do CPF não conferem com o cadastro.'
          });
        }
      } else if (cleanPhone.length >= 4) {
        if (inputDigits.length < 4 || !cleanPhone.endsWith(inputDigits.slice(-4))) {
          return res.status(403).json({
            success: false,
            error: 'Os 4 últimos dígitos do telefone não conferem com o cadastro.'
          });
        }
      }

      res.json({
        success: true,
        fullName: card.customer_name,
        simpleStatement
      });
    } catch (err) {
      console.error('[Crediário Público] Erro em POST /public/account/unlock:', err);
      res.status(500).json({ success: false, error: 'Erro ao validar confirmação.' });
    }
  });

  /**
   * POST /public/account/:token/pix
   * Gera QR Code PIX Copia e Cola atualizado para pagamento Total ou Parcial.
   */
  router.post('/public/account/:token/pix', (req, res) => {
    try {
      const statement = unified.buildClientStatementByToken(db, req.params.token);
      if (!statement || !statement.card) {
        return res.status(404).json({ success: false, error: 'Conta não encontrada.' });
      }

      const config = unified.getCrediarioConfig(db);
      if (!config.pixKey) {
        return res.status(400).json({ success: false, error: 'Chave PIX da farmácia não configurada.' });
      }

      const requested = req.body?.amount !== undefined
        ? unified.round2(req.body.amount)
        : statement.financials.totalBalance;

      if (!requested || requested <= 0 || requested > 50000) {
        return res.status(400).json({ success: false, error: 'Informe um valor válido entre R$ 0,01 e R$ 50.000,00.' });
      }

      const brcode = generatePixBrCode({
        pixKey: config.pixKey,
        merchantName: config.pixMerchantName,
        merchantCity: config.pixMerchantCity,
        amount: requested,
        txid: `BFCREDIARIO${statement.card.id}`
      });

      res.json({
        success: true,
        amount: requested,
        pixKey: config.pixKey,
        merchantName: config.pixMerchantName,
        brcode
      });
    } catch (err) {
      console.error('[Crediário Público] Erro ao gerar PIX:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /public/lookup
   * Localiza o link pessoal (/minha-conta/:token) a partir do CPF ou Telefone digitado pelo cliente.
   */
  router.post('/public/lookup', (req, res) => {
    try {
      unified.ensurePortalTokens(db);
      const digits = unified.sanitizeDigits(req.body?.identifier);
      if (digits.length < 8) {
        return res.status(400).json({
          success: false,
          found: false,
          error: 'Digite seu CPF completo (11 dígitos) ou telefone com DDD.'
        });
      }

      const cards = db.prepare('SELECT id, customer_name, cpf, phone, phone_fixed, portal_token FROM belafarma_cards').all();
      const tail8 = digits.slice(-8);

      const matches = cards.filter(c => {
        const cCpf = unified.sanitizeDigits(c.cpf);
        const cPhone = unified.sanitizeDigits(c.phone);
        const cFixed = unified.sanitizeDigits(c.phone_fixed);

        if (digits.length >= 11 && cCpf === digits) return true;
        if (cPhone && (cPhone === digits || cPhone.endsWith(tail8) || digits.endsWith(cPhone.slice(-8)))) {
          if (cPhone.slice(-8) === tail8) return true;
        }
        if (cFixed && cFixed.endsWith(tail8)) return true;
        return false;
      });

      if (matches.length === 0) {
        return res.status(404).json({
          success: false,
          found: false,
          error: 'Não encontramos crediário com este CPF ou telefone. Fale com a farmácia pelo WhatsApp.'
        });
      }

      const chosen = matches[0];
      const firstName = String(chosen.customer_name || 'Cliente').trim().split(/\s+/)[0];
      res.json({
        success: true,
        found: true,
        token: chosen.portal_token,
        firstName
      });
    } catch (err) {
      console.error('[Crediário Público] Erro em /public/lookup:', err);
      res.status(500).json({ success: false, found: false, error: 'Erro interno na consulta.' });
    }
  });

  /**
   * GET /public/by-invoice/:invoiceId
   * Compatibilidade com links antigos (/fatura/:invoiceId) redirecionando para portal_token.
   */
  router.get('/public/by-invoice/:invoiceId', (req, res) => {
    try {
      unified.ensurePortalTokens(db);
      const { invoiceId } = req.params;
      const inv = db.prepare('SELECT card_id FROM card_invoices WHERE id = ?').get(invoiceId);
      if (!inv) {
        return res.status(404).json({ success: false, error: 'Fatura não encontrada.' });
      }
      const card = db.prepare('SELECT portal_token FROM belafarma_cards WHERE id = ?').get(inv.card_id);
      if (!card || !card.portal_token) {
        return res.status(404).json({ success: false, error: 'Conta não encontrada.' });
      }
      res.json({ success: true, token: card.portal_token });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // ROTAS AUTENTICADAS (OPERADOR + ADMINISTRADOR)
  // ============================================================================

  router.get('/summary-badge', (req, res) => {
    try {
      const { kpis } = unified.listUnifiedClients(db, { onlyRecentPurchases: true });
      res.json({
        success: true,
        hasOverdue: kpis.overdueClientsCount > 0,
        overdueCount: kpis.overdueClientsCount,
        totalOverdue: kpis.totalOverdue
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/clients', (req, res) => {
    try {
      const { q = '', filter = 'all', recentOnly, yearOnly, includeInactive } = req.query;
      const onlyRecentPurchases =
        recentOnly !== '0' &&
        recentOnly !== 'false' &&
        yearOnly !== '0' &&
        yearOnly !== 'false' &&
        includeInactive !== '1' &&
        includeInactive !== 'true' &&
        filter !== 'todos_cadastros';
      const normalizedFilter = filter === 'todos_cadastros' ? 'all' : filter;
      const result = unified.listUnifiedClients(db, { q, filter: normalizedFilter, onlyRecentPurchases });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[Crediário Unificado] Erro ao listar clientes:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/transactions', (req, res) => {
    try {
      const { periodDays, q = '', recentOnly } = req.query;
      const rawParsed = periodDays === undefined ? 60 : parseInt(periodDays, 10);
      const parsedDays = Number.isNaN(rawParsed) ? 60 : rawParsed;
      const onlyRecentClients = recentOnly !== '0' && recentOnly !== 'false';
      const result = unified.listUnifiedTransactions(db, {
        periodDays: parsedDays,
        q,
        onlyRecentClients
      });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[Crediário Unificado] Erro ao listar lançamentos:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/clients/:id/profile', (req, res) => {
    try {
      const statement = unified.buildClientStatement(db, req.params.id);
      if (!statement) {
        return res.status(404).json({ success: false, error: 'Cliente de crediário não encontrado.' });
      }
      res.json({ success: true, ...statement });
    } catch (err) {
      console.error('[Crediário Unificado] Erro ao abrir perfil:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/clients', (req, res) => {
    try {
      const body = req.body || {};
      const cleanName = String(body.customer_name || body.customerName || '').trim().toUpperCase();
      if (!cleanName) {
        return res.status(400).json({ success: false, error: 'Nome do cliente é obrigatório.' });
      }

      const isAdmin = security.isAdminUser(req.user);
      const cleanCpf = unified.sanitizeDigits(body.cpf);
      const cleanPhone = unified.sanitizeDigits(body.phone);
      const limit = isAdmin ? Math.max(50, Number(body.credit_limit ?? body.creditLimit ?? 300)) : 300;
      const dueDay = Number(body.due_day ?? body.dueDay ?? 20);
      const clampedDueDay = dueDay >= 1 && dueDay <= 28 ? dueDay : 20;
      const dueDayMode = body.due_day_mode === 'fixed' ? 'fixed' : 'auto';
      const token = crypto.randomBytes(12).toString('hex');
      const cardNumber = `5489 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`;

      const custId = `cust_${Date.now()}`;
      db.prepare(`
        INSERT INTO customers (id, name, nickname, cpf, phone, email, address, notes, creditLimit, dueDay, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
      `).run(
        custId,
        cleanName,
        String(body.nickname || '').trim(),
        cleanCpf || null,
        cleanPhone || null,
        String(body.email || '').trim() || null,
        String(body.address || '').trim() || null,
        String(body.notes || '').trim() || null,
        limit,
        clampedDueDay
      );

      const buyersArr = Array.isArray(body.authorized_buyers)
        ? body.authorized_buyers.map(s => String(s).trim().toUpperCase()).filter(Boolean)
        : [];

      const info = db.prepare(`
        INSERT INTO belafarma_cards (
          customer_id, portal_token, customer_name, nickname, phone, phone_fixed,
          cpf, rg, birth_date, email, address, address_number, address_complement,
          neighborhood, city, state, zip_code, address_reference, responsible_name,
          authorized_buyers, card_number, credit_limit, used_limit, due_day, due_day_mode,
          closing_offset_days, status, notes, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, 0, ?, ?,
          10, 'active', ?, datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `).run(
        custId,
        token,
        cleanName,
        String(body.nickname || '').trim(),
        cleanPhone,
        unified.sanitizeDigits(body.phone_fixed),
        cleanCpf || null,
        String(body.rg || '').trim(),
        String(body.birth_date || '').trim(),
        String(body.email || '').trim(),
        String(body.address || '').trim(),
        String(body.address_number || '').trim(),
        String(body.address_complement || '').trim(),
        String(body.neighborhood || '').trim(),
        String(body.city || '').trim(),
        String(body.state || '').trim(),
        unified.sanitizeDigits(body.zip_code),
        String(body.address_reference || '').trim(),
        String(body.responsible_name || '').trim(),
        JSON.stringify(buyersArr),
        cardNumber,
        limit,
        clampedDueDay,
        dueDayMode,
        String(body.notes || '').trim()
      );

      const profile = unified.buildClientStatement(db, info.lastInsertRowid);
      res.status(201).json({ success: true, message: 'Cliente cadastrado no crediário com sucesso!', ...profile });
    } catch (err) {
      console.error('[Crediário Unificado] Erro ao criar cliente:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/clients/:id', (req, res) => {
    try {
      const card = db.prepare('SELECT * FROM belafarma_cards WHERE id = ?').get(req.params.id);
      if (!card) {
        return res.status(404).json({ success: false, error: 'Conta não encontrada.' });
      }

      const body = req.body || {};
      const isAdmin = security.isAdminUser(req.user);

      // Verificar campos exclusivos de Administrador
      if (!isAdmin) {
        const triesLimit = body.credit_limit !== undefined && Number(body.credit_limit) !== Number(card.credit_limit);
        const triesDueDay = body.due_day !== undefined && Number(body.due_day) !== Number(card.due_day);
        const triesDueMode = body.due_day_mode !== undefined && String(body.due_day_mode) !== String(card.due_day_mode || 'auto');
        const triesExempt = body.interest_exempt !== undefined && Boolean(body.interest_exempt) !== Boolean(Number(card.interest_exempt));
        const triesStatus = body.status !== undefined && String(body.status) !== String(card.status);

        if (triesLimit || triesDueDay || triesDueMode || triesExempt || triesStatus) {
          return res.status(403).json({
            success: false,
            error: 'Apenas Administradores podem alterar limite, dia de vencimento, isenção de juros ou bloqueio.',
            code: 'FORBIDDEN_ADMIN_ONLY'
          });
        }
      }

      const cleanName = body.customer_name ? String(body.customer_name).trim().toUpperCase() : card.customer_name;
      const cleanCpf = body.cpf !== undefined ? (unified.sanitizeDigits(body.cpf) || null) : card.cpf;
      const cleanPhone = body.phone !== undefined ? unified.sanitizeDigits(body.phone) : card.phone;
      const buyersArr = body.authorized_buyers !== undefined
        ? (Array.isArray(body.authorized_buyers)
          ? body.authorized_buyers.map(s => String(s).trim().toUpperCase()).filter(Boolean)
          : String(body.authorized_buyers).split(',').map(s => s.trim().toUpperCase()).filter(Boolean))
        : JSON.parse(card.authorized_buyers || '[]');

      const nextLimit = isAdmin && body.credit_limit !== undefined ? Number(body.credit_limit) : card.credit_limit;
      const nextDueDay = isAdmin && body.due_day !== undefined ? Math.min(28, Math.max(1, Number(body.due_day) || 20)) : card.due_day;
      const nextDueMode = isAdmin && body.due_day_mode !== undefined ? (body.due_day_mode === 'fixed' ? 'fixed' : 'auto') : (card.due_day_mode || 'auto');
      const nextExempt = isAdmin && body.interest_exempt !== undefined ? (body.interest_exempt ? 1 : 0) : Number(card.interest_exempt || 0);
      const nextExemptReason = isAdmin && body.interest_exempt_reason !== undefined ? String(body.interest_exempt_reason || '') : (card.interest_exempt_reason || '');
      const nextStatus = isAdmin && body.status !== undefined ? String(body.status) : card.status;

      db.prepare(`
        UPDATE belafarma_cards
        SET customer_name = ?,
            nickname = ?,
            cpf = ?,
            phone = ?,
            phone_fixed = ?,
            rg = ?,
            birth_date = ?,
            email = ?,
            address = ?,
            address_number = ?,
            address_complement = ?,
            neighborhood = ?,
            city = ?,
            state = ?,
            zip_code = ?,
            address_reference = ?,
            responsible_name = ?,
            authorized_buyers = ?,
            notes = ?,
            credit_limit = ?,
            due_day = ?,
            due_day_mode = ?,
            interest_exempt = ?,
            interest_exempt_reason = ?,
            status = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        cleanName,
        body.nickname !== undefined ? String(body.nickname).trim() : (card.nickname || ''),
        cleanCpf,
        cleanPhone,
        body.phone_fixed !== undefined ? unified.sanitizeDigits(body.phone_fixed) : (card.phone_fixed || ''),
        body.rg !== undefined ? String(body.rg).trim() : (card.rg || ''),
        body.birth_date !== undefined ? String(body.birth_date).trim() : (card.birth_date || ''),
        body.email !== undefined ? String(body.email).trim() : (card.email || ''),
        body.address !== undefined ? String(body.address).trim() : (card.address || ''),
        body.address_number !== undefined ? String(body.address_number).trim() : (card.address_number || ''),
        body.address_complement !== undefined ? String(body.address_complement).trim() : (card.address_complement || ''),
        body.neighborhood !== undefined ? String(body.neighborhood).trim() : (card.neighborhood || ''),
        body.city !== undefined ? String(body.city).trim() : (card.city || ''),
        body.state !== undefined ? String(body.state).trim() : (card.state || ''),
        body.zip_code !== undefined ? unified.sanitizeDigits(body.zip_code) : (card.zip_code || ''),
        body.address_reference !== undefined ? String(body.address_reference).trim() : (card.address_reference || ''),
        body.responsible_name !== undefined ? String(body.responsible_name).trim() : (card.responsible_name || ''),
        JSON.stringify(buyersArr),
        body.notes !== undefined ? String(body.notes).trim() : (card.notes || ''),
        nextLimit,
        nextDueDay,
        nextDueMode,
        nextExempt,
        nextExemptReason,
        nextStatus,
        card.id
      );

      if (card.customer_id) {
        try {
          db.prepare(`
            UPDATE customers
            SET name = ?, cpf = COALESCE(?, cpf), phone = COALESCE(NULLIF(?, ''), phone),
                creditLimit = ?, dueDay = ?, updatedAt = datetime('now', 'localtime')
            WHERE id = ?
          `).run(cleanName, cleanCpf, cleanPhone, nextLimit, nextDueDay, card.customer_id);
        } catch (_) {}
      }

      const updated = unified.buildClientStatement(db, card.id);
      res.json({ success: true, message: 'Ficha atualizada com sucesso!', ...updated });
    } catch (err) {
      console.error('[Crediário Unificado] Erro ao atualizar cliente:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/clients/:id/purchase', async (req, res) => {
    try {
      const isAdmin = security.isAdminUser(req.user);
      const { amount, unitPrice, quantity, description, buyerName, saleId, dueDate, bypassLock, isAnnotation } = req.body || {};
      const resPurchase = await unified.createPurchaseWithDigifarmaSync(db, {
        cardId: req.params.id,
        amount,
        unitPrice,
        quantity,
        description,
        buyerName,
        saleId,
        dueDate,
        createdBy: req.user?.name || 'Balcão',
        bypassLock: isAdmin && Boolean(bypassLock),
        isAnnotation: Boolean(isAnnotation)
      }, { queryDigifarmaFn: options.queryDigifarmaFn });
      const statement = unified.buildClientStatement(db, req.params.id);
      res.json({ ...resPurchase, statement });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.delete('/clients/:id/purchases/:purchaseId', async (req, res) => {
    try {
      const isAdmin = security.isAdminUser(req.user);
      const result = await unified.deleteLocalPurchase(db, {
        cardId: req.params.id,
        purchaseId: req.params.purchaseId,
        isAdmin,
        queryDigifarmaFn: options.queryDigifarmaFn
      });
      const statement = unified.buildClientStatement(db, req.params.id);
      res.json({ ...result, statement });
    } catch (err) {
      if (err.code === 'FORBIDDEN_DELETE_OLD_PURCHASE') {
        return res.status(403).json({
          success: false,
          error: err.message,
          code: 'FORBIDDEN_ADMIN_ONLY'
        });
      }
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post('/clients/:id/receive', async (req, res) => {
    try {
      const isAdmin = security.isAdminUser(req.user);
      const {
        amount,
        paymentMethod = 'DINHEIRO',
        waiveInterest = false,
        waivedInterestAmount = 0,
        itemIds = [],
        notes = ''
      } = req.body || {};

      const result = await unified.receiveCrediarioPayment(db, {
        cardId: req.params.id,
        amount,
        paymentMethod,
        waiveInterest: Boolean(waiveInterest),
        waivedInterestAmount,
        itemIds,
        notes,
        operatorName: req.user?.name || 'Balcão',
        isAdmin
      }, { queryDigifarmaFn: options.queryDigifarmaFn });

      res.json(result);
    } catch (err) {
      if (err.message === 'FORBIDDEN_WAIVE_INTEREST') {
        return res.status(403).json({
          success: false,
          error: 'Apenas Administradores podem abonar ou descontar juros.',
          code: 'FORBIDDEN_ADMIN_ONLY'
        });
      }
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post('/clients/:id/whatsapp-preview', (req, res) => {
    try {
      const statement = unified.buildClientStatement(db, req.params.id);
      if (!statement) return res.status(404).json({ success: false, error: 'Cliente não encontrado.' });

      const config = unified.getCrediarioConfig(db);
      const { templateType = 'statement', saleId = '' } = req.body || {};
      const saleGroup = saleId
        ? statement.simpleStatement.purchaseGroups.find(g => String(g.saleId) === String(saleId))
        : null;

      const messageText = unified.renderWhatsAppMessage(templateType, {
        card: statement.card,
        financials: statement.financials,
        simpleStatement: statement.simpleStatement,
        saleGroup,
        config
      });

      const cleanPhone = unified.normalizePhoneBr(statement.card.phone);
      const waMeUrl = cleanPhone
        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`
        : `https://wa.me/?text=${encodeURIComponent(messageText)}`;

      res.json({
        success: true,
        messageText,
        phone: statement.card.phone,
        waMeUrl,
        portalUrl: statement.portalUrl
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/clients/:id/send-whatsapp', async (req, res) => {
    try {
      const { phone, templateType = 'statement', saleId = '', messageText, channel = 'auto' } = req.body || {};
      if (!messageText || !String(messageText).trim()) {
        return res.status(400).json({ success: false, error: 'Texto da mensagem é obrigatório.' });
      }
      const result = await unified.sendCrediarioWhatsApp(db, {
        cardId: req.params.id,
        phone,
        templateType,
        saleId,
        messageText,
        channel,
        sentBy: req.user?.name || 'Balcão'
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/clients/:id/print', async (req, res) => {
    try {
      const mode = req.body?.mode === 'complete' ? 'complete' : 'simple';
      const statement = unified.buildClientStatement(db, req.params.id);
      if (!statement) {
        return res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
      }

      const htmlContent = unified.buildThermalReceiptHtml(statement, mode);
      let queued = false;
      let printerError = null;
      try {
        const { enfileirarJobImpressao } = require('./services/printer.service');
        await enfileirarJobImpressao({
          title: `Extrato ${mode === 'simple' ? 'Simples' : 'Completo'} - ${statement.card.customer_name}`,
          html_content: htmlContent,
          print_type: 'EXTRATO_CREDIARIO',
          origin_user: req.user?.name || 'Balcão'
        });
        queued = true;
      } catch (errPrinter) {
        printerError = errPrinter.message;
      }

      res.json({
        success: true,
        queued,
        printerError,
        htmlContent,
        message: queued
          ? 'Extrato enviado para a impressora térmica 80mm!'
          : 'Extrato gerado (impressora térmica não detectada na fila).'
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/sync', async (req, res) => {
    try {
      const notify = Boolean(req.body?.notifyNewPurchases);
      const result = await unified.syncAllFromDigifarma(db, {
        notifyNewPurchases: notify,
        queryDigifarmaFn: options.queryDigifarmaFn
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // ROTAS EXCLUSIVAS DO ADMINISTRADOR
  // ============================================================================

  router.post('/maintenance/unify-duplicates', requireAdminMw, async (req, res) => {
    try {
      const dryRun = Boolean(req.body?.dryRun);
      const shouldReconcile = !dryRun && req.body?.reconcileDigifarma !== false;
      const report = unified.unifyDuplicateCustomersAndCards(db, { dryRun });
      let reconciliation = null;
      if (shouldReconcile) {
        try {
          reconciliation = await unified.reconcilePendingLocalPurchasesToDigifarma(db, {
            queryDigifarmaFn: options.queryDigifarmaFn
          });
        } catch (recErr) {
          reconciliation = { error: recErr.message };
        }
      }
      res.json({ success: true, report, reconciliation });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/settings', requireAdminMw, (req, res) => {
    try {
      const config = unified.getCrediarioConfig(db);
      let whatsappStatus = { connected: false };
      try {
        const baileys = require('./baileys-service');
        if (typeof baileys.getStatus === 'function') {
          whatsappStatus = baileys.getStatus();
        }
      } catch (_) {}

      res.json({
        success: true,
        config,
        whatsappStatus,
        sync: db.prepare("SELECT * FROM digifarma_sync_metadata WHERE tabela = 'crediario'").get() || null
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/settings', requireAdminMw, (req, res) => {
    try {
      const updated = unified.saveCrediarioConfig(db, req.body || {});
      res.json({ success: true, message: 'Regras e configurações salvas com sucesso!', config: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/clients/:id/toggle-block', requireAdminMw, (req, res) => {
    try {
      const card = db.prepare('SELECT id, status FROM belafarma_cards WHERE id = ?').get(req.params.id);
      if (!card) return res.status(404).json({ success: false, error: 'Conta não encontrada.' });

      const nextStatus = card.status === 'blocked' || card.status === 'blocked_late' ? 'active' : 'blocked';
      db.prepare("UPDATE belafarma_cards SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
        .run(nextStatus, card.id);

      const statement = unified.buildClientStatement(db, card.id);
      res.json({
        success: true,
        status: nextStatus,
        message: nextStatus === 'blocked' ? 'Crediário bloqueado manualmente.' : 'Crediário desbloqueado com sucesso!',
        statement
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/clients/:id/regenerate-token', requireAdminMw, (req, res) => {
    try {
      const card = db.prepare('SELECT id FROM belafarma_cards WHERE id = ?').get(req.params.id);
      if (!card) return res.status(404).json({ success: false, error: 'Conta não encontrada.' });

      const newToken = crypto.randomBytes(12).toString('hex');
      db.prepare("UPDATE belafarma_cards SET portal_token = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
        .run(newToken, card.id);

      const config = unified.getCrediarioConfig(db);
      res.json({
        success: true,
        portalToken: newToken,
        portalUrl: `${config.publicBaseUrl}/minha-conta/${newToken}`,
        message: 'Novo link do Portal do Cliente gerado!'
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = createUnifiedCrediarioEndpoints;
