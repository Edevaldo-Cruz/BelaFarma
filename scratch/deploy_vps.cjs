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
    console.log('=== PULLING LATEST CODE ON VPS ===');
    await runRemote('cd /home/ed/projects/BelaFarma && git pull origin main');

    console.log('\n=== REBUILDING AND RESTARTING CONTAINERS ===');
    await runRemote('cd /home/ed/projects/BelaFarma && sudo docker-compose down && sudo docker-compose build && sudo docker-compose up -d');

    console.log('\n=== CHECKING CONTAINERS ===');
    await runRemote('sudo docker ps');

    conn.end();
  } catch (e) {
    console.error('Error during deploy:', e);
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
