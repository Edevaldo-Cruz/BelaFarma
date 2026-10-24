import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  GitCommit,
  Clock,
  RefreshCw,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  History,
  Trash2,
  Download
} from 'lucide-react';

interface VersionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VersionModal: React.FC<VersionModalProps> = ({ isOpen, onClose }) => {
  const [dadosServidor, setDadosServidor] = useState<any | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const localVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.2.0';
  const localCommitHash = typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev';
  const localCommitMessage = typeof __COMMIT_MESSAGE__ !== 'undefined' ? __COMMIT_MESSAGE__ : 'Atualização do sistema';
  const localBuildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'Não disponível';
  const localRecentCommits: Array<{ hash: string; date: string; message: string }> =
    typeof __RECENT_COMMITS__ !== 'undefined' && Array.isArray(__RECENT_COMMITS__) ? __RECENT_COMMITS__ : [];

  const checarServidor = async () => {
    setVerificando(true);
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setDadosServidor(json);
      }
    } catch (e) {
      console.warn('Erro ao checar version.json do servidor:', e);
    } finally {
      setVerificando(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checarServidor();
    }
  }, [isOpen]);

  const handleLimparCacheEAtualizar = async () => {
    setAtualizando(true);
    try {
      // 1. Limpa todas as entradas de cache do Service Worker e CacheStorage
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }

      // 2. Desregistra Service Workers ativos para forçar download dos assets novos
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }

      // 3. Remove chaves temporárias de versão
      localStorage.removeItem('belinha_last_seen_version');
      localStorage.removeItem('belinha_version_hash');
      sessionStorage.clear();

    } catch (e) {
      console.warn('Erro na limpeza de cache:', e);
    }

    // 4. Força reload completo
    window.location.reload();
  };

  if (!isOpen) return null;

  const temNovaVersao = Boolean(
    dadosServidor?.commitHash &&
    localCommitHash !== 'dev' &&
    dadosServidor.commitHash !== localCommitHash
  );

  const listaCommits = (dadosServidor?.recentCommits && dadosServidor.recentCommits.length > 0)
    ? dadosServidor.recentCommits
    : localRecentCommits;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-lg p-5 sm:p-6 rounded-[2rem] bg-[#0c1527] border border-cyan-800/80 shadow-2xl space-y-4 max-h-[90vh] flex flex-col justify-between text-slate-100">
        
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-950/50">
              <Sparkles className="w-5 h-5 text-cyan-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white uppercase tracking-wide">
                  Central de Versões & Atualizações
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-cyan-950 text-cyan-300 border border-cyan-800">
                  v{localVersion}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Auditoria de builds, descrição das mudanças e controle de cache
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="space-y-3.5 overflow-y-auto custom-scrollbar pr-1 flex-1">

          {/* ALERTA: NOVA VERSÃO DETECTADA NO SERVIDOR */}
          {temNovaVersao && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/90 via-[#26150a] to-[#1a0e07] border-2 border-amber-500 shadow-xl space-y-2.5 animate-pulse">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Nova Versão Publicada no Servidor!
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-900 text-amber-200 text-[10px] font-mono font-black">
                  #{dadosServidor.commitHash}
                </span>
              </div>
              <p className="text-xs text-amber-100 font-bold bg-black/40 p-2.5 rounded-xl border border-amber-800/80">
                "{dadosServidor.commitMessage}"
              </p>
              <div className="flex items-center justify-between text-[11px] text-amber-200/90 pt-1">
                <span>Versão Servidor: <b>v{dadosServidor.version}</b> ({dadosServidor.buildTime})</span>
              </div>
              <button
                onClick={handleLimparCacheEAtualizar}
                disabled={atualizando}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black uppercase shadow-lg cursor-pointer transition-all active:scale-95"
              >
                <RefreshCw className={`w-4 h-4 ${atualizando ? 'animate-spin' : ''}`} />
                <span>{atualizando ? 'Atualizando...' : '⚡ Atualizar Para a Nova Versão Agora'}</span>
              </button>
            </div>
          )}

          {/* STATUS DA VERSÃO ATUAL EM EXECUÇÃO */}
          <div className="p-3.5 rounded-2xl bg-[#08101d] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Versão em Execução no Navegador
              </span>
              <div className="flex items-center gap-1.5">
                {!temNovaVersao && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Atualizada
                  </span>
                )}
                <span className="font-mono text-xs font-black text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-md border border-cyan-800/60">
                  #{localCommitHash}
                </span>
              </div>
            </div>

            <div className="bg-[#050a14] p-3 rounded-xl border border-slate-800/80 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-500 block">Descrição da Versão / Commit Atual:</span>
              <p className="text-xs font-bold text-white leading-relaxed">
                "{localCommitMessage}"
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Data do Build: <b className="text-slate-300 font-mono">{localBuildTime}</b></span>
              <button
                type="button"
                onClick={checarServidor}
                disabled={verificando}
                className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="Conferir se o servidor publicou algo novo"
              >
                <RefreshCw className={`w-3 h-3 ${verificando ? 'animate-spin' : ''}`} />
                <span>{verificando ? 'Verificando...' : 'Verificar Atualização'}</span>
              </button>
            </div>
          </div>

          {/* HISTÓRICO DE VERSÕES & DESCRIÇÕES (CHANGELOG) */}
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-cyan-400" />
              Histórico de Versões & Melhorias Entregues:
            </span>

            <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
              {listaCommits.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-500 rounded-xl bg-[#08101d] border border-slate-800">
                  Nenhum histórico disponível neste ambiente.
                </div>
              ) : (
                listaCommits.map((c, idx) => {
                  const isAtual = c.hash === localCommitHash;
                  return (
                    <div
                      key={c.hash || idx}
                      className={`p-2.5 rounded-xl border text-xs transition-all ${
                        isAtual
                          ? 'bg-cyan-950/40 border-cyan-700/80 ring-1 ring-cyan-500/30'
                          : 'bg-[#08101d] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-mono text-[10px] font-black px-1.5 py-0.2 rounded ${
                            isAtual ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                          }`}>
                            #{c.hash}
                          </span>
                          {isAtual && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                              Em Uso
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono font-medium">
                          {c.date}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium text-slate-300 leading-snug">
                        {c.message}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Rodapé e Ações */}
        <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-800">
          <button
            onClick={handleLimparCacheEAtualizar}
            disabled={atualizando}
            title="Limpa caches locais do navegador, Service Worker e recarrega para a versão mais recente"
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-cyan-800/80 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 text-xs font-black transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${atualizando ? 'animate-spin' : ''}`} />
            <span>Limpar Cache & Forçar Atualização</span>
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-wider cursor-pointer transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
