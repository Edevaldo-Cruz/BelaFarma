import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, LayoutDashboard } from 'lucide-react';
import { User, Task } from '../types';
import { KanbanBoard } from './KanbanBoard';
import { TaskForm } from './TaskForm';
import { TaskDetailsModal } from './TaskDetailsModal'; // Import TaskDetailsModal

interface TaskManagementPageProps {
  user: User;
  users: User[];
  onLog: (action: string, details: string) => void;
}

export const TaskManagementPage: React.FC<TaskManagementPageProps> = ({ user, users, onLog }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false); // State for details modal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null); // State for selected task in details modal
  const isAdmin = user.role === 'Administrador';

  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch(`/api/tasks?userId=${user.id}&userRole=${user.role}`);
      if (!response.ok) {
        throw new Error('Failed to fetch tasks.');
      }
      const data: Task[] = await response.json();
      setTasks(data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      // Optionally, show an error message to the user
    }
  }, [user.id, user.role]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleAddTask = () => {
    setEditingTask(null);
    setIsFormOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setIsFormOpen(true);
  };

  const handleSaveTask = async (taskData: Omit<Task, 'creator' | 'creationDate'>, taskId?: string) => {
    console.log('Saving task with assignedUser:', taskData.assignedUser);
    try {
      const method = taskId ? 'PUT' : 'POST';
      const url = taskId ? `/api/tasks/${taskId}?userId=${user.id}&userRole=${user.role}` : `/api/tasks?userId=${user.id}&userRole=${user.role}`;

      const fullTaskData = taskId 
        ? taskData 
        : { ...taskData, id: `task-${Date.now()}`, creator: user.id, creationDate: new Date().toISOString() };

      console.log('Sending task data to backend:', fullTaskData);

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
      fetchTasks(); // Refresh tasks
    } catch (error) {
      console.error('Error saving task:', error);
      // Optionally, show an error message to the user
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
      fetchTasks(); // Refresh tasks
    } catch (error) {
      console.error('Error deleting task:', error);
      // Optionally, show an error message to the user
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
      fetchTasks(); // Ensure state is synced, especially if optimistic update failed
    } catch (error) {
      console.error('Error updating task status:', error);
      // Rollback optimistic update if API call fails (optional, but good practice)
      setTasks(prevTasks => prevTasks.map(task => task.id === taskId ? taskToUpdate : task));
      // Optionally, show an error message to the user
    }
  };

  const handleViewTask = (task: Task) => {
    console.log('handleViewTask called with task:', task);
    setSelectedTask(task);
    setIsDetailsModalOpen(true);
  };

  const handleAddAnnotation = async (taskId: string, annotationText: string) => {
    // TODO: Implement API call to add annotation to the task
    console.log(`Adding annotation to task ${taskId}: ${annotationText}`);
    // For now, just refresh tasks to simulate an update
    // You'll need to update the Task type and backend to persist annotations
    fetchTasks(); 
  };

  const handleNotifyAdmin = async (taskId: string, message: string) => {
    // TODO: Implement API call to notify admin about the task
    console.log(`Notifying admin about task ${taskId}: ${message}`);
    // You'll need a new backend endpoint for notifications or update task with a flag
    fetchTasks();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Gerenciamento de Tarefas</h1>
          <p className="text-slate-500 font-bold italic text-sm">Organize e acompanhe o progresso das suas tarefas.</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleAddTask} className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase shadow-xl flex items-center gap-2">
            <Plus className="w-5 h-5" /> Nova Tarefa
          </button>
        </div>
      </header>

      
        <KanbanBoard 
          tasks={tasks} 
          user={user} 
          onViewTask={handleViewTask} // New prop
          onUpdateTaskStatus={handleUpdateTaskStatus} 
        />
      

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
            setIsDetailsModalOpen(false); // Close details modal
            handleEditTask(taskToEdit);    // Open edit form
          }}
          onDelete={(taskId) => {
            setIsDetailsModalOpen(false); // Close details modal
            handleDeleteTask(taskId);     // Perform delete
          }}
          onAddAnnotation={handleAddAnnotation}
          onNotifyAdmin={handleNotifyAdmin}
        />
      )}
    </div>
  );
};
