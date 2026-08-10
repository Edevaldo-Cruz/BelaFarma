const { execSync } = require('child_process');

console.log('=== VERIFICANDO VPS (192.168.1.70) ===');
try {
  const commit = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "cd /home/ed/projetcs/BelaFarma && git log -n 1 --oneline"', { encoding: 'utf-8' });
  console.log('Ultimo Commit na VPS:', commit);

  const status = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "cd /home/ed/projetcs/BelaFarma && git status"', { encoding: 'utf-8' });
  console.log('Git Status na VPS:\n', status);

  const containers = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "docker ps"', { encoding: 'utf-8' });
  console.log('Containers Ativos:\n', containers);

  const distIndex = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "cd /home/ed/projetcs/BelaFarma && head -n 25 dist/index.html"', { encoding: 'utf-8' });
  console.log('Conteudo dist/index.html na VPS:\n', distIndex);
} catch (e) {
  console.error('Erro ao verificar:', e.message);
  if (e.stdout) console.log('STDOUT:', e.stdout);
  if (e.stderr) console.log('STDERR:', e.stderr);
}
