const net = require('net');

const ip = '192.168.1.70';
const ports = [22, 80, 443, 8080, 8085, 3001];

console.log(`Verificando portas comuns na VPS (${ip})...`);

const promises = ports.map(port => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    
    socket.on('connect', () => {
      console.log(`[+] Porta ${port} ABERTA`);
      socket.destroy();
      resolve({ port, open: true });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ port, open: false });
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve({ port, open: false });
    });
    
    socket.connect(port, ip);
  });
});

Promise.all(promises).then((results) => {
  console.log('\nResumo:');
  results.forEach(r => {
    console.log(`Porta ${r.port}: ${r.open ? 'ABERTA' : 'fechada'}`);
  });
});
