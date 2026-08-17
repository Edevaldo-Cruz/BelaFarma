import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Search, 
  Filter, 
  Clock, 
  MapPin, 
  User, 
  Tag, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  List, 
  Grid, 
  CalendarDays, 
  CalendarRange, 
  Lock, 
  Globe,
  RefreshCw,
  Building
} from 'lucide-react';
import { 
  Appointment, 
  AppointmentCategory, 
  AppointmentStatus, 
  User as UserType, 
  UserRole 
} from '../types';
import { AppointmentModal } from './AppointmentModal';
import { useToast } from './ToastContext';

interface AgendaCalendarProps {
  currentUser: UserType;
  users?: UserType[];
}

type CalendarViewMode = 'month' | 'week' | 'day' | 'list';

const CATEGORY_COLORS: Record<string, string> = {
  'Geral': '#3B82F6',
  'Reunião': '#8B5CF6',
  'Cliente': '#10B981',
  'Fornecedor': '#F59E0B',
  'Serviço Farmacêutico': '#EC4899',
  'Pessoal': '#6366F1',
  'Lembrete': '#06B6D4',
  'Entrega': '#14B8A6',
  'Outros': '#6B7280'
};

export const AgendaCalendar: React.FC<AgendaCalendarProps> = ({ currentUser, users = [] }) => {
  const { showToast } = useToast();
  
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedAssignedUser, setSelectedAssignedUser] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [appointmentToEdit, setAppointmentToEdit] = useState<Appointment | null>(null);
  const [modalInitialDate, setModalInitialDate] = useState<Date | undefined>(undefined);
  const [modalInitialHour, setModalInitialHour] = useState<number | undefined>(undefined);

  // Fetch appointments from API
  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('userId', currentUser.id);
      params.append('userName', currentUser.name);
      params.append('userRole', currentUser.role);

      const res = await fetch(`/api/appointments?${params.toString()}`);
      if (!res.ok) throw new Error('Falha ao carregar compromissos');
      const data = await res.json();
      setAppointments(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching appointments:', err);
      showToast('Erro ao carregar compromissos da agenda.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [currentUser]);

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter(appt => {
      // Category filter
      if (selectedCategory !== 'all' && appt.category !== selectedCategory) {
        return false;
      }
      // Status filter
      if (selectedStatus !== 'all' && appt.status !== selectedStatus) {
        return false;
      }
      // Assigned user filter
      if (selectedAssignedUser !== 'all') {
        if (selectedAssignedUser === 'mine') {
          if (appt.assignedToId !== currentUser.id && appt.assignedToName !== currentUser.name && appt.createdById !== currentUser.id) {
            return false;
          }
        } else {
          if (appt.assignedToId !== selectedAssignedUser && appt.assignedToName !== selectedAssignedUser) {
            return false;
          }
        }
      }

      // Search term filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesTitle = appt.title.toLowerCase().includes(term);
        const matchesDesc = appt.description?.toLowerCase().includes(term);
        const matchesLoc = appt.location?.toLowerCase().includes(term);
        const matchesCust = appt.customerName?.toLowerCase().includes(term);
        const matchesSupp = appt.supplierName?.toLowerCase().includes(term);
        const matchesResp = appt.assignedToName?.toLowerCase().includes(term);
        if (!matchesTitle && !matchesDesc && !matchesLoc && !matchesCust && !matchesSupp && !matchesResp) {
          return false;
        }
      }
      return true;
    });
  }, [appointments, selectedCategory, selectedStatus, searchTerm]);

  // Handlers
  const handleSaveAppointment = async (apptData: Partial<Appointment>) => {
    try {
      const isEditing = !!apptData.id;
      const url = isEditing ? `/api/appointments/${apptData.id}` : '/api/appointments';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apptData)
      });

      if (!res.ok) throw new Error('Erro ao salvar compromisso');
      
      showToast(isEditing ? 'Compromisso atualizado!' : 'Compromisso criado com sucesso!', 'success');
      await fetchAppointments();
    } catch (err: any) {
      console.error('Save appointment error:', err);
      showToast(err.message || 'Erro ao salvar compromisso', 'error');
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    try {
      const res = await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir compromisso');
      
      showToast('Compromisso excluído com sucesso!', 'success');
      await fetchAppointments();
    } catch (err: any) {
      console.error('Delete appointment error:', err);
      showToast(err.message || 'Erro ao excluir compromisso', 'error');
    }
  };

  const handleOpenCreateModal = (date?: Date, hour?: number) => {
    setAppointmentToEdit(null);
    setModalInitialDate(date || currentDate);
    setModalInitialHour(hour);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (appt: Appointment, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAppointmentToEdit(appt);
    setIsModalOpen(true);
  };

  // Date Navigation Helpers
  const handleToday = () => setCurrentDate(new Date());

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else if (viewMode === 'day') d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else if (viewMode === 'day') d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  // Title Label Header
  const dateLabel = useMemo(() => {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    if (viewMode === 'month') {
      return `${months[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;
    } else if (viewMode === 'week') {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `${start.getDate()} a ${end.getDate()} de ${months[end.getMonth()]} ${end.getFullYear()}`;
    } else if (viewMode === 'day') {
      return `${currentDate.getDate()} de ${months[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;
    }
    return 'Todos os Compromissos';
  }, [currentDate, viewMode]);

  // Calendar Grid Calculations for Month View
  const monthDaysGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startingDayOfWeek = firstDay.getDay(); // 0 = Sun
    const totalDays = lastDay.getDate();

    const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    // Prev month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }

    // Next month padding to reach 35 or 42 cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }

    return days;
  }, [currentDate]);

  // Week View Days
  const weekDays = useMemo(() => {
    const days: Date[] = [];
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay()); // Sunday
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  // Helper to check if same date
  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const isToday = (d: Date) => isSameDay(d, new Date());

  // Hours array for week & day view
  const hoursArray = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col p-4 md:p-6 transition-colors">
      
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 mb-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          
          {/* Title & Navigation */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Agenda & Tarefas
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Gerenciamento de compromissos, atendimentos e tarefas da equipe
                </p>
              </div>
            </div>

            {/* Date Nav Controls */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
              <button
                onClick={handleToday}
                className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
              >
                Hoje
              </button>
              <button
                onClick={handlePrev}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNext}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="Próximo"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold px-2 text-slate-800 dark:text-slate-200 min-w-[140px] text-center">
                {dateLabel}
              </span>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* View Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('month')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'month' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                Mês
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'week' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5" />
                Semana
              </button>
              <button
                onClick={() => setViewMode('day')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'day' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Dia
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'list' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                Lista
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={fetchAppointments}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Atualizar"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* New Appointment Button */}
            <button
              onClick={() => handleOpenCreateModal()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-md transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Novo Compromisso / Tarefa
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          
          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar compromissos ou tarefas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category, User & Status Selectors */}
          <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap justify-end">
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Filter className="w-3.5 h-3.5" />
              <span>Filtros:</span>
            </div>

            <select
              value={selectedAssignedUser}
              onChange={(e) => setSelectedAssignedUser(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
            >
              <option value="all">Todos os Responsáveis</option>
              <option value="mine">Minhas Tarefas / Atribuídas a Mim</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
            >
              <option value="all">Todas Categorias</option>
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

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
            >
              <option value="all">Todos Status</option>
              <option value="Pendente">Pendente</option>
              <option value="Confirmado">Confirmado</option>
              <option value="Concluído">Concluído</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Views Container */}

      <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mb-3 text-blue-500" />
            <p className="text-sm font-medium">Carregando agenda...</p>
          </div>
        ) : (
          <>
            {/* MONTH VIEW */}
            {viewMode === 'month' && (
              <div className="flex-1 flex flex-col">
                {/* Weekday Labels Header */}
                <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-center font-semibold text-xs py-2.5 text-slate-600 dark:text-slate-400">
                  <div>DOM</div>
                  <div>SEG</div>
                  <div>TER</div>
                  <div>QUA</div>
                  <div>QUI</div>
                  <div>SEX</div>
                  <div>SÁB</div>
                </div>

                {/* Calendar Grid */}
                <div className="flex-1 grid grid-cols-7 grid-rows-5 md:grid-rows-6 divide-x divide-y divide-slate-200 dark:divide-slate-800 bg-slate-100 dark:bg-slate-900/50">
                  {monthDaysGrid.map(({ date, isCurrentMonth }, idx) => {
                    const dayAppts = filteredAppointments.filter(a => isSameDay(new Date(a.startDate), date));
                    const today = isToday(date);

                    return (
                      <div
                        key={idx}
                        onClick={() => handleOpenCreateModal(date)}
                        className={`min-h-[100px] md:min-h-[120px] p-1.5 md:p-2 transition-colors cursor-pointer group flex flex-col ${
                          isCurrentMonth
                            ? 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            : 'bg-slate-50/50 dark:bg-slate-950/40 text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-900'
                        }`}
                      >
                        {/* Cell Date Number */}
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-transform ${
                              today
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-slate-700 dark:text-slate-300 group-hover:scale-110'
                            }`}
                          >
                            {date.getDate()}
                          </span>
                          {dayAppts.length > 0 && (
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                              {dayAppts.length}
                            </span>
                          )}
                        </div>

                        {/* Appointments Pills */}
                        <div className="flex-1 space-y-1 overflow-hidden">
                          {dayAppts.slice(0, 3).map(appt => {
                            const apptTime = appt.allDay 
                              ? 'Dia Inteiro' 
                              : new Date(appt.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            
                            return (
                              <div
                                key={appt.id}
                                onClick={(e) => handleOpenEditModal(appt, e)}
                                className="px-2 py-1 rounded-md text-[11px] font-medium text-white truncate shadow-xs hover:opacity-90 hover:scale-[1.02] transition-all flex items-center gap-1"
                                style={{ backgroundColor: appt.color || CATEGORY_COLORS[appt.category] || '#3B82F6' }}
                                title={`${appt.title} (${apptTime})`}
                              >
                                {appt.visibility === 'Private' && <Lock className="w-2.5 h-2.5 shrink-0" />}
                                <span className="font-bold opacity-90">{apptTime}:</span>
                                <span className="truncate">{appt.title}</span>
                              </div>
                            );
                          })}

                          {dayAppts.length > 3 && (
                            <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 px-1">
                              + {dayAppts.length - 3} compromissos
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* WEEK VIEW */}
            {viewMode === 'week' && (
              <div className="flex-1 flex flex-col overflow-x-auto">
                {/* Weekday Header */}
                <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 sticky top-0 z-10">
                  <div className="p-2 border-r border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 text-center">
                    HORA
                  </div>
                  {weekDays.map((d, i) => {
                    const today = isToday(d);
                    const daysMap = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
                    return (
                      <div
                        key={i}
                        className={`p-2 text-center border-r border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center ${
                          today ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          {daysMap[d.getDay()]}
                        </span>
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mt-0.5 ${
                            today ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {d.getDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Hourly Grid Body */}
                <div className="flex-1 overflow-y-auto max-h-[70vh]">
                  {hoursArray.map(hour => (
                    <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] min-h-[50px] border-b border-slate-100 dark:border-slate-800/50">
                      {/* Hour Column */}
                      <div className="p-1 border-r border-slate-200 dark:border-slate-800 text-[10px] font-semibold text-slate-400 text-center select-none bg-slate-50/30 dark:bg-slate-900/30">
                        {String(hour).padStart(2, '0')}:00
                      </div>

                      {/* Day Columns */}
                      {weekDays.map((d, dayIdx) => {
                        const slotAppts = filteredAppointments.filter(a => {
                          const apptDate = new Date(a.startDate);
                          return isSameDay(apptDate, d) && apptDate.getHours() === hour;
                        });

                        return (
                          <div
                            key={dayIdx}
                            onClick={() => handleOpenCreateModal(d, hour)}
                            className="p-1 border-r border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer relative"
                          >
                            {slotAppts.map(appt => (
                              <div
                                key={appt.id}
                                onClick={(e) => handleOpenEditModal(appt, e)}
                                className="p-1.5 rounded-lg text-xs font-semibold text-white mb-1 shadow-sm hover:opacity-90 hover:scale-[1.01] transition-all flex flex-col"
                                style={{ backgroundColor: appt.color || CATEGORY_COLORS[appt.category] || '#3B82F6' }}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="truncate">{appt.title}</span>
                                  {appt.visibility === 'Private' && <Lock className="w-3 h-3 shrink-0" />}
                                </div>
                                <span className="text-[10px] opacity-80 font-normal">
                                  {new Date(appt.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(appt.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DAY VIEW */}
            {viewMode === 'day' && (
              <div className="flex-1 flex flex-col overflow-y-auto max-h-[75vh]">
                {hoursArray.map(hour => {
                  const hourAppts = filteredAppointments.filter(a => {
                    const apptDate = new Date(a.startDate);
                    return isSameDay(apptDate, currentDate) && apptDate.getHours() === hour;
                  });

                  return (
                    <div
                      key={hour}
                      onClick={() => handleOpenCreateModal(currentDate, hour)}
                      className="grid grid-cols-[70px_1fr] min-h-[65px] border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer p-2"
                    >
                      {/* Hour Label */}
                      <div className="text-xs font-bold text-slate-400 flex items-center justify-center border-r border-slate-200 dark:border-slate-800 pr-3">
                        {String(hour).padStart(2, '0')}:00
                      </div>

                      {/* Content */}
                      <div className="pl-3 flex flex-col gap-2 justify-center">
                        {hourAppts.map(appt => (
                          <div
                            key={appt.id}
                            onClick={(e) => handleOpenEditModal(appt, e)}
                            className="p-3 rounded-xl text-white shadow-md flex items-center justify-between hover:opacity-95 transition-all"
                            style={{ backgroundColor: appt.color || CATEGORY_COLORS[appt.category] || '#3B82F6' }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-white/20 rounded-lg">
                                <Clock className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-sm">{appt.title}</h4>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 font-semibold">
                                    {appt.category}
                                  </span>
                                  {appt.visibility === 'Private' && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/30 font-semibold flex items-center gap-1">
                                      <Lock className="w-2.5 h-2.5" /> Privado
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs opacity-90 mt-0.5">
                                  {new Date(appt.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} até {new Date(appt.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {appt.location && ` • ${appt.location}`}
                                  {appt.assignedToName && ` • Responsável: ${appt.assignedToName}`}
                                </p>
                              </div>
                            </div>

                            <span className="text-xs font-semibold px-2.5 py-1 bg-white/20 rounded-lg">
                              {appt.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* LIST VIEW */}
            {viewMode === 'list' && (
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                {filteredAppointments.length === 0 ? (
                  <div className="py-16 text-center text-slate-400">
                    <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-40 text-slate-500" />
                    <p className="text-base font-semibold">Nenhum compromisso encontrado.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Clique em "+ Novo Compromisso" para adicionar um compromisso na sua agenda.
                    </p>
                  </div>
                ) : (
                  filteredAppointments.map(appt => {
                    const startD = new Date(appt.startDate);
                    const endD = new Date(appt.endDate);
                    
                    return (
                      <div
                        key={appt.id}
                        onClick={() => handleOpenEditModal(appt)}
                        className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700/60 hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-4">
                          {/* Color Badge Indicator */}
                          <div 
                            className="w-3 h-12 rounded-full shrink-0 mt-1" 
                            style={{ backgroundColor: appt.color || CATEGORY_COLORS[appt.category] || '#3B82F6' }}
                          />

                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                {appt.title}
                              </h3>
                              <span 
                                className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: appt.color || '#3B82F6' }}
                              >
                                {appt.category}
                              </span>
                              <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                                appt.status === 'Confirmado' ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' :
                                appt.status === 'Concluído' ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' :
                                appt.status === 'Cancelado' ? 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800' :
                                'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                              }`}>
                                {appt.status}
                              </span>
                              {appt.visibility === 'Private' && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 flex items-center gap-1">
                                  <Lock className="w-3 h-3" /> Privado
                                </span>
                              )}
                            </div>

                            {appt.description && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                                {appt.description}
                              </p>
                            )}

                            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-1 flex-wrap">
                              <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                                <Clock className="w-3.5 h-3.5 text-blue-500" />
                                {startD.toLocaleDateString('pt-BR')} • {appt.allDay ? 'Dia Inteiro' : `${startD.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endD.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                              </span>
                              {appt.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                                  {appt.location}
                                </span>
                              )}
                              {appt.assignedToName && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3.5 h-3.5 text-purple-500" />
                                  Responsável: {appt.assignedToName}
                                </span>
                              )}
                              {appt.customerName && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3.5 h-3.5 text-emerald-500" />
                                  Cliente: {appt.customerName}
                                </span>
                              )}
                              {appt.supplierName && (
                                <span className="flex items-center gap-1">
                                  <Building className="w-3.5 h-3.5 text-amber-500" />
                                  Fornecedor: {appt.supplierName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end md:self-center">
                          <button
                            onClick={(e) => handleOpenEditModal(appt, e)}
                            className="px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
                          >
                            Editar
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Appointment Modal */}
      <AppointmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveAppointment}
        onDelete={handleDeleteAppointment}
        appointmentToEdit={appointmentToEdit}
        initialDate={modalInitialDate}
        initialHour={modalInitialHour}
        currentUser={currentUser}
        users={users}
      />

    </div>
  );
};
