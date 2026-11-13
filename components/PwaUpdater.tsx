import React, { useEffect } from 'react';

export function PwaUpdater() {
  useEffect(() => {
    // 1. Destrava qualquer usuário que tenha ficado preso no PDV via localStorage na raiz
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      const path = window.location.pathname.toLowerCase();
      const search = window.location.search.toLowerCase();
      const isExplicitPdv = path.startsWith('/pdv') || hash.includes('pdv') || search.includes('pdv');

      if (!isExplicitPdv) {
        const savedView = localStorage.getItem('belinha_current_view');
        if (savedView === 'belinha-pdv') {
          console.log('[PWA] Destravando rota: belinha-pdv removido do localStorage fora da rota de PDV.');
          localStorage.setItem('belinha_current_view', 'dashboard');
        }
      }
    }

    // 2. Desregistra qualquer Service Worker ativo no navegador
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const registration of registrations) {
          registration.unregister().then(unregistered => {
            if (unregistered) {
              console.log('[PWA] Service Worker desregistrado para funcionamento padrão direto.');
            }
          });
        }
      }).catch(err => {
        console.warn('[PWA] Erro ao desregistrar Service Worker:', err);
      });
    }

    // 3. Limpa todos os caches do CacheStorage do navegador (workbox-precache, etc.)
    if (typeof window !== 'undefined' && 'caches' in window) {
      caches.keys().then(keys => {
        for (const key of keys) {
          caches.delete(key).then(() => {
            console.log(`[PWA] Cache ${key} removido.`);
          });
        }
      }).catch(err => {
        console.warn('[PWA] Erro ao limpar caches:', err);
      });
    }

    // 4. Checagem ativa de nova versão para forçar atualização automática
    if (typeof window !== 'undefined') {
      const checkServerVersion = async () => {
        try {
          const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            const serverHash = data.commitHash;
            const lastLoadedHash = sessionStorage.getItem('belinha_loaded_hash');

            if (serverHash && lastLoadedHash && lastLoadedHash !== serverHash) {
              console.log('[PWA] Nova versão detectada no servidor! Recarregando com cache limpo...');
              sessionStorage.setItem('belinha_loaded_hash', serverHash);
              if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
              }
              window.location.reload();
            } else if (serverHash) {
              sessionStorage.setItem('belinha_loaded_hash', serverHash);
            }
          }
        } catch (e) {
          // ignora falhas de rede temporárias
        }
      };

      checkServerVersion();
    }
  }, []);

  return null;
}
