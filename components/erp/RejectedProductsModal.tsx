import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ThumbsDown, X } from 'lucide-react';
import { useToast } from '../ToastContext';
import { RejectedProductsPanel } from './RejectedProductsPanel';

export interface RejectionCartItem {
  code: string;
  barcode: string;
  name: string;
  unit_price: number;
  unit_cost: number;
  quantity: number;
  discount: number;
  total_price: number;
}

export interface RegisterRejectionModalProps {
  target: { item: RejectionCartItem; index: number } | null;
  currentSeller: { id: string; name: string } | null;
  currentUser?: { id?: string; name?: string } | null;
  onClose: () => void;
  onConfirmed: (indexToRemove: number | null, summary: any) => void;
}

function formatCurrency(val: number | undefined | null): string {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function useNativeDialog(
  dialogRef: React.RefObject<HTMLDialogElement | null>,
  isOpen: boolean,
  onClose: () => void
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    if (isOpen) {
      if (!dlg.open) {
        try {
          dlg.showModal();
        } catch {}
      }
    } else if (dlg.open) {
      dlg.close();
    }
  }, [dialogRef, isOpen]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    const handleNativeClose = () => {
      if (isOpen) onCloseRef.current();
    };
    dlg.addEventListener('close', handleNativeClose);

    let cleanupFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e: PointerEvent) => {
        const r = dlg.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      const onDown = (e: PointerEvent) => {
        pressedOutside = outside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && outside(e)) dlg.close();
      };
      dlg.addEventListener('pointerdown', onDown);
      dlg.addEventListener('pointerup', onUp);
      cleanupFallback = () => {
        dlg.removeEventListener('pointerdown', onDown);
        dlg.removeEventListener('pointerup', onUp);
      };
    }

    return () => {
      dlg.removeEventListener('close', handleNativeClose);
      if (cleanupFallback) cleanupFallback();
    };
  }, [dialogRef, isOpen]);
}

const REASONS = [
  { id: 'PRECO_ALTO', label: 'Preço alto / Fora de mercado' },
  { id: 'CONCORRENCIA', label: 'Mais barato na concorrência' },
  { id: 'DESISTENCIA', label: 'Desistiu / Sem dinheiro' },
  { id: 'OUTRO', label: 'Outro motivo' }
] as const;

export const RegisterRejectionModal: React.FC<RegisterRejectionModalProps> = ({
  target,
  currentSeller,
  currentUser,
  onClose,
  onConfirmed
}) => {
  const { addToast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const compPriceInputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const isOpen = Boolean(target);

  useNativeDialog(dialogRef, isOpen, onClose);

  const [reason, setReason] = useState<'PRECO_ALTO' | 'CONCORRENCIA' | 'DESISTENCIA' | 'OUTRO'>('PRECO_ALTO');
  const [competitorPrice, setCompetitorPrice] = useState('');
  const [competitorName, setCompetitorName] = useState('');
  const [notes, setNotes] = useState('');
  const [removeFromCart, setRemoveFromCart] = useState(true);
  const [saving, setSaving] = useState(false);

  const lastTargetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = target ? `${target.item.code}-${target.index}` : null;
    if (key && key !== lastTargetKeyRef.current) {
      lastTargetKeyRef.current = key;
      setReason('PRECO_ALTO');
      setCompetitorPrice('');
      setCompetitorName('');
      setNotes('');
      setRemoveFromCart(true);
      setTimeout(() => compPriceInputRef.current?.focus(), 60);
    } else if (!key) {
      lastTargetKeyRef.current = null;
    }
  }, [target]);

  const item = target?.item || null;
  const effectiveUnitPrice = useMemo(() => {
    if (!item) return 0;
    const qty = Number(item.quantity || 1);
    return qty > 0 ? Math.round((Number(item.total_price || item.unit_price * qty) / qty) * 100) / 100 : item.unit_price;
  }, [item]);

  const marginPercent = useMemo(() => {
    if (!item || effectiveUnitPrice <= 0 || !item.unit_cost || item.unit_cost <= 0) return null;
    return Math.round(((effectiveUnitPrice - item.unit_cost) / effectiveUnitPrice) * 1000) / 10;
  }, [item, effectiveUnitPrice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || !item) return;

    const compTrim = competitorPrice.trim();
    let compNum: number | null = null;
    if (compTrim) {
      const parsed = compTrim.includes(',')
        ? parseFloat(compTrim.replace(/\./g, '').replace(',', '.'))
        : parseFloat(compTrim);
      if (isNaN(parsed) || parsed <= 0) {
        addToast('Preço citado inválido. Informe um valor positivo ou deixe em branco.', 'warning');
        return;
      }
      compNum = Math.round(parsed * 100) / 100;
    }

    const sellerName = currentSeller?.name || currentUser?.name || 'Caixa';
    setSaving(true);
    try {
      const res = await fetch('/api/erp/pos/rejected-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-name': sellerName
        },
        body: JSON.stringify({
          product_code: item.code,
          barcode: item.barcode,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: effectiveUnitPrice,
          unit_cost: item.unit_cost || 0,
          competitor_price: compNum,
          competitor_name: competitorName.trim(),
          reason,
          notes: notes.trim(),
          seller_id: currentSeller?.id || null,
          seller_name: sellerName,
          operator_name: sellerName
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao registrar produto recusado.');
      }

      addToast(`Recusa de "${item.name}" registrada para análise de preço!`, 'success', 3000);
      onConfirmed(removeFromCart ? target.index : null, json.summary);
    } catch (err: any) {
      addToast(err?.message || 'Falha ao registrar produto recusado.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as any)}
      aria-labelledby={`${uid}-reg-title`}
      className="crediario-dialog w-[94vw] max-w-lg m-auto p-0 rounded-3xl border border-amber-500/50 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden"
    >
      <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
            <ThumbsDown className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 id={`${uid}-reg-title`} className="text-sm sm:text-base font-black text-white">
              Registrar Produto Recusado
            </h1>
            <p className="text-xs text-slate-400 truncate">
              Ajuda a descobrir se o item está fora do preço de mercado
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar janela"
          className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {item && (
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="font-black text-sm text-white">{item.name}</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 font-mono">
              <span>EAN: {item.barcode || 'S/N'}</span>
              <span>•</span>
              <span>Cód: {item.code}</span>
              <span>•</span>
              <span>Qtd: {item.quantity}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
              <span>
                Preço no PDV:{' '}
                <strong className="font-mono text-emerald-400 text-sm">{formatCurrency(effectiveUnitPrice)}</strong>
              </span>
              {item.unit_cost > 0 && (
                <span>
                  • Custo: <strong className="font-mono text-slate-200">{formatCurrency(item.unit_cost)}</strong>
                </span>
              )}
              {marginPercent !== null && (
                <span>
                  • Margem:{' '}
                  <strong className="font-mono text-sky-300">{marginPercent.toFixed(1)}%</strong>
                </span>
              )}
            </div>
          </div>

          <div>
            <span className="block text-xs font-bold text-slate-300 mb-1.5">Motivo da recusa</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {REASONS.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  className={`px-3 py-2 rounded-xl border text-left text-xs font-bold transition cursor-pointer ${
                    reason === r.id
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-comp-price`} className="block text-xs font-bold text-amber-200 mb-1">
                Preço citado / concorrência (R$)
              </label>
              <input
                ref={compPriceInputRef}
                id={`${uid}-comp-price`}
                type="text"
                inputMode="decimal"
                autoFocus
                value={competitorPrice}
                onChange={e => setCompetitorPrice(e.target.value)}
                placeholder="Opcional (ex: 19,90)"
                className="w-full px-3 py-2 rounded-xl border border-amber-400/50 bg-slate-950 text-white font-mono text-sm font-bold placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label htmlFor={`${uid}-comp-name`} className="block text-xs font-bold text-slate-300 mb-1">
                Onde o cliente viu (opcional)
              </label>
              <input
                id={`${uid}-comp-name`}
                type="text"
                value={competitorName}
                onChange={e => setCompetitorName(e.target.value)}
                placeholder="Ex: Drogasil, Pacheco, Araçuaí..."
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${uid}-rej-notes`} className="block text-xs font-bold text-slate-300 mb-1">
              Observação adicional (opcional)
            </label>
            <input
              id={`${uid}-rej-notes`}
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Cliente achou muito acima da semana passada"
              className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-200 font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={removeFromCart}
              onChange={e => setRemoveFromCart(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
            />
            <span>Remover este item do cupom atual após registrar</span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
            >
              Cancelar [ESC]
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Check className="w-4 h-4" />
              <span>{saving ? 'Salvando...' : 'Registrar Recusa [ENTER]'}</span>
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
};

export interface RejectedProductsListModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: { id?: string; name?: string; role?: string } | null;
  onSummaryChanged?: (summary: any) => void;
}

export const RejectedProductsListModal: React.FC<RejectedProductsListModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSummaryChanged
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId();
  useNativeDialog(dialogRef, isOpen, onClose);

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as any)}
      aria-labelledby={`${uid}-list-title`}
      className="crediario-dialog w-[96vw] max-w-6xl max-h-[92vh] m-auto p-0 rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden"
    >
      <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
            <ThumbsDown className="w-5 h-5" />
          </div>
          <div>
            <h1 id={`${uid}-list-title`} className="text-base sm:text-lg font-black text-white">
              Produtos Recusados no PDV • Inteligência de Preço
            </h1>
            <p className="text-xs text-slate-400">
              Avalie produtos recusados por preço, compare margens com a concorrência e ajuste valores direto na lista.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar Produtos Recusados"
          className="p-2 rounded-xl hover:bg-slate-800 text-slate-300 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0 flex flex-col">
        {isOpen && (
          <RejectedProductsPanel
            currentUser={currentUser}
            isModalMode
            onSummaryChanged={onSummaryChanged}
            onClose={onClose}
          />
        )}
      </div>
    </dialog>
  );
};
