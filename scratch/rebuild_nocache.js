const { execSync } = require('child_process');

try {
  console.log('=== REBUILD COM --no-cache NA RASPBERRY PI ===');
  const pull = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "cd /home/ed/projetcs/BelaFarma && git fetch origin && git reset --hard origin/main"', { encoding: 'utf-8' });
  console.log('Git Pull:', pull);

  const rebuild = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "cd /home/ed/projetcs/BelaFarma && docker-compose build --no-cache backend && docker-compose up -d backend"', { encoding: 'utf-8' });
  console.log('Rebuild Output:', rebuild);

  console.log('=== REBUILD FINALIZADO ===');
} catch (e) {
  console.error('Erro:', e.message);
  if (e.stdout) console.log('STDOUT:', e.stdout);
  if (e.stderr) console.log('STDERR:', e.stderr);
}
