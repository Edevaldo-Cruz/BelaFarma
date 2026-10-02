const firebird = require('./node_modules/node-firebird');

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

async function detailedDiff() {
  const bkp = await queryFb(BACKUP_FDB, 'SELECT PRODUTO_ID, PRODUTO, PROD_PRVENDA, PROD_PRPROMOCAO, INICIO_PROMOCAO, TERMINO_PROMOCAO, PROD_PRCREDIARIO FROM PRODUTOS');
  const cur = await queryFb(CURRENT_FDB, 'SELECT PRODUTO_ID, PRODUTO, PROD_PRVENDA, PROD_PRPROMOCAO, INICIO_PROMOCAO, TERMINO_PROMOCAO, PROD_PRCREDIARIO FROM PRODUTOS');
  
  const bkpMap = new Map(bkp.map(p => [p.PRODUTO_ID, p]));

  let diffCount = 0;
  const changedList = [];

  for (const c of cur) {
    const b = bkpMap.get(c.PRODUTO_ID);
    if (!b) continue; // produto novo cadastrado após dia 25

    const b_venda = Number((b.PROD_PRVENDA || 0).toFixed(2));
    const c_venda = Number((c.PROD_PRVENDA || 0).toFixed(2));
    const b_promo = Number((b.PROD_PRPROMOCAO || 0).toFixed(2));
    const c_promo = Number((c.PROD_PRPROMOCAO || 0).toFixed(2));
    const b_cred = Number((b.PROD_PRCREDIARIO || 0).toFixed(2));
    const c_cred = Number((c.PROD_PRCREDIARIO || 0).toFixed(2));
    const b_ini = b.INICIO_PROMOCAO ? new Date(b.INICIO_PROMOCAO).toISOString().split('T')[0] : null;
    const c_ini = c.INICIO_PROMOCAO ? new Date(c.INICIO_PROMOCAO).toISOString().split('T')[0] : null;
    const b_fim = b.TERMINO_PROMOCAO ? new Date(b.TERMINO_PROMOCAO).toISOString().split('T')[0] : null;
    const c_fim = c.TERMINO_PROMOCAO ? new Date(c.TERMINO_PROMOCAO).toISOString().split('T')[0] : null;

    const vendaDiff = b_venda !== c_venda;
    const promoDiff = b_promo !== c_promo || b_ini !== c_ini || b_fim !== c_fim;
    const credDiff = b_cred !== c_cred;

    if (vendaDiff || promoDiff || credDiff) {
      diffCount++;
      changedList.push({
        id: c.PRODUTO_ID,
        produto: c.PRODUTO,
        venda: vendaDiff ? { de: c_venda, para: b_venda } : null,
        promo: promoDiff ? { de: c_promo, para: b_promo, de_datas: [c_ini, c_fim], para_datas: [b_ini, b_fim] } : null,
        cred: credDiff ? { de: c_cred, para: b_cred } : null
      });
    }
  }

  console.log(`Total de produtos com qualquer diferença de preço: ${diffCount}`);
  console.log('Exemplos de diferenças:', JSON.stringify(changedList.slice(0, 5), null, 2));

  // Verificar apenas PROD_PRVENDA e PROD_PRPROMOCAO (sem crediario)
  const semCrediario = changedList.filter(x => x.venda !== null || x.promo !== null);
  console.log(`Total de produtos com diferença em Venda ou Promoção (excluindo crediário): ${semCrediario.length}`);
}

detailedDiff().catch(console.error);
