const {queryDigifarma} = require('./services/digifarma.service');
async function run() {
  // 1. Colunas de CAB_VENDAS_FPAGTOS
  console.log('=== Colunas CAB_VENDAS_FPAGTOS ===');
  const cols = await queryDigifarma("SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CAB_VENDAS_FPAGTOS'");
  console.log(cols.map(x => x['RDB$FIELD_NAME'].trim()).join('\n'));

  // 2. Colunas de CAIXA_VENDAS_FPAGTOS
  console.log('\n=== Colunas CAIXA_VENDAS_FPAGTOS ===');
  const cols2 = await queryDigifarma("SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CAIXA_VENDAS_FPAGTOS'");
  console.log(cols2.map(x => x['RDB$FIELD_NAME'].trim()).join('\n'));

  // 3. Colunas de CONFERE_CAIXA_FPAGTOS
  console.log('\n=== Colunas CONFERE_CAIXA_FPAGTOS ===');
  const cols3 = await queryDigifarma("SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CONFERE_CAIXA_FPAGTOS'");
  console.log(cols3.map(x => x['RDB$FIELD_NAME'].trim()).join('\n'));

  // 4. Buscar caixa do dia de hoje
  console.log('\n=== CAIXA do Dia ===');
  const hoje = await queryDigifarma("SELECT * FROM CAIXA WHERE CAST(ABERTURA AS DATE) = CURRENT_DATE");
  console.log(JSON.stringify(hoje, null, 2));

  // 5. Vendas do dia agrupadas
  console.log('\n=== Total vendas do dia (CAB_VENDAS) ===');
  const vendas = await queryDigifarma(`
    SELECT 
      COUNT(*) as QTD_VENDAS,
      SUM(VENDA_TOTAL) as TOTAL_VENDAS,
      SUM(DINHEIRO) as TOTAL_DINHEIRO,
      SUM(CARTAO) as TOTAL_CARTAO,
      SUM(CREDIARIO) as TOTAL_CREDIARIO,
      SUM(OUTROS) as TOTAL_OUTROS
    FROM CAB_VENDAS 
    WHERE CAST(VENDA_DATA_HORA AS DATE) = CURRENT_DATE
      AND CANCELADO <> 'S'
  `);
  console.log(JSON.stringify(vendas, null, 2));

  // 6. Formas de pagamento do dia
  console.log('\n=== Formas de pagamento do dia (CAIXA_VENDAS_FPAGTOS) ===');
  try {
    const amostra = await queryDigifarma("SELECT FIRST 3 * FROM CAIXA_VENDAS_FPAGTOS");
    console.log(JSON.stringify(amostra, null, 2));
  } catch(e) {
    console.log('Erro:', e.message);
  }
}
run().catch(console.error);
