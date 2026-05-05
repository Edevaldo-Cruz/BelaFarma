
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
  CreditCard
} from 'lucide-react';
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
  const isAdmin = user.role === UserRole.ADM;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const [iniciandoRadio, setIniciandoRadio] = React.useState(false);
  const [lastBackup, setLastBackup] = React.useState<string | null>(null);

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
    try {
      await fetch('/api/radio/noticias-proxy', {
        method: 'POST'
      });
      alert('Boletim de notícias disparado na rádio!');
    } catch (e) {
      console.error('Erro ao tocar notícias:', e);
    }
  };

  const handlePararRadio = async () => {
    try {
      await fetch('/api/radio/parar-proxy', {
        method: 'POST'
      });
      alert('Comando para parar a rádio enviado!');
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
                className="flex items-center gap-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-full shadow-md transition-all"
              >
                <Megaphone className="w-4 h-4" />
                Notícias
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
      
      {/* Quick Actions Section */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <button 
          onClick={() => onNavigate('medication-search')}
          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-900 transition-all group"
        >
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl mb-2 group-hover:scale-110 transition-transform">
            <Pill className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Busca/Venda</span>
        </button>

        <button 
          onClick={() => onNavigate('orders')}
          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900 transition-all group"
        >
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl mb-2 group-hover:scale-110 transition-transform">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Pedidos</span>
        </button>

        <button 
          onClick={() => onNavigate('shortages')}
          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-amber-200 dark:hover:border-amber-900 transition-all group"
        >
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-2xl mb-2 group-hover:scale-110 transition-transform">
            <ClipboardList className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Faltas</span>
        </button>

        {isAdmin && (
          <button 
            onClick={() => onNavigate('cash-closing')}
            className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-900 transition-all group"
          >
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-2xl mb-2 group-hover:scale-110 transition-transform">
              <Lock className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Fechamento</span>
          </button>
        )}

        {isAdmin && (
          <button 
            onClick={() => onNavigate('financial')}
            className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-purple-200 dark:hover:border-purple-900 transition-all group"
          >
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-2xl mb-2 group-hover:scale-110 transition-transform">
              <CreditCard className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Financeiro</span>
          </button>
        )}

        <button 
          onClick={() => onNavigate('task-management')}
          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-red-200 dark:hover:border-red-900 transition-all group"
        >
          <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl mb-2 group-hover:scale-110 transition-transform">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Tarefas</span>
        </button>

        {isAdmin && (
          <button 
            onClick={() => onNavigate('ifood-control')}
            className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-pink-200 dark:hover:border-pink-900 transition-all group"
          >
            <div className="p-3 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 rounded-2xl mb-2 group-hover:scale-110 transition-transform">
              <Smartphone className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">iFood</span>
          </button>
        )}
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
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[350px]">
              <SalesChart cashClosings={cashClosings} />
            </div>
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[350px]">
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
    </div>
  );
};
