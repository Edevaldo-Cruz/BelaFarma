const firebird = require('./node_modules/node-firebird');
const fs = require('fs');

const BACKUP_FDB = 'C:\\Digifarma\\Dados\\bkp_25092026\\digifarma_25092026.fdb';
const CURRENT_FDB = 'C:\\Digifarma\\Dados\\digifarma6.fdb';

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

async function analyze() {
  console.log('--- Analisando Preços entre Backup 25/09 e Produção Atual ---');

  // Buscar todos os produtos do backup
  console.log('Lendo PRODUTOS do backup 25/09...');
  const bkpProducts = await queryFb(BACKUP_FDB, `
    SELECT 
      PRODUTO_ID, PRODUTO, PROD_PRVENDA, PROD_PRPROMOCAO, 
      INICIO_PROMOCAO, TERMINO_PROMOCAO, PROD_PRCREDIARIO
    FROM PRODUTOS
  `);
  console.log(`Total produtos no backup: ${bkpProducts.length}`);

  // Buscar todos os produtos da produção atual
  console.log('Lendo PRODUTOS da produção atual...');
  const curProducts = await queryFb(CURRENT_FDB, `
    SELECT 
      PRODUTO_ID, PRODUTO, PROD_PRVENDA, PROD_PRPROMOCAO, 
      INICIO_PROMOCAO, TERMINO_PROMOCAO, PROD_PRCREDIARIO
    FROM PRODUTOS
  `);
  console.log(`Total produtos na produção atual: ${curProducts.length}`);

  const curMap = new Map(curProducts.map(p => [p.PRODUTO_ID, p]));

  const diffVenda = [];
  const diffPromo = [];
  const diffCrediario = [];

  for (const bkp of bkpProducts) {
    const cur = curMap.get(bkp.PRODUTO_ID);
    if (!cur) continue;

    const bkpVenda = Number((bkp.PROD_PRVENDA || 0).toFixed(2));
    const curVenda = Number((cur.PROD_PRVENDA || 0).toFixed(2));

    const bkpPromo = Number((bkp.PROD_PRPROMOCAO || 0).toFixed(2));
    const curPromo = Number((cur.PROD_PRPROMOCAO || 0).toFixed(2));

    const bkpCred = Number((bkp.PROD_PRCREDIARIO || 0).toFixed(2));
    const curCred = Number((cur.PROD_PRCREDIARIO || 0).toFixed(2));

    if (bkpVenda !== curVenda) {
      diffVenda.push({ id: bkp.PRODUTO_ID, produto: bkp.PRODUTO, bkpVenda, curVenda });
    }

    if (bkpPromo !== curPromo || String(bkp.TERMINO_PROMOCAO) !== String(cur.TERMINO_PROMOCAO)) {
      diffPromo.push({ 
        id: bkp.PRODUTO_ID, 
        produto: bkp.PRODUTO, 
        bkpPromo, 
        curPromo,
        bkpInicio: bkp.INICIO_PROMOCAO,
        curInicio: cur.INICIO_PROMOCAO,
        bkpTermino: bkp.TERMINO_PROMOCAO,
        curTermino: cur.TERMINO_PROMOCAO
      });
    }

    if (bkpCred !== curCred) {
      diffCrediario.push({ id: bkp.PRODUTO_ID, produto: bkp.PRODUTO, bkpCred, curCred });
    }
  }

  console.log(`Diferença em PROD_PRVENDA: ${diffVenda.length}`);
  console.log(`Diferença em PROD_PRPROMOCAO (ou datas): ${diffPromo.length}`);
  console.log(`Diferença em PROD_PRCREDIARIO: ${diffCrediario.length}`);

  console.log('\n--- Amostra de alterações em PROD_PRVENDA ---');
  console.log(diffVenda.slice(0, 10));

  console.log('\n--- Amostra de alterações em PROD_PRPROMOCAO ---');
  console.log(diffPromo.slice(0, 15));

  // Verificar especificamente os itens da liquidação
  const Database = require('./node_modules/better-sqlite3');
  const path = require('path');
  const db = new Database(path.join(__dirname, '..', 'data', 'belafarma.db'));
  const itensLiq = db.prepare('SELECT produto_id, descricao FROM liquidacao_campanhas_itens').all();
  const setLiq = new Set(itensLiq.map(i => i.produto_id));

  const diffLiqPromo = diffPromo.filter(p => setLiq.has(p.id));
  console.log(`\nDos ${itensLiq.length} itens de liquidação, ${diffLiqPromo.length} têm diferença de promoção com o backup de 25/09.`);
  console.log(diffLiqPromo.slice(0, 10));
}

analyze().catch(console.error);
