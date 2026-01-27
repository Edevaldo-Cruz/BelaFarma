
import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Plus, ArrowUpRight, ArrowDownLeft, Trash2, History, Wallet, DollarSign } from 'lucide-react';
import { SafeEntry, User } from '../types';

interface SafeProps {
  user: User;
  onLog: (action: string, details: string) => void;
}

const API_URL = 'http://localhost:3001/api';

export const Safe: React.FC<SafeProps> = ({ user, onLog }) => {
  const [entries, setEntries] = useState<SafeEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ desc: '', val: 0, type: 'Entrada' as 'Entrada' | 'Saída' });
  const [valueInput, setValueInput] = useState('0,00');
  const [toasts, setToasts] = useState<{ id: string, message: string, type: 'success' | 'error' }[]>([]);

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const fetchEntries = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/safe-entries`);
      if (!response.ok) throw new Error('Failed to fetch safe entries');
      const data: SafeEntry[] = await response.json();
      setEntries(data);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const totalBalance = entries.reduce((acc, curr) => acc + (curr.type === 'Entrada' ? curr.value : -curr.value), 0);

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value === '') {
      setFormData(prev => ({ ...prev, val: 0 }));
      setValueInput('0,00');
      return;
    }
    const numericValue = parseInt(value, 10) / 100;
    setFormData(prev => ({ ...prev, val: numericValue }));
    setValueInput(new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericValue));
  };

  const handleAdd = async () => {
    if (!formData.desc || !formData.val) return;

    if (formData.type === 'Saída' && formData.val > totalBalance) {
      showToast('Saldo insuficiente para esta retirada', 'error');
      return;
    }

    const newEntry: SafeEntry = {
      id: `safe_${Date.now()}`,
      date: new Date().toISOString(),
      description: formData.desc,
      type: formData.type,
      value: formData.val,
      userName: user.name
    };

    setEntries(prevEntries => [newEntry, ...prevEntries]);
    setIsModalOpen(false);
    setFormData({ desc: '', val: 0, type: 'Entrada' });
    setValueInput('0,00');

    try {
      const response = await fetch(`${API_URL}/safe-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry),
      });

      if (!response.ok) throw new Error('Failed to save entry');
      onLog(`Movimentação Cofre (${formData.type})`, `Desc: ${formData.desc}, Valor: R$ ${formData.val}`);
      showToast('Movimentação registrada com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      setEntries(prevEntries => prevEntries.filter(entry => entry.id !== newEntry.id));
    }
  };

  const handleDelete = async (id: string) => {
    const originalEntries = [...entries];
    setEntries(prevEntries => prevEntries.filter(entry => entry.id !== id));
    try {
      const response = await fetch(`${API_URL}/safe-entries/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete entry');
      onLog('Remoção Cofre', `Entrada com ID ${id} removida.`);
    } catch (error) {
      console.error(error);
      setEntries(originalEntries);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">COFRE BELA FARMA</h1><p className="text-slate-500 font-medium italic">Gestão de ativos líquidos.</p></div>
        <button 
          onClick={() => {
            setFormData({ desc: '', val: 0, type: 'Entrada' });
            setValueInput('0,00');
            setIsModalOpen(true);
          }} 
          className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-slate-200 dark:shadow-none"
        >
          <Plus className="w-5 h-5" /> Movimentar
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10"><Lock className="w-24 h-24" /></div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50 mb-2">Saldo Atual em Cofre</p>
          <p className="text-4xl font-black tracking-tighter">R$ {totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Entradas</p><p className="text-2xl font-black text-emerald-600">R$ {entries.filter(e => e.type === 'Entrada').reduce((acc, curr) => acc + curr.value, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div><ArrowUpRight className="w-8 h-8 text-emerald-100 dark:text-emerald-900/20" /></div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saídas</p><p className="text-2xl font-black text-red-600">R$ {entries.filter(e => e.type === 'Saída').reduce((acc, curr) => acc + curr.value, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div><ArrowDownLeft className="w-8 h-8 text-red-100 dark:text-red-900/20" /></div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-8 py-6 bg-slate-50/30 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between"><h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><History className="w-4 h-4" /> Movimentações</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-500 font-black text-[10px] uppercase">
                <th className="px-8 py-4">Data</th>
                <th className="px-8 py-4">Descrição</th>
                <th className="px-8 py-4 text-center">Tipo</th>
                <th className="px-8 py-4 text-right">Valor</th>
                <th className="px-8 py-4 text-right">Responsável</th>
                <th className="px-8 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 group transition-colors">
                  <td className="px-8 py-4 text-xs font-bold text-slate-500">{new Date(entry.date).toLocaleDateString('pt-BR')}</td>
                  <td className="px-8 py-4 font-black text-slate-800 dark:text-slate-200 uppercase tracking-tighter">{entry.description}</td>
                  <td className="px-8 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${entry.type === 'Entrada' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {entry.type}
                    </span>
                  </td>
                  <td className={`px-8 py-4 text-right font-black ${entry.type === 'Entrada' ? 'text-emerald-600' : 'text-red-600'}`}>R$ {entry.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase">{entry.userName}</td>
                  <td className="px-8 py-4 text-center">
                    <button onClick={() => handleDelete(entry.id)} className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">Nenhuma movimentação registrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <div className="px-8 py-6 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
              <h2 className="text-xl font-black uppercase tracking-tight dark:text-white">Nova Movimentação</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-600"><Plus className="w-6 h-6 rotate-45" /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setFormData({...formData, type: 'Entrada'})} 
                  className={`p-4 rounded-2xl border-2 font-black text-xs uppercase transition-all ${formData.type === 'Entrada' ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}
                >
                  Depósito
                </button>
                <button 
                  onClick={() => setFormData({...formData, type: 'Saída'})} 
                  className={`p-4 rounded-2xl border-2 font-black text-xs uppercase transition-all ${formData.type === 'Saída' ? 'border-red-600 bg-red-50 dark:bg-red-900/20 text-red-600' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}
                >
                  Retirada
                </button>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Descrição</label>
                <input 
                  type="text" 
                  value={formData.desc} 
                  onChange={(e) => setFormData({...formData, desc: e.target.value})} 
                  className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-bold outline-none uppercase text-slate-900 dark:text-white focus:border-slate-300 dark:focus:border-slate-600 transition-all" 
                  placeholder="Ex: Sangria, Pagamento..." 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Valor Total</label>
                <div className="relative group">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-slate-300 dark:text-slate-600">R$</div>
                  <input 
                    type="text" 
                    value={valueInput} 
                    onChange={handleValueChange} 
                    className="w-full pl-14 pr-6 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-black text-slate-900 dark:text-white text-2xl outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-all" 
                  />
                </div>
              </div>
              <button 
                onClick={handleAdd} 
                disabled={!formData.desc || formData.val <= 0}
                className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
              >
                Lançar Movimentação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Support */}
      <div className="fixed bottom-8 right-8 z-[100] space-y-4">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right duration-500 ${
              toast.type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'
            }`}
          >
            <p className="font-black uppercase text-[10px] tracking-widest">{toast.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
