
import React, { useState } from 'react';
import { 
  Users as UsersIcon, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  User as UserIcon, 
  Key, 
  X, 
  Save, 
  Lock,
  Loader2
} from 'lucide-react';
import { User, UserRole } from '../types';
import { useToast } from './ToastContext';

interface UsersProps {
  currentUser: User;
  users: User[];
  onAdd: (user: User) => void;
  onDelete: (id: string) => void;
}

export const Users: React.FC<UsersProps> = ({ currentUser, users, onAdd, onDelete }) => {
  const { addToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    role: UserRole.OPERADOR,
    accessKey: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.accessKey) return;

    onAdd({
      id: Math.random().toString(36).substr(2, 9),
      ...formData
    });

    setFormData({ name: '', role: UserRole.OPERADOR, accessKey: '' });
    setIsModalOpen(false);
  };

  const handleDeleteClick = async (userToDelete: User) => {
    if (userToDelete.id === currentUser.id) {
      addToast('Ação Negada: Você não pode excluir seu próprio acesso de administrador enquanto está logado.', 'error');
      return;
    }

    const confirmMsg = `Deseja remover permanentemente o acesso de "${userToDelete.name.toUpperCase()}"? Esta ação não pode ser desfeita no BancoBela.`;
    
    if (window.confirm(confirmMsg)) {
      setIsDeletingId(userToDelete.id);
      try {
        await onDelete(userToDelete.id);
      } finally {
        setIsDeletingId(null);
      }
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter">Gestão de Usuários</h1>
          <p className="text-slate-500 font-medium italic">Controle de acessos e permissões da plataforma Bela Farma.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 active:scale-95"
        >
          <Plus className="w-5 h-5" /> Novo Usuário
        </button>
      </header>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nível de Acesso</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status de Segurança</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${u.role === UserRole.ADM ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                        {u.role === UserRole.ADM ? <ShieldCheck className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                      </div>
                      <span className="font-black text-slate-900 uppercase tracking-tighter">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      u.role === UserRole.ADM ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <div className="px-4 py-1.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center gap-2">
                        <Lock className="w-3 h-3 text-slate-300" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acesso Protegido</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <button 
                        onClick={() => handleDeleteClick(u)}
                        disabled={u.id === currentUser.id || isDeletingId === u.id}
                        className={`p-2 rounded-xl transition-all ${
                          u.id === currentUser.id 
                            ? 'text-slate-200 cursor-not-allowed' 
                            : 'text-slate-300 hover:text-red-600 hover:bg-red-50 active:scale-90'
                        }`}
                        title={u.id === currentUser.id ? "Seu próprio usuário" : "Excluir Usuário"}
                      >
                        {isDeletingId === u.id ? (
                          <Loader2 className="w-5 h-5 animate-spin text-red-600" />
                        ) : (
                          <Trash2 className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-bold italic uppercase tracking-widest text-xs">
                    Nenhum colaborador cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
              <h2 className="text-xl font-black text-red-700 tracking-tight uppercase">Novo Acesso</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-red-700 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Colaborador</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    required
                    type="text"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:bg-white outline-none font-bold"
                    placeholder="Nome completo"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nível de Permissão</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, role: UserRole.OPERADOR})}
                    className={`p-3 rounded-2xl border-2 font-black text-xs uppercase tracking-widest transition-all ${
                      formData.role === UserRole.OPERADOR 
                        ? 'border-red-600 bg-red-50 text-red-600' 
                        : 'border-slate-100 text-slate-400 hover:border-slate-200'
                    }`}
                  >
                    Operador
                  </button>
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, role: UserRole.ADM})}
                    className={`p-3 rounded-2xl border-2 font-black text-xs uppercase tracking-widest transition-all ${
                      formData.role === UserRole.ADM 
                        ? 'border-red-600 bg-red-50 text-red-600' 
                        : 'border-slate-100 text-slate-400 hover:border-slate-200'
                    }`}
                  >
                    Administrador
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Definir Chave de Acesso</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    required
                    type="password"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:bg-white outline-none font-bold"
                    placeholder="••••••••"
                    value={formData.accessKey}
                    onChange={e => setFormData({...formData, accessKey: e.target.value})}
                  />
                </div>
                <p className="text-[9px] text-slate-400 font-bold ml-1 uppercase tracking-tighter italic">DICA: Escolha uma chave segura de uso pessoal.</p>
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-4 bg-red-600 text-white rounded-2xl font-black shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] uppercase tracking-widest"
                >
                  <Save className="w-5 h-5" />
                  Salvar Colaborador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
