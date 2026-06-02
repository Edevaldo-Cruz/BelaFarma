const firebird = require('node-firebird');

const options = {
    host: '192.168.1.7',
    port: 3050,
    database: 'C:\\Digifarma\\Dados\\digifarma6.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
};

firebird.attach(options, function(err, db) {
    if (err) {
        console.error('Erro ao conectar:', err);
        return;
    }
    
    // 2. Trazer as vendas de hoje
    const sql = `
        SELECT 
          VENDA_NOTA_ID, 
          VENDA_DATA_HORA, 
          VENDA_TOTAL, 
          CANCELADO, 
          CANCELADO_CUPOM, 
          CANCELADO_SEM_FECHAR, 
          PRE_VENDA, 
          CUPOM, 
          NUMDAV
        FROM CAB_VENDAS 
        WHERE CAST(VENDA_DATA_HORA AS DATE) = '2026-06-02'
    `;
    
    db.query(sql, function(err, result) {
        if (err) {
            console.error('Erro ao executar query:', err);
        } else {
            console.log(`Vendas de hoje ('2026-06-02') encontradas: ${result.length}`);
            console.log(JSON.stringify(result, null, 2));
            
            // Vamos fazer somatórios com diferentes filtros para ver qual bate com 684.43
            const semFiltro = result.reduce((acc, curr) => acc + (curr.VENDA_TOTAL || 0), 0);
            console.log('\nSoma sem filtros adicionais:', semFiltro);
            
            const canceladosNaoS = result.filter(v => v.CANCELADO !== 'S');
            const totalCanceladosNaoS = canceladosNaoS.reduce((acc, curr) => acc + (curr.VENDA_TOTAL || 0), 0);
            console.log('Soma CANCELADO <> S:', totalCanceladosNaoS);
            
            const preVendaNaoS = result.filter(v => v.CANCELADO !== 'S' && v.PRE_VENDA !== 'S');
            const totalPreVendaNaoS = preVendaNaoS.reduce((acc, curr) => acc + (curr.VENDA_TOTAL || 0), 0);
            console.log('Soma CANCELADO <> S E PRE_VENDA <> S:', totalPreVendaNaoS);

            const preVendaNaoS_cupomOK = result.filter(v => v.CANCELADO !== 'S' && v.PRE_VENDA !== 'S' && v.CUPOM > 0);
            const totalPreVendaNaoS_cupomOK = preVendaNaoS_cupomOK.reduce((acc, curr) => acc + (curr.VENDA_TOTAL || 0), 0);
            console.log('Soma CANCELADO <> S E PRE_VENDA <> S E CUPOM > 0:', totalPreVendaNaoS_cupomOK);
            
            const outrosFiltros = result.filter(v => 
              v.CANCELADO !== 'S' && 
              v.CANCELADO_CUPOM !== 'S' && 
              v.CANCELADO_SEM_FECHAR !== 'S' && 
              v.PRE_VENDA !== 'S'
            );
            const totalOutrosFiltros = outrosFiltros.reduce((acc, curr) => acc + (curr.VENDA_TOTAL || 0), 0);
            console.log('Soma CANCELADO/CUPOM/SEM_FECHAR <> S E PRE_VENDA <> S:', totalOutrosFiltros);
        }
        db.detach();
    });
});
