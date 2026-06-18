import React, { useState, useEffect, useMemo } from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { Loader2 } from 'lucide-react';

interface PaymentMethodsChartProps {
  // Prop mantida para compatibilidade, mas os dados principais serão carregados via API
  cashClosings?: any[]; 
}

interface PaymentItem {
  name: string;
  value: number;
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b'];

export const PaymentMethodsChart: React.FC<PaymentMethodsChartProps> = () => {
  const [data, setData] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPayments = async () => {
    try {
      const response = await fetch('/api/finance-agent/monthly-payments');
      if (response.status === 503) {
        setError('Servidor Digifarma Offline');
        setData([]);
        return;
      }
      if (!response.ok) throw new Error('Erro ao buscar formas de pagamento');
      
      const rawData = await response.json();
      
      const totals = {
        dinheiro: 0,
        credito: 0,
        debito: 0,
        pix: 0,
        crediario: 0,
        outros: 0
      };

      if (Array.isArray(rawData)) {
        rawData.forEach((item: any) => {
          const typeId = Number(item.TIPO_PAGAMENTO_ID);
          const total = Number(item.TOTAL) || 0;
          const bandeira = String(item.BANDEIRA || '').toUpperCase().trim();

          if (typeId === 1) {
            totals.dinheiro += total;
          } else if (typeId === 4) {
            if (bandeira.includes('DEBITO') || bandeira.includes('DÉBITO')) {
              totals.debito += total;
            } else {
              // Por padrão, cartão é crédito se não for expressamente débito
              totals.credito += total;
            }
          } else if (typeId === 8) {
            totals.pix += total;
          } else if (typeId === 5) {
            totals.crediario += total;
          } else {
            totals.outros += total;
          }
        });
      }

      const formatted = [
        { name: 'Dinheiro', value: totals.dinheiro },
        { name: 'Crédito', value: totals.credito },
        { name: 'Débito', value: totals.debito },
        { name: 'Pix', value: totals.pix },
        { name: 'Crediário', value: totals.crediario },
        { name: 'Outros', value: totals.outros }
      ].filter(item => item.value > 0);

      setData(formatted);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError('Falha ao carregar pagamentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    
    // Atualiza a cada 2 minutos
    const interval = setInterval(fetchPayments, 120000);
    return () => clearInterval(interval);
  }, []);

  const totalValue = useMemo(() => {
    return data.reduce((acc, curr) => acc + curr.value, 0);
  }, [data]);

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
            Distribuição de Pagamentos
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 italic">Vendas acumuladas do mês atual.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-[250px] space-y-2">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-xs font-bold text-slate-400">Carregando dados do Digifarma...</p>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-[250px] text-xs font-black text-red-500 uppercase tracking-widest bg-red-50 dark:bg-red-950/20 rounded-2xl p-4 text-center">
          {error}
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center h-[250px] text-xs font-bold text-slate-400 bg-slate-50 dark:bg-slate-800/20 rounded-2xl">
          Nenhuma venda registrada no mês.
        </div>
      ) : (
        <div style={{ width: '100%', height: '250px' }}>
          <ResponsiveContainer width="100%" height={250} minHeight={250}>
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
      )}
      
      {!loading && !error && data.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total do Mês Atual</p>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
          </p>
        </div>
      )}
    </>
  );
};

export default PaymentMethodsChart;
