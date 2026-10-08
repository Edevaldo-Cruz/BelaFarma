import React, { useState } from 'react';
import { ShoppingBag, ArrowRight, X, Clock, Flame, Sparkles } from 'lucide-react';
import { VitrineCartItem, formatBRL } from './vitrineTypes';

export interface VitrineCartRecoveryBannerProps {
  items: VitrineCartItem[];
  subtotal: number;
  onOpenCart: () => void;
  onDismiss: () => void;
}

export const VitrineCartRecoveryBanner: React.FC<VitrineCartRecoveryBannerProps> = ({
  items,
  subtotal,
  onOpenCart,
  onDismiss,
}) => {
  const [isClosing, setIsClosing] = useState(false);

  const totalItems = items.reduce((acc, it) => acc + (it.quantidade || 1), 0);

  if (items.length === 0) return null;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onDismiss();
    }, 250);
  };

  const handleAction = () => {
    onOpenCart();
    handleClose();
  };

  // Pega até 3 produtos para preview visual
  const previewItems = items.slice(0, 3);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-40 max-w-md w-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-2 border-amber-300 dark:border-amber-700/80 rounded-3xl p-4 sm:p-5 shadow-2xl transition-all duration-300 select-none ${
        isClosing ? 'opacity-0 translate-y-4 scale-95' : 'opacity-100 translate-y-0 scale-100 animate-slideUp'
      }`}
    >
      {/* Topo com Selo de Oportunidade e Botão Fechar */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300 text-[11px] font-black tracking-tight">
          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse" />
          <span>Sua sacola está salva!</span>
        </span>

        <button
          type="button"
          onClick={handleClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Fechar aviso"
          aria-label="Fechar aviso de sacola salva"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Conteúdo Central com Gatilho Suave de Escassez */}
      <div className="flex items-start gap-3 mb-3.5">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-600 to-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
          <ShoppingBag className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-tight">
            Você tem {totalItems} {totalItems === 1 ? 'item reservado' : 'itens reservados'} no carrinho
          </h4>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
            Guardamos suas ofertas com preço de liquidação. Como o estoque promocional é limitado, garanta os seus antes que acabem!
          </p>
        </div>
      </div>

      {/* Miniatura dos Produtos Selecionados */}
      <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 mb-3.5">
        <div className="flex items-center -space-x-2 overflow-hidden">
          {previewItems.map((it, idx) => (
            <div
              key={idx}
              className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 bg-white dark:bg-slate-800 overflow-hidden shadow-xs shrink-0 flex items-center justify-center"
              title={it.produto.nome}
            >
              {it.produto.imagem_url ? (
                <img src={it.produto.imagem_url} alt="" className="w-full h-full object-contain p-0.5" />
              ) : (
                <span className="text-[10px] font-black text-red-600">BF</span>
              )}
            </div>
          ))}
          {items.length > 3 && (
            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 text-[10px] font-black flex items-center justify-center shrink-0 shadow-xs">
              +{items.length - 3}
            </div>
          )}
        </div>

        <div className="text-right">
          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Subtotal:</span>
          <span className="text-sm font-black text-red-600 dark:text-red-400 leading-none">
            {formatBRL(subtotal)}
          </span>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAction}
          className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-600 active:scale-98 text-white font-black text-xs shadow-md shadow-red-600/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
        >
          <span>Continuar Meu Pedido</span>
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="py-2.5 px-3 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Depois
        </button>
      </div>
    </div>
  );
};
