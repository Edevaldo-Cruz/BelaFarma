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

firebird.attach(opts, async (err, db) => {
  if (err) {
    console.error('Erro ao conectar ao Firebird:', err);
    process.exit(1);
  }

  const sql = `
    SELECT 
      PRODUTO_ID,
      PRODUTO,
      COD_BARRAS,
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

  db.query(sql, (err, rows) => {
    db.detach();
    if (err) {
      console.error('Erro na consulta:', err);
      process.exit(1);
    }

    console.log(`\nEncontrados ${rows.length} produtos para simulação.`);

    let comPromo = 0;
    let comVendaNormal = 0;
    let semPreco = 0;
    let final0 = 0;
    let final5 = 0;
    let final9 = 0;
    let finalInvalido = 0;

    const previewList = [];

    for (const r of rows) {
      const id = r.PRODUTO_ID;
      const nome = (r.PRODUTO || '').trim();
      const ean = (r.COD_BARRAS || '').trim();
      const saldo = Number(r.PROD_SALDO) || 0;
      const prVenda = Number(r.PROD_PRVENDA) || 0;
      const prPromo = Number(r.PROD_PRPROMOCAO) || 0;

      let precoBase = 0;
      let origemPreco = '';

      if (prPromo > 0) {
        precoBase = prPromo;
        origemPreco = 'PROMOCIONAL';
        comPromo++;
      } else if (prVenda > 0) {
        precoBase = prVenda;
        origemPreco = 'VENDA_NORMAL';
        comVendaNormal++;
      } else {
        origemPreco = 'SEM_PRECO';
        semPreco++;
      }

      const precoCrediarioCalculado = precoBase > 0 ? roundCrediario(precoBase) : 0;

      if (precoCrediarioCalculado > 0) {
        const lastDigit = Math.round(precoCrediarioCalculado * 100) % 10;
        if (lastDigit === 0) final0++;
        else if (lastDigit === 5) final5++;
        else if (lastDigit === 9) final9++;
        else finalInvalido++;
      }

      previewList.push({
        id,
        nome,
        ean,
        saldo,
        prVenda,
        prPromo,
        origemPreco,
        precoBase,
        precoCrediarioCalculado
      });
    }

    const outputPath = path.join(__dirname, 'previa_crediario_613.json');
    fs.writeFileSync(outputPath, JSON.stringify(previewList, null, 2), 'utf-8');

    console.log('\n================ RESUMO DA SIMULAÇÃO (DRY-RUN) ================');
    console.log(`Total de produtos analisados: ${rows.length}`);
    console.log(`- Base no Preço Promocional (+20%): ${comPromo}`);
    console.log(`- Base no Preço Normal (+20%):      ${comVendaNormal}`);
    console.log(`- Sem preço base cadastrado (R$ 0): ${semPreco}`);
    console.log('\n--- AUDITORIA DAS TERMINAÇÕES DOS CENTAVOS ---');
    console.log(`- Terminados em 0 (ex: ,20 ,30 ,40 ,00): ${final0}`);
    console.log(`- Terminados em 5 (ex: ,15 ,25 ,35 ,95): ${final5}`);
    console.log(`- Terminados em 9 (ex: ,19 ,29 ,49 ,99): ${final9}`);
    console.log(`- Terminados em outros dígitos (PROIBIDOS): ${finalInvalido}`);
    console.log(`=================================================================\n`);

    // Mostra amostras variadas
    console.log('--- AMOSTRA DE 15 PRODUTOS CALCULADOS ---');
    const amostra = [
      ...previewList.filter(p => p.origemPreco === 'PROMOCIONAL').slice(0, 8),
      ...previewList.filter(p => p.origemPreco === 'VENDA_NORMAL').slice(0, 7)
    ];

    console.table(amostra.map(p => ({
      ID: p.id,
      Nome: p.nome.substring(0, 30),
      Estoque: p.saldo,
      Base: `R$ ${p.precoBase.toFixed(2)} (${p.origemPreco === 'PROMOCIONAL' ? 'Promo' : 'Normal'})`,
      '+20% Bruto': `R$ ${(p.precoBase * 1.2).toFixed(3)}`,
      'Crediário Final': `R$ ${p.precoCrediarioCalculado.toFixed(2)}`,
      'Fim': `${Math.round(p.precoCrediarioCalculado * 100) % 10}`
    })));
  });
});
