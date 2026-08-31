import React, { useEffect } from 'react';
import { useToast } from './ToastContext';
import { Sparkles, GitCommit, Clock } from 'lucide-react';

export const VersionNotifier: React.FC = () => {
  const { addToast } = useToast();

  useEffect(() => {
    try {
      const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0';
      const commitHash = typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev';
      const commitMessage = typeof __COMMIT_MESSAGE__ !== 'undefined' ? __COMMIT_MESSAGE__ : 'Atualização do sistema';
      const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

      const currentBuildKey = `${version}-${commitHash}`;
      const lastSeen = localStorage.getItem('belinha_last_seen_version');

      // Se for a primeira vez que essa versão/commit é aberto neste navegador
      if (lastSeen !== currentBuildKey) {
        localStorage.setItem('belinha_last_seen_version', currentBuildKey);

        addToast(
          <div className="flex flex-col gap-1.5 pr-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wider shadow-sm">
                Nova Versão
              </span>
              <span className="font-black text-xs text-emerald-950 dark:text-emerald-100 font-mono">
                v{version} ({commitHash})
              </span>
            </div>

            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed">
              "{commitMessage}"
            </p>

            {buildTime && (
              <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                <Clock className="w-3 h-3" />
                <span>Build: {buildTime}</span>
              </div>
            )}
          </div>,
          'success',
          8000
        );
      }
    } catch (e) {
      console.warn('Erro no VersionNotifier:', e);
    }
  }, [addToast]);

  return null;
};
