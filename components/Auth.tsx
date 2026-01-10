
import React, { useState } from 'react';
import { PlusSquare, ArrowRight, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { User } from '../types';

interface AuthProps {
  onLogin: (user: User) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessKey: password }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Chave de acesso não autorizada.');
      }

      const userFound: User = await response.json();
      onLogin(userFound);

    } catch (err: any) {
      setError(err.message || 'Erro ao tentar fazer login.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-red-100/50 rounded-full blur-3xl -mr-64 -mt-64 opacity-50" />
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-8 md:p-12 w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-red-600 rounded-[1.5rem] shadow-xl shadow-red-200 mb-6">
            <PlusSquare className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black text-red-700 tracking-tighter leading-none">BELA FARMA</h1>
          <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest italic mt-4">API Local Ativa</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Chave de Segurança</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className={`block w-full pl-6 pr-12 py-4 bg-slate-50 border rounded-2xl text-slate-900 font-bold text-lg focus:outline-none focus:ring-4 transition-all ${error ? 'border-red-500 ring-red-100' : 'border-slate-200 focus:ring-red-500/10 focus:border-red-500'}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Insira sua chave..."
                autoFocus
                autocomplete="new-password"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-600">
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {error && (
              <div className="bg-red-50 p-3 rounded-xl border border-red-100 animate-in fade-in slide-in-from-top-1">
                <p className="text-red-600 text-[10px] font-bold flex items-center gap-1">
                  <AlertCircle size={12} /> {error}
                </p>
              </div>
            )}
          </div>

          <button 
            disabled={isLoading} 
            className="w-full flex items-center justify-center py-4 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 transition-all shadow-lg active:scale-95 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" /> : <>ACESSAR SISTEMA <ArrowRight className="ml-2" size={20} /></>}
          </button>
          
          <div className="text-center space-y-2 pt-4">
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
              Plataforma de Gestão Integrada • Unidade Sul
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
