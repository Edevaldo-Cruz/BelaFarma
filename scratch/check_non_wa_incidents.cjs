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
    console.log('=== SYSTEM INCIDENTS (NON-WHATSAPP OR ALL DISTINCT TYPES) ===');
    const dbCheck = await runRemote(`sudo docker exec $(sudo docker ps -qf "name=backend") node -e "
      const Database = require('better-sqlite3');
      const db = new Database('/usr/src/app/data/belafarma.db');
      try {
        console.log('Incidents count by type:');
        console.table(db.prepare('SELECT type, severity, count(*) as total FROM system_incidents GROUP BY type, severity').all());
        
        console.log('\nLast 20 Non-Disconnect Incidents:');
        const rows = db.prepare('SELECT id, timestamp, type, severity, title, details FROM system_incidents WHERE type != \\'WHATSAPP_DISCONNECT\\' ORDER BY id DESC LIMIT 20').all();
        console.table(rows);

        console.log('\nLast 5 Server Restarts / Heartbeats:');
        console.table(db.prepare('SELECT * FROM system_heartbeats').all());
      } catch(e) { console.error('Erro:', e.message); }
    "`);
    console.log(dbCheck.out || dbCheck.errOut);

    console.log('\n=== DOCKER SYSTEM STATS & UPTIME ===');
    const uptime = await runRemote('uptime');
    console.log('Uptime:', uptime.out);

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
