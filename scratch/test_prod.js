const { execSync } = require('child_process');

try {
  console.log('=== DOCKER PS ===');
  const ps = execSync('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "docker ps"', { encoding: 'utf-8' });
  console.log(ps);

  console.log('=== DISPARANDO POSTAR STATUS DIÁRIO EM PRODUÇÃO ===');
  const cmd = `ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "docker exec $(docker ps -q -f name=backend) node -e \\"const { postarStatusDiario } = require('./services/whatsapp-status.service.js'); postarStatusDiario();\\""`;
  const result = execSync(cmd, { encoding: 'utf-8' });
  console.log('Resultado:', result);

} catch (err) {
  console.error('Erro ao executar:', err.message);
  if (err.stdout) console.log('STDOUT:', err.stdout);
  if (err.stderr) console.log('STDERR:', err.stderr);
}
