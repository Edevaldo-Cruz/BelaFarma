/**
 * apply_crediario_updates.js
 * Executa a atualização definitiva dos preços de crediário no banco Firebird do Digifarma
 * em lote transacional e com verificação de integridade.
 */

const firebird = require('node-firebird');
const fs = require('fs');
const path = require('path');

const opts = {
  host: '127.0.0.1',
  port: 3050,
  database: 'C:\\Digifarma\\Dados\\digifarma6.fdb',
  user: 'SYSDBA',
  password: 'masterkey',
  pageSize: 4096
};

function roundCrediario(val) {
  if (!val || val <= 0) return 0;
  const raw = val * 1.20;
  let cents = Math.ceil(Math.round(raw * 1000) / 10);
  const lastDigit = ((cents % 10) + 10) % 10;
  let diff = 0;
  if (lastDigit === 0 || lastDigit === 5 || lastDigit === 9) {
    diff = 0;
  } else if (lastDigit < 5) {
    diff = 5 - lastDigit;
  } else {
    diff = 9 - lastDigit;
  }
  cents += diff;
  return Number((cents / 100).toFixed(2));
}

async function runUpdate() {
  console.log('[Digifarma Update] Conectando ao Firebird...');
  
  firebird.attach(opts, (err, db) => {
    if (err) {
      console.error('[Digifarma Update] ❌ Erro ao conectar:', err);
      process.exit(1);
    }

    const selectSql = `
      SELECT 
        PRODUTO_ID,
        PRODUTO,
        PROD_PRVENDA,
        PROD_PRPROMOCAO,
        PROD_PRCREDIARIO,
        PROD_SALDO
      FROM PRODUTOS
      WHERE PROD_ATIVO = 'S'
        AND PROD_SALDO > 0
        AND (PROD_PRCREDIARIO IS NULL OR PROD_PRCREDIARIO = 0)
      ORDER BY PRODUTO_ID ASC
    `;

    db.query(selectSql, (err, rows) => {
      if (err) {
        console.error('[Digifarma Update] ❌ Erro na consulta de itens:', err);
        db.detach();
        process.exit(1);
      }

      console.log(`[Digifarma Update] Encontrados ${rows.length} produtos para atualizar.`);
      if (rows.length === 0) {
        console.log('[Digifarma Update] Nenhum produto pendente.');
        db.detach();
        return;
      }

      // Prepara lista de updates
      const updates = [];
      for (const r of rows) {
        const id = r.PRODUTO_ID;
        const prVenda = Number(r.PROD_PRVENDA) || 0;
        const prPromo = Number(r.PROD_PRPROMOCAO) || 0;
        const precoBase = prPromo > 0 ? prPromo : prVenda;

        if (precoBase > 0) {
          const precoCrediario = roundCrediario(precoBase);
          if (precoCrediario > 0) {
            updates.push({ id, precoCrediario });
          }
        }
      }

      console.log(`[Digifarma Update] ${updates.length} produtos válidos prontos para UPDATE.`);

      // Abre transação atômica
      db.transaction(firebird.ISOLATION_READ_COMMITTED, async (err, tr) => {
        if (err) {
          console.error('[Digifarma Update] ❌ Erro ao abrir transação:', err);
          db.detach();
          process.exit(1);
        }

        try {
          let updatedCount = 0;
          const updateSql = 'UPDATE PRODUTOS SET PROD_PRCREDIARIO = ?, LASTUPDATE = CURRENT_TIMESTAMP WHERE PRODUTO_ID = ?';

          for (const item of updates) {
            await new Promise((resolve, reject) => {
              tr.query(updateSql, [item.precoCrediario, item.id], (errTr) => {
                if (errTr) return reject(errTr);
                updatedCount++;
                resolve();
              });
            });
          }

          console.log(`[Digifarma Update] ✅ Realizados ${updatedCount} updates na transação. Gravando commit...`);

          tr.commit((errCommit) => {
            if (errCommit) {
              console.error('[Digifarma Update] ❌ Erro no commit:', errCommit);
              tr.rollback(() => db.detach());
              process.exit(1);
            }

            console.log('[Digifarma Update] 🚀 COMMIT efetuado com sucesso!');
            db.detach();
            console.log('[Digifarma Update] Conexão encerrada com sucesso.');
          });

        } catch (execErr) {
          console.error('[Digifarma Update] ❌ Erro durante a execução. Efetuando rollback:', execErr.message);
          tr.rollback(() => {
            db.detach();
            process.exit(1);
          });
        }
      });
    });
  });
}

if (process.argv.includes('--execute')) {
  runUpdate();
} else {
  console.log('Modo de segurança: para executar de fato, passe o argumento --execute');
}
