import React, { useState, useEffect } from 'react';
import { Task, User } from '../types';
import { X, Save } from 'lucide-react';

interface TaskFormProps {
  user: User;
  users: User[];
  task: Task | null; // Null for new task, Task object for editing
  onSave: (taskData: Omit<Task, 'creator' | 'creationDate'> & { recurrence?: Task['recurrence'], originalDueDate?: string }, taskId?: string) => void; // Updated onSave type
  onClose: () => void;
}

export const TaskForm: React.FC<TaskFormProps> = ({ user, users, task, onSave, onClose }) => {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [assignedUser, setAssignedUser] = useState(task?.assignedUser || user.id); // Default to current user's ID for new tasks
  const [priority, setPriority] = useState<Task['priority']>(task?.priority || 'Normal');
  const [status, setStatus] = useState<Task['status']>(task?.status || 'A Fazer');

  // Recurrence states
  const [isRecurring, setIsRecurring] = useState(task?.recurrence?.type !== 'none' && task?.recurrence?.type !== undefined || false);
  const [recurrenceType, setRecurrenceType] = useState<Task['recurrence']['type']>(task?.recurrence?.type || 'none');
  const [recurrenceInterval, setRecurrenceInterval] = useState(task?.recurrence?.interval || 1);
  const [recurrenceDaysOfWeek, setRecurrenceDaysOfWeek] = useState<number[]>(task?.recurrence?.daysOfWeek || []);
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState(task?.recurrence?.dayOfMonth || 1);
  const [recurrenceMonthOfYear, setRecurrenceMonthOfYear] = useState(task?.recurrence?.monthOfYear || 1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(task?.recurrence?.endDate ? task.recurrence.endDate.substring(0, 10) : '');

  const priorityOptions: Task['priority'][] = ['Muito Urgente', 'Urgente', 'Normal', 'Sem Prioridade'];
  const statusOptions: Task['status'][] = ['A Fazer', 'Em Progresso', 'Concluída', 'Pausada', 'Cancelada'];
  const recurrenceTypeOptions: Array<Task['recurrence']['type']> = ['none', 'daily', 'weekly', 'monthly', 'annually'];
  const daysOfWeekOptions = [
    { label: 'Dom', value: 0 }, { label: 'Seg', value: 1 }, { label: 'Ter', value: 2 },
    { label: 'Qua', value: 3 }, { label: 'Qui', value: 4 }, { label: 'Sex', value: 5 }, { label: 'Sáb', value: 6 }
  ];
  const monthsOfYearOptions = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12

  const allAvailableUsers = [
    { id: 'all_users', name: 'Todos os Usuários' },
    ...users.map(u => ({ id: u.id, name: u.name })),
  ];

  const calculateDueDateAndColor = (selectedPriority: Task['priority'], currentTask?: Task | null): { dueDate: string; color: string } => {
    const baseDate = currentTask?.creationDate ? new Date(currentTask.creationDate) : new Date();
    let daysToAdd = 0;
    let color = 'gray';

    switch (selectedPriority) {
      case 'Muito Urgente': daysToAdd = 1; color = 'red'; break;
      case 'Urgente': daysToAdd = 2; color = 'orange'; break;
      case 'Normal': daysToAdd = 5; color = 'blue'; break;
      case 'Sem Prioridade': daysToAdd = 7; color = 'gray'; break;
    }

    const dueDate = new Date(baseDate);
    dueDate.setDate(baseDate.getDate() + daysToAdd);

    return { dueDate: dueDate.toISOString(), color };
  };

  useEffect(() => {
    if (task && task.recurrence && task.recurrence.type !== 'none') {
      setIsRecurring(true);
    } else {
      setIsRecurring(false);
    }
  }, [task]);

  const handleDayOfWeekChange = (day: number, checked: boolean) => {
    if (checked) {
      setRecurrenceDaysOfWeek(prev => [...prev, day].sort());
    } else {
      setRecurrenceDaysOfWeek(prev => prev.filter(d => d !== day));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { dueDate, color } = calculateDueDateAndColor(priority, task); // Pass task for creationDate if editing

    const recurrenceData = isRecurring && recurrenceType !== 'none' ? {
      type: recurrenceType,
      interval: recurrenceInterval,
      daysOfWeek: recurrenceType === 'weekly' ? recurrenceDaysOfWeek : undefined,
      dayOfMonth: recurrenceType === 'monthly' ? recurrenceDayOfMonth : undefined,
      monthOfYear: recurrenceType === 'annually' ? recurrenceMonthOfYear : undefined,
      endDate: recurrenceEndDate || undefined,
    } : undefined;

    const taskData: Omit<Task, 'creator' | 'creationDate' | 'recurrence' | 'originalDueDate'> & { recurrence?: Task['recurrence'], originalDueDate?: string } = {
      id: task?.id || '', // Will be generated on backend if new
      title,
      description,
      assignedUser,
      priority,
      status,
      dueDate, // This will be the initial due date for recurring tasks
      color,
      recurrence: recurrenceData,
      originalDueDate: recurrenceData ? dueDate : undefined, // Save this if it's a recurring task
    };
    onSave(taskData, task?.id);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-950 w-full max-w-2xl rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] dark:shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-10 space-y-8">
          <div className="flex justify-between items-center border-b border-slate-50 dark:border-slate-800 pb-6">
            <div>
              <h2 className="text-2xl font-black uppercase text-slate-900 dark:text-white tracking-tighter">
                {task ? 'Configurar Missão' : 'Nova Diretriz'}
              </h2>
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-1">Módulo de Sincronização de Tarefas</p>
            </div>
            <button onClick={onClose} className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-full transition-all">
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 block">
                  Identificador da Tarefa
                </label>
                <input
                  type="text"
                  placeholder="Ex: Organizar estoque de antibióticos"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 font-bold placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white dark:focus:bg-slate-900 transition-all text-sm"
                  required
                />
              </div>
              
              <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 block">
                  Especificações Detalhadas
                </label>
                <textarea
                  placeholder="Descreva os passos e objetivos..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-300 dark:placeholder:text-slate-700 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white dark:focus:bg-slate-900 transition-all text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 block">
                    Agente Responsável
                  </label>
                  <select
                    value={assignedUser}
                    onChange={(e) => setAssignedUser(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white dark:focus:bg-slate-900 transition-all text-sm appearance-none cursor-pointer"
                    required
                  >
                    {allAvailableUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 block">
                    Nível de Prioridade
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Task['priority'])}
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white dark:focus:bg-slate-900 transition-all text-sm appearance-none cursor-pointer"
                    required
                  >
                    {priorityOptions.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/30 p-6 rounded-3xl border border-slate-100 dark:border-slate-800/50 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-10 h-6 rounded-full transition-colors ${isRecurring ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${isRecurring ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest group-hover:text-blue-500 transition-colors">
                  Ativar Recorrência de Ciclo
                </span>
              </label>

              {isRecurring && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                  <div className="col-span-full border-t border-slate-200 dark:border-slate-800 pt-4" />
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1.5 block">Tipo</label>
                    <select
                      value={recurrenceType}
                      onChange={(e) => setRecurrenceType(e.target.value as Task['recurrence']['type'])}
                      className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 text-xs font-bold"
                    >
                      {recurrenceTypeOptions.map(type => (
                        <option key={type} value={type}>
                          {type === 'none' ? 'Nenhuma' : 
                           type === 'daily' ? 'Diária' :
                           type === 'weekly' ? 'Semanal' :
                           type === 'monthly' ? 'Mensal' :
                           type === 'annually' ? 'Anual' : type}
                        </option>
                      ))}
                    </select>
                  </div>
                  {recurrenceType !== 'none' && (
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase mb-1.5 block">Intervalo</label>
                      <input
                        type="number"
                        min="1"
                        value={recurrenceInterval}
                        onChange={(e) => setRecurrenceInterval(parseInt(e.target.value) || 1)}
                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 text-xs font-bold"
                      />
                    </div>
                  )}

                  {recurrenceType === 'weekly' && (
                    <div className="col-span-full">
                      <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">Sincronização Semanal</label>
                      <div className="flex flex-wrap gap-2">
                        {daysOfWeekOptions.map(day => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => handleDayOfWeekChange(day.value, !recurrenceDaysOfWeek.includes(day.value))}
                            className={`px-3 py-2 rounded-lg text-[10px] font-black transition-all ${
                              recurrenceDaysOfWeek.includes(day.value)
                                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                                : 'bg-white dark:bg-slate-900 text-slate-400 border border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {recurrenceType === 'monthly' && (
                    <div className="col-span-full">
                      <label className="text-[9px] font-black text-slate-400 uppercase mb-1.5 block">Dia de Ativação</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={recurrenceDayOfMonth}
                        onChange={(e) => setRecurrenceDayOfMonth(parseInt(e.target.value) || 1)}
                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 text-xs font-bold"
                      />
                    </div>
                  )}

                  {recurrenceType !== 'none' && (
                    <div className="col-span-full">
                      <label className="text-[9px] font-black text-slate-400 uppercase mb-1.5 block">Data Final do Ciclo</label>
                      <input
                        type="date"
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 text-xs font-bold appearance-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4">
              <button 
                type="submit" 
                className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-2xl uppercase tracking-widest shadow-2xl hover:translate-y-[-2px] active:translate-y-[1px] transition-all flex items-center justify-center gap-3 text-sm group"
              >
                <Save size={18} className="group-hover:rotate-12 transition-transform" /> 
                Finalizar Configuração
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
