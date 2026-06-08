const { queryDigifarma } = require('./services/digifarma.service.js');
const sql = `
SELECT FIRST 10 C.DATA_EMISSAO as dataCompra, F.FORNECEDOR as fornecedor, C.NOTA_FISCAL as notaFiscal, I.ITEM_NOTAS_QUANT as quantidade, I.ITEM_NOTAS_PRCOMPRA as precoCompra 
FROM ITEM_NOTAS I 
JOIN CAB_NOTAS C ON I.CAB_NOTA_ID = C.CAB_NOTA_ID 
LEFT JOIN FORNECEDORES F ON C.FORNECEDOR_ID = F.FORNECEDOR_ID 
WHERE I.PRODUTO_ID = (SELECT FIRST 1 PRODUTO_ID FROM PRODUTOS WHERE PRODUTO = ?) AND C.ENTRADA_SAIDA = 'E' AND C.CANCELAMENTO = 'N' 
ORDER BY C.DATA_EMISSAO DESC
`;
console.time('query');
queryDigifarma(sql, ['NESTOGENO 1 800 GR']).then(res => {
  console.timeEnd('query');
  console.log(res);
}).catch(console.error);
