
import React, { useState, useEffect } from 'react';
import { 
  Bell, AlertTriangle, Clock, MessageSquare, ClipboardCheck, Vault, 
  CheckCircle2, Filter, AlertCircle, ShoppingBag
} from 'lucide-react';
import { Task, Boleto, BoletoStatus, User, View, UserRole, iFoodNotification } from '../types';

interface NotificationsPageProps {
  tasks: Task[];
  boletos: Boleto[];
  user: User;
  onNavigate: (view: View) => void;
  onViewTask: (task: Task) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ 
  tasks, 
  boletos, 
  user, 
  onNavigate,
  onViewTask
}) => {
  const isAdmin = user.role === UserRole.ADM;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const [ifoodNotifications, setIfoodNotifications] = useState<iFoodNotification[]>([]);

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/ifood-sales/notifications')
        .then(res => res.ok ? res.json() : [])
        .then(setIfoodNotifications)
        .catch(console.error);
    }
  }, [isAdmin]);

  // 1. Task Attention Requests
  const taskAttentionNotifications = tasks.filter(task => 
    task.needsAdminAttention && task.creator === user.id
  );

  // 2. Task Resolutions
  const taskResolutionNotifications = tasks.filter(task => 
    task.hasAdminResponse && task.assignedUser === user.id
  );

  // 3. Bank Deposit Tasks
  const bankDepositTasks = isAdmin ? tasks.filter(task =>
    task.title === 'Realizar Depósito Bancário' &&
    task.status !== 'Concluída' &&
    task.status !== 'Cancelada' &&
    !task.isArchived
  ) : [];

  // 4. Overdue Boletos
  const overdueBoletos = isAdmin ? boletos.filter(b => {
    const dueDate = new Date(b.due_date + 'T00:00:00');
    return b.status === BoletoStatus.PENDENTE && dueDate < now;
  }) : [];

  // 5. Sunday Boletos
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

  const totalCount = 
    taskAttentionNotifications.length + 
    taskResolutionNotifications.length + 
    bankDepositTasks.length +
    overdueBoletos.length + 
    boletosDueSunday.length +
    ifoodNotifications.length;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex items-center gap-4">
        <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-2xl shadow-sm">
          <Bell className="w-8 h-8 text-red-600" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">
            Central de Notificações
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold text-sm mt-1">
            {totalCount === 0 ? 'Nenhuma pendência encontrada.' : `${totalCount} itens requerem sua atenção.`}
          </p>
        </div>
      </header>

      {totalCount === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-800 shadow-xl">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Tudo Limpo!</h2>
          <p className="text-slate-500 font-medium mt-2">Você não tem notificações pendentes no momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          
          {/* iFood Notifications */}
          {ifoodNotifications.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 overflow-hidden shadow-lg">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-900/10 flex items-center gap-3">
                 <ShoppingBag className="w-5 h-5 text-amber-600" />
                 <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">iFood ({ifoodNotifications.length})</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {ifoodNotifications.map((notif, idx) => (
                  <div key={idx} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div>
                      <h3 className={`font-black uppercase text-sm ${notif.type === 'overdue' ? 'text-red-600' : 'text-amber-600'}`}>
                        {notif.type === 'overdue' ? 'Pagamento Atrasado' : 'Vencendo em Breve'}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-300 font-medium text-sm mt-1">
                        {notif.message}
                      </p>
                    </div>
                    <button 
                      onClick={() => onNavigate('ifood-control')}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-black uppercase hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Resolver
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task Attention */}
          {taskAttentionNotifications.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 overflow-hidden shadow-lg">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-900/10 flex items-center gap-3">
                 <MessageSquare className="w-5 h-5 text-amber-600" />
                 <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Solicitações de Atenção ({taskAttentionNotifications.length})</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {taskAttentionNotifications.map(task => (
                  <div key={task.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div>
                      <h3 className="font-black text-slate-800 dark:text-white uppercase text-sm">{task.title}</h3>
                      <p className="text-amber-600 dark:text-amber-500 font-bold italic text-sm mt-1">"{task.adminAttentionMessage}"</p>
                      <p className="text-xs text-slate-400 mt-2">Criado em {new Date(task.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <button 
                      onClick={() => onViewTask(task)}
                      className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-xl text-xs font-black uppercase hover:bg-amber-200 transition-colors"
                    >
                      Ver Tarefa
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task Resolutions */}
          {taskResolutionNotifications.length > 0 && (
             <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 overflow-hidden shadow-lg">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-emerald-50/50 dark:bg-emerald-900/10 flex items-center gap-3">
                 <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                 <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Resoluções Recebidas ({taskResolutionNotifications.length})</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {taskResolutionNotifications.map(task => (
                  <div key={task.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div>
                      <h3 className="font-black text-slate-800 dark:text-white uppercase text-sm">{task.title}</h3>
                      <p className="text-emerald-600 dark:text-emerald-500 font-bold italic text-sm mt-1">Solução enviada pela gestão</p>
                    </div>
                    <button 
                      onClick={() => onViewTask(task)}
                      className="px-4 py-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-black uppercase hover:bg-emerald-200 transition-colors"
                    >
                      Ver Solução
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bank Deposits */}
          {bankDepositTasks.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 overflow-hidden shadow-lg">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-orange-50/50 dark:bg-orange-900/10 flex items-center gap-3">
                 <Vault className="w-5 h-5 text-orange-600" />
                 <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Ações Financeiras ({bankDepositTasks.length})</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {bankDepositTasks.map(task => (
                  <div key={task.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div>
                      <h3 className="font-black text-slate-800 dark:text-white uppercase text-sm">{task.title}</h3>
                      <p className="text-slate-600 dark:text-slate-300 font-medium text-sm mt-1 line-clamp-2">{task.description}</p>
                      <p className="text-xs font-black text-orange-600 mt-2 uppercase">Vencimento: {new Date(task.dueDate).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <button 
                      onClick={() => onViewTask(task)}
                      className="px-4 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-xl text-xs font-black uppercase hover:bg-orange-200 transition-colors"
                    >
                      Realizar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Overdue/Sunday Boletos */}
          {(overdueBoletos.length > 0 || boletosDueSunday.length > 0) && (
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 overflow-hidden shadow-lg">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-red-50/50 dark:bg-red-900/10 flex items-center gap-3">
                 <AlertTriangle className="w-5 h-5 text-red-600" />
                 <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Financeiro Pendente ({overdueBoletos.length + boletosDueSunday.length})</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {overdueBoletos.map(boleto => (
                  <div key={boleto.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div>
                      <h3 className="font-black text-slate-800 dark:text-white uppercase text-sm">{boleto.supplierName}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-black bg-red-100 text-red-700 px-2 py-0.5 rounded uppercase">Vencido</span>
                        <span className="text-sm font-bold text-slate-600">{new Date(boleto.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                      </div>
                      <p className="text-lg font-black text-slate-900 dark:text-white mt-2">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(boleto.value)}
                      </p>
                    </div>
                    <button 
                      onClick={() => onNavigate('financial')}
                      className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-black uppercase hover:bg-slate-800 transition-colors"
                    >
                      Pagar
                    </button>
                  </div>
                ))}
                
                {boletosDueSunday.map(boleto => (
                   <div key={boleto.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div>
                      <h3 className="font-black text-slate-800 dark:text-white uppercase text-sm">{boleto.supplierName}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-black bg-orange-100 text-orange-700 px-2 py-0.5 rounded uppercase">Vence Amanhã</span>
                        <span className="text-sm font-bold text-slate-600">{new Date(boleto.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                      </div>
                      <p className="text-lg font-black text-slate-900 dark:text-white mt-2">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(boleto.value)}
                      </p>
                    </div>
                    <button 
                      onClick={() => onNavigate('financial')}
                      className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-black uppercase hover:bg-slate-800 transition-colors"
                    >
                      Agendar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};
