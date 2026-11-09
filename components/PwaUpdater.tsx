import React, { useEffect } from 'react';

export function PwaUpdater() {
  useEffect(() => {
    // Desregistra qualquer Service Worker ativo no navegador
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

    // Limpa todos os caches do CacheStorage do navegador (workbox-precache, etc.)
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
  }, []);

  return null;
}
