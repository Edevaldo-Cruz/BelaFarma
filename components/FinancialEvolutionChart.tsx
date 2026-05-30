import React, { useMemo } from 'react';
import { 
  ComposedChart, 
  Line, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend
} from 'recharts';
import { Order, Boleto, CashClosingRecord, FixedAccount } from '../types';

interface FinancialEvolutionChartProps {
  orders: Order[];
  boletos: Boleto[];
  cashClosings: CashClosingRecord[];
  fixedAccounts: FixedAccount[];
}

const monthsOrder = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export const FinancialEvolutionChart: React.FC<FinancialEvolutionChartProps> = ({ orders, boletos, cashClosings, fixedAccounts }) => {
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
        Despesa: data.expenses,
        ReceitaIdeal: data.expenses * 1.20 // 20% de margem
      };
    });
  }, [orders, boletos, cashClosings, fixedAccounts]);

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <div className="w-1.5 h-6 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full" />
            Evolução Financeira
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium italic">Receitas, Despesas e Meta de Lucro (20%).</p>
        </div>
      </div>

      <div style={{ width: '100%', height: '350px' }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={300}>
          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} className="dark:stroke-slate-800" />
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
              cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }}
              contentStyle={{ 
                borderRadius: '16px', 
                border: '1px solid #e2e8f0', 
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                backgroundColor: '#ffffff',
                color: '#1e293b' 
              }}
              itemStyle={{ fontWeight: 'bold', fontSize: '12px' }}
              formatter={(value: number, name: string) => [
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value), 
                name === 'ReceitaIdeal' ? 'Receita Ideal' : name
              ]}
              labelFormatter={(label, payload) => payload[0]?.payload?.fullName || label}
            />
            <Legend 
              verticalAlign="top" 
              align="right" 
              iconType="circle" 
              wrapperStyle={{ paddingBottom: '20px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }} 
            />
            <Area type="monotone" dataKey="Receita" fillOpacity={1} fill="url(#colorRevenue)" stroke="#8b5cf6" strokeWidth={3} />
            <Line type="monotone" dataKey="Despesa" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="ReceitaIdeal" name="Receita Ideal" stroke="#10b981" strokeWidth={3} strokeDasharray="5 5" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export default FinancialEvolutionChart;
