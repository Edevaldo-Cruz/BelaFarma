const { queryDigifarma } = require('./services/digifarma.service');

async function test() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStart = `${year}-${month}-${day} 00:00:00`;

  console.log('todayStart:', todayStart);

  const sqlVendas = `
    SELECT 
      COUNT(*) as QTD_VENDAS,
      COALESCE(SUM(VENDA_TOTAL), 0) as TOTAL_VENDAS
    FROM CAB_VENDAS 
    WHERE VENDA_DATA_HORA >= ?
      AND CANCELADO <> 'S'
  `;

  const sqlPagamentos = `
    SELECT 
      fp.TIPO_PAGAMENTO_ID,
      fp.BANDEIRA,
      COALESCE(SUM(fp.VALOR), 0) as TOTAL
    FROM CAB_VENDAS_FPAGTOS fp
    JOIN CAB_VENDAS v ON fp.VENDA_NOTA_ID = v.VENDA_NOTA_ID
    WHERE v.VENDA_DATA_HORA >= ?
      AND v.CANCELADO <> 'S'
    GROUP BY fp.TIPO_PAGAMENTO_ID, fp.BANDEIRA
  `;

  const sqlFundoCaixa = `
    SELECT FIRST 1 VALOR_ABERTURA 
    FROM CAIXA 
    ORDER BY ABERTURA DESC
  `;

  console.log('\n--- 1. Testando sqlVendas ---');
  try {
    const t0 = Date.now();
    const res = await queryDigifarma(sqlVendas, [todayStart]);
    console.log(`Sucesso em ${Date.now() - t0}ms:`, res);
  } catch (e) {
    console.error('Erro no sqlVendas:', e);
  }

  console.log('\n--- 2. Testando sqlPagamentos ---');
  try {
    const t0 = Date.now();
    const res = await queryDigifarma(sqlPagamentos, [todayStart]);
    console.log(`Sucesso em ${Date.now() - t0}ms:`, res);
  } catch (e) {
    console.error('Erro no sqlPagamentos:', e);
  }

  console.log('\n--- 3. Testando sqlFundoCaixa ---');
  try {
    const t0 = Date.now();
    const res = await queryDigifarma(sqlFundoCaixa, []);
    console.log(`Sucesso em ${Date.now() - t0}ms:`, res);
  } catch (e) {
    console.error('Erro no sqlFundoCaixa:', e);
  }
}

test().catch(console.error);
