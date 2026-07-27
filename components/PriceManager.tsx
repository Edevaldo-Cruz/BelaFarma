import React, { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
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
  Filter
} from 'lucide-react';
import { useToast } from './ToastContext';
import { roundUpToAcceptedCents } from '../utils';

interface Product {
  ean: string;
  id: string;
  name: string;
  stock: number;
  price: number;
  cost_price: number;
  curve: 'A' | 'B' | 'C';
  cached_at: string;
  region_price: number | null;
  region_updated_at: string | null;
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

export const PriceManager: React.FC = () => {
  const { addToast } = useToast();
  
  // Estados de dados
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    totalItems: 0,
    totalPages: 1,
    currentPage: 1,
    limit: 50
  });
  
  // Estados de filtros
  const [search, setSearch] = useState('');
  const [curva, setCurva] = useState<'ALL' | 'A' | 'B' | 'C'>('ALL');
  const [filterNapp, setFilterNapp] = useState<'ALL' | 'WITH_NAPP' | 'WITHOUT_NAPP' | 'DISCREPANT'>('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [costFilter, setCostFilter] = useState<'ALL' | 'BELOW_COST'>('ALL');
  const [categoria, setCategoria] = useState<'ALL' | 'GENERICO' | 'SIMILAR' | 'PERFUMARIA' | 'MARCA'>('ALL');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(1);
  
  // Estados de carregamento
  const [loading, setLoading] = useState(false);
  const [syncingCache, setSyncingCache] = useState(false);
  
  // Estados de seleção de caixas
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Estado do Scraper da Napp
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
  
  // Estados do painel de reajuste em massa
  const [bulkScope, setBulkScope] = useState<'SELECTED' | 'FILTERED_ALL'>('FILTERED_ALL');
  const [operationType, setOperationType] = useState<'percentage' | 'fixed' | 'region'>('percentage');
  const [adjustValue, setAdjustValue] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [applyingAdjustment, setApplyingAdjustment] = useState(false);

  // Estado da Modal de Edição Individual de Produto
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [singleOpType, setSingleOpType] = useState<'manual' | 'percentage' | 'region'>('manual');
  const [singleValue, setSingleValue] = useState('');
  const [savingSingleProduct, setSavingSingleProduct] = useState(false);

  // Estatísticas rápidas calculadas do cache
  const [stats, setStats] = useState({
    total: 0,
    curveA: 0,
    curveB: 0,
    curveC: 0,
    withNapp: 0,
    discrepant: 0,
    belowCost: 0
  });

  // Função para carregar produtos
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
        search,
        curva,
        filterNapp,
        stockFilter,
        costFilter,
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
  }, [page, search, curva, filterNapp, stockFilter, costFilter, categoria, minPrice, maxPrice, pagination.limit, addToast]);

  // Função para carregar status do Scraper
  const fetchScrapeStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/price-manager/scrape-status');
      if (!res.ok) throw new Error('Erro ao buscar status.');
      const data = await res.json();
      setScrapeStatus(data);
    } catch (err) {
      console.error('Erro ao buscar status do scraper:', err);
    }
  }, []);

  // Monitora estatísticas gerais
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/price-manager/stats');
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          setStats(result.data);
        }
      }
    } catch (err) {
      console.error('Erro ao calcular estatísticas:', err);
    }
  }, []);


  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetchStats();
    fetchScrapeStatus();
  }, [fetchStats, fetchScrapeStatus]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (scrapeStatus.running) {
      interval = setInterval(() => {
        fetchScrapeStatus();
        fetchProducts();
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [scrapeStatus.running, fetchScrapeStatus, fetchProducts]);

  useEffect(() => {
    setSelectedIds([]);
  }, [search, curva, filterNapp, stockFilter, costFilter, categoria, minPrice, maxPrice, page]);

  // Lógica de seleção na tabela
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(products.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Sincronização do Catálogo & Curva ABC
  const handleSyncCache = async () => {
    setSyncingCache(true);
    try {
      const res = await fetch('/api/price-manager/sync-cache', { method: 'POST' });
      if (!res.ok) throw new Error('Falha na sincronização.');
      const data = await res.json();
      if (data.success) {
        addToast('🎉 Sincronização concluída! Curva ABC recalculada e cache atualizado.', 'success');
        fetchProducts();
        fetchStats();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao sincronizar catálogo.', 'error');
    } finally {
      setSyncingCache(false);
    }
  };

  // Disparar Robô Napp
  const handleTriggerScraper = async () => {
    try {
      const res = await fetch('/api/price-manager/trigger-napp-scrape', { method: 'POST' });
      if (!res.ok) throw new Error('Falha ao disparar robô.');
      const data = await res.json();
      if (data.success) {
        addToast('🚀 Robô de raspagem Napp iniciado em background!', 'success');
        fetchScrapeStatus();
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao iniciar robô Napp.', 'error');
    }
  };

  // Salvar Reajuste em Massa (por seleção ou por filtro)
  const handleSaveBulkAdjustments = async () => {
    setApplyingAdjustment(true);
    try {
      let endpoint = '/api/price-manager/update-prices';
      let payload: any = {};

      if (bulkScope === 'FILTERED_ALL') {
        endpoint = '/api/price-manager/update-prices-by-filter';
        payload = {
          filter: {
            search,
            curva,
            filterNapp,
            stockFilter,
            costFilter,
            categoria,
            minPrice,
            maxPrice
          },
          operationType,
          value: adjustValue
        };
      } else {
        // Selecionados manualmente na página
        const updates = selectedIds.map(id => {
          const prod = products.find(p => p.id === id);
          if (!prod) return null;

          let newPrice = prod.price;

          if (operationType === 'percentage') {
            const valPercent = parseFloat(adjustValue);
            if (!isNaN(valPercent)) {
              newPrice = prod.price * (1 + valPercent / 100);
            }
          } else if (operationType === 'fixed') {
            const valFixed = parseFloat(adjustValue);
            if (!isNaN(valFixed) && valFixed > 0) {
              newPrice = valFixed;
            }
          } else if (operationType === 'region') {
            if (prod.region_price && prod.region_price > 0) {
              newPrice = prod.region_price;
            }
          }

          return { id, price: newPrice };
        }).filter(item => item !== null) as { id: string; price: number }[];

        if (updates.length === 0) {
          throw new Error('Nenhum reajuste válido pôde ser calculado.');
        }

        payload = { updates };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Falha ao enviar reajuste ao servidor.');
      
      const result = await res.json();
      if (result.success) {
        const count = result.successCount || result.count || 0;
        addToast(`✔ Reajuste com regra de arredondamento aplicado em ${count} produtos no Digifarma!`, 'success');
        setSelectedIds([]);
        setShowConfirmModal(false);
        setAdjustValue('');
        fetchProducts();
        fetchStats();
      } else {
        throw new Error(result.error || 'Erro ao persistir preços.');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao aplicar reajustes no Digifarma.', 'error');
    } finally {
      setApplyingAdjustment(false);
    }
  };

  // Salvar Reajuste Individual de Produto via Modal
  const handleSaveSingleProduct = async () => {
    if (!editingProduct) return;
    setSavingSingleProduct(true);
    try {
      let rawPrice = editingProduct.price;

      if (singleOpType === 'manual') {
        const val = parseFloat(singleValue);
        if (isNaN(val) || val <= 0) {
          throw new Error('Por favor, informe um preço de venda válido (maior que R$ 0,00).');
        }
        rawPrice = val;
      } else if (singleOpType === 'percentage') {
        const pct = parseFloat(singleValue);
        if (isNaN(pct)) {
          throw new Error('Por favor, informe uma porcentagem válida.');
        }
        rawPrice = editingProduct.price * (1 + pct / 100);
      } else if (singleOpType === 'region') {
        if (!editingProduct.region_price || editingProduct.region_price <= 0) {
          throw new Error('Este produto não possui preço de região (Proffer) disponível.');
        }
        rawPrice = editingProduct.region_price;
      }

      // Aplica regra de arredondamento
      const finalPrice = roundUpToAcceptedCents(rawPrice);

      const res = await fetch('/api/price-manager/update-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ id: editingProduct.id, price: finalPrice }]
        })
      });

      if (!res.ok) throw new Error('Erro na requisição com o servidor.');
      const result = await res.json();
      if (result.success && result.successCount > 0) {
        addToast(`✔ Preço do produto #${editingProduct.id} atualizado para R$ ${finalPrice.toFixed(2).replace('.', ',')} no Digifarma!`, 'success');
        setEditingProduct(null);
        setSingleValue('');
        fetchProducts();
        fetchStats();
      } else {
        throw new Error(result.error || 'Não foi possível atualizar o produto no Digifarma.');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao salvar produto.', 'error');
    } finally {
      setSavingSingleProduct(false);
    }
  };

  // Cálculo da prévia do preço na modal de edição individual
  const calculateSinglePreview = () => {
    if (!editingProduct) return { raw: 0, rounded: 0, profit: 0, marginPct: 0, isBelowCost: false };
    
    let raw = editingProduct.price;
    if (singleOpType === 'manual') {
      const val = parseFloat(singleValue);
      if (!isNaN(val) && val > 0) raw = val;
    } else if (singleOpType === 'percentage') {
      const pct = parseFloat(singleValue);
      if (!isNaN(pct)) raw = editingProduct.price * (1 + pct / 100);
    } else if (singleOpType === 'region') {
      if (editingProduct.region_price && editingProduct.region_price > 0) raw = editingProduct.region_price;
    }

    const rounded = roundUpToAcceptedCents(raw);
    const profit = rounded - editingProduct.cost_price;
    const marginPct = rounded > 0 ? (profit / rounded) * 100 : 0;
    const isBelowCost = editingProduct.cost_price > 0 && rounded < editingProduct.cost_price;

    return { raw, rounded, profit, marginPct, isBelowCost };
  };

  // Helper para renderizar a diferença do preço com a região
  const renderPriceDifference = (prod: Product) => {
    if (prod.region_price === null) return <span className="text-slate-400 font-normal">-</span>;
    
    const diff = prod.price - prod.region_price;
    const diffPercent = (diff / prod.region_price) * 100;
    
    if (Math.abs(diffPercent) < 0.5) {
      return <span className="text-emerald-500 font-semibold">Equivalente</span>;
    }
    
    const isHigher = diff > 0;
    const colorClass = isHigher ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
    
    return (
      <div className={`flex flex-col items-end ${colorClass}`}>
        <span className="font-semibold">{isHigher ? '+' : ''}{diff.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        <span className="text-[10px] font-medium">{isHigher ? '+' : ''}{diffPercent.toFixed(1)}%</span>
      </div>
    );
  };

  const previewSingle = calculateSinglePreview();

  return (
    <div className="flex flex-col w-full min-h-screen bg-slate-50 dark:bg-slate-900 pb-20 p-4 md:p-6 transition-colors duration-300">
      
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <TrendingUp className="text-emerald-500 w-8 h-8" />
            Módulo de Reajuste & Gestão de Preços
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Reajuste por lote de filtros ou unitário com arredondamento para cima em centavos (.0, .5 e .9) aplicado diretamente no Digifarma.
          </p>
        </div>

        {/* Botões de Ação do Sistema */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSyncCache}
            disabled={syncingCache || loading}
            className="flex items-center gap-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Database className={`w-4 h-4 text-emerald-500 ${syncingCache ? 'animate-spin' : ''}`} />
            Sincronizar Catálogo (ABC)
          </button>
          
          <button
            onClick={handleTriggerScraper}
            disabled={scrapeStatus.running || loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border shadow-sm transition duration-200 ${
              scrapeStatus.running 
                ? 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300' 
                : 'bg-emerald-500 hover:bg-emerald-600 border-emerald-500 text-white disabled:opacity-50'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${scrapeStatus.running ? 'animate-spin' : ''}`} />
            {scrapeStatus.running 
              ? `Coletando Napp (${scrapeStatus.currentProgress}/${scrapeStatus.totalItems})` 
              : 'Forçar Coleta Napp'}
          </button>
        </div>
      </div>

      {/* Cards de Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-300 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Produtos no Catálogo</span>
            <p className="text-2xl font-black text-slate-800 dark:text-white mt-1">{stats.total}</p>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950 rounded-xl">
            <Coins className="text-emerald-500 w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-300 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Curva A / B / C</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-black text-rose-500">A: {stats.curveA}</span>
              <span className="text-sm font-bold text-slate-400">|</span>
              <span className="text-lg font-black text-amber-500">B: {stats.curveB}</span>
              <span className="text-sm font-bold text-slate-400">|</span>
              <span className="text-lg font-black text-slate-500">C: {stats.curveC}</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-xl">
            <SlidersHorizontal className="text-slate-500 w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-300 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Preços Abaixo do Custo</span>
            <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
              {stats.belowCost} <span className="text-xs font-medium text-slate-400">(alerta prejuízo)</span>
            </p>
          </div>
          <div className="p-3 bg-rose-50 dark:bg-rose-950 rounded-xl">
            <AlertTriangle className="text-rose-500 w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-300 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Preços Divergentes Napp</span>
            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {stats.discrepant} <span className="text-xs font-medium text-slate-400">(&gt;1% diff)</span>
            </p>
          </div>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950 rounded-xl">
            <Eye className="text-indigo-500 w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Painel Avançado de Filtros */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6 space-y-4">
        
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
          <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-emerald-500" />
            Filtros para Reajuste em Lote e Pesquisa
          </span>
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-900">
            {pagination.totalItems} produtos encontrados
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          
          {/* Busca Texto */}
          <div className="lg:col-span-2 relative">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Busca (Nome / EAN / Código)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Ex: DIPIRONA, 789..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-medium focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
              />
            </div>
          </div>

          {/* Filtro Curva ABC */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Curva ABC</label>
            <select
              value={curva}
              onChange={(e) => { setCurva(e.target.value as any); setPage(1); }}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 px-2.5 py-2 rounded-xl text-xs font-medium focus:outline-none"
            >
              <option value="ALL">Todas as Curvas</option>
              <option value="A">Curva A (Alta Venda)</option>
              <option value="B">Curva B (Média Venda)</option>
              <option value="C">Curva C (Baixa Venda)</option>
            </select>
          </div>

          {/* Filtro Categorias */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Categoria</label>
            <select
              value={categoria}
              onChange={(e) => { setCategoria(e.target.value as any); setPage(1); }}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 px-2.5 py-2 rounded-xl text-xs font-medium focus:outline-none"
            >
              <option value="ALL">Todas as Categorias</option>
              <option value="GENERICO">Genéricos</option>
              <option value="SIMILAR">Similares</option>
              <option value="PERFUMARIA">Perfumaria / Higiene</option>
              <option value="MARCA">Marca / Referência</option>
            </select>
          </div>

          {/* Filtro Estoque */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Estoque</label>
            <select
              value={stockFilter}
              onChange={(e) => { setStockFilter(e.target.value as any); setPage(1); }}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 px-2.5 py-2 rounded-xl text-xs font-medium focus:outline-none"
            >
              <option value="ALL">Qualquer Estoque</option>
              <option value="IN_STOCK">Com Estoque (&gt;0)</option>
              <option value="OUT_OF_STOCK">Sem Estoque (&lt;=0)</option>
            </select>
          </div>

          {/* Filtro Alerta Margem/Custo */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Alerta Margem</label>
            <select
              value={costFilter}
              onChange={(e) => { setCostFilter(e.target.value as any); setPage(1); }}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 px-2.5 py-2 rounded-xl text-xs font-medium focus:outline-none"
            >
              <option value="ALL">Todos os Preços</option>
              <option value="BELOW_COST">Abaixo do Custo (Prejuízo)</option>
            </select>
          </div>

        </div>

        {/* Linha secundária de filtros: Comparador Napp + Faixa de Preço */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-700/50">
          
          <div className="flex items-center gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Preço Região (Napp)</label>
              <select
                value={filterNapp}
                onChange={(e) => { setFilterNapp(e.target.value as any); setPage(1); }}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-xl text-xs font-medium focus:outline-none"
              >
                <option value="ALL">Todos os Comparadores</option>
                <option value="WITH_NAPP">Com Preço Napp</option>
                <option value="WITHOUT_NAPP">Sem Preço Napp</option>
                <option value="DISCREPANT">Preço Divergente (&gt;1%)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Preço Mín (R$)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={minPrice}
                  onChange={(e) => { setMinPrice(e.target.value); setPage(1); }}
                  className="w-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 px-2 py-1.5 rounded-xl text-xs font-medium focus:outline-none"
                />
              </div>
              <span className="text-slate-400 text-xs mt-4">-</span>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Preço Máx (R$)</label>
                <input
                  type="number"
                  placeholder="999.00"
                  value={maxPrice}
                  onChange={(e) => { setMaxPrice(e.target.value); setPage(1); }}
                  className="w-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 px-2 py-1.5 rounded-xl text-xs font-medium focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSearch('');
                setCurva('ALL');
                setFilterNapp('ALL');
                setStockFilter('ALL');
                setCostFilter('ALL');
                setCategoria('ALL');
                setMinPrice('');
                setMaxPrice('');
                setPage(1);
              }}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 transition"
            >
              Limpar Filtros
            </button>
          </div>
        </div>

      </div>

      {/* Tabela de Produtos */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                <th className="p-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={products.length > 0 && selectedIds.length === products.length}
                    onChange={handleSelectAll}
                    className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 h-4 w-4 transition duration-150"
                  />
                </th>
                <th className="p-4 w-28">Código / EAN</th>
                <th className="p-4">Produto</th>
                <th className="p-4 w-24 text-center">Curva</th>
                <th className="p-4 w-32 text-right">Preço de Custo</th>
                <th className="p-4 w-32 text-right">Preço Atual</th>
                <th className="p-4 w-32 text-right">Preço Região</th>
                <th className="p-4 w-32 text-right">Diferença</th>
                <th className="p-4 w-28 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse border-b border-slate-100 dark:border-slate-700/50">
                    <td className="p-4"><div className="bg-slate-200 dark:bg-slate-700 h-4 w-4 rounded mx-auto" /></td>
                    <td className="p-4">
                      <div className="bg-slate-200 dark:bg-slate-700 h-4 w-24 rounded mb-1" />
                      <div className="bg-slate-200 dark:bg-slate-700 h-3 w-16 rounded" />
                    </td>
                    <td className="p-4"><div className="bg-slate-200 dark:bg-slate-700 h-4 w-2/3 rounded" /></td>
                    <td className="p-4"><div className="bg-slate-200 dark:bg-slate-700 h-5 w-12 rounded-full mx-auto" /></td>
                    <td className="p-4"><div className="bg-slate-200 dark:bg-slate-700 h-4 w-16 rounded ml-auto" /></td>
                    <td className="p-4"><div className="bg-slate-200 dark:bg-slate-700 h-4 w-16 rounded ml-auto" /></td>
                    <td className="p-4"><div className="bg-slate-200 dark:bg-slate-700 h-4 w-16 rounded ml-auto" /></td>
                    <td className="p-4"><div className="bg-slate-200 dark:bg-slate-700 h-4 w-12 rounded ml-auto" /></td>
                    <td className="p-4"><div className="bg-slate-200 dark:bg-slate-700 h-6 w-16 rounded mx-auto" /></td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400 font-medium">
                    Nenhum produto correspondente aos filtros foi encontrado.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isSelected = selectedIds.includes(p.id);
                  const showCostWarning = p.cost_price > 0 && p.price < p.cost_price;
                  
                  return (
                    <tr 
                      key={p.id}
                      onClick={() => handleSelectRow(p.id)}
                      className={`border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition duration-150 cursor-pointer ${
                        isSelected ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''
                      }`}
                    >
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(p.id)}
                          className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 h-4 w-4 transition duration-150"
                        />
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-xs text-slate-500 dark:text-slate-400">#{p.id}</div>
                        <div className="font-medium text-xs text-slate-400 mt-0.5">{p.ean}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{p.name}</div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">Estoque: {p.stock} un</div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-black ${
                          p.curve === 'A' ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/20' : 
                          p.curve === 'B' ? 'bg-amber-50 text-amber-500 dark:bg-amber-950/20' : 
                          'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                        }`}>
                          {p.curve}
                        </span>
                      </td>
                      <td className="p-4 text-right font-medium text-slate-500 dark:text-slate-400 text-sm">
                        {p.cost_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="p-4 text-right font-bold text-slate-800 dark:text-slate-100 text-sm">
                        <div className="flex items-center justify-end gap-1">
                          {showCostWarning && (
                            <span title="Preço de venda abaixo do preço de custo (Prejuízo)!" className="text-rose-500 hover:scale-110 transition duration-150">
                              <AlertTriangle className="w-4 h-4 animate-bounce" />
                            </span>
                          )}
                          {p.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      </td>
                      <td className="p-4 text-right font-semibold text-slate-700 dark:text-slate-300 text-sm">
                        {p.region_price !== null ? (
                          <div className="flex flex-col items-end">
                            <span>{p.region_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            {p.region_updated_at && (
                              <span className="text-[9px] text-slate-400 font-medium">
                                {new Date(p.region_updated_at).toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-normal">-</span>
                        )}
                      </td>
                      <td className="p-4 text-right text-sm">
                        {renderPriceDifference(p)}
                      </td>
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setEditingProduct(p);
                            setSingleOpType('manual');
                            setSingleValue(p.price.toFixed(2));
                          }}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-bold transition flex items-center gap-1 mx-auto border border-emerald-200 dark:border-emerald-800"
                          title="Ajustar preço deste produto"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Editar
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
        {!loading && products.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Mostrando {products.length} de {pagination.totalItems} produtos
            </span>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="p-2 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 px-3">
                Página {page} de {pagination.totalPages}
              </span>

              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="p-2 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(pagination.totalPages)}
                disabled={page === pagination.totalPages}
                className="p-2 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Painel Flutuante de Reajuste em Massa */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl py-3 px-4 flex items-center gap-4 flex-wrap md:flex-nowrap justify-between w-[92%] max-w-4xl transition-all duration-300 animate-slide-up">
        
        <div className="flex items-center gap-3">
          <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Reajuste em Lote:
          </span>

          {/* Seletor de Escopo do Reajuste */}
          <select
            value={bulkScope}
            onChange={(e) => setBulkScope(e.target.value as any)}
            className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold focus:outline-none"
          >
            <option value="FILTERED_ALL">⚡ Todos os {pagination.totalItems} produtos do Filtro Atual</option>
            <option value="SELECTED">☑ Apenas os {selectedIds.length} produtos Marcados</option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-1 md:flex-none justify-end w-full md:w-auto">
          
          {/* Seletor do Tipo de Operação */}
          <select
            value={operationType}
            onChange={(e) => {
              setOperationType(e.target.value as any);
              setAdjustValue('');
            }}
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-1.5 rounded-xl text-xs font-bold focus:outline-none"
          >
            <option value="percentage">Reajuste Percentual (%)</option>
            <option value="fixed">Preço Fixo (R$)</option>
            <option value="region">Igualar Região (Proffer)</option>
          </select>

          {/* Input de Valor (Oculto se igualar à região) */}
          {operationType !== 'region' && (
            <div className="relative w-24">
              <input
                type="text"
                placeholder={operationType === 'percentage' ? '+5%' : 'R$ 0.00'}
                value={adjustValue}
                onChange={(e) => setAdjustValue(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 pl-2 pr-6 py-1.5 rounded-xl text-xs font-bold focus:outline-none"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">
                {operationType === 'percentage' ? '%' : 'R$'}
              </span>
            </div>
          )}

          <button
            onClick={() => {
              if (bulkScope === 'SELECTED' && selectedIds.length === 0) {
                addToast('Nenhum produto foi selecionado manualmente na tabela.', 'warning');
                return;
              }
              if (bulkScope === 'FILTERED_ALL' && pagination.totalItems === 0) {
                addToast('Nenhum produto atende ao filtro ativo no momento.', 'warning');
                return;
              }
              if (operationType !== 'region' && (!adjustValue || isNaN(parseFloat(adjustValue)))) {
                addToast('Por favor, informe um valor numérico válido para o ajuste.', 'warning');
                return;
              }
              setShowConfirmModal(true);
            }}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition duration-150 flex items-center gap-1 shadow-md shadow-emerald-500/20 shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
            Aplicar Reajuste em Lote
          </button>
        </div>
      </div>

      {/* Modal de Confirmação de Reajuste em Lote */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-lg shadow-2xl relative animate-scale-up">
            
            <div className="flex items-center gap-3 text-amber-500 mb-4">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <h3 className="text-lg font-black text-slate-800 dark:text-white">
                Confirmar Reajuste de Preços no Digifarma
              </h3>
            </div>
            
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Você está prestes a alterar o preço de venda de{' '}
              <span className="font-extrabold text-slate-800 dark:text-white">
                {bulkScope === 'FILTERED_ALL' ? `TODOS os ${pagination.totalItems} produtos` : `${selectedIds.length} produtos selecionados`}
              </span>.
              Esta operação será aplicada <strong>diretamente no banco de dados de produção do Digifarma (Firebird)</strong>.
            </p>

            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 mb-4 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ajuste Configurado</span>
              <div className="text-slate-800 dark:text-slate-100 font-extrabold text-sm">
                {operationType === 'percentage' && `Reajustar em ${parseFloat(adjustValue) > 0 ? '+' : ''}${adjustValue}%`}
                {operationType === 'fixed' && `Definir preço de venda fixo para R$ ${parseFloat(adjustValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                {operationType === 'region' && 'Igualar preço de venda ao preço Proffer da Região (Napp)'}
              </div>
              <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Arredondamento para cima ativado (finais de centavos em .0, .5 ou .9).
              </p>
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={applyingAdjustment}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold text-sm transition duration-150 disabled:opacity-50"
              >
                Cancelar
              </button>
              
              <button
                onClick={handleSaveBulkAdjustments}
                disabled={applyingAdjustment}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition duration-150 flex items-center gap-1 shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                {applyingAdjustment ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Gravando no Digifarma...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmar e Gravar no Digifarma
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição Individual de Produto */}
      {editingProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-xl shadow-2xl relative animate-scale-up">
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-500 rounded-2xl">
                  <Edit3 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white">
                    Reajuste Unitário de Produto
                  </h3>
                  <span className="text-xs font-bold text-slate-400">Código #{editingProduct.id} • EAN {editingProduct.ean}</span>
                </div>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4">
              <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm mb-1">{editingProduct.name}</h4>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Estoque: <strong>{editingProduct.stock} un</strong></span>
                <span>•</span>
                <span>Curva ABC: <strong className="text-emerald-500">{editingProduct.curve}</strong></span>
              </div>
            </div>

            {/* Painel Comparativo do Produto */}
            <div className="grid grid-cols-3 gap-3 mb-6 bg-slate-50 dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Preço de Custo</span>
                <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300 mt-0.5">
                  {editingProduct.cost_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Preço Atual</span>
                <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                  {editingProduct.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Preço Região (Napp)</span>
                <p className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {editingProduct.region_price ? editingProduct.region_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Indisponível'}
                </p>
              </div>
            </div>

            {/* Configuração do Ajuste Unitário */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 block">
                  Como deseja ajustar o Preço?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => { setSingleOpType('manual'); setSingleValue(editingProduct.price.toFixed(2)); }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      singleOpType === 'manual' 
                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' 
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Valor Fixo (R$)
                  </button>

                  <button
                    type="button"
                    onClick={() => { setSingleOpType('percentage'); setSingleValue('5'); }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      singleOpType === 'percentage' 
                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' 
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Porcentagem (%)
                  </button>

                  <button
                    type="button"
                    disabled={!editingProduct.region_price || editingProduct.region_price <= 0}
                    onClick={() => { setSingleOpType('region'); setSingleValue(''); }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      singleOpType === 'region' 
                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' 
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40'
                    }`}
                  >
                    Igualar Região
                  </button>
                </div>
              </div>

              {singleOpType !== 'region' && (
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">
                    {singleOpType === 'manual' ? 'Novo Preço de Venda (R$)' : 'Percentual de Reajuste (%)'}
                  </label>
                  <input
                    type="text"
                    placeholder={singleOpType === 'manual' ? 'R$ 19,90' : '+5'}
                    value={singleValue}
                    onChange={(e) => setSingleValue(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-extrabold text-lg focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                    autoFocus
                  />
                </div>
              )}

              {/* Box de Prévia Calculada */}
              <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Novo Preço Calculado (com Arredondamento):</span>
                  <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                    R$ {previewSingle.rounded.toFixed(2).replace('.', ',')}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 border-t border-emerald-100 dark:border-emerald-900/30 pt-2">
                  <span>Lucro Bruto estimado: <strong className={previewSingle.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>R$ {previewSingle.profit.toFixed(2).replace('.', ',')}</strong></span>
                  <span>Margem de Lucro: <strong className={previewSingle.marginPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{previewSingle.marginPct.toFixed(1)}%</strong></span>
                </div>

                {previewSingle.isBelowCost && (
                  <div className="bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 p-2.5 rounded-xl flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Atenção: O novo preço está abaixo do preço de custo!</span>
                  </div>
                )}
              </div>

            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingProduct(null)}
                disabled={savingSingleProduct}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold text-sm transition duration-150 disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                onClick={handleSaveSingleProduct}
                disabled={savingSingleProduct}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition duration-150 flex items-center gap-1.5 shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                {savingSingleProduct ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Salvando no Digifarma...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Salvar no Digifarma
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
