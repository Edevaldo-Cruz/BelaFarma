import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export type StartupModalType = 'tera' | 'estoque-ideal' | 'mural' | 'card-machines';

export interface StartupModalItem {
  id: StartupModalType;
  title: string;
  badge: string;
  badgeColor: string;
}

interface StartupModalManagerProps {
  queue: StartupModalItem[];
  currentIndex: number;
  onNavigate: (newIndex: number) => void;
  onClose: () => void;
}

export const StartupModalManager: React.FC<StartupModalManagerProps> = ({
  queue,
  currentIndex,
  onNavigate,
  onClose,
}) => {
  if (!queue || queue.length === 0) return null;

  const currentItem = queue[currentIndex] || queue[0];
  const total = queue.length;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < total - 1;

  return (
    <aside
      aria-label="Controle de avisos da abertura"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[250] pointer-events-auto flex items-center gap-2 sm:gap-3 bg-slate-900/95 dark:bg-slate-950/95 text-white px-3 sm:px-4 py-2 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200 select-none max-w-[95vw]"
    >
      {/* Indicador de Fila / Badge */}
      <div className="flex items-center gap-2 border-r border-slate-700/80 pr-3">
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black tracking-wider uppercase text-slate-300">
              Aviso {currentIndex + 1} de {total}
            </span>
            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full ${currentItem.badgeColor}`}>
              {currentItem.badge}
            </span>
          </div>
          <span className="text-xs font-bold text-white truncate max-w-[180px] sm:max-w-[260px]">
            {currentItem.title}
          </span>
        </div>
      </div>

      {/* Botões de Navegação Anterior / Próximo */}
      {total > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNavigate(currentIndex - 1)}
            disabled={!hasPrev}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              hasPrev
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 hover:text-white border border-slate-600 active:scale-95'
                : 'bg-slate-800/40 text-slate-500 cursor-not-allowed border border-slate-800'
            }`}
            title="Aviso Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate(currentIndex + 1)}
            disabled={!hasNext}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              hasNext
                ? 'bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/30 active:scale-95'
                : 'bg-slate-800/40 text-slate-500 cursor-not-allowed border border-slate-800'
            }`}
            title="Próximo Aviso"
          >
            <span className="hidden sm:inline">Próximo</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Botão Fechar Todos / Fechar Visualização */}
      <div className="pl-1 sm:pl-2 border-l border-slate-700/80">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-bold border border-slate-700 active:scale-95"
          title="Fechar todos os avisos da abertura"
        >
          <X className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
          <span className="hidden sm:inline">Fechar</span>
        </button>
      </div>
    </aside>
  );
};
