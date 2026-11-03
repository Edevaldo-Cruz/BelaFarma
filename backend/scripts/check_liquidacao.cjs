const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'belafarma.db'));

const queryTodos = `
  SELECT 
    l.produto_id, 
    l.descricao, 
    l.preco_normal as liq_normal,
    l.preco_promocional as liq_promo,
    l.data_inicio as liq_inicio,
    l.data_termino as liq_termino,
    c.preco_normal as estoque_normal,
    c.preco_promocional as estoque_promo,
    c.preco_venda_vigente as estoque_vigente,
    c.inicio_promocao as estoque_inicio_promo,
    c.termino_promocao as estoque_termino_promo
  FROM liquidacao_campanhas_itens l
  LEFT JOIN compras_estoque_cache c ON l.produto_id = c.produto_id
`;

const todos = db.prepare(queryTodos).all();

const ativosNoVigente = todos.filter(t => Math.abs(Number(t.estoque_vigente || 0) - Number(t.liq_promo)) <= 0.01);
const cobrandoPrecoNormal = todos.filter(t => Math.abs(Number(t.estoque_vigente || 0) - Number(t.estoque_normal || 0)) <= 0.01 && Math.abs(Number(t.estoque_vigente || 0) - Number(t.liq_promo)) > 0.01);
const cobrandoOutro = todos.filter(t => 
  Math.abs(Number(t.estoque_vigente || 0) - Number(t.liq_promo)) > 0.01 &&
  Math.abs(Number(t.estoque_vigente || 0) - Number(t.estoque_normal || 0)) > 0.01
);

console.log('========================================================');
console.log('           AUDITORIA DE PREÇOS DA LIQUIDAÇÃO           ');
console.log('========================================================');
console.log('Total cadastrado na Liquidação:                     ', todos.length);
console.log('✅ Em vigor no Caixa (cobrando o preço promocional): ', ativosNoVigente.length);
console.log('❌ NÃO em vigor (cobrando PREÇO CHEIO no Caixa):      ', cobrandoPrecoNormal.length);
console.log('⚠️ Cobrando outro valor divergente:                  ', cobrandoOutro.length);
console.log('========================================================\n');

if (cobrandoPrecoNormal.length > 0) {
  console.log(`--- LISTA DOS ${cobrandoPrecoNormal.length} PRODUTOS COBRANDO PREÇO CHEIO NO CAIXA ---`);
  cobrandoPrecoNormal.forEach((x, idx) => {
    console.log(`${idx + 1}. [ID ${x.produto_id}] ${x.descricao}`);
    console.log(`   👉 Preço da Liquidação: R$ ${Number(x.liq_promo).toFixed(2)} | Cobrando no Caixa: R$ ${Number(x.estoque_vigente).toFixed(2)} (Preço Cheio: R$ ${Number(x.estoque_normal).toFixed(2)})`);
    console.log(`   👉 No Digifarma: Promoção cadastrada = R$ ${Number(x.estoque_promo).toFixed(2)} (Início: ${x.estoque_inicio_promo || 'N/A'}, Fim: ${x.estoque_termino_promo || 'N/A'})`);
  });
}

if (cobrandoOutro.length > 0) {
  console.log(`\n--- LISTA DOS ${cobrandoOutro.length} PRODUTOS COM OUTRO VALOR ---`);
  cobrandoOutro.forEach((x, idx) => {
    console.log(`${idx + 1}. [ID ${x.produto_id}] ${x.descricao}`);
    console.log(`   👉 Preço da Liquidação: R$ ${Number(x.liq_promo).toFixed(2)} | Cobrando no Caixa: R$ ${Number(x.estoque_vigente).toFixed(2)}`);
  });
}
