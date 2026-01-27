import React, { useState } from 'react';
import { X, MapPin } from 'lucide-react';
import { User, FlyeringTask } from '../types';

interface FlyeringTaskModalProps {
  users: User[];
  currentUser: User;
  geometryType: 'polyline' | 'polygon';
  onClose: () => void;
  onSave: (taskData: Omit<FlyeringTask, 'id' | 'createdAt' | 'createdBy' | 'color' | 'type' | 'coordinates'>) => void;
}

export const FlyeringTaskModal: React.FC<FlyeringTaskModalProps> = ({
  users,
  currentUser,
  geometryType,
  onClose,
  onSave,
}) => {
  const [assignedUserId, setAssignedUserId] = useState<string>(currentUser.id);
  const [description, setDescription] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState<FlyeringTask['status']>('Pendente');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!assignedUserId) {
      alert('Selecione um usuário responsável.');
      return;
    }

    onSave({
      assignedUserId,
      description: description.trim() || undefined,
      area: area.trim() || undefined,
      status,
    });
  };

  const geometryLabel = geometryType === 'polyline' ? 'Rua/Linha' : 'Área/Quarteirão';

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                Nova Área de Panfletagem
              </h2>
              <p className="text-xs text-slate-500 font-bold">
                Tipo: {geometryLabel}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Usuário Responsável */}
          <div>
            <label className="block text-sm font-black text-slate-700 uppercase tracking-wide mb-2">
              Usuário Responsável *
            </label>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              required
            >
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role})
                </option>
              ))}
            </select>
          </div>

          {/* Nome da Área */}
          <div>
            <label className="block text-sm font-black text-slate-700 uppercase tracking-wide mb-2">
              Nome da Área
            </label>
            <input
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Ex: Quarteirão Central, Rua Principal..."
              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-black text-slate-700 uppercase tracking-wide mb-2">
              Descrição/Observações
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Instruções específicas, pontos de referência..."
              rows={3}
              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-black text-slate-700 uppercase tracking-wide mb-2">
              Status Inicial
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as FlyeringTask['status'])}
              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
            >
              <option value="Pendente">⏳ Pendente</option>
              <option value="Em Andamento">🔄 Em Andamento</option>
              <option value="Concluído">✅ Concluído</option>
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-black uppercase text-sm hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-black uppercase text-sm shadow-lg hover:shadow-xl hover:scale-105 transition-all"
            >
              Criar Área
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
