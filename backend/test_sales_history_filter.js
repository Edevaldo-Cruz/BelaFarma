/**
 * Belinha ERP - Teste Automatizado de Listagem e Filtro por Forma de Pagamento
 */
const { initErpDatabase, db } = require('./modules/erp/erp-database');
const { listarVendas, obterResumoCaixaDoDia } = require('./modules/erp/erp-sales.service');

async function testSalesFilters() {
  console.log('--- TESTANDO LISTAGEM E FILTRO DE VENDAS DO DIA ---');
  initErpDatabase();

  const today = new Date().toISOString().split('T')[0];

  // 1. Cria vendas de teste com formas de pagamento variadas
  const salePixId = 'test_pix_' + Date.now();
  const saleDinheiroId = 'test_din_' + Date.now();
  const saleDebitoId = 'test_deb_' + Date.now();
  const saleCreditoId = 'test_cred_' + Date.now();
  const saleCrediarioId = 'test_convenio_' + Date.now();

  const insertSale = (id, total, method, customer) => {
    db.prepare(`
      INSERT INTO sales (id, user_id, user_name, customer_name, sale_date, sale_time, total_items_value, discount_value, total_value, payment_method, status, fiscal_status, created_at)
      VALUES (?, 'usr_teste', 'Caixa 1', ?, ?, '14:30:00', ?, 0, ?, ?, 'CONCLUIDA', 'EMITIDO', datetime('now', 'localtime'))
    `).run(id, customer, today, total, total, method);

    db.prepare(`
      INSERT INTO sale_payments (id, sale_id, payment_method, amount)
      VALUES (?, ?, ?, ?)
    `).run('pay_' + id, id, method, total);

    db.prepare(`
      INSERT INTO sale_items (id, sale_id, product_code, product_name, barcode, quantity, unit_price, total_price, unit_cost, total_cost, profit)
      VALUES (?, ?, 'PROD99', 'MEDICAMENTO TESTE', '7890000000000', 1, ?, ?, 5.00, 5.00, ? - 5.00)
    `).run('item_' + id, id, total, total, total);
  };

  insertSale(salePixId, 45.00, 'PIX', 'Cliente PIX');
  insertSale(saleDinheiroId, 30.00, 'DINHEIRO', 'Cliente Dinheiro');
  insertSale(saleDebitoId, 60.00, 'CARTAO_DEBITO', 'Cliente Débito');
  insertSale(saleCreditoId, 120.00, 'CARTAO_CREDITO', 'Cliente Crédito');
  insertSale(saleCrediarioId, 85.00, 'CREDIARIO', 'Cliente Convênio');

  console.log('✅ 5 vendas de teste inseridas com sucesso!');

  // 2. Testa listagem geral (Todas as formas)
  const todasVendas = listarVendas({ dataInicio: today, dataFim: today, limit: 100 });
  console.log(`✅ Total de vendas listadas no dia: ${todasVendas.length}`);
  if (todasVendas.length < 5) {
    throw new Error('Menos de 5 vendas retornadas na listagem geral.');
  }

  // 3. Testa filtro específico por PIX
  const vendasPix = listarVendas({ dataInicio: today, dataFim: today, paymentMethod: 'PIX' });
  console.log(`✅ Vendas filtradas por PIX: ${vendasPix.length}`);
  const achouPix = vendasPix.some(v => v.id === salePixId);
  const naoAchouDinheiro = !vendasPix.some(v => v.id === saleDinheiroId);
  if (!achouPix || !naoAchouDinheiro) {
    throw new Error('Filtro por PIX falhou!');
  }

  // 4. Testa filtro por Dinheiro
  const vendasDinheiro = listarVendas({ dataInicio: today, dataFim: today, paymentMethod: 'DINHEIRO' });
  console.log(`✅ Vendas filtradas por Dinheiro: ${vendasDinheiro.length}`);
  const achouDinheiro = vendasDinheiro.some(v => v.id === saleDinheiroId);
  if (!achouDinheiro) {
    throw new Error('Filtro por Dinheiro falhou!');
  }

  // 5. Testa filtro por Débito
  const vendasDebito = listarVendas({ dataInicio: today, dataFim: today, paymentMethod: 'CARTAO_DEBITO' });
  console.log(`✅ Vendas filtradas por Débito: ${vendasDebito.length}`);
  const achouDebito = vendasDebito.some(v => v.id === saleDebitoId);
  if (!achouDebito) {
    throw new Error('Filtro por Débito falhou!');
  }

  // 6. Testa filtro por Crédito
  const vendasCredito = listarVendas({ dataInicio: today, dataFim: today, paymentMethod: 'CARTAO_CREDITO' });
  console.log(`✅ Vendas filtradas por Crédito: ${vendasCredito.length}`);
  const achouCredito = vendasCredito.some(v => v.id === saleCreditoId);
  if (!achouCredito) {
    throw new Error('Filtro por Crédito falhou!');
  }

  // 7. Testa filtro por Crediário / Convênio
  const vendasCrediario = listarVendas({ dataInicio: today, dataFim: today, paymentMethod: 'CREDIARIO' });
  console.log(`✅ Vendas filtradas por Crediário: ${vendasCrediario.length}`);
  const achouCrediario = vendasCrediario.some(v => v.id === saleCrediarioId);
  if (!achouCrediario) {
    throw new Error('Filtro por Crediário falhou!');
  }

  // 8. Testa Resumo do Dia
  const resumo = obterResumoCaixaDoDia(today);
  console.log('✅ Resumo do Dia:', JSON.stringify(resumo.pagamentos, null, 2));
  if (resumo.pagamentos.PIX < 45 || resumo.pagamentos.DINHEIRO < 30 || resumo.pagamentos.CARTAO_DEBITO < 60 || resumo.pagamentos.CARTAO_CREDITO < 120 || resumo.pagamentos.CREDIARIO < 85) {
    throw new Error('Resumo do dia não computou corretamente os valores das formas de pagamento!');
  }

  // Limpeza
  const testIds = [salePixId, saleDinheiroId, saleDebitoId, saleCreditoId, saleCrediarioId];
  for (const tid of testIds) {
    db.prepare('DELETE FROM sale_payments WHERE sale_id = ?').run(tid);
    db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(tid);
    db.prepare('DELETE FROM sales WHERE id = ?').run(tid);
  }

  console.log('\n🎉 TODOS OS TESTES DE FILTRO POR DIA E FORMAS DE PAGAMENTO PASSARAM!');
}

testSalesFilters().catch(err => {
  console.error('\n❌ ERRO NO TESTE:', err);
  process.exit(1);
});
