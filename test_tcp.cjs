const net = require('net');

console.log('Testando conexão pura TCP na porta 3050 (Firebird) no IP 192.168.1.7...');

const client = new net.Socket();
const timeout = 3000;

client.setTimeout(timeout);

client.connect(3050, '192.168.1.7', function() {
    console.log('✅ SUCESSO: A porta 3050 está ABERTA e aceitando conexões no servidor.');
    client.destroy();
});

client.on('timeout', function() {
    console.log('❌ TIMEOUT: O servidor não respondeu. Provavelmente o Firewall do Windows está bloqueando a porta ou o Firebird está desligado.');
    client.destroy();
});

client.on('error', function(err) {
    console.log('❌ ERRO:', err.message);
    if (err.code === 'ECONNREFUSED') {
        console.log('ECONNREFUSED significa que o computador foi encontrado, mas o serviço Firebird não está rodando na porta 3050.');
    }
    client.destroy();
});
