const net = require('net');

function checkPort(port, host) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    
    socket.connect(port, host, () => {
      resolve({ port, status: 'OPEN' });
      socket.destroy();
    });
    
    socket.on('timeout', () => {
      resolve({ port, status: 'TIMEOUT' });
      socket.destroy();
    });
    
    socket.on('error', (err) => {
      resolve({ port, status: 'CLOSED', error: err.message });
      socket.destroy();
    });
  });
}

async function run() {
  const host = '192.168.1.70';
  const ports = [22, 80, 443, 5005, 8080];
  console.log(`Verificando portas no IP ${host}...`);
  
  for (const port of ports) {
    const res = await checkPort(port, host);
    if (res.status === 'OPEN') {
      console.log(`✅ Porta ${res.port}: ABERTA`);
    } else {
      console.log(`❌ Porta ${res.port}: FECHADA (${res.status}) ${res.error || ''}`);
    }
  }
}

run();
