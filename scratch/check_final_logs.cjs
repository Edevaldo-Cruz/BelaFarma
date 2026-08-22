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
      }).stderr.on('data', (d) => {
        errOut += d.toString();
      });
    });
  });
}

conn.on('ready', async () => {
  try {
    console.log('=== EVOLUTION API LOGS ===');
    const evoLogs = await runRemote('sudo docker logs --tail=20 belafarma-evolution-api-1');
    console.log(evoLogs.out || evoLogs.errOut);

    console.log('\n=== BACKEND LOGS ===');
    const backendLogs = await runRemote('sudo docker logs --tail=30 belafarma-backend-1');
    console.log(backendLogs.out || backendLogs.errOut);

    conn.end();
  } catch (e) {
    console.error('Error during log check:', e);
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
