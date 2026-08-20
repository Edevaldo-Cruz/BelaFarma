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
    const dataMap: Record<string, { revenue: number, expenses: number, isFuture: boolean, isCurrent: boolean }> = {};
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    
    // Gerar janela de 5 meses: M-2, M-1, M (atual no centro), M+1, M+2
    for (let offset = -2; offset <= 2; offset++) {
      const d = new Date(currentYear, currentMonth + offset, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      dataMap[key] = {
        revenue: 0,
        expenses: 0,
        isFuture: offset > 0,
        isCurrent: offset === 0
      };
    }

    // Processar Receita Realizada (CashClosings) para meses passados e atual
    cashClosings.forEach(closing => {
      const d = new Date(closing.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (dataMap.hasOwnProperty(key) && !dataMap[key].isFuture) {
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

    // Calcular média das receitas dos meses realizados com vendas (> 0)
    const realizedRevenues = Object.values(dataMap)
      .filter(m => !m.isFuture && m.revenue > 0)
      .map(m => m.revenue);
    
    const avgRevenue = realizedRevenues.length > 0
      ? realizedRevenues.reduce((a, b) => a + b, 0) / realizedRevenues.length
      : 0;

    return Object.entries(dataMap).map(([key, data]) => {
      const [year, month] = key.split('-');
      const monthIdx = parseInt(month) - 1;
      const monthName = monthsOrder[monthIdx];
      const displayName = data.isCurrent 
        ? `${monthName} (Atual)` 
        : data.isFuture 
          ? `${monthName} (Prev)` 
          : monthName;

      return {
        key,
        name: displayName,
        shortName: monthName,
        fullName: `${monthsOrder[monthIdx]}/${year}${data.isCurrent ? ' • Mês Atual' : data.isFuture ? ' • Previsão Futura' : ''}`,
        Receita: !data.isFuture ? data.revenue : null,
        ReceitaProjetada: data.isFuture ? avgRevenue : null,
        Despesa: data.expenses,
        ReceitaIdeal: data.expenses * 1.20, // 20% de margem
        isFuture: data.isFuture,
        isCurrent: data.isCurrent
      };
    });
  }, [orders, boletos, cashClosings, fixedAccounts]);

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <div className="w-1.5 h-6 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full" />
            Evolução Financeira (5 Meses)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium italic">
            2 meses anteriores, mês atual centralizado e 2 meses futuros (com projeção de receita pela média).
          </p>
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
              <linearGradient id="colorProjected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} className="dark:stroke-slate-800" />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={({ x, y, payload }) => {
                const isCur = payload.value.includes('Atual');
                const isFut = payload.value.includes('Prev');
                return (
                  <text 
                    x={x} 
                    y={y + 12} 
                    textAnchor="middle" 
                    fill={isCur ? '#8b5cf6' : isFut ? '#ec4899' : '#94a3b8'} 
                    fontSize={12} 
                    fontWeight={isCur ? 'bold' : '600'}
                  >
                    {payload.value}
                  </text>
                );
              }} 
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
              formatter={(value: any, name: string) => {
                if (value === null || value === undefined) return ['-', name];
                const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
                if (name === 'Receita') return [formatted, 'Receita Realizada'];
                if (name === 'ReceitaProjetada') return [formatted, 'Receita Projetada (Média)'];
                if (name === 'ReceitaIdeal') return [formatted, 'Receita Ideal (+20%)'];
                if (name === 'Despesa') return [formatted, 'Despesas Provisionadas'];
                return [formatted, name];
              }}
              labelFormatter={(label, payload) => payload[0]?.payload?.fullName || label}
            />
            <Legend 
              verticalAlign="top" 
              align="right" 
              iconType="circle" 
              wrapperStyle={{ paddingBottom: '20px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }} 
            />
            <Area 
              type="monotone" 
              dataKey="Receita" 
              name="Receita Realizada" 
              fillOpacity={1} 
              fill="url(#colorRevenue)" 
              stroke="#8b5cf6" 
              strokeWidth={3} 
              connectNulls={false}
            />
            <Area 
              type="monotone" 
              dataKey="ReceitaProjetada" 
              name="Receita Projetada (Média)" 
              fillOpacity={1} 
              fill="url(#colorProjected)" 
              stroke="#ec4899" 
              strokeWidth={3} 
              strokeDasharray="4 4"
            />
            <Line 
              type="monotone" 
              dataKey="Despesa" 
              name="Despesas" 
              stroke="#ef4444" 
              strokeWidth={3} 
              dot={{ r: 4 }} 
              activeDot={{ r: 6 }} 
            />
            <Line 
              type="monotone" 
              dataKey="ReceitaIdeal" 
              name="Receita Ideal" 
              stroke="#10b981" 
              strokeWidth={2.5} 
              strokeDasharray="5 5" 
              dot={false} 
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export default FinancialEvolutionChart;

