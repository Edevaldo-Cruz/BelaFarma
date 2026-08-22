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
    console.log('=== SYSTEM BOOT TIME & RESOURCES ===');
    const sys = await runRemote('who -b; free -h; df -h /');
    console.log(sys.out || sys.errOut);

    console.log('\n=== VAR LOG SYSLOG / MESSAGES (Last 50 lines) ===');
    const syslog = await runRemote('sudo tail -n 50 /var/log/syslog 2>/dev/null || sudo journalctl -n 50 --no-pager');
    console.log(syslog.out || syslog.errOut);

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
