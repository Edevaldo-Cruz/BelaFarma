const net = require('net');

const ips = [
  '192.168.1.5',
  '192.168.1.6',
  '192.168.1.7',
  '192.168.1.8',
  '192.168.1.12',
  '192.168.1.70'
];

console.log('Testando porta 22 (SSH) nos IPs ativos da rede local...');

const promises = ips.map(ip => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    
    socket.on('connect', () => {
      console.log(`[+] SSH ativo em: ${ip}`);
      socket.destroy();
      resolve({ ip, open: true });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ip, open: false });
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve({ ip, open: false });
    });
    
    socket.connect(22, ip);
  });
});

Promise.all(promises).then((results) => {
  console.log('\nResultados:');
  results.forEach(r => {
    console.log(`${r.ip}: ${r.open ? 'ABERTO (SSH)' : 'fechado'}`);
  });
});
