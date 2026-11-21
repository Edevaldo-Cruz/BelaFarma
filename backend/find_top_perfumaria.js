const db = require('better-sqlite3')('./backend/belafarma.db');

console.log('--- BUSCANDO PERFUMARIA E HIGIENE COM ALTO GIRO E BAIXO ESTOQUE ---');
const itensPerfumaria = db.prepare(`
  SELECT produto_id, descricao, ean, saldo, vendas_30d, custo_unitario, curva_abc
  FROM compras_estoque_cache
  WHERE saldo <= 3 AND vendas_30d >= 3
    AND (
      descricao LIKE '%DESOD%' OR descricao LIKE '%AERO%' OR descricao LIKE '%REXONA%' 
      OR descricao LIKE '%DOVE%' OR descricao LIKE '%SAB %' OR descricao LIKE '%LUX%'
      OR descricao LIKE '%ALGODAO%' OR descricao LIKE '%COTONETE%' OR descricao LIKE '%HASTES%'
      OR descricao LIKE '%ACETONA%' OR descricao LIKE '%REMOVEDOR%' OR descricao LIKE '%FARMAX%'
      OR descricao LIKE '%SEDA%' OR descricao LIKE '%MONANGE%' OR descricao LIKE '%NIVEA%'
      OR descricao LIKE '%INTIMUS%' OR descricao LIKE '%SEMPRE LIVRE%' OR descricao LIKE '%ABS%'
      OR descricao LIKE '%BARLA%' OR descricao LIKE '%BOZZANO%' OR descricao LIKE '%SUNLESS%'
    )
    AND descricao NOT LIKE '%CLENIL%'
    AND descricao NOT LIKE '%AEROLIN%'
    AND descricao NOT LIKE '%SERETIDE%'
    AND descricao NOT LIKE '%ALENIA%'
  ORDER BY vendas_30d DESC
  LIMIT 35
`).all();

console.table(itensPerfumaria.map(it => ({
  ean: it.ean,
  descricao: it.descricao.substring(0, 38),
  saldo: it.saldo,
  vendas30d: it.vendas_30d,
  custo: `R$ ${Number(it.custo_unitario).toFixed(2)}`
})));
