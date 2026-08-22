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
    console.log('=== 1. LAST REBOOTS / SHUTDOWNS ===');
    const lastReboot = await runRemote('last -x reboot shutdown | head -n 10');
    console.log(lastReboot.out || lastReboot.errOut);

    console.log('=== 2. RASPBERRY PI THROTTLED STATUS (Under-voltage / Overheating) ===');
    const throttled = await runRemote('vcgencmd get_throttled; vcgencmd measure_temp');
    console.log(throttled.out || throttled.errOut);

    console.log('=== 3. JOURNAL LOGS FROM PREVIOUS BOOT (Last 40 lines before shutdown) ===');
    const prevBoot = await runRemote('sudo journalctl -b -1 -n 40 --no-pager');
    console.log(prevBoot.out || prevBoot.errOut);

    console.log('=== 4. CURRENT BOOT DMESG WARNINGS / ERRORS ===');
    const dmesg = await runRemote('sudo dmesg -l err,warn -T | tail -n 30');
    console.log(dmesg.out || dmesg.errOut);

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
