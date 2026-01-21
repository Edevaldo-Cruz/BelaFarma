import React, { useState, useEffect } from 'react';
import { Task, User } from '../types';
import { X, Pencil, Trash2, Flag, AlertCircle, Clock, MessageSquare, Bell } from 'lucide-react';

interface TaskDetailsModalProps {
  task: Task;
  user: User; // Logged-in user
  users: User[]; // All users for display name
  onClose: () => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onAddAnnotation: (taskId: string, annotation: string) => void;
  onNotifyAdmin: (taskId: string, message: string) => void;
}

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ 
  task, 
  user, 
  users, 
  onClose, 
  onEdit, 
  onDelete, 
  onAddAnnotation, 
  onNotifyAdmin 
}) => {
  const [annotation, setAnnotation] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [showAnnotationInput, setShowAnnotationInput] = useState(false);
  const [showNotificationInput, setShowNotificationInput] = useState(false);

  const isAdmin = user.role === 'Administrador';
  const isAssignedToMe = task.assignedUser === user.id;
  const isCreator = task.creator === user.id;

  const canEdit = isAdmin || isAssignedToMe || isCreator; // Admins, assignees, and creators can edit
  const canDelete = isAdmin; // Only admin can delete

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

  const priorityBadgeColors: { [key: string]: string } = {
    'Muito Urgente': 'bg-red-500',
    'Urgente': 'bg-orange-500',
    'Normal': 'bg-blue-500',
    'Sem Prioridade': 'bg-gray-500',
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onKeyDown={(e) => { if(e.key === 'Escape') onClose(); }}>
      <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl border-4 border-red-500 overflow-hidden">
        <div className="p-8 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-black uppercase text-slate-800 flex items-center gap-2">
              <Flag size={24} /> {task.title}
            </h2>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-600 rounded-full">
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm text-slate-700">
            <div>
              <p className="font-bold text-slate-500 uppercase text-xs">Descrição:</p>
              <p>{task.description || 'Nenhuma descrição.'}</p>
            </div>
            <div>
              <p className="font-bold text-slate-500 uppercase text-xs">Atribuído a:</p>
              <p>{assignedUserName}</p>
            </div>
            <div>
              <p className="font-bold text-slate-500 uppercase text-xs">Criado por:</p>
              <p>{creatorName}</p>
            </div>
            <div>
              <p className="font-bold text-slate-500 uppercase text-xs">Prioridade:</p>
              <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full text-white ${priorityBadgeColors[task.priority] || 'bg-gray-500'}`}>
                {task.priority}
              </span>
            </div>
            <div>
              <p className="font-bold text-slate-500 uppercase text-xs">Status:</p>
              <p>{task.status}</p>
            </div>
            <div>
              <p className="font-bold text-slate-500 uppercase text-xs">Data de Criação:</p>
              <p>{creationDate.toLocaleDateString('pt-BR')}</p>
            </div>
            <div>
              <p className="font-bold text-slate-500 uppercase text-xs">Prazo:</p>
              <p className={`font-bold ${isOverdue ? 'text-red-600' : isNearDeadline ? 'text-orange-600' : 'text-slate-700'}`}>
                {dueDate.toLocaleDateString('pt-BR')}
                {isOverdue && <span className="ml-2 text-red-500">(Atrasada!)</span>}
                {isNearDeadline && !isOverdue && <span className="ml-2 text-orange-500">(Vence em {daysDiff} dia(s))</span>}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6 mt-6 space-y-4">
            <h3 className="text-lg font-black uppercase text-slate-800 flex items-center gap-2">
              <MessageSquare size={20} /> Anotações
            </h3>
            {/* Display existing annotations here if task.annotations exists */}
            {task.annotations && task.annotations.length > 0 ? (
              <div className="space-y-2">
                {(task.annotations as { timestamp: string; text: string; userName: string; }[]).map((ann, idx) => (
                  <p key={idx} className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="font-bold">{ann.userName}</span> ({new Date(ann.timestamp).toLocaleString()}): {ann.text}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Nenhuma anotação ainda.</p>
            )}

            {(isAssignedToMe || isAdmin) && ( // Only assignee or admin can add annotations
              <>
                <button 
                  onClick={() => setShowAnnotationInput(!showAnnotationInput)} 
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200 transition-colors flex items-center gap-2"
                >
                  <Plus size={16} /> Adicionar Anotação
                </button>
                {showAnnotationInput && (
                  <div className="space-y-2 mt-2">
                    <textarea
                      value={annotation}
                      onChange={(e) => setAnnotation(e.target.value)}
                      placeholder="Adicione suas anotações aqui..."
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl min-h-[80px]"
                    />
                    <button 
                      onClick={handleAddAnnotationClick} 
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-sm hover:bg-blue-700 transition-colors"
                    >
                      Salvar Anotação
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {(isAssignedToMe || isCreator) && ( // Only assignee or creator can notify admin
            <div className="border-t border-slate-200 pt-6 mt-6 space-y-4">
              <h3 className="text-lg font-black uppercase text-slate-800 flex items-center gap-2">
                <Bell size={20} /> Notificar Administrador
              </h3>
              <p className="text-sm text-slate-600">
                Se há um problema ou necessidade de atenção especial, você pode notificar o administrador.
              </p>
              <button 
                onClick={() => setShowNotificationInput(!showNotificationInput)} 
                className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-semibold hover:bg-yellow-200 transition-colors flex items-center gap-2"
              >
                <AlertCircle size={16} /> Enviar Notificação
              </button>
              {showNotificationInput && (
                <div className="space-y-2 mt-2">
                  <textarea
                    value={notificationMessage}
                    onChange={(e) => setNotificationMessage(e.target.value)}
                    placeholder="Descreva o problema ou o que o administrador precisa saber..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl min-h-[80px]"
                  />
                  <button 
                    onClick={handleNotifyAdminClick} 
                    className="px-6 py-3 bg-yellow-600 text-white rounded-xl font-black uppercase text-sm hover:bg-yellow-700 transition-colors"
                  >
                    Enviar Notificação
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-slate-200 pt-6 mt-6 flex justify-end gap-3">
            {canDelete && (
              <button onClick={() => { onDelete(task.id); onClose(); }} className="px-5 py-3 bg-red-600 text-white rounded-xl font-black uppercase text-sm shadow-md hover:bg-red-700 transition-colors flex items-center gap-2">
                <Trash2 size={16} /> Excluir
              </button>
            )}
            {canEdit && (
              <button onClick={() => { onEdit(task); onClose(); }} className="px-5 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-sm shadow-md hover:bg-blue-700 transition-colors flex items-center gap-2">
                <Pencil size={16} /> Editar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
