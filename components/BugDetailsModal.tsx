import React, { useState } from 'react';
import { X, Bug as BugIcon, User as UserIcon, Calendar, CheckCircle, Trash2 } from 'lucide-react';
import { Bug, User } from '../types';

interface BugDetailsModalProps {
  bug: Bug;
  user: User;
  users: User[];
  onClose: () => void;
  onUpdate: (updatedBug: Bug) => void;
  onDelete?: (bugId: string) => void;
}

export const BugDetailsModal: React.FC<BugDetailsModalProps> = ({ 
  bug, 
  user, 
  users, 
  onClose,
  onUpdate,
  onDelete
}) => {
  const isAdmin = user.role === 'Administrador';
  const [showResolutionForm, setShowResolutionForm] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState(bug.resolutionNotes || '');
  const [newStatus, setNewStatus] = useState<Bug['status']>(bug.status);

  const reporter = users.find(u => u.id === bug.reporter);
  const resolver = bug.resolvedBy ? users.find(u => u.id === bug.resolvedBy) : null;

  const priorityColors = {
    'Crítico': 'bg-red-600',
    'Alto': 'bg-orange-600',
    'Médio': 'bg-yellow-600',
    'Baixo': 'bg-slate-500'
  };

  const statusColors = {
    'Aberto': 'text-blue-600',
    'Em Análise': 'text-purple-600',
    'Resolvido': 'text-green-600',
    'Fechado': 'text-slate-500'
  };

  const handleStatusChange = async () => {
    const updatedBug: Bug = {
      ...bug,
      status: newStatus,
      ...(newStatus === 'Resolvido' && {
        resolvedAt: new Date().toISOString(),
        resolvedBy: user.id,
        resolutionNotes: resolutionNotes.trim()
      })
    };
    onUpdate(updatedBug);
  };

  const handleDelete = () => {
    if (window.confirm('Tem certeza que deseja deletar este bug? Esta ação não pode ser desfeita.')) {
      onDelete?.(bug.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4 flex-1">
              <div className={`p-3 ${priorityColors[bug.priority]} text-white rounded-xl`}>
                <BugIcon size={24} />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  {bug.title}
                </h2>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`px-3 py-1 ${priorityColors[bug.priority]} text-white rounded-lg text-xs font-black uppercase`}>
                    {bug.priority}
                  </span>
                  <span className={`text-sm font-bold ${statusColors[bug.status]}`}>
                    {bug.status}
                  </span>
                  {bug.category && (
                    <span className="text-xs font-bold text-slate-500 bg-white dark:bg-slate-800 px-2 py-1 rounded-md">
                      {bug.category}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/80 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-240px)]">
          {/* Description */}
          {bug.description && (
            <div>
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Descrição</h3>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {bug.description}
              </p>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <UserIcon size={16} className="text-slate-400" />
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase">Reportado por</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {reporter?.name || 'Desconhecido'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-slate-400" />
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase">Data</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {new Date(bug.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>

          {/* Resolution Info */}
          {bug.status === 'Resolvido' && bug.resolutionNotes && (
            <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 rounded-xl">
              <div className="flex items-start gap-3">
                <CheckCircle size={18} className="text-green-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-xs font-black text-green-900 dark:text-green-300 uppercase mb-1">Resolução</h3>
                  <p className="text-sm font-medium text-green-800 dark:text-green-400">
                    {bug.resolutionNotes}
                  </p>
                  {resolver && bug.resolvedAt && (
                    <p className="text-xs font-bold text-green-600 dark:text-green-500 mt-2">
                      Resolvido por {resolver.name} em {new Date(bug.resolvedAt).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Admin Actions */}
          {isAdmin && bug.status !== 'Fechado' && (
            <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
              <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">
                Ações do Administrador
              </h3>
              
              {/* Status Change */}
              <div className="spaceselect-none mb-4">
                <label className="block text-xs font-black text-slate-600 dark:text-slate-400 mb-2 uppercase">
                  Alterar Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as Bug['status'])}
                  className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="Aberto">Aberto</option>
                  <option value="Em Análise">Em Análise</option>
                  <option value="Resolvido">Resolvido</option>
                  <option value="Fechado">Fechado</option>
                </select>
              </div>

              {/* Resolution Form */}
              {newStatus === 'Resolvido' && (
                <div className="mb-4">
                  <label className="block text-xs font-black text-slate-600 dark:text-slate-400 mb-2 uppercase">
                    Notas de Resolução *
                  </label>
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                    rows={3}
                    placeholder="Descreva como o problema foi resolvido..."
                    required
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleStatusChange}
                  disabled={newStatus === 'Resolvido' && !resolutionNotes.trim()}
                  className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-black text-sm uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Atualizar Status
                </button>
                {onDelete && (
                  <button
                    onClick={handleDelete}
                    className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm uppercase tracking-wide transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
