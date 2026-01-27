import React, { useState } from 'react';
import { X, Bug as BugIcon, AlertTriangle } from 'lucide-react';
import { Bug, User } from '../types';

interface BugFormProps {
  user: User;
  onClose: () => void;
  onSubmit: (bug: Omit<Bug, 'id' | 'createdAt' | 'reporter'>) => void;
  editingBug?: Bug | null;
}

export const BugForm: React.FC<BugFormProps> = ({ user, onClose, onSubmit, editingBug }) => {
  const [title, setTitle] = useState(editingBug?.title || '');
  const [description, setDescription] = useState(editingBug?.description || '');
  const [priority, setPriority] = useState<Bug['priority']>(editingBug?.priority || 'Médio');
  const [category, setCategory] = useState<Bug['category']>(editingBug?.category || 'Funcionalidade');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      alert('Por favor, insira um título para o bug.');
      return;
    }

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      priority,
      status: editingBug?.status || 'Aberto',
      category,
      screenshots: editingBug?.screenshots || [],
      resolvedAt: editingBug?.resolvedAt,
      resolvedBy: editingBug?.resolvedBy,
      resolutionNotes: editingBug?.resolutionNotes
    });
  };

  const priorityColors = {
    'Crítico': 'bg-red-100 border-red-300 text-red-800',
    'Alto': 'bg-orange-100 border-orange-300 text-orange-800',
    'Médio': 'bg-yellow-100 border-yellow-300 text-yellow-800',
    'Baixo': 'bg-slate-100 border-slate-300 text-slate-800'
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-600 text-white rounded-xl">
                <BugIcon size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  {editingBug ? 'Editar Bug' : 'Reportar Bug'}
                </h2>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Relate problemas encontrados no sistema
                </p>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Title */}
          <div>
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
              Título do Bug *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              placeholder="Descreva o problema brevemente"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
              Descrição Detalhada
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all resize-none"
              rows={5}
              placeholder="Descreva o que aconteceu, quando ocorreu e como reproduzir o problema..."
            />
          </div>

          {/* Priority and Category */}
          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
                Prioridade
              </label>
              <div className="space-y-2">
                {(['Crítico', 'Alto', 'Médio', 'Baixo'] as Bug['priority'][]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`w-full px-4 py-2 rounded-xl border-2 font-bold text-sm uppercase tracking-wide transition-all ${
                      priority === p
                        ? priorityColors[p]
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Bug['category'])}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              >
                <option value="Interface">Interface</option>
                <option value="Funcionalidade">Funcionalidade</option>
                <option value="Performance">Performance</option>
                <option value="Dados">Dados</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
          </div>

          {/* Info Alert */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 rounded-xl">
            <AlertTriangle size={18} className="text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-bold text-blue-900 dark:text-blue-300">
                Seu reporte será analisado pela equipe técnica. Bugs críticos são priorizados.
              </p>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-black text-sm uppercase tracking-wide hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-black text-sm uppercase tracking-wide shadow-lg hover:shadow-xl transition-all"
          >
            {editingBug ? 'Salvar Alterações' : 'Enviar Reporte'}
          </button>
        </div>
      </div>
    </div>
  );
};
