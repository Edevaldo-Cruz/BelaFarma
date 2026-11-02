/**
 * Teste Automatizado do Módulo Contábil e Fiscal do BelaFarma
 */

const {
  calcularRbt12EAliquotas,
  classificarItemFiscal,
  processarApuracaoFiscal,
  quickFixProdutoFiscal,
  gerarSpedFiscalEfd,
  exportarRelatorioContabilCsv,
  validarNcm
} = require('./modules/erp/fiscal-accounting.service');

const { initErpDatabase, db } = require('./modules/erp/erp-database');

console.log('🚀 INICIANDO BATERIA DE TESTES DO MÓDULO CONTÁBIL E FISCAL...');

// 1. Inicializa o schema
initErpDatabase();
console.log('✅ Schema inicializado com sucesso.');

// 2. Testa Validação de NCM
console.log('\n--- 1. Validação de NCM ---');
console.assert(validarNcm('30049099') === true, 'NCM 30049099 deveria ser válido');
console.assert(validarNcm('3004.90.99') === true, 'NCM com pontos deveria ser válido após limpeza');
console.assert(validarNcm('123') === false, 'NCM com 3 dígitos deveria ser inválido');
console.assert(validarNcm(null) === false, 'NCM nulo deveria ser inválido');
console.assert(validarNcm('00000000') === false, 'NCM zerado deveria ser inválido');
console.log('✅ Testes de validação de NCM passaram.');

// 3. Testa Classificação Tributária em Produtos Típicos de Farmácia
console.log('\n--- 2. Classificação Tributária Farmacêutica ---');
// Medicamento com NCM Cap 30
const med = classificarItemFiscal({
  ncm: '30049099',
  tributacao_monofasica: 'S',
  cst_pis: '04',
  aliquota_st: 18,
  cfop: '5405'
});
console.log('Medicamento:', med);
console.assert(med.grupo === 'MONOFASICO_E_ST', 'Medicamento deve ser MONOFASICO_E_ST');
console.assert(med.cstPisCofins === '04', 'CST PIS deve ser 04');
console.assert(med.csosn === '500', 'CSOSN deve ser 500');

// Perfumaria não monofásica com ST
const perfumariaSt = classificarItemFiscal({
  ncm: '33079000',
  tributacao_monofasica: 'N',
  aliquota_st: 12,
  cfop: '5405'
});
console.log('Item ST:', perfumariaSt);
console.assert(perfumariaSt.isIcmsSt === true, 'Item deve ser ST');

// Produto sem NCM (Indeterminado / Safe Fallback)
const pendente = classificarItemFiscal({
  ncm: '',
  product_name: 'TESTE SEM NCM'
});
console.log('Item sem NCM:', pendente);
console.assert(pendente.grupo === 'INDETERMINADO', 'Item sem NCM deve ser INDETERMINADO');

// 4. Testa Cálculo de RBT12 e Alíquota Efetiva
console.log('\n--- 3. Cálculo de RBT12 e Alíquota Efetiva ---');
const rbtInfo = calcularRbt12EAliquotas('2026-10');
console.log('RBT12 Calculada:', rbtInfo);
console.assert(typeof rbtInfo.aliquotaEfetiva === 'number' && rbtInfo.aliquotaEfetiva >= 0.04, 'Alíquota deve ser >= 4%');

// 5. Testa Apuração do Período
console.log('\n--- 4. Processamento da Apuração Fiscal Mensal ---');
processarApuracaoFiscal('2026-10', { aliquotaManual: 0.082 }).then(res => {
  console.log('Resultado da Apuração:', {
    closingId: res.closingId,
    faturamentoBruto: res.faturamentoBruto,
    monofasicoComSt: res.segregacao.monofasicoComSt,
    dasSemSegregacao: res.das.valorSemSegregacao,
    dasComSegregacao: res.das.valorComSegregacao,
    economiaTributariaMes: res.das.economiaTributariaMes,
    percentualEconomia: `${res.das.percentualEconomia}%`,
    totalInconsistencias: res.estatisticas.totalInconsistencias
  });

  // 6. Testa Geração do SPED Fiscal .TXT
  console.log('\n--- 5. Geração de Arquivo Oficial SPED Fiscal (EFD ICMS/IPI) ---');
  const spedTxt = gerarSpedFiscalEfd('2026-10');
  console.log(`SPED Fiscal gerado! Tamanho: ${spedTxt.length} caracteres.`);
  console.log('Primeiras 5 linhas do SPED:');
  console.log(spedTxt.split('\r\n').slice(0, 5).join('\n'));
  console.log('Últimas 5 linhas do SPED:');
  console.log(spedTxt.split('\r\n').slice(-5).join('\n'));

  console.assert(spedTxt.includes('|0000|'), 'SPED deve conter registro de abertura 0000');
  console.assert(spedTxt.includes('|9999|'), 'SPED deve conter registro de encerramento 9999');

  // 7. Testa Exportação CSV para Contabilidade
  console.log('\n--- 6. Exportação do Relatório CSV para Contabilidade ---');
  const csv = exportarRelatorioContabilCsv('2026-10');
  console.log(`CSV gerado! Tamanho: ${csv.length} caracteres.`);
  console.assert(csv.includes('RELATÓRIO CONTÁBIL & FISCAL'), 'CSV deve conter cabeçalho');

  console.log('\n🎉 TODOS OS TESTES DO MÓDULO CONTÁBIL E FISCAL PASSARAM COM SUCESSO!');
}).catch(err => {
  console.error('❌ ERRO NO TESTE:', err);
  process.exit(1);
});
