const { Client } = require('ssh2');

const conn = new Client();

const commands = [
  'cd ~/projects/BelaFarma 2>/dev/null || cd /home/ed/projetcs/BelaFarma 2>/dev/null',
  'pwd',
  'git fetch origin',
  'git reset --hard origin/main',
  'echo 2494 | sudo -S docker-compose down',
  'echo 2494 | sudo -S docker-compose build',
  'echo 2494 | sudo -S docker-compose up -d',
  'echo 2494 | sudo -S docker-compose ps'
].join(' && ');

console.log('🚀 Conectando ao servidor 192.168.1.70 via SSH para executar Deploy com sudo...');

conn.on('ready', () => {
  console.log('✅ Conexão SSH estabelecida. Executando comandos de deploy...\n');
  conn.exec(commands, (err, stream) => {
    if (err) {
      console.error('❌ Erro na execução:', err.message);
      conn.end();
      return;
    }
    stream.on('close', (code, signal) => {
      console.log(`\n🎉 Deploy finalizado com código de saída: ${code}`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('❌ Erro de Conexão SSH:', err.message);
}).connect({
  host: '192.168.1.70',
  port: 22,
  username: 'ed',
  password: '2494'
});
