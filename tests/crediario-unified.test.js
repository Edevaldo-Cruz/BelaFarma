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
      app.use(
        '/api/crediario-v2',
        createUnifiedCrediarioEndpoints(memDb, {
          queryDigifarmaFn: async () => {
            throw new Error('Digifarma offline em teste HTTP');
          }
        })
      );

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

    it('API-09: GET /clients restringe por padrão a quem comprou nos últimos 2 meses (somando tudo dele) e libera todos com recentOnly=0', async () => {
      const todayYMD = unified.toLocalDateYMD(new Date());
      const recentBuy = unified.addDaysYMD(todayYMD, -15);
      const recentDue = unified.addDaysYMD(todayYMD, 15);
      const staleBuy = unified.addDaysYMD(todayYMD, -90);
      const staleDue = unified.addDaysYMD(todayYMD, -60);

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES
          (2, '202', 202, 'tok_old_2025_only_12345678', 'CLIENTE COMPRA ANTIGA', '18999992025', '', '5489 2222 0000 0002', 500, 20, 'active'),
          (3, '203', 203, 'tok_new_year_only_12345678', 'CLIENTE ATIVO 2 MESES', '18999992026', '', '5489 2222 0000 0003', 500, 20, 'active')
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (id, cliente_id, cliente_nome, valor, data_compra, data_vencimento, venda_nota_id, produto_nome, quantidade, preco_unitario)
        VALUES
          ('df_2025', 202, 'CLIENTE COMPRA ANTIGA', 90.00, ?, ?, 96001, 'ITEM ANTIGO', 1, 90.00),
          ('df_yr_old', 203, 'CLIENTE ATIVO 2 MESES', 55.00, '2024-06-10', '2024-07-10', 96002, 'ITEM HISTORICO ANTIGO', 1, 55.00),
          ('df_yr_new', 203, 'CLIENTE ATIVO 2 MESES', 40.00, ?, ?, 96003, 'ITEM RECENTE', 1, 40.00)
      `).run(staleBuy, staleDue, recentBuy, recentDue);

      const resDefault = await fetch(`${baseUrl}/api/crediario-v2/clients?filter=all`, {
        headers: { Authorization: `Bearer ${opToken}` }
      });
      assert.strictEqual(resDefault.status, 200);
      const dataDefault = await resDefault.json();
      const cli3 = dataDefault.clients.find(c => c.id === 3);
      assert.ok(cli3, 'Cliente com compra nos últimos 2 meses deve aparecer por padrão');
      assert.strictEqual(cli3.principal_balance, 95, 'Deve considerar TODAS as compras (40 + 55 antiga) do cliente ativo');
      assert.ok(!dataDefault.clients.some(c => c.id === 2), 'Sem recentOnly=0 nao deve listar cliente sem compra nos últimos 2 meses');
      assert.strictEqual(dataDefault.kpis.onlyRecentPurchases, true);

      const resAll = await fetch(`${baseUrl}/api/crediario-v2/clients?filter=all&recentOnly=0`, {
        headers: { Authorization: `Bearer ${opToken}` }
      });
      assert.strictEqual(resAll.status, 200);
      const dataAll = await resAll.json();
      assert.ok(dataAll.clients.some(c => c.id === 2));
      assert.ok(dataAll.clients.some(c => c.id === 3));
      assert.strictEqual(dataAll.kpis.onlyRecentPurchases, false);
    });
  });

  describe('5. Elegibilidade por Compra Recente (Últimos 2 Meses) + Histórico Completo', () => {
    it('REC-01: calculateAccountFinancials considera TODAS as compras (inclusive antigas) sem cortar datas anteriores a 01/10/2025', () => {
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
          preco_unitario: 150,
          valor: 150,
          data_compra: '2024-05-10',
          data_vencimento: '2024-06-10',
          produto_nome: 'COMPRA ANTIGA DIGIFARMA'
        },
        {
          id: 'new_df',
          quantidade: 1,
          preco_unitario: 45,
          valor: 45,
          data_compra: '2026-11-05',
          data_vencimento: '2026-12-05',
          produto_nome: 'COMPRA RECENTE DIGIFARMA'
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
          purchased_at: '2025-02-15 14:20:00'
        },
        {
          id: 'loc_new',
          card_id: 10,
          description: 'COMPRA LOCAL NOVA',
          amount: 30,
          paid_amount: 0,
          status: 'open',
          purchased_at: '2026-11-10 10:00:00'
        }
      ];

      const fin = unified.calculateAccountFinancials(
        card,
        dfItems,
        localPurchases,
        { interestEnabled: false, graceDays: 5, lateFinePercent: 2, lateInterestMonthlyPercent: 1 },
        new Date('2026-11-24T12:00:00')
      );

      assert.strictEqual(fin.principalBalance, 345);
      assert.strictEqual(fin.openItemsCount, 4);
      assert.ok(fin.openItems.some(it => it.purchaseDate === '2024-05-10'));
      assert.ok(fin.openItems.some(it => it.purchaseDate === '2025-02-15'));
    });

    it('REC-02: ensureCrediarioUnifiedSchema preserva caches antigos e buildClientStatement inclui todo o histórico do cliente', () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES (1, '77', 77, 'tok_rec_0123456789abcdef', 'CLIENTE HISTORICO COMPLETO', '18999990000', '12345678901',
          '5489 0000 1111 2222', 800, 20, 'active')
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (id, cliente_id, cliente_nome, valor, data_compra, data_vencimento, venda_nota_id, produto_nome, quantidade, preco_unitario)
        VALUES
          ('df_old_1', 77, 'CLIENTE HISTORICO COMPLETO', 200.00, '2024-06-01', '2024-07-01', 1001, 'PRODUTO ANTIGO 2024', 1, 200.00),
          ('df_new_1', 77, 'CLIENTE HISTORICO COMPLETO', 60.00, '2026-11-10', '2026-12-10', 1002, 'PRODUTO RECENTE 2026', 1, 60.00)
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_pagamentos_cache (contrec_id, cliente_id, total_debito, valor_pago, tipo_pag, data_pag)
        VALUES
          (901, 77, 300.00, 300.00, 'T', '2025-01-20'),
          (902, 77, 100.00, 40.00, 'P', '2026-11-12')
      `).run();

      memDb.prepare(`
        INSERT INTO card_payments (card_id, amount, payment_method, paid_at, notes)
        VALUES (1, 50.00, 'DINHEIRO', '2025-08-15 10:00:00', 'Pagamento antigo local')
      `).run();

      unified.ensureCrediarioUnifiedSchema(memDb);
      const cacheOld = memDb.prepare("SELECT COUNT(*) as c FROM digifarma_crediario_cache WHERE data_compra < '2025-10-01'").get().c;
      const pagOld = memDb.prepare("SELECT COUNT(*) as c FROM digifarma_crediario_pagamentos_cache WHERE data_pag < '2025-10-01'").get().c;
      assert.strictEqual(cacheOld, 1, 'Não deve expurgar histórico antigo de cache');
      assert.strictEqual(pagOld, 1, 'Não deve expurgar pagamentos antigos de cache');

      const st = unified.buildClientStatement(memDb, 1);
      assert.strictEqual(st.financials.principalBalance, 260);
      assert.ok(st.completeStatement.entries.some(e => e.date === '2024-06-01'));
      assert.ok(st.completeStatement.entries.some(e => e.date === '2025-01-20'));
      assert.ok(st.completeStatement.entries.some(e => e.date === '2025-08-15'));

      memDb.close();
    });

    it('REC-03: listUnifiedClients e listUnifiedTransactions consideram apenas quem comprou nos últimos 2 meses, com todos os dados deles', () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);
      const todayYMD = unified.toLocalDateYMD(new Date());
      const recentBuy = unified.addDaysYMD(todayYMD, -10);
      const staleBuy = unified.addDaysYMD(todayYMD, -90);
      const recentPayNoBuy = unified.addDaysYMD(todayYMD, -5);

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status, created_at
        ) VALUES
          (1, '101', 101, 'tok_rec_01', 'ATIVO COM COMPRA RECENTE', '18999990001', '', '5489 0000 0000 0001', 500, 20, 'active', '2024-01-10 10:00:00'),
          (2, '102', 102, 'tok_rec_02', 'SO PAGOU RECENTE', '18999990002', '', '5489 0000 0000 0002', 500, 20, 'active', '2024-01-10 10:00:00'),
          (3, 'cust_manual', NULL, 'tok_rec_03', 'MANUAL SEM COMPRA', '18999990003', '', '5489 0000 0000 0003', 300, 20, 'active', '2026-11-01 10:00:00'),
          (4, '104', 104, 'tok_rec_04', 'COMPRA HA 90 DIAS', '18999990004', '', '5489 0000 0000 0004', 500, 20, 'active', '2024-01-10 10:00:00')
      `).run();

      // Cliente 101 tem compra antiga (2024-08-10 = 70) + compra recente (50) => saldo total 120
      // Cliente 104 tem só compra antiga (-90 dias = 80)
      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (id, cliente_id, cliente_nome, valor, data_compra, data_vencimento, venda_nota_id, produto_nome, quantidade, preco_unitario)
        VALUES
          ('df_r1_old', 101, 'ATIVO COM COMPRA RECENTE', 70.00, '2024-08-10', '2024-09-10', 2000, 'ITEM ANTIGO ATIVO', 1, 70.00),
          ('df_r1_new', 101, 'ATIVO COM COMPRA RECENTE', 50.00, ?, '2026-12-20', 2001, 'ITEM RECENTE ATIVO', 1, 50.00),
          ('df_r4', 104, 'COMPRA HA 90 DIAS', 80.00, ?, '2026-10-01', 2002, 'ITEM VELHO', 1, 80.00)
      `).run(recentBuy, staleBuy);

      // Pagamentos no mês atual para 101 (R$ 30) e 104 (R$ 25, que está fora do recorte padrão), e para 102 (R$ 70 há 5 dias, sem compra)
      memDb.prepare(`
        INSERT INTO digifarma_crediario_pagamentos_cache (contrec_id, cliente_id, total_debito, valor_pago, tipo_pag, data_pag)
        VALUES
          (801, 101, 150.00, 30.00, 'P', ?),
          (802, 102, 70.00, 70.00, 'T', ?),
          (804, 104, 120.00, 25.00, 'P', ?)
      `).run(todayYMD, recentPayNoBuy, todayYMD);

      const recList = unified.listUnifiedClients(memDb, { filter: 'all', onlyRecentPurchases: true });
      assert.strictEqual(recList.clients.length, 1);
      assert.strictEqual(recList.clients[0].customer_name, 'ATIVO COM COMPRA RECENTE');
      assert.strictEqual(recList.clients[0].principal_balance, 120, 'Saldo deve somar 70 antiga + 50 recente');
      assert.strictEqual(recList.kpis.totalPrincipal, 120);
      assert.strictEqual(recList.kpis.totalClientsCount, 1);
      assert.strictEqual(recList.kpis.allClientsCount, 4);
      assert.strictEqual(recList.kpis.paidThisMonth, 30, 'Recebido no mês no escopo ativo considera apenas clientes com compra nos últimos 2 meses');

      const allList = unified.listUnifiedClients(memDb, { filter: 'all', onlyRecentPurchases: false });
      assert.strictEqual(allList.clients.length, 4);
      assert.strictEqual(allList.kpis.totalPrincipal, 200);

      // Aba Lançamentos com periodDays = 0 ("Todo o histórico") traz todo histórico dos clientes ativos
      const txAll = unified.listUnifiedTransactions(memDb, { periodDays: 0, onlyRecentClients: true });
      assert.strictEqual(txAll.purchases.length, 2);
      assert.ok(txAll.purchases.some(p => p.date === '2024-08-10'));
      assert.strictEqual(txAll.payments.length, 1);
      assert.strictEqual(txAll.payments[0].amount, 30);

      memDb.close();
    });

    it('ANO-01: permite lançar anotação (descrição + preço + qtd) no crediário, soma como produto e controla exclusão', async () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES (1, '38', 38, 'tok_ano_0123456789abcdef', 'DONA MARIA ANOTACAO', '18999990038', '',
          '5489 3333 4444 5555', 50, 20, 'active')
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (id, cliente_id, cliente_nome, valor, data_compra, data_vencimento, venda_nota_id, produto_nome, quantidade, preco_unitario)
        VALUES ('df_base', 38, 'DONA MARIA ANOTACAO', 60.00, '2026-11-15', '2026-12-15', 97001, 'LOSARTANA 50MG', 1, 60.00)
      `).run();

      const opToken = security.signToken({ id: 'op-ano', name: 'Atendente Balcao', role: 'Operador' });
      const adminToken = security.signToken({ id: 'adm-ano', name: 'Gerente', role: 'Administrador' });

      const app = express();
      app.use(express.json());
      app.use('/api', security.apiAuthMiddleware);
      app.use(
        '/api/crediario-v2',
        createUnifiedCrediarioEndpoints(memDb, {
          queryDigifarmaFn: async () => {
            throw new Error('Digifarma offline em teste HTTP');
          }
        })
      );

      let srv;
      let url;
      await new Promise(resolve => {
        srv = app.listen(0, '127.0.0.1', () => {
          url = `http://127.0.0.1:${srv.address().port}`;
          resolve();
        });
      });

      try {
        // Lançar anotação com descrição + preço unitário + quantidade mesmo com limite excedido
        const postRes = await fetch(`${url}/api/crediario-v2/clients/1/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
          body: JSON.stringify({
            description: 'Dipirona 1g Avulsa',
            unitPrice: 12.5,
            quantity: 2,
            buyerName: 'Filho Pedro',
            isAnnotation: true
          })
        });
        assert.strictEqual(postRes.status, 200);
        const postData = await postRes.json();
        assert.strictEqual(postData.success, true);
        assert.strictEqual(postData.amount, 25);
        assert.strictEqual(postData.exceededLimit, true);

        const st = postData.statement;
        assert.strictEqual(st.financials.principalBalance, 85);
        const allItems = st.simpleStatement.purchaseGroups.flatMap(g => g.items);
        const addedItem = allItems.find(i => i.productName === 'Dipirona 1g Avulsa');
        assert.ok(addedItem, 'Anotação deve aparecer como produto no Extrato Simples');
        assert.strictEqual(addedItem.quantity, 2);
        assert.strictEqual(addedItem.unitPrice, 12.5);
        assert.strictEqual(addedItem.totalPrice, 25);

        assert.ok(
          st.completeStatement.entries.some(
            e =>
              e.amount === 25 &&
              Array.isArray(e.items) &&
              e.items.some(i => i.productName === 'Dipirona 1g Avulsa' && i.quantity === 2)
          ),
          'Anotação deve aparecer como produto no Extrato Completo'
        );

        const tx = unified.listUnifiedTransactions(memDb, { periodDays: 60 });
        assert.ok(tx.purchases.some(p => p.items.some(i => i.productName === 'Dipirona 1g Avulsa' && i.quantity === 2 && i.amount === 25)));

        // Simular anotação de dia anterior -> Operador recebe 403, Admin recebe 200
        memDb.prepare("UPDATE crediario_local_purchases SET purchased_at = '2026-10-05 10:00:00' WHERE id = ?").run(postData.purchaseId);
        const opDelOld = await fetch(`${url}/api/crediario-v2/clients/1/purchases/${postData.purchaseId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${opToken}` }
        });
        assert.strictEqual(opDelOld.status, 403);

        const admDelOld = await fetch(`${url}/api/crediario-v2/clients/1/purchases/${postData.purchaseId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert.strictEqual(admDelOld.status, 200);
        const admDelData = await admDelOld.json();
        assert.strictEqual(admDelData.statement.financials.principalBalance, 60);
      } finally {
        await new Promise(resolve => srv.close(resolve));
        memDb.close();
      }
    });
  });

  describe('6. Sincronização Dupla (Belinha + FICHARIO Digifarma)', () => {
    it('DFW-01: POST /clients/:id/purchase grava no FICHARIO quando online (sem duplicar) e mantém local quando offline', async () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES (1, '38', 38, 'tok_dfw_0123456789abcdef', 'DONA MARIA SYNC', '18999990038', '12345678901',
          '5489 4444 5555 6666', 500, 20, 'active')
      `).run();

      let firebirdOnline = true;
      let nextFicharioId = 9001;
      const mockFicharioRows = [];

      const queryDigifarmaMock = async (sql, params = []) => {
        if (!firebirdOnline) {
          throw new Error('Firebird timeout simulado');
        }
        const upper = String(sql || '').toUpperCase();
        if (upper.includes('FROM CLIENTES WHERE CLIENTE_ID = ?')) {
          if (Number(params[0]) === 38) {
            return [{ CLIENTE_ID: 38, CLIENTE: 'DONA MARIA SYNC', CLI_DIA_PAGAMENTO: 20 }];
          }
          return [];
        }
        if (upper.includes('GEN_ID(GEN_FICHARIO, 1)')) {
          return [{ NEW_ID: nextFicharioId++ }];
        }
        if (upper.startsWith('\n    INSERT INTO FICHARIO') || upper.includes('INSERT INTO FICHARIO')) {
          mockFicharioRows.push({
            FICHARIO_ID: params[0],
            ITEM_VENDA_ID: params[1],
            CLIENTE_ID: params[2],
            FICHARIO_QUANTIDADE: params[3],
            FICHARIO_VALOR: params[4],
            FICHARIO_COMPRADOR: params[5],
            FICHARIO_VENCIMENTO: params[6],
            FICHARIO_DATACOMPRA: params[7],
            VENDA_NOTA_ID: params[8],
            PRODUTO_ID: params[9],
            FICHARIO_DESCONTO: params[10]
          });
          return [];
        }
        if (upper.includes('DELETE FROM FICHARIO WHERE FICHARIO_ID = ?')) {
          const idx = mockFicharioRows.findIndex(r => Number(r.FICHARIO_ID) === Number(params[0]));
          if (idx !== -1) mockFicharioRows.splice(idx, 1);
          return [];
        }
        return [];
      };

      const opToken = security.signToken({ id: 'op-dfw', name: 'Operador Caixa', role: 'Operador' });
      const app = express();
      app.use(express.json());
      app.use('/api', security.apiAuthMiddleware);
      app.use('/api/crediario-v2', createUnifiedCrediarioEndpoints(memDb, { queryDigifarmaFn: queryDigifarmaMock }));

      let srv;
      let url;
      await new Promise(resolve => {
        srv = app.listen(0, '127.0.0.1', () => {
          url = `http://127.0.0.1:${srv.address().port}`;
          resolve();
        });
      });

      try {
        // 1) Firebird online: grava no FICHARIO, espelha no cache local, limpa temporario sem duplicar saldo
        const resOn = await fetch(`${url}/api/crediario-v2/clients/1/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
          body: JSON.stringify({
            description: 'Vitamina D3 2000UI Avulsa',
            unitPrice: 15.5,
            quantity: 2,
            buyerName: 'Pedro Filho',
            isAnnotation: true
          })
        });
        assert.strictEqual(resOn.status, 200);
        const dataOn = await resOn.json();
        assert.strictEqual(dataOn.digifarmaSynced, true);
        assert.strictEqual(dataOn.digifarmaClienteId, 38);
        assert.deepStrictEqual(dataOn.digifarmaFicharioIds, [9001]);
        assert.strictEqual(mockFicharioRows.length, 1);
        assert.strictEqual(mockFicharioRows[0].CLIENTE_ID, 38);
        assert.strictEqual(mockFicharioRows[0].FICHARIO_QUANTIDADE, 2);
        assert.strictEqual(mockFicharioRows[0].FICHARIO_VALOR, 15.5);
        assert.strictEqual(mockFicharioRows[0].FICHARIO_COMPRADOR, 'PEDRO FILHO');

        const localCountAfterOn = memDb.prepare('SELECT COUNT(*) as c FROM crediario_local_purchases WHERE card_id = 1').get().c;
        assert.strictEqual(localCountAfterOn, 0, 'Nao deve deixar duplicado em crediario_local_purchases apos gravar no FICHARIO');
        assert.strictEqual(dataOn.statement.financials.principalBalance, 31, 'Saldo deve ser somado exatamente 1 vez');

        const labelSaved = memDb.prepare('SELECT description FROM crediario_fichario_labels WHERE fichario_id = ?').get('9001');
        assert.strictEqual(labelSaved?.description, 'Vitamina D3 2000UI Avulsa');

        // 2) Excluir anotacao sincronizada via DELETE remove tambem do FICHARIO e zera saldo
        const delSyncRes = await fetch(`${url}/api/crediario-v2/clients/1/purchases/${dataOn.purchaseId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${opToken}` }
        });
        assert.strictEqual(delSyncRes.status, 200);
        assert.strictEqual(mockFicharioRows.length, 0);
        const delJson = await delSyncRes.json();
        assert.strictEqual(delJson.statement.financials.principalBalance, 0);

        // 3) Firebird offline: mantém na tabela local e retorna digifarmaSynced = false
        firebirdOnline = false;
        const resOff = await fetch(`${url}/api/crediario-v2/clients/1/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
          body: JSON.stringify({
            description: 'Pomada Avulsa Offline',
            unitPrice: 22,
            quantity: 1,
            isAnnotation: true
          })
        });
        assert.strictEqual(resOff.status, 200);
        const dataOff = await resOff.json();
        assert.strictEqual(dataOff.digifarmaSynced, false);
        assert.ok(dataOff.digifarmaWarning);
        assert.strictEqual(dataOff.statement.financials.principalBalance, 22);
      } finally {
        await new Promise(resolve => srv.close(resolve));
        memDb.close();
      }
    });

    it('DFW-02: sincronizarVendaDigifarma grava CAB_VENDAS, ITEM_VENDAS, FPAGTOS (PARCELAS) e FICHARIO; estornarVendaDigifarma remove do FICHARIO', async () => {
      const {
        sincronizarVendaDigifarma,
        estornarVendaDigifarma
      } = require('../backend/modules/erp/erp-digifarma-sales-sync.service.js');

      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);
      memDb.exec(`
        CREATE TABLE sales (
          id TEXT PRIMARY KEY,
          status TEXT DEFAULT 'CONCLUIDA',
          digifarma_sync_status TEXT DEFAULT 'PENDENTE',
          digifarma_venda_id INTEGER,
          digifarma_sync_at TEXT,
          digifarma_sync_error TEXT
        );
      `);

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES (1, '38', 38, 'tok_dfw2_0123456789abcdef', 'RENI DANIEL DA SILVA', '18999990038', '12345678901',
          '5489 7777 8888 9999', 500, 20, 'active')
      `).run();

      const saleId = 'VND-TEST-CRED-1';
      memDb.prepare('INSERT INTO sales (id, status) VALUES (?, ?)').run(saleId, 'CONCLUIDA');
      memDb.prepare(`
        INSERT INTO crediario_local_purchases (
          id, card_id, sale_id, buyer_name, description, items_json, amount, paid_amount, status, purchased_at, due_date, created_by
        ) VALUES ('lp_pdv_1', 1, ?, 'YASMIN', 'Fralda A + Fralda B', '[]', 90.00, 0, 'open', datetime('now', 'localtime'), '2026-12-25', 'Caixa')
      `).run(saleId);

      const mockOps = {
        cab: [],
        fpagtos: [],
        items: [],
        fichario: [],
        deletedFicharioVendas: []
      };
      let nextFichId = 8400;

      const queryMock = async (sql, params = []) => {
        const u = String(sql || '').toUpperCase();
        if (u.includes('FROM CAIXA') && u.includes('FECHAMENTO IS NULL')) {
          return [{ CAIXA_ID: 1148, OPERADOR_ABERTURA: 11 }];
        }
        if (u.includes('GEN_ID(GEN_CAB_VENDAS, 1)')) {
          return [{ NEW_ID: 50001 }];
        }
        if (u.includes('FROM CLIENTES WHERE CLIENTE_ID = ?')) {
          return [{ CLIENTE_ID: 38, CLIENTE: 'RENI DANIEL DA SILVA', CLI_DIA_PAGAMENTO: 20 }];
        }
        if (u.includes('GEN_ID(GEN_FICHARIO, 1)')) {
          return [{ NEW_ID: nextFichId++ }];
        }
        if (u.includes('INSERT INTO CAB_VENDAS ')) {
          mockOps.cab.push(params);
          return [];
        }
        if (u.includes('INSERT INTO CAB_VENDAS_FPAGTOS')) {
          mockOps.fpagtos.push(params);
          return [];
        }
        if (u.includes('INSERT INTO ITEM_VENDAS')) {
          mockOps.items.push(params);
          return [];
        }
        if (u.includes('INSERT INTO FICHARIO')) {
          mockOps.fichario.push({
            FICHARIO_ID: params[0],
            ITEM_VENDA_ID: params[1],
            CLIENTE_ID: params[2],
            FICHARIO_QUANTIDADE: params[3],
            FICHARIO_VALOR: params[4],
            FICHARIO_COMPRADOR: params[5],
            VENDA_NOTA_ID: params[8],
            PRODUTO_ID: params[9],
            FICHARIO_DESCONTO: params[10]
          });
          return [];
        }
        if (u.includes('SELECT VENDA_NOTA_ID, VENDA_TOTAL')) {
          return [{ VENDA_NOTA_ID: 50001, VENDA_TOTAL: 90, DINHEIRO: 0, CARTAO: 0, CREDIARIO: 90, CAIXA_ID: 1148, CANCELADO: 'N' }];
        }
        if (u.includes('DELETE FROM FICHARIO WHERE VENDA_NOTA_ID = ?')) {
          mockOps.deletedFicharioVendas.push(Number(params[0]));
          return [];
        }
        if (u.includes('SELECT PRODUTO_ID, ITEMVEND_QUANT')) {
          return [
            { PRODUTO_ID: 189394, ITEMVEND_QUANT: 1 },
            { PRODUTO_ID: 186748, ITEMVEND_QUANT: 2 }
          ];
        }
        return [];
      };

      const syncRes = await sincronizarVendaDigifarma({
        sale_id: saleId,
        sale_date: '2026-11-25',
        card_id: 1,
        customer_id: '38',
        customer_name: 'RENI DANIEL DA SILVA',
        buyer_name: 'YASMIN',
        due_date: '2026-12-25',
        items: [
          { product_code: '189394', product_name: 'FRALDA A', quantity: 1, unit_price: 60 },
          { product_code: '186748', product_name: 'FRALDA B', quantity: 2, unit_price: 20 }
        ],
        payments: [{ payment_method: 'CREDIARIO', amount: 90, installments: 1 }],
        total_items_value: 100,
        discount_value: 10,
        total_value: 90,
        user_name: 'Caixa'
      }, null, { db: memDb, queryDigifarmaFn: queryMock });

      assert.strictEqual(syncRes.success, true);
      assert.strictEqual(syncRes.venda_nota_id, 50001);
      assert.strictEqual(syncRes.fichario_synced, true);
      assert.deepStrictEqual(syncRes.fichario_ids, [8400, 8401]);
      assert.strictEqual(mockOps.cab.length, 1);
      assert.strictEqual(mockOps.fpagtos.length, 1);
      assert.strictEqual(mockOps.fpagtos[0][0], 5, 'TIPO_PAGAMENTO_ID=5 (CREDIARIO)');
      assert.strictEqual(mockOps.items.length, 2);
      assert.strictEqual(mockOps.fichario.length, 2);
      assert.strictEqual(mockOps.fichario[0].VENDA_NOTA_ID, 50001);
      assert.strictEqual(mockOps.fichario[0].CLIENTE_ID, 38);
      assert.strictEqual(mockOps.fichario[0].FICHARIO_COMPRADOR, 'YASMIN');

      // Soma líquida dos itens no FICHARIO deve bater exato com R$ 90,00 (com rateio do desconto de R$ 10,00)
      const fichNetTotal = unified.round2(
        mockOps.fichario.reduce(
          (acc, f) => acc + ((f.FICHARIO_QUANTIDADE * f.FICHARIO_VALOR) - f.FICHARIO_DESCONTO),
          0
        )
      );
      assert.strictEqual(fichNetTotal, 90);

      // Anti-duplicação: crediario_local_purchases limpo e cache preenchido com saldo único 90
      assert.strictEqual(memDb.prepare('SELECT COUNT(*) as c FROM crediario_local_purchases WHERE sale_id = ?').get(saleId).c, 0);
      const st = unified.buildClientStatement(memDb, 1);
      assert.strictEqual(st.financials.principalBalance, 90);

      // Estorno da venda remove também do FICHARIO e do cache local
      const estRes = await estornarVendaDigifarma(50001, 'Teste estorno', { db: memDb, queryDigifarmaFn: queryMock });
      assert.strictEqual(estRes.success, true);
      assert.deepStrictEqual(mockOps.deletedFicharioVendas, [50001]);
      assert.strictEqual(memDb.prepare('SELECT COUNT(*) as c FROM digifarma_crediario_cache WHERE venda_nota_id = ?').get('50001').c, 0);

      memDb.close();
    });

    it('DFW-03: Quitação total via PIX grava CONTAS_RECEBIDAS, FPAGTOS (TIPO 8), ARQUIVO_MORTO, CAIXA_RECEB_FPAGTOS, FLUXO_CAIXA e não duplica no Belinha nem após sync', async () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);

      const todayYMD = unified.toLocalDateYMD(new Date());
      const dueYMD = unified.addDaysYMD(todayYMD, 15);

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES (1, '38', 38, 'tok_dfw3_0123456789abcdef', 'DONA MARIA PIX', '18999990038', '12345678901',
          '5489 1010 2020 3030', 500, 20, 'active')
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (
          id, cliente_id, cliente_nome, valor, data_compra, data_vencimento, venda_nota_id,
          produto_id, produto_nome, quantidade, preco_unitario, comprador
        ) VALUES
        ('9101', 38, 'DONA MARIA PIX', 40, ?, ?, 98001, 186748, 'FRALDA P', 1, 40, 'YASMIN'),
        ('9102', 38, 'DONA MARIA PIX', 60, ?, ?, 98002, 187225, 'LEITE NAN', 1, 60, 'COMPRADOR NOME MUITO LONGO QUE EXCEDE VINTE CHARS')
      `).run(todayYMD, dueYMD, todayYMD, dueYMD);

      const fb = {
        caixas: [
          {
            CAIXA_ID: 1149,
            OPERADOR_ABERTURA: 11,
            FECHAMENTO: null,
            TOTAL_RECEBIMENTO: 0,
            RECEB_DINHEIRO: 0,
            RECEB_CHEQUE: 0,
            RECEB_CARTAO: 0,
            RECEB_OUTROS: 0
          }
        ],
        fichario: [
          {
            FICHARIO_ID: 9101,
            CLIENTE_ID: 38,
            PRODUTO_ID: 186748,
            VENDA_NOTA_ID: 98001,
            FICHARIO_QUANTIDADE: 1,
            FICHARIO_VALOR: 40,
            FICHARIO_DESCONTO: 0,
            FICHARIO_FRETE: 0,
            FICHARIO_COMPRADOR: 'YASMIN',
            FICHARIO_DATACOMPRA: todayYMD,
            FICHARIO_VENCIMENTO: dueYMD,
            PRODUTO: 'FRALDA P',
            APRESENTACAO: 'PCT',
            CLIENTE: 'DONA MARIA PIX',
            CLI_CELULAR: '18999990038',
            CLI_TELEFONE: ''
          },
          {
            FICHARIO_ID: 9102,
            CLIENTE_ID: 38,
            PRODUTO_ID: 187225,
            VENDA_NOTA_ID: 98002,
            FICHARIO_QUANTIDADE: 1,
            FICHARIO_VALOR: 60,
            FICHARIO_DESCONTO: 0,
            FICHARIO_FRETE: 0,
            FICHARIO_COMPRADOR: 'COMPRADOR NOME MUITO LONGO QUE EXCEDE VINTE CHARS',
            FICHARIO_DATACOMPRA: todayYMD,
            FICHARIO_VENCIMENTO: dueYMD,
            PRODUTO: 'LEITE NAN',
            APRESENTACAO: 'LATA',
            CLIENTE: 'DONA MARIA PIX',
            CLI_CELULAR: '18999990038',
            CLI_TELEFONE: ''
          }
        ],
        contasRecebidas: [],
        contasRecebidasFpagtos: [],
        arquivoMorto: [],
        caixaRecebFpagtos: [],
        fluxoCaixa: [{ DATA: todayYMD, CONTAS_RECEBIDAS: 0 }],
        seqContrec: 1200,
        seqCrFpag: 1200,
        seqArqMorto: 7600,
        seqCaixaRf: 10650
      };

      const queryMock = async (sql, params = []) => {
        const u = String(sql || '').toUpperCase().trim();
        if (u.includes('FROM CAIXA WHERE FECHAMENTO IS NULL')) {
          return fb.caixas.filter(c => c.FECHAMENTO === null);
        }
        if (u.includes('FROM FICHARIO f') || (u.includes('FROM FICHARIO') && u.includes('WHERE CLIENTE_ID = ?'))) {
          return fb.fichario.filter(r => Number(r.CLIENTE_ID) === Number(params[0] ?? 38));
        }
        if (u.includes('FROM FICHARIO') && !u.startsWith('DELETE') && !u.startsWith('UPDATE')) {
          return fb.fichario;
        }
        if (u.includes('FROM CONTAS_RECEBIDAS') && u.startsWith('SELECT')) {
          return fb.contasRecebidas;
        }
        if (u.includes('FROM CLIENTES')) {
          return [{
            CLIENTE_ID: 38,
            CLIENTE: 'DONA MARIA PIX',
            CLI_CPF: '12345678901',
            CLI_CELULAR: '18999990038',
            CLI_TELEFONE: '',
            CLI_LIMITE: 500,
            CLI_DIA_PAGAMENTO: 20
          }];
        }
        if (u.includes('GEN_ID(GEN_CONTAS_RECEBIDAS, 1)')) {
          return [{ NEW_ID: fb.seqContrec++ }];
        }
        if (u.startsWith('INSERT INTO CONTAS_RECEBIDAS (')) {
          fb.contasRecebidas.push({
            CONTREC_ID: params[0],
            CLIENTE_ID: params[1],
            CONTREC_TOTALDEBITO: params[2],
            CONTREC_VALORPAG: params[3],
            CONTREC_TIPOPAG: params[4],
            CONTREC_DATAPAG: todayYMD,
            CONTREC_VENCIMENTO: params[5],
            CONTREC_VENDEDOR: params[6],
            CAIXA_ID: params[7],
            CONTREC_VALORLIQ: params[8],
            DINHEIRO: params[9],
            CHEQUE: params[10],
            CHEQUE_PRE: params[11],
            CARTAO: params[12],
            VALOR_CORRECAO: params[13],
            ADM_CARTAO_ID: params[14],
            OUTROS: params[15]
          });
          return [];
        }
        if (u.startsWith('INSERT INTO CONTAS_RECEBIDAS_FPAGTOS')) {
          fb.contasRecebidasFpagtos.push({
            CONTAS_RECEBIDAS_FPAGTO_ID: fb.seqCrFpag++,
            TIPO_PAGAMENTO_ID: params[0],
            CONTREC_ID: params[1],
            VALOR: params[2],
            BANDEIRA: params[3]
          });
          return [];
        }
        if (u.startsWith('INSERT INTO ARQUIVO_MORTO')) {
          fb.arquivoMorto.push({
            ARQUIVO_MORTO_ID: fb.seqArqMorto++,
            PRODUTO_ID: params[0],
            CLIENTE_ID: params[1],
            ARQ_NOTA: params[2],
            ARQ_QUANTIDADE: params[3],
            ARQ_COMPRADOR: params[4],
            ARQ_VALORPAG: params[5],
            ARQ_DATACOMPRA: params[6],
            CONTREC_ID: params[7]
          });
          return [];
        }
        if (u.startsWith('DELETE FROM FICHARIO WHERE FICHARIO_ID = ?')) {
          fb.fichario = fb.fichario.filter(r => Number(r.FICHARIO_ID) !== Number(params[0]));
          return [];
        }
        if (u.startsWith('UPDATE CAIXA')) {
          const cx = fb.caixas.find(c => c.CAIXA_ID === Number(params[5]));
          if (cx) {
            cx.TOTAL_RECEBIMENTO += Number(params[0]);
            cx.RECEB_DINHEIRO += Number(params[1]);
            cx.RECEB_CHEQUE += Number(params[2]);
            cx.RECEB_CARTAO += Number(params[3]);
            cx.RECEB_OUTROS += Number(params[4]);
          }
          return [];
        }
        if (u.includes('FROM CAIXA_RECEB_FPAGTOS')) {
          return fb.caixaRecebFpagtos.filter(
            r => r.CAIXA_ID === Number(params[0]) && r.TIPO_PAGAMENTO_ID === Number(params[1]) && (r.BANDEIRA || '') === (params[2] || '')
          );
        }
        if (u.startsWith('INSERT INTO CAIXA_RECEB_FPAGTOS')) {
          fb.caixaRecebFpagtos.push({
            CAIXA_RECEB_FPAGTO_ID: fb.seqCaixaRf++,
            TIPO_PAGAMENTO_ID: params[0],
            CAIXA_ID: params[1],
            BANDEIRA: params[2],
            VALOR: params[3]
          });
          return [];
        }
        if (u.startsWith('UPDATE FLUXO_CAIXA')) {
          fb.fluxoCaixa[0].CONTAS_RECEBIDAS += Number(params[0]);
          return [];
        }
        return [];
      };

      const opToken = security.signToken({ id: 'op-dfw3', name: 'Operador PIX', role: 'Operador' });
      const app = express();
      app.use(express.json());
      app.use('/api', security.apiAuthMiddleware);
      app.use('/api/crediario-v2', createUnifiedCrediarioEndpoints(memDb, { queryDigifarmaFn: queryMock }));

      let srv;
      let url;
      await new Promise(resolve => {
        srv = app.listen(0, '127.0.0.1', () => {
          url = `http://127.0.0.1:${srv.address().port}`;
          resolve();
        });
      });

      try {
        const res = await fetch(`${url}/api/crediario-v2/clients/1/receive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
          body: JSON.stringify({ amount: 100, paymentMethod: 'PIX' })
        });
        assert.strictEqual(res.status, 200);
        const body = await res.json();

        assert.strictEqual(body.success, true);
        assert.strictEqual(body.isFullSettlement, true);
        assert.strictEqual(body.digifarmaSynced, true);
        assert.strictEqual(body.digifarmaContrecId, 1200);
        assert.strictEqual(body.digifarmaCaixaId, 1149);

        // Validar estrutura Firebird
        assert.strictEqual(fb.contasRecebidas.length, 1);
        assert.strictEqual(fb.contasRecebidas[0].CONTREC_TIPOPAG, 'T');
        assert.strictEqual(fb.contasRecebidas[0].CONTREC_VALORPAG, 100);
        assert.strictEqual(fb.contasRecebidas[0].DINHEIRO, 0);
        assert.strictEqual(fb.contasRecebidas[0].CARTAO, 0);
        assert.strictEqual(fb.contasRecebidas[0].OUTROS, 0);

        assert.strictEqual(fb.contasRecebidasFpagtos.length, 1);
        assert.strictEqual(fb.contasRecebidasFpagtos[0].TIPO_PAGAMENTO_ID, 8);
        assert.strictEqual(fb.contasRecebidasFpagtos[0].VALOR, 100);

        assert.strictEqual(fb.arquivoMorto.length, 2);
        assert.strictEqual(fb.arquivoMorto[0].CONTREC_ID, 1200);
        assert.ok(fb.arquivoMorto[1].ARQ_COMPRADOR.length <= 20, 'ARQ_COMPRADOR deve respeitar VARCHAR(20)');
        assert.strictEqual(fb.fichario.length, 0);

        // PIX não soma em CAIXA.TOTAL_RECEBIMENTO, mas soma em CAIXA_RECEB_FPAGTOS e FLUXO_CAIXA
        assert.strictEqual(fb.caixas[0].TOTAL_RECEBIMENTO, 0);
        assert.strictEqual(fb.caixaRecebFpagtos.length, 1);
        assert.strictEqual(fb.caixaRecebFpagtos[0].TIPO_PAGAMENTO_ID, 8);
        assert.strictEqual(fb.caixaRecebFpagtos[0].VALOR, 100);
        assert.strictEqual(fb.fluxoCaixa[0].CONTAS_RECEBIDAS, 100);

        // Validar anti-duplicação no Belinha antes e depois do sync
        assert.strictEqual(body.statement.financials.principalBalance, 0);
        const creditEntries = body.statement.completeStatement.entries.filter(e => e.type === 'CREDITO');
        assert.strictEqual(creditEntries.length, 1);
        assert.strictEqual(creditEntries[0].amount, 100);
        assert.strictEqual(creditEntries[0].source, 'DIGIFARMA');

        assert.strictEqual(unified.listUnifiedClients(memDb).kpis.paidThisMonth, 100);
        assert.strictEqual(unified.listUnifiedTransactions(memDb, { onlyRecentClients: false }).payments.length, 1);

        // Rodar syncAllFromDigifarma mockado depois e garantir 0 duplicação
        const syncRes = await unified.syncAllFromDigifarma(memDb, { queryDigifarmaFn: queryMock });
        assert.strictEqual(syncRes.success, true);
        assert.strictEqual(unified.listUnifiedClients(memDb).kpis.paidThisMonth, 100);
        assert.strictEqual(unified.listUnifiedTransactions(memDb, { onlyRecentClients: false }).payments.length, 1);
        assert.strictEqual(unified.buildClientStatement(memDb, 1).completeStatement.entries.filter(e => e.type === 'CREDITO').length, 1);
      } finally {
        await new Promise(resolve => srv.close(resolve));
        memDb.close();
      }
    });

    it('DFW-04: Pagamento parcial FIFO em dinheiro reduz FICHARIO_QUANTIDADE proporcionalmente, grava ARQUIVO_MORTO e soma CAIXA sem duplicar', async () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);

      const todayYMD = unified.toLocalDateYMD(new Date());
      const dueYMD = unified.addDaysYMD(todayYMD, 15);

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES (1, '65', 65, 'tok_dfw4_0123456789abcdef', 'CARLOS PARCIAL FIFO', '18999990065', '',
          '5489 4040 5050 6060', 500, 20, 'active')
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (
          id, cliente_id, cliente_nome, valor, data_compra, data_vencimento, venda_nota_id,
          produto_id, produto_nome, quantidade, preco_unitario, comprador
        ) VALUES
        ('9010', 65, 'CARLOS PARCIAL FIFO', 40, ?, ?, 99001, 1001, 'ITEM A', 1, 40, 'CARLOS'),
        ('9011', 65, 'CARLOS PARCIAL FIFO', 60, ?, ?, 99002, 1002, 'ITEM B', 2, 30, 'CARLOS')
      `).run(todayYMD, dueYMD, todayYMD, dueYMD);

      const fb = {
        caixa: {
          CAIXA_ID: 1149,
          OPERADOR_ABERTURA: 11,
          FECHAMENTO: null,
          TOTAL_RECEBIMENTO: 0,
          RECEB_DINHEIRO: 0,
          RECEB_CHEQUE: 0,
          RECEB_CARTAO: 0,
          RECEB_OUTROS: 0
        },
        fichario: [
          {
            FICHARIO_ID: 9010,
            CLIENTE_ID: 65,
            PRODUTO_ID: 1001,
            VENDA_NOTA_ID: 99001,
            FICHARIO_QUANTIDADE: 1,
            FICHARIO_VALOR: 40,
            FICHARIO_DESCONTO: 0,
            FICHARIO_FRETE: 0,
            FICHARIO_COMPRADOR: 'CARLOS',
            FICHARIO_DATACOMPRA: todayYMD,
            FICHARIO_VENCIMENTO: dueYMD
          },
          {
            FICHARIO_ID: 9011,
            CLIENTE_ID: 65,
            PRODUTO_ID: 1002,
            VENDA_NOTA_ID: 99002,
            FICHARIO_QUANTIDADE: 2,
            FICHARIO_VALOR: 30,
            FICHARIO_DESCONTO: 0,
            FICHARIO_FRETE: 0,
            FICHARIO_COMPRADOR: 'CARLOS',
            FICHARIO_DATACOMPRA: todayYMD,
            FICHARIO_VENCIMENTO: dueYMD
          }
        ],
        contasRecebidas: [],
        arquivoMorto: [],
        caixaRecebFpagtos: []
      };

      const queryMock = async (sql, params = []) => {
        const u = String(sql || '').toUpperCase().trim();
        if (u.includes('FROM CAIXA WHERE FECHAMENTO IS NULL')) return [fb.caixa];
        if (u.includes('FROM FICHARIO') && u.includes('WHERE CLIENTE_ID = ?')) return [...fb.fichario];
        if (u.includes('GEN_ID(GEN_CONTAS_RECEBIDAS, 1)')) return [{ NEW_ID: 1205 }];
        if (u.startsWith('INSERT INTO CONTAS_RECEBIDAS (')) {
          fb.contasRecebidas.push({
            CONTREC_ID: params[0],
            CONTREC_TOTALDEBITO: params[2],
            CONTREC_VALORPAG: params[3],
            CONTREC_TIPOPAG: params[4],
            DINHEIRO: params[9]
          });
          return [];
        }
        if (u.startsWith('INSERT INTO ARQUIVO_MORTO')) {
          fb.arquivoMorto.push({
            PRODUTO_ID: params[0],
            ARQ_QUANTIDADE: params[3],
            ARQ_VALORPAG: params[5],
            CONTREC_ID: params[7]
          });
          return [];
        }
        if (u.startsWith('DELETE FROM FICHARIO WHERE FICHARIO_ID = ?')) {
          fb.fichario = fb.fichario.filter(r => Number(r.FICHARIO_ID) !== Number(params[0]));
          return [];
        }
        if (u.startsWith('UPDATE FICHARIO')) {
          const row = fb.fichario.find(r => Number(r.FICHARIO_ID) === Number(params[3]));
          if (row) {
            row.FICHARIO_QUANTIDADE = params[0];
            row.FICHARIO_DESCONTO = params[1];
            row.FICHARIO_FRETE = params[2];
          }
          return [];
        }
        if (u.startsWith('UPDATE CAIXA')) {
          fb.caixa.TOTAL_RECEBIMENTO += Number(params[0]);
          fb.caixa.RECEB_DINHEIRO += Number(params[1]);
          return [];
        }
        if (u.includes('FROM CAIXA_RECEB_FPAGTOS')) return [];
        if (u.startsWith('INSERT INTO CAIXA_RECEB_FPAGTOS')) {
          fb.caixaRecebFpagtos.push({ TIPO_PAGAMENTO_ID: params[0], VALOR: params[3] });
          return [];
        }
        return [];
      };

      const res = await unified.receiveCrediarioPayment(memDb, {
        cardId: 1,
        amount: 55,
        paymentMethod: 'DINHEIRO',
        operatorName: 'Balcão'
      }, { queryDigifarmaFn: queryMock });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.isFullSettlement, false);
      assert.strictEqual(res.digifarmaSynced, true);
      assert.strictEqual(res.digifarmaContrecId, 1205);

      // Item 9010 quitado e deletado; 9011 reduzido de qty 2 -> 1.5 (1.5 * 30 = 45)
      assert.strictEqual(fb.fichario.length, 1);
      assert.strictEqual(fb.fichario[0].FICHARIO_ID, 9011);
      assert.strictEqual(fb.fichario[0].FICHARIO_QUANTIDADE, 1.5);

      // ARQUIVO_MORTO recebeu 1x40 e 0.5x30
      assert.strictEqual(fb.arquivoMorto.length, 2);
      assert.strictEqual(fb.arquivoMorto[0].ARQ_QUANTIDADE, 1);
      assert.strictEqual(fb.arquivoMorto[0].ARQ_VALORPAG, 40);
      assert.strictEqual(fb.arquivoMorto[1].ARQ_QUANTIDADE, 0.5);
      assert.strictEqual(fb.arquivoMorto[1].ARQ_VALORPAG, 30);

      // CONTAS_RECEBIDAS e CAIXA atualizados
      assert.strictEqual(fb.contasRecebidas[0].CONTREC_TIPOPAG, 'P');
      assert.strictEqual(fb.contasRecebidas[0].CONTREC_TOTALDEBITO, 100);
      assert.strictEqual(fb.contasRecebidas[0].CONTREC_VALORPAG, 55);
      assert.strictEqual(fb.contasRecebidas[0].DINHEIRO, 55);
      assert.strictEqual(fb.caixa.TOTAL_RECEBIMENTO, 55);
      assert.strictEqual(fb.caixa.RECEB_DINHEIRO, 55);
      assert.strictEqual(fb.caixaRecebFpagtos[0].VALOR, 55);

      // Saldo local e totais sem duplicação
      assert.strictEqual(res.statement.financials.principalBalance, 45);
      const cardRow = memDb.prepare('SELECT local_credit_balance, used_limit FROM belafarma_cards WHERE id = 1').get();
      assert.strictEqual(cardRow.local_credit_balance, 0);
      assert.strictEqual(cardRow.used_limit, 45);
      assert.strictEqual(unified.listUnifiedClients(memDb).kpis.paidThisMonth, 55);

      memDb.close();
    });

    it('DFW-05: Sem caixa aberto no Digifarma realiza fallback seguro no Belinha sem escrever no Firebird', async () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);

      const todayYMD = unified.toLocalDateYMD(new Date());
      const dueYMD = unified.addDaysYMD(todayYMD, 15);

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone, cpf,
          card_number, credit_limit, due_day, status
        ) VALUES (1, '77', 77, 'tok_dfw5_0123456789abcdef', 'JOANA CAIXA FECHADO', '18999990077', '',
          '5489 7070 8080 9090', 500, 20, 'active')
      `).run();

      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (
          id, cliente_id, cliente_nome, valor, data_compra, data_vencimento, venda_nota_id,
          produto_id, produto_nome, quantidade, preco_unitario, comprador
        ) VALUES ('9020', 77, 'JOANA CAIXA FECHADO', 80, ?, ?, 99100, 1001, 'PRODUTO Z', 1, 80, 'JOANA')
      `).run(todayYMD, dueYMD);

      const writes = [];
      const queryNoOpenCaixa = async (sql) => {
        const u = String(sql || '').toUpperCase().trim();
        if (u.includes('FROM CAIXA WHERE FECHAMENTO IS NULL')) {
          return [];
        }
        writes.push(u);
        return [];
      };

      const res = await unified.receiveCrediarioPayment(memDb, {
        cardId: 1,
        amount: 30,
        paymentMethod: 'DINHEIRO'
      }, { queryDigifarmaFn: queryNoOpenCaixa });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.digifarmaSynced, false);
      assert.ok(String(res.digifarmaOfflineWarning || '').toLowerCase().includes('caixa aberto'));
      assert.strictEqual(writes.length, 0, 'Não deve escrever nada no Firebird quando não houver caixa aberto');
      assert.strictEqual(res.statement.financials.principalBalance, 50);

      const cpRow = memDb.prepare('SELECT synced_digifarma, digifarma_contrec_id, amount FROM card_payments WHERE card_id = 1').get();
      assert.strictEqual(cpRow.synced_digifarma, 0);
      assert.strictEqual(cpRow.digifarma_contrec_id, null);
      assert.strictEqual(cpRow.amount, 30);

      memDb.close();
    });
  });

  describe('7. Unificação de Duplicatas, INT32 Overflow & Reconciliação de Vendas', () => {
    it('DUP-01: parseSafeDigifarmaId bloqueia timestamp (>INT32) e resolveDigifarmaClienteId resolve nome abreviado RENI DANIEL -> 38', async () => {
      assert.strictEqual(unified.parseSafeDigifarmaId('1769803264518'), null);
      assert.strictEqual(unified.parseSafeDigifarmaId(1769803264518), null);
      assert.strictEqual(unified.parseSafeDigifarmaId('2147483648'), null);
      assert.strictEqual(unified.parseSafeDigifarmaId('0'), null);
      assert.strictEqual(unified.parseSafeDigifarmaId('38'), 38);

      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);

      const executedQueries = [];
      const queryMock = async (sql, params = []) => {
        executedQueries.push({ sql: String(sql), params });
        const u = String(sql || '').toUpperCase();
        if (u.includes('WHERE CLIENTE_ID = ?')) {
          throw new Error('Nunca deveria consultar CLIENTE_ID com timestamp > INT32');
        }
        if (u.includes('WHERE UPPER(TRIM(CLIENTE)) = ?')) {
          return [];
        }
        if (u.includes('WHERE UPPER(CLIENTE) STARTING WITH ?')) {
          assert.strictEqual(params[0], 'RENI');
          return [{ CLIENTE_ID: 38, CLIENTE: 'RENI DANIEL DA SILVA', CLI_CPF: '77388992634', CLI_DIA_PAGAMENTO: 20 }];
        }
        return [];
      };

      const resolved = await unified.resolveDigifarmaClienteId(memDb, {
        customerId: '1769803264518',
        digifarmaClienteId: 1769803264518,
        customerName: 'RENI DANIEL'
      }, queryMock);

      assert.ok(resolved);
      assert.strictEqual(resolved.clienteId, 38);
      assert.strictEqual(resolved.clienteNome, 'RENI DANIEL DA SILVA');
      assert.ok(!executedQueries.some(q => q.sql.toUpperCase().includes('WHERE CLIENTE_ID = ?')));

      memDb.close();
    });

    it('DUP-02: unifyDuplicateCustomersAndCards unifica cadastros duplicados preservando homônimos distintos e LIDs soltos', () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);
      memDb.exec(`
        ALTER TABLE customers ADD COLUMN source TEXT DEFAULT 'Manual';
        ALTER TABLE customers ADD COLUMN whatsapp_lid TEXT;
        ALTER TABLE customers ADD COLUMN digifarma_id INTEGER;
        CREATE TABLE sales (
          id TEXT PRIMARY KEY,
          sale_date TEXT,
          total_value REAL,
          customer_id TEXT,
          customer_name TEXT,
          digifarma_venda_id INTEGER
        );
        CREATE TABLE customer_debts (
          id TEXT PRIMARY KEY,
          customerId TEXT NOT NULL,
          purchaseDate TEXT,
          totalValue REAL,
          status TEXT DEFAULT 'PENDENTE'
        );
      `);

      const todayYMD = unified.toLocalDateYMD(new Date());

      // Canônicos do Digifarma
      memDb.prepare(`
        INSERT INTO customers (id, name, cpf, phone, creditLimit, dueDay, source, createdAt, updatedAt) VALUES
        ('38', 'RENI DANIEL DA SILVA', '77388992634', '', 300, 20, 'Digifarma', '2026-01-01', '2026-01-01'),
        ('48', 'EVA  MARIA DA SILVA', NULL, '32169090', 300, 20, 'Digifarma', '2026-01-01', '2026-01-01'),
        ('34', 'SIMONE MARIA FERREIRA VIEIRA', NULL, '999955054', 300, 20, 'Digifarma', '2026-01-01', '2026-01-01'),
        ('45', 'ADRIANA MAE', NULL, '', 300, 20, 'Digifarma', '2026-01-01', '2026-01-01'),
        ('117', 'ROSANGELA', NULL, '', 300, 20, 'Digifarma', '2026-01-01', '2026-01-01'),
        ('132', 'ROSANGELA LIVIA', '79106498787', '', 300, 20, 'Digifarma', '2026-01-01', '2026-01-01'),
        ('301', 'JOAO SILVA', '11111111111', '', 300, 20, 'Digifarma', '2026-01-01', '2026-01-01'),
        ('302', 'JOAO SILVA', '22222222222', '', 300, 20, 'Digifarma', '2026-01-01', '2026-01-01'),
        -- Duplicados que DEVEM unificar:
        ('1769803264518', 'RENI DANIEL', NULL, NULL, 150, 20, 'Manual', '2026-01-30', '2026-01-30'),
        ('1769798949962', 'EVA MARIA DA SILVA', NULL, NULL, 150, 20, 'Manual', '2026-01-30', '2026-01-30'),
        ('1770835725036', 'simone', NULL, NULL, 150, 20, 'Manual', '2026-02-11', '2026-02-11'),
        ('cust_wa_simone', 'simone vieira', NULL, '194068365738155', 0, NULL, 'WhatsApp', '2026-05-01', '2026-05-01'),
        -- Protegidos contra falso positivo (NÃO devem unificar):
        ('cust_wa_adriana', 'Adriana', NULL, '87273802600552', 0, NULL, 'WhatsApp', '2026-05-01', '2026-05-01'),
        ('cust_wa_1', 'Contato WhatsApp', NULL, '262285163528278', 0, NULL, 'WhatsApp', '2026-05-01', '2026-05-01'),
        ('cust_wa_2', 'Contato WhatsApp', NULL, '124756066046167', 0, NULL, 'WhatsApp', '2026-05-01', '2026-05-01')
      `).run();

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, cpf, phone,
          card_number, credit_limit, used_limit, due_day, status
        ) VALUES
        (1, '38', 38, 'tok_dup_38', 'RENI DANIEL DA SILVA', '77388992634', '', '5489 0000 0000 0038', 300, 44.18, 20, 'active'),
        (2, '1769803264518', 1769803264518, 'tok_dup_reni_old', 'RENI DANIEL', NULL, '', '5489 0000 0000 0999', 150, 49.90, 20, 'active'),
        (3, '117', 117, 'tok_dup_117', 'ROSANGELA', NULL, '', '5489 0000 0000 0117', 300, 91.68, 20, 'active'),
        (4, '132', 132, 'tok_dup_132', 'ROSANGELA LIVIA', '79106498787', '', '5489 0000 0000 0132', 300, 112.43, 20, 'active')
      `).run();

      // Itens separados no Digifarma para 117 e 132 (por isso não devem fundir)
      memDb.prepare(`
        INSERT INTO digifarma_crediario_cache (id, cliente_id, cliente_nome, valor, data_compra, data_vencimento)
        VALUES
          ('df_117_1', 117, 'ROSANGELA', 91.68, ?, ?),
          ('df_132_1', 132, 'ROSANGELA LIVIA', 112.43, ?, ?)
      `).run(todayYMD, todayYMD, todayYMD, todayYMD);

      // Compra local + venda na conta duplicada da RENI DANIEL
      memDb.prepare(`
        INSERT INTO sales (id, sale_date, total_value, customer_id, customer_name, digifarma_venda_id)
        VALUES ('VND-94471', ?, 49.90, '1769803264518', 'RENI DANIEL', 94471)
      `).run(todayYMD);
      memDb.prepare(`
        INSERT INTO customer_debts (id, customerId, purchaseDate, totalValue, status)
        VALUES ('DEBT-VND-94471', '1769803264518', ?, 49.90, 'PENDENTE')
      `).run(todayYMD);
      memDb.prepare(`
        INSERT INTO crediario_local_purchases (id, card_id, sale_id, buyer_name, description, amount, status, purchased_at, due_date)
        VALUES ('lp_94471', 2, 'VND-94471', 'RENI DANIEL', 'FRALDA ISABABY', 49.90, 'open', ?, ?)
      `).run(todayYMD, todayYMD);

      const rep = unified.unifyDuplicateCustomersAndCards(memDb);

      // Cartão duplicado 2 da Reni deve ter sido unificado no 1 (ID 38)
      assert.strictEqual(rep.totalMergedCards, 1);
      assert.strictEqual(memDb.prepare('SELECT COUNT(*) AS n FROM belafarma_cards').get().n, 3);
      assert.strictEqual(memDb.prepare('SELECT card_id FROM crediario_local_purchases WHERE id = ?').get('lp_94471').card_id, 1);

      // ROSANGELA 117 e ROSANGELA LIVIA 132 devem continuar separadas
      assert.ok(memDb.prepare('SELECT id FROM belafarma_cards WHERE digifarma_cliente_id = 117').get());
      assert.ok(memDb.prepare('SELECT id FROM belafarma_cards WHERE digifarma_cliente_id = 132').get());

      // customers duplicados unificados, protegendo Contato WhatsApp, Adriana LID e CPFs diferentes
      const mergedFromIds = new Set(rep.mergedCustomers.map(m => m.fromId));
      assert.ok(mergedFromIds.has('1769803264518'));
      assert.ok(mergedFromIds.has('1769798949962'));
      assert.ok(mergedFromIds.has('1770835725036'));
      assert.ok(mergedFromIds.has('cust_wa_simone'));

      assert.ok(!mergedFromIds.has('cust_wa_adriana'), 'LID solto Adriana não deve ser unificado em ADRIANA MAE');
      assert.ok(!mergedFromIds.has('cust_wa_1') && !mergedFromIds.has('cust_wa_2'), 'Contato WhatsApp nunca deve fundir');
      assert.ok(!mergedFromIds.has('302') && !mergedFromIds.has('301'), 'CPFs diferentes nunca devem fundir');

      // Venda e dívida da Reni foram migradas para customer_id = '38'
      const migratedSale = memDb.prepare('SELECT customer_id, customer_name FROM sales WHERE id = ?').get('VND-94471');
      assert.strictEqual(migratedSale.customer_id, '38');
      assert.strictEqual(migratedSale.customer_name, 'RENI DANIEL DA SILVA');
      assert.strictEqual(memDb.prepare('SELECT customerId FROM customer_debts WHERE id = ?').get('DEBT-VND-94471').customerId, '38');

      memDb.close();
    });

    it('DUP-03: reconcilePendingLocalPurchasesToDigifarma grava venda pendente #94471 no FICHARIO e evita duplicação quando já existir no Digifarma', async () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);
      memDb.exec(`
        CREATE TABLE sales (
          id TEXT PRIMARY KEY,
          sale_date TEXT,
          total_value REAL,
          customer_id TEXT,
          customer_name TEXT,
          digifarma_venda_id INTEGER
        );
        CREATE TABLE sale_items (
          id TEXT PRIMARY KEY,
          sale_id TEXT,
          product_code TEXT,
          product_name TEXT,
          quantity REAL,
          unit_price REAL
        );
      `);

      const todayYMD = unified.toLocalDateYMD(new Date());
      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, cpf, phone,
          card_number, credit_limit, used_limit, due_day, status
        ) VALUES (1, '38', 38, 'tok_rec_94471', 'RENI DANIEL DA SILVA', '77388992634', '', '5489 0000 0000 0038', 300, 49.90, 20, 'active')
      `).run();

      memDb.prepare(`
        INSERT INTO sales (id, sale_date, total_value, customer_id, customer_name, digifarma_venda_id)
        VALUES ('VND-94471', ?, 49.90, '38', 'RENI DANIEL DA SILVA', 94471)
      `).run(todayYMD);
      memDb.prepare(`
        INSERT INTO sale_items (id, sale_id, product_code, product_name, quantity, unit_price)
        VALUES ('VND-94471-1', 'VND-94471', '189394', 'ISABABY FRALDA XXG', 1, 49.90)
      `).run();
      memDb.prepare(`
        INSERT INTO crediario_local_purchases (id, card_id, sale_id, buyer_name, description, items_json, amount, status, purchased_at, due_date)
        VALUES ('lp_94471', 1, 'VND-94471', 'RENI DANIEL', 'ISABABY FRALDA XXG', '[]', 49.90, 'open', ?, '2026-12-25')
      `).run(todayYMD);

      const mockFbFichario = [];
      let seqF = 8370;
      const queryMock = async (sql, params = []) => {
        const u = String(sql || '').toUpperCase().trim();
        if (u.includes('FROM CLIENTES WHERE CLIENTE_ID = ?')) {
          return [{ CLIENTE_ID: 38, CLIENTE: 'RENI DANIEL DA SILVA', CLI_DIA_PAGAMENTO: 20 }];
        }
        if (u.includes('FROM FICHARIO WHERE VENDA_NOTA_ID = ?')) {
          return mockFbFichario.filter(r => r.VENDA_NOTA_ID === Number(params[0]));
        }
        if (u.includes('FROM ARQUIVO_MORTO WHERE ARQ_NOTA = ?')) {
          return [];
        }
        if (u.includes('GEN_ID(GEN_FICHARIO, 1)')) {
          return [{ NEW_ID: seqF++ }];
        }
        if (u.startsWith('INSERT INTO FICHARIO')) {
          mockFbFichario.push({
            FICHARIO_ID: params[0],
            ITEM_VENDA_ID: params[1],
            CLIENTE_ID: params[2],
            FICHARIO_QUANTIDADE: params[3],
            FICHARIO_VALOR: params[4],
            VENDA_NOTA_ID: params[8],
            PRODUTO_ID: params[9]
          });
          return [];
        }
        return [];
      };

      const rec1 = await unified.reconcilePendingLocalPurchasesToDigifarma(memDb, { queryDigifarmaFn: queryMock });
      assert.strictEqual(rec1.syncedToDigifarma, 1);
      assert.strictEqual(mockFbFichario.length, 1);
      assert.strictEqual(mockFbFichario[0].CLIENTE_ID, 38);
      assert.strictEqual(mockFbFichario[0].VENDA_NOTA_ID, 94471);
      assert.strictEqual(mockFbFichario[0].FICHARIO_VALOR, 49.9);
      assert.strictEqual(memDb.prepare('SELECT COUNT(*) AS n FROM crediario_local_purchases').get().n, 0);
      assert.strictEqual(unified.buildClientStatement(memDb, 1).financials.principalBalance, 49.9);

      // Re-inserir pendência igual quando 94471 já existe no Firebird -> NÃO deve duplicar no FICHARIO
      memDb.prepare(`
        INSERT INTO crediario_local_purchases (id, card_id, sale_id, buyer_name, description, items_json, amount, status, purchased_at, due_date)
        VALUES ('lp_94471_dup', 1, 'VND-94471', 'RENI DANIEL', 'ISABABY FRALDA XXG', '[]', 49.90, 'open', ?, '2026-12-25')
      `).run(todayYMD);

      const rec2 = await unified.reconcilePendingLocalPurchasesToDigifarma(memDb, { queryDigifarmaFn: queryMock });
      assert.strictEqual(rec2.alreadyInDigifarma, 1);
      assert.strictEqual(rec2.syncedToDigifarma, 0);
      assert.strictEqual(mockFbFichario.length, 1, 'Não pode duplicar venda 94471 já gravada no FICHARIO');
      assert.strictEqual(memDb.prepare('SELECT COUNT(*) AS n FROM crediario_local_purchases').get().n, 0);

      memDb.close();
    });

    it('DUP-04: syncAllFromDigifarma não sequestra digifarma_cliente_id ativo (NAYANE 44) para homônimo vazio (119)', async () => {
      const memDb = new Database(':memory:');
      unified.ensureCrediarioUnifiedSchema(memDb);
      const todayYMD = unified.toLocalDateYMD(new Date());

      memDb.prepare(`
        INSERT INTO belafarma_cards (
          id, customer_id, digifarma_cliente_id, portal_token, customer_name, phone,
          card_number, credit_limit, used_limit, due_day, status
        ) VALUES (1, '44', 44, 'tok_nay_44', 'NAYANE', '', '5489 0000 0000 0044', 300, 99.9, 20, 'active')
      `).run();

      const queryMock = async (sql) => {
        const u = String(sql || '').toUpperCase();
        if (u.includes('FROM FICHARIO f')) {
          return [{
            FICHARIO_ID: 8100,
            CLIENTE_ID: 44,
            VENDA_NOTA_ID: 91000,
            PRODUTO_ID: 1001,
            FICHARIO_QUANTIDADE: 1,
            FICHARIO_VALOR: 99.9,
            FICHARIO_DESCONTO: 0,
            FICHARIO_FRETE: 0,
            FICHARIO_DATACOMPRA: todayYMD,
            FICHARIO_VENCIMENTO: todayYMD,
            FICHARIO_COMPRADOR: 'NAYANE',
            PRODUTO: 'PRODUTO TESTE',
            APRESENTACAO: 'CX',
            CLIENTE: 'NAYANE',
            CLI_CELULAR: '',
            CLI_TELEFONE: ''
          }];
        }
        if (u.includes('FROM CONTAS_RECEBIDAS')) {
          return [];
        }
        if (u.includes('FROM CLIENTES')) {
          return [
            { CLIENTE_ID: 44, CLIENTE: 'NAYANE', CLI_LIMIT: 300, CLI_LIMITE: 300, CLI_DIA_PAGAMENTO: 20 },
            { CLIENTE_ID: 119, CLIENTE: 'NAYANE', CLI_LIMIT: 300, CLI_LIMITE: 300, CLI_DIA_PAGAMENTO: 20 }
          ];
        }
        return [];
      };

      const res = await unified.syncAllFromDigifarma(memDb, { queryDigifarmaFn: queryMock });
      assert.strictEqual(res.success, true);

      const card44 = memDb.prepare('SELECT id, digifarma_cliente_id FROM belafarma_cards WHERE id = 1').get();
      assert.strictEqual(card44.digifarma_cliente_id, 44, 'Cartão 44 ativo jamais deve ser sobrescrito para 119');

      memDb.close();
    });
  });
});
