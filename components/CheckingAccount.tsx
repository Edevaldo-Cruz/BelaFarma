
import React, { useState, useEffect, useMemo } from 'react';
import { Banknote, ArrowDown, ArrowUp, Calendar, Filter, DollarSign } from 'lucide-react';
import { User } from '../types';

interface Transaction {
  id: string;
  date: string;
  description: string;
  type: 'Entrada' | 'Saída';
  value: number;
}

interface CheckingAccountProps {
  user: User;
}

export const CheckingAccount: React.FC<CheckingAccountProps> = ({ user }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [transRes, balRes] = await Promise.all([
          fetch('/api/checking-account/transactions'),
          fetch('/api/checking-account/balance'),
        ]);
        const transData = await transRes.json();
        const balData = await balRes.json();
        setTransactions(transData);
        setBalance(balData.balance);
      } catch (error) {
        console.error('Failed to fetch checking account data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const d = new Date(t.date);
      return (d.getMonth() + 1) === filterMonth && d.getFullYear() === filterYear;
    });
  }, [transactions, filterMonth, filterYear]);

  const totalIn = useMemo(() => filteredTransactions.filter(t => t.type === 'Entrada').reduce((acc, curr) => acc + curr.value, 0), [filteredTransactions]);
  const totalOut = useMemo(() => filteredTransactions.filter(t => t.type === 'Saída').reduce((acc, curr) => acc + curr.value, 0), [filteredTransactions]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter">Conta Corrente</h1>
        <p className="text-slate-500 font-medium">Movimentação da conta bancária.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm col-span-1 md:col-span-1">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl w-fit mb-4">
            <DollarSign className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Atual</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(balance)}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl w-fit mb-4">
            <ArrowUp className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Entradas (Mês)</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(totalIn)}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="p-2 bg-red-50 text-red-600 rounded-xl w-fit mb-4">
            <ArrowDown className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Saídas (Mês)</p>
          <p className="text-2xl font-black text-red-600 mt-1">{formatCurrency(totalOut)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Banknote className="w-5 h-5" />
            Extrato
          </h2>
          {/* Add filter controls here if needed */}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Data</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Descrição</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={3} className="text-center py-10">Carregando...</td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-10 text-slate-500">Nenhuma transação neste período.</td></tr>
              ) : (
                filteredTransactions.map(t => (
                  <tr key={t.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{new Date(t.date).toLocaleDateString('pt-BR')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">{t.description}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${t.type === 'Entrada' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {t.type === 'Entrada' ? '+' : '-'} {formatCurrency(t.value)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
