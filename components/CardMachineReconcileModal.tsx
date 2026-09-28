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
  Percent,
  ShoppingBag,
  Scale,
  Sliders,
  UserCheck
} from 'lucide-react';
import { CardMachineReceivable, CardBrand, CashClosingRecord } from '../types';
import { useToast } from './ToastContext';
import { getLocalDateKey } from '../utils';

interface CardMachineReconcileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToFullView?: () => void;
  userName?: string;
  onReconcileSuccess?: () => void;
  cashClosings?: CashClosingRecord[];
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
  onReconcileSuccess,
  cashClosings
}) => {
  const { addToast } = useToast();
  const [internalClosings, setInternalClosings] = useState<CashClosingRecord[]>(cashClosings || []);

  useEffect(() => {
    if (cashClosings && cashClosings.length > 0) {
      setInternalClosings(cashClosings);
    } else if (isOpen) {
      fetch('/api/cash-closings')
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          if (Array.isArray(data) && data.length > 0) setInternalClosings(data);
        })
        .catch(err => console.error('Erro ao buscar fechamentos de caixa:', err));
    }
  }, [cashClosings, isOpen]);
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

  const [paidDates, setPaidDates] = useState<string[]>([]);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
  const [includeOlderPending, setIncludeOlderPending] = useState<boolean>(false);

  // Integração com médias da Gestão de Preço e Mix de Vendas
  const [pricingAverages, setPricingAverages] = useState<any>(null);
  const [salesMixDayData, setSalesMixDayData] = useState<any>(null);
  const [isLoadingSalesMixDay, setIsLoadingSalesMixDay] = useState<boolean>(false);
  const [provisionRateMode, setProvisionRateMode] = useState<'mix' | 'pricing' | 'standard'>(() => {
    try {
      const saved = localStorage.getItem('belafarma_provision_rate_mode') as any;
      if (saved === 'mix' || saved === 'pricing' || saved === 'standard') return saved;
      return 'mix';
    } catch (e) {
      return 'mix';
    }
  });

  const fetchPricingAverages = async () => {
    try {
      const res = await fetch('/api/price-manager/customizations/averages');
      if (res.ok) {
        const d = await res.json();
        if (d.success) setPricingAverages(d);
      }
    } catch (e) {
      console.error('Erro ao buscar médias da precificação para o modal de conciliação:', e);
    }
  };

  const handleToggleProvisionRateMode = (mode: 'mix' | 'pricing' | 'standard') => {
    setProvisionRateMode(mode);
    try {
      localStorage.setItem('belafarma_provision_rate_mode', mode);
      window.dispatchEvent(new CustomEvent('belafarma_provision_mode_changed', { detail: mode }));
    } catch (e) {}
    addToast(
      mode === 'mix'
        ? '⚡ Caixinhas calculadas sobre o mix real de vendas do dia (excluindo crediário)!'
        : mode === 'pricing'
          ? '📊 Caixinhas atualizadas com as porcentagens da Gestão de Preço!'
          : '📋 Caixinhas retornaram ao padrão fixo (12% / 4% / 1%).',
      'info'
    );
  };

  useEffect(() => {
    if (isOpen) {
      fetchPricingAverages();
    }
    const handleModeChanged = (e: any) => {
      if (e.detail && (e.detail === 'mix' || e.detail === 'pricing' || e.detail === 'standard')) {
        setProvisionRateMode(e.detail);
      }
    };
    window.addEventListener('belafarma_provision_mode_changed', handleModeChanged);
    return () => window.removeEventListener('belafarma_provision_mode_changed', handleModeChanged);
  }, [isOpen]);

  const fetchPaidDates = async () => {
    try {
      const res = await fetch('/api/settings/paid_provisions_dates');
      if (res.ok) {
        const d = await res.json();
        if (d && d.value) {
          try {
            const parsed = JSON.parse(d.value);
            if (Array.isArray(parsed)) {
              setPaidDates(parsed);
              return parsed;
            }
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error('Erro ao buscar status de provisões pagas:', err);
    }
    return [];
  };

  const [ifoodData, setIfoodData] = useState<{
    today: string;
    sales: any[];
    totalExpected: number;
    totalGross: number;
    totalFee: number;
    count: number;
  } | null>(null);
  const [isReconcilingIfood, setIsReconcilingIfood] = useState(false);

  const fetchIFoodReconcile = async () => {
    try {
      const res = await fetch('/api/ifood-sales/reconcile-today');
      if (res.ok) {
        const data = await res.json();
        setIfoodData(data);
      }
    } catch (e) {
      console.error('Erro ao buscar repasses do iFood:', e);
    }
  };

  const handleReconcileSingleIFood = async (saleId: string) => {
    setIsReconcilingIfood(true);
    try {
      const res = await fetch(`/api/ifood-sales/${saleId}/reconcile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName })
      });
      if (res.ok) {
        addToast('✅ Repasse do iFood marcado como recebido e lançado na Conta Corrente!', 'success');
        fetchIFoodReconcile();
      } else {
        const err = await res.json();
        addToast(err.error || 'Erro ao conciliar repasse do iFood.', 'error');
      }
    } catch (err) {
      addToast('Erro ao conciliar repasse do iFood.', 'error');
    } finally {
      setIsReconcilingIfood(false);
    }
  };

  const handleReconcileAllIFood = async () => {
    if (!ifoodData?.sales || ifoodData.sales.length === 0) return;
    setIsReconcilingIfood(true);
    try {
      const saleIds = ifoodData.sales.map((s: any) => s.id);
      const res = await fetch('/api/ifood-sales/batch-reconcile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleIds, userName })
      });
      if (res.ok) {
        addToast(`✅ ${saleIds.length} repasse(s) do iFood conciliado(s) na Conta Corrente!`, 'success');
        fetchIFoodReconcile();
      } else {
        const err = await res.json();
        addToast(err.error || 'Erro ao conciliar repasses do iFood.', 'error');
      }
    } catch (err) {
      addToast('Erro ao conciliar repasses do iFood.', 'error');
    } finally {
      setIsReconcilingIfood(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPendingItems(false);
      fetchPaidDates();
      fetchIFoodReconcile();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleProvisionsUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setPaidDates(e.detail);
      } else {
        fetchPaidDates();
      }
    };
    window.addEventListener('belafarma_provisions_updated', handleProvisionsUpdated);
    return () => window.removeEventListener('belafarma_provisions_updated', handleProvisionsUpdated);
  }, []);

  const fetchPendingItems = async (fetchAll: boolean = false) => {
    setLoading(true);
    try {
      const url = fetchAll ? '/api/card-machine-receivables/pending-due?all=true' : '/api/card-machine-receivables/pending-due';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erro ao buscar pendências');
      const data: CardMachineReceivable[] = await res.json();
      setPendingItems(data);
    } catch (err: any) {
      console.error('Erro ao carregar pendências:', err);
      addToast('Não foi possível carregar os repasses.', 'error');
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
    const [y, m, d] = getLocalDateKey(dateStr).split('-');
    return `${d}/${m}/${y}`;
  };

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '';
    const clean = getLocalDateKey(dateStr);
    const parts = clean.split('-');
    if (parts.length !== 3) return dateStr;
    const [, m, d] = parts;
    return `${d}/${m}`;
  };

  const getShortWeekday = (dateStr: string) => {
    if (!dateStr) return '';
    const clean = getLocalDateKey(dateStr);
    const parts = clean.split('-');
    if (parts.length !== 3) return '';
    const [y, m, d] = parts;
    const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return weekdays[dt.getDay()] || '';
  };

  const formatFriendlyDate = (dateStr: string) => {
    if (!dateStr) return '';
    const clean = getLocalDateKey(dateStr);
    const parts = clean.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weekday = weekdays[dt.getDay()];
    return `${d}/${m}/${y} (${weekday})`;
  };

  // Retorna true se já passou do 2º dia útil após a data de referência (ex: fechamento ou venda)
  const isDatePastSecondDay = (dateStr: string): boolean => {
    if (!dateStr) return true;
    const cleanDate = getLocalDateKey(dateStr);
    const parts = cleanDate.split('-');
    if (parts.length !== 3) return true;
    const [y, m, d] = parts.map(Number);

    const fromDate = new Date(y, m - 1, d);
    fromDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (fromDate >= today) return false;

    let businessDays = 0;
    const cur = new Date(fromDate);
    while (cur < today) {
      cur.setDate(cur.getDate() + 1);
      const day = cur.getDay(); // 0 = Domingo, 6 = Sábado
      if (day !== 0 && day !== 6) {
        businessDays++;
      }
    }

    // 1º dia útil = 1, 2º dia útil = 2. Depois do 2º dia = businessDays > 2
    return businessDays > 2;
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

  // Identifica o fechamento de caixa de referência: EXCLUSIVAMENTE o do dia anterior (ontem) ou o mais recente concluído
  const { referenceClosingSales, referenceClosingGross, referenceClosingCrediario, referenceClosingDatesFormatted, effectiveProvisionDates } = useMemo(() => {
    if (!internalClosings || internalClosings.length === 0) {
      return {
        referenceClosingSales: 0,
        referenceClosingGross: 0,
        referenceClosingCrediario: 0,
        referenceClosingDatesFormatted: '',
        effectiveProvisionDates: []
      };
    }

    const sorted = [...internalClosings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestClosing = sorted[0];

    if (!latestClosing || !latestClosing.date) {
      return {
        referenceClosingSales: 0,
        referenceClosingGross: 0,
        referenceClosingCrediario: 0,
        referenceClosingDatesFormatted: '',
        effectiveProvisionDates: []
      };
    }

    const dateKey = getLocalDateKey(latestClosing.date);
    const gross = Number(latestClosing.totalSales) || 0;
    const crediario = Number(latestClosing.totalCrediario) || 0;
    const netSales = Math.max(0, gross - crediario);

    return {
      referenceClosingSales: Number(netSales.toFixed(2)),
      referenceClosingGross: Number(gross.toFixed(2)),
      referenceClosingCrediario: Number(crediario.toFixed(2)),
      referenceClosingDatesFormatted: formatDate(dateKey),
      effectiveProvisionDates: [dateKey]
    };
  }, [internalClosings]);

  // Busca o mix de vendas item a item do dia de fechamento de referência (excluindo crediário)
  useEffect(() => {
    if (isOpen && effectiveProvisionDates.length > 0) {
      const dateKey = effectiveProvisionDates[0];
      setIsLoadingSalesMixDay(true);
      fetch(`/api/provisions/sales-mix?date=${dateKey}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.success) {
            setSalesMixDayData(data);
          }
        })
        .catch(err => console.error('Erro ao buscar mix de vendas para a data:', err))
        .finally(() => setIsLoadingSalesMixDay(false));
    }
  }, [isOpen, effectiveProvisionDates]);

  // Registro diário do Mix de Vendas para o dia de referência
  const dayMixRecord = useMemo(() => {
    if (effectiveProvisionDates.length === 0 || !salesMixDayData?.dailyBreakdown) return null;
    const dateKey = effectiveProvisionDates[0];
    return salesMixDayData.dailyBreakdown[dateKey] || null;
  }, [effectiveProvisionDates, salesMixDayData]);

  // Taxas ativas (dinâmicas conforme Mix de Vendas, Gestão de Preço ou Padrão)
  const activeRates = useMemo(() => {
    if (provisionRateMode === 'mix' && dayMixRecord) {
      return {
        prolabore: dayMixRecord.effectiveProlaborePct / 100,
        socio1: dayMixRecord.effectiveSocio1Pct / 100,
        socio2: dayMixRecord.effectiveSocio2Pct / 100,
        tax: dayMixRecord.effectiveImpostosPct / 100,
        reserve: dayMixRecord.effectiveLucroPct / 100,
        prolaborePctDisplay: dayMixRecord.effectiveProlaborePct,
        socio1PctDisplay: dayMixRecord.effectiveSocio1Pct,
        socio2PctDisplay: dayMixRecord.effectiveSocio2Pct,
        taxPctDisplay: dayMixRecord.effectiveImpostosPct,
        reservePctDisplay: dayMixRecord.effectiveLucroPct,
        isCustom: dayMixRecord.customCount > 0,
        totalItems: dayMixRecord.customCount,
        customItems: dayMixRecord.customItems || []
      };
    }

    const hasCustom = pricingAverages && pricingAverages.totalModifiedProducts > 0;
    if (provisionRateMode === 'pricing' && hasCustom) {
      const avg = pricingAverages.simpleAverages;
      const prolabore = (avg.proLaboreTotalPct || 12) / 100;
      const socio1 = (avg.proLabore1Pct || avg.proLaboreTotalPct / 2 || 6) / 100;
      const socio2 = (avg.proLabore2Pct || avg.proLaboreTotalPct / 2 || 6) / 100;
      const tax = (avg.impostoPct || 4) / 100;
      const reserve = (avg.margemLiquidaPct || 1) / 100; // Lucro Líquido / Reserva

      return {
        prolabore,
        socio1,
        socio2,
        tax,
        reserve,
        prolaborePctDisplay: avg.proLaboreTotalPct,
        socio1PctDisplay: avg.proLabore1Pct,
        socio2PctDisplay: avg.proLabore2Pct,
        taxPctDisplay: avg.impostoPct,
        reservePctDisplay: avg.margemLiquidaPct,
        isCustom: true,
        totalItems: pricingAverages.totalModifiedProducts,
        customItems: []
      };
    }

    return {
      prolabore: 0.12,
      socio1: 0.06,
      socio2: 0.06,
      tax: 0.04,
      reserve: 0.01,
      prolaborePctDisplay: 12,
      socio1PctDisplay: 6,
      socio2PctDisplay: 6,
      taxPctDisplay: 4,
      reservePctDisplay: 1,
      isCustom: false,
      totalItems: pricingAverages?.totalModifiedProducts || 0,
      customItems: []
    };
  }, [provisionRateMode, dayMixRecord, pricingAverages]);

  // Base de cálculo das provisões: Faturamento líquido do Fechamento (sem crediário) ou repasses caso não haja fechamento
  const provisionBaseValue = useMemo(() => {
    if (provisionRateMode === 'mix' && dayMixRecord && dayMixRecord.sales > 0) {
      return dayMixRecord.sales;
    }
    return referenceClosingSales > 0 ? referenceClosingSales : totalsSummary.totalGross;
  }, [provisionRateMode, dayMixRecord, referenceClosingSales, totalsSummary.totalGross]);

  // Provisões calculadas sobre o fechamento do dia anterior (s/ crediário)
  const provisions = useMemo(() => {
    const base = provisionBaseValue;
    if (provisionRateMode === 'mix' && dayMixRecord) {
      return {
        base,
        prolabore: dayMixRecord.prolabore,
        socio1: dayMixRecord.socio1,
        socio2: dayMixRecord.socio2,
        impostos: dayMixRecord.impostos,
        reserva: dayMixRecord.lucro,
        total: Number((dayMixRecord.prolabore + dayMixRecord.impostos + dayMixRecord.lucro).toFixed(2)),
        liquidoAposProvisoes: Number((totalsSummary.totalGross - dayMixRecord.prolabore - dayMixRecord.impostos - dayMixRecord.lucro).toFixed(2))
      };
    }

    const prolabore = base * activeRates.prolabore;
    const socio1 = base * activeRates.socio1;
    const socio2 = base * activeRates.socio2;
    const impostos = base * activeRates.tax;
    const reserva = base * activeRates.reserve;
    return {
      base,
      prolabore: Number(prolabore.toFixed(2)),
      socio1: Number(socio1.toFixed(2)),
      socio2: Number(socio2.toFixed(2)),
      impostos: Number(impostos.toFixed(2)),
      reserva: Number(reserva.toFixed(2)),
      total: Number((prolabore + impostos + reserva).toFixed(2)),
      liquidoAposProvisoes: Number((totalsSummary.totalGross - prolabore - impostos - reserva).toFixed(2))
    };
  }, [provisionBaseValue, provisionRateMode, dayMixRecord, totalsSummary.totalGross, activeRates]);

  // Sincroniza os botões do modal com os registros persistidos de provisão
  useEffect(() => {
    if (effectiveProvisionDates.length === 0) return;
    const isProlabore = effectiveProvisionDates.every(d => paidDates.includes(`prolabore-${d}`));
    const isTax = effectiveProvisionDates.every(d => paidDates.includes(`tax-${d}`));
    const isReserve = effectiveProvisionDates.every(d => paidDates.includes(`reserve-${d}`));

    setConfirmedProvisions({
      prolabore: isProlabore,
      impostos: isTax,
      reserva: isReserve
    });
  }, [effectiveProvisionDates, paidDates]);

  // Verifica se o fechamento já teve todas as provisões feitas
  const isAlreadyProvisioned = useMemo(() => {
    if (effectiveProvisionDates.length === 0) return false;
    return effectiveProvisionDates.every(d => {
      const p = paidDates.includes(`prolabore-${d}`);
      const t = paidDates.includes(`tax-${d}`);
      const r = paidDates.includes(`reserve-${d}`);
      return p && t && r;
    });
  }, [effectiveProvisionDates, paidDates]);

  // Verifica se a provisão já passou de 2 dias após a data de fechamento
  const isProvisionsPastSecondDay = useMemo(() => {
    if (effectiveProvisionDates.length === 0) return false;
    return effectiveProvisionDates.every(d => isDatePastSecondDay(d));
  }, [effectiveProvisionDates]);

  // Regra BelaFarma: Pedir apenas o último fechamento se não tiver tido feito provisão.
  // Fica disponível na modal por dois dias e depois some.
  const shouldShowProvisionsBanner = useMemo(() => {
    if (provisionBaseValue <= 0) return false;

    // Se já passou de 2 dias após a data do fechamento: descarta e SOME completamente da modal!
    if (isProvisionsPastSecondDay) {
      return false;
    }

    // Se já teve todas as provisões feitas: NÃO PEDE (some da modal)!
    if (isAlreadyProvisioned) {
      return false;
    }

    return true;
  }, [provisionBaseValue, isProvisionsPastSecondDay, isAlreadyProvisioned]);

  // Alterna e salva o status de provisão diretamente no banco e notifica a guia de Caixinhas
  const handleToggleProvision = async (key: 'prolabore' | 'impostos' | 'reserva') => {
    const prefix = key === 'prolabore' ? 'prolabore' : key === 'impostos' ? 'tax' : 'reserve';
    const isCurrentlyConfirmed = confirmedProvisions[key];

    // Busca a lista mais recente do servidor para evitar sobrescrita
    let currentPaid = [...paidDates];
    try {
      const res = await fetch('/api/settings/paid_provisions_dates');
      if (res.ok) {
        const d = await res.json();
        if (d && d.value) {
          try {
            const parsed = JSON.parse(d.value);
            if (Array.isArray(parsed)) currentPaid = parsed;
          } catch (e) {}
        }
      }
    } catch (e) {}

    let updated = [...currentPaid];
    const keysToToggle = effectiveProvisionDates.map(d => `${prefix}-${d}`);

    if (isCurrentlyConfirmed) {
      updated = updated.filter(k => !keysToToggle.includes(k));
    } else {
      keysToToggle.forEach(k => {
        if (!updated.includes(k)) updated.push(k);
      });
    }

    setPaidDates(updated);
    setConfirmedProvisions(prev => ({ ...prev, [key]: !isCurrentlyConfirmed }));

    try {
      const res = await fetch('/api/settings/paid_provisions_dates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(updated) })
      });
      if (!res.ok) throw new Error('Falha ao salvar no servidor');

      const hoje = new Date().toISOString().slice(0, 10);
      try {
        localStorage.setItem(`belafarma_provisions_confirmed_${hoje}`, JSON.stringify({
          ...confirmedProvisions,
          [key]: !isCurrentlyConfirmed
        }));
      } catch (e) {}

      // Dispara evento global para o painel de Caixinhas de Provisão atualizar imediatamente
      window.dispatchEvent(new CustomEvent('belafarma_provisions_updated', { detail: updated }));

      const nomes = {
        prolabore: `Pró-Labore (${activeRates.prolaborePctDisplay.toFixed(1)}%)`,
        impostos: `Impostos / DAS (${activeRates.taxPctDisplay.toFixed(1)}%)`,
        reserva: `Reserva / Lucro (${activeRates.reservePctDisplay.toFixed(1)}%)`
      };

      if (!isCurrentlyConfirmed) {
        addToast(`✅ Provisão de ${nomes[key]} separada na caixinha e sincronizada no Financeiro!`, 'success');
      } else {
        addToast(`Separação de ${nomes[key]} desfeita e atualizada no Financeiro.`, 'info');
      }

      if (onReconcileSuccess) onReconcileSuccess();
    } catch (err: any) {
      console.error('Erro ao sincronizar provisões:', err);
      addToast('Erro ao sincronizar provisão com o servidor.', 'error');
    }
  };

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
                  {includeOlderPending ? 'Histórico Completo' : (isMonday ? 'Segunda-feira (Acumulado FDS)' : 'Semana passada em diante')}
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
          ) : (
            <div className="space-y-6">
              {/* SEÇÃO DE REPASSES IFOOD (NAPP SOLUTIONS) DO DIA */}
              {ifoodData && ifoodData.count > 0 && (
                <div className="bg-gradient-to-br from-red-500/10 via-orange-500/5 to-rose-500/10 dark:from-red-950/40 dark:to-orange-950/20 border-2 border-red-500/30 rounded-3xl p-5 sm:p-6 shadow-lg space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-red-200/40 dark:border-red-800/40">
                    <div className="flex items-center space-x-3">
                      <div className="w-11 h-11 rounded-2xl bg-red-500 text-white flex items-center justify-center shadow-md shadow-red-500/30">
                        <ShoppingBag className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-black text-slate-900 dark:text-white">Repasses iFood do Dia (D+30)</h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500 text-white shadow-xs">
                            {ifoodData.count} {ifoodData.count === 1 ? 'pedido previsto' : 'pedidos previstos'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Recebimentos programados para hoje ou pendentes dos pedidos via Napp Solutions.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Líquido Previsto</span>
                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                          {ifoodData.totalExpected.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                      <button
                        onClick={handleReconcileAllIFood}
                        disabled={isReconcilingIfood}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>Conciliar Todos</span>
                      </button>
                    </div>
                  </div>

                  {/* Lista de Pedidos iFood para Repasse */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {ifoodData.sales.map((sale: any) => (
                      <div 
                        key={sale.id}
                        className="bg-white dark:bg-slate-800/90 border border-red-200 dark:border-red-900/30 rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-2 hover:border-red-400 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xs font-black text-slate-900 dark:text-white block">
                              {sale.description || `iFood #${sale.id}`}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3 text-red-500" />
                              Venda: {sale.sale_date ? sale.sale_date.split('-').reverse().join('/') : '-'} | Previsão: {sale.payment_due_date ? sale.payment_due_date.split('-').reverse().join('/') : '-'}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Taxa: {sale.operator_fee_percent}%
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Bruto: R$ {Number(sale.gross_value || 0).toFixed(2)}</span>
                            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                              Líquido: R$ {Number(sale.net_value || 0).toFixed(2)}
                            </span>
                          </div>
                          <button
                            onClick={() => handleReconcileSingleIFood(sale.id)}
                            disabled={isReconcilingIfood}
                            className="px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-emerald-600 dark:hover:bg-emerald-500 dark:hover:text-white rounded-xl text-xs font-black transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Confirmar Depósito</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pendingItems.length === 0 ? (
                <div className="py-8 text-center space-y-3 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200/60 dark:border-slate-800">
                  <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-800 dark:text-slate-100">
                      {ifoodData && ifoodData.count > 0 ? 'Maquininhas de cartão 100% conferidas!' : 'Tudo conferido por aqui!'}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                      Não há repasses de cartão pendentes de conferência da semana passada em diante.
                    </p>
                    {!includeOlderPending && (
                      <div className="pt-2">
                        <button
                          onClick={() => {
                            setIncludeOlderPending(true);
                            fetchPendingItems(true);
                          }}
                          className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Consultar pendências anteriores à semana passada</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {(!ifoodData || ifoodData.count === 0) && (
                    <button
                      onClick={onClose}
                      className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Concluir
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* BANNER DE PROVISÕES DAS CAIXINHAS COM DESTAQUE DO TOTAL BRUTO DE REPASSE */}
                  {shouldShowProvisionsBanner && (
                    <div className="bg-slate-900 dark:bg-slate-950 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-slate-800 space-y-4">
                  {/* Cabeçalho do Banner com Total em Grande Destaque */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div className="flex items-center space-x-3">
                      <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                        <Percent className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-black tracking-tight text-white">
                            Provisões Obrigatórias das Caixinhas
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/30 text-emerald-300 border border-emerald-500/40">
                            ⚡ Mix Real de Vendas (s/ Crediário) {activeRates.isCustom ? `• ${activeRates.totalItems} especial(is)` : ''}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Calculadas sobre o faturamento à vista do <strong>último fechamento {referenceClosingDatesFormatted ? `(${referenceClosingDatesFormatted})` : ''}: {formatCurrency(provisionBaseValue)}</strong>
                          {referenceClosingCrediario > 0 ? ` (crediário vendido de ${formatCurrency(referenceClosingCrediario)} desconsiderado)` : ''}
                          {dayMixRecord && (dayMixRecord.crediarioReceived || 0) > 0 ? ` (+ ${formatCurrency(dayMixRecord.crediarioReceived)} de crediário recebido no dia)` : ''}.
                        </p>
                      </div>
                    </div>

                    {/* Cards de Destaque */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
                      {/* Card Base de Fechamento */}
                      <div className="bg-indigo-950/70 border-2 border-indigo-500/50 rounded-2xl px-4 py-3 flex sm:flex-col justify-between sm:items-end min-w-[190px] shadow-lg shadow-indigo-950/50">
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                          {referenceClosingDatesFormatted 
                            ? `Último Fechamento (${referenceClosingDatesFormatted})` 
                            : 'Último Fechamento'}
                        </span>
                        <span className="text-2xl sm:text-3xl font-black text-indigo-200 tracking-tight mt-0.5">
                          {formatCurrency(provisionBaseValue)}
                        </span>
                        <span className="text-[10px] text-indigo-400 font-medium">
                          Base à Vista (s/ Crediário)
                        </span>
                      </div>

                      {/* Card Repasses a Conferir */}
                      <div className="bg-emerald-950/70 border-2 border-emerald-500/50 rounded-2xl px-4 py-3 flex sm:flex-col justify-between sm:items-end min-w-[180px] shadow-lg shadow-emerald-950/50">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                          Repasses a Conferir
                        </span>
                        <span className="text-2xl sm:text-3xl font-black text-emerald-300 tracking-tight mt-0.5">
                          {formatCurrency(totalsSummary.totalGross)}
                        </span>
                        <span className="text-[10px] text-emerald-400/80 font-medium">
                          Valor Bruto em Cartão
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 3 Caixinhas de Provisão com Botões Individuais de Confirmação */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {/* 1. Pró-Labore */}
                    {(!isProvisionsPastSecondDay || confirmedProvisions.prolabore) && (
                      <div className={`p-4 rounded-2xl border transition-all ${
                        confirmedProvisions.prolabore 
                          ? 'bg-emerald-950/30 border-emerald-500/50 shadow-inner' 
                          : 'bg-slate-800/80 border-slate-700/80'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider text-purple-300">
                            Pró-Labore dos Sócios
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            {activeRates.prolaborePctDisplay.toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">
                          {formatCurrency(provisions.prolabore)}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {activeRates.prolaborePctDisplay.toFixed(1)}% do fechamento ({formatCurrency(provisionBaseValue)})
                        </p>
                        {activeRates.isCustom && (
                          <div className="mt-1 pt-1 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-purple-200">
                            <span>S1 ({activeRates.socio1PctDisplay.toFixed(1)}%): <strong>{formatCurrency(provisions.socio1)}</strong></span>
                            <span>S2 ({activeRates.socio2PctDisplay.toFixed(1)}%): <strong>{formatCurrency(provisions.socio2)}</strong></span>
                          </div>
                        )}
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
                    )}

                    {/* 2. Impostos / DAS */}
                    {(!isProvisionsPastSecondDay || confirmedProvisions.impostos) && (
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
                            {activeRates.taxPctDisplay.toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">
                          {formatCurrency(provisions.impostos)}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {activeRates.taxPctDisplay.toFixed(1)}% do fechamento ({formatCurrency(provisionBaseValue)})
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
                    )}

                    {/* 3. Reserva / Lucro */}
                    {(!isProvisionsPastSecondDay || confirmedProvisions.reserva) && (
                      <div className={`p-4 rounded-2xl border transition-all ${
                        confirmedProvisions.reserva 
                          ? 'bg-emerald-950/30 border-emerald-500/50 shadow-inner' 
                          : 'bg-slate-800/80 border-slate-700/80'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider text-sky-300">
                            Lucro / Fundo de Reserva
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            {activeRates.reservePctDisplay.toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">
                          {formatCurrency(provisions.reserva)}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {activeRates.reservePctDisplay.toFixed(1)}% do fechamento ({formatCurrency(provisionBaseValue)})
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
                    )}
                  </div>

                  {/* Resumo Total das Provisões Obrigatórias */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-xs">
                    <span className="text-slate-300 font-medium">
                      Total a Separar Hoje ({((activeRates.prolabore + activeRates.tax + activeRates.reserve) * 100).toFixed(1)}% do faturamento de {formatCurrency(provisionBaseValue)}):
                    </span>
                    <span className="font-black text-emerald-300 text-base">
                      {formatCurrency(provisions.total)}
                    </span>
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
