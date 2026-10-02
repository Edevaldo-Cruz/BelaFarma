const firebird = require('./node_modules/node-firebird');
const Database = require('./node_modules/better-sqlite3');
const path = require('path');
const fs = require('fs');

const BACKUP_FDB = 'C:\\Digifarma\\Dados\\bkp_25092026\\digifarma_25092026.fdb';
const CURRENT_FDB = 'C:\\Digifarma\\Dados\\digifarma6.fdb';
const SQLITE_PATH = path.join(__dirname, '..', 'data', 'belafarma.db');

function getFbOptions(database) {
  return {
    host: '127.0.0.1',
    port: 3050,
    database: database,
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false
  };
}

function queryFb(dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    firebird.attach(getFbOptions(dbPath), (err, fb) => {
      if (err) return reject(err);
      fb.query(sql, params, (qErr, rows) => {
        fb.detach();
        if (qErr) return reject(qErr);
        resolve(rows);
      });
    });
  });
}

function executeFbTransaction(dbPath, updateStatements) {
  return new Promise((resolve, reject) => {
    firebird.attach(getFbOptions(dbPath), (err, fb) => {
      if (err) return reject(err);

      fb.transaction(firebird.ISOLATION_READ_COMMITTED, async (tErr, transaction) => {
        if (tErr) {
          fb.detach();
          return reject(tErr);
        }

        try {
          for (let i = 0; i < updateStatements.length; i++) {
            const item = updateStatements[i];
            await new Promise((resQ, rejQ) => {
              transaction.query(item.sql, item.params, (qErr, result) => {
                if (qErr) return rejQ(qErr);
                resQ(result);
              });
            });
          }

          transaction.commit((cErr) => {
            fb.detach();
            if (cErr) return reject(cErr);
            resolve(updateStatements.length);
          });
        } catch (e) {
          transaction.rollback(() => {
            fb.detach();
          });
          reject(e);
        }
      });
    });
  });
}

async function run() {
  console.log('================================================================');
  console.log('RESTAURAÇÃO EXCLUSIVA DE PREÇOS DO DIGIFARMA (PROD_PRVENDA & PROD_PRPROMOCAO)');
  console.log('BASE DE ORIGEM: Backup de Sexta-feira 25/09/2026 (18h04)');
  console.log('BASE DE DESTINO: Digifarma de Produção (digifarma6.fdb)');
  console.log('================================================================\n');

  console.log('1. Lendo produtos do backup 25/09/2026...');
  const bkpRows = await queryFb(BACKUP_FDB, `
    SELECT PRODUTO_ID, PRODUTO, PROD_PRVENDA, PROD_PRPROMOCAO, INICIO_PROMOCAO, TERMINO_PROMOCAO
    FROM PRODUTOS
  `);
  console.log(`   Total de produtos no backup: ${bkpRows.length}`);
  const bkpMap = new Map(bkpRows.map(r => [r.PRODUTO_ID, r]));

  console.log('2. Lendo produtos atuais da produção...');
  const curRows = await queryFb(CURRENT_FDB, `
    SELECT PRODUTO_ID, PRODUTO, PROD_PRVENDA, PROD_PRPROMOCAO, INICIO_PROMOCAO, TERMINO_PROMOCAO
    FROM PRODUTOS
  `);
  console.log(`   Total de produtos na produção atual: ${curRows.length}`);

  const updateStatements = [];
  const logAlteracoes = [];

  for (const cur of curRows) {
    const bkp = bkpMap.get(cur.PRODUTO_ID);
    if (!bkp) continue; // Item cadastrado após o dia 25/09, mantém intacto

    const bkpVenda = Number((bkp.PROD_PRVENDA || 0).toFixed(2));
    const curVenda = Number((cur.PROD_PRVENDA || 0).toFixed(2));

    const bkpPromo = Number((bkp.PROD_PRPROMOCAO || 0).toFixed(2));
    const curPromo = Number((cur.PROD_PRPROMOCAO || 0).toFixed(2));

    const bkpIniStr = bkp.INICIO_PROMOCAO ? new Date(bkp.INICIO_PROMOCAO).toISOString().split('T')[0] : null;
    const curIniStr = cur.INICIO_PROMOCAO ? new Date(cur.INICIO_PROMOCAO).toISOString().split('T')[0] : null;

    const bkpFimStr = bkp.TERMINO_PROMOCAO ? new Date(bkp.TERMINO_PROMOCAO).toISOString().split('T')[0] : null;
    const curFimStr = cur.TERMINO_PROMOCAO ? new Date(cur.TERMINO_PROMOCAO).toISOString().split('T')[0] : null;

    const mudouVenda = bkpVenda !== curVenda;
    const mudouPromo = bkpPromo !== curPromo || bkpIniStr !== curIniStr || bkpFimStr !== curFimStr;

    if (mudouVenda || mudouPromo) {
      updateStatements.push({
        sql: `UPDATE PRODUTOS SET PROD_PRVENDA = ?, PROD_PRPROMOCAO = ?, INICIO_PROMOCAO = ?, TERMINO_PROMOCAO = ? WHERE PRODUTO_ID = ?`,
        params: [
          bkpVenda,
          bkpPromo,
          bkp.INICIO_PROMOCAO || null,
          bkp.TERMINO_PROMOCAO || null,
          cur.PRODUTO_ID
        ]
      });

      logAlteracoes.push({
        id: cur.PRODUTO_ID,
        produto: cur.PRODUTO,
        venda_antes: curVenda,
        venda_restaurado: bkpVenda,
        promo_antes: curPromo,
        promo_restaurado: bkpPromo,
        inicio_antes: curIniStr,
        inicio_restaurado: bkpIniStr,
        termino_antes: curFimStr,
        termino_restaurado: bkpFimStr
      });
    }
  }

  console.log(`\n3. Total de produtos identificados para restauração de preços: ${updateStatements.length}`);

  if (updateStatements.length === 0) {
    console.log('Nenhum produto com preço divergente. Nada a restaurar.');
    return;
  }

  console.log('4. Aplicando restauração transacional no Firebird (digifarma6.fdb)...');
  await executeFbTransaction(CURRENT_FDB, updateStatements);
  console.log(`✅ Sucesso no Firebird! ${updateStatements.length} produtos atualizados com os preços de 25/09/2026.`);

  // 5. Atualizar SQLite local
  console.log('5. Atualizando cache local SQLite (belafarma.db)...');
  const sqlite = new Database(SQLITE_PATH);

  const stmtUpdateEstoque = sqlite.prepare(`
    UPDATE compras_estoque_cache
    SET preco_venda_vigente = ?,
        preco_promocional = ?
    WHERE produto_id = ?
  `);

  const stmtUpdateLiq = sqlite.prepare(`
    UPDATE liquidacao_campanhas_itens
    SET preco_normal = ?,
        preco_promocao_original = ?
    WHERE produto_id = ?
  `);

  let countSqlite = 0;
  sqlite.transaction(() => {
    for (const item of logAlteracoes) {
      const precoVigente = item.promo_restaurado > 0 ? item.promo_restaurado : item.venda_restaurado;
      stmtUpdateEstoque.run(precoVigente, item.promo_restaurado, item.id);
      stmtUpdateLiq.run(precoVigente, item.promo_restaurado, item.id);
      countSqlite++;
    }
  })();
  console.log(`✅ Sucesso no SQLite! ${countSqlite} produtos sincronizados.`);

  // 6. Salvar log em disco para conferência
  const relatorioPath = path.join(__dirname, '..', 'relatorio_restauracao_precos_2509.json');
  fs.writeFileSync(relatorioPath, JSON.stringify(logAlteracoes, null, 2), 'utf8');
  console.log(`\n📋 Relatório completo salvo em: ${relatorioPath}`);

  return logAlteracoes;
}

run().catch(console.error);
