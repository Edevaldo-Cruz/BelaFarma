import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, AlertCircle, Calendar, DollarSign, Activity, History } from 'lucide-react';
import { FixedAccount, User } from '../types';

interface FixedAccountsPageProps {
  user: User;
  onLog: (action: string, details: string) => void;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

export const FixedAccountsPage: React.FC<FixedAccountsPageProps> = ({ user, onLog }) => {
  const [accounts, setAccounts] = useState<FixedAccount[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<{ open: boolean, id: string | null }>({ open: false, id: null });
  const [editingAccount, setEditingAccount] = useState<FixedAccount | null>(null);
  const [formData, setFormData] = useState({ name: '', value: '', dueDay: '', isActive: true });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/fixed-accounts');
      if (!response.ok) throw new Error('Erro ao buscar contas fixas');
      const data = await response.json();
      setAccounts(data);
    } catch (error) {
      showToast('Erro ao carregar contas fixas', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const handleOpenModal = (account?: FixedAccount) => {
    if (account) {
      setEditingAccount(account);
      setFormData({
        name: account.name,
        value: account.value.toString(),
        dueDay: account.dueDay.toString(),
        isActive: account.isActive
      });
    } else {
      setEditingAccount(null);
      setFormData({ name: '', value: '', dueDay: '', isActive: true });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const accountData = {
      id: editingAccount ? editingAccount.id : `fa_${Date.now()}`,
      name: formData.name,
      value: parseFloat(formData.value),
      dueDay: parseInt(formData.dueDay),
      isActive: formData.isActive
    };

    try {
      const method = editingAccount ? 'PUT' : 'POST';
      const url = editingAccount ? `/api/fixed-accounts/${editingAccount.id}` : '/api/fixed-accounts';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountData)
      });

      if (!response.ok) throw new Error('Falha ao salvar conta');

      showToast(`Conta ${editingAccount ? 'atualizada' : 'criada'} com sucesso!`, 'success');
      onLog(editingAccount ? 'Editou Conta Fixa' : 'Criou Conta Fixa', `Conta: ${accountData.name}, Valor: R$ ${accountData.value}`);
      setIsModalOpen(false);
      fetchAccounts();
    } catch (error) {
      showToast('Erro ao salvar conta', 'error');
    }
  };

  const handleDelete = async () => {
    if (!isDeleteModalOpen.id) return;
    try {
      const response = await fetch(`/api/fixed-accounts/${isDeleteModalOpen.id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Falha ao excluir conta');

      showToast('Conta excluída com sucesso!', 'success');
      onLog('Excluiu Conta Fixa', `ID: ${isDeleteModalOpen.id}`);
      setIsDeleteModalOpen({ open: false, id: null });
      fetchAccounts();
    } catch (error) {
      showToast('Erro ao excluir conta', 'error');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase">CONTAS FIXAS</h1>
          <p className="text-slate-500 font-medium italic">Gestão de obrigações recorrentes.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()} 
          className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-slate-200"
        >
          <Plus className="w-5 h-5" /> Adicionar Conta
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10"><DollarSign className="w-24 h-24" /></div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50 mb-2">Total Mensal Ativo</p>
          <p className="text-4xl font-black tracking-tighter">
            R$ {accounts.reduce((acc, curr) => acc + (curr.isActive ? curr.value : 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Contas Registradas</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{accounts.length.toString().padStart(2, '0')}</p>
            </div>
            <Activity className="w-8 h-8 text-slate-100 dark:text-slate-800" />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status Ativo</p>
              <p className="text-2xl font-black text-emerald-600">{accounts.filter(a => a.isActive).length.toString().padStart(2, '0')}</p>
            </div>
            <Check className="w-8 h-8 text-emerald-100 dark:text-emerald-900/30" />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-8 py-6 bg-slate-50/30 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <History className="w-4 h-4" /> Registros de Contas
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                <th className="px-8 py-4 text-[10px] font-black uppercase">Nome</th>
                <th className="px-8 py-4 text-center text-[10px] font-black uppercase">Dia Vento.</th>
                <th className="px-8 py-4 text-center text-[10px] font-black uppercase">Status</th>
                <th className="px-8 py-4 text-right text-[10px] font-black uppercase">Valor</th>
                <th className="px-8 py-4 text-center text-[10px] font-black uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 group">
                  <td className="px-8 py-4 font-black text-slate-800 dark:text-slate-200 uppercase tracking-tighter">{acc.name}</td>
                  <td className="px-8 py-4 text-center text-xs font-bold text-slate-500">{acc.dueDay.toString().padStart(2, '0')}</td>
                  <td className="px-8 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${acc.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500'}`}>
                      {acc.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-right font-black text-slate-900 dark:text-white">
                    R$ {acc.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-8 py-4 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <button onClick={() => handleOpenModal(acc)} className="text-slate-400 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setIsDeleteModalOpen({ open: true, id: acc.id })} className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Nenhuma conta fixa registrada.</p>
                  </td>
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
              <h2 className="text-xl font-black uppercase tracking-tight">{editingAccount ? 'Editar Conta' : 'Nova Conta Fixa'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-600"><Plus className="w-6 h-6 rotate-45" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Nome da Conta</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-bold outline-none uppercase" 
                  placeholder="EX: ALUGUEL, ENERGIA..." 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Valor (R$)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    required
                    value={formData.value}
                    onChange={e => setFormData({...formData, value: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-black text-slate-900 dark:text-white text-xl outline-none" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Dia Vencimento</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="31" 
                    required
                    value={formData.dueDay}
                    onChange={e => setFormData({...formData, dueDay: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-black text-slate-900 dark:text-white text-xl outline-none" 
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, isActive: !formData.isActive})}
                  className={`w-12 h-6 rounded-full transition-colors relative border-2 ${formData.isActive ? 'bg-emerald-500 border-emerald-600' : 'bg-slate-200 border-slate-300 dark:bg-slate-700 dark:border-slate-600'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${formData.isActive ? 'translate-x-6' : ''}`} />
                </button>
                <span className="text-[10px] font-black text-slate-400 uppercase">Conta Ativa</span>
              </div>
              <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all hover:bg-slate-800">
                Salvar Registro
              </button>
            </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center rounded-2xl">
              <AlertCircle className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Excluir Registro?</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Esta ação não pode ser desfeita.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setIsDeleteModalOpen({ open: false, id: null })}
                className="py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-black uppercase text-xs tracking-widest"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDelete}
                className="py-3 bg-red-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-red-200 dark:shadow-none"
              >
                Excluir
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
