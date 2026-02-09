import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurações baseadas nos scripts existentes
const REMOTE_USER = 'ed';
const REMOTE_HOST = '192.168.1.9';
const REMOTE_PROJECT_PATH = '/home/ed/projects/BelaFarma';

// Possíveis locais do banco no servidor (baseado no DEPLOY.md e estrutura padrão)
const REMOTE_DB_PATHS = [
    `${REMOTE_PROJECT_PATH}/backend/belafarma.db`, // Padrão desenvolvimento/repositório
    `${REMOTE_PROJECT_PATH}/data/belafarma.db`     // Padrão DEPLOY.md
];

const BACKEND_DIR = path.join(__dirname, '../backend');
const LOCAL_DB_PATH = path.join(BACKEND_DIR, 'belafarma.db');
const LOCAL_WAL_PATH = path.join(BACKEND_DIR, 'belafarma.db-wal');
const LOCAL_SHM_PATH = path.join(BACKEND_DIR, 'belafarma.db-shm');

console.log('🚀 Iniciando sincronização do banco de produção...');

// 1. Verificar qual caminho remoto existe
console.log('🔍 Verificando localização do banco no servidor...');
let validRemotePath = null;

for (const p of REMOTE_DB_PATHS) {
    try {
        console.log(`   Checando: ${p}`);
        // Tenta listar o arquivo. Se falhar (exit code != 0), entra no catch.
        execSync(`ssh ${REMOTE_USER}@${REMOTE_HOST} "ls ${p}"`, { stdio: 'pipe' });
        validRemotePath = p;
        console.log(`   ✅ Encontrado!`);
        break;
    } catch (e) {
        // console.log(`   ❌ Não encontrado em: ${p}`);
    }
}

if (!validRemotePath) {
    console.error('❌ Não foi possível encontrar o banco de dados no servidor nos caminhos esperados.');
    console.error(`Tentados: \n${REMOTE_DB_PATHS.join('\n')}`);
    process.exit(1);
}

// 2. Backup Local
if (fs.existsSync(LOCAL_DB_PATH)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = path.join(BACKEND_DIR, `belafarma.db.pre-sync.${timestamp}.bak`);
    console.log(`📦 Criando backup local de segurança em:\n   ${backupName}`);
    fs.copyFileSync(LOCAL_DB_PATH, backupName);
}

// 3. Limpar arquivos temporários (WAL/SHM) para evitar corrupção
console.log('🧹 Limpando arquivos temporários locais (WAL/SHM)...');
try {
    if (fs.existsSync(LOCAL_WAL_PATH)) fs.unlinkSync(LOCAL_WAL_PATH);
    if (fs.existsSync(LOCAL_SHM_PATH)) fs.unlinkSync(LOCAL_SHM_PATH);
} catch (e) {
    console.warn('⚠️ Aviso ao limpar arquivos temporários:', e.message);
}

// 4. Copiar do Servidor
console.log(`⬇️ Baixando banco de dados de: ${REMOTE_HOST}...`);
console.log(`   Origem: ${validRemotePath}`);
console.log(`   Destino: ${LOCAL_DB_PATH}`);

try {
    execSync(`scp ${REMOTE_USER}@${REMOTE_HOST}:${validRemotePath} "${LOCAL_DB_PATH}"`, { stdio: 'inherit' });
    console.log('✅ Banco de dados baixado com sucesso!');
    console.log('\n⚠️ IMPORTANTE: Reinicie seu servidor backend local para carregar os novos dados.');
} catch (e) {
    console.error('❌ Erro ao baixar o arquivo:', e.message);
    process.exit(1);
}
