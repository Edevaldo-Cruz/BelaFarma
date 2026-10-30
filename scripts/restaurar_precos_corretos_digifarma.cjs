const firebird = require('../backend/node_modules/node-firebird');
const Database = require('../backend/node_modules/better-sqlite3');
const path = require('path');
const fs = require('fs');

const SQLITE_PATH = path.join(__dirname, '..', 'data', 'belafarma.db');
const CURRENT_FDB = 'C:\\Digifarma\\Dados\\digifarma6.fdb';
const BACKUP_FDB = 'C:\\Digifarma\\Dados\\bkp_precos\\bkp_precos_16092026_072709.fdb';

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
          for (const item of updateStatements) {
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
  console.log('=== RESTAURAÇÃO EXATA DE PREÇOS DO DIGIFARMA A PARTIR DO BACKUP 16/09/2026 ===\n');

  const sqlite = new Database(SQLITE_PATH);

  // 1. Obter os produtos da lista de liquidação
  const itens = sqlite.prepare(`
    SELECT DISTINCT produto_id, descricao 
    FROM liquidacao_campanhas_itens 
    WHERE status = 'ativo'
  `).all();
  const ids = itens.map(i => i.produto_id);

  console.log(`Encontrados ${ids.length} produtos na lista de liquidação ativa.`);

  // 2. Buscar dados no Backup de 16/09/2026
  console.log('Lendo banco de dados de backup: ' + BACKUP_FDB);
  const rowsBackup = await queryFb(BACKUP_FDB, `
    SELECT PRODUTO_ID, PRODUTO, PROD_PRVENDA, PROD_PRPROMOCAO, INICIO_PROMOCAO, TERMINO_PROMOCAO
    FROM PRODUTOS
    WHERE PRODUTO_ID IN (${ids.join(',')})
  `);
  const bkpMap = new Map(rowsBackup.map(r => [r.PRODUTO_ID, r]));

  // 3. Buscar dados atuais no Digifarma de produção
  console.log('Lendo banco de dados atual de produção: ' + CURRENT_FDB);
  const rowsCurrent = await queryFb(CURRENT_FDB, `
    SELECT PRODUTO_ID, PRODUTO, PROD_PRVENDA, PROD_PRPROMOCAO, INICIO_PROMOCAO, TERMINO_PROMOCAO
    FROM PRODUTOS
    WHERE PRODUTO_ID IN (${ids.join(',')})
  `);
  const curMap = new Map(rowsCurrent.map(r => [r.PRODUTO_ID, r]));

  const updatesDigifarma = [];
  const logRestauracao = [];

  for (const it of itens) {
    const pid = it.produto_id;
    const bkp = bkpMap.get(pid);
    const cur = curMap.get(pid);

    if (!bkp) {
      console.warn(`[Aviso] Produto ID ${pid} (${it.descricao}) não constava no backup de 16/09/2026 (item recente).`);
      continue;
    }

    const bkpPromo = bkp.PROD_PRPROMOCAO != null ? Number(bkp.PROD_PRPROMOCAO.toFixed(2)) : 0;
    const curPromo = cur && cur.PROD_PRPROMOCAO != null ? Number(cur.PROD_PRPROMOCAO.toFixed(2)) : 0;
    const bkpVenda = bkp.PROD_PRVENDA != null ? Number(bkp.PROD_PRVENDA.toFixed(2)) : 0;

    // Preço que era efetivamente cobrado antes da promoção de liquidação:
    const precoOriginalEfetivo = bkpPromo > 0 ? bkpPromo : bkpVenda;

    // Se o backup tinha promoção e atualmente está zerado (ou diferente), restaurar!
    if (bkpPromo > 0 && curPromo !== bkpPromo) {
      updatesDigifarma.push({
        sql: `UPDATE PRODUTOS SET PROD_PRPROMOCAO = ?, INICIO_PROMOCAO = ?, TERMINO_PROMOCAO = ? WHERE PRODUTO_ID = ?`,
        params: [
          bkpPromo,
          bkp.INICIO_PROMOCAO || null,
          bkp.TERMINO_PROMOCAO || null,
          pid
        ]
      });
    }

    logRestauracao.push({
      id: pid,
      descricao: it.descricao,
      preco_tabela: bkpVenda,
      preco_promocional_backup: bkpPromo,
      preco_real_praticado: precoOriginalEfetivo,
      status_no_digifarma_antes: curPromo === 0 && bkpPromo > 0 ? `ZERADO (Cobrando R$ ${bkpVenda.toFixed(2)})` : `OK (R$ ${curPromo.toFixed(2)})`,
      restaurado_para: bkpPromo > 0 ? `R$ ${bkpPromo.toFixed(2)} (Promoção Ativa)` : `R$ ${bkpVenda.toFixed(2)} (Preço Tabela)`
    });

    // Atualizar no SQLite local também:
    // A coluna preco_normal deve ser o preço de venda real que a farmácia praticava!
    sqlite.prepare(`
      UPDATE liquidacao_campanhas_itens
      SET preco_normal = ?
      WHERE produto_id = ? AND status = 'ativo'
    `).run(precoOriginalEfetivo, pid);

    sqlite.prepare(`
      UPDATE compras_estoque_cache
      SET preco_promocional = ?,
          preco_venda_vigente = ?
      WHERE produto_id = ?
    `).run(bkpPromo, precoOriginalEfetivo, pid);
  }

  console.log(`\nTotal de produtos que terão PROD_PRPROMOCAO restaurados no Digifarma: ${updatesDigifarma.length}`);

  if (updatesDigifarma.length > 0) {
    console.log('Executando restauração em lote no Firebird...');
    await executeFbTransaction(CURRENT_FDB, updatesDigifarma);
    console.log(`✅ Sucesso! ${updatesDigifarma.length} produtos restaurados no Digifarma (digifarma6.fdb) com seus preços e datas originais do backup!`);
  } else {
    console.log('Nenhum produto precisou de atualização no Firebird.');
  }

  // Salvar relatório JSON para auditoria
  const relatorioPath = path.join(__dirname, '..', 'scratch', 'relatorio_restauracao_101_produtos.json');
  fs.writeFileSync(relatorioPath, JSON.stringify(logRestauracao, null, 2), 'utf8');
  console.log(`\nRelatório salvo em: ${relatorioPath}`);

  return logRestauracao;
}

run().catch(console.error);
