const { queryDigifarma } = require('./services/digifarma.service');

async function test() {
  const start = '2026-06-01';
  const end = '2026-06-20';
  
  const startDateTime = `${start} 03:00:00`;
  const endParts = end.split('-');
  const endDateObj = new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2]));
  endDateObj.setDate(endDateObj.getDate() + 1);
  const pad = (num) => String(num).padStart(2, '0');
  const endDateTime = `${endDateObj.getFullYear()}-${pad(endDateObj.getMonth() + 1)}-${pad(endDateObj.getDate())} 02:59:59`;

  console.log(`Período de teste: ${startDateTime} até ${endDateTime}`);

  // Query 1
  const sqlCategorias = `
    SELECT 
      COALESCE(c.CATEGORIA, 'Sem Categoria') AS CATEGORIA_NOME,
      SUM(iv.ITEMVEND_PRVENDA * iv.ITEMVEND_QUANT) AS TOTAL_VENDA,
      SUM(iv.ITEMVEND_QUANT) AS QTD_ITENS
    FROM ITEM_VENDAS iv
    JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
    JOIN PRODUTOS p ON iv.PRODUTO_ID = p.PRODUTO_ID
    LEFT JOIN CATEGORIA c ON p.CATEGORIA_ID = c.CATEGORIA_ID
    WHERE v.CANCELADO <> 'S'
      AND v.VENDA_DATA_HORA BETWEEN ? AND ?
    GROUP BY c.CATEGORIA
    ORDER BY TOTAL_VENDA DESC
  `;

  // Query 2
  const sqlHorarios = `
    SELECT 
      EXTRACT(HOUR FROM v.VENDA_DATA_HORA) AS HORA,
      SUM(v.VENDA_TOTAL) AS TOTAL_VENDA,
      COUNT(v.VENDA_NOTA_ID) AS QTD_VENDAS
    FROM CAB_VENDAS v
    WHERE v.CANCELADO <> 'S'
      AND v.VENDA_DATA_HORA BETWEEN ? AND ?
    GROUP BY EXTRACT(HOUR FROM v.VENDA_DATA_HORA)
    ORDER BY HORA ASC
  `;

  // Query 3
  const sqlTicketsDiarios = `
    SELECT 
      CAST(v.VENDA_DATA_HORA AS DATE) AS DATA_VENDA,
      COUNT(v.VENDA_NOTA_ID) AS QTD_TICKETS,
      SUM(v.VENDA_TOTAL) AS TOTAL_VENDA
    FROM CAB_VENDAS v
    WHERE v.CANCELADO <> 'S'
      AND v.VENDA_DATA_HORA BETWEEN ? AND ?
    GROUP BY CAST(v.VENDA_DATA_HORA AS DATE)
    ORDER BY DATA_VENDA ASC
  `;

  console.log('Executando Query 1 (Categorias)...');
  let t0 = Date.now();
  try {
    const res1 = await queryDigifarma(sqlCategorias, [startDateTime, endDateTime]);
    console.log(`Query 1 (Categorias) concluída em ${Date.now() - t0}ms. Itens: ${res1.length}`);
  } catch (err) {
    console.error(`Erro na Query 1: ${err.message} (após ${Date.now() - t0}ms)`);
  }

  console.log('Executando Query 2 (Horários)...');
  t0 = Date.now();
  try {
    const res2 = await queryDigifarma(sqlHorarios, [startDateTime, endDateTime]);
    console.log(`Query 2 (Horários) concluída em ${Date.now() - t0}ms. Itens: ${res2.length}`);
  } catch (err) {
    console.error(`Erro na Query 2: ${err.message} (após ${Date.now() - t0}ms)`);
  }

  console.log('Executando Query 3 (Tickets Diários)...');
  t0 = Date.now();
  try {
    const res3 = await queryDigifarma(sqlTicketsDiarios, [startDateTime, endDateTime]);
    console.log(`Query 3 (Tickets Diários) concluída em ${Date.now() - t0}ms. Itens: ${res3.length}`);
  } catch (err) {
    console.error(`Erro na Query 3: ${err.message} (após ${Date.now() - t0}ms)`);
  }
}

test().catch(console.error);
