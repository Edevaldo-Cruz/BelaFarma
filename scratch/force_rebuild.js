const { execSync } = require('child_process');

try {
  console.log('=== VERIFICANDO GIT E ARQUIVOS NA VPS ===');
  const gitStatus = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "cd /home/ed/projetcs/BelaFarma && git status"', { encoding: 'utf-8' });
  console.log(gitStatus);

  console.log('=== FORÇANDO GIT PULL E REBUILD ===');
  const gitPull = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "cd /home/ed/projetcs/BelaFarma && git fetch origin && git reset --hard origin/main"', { encoding: 'utf-8' });
  console.log(gitPull);

  console.log('=== REBUILD CONTAINER ===');
  const rebuild = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "cd /home/ed/projetcs/BelaFarma && docker-compose build backend && docker-compose up -d backend"', { encoding: 'utf-8' });
  console.log(rebuild);

} catch (e) {
  console.error('Erro:', e.message);
  if (e.stdout) console.log('STDOUT:', e.stdout);
  if (e.stderr) console.log('STDERR:', e.stderr);
}
