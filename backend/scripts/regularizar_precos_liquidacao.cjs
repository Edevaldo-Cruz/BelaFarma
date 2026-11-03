const Database = require('../node_modules/better-sqlite3');
const path = require('path');
const config = require('../config.js');
const { queryDigifarma } = require('../services/digifarma.service');

const db = new Database(config.dbPath);

async function run() {
  console.log('🚀 Iniciando regularização dos 118 preços da Liquidação BelaFarma...\n');

  const inicioStr = '2026-10-05';
  const terminoStr = '2026-11-30';
  const fbInicio = `${inicioStr} 00:00:00`;
  const fbTermino = `${terminoStr} 23:59:59`;

  // 1. Buscar todos os itens ativos da campanha de liquidação
  const itens = db.prepare(`
    SELECT 
      id, produto_id, descricao, apresentacao, ean, categoria,
      saldo_estoque, preco_custo, preco_normal, preco_promocional,
      desconto_percentual, data_inicio, data_termino
    FROM liquidacao_campanhas_itens
    WHERE status = 'ativo'
  `).all();

  console.log(`📦 Total de produtos ativos encontrados na liquidação: ${itens.length}`);

  let atualizadosLocal = 0;
  const updatesLocalStmtLiq = db.prepare(`
    UPDATE liquidacao_campanhas_itens
    SET data_inicio = ?,
        data_termino = ?,
        desconto_percentual = ?,
        sincronizado_digifarma = ?
    WHERE id = ?
  `);

  const updatesLocalStmtEstoque = db.prepare(`
    UPDATE compras_estoque_cache
    SET preco_promocional = ?,
        preco_venda_vigente = ?,
        inicio_promocao = ?,
        termino_promocao = ?,
        atualizado_em = datetime('now', 'localtime')
    WHERE produto_id = ?
  `);

  const updatesLocalStmtDigi = db.prepare(`
    UPDATE digifarma_products_cache
    SET preco_promocao = ?,
        preco_venda = ?,
        atualizado_em = datetime('now', 'localtime')
    WHERE produto_id = ? OR produto_id = ?
  `);

  // Executa atualização em transação atômica no SQLite
  db.transaction(() => {
    for (const it of itens) {
      const pId = Number(it.produto_id);
      const prPromo = Number(it.preco_promocional);
      let prNormal = Number(it.preco_normal);

      // Se preço normal for inválido ou menor que o promocional, buscar do estoque cache
      if (!prNormal || prNormal <= prPromo) {
        const estRow = db.prepare('SELECT preco_normal FROM compras_estoque_cache WHERE produto_id = ?').get(pId);
        if (estRow && estRow.preco_normal > prPromo) {
          prNormal = Number(estRow.preco_normal);
        } else {
          prNormal = prPromo * 1.4; // fallback de margem referencial
        }
      }

      const descPct = Math.max(0, Math.round(((prNormal - prPromo) / prNormal) * 100));

      // 1. Atualiza item da liquidação
      updatesLocalStmtLiq.run(inicioStr, terminoStr, descPct, 0, it.id);

      // 2. Atualiza compras_estoque_cache
      updatesLocalStmtEstoque.run(prPromo, prPromo, inicioStr, terminoStr, pId);

      // 3. Atualiza digifarma_products_cache
      updatesLocalStmtDigi.run(prPromo, prPromo, String(pId), `${pId}.0`);

      atualizadosLocal++;
    }
  })();

  console.log(`✅ ${atualizadosLocal} produtos atualizados com sucesso no banco local (preco_venda_vigente = preco_promocional)!`);

  // 2. Tentativa de sincronização com o Digifarma Firebird (se acessível)
  console.log('\n📡 Tentando sincronizar os 118 preços promocionais no Digifarma Firebird...');
  let sucessosFb = 0;
  let falhasFb = 0;

  for (const it of itens) {
    const pId = Number(it.produto_id);
    const prPromo = Number(it.preco_promocional);

    try {
      await queryDigifarma(
        `UPDATE PRODUTOS 
         SET PROD_PRPROMOCAO = ?, 
             INICIO_PROMOCAO = ?, 
             TERMINO_PROMOCAO = ? 
         WHERE PRODUTO_ID = ?`,
        [prPromo, fbInicio, fbTermino, pId],
        2000
      );
      sucessosFb++;
      db.prepare('UPDATE liquidacao_campanhas_itens SET sincronizado_digifarma = 1 WHERE id = ?').run(it.id);
    } catch (e) {
      falhasFb++;
      // Se der timeout ou offline logo no primeiro, não precisa esperar 118 timeouts
      if (falhasFb >= 3 && sucessosFb === 0) {
        console.warn(`⚠️ Digifarma Firebird offline no momento (${e.message}). Interrompendo chamadas de rede.`);
        break;
      }
    }
  }

  if (sucessosFb > 0) {
    console.log(`🎉 Sucesso no Digifarma Firebird: ${sucessosFb} produtos atualizados diretamente na tabela PRODUTOS!`);
  } else {
    console.log(`ℹ️ Firebird offline na conexão de rede atual. Todos os 118 produtos foram gravados no SQLite local com vigência até ${terminoStr}.`);
    console.log(`   Assim que o servidor da farmácia estiver conectado na rede local, a sincronização pode ser acionada em 1 clique pelo painel.`);
  }

  // 3. Validação final pós-execução
  const checkQtd = db.prepare(`
    SELECT count(*) as total
    FROM liquidacao_campanhas_itens l
    JOIN compras_estoque_cache c ON l.produto_id = c.produto_id
    WHERE ABS(c.preco_venda_vigente - l.preco_promocional) <= 0.01
  `).get();

  console.log(`\n========================================================`);
  console.log(`🎯 TOTAL DE PRODUTOS DA LIQUIDAÇÃO EM VIGOR NO CAIXA/SISTEMA: ${checkQtd.total} de ${itens.length}`);
  console.log(`========================================================\n`);
}

run().catch(console.error);
