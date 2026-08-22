const { Client } = require('ssh2');

const conn = new Client();

console.log('Testing execution of update-hardcore on Raspberry Pi...');

conn.on('ready', () => {
  conn.exec('update-hardcore', { pty: true }, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      return;
    }

    stream.on('close', (code, signal) => {
      console.log(`\nTest finished with exit code ${code}`);
      conn.end();
    });

    stream.on('data', (data) => {
      process.stdout.write(data.toString());
    });

    stream.stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection error:', err.message);
}).connect({
  host: '192.168.1.70',
  port: 22,
  username: 'ed',
  password: '2494'
});
