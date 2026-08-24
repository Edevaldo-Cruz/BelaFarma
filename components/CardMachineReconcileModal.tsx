import React, { useState, useEffect, useMemo } from 'react';
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
  Check,
  Percent
} from 'lucide-react';
import { CardMachineReceivable, CardBrand } from '../types';
import { useToast } from './ToastContext';

interface CardMachineReconcileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToFullView?: () => void;
  userName?: string;
  onReconcileSuccess?: () => void;
}

interface GroupedBrandItem {
  key: string; // e.g. "Visa_Débito", "Master_Crédito à Vista"
  brand: string;
  modality: string;
  items: CardMachineReceivable[];
  totalGross: number;
  m1Gross: number;
  m2Gross: number;
  isWeekend: boolean;
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
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isSavingAllWeekend, setIsSavingAllWeekend] = useState(false);
  
  // State for typed net deposited values per group key: { [groupKey]: string }
  const [groupTypedValues, setGroupTypedValues] = useState<Record<string, string>>({});
  const [groupNotes, setGroupNotes] = useState<Record<string, string>>({});

  // State for optional full weekend consolidated net deposit
  const [weekendNetTyped, setWeekendNetTyped] = useState<string>('');
  const [showWeekendQuickAll, setShowWeekendQuickAll] = useState<boolean>(false);

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
    } catch (err: any) {
      console.error('Erro ao carregar pendências:', err);
      addToast('Não foi possível carregar os repasses de hoje.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const parseCurrencyInput = (raw: string): number => {
    if (!raw) return 0;
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

  // Agrupamento por BANDEIRA & MODALIDADE (Somando M1 + M2)
  const groupedBrandItems = useMemo(() => {
    const map = new Map<string, GroupedBrandItem>();

    pendingItems.forEach(item => {
      const brand = item.brand || 'Outros';
      const modality = item.modality || 'Débito';
      const key = `${brand}_${modality}`;

      const gross = Number(item.gross_value) || 0;
      const isM2 = item.machine_name === 'M2';

      if (!map.has(key)) {
        map.set(key, {
          key,
          brand,
          modality,
          items: [item],
          totalGross: gross,
          m1Gross: isM2 ? 0 : gross,
          m2Gross: isM2 ? gross : 0,
          isWeekend: item.is_weekend_accumulated === 1
        });
      } else {
        const entry = map.get(key)!;
        entry.items.push(item);
        entry.totalGross += gross;
        if (isM2) entry.m2Gross += gross;
        else entry.m1Gross += gross;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      // Ordena por bandeira e depois modalidade
      if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
      return a.modality.localeCompare(b.modality);
    });
  }, [pendingItems]);

  // Totalizadores Gerais do Topo (M1 + M2 somados)
  const totalsSummary = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    let totalGross = 0;

    pendingItems.forEach(item => {
      const val = Number(item.gross_value) || 0;
      totalGross += val;
      if (item.modality === 'Débito') {
        totalDebit += val;
      } else {
        totalCredit += val; // Crédito à Vista + Parcelado
      }
    });

    return {
      totalDebit: Number(totalDebit.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
      totalGross: Number(totalGross.toFixed(2))
    };
  }, [pendingItems]);

  // Conciliação de um grupo de Bandeira + Modalidade (somando M1 e M2)
  const handleReconcileGroup = async (group: GroupedBrandItem) => {
    const rawVal = groupTypedValues[group.key] || '';
    const netValue = parseCurrencyInput(rawVal);

    if (netValue <= 0) {
      addToast(`Informe o valor líquido creditado para ${group.brand} (${group.modality}).`, 'warning');
      return;
    }

    setSavingKey(group.key);
    try {
      const itemIds = group.items.map(i => i.id);

      const res = await fetch('/api/card-machine-receivables/reconcile-consolidated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds,
          total_net_deposited: netValue,
          reconciled_by: userName || 'edevaldo',
          notes: groupNotes[group.key] || `Conferência ${group.brand} (${group.modality})`
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || 'Falha ao conciliar grupo');
      }

      const resData = await res.json();
      addToast(`✅ Repasse ${group.brand} - ${group.modality} (${group.items.length} itens M1/M2) conferido com taxa de ${resData.overallFeePercent}%!`, 'success');
      
      const updatedList = pendingItems.filter(p => !itemIds.includes(p.id));
      setPendingItems(updatedList);

      if (onReconcileSuccess) onReconcileSuccess();

      if (updatedList.length === 0) {
        sessionStorage.setItem("belafarma_card_reconcile_dismissed", "true");
        setTimeout(() => onClose(), 800);
      }
    } catch (err: any) {
      console.error('Erro ao conciliar grupo:', err);
      addToast(err.message || 'Erro ao conciliar repasse da bandeira.', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  // Conciliação de TODO o Fim de Semana com 1 único clique (se desejar)
  const handleReconcileAllWeekend = async () => {
    if (weekendItems.length === 0) return;
    const netTotal = parseCurrencyInput(weekendNetTyped);
    if (netTotal <= 0) {
      addToast('Digite o valor total líquido creditado no banco para o fim de semana.', 'warning');
      return;
    }

    setIsSavingAllWeekend(true);
    try {
      const itemIds = weekendItems.map(i => i.id);
      const res = await fetch('/api/card-machine-receivables/reconcile-consolidated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds,
          total_net_deposited: netTotal,
          reconciled_by: userName || 'edevaldo',
          notes: 'Conferência total consolidada do fim de semana (Sexta, Sábado e Domingo)'
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || 'Falha ao conciliar');
      }

      const data = await res.json();
      addToast(`✅ Acumulado de Fim de Semana (${weekendItems.length} repasses) conferido com taxa média de ${data.overallFeePercent}%!`, 'success');
      
      const updatedList = pendingItems.filter(p => !itemIds.includes(p.id));
      setPendingItems(updatedList);
      setWeekendNetTyped('');

      if (onReconcileSuccess) onReconcileSuccess();

      if (updatedList.length === 0) {
        sessionStorage.setItem("belafarma_card_reconcile_dismissed", "true");
        setTimeout(() => onClose(), 800);
      }
    } catch (err: any) {
      console.error('Erro na conciliação total do FDS:', err);
      addToast(err.message || 'Erro ao conciliar lote do fim de semana.', 'error');
    } finally {
      setIsSavingAllWeekend(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-up">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white flex items-center justify-between shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          
          <div className="flex items-center space-x-3 z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xl font-black tracking-tight">Conferência de Repasses das Maquininhas</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/25 text-white border border-white/30">
                  {isMonday ? 'Segunda-feira (Acumulado FDS)' : 'Diário'}
                </span>
              </div>
              <p className="text-xs text-emerald-100 font-medium">
                Olá, {userName}! Confira os valores somados por bandeira e audite as taxas retidas no banco.
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
              {/* TOP TOTALIZADORES GERAIS (DÉBITO E CRÉDITO SOMADOS DE M1 + M2) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                      Total Débito (M1+M2)
                    </span>
                    <h3 className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                      {formatCurrency(totalsSummary.totalDebit)}
                    </h3>
                    <span className="text-[10px] text-emerald-600/80 font-medium">Soma de todas as bandeiras</span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                    DÉB
                  </div>
                </div>

                <div className="bg-indigo-50 dark:bg-indigo-950/40 p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">
                      Total Crédito (M1+M2)
                    </span>
                    <h3 className="text-xl font-black text-indigo-700 dark:text-indigo-300 mt-0.5">
                      {formatCurrency(totalsSummary.totalCredit)}
                    </h3>
                    <span className="text-[10px] text-indigo-600/80 font-medium">À vista + Parcelado somados</span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                    CRÉD
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Total Geral Bruto
                    </span>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                      {formatCurrency(totalsSummary.totalGross)}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-medium">{pendingItems.length} lançamentos a conferir</span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-sm">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* OPÇÃO DE CONFERÊNCIA GLOBAL DO FDS (SE FOR SEGUNDA-FEIRA) */}
              {isMonday && weekendItems.length > 0 && (
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <Layers className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <h4 className="text-xs font-black text-indigo-950 dark:text-indigo-200">
                        Acumulado de Fim de Semana ({weekendItems.length} repasses de Sexta, Sáb e Dom)
                      </h4>
                      <p className="text-[11px] text-indigo-700 dark:text-indigo-400">
                        Você pode conferir por bandeira abaixo ou liquidar todo o montante de uma vez só.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowWeekendQuickAll(!showWeekendQuickAll)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all"
                  >
                    {showWeekendQuickAll ? 'Fechar Lote Único' : 'Conferir Lote Único Total'}
                  </button>
                </div>
              )}

              {/* SEÇÃO RÁPIDA DE CONFERÊNCIA TOTAL FDS */}
              {showWeekendQuickAll && weekendItems.length > 0 && (
                <div className="p-4 bg-white dark:bg-slate-900 border-2 border-indigo-300 dark:border-indigo-700 rounded-2xl space-y-3 animate-scale-up">
                  <div className="flex justify-between items-center text-xs font-black">
                    <span className="text-slate-600 dark:text-slate-300">Total Bruto FDS (Sexta + Sáb + Dom):</span>
                    <span className="text-base text-indigo-600 dark:text-indigo-400">{formatCurrency(totalsSummary.totalGross)}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <div className="sm:col-span-6 space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Total Líquido Creditado no Banco (R$)
                      </label>
                      <input 
                        type="text"
                        placeholder="R$ 0,00"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded-xl text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
                        value={formatCurrencyInputDisplay(weekendNetTyped)}
                        onChange={(e) => setWeekendNetTyped(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>

                    <div className="sm:col-span-4 bg-indigo-50/60 dark:bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[9px] uppercase text-slate-400 font-bold block">Taxa Retida</span>
                        <span className="font-black text-amber-600">
                          {formatCurrency(Math.max(0, totalsSummary.totalGross - parseCurrencyInput(weekendNetTyped)))}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] uppercase text-slate-400 font-bold block">% Média</span>
                        <span className="font-black text-amber-700 bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 rounded">
                          {totalsSummary.totalGross > 0 && parseCurrencyInput(weekendNetTyped) > 0
                            ? `${(((totalsSummary.totalGross - parseCurrencyInput(weekendNetTyped)) / totalsSummary.totalGross) * 100).toFixed(2)}%`
                            : '0%'}
                        </span>
                      </div>
                    </div>

                    <div className="sm:col-span-2 flex items-end">
                      <button
                        onClick={handleReconcileAllWeekend}
                        disabled={isSavingAllWeekend || parseCurrencyInput(weekendNetTyped) <= 0}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all"
                      >
                        {isSavingAllWeekend ? 'Salvando...' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* LISTA DE CARDS POR BANDEIRA & MODALIDADE (SOMANDO M1 + M2) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Repasses por Bandeira ({groupedBrandItems.length} grupos consolidados)
                  </h4>
                  <span className="text-[11px] font-bold text-slate-400">
                    Cada card soma as máquinas M1 e M2 daquela bandeira
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {groupedBrandItems.map((group) => {
                    const rawTyped = groupTypedValues[group.key] || '';
                    const typedNet = parseCurrencyInput(rawTyped);
                    const feeVal = Math.max(0, group.totalGross - typedNet);
                    const feePct = group.totalGross > 0 && typedNet > 0 ? (feeVal / group.totalGross) * 100 : 0;
                    const isSaving = savingKey === group.key;

                    return (
                      <div 
                        key={group.key}
                        className="bg-slate-50 dark:bg-slate-800/60 border-2 border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 transition-all hover:border-emerald-400 dark:hover:border-emerald-600 space-y-3 shadow-sm"
                      >
                        {/* Header do Card da Bandeira */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-md">
                              {group.brand.slice(0, 3).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                  Total {group.brand} - {group.modality}
                                </span>
                                {group.isWeekend && (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                    FDS
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-medium mt-0.5">
                                <span>Origem:</span>
                                {group.m1Gross > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold">
                                    M1: {formatCurrency(group.m1Gross)}
                                  </span>
                                )}
                                {group.m2Gross > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-bold">
                                    M2: {formatCurrency(group.m2Gross)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Bruto Esperado</span>
                            <span className="text-base font-black text-slate-900 dark:text-white">
                              {formatCurrency(group.totalGross)}
                            </span>
                          </div>
                        </div>

                        {/* Input do Valor Líquido Depositado & Cálculo de Taxa */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700 items-center">
                          <div className="sm:col-span-6 space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                              Valor Líquido Creditado na Conta (R$)
                            </label>
                            <input 
                              type="text"
                              placeholder="R$ 0,00"
                              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                              value={formatCurrencyInputDisplay(rawTyped)}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                setGroupTypedValues({ ...groupTypedValues, [group.key]: val });
                              }}
                            />
                          </div>

                          {/* Preview da Taxa Cobrada */}
                          <div className="sm:col-span-4 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <div className="text-left">
                              <span className="text-[9px] font-bold uppercase text-slate-400 block">Taxa Retida</span>
                              <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                                {formatCurrency(feeVal)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] font-bold uppercase text-slate-400 block">% Taxa</span>
                              <span className={`text-xs font-black px-1.5 py-0.5 rounded ${
                                feePct > 4 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {feePct > 0 ? `${feePct.toFixed(2)}%` : '0%'}
                              </span>
                            </div>
                          </div>

                          {/* Botão de Confirmação do Grupo */}
                          <div className="sm:col-span-2 flex items-end">
                            <button
                              onClick={() => handleReconcileGroup(group)}
                              disabled={isSaving || typedNet <= 0}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center space-x-1 shadow-sm"
                            >
                              {isSaving ? (
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <>
                                  <Check className="w-3.5 h-3.5" />
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
              </div>
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
