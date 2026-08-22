const { Client } = require('ssh2');
const conn = new Client();

function runRemote(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      let errOut = '';
      stream.on('close', (code) => {
        resolve({ code, out, errOut });
      }).on('data', (d) => {
        out += d.toString();
        process.stdout.write(d.toString());
      }).stderr.on('data', (d) => {
        errOut += d.toString();
        process.stderr.write(d.toString());
      });
    });
  });
}

conn.on('ready', async () => {
  try {
    const ids = '21533, 188242, 188865, 188550, 45634, 44413, 187610, 186734';
    const cmd = `sudo docker exec belafarma-backend-1 node -e "
      const { queryDigifarma } = require('./services/digifarma.service');
      (async () => {
        const rows = await queryDigifarma('SELECT PRODUTO_ID, PRODUTO, COD_BARRAS, PROD_PRCOMPRA, VALOR_ULT_COMPRA, PROD_CMV, PROD_PRVENDA, PROD_PRPROMOCAO FROM PRODUTOS WHERE PRODUTO_ID IN (${ids})');
        console.log('DIGIFARMA_ROWS:', JSON.stringify(rows, null, 2));
      })();
    "`;
    await runRemote(cmd);
    conn.end();
  } catch (e) {
    console.error('Error:', e);
    conn.end();
  }
}).on('error', (err) => {
  console.error('SSH Error:', err.message);
}).connect({
  host: '192.168.1.70',
  port: 22,
  username: 'ed',
  password: '2494'
});
