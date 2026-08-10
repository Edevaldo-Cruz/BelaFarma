import React from 'react';
import { 
  TrendingUp, 
  AlertCircle, 
  Store, 
  Calendar,
  ShoppingCart,
  Pill,
  ClipboardList,
  Lock,
  AlertTriangle,
  Truck,
  BellRing, // Added for Sunday alert
  Radio,
  Megaphone,
  Square,
  Database,
  PlusCircle,
  Clock,
  CheckCircle2,
  Smartphone,
  CreditCard,
  User as UserIcon,
  Receipt,
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Search,
  X,
  List,
  DollarSign,
  Ticket,
  Award,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart,
  Eye
} from 'lucide-react';
import { useToast } from './ToastContext';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import SalesChart from './SalesChart';
import ExpensesChart from './ExpensesChart';
import FinancialEvolutionChart from './FinancialEvolutionChart';
import PaymentMethodsChart from './PaymentMethodsChart';
import { GoalPopup } from './GoalPopup';
import { OrderStatusModal } from './OrderStatusModal';
import { DeliveryWidget } from './DeliveryWidget';
import { Order, OrderStatus, User, UserRole, ProductShortage, Boleto, BoletoStatus, CashClosingRecord, FixedAccount, MonthlyLimit } from '../types';
import { calculateWeeklyBudgetsCascade } from '../utils';

interface DashboardProps {
  user: User;
  orders: Order[];
  shortages: ProductShortage[];
  cashClosings: CashClosingRecord[];
  boletos: Boleto[];
  fixedAccounts: FixedAccount[];
  monthlyLimits?: MonthlyLimit[];
  onNavigate: (view: any) => void;
  onUpdateOrder: (order: Order) => void;
  onUpdateBoletos: (orderId: string, boletos: Boleto[]) => void;
  isMobile?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  user, 
  orders, 
  shortages, 
  cashClosings, 
  boletos, 
  fixedAccounts, 
  monthlyLimits = [], 
  onNavigate, 
  onUpdateOrder, 
  onUpdateBoletos, 
  isMobile = false 
}) => {
  const { addToast } = useToast();
  const isAdmin = user.role === UserRole.ADM;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const currentMonthName = React.useMemo(() => {
    return new Date().toLocaleString('pt-BR', { month: 'long' });
  }, []);

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const budgetData = React.useMemo(() => {
    if (!isAdmin) return null;
    const currentYear = new Date().getFullYear();
    const currentMonthNumber = new Date().getMonth() + 1;

    // Calcula a cascata do ano (com as regras de perdão de dívidas em utils.ts)
    // CORREÇÃO: ordem dos parâmetros é (boletos, monthlyLimits, startYear, endYear, endMonth)
    const stats = calculateWeeklyBudgetsCascade(boletos, monthlyLimits, currentYear, currentYear, currentMonthNumber - 1);
    const monthKey = `${currentYear}-${currentMonthNumber}`;
    const monthData = stats[monthKey];

    if (!monthData) return null;

    const agora = new Date();
    // Encontrar a semana atual
    let currentWeek = monthData.weeks.find(w => agora >= w.startDate && agora <= w.endDate);
    
    if (!currentWeek && monthData.weeks.length > 0) {
      // Se não cair exatamente dentro de uma (ex: fds), pega a que estiver com endDate no futuro ou a última
      currentWeek = monthData.weeks.find(w => agora <= w.endDate) || monthData.weeks[monthData.weeks.length - 1];
    }

    if (!currentWeek) return null;

    // Progresso da Semana
    let percentUsed = 0;
    const adjustedLimit = currentWeek.available + currentWeek.spent; // reconstrói o limite ajustado
    if (adjustedLimit > 0) {
      percentUsed = (currentWeek.spent / adjustedLimit) * 100;
    } else if (currentWeek.spent > 0) {
      percentUsed = 100;
    }

    // Progresso Diário
    const daysInMonth = new Date(currentYear, currentMonthNumber, 0).getDate();
    const dailyLimit = monthData.limit / daysInMonth;
    const todayBoletos = boletos.filter(b => {
      if (!b.due_date) return false;
      const [by, bm, bd] = b.due_date.split('-').map(Number);
      return by === agora.getFullYear() && bm === (agora.getMonth() + 1) && bd === agora.getDate();
    });
    const spentToday = todayBoletos.reduce((sum, b) => sum + b.value, 0);

    let percentDaily = 0;
    if (dailyLimit > 0) percentDaily = (spentToday / dailyLimit) * 100;
    else if (spentToday > 0) percentDaily = 100;

    let dailyStatus: 'safe' | 'warning' | 'danger' = 'safe';
    if (percentDaily >= 100) dailyStatus = 'danger';
    else if (percentDaily >= 80) dailyStatus = 'warning';

    // Progresso Mensal
    let percentMonthly = 0;
    if (monthData.limit > 0) percentMonthly = (monthData.totalSpent / monthData.limit) * 100;
    else if (monthData.totalSpent > 0) percentMonthly = 100;

    let monthlyStatus: 'safe' | 'warning' | 'danger' = 'safe';
    if (percentMonthly >= 100) monthlyStatus = 'danger';
    else if (percentMonthly >= 80) monthlyStatus = 'warning';

    return {
      daily: {
        limit: dailyLimit,
        spent: spentToday,
        percentUsed: percentDaily,
        status: dailyStatus
      },
      currentWeek: {
        ...currentWeek,
        percentUsed,
        adjustedLimit
      },
      monthly: {
        limit: monthData.limit,
        spent: monthData.totalSpent,
        percentUsed: percentMonthly,
        status: monthlyStatus
      }
    };
  }, [boletos, monthlyLimits, isAdmin]);

  const themeCardClass = 'glass-card-neutral';

  const [iniciandoRadio, setIniciandoRadio] = React.useState(false);
  const [carregandoNoticias, setCarregandoNoticias] = React.useState(false);
  const [liveSalesData, setLiveSalesData] = React.useState<{
    totalSales: number;
    qtdVendas: number;
    dinheiro: number;
    credit: number;
    debit: number;
    pix: number;
    crediario: number;
    outros: number;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('belafarma_live_sales_cache');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [lastBackup, setLastBackup] = React.useState<string | null>(null);
  
  
  const [statusModalOrder, setStatusModalOrder] = React.useState<Order | null>(null);

  const [showGoalPopup, setShowGoalPopup] = React.useState(() => {
    return !sessionStorage.getItem('hasSeenGoalPopup');
  });

  const handleCloseGoalPopup = () => {
    sessionStorage.setItem('hasSeenGoalPopup', 'true');
    setShowGoalPopup(false);
  };

  // Estado e busca do Contador de Visitantes
  const [visitorStats, setVisitorStats] = React.useState<{ todayVisits: number; totalVisits: number } | null>(null);

  React.useEffect(() => {
    const recordAndFetchVisitors = async () => {
      try {
        const res = await fetch('/api/system/visitors/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userName: user.name || 'Usuário' })
        });
        if (res.ok) {
          const data = await res.json();
          setVisitorStats({ todayVisits: data.todayVisits || 0, totalVisits: data.totalVisits || 0 });
        } else {
          const statsRes = await fetch('/api/system/visitors/stats');
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            setVisitorStats({ todayVisits: statsData.todayVisits || 0, totalVisits: statsData.totalVisits || 0 });
          }
        }
      } catch (err) {
        console.error('Erro ao buscar estatísticas de visitantes:', err);
      }
    };
    recordAndFetchVisitors();
  }, [user.name]);

  // Estados para os Produtos Parados > 90 dias e Carrossel Autoplay
  const [inactiveProducts, setInactiveProducts] = React.useState<any[]>([]);
  const [loadingInactive, setLoadingInactive] = React.useState(true);
  const [isPaused, setIsPaused] = React.useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const inactiveContainerRef = React.useRef<HTMLDivElement>(null);

  // Estados para o Modal de Todos os Produtos Parados
  const [showAllInactiveModal, setShowAllInactiveModal] = React.useState(false);
  const [allInactiveProducts, setAllInactiveProducts] = React.useState<any[]>([]);
  const [loadingAllInactive, setLoadingAllInactive] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');

  const handleOpenAllInactiveModal = async () => {
    setShowAllInactiveModal(true);
    setLoadingAllInactive(true);
    try {
      const response = await fetch('/api/stock/inactive-90-days?limit=1000');
      if (response.ok) {
        const data = await response.json();
        setAllInactiveProducts(data || []);
      }
    } catch (e) {
      console.error('Erro ao buscar todos os produtos parados:', e);
      addToast('Erro ao buscar todos os produtos parados.', 'error');
    } finally {
      setLoadingAllInactive(false);
    }
  };

  const filteredProducts = React.useMemo(() => {
    return allInactiveProducts.filter(p => 
      (p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.barcode && p.barcode.includes(searchTerm)) ||
      (p.presentation && p.presentation.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [allInactiveProducts, searchTerm]);

  // Estados para Ranking de Produtos e Curva ABC
  const [topProducts, setTopProducts] = React.useState<any[]>([]);
  const [abcCurve, setAbcCurve] = React.useState<any[]>([]);
  const [loadingTopProducts, setLoadingTopProducts] = React.useState(true);
  const [topPeriod, setTopPeriod] = React.useState<'day' | 'month' | 'semester'>('month');
  const [showAbcModal, setShowAbcModal] = React.useState(false);
  const [abcSearchTerm, setAbcSearchTerm] = React.useState('');

  // Estado para Tabs de Gráficos
  const [chartTab, setChartTab] = React.useState<'evolution' | 'expenses' | 'sales' | 'payments'>('evolution');

  const fetchTopProducts = React.useCallback(async (period: 'day' | 'month' | 'semester') => {
    setLoadingTopProducts(true);
    try {
      const response = await fetch(`/api/finance-agent/top-products?period=${period}`);
      if (response.ok) {
        const data = await response.json();
        setTopProducts(data.topProducts || []);
        setAbcCurve(data.abcCurve || []);
      }
    } catch (e) {
      console.error('Erro ao buscar ranking de produtos:', e);
      addToast('Erro ao buscar ranking de produtos.', 'error');
    } finally {
      setLoadingTopProducts(false);
    }
  }, [addToast]);

  React.useEffect(() => {
    fetchTopProducts(topPeriod);
  }, [topPeriod, fetchTopProducts]);

  const filteredAbcCurve = React.useMemo(() => {
    return abcCurve.filter(p => 
      (p.name && p.name.toLowerCase().includes(abcSearchTerm.toLowerCase())) ||
      (p.barcode && p.barcode.includes(abcSearchTerm)) ||
      (p.presentation && p.presentation.toLowerCase().includes(abcSearchTerm.toLowerCase())) ||
      (p.curve && p.curve.toLowerCase() === abcSearchTerm.toLowerCase().trim())
    );
  }, [abcCurve, abcSearchTerm]);

  // Estados para o Widget de Pós-Venda no Dashboard
  const [newCustomers, setNewCustomers] = React.useState<any[]>([]);
  const [selectedClientIds, setSelectedClientIds] = React.useState<string[]>([]);
  const [loadingPostSales, setLoadingPostSales] = React.useState(true);
  const [sendingPostSales, setSendingPostSales] = React.useState(false);
  const [postSalesMessage, setPostSalesMessage] = React.useState(
    'Olá, {nome}! Tudo bem? Passando para agradecer a preferência na sua compra na BelaFarma. Deu tudo certo com o seu atendimento e a entrega? Esperamos que tenha tido uma ótima experiência! Qualquer dúvida estou à disposição. 💚'
  );

  const fetchNewCustomers = React.useCallback(async () => {
    setLoadingPostSales(true);
    try {
      const res = await fetch('/api/marketing/new-customers?days=7');
      if (res.ok) {
        const data = await res.json();
        setNewCustomers(data.newCustomers || []);
      }
    } catch (e) {
      console.error('Erro ao buscar novos clientes para pós-venda:', e);
    } finally {
      setLoadingPostSales(false);
    }
  }, []);

  React.useEffect(() => {
    fetchNewCustomers();
  }, [fetchNewCustomers]);

  const selectAll = () => {
    setSelectedClientIds(newCustomers.map(c => c.id || c.phone));
  };

  const deselectAll = () => {
    setSelectedClientIds([]);
  };

  const toggleClient = (id: string) => {
    setSelectedClientIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSendPostSales = async () => {
    if (selectedClientIds.length === 0) {
      addToast('Por favor, selecione pelo menos um cliente.', 'warning');
      return;
    }

    setSendingPostSales(true);
    try {
      const selectedClients = newCustomers.filter(c => 
        selectedClientIds.includes(c.id || c.phone)
      );

      const res = await fetch('/api/marketing/post-sales/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clients: selectedClients.map(c => ({ id: c.id, name: c.name, phone: c.phone })),
          messageText: postSalesMessage
        })
      });

      if (res.ok) {
        const data = await res.json();
        addToast(`Pós-venda enviado com sucesso! ${data.sent} mensagens enviadas.`, 'success');
        deselectAll();
        fetchNewCustomers();
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Erro no envio.');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao processar pós-venda.', 'error');
    } finally {
      setSendingPostSales(false);
    }
  };

  React.useEffect(() => {
    const fetchLastBackup = async () => {
      try {
        const response = await fetch('/api/backups');
        const data = await response.json();
        if (data && data.length > 0) {
          setLastBackup(new Date(data[0].date).toLocaleString('pt-BR'));
        }
      } catch (e) {
        console.error('Erro ao buscar último backup:', e);
      }
    };
    
    const fetchLiveSales = async () => {
      try {
        const response = await fetch('/api/finance-agent/live-closing');
        if (response.ok) {
           const data = await response.json();
           if (data && data.isOffline) {
             console.warn('[Dashboard] Servidor do Digifarma Offline. Mantendo dados do cache.');
             return;
           }
           setLiveSalesData(data);
           try {
             localStorage.setItem('belafarma_live_sales_cache', JSON.stringify(data));
           } catch (err) {
             console.error('Erro ao salvar cache de live sales:', err);
           }
        }
      } catch (e) {
        console.error('Erro ao buscar vendas ao vivo:', e);
      }
    };

    const fetchInactiveProducts = async () => {
      setLoadingInactive(true);
      try {
        const response = await fetch('/api/stock/inactive-90-days');
        if (response.ok) {
          const data = await response.json();
          setInactiveProducts(data || []);
        }
      } catch (e) {
        console.error('Erro ao buscar produtos parados:', e);
      } finally {
        setLoadingInactive(false);
      }
    };

    fetchLastBackup();
    fetchLiveSales();
    fetchInactiveProducts();
    
    const interval = setInterval(fetchLiveSales, 60000); // 1 minuto
    return () => clearInterval(interval);
  }, []);

  // Effect para controlar o Autoplay do Carrossel de Produtos Parados (10 segundos)
  React.useEffect(() => {
    if (inactiveProducts.length === 0 || isPaused) return;

    const interval = setInterval(() => {
      const container = inactiveContainerRef.current;
      if (container) {
        const cardWidth = 236; // 220px card + 16px gap
        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        
        if (container.scrollLeft >= maxScrollLeft - 10) {
          container.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          container.scrollBy({ left: cardWidth, behavior: 'smooth' });
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [inactiveProducts, isPaused]);

  const enrichedCashClosings = React.useMemo(() => {
    if (!liveSalesData) return cashClosings;

    const todayStr = new Date().toLocaleDateString('en-CA');
    const todayIndex = cashClosings.findIndex(c => c.date.startsWith(todayStr));

    if (todayIndex !== -1) {
      const updated = [...cashClosings];
      updated[todayIndex] = {
        ...updated[todayIndex],
        totalSales: liveSalesData.totalSales,
        credit: liveSalesData.credit,
        debit: liveSalesData.debit,
        pix: liveSalesData.pix,
        totalCrediario: liveSalesData.crediario,
      };
      return updated;
    } else {
      const fakeTodayRecord = {
        id: 'live-today-simulated',
        date: `${todayStr}T12:00:00.000Z`,
        totalSales: liveSalesData.totalSales,
        credit: liveSalesData.credit,
        debit: liveSalesData.debit,
        pix: liveSalesData.pix,
        totalCrediario: liveSalesData.crediario,
        pixDirect: 0
      } as unknown as CashClosingRecord;
      return [...cashClosings, fakeTodayRecord];
    }
  }, [cashClosings, liveSalesData]);

  const handleIniciarRadio = async () => {
    setIniciandoRadio(true);
    try {
      await fetch('/api/radio/saudacao-proxy', {
        method: 'POST'
      });
    } catch (e) {
      console.error('Erro ao iniciar a rádio:', e);
    } finally {
      setTimeout(() => setIniciandoRadio(false), 2000);
    }
  };

  const handleTocarNoticias = async () => {
    setCarregandoNoticias(true);
    addToast('A Isa está preparando o resumo de notícias... Isso pode levar alguns segundos.', 'info');
    try {
      const resp = await fetch('/api/radio/disparar-noticias-ia', {
        method: 'POST'
      });
      if (!resp.ok) throw new Error('Erro no servidor');
      addToast('Notícias enviadas para a rádio com sucesso!', 'success');
    } catch (err) {
      addToast('Falha ao acionar notícias da Isa. Verifique a conexão com a rádio.', 'error');
    } finally {
      setCarregandoNoticias(false);
    }
  };

  const handlePararRadio = async () => {
    try {
      await fetch('/api/radio/parar-proxy', {
        method: 'POST'
      });
      addToast('Comando para parar a rádio enviado!', 'info');
    } catch (e) {
      console.error('Erro ao parar a rádio:', e);
    }
  };

  const overdueOrders = orders.filter(o => {
    const forecast = new Date(o.arrivalForecast);
    forecast.setHours(0, 0, 0, 0);
    return o.status === OrderStatus.PENDENTE && forecast < now;
  });

  const upcomingOrders = orders.filter(o => {
    const forecast = new Date(o.arrivalForecast);
    forecast.setHours(0, 0, 0, 0);
    const twoDaysFromNow = new Date(now);
    twoDaysFromNow.setDate(now.getDate() + 2);
    return o.status === OrderStatus.PENDENTE && forecast >= now && forecast <= twoDaysFromNow;
  });

  // Boleto Logic
  const overdueBoletos = boletos.filter(b => {
    const dueDate = new Date(b.due_date + 'T00:00:00'); // Ensure local date parsing
    return b.status === BoletoStatus.PENDENTE && dueDate < now;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextSunday = new Date(today);
  nextSunday.setDate(today.getDate() + (7 - today.getDay()) % 7);
  nextSunday.setHours(0, 0, 0, 0);

  const isSaturday = today.getDay() === 6;

  const boletosDueSunday = boletos.filter(b => {
    const dueDate = new Date(b.due_date + 'T00:00:00');
    return b.status === BoletoStatus.PENDENTE && 
           dueDate.getTime() === nextSunday.getTime() &&
           isSaturday;
  });

  const totalSpentThisMonth = budgetData?.monthly.spent || boletos.reduce((sum, b) => {
    const d = new Date(b.due_date + 'T00:00:00');
    return d.getFullYear() === now.getFullYear() && (d.getMonth() + 1) === (now.getMonth() + 1) ? sum + b.value : sum;
  }, 0);

  const overdueCount = overdueOrders.length;

  const mainDistributorMap = orders.reduce((acc: any, curr) => {
    acc[curr.distributor] = (acc[curr.distributor] || 0) + curr.totalValue;
    return acc;
  }, {});

  const topDistributor = Object.keys(mainDistributorMap).length > 0 
    ? Object.keys(mainDistributorMap).reduce((a, b) => mainDistributorMap[a] > mainDistributorMap[b] ? a : b)
    : 'Nenhum';

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
      {/* Decorative background glow for Glassmorphism theme */}
      <div className={`absolute -top-40 -right-40 w-[450px] h-[450px] rounded-full blur-[140px] opacity-[0.08] dark:opacity-[0.05] pointer-events-none transition-all duration-1000 -z-10 bg-gradient-to-br ${
        !isAdmin || !budgetData || budgetData.currentWeek.status === 'no-budget' ? 'from-blue-400 to-indigo-500' :
        budgetData.currentWeek.status === 'safe' ? 'from-emerald-400 to-teal-500' :
        budgetData.currentWeek.status === 'warning' ? 'from-amber-400 to-yellow-500' :
        'from-rose-450 to-red-650'
      }`} />
      <div className={`absolute top-[40vh] -left-40 w-[350px] h-[350px] rounded-full blur-[120px] opacity-[0.05] dark:opacity-[0.03] pointer-events-none transition-all duration-1000 -z-10 bg-gradient-to-br ${
        !isAdmin || !budgetData || budgetData.currentWeek.status === 'no-budget' ? 'from-teal-400 to-blue-500' :
        budgetData.currentWeek.status === 'safe' ? 'from-teal-400 to-emerald-500' :
        budgetData.currentWeek.status === 'warning' ? 'from-yellow-400 to-amber-500' :
        'from-red-400 to-rose-650'
      }`} />
      {!isMobile && showGoalPopup && (
        <GoalPopup 
          cashClosings={cashClosings} 
          onClose={handleCloseGoalPopup} 
        />
      )}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img 
            src="/images/logo-bela-farma.jpg" 
            alt="belinha" 
            className="h-12 md:h-16 w-auto object-contain"
          />
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tighter">Olá, {user.name.split(' ')[0]}!</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Resumo operacional belinha.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={handleIniciarRadio}
                disabled={iniciandoRadio}
                className="flex items-center gap-1.5 text-xs md:text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-3 py-1.5 rounded-full shadow-md transition-all min-h-[36px]"
              >
                <Radio className={`w-3.5 h-3.5 md:w-4 md:h-4 ${iniciandoRadio ? 'animate-pulse' : ''}`} />
                <span className="hidden sm:inline">{iniciandoRadio ? 'Iniciando...' : 'Rádio'}</span>
              </button>
              <button
                onClick={handleTocarNoticias}
                disabled={carregandoNoticias}
                className="flex items-center gap-1.5 text-xs md:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1.5 rounded-full shadow-md transition-all min-h-[36px]"
              >
                <Megaphone className={`w-3.5 h-3.5 md:w-4 md:h-4 ${carregandoNoticias ? 'animate-pulse' : ''}`} />
                <span className="hidden sm:inline">{carregandoNoticias ? 'Preparando...' : 'Notícias'}</span>
              </button>
              <button
                onClick={handlePararRadio}
                className="flex items-center gap-1.5 text-xs md:text-sm font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-full shadow-md transition-all min-h-[36px]"
              >
                <Square className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Parar</span>
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs md:text-sm font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-full border border-red-100 dark:border-red-800 shadow-sm">
            <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" />
            {now.toLocaleDateString('pt-BR')}
          </div>
          {lastBackup && (
            <div className="hidden md:flex items-center gap-2 text-sm font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 rounded-full border border-emerald-100 dark:border-emerald-800 shadow-sm" title="Último Backup">
              <Database className="w-4 h-4" />
              {lastBackup}
            </div>
          )}
        </div>
      </header>


      {/* ⚡ CARROSSEL DE ATALHOS RÁPIDOS (MANUAL, ORDENADO POR USO PESSOAL) */}
      <section className="relative group">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-4 z-10 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
          <button 
            onClick={() => scrollContainerRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
            className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-red-650 dark:hover:text-red-500 rounded-full shadow-lg transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        <div 
          ref={scrollContainerRef}
          className="flex items-center gap-4 overflow-x-auto scroll-smooth scrollbar-none py-2 pr-12 w-full no-scrollbar"
        >
          {(() => {
            const stats = JSON.parse(localStorage.getItem('belinha_usage_stats') || '{}');
            
            const allShortcuts = [
              { id: 'medication-search', label: 'Busca/Venda', icon: Pill, color: 'indigo' },
              { id: 'orders', label: 'Pedidos', icon: ShoppingCart, color: 'blue' },
              { id: 'shortages', label: 'Faltas', icon: ClipboardList, color: 'amber' },
              { id: 'cash-closing', label: 'Fechamento', icon: Lock, color: 'emerald', adminOnly: true },
              { id: 'financial', label: 'Financeiro', icon: CreditCard, color: 'purple', adminOnly: true },
              { id: 'task-management', label: 'Tarefas', icon: CheckCircle2, color: 'red' },
              { id: 'ifood-control', label: 'iFood', icon: Smartphone, color: 'pink', adminOnly: true },
              { id: 'customers', label: 'Clientes', icon: UserIcon, color: 'slate' },
              { id: 'daily-records', label: 'Lançamentos', icon: Receipt, color: 'orange' },
              { id: 'safe', label: 'Cofre', icon: Lock, color: 'gray', adminOnly: true },
            ];

            // Ordena os atalhos por uso pessoal
            const visibleShortcuts = allShortcuts
              .filter(s => !s.adminOnly || isAdmin)
              .sort((a, b) => (stats[b.id] || 0) - (stats[a.id] || 0));

            return visibleShortcuts.map(s => {
              const Icon = s.icon;
              const colorMap: any = {
                indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900',
                blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900',
                amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900',
                emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
                purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900',
                red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900',
                pink: 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-900',
                slate: 'bg-slate-50 dark:bg-slate-900/20 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-900',
                orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900',
                gray: 'bg-gray-50 dark:bg-gray-900/20 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-900'
              };

              const colors = colorMap[s.color] || colorMap.slate;

              return (
                <button 
                  key={s.id}
                  onClick={() => {
                    const currentStats = JSON.parse(localStorage.getItem('belinha_usage_stats') || '{}');
                    currentStats[s.id] = (currentStats[s.id] || 0) + 1;
                    localStorage.setItem('belinha_usage_stats', JSON.stringify(currentStats));
                    onNavigate(s.id);
                  }}
                  className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group shrink-0 min-w-[120px] h-[110px]"
                >
                  <div className={`p-3 rounded-2xl mb-2 group-hover:scale-110 transition-transform ${colors.split(' ').slice(0,3).join(' ')}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{s.label}</span>
                </button>
              );
            });
          })()}
        </div>

        <div className="absolute right-0 top-1/2 -translate-y-1/2 -mr-4 z-10 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
          <button 
            onClick={() => scrollContainerRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
            className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-red-650 dark:hover:text-red-500 rounded-full shadow-lg transition-colors cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      <div className="my-6"></div>

      {/* PAINEL DE VENDAS E ORÇAMENTO MENSAL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        {/* Vendas Hoje (Live) Widget */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 rounded-3xl shadow-lg relative overflow-hidden text-white flex flex-col justify-between h-full min-h-[160px]">
          <div className="absolute top-0 right-0 p-4 opacity-20">
             <TrendingUp className="w-24 h-24" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest flex items-center gap-2">
              Vendas de Hoje (Live)
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
              </span>
            </p>
            <p className="text-3xl font-black text-white mt-1 truncate" title={liveSalesData !== null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(liveSalesData.totalSales) : ''}>
              {liveSalesData !== null 
                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(liveSalesData.totalSales)
                : <span className="text-emerald-200 animate-pulse text-lg">Carregando...</span>
              }
            </p>
          </div>
        </div>

        {/* Orçamento Mensal */}
        {isAdmin && budgetData && budgetData.currentWeek.status !== 'no-budget' && (() => {
          const budgetStatus = budgetData.monthly.status;
          let budgetCardClass = 'glass-card-neutral';
          let statusLabel = 'Sem Limite';
          let statusBadgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-850 dark:text-slate-300';
          let budgetTextColors = 'text-slate-900 dark:text-slate-100';

          if (budgetStatus === 'safe') {
            budgetCardClass = 'glass-card-safe border-emerald-500/30 dark:border-emerald-500/20';
            statusLabel = 'Orçamento Saudável';
            statusBadgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
          } else if (budgetStatus === 'warning') {
            budgetCardClass = 'glass-card-warning border-amber-500/30 dark:border-amber-500/20';
            statusLabel = 'Limite Próximo';
            statusBadgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
          } else if (budgetStatus === 'danger') {
            budgetCardClass = 'glass-card-danger border-red-500/40 dark:border-red-500/30 shadow-lg shadow-red-500/5';
            statusLabel = 'Orçamento Estourado';
            statusBadgeClass = 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-350';
            budgetTextColors = 'text-red-650 dark:text-red-400';
          }

          return (
            <section className={`glass-card p-6 rounded-3xl shadow-md transition-all duration-300 flex flex-col justify-between h-full min-h-[160px] ${budgetCardClass}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] md:text-xs font-black uppercase tracking-widest flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Calendar className="w-4 h-4" /> Orçamento Mensal ({capitalize(currentMonthName)})
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${statusBadgeClass}`}>
                  {statusLabel}
                </span>
              </div>
              <div className="mt-2">
                <p className={`text-3xl font-black truncate ${budgetTextColors}`}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budgetData.monthly.spent)}
                </p>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 truncate mt-1">
                  de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budgetData.monthly.limit)} limite
                </p>
              </div>
              <div className="mt-4 w-full">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 mb-1">
                  <span>Uso do Limite</span>
                  <span className={`${budgetStatus === 'danger' ? 'text-red-500 font-black' : budgetStatus === 'warning' ? 'text-amber-600 dark:text-amber-400 font-black' : 'text-emerald-600 dark:text-emerald-400 font-black'}`}>
                    {budgetData.monthly.percentUsed.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${budgetStatus === 'danger' ? 'bg-red-550' : budgetStatus === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, budgetData.monthly.percentUsed)}%` }} />
                </div>
              </div>
            </section>
          );
        })()}
      </div>

      

      {/* 📊 GRID DE KPIS (METRICAS DO DIA/MÊS) NO TOPO */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-6">
        
        {/* Ticket Médio (Hoje) */}
        <div className={`glass-card p-6 rounded-3xl shadow-sm flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 cursor-pointer ${themeCardClass}`}>
          <div>
            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl w-fit mb-4">
              <DollarSign className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-widest">
              Ticket Médio (Hoje)
            </p>
            <p className="text-xl xl:text-2xl font-black text-slate-900 dark:text-slate-100 mt-1 truncate" title={liveSalesData !== null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(liveSalesData.qtdVendas > 0 ? liveSalesData.totalSales / liveSalesData.qtdVendas : 0) : ''}>
              {liveSalesData !== null 
                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(liveSalesData.qtdVendas > 0 ? liveSalesData.totalSales / liveSalesData.qtdVendas : 0)
                : <span className="text-slate-350 animate-pulse text-lg">...</span>
              }
            </p>
          </div>
        </div>

        {/* Total de Tickets (Hoje) */}
        <div className={`glass-card p-6 rounded-3xl shadow-sm flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 cursor-pointer ${themeCardClass}`}>
          <div>
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl w-fit mb-4">
              <Ticket className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-555 uppercase tracking-widest">
              Total de Tickets (Hoje)
            </p>
            <p className="text-xl xl:text-2xl font-black text-slate-900 dark:text-slate-100 mt-1 truncate">
              {liveSalesData !== null 
                ? `${liveSalesData.qtdVendas} vendas`
                : <span className="text-slate-350 animate-pulse text-lg">...</span>
              }
            </p>
          </div>
        </div>

        {/* Vencimentos / Faltas */}
        {(() => {
          const isVencimentoCard = isAdmin;
          let cardStyles = themeCardClass;
          let iconStyles = "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-650 dark:text-indigo-400";
          let textColors = "text-slate-900 dark:text-slate-100";
          
          if (isVencimentoCard && budgetData && budgetData.currentWeek.status !== 'no-budget') {
            if (budgetData.currentWeek.status === 'safe') {
              cardStyles = "glass-card-safe";
              iconStyles = "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400";
            } else if (budgetData.currentWeek.status === 'warning') {
              cardStyles = "glass-card-warning";
              iconStyles = "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-450";
            } else if (budgetData.currentWeek.status === 'danger') {
              cardStyles = "glass-card-danger";
              iconStyles = "bg-red-55 dark:bg-red-900/20 text-red-650 dark:text-red-400 animate-pulse";
              textColors = "text-red-655 dark:text-red-400";
            }
          }
          
          return (
            <div className={`glass-card p-6 rounded-3xl shadow-sm transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 cursor-pointer ${cardStyles}`}>
              <div className={`p-2 rounded-xl w-fit mb-4 ${iconStyles}`}>
                {isAdmin ? <Receipt className="w-6 h-6" /> : <ClipboardList className="w-6 h-6" />}
              </div>
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {isAdmin ? `Vencimentos em ${capitalize(currentMonthName)}` : 'Produtos em Falta'}
              </p>
              <p className={`text-xl xl:text-2xl font-black mt-1 truncate ${textColors}`} title={isAdmin ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSpentThisMonth) : ''}>
                {isAdmin 
                  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSpentThisMonth)
                  : shortages.length
                }
              </p>
            </div>
          );
        })()}

        <div className={`glass-card p-6 rounded-3xl shadow-sm transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 cursor-pointer ${overdueCount > 0 ? 'bg-red-500/10 border-red-500/30' : themeCardClass}`}>
          <div className={`p-2 rounded-xl w-fit mb-4 ${overdueCount > 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-650 dark:text-red-400 animate-pulse' : 'bg-slate-50 dark:bg-slate-800 text-slate-400'}`}>
            <AlertCircle className="w-6 h-6" />
          </div>
          <p className={`text-[10px] font-black uppercase tracking-widest ${overdueCount > 0 ? 'text-red-800 dark:text-red-300' : 'text-slate-400 dark:text-slate-500'}`}>Pedidos em Atraso</p>
          <p className={`text-xl xl:text-2xl font-black mt-1 truncate ${overdueCount > 0 ? 'text-red-600 dark:text-red-450' : 'text-slate-900 dark:text-slate-100'}`}>{overdueCount}</p>
        </div>

        <div className={`glass-card p-6 rounded-3xl shadow-sm transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 cursor-pointer ${themeCardClass}`}>
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl w-fit mb-4">
            <Store className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Distribuidora Ativa</p>
          <p className="text-lg font-black text-slate-900 dark:text-slate-100 truncate mt-1 uppercase tracking-tight" title={topDistributor}>{topDistributor}</p>
        </div>

        <div className={`glass-card p-6 rounded-3xl shadow-sm transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 cursor-pointer ${themeCardClass}`}>
          <div className="p-2 bg-red-55 dark:bg-red-900/20 text-red-650 dark:text-red-400 rounded-xl w-fit mb-4">
            <Pill className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total de Pedidos</p>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">{orders.length}</p>
        </div>
      </div>
      
      {/* 📦 LAYOUT DE DESTAQUES DE VENDAS E GIRO CRÍTICO LADO A LADO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Destaques de Vendas (Top 3) */}
        <section className={`lg:col-span-5 glass-card rounded-[2.5rem] p-6 shadow-sm flex flex-col justify-between space-y-4 hover:border-blue-500/35 hover:shadow-blue-500/5 ${themeCardClass}`}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black text-blue-800 dark:text-blue-450 uppercase tracking-widest flex items-center gap-1.5">
                <Award className="w-4 h-4 text-blue-500" />
                Destaques de Vendas
              </h2>
              <button
                onClick={() => setShowAbcModal(true)}
                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] px-2.5 py-1.5 rounded-full uppercase tracking-wider shadow-sm transition-all cursor-pointer border-none"
              >
                <List className="w-3 h-3" />
                Curva ABC
              </button>
            </div>

            <div className="flex justify-between items-center bg-white/60 dark:bg-slate-900/60 p-0.5 rounded-full border border-blue-500/10">
              <button
                onClick={() => setTopPeriod('day')}
                className={`flex-1 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border-none cursor-pointer ${
                  topPeriod === 'day'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-slate-655 dark:text-slate-400 hover:text-blue-655'
                }`}
              >
                Dia
              </button>
              <button
                onClick={() => setTopPeriod('month')}
                className={`flex-1 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border-none cursor-pointer ${
                  topPeriod === 'month'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-slate-655 dark:text-slate-400 hover:text-blue-655'
                }`}
              >
                Mês
              </button>
              <button
                onClick={() => setTopPeriod('semester')}
                className={`flex-1 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border-none cursor-pointer ${
                  topPeriod === 'semester'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-slate-655 dark:text-slate-400 hover:text-blue-655'
                }`}
              >
                Semestre
              </button>
            </div>
          </div>

          {loadingTopProducts ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 flex-1">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase">Calculando...</span>
            </div>
          ) : topProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 flex-1">
              <span className="text-[11px] font-bold text-slate-450 dark:text-slate-500 italic">Nenhuma venda neste período.</span>
            </div>
          ) : (
            <div className="space-y-3 flex-1 flex flex-col justify-center">
              {topProducts.map((product, index) => {
                const formattedValor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.totalValor);
                const medalIcons = ['🥇', '🥈', '🥉'];
                const rankColors = [
                  'bg-amber-100 dark:bg-amber-955/45 text-amber-700 dark:text-amber-400 border border-amber-250 dark:border-amber-900/60',
                  'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-350 border border-slate-200 dark:border-slate-700',
                  'bg-amber-50 dark:bg-amber-955/20 text-amber-800 dark:text-amber-500 border border-amber-100/60 dark:border-amber-900/30'
                ];

                return (
                  <div 
                    key={product.id}
                    className="flex items-center gap-3 bg-white dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/80 rounded-[1.5rem] p-3 hover:border-blue-500/30 dark:hover:border-blue-500/30 hover:shadow-sm transition-all duration-300"
                  >
                    {/* Medalha / Posição */}
                    <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-lg font-black ${rankColors[index] || ''}`}>
                      {medalIcons[index] || `${index + 1}º`}
                    </div>

                    {/* Informações Relevantes */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[11px] font-black text-slate-850 dark:text-slate-200 uppercase tracking-tight truncate" title={product.name}>
                        {product.name}
                      </h4>
                      <p className="text-[9px] text-slate-400 dark:text-slate-550 font-bold uppercase truncate mt-0.5">
                        {product.presentation || 'Sem Apresentação'}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[9px] font-bold text-slate-500 dark:text-slate-450">
                        <span>Qtd: <span className="text-slate-800 dark:text-slate-200 font-black">{product.quantidade} un</span></span>
                        <span className="w-0.5 h-0.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
                        <span>Faturamento: <span className="text-slate-900 dark:text-slate-100 font-black">{formattedValor}</span></span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Giro Crítico (Inativos > 90 dias) */}
        <section 
          className={`lg:col-span-7 relative group/giro glass-card rounded-[2.5rem] p-6 shadow-sm overflow-hidden flex flex-col justify-between hover:border-amber-500/35 hover:shadow-amber-500/5 ${themeCardClass}`}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <div>
              <h2 className="text-xs font-black text-amber-800 dark:text-amber-450 uppercase tracking-widest flex items-center gap-1.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                </span>
                Giro Crítico: Inativos (&gt; 90 dias)
              </h2>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="bg-white/60 dark:bg-slate-900/60 border border-amber-500/20 px-2 py-0.5 rounded-full text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                {inactiveProducts.length} itens
              </span>
              <button
                onClick={handleOpenAllInactiveModal}
                className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-bold text-[9px] px-2.5 py-1.5 rounded-full uppercase tracking-wider shadow-sm transition-all cursor-pointer border-none"
              >
                <List className="w-3 h-3" />
                Ver Todos
              </button>
            </div>
          </div>

          {loadingInactive ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 flex-1">
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
              <span className="text-[10px] font-bold text-slate-550 dark:text-slate-450 uppercase">Carregando estoque...</span>
            </div>
          ) : inactiveProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 flex-1">
              <span className="text-xs font-bold text-slate-400 italic">Nenhum produto inativo encontrado.</span>
            </div>
          ) : (
            <div className="relative flex-1 flex items-center">
              {/* Botões de Navegação Manual */}
              <div className="absolute left-0 z-10 md:opacity-0 md:group-hover/giro:opacity-100 transition-opacity duration-300">
                <button 
                  onClick={() => inactiveContainerRef.current?.scrollBy({ left: -226, behavior: 'smooth' })}
                  className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-full shadow-lg transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="absolute right-0 z-10 md:opacity-0 md:group-hover/giro:opacity-100 transition-opacity duration-300">
                <button 
                  onClick={() => inactiveContainerRef.current?.scrollBy({ left: 226, behavior: 'smooth' })}
                  className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-full shadow-lg transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Container de Rolagem Horizontal */}
              <div 
                ref={inactiveContainerRef}
                className="flex items-center gap-4 overflow-x-auto scroll-smooth scrollbar-none py-2 pr-12 w-full no-scrollbar"
              >
                {inactiveProducts.slice(0, 20).map((product) => {
                  const formattedVenda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.priceVenda);
                  const formattedCompra = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.priceCompra);
                  
                  return (
                    <div
                      key={product.id}
                      className="w-[210px] shrink-0 bg-white dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/80 rounded-[2rem] p-4 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all duration-300 group/card"
                    >
                      <div>
                        {/* Badge de Inatividade */}
                        <div className="flex justify-between items-center mb-2">
                          <span className="bg-amber-500/10 dark:bg-amber-955/40 text-[9px] font-black text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
                            {product.inactivityDays 
                              ? `${product.inactivityDays} dias`
                              : 'Sem vendas'
                            }
                          </span>
                        </div>

                        {/* Imagem do Produto */}
                        <div className="h-20 w-full bg-white dark:bg-slate-955 rounded-2xl flex items-center justify-center border border-slate-100 dark:border-slate-800/40 overflow-hidden mb-3 relative group-hover/card:scale-[1.02] transition-transform duration-300">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain p-2" />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-700" />
                          )}
                        </div>

                        {/* Detalhes do Produto */}
                        <div className="mb-2">
                          <h3 className="text-[11px] font-black text-slate-900 dark:text-slate-150 uppercase tracking-tight line-clamp-2 min-h-[1.75rem]" title={product.name}>
                            {product.name}
                          </h3>
                          <p className="text-[9px] text-slate-400 dark:text-slate-555 font-bold uppercase truncate mt-0.5">
                            {product.presentation || 'Sem Apresentação'}
                          </p>
                        </div>
                      </div>

                      <div>
                        <div className="border-t border-slate-100 dark:border-slate-800/60 my-2" />
                        <div className="space-y-1 text-[9px] font-bold text-slate-550 dark:text-slate-450">
                          <div className="flex justify-between">
                            <span>Estoque:</span>
                            <span className="text-amber-600 dark:text-amber-400 font-black">{product.saldo} un</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Venda:</span>
                            <span className="text-slate-800 dark:text-slate-200 font-black">{formattedVenda}</span>
                          </div>
                          {isAdmin && (
                            <div className="flex justify-between text-rose-600 dark:text-rose-455 border-t border-dotted border-slate-100 dark:border-slate-800/60 pt-1 mt-1">
                              <span>Compra:</span>
                              <span className="font-black">{formattedCompra}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      

      {overdueOrders.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-6 animate-in fade-in duration-500">
          <h2 className="text-base font-bold text-red-700 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Entregas em Atraso
          </h2>
          <div className="space-y-3">
            {overdueOrders.map(order => (
              <div key={order.id} className="flex justify-between items-center bg-white/60 p-3 rounded-xl border border-red-100">
                <div>
                  <p className="font-bold text-slate-800 text-sm">{order.distributor}</p>
                  <p className="text-xs text-slate-500">
                    Previsão: {new Date(order.arrivalForecast).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <p className="text-xs font-bold text-red-600">Atrasado</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {upcomingOrders.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-3xl p-6 animate-in fade-in duration-500">
          <h2 className="text-base font-bold text-blue-700 mb-4 flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Próximas Entregas
          </h2>
          <div className="space-y-3">
            {upcomingOrders.map(order => (
              <div key={order.id} className="flex justify-between items-center bg-white/60 p-3 rounded-xl border border-blue-100">
                <div>
                  <p className="font-bold text-slate-800 text-sm">{order.distributor}</p>
                  <p className="text-xs text-slate-500">
                    Previsão: {new Date(order.arrivalForecast).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <p className="text-xs font-bold text-blue-600">
                  {Math.ceil((new Date(order.arrivalForecast).getTime() - now.getTime()) / (1000 * 3600 * 24))} dias
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 📊 SEÇÃO DE RELATÓRIOS COM ABAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Principal: Gráficos com Tabs */}
        <div className={`lg:col-span-2 glass-card rounded-3xl shadow-sm overflow-hidden min-w-0 ${themeCardClass}`}>
          {/* Tab Navigation */}
          {user.role !== UserRole.OPERADOR && (
            <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap gap-1.5 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-2xl">
                {[
                  { id: 'evolution' as const, label: 'Evolução', icon: LineChartIcon },
                  { id: 'expenses' as const, label: 'Despesas', icon: BarChart3 },
                  { id: 'sales' as const, label: 'Vendas', icon: TrendingUp },
                  { id: 'payments' as const, label: 'Pagamentos', icon: PieChart },
                ].map(tab => {
                  const TabIcon = tab.icon;
                  const isActive = chartTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setChartTab(tab.id)}
                      className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 border-none cursor-pointer ${
                        isActive
                          ? 'bg-white/65 dark:bg-slate-800/65 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 bg-transparent'
                      }`}
                    >
                      <TabIcon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab Content */}
          <div className="p-4 md:p-6">
            {user.role !== UserRole.OPERADOR ? (
              <div className="h-[260px] md:h-[420px] w-full min-w-0 overflow-hidden">
                {chartTab === 'evolution' && (
                  <FinancialEvolutionChart orders={orders} boletos={boletos} cashClosings={enrichedCashClosings} fixedAccounts={fixedAccounts} />
                )}
                {chartTab === 'expenses' && (
                  <ExpensesChart orders={orders} boletos={boletos} cashClosings={enrichedCashClosings} fixedAccounts={fixedAccounts} />
                )}
                {chartTab === 'sales' && (
                  <SalesChart cashClosings={enrichedCashClosings} />
                )}
                {chartTab === 'payments' && (
                  <PaymentMethodsChart cashClosings={enrichedCashClosings} />
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-slate-400 dark:text-slate-500 text-sm font-medium italic">
                Sem acesso aos relatórios financeiros.
              </div>
            )}
          </div>
        </div>

        {/* Coluna Lateral: Últimas Remessas */}
        <div className={`glass-card p-6 md:p-8 rounded-3xl shadow-sm ${themeCardClass}`}>
          <h2 className="text-xs font-black text-slate-500 dark:text-slate-400 mb-6 flex items-center gap-2 uppercase tracking-widest">
            <ShoppingCart className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            Últimas Remessas
          </h2>
          <div className="space-y-3">
            {orders.slice(0, 5).map((order) => {
               const forecast = new Date(order.arrivalForecast);
               forecast.setHours(0,0,0,0);
               const isDelayed = order.status === OrderStatus.PENDENTE && forecast < now;

               return (
                <div 
                  key={order.id} 
                  onClick={() => setStatusModalOrder(order)}
                  className={`flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700 cursor-pointer ${isDelayed ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      order.status === OrderStatus.ENTREGUE ? 'bg-emerald-500' :
                      order.status === OrderStatus.CANCELADO ? 'bg-slate-300 dark:bg-slate-600' : 
                      isDelayed ? 'bg-red-600 animate-pulse' : 'bg-blue-500'
                    }`} />
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter truncate max-w-[120px]">{order.distributor}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">Previsão: {new Date(order.arrivalForecast).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {isAdmin ? (
                       <p className={`text-sm font-black ${isDelayed ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
                        R$ {order.totalValue.toLocaleString('pt-BR')}
                      </p>
                    ) : (
                      <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">Protegido</span>
                    )}
                  </div>
                </div>
               );
            })}
            {orders.length === 0 && (
              <p className="text-center text-slate-400 py-8 italic text-sm font-medium">Nenhum registro.</p>
            )}
          </div>
        </div>
      </div>
      
      {statusModalOrder && (
        <OrderStatusModal
          user={user}
          order={statusModalOrder}
          onClose={() => setStatusModalOrder(null)}
          onUpdate={onUpdateOrder}
          onUpdateBoletos={onUpdateBoletos}
        />
      )}

      {showAbcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20">
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Award className="w-5 h-5 text-blue-500" />
                  Classificação Curva ABC ({topPeriod === 'day' ? 'Dia Atual' : topPeriod === 'month' ? 'Mês Atual' : 'Semestre'})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Produtos classificados de acordo com a participação faturamento acumulada (Curva A: 80%, B: 15%, C: 5%).
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAbcModal(false);
                  setAbcSearchTerm('');
                }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 rounded-full transition-colors cursor-pointer border-none bg-transparent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, EAN ou curva (A, B, C)..."
                  value={abcSearchTerm}
                  onChange={(e) => setAbcSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>Total: {filteredAbcCurve.length} de {abcCurve.length} produtos vendidos</span>
              </div>
            </div>

            {/* Modal Body / Table */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-slate-950/10">
              {loadingTopProducts ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Calculando curva...</span>
                </div>
              ) : filteredAbcCurve.length === 0 ? (
                <div className="text-center py-20">
                  <Award className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Nenhum produto encontrado.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200/50 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full border-collapse text-left text-xs text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/60">
                      <tr>
                        <th className="px-6 py-3.5 w-16">Foto</th>
                        <th className="px-6 py-3.5">Produto</th>
                        <th className="px-6 py-3.5 text-center">Curva</th>
                        <th className="px-6 py-3.5 text-center">Qtd Vendida</th>
                        <th className="px-6 py-3.5 text-right">Faturamento</th>
                        <th className="px-6 py-3.5 text-right">Acumulado (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {filteredAbcCurve.map((p) => {
                        const formattedVenda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.totalValor);
                        
                        const curveColors = {
                          A: 'bg-emerald-500/10 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400',
                          B: 'bg-blue-500/10 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400',
                          C: 'bg-slate-500/10 dark:bg-slate-800/40 text-slate-700 dark:text-slate-400'
                        };

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                            {/* Imagem */}
                            <td className="px-6 py-3">
                              <div className="h-10 w-10 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 rounded-xl flex items-center justify-center overflow-hidden">
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-contain p-1" />
                                ) : (
                                  <ImageIcon className="w-5 h-5 text-slate-300 dark:text-slate-700" />
                                )}
                              </div>
                            </td>

                            {/* Informações */}
                            <td className="px-6 py-3">
                              <div className="font-black text-slate-800 dark:text-slate-200 uppercase">{p.name}</div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase mt-0.5">{p.presentation || 'Sem apresentação'}</div>
                              {p.barcode && <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">EAN: {p.barcode}</div>}
                            </td>

                            {/* Curva */}
                            <td className="px-6 py-3 text-center">
                              <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-black uppercase tracking-wider ${curveColors[p.curve] || curveColors.C}`}>
                                {p.curve}
                              </span>
                            </td>

                            {/* Qtd Vendida */}
                            <td className="px-6 py-3 text-center font-black text-slate-700 dark:text-slate-300">
                              {p.quantidade} un
                            </td>

                            {/* Faturamento */}
                            <td className="px-6 py-3 text-right font-black text-slate-900 dark:text-slate-100">
                              {formattedVenda}
                            </td>

                            {/* Participação Acumulada */}
                            <td className="px-6 py-3 text-right font-bold text-slate-500 dark:text-slate-400">
                              {p.cumulativePercentage}%
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
        </div>
      )}

      {showAllInactiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20">
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-amber-500" />
                  Todos os Produtos Parados (&gt; 90 dias)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Listagem completa de produtos inativos em estoque ordenados por investimento parado.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAllInactiveModal(false);
                  setSearchTerm('');
                }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 rounded-full transition-colors cursor-pointer border-none bg-transparent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar produto por nome ou código de barras..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>Total: {filteredProducts.length} de {allInactiveProducts.length} produtos</span>
              </div>
            </div>

            {/* Modal Body / Table */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-slate-950/10">
              {loadingAllInactive ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                  <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Carregando listagem completa...</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-20">
                  <ImageIcon className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Nenhum produto inativo encontrado.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200/50 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full border-collapse text-left text-xs text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/60">
                      <tr>
                        <th className="px-6 py-3.5 w-16">Foto</th>
                        <th className="px-6 py-3.5">Produto</th>
                        <th className="px-6 py-3.5">Dias Parado</th>
                        <th className="px-6 py-3.5 text-center">Estoque</th>
                        <th className="px-6 py-3.5 text-right">Valor Venda</th>
                        {isAdmin && <th className="px-6 py-3.5 text-right">Valor Compra</th>}
                        <th className="px-6 py-3.5 text-right">Total Parado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {filteredProducts.map((p) => {
                        const totalParado = p.saldo * p.priceVenda;
                        
                        const formattedVenda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.priceVenda);
                        const formattedCompra = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.priceCompra);
                        const formattedTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalParado);

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                            {/* Imagem */}
                            <td className="px-6 py-3">
                              <div className="h-10 w-10 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 rounded-xl flex items-center justify-center overflow-hidden">
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-contain p-1" />
                                ) : (
                                  <ImageIcon className="w-5 h-5 text-slate-300 dark:text-slate-700" />
                                )}
                              </div>
                            </td>

                            {/* Informações */}
                            <td className="px-6 py-3">
                              <div className="font-black text-slate-800 dark:text-slate-200 uppercase">{p.name}</div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase mt-0.5">{p.presentation || 'Sem apresentação'}</div>
                              {p.barcode && <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">EAN: {p.barcode}</div>}
                            </td>

                            {/* Dias Parado */}
                            <td className="px-6 py-3">
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
                                <Clock className="w-3 h-3" />
                                {p.inactivityDays ? `${p.inactivityDays} dias` : 'Nunca vendido'}
                              </span>
                            </td>

                            {/* Saldo */}
                            <td className="px-6 py-3 text-center font-black text-slate-700 dark:text-slate-300">
                              {p.saldo} un
                            </td>

                            {/* Preço de Venda */}
                            <td className="px-6 py-3 text-right font-bold text-slate-755 dark:text-slate-350">
                              {formattedVenda}
                            </td>

                            {/* Preço de Compra (Se Admin) */}
                            {isAdmin && (
                              <td className="px-6 py-3 text-right font-bold text-rose-600 dark:text-rose-400">
                                {formattedCompra}
                              </td>
                            )}

                            {/* Total Parado */}
                            <td className="px-6 py-3 text-right font-black text-slate-900 dark:text-slate-100">
                              {formattedTotal}
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
        </div>
      )}

      {/* 🛵 SEÇÃO DE MONITORAMENTO DE DELIVERIES (IA) */}
      <DeliveryWidget onOpenChat={() => onNavigate('whatsapp-vendas')} />

      {/* 🎯 SEÇÃO DE PÓS-VENDA INTELIGENTE NO DASHBOARD */}
      <section className={`glass-card rounded-3xl p-6 shadow-sm space-y-6 ${themeCardClass}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-md shrink-0">
              <CheckCircle2 className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-850 dark:text-slate-250 uppercase tracking-tight">
                🎯 Pós-Venda: Novos Clientes Conquistados (Últimos 7 dias)
              </h2>
              <p className="text-xs text-slate-450 font-medium">
                Lista de clientes recém-cadastrados para contato de pós-venda e agradecimento.
              </p>
            </div>
          </div>

          {newCustomers.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="px-3 py-1.5 text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-250 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Selecionar Todos ({newCustomers.length})
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="px-3 py-1.5 text-[10px] font-black border border-slate-200 dark:border-slate-700 text-slate-500 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Limpar Seleção
              </button>
            </div>
          )}
        </div>

        {loadingPostSales ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-xs font-bold text-slate-400">Verificando novos clientes cadastrados...</p>
          </div>
        ) : newCustomers.length === 0 ? (
          <div className="text-center py-10 bg-slate-50/50 dark:bg-slate-850/20 rounded-2xl border border-slate-150/40 p-6">
            <span className="text-3xl mb-2 block">🎉</span>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-350">Tudo em dia com o pós-venda!</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Nenhum cliente cadastrado nos últimos 7 dias necessita de pós-venda no momento. Bom trabalho de fidelização!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
            {/* Lista com Checkbox */}
            <div className="lg:col-span-2 space-y-3 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
              {newCustomers.map(client => {
                const key = client.id || client.phone;
                const isSelected = selectedClientIds.includes(key);
                const registerDate = client.createdAt ? new Date(client.createdAt).toLocaleDateString('pt-BR') : 'Hoje';
                
                return (
                  <div
                    key={key}
                    onClick={() => toggleClient(key)}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/25 border-blue-200 dark:bg-blue-950/10 dark:border-blue-900/50 shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-150 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleClient(key)}
                        onClick={e => e.stopPropagation()}
                        className="w-4.5 h-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-850 dark:text-slate-100 flex items-center gap-2">
                          {client.name}
                          {client.postSalesStatus === 'Enviado' && (
                            <span className="text-[8px] font-black text-green-650 bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 rounded border border-green-200/20 uppercase tracking-widest">
                              ✓ Enviado
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-slate-400 mt-0.5 font-medium">
                          📱 {client.phone} • Conquistado em {registerDate}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      {client.lastSaleValue ? (
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                            R$ {client.lastSaleValue.toFixed(2)}
                          </span>
                          <span className="text-[9px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider mt-0.5">
                            📦 {client.purchasedProducts?.length || 0} itens
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Sem vendas registradas</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Painel de Texto do Pós-Venda */}
            <div className="bg-slate-50 dark:bg-slate-850/50 p-4.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 dark:text-slate-455 uppercase tracking-widest flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-blue-600" />
                  Mensagem de Pós-Venda:
                </label>
                <textarea
                  required
                  value={postSalesMessage}
                  onChange={e => setPostSalesMessage(e.target.value)}
                  rows={4}
                  placeholder="Mensagem para enviar..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-750 rounded-xl px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-850 dark:text-slate-100 font-medium"
                />
                <span className="block text-[9px] text-slate-400 leading-normal font-medium">
                  Use <code className="text-blue-600 font-black">{'{nome}'}</code> para saudar o cliente pelo nome.
                </span>
              </div>

              <button
                type="button"
                onClick={handleSendPostSales}
                disabled={sendingPostSales || selectedClientIds.length === 0}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-400 dark:disabled:from-slate-800 dark:disabled:to-slate-700 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-sm hover:scale-[1.01] active:scale-[0.99] disabled:scale-100 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {sendingPostSales ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Disparar Pós-Venda ({selectedClientIds.length})
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* RODAPÉ DO DASHBOARD - CONTADOR DE VISITANTES */}
      <footer className="mt-8 pt-6 border-t border-slate-200/80 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-100 dark:border-blue-900/40">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Contador de Visitantes
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Estatísticas de acesso registradas no Dashboard da Belinha
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Visitas Hoje */}
          <div className="flex-1 md:flex-initial bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-2xs">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visitas Hoje</span>
              <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                {visitorStats !== null ? visitorStats.todayVisits.toLocaleString('pt-BR') : '...'}
              </span>
            </div>
          </div>

          {/* Total Acumulado */}
          <div className="flex-1 md:flex-initial bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-2xs">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Acumulado</span>
              <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                {visitorStats !== null ? visitorStats.totalVisits.toLocaleString('pt-BR') : '...'}
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
