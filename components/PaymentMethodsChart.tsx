import React, { useMemo } from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { CashClosingRecord } from '../types';

interface PaymentMethodsChartProps {
  cashClosings: CashClosingRecord[];
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b'];

export const PaymentMethodsChart: React.FC<PaymentMethodsChartProps> = ({ cashClosings }) => {
  const data = useMemo(() => {
    const totals = cashClosings.reduce((acc, curr) => {
      const credit = curr.credit || 0;
      const debit = curr.debit || 0;
      const pix = curr.pix || 0;
      const pixDirect = curr.pixDirect || 0;
      const crediario = curr.totalCrediario || 0;
      
      // Dinheiro é o que sobra do total de vendas após subtrair os meios digitais e crediário
      const cash = curr.totalSales - (credit + debit + pix + pixDirect + crediario);

      acc.dinheiro += Math.max(0, cash);
      acc.credito += credit;
      acc.debito += debit;
      acc.pix += pix;
      acc.pixDirect += pixDirect;
      acc.crediario += crediario;

      return acc;
    }, {
      dinheiro: 0,
      credito: 0,
      debito: 0,
      pix: 0,
      pixDirect: 0,
      crediario: 0
    });

    return [
      { name: 'Dinheiro', value: totals.dinheiro },
      { name: 'Crédito', value: totals.credito },
      { name: 'Débito', value: totals.debito },
      { name: 'Pix', value: totals.pix },
      { name: 'Pix Direto', value: totals.pixDirect },
      { name: 'Crediário', value: totals.crediario }
    ].filter(item => item.value > 0);
  }, [cashClosings]);

  const totalValue = data.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
            Distribuição de Pagamentos
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 italic">Consolidado histórico de vendas.</p>
        </div>
      </div>

      <div className="h-64 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ 
                borderRadius: '16px', 
                border: 'none', 
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                backgroundColor: '#fff',
                color: '#1e293b'
              }}
              itemStyle={{ fontWeight: 'bold', fontSize: '12px' }}
              formatter={(value: number) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)]}
            />
            <Legend 
              verticalAlign="bottom" 
              align="center" 
              iconType="circle"
              wrapperStyle={{ paddingTop: '20px', fontSize: '11px', fontWeight: 'bold' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Consolidado</p>
        <p className="text-xl font-black text-slate-900 dark:text-slate-100">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
        </p>
      </div>
    </>
  );
};

export default PaymentMethodsChart;
