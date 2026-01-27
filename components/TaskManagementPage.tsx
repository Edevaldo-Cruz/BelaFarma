import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Plus, Search, Filter, Flag, CheckCircle, Bug as BugIcon, Map } from 'lucide-react';
import { User, Task, Bug } from '../types';
import { TaskForm } from './TaskForm';
import { TaskDetailsModal } from './TaskDetailsModal';
import { TaskCard } from './TaskCard';
import { BugForm } from './BugForm';
import { BugList } from './BugList';
import { BugDetailsModal } from './BugDetailsModal';

// Lazy load do FlyeringMap para melhor performance
const FlyeringMap = lazy(() => import('./FlyeringMap').then(module => ({ default: module.FlyeringMap })));

interface TaskManagementPageProps {
  user: User;
  users: User[];
  onLog: (action: string, details: string) => void;
  onRefreshTasks?: () => void; // ADDED
}

export const TaskManagementPage: React.FC<TaskManagementPageProps> = ({ user, users, onLog, onRefreshTasks }) => {
  // Tab state
  const [activeTab, setActiveTab] = useState<'tasks' | 'bugs' | 'flyering'>('tasks');
  
  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  
  // Bugs state
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [isBugFormOpen, setIsBugFormOpen] = useState(false);
  const [editingBug, setEditingBug] = useState<Bug | null>(null);
  const [isBugDetailsOpen, setIsBugDetailsOpen] = useState(false);
  const [selectedBug, setSelectedBug] = useState<Bug | null>(null);
  
  const isAdmin = user.role === 'Administrador';

  // Filter states (for tasks)
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

  const fetchBugs = useCallback(async () => {
    try {
      const response = await fetch('/api/bugs');
      if (!response.ok) {
        throw new Error('Failed to fetch bugs.');
      }
      const data: Bug[] = await response.json();
      setBugs(data);
    } catch (error) {
      console.error('Error fetching bugs:', error);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchBugs();
  }, [fetchTasks, fetchBugs]);

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

  // --- Bug Handlers ---
  const handleCreateBug = async (bugData: Omit<Bug, 'id' | 'createdAt' | 'reporter'>) => {
    try {
      const newBug: Bug = {
        ...bugData,
        id: `bug-${Date.now()}`,
        reporter: user.id,
        createdAt: new Date().toISOString()
      };

      const response = await fetch('/api/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBug),
      });

      if (!response.ok) throw new Error('Failed to create bug.');
      
      onLog('Bugs', `Reportou bug: "${newBug.title}"`);
      setIsBugFormOpen(false);
      setEditingBug(null);
      fetchBugs();
    } catch (error) {
      console.error('Error creating bug:', error);
      alert('Erro ao criar bug.');
    }
  };

  const handleUpdateBug = async (updatedBug: Bug) => {
    try {
      const response = await fetch(`/api/bugs/${updatedBug.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedBug),
      });

      if (!response.ok) throw new Error('Failed to update bug.');
      
      onLog('Bugs', `Atualizou bug: "${updatedBug.title}" para status "${updatedBug.status}"`);
      setIsBugDetailsOpen(false);
      setSelectedBug(null);
      fetchBugs();
    } catch (error) {
      console.error('Error updating bug:', error);
      alert('Erro ao atualizar bug.');
    }
  };

  const handleDeleteBug = async (bugId: string) => {
    try {
      const response = await fetch(`/api/bugs/${bugId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete bug.');
      
      onLog('Bugs', `Deletou bug ID: ${bugId}`);
      fetchBugs();
    } catch (error) {
      console.error('Error deleting bug:', error);
      alert('Erro ao deletar bug.');
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
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Gerenciamento de Tarefas, Bugs & Panfletagem</h1>
          <p className="text-slate-500 font-bold italic text-sm">
            {activeTab === 'tasks' && 'Organize e acompanhe o progresso das suas tarefas.'}
            {activeTab === 'bugs' && 'Reporte e acompanhe problemas do sistema.'}
            {activeTab === 'flyering' && 'Distribua áreas de panfletagem no mapa interativo.'}
          </p>
        </div>
        {activeTab !== 'flyering' && (
          <div className="flex items-center gap-4">
            <button 
              onClick={() => activeTab === 'tasks' ? handleAddTask() : setIsBugFormOpen(true)} 
              className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase shadow-xl flex items-center gap-2 hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-5 h-5" />
              {activeTab === 'tasks' ? 'Nova Tarefa' : 'Reportar Bug'}
            </button>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="flex gap-2 p-2 bg-white rounded-2xl shadow-sm border border-slate-200">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 px-6 py-3 rounded-xl font-black uppercase text-sm tracking-wide transition-all ${
            activeTab === 'tasks'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <CheckCircle size={18} />
            <span>Tarefas ({tasks.length})</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('bugs')}
          className={`flex-1 px-6 py-3 rounded-xl font-black uppercase text-sm tracking-wide transition-all ${
            activeTab === 'bugs'
              ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-lg'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <BugIcon size={18} />
            <span>Bugs ({bugs.length})</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('flyering')}
          className={`flex-1 px-6 py-3 rounded-xl font-black uppercase text-sm tracking-wide transition-all ${
            activeTab === 'flyering'
              ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Map size={18} />
            <span>Panfletagem</span>
          </div>
        </button>
      </div>

      {/* Tasks Tab Content */}
      {activeTab === 'tasks' && (
        <>
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

      {/* Priority Legend */}
      <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">Legenda de Prioridades</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Muito Urgente</span>
              <span className="text-[10px] font-medium text-slate-400">• Imediato</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Urgente</span>
              <span className="text-[10px] font-medium text-slate-400">• Hoje</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Normal</span>
              <span className="text-[10px] font-medium text-slate-400">• Esta semana</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-400"></div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Sem Prioridade</span>
              <span className="text-[10px] font-medium text-slate-400">• Quando possível</span>
            </div>
          </div>
        </div>
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
        </>
      )}

      {/* Bugs Tab Content */}
      {activeTab === 'bugs' && (
        <>
          <div className="p-6">
            <BugList
              bugs={bugs}
              user={user}
              users={users}
              onBugClick={(bug) => {
                setSelectedBug(bug);
                setIsBugDetailsOpen(true);
              }}
            />
          </div>

          {isBugFormOpen && (
            <BugForm
              user={user}
              onClose={() => {
                setIsBugFormOpen(false);
                setEditingBug(null);
              }}
              onSubmit={handleCreateBug}
              editingBug={editingBug}
            />
          )}

          {isBugDetailsOpen && selectedBug && (
            <BugDetailsModal
              bug={selectedBug}
              user={user}
              users={users}
              onClose={() => {
                setIsBugDetailsOpen(false);
                setSelectedBug(null);
              }}
              onUpdate={handleUpdateBug}
              onDelete={isAdmin ? handleDeleteBug : undefined}
            />
          )}
        </>
      )}

      {/* Flyering Tab Content */}
      {activeTab === 'flyering' && (
        <div className="mt-6">
          <Suspense fallback={
            <div className="h-[500px] flex items-center justify-center bg-slate-50 rounded-2xl border-2 border-slate-200">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-300 border-t-blue-600 mb-4"></div>
                <p className="text-slate-600 font-bold">Carregando mapa...</p>
              </div>
            </div>
          }>
            <FlyeringMap user={user} users={users} onLog={onLog} />
          </Suspense>
        </div>
      )}
    </div>
  );
};


