import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  Calendar,
  ChevronDown,
  ChevronRight,
  CreditCard,
  DollarSign,
  Download,
  History,
  Layers,
  List,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
} from 'lucide-react';
import { DailyRecordEntry } from '../types';
import { useToast } from './ToastContext';

interface DailyRecordsHistoryProps {
  dailyRecords: DailyRecordEntry[];
  onNavigateToDailyRecords?: () => void;
}

type LaunchCategory =
  | 'expenses'
  | 'pix'
  | 'crediario'
  | 'credit-receipt'
  | 'non-registered'
  | 'sangria'
  | 'consignado'
  | 'ifood';

type PeriodPreset = 'all' | 'today' | '7d' | '30d' | 'this-month' | 'last-month';
type StatusFilter = 'all' | 'open' | 'closed';
type ViewMode = 'detailed' | 'grouped';

interface FlattenedLaunchItem {
  key: string;
  recordId: string;
  dateKey: string;
  dateLabel: string;
  category: LaunchCategory;
  categoryLabel: string;
  direction: 'in' | 'out' | 'neutral';
  description: string;
  val: number;
  userName: string;
  lancado: boolean;
}

const CATEGORY_META: Record<
  LaunchCategory,
  { label: string; badgeClass: string; valueClass: string; prefix: string }
> = {
  expenses: {
    label: 'Despesa',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
    valueClass: 'text-red-600 dark:text-red-400',
    prefix: '- ',
  },
  pix: {
    label: 'Pix Direto',
    badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
    valueClass: 'text-cyan-700 dark:text-cyan-400',
    prefix: '+ ',
  },
  crediario: {
    label: 'Crediário',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    valueClass: 'text-amber-600 dark:text-amber-400',
    prefix: '',
  },
  'credit-receipt': {
    label: 'Receb. Crediário',
    badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
    valueClass: 'text-teal-600 dark:text-teal-400',
    prefix: '+ ',
  },
  'non-registered': {
    label: 'Não Cadastrado',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    valueClass: 'text-blue-600 dark:text-blue-400',
    prefix: '+ ',
  },
  sangria: {
    label: 'Sangria',
    badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
    valueClass: 'text-orange-600 dark:text-orange-400',
    prefix: '- ',
  },
  consignado: {
    label: 'Consignados',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    valueClass: 'text-emerald-600 dark:text-emerald-400',
    prefix: '',
  },
  ifood: {
    label: 'iFood',
    badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    valueClass: 'text-rose-600 dark:text-rose-400',
    prefix: '+ ',
  },
};

function getLocalDateKey(raw: string): string {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateKeyBR(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey || '-';
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}

function toDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCurrency(value: number): string {
  return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const DailyRecordsHistory: React.FC<DailyRecordsHistoryProps> = ({
  dailyRecords,
  onNavigateToDailyRecords,
}) => {
  const { addToast } = useToast();
  const [records, setRecords] = useState<DailyRecordEntry[]>(dailyRecords || []);
  const [isLoading, setIsLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | LaunchCategory>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('detailed');
  const [visibleLimit, setVisibleLimit] = useState(100);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setRecords(dailyRecords || []);
  }, [dailyRecords]);

  const fetchLatestRecords = async (showFeedback = false, signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/daily-records?_t=${Date.now()}`, { signal });
      if (!res.ok) throw new Error('Falha ao buscar histórico de lançamentos');
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecords(data);
      }
      if (showFeedback) {
        addToast('Histórico de lançamentos atualizado.', 'success');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Erro ao buscar histórico de lançamentos:', err);
      if (showFeedback) {
        addToast('Não foi possível atualizar do servidor. Exibindo dados em cache.', 'warning');
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchLatestRecords(false, controller.signal);
    return () => controller.abort();
  }, []);

  const applyPreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    const now = new Date();
    const todayKey = toDateKey(now);

    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }
    if (preset === 'today') {
      setStartDate(todayKey);
      setEndDate(todayKey);
      return;
    }
    if (preset === '7d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      setStartDate(toDateKey(d));
      setEndDate(todayKey);
      return;
    }
    if (preset === '30d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      setStartDate(toDateKey(d));
      setEndDate(todayKey);
      return;
    }
    if (preset === 'this-month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toDateKey(firstDay));
      setEndDate(todayKey);
      return;
    }
    if (preset === 'last-month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(toDateKey(firstDay));
      setEndDate(toDateKey(lastDay));
    }
  };

  const flattenedItems = useMemo<FlattenedLaunchItem[]>(() => {
    const items: FlattenedLaunchItem[] = [];

    (records || []).forEach((record) => {
      const dateKey = getLocalDateKey(record.date);
      const dateLabel = formatDateKeyBR(dateKey);
      const userName = record.userName || 'Sistema';
      const lancado = Boolean(record.lancado);

      (record.expenses || []).forEach((item, idx) => {
        const desc = item.desc || 'Despesa';
        const isConsignadoPgto = desc.startsWith('Pgto Consignado:');
        items.push({
          key: `${record.id}-exp-${item.id || idx}`,
          recordId: record.id,
          dateKey,
          dateLabel,
          category: isConsignadoPgto ? 'consignado' : 'expenses',
          categoryLabel: isConsignadoPgto ? 'Pgto Consignado' : 'Despesa',
          direction: 'out',
          description: desc,
          val: Number(item.val) || 0,
          userName,
          lancado,
        });
      });

      (record.pixDiretoList || []).forEach((item, idx) => {
        items.push({
          key: `${record.id}-pix-${item.id || idx}`,
          recordId: record.id,
          dateKey,
          dateLabel,
          category: 'pix',
          categoryLabel: 'Pix Direto',
          direction: 'in',
          description: item.desc || 'Pix Direto na Conta',
          val: Number(item.val) || 0,
          userName,
          lancado,
        });
      });

      (record.crediarioList || []).forEach((item, idx) => {
        items.push({
          key: `${record.id}-cred-${item.id || idx}`,
          recordId: record.id,
          dateKey,
          dateLabel,
          category: 'crediario',
          categoryLabel: 'Crediário',
          direction: 'neutral',
          description: item.client || 'Cliente não informado',
          val: Number(item.val) || 0,
          userName,
          lancado,
        });
      });

      (record.creditReceipts || []).forEach((item, idx) => {
        const desc = `${item.customer || 'Cliente'}${item.description ? ` — ${item.description}` : ''}`;
        items.push({
          key: `${record.id}-rec-${item.id || idx}`,
          recordId: record.id,
          dateKey,
          dateLabel,
          category: 'credit-receipt',
          categoryLabel: 'Receb. Crediário',
          direction: 'in',
          description: desc,
          val: Number(item.val) || 0,
          userName,
          lancado,
        });
      });

      (record.nonRegistered || []).forEach((item, idx) => {
        const desc = item.desc || 'Produto Não Cadastrado';
        if (desc.startsWith('Venda Consignado:')) {
          items.push({
            key: `${record.id}-cons-${item.id || idx}`,
            recordId: record.id,
            dateKey,
            dateLabel,
            category: 'consignado',
            categoryLabel: 'Venda Consignado',
            direction: 'in',
            description: desc,
            val: Number(item.val) || 0,
            userName,
            lancado,
          });
        } else if (desc.startsWith('iFood:')) {
          items.push({
            key: `${record.id}-ifood-${item.id || idx}`,
            recordId: record.id,
            dateKey,
            dateLabel,
            category: 'ifood',
            categoryLabel: 'iFood',
            direction: 'in',
            description: desc,
            val: Number(item.val) || 0,
            userName,
            lancado,
          });
        } else {
          items.push({
            key: `${record.id}-nonreg-${item.id || idx}`,
            recordId: record.id,
            dateKey,
            dateLabel,
            category: 'non-registered',
            categoryLabel: 'Não Cadastrado',
            direction: 'in',
            description: desc,
            val: Number(item.val) || 0,
            userName,
            lancado,
          });
        }
      });

      (record.sangrias || []).forEach((item, idx) => {
        items.push({
          key: `${record.id}-sang-${item.id || idx}`,
          recordId: record.id,
          dateKey,
          dateLabel,
          category: 'sangria',
          categoryLabel: 'Sangria',
          direction: 'out',
          description: item.desc || 'Sangria de Caixa',
          val: Number(item.val) || 0,
          userName,
          lancado,
        });
      });
    });

    return items.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [records]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return flattenedItems.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (statusFilter === 'open' && item.lancado) return false;
      if (statusFilter === 'closed' && !item.lancado) return false;
      if (startDate && item.dateKey < startDate) return false;
      if (endDate && item.dateKey > endDate) return false;
      if (q) {
        const hay = `${item.description} ${item.userName} ${item.dateLabel} ${item.categoryLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [flattenedItems, categoryFilter, statusFilter, startDate, endDate, searchTerm]);

  useEffect(() => {
    setVisibleLimit(100);
  }, [categoryFilter, statusFilter, startDate, endDate, searchTerm, viewMode]);

  const summary = useMemo(() => {
    let expenses = 0;
    let pix = 0;
    let crediario = 0;
    let sangrias = 0;
    let otherIn = 0;
    const distinctDays = new Set<string>();

    filteredItems.forEach((item) => {
      if (item.dateKey) distinctDays.add(item.dateKey);
      if (item.category === 'expenses' || (item.category === 'consignado' && item.direction === 'out')) {
        expenses += item.val;
      } else if (item.category === 'pix') {
        pix += item.val;
      } else if (item.category === 'crediario') {
        crediario += item.val;
      } else if (item.category === 'sangria') {
        sangrias += item.val;
      } else if (item.direction === 'in') {
        otherIn += item.val;
      }
    });

    return {
      totalCount: filteredItems.length,
      daysCount: distinctDays.size,
      expenses,
      pix,
      crediario,
      sangrias,
      otherIn,
    };
  }, [filteredItems]);

  const groupedByDay = useMemo(() => {
    const map = new Map<
      string,
      {
        dateKey: string;
        dateLabel: string;
        items: FlattenedLaunchItem[];
        users: Set<string>;
        expenses: number;
        pix: number;
        crediario: number;
        sangrias: number;
        otherIn: number;
        allClosed: boolean;
      }
    >();

    filteredItems.forEach((item) => {
      let group = map.get(item.dateKey);
      if (!group) {
        group = {
          dateKey: item.dateKey,
          dateLabel: item.dateLabel,
          items: [],
          users: new Set<string>(),
          expenses: 0,
          pix: 0,
          crediario: 0,
          sangrias: 0,
          otherIn: 0,
          allClosed: true,
        };
        map.set(item.dateKey, group);
      }
      group.items.push(item);
      group.users.add(item.userName);
      if (!item.lancado) group.allClosed = false;

      if (item.category === 'expenses' || (item.category === 'consignado' && item.direction === 'out')) {
        group.expenses += item.val;
      } else if (item.category === 'pix') {
        group.pix += item.val;
      } else if (item.category === 'crediario') {
        group.crediario += item.val;
      } else if (item.category === 'sangria') {
        group.sangrias += item.val;
      } else if (item.direction === 'in') {
        group.otherIn += item.val;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredItems]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleLimit),
    [filteredItems, visibleLimit]
  );

  const exportCsv = () => {
    if (filteredItems.length === 0) {
      addToast('Não há lançamentos filtrados para exportar.', 'warning');
      return;
    }

    const escapeCsv = (val: string) => `"${String(val).replace(/"/g, '""')}"`;
    const headers = ['Data', 'Tipo', 'Descrição / Cliente', 'Operador', 'Status', 'Valor (R$)'];
    const rows = filteredItems.map((item) => {
      const signedVal = item.direction === 'out' ? -item.val : item.val;
      return [
        escapeCsv(item.dateLabel),
        escapeCsv(item.categoryLabel),
        escapeCsv(item.description),
        escapeCsv(item.userName),
        escapeCsv(item.lancado ? 'Fechado no Caixa' : 'Em Aberto'),
        escapeCsv(signedVal.toFixed(2).replace('.', ',')),
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historico-lancamentos-${toDateKey(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast('CSV exportado com sucesso.', 'success');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Cabeçalho */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter flex items-center gap-2.5">
            <History className="w-7 h-7 text-red-600 shrink-0" />
            Histórico de Lançamentos
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm mt-1">
            Consulta completa de despesas, pix direto, crediário, sangrias e demais lançamentos diários.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigateToDailyRecords && (
            <button
              type="button"
              onClick={onNavigateToDailyRecords}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wide shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Lançamento</span>
            </button>
          )}
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>
          <button
            type="button"
            onClick={() => fetchLatestRecords(true)}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </header>

      {/* Cards de Resumo */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
            <span>Lançamentos</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {summary.totalCount}
          </p>
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {summary.daysCount} {summary.daysCount === 1 ? 'dia' : 'dias'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-red-500 text-[10px] font-black uppercase tracking-wider">
            <span>Despesas</span>
            <AlertCircle className="w-4 h-4" />
          </div>
          <p className="text-lg font-black text-red-600 dark:text-red-400 mt-1 tabular-nums">
            {formatCurrency(summary.expenses)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-cyan-600 text-[10px] font-black uppercase tracking-wider">
            <span>Pix Direto</span>
            <DollarSign className="w-4 h-4" />
          </div>
          <p className="text-lg font-black text-cyan-700 dark:text-cyan-400 mt-1 tabular-nums">
            {formatCurrency(summary.pix)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 text-[10px] font-black uppercase tracking-wider">
            <span>Crediário</span>
            <CreditCard className="w-4 h-4" />
          </div>
          <p className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
            {formatCurrency(summary.crediario)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-orange-600 text-[10px] font-black uppercase tracking-wider">
            <span>Sangrias</span>
            <ArrowRightLeft className="w-4 h-4" />
          </div>
          <p className="text-lg font-black text-orange-600 dark:text-orange-400 mt-1 tabular-nums">
            {formatCurrency(summary.sangrias)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 text-[10px] font-black uppercase tracking-wider">
            <span>Outras Entradas</span>
            <ShoppingBag className="w-4 h-4" />
          </div>
          <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            {formatCurrency(summary.otherIn)}
          </p>
        </div>
      </section>

      {/* Filtros */}
      <section className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'Todo Período' },
                { id: 'today', label: 'Hoje' },
                { id: '7d', label: '7 dias' },
                { id: '30d', label: '30 dias' },
                { id: 'this-month', label: 'Este Mês' },
                { id: 'last-month', label: 'Mês Anterior' },
              ] as Array<{ id: PeriodPreset; label: string }>
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  periodPreset === preset.id
                    ? 'bg-slate-900 text-white dark:bg-red-600'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('detailed')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'detailed'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista Detalhada</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'grouped'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Por Dia</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por descrição, cliente, operador ou data..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | LaunchCategory)}
              aria-label="Filtrar por tipo de lançamento"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="all">Todos os Tipos</option>
              <option value="expenses">Despesas</option>
              <option value="pix">Pix Direto</option>
              <option value="crediario">Crediário</option>
              <option value="credit-receipt">Receb. Crediário</option>
              <option value="non-registered">Produto Não Cadastrado</option>
              <option value="sangria">Sangria</option>
              <option value="consignado">Consignados</option>
              <option value="ifood">iFood</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Filtrar por status"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="all">Todos Status</option>
              <option value="open">Em Aberto</option>
              <option value="closed">Fechado no Caixa</option>
            </select>
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setPeriodPreset('all');
                setStartDate(e.target.value);
              }}
              aria-label="Data inicial"
              className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-red-500"
            />
            <span className="text-xs text-slate-400 font-bold">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPeriodPreset('all');
                setEndDate(e.target.value);
              }}
              aria-label="Data final"
              className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </section>

      {/* Conteúdo Principal */}
      {viewMode === 'detailed' ? (
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="daily-records-history-table-caption"
            className="overflow-auto max-h-[65vh] custom-scrollbar focus:outline-none"
          >
            <table className="w-full text-left border-separate border-spacing-0">
              <caption id="daily-records-history-table-caption" className="sr-only">
                Histórico completo de lançamentos diários
              </caption>
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th scope="col" className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap border-b border-slate-200 dark:border-slate-700">
                    Data
                  </th>
                  <th scope="col" className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap border-b border-slate-200 dark:border-slate-700">
                    Tipo
                  </th>
                  <th scope="col" className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap border-b border-slate-200 dark:border-slate-700">
                    Descrição / Cliente
                  </th>
                  <th scope="col" className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap border-b border-slate-200 dark:border-slate-700">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap border-b border-slate-200 dark:border-slate-700">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleItems.map((item) => {
                  const meta = CATEGORY_META[item.category];
                  return (
                    <tr
                      key={item.key}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap border-b border-slate-100 dark:border-slate-800/60">
                        {item.dateLabel}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-b border-slate-100 dark:border-slate-800/60">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${meta.badgeClass}`}>
                          {item.categoryLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/60">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-md" title={item.description}>
                            {item.description}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap">
                            • {item.userName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-b border-slate-100 dark:border-slate-800/60">
                        {item.lancado ? (
                          <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Fechado
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            Em aberto
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right text-xs font-black tabular-nums whitespace-nowrap border-b border-slate-100 dark:border-slate-800/60 ${meta.valueClass}`}>
                        {meta.prefix}
                        {formatCurrency(item.val)}
                      </td>
                    </tr>
                  );
                })}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-slate-400 dark:text-slate-500">
                      <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-bold">Nenhum lançamento encontrado para os filtros selecionados.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredItems.length > visibleLimit && (
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-500 dark:text-slate-400">
                Exibindo {visibleItems.length} de {filteredItems.length} lançamentos
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + 100)}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                >
                  Mostrar mais 100
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleLimit(filteredItems.length)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-red-600 text-white font-bold cursor-pointer"
                >
                  Mostrar todos
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-2.5">
          {groupedByDay.map((day) => {
            const isExpanded = Boolean(expandedDays[day.dateKey]);
            return (
              <div
                key={day.dateKey}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedDays((prev) => ({ ...prev, [day.dateKey]: !prev[day.dateKey] }))
                  }
                  className="w-full px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                          {day.dateLabel}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400">
                          ({day.items.length} {day.items.length === 1 ? 'item' : 'itens'})
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            day.allClosed
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {day.allClosed ? 'Fechado' : 'Em aberto'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        Operadores: {Array.from(day.users).join(', ')}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-black tabular-nums">
                    {day.expenses > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        Desp: {formatCurrency(day.expenses)}
                      </span>
                    )}
                    {day.pix > 0 && (
                      <span className="text-cyan-700 dark:text-cyan-400">
                        Pix: {formatCurrency(day.pix)}
                      </span>
                    )}
                    {day.crediario > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        Cred: {formatCurrency(day.crediario)}
                      </span>
                    )}
                    {day.sangrias > 0 && (
                      <span className="text-orange-600 dark:text-orange-400">
                        Sang: {formatCurrency(day.sangrias)}
                      </span>
                    )}
                    {day.otherIn > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Entr: {formatCurrency(day.otherIn)}
                      </span>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70 bg-slate-50/40 dark:bg-slate-950/30">
                    {day.items.map((item) => {
                      const meta = CATEGORY_META[item.category];
                      return (
                        <div
                          key={item.key}
                          className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase shrink-0 ${meta.badgeClass}`}>
                              {item.categoryLabel}
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                              {item.description}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              • {item.userName}
                            </span>
                          </div>
                          <span className={`font-black tabular-nums whitespace-nowrap ${meta.valueClass}`}>
                            {meta.prefix}
                            {formatCurrency(item.val)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {groupedByDay.length === 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-6 py-16 text-center text-slate-400 dark:text-slate-500">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-bold">Nenhum lançamento encontrado para os filtros selecionados.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
