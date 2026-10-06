import React, { useState } from 'react';
import { ShoppingBag, Check, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { VitrineProduto, formatBRL } from './vitrineTypes';

export { formatBRL } from './vitrineTypes';

export interface VitrineProductCardProps {
  produto: VitrineProduto;
  onAddToCart?: (produto: VitrineProduto) => void;
  className?: string;
}

export const VitrineProductCard: React.FC<VitrineProductCardProps> = ({
  produto,
  onAddToCart,
  className = '',
}) => {
  const [imageError, setImageError] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const estoque = Number(produto.estoque) || 0;
  const isOutOfStock = estoque <= 0;
  const isLowStock = estoque > 0 && estoque <= 5;

  // Cálculo da porcentagem de desconto com fallback robusto
  const discountPercent =
    typeof produto.desconto_percentual === 'number' && produto.desconto_percentual > 0
      ? produto.desconto_percentual
      : produto.preco_de > produto.preco_por && produto.preco_de > 0
        ? Math.round(((produto.preco_de - produto.preco_por) / produto.preco_de) * 100)
        : 0;

  const hasImage = Boolean(produto.imagem_url) && !imageError;

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    if (onAddToCart) {
      onAddToCart(produto);
    }
    setJustAdded(true);
    setTimeout(() => {
      setJustAdded(false);
    }, 1200);
  };

  // Texto do estoque conforme os requisitos e critérios de teste
  const stockBadgeText = isOutOfStock
    ? 'Esgotado'
    : isLowStock
      ? `Restam apenas ${estoque} unidades!`
      : 'Estoque disponível';

  return (
    <div
      className={`flex flex-col justify-between bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700/90 shadow-sm hover:shadow-md hover:border-red-300 dark:hover:border-red-900/60 transition-all duration-200 overflow-hidden relative group select-none ${className}`}
    >
      {/* Badges de Topo: Desconto e Estoque */}
      <div className="absolute top-2 left-2 z-10 pointer-events-none">
        {discountPercent > 0 && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-black bg-red-600 text-white shadow-md">
            -{discountPercent}% OFF
          </span>
        )}
      </div>

      <div className="absolute top-2 right-2 z-10 pointer-events-none">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold shadow-sm backdrop-blur-md ${
            isOutOfStock
              ? 'bg-slate-200/95 dark:bg-slate-700/95 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600'
              : isLowStock
                ? 'bg-amber-100/95 dark:bg-amber-950/85 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                : 'bg-emerald-100/95 dark:bg-emerald-950/85 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
          }`}
        >
          {isOutOfStock ? (
            <span>{stockBadgeText}</span>
          ) : isLowStock ? (
            <>
              <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>{stockBadgeText}</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>{stockBadgeText}</span>
            </>
          )}
        </span>
      </div>

      {/* Área da Imagem com Fallback Elegante */}
      <div className="relative w-full aspect-square bg-slate-50 dark:bg-slate-900/60 flex items-center justify-center overflow-hidden border-b border-slate-100 dark:border-slate-800/80">
        {hasImage ? (
          <img
            src={produto.imagem_url}
            alt={produto.nome}
            loading="lazy"
            onError={() => setImageError(true)}
            className="w-full h-full object-contain p-2.5 sm:p-3 group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-red-50/70 via-rose-50/40 to-amber-50/60 dark:from-slate-800 dark:via-slate-800 dark:to-slate-700/80">
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-700 shadow-sm flex items-center justify-center text-red-500 dark:text-red-400 mb-1.5 border border-red-100 dark:border-slate-600">
              <Package className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-black text-red-600 dark:text-red-400 tracking-wider uppercase">
              BelaFarma
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[120px]">
              {produto.categoria || 'Liquidação'}
            </span>
          </div>
        )}
      </div>

      {/* Conteúdo do Card */}
      <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between gap-3">
        <div className="flex flex-col gap-1">
          {/* Metadados: Laboratório e Categoria */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 font-medium">
            <span className="truncate max-w-[130px] font-semibold text-slate-500 dark:text-slate-400">
              {produto.laboratorio || 'BelaFarma'}
            </span>
            {produto.categoria && (
              <span className="truncate max-w-[100px] text-[10px] bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                {produto.categoria}
              </span>
            )}
          </div>

          {/* Nome do Produto */}
          <h3
            className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm line-clamp-2 leading-snug group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors"
            title={produto.nome}
          >
            {produto.nome}
          </h3>

          {/* Apresentação */}
          {produto.apresentacao && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {produto.apresentacao}
            </p>
          )}
        </div>

        {/* Hierarquia de Preços De / Por */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 dark:text-slate-500 line-through">
              De: {formatBRL(produto.preco_de)}
            </span>
          </div>

          <div className="flex items-baseline gap-1">
            <span className="text-xs font-extrabold text-red-600 dark:text-red-400">
              Por:
            </span>
            <span className="text-lg sm:text-xl font-black text-red-600 dark:text-red-400 tracking-tight">
              {formatBRL(produto.preco_por)}
            </span>
          </div>
        </div>

        {/* Botão de Adicionar com Feedback em 1 Clique */}
        <button
          type="button"
          disabled={isOutOfStock}
          onClick={handleAddClick}
          aria-label={
            isOutOfStock
              ? `Produto ${produto.nome} esgotado`
              : `Adicionar ${produto.nome} ao carrinho por ${formatBRL(produto.preco_por)}`
          }
          className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all duration-200 cursor-pointer ${
            isOutOfStock
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-none'
              : justAdded
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white scale-[1.02] shadow-emerald-500/20'
                : 'bg-red-600 hover:bg-red-700 active:scale-98 text-white shadow-red-600/20 hover:shadow-md'
          }`}
        >
          {justAdded ? (
            <>
              <Check className="w-4 h-4 text-white animate-bounce" />
              <span>Adicionado! ✓</span>
            </>
          ) : isOutOfStock ? (
            <span>Esgotado</span>
          ) : (
            <>
              <ShoppingBag className="w-4 h-4 transition-transform group-hover:scale-110" />
              <span>Adicionar</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
