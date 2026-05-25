const fs = require('fs');
const path = require('path');

const sessionDir = path.resolve(__dirname, '../whatsapp-session-rpa');
console.log(`Limpando completamente a pasta de sessão corrompida: ${sessionDir}`);

function deleteFolderRecursive(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file) => {
      const curPath = path.join(directoryPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // Recursivo
        deleteFolderRecursive(curPath);
      } else {
        // Deleta arquivo
        try {
          fs.unlinkSync(curPath);
        } catch (e) {
          console.warn(`Não foi possível deletar arquivo ${curPath}:`, e.message);
        }
      }
    });
    try {
      fs.rmdirSync(directoryPath);
    } catch (e) {
      console.warn(`Não foi possível remover diretório ${directoryPath}:`, e.message);
    }
  }
}

if (fs.existsSync(sessionDir)) {
  try {
    deleteFolderRecursive(sessionDir);
    console.log('✅ Pasta de sessão limpa e removida com sucesso!');
  } catch (err) {
    console.error('⚠️ Erro ao tentar limpar a pasta de sessão:', err.message);
  }
} else {
  console.log('A pasta de sessão já está vazia ou não existe.');
}
