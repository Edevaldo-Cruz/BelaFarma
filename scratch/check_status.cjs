const { Client } = require('ssh2');

const c = new Client();
c.on('ready', () => {
  c.exec('sudo docker-compose -f /home/ed/projects/BelaFarma/docker-compose.yml ps', (e, s) => {
    s.on('data', d => process.stdout.write(d.toString()));
    s.on('close', () => c.end());
  });
}).connect({ host: '192.168.1.70', port: 22, username: 'ed', password: '2494' });
