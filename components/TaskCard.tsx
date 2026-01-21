import React from 'react';
import { Task, User } from '../types';
import { Pencil, Trash2, Flag, AlertCircle, Clock } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  user: User;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, user, onEdit, onDelete }) => {
  const isAdmin = user.role === 'Administrador';
  // Use user.id from the logged-in user, not the passed 'user' which might be master-admin
  const isAssignedToMe = task.assignedUser === user.id; 
  const isAssignedToAll = task.assignedUser === 'all_users';

  // Only Admin can edit/delete tasks not assigned to them or all users.
  // Operators can edit/delete tasks assigned to them or all users.
  const canEdit = isAdmin || isAssignedToMe || isAssignedToAll;
  const canDelete = isAdmin; // Only admin can delete

  const dueDate = new Date(task.dueDate);
  const now = new Date();
  const timeDiff = dueDate.getTime() - now.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  const isOverdue = timeDiff < 0 && task.status !== 'Concluída' && task.status !== 'Cancelada';
  const isNearDeadline = daysDiff <= 1 && daysDiff > 0 && task.status !== 'Concluída' && task.status !== 'Cancelada';

  // Mapping task.color (e.g., 'red', 'orange') to Tailwind background classes
  const colorMap: { [key: string]: string } = {
    red: 'bg-red-100 border-red-200',
    orange: 'bg-orange-100 border-orange-200',
    blue: 'bg-blue-100 border-blue-200',
    gray: 'bg-gray-100 border-gray-200',
  };

  const priorityBadgeColors: { [key: string]: string } = {
    'Muito Urgente': 'bg-red-500',
    'Urgente': 'bg-orange-500',
    'Normal': 'bg-blue-500',
    'Sem Prioridade': 'bg-gray-500',
  };

  return (
    <div className={`rounded-xl p-4 shadow-sm ${colorMap[task.color] || 'bg-white border-slate-200'} ${isOverdue ? 'border-red-500 ring-2 ring-red-500' : ''} ${isNearDeadline && !isOverdue ? 'border-orange-500 ring-2 ring-orange-500' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-base font-bold text-slate-800">{task.title}</h4>
        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full text-white ${priorityBadgeColors[task.priority] || 'bg-gray-500'}`}>
          <Flag size={12} /> {task.priority}
        </span>
      </div>
      {task.description && <p className="text-xs text-slate-600 mb-2">{task.description}</p>}
      
      <div className="flex justify-between items-center text-xs text-slate-500 mt-3">
        <span>Atribuído: {task.assignedUser === 'all_users' ? 'Todos' : user.name}</span> {/* Displaying current user's name for simplification */}
        <span>Prazo: {dueDate.toLocaleDateString('pt-BR')}</span>
      </div>
      
      {(isOverdue || isNearDeadline) && (
        <div className="mt-2 text-xs font-bold flex items-center gap-1">
          {isOverdue && (
            <span className="text-red-500 flex items-center gap-1">
              <AlertCircle size={14} /> Atrasada!
            </span>
          )}
          {isNearDeadline && !isOverdue && (
            <span className="text-orange-500 flex items-center gap-1">
              <Clock size={14} /> Vence em {daysDiff} dia(s)
            </span>
          )}
        </div>
      )}

      {(canEdit || canDelete) && (
        <div className="flex justify-end items-center gap-2 mt-3 pt-3 border-t border-slate-200">
          {canEdit && (
            <button onClick={() => onEdit(task)} className="text-slate-400 hover:text-blue-600 p-1 rounded-md">
              <Pencil size={16} />
            </button>
          )}
          {canDelete && (
            <button onClick={() => onDelete(task.id)} className="text-slate-400 hover:text-red-600 p-1 rounded-md">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
