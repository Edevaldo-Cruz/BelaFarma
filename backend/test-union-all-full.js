const { queryDigifarma } = require('./services/digifarma.service');

const productNames = [
  'DEXFER GOTAS ORAL', 'veneno de cobra', 'valerato de betametasona', 'Cebo de carneiro', 'Vit D 500', 
  'Betaistina 8mg', 'Dia D', 'Avamys', 'Selene', 'Messigyna', 'Cola de papel', 'Abs Sym noturno c/ 8', 
  'Talco infantil', 'Hidratante infantil', 'Papel Higienico', 'Buscopam composto', 'Buscofem', 
  'Chupeta +6 meses (Matheus)', 'Chupeta de 0 a 6 meses (Matheus)', 'Barla pequeno', 'Pó descolorante 10 vol', 
  'Nivea latinha', 'Body splash hidraderm AMEIXA', 'Pomada Milagrosa', 'Kolagenase com cloranfenicol', 
  'funcicoria', 'bucha higienica', 'folha depiltoria para rosto', 'colirio vigadexa', 'camomilina c'
];

async function test() {
  console.log(`Testando query UNION ALL completa com ${productNames.length} produtos...`);
  const start = Date.now();
  
  const subqueries = productNames.map(() => `
    SELECT p.PRODUTO, p.PROD_SALDO, COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA
    FROM PRODUTOS p
    WHERE p.PRODUTO = ?
  `);
  
  const sql = subqueries.join('\n    UNION ALL\n');
  const params = productNames.map(name => name.toUpperCase());
  
  try {
    const results = await queryDigifarma(sql, params);
    console.log(`Sucesso em ${Date.now() - start}ms! Encontrados ${results.length} resultados.`);
    console.log('Resultados:', results);
  } catch (err) {
    console.error('Erro na query UNION ALL completa:', err.message);
    console.error(err);
  }
}
test();
