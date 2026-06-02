const {queryDigifarma} = require('./services/digifarma.service');
async function run() {
  // 1. Checar tabelas de caixa/vendas
  const tablesQ = "SELECT RDB$RELATION_NAME FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG=0 AND RDB$VIEW_BLR IS NULL AND (RDB$RELATION_NAME LIKE '%CAIXA%' OR RDB$RELATION_NAME LIKE '%VEND%' OR RDB$RELATION_NAME LIKE '%FECH%')";
  const tables = await queryDigifarma(tablesQ);
  console.log('=== Tabelas de Caixa/Vendas/Fechamento ===');
  console.log(tables.map(x => x['RDB$RELATION_NAME'].trim()).join('\n'));

  // 2. Mostrar colunas da tabela CAIXA
  console.log('\n=== Colunas da tabela CAIXA ===');
  const caixaCols = await queryDigifarma("SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CAIXA'");
  console.log(caixaCols.map(x => x['RDB$FIELD_NAME'].trim()).join('\n'));

  // 3. Mostrar colunas da tabela CAB_VENDAS
  console.log('\n=== Colunas da tabela CAB_VENDAS ===');
  const cabCols = await queryDigifarma("SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CAB_VENDAS'");
  console.log(cabCols.map(x => x['RDB$FIELD_NAME'].trim()).join('\n'));
  
  // 4. Mostrar colunas da tabela CONFERE_CAIXA
  console.log('\n=== Colunas da tabela CONFERE_CAIXA ===');
  const confCols = await queryDigifarma("SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CONFERE_CAIXA'");
  console.log(confCols.map(x => x['RDB$FIELD_NAME'].trim()).join('\n'));

  // 5. Amostra de CAIXA hoje
  console.log('\n=== Amostra CAIXA (hoje) ===');
  try {
    const caixaHoje = await queryDigifarma("SELECT FIRST 3 * FROM CAIXA WHERE CAST(CAIXA_DATAAGORA AS DATE) = CURRENT_DATE");
    console.log(JSON.stringify(caixaHoje, null, 2));
  } catch(e) {
    console.log('Erro ao buscar CAIXA hoje:', e.message);
    // Tentar outra coluna de data
    try {
      const caixaHoje2 = await queryDigifarma("SELECT FIRST 3 * FROM CAIXA");
      console.log('Amostra qualquer:', JSON.stringify(caixaHoje2, null, 2));
    } catch(e2) {
      console.log('Erro:', e2.message);
    }
  }
}
run().catch(console.error);
