const { execSync } = require('child_process');

try {
  console.log('=== LOGS DO BACKEND EM PRODUÇÃO ===');
  const logs = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "docker logs --tail 40 $(docker ps -q -f name=backend)"', { encoding: 'utf-8' });
  console.log(logs);
} catch (err) {
  console.error('Erro ao ler logs:', err.message);
  if (err.stdout) console.log('STDOUT:', err.stdout);
  if (err.stderr) console.log('STDERR:', err.stderr);
}
