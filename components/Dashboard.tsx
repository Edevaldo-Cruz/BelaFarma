
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
  BellRing // Added for Sunday alert
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
}

export const Dashboard: React.FC<DashboardProps> = ({ user, orders, shortages, cashClosings, boletos, fixedAccounts }) => {
  const isAdmin = user.role === UserRole.ADM;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

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
            alt="Bela Farma Sul" 
            className="h-16 w-auto object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tighter">Olá, {user.name.split(' ')[0]}!</h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Resumo operacional Bela Farma - Sul.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-full border border-red-100 dark:border-red-800 shadow-sm w-fit">
          <Calendar className="w-4 h-4" />
          {now.toLocaleDateString('pt-BR')}
        </div>
      </header>

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
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm min-h-[400px] flex flex-col">
          <ExpensesChart orders={orders} boletos={boletos} cashClosings={cashClosings} fixedAccounts={fixedAccounts} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {user.role !== UserRole.OPERADOR && (
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm min-h-[350px] flex flex-col">
              <SalesChart cashClosings={cashClosings} />
            </div>
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm min-h-[350px] flex flex-col">
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
