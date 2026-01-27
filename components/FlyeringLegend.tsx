import React from 'react';
import { Users, Trash2, MapPin } from 'lucide-react';
import { FlyeringTask, User } from '../types';

interface FlyeringLegendProps {
  tasks: FlyeringTask[];
  users: User[];
  selectedUserId: string | null;
  onSelectUser: (userId: string | null) => void;
  onDeleteTask?: (taskId: string) => void;
  onUpdateStatus: (taskId: string, status: FlyeringTask['status']) => void;
}

export const FlyeringLegend: React.FC<FlyeringLegendProps> = ({
  tasks,
  users,
  selectedUserId,
  onSelectUser,
  onDeleteTask,
  onUpdateStatus,
}) => {
  // Agrupar tarefas por usuário
  const tasksByUser = tasks.reduce((acc, task) => {
    if (!acc[task.assignedUserId]) {
      acc[task.assignedUserId] = [];
    }
    acc[task.assignedUserId].push(task);
    return acc;
  }, {} as Record<string, FlyeringTask[]>);

  // Usuários com tarefas
  const usersWithTasks = users.filter(user => tasksByUser[user.id]);

  if (usersWithTasks.length === 0) {
    return (
      <div className="absolute bottom-4 left-4 z-[500] bg-white rounded-2xl shadow-xl p-4 max-w-xs border-2 border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-slate-500" />
          <h3 className="font-black text-sm text-slate-700 uppercase tracking-wide">Legenda</h3>
        </div>
        <p className="text-xs text-slate-500 font-bold italic">
          Nenhuma área de panfletagem criada ainda.
        </p>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-4 z-[500] bg-white rounded-2xl shadow-xl p-4 max-w-sm border-2 border-slate-200 max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-500" />
          <h3 className="font-black text-sm text-slate-700 uppercase tracking-wide">
            Áreas por Usuário
          </h3>
        </div>
        {selectedUserId && (
          <button
            onClick={() => onSelectUser(null)}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 underline"
          >
            Mostrar Todos
          </button>
        )}
      </div>

      {/* Lista de usuários */}
      <div className="space-y-3">
        {usersWithTasks.map(user => {
          const userTasks = tasksByUser[user.id] || [];
          const isSelected = selectedUserId === user.id;
          const sampleColor = userTasks[0]?.color || '#ccc';

          // Contagem por status
          const pendingCount = userTasks.filter(t => t.status === 'Pendente').length;
          const inProgressCount = userTasks.filter(t => t.status === 'Em Andamento').length;
          const completedCount = userTasks.filter(t => t.status === 'Concluído').length;

          return (
            <div
              key={user.id}
              className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 shadow-md'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
              }`}
              onClick={() => onSelectUser(isSelected ? null : user.id)}
            >
              {/* User Header */}
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: sampleColor }}
                />
                <span className="font-black text-sm text-slate-900">{user.name}</span>
                <span className="ml-auto text-xs font-bold text-slate-500">
                  {userTasks.length} {userTasks.length === 1 ? 'área' : 'áreas'}
                </span>
              </div>

              {/* Status Summary */}
              <div className="flex gap-2 text-xs font-bold">
                {pendingCount > 0 && (
                  <span className="text-orange-600">⏳ {pendingCount}</span>
                )}
                {inProgressCount > 0 && (
                  <span className="text-blue-600">🔄 {inProgressCount}</span>
                )}
                {completedCount > 0 && (
                  <span className="text-green-600">✅ {completedCount}</span>
                )}
              </div>

              {/* Expandir tarefas se selecionado */}
              {isSelected && (
                <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                  {userTasks.map(task => (
                    <div
                      key={task.id}
                      className="p-2 bg-white rounded-lg border border-slate-200 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-start gap-1 flex-1">
                          <MapPin className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                          <span className="font-bold text-slate-700">
                            {task.area || task.description || 'Área sem nome'}
                          </span>
                        </div>
                        {onDeleteTask && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTask(task.id);
                            }}
                            className="p-1 hover:bg-red-50 rounded text-red-500 hover:text-red-600 transition-colors"
                            title="Excluir área"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      
                      {task.description && task.area && (
                        <p className="text-slate-500 mb-1 ml-4">{task.description}</p>
                      )}
                      
                      <div className="flex items-center gap-2 ml-4">
                        <select
                          value={task.status}
                          onChange={(e) => {
                            e.stopPropagation();
                            onUpdateStatus(task.id, e.target.value as FlyeringTask['status']);
                          }}
                          className="text-xs font-bold py-1 px-2 rounded border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="Pendente">⏳ Pendente</option>
                          <option value="Em Andamento">🔄 Em Andamento</option>
                          <option value="Concluído">✅ Concluído</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dica */}
      <div className="mt-4 pt-3 border-t border-slate-200">
        <p className="text-[10px] text-slate-500 font-bold italic">
          💡 Clique em um usuário para filtrar suas áreas no mapa
        </p>
      </div>
    </div>
  );
};
