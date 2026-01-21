
import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, Calendar, Search } from 'lucide-react';
import { CrediarioRecord } from '../types';

export const CrediarioReport: React.FC = () => {
  const [records, setRecords] = useState<CrediarioRecord[]>([]);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  useEffect(() => {
    const fetchCrediarioRecords = async () => {
      try {
        const response = await fetch('/api/crediario');
        const data = await response.json();
        setRecords(data);
      } catch (error) {
        console.error('Failed to fetch crediario records:', error);
      }
    };
    fetchCrediarioRecords();
  }, []);

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const d = new Date(r.date);
      const inMonth = (d.getMonth() + 1) === filterMonth;
      const inYear = d.getFullYear() === filterYear;
      const inSearch = searchTerm === '' || r.client.toLowerCase().includes(searchTerm.toLowerCase());
      return inMonth && inYear && inSearch;
    });
  }, [records, filterMonth, filterYear, searchTerm]);

  const totalMonthCrediario = useMemo(() => {
    return filteredRecords.reduce((acc, r) => acc + r.value, 0);
  }, [filteredRecords]);

  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    records.forEach(order => {
        const date = new Date(order.date);
        monthSet.add(`${date.getFullYear()}-${date.getMonth()}`);
    });
    return Array.from(monthSet).map(item => {
        const [year, month] = item.split('-');
        return { year: parseInt(year), month: parseInt(month) };
    }).sort((a,b) => b.year - a.year || b.month - a.month);
  }, [records]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
            <CreditCard className="w-8 h-8" />
            Relatório de Crediário
          </h1>
          <p className="text-slate-500 font-bold italic text-sm">Consulte todas as vendas feitas em crediário.</p>
        </div>
        <div className="flex items-center gap-2">
            <select onChange={(e) => {
                const [year, month] = e.target.value.split('-').map(Number);
                setFilterYear(year);
                setFilterMonth(month);
            }} value={`${filterYear}-${filterMonth-1}`} className="px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm">
                {availableMonths.map(({ year, month }) => (
                    <option key={`${year}-${month}`} value={`${year}-${month}`}>
                    {new Date(year, month).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                    </option>
                ))}
            </select>
        </div>
      </header>
      
      <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 flex justify-between items-center">
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Total no Mês</p>
                <p className="text-2xl font-black text-amber-600">{formatCurrency(totalMonthCrediario)}</p>
            </div>
            <div className="relative w-full max-w-xs">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar por cliente..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none"
                />
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-4 text-[10px] font-black uppercase">Data</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase">Cliente</th>
                <th className="px-8 py-4 text-right text-[10px] font-black uppercase">Valor</th>
                <th className="px-8 py-4 text-center text-[10px] font-black uppercase">Atendente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map(record => (
                <tr key={record.id} className="hover:bg-slate-50/50">
                  <td className="px-8 py-4 text-xs font-bold text-slate-500">{new Date(record.date).toLocaleDateString('pt-BR')}</td>
                  <td className="px-8 py-4 font-bold text-slate-800">{record.client}</td>
                  <td className="px-8 py-4 text-right font-black text-amber-600">{formatCurrency(record.value)}</td>
                  <td className="px-8 py-4 text-center text-xs font-semibold text-slate-500">{record.userName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
