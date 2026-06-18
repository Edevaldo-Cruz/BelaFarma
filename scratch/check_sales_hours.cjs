const { queryDigifarma } = require('../backend/services/digifarma.service');

async function testTimezoneCorrection() {
  try {
    const data30DiasAtras = new Date();
    data30DiasAtras.setDate(data30DiasAtras.getDate() - 30);
    const pad = (num) => String(num).padStart(2, '0');
    const startStr = `${data30DiasAtras.getFullYear()}-${pad(data30DiasAtras.getMonth() + 1)}-${pad(data30DiasAtras.getDate())} 00:00:00`;

    console.log('Testando query de horas com ajuste de fuso (-3 horas)...');

    const sql = `
      SELECT 
        EXTRACT(HOUR FROM DATEADD(-3 HOUR TO v.VENDA_DATA_HORA)) AS HORA,
        COUNT(v.VENDA_NOTA_ID) AS QTD_VENDAS,
        SUM(v.VENDA_TOTAL) AS TOTAL_VENDA
      FROM CAB_VENDAS v
      WHERE v.CANCELADO <> 'S'
        AND v.VENDA_DATA_HORA >= ?
      GROUP BY EXTRACT(HOUR FROM DATEADD(-3 HOUR TO v.VENDA_DATA_HORA))
      ORDER BY HORA ASC
    `;

    const results = await queryDigifarma(sql, [startStr]);
    console.log('Resultados com correção de fuso (-3 horas):');
    console.table(results.map(r => ({
      'Hora do Desenho (Brasília)': `${String(r.HORA).padStart(2, '0')}:00 às ${String(r.HORA).padStart(2, '0')}:59`,
      'Qtd Vendas': r.QTD_VENDAS,
      'Valor Total': r.TOTAL_VENDA
    })));

  } catch (err) {
    console.error('❌ Erro na consulta de correção:', err.message);
  }
}

testTimezoneCorrection();
