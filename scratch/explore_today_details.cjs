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
    
    const sql = `
        SELECT 
          VENDA_NOTA_ID, 
          VENDA_DATA_HORA, 
          VENDA_TOTAL, 
          CANCELADO, 
          DINHEIRO, 
          CARTAO, 
          CHEQUE, 
          CREDIARIO, 
          PARCELAMENTO, 
          OUTROS,
          PRE_VENDA,
          CUPOM,
          NUMDAV
        FROM CAB_VENDAS 
        WHERE CAST(VENDA_DATA_HORA AS DATE) = '2026-06-02'
    `;
    
    db.query(sql, function(err, result) {
        if (err) {
            console.error('Erro ao executar query:', err);
            db.detach();
            return;
        }
        
        console.log(`Vendas de hoje ('2026-06-02'): ${result.length} registros.`);
        
        let sumTotalSales = 0;
        let sumCalculatedPagtos = 0;
        
        result.forEach(v => {
          const dinheiro = v.DINHEIRO || 0;
          const cartao = v.CARTAO || 0;
          const cheque = v.CHEQUE || 0;
          const crediario = v.CREDIARIO || 0;
          const parcelamento = v.PARCELAMENTO || 0;
          const outros = v.OUTROS || 0;
          
          const totalPgto = dinheiro + cartao + cheque + crediario + parcelamento + outros;
          
          console.log(`ID: ${v.VENDA_NOTA_ID} | Hora: ${v.VENDA_DATA_HORA.toISOString().substring(11,19)} | Total: ${v.VENDA_TOTAL.toFixed(2)} | Pgto Calc: ${totalPgto.toFixed(2)} (Din: ${dinheiro}, Card: ${cartao}, Cred: ${crediario}, Out: ${outros}) | Cancelado: ${v.CANCELADO} | PreVenda: ${v.PRE_VENDA} | Cupom: ${v.CUPOM} | DAV: ${v.NUMDAV}`);
          
          if (v.CANCELADO !== 'S') {
            sumTotalSales += v.VENDA_TOTAL;
            sumCalculatedPagtos += totalPgto;
          }
        });
        
        console.log('\n======================================================');
        console.log('Soma de VENDA_TOTAL (não canceladas):', sumTotalSales.toFixed(2));
        console.log('Soma dos pagamentos calculados (não canceladas):', sumCalculatedPagtos.toFixed(2));
        
        // Vamos checar agora se existem formas de pagamento correspondentes na tabela CAB_VENDAS_FPAGTOS
        const sqlPagtos = `
          SELECT 
            v.VENDA_NOTA_ID,
            COALESCE(SUM(fp.VALOR), 0) as TOTAL_PAGTO_DETALHE
          FROM CAB_VENDAS_FPAGTOS fp
          JOIN CAB_VENDAS v ON fp.VENDA_NOTA_ID = v.VENDA_NOTA_ID
          WHERE CAST(v.VENDA_DATA_HORA AS DATE) = '2026-06-02'
            AND v.CANCELADO <> 'S'
          GROUP BY v.VENDA_NOTA_ID
        `;
        
        db.query(sqlPagtos, function(err, pagtosResult) {
          if (err) {
            console.error('Erro na query de pagamentos:', err);
          } else {
            console.log('\nDetalhamento por CAB_VENDAS_FPAGTOS:');
            let totalFpagtos = 0;
            const fpMap = {};
            pagtosResult.forEach(p => {
              fpMap[p.VENDA_NOTA_ID] = p.TOTAL_PAGTO_DETALHE;
              totalFpagtos += p.TOTAL_PAGTO_DETALHE;
            });
            
            console.log(`Total geral de formas de pagamento ativas de hoje: ${totalFpagtos.toFixed(2)}`);
            
            console.log('\nComparativo Venda Total vs CAB_VENDAS_FPAGTOS:');
            result.forEach(v => {
              if (v.CANCELADO !== 'S') {
                const fpTotal = fpMap[v.VENDA_NOTA_ID] || 0;
                if (Math.abs(v.VENDA_TOTAL - fpTotal) > 0.01) {
                  console.log(`⚠️ VENDA #${v.VENDA_NOTA_ID} DIVERGENTE! Venda_Total: ${v.VENDA_TOTAL.toFixed(2)} | FP_Total: ${fpTotal.toFixed(2)} | PreVenda: ${v.PRE_VENDA} | Cupom: ${v.CUPOM} | DAV: ${v.NUMDAV}`);
                }
              }
            });
          }
          db.detach();
        });
    });
});
