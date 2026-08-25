import React, { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
  TrendingDown,
  Wallet,
  BarChart3,
  RefreshCw, 
  Search, 
  DollarSign, 
  Check, 
  AlertTriangle, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Info, 
  Percent, 
  Coins, 
  Eye,
  SlidersHorizontal,
  XCircle,
  CheckCircle2,
  Database,
  Edit3,
  Tag,
  Package,
  Layers,
  Sparkles,
  ArrowUpRight,
  Filter,
  FileSpreadsheet,
  Bot,
  Calculator,
  History,
  Clock,
  RotateCcw,
  ShieldCheck,
  Calendar,
  AlertCircle,
  ArrowRight,
  CheckCheck
} from 'lucide-react';
import { useToast } from './ToastContext';
import { roundUpToAcceptedCents } from '../utils';
import { PricingEngineView } from './PricingEngineView';
import { PricingSimulator } from './PricingSimulator';
import { User } from '../types';

interface Product {
  ean: string;
  id: string;
  categoria_id?: number;
  name: string;
  stock: number;
  price: number;
  cost_price: number;
  promo_price?: number;
  normal_price?: number;
  curve: 'A' | 'B' | 'C';
  cached_at: string;
  region_price: number | null;
  region_price_baixo?: number | null;
  region_price_medio?: number | null;
  region_price_alto?: number | null;
  region_updated_at: string | null;
  tributacao_monofasica?: string;
  cst_pis?: string;
  cst_cofins?: string;
  aliquota_st?: number;
  imposto_aliq?: number;
  ncm?: string;
  cest?: string;
}

interface Pagination {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}

interface ScrapeStatus {
  running: boolean;
  totalItems: number;
  currentProgress: number;
  successCount: number;
  failedCount: number;
  startTime: string | null;
  endTime: string | null;
  lastError: string | null;
}

interface ScheduledStep {
  id: string;
  produto_id: number;
  descricao: string;
  cod_barras: string;
  preco_inicial: number;
  preco_alvo: number;
  preco_atual: number;
  max_pct_por_etapa: number;
  intervalo_dias: number;
  etapa_atual: number;
  total_etapas: number;
  proxima_execucao: string;
  status: 'ativo' | 'concluido' | 'cancelado';
  criado_por: string;
  criado_em: string;
  ultima_atualizacao: string;
}

interface PriceSnapshot {
  id: string;
  produto_id: number;
  descricao: string;
  cod_barras: string;
  preco_anterior: number;
  novo_preco: number;
  preco_custo: number;
  tipo: string;
  motivo: string;
  usuario: string;
  data_alteracao: string;
  revertido: number;
  revertido_em?: string;
  revertido_por?: string;
  curva?: string;
  estoque_atual?: number;
  diff_preco?: number;
  diff_percentual?: number;
  volume_mensal_estimado?: number;
  impacto_mensal_faturamento?: number;
  impacto_mensal_lucro?: number;
}

interface ImpactSummary {
  totalChanges: number;
  totalIncrease: number;
  totalDecrease: number;
  totalReverted: number;
  activeChanges: number;
  totalMonthlyRevenueImpact: number;
  totalMonthlyProfitImpact: number;
  averagePriceChangePct: number;
}

interface PriceManagerProps {
  user?: User | null;
}

export const PriceManager: React.FC<PriceManagerProps> = ({ user }) => {
  const { addToast } = useToast();
  
  // Abas: 'catalog' | 'simulator' | 'scheduled' | 'history' | 'engine'
  const [pricingTab, setPricingTab] = useState<'catalog' | 'simulator' | 'scheduled' | 'history' | 'engine'>('catalog');

  // Estados de dados do Catálogo
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    totalItems: 0,
    totalPages: 1,
    currentPage: 1,
    limit: 50
  });
  
  // Estados de filtros avançados
  const [search, setSearch] = useState('');
  const [curva, setCurva] = useState<'ALL' | 'A' | 'B' | 'C'>('ALL');
  const [profferFilter, setProfferFilter] = useState<'ALL' | 'BELOW_AVG' | 'BELOW_MIN' | 'ABOVE_AVG' | 'ABOVE_MAX' | 'WITH_NAPP' | 'WITHOUT_NAPP'>('ALL');
  const [profferDiffPercent, setProfferDiffPercent] = useState<string>('0');
  const [marginFilter, setMarginFilter] = useState<'ALL' | 'LOW_MARGIN' | 'BELOW_COST' | 'HIGH_MARGIN'>('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK'>('IN_STOCK');
  const [isNewFilter, setIsNewFilter] = useState<'ALL' | 'NEW_ENTRIES'>('ALL');
  const [categoria, setCategoria] = useState<'ALL' | 'GENERICO' | 'SIMILAR' | 'PERFUMARIA' | 'MARCA'>('ALL');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(1);
  
  // Estados de carregamento
  const [loading, setLoading] = useState(false);
  const [syncingCache, setSyncingCache] = useState(false);
  
  // Seleção múltipla
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Scraper status
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>({
    running: false,
    totalItems: 0,
    currentProgress: 0,
    successCount: 0,
    failedCount: 0,
    startTime: null,
    endTime: null,
    lastError: null
  });
  
  // Reajustes em massa
  const [bulkScope, setBulkScope] = useState<'SELECTED' | 'FILTERED_ALL'>('FILTERED_ALL');
  const [operationType, setOperationType] = useState<'percentage' | 'fixed' | 'region'>('percentage');
  const [adjustValue, setAdjustValue] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [applyingAdjustment, setApplyingAdjustment] = useState(false);

  // Modal de Ação Individual de Preço (Direto vs Escalonado)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editActionType, setEditActionType] = useState<'direct' | 'scheduled'>('direct');
  const [singleOpType, setSingleOpType] = useState<'manual' | 'percentage' | 'region'>('manual');
  const [singleValue, setSingleValue] = useState('');
  const [scheduledMaxPct, setScheduledMaxPct] = useState('5.0');
  const [scheduledIntervalDays, setScheduledIntervalDays] = useState('7');
  const [savingSingleProduct, setSavingSingleProduct] = useState(false);

  // Reajustes Escalonados e Snapshots
  const [scheduledSteps, setScheduledSteps] = useState<ScheduledStep[]>([]);
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [snapshotPeriod, setSnapshotPeriod] = useState<'all' | 'today' | '7d' | '30d' | 'month'>('all');
  const [snapshotSearch, setSnapshotSearch] = useState<string>('');
  const [impactSummary, setImpactSummary] = useState<ImpactSummary>({
    totalChanges: 0,
    totalIncrease: 0,
    totalDecrease: 0,
    totalReverted: 0,
    activeChanges: 0,
    totalMonthlyRevenueImpact: 0,
    totalMonthlyProfitImpact: 0,
    averagePriceChangePct: 0
  });
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  // Estatísticas do Catálogo
  const [stats, setStats] = useState({
    total: 0,
    curveA: 0,
    curveB: 0,
    curveC: 0,
    withNapp: 0,
    belowMarketAvg: 0,
    belowMarketMin: 0,
    belowCost: 0,
    activeSchedules: 0,
    totalSnapshots: 0
  });

  // Carregar produtos filtrados
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
        search,
        curva,
        profferFilter,
        profferDiffPercent,
        marginFilter,
        stockFilter,
        isNewFilter,
        categoria,
        minPrice,
        maxPrice
      });
      
      const res = await fetch(`/api/price-manager/products?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Erro ao buscar produtos.');
      
      const result = await res.json();
      if (result.success) {
        setProducts(result.data);
        setPagination(result.pagination);
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao carregar produtos do cache.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, curva, profferFilter, profferDiffPercent, marginFilter, stockFilter, isNewFilter, categoria, minPrice, maxPrice, pagination.limit, addToast]);

  // Carregar status do Scraper
  const fetchScrapeStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/price-manager/scrape-status');
      if (res.ok) {
        const data = await res.json();
        setScrapeStatus(data);
      }
    } catch (err) {}
  }, []);

  // Monitorar estatísticas gerais
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/price-manager/stats');
      if (res.ok) {
        const result = await res.json();
        setStats(result);
      }
    } catch (err) {}
  }, []);

  // Carregar agendamentos escalonados
  const fetchScheduledSteps = useCallback(async () => {
    setLoadingScheduled(true);
    try {
      const res = await fetch('/api/price-manager/scheduled-steps');
      if (res.ok) {
        const result = await res.json();
        if (result.success) setScheduledSteps(result.data || []);
      }
    } catch (err) {
      console.error('Erro ao carregar reajustes escalonados:', err);
    } finally {
      setLoadingScheduled(false);
    }
  }, []);

  // Carregar snapshots de backup e métricas de impacto no faturamento
  const fetchSnapshots = useCallback(async () => {
    setLoadingSnapshots(true);
    try {
      const params = new URLSearchParams({
        limit: '100',
        period: snapshotPeriod,
        search: snapshotSearch
      });
      const res = await fetch(`/api/price-manager/snapshots?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setSnapshots(result.data || []);
          if (result.summary) setImpactSummary(result.summary);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar histórico de backups:', err);
    } finally {
      setLoadingSnapshots(false);
    }
  }, [snapshotPeriod, snapshotSearch]);

  // Sincronizar Cache Digifarma
  const handleSyncCache = async () => {
    setSyncingCache(true);
    try {
      const res = await fetch('/api/price-manager/sync-cache', { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        addToast(result.message, 'success');
        fetchProducts();
        fetchStats();
      } else {
        throw new Error(result.error || 'Erro na sincronização.');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setSyncingCache(false);
    }
  };

  // Disparar Coleta Napp Proffer
  const handleTriggerScrape = async (eansToScrape?: string[]) => {
    try {
      const res = await fetch('/api/price-manager/trigger-napp-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eans: eansToScrape || [] })
      });
      const result = await res.json();
      if (result.success) {
        addToast('Coleta Napp Solutions iniciada em segundo plano!', 'info');
        fetchScrapeStatus();
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao disparar coleta.', 'error');
    }
  };

  // Cancelar Reajuste Escalonado
  const handleCancelScheduledStep = async (id: string) => {
    try {
      const res = await fetch('/api/price-manager/scheduled-steps/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const result = await res.json();
      if (result.success) {
        addToast('Agendamento escalonado cancelado com sucesso.', 'info');
        fetchScheduledSteps();
        fetchStats();
      }
    } catch (err) {
      addToast('Erro ao cancelar agendamento.', 'error');
    }
  };

  // Reverter (Rollback) Snapshot de Preço
  const handleRollbackSnapshot = async (snapshotId: string) => {
    setRollingBackId(snapshotId);
    try {
      const res = await fetch('/api/price-manager/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotId,
          usuario: user?.name || 'Administrador'
        })
      });
      const result = await res.json();
      if (result.success) {
        addToast(result.message, 'success');
        fetchSnapshots();
        fetchProducts();
        fetchStats();
      } else {
        addToast(result.error || 'Erro ao reverter preço.', 'error');
      }
    } catch (err) {
      addToast('Erro de comunicação ao reverter preço.', 'error');
    } finally {
      setRollingBackId(null);
    }
  };

  // Salvar Alteração de Preço Individual (Direto ou Escalonado)
  const handleSaveSingleProduct = async () => {
    if (!editingProduct) return;
    setSavingSingleProduct(true);
    try {
      const targetPrice = previewSingle.rounded;

      if (editActionType === 'direct') {
        // Aplicação Direta Imediata
        const res = await fetch('/api/price-manager/apply-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            produtoId: editingProduct.id,
            novoPreco: targetPrice,
            motivo: `Ajuste manual (${singleOpType === 'percentage' ? `${singleValue}%` : singleOpType === 'region' ? 'Igualar Proffer' : 'Valor Fixo'})`,
            usuario: user?.name || 'Administrador',
            tipo: 'direto'
          })
        });
        const data = await res.json();
        if (data.success) {
          addToast(data.message, 'success');
          setEditingProduct(null);
          fetchProducts();
          fetchStats();
        } else {
          addToast(data.error || 'Erro ao atualizar preço.', 'error');
        }
      } else {
        // Aplicação Escalonada (Gradual)
        const res = await fetch('/api/price-manager/schedule-step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            produtoId: editingProduct.id,
            precoAlvo: targetPrice,
            maxPctPorEtapa: parseFloat(scheduledMaxPct) || 5.0,
            intervaloDias: parseInt(scheduledIntervalDays) || 7,
            usuario: user?.name || 'Administrador',
            motivo: 'Subida gradual configurada pelo Gestor'
          })
        });
        const data = await res.json();
        if (data.success) {
          addToast(data.message, 'success');
          setEditingProduct(null);
          fetchProducts();
          fetchStats();
        } else {
          addToast(data.error || 'Erro ao agendar reajuste.', 'error');
        }
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao salvar produto.', 'error');
    } finally {
      setSavingSingleProduct(false);
    }
  };

  // Efeitos iniciais
  useEffect(() => {
    fetchProducts();
    fetchStats();
    fetchScrapeStatus();
  }, [fetchProducts, fetchStats, fetchScrapeStatus]);

  useEffect(() => {
    if (pricingTab === 'scheduled') fetchScheduledSteps();
    if (pricingTab === 'history') fetchSnapshots();
  }, [pricingTab, fetchScheduledSteps, fetchSnapshots]);

  // Polling de status do Scraper
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (scrapeStatus.running) {
      interval = setInterval(() => {
        fetchScrapeStatus();
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [scrapeStatus.running, fetchScrapeStatus]);

  // Cálculo da prévia do produto em edição individual
  const previewSingle = React.useMemo(() => {
    if (!editingProduct) return { raw: 0, rounded: 0, profit: 0, marginPct: 0, isBelowCost: false };
    
    let base = editingProduct.price;
    let target = base;

    if (singleOpType === 'manual') {
      const val = parseFloat(singleValue.replace(',', '.'));
      target = isNaN(val) ? base : val;
    } else if (singleOpType === 'percentage') {
      const pct = parseFloat(singleValue.replace(',', '.'));
      if (!isNaN(pct)) {
        target = base * (1 + pct / 100);
      }
    } else if (singleOpType === 'region') {
      target = editingProduct.region_price || base;
    }

    const rounded = roundUpToAcceptedCents(target);
    const profit = rounded - editingProduct.cost_price;
    const marginPct = rounded > 0 ? ((profit / rounded) * 100) : 0;
    const isBelowCost = editingProduct.cost_price > 0 && rounded < editingProduct.cost_price;

    return { raw: target, rounded, profit, marginPct, isBelowCost };
  }, [editingProduct, singleOpType, singleValue]);

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* Header Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 rounded-3xl text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-inner">
            <TrendingUp className="w-8 h-8 text-blue-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Gestão Estratégica de Preços</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/30 text-blue-200 border border-blue-400/30">
                BelaFarma Live
              </span>
            </div>
            <p className="text-xs text-blue-100/70 mt-1 max-w-xl">
              Inteligência de mercado farmacêutico, simulação de markup divisor, reajustes escalonados com backups de segurança.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleTriggerScrape()}
            disabled={scrapeStatus.running}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-blue-600/30 cursor-pointer disabled:opacity-50"
            title="Coletar preços concorrentes na Napp Solutions"
          >
            <Bot className={`w-4 h-4 ${scrapeStatus.running ? 'animate-spin' : ''}`} />
            <span>{scrapeStatus.running ? `Coletando (${scrapeStatus.currentProgress}/${scrapeStatus.totalItems})` : 'Forçar Coleta Proffer'}</span>
          </button>

          <button
            onClick={handleSyncCache}
            disabled={syncingCache}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            title="Recalcular Curva ABC e sincronizar Digifarma"
          >
            <RefreshCw className={`w-4 h-4 ${syncingCache ? 'animate-spin' : ''}`} />
            <span>Sincronizar Digifarma</span>
          </button>
        </div>
      </div>

      {/* Navegação de Abas */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setPricingTab('catalog')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            pricingTab === 'catalog'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Monitor & Catálogo de Mercado</span>
        </button>

        <button
          onClick={() => setPricingTab('simulator')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            pricingTab === 'simulator'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Calculator className="w-4 h-4 text-emerald-400" />
          <span>Simulador de Preço (Markup Divisor)</span>
        </button>

        <button
          onClick={() => setPricingTab('scheduled')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            pricingTab === 'scheduled'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Clock className="w-4 h-4 text-amber-400" />
          <span>Reajustes Escalonados</span>
          {stats.activeSchedules > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500 text-white">
              {stats.activeSchedules}
            </span>
          )}
        </button>

        <button
          onClick={() => setPricingTab('history')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            pricingTab === 'history'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span>Histórico & Impacto no Faturamento</span>
        </button>

        <button
          onClick={() => setPricingTab('engine')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            pricingTab === 'engine'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Bot className="w-4 h-4 text-purple-400" />
          <span>Belinha Pricing Inteligente</span>
        </button>
      </div>

      {/* ABA 1: SIMULADOR DE FORMAÇÃO DE PREÇO */}
      {pricingTab === 'simulator' && (
        <PricingSimulator user={user} />
      )}

      {/* ABA 2: BELINHA PRICING ENGINE */}
      {pricingTab === 'engine' && (
        <PricingEngineView onApplyRulesSuccess={() => { fetchProducts(); fetchStats(); }} />
      )}

      {/* ABA 3: REAJUSTES ESCALONADOS (GRADUAIS) */}
      {pricingTab === 'scheduled' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  Cronograma de Reajustes Escalonados (Graduais)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Subidas graduais de preço programadas para não espantar clientes no balcão.
                </p>
              </div>
              <button
                onClick={fetchScheduledSteps}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600 dark:text-slate-300"
              >
                <RefreshCw className={`w-4 h-4 ${loadingScheduled ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {scheduledSteps.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-bold">Nenhum reajuste escalonado ativo no momento.</p>
                <p className="text-xs mt-1">Selecione um produto no catálogo e escolha "Reajuste Escalonado" para programar.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      <th className="py-3 px-3">Produto</th>
                      <th className="py-3 px-3 text-center">Progresso / Etapas</th>
                      <th className="py-3 px-3 text-right">Preço Inicial</th>
                      <th className="py-3 px-3 text-right">Preço Atual</th>
                      <th className="py-3 px-3 text-right">Preço Alvo</th>
                      <th className="py-3 px-3 text-center">Próxima Subida</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {scheduledSteps.map(step => (
                      <tr key={step.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">{step.descricao}</div>
                          <div className="text-[10px] text-slate-400">Cód: {step.produto_id} • +{step.max_pct_por_etapa}% a cada {step.intervalo_dias}d</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                            Etapa {step.etapa_atual} de {step.total_etapas}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-medium text-slate-500">
                          {formatMoney(step.preco_inicial)}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-white">
                          {formatMoney(step.preco_atual)}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                          {formatMoney(step.preco_alvo)}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-500 font-medium">
                          {step.status === 'ativo' ? new Date(step.proxima_execucao).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            step.status === 'ativo'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : step.status === 'concluido'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            {step.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {step.status === 'ativo' && (
                            <button
                              onClick={() => handleCancelScheduledStep(step.id)}
                              className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-bold transition-colors"
                            >
                              Cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 4: HISTÓRICO & IMPACTO NO FATURAMENTO MÉDIO */}
      {pricingTab === 'history' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          
          {/* Header da Sub-guia */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-emerald-500" />
                  Histórico de Alterações & Impacto no Faturamento
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Acompanhe em tempo real todas as alterações de preço aplicadas no Digifarma, a projeção financeira de ganho mensal e execute reversões seguras (rollbacks).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchSnapshots}
                  className="px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSnapshots ? 'animate-spin text-blue-500' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>
            </div>

            {/* Grid de 4 Cards de Impacto Financeiro Consolidado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
              
              {/* Card 1: Impacto Estimado no Faturamento */}
              <div className={`p-4 rounded-3xl text-white shadow-lg relative overflow-hidden flex flex-col justify-between ${
                impactSummary.totalMonthlyRevenueImpact >= 0
                  ? 'bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700 shadow-emerald-500/20'
                  : 'bg-gradient-to-br from-rose-500 via-rose-600 to-red-700 shadow-rose-500/20'
              }`}>
                <div className="flex items-center justify-between text-white/80">
                  <span className="text-[11px] font-black uppercase tracking-wider">Impacto no Faturamento</span>
                  <Wallet className="w-4 h-4" />
                </div>
                <div className="my-2">
                  <div className="text-2xl sm:text-3xl font-black tracking-tight">
                    {impactSummary.totalMonthlyRevenueImpact >= 0 ? '+' : ''}{formatMoney(impactSummary.totalMonthlyRevenueImpact)}
                    <span className="text-xs font-bold text-white/80 ml-1">/ mês</span>
                  </div>
                  <div className="text-[11px] text-white/80 font-medium">
                    Projeção estimada pelo giro de vendas
                  </div>
                </div>
                <div className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-lg w-fit">
                  {impactSummary.totalIncrease} altas • {impactSummary.totalDecrease} reduções
                </div>
              </div>

              {/* Card 2: Ganho em Lucro Líquido Estimado */}
              <div className="p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-black uppercase tracking-wider">Ganho em Lucro Livre</span>
                  <Coins className="w-4 h-4 text-amber-500" />
                </div>
                <div className="my-2">
                  <div className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
                    {impactSummary.totalMonthlyProfitImpact >= 0 ? '+' : ''}{formatMoney(impactSummary.totalMonthlyProfitImpact)}
                    <span className="text-xs font-bold text-slate-400 ml-1">/ mês</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    Margem adicional direta no caixa
                  </div>
                </div>
                <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-lg w-fit">
                  Após deduções operacionais
                </div>
              </div>

              {/* Card 3: Variação Média de Preço */}
              <div className="p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-black uppercase tracking-wider">Variação Média</span>
                  <Percent className="w-4 h-4 text-blue-500" />
                </div>
                <div className="my-2">
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                    {impactSummary.averagePriceChangePct >= 0 ? '+' : ''}{impactSummary.averagePriceChangePct.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    Ajuste médio nas mercadorias
                  </div>
                </div>
                <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded-lg w-fit">
                  {impactSummary.activeChanges} produtos ativos
                </div>
              </div>

              {/* Card 4: Auditoria & Segurança */}
              <div className="p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-black uppercase tracking-wider">Segurança & Backups</span>
                  <ShieldCheck className="w-4 h-4 text-sky-500" />
                </div>
                <div className="my-2">
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                    {impactSummary.totalChanges}
                    <span className="text-xs font-bold text-slate-400 ml-1">alterações</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    Snapshots auditáveis registrados
                  </div>
                </div>
                <div className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg w-fit">
                  {impactSummary.totalReverted} reversões realizadas
                </div>
              </div>

            </div>

            {/* Barra de Filtros por Período e Busca Textual */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              {/* Botões de Período */}
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                <span className="text-[10px] font-black uppercase text-slate-400 mr-1">Período:</span>
                {[
                  { id: 'all', label: 'Todas as Alterações' },
                  { id: 'today', label: 'Hoje' },
                  { id: '7d', label: 'Últimos 7 dias' },
                  { id: '30d', label: 'Últimos 30 dias' },
                  { id: 'month', label: 'Mês Atual' }
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSnapshotPeriod(p.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      snapshotPeriod === p.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Busca por Nome / EAN / ID */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar por produto ou código..."
                  value={snapshotSearch}
                  onChange={(e) => setSnapshotSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Tabela Linha a Linha com Diagnóstico Financeiro */}
            {snapshots.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <ShieldCheck className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-bold">Nenhuma alteração de preço encontrada para o filtro selecionado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      <th className="py-3 px-3">Data / Hora</th>
                      <th className="py-3 px-3">Produto</th>
                      <th className="py-3 px-3 text-right">Preço Anterior</th>
                      <th className="py-3 px-3 text-center">➔</th>
                      <th className="py-3 px-3 text-right">Novo Preço</th>
                      <th className="py-3 px-3 text-center">Variação (%)</th>
                      <th className="py-3 px-3 text-center">Giro Mensal</th>
                      <th className="py-3 px-3 text-right">Impacto Faturamento</th>
                      <th className="py-3 px-3 text-right">Impacto Lucro</th>
                      <th className="py-3 px-3">Motivo / Tipo</th>
                      <th className="py-3 px-3">Usuário</th>
                      <th className="py-3 px-3 text-right">Segurança</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {snapshots.map(snap => {
                      const isAumento = (snap.diff_preco || 0) > 0;
                      const isQueda = (snap.diff_preco || 0) < 0;

                      return (
                        <tr key={snap.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${snap.revertido ? 'opacity-50' : ''}`}>
                          <td className="py-3 px-3 whitespace-nowrap text-slate-500 font-medium text-[11px]">
                            {snap.data_alteracao ? new Date(snap.data_alteracao).toLocaleString('pt-BR') : '—'}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{snap.descricao}</span>
                              {snap.curva && (
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                                  snap.curva === 'A' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' :
                                  snap.curva === 'B' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' :
                                  'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                                }`}>
                                  Curva {snap.curva}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {snap.cod_barras ? `EAN: ${snap.cod_barras} • ` : ''}Cód: {snap.produto_id}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-500 dark:text-slate-400">
                            {formatMoney(snap.preco_anterior)}
                          </td>
                          <td className="py-3 px-3 text-center text-slate-400 text-[10px]">➔</td>
                          <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-white">
                            {formatMoney(snap.novo_preco)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-0.5 ${
                              isAumento
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : isQueda
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {isAumento ? <ArrowUpRight className="w-3 h-3" /> : isQueda ? <TrendingDown className="w-3 h-3" /> : null}
                              {snap.diff_percentual !== undefined ? `${snap.diff_percentual > 0 ? '+' : ''}${snap.diff_percentual.toFixed(1)}%` : '0%'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center text-[11px] font-bold text-slate-500">
                            ~{snap.volume_mensal_estimado || 15} un/mês
                          </td>
                          <td className="py-3 px-3 text-right font-black">
                            <span className={isAumento ? 'text-emerald-600 dark:text-emerald-400' : isQueda ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}>
                              {snap.impacto_mensal_faturamento !== undefined ? `${snap.impacto_mensal_faturamento >= 0 ? '+' : ''}${formatMoney(snap.impacto_mensal_faturamento)}` : '—'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-black">
                            <span className={isAumento ? 'text-indigo-600 dark:text-indigo-400' : isQueda ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}>
                              {snap.impacto_mensal_lucro !== undefined ? `${snap.impacto_mensal_lucro >= 0 ? '+' : ''}${formatMoney(snap.impacto_mensal_lucro)}` : '—'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 mr-1.5 uppercase text-slate-700 dark:text-slate-300">
                              {snap.tipo}
                            </span>
                            <span className="text-[11px]">{snap.motivo}</span>
                          </td>
                          <td className="py-3 px-3 font-medium text-slate-600 dark:text-slate-400 text-[11px]">
                            {snap.usuario}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {snap.revertido ? (
                              <span className="text-[11px] font-bold text-slate-400 flex items-center justify-end gap-1">
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> Revertido
                              </span>
                            ) : (
                              <button
                                onClick={() => handleRollbackSnapshot(snap.id)}
                                disabled={rollingBackId === snap.id}
                                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1 ml-auto disabled:opacity-50 cursor-pointer"
                                title="Reverter este preço no Digifarma para o valor anterior"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 ${rollingBackId === snap.id ? 'animate-spin' : ''}`} />
                                <span>Reverter</span>
                              </button>
                            )}
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
      )}

      {/* ABA 5: MONITOR & CATÁLOGO DE MERCADO (GUIA PRINCIPAL) */}
      {pricingTab === 'catalog' && (
        <>
          {/* KPI Cards Rápidos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Total Ativos</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white my-0.5">{stats.total.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 font-medium">Curva A: <b>{stats.curveA}</b> | B: <b>{stats.curveB}</b></div>
            </div>

            <div 
              onClick={() => { setProfferFilter('BELOW_AVG'); setPage(1); }}
              className="p-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-3xl shadow-sm cursor-pointer transition-all"
            >
              <div className="text-[11px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-wider flex items-center justify-between">
                <span>Abaixo da Média Proffer</span>
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black text-amber-700 dark:text-amber-300 my-0.5">{stats.belowMarketAvg}</div>
              <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">Oportunidade de Ganho</div>
            </div>

            <div 
              onClick={() => { setProfferFilter('BELOW_MIN'); setPage(1); }}
              className="p-4 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-3xl shadow-sm cursor-pointer transition-all"
            >
              <div className="text-[11px] font-black uppercase text-rose-700 dark:text-rose-400 tracking-wider flex items-center justify-between">
                <span>Abaixo do Mínimo</span>
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black text-rose-700 dark:text-rose-300 my-0.5">{stats.belowMarketMin}</div>
              <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">Mais barato que toda região</div>
            </div>

            <div 
              onClick={() => { setMarginFilter('BELOW_COST'); setPage(1); }}
              className="p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-3xl shadow-sm cursor-pointer transition-all"
            >
              <div className="text-[11px] font-black uppercase text-red-700 dark:text-red-400 tracking-wider flex items-center justify-between">
                <span>Abaixo do Custo</span>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black text-red-700 dark:text-red-300 my-0.5">{stats.belowCost}</div>
              <div className="text-[10px] text-red-600 dark:text-red-400 font-bold">Prejuízo Imediato</div>
            </div>
          </div>

          {/* BARRA DE PESQUISA AVANÇADA & FILTROS DE MERCADO */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            
            {/* Linha 1: Input de Busca com debounce */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome do medicamento, código Digifarma ou EAN..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Seletor Curva ABC */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
                {(['ALL', 'A', 'B', 'C'] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => { setCurva(c); setPage(1); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      curva === c
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {c === 'ALL' ? 'Todas Curvas' : `Curva ${c}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Linha 2: Filtros Avançados Proffer e Margem */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              
              {/* Comparador Proffer */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Comparação Proffer / Mercado
                </label>
                <select
                  value={profferFilter}
                  onChange={(e: any) => { setProfferFilter(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                >
                  <option value="ALL">Todos os Produtos</option>
                  <option value="BELOW_AVG">📉 Abaixo da Média de Mercado</option>
                  <option value="BELOW_MIN">🚨 Abaixo do Mínimo de Mercado</option>
                  <option value="ABOVE_AVG">📈 Acima da Média de Mercado</option>
                  <option value="ABOVE_MAX">🔺 Acima do Máximo de Mercado</option>
                  <option value="WITH_NAPP">✅ Com Preço Proffer Encontrado</option>
                  <option value="WITHOUT_NAPP">❌ Sem Preço Proffer</option>
                </select>
              </div>

              {/* Desvio % Mínimo */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Desvio vs Média Mercado
                </label>
                <select
                  value={profferDiffPercent}
                  onChange={(e) => { setProfferDiffPercent(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                >
                  <option value="0">Qualquer diferença</option>
                  <option value="5">Mais de 5% abaixo da média</option>
                  <option value="10">Mais de 10% abaixo da média</option>
                  <option value="15">Mais de 15% abaixo da média</option>
                  <option value="20">Mais de 20% abaixo da média</option>
                </select>
              </div>

              {/* Filtro de Margem */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Margem de Lucro Bruto
                </label>
                <select
                  value={marginFilter}
                  onChange={(e: any) => { setMarginFilter(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                >
                  <option value="ALL">Todas as Margens</option>
                  <option value="LOW_MARGIN">⚠️ Margem Baixa (&lt; 20%)</option>
                  <option value="BELOW_COST">🚨 Abaixo do Custo (Negativa)</option>
                  <option value="HIGH_MARGIN">💎 Margem Alta (&gt; 50%)</option>
                </select>
              </div>

              {/* Filtro de Categoria e Novos */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Filtros Especiais / Categoria
                </label>
                <select
                  value={isNewFilter === 'NEW_ENTRIES' ? 'NEW_ENTRIES' : categoria}
                  onChange={(e) => {
                    if (e.target.value === 'NEW_ENTRIES') {
                      setIsNewFilter('NEW_ENTRIES');
                      setCategoria('ALL');
                    } else {
                      setIsNewFilter('ALL');
                      setCategoria(e.target.value as any);
                    }
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                >
                  <option value="ALL">Todas as Categorias</option>
                  <option value="NEW_ENTRIES">📦 Notas / Entradas Recentes (Mural)</option>
                  <option value="GENERICO">💊 Genéricos</option>
                  <option value="SIMILAR">✨ Similares</option>
                  <option value="PERFUMARIA">💄 Perfumaria / Cosméticos</option>
                  <option value="MARCA">🛡️ Referência / Marca</option>
                </select>
              </div>

            </div>

          </div>

          {/* TABELA DE PRODUTOS */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">
                Mostrando {products.length} de {pagination.totalItems.toLocaleString()} produtos encontrados
              </span>
              <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                Página {pagination.currentPage} de {pagination.totalPages}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider bg-slate-50/50 dark:bg-slate-800/30">
                    <th className="py-3 px-4">Produto / EAN</th>
                    <th className="py-3 px-3 text-center">Curva</th>
                    <th className="py-3 px-3 text-right">Estoque</th>
                    <th className="py-3 px-3 text-right">Custo (CMV)</th>
                    <th className="py-3 px-3 text-right">Preço Venda</th>
                    <th className="py-3 px-3 text-center">Margem</th>
                    <th className="py-3 px-4 text-center">Mercado Proffer (Média)</th>
                    <th className="py-3 px-4 text-right">Ação de Preço</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                        Carregando produtos do catálogo...
                      </td>
                    </tr>
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Nenhum produto encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    products.map(prod => {
                      const cost = prod.cost_price || 0;
                      const price = prod.price || 0;
                      const profit = price - cost;
                      const marginPct = price > 0 ? ((profit / price) * 100) : 0;
                      const profferAvg = prod.region_price_medio || prod.region_price;
                      const isBelowAvg = profferAvg && price < profferAvg;
                      const isBelowCost = cost > 0 && price < cost;

                      return (
                        <tr key={prod.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">{prod.name}</div>
                            <div className="text-[10px] text-slate-400">Cód: {prod.id} {prod.ean ? `• EAN: ${prod.ean}` : ''}</div>
                          </td>

                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                              prod.curve === 'A' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                              prod.curve === 'B' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                              'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {prod.curve}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right font-medium text-slate-600 dark:text-slate-400">
                            {prod.stock} un
                          </td>

                          <td className="py-3 px-3 text-right font-medium text-slate-500">
                            {formatMoney(cost)}
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="font-black text-slate-900 dark:text-white">{formatMoney(price)}</div>
                            {prod.promo_price && prod.promo_price > 0 && prod.promo_price !== prod.normal_price && (
                              <div className="text-[9px] text-amber-500 font-bold">Promo: {formatMoney(prod.promo_price)}</div>
                            )}
                          </td>

                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                              isBelowCost ? 'bg-red-500 text-white' :
                              marginPct < 20 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                              'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}>
                              {marginPct.toFixed(1)}%
                            </span>
                          </td>

                          <td className="py-3 px-4 text-center">
                            {profferAvg ? (
                              <div>
                                <div className="font-black text-slate-800 dark:text-slate-200">
                                  {formatMoney(profferAvg)}
                                </div>
                                <div className="text-[10px] flex items-center justify-center gap-1 font-bold">
                                  {isBelowAvg ? (
                                    <span className="text-amber-600 dark:text-amber-400">
                                      -{( ((profferAvg - price) / profferAvg) * 100 ).toFixed(0)}% vs média
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">
                                      +{( ((price - profferAvg) / profferAvg) * 100 ).toFixed(0)}% vs média
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setEditingProduct(prod);
                                setSingleOpType('manual');
                                setSingleValue(prod.price.toFixed(2));
                                setEditActionType('direct');
                              }}
                              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-xs font-black transition-all shadow-xs flex items-center gap-1.5 ml-auto cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Reajustar</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                Página {pagination.currentPage} de {pagination.totalPages}
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(pagination.totalPages)}
                  disabled={page >= pagination.totalPages}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>
        </>
      )}

      {/* MODAL DE REAJUSTE DE PREÇO (DIRETO vs ESCALONADO) */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 space-y-5">
            
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" />
                Reajustar Preço do Produto
              </h3>
              <button onClick={() => setEditingProduct(null)} className="text-slate-400 hover:text-slate-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Resumo do Produto */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {editingProduct.name}
              </div>
              <div className="text-[11px] text-slate-400">
                Cód: {editingProduct.id} {editingProduct.ean ? `• EAN: ${editingProduct.ean}` : ''}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Custo:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{formatMoney(editingProduct.cost_price)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Preço Atual:</span>
                  <span className="font-black text-slate-900 dark:text-white">{formatMoney(editingProduct.price)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Média Proffer:</span>
                  <span className="font-black text-blue-600 dark:text-blue-400">
                    {editingProduct.region_price_medio ? formatMoney(editingProduct.region_price_medio) : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Tipo de Aplicação: Direto ou Escalonado */}
            <div>
              <label className="text-[11px] font-black uppercase text-slate-400 block mb-1.5">
                Modalidade de Aplicação
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEditActionType('direct')}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    editActionType === 'direct'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Aplicação Direta (Imediata)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditActionType('scheduled')}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    editActionType === 'scheduled'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Reajuste Escalonado (Gradual)</span>
                </button>
              </div>
            </div>

            {/* Forma de Cálculo do Preço Alvo */}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => { setSingleOpType('manual'); setSingleValue(editingProduct.price.toFixed(2)); }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    singleOpType === 'manual'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Valor Fixo (R$)
                </button>
                <button
                  type="button"
                  onClick={() => { setSingleOpType('percentage'); setSingleValue('5'); }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    singleOpType === 'percentage'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Porcentagem (%)
                </button>
                <button
                  type="button"
                  disabled={!editingProduct.region_price_medio}
                  onClick={() => {
                    setSingleOpType('region');
                    setSingleValue((editingProduct.region_price_medio || editingProduct.price).toFixed(2));
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 ${
                    singleOpType === 'region'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Igualar Média Proffer
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                  {singleOpType === 'manual' ? 'Preço Alvo Desejado (R$)' : singleOpType === 'percentage' ? 'Percentual de Reajuste (%)' : 'Preço da Média Proffer (R$)'}
                </label>
                <input
                  type="text"
                  value={singleValue}
                  onChange={(e) => setSingleValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-black text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Configurações do Reajuste Escalonado */}
              {editActionType === 'scheduled' && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2">
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                    <Clock className="w-4 h-4" /> Parâmetros de Subida Gradual
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block font-bold">Máximo % por etapa:</span>
                      <input
                        type="number"
                        step="0.5"
                        value={scheduledMaxPct}
                        onChange={(e) => setScheduledMaxPct(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block font-bold">Intervalo entre etapas (dias):</span>
                      <input
                        type="number"
                        value={scheduledIntervalDays}
                        onChange={(e) => setScheduledIntervalDays(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Prévia Calculada */}
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-800 dark:text-emerald-200">
                    {editActionType === 'direct' ? 'Novo Preço Final (com Arredondamento):' : 'Preço Alvo Final:'}
                  </span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {formatMoney(previewSingle.rounded)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-emerald-500/20">
                  <span>Lucro Bruto: <b>{formatMoney(previewSingle.profit)}</b></span>
                  <span>Margem Bruta: <b>{previewSingle.marginPct.toFixed(1)}%</b></span>
                </div>
              </div>
            </div>

            {/* Ações do Modal */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                onClick={handleSaveSingleProduct}
                disabled={savingSingleProduct}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {savingSingleProduct ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando com Backup...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{editActionType === 'direct' ? 'Aplicar Preço no Digifarma' : 'Programar Subida Escalonada'}</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
