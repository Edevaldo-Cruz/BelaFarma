
import React from 'react';
import { User as UserIcon, Bell, Database, PlusSquare, MapPin, Trash2, Download, Cloud } from 'lucide-react';
import { User } from '../types';
import { isAtlasConfigured } from '../lib/mongodb';

interface SettingsProps { user: User; }

export const Settings: React.FC<SettingsProps> = ({ user }) => {
  const handleReset = () => {
    if (confirm('ATENÇÃO: Isso apagará TODOS os registros salvos localmente no navegador. Se o Atlas estiver ativo, os dados na nuvem permanecerão. Deseja continuar?')) {
      localStorage.removeItem('belafarma_orders_db');
      localStorage.removeItem('belafarma_shortages_db');
      localStorage.removeItem('belafarma_closing_history');
      localStorage.removeItem('belafarma_safe_db');
      localStorage.removeItem('belafarma_users_db');
      window.location.reload();
    }
  };

  const handleExport = () => {
    const data = {
      orders: localStorage.getItem('belafarma_orders_db'),
      shortages: localStorage.getItem('belafarma_shortages_db'),
      safe: localStorage.getItem('belafarma_safe_db'),
      history: localStorage.getItem('belafarma_closing_history'),
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `belafarma_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
        <p className="text-slate-500 font-medium">Bela Farma Sul • Painel de Controle</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shadow-sm">
              <UserIcon className="w-6 h-6" />
            </div>
            <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">Perfil de Acesso</h3>
          </div>
          <div className="space-y-4 pt-4 border-t border-slate-50">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identificação</p>
              <p className="text-slate-900 font-bold text-lg capitalize">{user.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nível de Permissão</p>
              <div className="mt-1">
                <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  user.role === 'Administrador' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {user.role}
                </span>
              </div>
            </div>
            <div className="pt-2">
               <div className="flex items-center gap-2 text-slate-400">
                 <MapPin className="w-4 h-4" />
                 <span className="text-xs font-bold">Localidade: Sul (Principal)</span>
               </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shadow-sm">
              <Database className="w-6 h-6" />
            </div>
            <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">Banco de Dados Cloud</h3>
          </div>
          <div className="space-y-4 pt-4 border-t border-slate-50">
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <Cloud className={`w-5 h-5 ${isAtlasConfigured() ? 'text-emerald-500' : 'text-slate-300'}`} />
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400">Cluster Ativo</p>
                <p className="text-sm font-black text-slate-700">BancoBela (MongoDB Atlas)</p>
              </div>
              <div className="ml-auto">
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${isAtlasConfigured() ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                  {isAtlasConfigured() ? 'CONECTADO' : 'OFFLINE'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button 
                onClick={handleExport}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all shadow-md"
              >
                <Download className="w-4 h-4" /> Exportar JSON
              </button>
              <button 
                onClick={handleReset}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-red-100 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-all"
              >
                <Trash2 className="w-4 h-4" /> Reset Local
              </button>
            </div>
            <p className="text-[9px] text-slate-400 font-bold italic uppercase leading-tight">
              Nota: O usuário "{user.name}" está operando no cluster BancoBela. Certifique-se de que a Data API esteja ativa no painel Atlas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
