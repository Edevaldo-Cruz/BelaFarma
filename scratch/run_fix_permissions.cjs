const { Client } = require('ssh2');

const conn = new Client();

console.log('Connecting to Raspberry Pi (192.168.1.70) to fix CRLF and run hardcore update...');

conn.on('ready', () => {
  console.log('SSH connection established successfully!');
  
  const cmd = `
    cd /home/ed/projects/BelaFarma &&
    echo "1. Corrigindo quebras de linha CRLF para LF..." &&
    sed -i 's/\\r$//' update-hardcore.sh &&
    chmod +x update-hardcore.sh &&
    sudo ln -sf /home/ed/projects/BelaFarma/update-hardcore.sh /usr/local/bin/atualizar-bela &&
    sudo ln -sf /home/ed/projects/BelaFarma/update-hardcore.sh /usr/local/bin/update-hardcore &&
    echo "2. Executando o script update-hardcore.sh..." &&
    ./update-hardcore.sh
  `;

  conn.exec(cmd, { pty: true }, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      return;
    }

    stream.on('close', (code, signal) => {
      console.log(`\n--- Hardcore update finished with exit code ${code} ---`);
      conn.end();
    });

    stream.on('data', (data) => {
      process.stdout.write(data.toString());
    });

    stream.stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection error:', err.message);
}).connect({
  host: '192.168.1.70',
  port: 22,
  username: 'ed',
  password: '2494'
});
