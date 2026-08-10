const { execSync } = require('child_process');

console.log('=== INICIANDO FORCE DEPLOY NO SERVIDOR (192.168.1.70) ===');

try {
  console.log('1. Git pull origin main...');
  const pull = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "cd /home/ed/projetcs/BelaFarma && git pull origin main"', { encoding: 'utf-8' });
  console.log('Git Pull Output:\n', pull);

  console.log('2. Reconstruindo container frontend com --no-cache...');
  const rebuild = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "cd /home/ed/projetcs/BelaFarma && docker-compose build --no-cache frontend && docker-compose up -d --force-recreate frontend backend"', { encoding: 'utf-8' });
  console.log('Docker Output:\n', rebuild);

  console.log('=== FORCE DEPLOY CONCLUÍDO COM SUCESSO! ===');
} catch (err) {
  console.error('ERRO NO DEPLOY:', err.message);
  if (err.stdout) console.log('STDOUT:', err.stdout);
  if (err.stderr) console.log('STDERR:', err.stderr);
}
