const http = require('http');
const dns = require('dns');
const os = require('os');

console.log('=== NETWORK DIAGNOSTICS ===');
console.log('Host Platform:', process.platform);
console.log('Network Interfaces:');
const interfaces = os.networkInterfaces();
for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
        if (net.family === 'IPv4') {
            console.log(`  - ${name}: ${net.address}`);
        }
    }
}

const targets = [
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://192.168.1.10:8080',
    'http://192.168.1.70:8080',
    'http://192.168.1.12:8080',
];

async function checkTarget(url) {
    try {
        console.log(`Checking ${url}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const res = await fetch(url + '/', { 
            signal: controller.signal,
            headers: { 'apikey': 'BelafarmaSul2026' }
        });
        clearTimeout(timeoutId);
        console.log(`  -> Response status: ${res.status}`);
        const text = await res.text();
        console.log(`  -> Response text: ${text.substring(0, 100)}`);
        return true;
    } catch (e) {
        console.log(`  -> Failed: ${e.message}`);
        return false;
    }
}

async function run() {
    for (const target of targets) {
        await checkTarget(target);
    }
}

run();
