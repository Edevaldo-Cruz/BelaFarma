import React, { useState, useEffect } from 'react';
import { Task, User, UserRole } from '../types';
import { X, Pencil, Trash2, Flag, AlertCircle, Clock, MessageSquare, Bell, Plus, Archive, ClipboardCheck } from 'lucide-react';

interface TaskDetailsModalProps {
  task: Task;
  user: User; // Logged-in user
  users: User[]; // All users for display name
  onClose: () => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onAddAnnotation: (taskId: string, annotation: string) => void;
  onNotifyAdmin: (taskId: string, message: string) => void;
  onClearAdminAttention: (taskId: string, resolution?: string, markAsRead?: boolean) => void; // Updated
  onUpdateTaskStatus: (taskId: string, newStatus: Task['status']) => void;
  onArchiveTask: (taskId: string) => void;
}

const taskStatuses: Task['status'][] = ['A Fazer', 'Em Progresso', 'Pausada', 'Cancelada', 'Concluída'];

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ 
  task, 
  user, 
  users, 
  onClose, 
  onEdit, 
  onDelete, 
  onAddAnnotation, 
  onNotifyAdmin,
  onClearAdminAttention, // Destructure new prop
  onUpdateTaskStatus,
  onArchiveTask
}) => {
  const [annotation, setAnnotation] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [resolutionMessage, setResolutionMessage] = useState(''); // New state
  const [showAnnotationInput, setShowAnnotationInput] = useState(false);
  const [showNotificationInput, setShowNotificationInput] = useState(false);
  const [showResolutionInput, setShowResolutionInput] = useState(false); // New state
  const [currentStatus, setCurrentStatus] = useState<Task['status']>(task.status); // Local state for status

  useEffect(() => {
    setCurrentStatus(task.status); // Update local state if task prop changes
  }, [task.status]);

  const isAdmin = user.role === 'Administrador';
  const isAssignedToMe = task.assignedUser === user.id;
  const isCreator = task.creator === user.id;

  const canEdit = isCreator; // Only creator can edit
  const canDelete = isCreator; // Only creator can delete
  const canChangeStatus = isAdmin || isAssignedToMe; // Admin or assigned user can change status
  const canArchive = task.status === 'Concluída' && !task.isArchived; // Only completed and not archived tasks can be archived

  const assignedUserName = task.assignedUser === 'all_users' 
    ? 'Todos os Usuários' 
    : users.find(u => u.id === task.assignedUser)?.name || 'Desconhecido';
  
  const creatorName = users.find(u => u.id === task.creator)?.name || 'Desconhecido';

  const dueDate = new Date(task.dueDate);
  const creationDate = new Date(task.creationDate);

  const now = new Date();
  const timeDiff = dueDate.getTime() - now.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  const isOverdue = timeDiff < 0 && task.status !== 'Concluída' && task.status !== 'Cancelada';
  const isNearDeadline = daysDiff <= 1 && daysDiff > 0 && task.status !== 'Concluída' && task.status !== 'Cancelada';

  useEffect(() => {
    if (task.hasAdminResponse && (isAssignedToMe || (isCreator && !task.needsAdminAttention))) {
        onClearAdminAttention(task.id, undefined, true);
    }
  }, [task.id, task.hasAdminResponse]);

  const priorityBadgeColors: { [key: string]: string } = {
    'Muito Urgente': 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-900/50',
    'Urgente': 'bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-900/50',
    'Normal': 'bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-900/50',
    'Sem Prioridade': 'bg-slate-500/10 text-slate-600 border-slate-200 dark:border-slate-800',
  };

  const handleAddAnnotationClick = () => {
    if (annotation.trim()) {
      onAddAnnotation(task.id, annotation);
      setAnnotation('');
      setShowAnnotationInput(false);
    }
  };

  const handleNotifyAdminClick = () => {
    if (notificationMessage.trim()) {
      onNotifyAdmin(task.id, notificationMessage);
      setNotificationMessage('');
      setShowNotificationInput(false);
    }
  };

  const handleChangeStatus = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as Task['status'];
    setCurrentStatus(newStatus);
    onUpdateTaskStatus(task.id, newStatus);
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 dark:bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300"
      onKeyDown={(e) => { if(e.key === 'Escape') onClose(); }}
    >
      <div className="bg-white dark:bg-slate-950 w-full max-w-2xl rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] dark:shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-md border ${priorityBadgeColors[task.priority]}`}>
                  {task.priority}
                </span>
                {task.needsAdminAttention && (
                   <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-md bg-amber-500 text-white animate-pulse">
                     <Bell size={10} /> Atenção
                   </span>
                )}
                {task.hasAdminResponse && !task.needsAdminAttention && (
                   <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-md bg-emerald-500 text-white">
                     <ClipboardCheck size={10} /> Soluído
                   </span>
                )}
              </div>
              <h2 className="text-3xl font-black uppercase text-slate-900 dark:text-white leading-tight tracking-tighter">
                {task.title}
              </h2>
            </div>
            <button 
              onClick={onClose} 
              className="p-3 bg-slate-50 dark:bg-slate-900 text-slate-400 hover:text-red-600 rounded-2xl transition-all hover:rotate-90"
            >
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800">
            <div className="space-y-4">
              <div>
                <p className="font-black text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-widest mb-1">Descrição</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 leading-relaxed">{task.description || 'Nenhuma descrição técnica.'}</p>
              </div>
              <div>
                <p className="font-black text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-widest mb-1">Responsável</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[8px] font-black">
                    {assignedUserName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                  </span>
                  {assignedUserName}
                </p>
              </div>
              <div>
                <p className="font-black text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-widest mb-1">Criador</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-400 italic">{creatorName}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="font-black text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-widest mb-1">Status do Operacional</p>
                {canChangeStatus ? (
                  <div className="relative group">
                    <select 
                      value={currentStatus} 
                      onChange={handleChangeStatus}
                      className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black uppercase appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer text-slate-900 dark:text-white"
                    >
                      {taskStatuses.map(statusOption => (
                        <option key={statusOption} value={statusOption}>{statusOption}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <Plus size={14} className="rotate-45" />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-black uppercase text-slate-900 dark:text-white">{currentStatus}</p>
                )}
              </div>
              <div>
                <p className="font-black text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-widest mb-1">Prazos e Datas</p>
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-bold text-slate-500">Início: {creationDate.toLocaleDateString('pt-BR')}</p>
                  <p className={`text-xs font-black uppercase ${isOverdue ? 'text-red-500' : isNearDeadline ? 'text-orange-500' : 'text-slate-900 dark:text-white'}`}>
                    Entrega: {dueDate.toLocaleDateString('pt-BR')}
                    {isOverdue && " [ATRASADA]"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Seção de Notificação Administrativa e Resolução */}
          {(task.adminAttentionMessage || task.adminResolutionMessage) && (
            <div className={`p-6 rounded-3xl border space-y-4 animate-in slide-in-from-top-4 duration-500 ${task.needsAdminAttention ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50' : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30'}`}>
              
              {/* Solicitação Original */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className={`text-xs font-black uppercase tracking-widest flex items-center gap-2 ${task.needsAdminAttention ? 'text-amber-700 dark:text-amber-500' : 'text-slate-500'}`}>
                    <Bell size={14} /> Solicitação de Atenção
                  </h3>
                  {isCreator && task.needsAdminAttention && !showResolutionInput && (
                    <button 
                      onClick={() => setShowResolutionInput(true)}
                      className="px-3 py-1 bg-amber-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-amber-700 transition-colors shadow-lg shadow-amber-600/20"
                    >
                      Responder e Resolver
                    </button>
                  )}
                </div>
                <div className={`p-4 rounded-2xl border italic text-sm font-bold ${task.needsAdminAttention ? 'bg-white/50 dark:bg-slate-900/50 border-amber-100 dark:border-amber-900/30 text-slate-800 dark:text-slate-200' : 'bg-slate-100/50 dark:bg-slate-800/50 border-emerald-100 dark:border-emerald-900/10 text-slate-500'}`}>
                   "{task.adminAttentionMessage}"
                </div>
              </div>

              {/* Resposta do Criador */}
              {task.adminResolutionMessage && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <h3 className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-500 flex items-center gap-2">
                    <ClipboardCheck size={14} /> Resposta da Gestão
                  </h3>
                  <div className="p-4 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-2xl border border-emerald-500/20 text-sm font-bold text-emerald-900 dark:text-emerald-100">
                    {task.adminResolutionMessage}
                  </div>
                </div>
              )}

              {showResolutionInput && (
                 <div className="space-y-3 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-800 animate-in zoom-in-95 duration-200 shadow-xl">
                    <p className="text-[10px] font-black uppercase text-slate-400">Descreva a Solução</p>
                    <textarea
                      value={resolutionMessage}
                      onChange={(e) => setResolutionMessage(e.target.value)}
                      placeholder="Instruções para o operador..."
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-white min-h-[80px]"
                    />
                    <div className="flex gap-2">
                       <button 
                         onClick={() => {
                           onClearAdminAttention(task.id, resolutionMessage);
                           setShowResolutionInput(false);
                           setResolutionMessage('');
                         }}
                         disabled={!resolutionMessage.trim()}
                         className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50"
                       >
                         Enviar Solução
                       </button>
                       <button 
                         onClick={() => setShowResolutionInput(false)}
                         className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-black uppercase text-[10px] tracking-widest"
                       >
                         Cancelar
                       </button>
                    </div>
                 </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              <MessageSquare size={16} /> Diário de Bordo
            </h3>
            <div className="max-h-[200px] overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {task.annotations && task.annotations.length > 0 ? (
                (task.annotations as { timestamp: string; text: string; userName: string; }[]).map((ann, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-900/80 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-black text-slate-900 dark:text-slate-300 uppercase">{ann.userName}</span>
                      <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{new Date(ann.timestamp).toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{ann.text}</p>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
                  <p className="text-xs font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest">Sem registros no log.</p>
                </div>
              )}
            </div>

            {(isAssignedToMe || isAdmin) && (
              <div className="pt-2">
                {!showAnnotationInput ? (
                  <button 
                    onClick={() => setShowAnnotationInput(true)} 
                    className="w-full py-3 bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={14} /> Adicionar Nova Nota
                  </button>
                ) : (
                  <div className="space-y-3 animate-in zoom-in-95 duration-200">
                    <textarea
                      value={annotation}
                      onChange={(e) => setAnnotation(e.target.value)}
                      placeholder="Relate o progresso ou dúvidas..."
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl min-h-[100px] text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-slate-300"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleAddAnnotationClick} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all">Salvar Nota</button>
                      <button onClick={() => setShowAnnotationInput(false)} className="px-6 py-4 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-6 mt-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-3">
             {(isAssignedToMe || isCreator) && (
              <button 
                onClick={() => setShowNotificationInput(!showNotificationInput)} 
                className={`py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 ${showNotificationInput ? 'bg-amber-600 text-white' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 hover:bg-amber-200'}`}
              >
                <AlertCircle size={14} /> {showNotificationInput ? 'Cancelar' : 'Solicitar Atenção'}
              </button>
            )}
            {canArchive && (
              <button onClick={() => { onArchiveTask(task.id); onClose(); }} className="py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                <Archive size={14} /> Arquivar
              </button>
            )}
            {canEdit && (
              <button onClick={() => { onEdit(task); onClose(); }} className="py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black uppercase text-[10px] tracking-widest hover:translate-y-[-2px] transition-all shadow-xl shadow-slate-900/20 dark:shadow-white/10 flex items-center justify-center gap-2">
                <Pencil size={14} /> Editar
              </button>
            )}
            {canDelete && (
              <button onClick={() => { onDelete(task.id); onClose(); }} className="py-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-100 transition-all flex items-center justify-center gap-2">
                <Trash2 size={14} /> Excluir
              </button>
            )}
          </div>

          {showNotificationInput && (
            <div className="mt-4 p-5 bg-amber-50 dark:bg-amber-950/20 rounded-3xl border border-amber-100 dark:border-amber-900/30 space-y-3 animate-in zoom-in-95 duration-200">
               <textarea
                value={notificationMessage}
                onChange={(e) => setNotificationMessage(e.target.value)}
                placeholder="Qual o problema? O criador da tarefa será notificado."
                className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-2xl text-sm font-bold text-slate-900 dark:text-white"
              />
              <button 
                onClick={handleNotifyAdminClick} 
                className="w-full py-3 bg-amber-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-amber-600/30"
              >
                Enviar Aviso Tático
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
