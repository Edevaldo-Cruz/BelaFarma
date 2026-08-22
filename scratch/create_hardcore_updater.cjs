const { Client } = require('ssh2');

const conn = new Client();

console.log('Connecting to Raspberry Pi (192.168.1.70)...');

conn.on('ready', () => {
  console.log('SSH connection established successfully!');
  
  const setupScriptCommand = `
cat << 'EOF' > /home/ed/projects/BelaFarma/update-hardcore.sh
#!/bin/bash
set -e

echo "====================================================="
echo " 🔥 INICIANDO ATUALIZAÇÃO HARDCORE (BelaFarma VPS) 🔥"
echo "====================================================="

cd /home/ed/projects/BelaFarma

echo "1. Limpando alterações locais e forçando sincronização com GitHub (main)..."
git fetch origin main
git reset --hard origin/main
git clean -fd

echo "2. Parando todos os containers e removendo órfãos..."
sudo docker-compose down --remove-orphans

echo "3. Reconstruindo imagens SEM USAR CACHE (--no-cache)..."
sudo docker-compose build --no-cache

echo "4. Subindo os containers forçando recriação (--force-recreate)..."
sudo docker-compose up -d --force-recreate

echo "5. Limpando imagens antigas e não utilizadas do Docker..."
sudo docker image prune -f

echo "====================================================="
echo " ✅ ATUALIZAÇÃO HARDCORE CONCLUÍDA COM SUCESSO!      "
echo "====================================================="
sudo docker-compose ps
EOF

chmod +x /home/ed/projects/BelaFarma/update-hardcore.sh

# Criar alias/atalho global no sistema para facilitar execução digitando apenas 'atualizar-bela'
sudo ln -sf /home/ed/projects/BelaFarma/update-hardcore.sh /usr/local/bin/atualizar-bela
sudo ln -sf /home/ed/projects/BelaFarma/update-hardcore.sh /usr/local/bin/update-hardcore

echo "Script criado com sucesso em /home/ed/projects/BelaFarma/update-hardcore.sh e atalho 'atualizar-bela' configurado!"
`;

  conn.exec(setupScriptCommand, { pty: true }, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      return;
    }

    stream.on('close', (code, signal) => {
      console.log(`Setup finished with exit code ${code}`);
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
