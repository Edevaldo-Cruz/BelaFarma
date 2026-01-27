import React from 'react';
import { 
  Bell, 
  AlertTriangle, 
  Clock, 
  ArrowRight, 
  X,
  CreditCard,
  MessageSquare,
  AlertCircle,
  ClipboardCheck
} from 'lucide-react';
import { Task, Boleto, BoletoStatus, User, View, UserRole } from '../types';

interface NotificationPanelProps {
  tasks: Task[];
  boletos: Boleto[];
  user: User;
  onClose: () => void;
  onNavigate: (view: View) => void;
  onViewTask: (task: Task) => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({ 
  tasks, 
  boletos, 
  user, 
  onClose,
  onNavigate,
  onViewTask
}) => {
  const isAdmin = user.role === UserRole.ADM;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // 1. Task Attention Requests (Only for creators)
  const taskAttentionNotifications = tasks.filter(task => 
    task.needsAdminAttention && task.creator === user.id
  );

  // 2. Task Resolutions (Only for requesters/assigned)
  const taskResolutionNotifications = tasks.filter(task => 
    task.hasAdminResponse && task.assignedUser === user.id
  );

  // 3. Overdue Boletos (Only for Admins)
  const overdueBoletos = isAdmin ? boletos.filter(b => {
    const dueDate = new Date(b.due_date + 'T00:00:00');
    return b.status === BoletoStatus.PENDENTE && dueDate < now;
  }) : [];

  // 3. Sunday Boletos (Special Alert for Admins on Saturdays)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextSunday = new Date(today);
  nextSunday.setDate(today.getDate() + (7 - today.getDay()) % 7);
  nextSunday.setHours(0, 0, 0, 0);
  const isSaturday = today.getDay() === 6;

  const boletosDueSunday = isAdmin ? boletos.filter(b => {
    const dueDate = new Date(b.due_date + 'T00:00:00');
    return b.status === BoletoStatus.PENDENTE && 
           dueDate.getTime() === nextSunday.getTime() &&
           isSaturday;
  }) : [];

  const totalNotifications = 
    taskAttentionNotifications.length + 
    taskResolutionNotifications.length + 
    overdueBoletos.length + 
    boletosDueSunday.length;

  if (totalNotifications === 0) {
    return (
      <div className="absolute top-16 left-0 z-[100] w-80 bg-white dark:bg-slate-950 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center mx-auto">
            <Bell size={24} className="text-slate-300 dark:text-slate-700" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Tudo em ordem</h3>
            <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-tighter">Nenhuma notificação tática pendente.</p>
          </div>
          <button onClick={onClose} className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-700 tracking-widest">Fechar Central</button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-16 left-0 z-[100] w-[350px] bg-white dark:bg-slate-950 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] dark:shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] border border-slate-200 dark:border-slate-800 overflow-hidden animate-in slide-in-from-top-4 duration-300">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
        <div>
          <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
            <Bell size={16} className="text-red-600" /> Alertas Táticos
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{totalNotifications} problemas detectados</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl text-slate-400 transition-all">
          <X size={18} />
        </button>
      </div>

      <div className="max-h-[450px] overflow-y-auto no-scrollbar p-2 space-y-2">
        {/* TASK ATTENTION REQUESTS */}
        {taskAttentionNotifications.length > 0 && (
          <div className="space-y-2">
            <p className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Aguardando sua atenção</p>
            {taskAttentionNotifications.map(task => (
              <button 
                key={task.id}
                onClick={() => { onViewTask(task); onClose(); }}
                className="w-full text-left p-4 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40 rounded-2xl border border-amber-100 dark:border-amber-900/30 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500 text-white rounded-lg group-hover:scale-110 transition-transform shadow-lg shadow-amber-500/20">
                    <MessageSquare size={14} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{task.title}</h4>
                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-500 mt-0.5 line-clamp-1 italic">
                      "{task.adminAttentionMessage}"
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] font-black bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 text-amber-600">Ver e Resolver</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* TASK RESOLUTIONS RECEIVED */}
        {taskResolutionNotifications.length > 0 && (
          <div className="space-y-2">
            <p className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Respostas da Gestão</p>
            {taskResolutionNotifications.map(task => (
              <button 
                key={task.id}
                onClick={() => { onViewTask(task); onClose(); }}
                className="w-full text-left p-4 bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 rounded-2xl border border-emerald-100 dark:border-emerald-900/10 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-500 text-white rounded-lg group-hover:scale-110 transition-transform shadow-lg shadow-emerald-500/20">
                    <ClipboardCheck size={14} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{task.title}</h4>
                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-500 mt-0.5 line-clamp-1 italic">
                      "Solução enviada"
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] font-black bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 text-emerald-600">Ver Solução</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* OVERDUE BOLETOS */}
        {overdueBoletos.length > 0 && (
          <div className="space-y-2">
            <p className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Financeiro em Atraso</p>
            {overdueBoletos.map(boleto => (
              <button 
                key={boleto.id}
                onClick={() => { onNavigate('financial'); onClose(); }}
                className="w-full text-left p-4 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 rounded-2xl border border-red-100 dark:border-red-900/30 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-600 text-white rounded-lg group-hover:scale-110 transition-transform shadow-lg shadow-red-600/20">
                    <AlertTriangle size={14} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight line-clamp-1">{boleto.supplierName}</h4>
                    <p className="text-[10px] font-bold text-red-700 dark:text-red-500 mt-0.5">
                      Vencido em: {new Date(boleto.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] font-black bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-red-200 dark:border-red-800 text-red-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(boleto.value)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* SUNDAY ALERTS */}
        {boletosDueSunday.length > 0 && (
          <div className="space-y-2">
            <p className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Atenção para amanhã (Domingo)</p>
            {boletosDueSunday.map(boleto => (
              <button 
                key={boleto.id}
                onClick={() => { onNavigate('financial'); onClose(); }}
                className="w-full text-left p-4 bg-orange-50 dark:bg-orange-950/20 hover:bg-orange-100 dark:hover:bg-orange-950/40 rounded-2xl border border-orange-100 dark:border-orange-900/30 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-orange-500 text-white rounded-lg group-hover:scale-110 transition-transform shadow-lg shadow-orange-500/20">
                    <Clock size={14} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight line-clamp-1">{boleto.supplierName}</h4>
                    <p className="text-[10px] font-bold text-orange-700 dark:text-orange-500 mt-0.5 uppercase">Vencimento Crítico (Fim de semana)</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] font-black bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-orange-200 dark:border-orange-800 text-orange-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(boleto.value)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
        <p className="text-[8px] font-black text-slate-400 uppercase text-center tracking-[0.2em]">Central de Operações Bela Farma</p>
      </div>
    </div>
  );
};
