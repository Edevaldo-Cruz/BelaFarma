import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from './ToastContext';

export function PwaUpdater() {
  const { addToast } = useToast();
  
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        // Checa por atualizações a cada 20 segundos
        setInterval(() => {
          r.update().catch(() => {});
        }, 20000);
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      // Atualiza automaticamente o Service Worker e recarrega para a nova versão
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  // Checagem ativa de versão para forçar limpeza de cache se houver novo deploy
  useEffect(() => {
    let ultimoHash: string | null = null;
    const checarVersao = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const dados = await res.json();
          if (dados.commitHash) {
            if (ultimoHash && ultimoHash !== dados.commitHash) {
              console.log('Nova versão detectada no servidor! Atualizando...');
              // Limpa todos os caches da API CacheStorage
              if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
              }
              window.location.reload();
            }
            ultimoHash = dados.commitHash;
          }
        }
      } catch (e) {}
    };

    checarVersao();
    const timer = setInterval(checarVersao, 30000);
    return () => clearInterval(timer);
  }, []);

  return null;
}
