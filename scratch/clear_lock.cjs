const fs = require('fs');
const path = require('path');

const sessionDir = path.resolve(__dirname, '../whatsapp-session-rpa');
console.log(`Verificando locks na pasta de sessão: ${sessionDir}`);

if (fs.existsSync(sessionDir)) {
  const files = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  let deletedCount = 0;
  
  files.forEach(file => {
    const filePath = path.join(sessionDir, file);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`✅ Arquivo de Lock removido com sucesso: ${file}`);
        deletedCount++;
      } catch (err) {
        console.warn(`⚠️ Não foi possível remover ${file}:`, err.message);
      }
    }
  });

  // Também verifica dentro da subpasta Default se houver
  const defaultDir = path.join(sessionDir, 'Default');
  if (fs.existsSync(defaultDir)) {
    const lockFiles = ['Lock', 'lockfile'];
    lockFiles.forEach(file => {
      const filePath = path.join(defaultDir, file);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`✅ Arquivo de Lock removido na pasta Default: ${file}`);
          deletedCount++;
        } catch (err) {
          console.warn(`⚠️ Não foi possível remover ${file} da pasta Default:`, err.message);
        }
      }
    });
  }

  if (deletedCount === 0) {
    console.log('Nenhum arquivo de lock do Chrome foi encontrado.');
  }
} else {
  console.log('A pasta de sessão não existe ainda.');
}
