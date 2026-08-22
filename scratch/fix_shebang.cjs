const { Client } = require('ssh2');

const conn = new Client();

console.log('Connecting to Raspberry Pi (192.168.1.70) to fix the shebang line endings...');

conn.on('ready', () => {
  console.log('SSH connection established successfully!');
  
  // We write the script with pure Unix newlines (\n)
  const scriptContent = `#!/bin/bash
set -e

echo "====================================================="
echo " ⚡ ATUALIZAÇÃO RÁPIDA & FORÇADA (BelaFarma VPS) ⚡"
echo "====================================================="

cd /home/ed/projects/BelaFarma

echo "1. Sincronizando código com a branch main do GitHub..."
git fetch origin main
git reset --hard origin/main

echo "2. Parando containers anteriores..."
sudo docker-compose down --remove-orphans

echo "3. Recompilando containers (Frontend + Backend)..."
sudo docker-compose build

echo "4. Iniciando novos containers..."
sudo docker-compose up -d --force-recreate

echo "5. Limpeza de imagens antigas..."
sudo docker image prune -f > /dev/null 2>&1 || true

echo "====================================================="
echo " ✅ ATUALIZAÇÃO CONCLUÍDA COM SUCESSO! (Containers UP)"
echo "====================================================="
sudo docker-compose ps
`;

  // We send the script directly and write to both destinations with chmod 755
  const cmd = `
    sudo rm -f /usr/local/bin/update-hardcore /usr/local/bin/atualizar-bela /usr/bin/update-hardcore /usr/bin/atualizar-bela
    cat << 'EOF' | sudo tee /usr/local/bin/update-hardcore /usr/local/bin/atualizar-bela /usr/bin/update-hardcore /usr/bin/atualizar-bela /home/ed/projects/BelaFarma/update-hardcore.sh > /dev/null
${scriptContent}
EOF
    sudo sed -i 's/\\r$//' /usr/local/bin/update-hardcore /usr/local/bin/atualizar-bela /usr/bin/update-hardcore /usr/bin/atualizar-bela /home/ed/projects/BelaFarma/update-hardcore.sh
    sudo chmod 755 /usr/local/bin/update-hardcore /usr/local/bin/atualizar-bela /usr/bin/update-hardcore /usr/bin/atualizar-bela /home/ed/projects/BelaFarma/update-hardcore.sh
    sudo chown ed:ed /home/ed/projects/BelaFarma/update-hardcore.sh
    echo "Scripts configurados com formato Unix puro (LF) e permissão 755!"
    
    # Testar a localização e permissões
    ls -l /usr/local/bin/update-hardcore /usr/local/bin/atualizar-bela
    file /usr/local/bin/update-hardcore
  `;

  conn.exec(cmd, { pty: true }, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      return;
    }

    stream.on('close', (code, signal) => {
      console.log(`Fix finished with exit code ${code}`);
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
