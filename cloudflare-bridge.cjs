const http = require('http');
const dgram = require('dgram');
const { spawn } = require('child_process');
const path = require('path');

const TUNNEL_TOKEN = 'eyJhIjoiMjZkOTNmYzJjZDY3YWEzZTU3YzEwZjE2ZDMyOWRmZjMiLCJ0IjoiNzY3ZWFmZWYtYTMzYy00ZWQyLTg2NzgtYWZlNDBmYWVkOGNmIiwicyI6Ik5UaGhOVFUyT0dFdE4yTTFZaTAwT0RrNExXSmhNbVF0WVRZME5tSTJNakJqT0dJNSJ9';
const DNS_PORT = 1053;
const PROXY_PORT = 80;
const TARGET_PORT = 3001;

// 1. Servidor DNS Local (Resolve nginx-proxy-manager -> 127.0.0.1)
const dnsServer = dgram.createSocket('udp4');
const upstreamClient = dgram.createSocket('udp4');

dnsServer.on('message', (msg, rinfo) => {
  const queryStr = msg.toString('binary');
  if (queryStr.includes('nginx-proxy-manager')) {
    const tid = msg.subarray(0, 2);
    const flags = Buffer.from([0x81, 0x80]);
    const counts = Buffer.from([0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
    
    let idx = 12;
    while (idx < msg.length && msg[idx] !== 0) idx++;
    idx += 5;
    const question = msg.subarray(12, idx);
    const answer = Buffer.concat([
      Buffer.from([0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x04]),
      Buffer.from([127, 0, 0, 1])
    ]);
    const response = Buffer.concat([tid, flags, counts, question, answer]);
    dnsServer.send(response, rinfo.port, rinfo.address);
  } else {
    upstreamClient.send(msg, 53, '1.1.1.1', (err) => {
      if (err) return;
      const onResp = (upMsg) => {
        if (upMsg.subarray(0, 2).equals(msg.subarray(0, 2))) {
          upstreamClient.removeListener('message', onResp);
          dnsServer.send(upMsg, rinfo.port, rinfo.address);
        }
      };
      upstreamClient.on('message', onResp);
      setTimeout(() => upstreamClient.removeListener('message', onResp), 2000);
    });
  }
});

dnsServer.bind(DNS_PORT, '127.0.0.1', () => {
  console.log('[Bridge DNS] Resolvendo nginx-proxy-manager em 127.0.0.1:' + DNS_PORT);
});

// 2. Proxy Reverso HTTP (Porta 80 -> 3001)
const proxy = http.createServer((clientReq, clientRes) => {
  const options = {
    hostname: '127.0.0.1',
    port: TARGET_PORT,
    path: clientReq.url,
    method: clientReq.method,
    headers: clientReq.headers
  };

  const proxyReq = http.request(options, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[Bridge Proxy Error]: ' + err.message);
    clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
    clientRes.end('Gateway Error: ' + err.message);
  });

  clientReq.pipe(proxyReq, { end: true });
});

proxy.on('upgrade', (req, socket, head) => {
  const net = require('net');
  const targetSocket = net.connect(TARGET_PORT, '127.0.0.1', () => {
    targetSocket.write(head);
    socket.pipe(targetSocket);
    targetSocket.pipe(socket);
  });
  targetSocket.on('error', () => socket.destroy());
});

proxy.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log('[Bridge HTTP] Proxy ativo em 127.0.0.1:' + PROXY_PORT + ' -> 127.0.0.1:' + TARGET_PORT);
  startCloudflared();
});

// 3. Gerenciador do Processo cloudflared
let cloudflaredProc = null;
function startCloudflared() {
  const bin = path.join(__dirname, 'cloudflared.exe');
  const args = [
    'tunnel',
    'run',
    '--token', TUNNEL_TOKEN,
    '--dns-resolver-addrs', '127.0.0.1:' + DNS_PORT
  ];

  console.log('[Bridge Cloudflared] Iniciando túnel...');
  cloudflaredProc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  cloudflaredProc.stdout.on('data', d => {
    const s = d.toString();
    if (s.includes('Registered tunnel connection')) console.log('[Cloudflared] Conectado à rede Cloudflare!');
  });

  cloudflaredProc.stderr.on('data', d => {
    const s = d.toString();
    if (s.includes('Registered tunnel connection')) console.log('[Cloudflared] Conectado à rede Cloudflare!');
    if (s.includes('ERR')) console.error('[Cloudflared Error]: ' + s.trim());
  });

  cloudflaredProc.on('exit', (code) => {
    console.log('[Cloudflared] Encerrado com código ' + code + '. Reiniciando em 5s...');
    setTimeout(startCloudflared, 5000);
  });
}

process.on('SIGINT', () => {
  if (cloudflaredProc) cloudflaredProc.kill();
  process.exit(0);
});
