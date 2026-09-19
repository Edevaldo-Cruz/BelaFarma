import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCashReconciliation,
  calculateDigitalReconciliation,
  calculateGlobalClosing,
  round2
} from '../utils/closingCalculations.ts';

describe('Suíte de Testes Unitários: Fechamento de Caixa BelaFarma', () => {

  describe('1. Conferência de Dinheiro Físico (Gaveta)', () => {
    it('Cenário 1.1: Gaveta perfeitamente equilibrada (diferença zero)', () => {
      const res = calculateCashReconciliation({
        initialCash: 400.00,    // Troco inicial
        cashSales: 650.00,      // Vendas em dinheiro no ERP
        creditReceipts: 0,
        receivedExtra: 0,
        nonRegistered: 0,
        expenses: 50.00,        // Despesa paga pelo caixa
        sangrias: 200.00,       // Sangria realizada para o cofre
        countedInDrawer: 800.00 // 400 + 650 - 50 - 200 = 800
      });

      assert.strictEqual(res.expectedInDrawer, 800.00);
      assert.strictEqual(res.countedInDrawer, 800.00);
      assert.strictEqual(res.cashDifference, 0.00);
      assert.strictEqual(res.totalCashHandled, 1000.00); // 800 gaveta + 200 sangria
      assert.strictEqual(res.isBalanced, true);
    });

    it('Cenário 1.2: Recebimento de Crediário antigo pago em dinheiro (SOMA na gaveta)', () => {
      // Cliente foi até a farmácia e quitou uma dívida antiga de R$ 75,00 em cédula.
      // O dinheiro físico entrou na gaveta e não é venda do dia.
      const res = calculateCashReconciliation({
        initialCash: 350.00,
        cashSales: 500.00,
        creditReceipts: 75.00,  // Recebimento de fiado antigo
        receivedExtra: 0,
        nonRegistered: 0,
        expenses: 0,
        sangrias: 0,
        countedInDrawer: 925.00 // 350 + 500 + 75 = 925
      });

      assert.strictEqual(res.expectedInDrawer, 925.00, 'O recebimento de fiado deve somar ao saldo esperado da gaveta');
      assert.strictEqual(res.cashDifference, 0.00);
      assert.strictEqual(res.isBalanced, true);
    });

    it('Cenário 1.3: Sangrias do expediente reduzem a gaveta sem causar erro', () => {
      // Foram feitas 2 sangrias durante a tarde: R$ 300 e R$ 222 (total R$ 522)
      const res = calculateCashReconciliation({
        initialCash: 438.30,
        cashSales: 654.75,
        creditReceipts: 0,
        receivedExtra: 0,
        nonRegistered: 0,
        expenses: 0,
        sangrias: 522.00,       // R$ 522 foram para o cofre
        countedInDrawer: 571.05 // 438.30 + 654.75 - 522 = 571.05
      });

      assert.strictEqual(res.expectedInDrawer, 571.05);
      assert.strictEqual(res.cashDifference, 0.00);
      assert.strictEqual(res.totalCashHandled, 1093.05); // 571.05 + 522.00 = 1093.05
      assert.strictEqual(res.isBalanced, true);
    });

    it('Cenário 1.4: Detecção precisa de FALTA de dinheiro na gaveta', () => {
      // Esperado R$ 500, mas só foram contados R$ 483,60 (falta R$ 16,40)
      const res = calculateCashReconciliation({
        initialCash: 200.00,
        cashSales: 300.00,
        creditReceipts: 0,
        expenses: 0,
        sangrias: 0,
        countedInDrawer: 483.60
      });

      assert.strictEqual(res.expectedInDrawer, 500.00);
      assert.strictEqual(res.countedInDrawer, 483.60);
      assert.strictEqual(res.cashDifference, -16.40, 'Deve apontar exatamente falta de -16.40');
      assert.strictEqual(res.isBalanced, false);
    });

    it('Cenário 1.5: Detecção precisa de SOBRA de dinheiro na gaveta', () => {
      // Esperado R$ 300, mas foram contados R$ 320 (sobra R$ 20,00)
      const res = calculateCashReconciliation({
        initialCash: 100.00,
        cashSales: 200.00,
        creditReceipts: 0,
        expenses: 0,
        sangrias: 0,
        countedInDrawer: 320.00
      });

      assert.strictEqual(res.expectedInDrawer, 300.00);
      assert.strictEqual(res.countedInDrawer, 320.00);
      assert.strictEqual(res.cashDifference, 20.00, 'Deve apontar sobra de +20.00');
      assert.strictEqual(res.isBalanced, false);
    });

    it('Cenário 1.6: Produtos não cadastrados e entradas extras', () => {
      const res = calculateCashReconciliation({
        initialCash: 100.00,
        cashSales: 200.00,
        creditReceipts: 0,
        receivedExtra: 15.00,
        nonRegistered: 25.50,
        expenses: 10.00,
        sangrias: 50.00,
        countedInDrawer: 280.50 // 100 + 200 + 15 + 25.50 - 10 - 50 = 280.50
      });

      assert.strictEqual(res.expectedInDrawer, 280.50);
      assert.strictEqual(res.cashDifference, 0.00);
      assert.strictEqual(res.isBalanced, true);
    });
  });

  describe('2. Conferência Digital (Maquininhas M1/M2 e Pix)', () => {
    it('Cenário 2.1: Cartões e Pix perfeitamente equilibrados com ERP', () => {
      const res = calculateDigitalReconciliation({
        cardGrid: {
          m1_debit: 300.00,
          m1_credit: 150.00,
          m1_installments: 50.00,
          m2_debit: 100.00,
          m2_credit: 50.00,
          m2_installments: 0.00,
          others: 0.00
        },
        pixMachine: 120.00,
        pixDirect: 80.00,
        erpDebit: 400.00,          // 300 + 100
        erpCredit: 200.00,         // 150 + 50
        erpInstallments: 50.00,    // 50
        erpPix: 200.00,            // 120 (maquininha) + 80 (Inter) = 200
        erpOthers: 0.00
      });

      assert.strictEqual(res.totalDebitCounted, 400.00);
      assert.strictEqual(res.totalCreditCounted, 200.00);
      assert.strictEqual(res.totalInstallmentsCounted, 50.00);
      assert.strictEqual(res.totalCardsCounted, 650.00);
      assert.strictEqual(res.totalPixCounted, 200.00);
      assert.strictEqual(res.totalDigitalCounted, 850.00);
      assert.strictEqual(res.erpDigitalExpected, 850.00);
      assert.strictEqual(res.digitalDifference, 0.00);
      assert.strictEqual(res.isBalanced, true);
    });

    it('Cenário 2.2: Detecção de divergência em cartão (filipeta digitada menor)', () => {
      const res = calculateDigitalReconciliation({
        cardGrid: {
          m1_debit: 250.00, // Deveria ser 270 (faltam 20)
          m2_debit: 0,
        },
        pixMachine: 50.00,
        pixDirect: 0,
        erpDebit: 270.00,
        erpCredit: 0,
        erpPix: 50.00
      });

      assert.strictEqual(res.totalDebitCounted, 250.00);
      assert.strictEqual(res.debitDifference, -20.00);
      assert.strictEqual(res.digitalDifference, -20.00);
      assert.strictEqual(res.isBalanced, false);
    });

    it('Cenário 2.3: Reconciliação do Pix Direto (Banco Inter + Maquininha vs ERP)', () => {
      // No Digifarma foi lançado R$ 298,92 em Pix total.
      // Sendo R$ 118,18 na maquininha POS e R$ 180,74 no Pix Direto (Banco Inter).
      const res = calculateDigitalReconciliation({
        cardGrid: {},
        pixMachine: 118.18,
        pixDirect: 180.74,
        erpDebit: 0,
        erpCredit: 0,
        erpPix: 298.92
      });

      assert.strictEqual(res.totalPixCounted, 298.92);
      assert.strictEqual(res.pixDifference, 0.00);
      assert.strictEqual(res.isBalanced, true);
    });
  });

  describe('3. Reconciliação Global e Casos Reais', () => {
    it('Cenário 3.1: Fechamento completo sem divergências', () => {
      // Venda total do dia: R$ 1.500,00
      // Dinheiro: 500, Débito: 400, Crédito: 300, Pix: 200, Crediário novo: 100
      // 500 + 400 + 300 + 200 + 100 = 1500
      const res = calculateGlobalClosing({
        cash: {
          initialCash: 250.00,
          cashSales: 500.00,
          creditReceipts: 50.00, // Fiado antigo pago hoje
          expenses: 20.00,
          sangrias: 100.00,
          countedInDrawer: 680.00 // 250 + 500 + 50 - 20 - 100 = 680
        },
        digital: {
          cardGrid: {
            m1_debit: 400.00,
            m1_credit: 300.00
          },
          pixMachine: 200.00,
          pixDirect: 0,
          erpDebit: 400.00,
          erpCredit: 300.00,
          erpPix: 200.00
        },
        totalSales: 1500.00,
        totalCrediario: 100.00 // Fiado novo (não entra na receita financeira de hoje)
      });

      assert.strictEqual(res.cash.cashDifference, 0.00, 'Gaveta deve bater');
      assert.strictEqual(res.digital.digitalDifference, 0.00, 'Digital deve bater');
      assert.strictEqual(res.globalDifference, 0.00, 'Global deve bater');
      assert.strictEqual(res.isBalanced, true);
      // Total conferido = 680 (gaveta) + 100 (sangria) + 400 (deb) + 300 (cred) + 200 (pix) = 1680
      assert.strictEqual(res.totalConferido, 1680.00);
      // Subtotal soma = (1500 - 100) + 250 (inicial) + 50 (rec fiado) - 20 (desp) = 1680
      assert.strictEqual(res.subtotalSoma, 1680.00);
    });

    it('Cenário 3.2: Reconstituição do fechamento real de 18/09 (identificação da diferença de -R$ 16,40)', () => {
      // Dados reais salvos no banco em 18/09:
      // Total Sales: 1962.50, Initial Cash: 438.30
      // Credit: 136.09, Debit: 796.83, Pix: 298.92, Crediario Novo: 75.91
      // Dinheiro no ERP = 1962.50 - (136.09 + 796.83 + 298.92 + 75.91) = 654.75
      // Sangrias no dia: R$ 300 + R$ 222 = R$ 522.00
      // Gaveta contada: R$ 554.65
      // Esperado na gaveta: 438.30 + 654.75 - 522.00 = 571.05
      // Diferença de Gaveta = 554.65 - 571.05 = -16.40 (Falta de dinheiro físico na gaveta!)

      const res = calculateGlobalClosing({
        cash: {
          initialCash: 438.30,
          cashSales: 654.75,
          creditReceipts: 0,
          expenses: 0,
          sangrias: 522.00,
          countedInDrawer: 554.65
        },
        digital: {
          cardGrid: {
            m1_debit: 796.83,
            m1_credit: 136.09
          },
          pixMachine: 118.18,
          pixDirect: 180.74,
          erpDebit: 796.83,
          erpCredit: 136.09,
          erpPix: 298.92
        },
        totalSales: 1962.50,
        totalCrediario: 75.91
      });

      assert.strictEqual(res.digital.digitalDifference, 0.00, 'Os valores digitais bateram 100%');
      assert.strictEqual(res.cash.cashDifference, -16.40, 'Identificado: os R$ 16,40 faltaram na gaveta física (troco ou despesa não lançada)!');
      assert.strictEqual(res.globalDifference, -16.40);
      assert.strictEqual(res.isBalanced, false);
    });

    it('Cenário 3.3: Precisão de centavos com dízimas periódicas e arredondamento', () => {
      const v1 = round2(0.1 + 0.2);
      assert.strictEqual(v1, 0.3);

      const v2 = round2(10.005);
      assert.strictEqual(v2, 10.01);

      const res = calculateCashReconciliation({
        initialCash: 33.33,
        cashSales: 66.67,
        creditReceipts: 0.01,
        expenses: 0.01,
        sangrias: 0,
        countedInDrawer: 100.00
      });
      assert.strictEqual(res.cashDifference, 0.00);
      assert.strictEqual(res.isBalanced, true);
    });
  });
});
