const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  conn.exec('sudo docker-compose -f /home/ed/projects/BelaFarma/docker-compose.yml logs --tail=100 backend', (err, stream) => {
    if (err) {
      console.error('Error executing logs command:', err.message);
      conn.end();
      return;
    }
    stream.on('close', (code) => {
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('SSH Error:', err.message);
}).connect({
  host: '192.168.1.70',
  port: 22,
  username: 'ed',
  password: '2494'
});
