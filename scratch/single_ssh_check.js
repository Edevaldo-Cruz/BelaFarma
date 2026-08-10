const { execSync } = require('child_process');

const remoteScript = `
echo "=== DOCKER PS ==="
docker ps
echo "=== LISTING UPLOADS HOST ==="
ls -la /home/ed/projetcs/BelaFarma/uploads | head -n 15
echo "=== LISTING UPLOADS CONTAINER ==="
docker exec $(docker ps -q -f name=backend) ls -la /usr/src/app/uploads | head -n 15
`;

try {
  const out = execSync(`ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "${remoteScript.replace(/\n/g, '; ')}"`, { encoding: 'utf-8' });
  console.log(out);
} catch (e) {
  console.error('Erro:', e.message);
  if (e.stdout) console.log('STDOUT:', e.stdout);
  if (e.stderr) console.log('STDERR:', e.stderr);
}
