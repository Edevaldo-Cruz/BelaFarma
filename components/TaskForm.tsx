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
  const [assignedUser, setAssignedUser] = useState(task?.assignedUser || ''); // Default to empty string
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
    if (!task && !assignedUser) { // For new tasks, set default assigned user if none selected
      setAssignedUser(user.id); // Assign to current user by default
    }
    if (task && task.recurrence && task.recurrence.type !== 'none') {
      setIsRecurring(true);
    } else {
      setIsRecurring(false);
    }
  }, [task, assignedUser, user.id]);

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

            {/* Recurrence Options */}
            <div className="border-t border-slate-200 pt-4 mt-4">
              <label className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="form-checkbox"
                />
                Tarefa Recorrente
              </label>

              {isRecurring && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="text-xs font-black text-slate-400 uppercase mb-1 block">Tipo de Recorrência</label>
                    <select
                      value={recurrenceType}
                      onChange={(e) => setRecurrenceType(e.target.value as Task['recurrence']['type'])}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      {recurrenceTypeOptions.map(type => (
                        <option key={type} value={type}>{type === 'none' ? 'Nenhuma' : type.charAt(0).toUpperCase() + type.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  {recurrenceType !== 'none' && (
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase mb-1 block">Repetir a Cada</label>
                      <input
                        type="number"
                        min="1"
                        value={recurrenceInterval}
                        onChange={(e) => setRecurrenceInterval(parseInt(e.target.value) || 1)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                  )}

                  {recurrenceType === 'weekly' && (
                    <div className="col-span-2">
                      <label className="text-xs font-black text-slate-400 uppercase mb-1 block">Dias da Semana</label>
                      <div className="flex flex-wrap gap-2">
                        {daysOfWeekOptions.map(day => (
                          <label key={day.value} className="flex items-center gap-1 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={recurrenceDaysOfWeek.includes(day.value)}
                              onChange={(e) => handleDayOfWeekChange(day.value, e.target.checked)}
                              className="form-checkbox"
                            />
                            {day.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {recurrenceType === 'monthly' && (
                    <div className="col-span-2">
                      <label className="text-xs font-black text-slate-400 uppercase mb-1 block">Dia do Mês</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={recurrenceDayOfMonth}
                        onChange={(e) => setRecurrenceDayOfMonth(parseInt(e.target.value) || 1)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                  )}

                  {recurrenceType === 'annually' && (
                    <div className="col-span-2">
                      <label className="text-xs font-black text-slate-400 uppercase mb-1 block">Mês do Ano</label>
                      <select
                        value={recurrenceMonthOfYear}
                        onChange={(e) => setRecurrenceMonthOfYear(parseInt(e.target.value) || 1)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        {monthsOfYearOptions.map(month => (
                          <option key={month} value={month}>{new Date(0, month - 1).toLocaleString('pt-BR', { month: 'long' })}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {recurrenceType !== 'none' && (
                    <div className="col-span-2">
                      <label className="text-xs font-black text-slate-400 uppercase mb-1 block">Data de Término (Opcional)</label>
                      <input
                        type="date"
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                  )}
                </div>
              )}
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
