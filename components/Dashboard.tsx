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
  Image as ImageIcon
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
import { Order, OrderStatus, User, UserRole, ProductShortage, Boleto, BoletoStatus, CashClosingRecord, FixedAccount } from '../types';

interface DashboardProps {
  user: User;
  orders: Order[];
  shortages: ProductShortage[];
  cashClosings: CashClosingRecord[];
  boletos: Boleto[];
  fixedAccounts: FixedAccount[];
  onNavigate: (view: any) => void;
  onUpdateOrder: (order: Order) => void;
  onUpdateBoletos: (orderId: string, boletos: Boleto[]) => void;
  isMobile?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, orders, shortages, cashClosings, boletos, fixedAccounts, onNavigate, onUpdateOrder, onUpdateBoletos, isMobile = false }) => {
  const { addToast } = useToast();
  const isAdmin = user.role === UserRole.ADM;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
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

  // Estados para os Produtos Parados > 90 dias e Carrossel Autoplay
  const [inactiveProducts, setInactiveProducts] = React.useState<any[]>([]);
  const [loadingInactive, setLoadingInactive] = React.useState(true);
  const [isPaused, setIsPaused] = React.useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const inactiveContainerRef = React.useRef<HTMLDivElement>(null);

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
      const fakeTodayRecord: CashClosingRecord = {
        id: 'live-today-simulated',
        date: `${todayStr}T12:00:00.000Z`,
        totalSales: liveSalesData.totalSales,
        credit: liveSalesData.credit,
        debit: liveSalesData.debit,
        pix: liveSalesData.pix,
        totalCrediario: liveSalesData.crediario,
        pixDirect: 0,
        notes: 'Simulação Live'
      };
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

  const currentMonthName = now.toLocaleString('pt-BR', { month: 'long' });
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  
  const totalSpentThisMonth = orders.reduce((acc, curr) => {
    if (curr.installments && curr.installments.length > 0) {
      return acc + curr.installments
        .filter(inst => {
          const d = new Date(inst.dueDate);
          return d.toLocaleString('pt-BR', { month: 'long' }).toLowerCase() === currentMonthName.toLowerCase();
        })
        .reduce((sum, inst) => sum + inst.value, 0);
    } else {
      return acc + (curr.paymentMonth.toLowerCase() === currentMonthName.toLowerCase() ? curr.totalValue : 0);
    }
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
    <div className="space-y-8 animate-in fade-in duration-500">
      {!isMobile && showGoalPopup && (
        <GoalPopup 
          cashClosings={cashClosings} 
          onClose={handleCloseGoalPopup} 
        />
      )}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img 
            src="/images/logo-bela-farma.jpg" 
            alt="belinha" 
            className="h-16 w-auto object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tighter">Olá, {user.name.split(' ')[0]}!</h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Resumo operacional belinha.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleIniciarRadio}
                disabled={iniciandoRadio}
                className="flex items-center gap-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-2 rounded-full shadow-md transition-all"
              >
                <Radio className={`w-4 h-4 ${iniciandoRadio ? 'animate-pulse' : ''}`} />
                {iniciandoRadio ? 'Iniciando...' : 'Iniciar Rádio'}
              </button>
              <button
                onClick={handleTocarNoticias}
                disabled={carregandoNoticias}
                className="flex items-center gap-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-full shadow-md transition-all"
              >
                <Megaphone className={`w-4 h-4 ${carregandoNoticias ? 'animate-bounce' : ''}`} />
                {carregandoNoticias ? 'Preparando...' : 'Notícias'}
              </button>
              <button
                onClick={handlePararRadio}
                className="flex items-center gap-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-full shadow-md transition-all"
              >
                <Square className="w-4 h-4" />
                Parar
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-full border border-red-100 dark:border-red-800 shadow-sm w-fit">
            <Calendar className="w-4 h-4" />
            {now.toLocaleDateString('pt-BR')}
          </div>
          {lastBackup && (
            <div className="hidden md:flex items-center gap-2 text-sm font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 rounded-full border border-emerald-100 dark:border-emerald-800 shadow-sm w-fit" title="Último Backup">
              <Database className="w-4 h-4" />
              {lastBackup}
            </div>
          )}
        </div>
      </header>
      
      {/* 📦 CARROSSEL DE PRODUTOS PARADOS (AUTOPLAY 10S) */}
      {!loadingInactive && inactiveProducts.length > 0 && (
        <section 
          className="relative group/giro bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent dark:from-amber-950/20 dark:via-orange-950/5 dark:to-transparent border-2 border-amber-500/20 rounded-[2.5rem] p-6 shadow-sm overflow-hidden"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <div>
              <h2 className="text-sm font-black text-amber-800 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
                Giro Crítico: Produtos Sem Vendas (&gt; 90 dias)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold italic">
                Abaixo estão produtos parados em estoque há mais tempo (ordenados pelo valor de investimento parado).
              </p>
            </div>
            
            <div className="flex items-center gap-1 bg-white/60 dark:bg-slate-900/60 border border-amber-500/20 px-3 py-1 rounded-full text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
              {inactiveProducts.length} produtos
            </div>
          </div>

          {/* Botões de Navegação Manual */}
          <div className="absolute left-2 top-[60%] -translate-y-1/2 z-10 opacity-0 group-hover/giro:opacity-100 transition-opacity duration-300">
            <button 
              onClick={() => inactiveContainerRef.current?.scrollBy({ left: -236, behavior: 'smooth' })}
              className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-full shadow-lg transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="absolute right-2 top-[60%] -translate-y-1/2 z-10 opacity-0 group-hover/giro:opacity-100 transition-opacity duration-300">
            <button 
              onClick={() => inactiveContainerRef.current?.scrollBy({ left: 236, behavior: 'smooth' })}
              className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-full shadow-lg transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Container de Rolagem Horizontal */}
          <div 
            ref={inactiveContainerRef}
            className="flex items-center gap-4 overflow-x-auto scroll-smooth scrollbar-none py-2 pr-12 w-full no-scrollbar"
          >
            {inactiveProducts.map((product) => {
              const formattedVenda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.priceVenda);
              const formattedCompra = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.priceCompra);
              
              return (
                <div
                  key={product.id}
                  className="w-[220px] shrink-0 bg-white dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/80 rounded-[2rem] p-4 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all duration-300 group/card"
                >
                  <div>
                    {/* Badge de Inatividade */}
                    <div className="flex justify-between items-center mb-2">
                      <span className="bg-amber-500/10 dark:bg-amber-950/40 text-[9px] font-black text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        {product.inactivityDays 
                          ? `${product.inactivityDays} dias parado`
                          : 'Nunca vendido'
                        }
                      </span>
                    </div>

                    {/* Imagem do Produto */}
                    <div className="h-24 w-full bg-white dark:bg-slate-950 rounded-2xl flex items-center justify-center border border-slate-100 dark:border-slate-800/40 overflow-hidden mb-3 relative group-hover/card:scale-[1.02] transition-transform duration-300">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain p-2" />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-slate-300 dark:text-slate-700" />
                      )}
                    </div>

                    {/* Detalhes do Produto */}
                    <div className="mb-2">
                      <h3 className="text-xs font-black text-slate-900 dark:text-slate-150 uppercase tracking-tight line-clamp-2 min-h-[2rem]" title={product.name}>
                        {product.name}
                      </h3>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase truncate mt-0.5">
                        {product.presentation || 'Sem Apresentação'}
                      </p>
                    </div>
                  </div>

                  <div>
                    {/* Linha Divisória */}
                    <div className="border-t border-slate-100 dark:border-slate-800/60 my-2" />

                    {/* Valores e Estoque */}
                    <div className="space-y-1 text-[10px] font-bold text-slate-500 dark:text-slate-450">
                      <div className="flex justify-between">
                        <span>Estoque:</span>
                        <span className="text-amber-600 dark:text-amber-400 font-black">{product.saldo} un</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Venda:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-black">{formattedVenda}</span>
                      </div>
                      {isAdmin && (
                        <div className="flex justify-between text-rose-600 dark:text-rose-450 border-t border-dotted border-slate-100 dark:border-slate-800/60 pt-1 mt-1">
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
        </section>
      )}

      {/* ⚡ CARROSSEL DE ATALHOS RÁPIDOS (MANUAL, ORDENADO POR USO PESSOAL) */}
      <section className="relative group">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
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
              { id: 'pix', label: 'Gerador Pix', icon: CreditCard, color: 'emerald' },
            ];

            // Ordena os atalhos: pix sempre em primeiro, depois ordena o resto por uso pessoal
            const otherShortcuts = allShortcuts
              .filter(s => s.id !== 'pix')
              .filter(s => !s.adminOnly || isAdmin)
              .sort((a, b) => (stats[b.id] || 0) - (stats[a.id] || 0));

            const visibleShortcuts = [
              allShortcuts.find(s => s.id === 'pix')!,
              ...otherShortcuts
            ].filter(Boolean); // Exibe todos os atalhos válidos para o usuário!

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

        <div className="absolute right-0 top-1/2 -translate-y-1/2 -mr-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button 
            onClick={() => scrollContainerRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
            className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-red-650 dark:hover:text-red-500 rounded-full shadow-lg transition-colors cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </section>

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        
        {/* Vendas Hoje (Live) Widget */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 rounded-3xl shadow-lg relative overflow-hidden text-white flex flex-col justify-between">
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
            <p className="text-3xl font-black text-white mt-1">
              {liveSalesData !== null 
                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(liveSalesData.totalSales)
                : <span className="text-emerald-200 animate-pulse text-lg">Carregando...</span>
              }
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl w-fit mb-4">
            {isAdmin ? <Receipt className="w-6 h-6" /> : <ClipboardList className="w-6 h-6" />}
          </div>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {isAdmin ? `Vencimentos em ${capitalize(currentMonthName)}` : 'Produtos em Falta'}
          </p>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
            {isAdmin 
              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSpentThisMonth)
              : shortages.length
            }
          </p>
        </div>

        <div className={`p-6 rounded-3xl border shadow-sm transition-all ${overdueCount > 0 ? 'bg-red-50/10 border-red-200 dark:border-red-900/30' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
          <div className={`p-2 rounded-xl w-fit mb-4 ${overdueCount > 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse' : 'bg-slate-50 dark:bg-slate-800 text-slate-400'}`}>
            <AlertCircle className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Pedidos em Atraso</p>
          <p className={`text-2xl font-black mt-1 ${overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>{overdueCount}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl w-fit mb-4">
            <Store className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Distribuidora Ativa</p>
          <p className="text-lg font-black text-slate-900 dark:text-slate-100 truncate mt-1 uppercase tracking-tight" title={topDistributor}>{topDistributor}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl w-fit mb-4">
            <Pill className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total de Pedidos</p>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">{orders.length}</p>
        </div>
      </div>

      {user.role !== UserRole.OPERADOR && (
        <div className="space-y-8">
          <div className="bg-white dark:bg-slate-900 p-4 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[450px] w-full min-w-0 overflow-hidden">
            <FinancialEvolutionChart orders={orders} boletos={boletos} cashClosings={enrichedCashClosings} fixedAccounts={fixedAccounts} />
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[400px] w-full min-w-0 overflow-hidden">
            <ExpensesChart orders={orders} boletos={boletos} cashClosings={enrichedCashClosings} fixedAccounts={fixedAccounts} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {user.role !== UserRole.OPERADOR && (
          <div className="lg:col-span-2 space-y-8 min-w-0 w-full overflow-hidden">
            <div className="bg-white dark:bg-slate-900 p-4 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[400px] w-full min-w-0 overflow-hidden">
              <SalesChart cashClosings={enrichedCashClosings} />
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[450px] w-full min-w-0 overflow-hidden">
              <PaymentMethodsChart cashClosings={enrichedCashClosings} />
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            Últimas Remessas
          </h2>
          <div className="space-y-4">
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
                    <div className={`w-2.5 h-2.5 rounded-full ${
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

      {/* 🎯 SEÇÃO DE PÓS-VENDA INTELIGENTE NO DASHBOARD */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
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
    </div>
  );
};
