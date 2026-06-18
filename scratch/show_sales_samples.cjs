const { queryDigifarma } = require('../backend/services/digifarma.service');

async function showTodaySalesSamples() {
  try {
    const todayStr = '2026-06-18'; // Data de hoje
    console.log(`Buscando amostra de vendas do dia: ${todayStr}\n`);

    // Consulta que traz a data crua do banco e faz a conversão de fuso no SQL
    const sql = `
      SELECT FIRST 15
        v.VENDA_NOTA_ID,
        v.VENDA_DATA_HORA AS DATA_HORA_BANCO,
        DATEADD(-3 HOUR TO v.VENDA_DATA_HORA) AS DATA_HORA_BRASILIA,
        EXTRACT(HOUR FROM DATEADD(-3 HOUR TO v.VENDA_DATA_HORA)) AS HORA_GRAFICO,
        v.VENDA_TOTAL AS TOTAL
      FROM CAB_VENDAS v
      WHERE v.CANCELADO <> 'S'
        -- Filtra pelo dia local corrigido de hoje
        AND CAST(DATEADD(-3 HOUR TO v.VENDA_DATA_HORA) AS DATE) = ?
      ORDER BY v.VENDA_DATA_HORA DESC
    `;

    const results = await queryDigifarma(sql, [todayStr]);

    if (!results || results.length === 0) {
      console.log('Nenhuma venda encontrada para hoje no banco de dados.');
      return;
    }

    const tableData = results.map(r => {
      // O driver node-firebird retorna objetos Date. Vamos exibir de forma legível.
      const rawDate = r.DATA_HORA_BANCO;
      const localDate = r.DATA_HORA_BRASILIA;

      return {
        'Cupom ID': r.VENDA_NOTA_ID,
        'Hora no Banco (Firebird)': rawDate ? rawDate.toISOString().replace('T', ' ').substring(0, 19) : 'N/D',
        'Hora Brasília (Corrigida)': localDate ? localDate.toISOString().replace('T', ' ').substring(0, 19) : 'N/D',
        'Hora no Gráfico': `${String(r.HORA_GRAFICO).padStart(2, '0')}:00`,
        'Total Venda': r.TOTAL.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      };
    });

    console.log(`Exibindo as últimas ${results.length} vendas de hoje no Digifarma:`);
    console.table(tableData);

  } catch (err) {
    console.error('Erro ao consultar amostra de vendas:', err.message);
  }
}

showTodaySalesSamples();
