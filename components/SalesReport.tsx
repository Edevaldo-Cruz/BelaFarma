import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  Calendar, 
  Clock, 
  Layers, 
  ArrowRight, 
  DollarSign, 
  ShoppingBag,
  Loader2,
  ChevronRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { useToast } from './ToastContext';

interface CategoriaReport {
  categoria: string;
  total: number;
  quantidade: number;
}

interface HorarioReport {
  hora: number;
  total: number;
  vendas: number;
}

interface SalesReportData {
  categorias: CategoriaReport[];
  horarios: HorarioReport[];
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e', '#a855f7', '#64748b'];

export const SalesReport: React.FC = () => {
  const [data, setData] = useState<SalesReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | '7days' | '30days' | 'month'>('month');
  
  // Custom date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [usingCustomDates, setUsingCustomDates] = useState(false);

  const { addToast } = useToast();

  const getDatesForPeriod = (selectedPeriod: typeof period) => {
    const today = new Date();
    const past = new Date();
    const pad = (num: number) => String(num).padStart(2, '0');
    
    let startStr = '';
    let endStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    if (selectedPeriod === 'today') {
      startStr = endStr;
    } else if (selectedPeriod === '7days') {
      past.setDate(today.getDate() - 7);
      startStr = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`;
    } else if (selectedPeriod === '30days') {
      past.setDate(today.getDate() - 30);
      startStr = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`;
    } else if (selectedPeriod === 'month') {
      startStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
    }

    return { startStr, endStr };
  };

  const fetchReportData = async (start?: string, end?: string) => {
    setLoading(true);
    try {
      let query = '';
      if (start && end) {
        query = `?startDate=${start}&endDate=${end}`;
      } else {
        const { startStr, endStr } = getDatesForPeriod(period);
        query = `?startDate=${startStr}&endDate=${endStr}`;
      }

      const response = await fetch(`/api/finance-agent/sales-report${query}`);
      if (response.status === 503) {
        addToast('O servidor do Digifarma está Offline.', 'error');
        setData(null);
        return;
      }
      if (!response.ok) throw new Error('Falha ao buscar dados');
      
      const reportData = await response.json();
      setData(reportData);
    } catch (err: any) {
      console.error(err);
      addToast('Erro ao carregar o relatório de vendas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!usingCustomDates) {
      fetchReportData();
    }
  }, [period, usingCustomDates]);

  const handleCustomDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      addToast('Por favor, selecione ambas as datas.', 'warning');
      return;
    }
    setUsingCustomDates(true);
    fetchReportData(startDate, endDate);
  };

  const handleResetPeriod = (newPeriod: typeof period) => {
    setUsingCustomDates(false);
    setPeriod(newPeriod);
    setStartDate('');
    setEndDate('');
  };

  // KPI calculations
  const kpis = useMemo(() => {
    if (!data) return { totalVendas: 0, peakHour: 'N/D', topCategory: 'N/D', totalItems: 0, ticketMedio: 0 };

    const totalVendas = data.categorias.reduce((sum, c) => sum + c.total, 0);
    const totalItems = data.categorias.reduce((sum, c) => sum + c.quantidade, 0);
    
    const totalCupons = data.horarios.reduce((sum, h) => sum + h.vendas, 0);
    const ticketMedio = totalCupons > 0 ? totalVendas / totalCupons : 0;

    let maxHora = -1;
    let maxHoraVendas = 0;
    data.horarios.forEach(h => {
      if (h.total > maxHoraVendas) {
        maxHoraVendas = h.total;
        maxHora = h.hora;
      }
    });
    const peakHour = maxHora !== -1 ? `${String(maxHora).padStart(2, '0')}:00` : 'N/D';

    const topCategory = data.categorias.length > 0 ? data.categorias[0].categoria : 'N/D';

    return {
      totalVendas,
      peakHour,
      topCategory,
      totalItems,
      ticketMedio
    };
  }, [data]);

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const categoryChartData = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.categorias].sort((a, b) => b.total - a.total);
    if (sorted.length <= 8) return sorted;

    const top = sorted.slice(0, 7);
    const others = sorted.slice(7);
    const othersTotal = others.reduce((sum, item) => sum + item.total, 0);
    const othersQty = others.reduce((sum, item) => sum + item.quantidade, 0);

    return [
      ...top,
      { categoria: 'Outras', total: othersTotal, quantidade: othersQty }
    ];
  }, [data]);

  const hourlyChartData = useMemo(() => {
    if (!data) return [];
    const hourMap = new Map<number, HorarioReport>();
    data.horarios.forEach(h => hourMap.set(h.hora, h));

    const result = [];
    for (let h = 7; h <= 22; h++) {
      const item = hourMap.get(h);
      result.push({
        hora: `${String(h).padStart(2, '0')}h`,
        total: item ? item.total : 0,
        vendas: item ? item.vendas : 0
      });
    }
    return result;
  }, [data]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-emerald-500" />
            Relatório de Vendas Detalhado
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold italic text-sm">
            Estatísticas do Digifarma sobre categorias de produtos e fluxo de horários.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border-2 border-slate-200/40 dark:border-slate-700/40 shadow-inner">
          <button
            onClick={() => handleResetPeriod('today')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              period === 'today' && !usingCustomDates
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => handleResetPeriod('7days')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              period === '7days' && !usingCustomDates
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            7 Dias
          </button>
          <button
            onClick={() => handleResetPeriod('30days')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              period === '30days' && !usingCustomDates
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            30 Dias
          </button>
          <button
            onClick={() => handleResetPeriod('month')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              period === 'month' && !usingCustomDates
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Mês Atual
          </button>
        </div>
      </header>

      <form onSubmit={handleCustomDateSubmit} className="bg-white dark:bg-slate-900/90 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800/80 p-6 flex flex-wrap items-center gap-4 shadow-sm">
        <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Personalizar Período:
        </span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
          />
          <span className="text-xs font-bold text-slate-400">até</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all"
        >
          Aplicar Filtro
        </button>
      </form>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-slate-500 font-bold">Carregando estatísticas do Digifarma...</p>
        </div>
      ) : !data ? (
        <div className="bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-200 dark:border-amber-900 rounded-[2.5rem] p-12 text-center text-amber-700 dark:text-amber-400 font-bold">
          Nenhum dado encontrado para o período selecionado ou servidor offline.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Faturamento</p>
                <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{formatCurrency(kpis.totalVendas)}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-100 dark:bg-rose-950/30 text-rose-650 dark:text-rose-400 rounded-2xl flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Ticket Médio</p>
                <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{formatCurrency(kpis.ticketMedio)}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Unidades Vendidas</p>
                <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{kpis.totalItems} un</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Hora de Pico</p>
                <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{kpis.peakHour}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Top Categoria</p>
                <p className="text-lg font-black text-slate-900 dark:text-slate-100 truncate w-40 uppercase">{kpis.topCategory}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2.5rem] p-8 shadow-sm">
              <div className="mb-6">
                <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                  Vendas por Categoria
                </h2>
                <p className="text-xs font-bold text-slate-400 italic">Principais divisões de estoque no período.</p>
              </div>
              
              <div style={{ width: '100%', height: '300px' }}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={categoryChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `R$${v}`} />
                    <YAxis dataKey="categoria" type="category" stroke="#94a3b8" fontSize={9} width={90} />
                    <Tooltip
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#fff', color: '#1e293b' }}
                      formatter={(value: number) => [formatCurrency(value), 'Total Vendas']}
                      itemStyle={{ fontWeight: 'bold', fontSize: '11px' }}
                    />
                    <Bar dataKey="total" radius={[0, 8, 8, 0]}>
                      {categoryChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2.5rem] p-8 shadow-sm">
              <div className="mb-6">
                <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                  Fluxo de Vendas por Horário
                </h2>
                <p className="text-xs font-bold text-slate-400 italic">Horários com maior volume financeiro.</p>
              </div>

              <div style={{ width: '100%', height: '300px' }}>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={hourlyChartData} margin={{ left: 10, right: 10, top: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="hora" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#fff', color: '#1e293b' }}
                      formatter={(value: number) => [formatCurrency(value), 'Faturamento']}
                      itemStyle={{ fontWeight: 'bold', fontSize: '11px' }}
                    />
                    <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={3.5} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2.5rem] shadow-sm overflow-hidden">
            <div className="p-6 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Detalhamento por Categoria</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Posição</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Categoria</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Qtd Itens</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Total Vendas</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Percentual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.categorias.map((item, idx) => {
                    const pct = kpis.totalVendas > 0 ? (item.total / kpis.totalVendas) * 100 : 0;
                    return (
                      <tr key={item.categoria} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                        <td className="px-8 py-4 font-black text-slate-400">#{idx + 1}</td>
                        <td className="px-8 py-4 font-black text-slate-800 dark:text-slate-200 uppercase">{item.categoria}</td>
                        <td className="px-8 py-4 text-right font-bold text-slate-500 dark:text-slate-400">{item.quantidade} un</td>
                        <td className="px-8 py-4 text-right font-black text-slate-800 dark:text-slate-200">{formatCurrency(item.total)}</td>
                        <td className="px-8 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SalesReport;
