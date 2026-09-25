import React, { useState, useEffect, useMemo } from 'react';
import { 
  PiggyBank, 
  Landmark, 
  ShieldCheck, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  Layers,
  Info,
  RefreshCw,
  Filter,
  XCircle,
  Scale,
  Sparkles,
  UserCheck,
  DollarSign,
  Sliders,
  ChevronDown,
  ChevronUp,
  Calculator,
  ArrowRight
} from 'lucide-react';
import { CashClosingRecord, FixedAccount } from '../types';
import { useToast } from './ToastContext';

import { getLocalDateKey } from '../utils';

interface PricingAverages {
  totalModifiedProducts: number;
  simpleAverages: {
    proLabore1Pct: number;
    proLabore2Pct: number;
    proLaboreTotalPct: number;
    custoFixoPct: number;
    impostoPct: number;
    taxaCartaoPct: number;
    custosVariaveisPct: number;
    margemLiquidaPct: number;
    markupDivisor: number;
    markupMultiplicador: number;
  };
  weightedAverages: {
    proLaboreTotalPct: number;
    custoFixoPct: number;
    impostoPct: number;
    taxaCartaoPct: number;
    custosVariaveisPct: number;
    margemLiquidaPct: number;
    totalEstoqueValor: number;
  };
  items: any[];
}

export interface SalesMixCustomItem {
  produtoId: number;
  descricao: string;
  vendas: number;
  qtd: number;
  prolaborePct: number;
  prolaboreValor: number;
}

export interface SalesMixDailyRecord {
  date: string;
  sales: number;
  prolabore: number;
  socio1: number;
  socio2: number;
  lucro: number;
  impostos: number;
  effectiveProlaborePct: number;
  effectiveSocio1Pct: number;
  effectiveSocio2Pct: number;
  effectiveLucroPct: number;
  effectiveImpostosPct: number;
  customCount: number;
  totalItems: number;
  customItems: SalesMixCustomItem[];
}

export interface SalesMixResponse {
  success: boolean;
  monthSummary: {
    totalSales: number;
    totalProlabore: number;
    totalSocio1: number;
    totalSocio2: number;
    totalLucro: number;
    totalImpostos: number;
    effectiveProlaborePct: number;
    effectiveSocio1Pct: number;
    effectiveSocio2Pct: number;
    effectiveLucroPct: number;
    effectiveImpostosPct: number;
    totalCustomItemsCount: number;
  };
  dailyBreakdown: Record<string, SalesMixDailyRecord>;
  totalDays: number;
}

interface ProvisionsPanelProps {
  cashClosings: CashClosingRecord[];
  fixedAccounts?: FixedAccount[];
}

const formatBRL = (val: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const getDateKey = (rawDate: string): string => {
  return getLocalDateKey(rawDate);
};

// Retorna true se já passou do 2º dia útil após a data de fechamento
const isDatePastSecondDay = (rawDate: string): boolean => {
  if (!rawDate) return true;
  const cleanDate = getLocalDateKey(rawDate);
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

  // 1º dia útil = 1, 2º dia útil = 2. Depois do 2º dia útil = businessDays > 2
  return businessDays > 2;
};

const formatClosingDate = (rawDate: string): { dateFormatted: string; weekday: string } => {
  if (!rawDate) return { dateFormatted: '--/--/----', weekday: '' };
  const dateOnly = getLocalDateKey(rawDate);
  const parts = dateOnly.split('-');
  if (parts.length !== 3) return { dateFormatted: rawDate, weekday: '' };
  const [y, m, d] = parts.map(Number);
  const dateFormatted = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  const dt = new Date(y, m - 1, d);
  const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const weekday = weekdays[dt.getDay()] || '';
  return { dateFormatted, weekday };
};

export const ProvisionsPanel: React.FC<ProvisionsPanelProps> = ({ cashClosings }) => {
  const { addToast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [paidProvisionsDates, setPaidProvisionsDates] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [filterMode, setFilterMode] = useState<'provisioned' | 'all' | 'pending'>('provisioned');

  // Integração com as Médias da Gestão de Preço / Precificação e Mix de Vendas
  const [pricingAverages, setPricingAverages] = useState<PricingAverages | null>(null);
  const [isLoadingAverages, setIsLoadingAverages] = useState(false);
  const [salesMixData, setSalesMixData] = useState<SalesMixResponse | null>(null);
  const [isLoadingMix, setIsLoadingMix] = useState(false);

  const [provisionRateMode, setProvisionRateMode] = useState<'mix' | 'pricing' | 'standard'>(() => {
    try {
      const saved = localStorage.getItem('belafarma_provision_rate_mode') as any;
      if (saved === 'mix' || saved === 'pricing' || saved === 'standard') return saved;
      return 'mix';
    } catch (e) {
      return 'mix';
    }
  });
  const [isPricingExpanded, setIsPricingExpanded] = useState(true);
  const [simClosingValue, setSimClosingValue] = useState<string>('');

  // Busca configurações de datas de provisões pagas
  const fetchPaidDates = async () => {
    try {
      const res = await fetch('/api/settings/paid_provisions_dates');
      if (res.ok) {
        const d = await res.json();
        if (d && d.value) {
          try {
            const parsed = JSON.parse(d.value);
            if (Array.isArray(parsed)) setPaidProvisionsDates(parsed);
          } catch(e) {}
        }
      }
    } catch (err) {
      console.error('Erro ao buscar status de provisões pagas:', err);
    }
  };

  // Busca as médias calculadas pelo Gestão de Preço
  const fetchPricingAverages = async () => {
    setIsLoadingAverages(true);
    try {
      const res = await fetch('/api/price-manager/customizations/averages');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPricingAverages(data);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar médias de precificação:', err);
    } finally {
      setIsLoadingAverages(false);
    }
  };

  // Busca o mix ponderado de vendas item a item sem crediário
  const fetchSalesMix = async () => {
    setIsLoadingMix(true);
    try {
      const res = await fetch(`/api/provisions/sales-mix?year=${selectedYear}&month=${selectedMonth}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSalesMixData(data);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar mix de vendas:', err);
    } finally {
      setIsLoadingMix(false);
    }
  };

  const handleToggleRateMode = (mode: 'mix' | 'pricing' | 'standard') => {
    setProvisionRateMode(mode);
    try {
      localStorage.setItem('belafarma_provision_rate_mode', mode);
      window.dispatchEvent(new CustomEvent('belafarma_provision_mode_changed', { detail: mode }));
    } catch (e) {}
    addToast(
      mode === 'mix'
        ? '⚡ Caixinhas agora calculam sobre o mix real dos itens vendidos no dia (excluindo crediário)!'
        : mode === 'pricing' 
          ? '📊 Caixinhas agora utilizam as médias salvas na Gestão de Preço!' 
          : '📋 Caixinhas retornaram ao padrão fixo (12% / 4% / 1%).', 
      'info'
    );
  };

  useEffect(() => {
    fetchPaidDates();
    fetchPricingAverages();
  }, []);

  useEffect(() => {
    fetchSalesMix();
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    const handleProvisionsUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setPaidProvisionsDates(e.detail);
      } else {
        fetchPaidDates();
      }
    };

    const handleModeChanged = (e: any) => {
      if (e.detail && (e.detail === 'mix' || e.detail === 'pricing' || e.detail === 'standard')) {
        setProvisionRateMode(e.detail);
      }
    };

    window.addEventListener('belafarma_provisions_updated', handleProvisionsUpdated);
    window.addEventListener('belafarma_provision_mode_changed', handleModeChanged);
    return () => {
      window.removeEventListener('belafarma_provisions_updated', handleProvisionsUpdated);
      window.removeEventListener('belafarma_provision_mode_changed', handleModeChanged);
    };
  }, []);

  // Data de início oficial das provisões das caixinhas (ignora fechamentos anteriores a 31/08/2026)
  const PROVISION_START_DATE = '2026-08-31';

  // Fechamentos filtrados para o mês/ano selecionado a partir de 31/08/2026
  const monthClosings = useMemo(() => {
    return cashClosings
      .filter(c => {
        if (!c.date) return false;
        const dateOnly = getDateKey(c.date);
        if (dateOnly < PROVISION_START_DATE) return false;
        const [y, m] = dateOnly.split('-');
        return parseInt(y) === selectedYear && parseInt(m) - 1 === selectedMonth;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [cashClosings, selectedMonth, selectedYear]);

  // Faturamento total do mês selecionado excluindo crediário
  const totalMonthNetSales = useMemo(() => {
    return monthClosings.reduce((sum, c) => {
      const cred = Number(c.totalCrediario) || 0;
      return sum + Math.max(0, (Number(c.totalSales) || 0) - cred);
    }, 0);
  }, [monthClosings]);

  const totalMonthGrossSales = useMemo(() => {
    return monthClosings.reduce((sum, c) => sum + (Number(c.totalSales) || 0), 0);
  }, [monthClosings]);

  const totalMonthCrediario = useMemo(() => {
    return monthClosings.reduce((sum, c) => sum + (Number(c.totalCrediario) || 0), 0);
  }, [monthClosings]);

  // Faturamento base para provisões do mês (no mix real, usa o total sem crediário retornado pelo Digifarma)
  const totalMonthSales = useMemo(() => {
    if (provisionRateMode === 'mix' && salesMixData?.monthSummary && salesMixData.monthSummary.totalSales > 0) {
      return salesMixData.monthSummary.totalSales;
    }
    return totalMonthNetSales;
  }, [provisionRateMode, salesMixData, totalMonthNetSales]);

  // Taxas ativas (dinâmicas conforme Gestão de Preço ou Padrão)
  const activeRates = useMemo(() => {
    const hasCustom = pricingAverages && pricingAverages.totalModifiedProducts > 0;
    if (provisionRateMode === 'pricing' && hasCustom) {
      const avg = pricingAverages.simpleAverages;
      const prolabore = (avg.proLaboreTotalPct || 12) / 100;
      const socio1 = (avg.proLabore1Pct || avg.proLaboreTotalPct / 2 || 6) / 100;
      const socio2 = (avg.proLabore2Pct || avg.proLaboreTotalPct / 2 || 6) / 100;
      const tax = (avg.impostoPct || 4) / 100;
      const reserve = (avg.margemLiquidaPct || 1) / 100; // Lucro Líquido / Fundo de Reserva
      const custoFixo = (avg.custoFixoPct || 0) / 100;

      return {
        prolabore,
        socio1,
        socio2,
        tax,
        reserve,
        custoFixo,
        prolaborePctDisplay: avg.proLaboreTotalPct,
        socio1PctDisplay: avg.proLabore1Pct,
        socio2PctDisplay: avg.proLabore2Pct,
        taxPctDisplay: avg.impostoPct,
        reservePctDisplay: avg.margemLiquidaPct,
        custoFixoPctDisplay: avg.custoFixoPct,
        isCustom: true,
        totalItems: pricingAverages.totalModifiedProducts
      };
    }

    return {
      prolabore: 0.12,
      socio1: 0.06,
      socio2: 0.06,
      tax: 0.04,
      reserve: 0.01,
      custoFixo: 0,
      prolaborePctDisplay: 12,
      socio1PctDisplay: 6,
      socio2PctDisplay: 6,
      taxPctDisplay: 4,
      reservePctDisplay: 1,
      custoFixoPctDisplay: 0,
      isCustom: false,
      totalItems: pricingAverages?.totalModifiedProducts || 0
    };
  }, [provisionRateMode, pricingAverages]);

  // Cálculos das Caixinhas do Mês
  const prolaboreTotal = useMemo(() => {
    if (provisionRateMode === 'mix' && salesMixData?.monthSummary) {
      return salesMixData.monthSummary.totalProlabore;
    }
    return totalMonthSales * activeRates.prolabore;
  }, [provisionRateMode, salesMixData, totalMonthSales, activeRates]);

  const socio1Total = useMemo(() => {
    if (provisionRateMode === 'mix' && salesMixData?.monthSummary) {
      return salesMixData.monthSummary.totalSocio1;
    }
    return prolaboreTotal * (activeRates.socio1 / activeRates.prolabore);
  }, [provisionRateMode, salesMixData, prolaboreTotal, activeRates]);

  const socio2Total = useMemo(() => {
    if (provisionRateMode === 'mix' && salesMixData?.monthSummary) {
      return salesMixData.monthSummary.totalSocio2;
    }
    return prolaboreTotal * (activeRates.socio2 / activeRates.prolabore);
  }, [provisionRateMode, salesMixData, prolaboreTotal, activeRates]);

  const taxTotal = useMemo(() => {
    if (provisionRateMode === 'mix' && salesMixData?.monthSummary) {
      return salesMixData.monthSummary.totalImpostos;
    }
    return totalMonthSales * activeRates.tax;
  }, [provisionRateMode, salesMixData, totalMonthSales, activeRates]);

  const reserveTotal = useMemo(() => {
    if (provisionRateMode === 'mix' && salesMixData?.monthSummary) {
      return salesMixData.monthSummary.totalLucro;
    }
    return totalMonthSales * activeRates.reserve;
  }, [provisionRateMode, salesMixData, totalMonthSales, activeRates]);

  const grandTotalProvisions = prolaboreTotal + taxTotal + reserveTotal;

  // Percentuais efetivos para exibição nos cabeçalhos e cards
  const displayProlaborePct = useMemo(() => {
    if (provisionRateMode === 'mix' && salesMixData?.monthSummary) {
      return salesMixData.monthSummary.effectiveProlaborePct;
    }
    return activeRates.prolaborePctDisplay;
  }, [provisionRateMode, salesMixData, activeRates]);

  const displaySocio1Pct = useMemo(() => {
    if (provisionRateMode === 'mix' && salesMixData?.monthSummary) {
      return salesMixData.monthSummary.effectiveSocio1Pct;
    }
    return activeRates.socio1PctDisplay;
  }, [provisionRateMode, salesMixData, activeRates]);

  const displaySocio2Pct = useMemo(() => {
    if (provisionRateMode === 'mix' && salesMixData?.monthSummary) {
      return salesMixData.monthSummary.effectiveSocio2Pct;
    }
    return activeRates.socio2PctDisplay;
  }, [provisionRateMode, salesMixData, activeRates]);

  const displayTaxPct = useMemo(() => {
    if (provisionRateMode === 'mix' && salesMixData?.monthSummary) {
      return salesMixData.monthSummary.effectiveImpostosPct;
    }
    return activeRates.taxPctDisplay;
  }, [provisionRateMode, salesMixData, activeRates]);

  const displayReservePct = useMemo(() => {
    if (provisionRateMode === 'mix' && salesMixData?.monthSummary) {
      return salesMixData.monthSummary.effectiveLucroPct;
    }
    return activeRates.reservePctDisplay;
  }, [provisionRateMode, salesMixData, activeRates]);

  // Totais Pagos / Separados (desconsiderando pendências descartadas após o 2º dia útil e excluindo crediário)
  const paidStats = useMemo(() => {
    let paidProlabore = 0;
    let pendingProlabore = 0;
    let paidTax = 0;
    let pendingTax = 0;
    let paidReserve = 0;
    let pendingReserve = 0;

    monthClosings.forEach(c => {
      const cred = Number(c.totalCrediario) || 0;
      const netSales = Math.max(0, (Number(c.totalSales) || 0) - cred);
      const key = getDateKey(c.date);
      const isPast2ndDay = isDatePastSecondDay(c.date);

      let valP = netSales * activeRates.prolabore;
      let valT = netSales * activeRates.tax;
      let valR = netSales * activeRates.reserve;

      if (provisionRateMode === 'mix' && salesMixData?.dailyBreakdown?.[key]) {
        const d = salesMixData.dailyBreakdown[key];
        valP = d.prolabore;
        valT = d.impostos;
        valR = d.lucro;
      }

      const pPaid = paidProvisionsDates.includes(`prolabore-${key}`) || paidProvisionsDates.includes(`prolabore-${c.date}`);
      const tPaid = paidProvisionsDates.includes(`tax-${key}`) || paidProvisionsDates.includes(`tax-${c.date}`);
      const rPaid = paidProvisionsDates.includes(`reserve-${key}`) || paidProvisionsDates.includes(`reserve-${c.date}`);

      if (pPaid) {
        paidProlabore += valP;
      } else if (!isPast2ndDay) {
        pendingProlabore += valP;
      }

      if (tPaid) {
        paidTax += valT;
      } else if (!isPast2ndDay) {
        pendingTax += valT;
      }

      if (rPaid) {
        paidReserve += valR;
      } else if (!isPast2ndDay) {
        pendingReserve += valR;
      }
    });

    return {
      paidProlabore,
      pendingProlabore,
      paidTax,
      pendingTax,
      paidReserve,
      pendingReserve,
      totalPaid: paidProlabore + paidTax + paidReserve,
      totalPending: pendingProlabore + pendingTax + pendingReserve
    };
  }, [monthClosings, paidProvisionsDates, activeRates, provisionRateMode, salesMixData]);

  const isClosingProvisioned = (date: string) => {
    const key = getDateKey(date);
    return (
      paidProvisionsDates.includes(`prolabore-${key}`) ||
      paidProvisionsDates.includes(`tax-${key}`) ||
      paidProvisionsDates.includes(`reserve-${key}`) ||
      paidProvisionsDates.includes(`prolabore-${date}`) ||
      paidProvisionsDates.includes(`tax-${date}`) ||
      paidProvisionsDates.includes(`reserve-${date}`)
    );
  };

  const isClosingFullyProvisioned = (date: string) => {
    const key = getDateKey(date);
    const p = paidProvisionsDates.includes(`prolabore-${key}`) || paidProvisionsDates.includes(`prolabore-${date}`);
    const t = paidProvisionsDates.includes(`tax-${key}`) || paidProvisionsDates.includes(`tax-${date}`);
    const r = paidProvisionsDates.includes(`reserve-${key}`) || paidProvisionsDates.includes(`reserve-${date}`);
    return p && t && r;
  };

  const provisionedClosingsCount = useMemo(() => {
    return monthClosings.filter(c => isClosingProvisioned(c.date)).length;
  }, [monthClosings, paidProvisionsDates]);

  const pendingClosingsCount = useMemo(() => {
    return monthClosings.filter(c => !isClosingFullyProvisioned(c.date) && !isDatePastSecondDay(c.date)).length;
  }, [monthClosings, paidProvisionsDates]);

  const displayedClosings = useMemo(() => {
    if (filterMode === 'provisioned') {
      return monthClosings.filter(c => isClosingProvisioned(c.date));
    }
    if (filterMode === 'pending') {
      // Se não foi provisionado e já passou do 2º dia útil, descarta e não exibe!
      return monthClosings.filter(c => !isClosingFullyProvisioned(c.date) && !isDatePastSecondDay(c.date));
    }
    return monthClosings;
  }, [monthClosings, filterMode, paidProvisionsDates]);

  // Alternar status de pagamento de uma provisão diária específica
  const handleToggleProvision = async (provisionKey: string) => {
    if (isUpdating) return;
    setIsUpdating(true);

    let newDates = [...paidProvisionsDates];
    const isPaid = newDates.includes(provisionKey);

    if (isPaid) {
      newDates = newDates.filter(d => d !== provisionKey);
    } else {
      newDates.push(provisionKey);
    }

    setPaidProvisionsDates(newDates);

    try {
      const res = await fetch('/api/settings/paid_provisions_dates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(newDates) })
      });

      if (!res.ok) throw new Error('Falha ao salvar status da provisão');

      window.dispatchEvent(new CustomEvent('belafarma_provisions_updated', { detail: newDates }));

      addToast(
        isPaid ? 'Provisão marcada como pendente' : 'Provisão marcada como reservada/paga com sucesso!', 
        'success'
      );
    } catch (e) {
      console.error(e);
      addToast('Erro ao atualizar status da provisão', 'error');
      // Reverter estado local em caso de erro
      setPaidProvisionsDates(paidProvisionsDates);
    } finally {
      setIsUpdating(false);
    }
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(selectedYear, i, 1);
    return { value: i, label: d.toLocaleString('pt-BR', { month: 'long' }) };
  });

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Header com Seletor de Período */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter leading-none flex items-center gap-2">
            <PiggyBank className="w-7 h-7 text-emerald-600" /> Caixinhas de Provisão
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Separação diária sobre o faturamento à vista (s/ crediário): Pró-labore ({displayProlaborePct.toFixed(1)}%), Impostos ({displayTaxPct.toFixed(1)}%) e Lucro/Reserva ({displayReservePct.toFixed(1)}%).
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          <div className="relative w-44">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold capitalize appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {monthOptions.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <select 
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button
            onClick={() => {
              fetchPaidDates();
              fetchPricingAverages();
              fetchSalesMix();
            }}
            disabled={isUpdating || isLoadingAverages || isLoadingMix}
            className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-slate-200 hover:border-emerald-200"
            title="Atualizar dados de provisões, mix de vendas e médias da precificação"
          >
            <RefreshCw className={`w-4 h-4 ${isUpdating || isLoadingAverages || isLoadingMix ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* LEMBRETE DE SEPARAÇÃO INTELIGENTE (GESTÃO DE PREÇO) */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-indigo-900/50 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                  Lembrete de Separação de Dinheiro
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {provisionRateMode === 'mix' ? '⚡ Mix Real Ponderado' : provisionRateMode === 'pricing' ? '📊 Gestão de Preço' : '📋 Padrão'}
                  </span>
                </h2>
                {provisionRateMode === 'mix' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/30 text-emerald-200 border border-emerald-500/40">
                    {salesMixData?.monthSummary?.totalCustomItemsCount || 0} produtos especiais vendidos no mês (s/ crediário)
                  </span>
                ) : activeRates.isCustom ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/30 text-indigo-200 border border-indigo-500/40">
                    {pricingAverages?.totalModifiedProducts} produtos equalizados (60% Pró-labore / 40% Lucro)
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Use estas porcentagens para saber exatamente quanto separar em espécie para cada sócio, lucro e tributos (vendas no crediário desconsideradas).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle de Modo: Mix Real vs Precificação vs Padrão */}
            <div className="inline-flex p-1 bg-slate-800/80 rounded-2xl border border-slate-700/80">
              <button
                type="button"
                onClick={() => handleToggleRateMode('mix')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  provisionRateMode === 'mix'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Calcula com base nos itens reais vendidos no dia, aplicando a taxa de cada produto e excluindo crediário"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>⚡ Mix Real (s/ Crediário)</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleRateMode('pricing')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  provisionRateMode === 'pricing'
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Aplica a média global da Gestão de Preço nas Caixinhas"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Média Precificação</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleRateMode('standard')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  provisionRateMode === 'standard'
                    ? 'bg-slate-700 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Aplica a regra clássica fixa de 12% Pró-labore, 4% DAS, 1% Reserva"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Padrão (12% / 4% / 1%)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsPricingExpanded(!isPricingExpanded)}
              className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700/80 transition-all cursor-pointer"
              title={isPricingExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
            >
              {isPricingExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isPricingExpanded && (
          <div className="space-y-5 pt-2 border-t border-slate-800">
            {/* Grid dos 4 Percentuais de Referência */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Pró-labore dos Sócios */}
              <div className="bg-slate-800/80 border border-emerald-500/30 rounded-2xl p-4 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" /> Pró-labore dos Sócios
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    60% da sobra
                  </span>
                </div>
                <div className="mt-2 text-2xl font-black text-white">
                  {(pricingAverages?.simpleAverages.proLaboreTotalPct ?? 12).toFixed(1)}%
                </div>
                <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-300">
                  <span>👤 Sócio 1: <strong className="text-emerald-300">{(pricingAverages?.simpleAverages.proLabore1Pct ?? 6).toFixed(1)}%</strong></span>
                  <span>👤 Sócio 2: <strong className="text-emerald-300">{(pricingAverages?.simpleAverages.proLabore2Pct ?? 6).toFixed(1)}%</strong></span>
                </div>
              </div>

              {/* 2. Lucro Líquido / Reserva */}
              <div className="bg-slate-800/80 border border-purple-500/30 rounded-2xl p-4 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Lucro Líquido / Reserva
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                    40% da sobra
                  </span>
                </div>
                <div className="mt-2 text-2xl font-black text-white">
                  {(pricingAverages?.simpleAverages.margemLiquidaPct ?? 1).toFixed(1)}%
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Destinado a investimentos, reserva ou divisão de lucros.
                </p>
              </div>

              {/* 3. Impostos / DAS */}
              <div className="bg-slate-800/80 border border-blue-500/30 rounded-2xl p-4 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 flex items-center gap-1">
                    <Landmark className="w-3.5 h-3.5" /> Impostos / DAS
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                    Simples
                  </span>
                </div>
                <div className="mt-2 text-2xl font-black text-white">
                  {(pricingAverages?.simpleAverages.impostoPct ?? 4).toFixed(1)}%
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Alíquota configurada para pagamento da guia mensal de DAS.
                </p>
              </div>

              {/* 4. Custo Fixo Operacional */}
              <div className="bg-slate-800/80 border border-amber-500/30 rounded-2xl p-4 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" /> Custo Fixo (Ref.)
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                    Operação
                  </span>
                </div>
                <div className="mt-2 text-2xl font-black text-white">
                  {(pricingAverages?.simpleAverages.custoFixoPct ?? 15.7).toFixed(1)}%
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Aluguel, energia, funcionários e despesas fixas da loja.
                </p>
              </div>
            </div>

            {/* SIMULADOR RÁPIDO DE SEPARAÇÃO DE DINHEIRO DO DIA */}
            <div className="bg-slate-950/60 border border-indigo-500/30 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    Simulador Rápido: Quanto separar do fechamento de hoje?
                  </span>
                </div>

                {/* Input de Valor ou Botões Rápidos */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-44">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={monthClosings[0] ? Number(monthClosings[0].totalSales).toFixed(2) : "1000.00"}
                      value={simClosingValue}
                      onChange={(e) => setSimClosingValue(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {monthClosings[0] && (
                    <button
                      type="button"
                      onClick={() => setSimClosingValue(String(Number(monthClosings[0].totalSales) || 0))}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[11px] font-bold transition-all border border-slate-700 cursor-pointer"
                    >
                      Último Fechamento ({formatBRL(Number(monthClosings[0].totalSales) || 0)})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSimClosingValue('2000')}
                    className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[11px] font-bold border border-slate-700 cursor-pointer"
                  >
                    R$ 2.000
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimClosingValue('3000')}
                    className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[11px] font-bold border border-slate-700 cursor-pointer"
                  >
                    R$ 3.000
                  </button>
                </div>
              </div>

              {(() => {
                const defaultRefValue = monthClosings[0] ? Number(monthClosings[0].totalSales) || 1000 : 1000;
                const calcBase = parseFloat(simClosingValue) > 0 ? parseFloat(simClosingValue) : defaultRefValue;
                const simProlabore = calcBase * activeRates.prolabore;
                const simSocio1 = calcBase * activeRates.socio1;
                const simSocio2 = calcBase * activeRates.socio2;
                const simTax = calcBase * activeRates.tax;
                const simReserve = calcBase * activeRates.reserve;
                const simTotal = simProlabore + simTax + simReserve;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    {/* Caixinha Pró-labore */}
                    <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3.5">
                      <div className="flex justify-between items-center text-xs font-black text-emerald-300">
                        <span>🟣 Caixinha Pró-labore ({activeRates.prolaborePctDisplay.toFixed(1)}%)</span>
                      </div>
                      <div className="text-xl font-black text-white mt-1">
                        {formatBRL(simProlabore)}
                      </div>
                      <div className="mt-2 pt-2 border-t border-emerald-500/30 space-y-0.5 text-[11px] text-emerald-200">
                        <div className="flex justify-between">
                          <span>Sócio 1 ({activeRates.socio1PctDisplay.toFixed(1)}%):</span>
                          <strong>{formatBRL(simSocio1)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Sócio 2 ({activeRates.socio2PctDisplay.toFixed(1)}%):</span>
                          <strong>{formatBRL(simSocio2)}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Caixinha Lucro / Reserva */}
                    <div className="bg-purple-950/40 border border-purple-500/40 rounded-xl p-3.5">
                      <div className="flex justify-between items-center text-xs font-black text-purple-300">
                        <span>🟢 Caixinha Lucro ({activeRates.reservePctDisplay.toFixed(1)}%)</span>
                      </div>
                      <div className="text-xl font-black text-white mt-1">
                        {formatBRL(simReserve)}
                      </div>
                      <p className="text-[11px] text-purple-200 mt-2 pt-2 border-t border-purple-500/30">
                        Guardar no cofre ou conta poupança/reserva.
                      </p>
                    </div>

                    {/* Caixinha Impostos */}
                    <div className="bg-blue-950/40 border border-blue-500/40 rounded-xl p-3.5">
                      <div className="flex justify-between items-center text-xs font-black text-blue-300">
                        <span>🔵 Caixinha Impostos ({activeRates.taxPctDisplay.toFixed(1)}%)</span>
                      </div>
                      <div className="text-xl font-black text-white mt-1">
                        {formatBRL(simTax)}
                      </div>
                      <p className="text-[11px] text-blue-200 mt-2 pt-2 border-t border-blue-500/30">
                        Separar para pagar a guia do DAS no dia 20.
                      </p>
                    </div>

                    {/* Total a Separar Hoje */}
                    <div className="bg-indigo-900/60 border-2 border-indigo-400/60 rounded-xl p-3.5 shadow-lg">
                      <div className="flex justify-between items-center text-xs font-black text-indigo-300">
                        <span>💰 Total a Separar Hoje</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200">
                          {((activeRates.prolabore + activeRates.reserve + activeRates.tax) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-xl font-black text-emerald-300 mt-1">
                        {formatBRL(simTotal)}
                      </div>
                      <div className="mt-2 pt-2 border-t border-indigo-500/30 text-[11px] text-indigo-200 flex justify-between">
                        <span>Sobre faturamento de:</span>
                        <strong>{formatBRL(calcBase)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Resumo Geral de Faturamento e Total Provisionado */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card Faturamento Total */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Faturamento do Mês (s/ Crediário)</span>
            <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{formatBRL(totalMonthSales)}</h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {monthClosings.length} {monthClosings.length === 1 ? 'fechamento registrado' : 'fechamentos registrados'}
            </p>
            {totalMonthCrediario > 0 && (
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold block mt-1.5 w-fit">
                Crediário excluído: -{formatBRL(totalMonthCrediario)}
              </span>
            )}
            {selectedMonth === new Date().getMonth() && selectedYear === new Date().getFullYear() && (
              <p className="text-[10px] text-slate-400 mt-1.5 font-medium leading-tight">
                * Calculado sobre fechamentos concluídos (as vendas do dia atual entram ao fechar o caixa).
              </p>
            )}
          </div>
        </div>

        {/* Card 1: Pró-labore */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-2xl p-5 border border-emerald-100 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                <PiggyBank className="w-3.5 h-3.5 text-emerald-600" /> Pró-labore dos Sócios
              </span>
              <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                {displayProlaborePct.toFixed(1)}% do Faturamento
              </span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-emerald-950 tracking-tight">{formatBRL(prolaboreTotal)}</h3>
            <div className="text-[11px] text-emerald-700/80 font-bold mt-1 flex justify-between">
              <span>S1 ({displaySocio1Pct.toFixed(1)}%): {formatBRL(socio1Total)}</span>
              <span>S2 ({displaySocio2Pct.toFixed(1)}%): {formatBRL(socio2Total)}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-emerald-200/60 font-semibold">
              <span className="text-emerald-700">Reservado: {formatBRL(paidStats.paidProlabore)}</span>
              <span className="text-amber-700 font-bold">Pendente: {formatBRL(paidStats.pendingProlabore)}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Impostos */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl p-5 border border-blue-100 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-blue-800 uppercase tracking-widest flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-blue-600" /> Impostos / Tributos
              </span>
              <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md">
                {displayTaxPct.toFixed(1)}% do Faturamento
              </span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-blue-950 tracking-tight">{formatBRL(taxTotal)}</h3>
            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-blue-200/60 font-semibold">
              <span className="text-blue-700">Reservado: {formatBRL(paidStats.paidTax)}</span>
              <span className="text-amber-700 font-bold">Pendente: {formatBRL(paidStats.pendingTax)}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Lucro / Reserva */}
        <div className="bg-gradient-to-br from-purple-50 to-violet-50/50 rounded-2xl p-5 border border-purple-100 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-purple-800 uppercase tracking-widest flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-600" /> Lucro / Fundo de Reserva
              </span>
              <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded-md">
                {displayReservePct.toFixed(1)}% do Faturamento
              </span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-purple-950 tracking-tight">{formatBRL(reserveTotal)}</h3>
            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-purple-200/60 font-semibold">
              <span className="text-purple-700">Reservado: {formatBRL(paidStats.paidReserve)}</span>
              <span className="text-amber-700 font-bold">Pendente: {formatBRL(paidStats.pendingReserve)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card de Total Acumulado Provisionado */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Total Geral de Provisões do Mês</h3>
            <p className="text-xs text-slate-500 font-medium">
              Soma das reservas destinadas a pró-labore ({displayProlaborePct.toFixed(1)}%), impostos ({displayTaxPct.toFixed(1)}%) e lucro/reserva ({displayReservePct.toFixed(1)}%). Total: {((displayProlaborePct + displayTaxPct + displayReservePct)).toFixed(1)}%.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 self-stretch md:self-auto justify-between md:justify-end">
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Reservado</span>
            <span className="text-lg font-black text-emerald-600">{formatBRL(paidStats.totalPaid)}</span>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Provisionado</span>
            <span className="text-2xl font-black text-slate-900">{formatBRL(grandTotalProvisions)}</span>
          </div>
        </div>
      </div>

      {/* Tabela Analítica Dia a Dia */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-slate-500" /> Detalhamento Diário das Provisões
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {filterMode === 'provisioned' 
                ? 'Exibindo apenas os fechamentos que foram marcados como provisionados nas caixinhas (o restante foi ignorado).'
                : filterMode === 'pending'
                  ? 'Exibindo apenas os fechamentos que possuem provisões pendentes a reservar.'
                  : 'Exibindo todos os fechamentos registrados do mês.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilterMode('provisioned')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs ${
                filterMode === 'provisioned'
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30 ring-2 ring-emerald-600/20'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Apenas Provisionados ({provisionedClosingsCount})
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs ${
                filterMode === 'all'
                  ? 'bg-slate-900 text-white shadow-slate-900/30 ring-2 ring-slate-900/20'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Todos ({monthClosings.length})
            </button>
            <button
              onClick={() => setFilterMode('pending')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs ${
                filterMode === 'pending'
                  ? 'bg-amber-600 text-white shadow-amber-600/30 ring-2 ring-amber-600/20'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Pendentes ({pendingClosingsCount})
            </button>
          </div>
        </div>

        {monthClosings.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-bold text-sm">Nenhum fechamento de caixa registrado para este mês.</p>
          </div>
        ) : displayedClosings.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            {filterMode === 'provisioned' ? (
              <>
                <ShieldCheck className="w-12 h-12 mx-auto text-emerald-500 opacity-70" />
                <div>
                  <p className="font-black text-base text-slate-800">Nenhum fechamento marcado como provisionado neste mês</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Os fechamentos sem provisão marcada foram ignorados por este filtro. Quando você confirmar a separação no Modal de Pendências ou registrar em "Todos", eles aparecerão listados aqui.
                  </p>
                </div>
                <button
                  onClick={() => setFilterMode('all')}
                  className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm inline-flex items-center gap-2"
                >
                  <Layers className="w-3.5 h-3.5" /> Ver todos os {monthClosings.length} fechamentos
                </button>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 opacity-70" />
                <div>
                  <p className="font-black text-base text-slate-800">Todas as provisões deste mês já foram separadas!</p>
                  <p className="text-xs text-slate-400 mt-1">Não há fechamentos pendentes de provisão para o período selecionado.</p>
                </div>
                <button
                  onClick={() => setFilterMode('provisioned')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm inline-flex items-center gap-2"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ver fechamentos provisionados
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="px-6 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Data</th>
                  <th className="px-6 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Faturamento (s/ Crediário)</th>
                  <th className="px-6 py-3.5 text-[10px] font-black text-emerald-700 uppercase tracking-widest text-center">
                    Pró-labore ({displayProlaborePct.toFixed(1)}%)
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-black text-blue-700 uppercase tracking-widest text-center">
                    Impostos ({displayTaxPct.toFixed(1)}%)
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-black text-purple-700 uppercase tracking-widest text-center">
                    Reserva/Lucro ({displayReservePct.toFixed(1)}%)
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-black text-slate-700 uppercase tracking-widest text-right">Total Provisionado (Dia)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedClosings.map(c => {
                  const cred = Number(c.totalCrediario) || 0;
                  const netSales = Math.max(0, (Number(c.totalSales) || 0) - cred);
                  const dateKey = getDateKey(c.date);
                  const dayMix = provisionRateMode === 'mix' ? salesMixData?.dailyBreakdown?.[dateKey] : null;

                  const sales = dayMix ? dayMix.sales : netSales;
                  const valProlabore = dayMix ? dayMix.prolabore : sales * activeRates.prolabore;
                  const valTax = dayMix ? dayMix.impostos : sales * activeRates.tax;
                  const valReserve = dayMix ? dayMix.lucro : sales * activeRates.reserve;
                  const valDayTotal = valProlabore + valTax + valReserve;

                  const dayProlaborePct = dayMix ? dayMix.effectiveProlaborePct : activeRates.prolaborePctDisplay;
                  const dayTaxPct = dayMix ? dayMix.effectiveImpostosPct : activeRates.taxPctDisplay;
                  const dayReservePct = dayMix ? dayMix.effectiveLucroPct : activeRates.reservePctDisplay;

                  const { dateFormatted, weekday } = formatClosingDate(c.date);

                  const isProlaborePaid = paidProvisionsDates.includes(`prolabore-${dateKey}`) || paidProvisionsDates.includes(`prolabore-${c.date}`);
                  const isTaxPaid = paidProvisionsDates.includes(`tax-${dateKey}`) || paidProvisionsDates.includes(`tax-${c.date}`);
                  const isReservePaid = paidProvisionsDates.includes(`reserve-${dateKey}`) || paidProvisionsDates.includes(`reserve-${c.date}`);

                  const valDayProvisioned = 
                    (isProlaborePaid ? valProlabore : 0) +
                    (isTaxPaid ? valTax : 0) +
                    (isReservePaid ? valReserve : 0);

                  const isFullyPaid = isProlaborePaid && isTaxPaid && isReservePaid;
                  const isAnyPaid = isProlaborePaid || isTaxPaid || isReservePaid;
                  const isPast2ndDay = isDatePastSecondDay(c.date);

                  return (
                    <tr 
                      key={c.id || c.date} 
                      className={`transition-colors ${
                        isFullyPaid 
                          ? 'bg-emerald-50/25 hover:bg-emerald-50/50' 
                          : isAnyPaid 
                            ? 'bg-slate-50/70 hover:bg-slate-100/70' 
                            : isPast2ndDay
                              ? 'opacity-65 hover:bg-slate-50/40'
                              : 'hover:bg-slate-50/60'
                      }`}
                    >
                      {/* Data */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {isFullyPaid ? (
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-xs" title="100% Provisionado" />
                          ) : isAnyPaid ? (
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" title="Parcialmente Provisionado" />
                          ) : isPast2ndDay ? (
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" title="Descartado (> 2 dias sem provisão)" />
                          ) : (
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" title="Pendente para Separação" />
                          )}
                          <div>
                            <span className="font-black text-slate-900 text-sm block leading-tight">
                              {dateFormatted}
                            </span>
                            {weekday && (
                              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">
                                {weekday}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Faturamento */}
                      <td className="px-6 py-4 text-right font-black text-slate-900 text-sm whitespace-nowrap">
                        <div>{formatBRL(sales)}</div>
                        {cred > 0 && (
                          <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-semibold inline-block mt-0.5">
                            s/ cred: -{formatBRL(cred)}
                          </span>
                        )}
                      </td>

                      {/* Pró-labore */}
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        {isProlaborePaid ? (
                          <button
                            onClick={() => handleToggleProvision(`prolabore-${dateKey}`)}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                            title="Clique para alternar entre Separado e Pendente"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{formatBRL(valProlabore)}</span>
                            <span className="text-[10px] opacity-75 font-medium">(Separado)</span>
                          </button>
                        ) : isPast2ndDay ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" title="Não provisionado no prazo de 2 dias (descartado)">
                            <XCircle className="w-3 h-3 text-slate-400" />
                            <span className="line-through opacity-70">{formatBRL(valProlabore)}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Descartado</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleToggleProvision(`prolabore-${dateKey}`)}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                            title="Clique para alternar entre Separado e Pendente"
                          >
                            <Clock className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{formatBRL(valProlabore)}</span>
                            <span className="text-[10px] opacity-75 font-medium">(Pendente)</span>
                          </button>
                        )}
                        {dayMix && dayMix.customCount > 0 ? (
                          <div 
                            className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md mt-1 cursor-help inline-flex items-center gap-1 justify-center"
                            title={dayMix.customItems.map(ci => `${ci.descricao}: ${ci.prolaborePct}% (Venda: R$ ${ci.vendas.toFixed(2)})`).join('\n')}
                          >
                            <span>⚡ {dayProlaborePct.toFixed(1)}%</span>
                            <span className="text-[9px] opacity-80">({dayMix.customCount} item{dayMix.customCount > 1 ? 's' : ''} esp.)</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                            {dayProlaborePct.toFixed(1)}%
                          </span>
                        )}
                      </td>

                      {/* Impostos */}
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        {isTaxPaid ? (
                          <button
                            onClick={() => handleToggleProvision(`tax-${dateKey}`)}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                            title="Clique para alternar entre Separado e Pendente"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{formatBRL(valTax)}</span>
                            <span className="text-[10px] opacity-75 font-medium">(Separado)</span>
                          </button>
                        ) : isPast2ndDay ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" title="Não provisionado no prazo de 2 dias (descartado)">
                            <XCircle className="w-3 h-3 text-slate-400" />
                            <span className="line-through opacity-70">{formatBRL(valTax)}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Descartado</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleToggleProvision(`tax-${dateKey}`)}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"
                            title="Clique para alternar entre Separado e Pendente"
                          >
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            <span>{formatBRL(valTax)}</span>
                            <span className="text-[10px] opacity-75 font-medium">(Pendente)</span>
                          </button>
                        )}
                        <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                          {dayTaxPct.toFixed(1)}%
                        </span>
                      </td>

                      {/* Reserva */}
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        {isReservePaid ? (
                          <button
                            onClick={() => handleToggleProvision(`reserve-${dateKey}`)}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs bg-purple-600 text-white border-purple-600 hover:bg-purple-700"
                            title="Clique para alternar entre Separado e Pendente"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{formatBRL(valReserve)}</span>
                            <span className="text-[10px] opacity-75 font-medium">(Separado)</span>
                          </button>
                        ) : isPast2ndDay ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" title="Não provisionado no prazo de 2 dias (descartado)">
                            <XCircle className="w-3 h-3 text-slate-400" />
                            <span className="line-through opacity-70">{formatBRL(valReserve)}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Descartado</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleToggleProvision(`reserve-${dateKey}`)}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100"
                            title="Clique para alternar entre Separado e Pendente"
                          >
                            <Clock className="w-3.5 h-3.5 text-purple-600" />
                            <span>{formatBRL(valReserve)}</span>
                            <span className="text-[10px] opacity-75 font-medium">(Pendente)</span>
                          </button>
                        )}
                        <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                          {dayReservePct.toFixed(1)}%
                        </span>
                      </td>

                      {/* Total Dia */}
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className={`font-black text-sm block ${valDayProvisioned > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                          {formatBRL(valDayProvisioned > 0 ? valDayProvisioned : valDayTotal)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium block">
                          {valDayProvisioned === valDayTotal 
                            ? '100% provisionado' 
                            : valDayProvisioned > 0 
                              ? `de ${formatBRL(valDayTotal)} calculado` 
                              : 'a provisionar'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
