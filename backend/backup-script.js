const fs = require('fs');
const path = require('path');
const { google } = require('googleapis'); // npm install googleapis

// CONFIGURAÇÃO
const DB_PATH = path.join(__dirname, 'database.db'); // Ajuste se seu banco tiver outro nome
const BACKUP_DIR = path.join(__dirname, 'backups');
const MAX_BACKUP_AGE_DAYS = 30;

// CONFIGURAÇÃO GOOGLE DRIVE (Opcional - Requer credenciais)
const DRIVE_CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const DRIVE_TOKEN_PATH = path.join(__dirname, 'token.json');
const DRIVE_FOLDER_ID = 'YOUR_GOOGLE_DRIVE_FOLDER_ID'; // Crie uma pasta no drive e pegue o ID da URL

// Função de Log
const log = (msg) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${msg}`);
};

// Função Principal
const performBackup = async () => {
  log('Iniciando processo de backup...');

  // 1. Verificar se o banco existe
  if (!fs.existsSync(DB_PATH)) {
    log(`ERRO: Arquivo de banco de dados não encontrado em: ${DB_PATH}`);
    return;
  }

  // 2. Criar diretório de backups se não existir
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    log(`Diretório de backups criado: ${BACKUP_DIR}`);
  }

  // 3. Gerar nome do arquivo com timestamp
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup_${timestamp}.db`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);

  // 4. Copiar arquivo localmente
  try {
    fs.copyFileSync(DB_PATH, backupFilePath);
    log(`Backup local criado com sucesso: ${backupFileName}`);
    
    // Upload para o Google Drive
    await uploadToDrive(backupFilePath, backupFileName);
    
    // Limpeza de backups antigos
    cleanupOldBackups();
    
  } catch (err) {
    log(`ERRO ao criar backup local: ${err.message}`);
  }
};

// Função para Upload no Google Drive
const uploadToDrive = async (filePath, fileName) => {
  if (!fs.existsSync(DRIVE_CREDENTIALS_PATH)) {
    log('AVISO: Arquivo credentials.json não encontrado. Upload para Google Drive ignorado.');
    return;
  }

  try {
    const auth = await authorize();
    const drive = google.drive({ version: 'v3', auth });
    
    const fileMetadata = {
      name: fileName,
      parents: [DRIVE_FOLDER_ID]
    };
    
    const media = {
      mimeType: 'application/x-sqlite3',
      body: fs.createReadStream(filePath)
    };

    const res = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id'
    });
    
    log(`Upload para Google Drive concluído. File ID: ${res.data.id}`);
  } catch (err) {
    log(`ERRO no upload para Google Drive: ${err.message}`);
  }
};

// Função de Autenticação Google (Simplificada)
// Requer token.json gerado previamente. Se não existir, precisaria de fluxo OAuth2 completo.
const authorize = async () => {
  const content = fs.readFileSync(DRIVE_CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(DRIVE_TOKEN_PATH)) {
    const token = fs.readFileSync(DRIVE_TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  } else {
    throw new Error('Arquivo token.json não encontrado. Execute o script de autorização primeiro.');
  }
};

// Função de Limpeza
const cleanupOldBackups = () => {
  log('Verificando backups antigos para limpeza...');
  
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const maxAgeMs = MAX_BACKUP_AGE_DAYS * 24 * 60 * 60 * 1000;
    
    let deletedCount = 0;
    
    files.forEach(file => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        deletedCount++;
        log(`Backup antigo removido: ${file}`);
      }
    });
    
    if (deletedCount === 0) log('Nenhum backup antigo para remover.');
    
  } catch (err) {
    log(`ERRO na limpeza de backups: ${err.message}`);
  }
};

// Executar
performBackup();
