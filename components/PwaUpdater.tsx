import React, { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Sparkles, RefreshCw, X, ArrowRight } from 'lucide-react';

export function PwaUpdater() {
  const [novaVersaoInfo, setNovaVersaoInfo] = useState<{
    version: string;
    commitHash: string;
    commitMessage: string;
    buildTime: string;
  } | null>(null);
  const [dispensado, setDispensado] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const localCommitHash = typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev';

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
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  // Checagem ativa e periódica contra o version.json do servidor
  useEffect(() => {
    const checarVersao = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const dados = await res.json();
          if (dados && dados.commitHash && localCommitHash !== 'dev') {
            if (dados.commitHash !== localCommitHash) {
              console.log(`[PWA] Nova versão detectada no servidor! Local: #${localCommitHash} vs Servidor: #${dados.commitHash}`);
              setNovaVersaoInfo(dados);
            }
          }
        }
      } catch (e) {}
    };

    checarVersao();
    const timer = setInterval(checarVersao, 25000);
    return () => clearInterval(timer);
  }, [localCommitHash]);

  const handleForcarAtualizacao = async () => {
    setAtualizando(true);
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      localStorage.removeItem('belinha_last_seen_version');
      sessionStorage.clear();
    } catch (e) {}
    window.location.reload();
  };

  if (!novaVersaoInfo || dispensado) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] w-[95%] max-w-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white p-3 sm:p-3.5 rounded-2xl shadow-2xl border-2 border-amber-300 flex items-center justify-between gap-3 animate-bounce shadow-amber-950/80">
      <div className="flex items-center gap-2.5 truncate">
        <div className="p-2 bg-white/20 rounded-xl shrink-0">
          <Sparkles className="w-5 h-5 text-amber-200" />
        </div>
        <div className="truncate">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-black text-xs uppercase tracking-wide">
              Nova Versão Disponível (v{novaVersaoInfo.version})!
            </span>
            <span className="font-mono text-[10px] bg-black/40 px-1.5 py-0.2 rounded font-bold">
              #{novaVersaoInfo.commitHash}
            </span>
          </div>
          <span className="text-[11px] text-amber-100 font-medium block truncate" title={novaVersaoInfo.commitMessage}>
            "{novaVersaoInfo.commitMessage}"
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleForcarAtualizacao}
          disabled={atualizando}
          className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-white text-slate-950 font-black text-xs uppercase tracking-wider shadow-md hover:bg-amber-100 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${atualizando ? 'animate-spin' : ''}`} />
          <span>{atualizando ? 'Atualizando...' : 'Atualizar Agora'}</span>
        </button>

        <button
          onClick={() => setDispensado(true)}
          className="p-1.5 rounded-lg hover:bg-black/20 text-white/80 hover:text-white transition-colors cursor-pointer"
          title="Fechar aviso temporariamente"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
