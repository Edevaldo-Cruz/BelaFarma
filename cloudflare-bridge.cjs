/**
 * cloudflare-bridge.cjs
 * Ponte resiliente do Cloudflare Tunnel para Windows.
 * 
 * Funcionalidade:
 * 1. Servidor DNS UDP em 127.0.0.1:1053 que resolve 'nginx-proxy-manager' para 127.0.0.1
 *    (permitindo que o Cloudflare Tunnel encaminhe o tráfego diretamente para o servidor local sem precisar alterar o hosts).
 * 2. Proxy HTTP local em 127.0.0.1:8088 -> 127.0.0.1:3001 como rota auxiliar.
 * 3. Inicia e monitora o cloudflared.exe com --dns-resolver-addrs 127.0.0.1:1053.
 */

const http = require('http');
const net = require('net');
const dgram = require('dgram');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TUNNEL_TOKEN = 'eyJhIjoiMjZkOTNmYzJjZDY3YWEzZTU3YzEwZjE2ZDMyOWRmZjMiLCJ0IjoiNzY3ZWFmZWYtYTMzYy00ZWQyLTg2NzgtYWZlNDBmYWVkOGNmIiwicyI6Ik5UaGhOVFUyT0dFdE4yTTFZaTAwT0RrNExXSmhNbVF0WVRZME5tSTJNakJqT0dJNSJ9';
const DNS_PORT = 1053;
const PROXY_PORT = 8088;
const TARGET_PORT = 3001;

// 1. Servidor DNS Local (Resolve nginx-proxy-manager -> 127.0.0.1)
const dnsServer = dgram.createSocket('udp4');

dnsServer.on('message', (msg, rinfo) => {
  const queryStr = msg.toString('binary');
  console.log(`[Bridge DNS] Consulta recebida (${msg.length} bytes) de ${rinfo.address}:${rinfo.port}`);
  if (queryStr.includes('nginx-proxy-manager')) {
    console.log('[Bridge DNS] -> Respondendo 127.0.0.1 para nginx-proxy-manager');
    // Monta resposta A para 127.0.0.1
    const tid = msg.subarray(0, 2);
    const flags = Buffer.from([0x81, 0x80]);
    const counts = Buffer.from([0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
    
    let idx = 12;
    while (idx < msg.length && msg[idx] !== 0) idx++;
    idx += 5; // termina qtype e qclass
    const question = msg.subarray(12, idx);
    const answer = Buffer.concat([
      Buffer.from([0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x04]),
      Buffer.from([127, 0, 0, 1])
    ]);
    const response = Buffer.concat([tid, flags, counts, question, answer]);
    dnsServer.send(response, rinfo.port, rinfo.address);
  } else {
    // Encaminha de forma resiliente para 1.1.1.1 com fallback para 8.8.8.8 usando socket isolado
    const client = dgram.createSocket('udp4');
    let closed = false;
    const safeClose = () => {
      if (!closed) {
        closed = true;
        try { client.close(); } catch (_) {}
      }
    };
    client.on('message', (upMsg) => {
      try {
        dnsServer.send(upMsg, rinfo.port, rinfo.address);
      } catch (_) {}
      safeClose();
    });
    client.on('error', safeClose);
    client.send(msg, 53, '1.1.1.1', (err) => {
      if (err) {
        client.send(msg, 53, '8.8.8.8', (err2) => {
          if (err2) safeClose();
        });
      }
    });
    setTimeout(safeClose, 3000);
  }
});

dnsServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('[Cloudflare Bridge] Outra instância já está ativa na porta DNS ' + DNS_PORT + '. Encerrando duplicata.');
    process.exit(0);
  }
  console.warn('[Bridge DNS Warning]:', err.message);
});

dnsServer.bind(DNS_PORT, '127.0.0.1', () => {
  console.log(`[Bridge DNS] Resolvendo nginx-proxy-manager em 127.0.0.1:${DNS_PORT}`);
});

// 2. Proxy HTTP Local Auxiliar (Porta 8088 -> 3001)
const proxy = http.createServer((req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers
  };

  const forwardReq = http.request(options, (forwardRes) => {
    res.writeHead(forwardRes.statusCode, forwardRes.headers);
    forwardRes.pipe(res);
  });

  forwardReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway (BelaFarma Backend offline: ' + err.message + ')');
  });

  req.pipe(forwardReq);
});

proxy.on('upgrade', (req, socket, head) => {
  const targetSocket = net.connect(TARGET_PORT, '127.0.0.1', () => {
    targetSocket.write(head);
    socket.pipe(targetSocket);
    targetSocket.pipe(socket);
  });
  targetSocket.on('error', () => socket.destroy());
});

proxy.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('[Cloudflare Bridge] Porta ' + PROXY_PORT + ' em uso.');
  } else {
    console.error('[Cloudflare Bridge Proxy Error]:', err.message);
  }
});

proxy.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log('[Cloudflare Bridge] Proxy HTTP local ativo em 127.0.0.1:' + PROXY_PORT + ' -> 127.0.0.1:' + TARGET_PORT);
});

// 3. Gerenciador do Processo cloudflared
let cloudflaredProc = null;
let isShuttingDown = false;

function startCloudflared() {
  if (isShuttingDown) return;

  const bin = path.join(__dirname, 'cloudflared.exe');
  if (!fs.existsSync(bin)) {
    console.error('[Cloudflare Bridge] cloudflared.exe não encontrado em: ' + bin);
    return;
  }

  const args = [
    '--edge-ip-version', '4',
    'tunnel',
    'run',
    '--token', TUNNEL_TOKEN,
    '--dns-resolver-addrs', '127.0.0.1:1053'
  ];

  console.log('[Cloudflare Bridge] Iniciando túnel Cloudflare com DNS local e IPv4...');
  const env = Object.assign({}, process.env, {
    GODEBUG: 'netdns=go'
  });
  cloudflaredProc = spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });

  cloudflaredProc.stdout.on('data', d => {
    const s = d.toString();
    console.log('[Cloudflared STDOUT]:', s.trim());
  });

  cloudflaredProc.stderr.on('data', d => {
    const s = d.toString();
    console.log('[Cloudflared STDERR]:', s.trim());
  });

  cloudflaredProc.on('exit', (code) => {
    if (isShuttingDown) return;
    console.warn('[Cloudflare Bridge] Processo cloudflared encerrou (código ' + code + '). Reiniciando em 5s...');
    setTimeout(startCloudflared, 5000);
  });
}

startCloudflared();

function shutdown() {
  isShuttingDown = true;
  try { dnsServer.close(); } catch (_) {}
  try { proxy.close(); } catch (_) {}
  if (cloudflaredProc) {
    try { cloudflaredProc.kill(); } catch (_) {}
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
