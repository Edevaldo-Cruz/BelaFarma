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
    console.log('=== DOCKER COMPOSE FILE CONTENT ON VPS ===');
    const compose = await runRemote('cat /home/ed/projects/BelaFarma/docker-compose.yml');
    console.log(compose.out || compose.errOut);

    console.log('\n=== CLOUDFLARED SERVICE STATUS ON VPS ===');
    const cf = await runRemote('sudo systemctl status cloudflared || sudo docker ps -a | grep cloudflare');
    console.log(cf.out || cf.errOut);

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
