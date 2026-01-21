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
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <div className="w-1.5 h-6 bg-red-600 rounded-full" />
                Vendas Realizadas (por Dia)
            </h2>
            <p className="text-2xl font-black text-slate-900 mt-1">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalMonthSales)}
            </p>
        </div>
        <select onChange={handleMonthChange} value={`${selectedYear}-${selectedMonth}`} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold">
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
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} />
            <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `R$${value/1000}k`} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} />
            <Tooltip
              cursor={{ fill: '#fef2f2' }}
              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              formatter={(value: number) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value), 'Vendas']}
              labelFormatter={(label) => `Dia ${label}`}
            />
            <Line type="monotone" dataKey="value" name="Vendas" stroke="#dc2626" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export default SalesChart;