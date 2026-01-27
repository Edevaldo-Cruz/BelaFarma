import React from 'react';
import { Task, User, UserRole } from '../types';
import { Flag, AlertCircle, Clock, Pencil, Trash2, Archive, Bell, ClipboardCheck } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  user: User; // Logged-in user
  users: User[]; // All users for display name resolution
  onViewTask: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTaskStatus: (taskId: string, newStatus: Task['status']) => void;
  onArchiveTask: (taskId: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ 
  task, 
  user, 
  users, 
  onViewTask, 
  onEditTask, 
  onDeleteTask, 
  onUpdateTaskStatus,
  onArchiveTask
}) => {
  const dueDate = new Date(task.dueDate);
  const now = new Date();
  const timeDiff = dueDate.getTime() - now.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  const isOverdue = timeDiff < 0 && task.status !== 'Concluída' && task.status !== 'Cancelada';
  const isNearDeadline = daysDiff <= 1 && daysDiff > 0 && task.status !== 'Concluída' && task.status !== 'Cancelada';

  const isAdmin = user.role === UserRole.ADM;
  const isAssignedToMe = task.assignedUser === user.id;
  const isCreator = task.creator === user.id;

  const canEdit = isCreator; // Only creator can edit
  const canDelete = isCreator; // Only creator can delete
  const canArchive = task.status === 'Concluída' && !task.isArchived;

  const priorityBorderColors: { [key: string]: string } = {
    'Muito Urgente': 'border-l-red-500',
    'Urgente': 'border-l-orange-500',
    'Normal': 'border-l-blue-500',
    'Sem Prioridade': 'border-l-slate-400',
  };

  const priorityBgColors: { [key: string]: string } = {
    'Muito Urgente': 'bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30 shadow-red-100/50 dark:shadow-red-900/20',
    'Urgente': 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-900/30 shadow-orange-100/50 dark:shadow-orange-900/20',
    'Normal': 'bg-white dark:bg-slate-900/80 border-slate-100 dark:border-slate-800 shadow-slate-200/50 dark:shadow-black/50',
    'Sem Prioridade': 'bg-slate-50 dark:bg-slate-950/50 border-slate-100 dark:border-slate-900 shadow-none',
  };

  const priorityIconBg: { [key: string]: string } = {
    'Muito Urgente': 'bg-red-500/10',
    'Urgente': 'bg-orange-500/10',
    'Normal': 'bg-blue-500/10',
    'Sem Prioridade': 'bg-slate-500/10',
  };

  const assignedUserName = task.assignedUser === 'all_users' 
    ? 'Equipe' 
    : users.find(u => u.id === task.assignedUser)?.name || '...';

  const initials = assignedUserName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  return (
    <div 
      className={`group relative flex flex-col p-5 rounded-2xl border-l-[6px] border transition-all duration-300 hover:translate-x-1 hover:shadow-xl ${priorityBgColors[task.priority] || priorityBgColors['Normal']} ${priorityBorderColors[task.priority] || 'border-l-slate-300'} ${isOverdue ? 'ring-2 ring-red-500/50' : ''}`}
      onClick={() => onViewTask(task)}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {task.title}
        </h4>
        <div className="flex items-center gap-2 flex-shrink-0">
          {task.needsAdminAttention && (
            <div className="p-1 px-2 bg-amber-500 text-white rounded-lg flex items-center gap-1 animate-pulse shadow-lg shadow-amber-500/20">
              <Bell size={10} className="animate-bounce" />
              <span className="text-[8px] font-black uppercase tracking-tighter">Atenção</span>
            </div>
          )}
          {task.hasAdminResponse && !task.needsAdminAttention && (
            <div className="p-1 px-2 bg-emerald-500 text-white rounded-lg flex items-center gap-1 shadow-lg shadow-emerald-500/20">
              <ClipboardCheck size={10} />
              <span className="text-[8px] font-black uppercase tracking-tighter">Resolvido</span>
            </div>
          )}
          <div className={`p-1.5 rounded-lg ${priorityIconBg[task.priority]} flex-shrink-0 animate-in zoom-in duration-500`}>
            <Flag size={12} className={task.priority === 'Muito Urgente' ? 'text-red-600' : task.priority === 'Urgente' ? 'text-orange-600' : task.priority === 'Normal' ? 'text-blue-600' : 'text-slate-400'} />
          </div>
        </div>
      </div>

      {task.description && (
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">
          {task.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-50 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {initials}
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Atribuído</p>
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{assignedUserName}</p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Prazo</p>
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-400">
            <Clock size={10} />
            <span className={isOverdue ? 'text-red-500' : isNearDeadline ? 'text-orange-500' : ''}>
              {dueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {/* Action Toolbar - Disclousure on Hover */}
      <div 
        className="absolute top-2 right-2 flex gap-1 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md rounded-xl p-1 shadow-2xl border border-slate-200 dark:border-slate-800 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {canEdit && (
          <button onClick={() => onEditTask(task)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg transition-colors">
            <Pencil size={12} />
          </button>
        )}
        {canArchive && (
          <button onClick={() => onArchiveTask(task.id)} className="p-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 rounded-lg transition-colors">
            <Archive size={12} />
          </button>
        )}
        {canDelete && (
          <button onClick={() => onDeleteTask(task.id)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded-lg transition-colors">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
};
