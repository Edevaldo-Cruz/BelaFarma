const { queryDigifarma } = require('./services/digifarma.service');

async function test() {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStart = `${year}-${month}-${day} 00:00:00`;

    console.log('Today start:', todayStart);

    console.log('Running sqlVendas query...');
    const sqlVendas = `
      SELECT 
        COUNT(*) as QTD_VENDAS,
        COALESCE(SUM(VENDA_TOTAL), 0) as TOTAL_VENDAS
      FROM CAB_VENDAS 
      WHERE VENDA_DATA_HORA >= ?
        AND CANCELADO <> 'S'
    `;
    const resVendas = await queryDigifarma(sqlVendas, [todayStart]);
    console.log('Result Vendas:', resVendas);

    console.log('Running sqlPagamentos query...');
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
    const resPag = await queryDigifarma(sqlPagamentos, [todayStart]);
    console.log('Result Pagamentos:', resPag);
    console.log('Success!');
  } catch (err) {
    console.error('Error during test:', err);
  }
}

test();
