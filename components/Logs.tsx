
import React, { useState } from 'react';
import { History, Search, Filter, ShieldAlert, User as UserIcon, Tag, Clock } from 'lucide-react';
import { SystemLog } from '../types';

interface LogsProps {
  logs: SystemLog[];
}

export const Logs: React.FC<LogsProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.details.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Pedidos': return 'text-blue-600 bg-blue-50';
      case 'Faltas': return 'text-orange-600 bg-orange-50';
      case 'Financeiro': return 'text-emerald-600 bg-emerald-50';
      case 'Cofre': return 'text-purple-600 bg-purple-50';
      case 'Usuários': return 'text-red-600 bg-red-50';
      default: return 'text-slate-600 bg-slate-50';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter flex items-center gap-2">
          <History className="w-7 h-7 text-red-600" /> Auditoria do Sistema
        </h1>
        <p className="text-slate-500 font-medium">Trilha completa de ações e alterações dos colaboradores.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Filtrar por usuário ou detalhe da ação..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select 
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase appearance-none outline-none focus:ring-2 focus:ring-red-500"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Todas as Áreas</option>
            <option value="Pedidos">Pedidos</option>
            <option value="Faltas">Lista de Faltas</option>
            <option value="Financeiro">Financeiro / Lançamentos</option>
            <option value="Cofre">Movimentação Cofre</option>
            <option value="Usuários">Gestão de Usuários</option>
            <option value="Sistema">Acesso ao Sistema</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Horário</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ação / Categoria</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalhes do Registro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-bold">
                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-slate-100 rounded-lg">
                        <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <span className="text-xs font-black text-slate-900 uppercase tracking-tighter">{log.userName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase text-slate-900">{log.action}</span>
                      <span className={`w-fit px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${getCategoryColor(log.category)}`}>
                        {log.category}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-[11px] font-bold text-slate-600 leading-tight bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                      {log.details}
                    </p>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center space-y-3">
                    <ShieldAlert className="w-12 h-12 text-slate-200 mx-auto" />
                    <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">Nenhum log encontrado para os filtros aplicados.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center gap-3">
        <ShieldAlert className="w-5 h-5 text-red-600" />
        <p className="text-[10px] font-bold text-red-700 uppercase tracking-tight">
          Aviso: Os logs são imutáveis e persistentes no BancoBela. Apenas os últimos 100 registros são exibidos para performance.
        </p>
      </div>
    </div>
  );
};
