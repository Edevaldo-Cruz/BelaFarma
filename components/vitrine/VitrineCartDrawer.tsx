import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Phone,
  Sparkles,
  ArrowRight,
  MapPin,
  Store,
  Truck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
} from 'lucide-react';
import type {
  VitrineCartItem,
  CheckoutData,
  ModalidadeEntrega,
} from './vitrineTypes';
import { formatBRL } from './vitrineTypes';
import {
  formatWhatsAppOrderMessage,
  generateWhatsAppOrderUrl,
  validateCheckoutForm,
  roundCents,
  extractCartTotals,
  OFFICIAL_WHATSAPP_PHONE,
} from './whatsappUtils';
import { vitrineAnalytics } from './vitrineAnalytics';

export interface VitrineCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: VitrineCartItem[];
  onUpdateQuantity: (produtoId: string | number, delta: number) => void;
  onRemoveItem: (produtoId: string | number) => void;
  onClearCart?: () => void;
}

export const VitrineCartDrawer: React.FC<VitrineCartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}) => {
  // Estados do Formulário de Checkout Minimalista (Zero Burocracia)
  const [nome, setNome] = useState<string>('');
  const [modalidade, setModalidade] = useState<ModalidadeEntrega>('retirada');
  const [endereco, setEndereco] = useState<string>('');
  const [bairro, setBairro] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Fecha com a tecla ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Trava a rolagem da página quando a gaveta está aberta
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Totais e economia do carrinho calculados dinamicamente
  const { totalItems, subtotal, savings } = useMemo(() => {
    return extractCartTotals(items);
  }, [items]);

  // Telemetria contínua do carrinho e captura de nome/bairro
  useEffect(() => {
    if (items.length > 0) {
      vitrineAnalytics.trackCartUpdate(items, subtotal, nome.trim() || undefined, bairro.trim() || undefined);
    }
  }, [items, subtotal, nome, bairro]);

  // Manipulador de finalização do pedido via WhatsApp
  const handleFinalizeOrder = () => {
    const checkoutData: CheckoutData = {
      nome: nome.trim(),
      modalidade,
      endereco: modalidade === 'entrega' ? endereco.trim() : undefined,
      bairro: modalidade === 'entrega' ? bairro.trim() : undefined,
    };

    const validation = validateCheckoutForm(checkoutData);

    if (!validation.isValid) {
      setErrorMessage(validation.errors[0] || 'Por favor, informe seu Nome Completo.');
      if (nameInputRef.current) {
        nameInputRef.current.focus();
      }
      return;
    }

    setErrorMessage(null);

    // Registra conversão de pedido
    vitrineAnalytics.trackCheckout(
      items,
      subtotal,
      nome.trim(),
      modalidade === 'entrega' ? bairro.trim() : undefined
    );

    const whatsappUrl = generateWhatsAppOrderUrl(items, checkoutData);
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Carrinho de Compras"
      className="fixed inset-0 z-50 flex justify-end items-end sm:items-stretch bg-black/60 backdrop-blur-sm transition-opacity animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full sm:w-[440px] sm:max-w-md bg-white dark:bg-slate-900 h-[90vh] sm:h-full rounded-t-3xl sm:rounded-none shadow-2xl flex flex-col justify-between overflow-hidden border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 transition-transform"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra superior de arraste visual em dispositivos móveis */}
        <div className="w-12 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto my-2.5 sm:hidden" />

        {/* Topo do Carrinho */}
        <div className="px-4 py-3 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center font-bold">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-base text-slate-800 dark:text-slate-100">
                  Meu Carrinho
                </h2>
                <span className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs font-black px-2 py-0.5 rounded-full border border-red-200 dark:border-red-900">
                  {totalItems} {totalItems === 1 ? 'item' : 'itens'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Aniversário & Grande Liquidação BelaFarma
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {items.length > 0 && onClearCart && (
              <button
                type="button"
                onClick={onClearCart}
                className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer flex items-center gap-1"
                title="Limpar todos os itens do carrinho"
              >
                <Trash2 className="w-3 h-3" />
                <span>Limpar</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              aria-label="Fechar carrinho"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Aviso Suave de Escassez & Estoque Promocional */}
        {items.length > 0 && (
          <div className="mx-4 mt-3 p-2.5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border border-amber-200 dark:border-amber-900/50 flex items-center gap-2.5 text-xs text-amber-950 dark:text-amber-200 shadow-2xs">
            <div className="p-1.5 rounded-xl bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 shrink-0">
              <Clock className="w-4 h-4 animate-pulse" />
            </div>
            <p className="text-[11px] leading-tight font-medium">
              <strong className="font-bold">Estoque Promocional Concorrido:</strong> Seus produtos estão guardados, mas o lote de liquidação pode esgotar. Finalize seu pedido no WhatsApp para garantir os preços especiais!
            </p>
          </div>
        )}

        {/* Lista de Itens do Carrinho */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 overscroll-contain">
          {items.length === 0 ? (
            <div className="my-auto py-12 text-center flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-600">
                <ShoppingBag className="w-8 h-8 stroke-1" />
              </div>
              <h3 className="font-extrabold text-base text-slate-700 dark:text-slate-300">
                Seu carrinho está vazio
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                Adicione ofertas imperdíveis do nosso Aniversário de 1 Ano e economize muito com retirada rápida ou entrega!
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Continuar Comprando</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            items.map((item) => {
              const p = item.produto;
              const maxEstoque = Number(p.estoque) || 999;
              const pId = p.id || p.produto_id;
              const isAtMaxStock = item.quantidade >= maxEstoque;

              return (
                <div
                  key={pId}
                  className="p-3 sm:p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 shadow-xs hover:border-red-200 dark:hover:border-slate-600 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 truncate">
                      {p.nome || p.descricao}
                    </h4>

                    {p.apresentacao && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {p.apresentacao}
                      </p>
                    )}

                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-xs sm:text-sm font-black text-red-600 dark:text-red-400">
                        {formatBRL(p.preco_por)}
                      </span>
                      {p.preco_de > p.preco_por && (
                        <span className="text-[10px] text-slate-400 line-through">
                          {formatBRL(p.preco_de)}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-medium ml-auto">
                        Subtotal: <strong className="text-slate-700 dark:text-slate-300">{formatBRL(p.preco_por * item.quantidade)}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Controles de Quantidade (+ / - / Remover) */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(pId, -1)}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 active:scale-95 cursor-pointer"
                      aria-label="Diminuir quantidade"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <span className="w-6 text-center text-xs font-black text-slate-800 dark:text-slate-100">
                      {item.quantidade}
                    </span>

                    <button
                      type="button"
                      disabled={isAtMaxStock}
                      onClick={() => onUpdateQuantity(pId, 1)}
                      title={isAtMaxStock ? `Estoque máximo atingido (${maxEstoque} un)` : 'Aumentar'}
                      className={`w-7 h-7 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 active:scale-95 cursor-pointer ${
                        isAtMaxStock ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                      aria-label="Aumentar quantidade"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onRemoveItem(pId)}
                      className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center ml-1 cursor-pointer transition-colors"
                      aria-label="Remover produto do carrinho"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé: Resumo Financeiro + Checkout Minimalista */}
        {items.length > 0 && (
          <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 flex flex-col gap-3">
            {/* Resumo de Valores */}
            <div className="flex flex-col gap-1 text-xs">
              {savings > 0 && (
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-900">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Economia com as Ofertas:</span>
                  </div>
                  <span>-{formatBRL(savings)}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 pt-1">
                <span>Total a Pagar:</span>
                <span className="text-red-600 dark:text-red-500 text-lg sm:text-xl font-black">
                  {formatBRL(subtotal)}
                </span>
              </div>
            </div>

            {/* Formulário Minimalista de Checkout (Sem Burocracia) */}
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col gap-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                  Finalização Expressa
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  Zero burocracia • Sem senhas
                </span>
              </div>

              {/* Campo Nome Completo (Obrigatório) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Seu Nome Completo <span className="text-red-500">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Ex: Maria dos Santos"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                />
              </div>

              {/* Seletor de Modalidade: Retirar vs Entrega */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Como deseja receber seu pedido?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalidade('retirada')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      modalidade === 'retirada'
                        ? 'bg-red-600 text-white shadow-sm ring-2 ring-red-400'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>Retirar na Loja</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalidade('entrega')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      modalidade === 'entrega'
                        ? 'bg-red-600 text-white shadow-sm ring-2 ring-red-400'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Entrega / Delivery</span>
                  </button>
                </div>
              </div>

              {/* Campos de Endereço e Bairro (Exibidos se modalidade for Entrega) */}
              {modalidade === 'entrega' && (
                <div className="flex flex-col gap-2 pt-1 animate-fadeIn">
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <MapPin className="w-3 h-3 text-red-500" />
                    <span>Endereço para entrega em Juiz de Fora:</span>
                  </div>
                  <input
                    type="text"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    placeholder="Rua e número (ex: Rua São Mateus, 120)"
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <input
                    type="text"
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    placeholder="Bairro (ex: Ipiranga)"
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}

              {/* Mensagem de Erro de Validação */}
              {errorMessage && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-red-950/50 p-2 rounded-lg border border-red-200 dark:border-red-900 animate-shake">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {/* Botão Oficial Chamativo de Finalização via WhatsApp */}
            <button
              type="button"
              onClick={handleFinalizeOrder}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-emerald-500/25 transition-all hover:scale-101 active:scale-99 cursor-pointer"
            >
              <Phone className="w-4 h-4 fill-current" />
              <span>Finalizar Pedido pelo WhatsApp</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
