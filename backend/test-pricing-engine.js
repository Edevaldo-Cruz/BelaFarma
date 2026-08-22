const assert = require('assert');
const {
  roundUpToAcceptedCents,
  classifyProductCategory,
  calculateTargetPrice,
  applySafetyGuardrails,
  calculateDynamicABC
} = require('./services/pricing-engine.service');

console.log('🧪 Iniciando testes de unidade do Belinha Pricing Engine...\n');

// Teste 1: Arredondamento Comercial (0, 5, 9)
console.log('1. Testando roundUpToAcceptedCents...');
assert.strictEqual(roundUpToAcceptedCents(10.12), 10.15);
assert.strictEqual(roundUpToAcceptedCents(10.16), 10.19);
assert.strictEqual(roundUpToAcceptedCents(10.20), 10.20);
assert.strictEqual(roundUpToAcceptedCents(10.25), 10.25);
assert.strictEqual(roundUpToAcceptedCents(10.29), 10.29);
assert.strictEqual(roundUpToAcceptedCents(10.97), 10.99);
assert.strictEqual(roundUpToAcceptedCents(0), 0);
console.log('  ✅ Arredondamento comercial 0, 5, 9 validado com sucesso.');

// Teste 2: Classificação de Categorias
console.log('2. Testando classifyProductCategory...');
assert.strictEqual(classifyProductCategory('DIPIRONA 500MG GENERICO MEDLEY'), 'generico');
assert.strictEqual(classifyProductCategory('LOSARTANA 50MG SIMILAR EMS'), 'similar');
assert.strictEqual(classifyProductCategory('SHAMPOO DOVE RECONSTRUCAO 400ML'), 'perfumaria');
assert.strictEqual(classifyProductCategory('FRALDA PAMPERS PANTS G'), 'perfumaria');
assert.strictEqual(classifyProductCategory('DORFLEX 36 COMPRIMIDOS'), 'mips');
assert.strictEqual(classifyProductCategory('NEOSALDINA DRAGEAS'), 'mips');
assert.strictEqual(classifyProductCategory('GLIFAGE XR 500MG MERCK'), 'referencia');
console.log('  ✅ Classificação automática de produtos validada com sucesso.');

// Teste 3: Markup Divisor
console.log('3. Testando calculateTargetPrice (Markup Divisor)...');
// Exemplo: Custo = R$ 10.00
// Impostos = 4%, Despesas = 12%, Cartão = 2.5%, Margem Alvo = 40%
// Total Dedução = 58.5% -> Divisor = 0.415 -> Preço = 10 / 0.415 = R$ 24.0963 -> Arredonda R$ 24.10 (ou .09/.10)
const precoBase = calculateTargetPrice(10.00, 4.0, 12.0, 2.5, 40.0);
console.log('  Preço calculado para Custo R$ 10,00 (Margem 40% + Deduções 18.5%): R$ ' + precoBase.toFixed(2));
assert.ok(precoBase > 24.0 && precoBase < 25.0, 'Preço deve estar no intervalo esperado pelo markup divisor');
console.log('  ✅ Fórmula de Markup Divisor validada com sucesso.');

// Teste 4: Guardrails (Travas de Segurança)
console.log('4. Testando applySafetyGuardrails...');

// Caso A: Normal sem violação
const gNormal = applySafetyGuardrails(24.10, 0, 10.00, 22.00, 20.0, 5.0);
assert.strictEqual(gNormal.travaTetoCmed, false);
assert.strictEqual(gNormal.travaPisoMinimo, false);
assert.strictEqual(gNormal.requerAprovacaoManual, false);

// Caso B: Teto CMED / PMC ultrapassado
const gCmed = applySafetyGuardrails(30.00, 25.00, 10.00, 20.00, 50.0, 5.0);
assert.strictEqual(gCmed.travaTetoCmed, true);
assert.strictEqual(gCmed.finalPrice, 25.00);
console.log('  ✅ Trava de Teto CMED validada (Preço limitado ao PMC).');

// Caso C: Piso de Rentabilidade Mínima
const gPiso = applySafetyGuardrails(9.00, 50.00, 10.00, 9.00, 50.0, 5.0);
assert.strictEqual(gPiso.travaPisoMinimo, true);
assert.ok(gPiso.finalPrice >= 10.50, 'Preço não pode ser menor que o piso de custo + 5%');
console.log('  ✅ Trava de Piso Mínimo de Rentabilidade validada.');

// Caso D: Volatilidade Excessiva (+35% de aumento com limite de 20%)
const gVolatilidade = applySafetyGuardrails(27.00, 0, 10.00, 20.00, 20.0, 5.0);
assert.strictEqual(gVolatilidade.travaVolatilidade, true);
assert.strictEqual(gVolatilidade.requerAprovacaoManual, true);
console.log('  ✅ Trava de Volatilidade validada (Exige aprovação manual).');

// Teste 5: Curva ABC Dinâmica
console.log('5. Testando calculateDynamicABC...');
const mockSales = [
  { PRODUTO_ID: '1', TOTAL_REVENUE: 5000 },
  { PRODUTO_ID: '2', TOTAL_REVENUE: 3000 },
  { PRODUTO_ID: '3', TOTAL_REVENUE: 1500 },
  { PRODUTO_ID: '4', TOTAL_REVENUE: 400 },
  { PRODUTO_ID: '5', TOTAL_REVENUE: 100 }
];
const abcMap = calculateDynamicABC(mockSales);
assert.strictEqual(abcMap.get('1'), 'A');
assert.strictEqual(abcMap.get('2'), 'A');
assert.strictEqual(abcMap.get('3'), 'B');
assert.strictEqual(abcMap.get('5'), 'C');
console.log('  ✅ Curva ABC Dinâmica calculada com precisão.');

console.log('\n🎉 TODOS OS TESTES DO BELINHA PRICING ENGINE PASSARAM COM 100% DE SUCESSO!\n');
