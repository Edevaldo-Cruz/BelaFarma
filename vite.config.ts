import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Obtém metadados de versão e git
let commitHash = 'unknown';
let commitMessage = 'Atualização do sistema';
const buildTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
  commitMessage = execSync('git log -1 --pretty=%s').toString().trim();
} catch (e) {
  console.warn('Não foi possível obter dados do git no vite.config:', e);
}

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = pkg.version || '1.1.0';

// Grava arquivo public/version.json para auditoria e checagem remota
try {
  const publicDir = path.resolve(__dirname, 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(
    path.join(publicDir, 'version.json'),
    JSON.stringify({
      version: appVersion,
      commitHash,
      commitMessage,
      buildTime
    }, null, 2)
  );
} catch (e) {
  console.warn('Falha ao gerar public/version.json:', e);
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        __APP_VERSION__: JSON.stringify(appVersion),
        __COMMIT_HASH__: JSON.stringify(commitHash),
        __COMMIT_MESSAGE__: JSON.stringify(commitMessage),
        __BUILD_TIME__: JSON.stringify(buildTime),
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
        ...(process.env.TAURI_ENV_PLATFORM ? [] : [basicSsl()]),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.ico', 'pwa-192x192.png', 'pwa-512x512.png'],
          workbox: {
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
          },
          manifest: {
            name: 'Belinha',
            short_name: 'Belinha',
            description: 'Gestão Inteligente para Farmácias',
            theme_color: '#ffffff',
            background_color: '#ffffff',
            display: 'standalone',
            icons: [
              {
                src: 'pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any maskable'
              },
              {
                src: 'pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              }
            ]
          }
        })
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

