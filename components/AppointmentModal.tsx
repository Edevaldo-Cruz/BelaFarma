import React, { useState, useEffect } from 'react';
import { 
  X, 
  Calendar as CalendarIcon, 
  Clock, 
  Tag, 
  User, 
  MapPin, 
  Repeat, 
  Bell, 
  Lock, 
  Globe, 
  Trash2, 
  Check, 
  AlertTriangle,
  Building,
  UserCheck
} from 'lucide-react';
import { 
  Appointment, 
  AppointmentCategory, 
  AppointmentStatus, 
  AppointmentVisibility, 
  RecurrenceType, 
  User as UserType 
} from '../types';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (appointment: Partial<Appointment>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  appointmentToEdit?: Appointment | null;
  initialDate?: Date;
  initialHour?: number;
  currentUser: UserType;
}

const CATEGORY_COLORS: Record<AppointmentCategory, string> = {
  'Geral': '#3B82F6', // Blue
  'Reunião': '#8B5CF6', // Purple
  'Cliente': '#10B981', // Emerald
  'Fornecedor': '#F59E0B', // Amber
  'Serviço Farmacêutico': '#EC4899', // Pink
  'Pessoal': '#6366F1', // Indigo
  'Lembrete': '#06B6D4', // Cyan
  'Entrega': '#14B8A6', // Teal
  'Outros': '#6B7280' // Gray
};

const COLOR_PRESETS = [
  { name: 'Azul', hex: '#3B82F6' },
  { name: 'Verde', hex: '#10B981' },
  { name: 'Roxo', hex: '#8B5CF6' },
  { name: 'Laranja', hex: '#F59E0B' },
  { name: 'Rosa', hex: '#EC4899' },
  { name: 'Vermelho', hex: '#EF4444' },
  { name: 'Ciano', hex: '#06B6D4' },
  { name: 'Cinza', hex: '#6B7280' },
];

export const AppointmentModal: React.FC<AppointmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  appointmentToEdit,
  initialDate,
  initialHour,
  currentUser
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDateStr, setStartDateStr] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('09:00');
  const [endDateStr, setEndDateStr] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [category, setCategory] = useState<AppointmentCategory>('Geral');
  const [color, setColor] = useState('#3B82F6');
  const [status, setStatus] = useState<AppointmentStatus>('Pendente');
  const [visibility, setVisibility] = useState<AppointmentVisibility>('Public');
  const [assignedToName, setAssignedToName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [location, setLocation] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceType>('none');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState(15);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  useEffect(() => {
    if (appointmentToEdit) {
      setTitle(appointmentToEdit.title || '');
      setDescription(appointmentToEdit.description || '');
      setAllDay(!!appointmentToEdit.allDay);
      setCategory(appointmentToEdit.category || 'Geral');
      setColor(appointmentToEdit.color || CATEGORY_COLORS[appointmentToEdit.category || 'Geral']);
      setStatus(appointmentToEdit.status || 'Pendente');
      setVisibility(appointmentToEdit.visibility || 'Public');
      setAssignedToName(appointmentToEdit.assignedToName || '');
      setCustomerName(appointmentToEdit.customerName || '');
      setSupplierName(appointmentToEdit.supplierName || '');
      setLocation(appointmentToEdit.location || '');
      setRecurrence(appointmentToEdit.recurrence || 'none');
      setRecurrenceEndDate(appointmentToEdit.recurrenceEndDate ? appointmentToEdit.recurrenceEndDate.substring(0, 10) : '');
      setReminderMinutes(appointmentToEdit.reminderMinutes !== undefined ? appointmentToEdit.reminderMinutes : 15);

      if (appointmentToEdit.startDate) {
        const dStart = new Date(appointmentToEdit.startDate);
        setStartDateStr(dStart.toISOString().substring(0, 10));
        setStartTimeStr(dStart.toTimeString().substring(0, 5));
      }
      if (appointmentToEdit.endDate) {
        const dEnd = new Date(appointmentToEdit.endDate);
        setEndDateStr(dEnd.toISOString().substring(0, 10));
        setEndTimeStr(dEnd.toTimeString().substring(0, 5));
      }
    } else {
      // Default to initialDate or today
      const baseDate = initialDate ? new Date(initialDate) : new Date();
      const dateStr = baseDate.toISOString().substring(0, 10);
      
      let startH = initialHour !== undefined ? initialHour : baseDate.getHours();
      if (initialHour === undefined && baseDate.getMinutes() > 30) startH += 1;
      const endH = (startH + 1) % 24;

      const formattedStartH = String(startH).padStart(2, '0') + ':00';
      const formattedEndH = String(endH).padStart(2, '0') + ':00';

      setTitle('');
      setDescription('');
      setStartDateStr(dateStr);
      setStartTimeStr(formattedStartH);
      setEndDateStr(dateStr);
      setEndTimeStr(formattedEndH);
      setAllDay(false);
      setCategory('Geral');
      setColor(CATEGORY_COLORS['Geral']);
      setStatus('Pendente');
      setVisibility('Public');
      setAssignedToName(currentUser.name || '');
      setCustomerName('');
      setSupplierName('');
      setLocation('');
      setRecurrence('none');
      setRecurrenceEndDate('');
      setReminderMinutes(15);
    }
    setShowConfirmDelete(false);
  }, [appointmentToEdit, initialDate, initialHour, isOpen, currentUser]);

  const handleCategoryChange = (newCat: AppointmentCategory) => {
    setCategory(newCat);
    setColor(CATEGORY_COLORS[newCat] || '#3B82F6');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const fullStartIso = allDay 
        ? `${startDateStr}T00:00:00.000Z`
        : new Date(`${startDateStr}T${startTimeStr}:00`).toISOString();
      
      const fullEndIso = allDay
        ? `${endDateStr || startDateStr}T23:59:59.999Z`
        : new Date(`${endDateStr || startDateStr}T${endTimeStr}:00`).toISOString();

      const payload: Partial<Appointment> = {
        title: title.trim(),
        description: description.trim(),
        startDate: fullStartIso,
        endDate: fullEndIso,
        allDay,
        category,
        color,
        status,
        visibility,
        createdById: appointmentToEdit ? appointmentToEdit.createdById : currentUser.id,
        createdByName: appointmentToEdit ? appointmentToEdit.createdByName : currentUser.name,
        assignedToName: assignedToName.trim() || undefined,
        customerName: customerName.trim() || undefined,
        supplierName: supplierName.trim() || undefined,
        location: location.trim() || undefined,
        recurrence,
        recurrenceEndDate: recurrenceEndDate ? `${recurrenceEndDate}T23:59:59.999Z` : undefined,
        reminderMinutes
      };

      if (appointmentToEdit) {
        payload.id = appointmentToEdit.id;
      }

      await onSave(payload);
      onClose();
    } catch (err) {
      console.error('Error saving appointment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!appointmentToEdit || !onDelete) return;
    setIsSubmitting(true);
    try {
      await onDelete(appointmentToEdit.id);
      onClose();
    } catch (err) {
      console.error('Error deleting appointment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div 
              className="w-4 h-8 rounded-full transition-colors shadow-sm"
              style={{ backgroundColor: color }}
            />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {appointmentToEdit ? 'Editar Compromisso' : 'Novo Compromisso'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Título do Compromisso *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Reunião com Distribuidora ou Atendimento Farmacêutico"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>

          {/* Category & Status Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-blue-500" />
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value as AppointmentCategory)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="Geral">Geral</option>
                <option value="Reunião">Reunião</option>
                <option value="Cliente">Cliente</option>
                <option value="Fornecedor">Fornecedor</option>
                <option value="Serviço Farmacêutico">Serviço Farmacêutico</option>
                <option value="Pessoal">Pessoal</option>
                <option value="Lembrete">Lembrete</option>
                <option value="Entrega">Entrega</option>
                <option value="Outros">Outros</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-emerald-500" />
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="Pendente">Pendente</option>
                <option value="Confirmado">Confirmado</option>
                <option value="Concluído">Concluído</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>
          </div>

          {/* Color Palette */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              Cor do Compromisso
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => setColor(preset.hex)}
                  className={`w-7 h-7 rounded-full transition-transform flex items-center justify-center ${
                    color === preset.hex ? 'scale-125 ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-slate-900' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: preset.hex }}
                  title={preset.name}
                >
                  {color === preset.hex && <Check className="w-4 h-4 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          {/* All Day & Date/Time Section */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4 text-blue-500" />
                Data e Horário
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                Dia Inteiro
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Start Date & Time */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Início</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    required
                    value={startDateStr}
                    onChange={(e) => setStartDateStr(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                  {!allDay && (
                    <input
                      type="time"
                      required
                      value={startTimeStr}
                      onChange={(e) => setStartTimeStr(e.target.value)}
                      className="w-28 px-2 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    />
                  )}
                </div>
              </div>

              {/* End Date & Time */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Fim</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    required
                    value={endDateStr}
                    onChange={(e) => setEndDateStr(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                  {!allDay && (
                    <input
                      type="time"
                      required
                      value={endTimeStr}
                      onChange={(e) => setEndTimeStr(e.target.value)}
                      className="w-28 px-2 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Visibility & Responsible Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                {visibility === 'Public' ? <Globe className="w-4 h-4 text-blue-500" /> : <Lock className="w-4 h-4 text-amber-500" />}
                Visibilidade
              </label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as AppointmentVisibility)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="Public">Público (Visível para toda a equipe)</option>
                <option value="Private">Privado (Visível apenas para mim e Admin)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <User className="w-4 h-4 text-purple-500" />
                Responsável
              </label>
              <input
                type="text"
                placeholder="Nome do responsável"
                value={assignedToName}
                onChange={(e) => setAssignedToName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Customer / Supplier / Location */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-emerald-500" /> Cliente Vinculado
              </label>
              <input
                type="text"
                placeholder="Nome do Cliente (opcional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-amber-500" /> Fornecedor Vinculado
              </label>
              <input
                type="text"
                placeholder="Nome do Fornecedor (opcional)"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-rose-500" /> Local / Link
              </label>
              <input
                type="text"
                placeholder="Ex: Sala de Reunião ou Link Meet"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Recurrence & Reminder Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Repeat className="w-4 h-4 text-indigo-500" />
                Repetição / Recorrência
              </label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as RecurrenceType)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="none">Não se repete</option>
                <option value="daily">Diariamente</option>
                <option value="weekly">Semanalmente</option>
                <option value="monthly">Mensalmente</option>
                <option value="yearly">Anualmente</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-cyan-500" />
                Lembrete de Alerta
              </label>
              <select
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value={0}>No momento do compromisso</option>
                <option value={5}>5 minutos antes</option>
                <option value={15}>15 minutos antes</option>
                <option value={30}>30 minutos antes</option>
                <option value={60}>1 hora antes</option>
                <option value={1440}>1 dia antes</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Descrição / Observações
            </label>
            <textarea
              rows={3}
              placeholder="Detalhes adicionais sobre o compromisso..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Delete Confirmation Box */}
          {showConfirmDelete && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex flex-col gap-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-semibold text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                Tem certeza que deseja excluir este compromisso?
              </div>
              <p className="text-xs text-red-600 dark:text-red-400">
                Esta ação removerá o compromisso da agenda permanentemente.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm"
                >
                  {isSubmitting ? 'Excluindo...' : 'Sim, Excluir'}
                </button>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
            <div>
              {appointmentToEdit && onDelete && !showConfirmDelete && (
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(true)}
                  className="px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !title.trim()}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {isSubmitting ? 'Salvando...' : 'Salvar Compromisso'}
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
