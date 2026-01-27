import React from 'react';
import { Bug, CheckCircle, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { Bug as BugType, User } from '../types';

interface BugCardProps {
  bug: BugType;
  user: User;
  users: User[];
  onClick: () => void;
}

const BugCard: React.FC<BugCardProps> = ({ bug, user, users, onClick }) => {
  const reporter = users.find(u => u.id === bug.reporter);
  const isAdmin = user.role === 'Administrador';

  const priorityConfig = {
    'Crítico': { color: 'border-red-500 bg-red-50 dark:bg-red-950/20', badge: 'bg-red-600 text-white', icon: AlertTriangle },
    'Alto': { color: 'border-orange-500 bg-orange-50 dark:bg-orange-950/20', badge: 'bg-orange-600 text-white', icon: AlertTriangle },
    'Médio': { color: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20', badge: 'bg-yellow-600 text-white', icon: AlertTriangle },
    'Baixo': { color: 'border-slate-300 bg-slate-50 dark:bg-slate-950/20', badge: 'bg-slate-500 text-white', icon: AlertTriangle }
  };

  const statusConfig = {
    'Aberto': { color: 'text-blue-600', icon: Clock, label: 'Aberto' },
    'Em Análise': { color: 'text-purple-600', icon: Clock, label: 'Em Análise' },
    'Resolvido': { color: 'text-green-600', icon: CheckCircle, label: 'Resolvido' },
    'Fechado': { color: 'text-slate-400', icon: XCircle, label: 'Fechado' }
  };

  const config = priorityConfig[bug.priority];
  const StatusIcon = statusConfig[bug.status].icon;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-5 border-l-4 ${config.color} rounded-2xl hover:shadow-lg transition-all group`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div className={`p-2 ${config.badge} rounded-lg group-hover:scale-110 transition-transform`}>
            <Bug size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">
              {bug.title}
            </h3>
            {bug.description && (
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                {bug.description}
              </p>
            )}
          </div>
        </div>
        <div className={`px-3 py-1 ${config.badge} rounded-lg text-[10px] font-black uppercase tracking-wide whitespace-nowrap`}>
          {bug.priority}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 ${statusConfig[bug.status].color}`}>
            <StatusIcon size={14} />
            <span className="text-xs font-bold">{statusConfig[bug.status].label}</span>
          </div>
          {bug.category && (
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md uppercase">
              {bug.category}
            </span>
          )}
        </div>
        <div className="text-[10px] font-bold text-slate-400">
          Por: {reporter?.name || 'Desconhecido'}
        </div>
      </div>

      {bug.resolvedAt && bug.resolutionNotes && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs font-bold text-green-700 dark:text-green-500 italic">
            ✓ Resolução: {bug.resolutionNotes}
          </p>
        </div>
      )}
    </button>
  );
};

interface BugListProps {
  bugs: BugType[];
  user: User;
  users: User[];
  onBugClick: (bug: BugType) => void;
}

export const BugList: React.FC<BugListProps> = ({ bugs, user, users, onBugClick }) => {
  if (bugs.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <Bug size={32} className="text-slate-300 dark:text-slate-600" />
        </div>
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">
          Nenhum bug reportado
        </h3>
        <p className="text-xs font-bold text-slate-400 mt-1">
          Use o botão acima para reportar problemas
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {bugs.map(bug => (
        <BugCard 
          key={bug.id} 
          bug={bug} 
          user={user} 
          users={users} 
          onClick={() => onBugClick(bug)} 
        />
      ))}
    </div>
  );
};
