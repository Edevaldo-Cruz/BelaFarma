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
    const cmd = "sudo docker exec belafarma-backend-1 node -e \"const db = require('./database'); const c = db.prepare('SELECT COUNT(*) as count FROM napp_prices').get(); console.log('TOTAL_NAPP_PRICES:', c); const sample = db.prepare('SELECT * FROM napp_prices LIMIT 5').all(); console.log('SAMPLE_NAPP:', JSON.stringify(sample, null, 2));\"";
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
