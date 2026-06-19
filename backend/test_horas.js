const { queryDigifarma } = require('./services/digifarma.service');

async function test() {
  // 1. Verifica as últimas 10 vendas com hora bruta e com offset -3h (0.125 dias)
  const sql = `
    SELECT FIRST 10
      VENDA_NOTA_ID,
      VENDA_DATA_HORA,
      EXTRACT(HOUR FROM VENDA_DATA_HORA) AS HORA_BRUTA,
      EXTRACT(HOUR FROM (VENDA_DATA_HORA - 0.125)) AS HORA_MENOS_3
    FROM CAB_VENDAS
    WHERE VENDA_DATA_HORA >= '2026-06-19 00:00:00'
    AND CANCELADO <> 'S'
    ORDER BY VENDA_DATA_HORA DESC
  `;

  console.log('--- Últimas 10 vendas com extração de hora ---');
  const r = await queryDigifarma(sql, []);
  r.forEach(v => {
    const dt = v.VENDA_DATA_HORA;
    console.log(`Venda ${v.VENDA_NOTA_ID} | Timestamp raw: ${dt} | HORA_BRUTA: ${v.HORA_BRUTA} | HORA_MENOS_3: ${v.HORA_MENOS_3}`);
  });

  // 2. Conta vendas por hora bruta para o dia inteiro
  const sqlHoraBruta = `
    SELECT 
      EXTRACT(HOUR FROM VENDA_DATA_HORA) AS HORA,
      COUNT(*) AS QTD,
      SUM(VENDA_TOTAL) AS TOTAL
    FROM CAB_VENDAS
    WHERE VENDA_DATA_HORA >= '2026-06-19 00:00:00'
    AND CANCELADO <> 'S'
    GROUP BY EXTRACT(HOUR FROM VENDA_DATA_HORA)
    ORDER BY HORA
  `;

  console.log('\n--- Agrupamento por HORA_BRUTA ---');
  const horas = await queryDigifarma(sqlHoraBruta, []);
  horas.forEach(h => console.log(`Hora ${h.HORA}h: ${h.QTD} vendas - R$${(h.TOTAL||0).toFixed(2)}`));
}

test().catch(console.error);
