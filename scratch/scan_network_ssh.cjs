const net = require('net');

console.log('Iniciando varredura completa da rede 192.168.1.X na porta 22...');

async function checkIp(ip) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(250);
    
    socket.on('connect', () => {
      console.log(`[+] SSH ENCONTRADO EM: ${ip}`);
      socket.destroy();
      resolve(ip);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(null);
    });
    
    socket.connect(22, ip);
  });
}

async function run() {
  const openIps = [];
  const batchSize = 30; // testar 30 por vez
  
  for (let i = 1; i <= 254; i += batchSize) {
    const promises = [];
    for (let j = 0; j < batchSize && (i + j) <= 254; j++) {
      const ip = `192.168.1.${i + j}`;
      promises.push(checkIp(ip));
    }
    const results = await Promise.all(promises);
    results.forEach(res => {
      if (res) openIps.push(res);
    });
  }
  
  console.log('\n--- VARREDURA CONCLUÍDA ---');
  console.log('IPs com porta 22 aberta:', openIps);
}

run();
