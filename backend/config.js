
const path = require('path');
const fs = require('fs');

// Configuração centralizada de caminhos
const isProduction = !!process.env.DB_PATH;

// Caminho do Banco de Dados
let dbPath = process.env.DB_PATH;
if (!dbPath) {
  const localDataDir = path.join(__dirname, '..', 'data');
  if (fs.existsSync(localDataDir)) {
    dbPath = path.join(localDataDir, 'belafarma.db');
  } else {
    dbPath = path.join(__dirname, 'belafarma.db');
  }
}

// Caminho de Backups
let backupDir;
if (isProduction) {
    // No Docker, os dados ficam em /usr/src/app/data
    backupDir = path.join(path.dirname(dbPath), 'backups');
} else {
    // Localmente, usamos a pasta data/backups ou backups_dev
    const localDataDir = path.join(__dirname, '..', 'data');
    if (fs.existsSync(localDataDir)) {
        backupDir = path.join(localDataDir, 'backups');
    } else {
        backupDir = path.join(__dirname, '..', 'backups_dev');
    }
}

// Garante que os diretórios existem
[path.dirname(dbPath), backupDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

module.exports = {
    isProduction,
    dbPath,
    backupDir,
    log: () => {
        console.log(`[Config] Ambiente: ${isProduction ? 'PRODUÇÃO (Docker)' : 'DESENVOLVIMENTO (Local)'}`);
        console.log(`[Config] Banco de Dados: ${dbPath}`);
        console.log(`[Config] Backups: ${backupDir}`);
    }
};
