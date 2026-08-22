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
    console.log('=== DOCKER CONTAINERS STATUS (docker ps -a) ===');
    const ps = await runRemote('sudo docker ps -a');
    console.log(ps.out);

    console.log('\n=== DOCKER COMPOSE LOGS (Últimas 80 linhas de todos os serviços) ===');
    const logs = await runRemote('sudo docker-compose -f /home/ed/projects/BelaFarma/docker-compose.yml logs --tail=80');
    console.log(logs.out);
    if (logs.errOut) console.log('STDERR:', logs.errOut);

    console.log('\n=== RECENT CRITICAL INCIDENTS FROM VPS SQLITE ===');
    const dbCheck = await runRemote(`sudo docker exec $(sudo docker ps -qf "name=backend") node -e "
      const Database = require('better-sqlite3');
      const db = new Database('/usr/src/app/data/belafarma.db');
      try {
        const rows = db.prepare('SELECT id, timestamp, type, severity, title, details FROM system_incidents ORDER BY id DESC LIMIT 15').all();
        console.table(rows);
      } catch(e) { console.error('Erro:', e.message); }
    "`);
    console.log(dbCheck.out || dbCheck.errOut);

    conn.end();
  } catch (e) {
    console.error('Error during execution:', e);
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
