import React, { useState } from 'react';
import { 
  Users as UsersIcon, 
  Plus, 
  Trash2, 
  Edit, 
  ShieldCheck, 
  User as UserIcon, 
  Key, 
  X, 
  Save, 
  Lock, 
  Phone, 
  Briefcase, 
  Loader2
} from 'lucide-react';
import { User, UserRole, UserJobRole } from '../types';
import { useToast } from './ToastContext';

interface UsersProps {
  currentUser: User;
  users: User[];
  onAdd: (user: User) => void;
  onUpdate?: (user: User) => void;
  onDelete: (id: string) => void;
}

const JOB_ROLES = [
  UserJobRole.COMPRADOR,
  UserJobRole.CAIXA,
  UserJobRole.FARMACEUTICO,
  UserJobRole.FINANCEIRO,
  UserJobRole.BALCONISTA,
  UserJobRole.GERENTE,
  UserJobRole.OUTRO
];

export const Users: React.FC<UsersProps> = ({ currentUser, users, onAdd, onUpdate, onDelete }) => {
  const { addToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    role: UserRole.OPERADOR,
    jobRole: UserJobRole.CAIXA as string,
    phone: '',
    accessKey: ''
  });

  const handleOpenAddModal = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      role: UserRole.OPERADOR,
      jobRole: UserJobRole.CAIXA,
      phone: '',
      accessKey: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (userToEdit: User) => {
    setEditingUser(userToEdit);
    setFormData({
      name: userToEdit.name,
      role: userToEdit.role,
      jobRole: userToEdit.jobRole || UserJobRole.OUTRO,
      phone: userToEdit.phone || '',
      accessKey: userToEdit.accessKey
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.accessKey) {
      addToast('Preencha o nome e a chave de acesso.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      if (editingUser) {
        const updated: User = {
          ...editingUser,
          name: formData.name,
          role: formData.role,
          jobRole: formData.jobRole,
          phone: formData.phone,
          accessKey: formData.accessKey
        };
        if (onUpdate) {
          await onUpdate(updated);
        }
        addToast(`Usuário "${updated.name}" atualizado com sucesso!`, 'success');
      } else {
        const newUser: User = {
          id: Math.random().toString(36).substr(2, 9),
          name: formData.name,
          role: formData.role,
          jobRole: formData.jobRole,
          phone: formData.phone,
          accessKey: formData.accessKey
        };
        await onAdd(newUser);
        addToast(`Colaborador "${newUser.name}" cadastrado com sucesso!`, 'success');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      addToast('Erro ao salvar usuário.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = async (userToDelete: User) => {
    if (userToDelete.id === currentUser.id) {
      addToast('Ação Negada: Você não pode excluir seu próprio acesso enquanto está logado.', 'error');
      return;
    }

    const confirmMsg = `Deseja remover permanentemente o acesso de "${userToDelete.name.toUpperCase()}"? Esta ação não pode ser desfeita.`;
    
    if (window.confirm(confirmMsg)) {
      setIsDeletingId(userToDelete.id);
      try {
        await onDelete(userToDelete.id);
        addToast(`Usuário "${userToDelete.name}" removido.`, 'info');
      } catch (e) {
        addToast('Erro ao excluir usuário.', 'error');
      } finally {
        setIsDeletingId(null);
      }
    }
  };

  const getJobRoleBadgeClass = (jobRole?: string) => {
    switch (jobRole) {
      case UserJobRole.COMPRADOR:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case UserJobRole.CAIXA:
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case UserJobRole.FARMACEUTICO:
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case UserJobRole.FINANCEIRO:
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case UserJobRole.GERENTE:
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter flex items-center gap-2">
            <UsersIcon className="w-6 h-6 text-red-600" />
            Gestão de Usuários &amp; Funções
          </h1>
          <p className="text-slate-500 font-medium italic text-sm">
            Atribua funções (Comprador, Caixa, Farmacêutico, Financeiro) e controle permissões na Bela Farma.
          </p>
        </div>
        <button 
          onClick={handleOpenAddModal}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 active:scale-95 text-xs uppercase tracking-wider"
        >
          <Plus className="w-4 h-4" /> Novo Colaborador
        </button>
      </header>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse responsive-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Função / Cargo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nível de Acesso</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${u.role === UserRole.ADM ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                        {u.role === UserRole.ADM ? <ShieldCheck className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                      </div>
                      <div>
                        <span className="font-black text-slate-900 uppercase tracking-tight block">{u.name}</span>
                        {u.id === currentUser.id && (
                          <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider block">Você</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black border ${getJobRoleBadgeClass(u.jobRole)}`}>
                      <Briefcase className="w-3 h-3" />
                      {u.jobRole || 'Não Definido'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      u.role === UserRole.ADM ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-600">
                    {u.phone ? (
                      <span className="inline-flex items-center gap-1 text-slate-700 font-bold">
                        <Phone className="w-3.5 h-3.5 text-emerald-500" />
                        {u.phone}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-[11px]">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="inline-flex items-center gap-1 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      <Lock className="w-3 h-3 text-slate-400" />
                      Ativo
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleOpenEditModal(u)}
                        className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                        title="Editar Colaborador"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteClick(u)}
                        disabled={u.id === currentUser.id || isDeletingId === u.id}
                        className={`p-2 rounded-xl transition-all ${
                          u.id === currentUser.id 
                            ? 'text-slate-200 cursor-not-allowed' 
                            : 'text-slate-400 hover:text-red-600 hover:bg-red-50 active:scale-90'
                        }`}
                        title={u.id === currentUser.id ? "Seu próprio usuário" : "Excluir Usuário"}
                      >
                        {isDeletingId === u.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold italic uppercase tracking-widest text-xs">
                    Nenhum colaborador cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Criar / Editar Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
              <h2 className="text-xl font-black text-red-700 tracking-tight uppercase flex items-center gap-2">
                {editingUser ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                {editingUser ? 'Editar Acesso' : 'Novo Acesso'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-red-700 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              {/* Nome */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Colaborador</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    required
                    type="text"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:bg-white outline-none font-bold text-sm"
                    placeholder="Ex: Nayane Cruz"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
              </div>

              {/* Função / Cargo */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Função / Cargo</label>
                <div className="relative">
                  <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <select
                    value={formData.jobRole}
                    onChange={e => setFormData({...formData, jobRole: e.target.value})}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:bg-white outline-none font-bold text-sm cursor-pointer"
                  >
                    {JOB_ROLES.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-slate-400 font-medium ml-1">
                  Define notificações e popups automáticos recebidos pelo usuário.
                </p>
              </div>

              {/* WhatsApp (Opcional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp (Opcional)</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="tel"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:bg-white outline-none font-bold text-sm"
                    placeholder="Ex: 5533999999999"
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
              </div>

              {/* Nível de Permissão */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nível de Acesso no Sistema</label>
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

              {/* Chave de Acesso */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Chave / Senha de Acesso</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    required
                    type="password"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:bg-white outline-none font-bold text-sm"
                    placeholder="••••••••"
                    value={formData.accessKey}
                    onChange={e => setFormData({...formData, accessKey: e.target.value})}
                  />
                </div>
              </div>

              <div className="pt-3">
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-red-600 text-white rounded-2xl font-black shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] uppercase tracking-widest disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingUser ? 'Atualizar Colaborador' : 'Salvar Colaborador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
