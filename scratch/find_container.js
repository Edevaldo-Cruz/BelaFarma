const { execSync } = require('child_process');

try {
  const containers = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "docker ps --format \\"{{.Names}}\\""', { encoding: 'utf-8' });
  console.log('Containers rodando:', containers.trim().split('\n'));
  
  const backendName = containers.split('\n').find(c => c.includes('backend'));
  if (backendName) {
    console.log(`Lendo logs de ${backendName.trim()}...`);
    const logs = execSync(`ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "docker logs --tail 50 ${backendName.trim()}"`, { encoding: 'utf-8' });
    console.log('--- ULTIMOS LOGS ---');
    console.log(logs);
  }
} catch (e) {
  console.error('Erro:', e.message);
  if (e.stdout) console.log('STDOUT:', e.stdout);
  if (e.stderr) console.log('STDERR:', e.stderr);
}
