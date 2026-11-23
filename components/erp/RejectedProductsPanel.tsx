import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  DollarSign,
  Eye,
  RefreshCw,
  Search,
  ThumbsDown,
  Trash2,
  TrendingDown,
  X
} from 'lucide-react';
import { useToast } from '../ToastContext';

export interface RejectedRankingRow {
  product_code: string;
  barcode: string;
  product_name: string;
  rejection_count: number;
  pending_count: number;
  total_qty_rejected: number;
  lost_revenue: number;
  avg_rejected_price: number;
  avg_competitor_price: number | null;
  min_competitor_price: number | null;
  current_sale_price: number;
  current_promo_price: number;
  current_cost_price: number;
  current_stock_qty: number;
  effective_price: number;
  margin_percent: number | null;
  diff_vs_competitor_percent: number | null;
  last_rejected_at: string;
  consolidated_status: 'PENDENTE' | 'PRECO_AJUSTADO' | 'MANTIDO' | string;
  reasons_summary: Record<string, number>;
  competitors_summary: string[];
}

export interface RejectedItemRow {
  id: number;
  product_code: string;
  barcode: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  competitor_price: number | null;
  competitor_name: string;
  reason: string;
  notes: string;
  seller_name: string;
  operator_name: string;
  status: 'PENDENTE' | 'PRECO_AJUSTADO' | 'MANTIDO' | string;
  review_notes: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  current_sale_price: number;
  current_promo_price: number;
  current_cost_price: number;
  current_stock_qty: number;
}

export interface RejectedProductsPanelProps {
  currentUser?: { id?: string; name?: string; role?: string } | null;
  onNavigate?: (view: any) => void;
  isModalMode?: boolean;
  onSummaryChanged?: (summary: any) => void;
  onClose?: () => void;
}

const REASON_LABELS: Record<string, string> = {
  PRECO_ALTO: 'Preço alto / Fora de mercado',
  CONCORRENCIA: 'Mais barato na concorrência',
  DESISTENCIA: 'Desistiu / Sem dinheiro',
  OUTRO: 'Outro motivo'
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDENTE: { label: 'Pendente', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  PRECO_AJUSTADO: { label: 'Preço Ajustado', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  MANTIDO: { label: 'Preço Mantido', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' }
};

function formatCurrency(val: number | undefined | null): string {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateTimeBR(val?: string | null): string {
  if (!val) return '-';
  const normalized = String(val).includes('T') ? String(val) : String(val).replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getLocalYMD(date = new Date()): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getDaysAgoYMD(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getLocalYMD(d);
}

function parseMoneyInput(raw: string): number {
  const clean = String(raw || '').trim();
  if (!clean) return NaN;
  if (clean.includes(',')) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(clean);
}

export const RejectedProductsPanel: React.FC<RejectedProductsPanelProps> = ({
  currentUser,
  onNavigate,
  isModalMode = false,
  onSummaryChanged,
  onClose
}) => {
  const { addToast } = useToast();
  const uid = useId();
  const addToastRef = useRef(addToast);
  addToastRef.current = addToast;
  const onSummaryChangedRef = useRef(onSummaryChanged);
  onSummaryChangedRef.current = onSummaryChanged;

  const [activeTab, setActiveTab] = useState<'ranking' | 'historico'>('ranking');
  const [periodPreset, setPeriodPreset] = useState<'HOJE' | '7D' | '30D' | 'MES' | 'TUDO' | 'CUSTOM'>('30D');
  const [startDate, setStartDate] = useState<string>(() => getDaysAgoYMD(29));
  const [endDate, setEndDate] = useState<string>(() => getLocalYMD());
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [reasonFilter, setReasonFilter] = useState<string>('TODOS');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [ranking, setRanking] = useState<RejectedRankingRow[]>([]);
  const [items, setItems] = useState<RejectedItemRow[]>([]);
  const [kpis, setKpis] = useState({ totalRecusas: 0, produtosUnicos: 0, valorPerdido: 0, pendentes: 0 });

  // Painel de ajuste rápido de preço
  const [adjustTarget, setAdjustTarget] = useState<RejectedRankingRow | null>(null);
  const [newSalePriceInput, setNewSalePriceInput] = useState<string>('');
  const [newPromoPriceInput, setNewPromoPriceInput] = useState<string>('');
  const [adjustNotesInput, setAdjustNotesInput] = useState<string>('');
  const [savingAdjust, setSavingAdjust] = useState<boolean>(false);

  // Confirmação inline de exclusão de registro no histórico
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const actorName = currentUser?.name || 'Gestor';

  const fetchRejections = useCallback(
    async (overrides?: {
      start?: string;
      end?: string;
      status?: string;
      reason?: string;
      q?: string;
    }) => {
      setLoading(true);
      try {
        const s = overrides?.start !== undefined ? overrides.start : startDate;
        const e = overrides?.end !== undefined ? overrides.end : endDate;
        const st = overrides?.status !== undefined ? overrides.status : statusFilter;
        const rs = overrides?.reason !== undefined ? overrides.reason : reasonFilter;
        const qVal = overrides?.q !== undefined ? overrides.q : searchQuery;

        const params = new URLSearchParams();
        if (s) params.append('dataInicio', s);
        if (e) params.append('dataFim', e);
        if (st && st !== 'TODOS') params.append('status', st);
        if (rs && rs !== 'TODOS') params.append('reason', rs);
        if (qVal.trim()) params.append('q', qVal.trim());

        const res = await fetch(`/api/erp/pos/rejected-products?${params.toString()}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Erro ao carregar produtos recusados.');
        }

        setRanking(Array.isArray(json.ranking) ? json.ranking : []);
        setItems(Array.isArray(json.items) ? json.items : []);
        setKpis(json.kpis || { totalRecusas: 0, produtosUnicos: 0, valorPerdido: 0, pendentes: 0 });
        if (json.summary && onSummaryChangedRef.current) {
          onSummaryChangedRef.current(json.summary);
        }
      } catch (err: any) {
        addToastRef.current(err?.message || 'Erro ao carregar lista de recusados.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [startDate, endDate, statusFilter, reasonFilter, searchQuery]
  );

  useEffect(() => {
    fetchRejections();
  }, [fetchRejections]);

  const applyPeriodPreset = (preset: 'HOJE' | '7D' | '30D' | 'MES' | 'TUDO') => {
    setPeriodPreset(preset);
    const today = getLocalYMD();
    let s = '';
    let e = today;

    if (preset === 'HOJE') {
      s = today;
      e = today;
    } else if (preset === '7D') {
      s = getDaysAgoYMD(6);
      e = today;
    } else if (preset === '30D') {
      s = getDaysAgoYMD(29);
      e = today;
    } else if (preset === 'MES') {
      const d = new Date();
      s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      e = today;
    } else if (preset === 'TUDO') {
      s = '';
      e = '';
    }

    setStartDate(s);
    setEndDate(e);
    fetchRejections({ start: s, end: e });
  };

  const openAdjustPrice = (row: RejectedRankingRow) => {
    setAdjustTarget(row);
    setNewSalePriceInput(row.current_sale_price > 0 ? row.current_sale_price.toFixed(2).replace('.', ',') : '');
    setNewPromoPriceInput(
      row.current_promo_price > 0
        ? row.current_promo_price.toFixed(2).replace('.', ',')
        : row.min_competitor_price && row.min_competitor_price > 0
        ? row.min_competitor_price.toFixed(2).replace('.', ',')
        : ''
    );
    setAdjustNotesInput('');
  };

  const adjustMarginPreview = useMemo(() => {
    if (!adjustTarget) return null;
    const cost = adjustTarget.current_cost_price || 0;
    const sale = parseMoneyInput(newSalePriceInput);
    const promo = parseMoneyInput(newPromoPriceInput);
    const effective = !isNaN(promo) && promo > 0 ? promo : !isNaN(sale) && sale > 0 ? sale : 0;
    if (effective <= 0) return null;
    const margin = cost > 0 ? ((effective - cost) / effective) * 100 : null;
    const profit = cost > 0 ? effective - cost : null;
    return {
      effective,
      cost,
      margin: margin !== null ? Math.round(margin * 10) / 10 : null,
      profit: profit !== null ? Math.round(profit * 100) / 100 : null,
      belowCost: cost > 0 && effective < cost
    };
  }, [adjustTarget, newSalePriceInput, newPromoPriceInput]);

  const handleConfirmAdjustPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;

    const saleVal = newSalePriceInput.trim() ? parseMoneyInput(newSalePriceInput) : undefined;
    const promoVal = newPromoPriceInput.trim() ? parseMoneyInput(newPromoPriceInput) : undefined;

    if (saleVal !== undefined && (isNaN(saleVal) || saleVal <= 0)) {
      addToast('Informe um preço de venda válido maior que zero.', 'warning');
      return;
    }
    if (promoVal !== undefined && (isNaN(promoVal) || promoVal < 0)) {
      addToast('Informe um preço promocional válido.', 'warning');
      return;
    }
    if (saleVal === undefined && promoVal === undefined) {
      addToast('Informe ao menos o novo preço de venda ou promocional.', 'warning');
      return;
    }

    setSavingAdjust(true);
    try {
      const res = await fetch(
        `/api/erp/pos/rejected-products/product/${encodeURIComponent(adjustTarget.product_code)}/adjust-price`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-name': actorName
          },
          body: JSON.stringify({
            sale_price: saleVal,
            promo_price: promoVal,
            review_notes: adjustNotesInput.trim(),
            reviewed_by: actorName
          })
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Falha ao ajustar preço.');
      }

      addToast(`Preço de "${adjustTarget.product_name}" atualizado e recusas marcadas como ajustadas!`, 'success');
      setAdjustTarget(null);
      if (json.summary && onSummaryChangedRef.current) onSummaryChangedRef.current(json.summary);
      await fetchRejections();
    } catch (err: any) {
      addToast(err?.message || 'Erro ao ajustar preço.', 'error');
    } finally {
      setSavingAdjust(false);
    }
  };

  const handleMarkProductMaintained = async (row: RejectedRankingRow) => {
    try {
      const res = await fetch(
        `/api/erp/pos/rejected-products/product/${encodeURIComponent(row.product_code)}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-name': actorName
          },
          body: JSON.stringify({
            status: 'MANTIDO',
            review_notes: 'Analisado pela gestão — preço atual mantido',
            reviewed_by: actorName
          })
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao atualizar status.');
      }
      addToast(`"${row.product_name}" marcado como Preço Mantido.`, 'info');
      if (json.summary && onSummaryChangedRef.current) onSummaryChangedRef.current(json.summary);
      await fetchRejections();
    } catch (err: any) {
      addToast(err?.message || 'Erro ao atualizar status.', 'error');
    }
  };

  const handleUpdateSingleItemStatus = async (item: RejectedItemRow, nextStatus: 'MANTIDO' | 'PRECO_AJUSTADO') => {
    try {
      const res = await fetch(`/api/erp/pos/rejected-products/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-name': actorName
        },
        body: JSON.stringify({
          status: nextStatus,
          reviewed_by: actorName
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao atualizar registro.');
      }
      addToast('Status da ocorrência atualizado.', 'info');
      if (json.summary && onSummaryChangedRef.current) onSummaryChangedRef.current(json.summary);
      await fetchRejections();
    } catch (err: any) {
      addToast(err?.message || 'Erro ao atualizar registro.', 'error');
    }
  };

  const handleDeleteSingleItem = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/erp/pos/rejected-products/${id}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao excluir registro.');
      }
      addToast('Registro de recusa excluído.', 'info');
      setConfirmDeleteId(null);
      if (json.summary && onSummaryChangedRef.current) onSummaryChangedRef.current(json.summary);
      await fetchRejections();
    } catch (err: any) {
      addToast(err?.message || 'Erro ao excluir registro.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleInspectProductHistory = (row: RejectedRankingRow) => {
    setSearchQuery(row.product_code !== 'AVULSO' ? row.product_code : row.product_name);
    setActiveTab('historico');
  };

  return (
    <div className="flex flex-col gap-3.5 text-slate-100 h-full min-h-0">
      {/* Cabeçalho de página (somente quando aberto na retaguarda) */}
      {!isModalMode && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                title="Voltar"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
              <ThumbsDown className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white">Produtos Recusados no PDV • Análise de Preço</h1>
              <p className="text-xs text-slate-400">
                Identifique produtos recusados por preço fora de mercado, compare com a concorrência e ajuste margens em 1 clique.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchRejections()}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      )}

      {/* Filtros de Período, Status, Motivo e Busca */}
      <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            {[
              { id: 'HOJE', label: 'Hoje' },
              { id: '7D', label: '7 Dias' },
              { id: '30D', label: '30 Dias' },
              { id: 'MES', label: 'Este Mês' },
              { id: 'TUDO', label: 'Tudo' }
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPeriodPreset(p.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  periodPreset === p.id
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-xl">
              <span className="text-slate-400 font-bold">De:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setPeriodPreset('CUSTOM');
                }}
                className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-xl">
              <span className="text-slate-400 font-bold">Até:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value);
                  setPeriodPreset('CUSTOM');
                }}
                className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
          <select
            aria-label="Filtrar por status"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="TODOS">Todos os Status</option>
            <option value="PENDENTE">Pendentes de Análise</option>
            <option value="PRECO_AJUSTADO">Preço Ajustado</option>
            <option value="MANTIDO">Preço Mantido</option>
          </select>

          <select
            aria-label="Filtrar por motivo"
            value={reasonFilter}
            onChange={e => setReasonFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="TODOS">Todos os Motivos</option>
            <option value="PRECO_ALTO">Preço alto / Fora de mercado</option>
            <option value="CONCORRENCIA">Mais barato na concorrência</option>
            <option value="DESISTENCIA">Desistência</option>
            <option value="OUTRO">Outro motivo</option>
          </select>

          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id={`${uid}-rej-search`}
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por produto, EAN, código ou concorrente..."
              className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => fetchRejections()}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Filtrar</span>
          </button>
        </div>
      </div>

      {/* KPIs do Período */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
        <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total de Recusas</span>
          <strong className="text-base sm:text-lg font-mono font-black text-white tabular-nums">{kpis.totalRecusas}</strong>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Produtos Únicos</span>
          <strong className="text-base sm:text-lg font-mono font-black text-sky-400 tabular-nums">{kpis.produtosUnicos}</strong>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Venda Perdida Estimada</span>
          <strong className="text-base sm:text-lg font-mono font-black text-rose-400 tabular-nums">
            {formatCurrency(kpis.valorPerdido)}
          </strong>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pendentes de Análise</span>
          <strong className="text-base sm:text-lg font-mono font-black text-amber-400 tabular-nums">{kpis.pendentes}</strong>
        </div>
      </div>

      {/* Painel Inline de Ajuste Rápido de Preço */}
      {adjustTarget && (
        <form
          onSubmit={handleConfirmAdjustPrice}
          className="p-4 rounded-2xl bg-emerald-950/35 border-2 border-emerald-500/60 space-y-3 shrink-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-800/60 pb-2">
            <div>
              <h3 className="text-sm font-black text-emerald-200 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-emerald-400" />
                <span>Ajustar Preço de Mercado — {adjustTarget.product_name}</span>
              </h3>
              <div className="text-xs text-slate-300 flex flex-wrap items-center gap-3 mt-0.5 font-mono">
                <span>Custo: <strong className="text-white">{formatCurrency(adjustTarget.current_cost_price)}</strong></span>
                <span>• Normal: <strong className="text-white">{formatCurrency(adjustTarget.current_sale_price)}</strong></span>
                {adjustTarget.current_promo_price > 0 && (
                  <span>• Promo atual: <strong className="text-amber-300">{formatCurrency(adjustTarget.current_promo_price)}</strong></span>
                )}
                {adjustTarget.min_competitor_price !== null && (
                  <span>• Concorrência (mín.): <strong className="text-rose-300">{formatCurrency(adjustTarget.min_competitor_price)}</strong></span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAdjustTarget(null)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label htmlFor={`${uid}-adj-sale`} className="block text-xs font-bold text-slate-200 mb-1">
                Novo Preço Normal (R$)
              </label>
              <input
                id={`${uid}-adj-sale`}
                type="text"
                inputMode="decimal"
                value={newSalePriceInput}
                onChange={e => setNewSalePriceInput(e.target.value)}
                placeholder="Ex: 24,90"
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label htmlFor={`${uid}-adj-promo`} className="block text-xs font-bold text-amber-200 mb-1">
                Novo Preço Promocional (R$ opcional)
              </label>
              <input
                id={`${uid}-adj-promo`}
                type="text"
                inputMode="decimal"
                value={newPromoPriceInput}
                onChange={e => setNewPromoPriceInput(e.target.value)}
                placeholder="0,00 para remover promo"
                className="w-full px-3 py-2 rounded-xl border border-amber-500/50 bg-slate-950 text-amber-300 font-mono font-bold text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label htmlFor={`${uid}-adj-notes`} className="block text-xs font-bold text-slate-300 mb-1">
                Observação da Revisão
              </label>
              <input
                id={`${uid}-adj-notes`}
                type="text"
                value={adjustNotesInput}
                onChange={e => setAdjustNotesInput(e.target.value)}
                placeholder="Ex: Igualado ao mercado"
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs focus:outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-xs">
              {adjustMarginPreview && (
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border font-bold ${
                    adjustMarginPreview.belowCost
                      ? 'bg-rose-950/70 border-rose-500/70 text-rose-200'
                      : 'bg-slate-950 border-slate-700 text-emerald-300'
                  }`}
                >
                  {adjustMarginPreview.belowCost && <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
                  <span>
                    Preço efetivo: <strong className="font-mono">{formatCurrency(adjustMarginPreview.effective)}</strong>
                    {adjustMarginPreview.margin !== null && (
                      <>
                        {' '}• Nova margem: <strong className="font-mono">{adjustMarginPreview.margin.toFixed(1)}%</strong> ({formatCurrency(adjustMarginPreview.profit)}/un)
                      </>
                    )}
                    {adjustMarginPreview.belowCost && ' — ATENÇÃO: Abaixo do custo!'}
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={savingAdjust}
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Check className="w-4 h-4" />
              <span>{savingAdjust ? 'Salvando...' : 'Aplicar Novo Preço no PDV'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Abas Ranking / Histórico */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 shrink-0">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('ranking')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-colors ${
              activeTab === 'ranking' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Ranking por Produto ({ranking.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('historico')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-colors ${
              activeTab === 'historico' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Histórico Detalhado ({items.length})
          </button>
        </div>

        {isModalMode && onClose && (
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Clique no <strong className="text-emerald-400">$</strong> para corrigir preço fora de mercado na hora.
          </span>
        )}
      </div>

      {/* Área da Tabela */}
      <div
        tabIndex={0}
        role="region"
        aria-label={activeTab === 'ranking' ? 'Ranking de produtos recusados' : 'Histórico detalhado de produtos recusados'}
        className="crediario-table-region crediario-responsive-table flex-1 overflow-auto min-h-[260px] border border-slate-800 rounded-2xl bg-slate-950/70 shadow-inner"
      >
        {loading && ranking.length === 0 && items.length === 0 ? (
          <div className="py-14 text-center text-xs text-slate-400">Carregando análise de produtos recusados...</div>
        ) : activeTab === 'ranking' ? (
          ranking.length === 0 ? (
            <div className="py-14 text-center text-xs text-slate-500">
              Nenhum produto recusado registrado para os filtros selecionados.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400">
                    Produto
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 text-center w-20">
                    Recusas
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 text-right w-24">
                    Custo (R$)
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 text-right w-28">
                    Preço Atual
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 text-right w-20">
                    Margem
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 text-right w-36">
                    Concorrência
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 text-right w-28">
                    Venda Perdida
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 w-28">
                    Status
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 text-center w-28">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {ranking.map(row => {
                  const st = STATUS_BADGE[row.consolidated_status] || STATUS_BADGE.PENDENTE;
                  const countCls =
                    row.rejection_count >= 3
                      ? 'bg-rose-600/30 text-rose-200 border-rose-500/60'
                      : row.rejection_count === 2
                      ? 'bg-amber-500/25 text-amber-200 border-amber-500/50'
                      : 'bg-slate-800 text-slate-200 border-slate-700';

                  return (
                    <tr key={row.product_code} className="hover:bg-slate-900/90 transition-colors">
                      <td data-label="Produto" className="px-3 py-2 max-w-[300px]">
                        <div className="font-bold text-slate-100 truncate" title={row.product_name}>
                          {row.product_name}
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                          <span>EAN: {row.barcode || 'S/N'}</span>
                          <span>•</span>
                          <span>Cód: {row.product_code}</span>
                          <span>•</span>
                          <span>Estq: {row.current_stock_qty}</span>
                          {row.competitors_summary.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-amber-300 truncate max-w-[120px]">
                                {row.competitors_summary.join(', ')}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      <td data-label="Recusas" className="px-3 py-2 text-center whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-md border font-mono font-black text-xs ${countCls}`}>
                          {row.rejection_count}x
                        </span>
                      </td>

                      <td data-label="Custo" className="px-3 py-2 text-right font-mono text-slate-300 tabular-nums whitespace-nowrap">
                        {row.current_cost_price > 0 ? formatCurrency(row.current_cost_price) : '-'}
                      </td>

                      <td data-label="Preço Atual" className="px-3 py-2 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                        {row.current_promo_price > 0 ? (
                          <span className="text-amber-300" title={`Normal: ${formatCurrency(row.current_sale_price)}`}>
                            {formatCurrency(row.current_promo_price)} <span className="text-[9px] font-sans">PROMO</span>
                          </span>
                        ) : (
                          <span className="text-emerald-400">{formatCurrency(row.effective_price)}</span>
                        )}
                      </td>

                      <td data-label="Margem" className="px-3 py-2 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                        {row.margin_percent === null ? (
                          <span className="text-slate-500">-</span>
                        ) : (
                          <span
                            className={
                              row.margin_percent < 15
                                ? 'text-rose-400'
                                : row.margin_percent < 30
                                ? 'text-amber-300'
                                : 'text-emerald-400'
                            }
                          >
                            {row.margin_percent.toFixed(1)}%
                          </span>
                        )}
                      </td>

                      <td data-label="Concorrência" className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                        {row.min_competitor_price !== null ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-slate-200 font-bold">{formatCurrency(row.min_competitor_price)}</span>
                            {row.diff_vs_competitor_percent !== null && row.diff_vs_competitor_percent > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-black">
                                +{row.diff_vs_competitor_percent.toFixed(0)}%
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      <td data-label="Venda Perdida" className="px-3 py-2 text-right font-mono font-bold text-rose-300 tabular-nums whitespace-nowrap">
                        {formatCurrency(row.lost_revenue)}
                      </td>

                      <td data-label="Status" className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black uppercase ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>

                      <td data-label="Ações" className="px-3 py-2 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openAdjustPrice(row)}
                            title="Ajustar preço de venda / promoção agora"
                            aria-label={`Ajustar preço de ${row.product_name}`}
                            className="p-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/70 cursor-pointer"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                          </button>

                          {row.pending_count > 0 && (
                            <button
                              type="button"
                              onClick={() => handleMarkProductMaintained(row)}
                              title="Marcar como analisado (preço atual mantido)"
                              aria-label={`Marcar preço mantido para ${row.product_name}`}
                              className="p-1.5 rounded-lg bg-sky-950/70 hover:bg-sky-900 text-sky-300 border border-sky-700/70 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleInspectProductHistory(row)}
                            title="Ver ocorrências detalhadas deste produto"
                            aria-label={`Ver ocorrências de ${row.product_name}`}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : items.length === 0 ? (
          <div className="py-14 text-center text-xs text-slate-500">
            Nenhuma ocorrência detalhada encontrada para os filtros selecionados.
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 w-32">
                  Data / Hora
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400">
                  Produto
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 text-center w-16">
                  Qtd
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 text-right w-24">
                  Preço PDV
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 text-right w-24">
                  Citado
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400">
                  Motivo / Concorrente
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 w-28">
                  Vendedor
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 w-28">
                  Status
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase text-slate-400 text-center w-28">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {items.map(it => {
                const st = STATUS_BADGE[it.status] || STATUS_BADGE.PENDENTE;
                const reasonText = REASON_LABELS[it.reason] || it.reason;

                return (
                  <tr key={it.id} className="hover:bg-slate-900/90 transition-colors">
                    <td data-label="Data / Hora" className="px-3 py-2 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {formatDateTimeBR(it.created_at)}
                    </td>

                    <td data-label="Produto" className="px-3 py-2 max-w-[260px]">
                      <div className="font-bold text-slate-100 truncate" title={it.product_name}>
                        {it.product_name}
                      </div>
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                        <span>EAN: {it.barcode || 'S/N'}</span>
                        <span>•</span>
                        <span>Cód: {it.product_code}</span>
                      </div>
                    </td>

                    <td data-label="Qtd" className="px-3 py-2 text-center font-mono text-slate-200 whitespace-nowrap">
                      {it.quantity}
                    </td>

                    <td data-label="Preço PDV" className="px-3 py-2 text-right font-mono font-bold text-emerald-400 tabular-nums whitespace-nowrap">
                      {formatCurrency(it.unit_price)}
                    </td>

                    <td data-label="Citado" className="px-3 py-2 text-right font-mono text-amber-300 tabular-nums whitespace-nowrap">
                      {it.competitor_price !== null && it.competitor_price > 0
                        ? formatCurrency(it.competitor_price)
                        : '-'}
                    </td>

                    <td data-label="Motivo" className="px-3 py-2 max-w-[240px]">
                      <div className="text-slate-200 font-semibold truncate">{reasonText}</div>
                      {(it.competitor_name || it.notes) && (
                        <div className="text-[10px] text-slate-400 truncate" title={`${it.competitor_name} ${it.notes}`}>
                          {[it.competitor_name, it.notes].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </td>

                    <td data-label="Vendedor" className="px-3 py-2 text-slate-300 truncate max-w-[120px] whitespace-nowrap">
                      {it.seller_name || it.operator_name || 'Caixa'}
                    </td>

                    <td data-label="Status" className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black uppercase ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>

                    <td data-label="Ações" className="px-3 py-2 text-center whitespace-nowrap">
                      {confirmDeleteId === it.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={deletingId === it.id}
                            onClick={() => handleDeleteSingleItem(it.id)}
                            className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black cursor-pointer"
                            title="Confirmar exclusão"
                          >
                            Excluir
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold cursor-pointer"
                            title="Cancelar exclusão"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          {it.status === 'PENDENTE' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateSingleItemStatus(it, 'MANTIDO')}
                              title="Marcar esta ocorrência como Preço Mantido"
                              aria-label="Marcar como preço mantido"
                              className="p-1.5 rounded-lg bg-sky-950/70 hover:bg-sky-900 text-sky-300 border border-sky-700/70 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(it.id)}
                            title="Excluir registro de recusa"
                            aria-label="Excluir registro de recusa"
                            className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/70 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default RejectedProductsPanel;
