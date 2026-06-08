const { queryDigifarma } = require('./services/digifarma.service.js');
const sql = `
SELECT FIRST 10
  C.DATA_EMISSAO as dataCompra,
  F.FORNECEDOR as fornecedor,
  C.NOTA_FISCAL as notaFiscal,
  I.ITEM_NOTAS_QUANT as quantidade,
  I.ITEM_NOTAS_PRCOMPRA as precoCompra
FROM ITEM_NOTAS I
JOIN CAB_NOTAS C ON I.CAB_NOTA_ID = C.CAB_NOTA_ID
LEFT JOIN FORNECEDORES F ON C.FORNECEDOR_ID = F.FORNECEDOR_ID
WHERE I.PRODUTO_ID = 1000
ORDER BY C.DATA_EMISSAO DESC
`;

async function run() {
  try {
    const r1 = await queryDigifarma(sql);
    console.log(r1);
  } catch(e) { console.error(e) }
}
run();
