const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'backend.log');

function readTail() {
  console.log('--- LENDO ÚLTIMAS 100 LINHAS DE backend.log ---');
  try {
    const data = fs.readFileSync(logPath, 'utf8');
    const lines = data.split('\n');
    const lastLines = lines.slice(-100);
    console.log(lastLines.join('\n'));
  } catch (err) {
    console.error('Erro ao ler backend.log:', err.message);
  }
}

readTail();
