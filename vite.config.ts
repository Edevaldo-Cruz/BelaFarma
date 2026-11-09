import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Obtém metadados de versão e git
let commitHash = 'unknown';
let commitMessage = 'Atualização do sistema';
let recentCommits: Array<{ hash: string; date: string; message: string }> = [];
const buildTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
  commitMessage = execSync('git log -1 --pretty=%s').toString().trim();
  const gitLogRaw = execSync('git log -n 12 --pretty=format:"%h|%ad|%s" --date=format:"%d/%m/%Y"').toString().trim();
  recentCommits = gitLogRaw.split('\n').filter(Boolean).map(line => {
    const [h, d, ...m] = line.replace(/^"/, '').replace(/"$/, '').split('|');
    return { hash: h ? h.trim() : '', date: d ? d.trim() : '', message: m.join('|').trim() };
  });
} catch (e) {
  console.warn('Não foi possível obter dados do git no vite.config:', e);
}

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = pkg.version || '1.2.0';

// Grava arquivo public/version.json e backend/public/version.json para auditoria e checagem remota
try {
  const versionPayload = JSON.stringify({
    version: appVersion,
    commitHash,
    commitMessage,
    buildTime,
    recentCommits
  }, null, 2);

  const publicDir = path.resolve(__dirname, 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'version.json'), versionPayload);

  const backendPublicDir = path.resolve(__dirname, 'backend/public');
  if (fs.existsSync(backendPublicDir)) {
    fs.writeFileSync(path.join(backendPublicDir, 'version.json'), versionPayload);
  }
} catch (e) {
  console.warn('Falha ao gerar version.json:', e);
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        __APP_VERSION__: JSON.stringify(appVersion),
        __COMMIT_HASH__: JSON.stringify(commitHash),
        __COMMIT_MESSAGE__: JSON.stringify(commitMessage),
        __BUILD_TIME__: JSON.stringify(buildTime),
        __RECENT_COMMITS__: JSON.stringify(recentCommits),
      },
      server: {
        port: 5173,
        host: '0.0.0.0',
        https: !process.env.TAURI_ENV_PLATFORM,
        proxy: {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
          '/uploads': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
        }
      },
      preview: {
        port: 4173,
        https: true,
        proxy: {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
          '/uploads': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
        }
      },
      plugins: [
        react(),
        ...(process.env.TAURI_ENV_PLATFORM ? [] : [basicSsl()])
      ],
      resolve: {
        alias: [
          { find: '@', replacement: path.resolve(__dirname, '.') },
          { find: /^react-aria\/(.*)$/, replacement: path.resolve(__dirname, 'node_modules/react-aria/dist/exports/$1.js') }
        ]
      }
    };
});

