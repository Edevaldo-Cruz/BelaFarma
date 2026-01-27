import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, Filter } from 'lucide-react';
import { User, Task } from '../types';
import { TaskForm } from './TaskForm';
import { TaskDetailsModal } from './TaskDetailsModal';
import { TaskCard } from './TaskCard';

interface TaskManagementPageProps {
  user: User;
  users: User[];
  onLog: (action: string, details: string) => void;
  onRefreshTasks?: () => void; // ADDED
}

export const TaskManagementPage: React.FC<TaskManagementPageProps> = ({ user, users, onLog, onRefreshTasks }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const isAdmin = user.role === 'Administrador';

  // Filter states
  const [filterPriority, setFilterPriority] = useState<Task['priority'] | 'all'>('all');
  const [filterAssignedUser, setFilterAssignedUser] = useState<string | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch(`/api/tasks?includeArchived=false`);
      if (!response.ok) {
        throw new Error('Failed to fetch tasks.');
      }
      const data: Task[] = await response.json();
      setTasks(data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Keep selectedTask in sync with tasks state updates
  useEffect(() => {
    if (selectedTask) {
      const updatedTask = tasks.find(t => t.id === selectedTask.id);
      if (updatedTask && JSON.stringify(updatedTask) !== JSON.stringify(selectedTask)) {
        setSelectedTask(updatedTask);
      }
    }
  }, [tasks, selectedTask]);

  // Apply filters to the raw tasks
  const filteredAndNonArchivedTasks = useMemo(() => {
    let currentFilteredTasks = tasks.filter(task => !task.isArchived);

    // Filter by user access (Operador vs Admin)
    if (!isAdmin) {
      currentFilteredTasks = currentFilteredTasks.filter(task => 
        task.creator === user.id || 
        task.assignedUser === user.id || 
        task.assignedUser === 'all_users'
      );
    }

    if (filterPriority !== 'all') {
      currentFilteredTasks = currentFilteredTasks.filter(task => task.priority === filterPriority);
    }

    if (searchTerm.trim() !== '') {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      currentFilteredTasks = currentFilteredTasks.filter(task =>
        task.title.toLowerCase().includes(lowerCaseSearchTerm) ||
        (task.description && task.description.toLowerCase().includes(lowerCaseSearchTerm))
      );
    }

    if (isAdmin && filterAssignedUser !== 'all') {
      currentFilteredTasks = currentFilteredTasks.filter(task => task.assignedUser === filterAssignedUser);
    }

    return currentFilteredTasks;
  }, [tasks, filterPriority, searchTerm, isAdmin, filterAssignedUser, user.id]);

  // Group tasks by status for Kanban columns
  const tasksByStatus = useMemo(() => {
    const statuses: Task['status'][] = ['A Fazer', 'Em Progresso', 'Pausada', 'Concluída', 'Cancelada'];
    return statuses.reduce((acc, status) => {
      acc[status] = filteredAndNonArchivedTasks.filter(task => task.status === status);
      return acc;
    }, {} as Record<Task['status'], Task[]>);
  }, [filteredAndNonArchivedTasks]);

  const handleAddTask = () => {
    setEditingTask(null);
    setIsFormOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setIsFormOpen(true);
  };

  const handleSaveTask = async (taskData: Omit<Task, 'creator' | 'creationDate'>, taskId?: string) => {
    try {
      const method = taskId ? 'PUT' : 'POST';
      const url = taskId ? `/api/tasks/${taskId}?userId=${user.id}&userRole=${user.role}` : `/api/tasks?userId=${user.id}&userRole=${user.role}`;

      const fullTaskData = taskId 
        ? { ...taskData, id: taskId } 
        : { ...taskData, id: `task-${Date.now()}`, creator: user.id, creationDate: new Date().toISOString() };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullTaskData),
      });

      if (!response.ok) {
        throw new Error('Failed to save task.');
      }

      onLog('Gerenciamento de Tarefas', `${taskId ? 'Atualizou' : 'Criou'} tarefa: ${fullTaskData.title}`);
      setIsFormOpen(false);
      fetchTasks();
      if (onRefreshTasks) onRefreshTasks(); // Sync global sininho
    } catch (error) {
      console.error('Error saving task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta tarefa?')) {
      return;
    }
    try {
      const response = await fetch(`/api/tasks/${taskId}?userId=${user.id}&userRole=${user.role}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete task.');
      }
      onLog('Gerenciamento de Tarefas', `Excluiu tarefa ID: ${taskId}`);
      fetchTasks();
      if (onRefreshTasks) onRefreshTasks(); // Sync global sininho
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    const taskToUpdate = tasks.find(task => task.id === taskId);
    if (!taskToUpdate) return;

    // Optimistic UI update
    setTasks(prevTasks => prevTasks.map(task => task.id === taskId ? { ...task, status: newStatus } : task));

    try {
      const response = await fetch(`/api/tasks/${taskId}?userId=${user.id}&userRole=${user.role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...taskToUpdate, status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update task status.');
      }
      onLog('Gerenciamento de Tarefas', `Atualizou status da tarefa "${taskToUpdate.title}" para "${newStatus}"`);
      fetchTasks();
      if (onRefreshTasks) onRefreshTasks();
    } catch (error) {
      console.error('Error updating task status:', error);
      setTasks(prevTasks => prevTasks.map(task => task.id === taskId ? taskToUpdate : task));
    }
  };

  const handleArchiveTask = async (taskId: string) => {
    if (!window.confirm('Tem certeza que deseja arquivar esta tarefa? Ela será movida para o arquivo morto e não aparecerá mais aqui.')) {
      return;
    }
    try {
      const taskToArchive = tasks.find(task => task.id === taskId);
      if (!taskToArchive) return;

      const response = await fetch(`/api/tasks/${taskId}?userId=${user.id}&userRole=${user.role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...taskToArchive, isArchived: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to archive task.');
      }
      onLog('Gerenciamento de Tarefas', `Arquivou tarefa ID: ${taskId} - "${taskToArchive.title}"`);
      fetchTasks();
      if (onRefreshTasks) onRefreshTasks();
    } catch (error) {
      console.error('Error archiving task:', error);
    }
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    setIsDetailsModalOpen(true);
  };

  const handleAddAnnotation = async (taskId: string, annotationText: string) => {
    try {
      const taskToUpdate = tasks.find(task => task.id === taskId);
      if (!taskToUpdate) return;

      const response = await fetch(`/api/tasks/${taskId}/annotation?userId=${user.id}&userRole=${user.role}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotationText, userName: user.name, userId: user.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to add annotation.');
      }
      onLog('Gerenciamento de Tarefas', `Adicionou anotação à tarefa "${taskToUpdate.title}"`);
      fetchTasks();
      if (onRefreshTasks) onRefreshTasks();
    } catch (error) {
      console.error('Error adding annotation:', error);
    }
  };

  const handleNotifyAdmin = async (taskId: string, message: string) => {
    try {
      const taskToUpdate = tasks.find(task => task.id === taskId);
      if (!taskToUpdate) return;

      // Update using the general task update endpoint to ensure all flags are set
      const response = await fetch(`/api/tasks/${taskId}?userId=${user.id}&userRole=${user.role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...taskToUpdate, 
          needsAdminAttention: true, 
          adminAttentionMessage: message,
          adminResolutionMessage: '', // Reset resolution
          hasAdminResponse: false // Reset response flag
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to notify admin.');
      }
      onLog('Gerenciamento de Tarefas', `Notificou administrador sobre a tarefa "${taskToUpdate.title}"`);
      fetchTasks();
      if (onRefreshTasks) onRefreshTasks(); // Ensure sidebar sync
    } catch (error) {
      console.error('Error notifying admin:', error);
    }
  };

  const handleClearAdminAttention = async (taskId: string, resolution?: string, markAsRead?: boolean) => {
    try {
      const taskToUpdate = tasks.find(task => task.id === taskId);
      if (!taskToUpdate) return;

      const updatedAnnotations = [...(taskToUpdate.annotations || [])];
      
      // If we are just marking as read (requester viewed it), only update hasAdminResponse
      if (markAsRead && !resolution) {
        const response = await fetch(`/api/tasks/${taskId}?userId=${user.id}&userRole=${user.role}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...taskToUpdate, hasAdminResponse: false }),
        });
        if (response.ok) fetchTasks();
        return;
      }

      if (resolution) {
        updatedAnnotations.push({
          timestamp: new Date().toISOString(),
          text: `RESOLUÇÃO: ${resolution}`,
          userName: user.name
        });
      }

      const response = await fetch(`/api/tasks/${taskId}?userId=${user.id}&userRole=${user.role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...taskToUpdate, 
          needsAdminAttention: false, 
          adminAttentionMessage: taskToUpdate.adminAttentionMessage, // Keep it for history in modal
          adminResolutionMessage: resolution || taskToUpdate.adminResolutionMessage,
          hasAdminResponse: !!resolution, // Set to true if a resolution was provided
          annotations: updatedAnnotations
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to clear admin attention.');
      }
      onLog('Gerenciamento de Tarefas', `Limpou alerta de atenção da tarefa "${taskToUpdate.title}"`);
      fetchTasks();
      if (onRefreshTasks) onRefreshTasks();
    } catch (error) {
      console.error('Error clearing admin attention:', error);
    }
  };

  const priorityOptions: Task['priority'][] = ['Muito Urgente', 'Urgente', 'Normal', 'Sem Prioridade'];

  // Column configuration for Kanban board
  const columns: { status: Task['status']; label: string; color: string }[] = [
    { status: 'A Fazer', label: 'A Fazer', color: 'bg-slate-100 border-slate-300' },
    { status: 'Em Progresso', label: 'Em Progresso', color: 'bg-blue-50 border-blue-300' },
    { status: 'Pausada', label: 'Pausada', color: 'bg-yellow-50 border-yellow-300' },
    { status: 'Concluída', label: 'Concluída', color: 'bg-emerald-50 border-emerald-300' },
    { status: 'Cancelada', label: 'Cancelada', color: 'bg-red-50 border-red-300' },
  ];

  return (
    <div className="max-w-[1800px] mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Gerenciamento de Tarefas</h1>
          <p className="text-slate-500 font-bold italic text-sm">Organize e acompanhe o progresso das suas tarefas.</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleAddTask} className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase shadow-xl flex items-center gap-2 hover:bg-slate-800 transition-colors">
            <Plus className="w-5 h-5" /> Nova Tarefa
          </button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
        {/* Search Term */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por título ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
          />
        </div>

        {/* Priority Filter */}
        <div className="relative min-w-[150px]">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as Task['priority'] | 'all')}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
          >
            <option value="all">Todas as Prioridades</option>
            {priorityOptions.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Assigned User Filter (Admin only) */}
        {isAdmin && (
          <div className="relative min-w-[180px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={filterAssignedUser}
              onChange={(e) => setFilterAssignedUser(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
            >
              <option value="all">Todos os Atribuídos</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
              <option value="all_users">Todos os Usuários (Geral)</option>
            </select>
          </div>
        )}
      </div>

      {/* Kanban Board */}
      <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-250px)] overflow-hidden">
        {columns.map(column => (
          <div key={column.status} className={`flex-1 min-w-[300px] max-w-[400px] rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl p-6 flex flex-col shadow-sm transition-all hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700`}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{column.label}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-2 h-2 rounded-full ${column.status === 'Concluída' ? 'bg-emerald-500' : column.status === 'Cancelada' ? 'bg-red-500' : 'bg-blue-500'}`} />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{tasksByStatus[column.status]?.length || 0} Tarefas</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4 flex-1 overflow-y-auto no-scrollbar scroll-smooth">
              {tasksByStatus[column.status]?.length > 0 ? (
                tasksByStatus[column.status].map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    user={user}
                    users={users}
                    onViewTask={handleViewTask}
                    onEditTask={handleEditTask}
                    onDeleteTask={handleDeleteTask}
                    onUpdateTaskStatus={handleUpdateTaskStatus}
                    onArchiveTask={handleArchiveTask}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">Vazio</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {isFormOpen && (
        <TaskForm
          user={user}
          users={users}
          task={editingTask}
          onSave={handleSaveTask}
          onClose={() => setIsFormOpen(false)}
        />
      )}

      {isDetailsModalOpen && selectedTask && (
        <TaskDetailsModal
          task={selectedTask}
          user={user}
          users={users}
          onClose={() => setIsDetailsModalOpen(false)}
          onEdit={(taskToEdit) => {
            setIsDetailsModalOpen(false);
            handleEditTask(taskToEdit);
          }}
          onDelete={(taskId) => {
            setIsDetailsModalOpen(false);
            handleDeleteTask(taskId);
          }}
          onAddAnnotation={handleAddAnnotation}
          onNotifyAdmin={handleNotifyAdmin}
          onClearAdminAttention={handleClearAdminAttention}
          onUpdateTaskStatus={handleUpdateTaskStatus}
          onArchiveTask={handleArchiveTask}
        />
      )}
    </div>
  );
};
