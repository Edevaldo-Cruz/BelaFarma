/**
 * Utilitário de Cálculos do Fechamento de Caixa - BelaFarma
 * 
 * Regras Financeiras:
 * 1. Dinheiro Físico (Gaveta):
 *    Gaveta Esperada = Saldo Inicial (Troco) + Vendas em Dinheiro (Digifarma)
 *                      + Recebimento de Crediário (fiado antigo pago hoje em dinheiro)
 *                      + Entradas Extras + Produtos Não Cadastrados
 *                      - Despesas Pagas pelo Caixa - Sangrias Realizadas
 *    Diferença de Dinheiro = Dinheiro Físico Contado na Gaveta - Gaveta Esperada
 * 
 * 2. Valores Digitais (Cartões & Pix):
 *    Cartões Conferidos = M1 (Débito + Crédito 1x + Parcelado) + M2 (Débito + Crédito 1x + Parcelado) + Outros
 *    Pix Conferido = Pix Maquininhas (comprovante POS) + Pix Direto na Conta (Banco Inter / WhatsApp)
 *    Total Digital Conferido = Cartões Conferidos + Pix Conferido
 *    Total Digital Esperado = Débito + Crédito (à vista + parcelado) + Pix + Outros do Digifarma
 *    Diferença Digital = Total Digital Conferido - Total Digital Esperado
 * 
 * 3. Totalizador Geral:
 *    Divergência Global = Diferença de Dinheiro + Diferença Digital
 */

export const round2 = (num: number): number => {
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
};

export interface CashReconciliationInput {
  initialCash: number;       // Saldo inicial (troco de abertura)
  cashSales: number;         // Vendas do dia recebidas em dinheiro no Digifarma
  creditReceipts: number;    // Recebimento de fiado/crediário antigo pago em dinheiro
  receivedExtra?: number;    // Entradas extras avulsas
  nonRegistered?: number;    // Vendas sem cadastro em dinheiro
  expenses: number;          // Despesas operacionais pagas em dinheiro
  sangrias: number;          // Sangrias / retiradas intermediárias realizadas no dia
  countedInDrawer: number;   // Total de cédulas e moedas contadas na gaveta
}

export interface CashReconciliationResult {
  expectedInDrawer: number;    // Saldo que deveria estar na gaveta no final
  countedInDrawer: number;     // Saldo físico apurado
  cashDifference: number;      // countedInDrawer - expectedInDrawer (positivo = sobra, negativo = falta)
  totalCashHandled: number;    // countedInDrawer + sangrias
  totalInflows: number;        // initialCash + cashSales + creditReceipts + receivedExtra + nonRegistered
  totalOutflows: number;       // expenses + sangrias
  isBalanced: boolean;         // Math.abs(cashDifference) < 0.05
}

export interface CardGridValues {
  m1_debit?: number;
  m1_credit?: number;
  m1_installments?: number;
  m2_debit?: number;
  m2_credit?: number;
  m2_installments?: number;
  others?: number;
}

export interface DigitalReconciliationInput {
  cardGrid: CardGridValues;
  pixMachine: number;        // Pix lançado pela maquininha de cartão (filipeta)
  pixDirect: number;         // Pix recebido na conta bancária (Banco Inter)
  erpDebit: number;          // Vendas Débito no Digifarma
  erpCredit: number;         // Vendas Crédito à Vista no Digifarma
  erpInstallments?: number;  // Vendas Crédito Parcelado no Digifarma
  erpPix: number;            // Total Pix registrado no Digifarma
  erpOthers?: number;        // Outras modalidades digitais no Digifarma
}

export interface DigitalReconciliationResult {
  totalDebitCounted: number;
  totalCreditCounted: number;
  totalInstallmentsCounted: number;
  totalCardsCounted: number;
  totalPixCounted: number;
  totalDigitalCounted: number;
  erpDigitalExpected: number;
  digitalDifference: number; // totalDigitalCounted - erpDigitalExpected
  debitDifference: number;
  creditDifference: number;
  pixDifference: number;
  isBalanced: boolean;
}

export interface GlobalClosingInput {
  cash: CashReconciliationInput;
  digital: DigitalReconciliationInput;
  totalSales: number;        // Venda Bruta total do Digifarma
  totalCrediario: number;    // Vendas em fiado novo no Digifarma (não liquidadas)
}

export interface GlobalClosingResult {
  cash: CashReconciliationResult;
  digital: DigitalReconciliationResult;
  globalDifference: number;    // cashDifference + digitalDifference
  totalConferido: number;      // countedInDrawer + sangrias + totalDigitalCounted
  subtotalSoma: number;        // Saldo total esperado reconciliado
  isBalanced: boolean;
}

/**
 * Reconciliação do Dinheiro Físico (Gaveta)
 */
export function calculateCashReconciliation(input: CashReconciliationInput): CashReconciliationResult {
  const initialCash = round2(input.initialCash || 0);
  const cashSales = round2(input.cashSales || 0);
  const creditReceipts = round2(input.creditReceipts || 0);
  const receivedExtra = round2(input.receivedExtra || 0);
  const nonRegistered = round2(input.nonRegistered || 0);
  const expenses = round2(input.expenses || 0);
  const sangrias = round2(input.sangrias || 0);
  const countedInDrawer = round2(input.countedInDrawer || 0);

  const totalInflows = round2(initialCash + cashSales + creditReceipts + receivedExtra + nonRegistered);
  const totalOutflows = round2(expenses + sangrias);
  const expectedInDrawer = round2(totalInflows - totalOutflows);
  const cashDifference = round2(countedInDrawer - expectedInDrawer);
  const totalCashHandled = round2(countedInDrawer + sangrias);

  return {
    expectedInDrawer,
    countedInDrawer,
    cashDifference,
    totalCashHandled,
    totalInflows,
    totalOutflows,
    isBalanced: Math.abs(cashDifference) < 0.05,
  };
}

/**
 * Reconciliação dos Valores Digitais (Cartões e Pix)
 */
export function calculateDigitalReconciliation(input: DigitalReconciliationInput): DigitalReconciliationResult {
  const g = input.cardGrid || {};
  const m1_deb = round2(g.m1_debit || 0);
  const m1_cred = round2(g.m1_credit || 0);
  const m1_inst = round2(g.m1_installments || 0);
  const m2_deb = round2(g.m2_debit || 0);
  const m2_cred = round2(g.m2_credit || 0);
  const m2_inst = round2(g.m2_installments || 0);
  const others = round2(g.others || 0);

  const totalDebitCounted = round2(m1_deb + m2_deb);
  const totalCreditCounted = round2(m1_cred + m2_cred);
  const totalInstallmentsCounted = round2(m1_inst + m2_inst);
  const totalCardsCounted = round2(totalDebitCounted + totalCreditCounted + totalInstallmentsCounted + others);

  const pixMachine = round2(input.pixMachine || 0);
  const pixDirect = round2(input.pixDirect || 0);
  const totalPixCounted = round2(pixMachine + pixDirect);

  const totalDigitalCounted = round2(totalCardsCounted + totalPixCounted);

  const erpDebit = round2(input.erpDebit || 0);
  const erpCredit = round2(input.erpCredit || 0);
  const erpInstallments = round2(input.erpInstallments || 0);
  const erpPix = round2(input.erpPix || 0);
  const erpOthers = round2(input.erpOthers || 0);

  const erpDigitalExpected = round2(erpDebit + erpCredit + erpInstallments + erpPix + erpOthers);
  const digitalDifference = round2(totalDigitalCounted - erpDigitalExpected);

  const debitDifference = round2(totalDebitCounted - erpDebit);
  const creditDifference = round2((totalCreditCounted + totalInstallmentsCounted) - (erpCredit + erpInstallments));
  const pixDifference = round2(totalPixCounted - erpPix);

  return {
    totalDebitCounted,
    totalCreditCounted,
    totalInstallmentsCounted,
    totalCardsCounted,
    totalPixCounted,
    totalDigitalCounted,
    erpDigitalExpected,
    digitalDifference,
    debitDifference,
    creditDifference,
    pixDifference,
    isBalanced: Math.abs(digitalDifference) < 0.05,
  };
}

/**
 * Reconciliação Global Completa
 */
export function calculateGlobalClosing(input: GlobalClosingInput): GlobalClosingResult {
  const cashRes = calculateCashReconciliation(input.cash);
  const digitalRes = calculateDigitalReconciliation(input.digital);

  const globalDifference = round2(cashRes.cashDifference + digitalRes.digitalDifference);

  // Total conferido no dia = Dinheiro físico em circulação (gaveta + sangrias) + Meios digitais
  const totalConferido = round2(cashRes.totalCashHandled + digitalRes.totalDigitalCounted);

  // Saldo esperado global:
  // Vendas totais do Digifarma líquidas de fiado novo + Saldo Inicial + Recebimentos de Fiado + Extras + Não cadastrados - Despesas
  const totalSales = round2(input.totalSales || 0);
  const totalCrediario = round2(input.totalCrediario || 0);
  const initialCash = round2(input.cash.initialCash || 0);
  const creditReceipts = round2(input.cash.creditReceipts || 0);
  const receivedExtra = round2(input.cash.receivedExtra || 0);
  const nonRegistered = round2(input.cash.nonRegistered || 0);
  const expenses = round2(input.cash.expenses || 0);

  const subtotalSoma = round2(
    (totalSales - totalCrediario) + initialCash + creditReceipts + receivedExtra + nonRegistered - expenses
  );

  return {
    cash: cashRes,
    digital: digitalRes,
    globalDifference,
    totalConferido,
    subtotalSoma,
    isBalanced: Math.abs(globalDifference) < 0.05,
  };
}
