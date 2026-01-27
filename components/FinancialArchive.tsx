import React, { useState, useMemo } from 'react';
import { Wallet, TrendingUp, Calendar, ArrowUpRight, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { Order, OrderStatus, Installment, Boleto, BoletoStatus } from '../types';

import { TransactionDetailsModal } from './TransactionDetailsModal';

interface FinancialArchiveProps {
  orders: Order[];
  boletos: Boleto[];
  onBack: () => void;
}

type Transaction = Order | Boleto;

export const FinancialArchive: React.FC<FinancialArchiveProps> = ({ orders, boletos, onBack }) => {
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailsVisible, setIsDetailsVisible] = useState<Record<string, boolean>>({});

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const getTransactionStatus = (transaction: Transaction): 'pago' | 'pendente' | 'vencido' => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if ('status' in transaction) { // Boleto
      const boleto = transaction as Boleto;
      const dueDate = new Date(boleto.due_date + 'T00:00:00');
      dueDate.setHours(0, 0, 0, 0);

      if (boleto.status === BoletoStatus.PAGO) return 'pago';
      if (boleto.status === BoletoStatus.PENDENTE && dueDate < now) return 'vencido';
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

  const { monthlyData } = useMemo(() => {
    const data: Record<string, { total: number; count: number; pending: number; items: Transaction[] }> = {};

    const allItems: Transaction[] = [...orders, ...boletos];

    allItems.forEach(item => {
      let dueDate: Date | null = null;
      if ('due_date' in item) { // Boleto
        dueDate = new Date(item.due_date + 'T00:00:00');
      } else if ('installments' in item && item.installments.length > 0) { // Order with installments
        // This logic might need refinement if an order has multiple installments in different months
        dueDate = new Date(item.installments[0].dueDate);
      } else if ('orderDate' in item) { // Order without installments
        dueDate = new Date(item.orderDate);
      }
      
      if (dueDate) {
        const monthName = capitalize(dueDate.toLocaleString('pt-BR', { month: 'long' }));
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
      }
    });
    
    return { monthlyData: data };
  }, [orders, boletos]);
  
  const monthsOrder = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  
  const currentMonthIndex = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // Filter for past months
  const sortedMonths = Object.keys(monthlyData).filter(month => {
      const monthIndex = monthsOrder.indexOf(month);
      // This is a simplification. A more robust solution would also check the year.
      return monthIndex < currentMonthIndex;
  }).sort((a, b) => {
    return monthsOrder.indexOf(a) - monthsOrder.indexOf(b);
  });

  const handleViewDetails = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
  };
  
  const toggleDetails = (month: string) => {
    setIsDetailsVisible(prev => ({...prev, [month]: !prev[month]}));
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {selectedTransaction && (
        <TransactionDetailsModal 
          transaction={selectedTransaction} 
          onClose={() => setSelectedTransaction(null)} 
        />
      )}

      <header className="flex items-center justify-between">
        <div>
            <h1 className="text-2xl font-bold text-slate-900">Arquivo Financeiro</h1>
            <p className="text-slate-500 font-medium">Consulta de meses anteriores.</p>
        </div>
        <button onClick={onBack} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-lg">
            Voltar
        </button>
      </header>

      <div className="space-y-6">
        {sortedMonths.map((month) => {
          const data = monthlyData[month];
          const isVisible = isDetailsVisible[month];
          // Group items by due date
          const itemsByDay = data.items.reduce((acc, item) => {
            const dueDate = 'due_date' in item ? item.due_date : ('installments' in item && item.installments.length > 0 ? item.installments[0].dueDate.split('T')[0] : item.orderDate);
            if (!acc[dueDate]) {
              acc[dueDate] = [];
            }
            acc[dueDate].push(item);
            return acc;
          }, {} as Record<string, Transaction[]>);

          const sortedDays = Object.keys(itemsByDay).sort((a,b) => new Date(a).getTime() - new Date(b).getTime());

          return (
            <div key={month} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all border-b-4 border-b-slate-400/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-50 rounded-2xl">
                    <Calendar className="w-5 h-5 text-slate-400" />
                  </div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">{month}</h3>
                </div>
                <button onClick={() => toggleDetails(month)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">
                  {isVisible ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              </div>
              
              {/* Resumo Financeiro do Mês */}
              <div className="space-y-4">
                 <div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Total Gasto</span>
                    <span className="font-black text-slate-900 text-2xl">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.total)}
                    </span>
                  </div>
                </div>
              </div>

              {isVisible && (
                <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                   <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Lançamentos do Mês</h4>
                   {sortedDays.map(day => (
                       <div key={day}>
                           <p className="font-bold text-sm text-slate-600 mb-2">Dia {new Date(day + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                           {itemsByDay[day].map((item, index) => {
                               const name = 'distributor' in item ? item.distributor : item.supplierName;
                               const value = 'value' in item ? item.value : ('totalValue' in item ? item.totalValue : 0);
                               const status = getTransactionStatus(item);
                                let statusClass = '';

                                if (status === 'pago') {
                                    statusClass = 'bg-emerald-50 text-emerald-700';
                                } else if (status === 'vencido') {
                                    statusClass = 'bg-red-50 text-red-700';
                                } else {
                                    statusClass = 'bg-blue-50 text-blue-700';
                                }

                               return (
                                <div key={index} className={`flex items-center justify-between p-3 rounded-lg ${statusClass}`}>
                                  <div>
                                    <p className="font-bold text-sm">{name}</p>
                                    <p className="text-xs font-medium">
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
  );
};
