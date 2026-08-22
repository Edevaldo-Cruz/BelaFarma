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
  ArrowRight,
  Layers,
  ChevronDown,
  Check
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
  const [isSavingConsolidated, setIsSavingConsolidated] = useState(false);
  
  // State for typed net deposited values per item: { [id]: string }
  const [typedValues, setTypedValues] = useState<Record<string, string>>({});
  const [notesValues, setNotesValues] = useState<Record<string, string>>({});

  // State for weekend consolidated net deposit
  const [weekendNetTyped, setWeekendNetTyped] = useState<string>('');
  const [isWeekendExpanded, setIsWeekendExpanded] = useState<boolean>(false);

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
        if (item.net_deposited_value) {
          initialTyped[item.id] = (item.net_deposited_value * 100).toFixed(0);
        }
      });
      setTypedValues(initialTyped);
    } catch (err: any) {
      console.error('Erro ao carregar pendências:', err);
      addToast('Não foi possível carregar os repasses de hoje.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const parseCurrencyInput = (raw: string): number => {
    const cleaned = raw.replace(/\D/g, '');
    return (parseInt(cleaned, 10) || 0) / 100;
  };

  const formatCurrencyInputDisplay = (raw: string): string => {
    if (!raw) return '';
    const num = parseCurrencyInput(raw);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  };

  const handleDismissToday = () => {
    sessionStorage.setItem("belafarma_card_reconcile_dismissed", "true");
    onClose();
  };

  // Separa itens de fim de semana acumulados dos itens normais
  const isMonday = new Date().getDay() === 1;
  const weekendItems = pendingItems.filter(item => item.is_weekend_accumulated === 1);
  const regularItems = pendingItems.filter(item => item.is_weekend_accumulated !== 1);

  const weekendGrossTotal = weekendItems.reduce((acc, curr) => acc + (Number(curr.gross_value) || 0), 0);
  const weekendNetVal = parseCurrencyInput(weekendNetTyped);
  const weekendFeeVal = Math.max(0, weekendGrossTotal - weekendNetVal);
  const weekendFeePct = weekendGrossTotal > 0 && weekendNetVal > 0 ? (weekendFeeVal / weekendGrossTotal) * 100 : 0;

  // Conciliação consolidada do fim de semana
  const handleReconcileWeekendConsolidated = async () => {
    if (weekendItems.length === 0) return;
    if (weekendNetVal <= 0) {
      addToast('Digite o valor total líquido creditado na conta bancária.', 'warning');
      return;
    }

    setIsSavingConsolidated(true);
    try {
      const res = await fetch('/api/card-machine-receivables/reconcile-consolidated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: weekendItems.map(item => item.id),
          total_net_deposited: weekendNetVal,
          reconciled_by: userName || 'edevaldo',
          notes: 'Conferência consolidada de fim de semana (Sexta, Sábado e Domingo)'
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || 'Falha ao conciliar');
      }

      addToast(`✅ Acumulado de Fim de Semana (${weekendItems.length} repasses) conferido com taxa de ${weekendFeePct.toFixed(2)}%!`, 'success');
      
      const updatedPending = pendingItems.filter(p => !weekendItems.some(w => w.id === p.id));
      setPendingItems(updatedPending);
      setWeekendNetTyped('');

      if (onReconcileSuccess) onReconcileSuccess();

      if (updatedPending.length === 0) {
        sessionStorage.setItem("belafarma_card_reconcile_dismissed", "true");
        setTimeout(() => onClose(), 800);
      }
    } catch (err: any) {
      console.error('Erro na conciliação consolidada:', err);
      addToast(err.message || 'Erro ao conciliar repasses do fim de semana.', 'error');
    } finally {
      setIsSavingConsolidated(false);
    }
  };

  // Conciliação de item individual
  const handleReconcileSingle = async (item: CardMachineReceivable) => {
    const rawVal = typedValues[item.id] || '';
    const netValue = parseCurrencyInput(rawVal);

    if (netValue <= 0) {
      addToast('Informe o valor líquido creditado na conta.', 'warning');
      return;
    }

    setSavingId(item.id);
    try {
      const res = await fetch(`/api/card-machine-receivables/${item.id}/reconcile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          net_deposited_value: netValue,
          reconciled_by: userName || 'edevaldo',
          notes: notesValues[item.id] || null
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || 'Falha ao conciliar');
      }

      const updated = await res.json();
      addToast(`✅ Repasse ${updated.modality} (${updated.brand || 'Geral'}) conferido com taxa de ${updated.fee_percent}%!`, 'success');
      
      const updatedList = pendingItems.filter(p => p.id !== item.id);
      setPendingItems(updatedList);

      if (onReconcileSuccess) onReconcileSuccess();

      if (updatedList.length === 0) {
        sessionStorage.setItem("belafarma_card_reconcile_dismissed", "true");
        setTimeout(() => onClose(), 800);
      }
    } catch (err: any) {
      console.error('Erro ao salvar conciliação:', err);
      addToast(err.message || 'Erro ao conciliar repasse.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-up">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          
          <div className="flex items-center space-x-3 z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xl font-black tracking-tight">Conferência de Repasses Bancários</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/25 text-white border border-white/30">
                  {isMonday ? 'Segunda-feira (Acumulado FDS)' : 'Diário'}
                </span>
              </div>
              <p className="text-xs text-emerald-100 font-medium">
                Olá, {userName}! Compare os créditos da maquininha no seu banco e audite as taxas retidas.
              </p>
            </div>
          </div>

          <button 
            onClick={handleDismissToday}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all z-10"
            title="Fechar (Lembrar depois)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-bold text-slate-500">Buscando previsão de repasses no banco...</p>
            </div>
          ) : pendingItems.length === 0 ? (
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-800 dark:text-slate-100">Tudo conferido por aqui!</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                  Não há repasses pendentes de conferência para a data de hoje.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
              >
                Concluir
              </button>
            </div>
          ) : (
            <>
              {/* SEÇÃO 1: ACUMULADO DE FIM DE SEMANA (SEXTA, SÁBADO E DOMINGO) */}
              {weekendItems.length > 0 && (
                <div className="bg-gradient-to-br from-indigo-50/80 to-blue-50/50 dark:from-indigo-950/30 dark:to-blue-950/20 border-2 border-indigo-200/80 dark:border-indigo-800/60 rounded-3xl p-5 space-y-4 shadow-sm relative overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-200/60 dark:border-indigo-800/40">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-base font-black text-indigo-950 dark:text-indigo-200">
                            Acumulado do Fim de Semana (Sexta, Sáb e Dom)
                          </h4>
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-200/70 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 rounded-md">
                            {weekendItems.length} lançamentos
                          </span>
                        </div>
                        <p className="text-xs text-indigo-700 dark:text-indigo-400">
                          Como sábado e domingo não liquidam, a operadora deposita o montante total conjunto na segunda.
                        </p>
                      </div>
                    </div>

                    <div className="text-right sm:self-auto self-end">
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">Total Bruto Esperado</span>
                      <span className="text-xl font-black text-indigo-950 dark:text-white">
                        {formatCurrency(weekendGrossTotal)}
                      </span>
                    </div>
                  </div>

                  {/* Resumo das bandeiras/modalidades que compõem o FDS */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['Débito', 'Crédito à Vista', 'Crédito Parcelado'].map(mod => {
                      const modItems = weekendItems.filter(i => i.modality === mod || (mod === 'Crédito à Vista' && i.modality === 'Crédito'));
                      const sumMod = modItems.reduce((s, i) => s + (Number(i.gross_value) || 0), 0);
                      if (sumMod <= 0) return null;
                      return (
                        <div key={mod} className="bg-white/80 dark:bg-slate-800/80 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block truncate">{mod}</span>
                          <span className="text-xs font-black text-slate-800 dark:text-slate-200">{formatCurrency(sumMod)}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Input de Valor Líquido Consolidado */}
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                    <div className="w-full sm:w-1/2 space-y-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Valor Total Depositado no Banco (R$)</span>
                      </label>
                      <input 
                        type="text"
                        placeholder="R$ 0,00"
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800/80 rounded-xl text-base font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        value={formatCurrencyInputDisplay(weekendNetTyped)}
                        onChange={(e) => setWeekendNetTyped(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>

                    {/* Exibição da Taxa Calculada do FDS */}
                    <div className="w-full sm:w-1/2 flex items-center justify-between sm:justify-end sm:space-x-4 bg-indigo-50/50 dark:bg-slate-800/50 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase text-slate-500 block">Taxa Retida</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-sm font-black text-amber-600 dark:text-amber-400">
                            {formatCurrency(weekendFeeVal)}
                          </span>
                          <span className="text-xs font-black px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                            {weekendFeePct.toFixed(2)}%
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={handleReconcileWeekendConsolidated}
                        disabled={isSavingConsolidated || weekendNetVal <= 0}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center space-x-1.5"
                      >
                        {isSavingConsolidated ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Confirmar Tudo</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Toggle para ver detalhamento item a item */}
                  <div>
                    <button
                      onClick={() => setIsWeekendExpanded(!isWeekendExpanded)}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-1"
                    >
                      <span>{isWeekendExpanded ? 'Ocultar lançamentos individuais do FDS' : 'Ver detalhamento individual dos lançamentos do FDS'}</span>
                      <ChevronDown className={`w-3.5 h-3.5 transform transition-transform ${isWeekendExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {isWeekendExpanded && (
                      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
                        {weekendItems.map(item => (
                          <div key={item.id} className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-slate-700 dark:text-slate-300">{formatDate(item.sale_date)}</span>
                              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                {item.modality}
                              </span>
                              <span className="text-[10px] font-semibold text-slate-400">
                                {item.brand || 'Outros'}
                              </span>
                            </div>
                            <span className="font-black text-slate-900 dark:text-white">{formatCurrency(item.gross_value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SEÇÃO 2: REPASSES DO DIA ÚTIL NORMAL OU PENDÊNCIAS AVULSAS */}
              {regularItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Repasses Regulares ({regularItems.length})
                    </h4>
                  </div>

                  {regularItems.map((item) => {
                    const rawTyped = typedValues[item.id] || '';
                    const typedNet = parseCurrencyInput(rawTyped);
                    const gross = Number(item.gross_value) || 0;
                    const feeVal = Math.max(0, gross - typedNet);
                    const feePct = gross > 0 && typedNet > 0 ? (feeVal / gross) * 100 : 0;
                    const isSaving = savingId === item.id;

                    return (
                      <div 
                        key={item.id}
                        className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 transition-all hover:border-emerald-300 dark:hover:border-emerald-700 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-bold">
                              <CreditCard className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                                  {item.modality}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                  {item.brand || 'Outros'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 font-medium">
                                Venda: {formatDate(item.sale_date)} • Repasse Previsto: {formatDate(item.expected_payment_date)}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Valor Bruto</span>
                            <span className="text-base font-black text-slate-900 dark:text-slate-100">
                              {formatCurrency(item.gross_value)}
                            </span>
                          </div>
                        </div>

                        {/* Input do valor líquido e cálculo em tempo real */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                          <div className="sm:col-span-6 space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Valor Líquido que Caiu na Conta
                            </label>
                            <input 
                              type="text"
                              placeholder="R$ 0,00"
                              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                              value={formatCurrencyInputDisplay(rawTyped)}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                setTypedValues({ ...typedValues, [item.id]: val });
                              }}
                            />
                          </div>

                          {/* Preview da Taxa */}
                          <div className="sm:col-span-4 bg-white/60 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <div className="text-left">
                              <span className="text-[9px] font-bold uppercase text-slate-400 block">Taxa Retida</span>
                              <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                                {formatCurrency(feeVal)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] font-bold uppercase text-slate-400 block">% Cobrado</span>
                              <span className={`text-xs font-black px-1.5 py-0.5 rounded ${feePct > 4 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                {feePct > 0 ? `${feePct.toFixed(2)}%` : '0%'}
                              </span>
                            </div>
                          </div>

                          {/* Botão de Salvar Individual */}
                          <div className="sm:col-span-2 flex items-end">
                            <button
                              onClick={() => handleReconcileSingle(item)}
                              disabled={isSaving || typedNet <= 0}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center space-x-1"
                            >
                              {isSaving ? (
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <>
                                  <Save className="w-3.5 h-3.5" />
                                  <span>Salvar</span>
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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={() => {
              onClose();
              if (onNavigateToFullView) onNavigateToFullView();
            }}
            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1"
          >
            <span>Ver histórico completo & Auditoria de Taxas</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleDismissToday}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
          >
            Lembrar mais tarde
          </button>
        </div>

      </div>
    </div>
  );
};
