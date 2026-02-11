
import React from 'react';
import { User as UserIcon, Bell, Database, PlusSquare, MapPin, Trash2, Download, Cloud, ShoppingBag, Percent, Save, CheckCircle2 } from 'lucide-react';
import { User, UserRole, MonthlyLimit } from '../types';
import { isAtlasConfigured } from '../lib/mongodb';
import { MonthlyLimits } from './MonthlyLimits';
import { useToast } from './ToastContext';

interface SettingsProps { 
  user: User;
  limits: MonthlyLimit[];
  onSaveLimit: (limit: MonthlyLimit) => void;
}

export const Settings: React.FC<SettingsProps> = ({ user, limits, onSaveLimit }) => {
  const { addToast } = useToast();
  const [ifoodFee, setIfoodFee] = React.useState('6.5');
  const [ifoodFeeOriginal, setIfoodFeeOriginal] = React.useState('6.5');
  const [ifoodFeeSaving, setIfoodFeeSaving] = React.useState(false);

  React.useEffect(() => {
    if (user.role === UserRole.ADM) {
      fetch('/api/settings/ifood_fee_percent')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.value) {
            setIfoodFee(data.value);
            setIfoodFeeOriginal(data.value);
          }
        })
        .catch(err => console.error('Error fetching iFood fee:', err));
    }
  }, [user.role]);

  const saveIfoodFee = async () => {
    const numVal = parseFloat(ifoodFee);
    if (isNaN(numVal) || numVal < 0 || numVal > 100) {
      addToast('Informe um valor válido entre 0 e 100.', 'warning');
      return;
    }
    setIfoodFeeSaving(true);
    try {
      const res = await fetch('/api/settings/ifood_fee_percent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: String(numVal) }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setIfoodFeeOriginal(String(numVal));
      addToast(`Taxa iFood atualizada para ${numVal}%`, 'success');
    } catch (err) {
      console.error('Error saving iFood fee:', err);
      addToast('Erro ao salvar taxa iFood.', 'error');
    } finally {
      setIfoodFeeSaving(false);
    }
  };
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

      {user.role === UserRole.ADM && (
        <MonthlyLimits limits={limits} onSaveLimit={onSaveLimit} />
      )}

      {/* iFood Fee Configuration */}
      {user.role === UserRole.ADM && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shadow-sm">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">Configurações iFood</h3>
              <p className="text-xs text-slate-400 font-medium">Taxa da operadora aplicada automaticamente nas vendas</p>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-50">
            <div className="flex flex-col sm:flex-row items-end gap-4">
              <div className="flex-1 w-full">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Taxa da Operadora (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={ifoodFee}
                    onChange={(e) => setIfoodFee(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-lg text-red-600 outline-none focus:border-red-500 transition-all pr-12"
                  />
                  <Percent className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-300" />
                </div>
                <p className="text-[10px] text-slate-400 font-medium mt-2 ml-2">
                  Este valor será aplicado automaticamente em todas as vendas iFood registradas.
                </p>
              </div>
              <button
                onClick={saveIfoodFee}
                disabled={ifoodFeeSaving || ifoodFee === ifoodFeeOriginal}
                className="px-6 py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-wide hover:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-red-600/20 whitespace-nowrap"
              >
                {ifoodFeeSaving ? (
                  <><Save className="w-4 h-4 animate-spin" /> Salvando...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Salvar Taxa</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
