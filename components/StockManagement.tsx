import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Filter, 
  Package, 
  TrendingDown, 
  DollarSign, 
  TrendingUp, 
  LayoutGrid, 
  Table as TableIcon,
  ChevronLeft, 
  ChevronRight,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Calendar,
  BarChart3
} from 'lucide-react';
import { useToast } from './ToastContext';
import { User } from '../types';
import { ComprasDashboard } from './compras/ComprasDashboard';


interface StockManagementProps {
  user: User;
  theme?: 'light' | 'dark';
}

interface StockProduct {
  id: number;
  name: string;
  presentation: string;
  barcode: string;
  saldo: number;
  estMinimoCalculado?: number;
  estMaximoCalculado?: number;
  pedidoMinimo?: number;
  curvaAbc?: string;
  priceVenda: number;
  priceCompra: number;
  categoryName: string;
  lastSale: string | null;
  saidasMes: number;
}

interface StockSummary {
  totalAtivos: number;
  totalSaidasMes: number;
  qtdParados: number;
  valorParado: number;
}

interface Category {
  id: number;
  name: string;
}

export const StockManagement: React.FC<StockManagementProps> = ({ user, theme = 'light' }) => {
  const { addToast } = useToast();

  // Estado da aba ativa
  const [activeTab, setActiveTab] = useState<'giro' | 'minimo'>('giro');
  
  // Estados para dados e paginação
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Estados para Lazy Loading de dados de Vendas (Última venda e Saídas do Mês)
  const [salesInfoMap, setSalesInfoMap] = useState<Record<number, { saidasMes: number, lastSale: string | null }>>({});
  const [loadingSales, setLoadingSales] = useState(false);

  // Estados de Filtros
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [daysWithoutSales, setDaysWithoutSales] = useState('90'); // Padrão 90 dias
  const [stockStatus, setStockStatus] = useState('positivo'); // Padrão saldo > 0
  const [sort, setSort] = useState('tempo_sem_venda'); // Padrão ordenar por inatividade
  const [page, setPage] = useState(1);
  const limit = 50;

  // Modo de visualização: tabela ou lista de cards
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');
  // Estado para o painel de filtros colapsível no mobile
  const [filtersOpen, setFiltersOpen] = useState(false);

  // No mobile, usar modo card por padrão
  React.useEffect(() => {
    if (window.innerWidth < 768) {
      setViewMode('list');
    }
  }, []);

  // Buscar categorias no boot
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/stock/categories');
        if (res.ok) {
          const data = await res.json();
          setCategories(data);
        }
      } catch (err) {
        console.error('Erro ao buscar categorias:', err);
      }
    };
    fetchCategories();
  }, []);

  // Buscar resumo de estoque (cards)
  const fetchSummary = useCallback(async (bypassCache = false) => {
    setLoadingSummary(true);
    try {
      const url = bypassCache ? '/api/stock/summary?bypassCache=true' : '/api/stock/summary';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro no servidor');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao carregar resumo de estoque.', 'error');
    } finally {
      setLoadingSummary(false);
    }
  }, [addToast]);

  // Buscar produtos com filtros e paginação
  const fetchProducts = useCallback(async (bypassCache = false) => {
    setLoading(true);
    if (bypassCache) {
      setSalesInfoMap({}); // Reseta cache local ao forçar atualização
    }
    try {
      const offset = (page - 1) * limit;
      const queryParams = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        search,
        daysWithoutSales,
        stockStatus,
        categoryId: selectedCategory,
        sort
      });
      if (bypassCache) {
        queryParams.append('bypassCache', 'true');
      }

      const res = await fetch(`/api/stock/products?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
        setTotalProducts(data.total || 0);
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro no servidor');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao carregar lista de estoque.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedCategory, daysWithoutSales, stockStatus, sort, addToast]);

  // Buscar dados adicionais de vendas em lote (Lazy Loading)
  const fetchSalesInfo = useCallback(async (productIds: number[]) => {
    if (productIds.length === 0) return;
    setLoadingSales(true);
    try {
      const res = await fetch('/api/stock/products/sales-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds })
      });
      if (res.ok) {
        const data = await res.json();
        setSalesInfoMap(prev => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('Erro ao buscar informações de vendas em lote:', err);
    } finally {
      setLoadingSales(false);
    }
  }, []);

  // Efeito para carregar produtos quando mudam os filtros ou página
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Efeito para carregar resumo
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Efeito para buscar informações extras de vendas quando a lista de produtos muda
  useEffect(() => {
    if (products.length > 0) {
      const idsToFetch = products
        .map(p => p.id)
        .filter(id => salesInfoMap[id] === undefined);

      if (idsToFetch.length > 0) {
        fetchSalesInfo(idsToFetch);
      }
    }
  }, [products, salesInfoMap, fetchSalesInfo]);

  // Resetar filtros para o padrão
  const handleResetFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setDaysWithoutSales('90');
    setStockStatus('positivo');
    setSort('tempo_sem_venda');
    setPage(1);
    setSalesInfoMap({});
    addToast('Filtros limpos!', 'info');
  };

  const totalPages = Math.max(1, Math.ceil(totalProducts / limit));

  // Formatar data em português
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca vendido';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR');
  };

  // Calcular dias sem venda
  const getDaysWithoutSales = (dateStr: string | null) => {
    if (!dateStr) return '∞';
    const lastSaleDate = new Date(dateStr);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - lastSaleDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} dias`;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 text-slate-800 dark:text-slate-200">
      
      {/* Cabeçalho */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 uppercase tracking-tighter">
            Controle de Estoque & Giro
          </h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Monitore o estoque físico, saídas mensais e identifique produtos obsoletos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Alternador de Layout */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-black uppercase tracking-wider ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              title="Visualizar em Tabela"
            >
              <TableIcon className="w-4 h-4" />
              Tabela
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-black uppercase tracking-wider ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              title="Visualizar em Lista"
            >
              <LayoutGrid className="w-4 h-4" />
              Lista
            </button>
          </div>

          <button
            onClick={() => {
              fetchProducts(true);
              fetchSummary(true);
            }}
            className="p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 shadow-sm hover:shadow transition-all"
            title="Atualizar Dados"
          >
            <Loader2 className={`w-5 h-5 ${loading || loadingSales ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Seletor de Abas */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm w-fit">
        <button
          onClick={() => setActiveTab('giro')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-xs font-black uppercase tracking-wider ${
            activeTab === 'giro'
              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Package className="w-4 h-4" />
          Giro &amp; Estoque
        </button>
        <button
          onClick={() => setActiveTab('minimo')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-xs font-black uppercase tracking-wider ${
            activeTab === 'minimo'
              ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Estoque Mínimo
        </button>
      </div>

      {/* Aba: Estoque Mínimo — reutiliza o ComprasDashboard sem duplicar código */}
      {activeTab === 'minimo' && (
        <ComprasDashboard user={user} theme={theme} />
      )}

      {/* Aba: Giro & Estoque (conteúdo original, condicionalmente exibido) */}
      <div className={activeTab !== 'giro' ? 'hidden' : 'contents'}>

      {/* Cards de Resumo */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        
        {/* Card 1: Valor em Estoque Parado */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-2xl">
            <DollarSign className="w-6 h-6 animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest truncate">Custo Parado (+90 dias)</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-50 mt-0.5">
              {loadingSummary 
                ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(summary?.valorParado || 0)
              }
            </p>
          </div>
        </div>

        {/* Card 2: Quantidade de Itens Parados */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-2xl">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest truncate">Itens Parados (+90 dias)</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-50 mt-0.5">
              {loadingSummary 
                ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                : `${summary?.qtdParados || 0} produtos`
              }
            </p>
          </div>
        </div>

        {/* Card 3: Saídas nos Últimos 30 Dias */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-2xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest truncate">Saídas (Últimos 30 Dias)</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-50 mt-0.5">
              {loadingSummary 
                ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                : `${summary?.totalSaidasMes || 0} unidades`
              }
            </p>
          </div>
        </div>

        {/* Card 4: Total de Produtos Ativos */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-2xl">
            <Package className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest truncate">Produtos Ativos com Saldo</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-50 mt-0.5">
              {loadingSummary 
                ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                : `${summary?.totalAtivos || 0} itens`
              }
            </p>
          </div>
        </div>
      </section>

      {/* Painel de Filtros */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Cabeçalho do painel - sempre visível com toggle no mobile */}
        <button
          className="w-full flex items-center justify-between px-5 md:px-6 py-4 border-b border-slate-100 dark:border-slate-800 md:cursor-default"
          onClick={() => setFiltersOpen(f => !f)}
          type="button"
        >
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-550">
            <Filter className="w-4 h-4 text-blue-650" />
            <h2 className="text-xs font-black uppercase tracking-widest">Filtros &amp; Buscas</h2>
          </div>
          <span className={`md:hidden text-slate-400 transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </button>
        <div className={`transition-all duration-300 overflow-hidden ${filtersOpen ? 'max-h-[800px]' : 'max-h-0 md:max-h-none'} md:block`}>
          <div className="p-5 md:p-6 space-y-4">
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          
          {/* Busca Textual */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Nome ou código de barras..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl pl-10 pr-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          {/* Categorias */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
            >
              <option value="">Todas Categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Giro / Inatividade */}
          <div>
            <select
              value={daysWithoutSales}
              onChange={(e) => {
                setDaysWithoutSales(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
            >
              <option value="0">Qualquer giro / inatividade</option>
              <optgroup label="Produtos Vendendo (Com Giro)">
                <option value="-30">Com venda nos últimos 30 dias</option>
                <option value="-60">Com venda nos últimos 60 dias</option>
                <option value="-90">Com venda nos últimos 90 dias</option>
              </optgroup>
              <optgroup label="Produtos Parados (Sem Giro)">
                <option value="30">Sem venda (+30 dias)</option>
                <option value="60">Sem venda (+60 dias)</option>
                <option value="90">Sem venda (+90 dias)</option>
                <option value="120">Sem venda (+120 dias)</option>
              </optgroup>
            </select>
          </div>

          {/* Quantidade em estoque */}
          <div>
            <select
              value={stockStatus}
              onChange={(e) => {
                setStockStatus(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
            >
              <option value="todos">Todos os saldos</option>
              <option value="positivo">Apenas saldo &gt; 0</option>
              <option value="zerado">Apenas saldo &le; 0</option>
            </select>
          </div>

          {/* Ordenação */}
          <div>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
            >
              <option value="tempo_sem_venda">Mais tempo sem venda</option>
              <option value="saldo_desc">Maior saldo</option>
              <option value="saldo_asc">Menor saldo</option>
              <option value="preco_desc">Maior preço venda</option>
              <option value="preco_asc">Menor preço venda</option>
              <option value="nome_asc">Nome (A-Z)</option>
            </select>
          </div>
        </div>

          {/* Botão limpar filtros */}
          <div className="flex justify-end pt-1">
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 hover:text-blue-650 uppercase tracking-widest cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar Filtros
            </button>
          </div>
          </div>
        </div>
      </section>

      {/* Grid de Dados */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-xs font-bold text-slate-400">Consultando banco de estoque do Digifarma...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-350">Nenhum produto encontrado</h3>
          <p className="text-xs text-slate-400 mt-1">Nenhum item ativo no estoque condiz com a seleção atual de filtros.</p>
        </div>
      ) : (
        <section className="space-y-6">
          
          {/* Exibição em Tabela */}
          {viewMode === 'table' ? (
            <>
            {/* Indicador de scroll - mobile & Legenda de Cores */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-1 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status Estoque:</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                  <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                  Abaixo do Mínimo (Repor)
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  Acima do Máximo (Excesso)
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Ideal
                </span>
              </div>
              <div className="scroll-hint md:hidden text-slate-400 text-[10px] font-bold">
                ← Role para ver mais colunas →
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto mobile-table-container overflow-y-auto max-h-[60vh]">
                <table className="w-full text-left border-collapse responsive-table">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      <th className="py-4 px-5 sticky top-0 bg-slate-50 dark:bg-slate-850 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">ID</th>
                      <th className="py-4 px-5 sticky top-0 bg-slate-50 dark:bg-slate-850 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Produto</th>
                      <th className="py-4 px-4 sticky top-0 bg-slate-50 dark:bg-slate-850 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Categoria</th>
                      <th className="py-4 px-4 text-center sticky top-0 bg-slate-50 dark:bg-slate-850 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Saldo</th>
                      <th className="py-4 px-4 text-center sticky top-0 bg-slate-50 dark:bg-slate-850 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Est. Mínimo</th>
                      <th className="py-4 px-4 text-center sticky top-0 bg-slate-50 dark:bg-slate-850 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)] text-blue-600 dark:text-blue-400">Pedido Mínimo</th>
                      <th className="py-4 px-4 text-center sticky top-0 bg-slate-50 dark:bg-slate-850 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)] text-purple-600 dark:text-purple-400">Est. Máximo (+20%)</th>
                      <th className="py-4 px-4 text-right sticky top-0 bg-slate-50 dark:bg-slate-850 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Preço Venda</th>
                      <th className="py-4 px-4 text-right sticky top-0 bg-slate-50 dark:bg-slate-850 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Total Parado</th>
                      <th className="py-4 px-4 text-center sticky top-0 bg-slate-50 dark:bg-slate-850 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Saídas (30d)</th>
                      <th className="py-4 px-4 text-center sticky top-0 bg-slate-50 dark:bg-slate-850 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Última Venda</th>
                      <th className="py-4 px-4 text-center sticky top-0 bg-slate-50 dark:bg-slate-850 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">Inatividade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {products.map((p) => {
                      const totalParado = p.saldo * p.priceCompra;
                      
                      // Lazy loading status para este produto
                      const hasSales = salesInfoMap[p.id] !== undefined;
                      const saidasMes = hasSales ? salesInfoMap[p.id].saidasMes : p.saidasMes;
                      const lastSale = hasSales ? salesInfoMap[p.id].lastSale : p.lastSale;

                      const diffDays = lastSale ? getDaysWithoutSales(lastSale) : 'N/D';
                      const isStagnant = lastSale ? (new Date().getTime() - new Date(lastSale).getTime()) / (1000 * 3600 * 24) >= 90 : true;

                      const estMin = p.estMinimoCalculado !== undefined ? p.estMinimoCalculado : 0;
                      const estMax = p.estMaximoCalculado !== undefined ? p.estMaximoCalculado : Math.ceil(estMin * 1.2);
                      const pedidoMin = p.pedidoMinimo !== undefined ? p.pedidoMinimo : Math.max(0, estMin - p.saldo);

                      const isAbaixoMinimo = estMin > 0 && p.saldo < estMin;
                      const isAcimaMaximo = estMax > 0 && p.saldo > estMax;

                      // Cores personalizadas: Azul claro para abaixo do mínimo, Vermelho para acima do máximo
                      let saldoBadgeStyle = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
                      if (isAbaixoMinimo) {
                        saldoBadgeStyle = 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 ring-2 ring-sky-400/20';
                      } else if (isAcimaMaximo) {
                        saldoBadgeStyle = 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 ring-2 ring-red-400/20';
                      } else if (estMin > 0) {
                        saldoBadgeStyle = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
                      }

                      return (
                        <tr 
                          key={p.id} 
                          className={`hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors ${
                            isAbaixoMinimo ? 'bg-sky-50/30 dark:bg-sky-950/10' : isAcimaMaximo ? 'bg-red-50/30 dark:bg-red-950/10' : ''
                          }`}
                        >
                          <td className="py-3 px-5 text-slate-400 font-mono text-[11px]">{p.id}</td>
                          <td className="py-3 px-5 min-w-[200px]">
                            <span className="block font-bold text-slate-850 dark:text-slate-100 uppercase tracking-tight">{p.name}</span>
                            <span className="block text-[10px] text-slate-400 font-bold mt-0.5">
                              {p.presentation ? p.presentation : 'S/ APRESENTACAO'} {p.barcode ? `• EAN: ${p.barcode}` : ''}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 font-bold truncate max-w-[120px]" title={p.categoryName}>
                            {p.categoryName}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-3 py-1 rounded-full font-black text-xs inline-block min-w-[36px] ${saldoBadgeStyle}`}>
                              {p.saldo}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-600 dark:text-slate-400">
                            {estMin > 0 ? (
                              <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-black">
                                {estMin}
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {pedidoMin > 0 ? (
                              <span className="px-2.5 py-1 rounded-full font-black text-xs bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-700 animate-pulse">
                                +{pedidoMin}
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 text-xs">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-bold">
                            {estMax > 0 ? (
                              <span className={`px-2.5 py-0.5 rounded-lg font-black ${
                                isAcimaMaximo 
                                  ? 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-700' 
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}>
                                {estMax}
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-slate-850 dark:text-slate-100">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.priceVenda)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-red-650 bg-red-50/10 dark:bg-red-950/5">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalParado)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {!hasSales && loadingSales ? (
                              <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-10 mx-auto" />
                            ) : (
                              <span className={`px-2 py-0.5 rounded font-black ${
                                (saidasMes || 0) > 0 
                                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-650 border border-emerald-250/20' 
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                              }`}>
                                {saidasMes || 0}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center text-slate-500 font-bold">
                            {!hasSales && loadingSales ? (
                              <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-20 mx-auto" />
                            ) : (
                              formatDate(lastSale)
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {!hasSales && loadingSales ? (
                              <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-16 mx-auto" />
                            ) : (
                              <span className={`px-2 py-1 rounded-full text-[10px] font-black ${
                                isStagnant 
                                  ? 'bg-red-50 dark:bg-red-950/20 text-red-600' 
                                  : 'bg-green-50 dark:bg-green-950/20 text-green-600'
                              }`}>
                                {diffDays}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
              {products.map((p) => {
                const totalParado = p.saldo * p.priceCompra;
                
                const hasSales = salesInfoMap[p.id] !== undefined;
                const saidasMes = hasSales ? salesInfoMap[p.id].saidasMes : p.saidasMes;
                const lastSale = hasSales ? salesInfoMap[p.id].lastSale : p.lastSale;

                const diffDays = lastSale ? getDaysWithoutSales(lastSale) : 'N/D';
                const isStagnant = lastSale ? (new Date().getTime() - new Date(lastSale).getTime()) / (1000 * 3600 * 24) >= 90 : true;

                const estMin = p.estMinimoCalculado !== undefined ? p.estMinimoCalculado : 0;
                const estMax = p.estMaximoCalculado !== undefined ? p.estMaximoCalculado : Math.ceil(estMin * 1.2);
                const pedidoMin = p.pedidoMinimo !== undefined ? p.pedidoMinimo : Math.max(0, estMin - p.saldo);

                const isAbaixoMinimo = estMin > 0 && p.saldo < estMin;
                const isAcimaMaximo = estMax > 0 && p.saldo > estMax;

                return (
                  <div 
                    key={p.id}
                    className={`bg-white dark:bg-slate-900 border rounded-3xl p-5 shadow-sm space-y-4 hover:shadow transition-shadow flex flex-col justify-between ${
                      isAbaixoMinimo 
                        ? 'border-sky-300 dark:border-sky-700 ring-2 ring-sky-400/20' 
                        : isAcimaMaximo 
                        ? 'border-red-300 dark:border-red-700 ring-2 ring-red-400/20' 
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ID {p.id}</span>
                        <div className="flex items-center gap-1.5">
                          {isAbaixoMinimo && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200">
                              🟦 Abaixo do Mínimo
                            </span>
                          )}
                          {isAcimaMaximo && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200">
                              🟥 Acima do Máximo
                            </span>
                          )}
                          {!hasSales && loadingSales ? (
                            <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-20" />
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                              isStagnant 
                                ? 'bg-red-50 dark:bg-red-950/20 text-red-600' 
                                : 'bg-green-50 dark:bg-green-950/20 text-green-600'
                            }`}>
                              ⏳ {diffDays}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100 uppercase tracking-tight line-clamp-2">{p.name}</h3>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                          {p.presentation && <span>{p.presentation}</span>}
                          {p.barcode && <span>EAN: {p.barcode}</span>}
                        </p>
                      </div>

                      {/* Métricas de Estoque Ideal */}
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center text-[10px]">
                        <div>
                          <p className="font-bold text-slate-400 uppercase">Est. Mín.</p>
                          <p className="font-black text-slate-700 dark:text-slate-200 text-xs mt-0.5">{estMin}</p>
                        </div>
                        <div>
                          <p className="font-bold text-sky-600 dark:text-sky-400 uppercase">Ped. Mín.</p>
                          <p className="font-black text-sky-700 dark:text-sky-300 text-xs mt-0.5">
                            {pedidoMin > 0 ? `+${pedidoMin}` : '0'}
                          </p>
                        </div>
                        <div>
                          <p className="font-bold text-purple-600 dark:text-purple-400 uppercase">Est. Máx.</p>
                          <p className="font-black text-purple-700 dark:text-purple-300 text-xs mt-0.5">{estMax}</p>
                        </div>
                      </div>

                      <div className="pt-1 flex flex-wrap gap-2">
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest rounded-lg">
                          🏷️ {p.categoryName}
                        </span>
                        {!hasSales && loadingSales ? (
                          <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-16" />
                        ) : (
                          (saidasMes || 0) > 0 && (
                            <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/20 text-[9px] font-black text-emerald-600 dark:text-emerald-450 uppercase tracking-widest rounded-lg flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              {saidasMes} saídas
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Saldo</p>
                        <p className={`text-sm font-black mt-0.5 ${
                          isAbaixoMinimo ? 'text-sky-600' : isAcimaMaximo ? 'text-red-600' : 'text-emerald-600'
                        }`}>{p.saldo} un</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Preço</p>
                        <p className="text-sm font-black text-slate-900 dark:text-slate-100 mt-0.5">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.priceVenda)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor Custo</p>
                        <p className="text-sm font-black text-red-650 mt-0.5">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalParado)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Paginação Premium */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 md:px-6 py-3 md:py-4 rounded-3xl shadow-sm">
            <span className="text-xs font-bold text-slate-500 hidden md:block">
              Mostrando <strong className="text-slate-800 dark:text-slate-200">{(page - 1) * limit + 1}</strong> a <strong className="text-slate-800 dark:text-slate-200">{Math.min(page * limit, totalProducts)}</strong> de <strong className="text-slate-800 dark:text-slate-200">{totalProducts}</strong> produtos
            </span>
            {/* Mobile: texto compacto */}
            <span className="text-xs font-bold text-slate-500 md:hidden">
              Pág. {page}/{totalPages} • {totalProducts} produtos
            </span>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page === 1}
                className="p-2 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent font-bold cursor-pointer transition-colors"
                title="Página Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5">
                {(() => {
                  const buttons = [];
                  
                  // Sempre exibe o botão da primeira página
                  if (totalPages >= 1) {
                    buttons.push(
                      <button
                        key={1}
                        onClick={() => setPage(1)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                          page === 1
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        1
                      </button>
                    );
                  }

                  let startPage = Math.max(2, page - 1);
                  let endPage = Math.min(totalPages - 1, page + 1);

                  // Ajustes para sempre mostrar 3 páginas intermediárias quando possível
                  if (page <= 3) {
                    endPage = Math.min(totalPages - 1, 4);
                  } else if (page >= totalPages - 2) {
                    startPage = Math.max(2, totalPages - 3);
                  }

                  // Reticências esquerdas
                  if (startPage > 2) {
                    buttons.push(
                      <span key="dots-left" className="px-1.5 text-slate-400 dark:text-slate-650 text-xs font-black">
                        ...
                      </span>
                    );
                  }

                  // Páginas intermediárias
                  for (let i = startPage; i <= endPage; i++) {
                    buttons.push(
                      <button
                        key={i}
                        onClick={() => setPage(i)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                          page === i
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {i}
                      </button>
                    );
                  }

                  // Reticências direitas
                  if (endPage < totalPages - 1) {
                    buttons.push(
                      <span key="dots-right" className="px-1.5 text-slate-400 dark:text-slate-650 text-xs font-black">
                        ...
                      </span>
                    );
                  }

                  // Sempre exibe a última página
                  if (totalPages > 1) {
                    buttons.push(
                      <button
                        key={totalPages}
                        onClick={() => setPage(totalPages)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                          page === totalPages
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {totalPages}
                      </button>
                    );
                  }

                  return buttons;
                })()}
              </div>

              <button
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={page === totalPages}
                className="p-2 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent font-bold cursor-pointer transition-colors"
                title="Próxima Página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Seletor rápido de Página Dropdown */}
              {totalPages > 5 && (
                <div className="flex items-center gap-1.5 ml-4 border-l border-slate-200 dark:border-slate-800 pl-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ir para:</span>
                  <select
                    value={page}
                    onChange={(e) => setPage(Number(e.target.value))}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500 font-black cursor-pointer"
                  >
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                      <option key={pNum} value={pNum}>
                        Pág. {pNum}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      </div>
    </div>
  );
};

export default StockManagement;
