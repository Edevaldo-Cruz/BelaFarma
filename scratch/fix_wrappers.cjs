const { Client } = require('ssh2');

const conn = new Client();

console.log('Connecting to Raspberry Pi (192.168.1.70) to fix wrapper permissions...');

conn.on('ready', () => {
  console.log('SSH connection established successfully!');
  
  const cmd = `
    cd /home/ed/projects/BelaFarma &&
    git fetch origin main &&
    git reset --hard origin/main &&
    chmod 755 /home/ed/projects/BelaFarma/update-hardcore.sh &&
    
    # Criar wrapper permanente em /usr/local/bin e /usr/bin que roda via bash
    sudo tee /usr/local/bin/atualizar-bela /usr/local/bin/update-hardcore /usr/bin/atualizar-bela /usr/bin/update-hardcore > /dev/null << 'EOF'
#!/bin/bash
chmod 755 /home/ed/projects/BelaFarma/update-hardcore.sh 2>/dev/null || true
exec /bin/bash /home/ed/projects/BelaFarma/update-hardcore.sh "$@"
EOF

    sudo chmod 755 /usr/local/bin/atualizar-bela /usr/local/bin/update-hardcore /usr/bin/atualizar-bela /usr/bin/update-hardcore
    
    echo "Permissões e wrappers configurados com sucesso!"
  `;

  conn.exec(cmd, { pty: true }, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      return;
    }

    stream.on('close', (code, signal) => {
      console.log(`Wrapper setup finished with code ${code}`);
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
