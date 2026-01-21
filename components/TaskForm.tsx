import React, { useState, useEffect } from 'react';
import { Task, User } from '../types';
import { X, Save } from 'lucide-react';

interface TaskFormProps {
  user: User;
  users: User[];
  task: Task | null; // Null for new task, Task object for editing
  onSave: (taskData: Omit<Task, 'creator' | 'creationDate'>, taskId?: string) => void;
  onClose: () => void;
}

export const TaskForm: React.FC<TaskFormProps> = ({ user, users, task, onSave, onClose }) => {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [assignedUser, setAssignedUser] = useState(task?.assignedUser || ''); // Default to empty string
  const [priority, setPriority] = useState<Task['priority']>(task?.priority || 'Normal');
  const [status, setStatus] = useState<Task['status']>(task?.status || 'A Fazer');

  const priorityOptions: Task['priority'][] = ['Muito Urgente', 'Urgente', 'Normal', 'Sem Prioridade'];
  const statusOptions: Task['status'][] = ['A Fazer', 'Em Progresso', 'Concluída', 'Pausada', 'Cancelada'];

  const allAvailableUsers = [
    { id: 'all_users', name: 'Todos os Usuários' },
    ...users.map(u => ({ id: u.id, name: u.name })),
  ];

  const calculateDueDateAndColor = (selectedPriority: Task['priority']): { dueDate: string; color: string } => {
    const creationDate = task?.creationDate ? new Date(task.creationDate) : new Date();
    let daysToAdd = 0;
    let color = 'gray';

    switch (selectedPriority) {
      case 'Muito Urgente': daysToAdd = 1; color = 'red'; break;
      case 'Urgente': daysToAdd = 2; color = 'orange'; break;
      case 'Normal': daysToAdd = 5; color = 'blue'; break;
      case 'Sem Prioridade': daysToAdd = 7; color = 'gray'; break;
    }

    const dueDate = new Date(creationDate);
    dueDate.setDate(creationDate.getDate() + daysToAdd);

    return { dueDate: dueDate.toISOString(), color };
  };

  useEffect(() => {
    if (!task) { // For new tasks, set initial due date and color based on default priority
      const { dueDate, color } = calculateDueDateAndColor(priority);
      // No need to set state here, as it's handled on save.
      // This logic primarily guides the user or is used during the save.
    }
  }, [priority, task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { dueDate, color } = calculateDueDateAndColor(priority);

    const taskData: Omit<Task, 'creator' | 'creationDate'> = {
      id: task?.id || '', // Will be generated on backend if new
      title,
      description,
      assignedUser,
      priority,
      status,
      dueDate,
      color,
    };
    onSave(taskData, task?.id);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border-4 border-red-500 overflow-hidden">
        <div className="p-8 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black uppercase text-slate-800">{task ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-600 rounded-full">
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-400 uppercase mb-1 block">Título</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                required
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 uppercase mb-1 block">Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl min-h-[100px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-black text-slate-400 uppercase mb-1 block">Atribuído a</label>
                <select
                  value={assignedUser}
                  onChange={(e) => {
                    console.log('Assigned user changed to:', e.target.value);
                    setAssignedUser(e.target.value);
                  }}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                  required
                >
                  {allAvailableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase mb-1 block">Prioridade</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Task['priority'])}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                  required
                >
                  {priorityOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 uppercase mb-1 block">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Task['status'])}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                required
              >
                {statusOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="w-full py-4 bg-red-600 text-white font-black rounded-2xl uppercase shadow-xl flex items-center justify-center gap-2">
              <Save size={20} /> Salvar Tarefa
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
