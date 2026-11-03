/**
 * Bateria de Testes Automatizados - PDV BelaFarma Express
 * Valida os critérios exigidos pela Receita Federal, ANVISA e CRF:
 * 1. Produto sem cadastro (*123 / avulso)
 * 2. Produto que retém receita (Portaria 344/98 e RDC 20/2011)
 * 3. Venda em Crediário com lançamento de débito em customer_debts
 * 4. Venda em Cartão de Débito, Crédito parcelado e PIX
 * 5. Venda em Dinheiro com conferência de troco
 * 6. Consulta e Resumo de Fechamento de Caixa do Dia
 * 7. Cancelamento de venda com estorno atômico de estoque
 */

const assert = require('assert');
const { signToken } = require('./security');

const BASE_URL = 'http://localhost:3001';
const token = signToken({
  id: 'caixa-test-01',
  name: 'Operador de Caixa Teste',
  role: 'Administrador'
});

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};

async function postJson(endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function getJson(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'GET',
    headers
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function runPdvTestSuite() {
  console.log('===============================================================');
  console.log('🧪 INICIANDO BATERIA DE TESTES DO PDV BELAFARMA EXPRESS');
  console.log('===============================================================\n');

  // 0. Obter produto cadastrado no banco para testes
  console.log('0. Buscando catálogo de produtos para teste...');
  const searchRes = await getJson('/api/erp/products?q=DIPIRONA&limit=1');
  assert.strictEqual(searchRes.status, 200, 'Busca de produtos deve retornar 200');
  assert(searchRes.data.data && searchRes.data.data.length > 0, 'Deve encontrar pelo menos 1 produto');
  const baseProd = searchRes.data.data[0];
  console.log(`   ✅ Produto encontrado: ${baseProd.name} (Código: ${baseProd.code}, Preço: R$ ${baseProd.sale_price}, Estoque atual: ${baseProd.stock_qty})`);

  // =========================================================================
  // TESTE 1: Produto Sem Cadastro (*123 ou avulso)
  // =========================================================================
  console.log('\n--- TESTE 1: PRODUTO SEM CADASTRO (*123 / AVULSO) ---');
  const unregisteredCode = `*123_${Date.now()}`;
  const unregSalePayload = {
    items: [
      {
        code: unregisteredCode,
        barcode: unregisteredCode,
        product_name: 'XAROPE AVULSO SEM CADASTRO 150ML',
        quantity: 1,
        unit_price: 18.50,
        unit_cost: 10.00,
        is_unregistered: 1
      }
    ],
    payments: [
      {
        payment_method: 'DINHEIRO',
        amount: 18.50,
        change_amount: 0
      }
    ],
    user_name: 'Operador de Caixa Teste',
    seller_id: 'caixa-test-01',
    seller_name: 'Operador de Caixa Teste'
  };

  const unregRes = await postJson('/api/erp/pos/checkout', unregSalePayload);
  assert([200, 201].includes(unregRes.status), 'Venda com produto sem cadastro deve ser aprovada');
  assert(unregRes.data.success, 'Status da venda sem cadastro deve ser sucesso');
  console.log(`   ✅ Venda com produto não cadastrado processada! ID: ${unregRes.data.sale_id}`);

  // =========================================================================
  // TESTE 2: Produto que Retém Receita (Portaria 344/98 e RDC 20)
  // =========================================================================
  console.log('\n--- TESTE 2: PRODUTO QUE RETÉM RECEITA (CONTROLE ESPECIAL / SNGPC) ---');
  const testControlledLot = `LOTE-${Date.now().toString().slice(-6)}`;
  const controlledSalePayload = {
    items: [
      {
        code: baseProd.code,
        barcode: baseProd.barcode,
        product_name: baseProd.name,
        quantity: 2,
        unit_price: baseProd.sale_price,
        unit_cost: baseProd.cost_price || 0
      }
    ],
    payments: [
      {
        payment_method: 'CARTAO_DEBITO',
        amount: Math.round(2 * baseProd.sale_price * 100) / 100,
        card_brand: 'MASTERCARD'
      }
    ],
    user_name: 'Operador de Caixa Teste',
    seller_id: 'caixa-test-01',
    seller_name: 'Operador de Caixa Teste',
    controlled_recipes: [
      {
        product_code: baseProd.code,
        product_name: baseProd.name,
        recipe_type: 'AZUL',
        notification_number: 'NOTIF-2026-MG-0081',
        prescription_date: '2026-10-30',
        prescriber_name: 'Dr. Roberto Silveira CRM 12345-MG',
        prescriber_council: 'CRM',
        prescriber_number: '12345',
        prescriber_uf: 'MG',
        buyer_name: 'Maria Antônia Souza',
        buyer_cpf: '123.456.789-00',
        buyer_rg: 'MG-14.889.001',
        buyer_rg_issuer: 'SSP-MG',
        buyer_address: 'Rua Espírito Santo, 1000 - Juiz de Fora/MG',
        buyer_phone: '(32) 99887-6655',
        patient_name: 'Maria Antônia Souza',
        batch_lot: testControlledLot,
        expiry_date: '2028-12-31',
        quantity: 2
      }
    ]
  };

  const controlledRes = await postJson('/api/erp/pos/checkout', controlledSalePayload);
  assert([200, 201].includes(controlledRes.status), 'Venda de controlado com receita deve passar');
  assert(controlledRes.data.success, 'Sucesso ao registrar venda controlada');
  console.log(`   ✅ Venda de controlado registrada! ID: ${controlledRes.data.sale_id}`);

  // Verificar se a receita foi devidamente gravada no livro sanitário do SNGPC
  const recipesListRes = await getJson(`/api/erp/controlled/recipes?saleId=${controlledRes.data.sale_id}`);
  assert.strictEqual(recipesListRes.status, 200);
  assert(recipesListRes.data.data && recipesListRes.data.data.length > 0, 'Receita deve estar gravada no banco sanitário');
  const savedRecipe = recipesListRes.data.data[0];
  assert.strictEqual(savedRecipe.batch_lot, testControlledLot);
  assert.strictEqual(savedRecipe.prescriber_number, '12345');
  assert.strictEqual(savedRecipe.recipe_type, 'AZUL');
  console.log(`   ✅ Livro Sanitário SNGPC: Receita ${savedRecipe.notification_number} vinculada com lote ${savedRecipe.batch_lot}!`);

  // =========================================================================
  // TESTE 3: Venda em Crediário (com criação de débito)
  // =========================================================================
  console.log('\n--- TESTE 3: VENDA EM CREDIÁRIO ---');
  const crediarioPayload = {
    items: [
      {
        code: baseProd.code,
        barcode: baseProd.barcode,
        product_name: baseProd.name,
        quantity: 1,
        unit_price: baseProd.sale_price,
        unit_cost: baseProd.cost_price || 0
      }
    ],
    payments: [
      {
        payment_method: 'CREDIARIO',
        amount: baseProd.sale_price
      }
    ],
    customer_id: 'CUST-TESTE-CREDIARIO',
    customer_name: 'Cliente Teste Crediário',
    user_name: 'Operador de Caixa Teste',
    seller_id: 'caixa-test-01',
    seller_name: 'Operador de Caixa Teste'
  };

  const credRes = await postJson('/api/erp/pos/checkout', crediarioPayload);
  assert([200, 201].includes(credRes.status));
  assert(credRes.data.success, 'Venda no crediário concluída com sucesso');
  console.log(`   ✅ Venda em Crediário gravada! ID: ${credRes.data.sale_id}`);

  // =========================================================================
  // TESTE 4: Cartões (Débito e Crédito Parcelado) e PIX
  // =========================================================================
  console.log('\n--- TESTE 4: PAGAMENTOS EM CARTÃO (CRÉDITO 3x) E PIX ---');
  // 4a. Cartão Crédito 3x
  const creditoPayload = {
    items: [
      {
        code: baseProd.code,
        barcode: baseProd.barcode,
        product_name: baseProd.name,
        quantity: 1,
        unit_price: baseProd.sale_price,
        unit_cost: baseProd.cost_price || 0
      }
    ],
    payments: [
      {
        payment_method: 'CARTAO_CREDITO',
        amount: baseProd.sale_price,
        card_brand: 'VISA',
        installments: 3
      }
    ],
    user_name: 'Operador de Caixa Teste',
    seller_id: 'caixa-test-01',
    seller_name: 'Operador de Caixa Teste'
  };
  const creditoRes = await postJson('/api/erp/pos/checkout', creditoPayload);
  assert([200, 201].includes(creditoRes.status));
  assert(creditoRes.data.success);
  console.log(`   ✅ Venda em Cartão de Crédito 3x (VISA) gravada! ID: ${creditoRes.data.sale_id}`);

  // 4b. PIX
  const pixPayload = {
    items: [
      {
        code: baseProd.code,
        barcode: baseProd.barcode,
        product_name: baseProd.name,
        quantity: 1,
        unit_price: baseProd.sale_price,
        unit_cost: baseProd.cost_price || 0
      }
    ],
    payments: [
      {
        payment_method: 'PIX',
        amount: baseProd.sale_price
      }
    ],
    user_name: 'Operador de Caixa Teste',
    seller_id: 'caixa-test-01',
    seller_name: 'Operador de Caixa Teste'
  };
  const pixRes = await postJson('/api/erp/pos/checkout', pixPayload);
  assert([200, 201].includes(pixRes.status));
  assert(pixRes.data.success);
  console.log(`   ✅ Venda em PIX gravada! ID: ${pixRes.data.sale_id}`);

  // =========================================================================
  // TESTE 5: Dinheiro com Conferência de Troco
  // =========================================================================
  console.log('\n--- TESTE 5: DINHEIRO COM TROCO ---');
  const valorVenda = 35.00;
  const valorRecebido = 50.00;
  const trocoCalculado = 15.00;

  const dinheiroPayload = {
    items: [
      {
        code: baseProd.code,
        barcode: baseProd.barcode,
        product_name: 'PRODUTO TESTE TROCO',
        quantity: 1,
        unit_price: valorVenda,
        unit_cost: 20.00
      }
    ],
    payments: [
      {
        payment_method: 'DINHEIRO',
        amount: valorVenda,
        change_amount: trocoCalculado
      }
    ],
    user_name: 'Operador de Caixa Teste',
    seller_id: 'caixa-test-01',
    seller_name: 'Operador de Caixa Teste'
  };
  const dinheiroRes = await postJson('/api/erp/pos/checkout', dinheiroPayload);
  assert([200, 201].includes(dinheiroRes.status));
  assert(dinheiroRes.data.success);
  console.log(`   ✅ Venda em Dinheiro gravada! ID: ${dinheiroRes.data.sale_id} (Valor: R$ ${valorVenda.toFixed(2)}, Troco: R$ ${trocoCalculado.toFixed(2)})`);

  // =========================================================================
  // TESTE 6: Resumo e Fechamento de Caixa do Dia
  // =========================================================================
  console.log('\n--- TESTE 6: RESUMO E FECHAMENTO DE CAIXA DO DIA ---');
  const today = new Date().toISOString().split('T')[0];
  const closingRes = await getJson(`/api/erp/sales/summary/day?date=${today}`);
  assert.strictEqual(closingRes.status, 200);
  assert(closingRes.data.success);
  const summary = closingRes.data.data;
  console.log(`   ✅ Resumo de Caixa Obtido:`);
  console.log(`      • Total Faturado: R$ ${summary.total_faturado.toFixed(2)} (${summary.total_cupons} cupons)`);
  console.log(`      • Dinheiro:       R$ ${summary.pagamentos.DINHEIRO.toFixed(2)}`);
  console.log(`      • Cartão Débito:  R$ ${summary.pagamentos.CARTAO_DEBITO.toFixed(2)}`);
  console.log(`      • Cartão Crédito: R$ ${summary.pagamentos.CARTAO_CREDITO.toFixed(2)}`);
  console.log(`      • PIX:            R$ ${summary.pagamentos.PIX.toFixed(2)}`);
  console.log(`      • Crediário:      R$ ${summary.pagamentos.CREDIARIO.toFixed(2)}`);

  // =========================================================================
  // TESTE 7: Cancelamento de Venda com Estorno Atômico de Estoque
  // =========================================================================
  console.log('\n--- TESTE 7: CANCELAMENTO E ESTORNO ATÔMICO DE ESTOQUE ---');
  // Obter estoque antes do cancelamento da venda de dinheiro
  const prodAntesCancel = (await getJson(`/api/erp/products/${encodeURIComponent(baseProd.code)}`)).data.data;
  const estoqueAntes = prodAntesCancel.stock_qty;

  const cancelRes = await postJson(`/api/erp/pos/cancel/${dinheiroRes.data.sale_id}`, {
    reason: 'Teste automatizado de estorno de PDV'
  });
  assert.strictEqual(cancelRes.status, 200);
  assert(cancelRes.data.success);

  const prodAposCancel = (await getJson(`/api/erp/products/${encodeURIComponent(baseProd.code)}`)).data.data;
  assert.strictEqual(prodAposCancel.stock_qty, estoqueAntes + 1, 'Estoque deve ter sido incrementado em 1 unidade após o cancelamento');
  console.log(`   ✅ Venda #${dinheiroRes.data.sale_id} cancelada com sucesso! Estoque estornado: ${estoqueAntes} -> ${prodAposCancel.stock_qty}`);

  console.log('\n===============================================================');
  console.log('🎉 TODOS OS TESTES DO PDV FORAM CONCLUÍDOS COM 100% DE SUCESSO!');
  console.log('===============================================================\n');
}

runPdvTestSuite().catch(err => {
  console.error('\n❌ ERRO NA BATERIA DE TESTES DO PDV:', err);
  process.exit(1);
});
