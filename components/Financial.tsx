import React, { useState, useMemo } from 'react';
import { Wallet, TrendingUp, Calendar, ArrowUpRight, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Clock, Archive } from 'lucide-react';
import { Order, OrderStatus, Installment, Boleto, BoletoStatus, FixedAccount, User, MonthlyLimit, CashClosingRecord } from '../types';
import { TransactionDetailsModal } from './TransactionDetailsModal';
import { FinancialArchive } from './FinancialArchive';
import { ContasAPagar } from './ContasAPagar';
import { FixedAccountsPage } from './FixedAccountsPage';
import { DaysInDebt } from './DaysInDebt';

interface FinancialProps {
  user: User;
  orders: Order[];
  boletos: Boleto[];
  fixedAccounts: FixedAccount[];
  monthlyLimits: MonthlyLimit[];
  onUpdateBoletoStatus: (boletoId: string, status: BoletoStatus) => void;
  onAddBoleto: (boleto: Partial<Boleto>) => void;
  onUpdateBoleto: (boleto: Boleto) => void;
  onDeleteBoleto: (id: string) => void;
  onLog: (action: string, details: string) => void;
  cashClosings: CashClosingRecord[];
}

type Transaction = Order | Boleto | (FixedAccount & { isFixed: true, targetDate: string });

const monthsOrder = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const Financial: React.FC<FinancialProps> = ({ 
  user, 
  orders, 
  boletos, 
  fixedAccounts, 
  monthlyLimits,
  onUpdateBoletoStatus,
  onAddBoleto,
  onUpdateBoleto,
  onDeleteBoleto,
  onLog,
  cashClosings
}) => {
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailsVisible, setIsDetailsVisible] = useState<Record<string, boolean>>({});
  const [showArchive, setShowArchive] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'payable' | 'fixed' | 'debt'>('overview');

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const getTransactionStatus = (transaction: Transaction): 'pago' | 'pendente' | 'vencido' => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if ('due_date' in transaction) { // Boleto
      const boleto = transaction as Boleto;
      const dueDate = new Date(boleto.due_date + 'T00:00:00');
      dueDate.setHours(0, 0, 0, 0);

      if (boleto.status === BoletoStatus.PAGO) return 'pago';
      if (boleto.status === BoletoStatus.PENDENTE && dueDate < now) return 'vencido';
      return 'pendente';
    } else if ('targetDate' in transaction) {
      return 'pendente';
    } else { // Order
      const order = transaction as Order;
      if (order.status === OrderStatus.ENTREGUE) return 'pago';
      
      const arrivalForecast = new Date(order.arrivalForecast);
      arrivalForecast.setHours(0,0,0,0);

      if (order.status === OrderStatus.PENDENTE && arrivalForecast < now) return 'vencido';
      return 'pendente';
    }
  };

  const { monthlyData, grandTotal } = useMemo(() => {
    const data: Record<string, { total: number; count: number; pending: number; items: Transaction[] }> = {};
    const allItems: Transaction[] = [...orders, ...boletos];

    allItems.forEach(item => {
      let dueDate: Date | null = null;
      let monthName: string;

      if ('due_date' in item) { // Boleto
        dueDate = new Date(item.due_date + 'T00:00:00');
        monthName = capitalize(dueDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }));
      } else if ('installments' in item && item.installments.length > 0) { // Order with installments
        item.installments.forEach(inst => {
          const instDueDate = new Date(inst.dueDate);
          const instMonthName = capitalize(instDueDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }));
          if (!data[instMonthName]) {
            data[instMonthName] = { total: 0, count: 0, pending: 0, items: [] };
          }
          data[instMonthName].total += inst.value;
          data[instMonthName].count += 1;
          data[instMonthName].items.push(item);
          if (item.status === OrderStatus.PENDENTE) {
            data[instMonthName].pending += inst.value;
          }
        });
        return; // Skip to next item
      } else { // Order without installments
        monthName = (item as any).paymentMonth || 'Não Definido';
      }

      if (!data[monthName]) {
        data[monthName] = { total: 0, count: 0, pending: 0, items: [] };
      }
      const value = 'value' in item ? item.value : ('totalValue' in item ? item.totalValue : 0);
      data[monthName].total += value;
      data[monthName].count += 1;
      data[monthName].items.push(item);
      if (getTransactionStatus(item) !== 'pago') {
        data[monthName].pending += value;
      }
    });

    // Integrated Fixed Accounts Projection
    const displayedMonths = Object.keys(data);
    fixedAccounts.filter(acc => acc.isActive).forEach(acc => {
      displayedMonths.forEach(monthYear => {
        const [monthName, yearStr] = monthYear.split(' de ');
        const year = parseInt(yearStr);
        const monthIndex = monthsOrder.indexOf(monthName);
        
        // Construct a virtual date
        const monthPart = String(monthIndex + 1).padStart(2, '0');
        const dayPart = String(acc.dueDay).padStart(2, '0');
        const targetDate = `${year}-${monthPart}-${dayPart}`;
        
        const virtualAcc = { ...acc, isFixed: true as const, targetDate };
        
        data[monthYear].total += acc.value;
        data[monthYear].count += 1;
        data[monthYear].items.push(virtualAcc);
        data[monthYear].pending += acc.value;
      });
    });
    
    const total = Object.values(data).reduce((acc, curr) => acc + curr.total, 0);
    return { monthlyData: data, grandTotal: total };
  }, [orders, boletos, fixedAccounts]);
  
  
  const now = new Date();
  const currentMonthIndex = now.getMonth();
  const currentYear = now.getFullYear();

  const sortedMonths = Object.keys(monthlyData).filter(monthYear => {
      const [monthName, yearStr] = monthYear.split(' de ');
      const year = parseInt(yearStr);
      const monthIndex = monthsOrder.indexOf(monthName);
      return year > currentYear || (year === currentYear && monthIndex >= currentMonthIndex);
  }).sort((a, b) => {
    const [monthA, yearA] = a.split(' de ');
    const [monthB, yearB] = b.split(' de ');
    if (yearA !== yearB) return parseInt(yearA) - parseInt(yearB);
    return monthsOrder.indexOf(monthA) - monthsOrder.indexOf(monthB);
  });
  
  const handleViewDetails = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
  };
  
  const toggleDetails = (month: string) => {
    setIsDetailsVisible(prev => ({...prev, [month]: !prev[month]}));
  }
  
  const handleUpdateAndClose = (boletoId: string, status: BoletoStatus) => {
    onUpdateBoletoStatus(boletoId, status);
    setSelectedTransaction(null);
  }

  if (showArchive) {
    return <FinancialArchive orders={orders} boletos={boletos} onBack={() => setShowArchive(false)} />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {selectedTransaction && (
        <TransactionDetailsModal 
          transaction={selectedTransaction} 
          onClose={() => setSelectedTransaction(null)}
          onUpdateStatus={handleUpdateAndClose}
        />
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Gestão Financeira</h1>
            <p className="text-slate-500 font-medium italic">Visão consolidada e controle de obrigações.</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'overview' && (
            <button onClick={() => setShowArchive(true)} className="flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-xl transition-all">
                <Archive className="w-4 h-4" /> Arquivo
            </button>
          )}
        </div>
      </header>

      <nav className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-2xl w-fit overflow-x-auto no-scrollbar">
        <button 
          onClick={() => setActiveTab('overview')}
          className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'overview' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Visão Geral
        </button>
        <button 
          onClick={() => setActiveTab('payable')}
          className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'payable' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Contas a Pagar
        </button>
        <button 
          onClick={() => setActiveTab('fixed')}
          className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'fixed' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Contas Fixas
        </button>
        <button 
          onClick={() => setActiveTab('debt')}
          className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'debt' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Dias Comprometidos
        </button>
      </nav>

      {activeTab === 'overview' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">

       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-red-600 p-6 rounded-[2rem] text-white shadow-xl shadow-red-100">
          <div className="flex items-center justify-between mb-4">
            <Wallet className="w-8 h-8 opacity-50" />
            <TrendingUp className="w-5 h-5 text-red-200" />
          </div>
          <p className="text-xs font-black uppercase tracking-widest opacity-80">Comprometimento Total</p>
          <p className="text-3xl font-black mt-1">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(grandTotal)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Meses com Vencimentos</p>
          <p className="text-3xl font-black text-slate-900 mt-1">{sortedMonths.length}</p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Média Mensal</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(grandTotal / (sortedMonths.length || 1))}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {sortedMonths.map((month) => {
          const data = monthlyData[month];
          const isVisible = isDetailsVisible[month];
          const itemsByDay = data.items.reduce((acc, item) => {
            let dueDateStr: string;
            if ('due_date' in item) { // Boleto
                dueDateStr = item.due_date;
            } else if ('installments' in item && item.installments.length > 0) { // Order with Installments
                // Find installment for the current month
                const [monthName, year] = month.split(' de ');
                const inst = item.installments.find(i => {
                    const d = new Date(i.dueDate);
                    return d.toLocaleString('pt-BR', {month: 'long'}) === monthName.toLowerCase() && d.getFullYear() === parseInt(year);
                });
                dueDateStr = inst ? inst.dueDate.split('T')[0] : item.orderDate;
            } else if ('targetDate' in item) {
                dueDateStr = (item as any).targetDate;
            } else { // Order without installments
                dueDateStr = item.orderDate;
            }
            if (!acc[dueDateStr]) acc[dueDateStr] = [];
            acc[dueDateStr].push(item);
            return acc;
          }, {} as Record<string, Transaction[]>);

          const sortedDays = Object.keys(itemsByDay).sort();

          return (
            <div key={month} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all border-b-4 border-b-red-500/10">
              {/* Header do Card do Mês */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-50 rounded-2xl">
                    <Calendar className="w-5 h-5 text-slate-400" />
                  </div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">{month}</h3>
                </div>
                <button onClick={() => toggleDetails(month)} className="p-2 text-slate-400 hover:text-red-600 rounded-full">
                  {isVisible ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              </div>
              
              {/* Resumo Financeiro do Mês */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total do Mês</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">R$ {data.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-4 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100/50 dark:border-emerald-900/20">
                  <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest mb-1">Já Pago</p>
                  <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">R$ {(data.total - data.pending).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-4 bg-red-50/50 dark:bg-red-900/10 rounded-2xl border border-red-100/50 dark:border-red-900/20">
                  <p className="text-[10px] font-black text-red-600 dark:text-red-500 uppercase tracking-widest mb-1">A Pagar</p>
                  <p className="text-lg font-black text-red-700 dark:text-red-400">R$ {data.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col justify-center">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Progresso</p>
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{Math.round(((data.total - data.pending) / (data.total || 1)) * 100)}%</p>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-1000 ease-out"
                      style={{ width: `${((data.total - data.pending) / (data.total || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {isVisible && (
                <div className="mt-6 pt-4 border-t border-slate-100 space-y-4">
                   {sortedDays.map(day => (
                       <div key={day}>
                           <p className="font-bold text-sm text-slate-600 mb-2 border-b pb-1">Dia {day.split('-')[2]}</p>
                           {itemsByDay[day].map((item, index) => {
                                const isFixed = 'targetDate' in item;
                                const name = 'distributor' in item ? item.distributor : (isFixed ? `[FIXA] ${(item as any).name}` : (item as any).supplierName);
                                const value = 'value' in item ? item.value : ('totalValue' in item ? item.totalValue : 0);
                                const status = getTransactionStatus(item);

                                let statusClass = '';
                                if (status === 'pago') statusClass = 'bg-emerald-50/80';
                                else if (status === 'vencido') statusClass = 'bg-red-50/80';
                                else statusClass = 'bg-blue-50/80';

                               return (
                                <div key={index} className={`flex items-center justify-between p-2 rounded-lg ${statusClass}`}>
                                  <div>
                                    <p className="font-bold text-xs text-slate-700">{name}</p>
                                    <p className="text-sm font-semibold text-slate-800">
                                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                                    </p>
                                  </div>
                                  <button onClick={() => handleViewDetails(item)} className="text-xs font-bold text-red-600 hover:underline ml-2">
                                    Detalhes
                                  </button>
                                </div>
                               );
                           })}
                       </div>
                   ))}
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
    )}

      {activeTab === 'payable' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <ContasAPagar 
            user={user}
            boletos={boletos}
            orders={orders}
            onUpdateBoletoStatus={onUpdateBoletoStatus}
            onAddBoleto={onAddBoleto}
            onUpdateBoleto={onUpdateBoleto}
            onDeleteBoleto={onDeleteBoleto}
            monthlyLimits={monthlyLimits}
          />
        </div>
      )}

      {activeTab === 'fixed' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <FixedAccountsPage 
            user={user}
            onLog={onLog}
          />
        </div>
      )}

      {activeTab === 'debt' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <DaysInDebt 
            boletos={boletos}
            orders={orders}
            fixedAccounts={fixedAccounts}
            cashClosings={cashClosings}
          />
        </div>
      )}
    </div>
  );
};