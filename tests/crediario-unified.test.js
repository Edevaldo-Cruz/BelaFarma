import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const Database = backendRequire('better-sqlite3');
const express = backendRequire('express');

const security = require('../backend/security.js');
const {
  generatePixBrCode,
  crc16Ccitt,
  stripAccentsAndSanitize
} = require('../backend/utils/pix-brcode.js');
const unified = require('../backend/services/crediario-unified.service.js');
const createUnifiedCrediarioEndpoints = require('../backend/crediario-unified-endpoints.js');

describe('Crediário Unificado Bela Farma — PIX, Motor Financeiro, Extratos & Segurança', () => {
  describe('1. Gerador EMVCo PIX BR Code', () => {
    it('PIX-01: Gera payload EMVCo válido com CRC16-CCITT correto, valor exato e remoção de acentos', () => {
      const code = generatePixBrCode({
        pixKey: '31.144.152/0001-44',
        merchantName: 'BELA FARMA SÃO JOSÉ',
        merchantCity: 'JUIZ DE FORA',
        amount: 144.28,
        txid: 'BFCREDIARIO38'
      });

      assert.ok(code.startsWith('000201'), 'Deve iniciar com Payload Format Indicator 000201');
      assert.ok(code.includes('31144152000144'), 'CNPJ deve ser sanitizado para apenas dígitos');
      assert.ok(code.includes('5406144.28'), 'Valor 144.28 deve estar formatado na tag 54');
      assert.ok(!/[ÃÁÀÉÍÓÚÇ]/i.test(code), 'Não pode conter caracteres acentuados no BR Code');

      const withoutCrcValue = code.slice(0, -4);
      const crcHex = code.slice(-4);
      assert.match(crcHex, /^[0-9A-F]{4}$/);
      assert.strictEqual(crcHex, crc16Ccitt(withoutCrcValue));
    });

    it('PIX-02: stripAccentsAndSanitize normaliza pontuação e respeita limite máximo de caracteres', () => {
      const normalized = stripAccentsAndSanitize('Água São Lourenço #123!', 15);
      assert.strictEqual(normalized, 'AGUA SAO LOUREN');
    });
  });

  describe('2. Motor Financeiro (Juros, Multa, Carência, Isenção e Dia Fixo)', () => {
    const nowRef = new Date('2026-11-22T12:00:00'); // 12 dias após 2026-11-10
    const baseCard = {
      id: 1,
      credit_limit: 500,
      due_day: 20,
      due_day_mode: 'auto',
      closing_offset_days: 10,
      interest_exempt: 0,
      status: 'active',
      local_credit_balance: 0
    };
    const overdueItem = [
      {
        id: 'item1',
        quantidade: 1,
        preco_unitario: 100,
        valor: 100,
        data_compra: '2026-10-10',
        data_vencimento: '2026-11-10',
        produto_nome: 'LOSARTANA 50MG',
        venda_nota_id: 9001
      }
    ];

    it('FIN-01: Com juros DESLIGADOS, totalCharges é 0 mas simulatedCharges calcula corretamente', () => {
      const fin = unified.calculateAccountFinancials(
        baseCard,
        overdueItem,
        [],
        {
          interestEnabled: false,
          lateFinePercent: 2,
          lateInterestMonthlyPercent: 3,
          graceDays: 5,
          autoBlockDays: 0
        },
        nowRef
      );

      assert.strictEqual(fin.principalBalance, 100);
      assert.strictEqual(fin.maxDaysLate, 12);
      assert.strictEqual(fin.totalCharges, 0);
      assert.strictEqual(fin.totalBalance, 100);
      // 2% multa = 2.00; 3%/30 * 12d = 1.20 -> simulated = 3.20
      assert.strictEqual(fin.simulatedFine, 2);
      assert.strictEqual(fin.simulatedInterest, 1.2);
      assert.strictEqual(fin.simulatedCharges, 3.2);
      assert.strictEqual(fin.accountStatus, 'vencido');
    });

    it('FIN-02: Respeita dias de carência (graceDays) mesmo quando interestEnabled está ligado', () => {
      const recentOverdue = [
        {
          id: 'item_grace',
          quantidade: 1,
          preco_unitario: 100,
          valor: 100,
          data_compra: '2026-10-20',
          data_vencimento: '2026-11-18', // 4 dias de atraso (carência 5d)
          produto_nome: 'DIPIRONA 1G'
        }
      ];

      const fin = unified.calculateAccountFinancials(
        baseCard,
        recentOverdue,
        [],
        {
          interestEnabled: true,
          lateFinePercent: 2,
          lateInterestMonthlyPercent: 3,
          graceDays: 5,
          autoBlockDays: 0
        },
        nowRef
      );

      assert.strictEqual(fin.maxDaysLate, 4);
      assert.strictEqual(fin.totalCharges, 0);
      assert.strictEqual(fin.simulatedCharges, 0);
      assert.strictEqual(fin.totalBalance, 100);
    });

    it('FIN-03: Com juros LIGADOS além da carência, aplica multa + juros pro-rata no saldo total', () => {
      const fin = unified.calculateAccountFinancials(
        baseCard,
        overdueItem,
        [],
        {
          interestEnabled: true,
          lateFinePercent: 2,
          lateInterestMonthlyPercent: 3,
          graceDays: 5,
          autoBlockDays: 0
        },
        nowRef
      );

      assert.strictEqual(fin.chargesApplied, true);
      assert.strictEqual(fin.lateFine, 2);
      assert.strictEqual(fin.lateInterest, 1.2);
      assert.strictEqual(fin.totalCharges, 3.2);
      assert.strictEqual(fin.totalBalance, 103.2);
    });

    it('FIN-04: Cliente com interest_exempt = 1 fica isento mesmo com juros LIGADOS', () => {
      const fin = unified.calculateAccountFinancials(
        { ...baseCard, interest_exempt: 1 },
        overdueItem,
        [],
        {
          interestEnabled: true,
          lateFinePercent: 2,
          lateInterestMonthlyPercent: 3,
          graceDays: 5,
          autoBlockDays: 0
        },
        nowRef
      );

      assert.strictEqual(fin.interestExempt, true);
      assert.strictEqual(fin.chargesApplied, false);
      assert.strictEqual(fin.totalCharges, 0);
      assert.strictEqual(fin.totalBalance, 100);
    });

    it('FIN-05: Vencimento com due_day_mode = fixed calcula pelo dia fixo da ficha ignorando data_vencimento', () => {
      const fixedCard = {
        ...baseCard,
        due_day: 25,
        due_day_mode: 'fixed',
        closing_offset_days: 10 // dia de corte 15
      };
      const items = [
        {
          id: 'item_fixed',
          quantidade: 1,
          preco_unitario: 50,
          valor: 50,
          data_compra: '2026-11-10', // <= 15 -> vence dia 25 do mesmo mês (2026-11-25)
          data_vencimento: '2026-12-10',
          produto_nome: 'OMEPRAZOL 20MG'
        }
      ];

      const fin = unified.calculateAccountFinancials(
        fixedCard,
        items,
        [],
        { interestEnabled: false, graceDays: 5, lateFinePercent: 2, lateInterestMonthlyPercent: 1 },
        nowRef
      );

      assert.strictEqual(fin.nextDueDate, '2026-11-25');
      assert.strictEqual(fin.accountStatus, 'em_dia');
    });
  });

  describe('3. Extrato Simples para Idosos (Cenários Reni e Simone)', () => {
    let memDb;

    before(() => {
      memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);

      // Inserir Reni (id 1, digifarma 38) - quitação total em 2026-11-13 + 2 compras posteriores
      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES (1, '38', 38, 'token_reni_0123456789abcdef', 'RENI APARECIDA SANTOS', '18999887766', '12345678901',
          '5489 1111 2222 3333', 600, 20, 'active')
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_pagamentos_cache (
          contrec_id, cliente_id, total_debito, valor_pago, tipo_pag, data_pag, dinheiro
        ) VALUES (1001, 38, 134.83, 134.83, 'T', '2026-11-13', 134.83)
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (
          id, cliente_id, cliente_nome, valor, data_compra, data_vencimento, venda_nota_id,
          produto_nome, quantidade, preco_unitario, comprador
        ) VALUES
        ('df_93753_1', 38, 'RENI APARECIDA SANTOS', 84.28, '2026-11-14', '2026-12-14', 93753, 'GLIFAGE XR 500MG', 2, 42.14, 'YASMIM'),
        ('df_93835_1', 38, 'RENI APARECIDA SANTOS', 60.00, '2026-11-16', '2026-12-16', 93835, 'VITAMINA D 2000UI', 1, 60.00, 'RENI')
      `).run();

      // Inserir Simone (id 2, digifarma 34) - pagamento parcial
      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES (2, '34', 34, 'token_simone_0123456789abcd', 'SIMONE PEREIRA LIMA', '18991112222', '',
          '5489 4444 5555 6666', 3000, 20, 'active')
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_pagamentos_cache (
          contrec_id, cliente_id, total_debito, valor_pago, tipo_pag, data_pag, dinheiro
        ) VALUES (1002, 34, 3533.94, 1470.00, 'P', '2026-11-04', 1470.00)
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (
          id, cliente_id, cliente_nome, valor, data_compra, data_vencimento, venda_nota_id,
          produto_nome, quantidade, preco_unitario, comprador
        ) VALUES
        ('df_sim_1', 34, 'SIMONE PEREIRA LIMA', 120.50, '2026-11-06', '2026-12-06', 93900, 'INSULINA GLARGINA', 1, 120.50, 'SIMONE')
      `).run();
    });

    after(() => {
      if (memDb) memDb.close();
    });

    it('EXT-01: Cenário Reni exibe marco zeroed (conta totalmente zerada) e compras agrupadas por venda/comprador', () => {
      const statement = unified.buildClientStatement(memDb, 1);
      assert.strictEqual(statement.financials.principalBalance, 144.28);
      assert.strictEqual(statement.simpleStatement.milestone.type, 'zeroed');
      assert.match(statement.simpleStatement.milestone.label, /13\/11\/2026/);
      assert.strictEqual(statement.simpleStatement.purchaseGroups.length, 2);
      assert.strictEqual(statement.simpleStatement.purchaseGroups[0].buyerName, 'YASMIM');
      assert.strictEqual(statement.simpleStatement.purchaseGroups[0].subtotal, 84.28);
      assert.strictEqual(statement.simpleStatement.purchaseGroups[1].buyerName, 'RENI');
      assert.strictEqual(statement.simpleStatement.purchaseGroups[1].subtotal, 60);
    });

    it('EXT-02: Cenário Simone sem quitação total recente exibe marco last_payment (último pagamento parcial)', () => {
      const statement = unified.buildClientStatement(memDb, 2);
      assert.strictEqual(statement.financials.principalBalance, 120.5);
      assert.strictEqual(statement.simpleStatement.milestone.type, 'last_payment');
      assert.match(statement.simpleStatement.milestone.label, /04\/11\/2026/);
    });
  });

  describe('4. Endpoints Express, Portal Público LGPD & RBAC Operador vs Admin', () => {
    let memDb;
    let server;
    let baseUrl;
    const tokenReni = 'tok_reni_public_1234567890abcd';
    let opToken;
    let adminToken;

    before(async () => {
      memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);

      // Salva config inicial com chave PIX para teste
      unified.saveCrediarioConfig(memDb, {
        pixKey: '31144152000144',
        pixMerchantName: 'BELAFARMA SUL',
        pixMerchantCity: 'JUIZ DE FORA',
        interestEnabled: true,
        lateFinePercent: 2,
        lateInterestMonthlyPercent: 3,
        graceDays: 5
      });

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES (1, '38', 38, ?, 'RENI APARECIDA SANTOS', '18999887766', '12345678901',
          '5489 1111 2222 3333', 600, 20, 'active')
      `).run(tokenReni);

      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (
          id, cliente_id, cliente_nome, valor, data_compra, data_vencimento, venda_nota_id,
          produto_nome, quantidade, preco_unitario, comprador
        ) VALUES
        ('df_pub_1', 38, 'RENI APARECIDA SANTOS', 150.00, '2026-10-01', '2026-11-01', 95001, 'MEDICAMENTO CONFIDENCIAL ABC', 1, 150.00, 'YASMIM')
      `).run();

      opToken = security.signToken({ id: 'op-1', name: 'Caixa Operador', role: 'Operador' });
      adminToken = security.signToken({ id: 'adm-1', name: 'Edevaldo', role: 'Administrador' });

      const app = express();
      app.use(express.json());
      app.use('/api', security.apiAuthMiddleware);
      app.use('/api/crediario-v2', createUnifiedCrediarioEndpoints(memDb));

      await new Promise(resolve => {
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    after(async () => {
      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
      if (memDb) memDb.close();
    });

    it('API-01: Portal público por token funciona sem JWT, oculta medicamentos e não vaza dígitos de unlock no maskedHint', async () => {
      const res = await fetch(`${baseUrl}/api/crediario-v2/public/account/${tokenReni}`);
      assert.strictEqual(res.status, 200);

      const rawText = await res.text();
      assert.ok(!rawText.includes('MEDICAMENTO CONFIDENCIAL'), 'Nunca pode vazar nomes de medicamentos antes do unlock');

      const data = JSON.parse(rawText);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.account.firstName, 'RENI');
      assert.strictEqual(data.account.unlockMethod, 'cpf');
      assert.ok(!String(data.account.maskedHint || '').includes('123'), 'maskedHint não pode expor os 3 primeiros dígitos do CPF');
      assert.ok(data.account.pix.brcode.startsWith('000201'));
    });

    it('API-02: Bloqueia enumeração por ID numérico em /public/account/:token (retorna 404)', async () => {
      const res = await fetch(`${baseUrl}/api/crediario-v2/public/account/1`);
      assert.strictEqual(res.status, 404);
    });

    it('API-03: /unlock rejeita dígitos incorretos (403) e libera Extrato Simples completo com os 3 dígitos corretos (200)', async () => {
      const badRes = await fetch(`${baseUrl}/api/crediario-v2/public/account/${tokenReni}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digits: '999' })
      });
      assert.strictEqual(badRes.status, 403);

      const okRes = await fetch(`${baseUrl}/api/crediario-v2/public/account/${tokenReni}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digits: '123' })
      });
      assert.strictEqual(okRes.status, 200);
      const okData = await okRes.json();
      assert.strictEqual(okData.success, true);
      assert.strictEqual(okData.fullName, 'RENI APARECIDA SANTOS');
      assert.strictEqual(okData.simpleStatement.purchaseGroups[0].items[0].productName, 'MEDICAMENTO CONFIDENCIAL ABC');
    });

    it('API-04: /pix gera BR Code válido para pagamento parcial informado pelo cliente', async () => {
      const res = await fetch(`${baseUrl}/api/crediario-v2/public/account/${tokenReni}/pix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50 })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.amount, 50);
      assert.ok(data.brcode.includes('540550.00'));
    });

    it('API-05: /public/lookup localiza o token pessoal por CPF ou telefone', async () => {
      const resCpf = await fetch(`${baseUrl}/api/crediario-v2/public/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: '123.456.789-01' })
      });
      assert.strictEqual(resCpf.status, 200);
      const dataCpf = await resCpf.json();
      assert.strictEqual(dataCpf.token, tokenReni);

      const resPhone = await fetch(`${baseUrl}/api/crediario-v2/public/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: '(18) 99988-7766' })
      });
      assert.strictEqual(resPhone.status, 200);
      const dataPhone = await resPhone.json();
      assert.strictEqual(dataPhone.token, tokenReni);
    });

    it('API-06: /settings exige Administrador (403 para Operador, 200 para Administrador)', async () => {
      const opGet = await fetch(`${baseUrl}/api/crediario-v2/settings`, {
        headers: { Authorization: `Bearer ${opToken}` }
      });
      assert.strictEqual(opGet.status, 403);

      const opPut = await fetch(`${baseUrl}/api/crediario-v2/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
        body: JSON.stringify({ interestEnabled: false })
      });
      assert.strictEqual(opPut.status, 403);

      const admGet = await fetch(`${baseUrl}/api/crediario-v2/settings`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(admGet.status, 200);

      const admPut = await fetch(`${baseUrl}/api/crediario-v2/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ graceDays: 7 })
      });
      assert.strictEqual(admPut.status, 200);
      const admData = await admPut.json();
      assert.strictEqual(admData.config.graceDays, 7);
    });

    it('API-07: Operador não altera limite/isenção (403), mas edita telefone/observações (200); Administrador altera limite (200)', async () => {
      const opForbidden = await fetch(`${baseUrl}/api/crediario-v2/clients/1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
        body: JSON.stringify({ credit_limit: 9999, interest_exempt: true })
      });
      assert.strictEqual(opForbidden.status, 403);
      const errBody = await opForbidden.json();
      assert.strictEqual(errBody.code, 'FORBIDDEN_ADMIN_ONLY');

      const opAllowed = await fetch(`${baseUrl}/api/crediario-v2/clients/1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
        body: JSON.stringify({ notes: 'Prefere receber resumo pela manhã.' })
      });
      assert.strictEqual(opAllowed.status, 200);

      const admAllowed = await fetch(`${baseUrl}/api/crediario-v2/clients/1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ credit_limit: 1200, interest_exempt: true })
      });
      assert.strictEqual(admAllowed.status, 200);
      const admBody = await admAllowed.json();
      assert.strictEqual(admBody.card.credit_limit, 1200);
      assert.strictEqual(admBody.financials.interestExempt, true);
    });

    it('API-08: Abonar juros no recebimento retorna 403 para Operador e 200 para Administrador', async () => {
      const opWaive = await fetch(`${baseUrl}/api/crediario-v2/clients/1/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
        body: JSON.stringify({ amount: 50, paymentMethod: 'PIX', waiveInterest: true })
      });
      assert.strictEqual(opWaive.status, 403);
      const opBody = await opWaive.json();
      assert.strictEqual(opBody.code, 'FORBIDDEN_ADMIN_ONLY');

      const admWaive = await fetch(`${baseUrl}/api/crediario-v2/clients/1/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          amount: 50,
          paymentMethod: 'PIX',
          waiveInterest: true,
          notes: 'Abono autorizado no teste'
        })
      });
      assert.strictEqual(admWaive.status, 200);
      const admBody = await admWaive.json();
      assert.strictEqual(admBody.success, true);
    });
  });

  describe('5. Corte Global de Histórico (< 01/10/2025)', () => {
    it('CUT-01: calculateAccountFinancials desconsidera compras Digifarma e locais anteriores a 2025-10-01 e mantém >= 2025-10-01', () => {
      const card = {
        id: 10,
        credit_limit: 500,
        due_day: 20,
        due_day_mode: 'auto',
        closing_offset_days: 10,
        interest_exempt: 0,
        status: 'active',
        local_credit_balance: 0
      };
      const dfItems = [
        {
          id: 'old_df',
          quantidade: 1,
          preco_unitario: 250,
          valor: 250,
          data_compra: '2025-09-30',
          data_vencimento: '2025-10-30',
          produto_nome: 'COMPRA ANTIGA DIGIFARMA'
        },
        {
          id: 'new_df',
          quantidade: 1,
          preco_unitario: 45,
          valor: 45,
          data_compra: '2025-10-01',
          data_vencimento: '2026-12-01',
          produto_nome: 'COMPRA CORTE EXATO'
        }
      ];
      const localPurchases = [
        {
          id: 'loc_old',
          card_id: 10,
          description: 'COMPRA LOCAL ANTIGA',
          amount: 120,
          paid_amount: 0,
          status: 'open',
          purchased_at: '2025-09-15 14:20:00'
        },
        {
          id: 'loc_new',
          card_id: 10,
          description: 'COMPRA LOCAL NOVA',
          amount: 30,
          paid_amount: 0,
          status: 'open',
          purchased_at: '2025-10-05 10:00:00'
        }
      ];

      const fin = unified.calculateAccountFinancials(
        card,
        dfItems,
        localPurchases,
        { interestEnabled: false, graceDays: 5, lateFinePercent: 2, lateInterestMonthlyPercent: 1 },
        new Date('2026-11-23T12:00:00')
      );

      assert.strictEqual(fin.principalBalance, 75);
      assert.strictEqual(fin.openItemsCount, 2);
      assert.ok(fin.openItems.every(it => it.purchaseDate >= unified.CREDIARIO_CUTOFF_DATE));
    });

    it('CUT-02: ensureCrediarioUnifiedSchema limpa caches < 01/10/2025 e buildClientStatement ignora pagamentos/compras antigos', () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES (1, '77', 77, 'tok_cut_0123456789abcdef', 'CLIENTE CORTE TESTE', '18999990000', '12345678901',
          '5489 0000 1111 2222', 800, 20, 'active')
      `).run();

      // Inserir registros antigos e novos diretamente no cache + tabelas locais
      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (id, cliente_id, cliente_nome, valor, data_compra, data_vencimento, venda_nota_id, produto_nome, quantidade, preco_unitario)
        VALUES
          ('df_old_1', 77, 'CLIENTE CORTE TESTE', 500.00, '2025-09-29', '2025-10-29', 1001, 'PRODUTO SETEMBRO', 1, 500.00),
          ('df_new_1', 77, 'CLIENTE CORTE TESTE', 60.00, '2025-10-01', '2025-11-01', 1002, 'PRODUTO OUTUBRO', 1, 60.00)
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_pagamentos_cache (contrec_id, cliente_id, total_debito, valor_pago, tipo_pag, data_pag)
        VALUES
          (901, 77, 500.00, 500.00, 'T', '2025-09-25'),
          (902, 77, 100.00, 40.00, 'P', '2025-10-02')
      `).run();

      memDb.prepare(`
        INSERT INTO card_payments (card_id, amount, payment_method, paid_at, notes)
        VALUES
          (1, 200.00, 'DINHEIRO', '2025-08-15 10:00:00', 'Pagamento antigo local'),
          (1, 25.00, 'PIX', '2025-10-10 10:00:00', 'Pagamento valido local')
      `).run();

      const beforeCleanup = unified.buildClientStatement(memDb, 1);
      assert.strictEqual(beforeCleanup.financials.principalBalance, 60);
      assert.strictEqual(beforeCleanup.simpleStatement.milestone.type, 'last_payment');
      assert.match(beforeCleanup.simpleStatement.milestone.label, /10\/10\/2025/);
      assert.ok(
        beforeCleanup.completeStatement.entries.every(e => !e.date || e.date >= unified.CREDIARIO_CUTOFF_DATE),
        'Extrato completo nunca deve listar entradas anteriores a 2025-10-01'
      );

      // Rodar novamente ensureCrediarioUnifiedSchema expurga caches < 2025-10-01
      unified.ensureCrediarioUnifiedSchema(memDb);
      const cacheOld = memDb.prepare("SELECT COUNT(*) as c FROM digifarma_crediario_cache WHERE data_compra < '2025-10-01'").get().c;
      const pagOld = memDb.prepare("SELECT COUNT(*) as c FROM digifarma_crediario_pagamentos_cache WHERE data_pag < '2025-10-01'").get().c;
      assert.strictEqual(cacheOld, 0);
      assert.strictEqual(pagOld, 0);

      memDb.close();
    });

    it('CUT-03: listUnifiedClients e listUnifiedTransactions respeitam 2025-10-01 mesmo com periodDays = 9999', () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES (1, '88', 88, 'tok_tx_0123456789abcdef', 'CLIENTE TRANSACTIONS', '18999991111', '',
          '5489 2222 3333 4444', 500, 20, 'active')
      `).run();

      memDb.prepare(`
        INSERT INTO crediario_local_purchases (id, card_id, sale_id, description, amount, paid_amount, status, purchased_at)
        VALUES
          ('p_old', 1, 'S_OLD', 'ITEM ANTES DO CORTE', 99.00, 0, 'open', '2025-09-30 23:59:00'),
          ('p_new', 1, 'S_NEW', 'ITEM POS CORTE', 42.00, 0, 'open', '2025-10-01 08:00:00')
      `).run();

      memDb.prepare(`
        INSERT INTO card_payments (card_id, amount, payment_method, paid_at, notes)
        VALUES
          (1, 99.00, 'DINHEIRO', '2025-09-30 15:00:00', 'Pgto antes'),
          (1, 15.00, 'PIX', '2025-10-03 15:00:00', 'Pgto depois')
      `).run();

      const clientsList = unified.listUnifiedClients(memDb, { filter: 'all' });
      assert.strictEqual(clientsList.kpis.totalPrincipal, 42);
      assert.strictEqual(clientsList.clients[0].principal_balance, 42);

      const tx = unified.listUnifiedTransactions(memDb, { periodDays: 9999 });
      assert.strictEqual(tx.purchases.length, 1);
      assert.strictEqual(tx.purchases[0].saleId, 'S_NEW');
      assert.strictEqual(tx.payments.length, 1);
      assert.strictEqual(tx.payments[0].amount, 15);

      memDb.close();
    });

    it('MOV-01: filtro movimento_ano exibe apenas clientes com compra/pagamento/cadastro no ano atual e all mantém todos', () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);
      const yr = String(new Date().getFullYear());

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status, created_at
        ) VALUES
          (1, '101', 101, 'tok_mov_01', 'COMPRA ESTE ANO', '18999990001', '', '5489 0000 0000 0001', 500, 20, 'active', '2025-10-05 10:00:00'),
          (2, '102', 102, 'tok_mov_02', 'PAGAMENTO ESTE ANO', '18999990002', '', '5489 0000 0000 0002', 500, 20, 'active', '2025-10-05 10:00:00'),
          (3, 'cust_manual', NULL, 'tok_mov_03', 'MANUALESTE ANO', '18999990003', '', '5489 0000 0000 0003', 300, 20, 'active', '${yr}-04-01 10:00:00'),
          (4, '104', 104, 'tok_mov_04', 'SEM MOVIMENTO NO ANO', '18999990004', '', '5489 0000 0000 0004', 500, 20, 'active', '2025-10-05 10:00:00')
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (id, cliente_id, cliente_nome, valor, data_compra, data_vencimento, venda_nota_id, produto_nome, quantidade, preco_unitario)
        VALUES
          ('df_m1', 101, 'COMPRA ESTE ANO', 50.00, '${yr}-05-10', '${yr}-06-10', 2001, 'PRODUTO NOVO', 1, 50.00),
          ('df_m4', 104, 'SEM MOVIMENTO NO ANO', 80.00, '2025-11-15', '2025-12-15', 2002, 'PRODUTO 2025', 1, 80.00)
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_pagamentos_cache (contrec_id, cliente_id, total_debito, valor_pago, tipo_pag, data_pag)
        VALUES
          (801, 102, 70.00, 70.00, 'T', '${yr}-03-12'),
          (804, 104, 120.00, 40.00, 'P', '2025-11-20')
      `).run();

      const movList = unified.listUnifiedClients(memDb, { filter: 'movimento_ano' });
      const names = movList.clients.map(c => c.customer_name);
      assert.strictEqual(movList.clients.length, 3);
      assert.ok(names.includes('COMPRA ESTE ANO'));
      assert.ok(names.includes('PAGAMENTO ESTE ANO'));
      assert.ok(names.includes('MANUALESTE ANO'));
      assert.ok(!names.includes('SEM MOVIMENTO NO ANO'));
      assert.strictEqual(movList.kpis.activeThisYearClientsCount, 3);
      assert.strictEqual(movList.kpis.totalClientsCount, 4);

      const allList = unified.listUnifiedClients(memDb, { filter: 'all' });
      assert.strictEqual(allList.clients.length, 4);
      assert.ok(allList.clients.some(c => c.customer_name === 'SEM MOVIMENTO NO ANO' && c.last_movement_date === '2025-11-20'));

      memDb.close();
    });
  });
});
