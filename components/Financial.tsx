
import React from 'react';
import { Wallet, TrendingUp, Calendar, ArrowUpRight, DollarSign } from 'lucide-react';
import { Order, OrderStatus, Installment } from '../types';

interface FinancialProps {
  orders: Order[];
}

export const Financial: React.FC<FinancialProps> = ({ orders }) => {
  // Função para capitalizar o nome do mês
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // Agrupar dados financeiros por mês baseando-se nas parcelas ou no mês do pedido
  const monthlyData = orders.reduce((acc: Record<string, { total: number, count: number, pending: number }>, curr) => {
    // Se o pedido tiver parcelas (boletos), distribuímos o valor pelos meses de vencimento
    if (curr.installments && curr.installments.length > 0) {
      curr.installments.forEach((inst: Installment) => {
        const dueDate = new Date(inst.dueDate);
        // Garantir que a data é válida antes de formatar
        const monthName = isNaN(dueDate.getTime()) 
          ? (curr.paymentMonth || 'Não Definido')
          : capitalize(dueDate.toLocaleString('pt-BR', { month: 'long' }));

        if (!acc[monthName]) {
          acc[monthName] = { total: 0, count: 0, pending: 0 };
        }
        
        acc[monthName].total += inst.value;
        acc[monthName].count += 1;
        
        if (curr.status === OrderStatus.PENDENTE) {
          acc[monthName].pending += inst.value;
        }
      });
    } else {
      // Caso não tenha parcelas (Pix, Cartão, etc), usa o mês de referência do pedido
      const month = curr.paymentMonth || 'Não Definido';
      if (!acc[month]) {
        acc[month] = { total: 0, count: 0, pending: 0 };
      }
      acc[month].total += curr.totalValue;
      acc[month].count += 1;
      
      if (curr.status === OrderStatus.PENDENTE) {
        acc[month].pending += curr.totalValue;
      }
    }
    return acc;
  }, {});

  const monthsOrder = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
    return monthsOrder.indexOf(a) - monthsOrder.indexOf(b);
  });

  const grandTotal = orders.reduce((acc, curr) => acc + curr.totalValue, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Controle de Gastos</h1>
        <p className="text-slate-500 font-medium">Fluxo de caixa baseado nos vencimentos das parcelas.</p>
      </header>

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedMonths.map((month) => {
          const data = monthlyData[month];
          return (
            <div key={month} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group border-b-4 border-b-red-500/10 hover:border-b-red-500">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-50 rounded-2xl group-hover:bg-red-50 transition-colors">
                    <Calendar className="w-5 h-5 text-slate-400 group-hover:text-red-600" />
                  </div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">{month}</h3>
                </div>
                <ArrowUpRight className="w-5 h-5 text-slate-200 group-hover:text-red-300" />
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Previsão de Saída</span>
                    <span className="font-black text-slate-900">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.total)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-600 rounded-full" 
                      style={{ width: `${Math.min(100, (data.total / (grandTotal || 1)) * 300)}%` }} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase">Compromissos</p>
                    <p className="font-bold text-slate-800">{data.count}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase">A Pagar (Pendente)</p>
                    <p className="font-bold text-red-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.pending)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
