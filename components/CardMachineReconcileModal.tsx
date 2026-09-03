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
  key: string; // e.g. "2026-09-03_Visa_Débito"
  expectedDate: string;
  brand: string;
  modality: string;
  items: CardMachineReceivable[];
  saleDates: string[];
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

  // State for confirmed individual caixinha provisions
  const [confirmedProvisions, setConfirmedProvisions] = useState<{
    prolabore: boolean;
    impostos: boolean;
    reserva: boolean;
  }>({
    prolabore: false,
    impostos: false,
    reserva: false,
  });

  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');

  useEffect(() => {
    if (isOpen) {
      fetchPendingItems();
      const hoje = new Date().toISOString().slice(0, 10);
      try {
        const saved = localStorage.getItem(`belafarma_provisions_confirmed_${hoje}`);
        if (saved) {
          setConfirmedProvisions(JSON.parse(saved));
        } else {
          setConfirmedProvisions({ prolabore: false, impostos: false, reserva: false });
        }
      } catch (e) {}
    }
  }, [isOpen]);

  const handleToggleProvision = (key: 'prolabore' | 'impostos' | 'reserva') => {
    setConfirmedProvisions(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      const hoje = new Date().toISOString().slice(0, 10);
      localStorage.setItem(`belafarma_provisions_confirmed_${hoje}`, JSON.stringify(updated));
      
      const nomes = {
        prolabore: 'Pró-Labore (12%)',
        impostos: 'Impostos / DAS (4%)',
        reserva: 'Reserva de Emergência (1%)'
      };
      if (updated[key]) {
        addToast(`✅ Provisão de ${nomes[key]} marcada como separada na caixinha!`, 'success');
      } else {
        addToast(`Separação de ${nomes[key]} desfeita.`, 'info');
      }
      return updated;
    });
  };

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

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '';
    const clean = dateStr.split('T')[0];
    const parts = clean.split('-');
    if (parts.length !== 3) return dateStr;
    const [, m, d] = parts;
    return `${d}/${m}`;
  };

  const getShortWeekday = (dateStr: string) => {
    if (!dateStr) return '';
    const clean = dateStr.split('T')[0];
    const parts = clean.split('-');
    if (parts.length !== 3) return '';
    const [y, m, d] = parts;
    const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return weekdays[dt.getDay()] || '';
  };

  const formatFriendlyDate = (dateStr: string) => {
    if (!dateStr) return '';
    const clean = dateStr.split('T')[0];
    const parts = clean.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weekday = weekdays[dt.getDay()];
    return `${d}/${m}/${y} (${weekday})`;
  };

  const formatCategoryName = (modality: string) => {
    const m = (modality || '').trim();
    const mLower = m.toLowerCase();
    if (mLower === 'debito' || mLower === 'débito') return 'Débito';
    if (mLower.includes('parc')) return 'Crédito Parcelado';
    if (mLower.includes('vista') || mLower.includes('créd') || mLower.includes('cred')) return 'Crédito';
    return m || 'Geral';
  };

  const getBrandStyle = (brand: string) => {
    const b = (brand || '').toLowerCase();
    if (b.includes('visa')) {
      return {
        bg: 'bg-blue-600',
        text: 'text-blue-600 dark:text-blue-400',
        border: 'border-blue-200 dark:border-blue-800',
        badgeBg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
      };
    }
    if (b.includes('master')) {
      return {
        bg: 'bg-red-600',
        text: 'text-red-600 dark:text-red-400',
        border: 'border-red-200 dark:border-red-800',
        badgeBg: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
      };
    }
    if (b.includes('elo')) {
      return {
        bg: 'bg-amber-600',
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-800',
        badgeBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
      };
    }
    return {
      bg: 'bg-slate-600',
      text: 'text-slate-600 dark:text-slate-400',
      border: 'border-slate-200 dark:border-slate-800',
      badgeBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
    };
  };

  const getModalityBadgeStyle = (modality: string) => {
    const m = (modality || '').toLowerCase();
    if (m.includes('deb') || m.includes('déb')) {
      return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    }
    if (m.includes('parc')) {
      return 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    }
    return 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
  };

  const formatSaleDatesSummary = (items: CardMachineReceivable[]) => {
    const dates = Array.from(new Set(items.map(i => i.sale_date).filter(Boolean))).sort();
    if (dates.length === 0) return 'Data não informada';
    if (dates.length === 1) return formatDate(dates[0]);
    if (dates.length === 2) return `${formatDate(dates[0])} e ${formatDate(dates[1])}`;
    return `${formatDate(dates[0])} a ${formatDate(dates[dates.length - 1])} (${dates.length} dias)`;
  };

  const handleDismissToday = () => {
    onClose();
  };

  // Separa itens de fim de semana acumulados dos itens normais
  const isMonday = new Date().getDay() === 1;
  const weekendItems = pendingItems.filter(item => item.is_weekend_accumulated === 1);
  const regularItems = pendingItems.filter(item => item.is_weekend_accumulated !== 1);

  // Datas únicas esperadas para repasse (em que deveria cair no banco)
  const distinctExpectedDates = useMemo(() => {
    const dates = Array.from(new Set(pendingItems.map(i => i.expected_payment_date).filter(Boolean)));
    return dates.sort();
  }, [pendingItems]);

  // Itens exibidos no modal (considerando filtro de data opcional)
  const displayedItems = useMemo(() => {
    if (selectedDateFilter === 'all') return pendingItems;
    return pendingItems.filter(i => i.expected_payment_date === selectedDateFilter);
  }, [pendingItems, selectedDateFilter]);

  // Resumo textual das datas de repasse
  const expectedDatesSummaryText = useMemo(() => {
    if (distinctExpectedDates.length === 0) return '';
    if (distinctExpectedDates.length === 1) {
      return formatFriendlyDate(distinctExpectedDates[0]);
    }
    const first = distinctExpectedDates[0];
    const last = distinctExpectedDates[distinctExpectedDates.length - 1];
    return `${formatDate(first)} a ${formatDate(last)} (${distinctExpectedDates.length} datas)`;
  }, [distinctExpectedDates]);

  // Datas esperadas do fim de semana
  const weekendExpectedDates = useMemo(() => {
    return Array.from(new Set(weekendItems.map(i => i.expected_payment_date).filter(Boolean))).sort();
  }, [weekendItems]);

  // Agrupamento por DATA PREVISTA + BANDEIRA & MODALIDADE (Somando M1 + M2)
  const groupedBrandItems = useMemo(() => {
    const map = new Map<string, GroupedBrandItem>();

    displayedItems.forEach(item => {
      const modality = item.modality || 'Débito';
      const brand = item.brand || 'Outros';
      const expectedDate = item.expected_payment_date || '';
      const key = `${expectedDate}_${brand}_${modality}`;

      const gross = Number(item.gross_value) || 0;
      const isM2 = item.machine_name === 'M2';

      if (!map.has(key)) {
        map.set(key, {
          key,
          expectedDate,
          brand,
          modality,
          items: [item],
          saleDates: item.sale_date ? [item.sale_date] : [],
          totalGross: gross,
          m1Gross: isM2 ? 0 : gross,
          m2Gross: isM2 ? gross : 0,
          isWeekend: item.is_weekend_accumulated === 1
        });
      } else {
        const entry = map.get(key)!;
        entry.items.push(item);
        if (item.sale_date && !entry.saleDates.includes(item.sale_date)) {
          entry.saleDates.push(item.sale_date);
          entry.saleDates.sort();
        }
        entry.totalGross += gross;
        if (isM2) entry.m2Gross += gross;
        else entry.m1Gross += gross;
        if (item.is_weekend_accumulated === 1) entry.isWeekend = true;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      // Ordena por data esperada (mais antiga primeiro)
      if (a.expectedDate !== b.expectedDate) return a.expectedDate.localeCompare(b.expectedDate);
      if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
      return a.modality.localeCompare(b.modality);
    });
  }, [displayedItems]);

  // Totalizadores Gerais do Topo (M1 + M2 somados) baseados nos itens exibidos
  const totalsSummary = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    let totalGross = 0;

    displayedItems.forEach(item => {
      const val = Number(item.gross_value) || 0;
      totalGross += val;
      const mod = (item.modality || '').toLowerCase();
      if (mod.includes('deb') || mod.includes('déb')) {
        totalDebit += val;
      } else {
        totalCredit += val; // Crédito Geral
      }
    });

    return {
      totalDebit: Number(totalDebit.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
      totalGross: Number(totalGross.toFixed(2))
    };
  }, [displayedItems]);

  // Provisões calculadas sobre o total bruto dos recebíveis exibidos
  const provisions = useMemo(() => {
    const gross = totalsSummary.totalGross;
    const prolabore = gross * 0.12;
    const impostos = gross * 0.04;
    const reserva = gross * 0.01;
    return {
      prolabore: Number(prolabore.toFixed(2)),
      impostos: Number(impostos.toFixed(2)),
      reserva: Number(reserva.toFixed(2)),
      total: Number((prolabore + impostos + reserva).toFixed(2)),
      liquidoAposProvisoes: Number((gross - prolabore - impostos - reserva).toFixed(2))
    };
  }, [totalsSummary.totalGross]);

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
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <p className="text-xs text-emerald-100 font-medium">
                  Olá, {userName}! Confira os valores somados por bandeira e audite as taxas retidas no banco.
                </p>
                {expectedDatesSummaryText && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white font-black text-xs backdrop-blur-md border border-white/30 shadow-xs">
                    <Calendar className="w-3.5 h-3.5 text-emerald-200" />
                    <span>Deveria cair em: {expectedDatesSummaryText}</span>
                  </span>
                )}
              </div>
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
              {/* BANNER DE PROVISÕES DAS CAIXINHAS COM DESTAQUE DO TOTAL BRUTO DE REPASSE */}
              {totalsSummary.totalGross > 0 && (
                <div className="bg-slate-900 dark:bg-slate-950 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-slate-800 space-y-4">
                  {/* Cabeçalho do Banner com Total em Grande Destaque */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div className="flex items-center space-x-3">
                      <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                        <Percent className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-base font-black tracking-tight text-white">
                            Provisões Obrigatórias das Caixinhas
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                            Regra BelaFarma
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Ao cair o repasse no banco {expectedDatesSummaryText ? `(previsto: ${expectedDatesSummaryText})` : ''}, separe imediatamente os valores nas caixinhas para manter reservas e tributos em dia.
                        </p>
                      </div>
                    </div>

                    {/* Card de Destaque Máximo do Total Bruto */}
                    <div className="bg-emerald-950/70 border-2 border-emerald-500/50 rounded-2xl px-5 py-3.5 flex sm:flex-col justify-between items-end min-w-[220px] shadow-lg shadow-emerald-950/50">
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                        Total Bruto dos Repasses
                      </span>
                      <span className="text-2xl sm:text-3xl font-black text-emerald-300 tracking-tight mt-0.5">
                        {formatCurrency(totalsSummary.totalGross)}
                      </span>
                    </div>
                  </div>

                  {/* 3 Caixinhas de Provisão com Botões Individuais de Confirmação */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {/* 1. Pró-Labore (12%) */}
                    <div className={`p-4 rounded-2xl border transition-all ${
                      confirmedProvisions.prolabore 
                        ? 'bg-emerald-950/30 border-emerald-500/50 shadow-inner' 
                        : 'bg-slate-800/80 border-slate-700/80'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-300">
                          Pró-Labore
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          12%
                        </span>
                      </div>
                      <div className="mt-2 text-2xl font-black text-white">
                        {formatCurrency(provisions.prolabore)}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Caixinha Pró-Labore
                      </p>
                      <div className="pt-3 mt-2 border-t border-slate-700/60">
                        <button
                          onClick={() => handleToggleProvision('prolabore')}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                            confirmedProvisions.prolabore
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                              : 'bg-slate-700 hover:bg-purple-600 text-slate-200 hover:text-white'
                          }`}
                        >
                          {confirmedProvisions.prolabore ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                              <span>Separado na Caixinha ✅</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Confirmar Separação</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 2. Impostos / DAS (4%) */}
                    <div className={`p-4 rounded-2xl border transition-all ${
                      confirmedProvisions.impostos 
                        ? 'bg-emerald-950/30 border-emerald-500/50 shadow-inner' 
                        : 'bg-slate-800/80 border-slate-700/80'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-rose-300">
                          Impostos / DAS
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          4%
                        </span>
                      </div>
                      <div className="mt-2 text-2xl font-black text-white">
                        {formatCurrency(provisions.impostos)}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Caixinha Tributos
                      </p>
                      <div className="pt-3 mt-2 border-t border-slate-700/60">
                        <button
                          onClick={() => handleToggleProvision('impostos')}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                            confirmedProvisions.impostos
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                              : 'bg-slate-700 hover:bg-rose-600 text-slate-200 hover:text-white'
                          }`}
                        >
                          {confirmedProvisions.impostos ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                              <span>Separado na Caixinha ✅</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Confirmar Separação</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 3. Reserva Emergência (1%) */}
                    <div className={`p-4 rounded-2xl border transition-all ${
                      confirmedProvisions.reserva 
                        ? 'bg-emerald-950/30 border-emerald-500/50 shadow-inner' 
                        : 'bg-slate-800/80 border-slate-700/80'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-sky-300">
                          Reserva Emergência
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          1%
                        </span>
                      </div>
                      <div className="mt-2 text-2xl font-black text-white">
                        {formatCurrency(provisions.reserva)}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Caixinha Reserva
                      </p>
                      <div className="pt-3 mt-2 border-t border-slate-700/60">
                        <button
                          onClick={() => handleToggleProvision('reserva')}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                            confirmedProvisions.reserva
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                              : 'bg-slate-700 hover:bg-sky-600 text-slate-200 hover:text-white'
                          }`}
                        >
                          {confirmedProvisions.reserva ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                              <span>Separado na Caixinha ✅</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Confirmar Separação</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CARDS PREVISTOS POR BANDEIRA, CATEGORIA E DATA */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    Recebíveis Previstos por Bandeira, Categoria e Data ({groupedBrandItems.length} cards)
                  </h4>
                  <span className="text-[10px] text-slate-400 font-bold">
                    M1 + M2 consolidados por data de repasse
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {groupedBrandItems.map(group => {
                    const brandStyle = getBrandStyle(group.brand);
                    const categoryName = formatCategoryName(group.modality);
                    const todayStr = new Date().toISOString().slice(0, 10);
                    const isToday = group.expectedDate === todayStr;
                    const isPast = group.expectedDate < todayStr;

                    return (
                      <div 
                        key={`summary_${group.key}`}
                        className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all space-y-2.5"
                      >
                        {/* Header do Card: Bandeira + Categoria + Data (ex: Visa Crédito 02/09) */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-[11px] shadow-sm shrink-0 ${brandStyle.bg}`}>
                              {group.brand.slice(0, 3).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h5 className="text-xs font-black text-slate-900 dark:text-white truncate">
                                {group.brand} {categoryName}
                              </h5>
                              <span className="text-[10px] text-slate-400 font-medium">
                                {group.items.length} {group.items.length === 1 ? 'lançamento' : 'lançamentos'}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="px-2 py-1 rounded-lg text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-xs">
                              {formatDateShort(group.expectedDate)}
                            </span>
                          </div>
                        </div>

                        {/* Valor Bruto Total */}
                        <div className="flex items-baseline justify-between pt-1 border-t border-slate-100 dark:border-slate-700/60">
                          <span className="text-[10px] font-bold uppercase text-slate-400">Total Bruto</span>
                          <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                            {formatCurrency(group.totalGross)}
                          </span>
                        </div>

                        {/* Informações detalhadas de Data Prevista e Vendas */}
                        <div className="space-y-1 text-[10px] pt-1 border-t border-slate-100 dark:border-slate-700/60">
                          <div className="flex items-center justify-between text-slate-500">
                            <span className="flex items-center gap-1 font-medium">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              Deveria cair:
                            </span>
                            <span className={`font-bold ${isPast ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
                              {formatDate(group.expectedDate)} ({getShortWeekday(group.expectedDate)})
                              {isToday && ' • Hoje'}
                              {isPast && ' • Pendente'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-slate-500">
                            <span className="flex items-center gap-1 font-medium">
                              <Clock className="w-3 h-3 text-slate-400" />
                              Venda(s):
                            </span>
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                              {formatSaleDatesSummary(group.items)}
                            </span>
                          </div>

                          {(group.m1Gross > 0 && group.m2Gross > 0) && (
                            <div className="flex items-center gap-1.5 pt-1">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                                M1: {formatCurrency(group.m1Gross)}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300">
                                M2: {formatCurrency(group.m2Gross)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* TOTALIZADORES GERAIS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                      Total Débito
                    </span>
                    <h3 className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                      {formatCurrency(totalsSummary.totalDebit)}
                    </h3>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-[10px] shadow-sm">
                    DÉB
                  </div>
                </div>

                <div className="bg-indigo-50 dark:bg-indigo-950/40 p-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">
                      Total Crédito
                    </span>
                    <h3 className="text-lg font-black text-indigo-700 dark:text-indigo-300 mt-0.5">
                      {formatCurrency(totalsSummary.totalCredit)}
                    </h3>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-[10px] shadow-sm">
                    CRÉD
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Total Bruto Geral
                    </span>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                      {formatCurrency(totalsSummary.totalGross)}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-medium">{pendingItems.length} lançamentos</span>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-sm">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* OPÇÃO DE CONFERÊNCIA GLOBAL DO FDS (SE FOR SEGUNDA-FEIRA) */}
              {isMonday && weekendItems.length > 0 && (
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <Layers className="w-6 h-6 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs font-black text-indigo-950 dark:text-indigo-200">
                          Acumulado de Fim de Semana ({weekendItems.length} repasses de Sexta, Sáb e Dom)
                        </h4>
                        {weekendExpectedDates.length > 0 && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-200/80 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700">
                            Deveria cair em: {weekendExpectedDates.map(d => formatFriendlyDate(d)).join(', ')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-indigo-700 dark:text-indigo-400 mt-0.5">
                        Vendas de: <strong>{formatSaleDatesSummary(weekendItems)}</strong>. Você pode conferir por bandeira abaixo ou liquidar todo o montante de uma vez só.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowWeekendQuickAll(!showWeekendQuickAll)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all shrink-0"
                  >
                    {showWeekendQuickAll ? 'Fechar Lote Único' : 'Conferir Lote Único Total'}
                  </button>
                </div>
              )}

              {/* SEÇÃO RÁPIDA DE CONFERÊNCIA TOTAL FDS */}
              {showWeekendQuickAll && weekendItems.length > 0 && (
                <div className="p-4 bg-white dark:bg-slate-900 border-2 border-indigo-300 dark:border-indigo-700 rounded-2xl space-y-3 animate-scale-up">
                  <div className="flex justify-between items-center text-xs font-black">
                    <div className="space-y-0.5">
                      <span className="text-slate-600 dark:text-slate-300 block">Total Bruto FDS (Sexta + Sáb + Dom):</span>
                      {weekendExpectedDates.length > 0 && (
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium block">
                          Previsão de crédito: {weekendExpectedDates.map(d => formatFriendlyDate(d)).join(', ')}
                        </span>
                      )}
                    </div>
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

              {/* FILTRO POR DATA EM QUE DEVERIA CAIR (SE HOUVER MAIS DE UMA DATA PENDENTE) */}
              {distinctExpectedDates.length > 1 && (
                <div className="p-3 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      Filtrar por data em que deveria cair os valores:
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setSelectedDateFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                        selectedDateFilter === 'all'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      Todas as Datas ({pendingItems.length})
                    </button>
                    {distinctExpectedDates.map(date => {
                      const count = pendingItems.filter(i => i.expected_payment_date === date).length;
                      const total = pendingItems.filter(i => i.expected_payment_date === date).reduce((sum, cur) => sum + (Number(cur.gross_value) || 0), 0);
                      const todayStr = new Date().toISOString().slice(0, 10);
                      const isToday = date === todayStr;
                      const isPast = date < todayStr;
                      return (
                        <button
                          key={date}
                          onClick={() => setSelectedDateFilter(date)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                            selectedDateFilter === date
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          <span>{formatFriendlyDate(date)}</span>
                          {isToday && <span className="px-1.5 py-0.2 bg-emerald-700 text-white text-[9px] rounded font-black">Hoje</span>}
                          {isPast && <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[9px] rounded font-black">Pendente</span>}
                          <span className="text-[10px] opacity-80">({formatCurrency(total)})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* LISTA DE CARDS POR BANDEIRA & MODALIDADE (SOMANDO M1 + M2) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Repasses por Bandeira e Data ({groupedBrandItems.length} grupos consolidados)
                  </h4>
                  <span className="text-[11px] font-bold text-slate-400">
                    Cada card soma as máquinas M1 e M2 daquela data e bandeira
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {groupedBrandItems.map((group) => {
                    const rawTyped = groupTypedValues[group.key] || '';
                    const typedNet = parseCurrencyInput(rawTyped);
                    const feeVal = Math.max(0, group.totalGross - typedNet);
                    const feePct = group.totalGross > 0 && typedNet > 0 ? (feeVal / group.totalGross) * 100 : 0;
                    const isSaving = savingKey === group.key;
                    const todayStr = new Date().toISOString().slice(0, 10);
                    const isToday = group.expectedDate === todayStr;
                    const isPast = group.expectedDate < todayStr;

                    return (
                      <div 
                        key={group.key}
                        className="bg-slate-50 dark:bg-slate-800/60 border-2 border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 transition-all hover:border-emerald-400 dark:hover:border-emerald-600 space-y-3 shadow-sm"
                      >
                        {/* Header do Card: [Logo] Visa Crédito 02/09 */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start sm:items-center space-x-3">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-xs shadow-md shrink-0 mt-0.5 sm:mt-0 text-white ${getBrandStyle(group.brand).bg}`}>
                              {group.brand.slice(0, 3).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-black text-slate-900 dark:text-white">
                                  {group.brand} {formatCategoryName(group.modality)}
                                </span>

                                {/* DATA EM FORMATO CURTO (EX: 02/09) */}
                                <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-emerald-600 text-white shadow-xs">
                                  {formatDateShort(group.expectedDate)}
                                </span>

                                {/* DESTAQUE DA DATA EM QUE DEVERIA CAIR O VALOR */}
                                {group.expectedDate && (
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-black border shadow-xs ${
                                    isToday
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800'
                                      : isPast
                                      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800'
                                      : 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800'
                                  }`}>
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span>Deveria cair: {formatFriendlyDate(group.expectedDate)}</span>
                                    {isToday && (
                                      <span className="px-1 py-0.2 bg-emerald-600 text-white text-[9px] rounded font-black uppercase">Hoje</span>
                                    )}
                                    {isPast && (
                                      <span className="px-1 py-0.2 bg-amber-600 text-white text-[9px] rounded font-black uppercase">Pendente</span>
                                    )}
                                  </span>
                                )}

                                {group.isWeekend && (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-black bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                    FDS
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-medium mt-1">
                                {/* DATA DA VENDA ORIGINAL */}
                                <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <span>Venda(s): <strong className="font-bold">{formatSaleDatesSummary(group.items)}</strong></span>
                                </div>

                                <div className="flex items-center space-x-1.5">
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
                          </div>

                          <div className="text-right shrink-0">
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
