import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Filter, 
  Loader2, 
  AlertTriangle, 
  ShoppingCart, 
  Check, 
  Plus, 
  ArrowRight,
  TrendingDown,
  Info,
  DollarSign,
  Package,
  Layers
} from 'lucide-react';
import { User } from '../types';
import { useToast } from './ToastContext';

interface ForecastItem {
  id: string;
  name: string;
  presentation: string;
  barcode: string;
  stock: number;
  minStock: number;
  price: number;
  categoryId: number;
  categoryName: string;
  totalSold: number;
  giroDiario: number;
  depletionDate: string; // YYYY-MM-DD
  purchaseDate: string;  // YYYY-MM-DD
  status: 'esgotado' | 'urgente' | 'alerta' | 'planejado';
  suggestedQty: number;
  costValue: number;
  curve?: 'A' | 'B' | 'C';
}

interface Category {
  id: number;
  name: string;
}

interface QuoteList {
  id: string;
  name: string;
  createdAt: string;
  items?: any[];
}

interface PurchaseCalendarProps {
  user: User;
}

export const PurchaseCalendar: React.FC<PurchaseCalendarProps> = ({ user }) => {
  const { addToast } = useToast();
  
  // Parâmetros do algoritmo de previsão
  const [daysAnalysis, setDaysAnalysis] = useState<number>(30);
  const [leadTime, setLeadTime] = useState<number>(5);
  const [daysCoverage, setDaysCoverage] = useState<number>(30);
  
  // Estados de dados
  const [forecastItems, setForecastItems] = useState<ForecastItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [quoteLists, setQuoteLists] = useState<QuoteList[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estado de navegação do calendário
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  // Estado da gaveta lateral (Drawer)
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'compra' | 'esgotamento'>('compra');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Estado da multi-seleção de itens na gaveta
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  
  // Estados do modal de Cotação
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState<boolean>(false);
  const [newQuoteListName, setNewQuoteListName] = useState<string>('');
  const [selectedQuoteListId, setSelectedQuoteListId] = useState<string>('');
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);

  // Carregar dados iniciais
  useEffect(() => {
    fetchForecastData();
    fetchCategories();
    fetchQuoteLists();
  }, []);

  const fetchForecastData = async (
    analysis = daysAnalysis,
    lead = leadTime,
    coverage = daysCoverage
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchasing/forecast?daysAnalysis=${analysis}&leadTime=${lead}&daysCoverage=${coverage}`);
      if (!res.ok) {
        if (res.status === 503) {
          throw new Error('Servidor do Digifarma Offline ou Inacessível. Ligue o servidor local do Digifarma.');
        }
        throw new Error('Erro ao obter previsão de compras do servidor.');
      }
      const data = await res.json();
      setForecastItems(data.items || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro de conexão.');
      addToast(err.message || 'Erro ao carregar previsões.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/stock/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data || []);
      }
    } catch (err) {
      console.error('Erro ao carregar categorias:', err);
    }
  };

  const fetchQuoteLists = async () => {
    try {
      const res = await fetch('/api/purchasing/quotes/lists');
      if (res.ok) {
        const data = await res.json();
        setQuoteLists(data || []);
      }
    } catch (err) {
      console.error('Erro ao carregar listas de cotação:', err);
    }
  };

  // Handler para recarregar dados com novos parâmetros
  const handleRecalculate = (e: React.FormEvent) => {
    e.preventDefault();
    fetchForecastData(daysAnalysis, leadTime, daysCoverage);
    addToast('Parâmetros de previsão atualizados com sucesso.', 'success');
  };

  // Mapear produtos por data para renderização rápida no calendário
  const eventsByDate = useMemo(() => {
    const depletionMap: Record<string, ForecastItem[]> = {};
    const purchaseMap: Record<string, ForecastItem[]> = {};

    forecastItems.forEach(item => {
      // Mapeamento por data de esgotamento
      if (item.depletionDate) {
        if (!depletionMap[item.depletionDate]) {
          depletionMap[item.depletionDate] = [];
        }
        depletionMap[item.depletionDate].push(item);
      }

      // Mapeamento por data recomendada de compra
      if (item.purchaseDate) {
        if (!purchaseMap[item.purchaseDate]) {
          purchaseMap[item.purchaseDate] = [];
        }
        purchaseMap[item.purchaseDate].push(item);
      }
    });

    return { depletionMap, purchaseMap };
  }, [forecastItems]);

  // Estatísticas gerais
  const stats = useMemo(() => {
    const totalItems = forecastItems.length;
    const esgotados = forecastItems.filter(i => i.stock <= 0).length;
    const urgentes = forecastItems.filter(i => i.status === 'urgente').length;
    const totalCost = forecastItems.reduce((acc, curr) => acc + curr.costValue, 0);

    return { totalItems, esgotados, urgentes, totalCost };
  }, [forecastItems]);

  // Lógica de renderização dos dias do calendário
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Primeiro dia do mês
    const firstDayOfMonth = new Date(year, month, 1);
    // Dia da semana do primeiro dia (0 = Dom, 6 = Sáb)
    const startDayOfWeek = firstDayOfMonth.getDay();
    
    // Último dia do mês
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const numDays = lastDayOfMonth.getDate();
    
    const daysArray = [];

    // Preencher dias vazios do início do mês (do mês anterior)
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      daysArray.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    // Preencher dias do mês atual
    for (let i = 1; i <= numDays; i++) {
      daysArray.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Preencher dias vazios do final do mês (do próximo mês)
    const totalSlotsUsed = daysArray.length;
    const remainingSlots = 42 - totalSlotsUsed; // Padrão de grade de 6 linhas (42 slots)
    for (let i = 1; i <= remainingSlots; i++) {
      daysArray.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return daysArray;
  }, [currentDate]);

  // Navegar meses
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Formatar mês por extenso
  const currentMonthLabel = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Pegar itens específicos do dia selecionado
  const selectedDayItems = useMemo(() => {
    if (!selectedDayStr) return [];
    const map = drawerTab === 'compra' ? eventsByDate.purchaseMap : eventsByDate.depletionMap;
    const items = map[selectedDayStr] || [];
    
    // Filtrar por busca e categoria
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (item.barcode && item.barcode.includes(searchTerm));
      const matchesCategory = selectedCategory === 'all' || String(item.categoryId) === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [selectedDayStr, drawerTab, eventsByDate, searchTerm, selectedCategory]);

  // Checkboxes na gaveta
  const toggleItemSelection = (id: string) => {
    const updated = new Set(selectedItemIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setSelectedItemIds(updated);
  };

  const toggleAllItems = (isChecked: boolean) => {
    if (isChecked) {
      const allIds = selectedDayItems.map(item => item.id);
      setSelectedItemIds(new Set(allIds));
    } else {
      setSelectedItemIds(new Set());
    }
  };

  // Enviar itens selecionados para a Lista de Faltas
  const handleSendToShortages = async () => {
    if (selectedItemIds.size === 0) {
      addToast('Selecione pelo menos um produto.', 'warning');
      return;
    }

    setIsActionLoading(true);
    let successCount = 0;
    
    try {
      const itemsToSend = selectedDayItems.filter(item => selectedItemIds.has(item.id));
      const createdAt = new Date().toISOString();

      for (const item of itemsToSend) {
        const shortageId = 'sht_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const res = await fetch('/api/shortages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: shortageId,
            productName: `${item.name} (${item.presentation})`,
            type: 'Giro de Estoque',
            clientInquiry: false,
            notes: `Previsão Calendário. Giro: ${item.giroDiario.toFixed(2)}/dia. Compra sugerida: ${item.suggestedQty} un.`,
            createdAt: createdAt,
            userName: user.name,
            purchased: false,
            ordered: false
          })
        });

        if (res.ok) {
          successCount++;
        }
      }

      addToast(`${successCount} produto(s) enviado(s) para a Lista de Faltas.`, 'success');
      setSelectedItemIds(new Set());
    } catch (err) {
      console.error(err);
      addToast('Erro ao enviar produtos para a lista de faltas.', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Criar ou adicionar itens selecionados à Lista de Cotações
  const handleSendToQuotes = async () => {
    if (selectedItemIds.size === 0) {
      addToast('Selecione pelo menos um produto.', 'warning');
      return;
    }
    
    // Abrir o modal de cotação
    setIsQuoteModalOpen(true);
  };

  const submitToQuoteList = async () => {
    let listId = selectedQuoteListId;
    
    if (!listId && !newQuoteListName.trim()) {
      addToast('Selecione uma lista existente ou digite o nome de uma nova lista.', 'warning');
      return;
    }

    setIsActionLoading(true);
    try {
      // 1. Se digitou nome de nova lista, cria primeiro
      if (newQuoteListName.trim()) {
        const resList = await fetch('/api/purchasing/quotes/lists', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: newQuoteListName.trim() })
        });
        
        if (!resList.ok) {
          throw new Error('Falha ao criar nova lista de cotação.');
        }
        
        const dataList = await resList.json();
        listId = dataList.id;
      }

      // 2. Adicionar os itens à lista de cotação
      const selectedProducts = selectedDayItems
        .filter(item => selectedItemIds.has(item.id))
        .map(item => ({
          productId: item.id,
          productName: `${item.name} (${item.presentation})`
        }));

      const resItems = await fetch(`/api/purchasing/quotes/lists/${listId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ products: selectedProducts })
      });

      if (!resItems.ok) {
        throw new Error('Falha ao adicionar itens à lista de cotação.');
      }

      addToast('Produtos adicionados à lista de cotação com sucesso.', 'success');
      setIsQuoteModalOpen(false);
      setNewQuoteListName('');
      setSelectedQuoteListId('');
      setSelectedItemIds(new Set());
      
      // Atualizar a lista de cotações
      fetchQuoteLists();
    } catch (err: any) {
      console.error(err);
      addToast(err.message || 'Erro ao processar cotação.', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-fadeIn font-sans">
      
      {/* HEADER DE CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-red-500/10 via-blue-500/5 to-slate-500/10 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-red-600 rounded-2xl shadow-lg shadow-red-600/10 text-white">
            <CalendarIcon className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
              Calendário de Compras
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter mt-1">
              Previsão Inteligente de Esgotamento e Giro de Estoque
            </p>
          </div>
        </div>

        {/* ESTATÍSTICAS RÁPIDAS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-white dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="px-4 py-2 border-r border-slate-100 dark:border-slate-800/80">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Giro Ativo</span>
            <span className="text-lg font-black text-slate-800 dark:text-slate-100">{stats.totalItems} it.</span>
          </div>
          <div className="px-4 py-2 border-r border-slate-100 dark:border-slate-800/80">
            <span className="text-[10px] font-black text-red-500 uppercase tracking-wider block flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block animate-pulse"></span> Esgotados
            </span>
            <span className="text-lg font-black text-red-600 dark:text-red-500">{stats.esgotados}</span>
          </div>
          <div className="px-4 py-2 border-r border-slate-100 dark:border-slate-800/80">
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-wider block">Em Alerta</span>
            <span className="text-lg font-black text-amber-600 dark:text-amber-500">{stats.urgentes}</span>
          </div>
          <div className="px-4 py-2">
            <span className="text-[10px] font-black text-blue-500 uppercase tracking-wider block">Valor Sugerido</span>
            <span className="text-md font-black text-slate-800 dark:text-slate-100 truncate block">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalCost)}
            </span>
          </div>
        </div>
      </div>

      {/* PAINEL DE CONFIGURAÇÕES DE GIRO */}
      <form onSubmit={handleRecalculate} className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-end gap-4">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> Período de Análise (Dias)
            </label>
            <input 
              type="number" 
              min="1" 
              max="180"
              value={daysAnalysis} 
              onChange={(e) => setDaysAnalysis(parseInt(e.target.value) || 30)}
              className="block w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-red-500/10 focus:border-red-500 focus:outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> Lead Time (Antecipação Dias)
            </label>
            <input 
              type="number" 
              min="0" 
              max="60"
              value={leadTime} 
              onChange={(e) => setLeadTime(parseInt(e.target.value) || 0)}
              className="block w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-red-500/10 focus:border-red-500 focus:outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" /> Cobertura de Estoque (Dias)
            </label>
            <input 
              type="number" 
              min="1" 
              max="180"
              value={daysCoverage} 
              onChange={(e) => setDaysCoverage(parseInt(e.target.value) || 30)}
              className="block w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-red-500/10 focus:border-red-500 focus:outline-none transition-all"
            />
          </div>
        </div>
        <button 
          type="submit" 
          disabled={isLoading}
          className="px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white font-black text-sm uppercase rounded-xl tracking-wider shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Calcular Previsão'}
        </button>
      </form>

      {/* VIEW DO CALENDÁRIO OU LOADER */}
      {isLoading ? (
        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm p-16 flex flex-col items-center justify-center gap-4 min-h-[400px]">
          <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
          <p className="text-sm font-black text-slate-500 uppercase tracking-widest animate-pulse">
            Analisando vendas e calculando previsões de estoque...
          </p>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-[2rem] p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[300px]">
          <div className="p-3 bg-red-100 dark:bg-red-900/40 rounded-full text-red-600">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">
            Não foi possível calcular previsões
          </h3>
          <p className="text-sm text-red-700 dark:text-red-400 font-medium max-w-lg leading-relaxed">
            {error}
          </p>
          <button 
            onClick={() => fetchForecastData(daysAnalysis, leadTime, daysCoverage)}
            className="px-6 py-3 bg-red-600 text-white hover:bg-red-700 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all"
          >
            Tentar Novamente
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          
          {/* HEADER DO MÊS */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
            <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-wider">
              {currentMonthLabel}
            </h2>
            <div className="flex items-center gap-2">
              <button 
                onClick={handlePrevMonth}
                className="p-2 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all text-slate-600 dark:text-slate-400"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setCurrentDate(new Date())}
                className="px-4 py-2 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all text-slate-600 dark:text-slate-400"
              >
                Hoje
              </button>
              <button 
                onClick={handleNextMonth}
                className="p-2 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all text-slate-600 dark:text-slate-400"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* GRADE SEMANAL */}
          <div className="grid grid-cols-7 text-center border-b border-slate-100 dark:border-slate-800/80 py-4 bg-slate-50/20 dark:bg-slate-900/20">
            {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((day) => (
              <span key={day} className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {day}
              </span>
            ))}
          </div>

          {/* DIAS DO CALENDÁRIO */}
          <div className="grid grid-cols-7 grid-rows-6 divide-x divide-y divide-slate-100 dark:divide-slate-800/60 border-l border-t border-slate-100 dark:divide-slate-800/40">
            {calendarDays.map((slot, index) => {
              const dayStr = slot.date.toISOString().split('T')[0];
              const depletionItems = eventsByDate.depletionMap[dayStr] || [];
              const purchaseItems = eventsByDate.purchaseMap[dayStr] || [];
              
              const isToday = new Date().toISOString().split('T')[0] === dayStr;
              const hasAlerts = depletionItems.length > 0 || purchaseItems.length > 0;

              return (
                <div 
                  key={index} 
                  onClick={() => {
                    setSelectedDayStr(dayStr);
                    setDrawerTab(purchaseItems.length > 0 ? 'compra' : 'esgotamento');
                    setSearchTerm('');
                    setSelectedCategory('all');
                    setSelectedItemIds(new Set());
                  }}
                  className={`min-h-[100px] p-2 flex flex-col justify-between cursor-pointer group transition-all relative
                    ${slot.isCurrentMonth ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/40 dark:bg-slate-950/40'}
                    ${hasAlerts ? 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30' : 'hover:bg-slate-50/30 dark:hover:bg-slate-800/10'}
                  `}
                >
                  {/* Número do Dia */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black p-1.5 rounded-lg w-7 h-7 flex items-center justify-center transition-all
                      ${isToday 
                        ? 'bg-red-600 text-white shadow-md shadow-red-600/10' 
                        : slot.isCurrentMonth 
                          ? 'text-slate-800 dark:text-slate-200' 
                          : 'text-slate-400'
                      }
                    `}>
                      {slot.date.getDate()}
                    </span>
                  </div>

                  {/* Badges de Previsão */}
                  <div className="space-y-1 mt-2">
                    {/* Compra Recomendada (Lead Time) */}
                    {purchaseItems.length > 0 && (
                      <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-lg text-[9px] font-bold text-amber-700 dark:text-amber-400 group-hover:scale-[1.02] transition-transform">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        <span className="truncate">Comprar: {purchaseItems.length}</span>
                      </div>
                    )}

                    {/* Previsão de Esgotamento */}
                    {depletionItems.length > 0 && (
                      <div className="flex items-center gap-1 px-1.5 py-0.5 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg text-[9px] font-bold text-red-700 dark:text-red-400 group-hover:scale-[1.02] transition-transform">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                        <span className="truncate">Esgotam: {depletionItems.length}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DRAWER LATERAL DE DETALHES */}
      {selectedDayStr && (
        <div className="fixed inset-0 z-50 flex justify-end animate-fadeIn">
          {/* Backdrop desbotado com blur */}
          <div 
            onClick={() => setSelectedDayStr(null)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
          />

          {/* Painel lateral da gaveta */}
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-950 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-slideLeft z-10">
            
            {/* Header da gaveta */}
            <div className="px-6 py-6 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
              <div>
                <h3 className="text-md font-black text-slate-800 dark:text-white uppercase tracking-wider">
                  Detalhamento de Previsão
                </h3>
                <p className="text-xs font-black text-slate-400 uppercase tracking-wider mt-1">
                  Dia: {new Date(selectedDayStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button 
                onClick={() => setSelectedDayStr(null)}
                className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-black uppercase tracking-wider transition-all text-slate-500"
              >
                Fechar
              </button>
            </div>

            {/* ABAS DA GAVETA */}
            <div className="flex border-b border-slate-100 dark:border-slate-800/60 bg-white dark:bg-slate-950">
              <button 
                onClick={() => {
                  setDrawerTab('compra');
                  setSelectedItemIds(new Set());
                }}
                className={`flex-1 py-4 text-center text-xs font-black uppercase tracking-wider border-b-2 transition-all
                  ${drawerTab === 'compra' 
                    ? 'border-amber-500 text-amber-600 dark:text-amber-500 bg-amber-50/10' 
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }
                `}
              >
                🚨 Recomendados para Compra ({eventsByDate.purchaseMap[selectedDayStr]?.length || 0})
              </button>
              <button 
                onClick={() => {
                  setDrawerTab('esgotamento');
                  setSelectedItemIds(new Set());
                }}
                className={`flex-1 py-4 text-center text-xs font-black uppercase tracking-wider border-b-2 transition-all
                  ${drawerTab === 'esgotamento' 
                    ? 'border-red-500 text-red-600 dark:text-red-500 bg-red-50/15' 
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }
                `}
              >
                📉 Previsão de Esgotamento ({eventsByDate.depletionMap[selectedDayStr]?.length || 0})
              </button>
            </div>

            {/* FILTROS E BUSCA */}
            <div className="p-4 bg-slate-50/30 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800/40 flex flex-col sm:flex-row gap-3">
              {/* Campo Busca */}
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nome ou código..."
                  className="block w-full pl-11 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/10"
                />
              </div>

              {/* Filtro de Categoria */}
              <div className="relative min-w-[150px]">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <select 
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="block w-full pl-9 pr-8 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/10 appearance-none cursor-pointer"
                >
                  <option value="all">Todas Categorias</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* LISTAGEM DE ITENS */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {selectedDayItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-3">
                  <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-full text-slate-400">
                    <Info className="w-8 h-8" />
                  </div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider">
                    Nenhum produto previsto para este filtro.
                  </p>
                </div>
              ) : (
                selectedDayItems.map(item => {
                  const isChecked = selectedItemIds.has(item.id);
                  return (
                    <div 
                      key={item.id} 
                      onClick={() => toggleItemSelection(item.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3
                        ${isChecked 
                          ? 'bg-red-50/15 border-red-500/50 shadow-md shadow-red-500/5' 
                          : 'bg-white dark:bg-slate-900 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-slate-100 dark:border-slate-800'
                        }
                      `}
                    >
                      {/* Checkbox e Detalhes */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div 
                          className={`w-5.5 h-5.5 rounded-lg border flex items-center justify-center transition-all flex-shrink-0
                            ${isChecked 
                              ? 'bg-red-600 border-red-600 text-white' 
                              : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                            }
                          `}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 truncate uppercase tracking-tight flex items-center gap-1.5">
                            {item.name}
                            {item.curve && (
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white ${
                                item.curve === 'A' ? 'bg-red-600 font-bold' : 'bg-blue-600 font-bold'
                              }`} title={`Produto Curva ${item.curve}`}>
                                Curva {item.curve}
                              </span>
                            )}
                          </h4>
                          <p className="text-[10px] font-bold text-slate-400 truncate uppercase mt-0.5">
                            {item.presentation} | EAN: {item.barcode || 'N/D'}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[9px] font-black uppercase bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500">
                              Estoque: {item.stock}
                            </span>
                            <span className="text-[9px] font-black uppercase bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500">
                              Giro: {item.giroDiario.toFixed(2)}/dia
                            </span>
                            {item.stock <= 0 && (
                              <span className="text-[9px] font-black uppercase bg-red-100 dark:bg-red-950/40 px-2 py-0.5 rounded text-red-600 dark:text-red-400">
                                Esgotado
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Info de Compra / Valores */}
                      <div className="text-right flex-shrink-0">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Sugestão</span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-100 block mt-0.5">
                          {item.suggestedQty} un.
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 block mt-0.5">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.costValue)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* SELEÇÃO E AÇÕES DA GAVETA */}
            {selectedDayItems.length > 0 && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
                
                {/* Selecionar Todos / Indicadores */}
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id="select-all"
                      checked={selectedItemIds.size === selectedDayItems.length}
                      onChange={(e) => toggleAllItems(e.target.checked)}
                      className="w-4 h-4 rounded text-red-600 border-slate-300 focus:ring-red-500/10 cursor-pointer"
                    />
                    <label htmlFor="select-all" className="text-xs font-black text-slate-500 uppercase tracking-wider cursor-pointer">
                      Selecionar Todos ({selectedItemIds.size}/{selectedDayItems.length})
                    </label>
                  </div>
                  {selectedItemIds.size > 0 && (
                    <div className="text-right">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Custo Total Selecionado</span>
                      <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                          selectedDayItems
                            .filter(i => selectedItemIds.has(i.id))
                            .reduce((sum, item) => sum + item.costValue, 0)
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Botões de Ações */}
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={handleSendToShortages}
                    disabled={selectedItemIds.size === 0 || isActionLoading}
                    className="py-3 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all flex items-center justify-center gap-2"
                  >
                    {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    Enviar para Faltas
                  </button>
                  
                  <button 
                    onClick={handleSendToQuotes}
                    disabled={selectedItemIds.size === 0 || isActionLoading}
                    className="py-3 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all flex items-center justify-center gap-2"
                  >
                    {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                    Adicionar à Cotação
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE ADICIONAR A COTAÇÃO */}
      {isQuoteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
          {/* Backdrop do Modal */}
          <div 
            onClick={() => setIsQuoteModalOpen(false)}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />

          {/* Corpo do Modal */}
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 p-6 shadow-2xl z-10 flex flex-col gap-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-md font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-red-600" /> Adicionar à Cotação
              </h3>
              <button 
                onClick={() => setIsQuoteModalOpen(false)}
                className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600"
              >
                Cancelar
              </button>
            </div>

            <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase tracking-tighter">
              Escolha uma lista de cotações ativa ou crie uma nova para vincular os {selectedItemIds.size} itens selecionados.
            </p>

            <div className="space-y-4">
              {/* Opção 1: Selecionar Lista Existente */}
              {quoteLists.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1">
                    Selecionar Lista Ativa
                  </label>
                  <select 
                    value={selectedQuoteListId}
                    onChange={(e) => {
                      setSelectedQuoteListId(e.target.value);
                      if (e.target.value) setNewQuoteListName('');
                    }}
                    className="block w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none appearance-none cursor-pointer"
                  >
                    <option value="">Selecione uma lista...</option>
                    {quoteLists.map(list => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({new Date(list.createdAt).toLocaleDateString('pt-BR')})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Divisor Visual */}
              {quoteLists.length > 0 && (
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-100 dark:border-slate-800"></div>
                  <span className="flex-shrink mx-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">OU</span>
                  <div className="flex-grow border-t border-slate-100 dark:border-slate-800"></div>
                </div>
              )}

              {/* Opção 2: Criar Nova Lista */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1">
                  Criar Nova Lista de Cotação
                </label>
                <input 
                  type="text" 
                  value={newQuoteListName}
                  onChange={(e) => {
                    setNewQuoteListName(e.target.value);
                    if (e.target.value) setSelectedQuoteListId('');
                  }}
                  placeholder="Digite o nome da nova lista..."
                  className="block w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Ações do Modal */}
            <button 
              onClick={submitToQuoteList}
              disabled={isActionLoading || (!selectedQuoteListId && !newQuoteListName.trim())}
              className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all flex items-center justify-center gap-2"
            >
              {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 stroke-[3]" />}
              Confirmar e Adicionar
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
