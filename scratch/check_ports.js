const net = require('net');

const host = '192.168.1.70';
const ports = [22, 80, 8080, 8085, 3001, 5005];

async function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      console.log(`[OPEN] Port ${port} on ${host} is OPEN`);
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      console.log(`[TIMEOUT] Port ${port} on ${host} timed out`);
      socket.destroy();
      resolve(false);
    });
    socket.on('error', (err) => {
      console.log(`[CLOSED/REFUSED] Port ${port} on ${host}: ${err.code || err.message}`);
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function run() {
  console.log(`Checking ports on ${host}...`);
  for (const p of ports) {
    await checkPort(p);
  }
}

run();
