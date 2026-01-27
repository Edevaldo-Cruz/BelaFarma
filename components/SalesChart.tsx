import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CashClosingRecord } from '../types';

interface SalesChartProps {
  cashClosings: CashClosingRecord[];
}

const SalesChart: React.FC<SalesChartProps> = ({ cashClosings }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

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
      salesMap.set(day, currentValue + closing.totalSales); // Using totalSales from CashClosingRecord
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
  
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    cashClosings.forEach(closing => {
        const date = new Date(closing.date);
        monthSet.add(`${date.getFullYear()}-${date.getMonth()}`);
    });
    return Array.from(monthSet).map(item => {
        const [year, month] = item.split('-');
        return { year: parseInt(year), month: parseInt(month) };
    }).sort((a,b) => b.year - a.year || b.month - a.month);
  }, [cashClosings]);


  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const [year, month] = event.target.value.split('-').map(Number);
    setSelectedYear(year);
    setSelectedMonth(month);
  };
  
  const totalMonthSales = salesByDay.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <div className="w-1.5 h-6 bg-emerald-600 rounded-full" />
                Vendas Realizadas (por Dia)
            </h2>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-50 mt-1">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalMonthSales)}
            </p>
        </div>
        <select onChange={handleMonthChange} value={`${selectedYear}-${selectedMonth}`} className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold dark:text-slate-200 outline-none">
          {availableMonths.map(({ year, month }) => (
            <option key={`${year}-${month}`} value={`${year}-${month}`}>
              {new Date(year, month).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
            </option>
          ))}
        </select>
      </div>

      <div className="h-64 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={salesByDay} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 'bold' }} className="text-slate-400 dark:text-slate-500" />
            <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `R$${value/1000}k`} tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 'bold' }} className="text-slate-400 dark:text-slate-500" />
            <Tooltip
              cursor={{ fill: 'currentColor', opacity: 0.1 }}
              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              itemStyle={{ fontWeight: 'bold' }}
              formatter={(value: number) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value), 'Vendas']}
              labelFormatter={(label) => `Dia ${label}`}
            />
            <Line type="monotone" dataKey="value" name="Vendas" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export default SalesChart;