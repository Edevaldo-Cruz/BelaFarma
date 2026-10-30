/**
 * cloudflare-bridge.cjs
 * Ponte resiliente do Cloudflare Tunnel para Windows.
 * 
 * Funcionalidade:
 * 1. Sobe um proxy HTTP local em 127.0.0.1:8088 que redireciona qualquer requisi??o
 *    de origem (ex: nginx-proxy-manager) diretamente para o backend na porta 3001.
 * 2. Suporta WebSockets (upgrade) para notifica??es em tempo real.
 * 3. Inicia o cloudflared.exe com HTTP_PROXY configurado para o proxy local.
 * 4. Monitora e reinicia o processo automaticamente se cair.
 */

const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TUNNEL_TOKEN = 'eyJhIjoiMjZkOTNmYzJjZDY3YWEzZTU3YzEwZjE2ZDMyOWRmZjMiLCJ0IjoiNzY3ZWFmZWYtYTMzYy00ZWQyLTg2NzgtYWZlNDBmYWVkOGNmIiwicyI6Ik5UaGhOVFUyT0dFdE4yTTFZaTAwT0RrNExXSmhNbVF0WVRZME5tSTJNakJqT0dJNSJ9';
const PROXY_PORT = 8088;
const TARGET_PORT = 3001;

// 1. Proxy HTTP Local (Resolve o nome virtual nginx-proxy-manager sem precisar de admin/hosts)
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

// Suporte a WebSocket
proxy.on('upgrade', (req, socket, head) => {
  const targetSocket = net.connect(TARGET_PORT, '127.0.0.1', () => {
    targetSocket.write(head);
    socket.pipe(targetSocket);
    targetSocket.pipe(socket);
  });
  targetSocket.on('error', () => socket.destroy());
});

// Suporte a CONNECT tunneling
proxy.on('connect', (req, clientSocket, head) => {
  const targetSocket = net.connect(TARGET_PORT, '127.0.0.1', () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    targetSocket.write(head);
    targetSocket.pipe(clientSocket);
    clientSocket.pipe(targetSocket);
  });
  targetSocket.on('error', () => {
    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    clientSocket.end();
  });
});

proxy.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('[Cloudflare Bridge] ?? Ponte j? em execu??o na porta ' + PROXY_PORT + '. Mantendo inst?ncia existente.');
    process.exit(0);
  } else {
    console.error('[Cloudflare Bridge Error]:', err.message);
  }
});

proxy.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log('[Cloudflare Bridge] ?? Proxy HTTP local ativo em 127.0.0.1:' + PROXY_PORT + ' -> 127.0.0.1:' + TARGET_PORT);
  startCloudflared();
});

// 2. Gerenciador do Processo cloudflared
let cloudflaredProc = null;
let isShuttingDown = false;

function startCloudflared() {
  if (isShuttingDown) return;

  const bin = path.join(__dirname, 'cloudflared.exe');
  if (!fs.existsSync(bin)) {
    console.error('[Cloudflare Bridge] ? Execut?vel cloudflared.exe n?o encontrado em: ' + bin);
    return;
  }

  const args = [
    'tunnel',
    'run',
    '--token', TUNNEL_TOKEN
  ];

  const env = Object.assign({}, process.env, {
    HTTP_PROXY: 'http://127.0.0.1:' + PROXY_PORT,
    http_proxy: 'http://127.0.0.1:' + PROXY_PORT
  });

  console.log('[Cloudflare Bridge] ?? Iniciando t?nel Cloudflare via proxy...');
  cloudflaredProc = spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });

  cloudflaredProc.stdout.on('data', d => {
    const s = d.toString();
    if (s.includes('Registered tunnel connection')) {
      console.log('[Cloudflare Bridge] ? Conectado ? rede Cloudflare com sucesso!');
    }
  });

  cloudflaredProc.stderr.on('data', d => {
    const s = d.toString();
    if (s.includes('Registered tunnel connection')) {
      console.log('[Cloudflare Bridge] ? Conectado ? rede Cloudflare com sucesso!');
    }
    if (s.includes('ERR')) {
      console.error('[Cloudflare Bridge Warning]:', s.trim());
    }
  });

  cloudflaredProc.on('exit', (code) => {
    if (isShuttingDown) return;
    console.warn('[Cloudflare Bridge] ?? Processo cloudflared encerrou (c?digo ' + code + '). Reiniciando em 5s...');
    setTimeout(startCloudflared, 5000);
  });
}

function shutdown() {
  isShuttingDown = true;
  if (cloudflaredProc) {
    try { cloudflaredProc.kill(); } catch (_) {}
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
