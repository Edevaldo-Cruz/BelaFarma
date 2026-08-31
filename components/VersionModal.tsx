import React from 'react';
import { X, Sparkles, GitCommit, Clock, RefreshCw, Layers, CheckCircle2, Terminal } from 'lucide-react';

interface VersionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VersionModal: React.FC<VersionModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0';
  const commitHash = typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev';
  const commitMessage = typeof __COMMIT_MESSAGE__ !== 'undefined' ? __COMMIT_MESSAGE__ : 'Atualização do sistema';
  const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'Não disponível';

  const handleForcarRecarregamento = () => {
    try {
      localStorage.removeItem('belinha_last_seen_version');
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }
    } catch (e) {}
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-red-600 to-orange-600 text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                BelaFarma Gestão
              </h3>
              <p className="text-xs text-slate-400 font-bold">
                Informações da Versão e Build
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Detalhes do Build */}
        <div className="space-y-3">
          {/* Card Versão */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-500" />
              Versão do Sistema
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 text-xs font-mono font-black">
              v{version}
            </span>
          </div>

          {/* Card Commit */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <GitCommit className="w-4 h-4 text-purple-500" />
                Último Commit
              </span>
              <span className="font-mono text-xs font-black text-slate-800 dark:text-slate-200 bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 rounded-lg text-purple-800 dark:text-purple-300">
                #{commitHash}
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              "{commitMessage}"
            </p>
          </div>

          {/* Card Data do Build */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-500" />
              Data do Build
            </span>
            <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
              {buildTime}
            </span>
          </div>
        </div>

        {/* Rodapé e Ações */}
        <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={handleForcarRecarregamento}
            title="Limpa caches locais e recarrega a página"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recarregar App
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
