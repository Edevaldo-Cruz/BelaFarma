import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  X, 
  ChevronRight, 
  Sparkles,
  TrendingDown,
  Building2,
  Calendar,
  Save,
  ArrowRight
} from 'lucide-react';
import { CardMachineReceivable } from '../types';
import { useToast } from './ToastContext';

interface CardMachineReconcileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToFullView?: () => void;
  userName?: string;
  onReconcileSuccess?: () => void;
}

export const CardMachineReconcileModal: React.FC<CardMachineReconcileModalProps> = ({
  isOpen,
  onClose,
  onNavigateToFullView,
  userName = 'Edevaldo',
  onReconcileSuccess
}) => {
  const { addToast } = useToast();
  const [pendingItems, setPendingItems] = useState<CardMachineReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  
  // State for typed net deposited values per item: { [id]: string }
  const [typedValues, setTypedValues] = useState<Record<string, string>>({});
  const [notesValues, setNotesValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      fetchPendingItems();
    }
  }, [isOpen]);

  const fetchPendingItems = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/card-machine-receivables/pending-due');
      if (!res.ok) throw new Error('Erro ao buscar pendências');
      const data: CardMachineReceivable[] = await res.json();
      setPendingItems(data);

      // Pre-fill typed values if already partially entered
      const initialTyped: Record<string, string> = {};
      data.forEach(item => {
        if (item.net_deposited_value !== null && item.net_deposited_value !== undefined) {
          initialTyped[item.id] = (item.net_deposited_value * 100).toFixed(0);
        }
      });
      setTypedValues(initialTyped);
    } catch (err) {
      console.error('Erro ao buscar repasses pendentes:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  };

  const handleCurrencyInputChange = (id: string, rawInput: string) => {
    const cleaned = rawInput.replace(/\D/g, '');
    setTypedValues(prev => ({
      ...prev,
      [id]: cleaned
    }));
  };

  const parseInputToNumber = (rawDigits: string): number => {
    if (!rawDigits) return 0;
    return parseInt(rawDigits, 10) / 100;
  };

  const formatInputValueForDisplay = (rawDigits: string): string => {
    if (!rawDigits) return '';
    const num = parseInt(rawDigits, 10) / 100;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
  };

  const handleReconcileSingle = async (item: CardMachineReceivable) => {
    const rawVal = typedValues[item.id];
    if (!rawVal || rawVal === '0') {
      addToast('Digite o valor depositado na conta do banco.', 'warning');
      return;
    }

    const netValue = parseInputToNumber(rawVal);
    setSavingId(item.id);

    try {
      const res = await fetch(`/api/card-machine-receivables/${item.id}/reconcile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          net_deposited_value: netValue,
          reconciled_by: userName,
          notes: notesValues[item.id] || item.notes
        })
      });

      if (!res.ok) throw new Error('Erro ao salvar conferência');
      const updated = await res.json();

      addToast(`Conferência de ${item.modality} (${formatCurrency(netValue)}) salva! Taxa: ${updated.fee_percent}%`, 'success');
      
      // Remove from list
      setPendingItems(prev => prev.filter(p => p.id !== item.id));

      if (onReconcileSuccess) onReconcileSuccess();
    } catch (err) {
      console.error('Erro ao conciliar recebível:', err);
      addToast('Erro ao salvar conferência bancária.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white relative flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20 shadow-inner">
              <CreditCard className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-wider uppercase bg-white/20 px-2.5 py-0.5 rounded-full backdrop-blur-md">
                  Conferência Diária 10h
                </span>
                <span className="text-xs text-indigo-100 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Lembrete Matinal
                </span>
              </div>
              <h2 className="text-xl font-black mt-1 tracking-tight">
                Repasses de Maquininha / Pix a Conferir
              </h2>
              <p className="text-xs text-indigo-100 mt-0.5">
                Olá, <strong>{userName}</strong>! Confira os depósitos das maquininhas previstos para cair hoje na conta bancária.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium">Buscando lançamentos de maquininha do dia anterior...</p>
            </div>
          ) : pendingItems.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Tudo conferido por hoje!
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
                Não há repasses de cartão ou Pix pendentes de conferência bancária para hoje.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {pendingItems.length} {pendingItems.length === 1 ? 'repasse pendente' : 'repasses pendentes'}
                </span>
                <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                  Digite o valor líquido que caiu no banco
                </span>
              </div>

              {pendingItems.map(item => {
                const rawVal = typedValues[item.id] || '';
                const netVal = parseInputToNumber(rawVal);
                const feeR$ = rawVal ? Math.max(0, item.gross_value - netVal) : 0;
                const feePercent = rawVal && item.gross_value > 0 ? (feeR$ / item.gross_value) * 100 : 0;

                const isSaving = savingId === item.id;

                return (
                  <div 
                    key={item.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
                          item.modality.includes('Débito') 
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            : item.modality.includes('Crédito')
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}>
                          {item.modality}
                        </span>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          Venda: <strong>{formatDate(item.sale_date)}</strong>
                          <span className="opacity-40">•</span>
                          Previsto: <strong>{formatDate(item.expected_payment_date)}</strong>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Bruto Maquininha</span>
                        <span className="text-base font-black text-slate-800 dark:text-slate-100">
                          {formatCurrency(item.gross_value)}
                        </span>
                      </div>
                    </div>

                    {/* Inputs & Calculations Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                      
                      {/* Input do valor líquido depositado */}
                      <div className="sm:col-span-6">
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          Valor que Caiu no Banco (Líquido)
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="R$ 0,00"
                            value={rawVal ? formatInputValueForDisplay(rawVal) : ''}
                            onChange={(e) => handleCurrencyInputChange(item.id, e.target.value)}
                            className="w-full pl-3 pr-3 py-2 text-sm font-black text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                          />
                        </div>
                      </div>

                      {/* Taxa calculada em tempo real */}
                      <div className="sm:col-span-3 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700/70 text-center">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Taxa Apurada</span>
                        <div className="flex items-center justify-center gap-1 mt-0.5">
                          <span className={`text-xs font-black ${feePercent > 5 ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                            {rawVal ? `${feePercent.toFixed(2)}%` : '--'}
                          </span>
                          {rawVal && (
                            <span className="text-[10px] text-slate-400 font-semibold">
                              ({formatCurrency(feeR$)})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botão de confirmação */}
                      <div className="sm:col-span-3 flex justify-end">
                        <button
                          onClick={() => handleReconcileSingle(item)}
                          disabled={!rawVal || isSaving}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                            !rawVal 
                              ? 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                              : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white shadow-indigo-500/20 hover:shadow-md'
                          }`}
                        >
                          {isSaving ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Conferir
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            Lembrar mais tarde
          </button>

          {onNavigateToFullView && (
            <button
              onClick={() => {
                onClose();
                onNavigateToFullView();
              }}
              className="px-4 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-xl transition-colors flex items-center gap-1.5"
            >
              Abrir Controle Completo de Maquininhas
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CardMachineReconcileModal;
