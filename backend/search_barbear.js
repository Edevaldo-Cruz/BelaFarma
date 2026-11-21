const db = require('better-sqlite3')('./backend/belafarma.db');

console.log('--- APARELHOS DE BARBEAR NO SISTEMA ---');
const aparelhos = db.prepare(`
  SELECT produto_id, descricao, ean, saldo, vendas_30d, custo_unitario, ultima_compra_valor, ultima_compra_fornecedor
  FROM compras_estoque_cache
  WHERE (descricao LIKE '%APAR %' OR descricao LIKE '%APARELHO%' OR descricao LIKE '%LAMINA%' OR descricao LIKE '%PRESTO%' OR descricao LIKE '%BARBEAR%')
    AND descricao NOT LIKE '%PRESSAO%'
    AND descricao NOT LIKE '%GLICEMIA%'
    AND descricao NOT LIKE '%AEROSOL%'
  ORDER BY vendas_30d DESC, saldo DESC
  LIMIT 25
`).all();

console.table(aparelhos);
