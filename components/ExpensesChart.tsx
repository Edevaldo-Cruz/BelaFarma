import React, { useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend
} from 'recharts';
import { Order, Boleto, CashClosingRecord, FixedAccount } from '../types';

interface ExpensesChartProps {
  orders: Order[];
  boletos: Boleto[];
  cashClosings: CashClosingRecord[];
  fixedAccounts: FixedAccount[];
}

const monthsOrder = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export const ExpensesChart: React.FC<ExpensesChartProps> = ({ orders, boletos, cashClosings, fixedAccounts }) => {
  const chartData = useMemo(() => {
    const dataMap: Record<string, { revenue: number, expenses: number }> = {};
    const now = new Date();
    
    // Gerar os últimos 6 meses
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      dataMap[key] = { revenue: 0, expenses: 0 };
    }

    // Processar Receita (CashClosings)
    cashClosings.forEach(closing => {
      const d = new Date(closing.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (dataMap.hasOwnProperty(key)) {
        dataMap[key].revenue += closing.totalSales;
      }
    });

    // Processar Despesas (Boletos)
    boletos.forEach(boleto => {
      const d = new Date(boleto.due_date + 'T00:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (dataMap.hasOwnProperty(key)) {
        dataMap[key].expenses += boleto.value;
      }
    });

    // Processar Despesas (Parcelas de Pedidos)
    orders.forEach(order => {
      if (order.installments && order.installments.length > 0) {
        order.installments.forEach(inst => {
          const d = new Date(inst.dueDate);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (dataMap.hasOwnProperty(key)) {
            dataMap[key].expenses += inst.value;
          }
        });
      }
    });

    // Processar Despesas (Contas Fixas Ativas)
    // Contas fixas são despesas recorrentes, então adicionamos a todos os meses
    fixedAccounts
      .filter(acc => acc.isActive)
      .forEach(acc => {
        Object.keys(dataMap).forEach(key => {
          dataMap[key].expenses += acc.value;
        });
      });

    return Object.entries(dataMap).map(([key, data]) => {
      const [year, month] = key.split('-');
      return {
        name: monthsOrder[parseInt(month) - 1],
        fullName: `${monthsOrder[parseInt(month) - 1]}/${year}`,
        Receita: data.revenue,
        Despesa: data.expenses
      };
    });
  }, [orders, boletos, cashClosings, fixedAccounts]);

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <div className="w-1.5 h-6 bg-red-600 rounded-full" />
            Comparativo Mensal: Receita vs Despesa
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium italic">Visão global dos últimos 6 meses.</p>
        </div>
      </div>

      <div className="h-[350px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }} barGap={8}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 'bold' }} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tickFormatter={(value) => `R$${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} 
              tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 'bold' }} 
            />
            <Tooltip
              cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
              contentStyle={{ 
                borderRadius: '16px', 
                border: '1px solid #e2e8f0', 
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                backgroundColor: '#ffffff',
                color: '#1e293b' 
              }}
              itemStyle={{ fontWeight: 'bold', fontSize: '12px' }}
              formatter={(value: number) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)]}
              labelFormatter={(label, payload) => payload[0]?.payload?.fullName || label}
            />
            <Legend 
              verticalAlign="top" 
              align="right" 
              iconType="circle" 
              wrapperStyle={{ paddingBottom: '20px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }} 
            />
            <Bar dataKey="Receita" fill="#10b981" radius={[4, 4, 0, 0]} barSize={25} />
            <Bar dataKey="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={25} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export default ExpensesChart;
