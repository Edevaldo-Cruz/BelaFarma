const { execSync } = require('child_process');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8' });
  } catch (e) {
    return `[ERRO]: ${e.message}\nSTDOUT: ${e.stdout || ''}\nSTDERR: ${e.stderr || ''}`;
  }
}

console.log('=== LISTANDO /home/ed/projetcs/BelaFarma/uploads ===');
console.log(run('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "ls -la /home/ed/projetcs/BelaFarma/uploads"'));

console.log('=== LISTANDO CONTAINER /usr/src/app/uploads ===');
console.log(run('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "docker exec $(docker ps -q -f name=backend) ls -la /usr/src/app/uploads"'));

console.log('=== LISTANDO CONTAINER /usr/src/app/public/uploads ===');
console.log(run('ssh -o StrictHostKeyChecking=no ed@192.168.1.70 "docker exec $(docker ps -q -f name=backend) ls -la /usr/src/app/public/uploads"'));
