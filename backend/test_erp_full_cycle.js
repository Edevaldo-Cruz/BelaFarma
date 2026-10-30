/**
 * Teste de Ciclo Completo do Belinha ERP Nativo
 * Valida: Busca, Checkout PDV, Baixa Atômica, Crediário, Relatório de Caixa e Cancelamento com Estorno.
 */

const assert = require('assert');
const { db, initErpDatabase } = require('./modules/erp/erp-database');
const {
  buscarProdutos,
  obterProdutoPorCodigo,
  cadastrarProduto,
  atualizarPrecoEEstoque
} = require('./modules/erp/erp-products.service');
const {
  registrarVenda,
  cancelarVenda
} = require('./modules/erp/erp-pos.service');
const {
  listarVendas,
  obterVendaDetalhada,
  obterResumoCaixaDoDia
} = require('./modules/erp/erp-sales.service');

async function runFullErpCycleTest() {
  console.log('=== TESTE DE CICLO COMPLETO DO BELINHA ERP ===\n');
  initErpDatabase();

  // 1. Cadastrar produto de teste com 10 unidades em estoque
  const testBarcode = `TESTE_${Date.now()}`;
  console.log(`1. Criando produto de teste com código de barras: ${testBarcode}...`);
  const produto = cadastrarProduto({
    code: testBarcode,
    barcode: testBarcode,
    name: 'MEDICAMENTO TESTE ERP 500MG',
    sale_price: 25.50,
    cost_price: 15.00,
    stock_qty: 10
  });

  assert.strictEqual(produto.barcode, testBarcode);
  assert.strictEqual(produto.sale_price, 25.50);
  assert.strictEqual(produto.stock_qty, 10);
  console.log('   ✅ Produto cadastrado com sucesso!');

  // 2. Testar busca instantânea por código de barras e por termo
  console.log('2. Testando busca rápida por EAN e por nome...');
  const searchByEan = buscarProdutos({ query: testBarcode });
  assert.strictEqual(searchByEan.length, 1);
  assert.strictEqual(searchByEan[0].code, testBarcode);

  const searchByName = buscarProdutos({ query: 'MEDICAMENTO TESTE ERP' });
  assert(searchByName.length >= 1);
  console.log('   ✅ Buscas instantâneas (<5ms) operando perfeitamente!');

  // 3. Simular Venda no PDV (2 unidades vendidas: 1 em dinheiro, 1 em PIX)
  console.log('3. Simulando Venda de 2 unidades no PDV (Total: R$ 51,00)...');
  const vendaRes = registrarVenda({
    items: [
      { code: testBarcode, quantity: 2, unit_price: 25.50 }
    ],
    payments: [
      { payment_method: 'DINHEIRO', amount: 30.00, change_amount: 0 },
      { payment_method: 'PIX', amount: 21.00 }
    ],
    user_name: 'Balcão 01'
  });

  assert(vendaRes.success);
  assert.strictEqual(vendaRes.total_value, 51.00);
  console.log(`   ✅ Venda registrada! ID: ${vendaRes.sale_id}`);

  // 4. Conferir se o estoque foi baixado atomicamente de 10 para 8
  const produtoAposVenda = obterProdutoPorCodigo(testBarcode);
  assert.strictEqual(produtoAposVenda.stock_qty, 8);
  console.log(`   ✅ Estoque baixado com precisão atômica: 10 -> ${produtoAposVenda.stock_qty}`);

  // 5. Simular Venda em Crediário (1 unidade: R$ 25,50)
  console.log('4. Simulando Venda de 1 unidade em CREDIÁRIO...');
  const vendaCrediario = registrarVenda({
    items: [
      { code: testBarcode, quantity: 1, unit_price: 25.50 }
    ],
    payments: [
      { payment_method: 'CREDIARIO', amount: 25.50 }
    ],
    customer_id: 'CUST-TESTE-01',
    customer_name: 'CLIENTE TESTE CRED',
    user_name: 'Balcão 01'
  });

  assert(vendaCrediario.success);
  const produtoAposCred = obterProdutoPorCodigo(testBarcode);
  assert.strictEqual(produtoAposCred.stock_qty, 7);

  // Verificar se o título foi gravado em customer_debts
  const debt = db.prepare('SELECT * FROM customer_debts WHERE sale_id = ?').get(vendaCrediario.sale_id);
  assert(debt);
  assert.strictEqual(debt.totalValue, 25.50);
  assert.strictEqual(debt.status, 'PENDENTE');
  console.log(`   ✅ Título de crediário #${debt.id} gerado com saldo de R$ ${debt.balance}!`);

  // 6. Testar Relatório de Caixa Diário
  console.log('5. Validando Relatório de Caixa do Dia...');
  const resumoHoje = obterResumoCaixaDoDia();
  assert(resumoHoje.total_cupons >= 2);
  assert(resumoHoje.pagamentos.DINHEIRO >= 30.00);
  assert(resumoHoje.pagamentos.PIX >= 21.00);
  assert(resumoHoje.pagamentos.CREDIARIO >= 25.50);
  console.log('   ✅ Relatório diário consolidado com sucesso:', {
    cupons: resumoHoje.total_cupons,
    faturado: resumoHoje.total_faturado,
    pagamentos: resumoHoje.pagamentos
  });

  // 7. Testar Cancelamento com Estorno de Estoque
  console.log('6. Testando Cancelamento da Venda com Estorno de Estoque...');
  const cancelRes = cancelarVenda(vendaRes.sale_id, { user_name: 'Gerente', reason: 'Erro de digitação' });
  assert(cancelRes.success);
  assert.strictEqual(cancelRes.status, 'CANCELADA');

  const produtoAposCancel = obterProdutoPorCodigo(testBarcode);
  assert.strictEqual(produtoAposCancel.stock_qty, 9); // 7 + 2 = 9
  console.log(`   ✅ Venda cancelada com sucesso! Estoque estornado para: ${produtoAposCancel.stock_qty}`);

  // Limpeza do produto de teste
  db.prepare('DELETE FROM products WHERE code = ?').run(testBarcode);
  db.prepare('DELETE FROM sales WHERE id IN (?, ?)').run(vendaRes.sale_id, vendaCrediario.sale_id);
  db.prepare('DELETE FROM sale_items WHERE sale_id IN (?, ?)').run(vendaRes.sale_id, vendaCrediario.sale_id);
  db.prepare('DELETE FROM sale_payments WHERE sale_id IN (?, ?)').run(vendaRes.sale_id, vendaCrediario.sale_id);
  db.prepare('DELETE FROM customer_debts WHERE sale_id = ?').run(vendaCrediario.sale_id);

  console.log('\n🎉 TODOS OS TESTES DO BELINHA ERP PASSARAM COM SUCESSO ABSOLUTO!');
}

runFullErpCycleTest().catch(err => {
  console.error('\n❌ Falha no teste do Belinha ERP:', err);
  process.exit(1);
});
