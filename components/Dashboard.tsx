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
  Loader2
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
import PaymentMethodsChart from './PaymentMethodsChart';
import { GoalPopup } from './GoalPopup';
import { Order, OrderStatus, User, UserRole, ProductShortage, Boleto, BoletoStatus, CashClosingRecord, FixedAccount } from '../types';

interface DashboardProps {
  user: User;
  orders: Order[];
  shortages: ProductShortage[];
  cashClosings: CashClosingRecord[];
  boletos: Boleto[];
  fixedAccounts: FixedAccount[];
  onNavigate: (view: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, orders, shortages, cashClosings, boletos, fixedAccounts, onNavigate }) => {
  const { addToast } = useToast();
  const isAdmin = user.role === UserRole.ADM;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const [iniciandoRadio, setIniciandoRadio] = React.useState(false);
  const [carregandoNoticias, setCarregandoNoticias] = React.useState(false);
  const [lastBackup, setLastBackup] = React.useState<string | null>(null);
  
  const [showGoalPopup, setShowGoalPopup] = React.useState(() => {
    return !sessionStorage.getItem('hasSeenGoalPopup');
  });

  const handleCloseGoalPopup = () => {
    sessionStorage.setItem('hasSeenGoalPopup', 'true');
    setShowGoalPopup(false);
  };

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
          // Os backups já vêm ordenados por data desc no backend
          setLastBackup(new Date(data[0].date).toLocaleString('pt-BR'));
        }
      } catch (e) {
        console.error('Erro ao buscar último backup:', e);
      }
    };
    fetchLastBackup();
  }, []);

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
      {showGoalPopup && (
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
        <div className="flex items-center gap-3">
          {isAdmin && (
            <div className="flex gap-2">
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
          <div className="flex items-center gap-2 text-sm font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-full border border-red-100 dark:border-red-800 shadow-sm w-fit">
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
      
      {/* Quick Actions Section - Dynamic based on usage */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
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

          // Filter by permission and sort by usage
          const visibleShortcuts = allShortcuts
            .filter(s => !s.adminOnly || isAdmin)
            .sort((a, b) => (stats[b.id] || 0) - (stats[a.id] || 0))
            .slice(0, 7); // Show top 7

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
                className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group"
              >
                <div className={`p-3 rounded-2xl mb-2 group-hover:scale-110 transition-transform ${colors.split(' ').slice(0,3).join(' ')}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{s.label}</span>
              </button>
            );
          });
        })()}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl w-fit mb-4">
            {isAdmin ? <TrendingUp className="w-6 h-6" /> : <ClipboardList className="w-6 h-6" />}
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
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[400px]">
          <ExpensesChart orders={orders} boletos={boletos} cashClosings={cashClosings} fixedAccounts={fixedAccounts} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {user.role !== UserRole.OPERADOR && (
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[400px]">
              <SalesChart cashClosings={cashClosings} />
            </div>
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[450px]">
              <PaymentMethodsChart cashClosings={cashClosings} />
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
                <div key={order.id} className={`flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700 ${isDelayed ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      order.status === OrderStatus.ENTREGUE ? 'bg-emerald-500' :
                      order.status === OrderStatus.CANCELADO ? 'bg-slate-300 dark:bg-slate-600' : 
                      isDelayed ? 'bg-red-600 animate-pulse' : 'bg-blue-500'
                    }`} />
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter truncate max-w-[120px]">{order.distributor}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">{order.orderDate}</p>
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

      {/* 🎯 SEÇÃO DE PÓS-VENDA INTELIGENTE NO DASHBOARD */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
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
