const {queryDigifarma} = require('./services/digifarma.service');
async function run() {
  const sql = `
    SELECT fp.TIPO_PAGAMENTO_ID, fp.BANDEIRA, fp.VALOR 
    FROM CAB_VENDAS_FPAGTOS fp 
    JOIN CAB_VENDAS v ON fp.VENDA_NOTA_ID = v.VENDA_NOTA_ID 
    WHERE CAST(v.VENDA_DATA_HORA AS DATE) = CURRENT_DATE
      AND v.CANCELADO <> 'S'
  `;
  const r = await queryDigifarma(sql);
  console.log(JSON.stringify(r, null, 2));
}
run().catch(console.error);
