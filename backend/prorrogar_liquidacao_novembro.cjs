const Database = require('./node_modules/better-sqlite3');
const config = require('./config.js');
const { queryDigifarma } = require('./services/digifarma.service');

const db = new Database(config.dbPath);

async function prorrogar() {
  console.log('🚀 Iniciando prorrogação das promoções de Liquidação BelaFarma...');
  const novaDataFim = '2026-11-30';
  const fbTermino = `${novaDataFim} 23:59:59`;

  // 1. Atualizar liquidacao_campanhas
  const campResult = db.prepare(`
    UPDATE liquidacao_campanhas 
    SET data_fim = ?, semana_ano = '2026-NOVEMBRO'
    WHERE status = 'ativa' OR id = 'camp_oficial_out_2026'
  `).run(novaDataFim);
  console.log(`✅ Campanha(s) atualizada(s): ${campResult.changes} registro(s) com data_fim = ${novaDataFim}.`);

  // 2. Atualizar liquidacao_campanhas_itens
  const itensResult = db.prepare(`
    UPDATE liquidacao_campanhas_itens 
    SET data_termino = ?
    WHERE status = 'ativo'
  `).run(novaDataFim);
  console.log(`✅ Itens da liquidação atualizados: ${itensResult.changes} produto(s) com data_termino = ${novaDataFim}.`);

  // 3. Atualizar compras_estoque_cache
  const estoqueResult = db.prepare(`
    UPDATE compras_estoque_cache 
    SET termino_promocao = ?
    WHERE produto_id IN (
      SELECT produto_id FROM liquidacao_campanhas_itens WHERE status = 'ativo'
    )
  `).run(novaDataFim);
  console.log(`✅ Cache de estoque atualizado: ${estoqueResult.changes} produto(s) com termino_promocao = ${novaDataFim}.`);

  // 4. Atualizar mural_produtos_parados
  const muralResult = db.prepare(`
    UPDATE mural_produtos_parados 
    SET acao_detalhe = REPLACE(acao_detalhe, '31/10/2026', '30/11/2026')
    WHERE acao_detalhe LIKE '%31/10/2026%'
  `).run();
  console.log(`✅ Mural de produtos parados atualizado: ${muralResult.changes} registro(s).`);

  // 5. Atualizar Digifarma Firebird
  const itensAtivos = db.prepare(`
    SELECT produto_id, preco_promocional, descricao 
    FROM liquidacao_campanhas_itens 
    WHERE status = 'ativo'
  `).all();

  console.log(`\n📡 Tentando sincronizar ${itensAtivos.length} produto(s) com o Digifarma Firebird...`);
  let sucessosFb = 0;
  let errosFb = 0;

  for (const it of itensAtivos) {
    const pId = Number(it.produto_id);
    try {
      await queryDigifarma(
        `UPDATE PRODUTOS 
         SET TERMINO_PROMOCAO = ? 
         WHERE PRODUTO_ID = ? AND (PROD_PRPROMOCAO > 0 OR PROD_PRPROMOCAO IS NOT NULL)`,
        [fbTermino, pId],
        3000
      );
      sucessosFb++;
      db.prepare('UPDATE liquidacao_campanhas_itens SET sincronizado_digifarma = 1 WHERE produto_id = ?').run(pId);
    } catch (err) {
      errosFb++;
    }
  }

  if (sucessosFb > 0) {
    console.log(`🎉 Sucesso no Digifarma: ${sucessosFb} produtos com validade prorrogada até ${fbTermino}.`);
  }
  if (errosFb > 0) {
    console.log(`ℹ️ Digifarma Firebird offline/indisponível para ${errosFb} produtos. Datas salvas no SQLite com sucesso e sincronização automática pendente quando o Firebird conectar.`);
  }

  console.log('\n✨ Concluída prorrogação da liquidação por mais 1 mês (até 30/11/2026)!');
}

prorrogar().catch(err => {
  console.error('❌ Erro na prorrogação:', err);
  process.exit(1);
});
