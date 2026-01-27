import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { CashClosingRecord } from '../types';

interface SalesChartProps {
  cashClosings: CashClosingRecord[];
}

const SalesChart: React.FC<SalesChartProps> = ({ cashClosings }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    cashClosings.forEach(closing => {
      // Parse safely to avoid timezone issues
      const [y, m, d] = closing.date.split('T')[0].split('-').map(Number);
      // Note: Month in Date object is 0-indexed, but usually stored 1-indexed in strings or handled consistently.
      // Here we will rely on Date object from string for consistency with existing logic, or better:
      // Let's use the Date object to get month index correctly
      const date = new Date(closing.date);
      monthSet.add(`${date.getFullYear()}-${date.getMonth()}`);
    });
    return Array.from(monthSet).map(item => {
        const [year, month] = item.split('-');
        return { year: parseInt(year), month: parseInt(month) };
    }).sort((a,b) => b.year - a.year || b.month - a.month);
  }, [cashClosings]);

  // Auto-select latest month if current selection has no data or initially
  useEffect(() => {
    if (availableMonths.length > 0) {
      const isCurrentValid = availableMonths.some(m => m.year === selectedYear && m.month === selectedMonth);
      if (!isCurrentValid) {
        setSelectedYear(availableMonths[0].year);
        setSelectedMonth(availableMonths[0].month);
      }
    }
  }, [availableMonths, selectedYear, selectedMonth]);

  const monthlySales = useMemo(() => {
    return cashClosings.filter(closing => {
      const closingDate = new Date(closing.date);
      return closingDate.getMonth() === selectedMonth && closingDate.getFullYear() === selectedYear;
    });
  }, [cashClosings, selectedMonth, selectedYear]);

  const salesByDay = useMemo(() => {
    const salesMap = new Map<number, number>();
    monthlySales.forEach(closing => {
      const day = new Date(closing.date).getDate();
      const currentValue = salesMap.get(day) || 0;
      salesMap.set(day, currentValue + closing.totalSales);
    });
    
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const data = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        return {
          name: `${day}`,
          value: salesMap.get(day) || 0,
        };
      });

    return data;
  }, [monthlySales, selectedMonth, selectedYear]);
  
  const totalMonthSales = salesByDay.reduce((acc, curr) => acc + curr.value, 0);
  
  // Calculate Average and Offset for Gradient
  const gradientOffset = useMemo(() => {
    const values = salesByDay.map((i) => i.value);
    const dataMax = Math.max(...values);
    if (dataMax <= 0) return 0;
    
    const avg = totalMonthSales / salesByDay.length;
    
    // Calculate offset: (Max - Avg) / (Max - 0) assuming domain starts at 0
    const off = (dataMax - avg) / dataMax;

    if (isNaN(off) || !isFinite(off)) return 0;
    return Math.max(0, Math.min(1, off));
  }, [salesByDay, totalMonthSales]);

  const average = totalMonthSales / (salesByDay.length || 1);

  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const [year, month] = event.target.value.split('-').map(Number);
    setSelectedYear(year);
    setSelectedMonth(month);
  };

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <div className="w-1.5 h-6 bg-gradient-to-b from-blue-500 to-red-500 rounded-full" />
                Vendas Diárias
            </h2>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-slate-900 dark:text-slate-50 mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalMonthSales)}
              </p>
              <span className="text-xs font-bold text-slate-400">Total Mês</span>
            </div>
        </div>
        <select onChange={handleMonthChange} value={`${selectedYear}-${selectedMonth}`} className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold dark:text-slate-200 outline-none cursor-pointer hover:bg-slate-100 transition-colors">
          {availableMonths.map(({ year, month }) => (
            <option key={`${year}-${month}`} value={`${year}-${month}`}>
              {new Date(year, month).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
            </option>
          ))}
          {availableMonths.length === 0 && (
             <option value={`${selectedYear}-${selectedMonth}`}>
              {new Date(selectedYear, selectedMonth).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
            </option>
          )}
        </select>
      </div>

      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={salesByDay} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="salesChartSplitColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset={gradientOffset} stopColor="#3b82f6" stopOpacity={1} />
                <stop offset={gradientOffset} stopColor="#ef4444" stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 'bold' }} className="text-slate-400 dark:text-slate-500" />
            <YAxis 
                axisLine={false} 
                tickLine={false} 
                tickFormatter={(value) => `R$${value/1000}k`} 
                tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 'bold' }} 
                className="text-slate-400 dark:text-slate-500"
                domain={[0, 'auto']} 
            />
            <Tooltip
              cursor={{ stroke: 'currentColor', strokeWidth: 1, opacity: 0.2 }}
              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              itemStyle={{ fontWeight: 'bold' }}
              formatter={(value: number) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value), 'Vendas']}
              labelFormatter={(label) => `Dia ${label}`}
            />
            <ReferenceLine y={average} label="" stroke="#9ca3af" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Line 
                type="monotone" 
                dataKey="value" 
                name="Vendas" 
                stroke="url(#salesChartSplitColor)" 
                strokeWidth={3} 
                dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} 
                activeDot={{ r: 6 }} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export default SalesChart;