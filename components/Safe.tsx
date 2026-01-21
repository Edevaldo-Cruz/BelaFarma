
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

  const fetchEntries = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/safe-entries`);
      if (!response.ok) throw new Error('Failed to fetch safe entries');
      const data: SafeEntry[] = await response.json();
      setEntries(data);
    } catch (error) {
      console.error(error);
      // Aqui você poderia mostrar um toast de erro para o usuário
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const totalBalance = entries.reduce((acc, curr) => acc + (curr.type === 'Entrada' ? curr.value : -curr.value), 0);

  const handleAdd = async () => {
    if (!formData.desc || !formData.val) return;
    const newEntry: SafeEntry = {
      id: `safe_${Date.now()}`,
      date: new Date().toISOString(),
      description: formData.desc,
      type: formData.type,
      value: formData.val,
      userName: user.name
    };

    // Optimistic update
    setEntries(prevEntries => [newEntry, ...prevEntries]);
    setIsModalOpen(false);
    setFormData({ desc: '', val: 0, type: 'Entrada' });

    try {
      const response = await fetch(`${API_URL}/safe-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry),
      });

      if (!response.ok) {
        throw new Error('Failed to save entry');
      }
      
      onLog(`Movimentação Cofre (${formData.type})`, `Desc: ${formData.desc}, Valor: R$ ${formData.val}`);
      
      // Optional: refetch to ensure consistency if optimistic update is not preferred
      // await fetchEntries();

    } catch (error) {
      console.error(error);
      // Revert optimistic update
      setEntries(prevEntries => prevEntries.filter(entry => entry.id !== newEntry.id));
      // Show error toast to user
    }
  };

  const handleDelete = async (id: string) => {
    const originalEntries = [...entries];
    // Optimistic update
    setEntries(prevEntries => prevEntries.filter(entry => entry.id !== id));

    try {
      const response = await fetch(`${API_URL}/safe-entries/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete entry');
      }
      onLog('Remoção Cofre', `Entrada com ID ${id} removida.`);

    } catch (error) {
      console.error(error);
      // Revert optimistic update
      setEntries(originalEntries);
      // Show error toast to user
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-black text-slate-900 uppercase">COFRE BELA FARMA</h1><p className="text-slate-500 font-medium italic">Gestão de ativos líquidos.</p></div>
        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-slate-200">
          <Plus className="w-5 h-5" /> Movimentar
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10"><Lock className="w-24 h-24" /></div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50 mb-2">Saldo Atual em Cofre</p>
          <p className="text-4xl font-black tracking-tighter">R$ {totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Entradas</p><p className="text-2xl font-black text-emerald-600">R$ {entries.filter(e => e.type === 'Entrada').reduce((acc, curr) => acc + curr.value, 0).toLocaleString('pt-BR')}</p></div><ArrowUpRight className="w-8 h-8 text-emerald-100" /></div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saídas</p><p className="text-2xl font-black text-red-600">R$ {entries.filter(e => e.type === 'Saída').reduce((acc, curr) => acc + curr.value, 0).toLocaleString('pt-BR')}</p></div><ArrowDownLeft className="w-8 h-8 text-red-100" /></div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-8 py-6 bg-slate-50/30 border-b border-slate-100 flex items-center justify-between"><h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><History className="w-4 h-4" /> Movimentações</h3></div>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="bg-slate-50/50"><th className="px-8 py-4 text-[10px] font-black uppercase">Data</th><th className="px-8 py-4 text-[10px] font-black uppercase">Descrição</th><th className="px-8 py-4 text-center text-[10px] font-black uppercase">Tipo</th><th className="px-8 py-4 text-right text-[10px] font-black uppercase">Valor</th><th className="px-8 py-4 text-right text-[10px] font-black uppercase">Responsável</th><th className="px-8 py-4 text-center text-[10px] font-black uppercase">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{entries.map((entry) => (<tr key={entry.id} className="hover:bg-slate-50/50 group"><td className="px-8 py-4 text-xs font-bold text-slate-500">{new Date(entry.date).toLocaleDateString('pt-BR')}</td><td className="px-8 py-4 font-black text-slate-800 uppercase tracking-tighter">{entry.description}</td><td className="px-8 py-4 text-center"><span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${entry.type === 'Entrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{entry.type}</span></td><td className={`px-8 py-4 text-right font-black ${entry.type === 'Entrada' ? 'text-emerald-600' : 'text-red-600'}`}>R$ {entry.value.toLocaleString('pt-BR')}</td><td className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase">{entry.userName}</td><td className="px-8 py-4 text-center"><button onClick={() => handleDelete(entry.id)} className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button></td></tr>))}</tbody></table></div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden"><div className="px-8 py-6 bg-slate-50/50 flex items-center justify-between"><h2 className="text-xl font-black uppercase tracking-tight">Nova Movimentação</h2><button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-600"><Plus className="w-6 h-6 rotate-45" /></button></div><div className="p-8 space-y-6"><div className="grid grid-cols-2 gap-4"><button onClick={() => setFormData({...formData, type: 'Entrada'})} className={`p-4 rounded-2xl border-2 font-black text-xs uppercase transition-all ${formData.type === 'Entrada' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-slate-100 text-slate-400'}`}>Depósito</button><button onClick={() => setFormData({...formData, type: 'Saída'})} className={`p-4 rounded-2xl border-2 font-black text-xs uppercase transition-all ${formData.type === 'Saída' ? 'border-red-600 bg-red-50 text-red-600' : 'border-slate-100 text-slate-400'}`}>Retirada</button></div><div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Descrição</label><input type="text" value={formData.desc} onChange={(e) => setFormData({...formData, desc: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold outline-none" placeholder="Ex: Sangria, Pagamento fornecedor..." /></div><div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Valor (R$)</label><input type="number" step="0.01" value={formData.val || ''} onChange={(e) => setFormData({...formData, val: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-slate-900 text-xl outline-none" /></div><button onClick={handleAdd} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all">Lançar Movimentação</button></div></div>
        </div>
      )}
    </div>
  );
};
