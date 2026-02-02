import React from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Settings as SettingsIcon, // Renamed Settings to SettingsIcon
  LogOut, 
  Menu, 
  X, 
  PlusSquare,
  ShieldCheck,
  User as UserIcon,
  Wallet,
  Users as UsersIcon,
  ClipboardList,
  Search,
  Calculator,
  Lock,
  Receipt,
  History,
  Banknote,
  Landmark,
  TrendingUp,
  CreditCard,
  ClipboardCheck,
  Sun,
  Moon,
  Database,
  Bell,
  AlertTriangle // Added for Devedores menu item
} from 'lucide-react';
import { View, User, UserRole, Task, Boleto, BoletoStatus } from '../types';
import { NotificationPanel } from './NotificationPanel';

interface SidebarProps {
  user: User;
  currentView: View;
  setView: (view: View) => void;
  onLogout: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  tasks?: Task[];
  boletos?: Boleto[]; // ADDED
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  user,
  currentView, 
  setView, 
  onLogout, 
  theme,
  setTheme,
  isOpen, 
  setIsOpen,
  tasks = [],
  boletos = [] // ADDED
}) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const notificationRef = React.useRef<HTMLDivElement>(null);
  const isAdmin = user.role === UserRole.ADM;

  const [hasOverdue, setHasOverdue] = React.useState(false);

  React.useEffect(() => {
    if (!isAdmin) return;
    const checkOverdue = async () => {
      try {
        const res = await fetch('/api/debtors-report');
        const data = await res.json();
        if (Array.isArray(data)) {
          setHasOverdue(data.some((d: any) => d.hasOverdue === 1));
        }
      } catch (error) {
        console.error('Error checking overdue status:', error);
      }
    };
    checkOverdue();
    // Check every minute
    const interval = setInterval(checkOverdue, 60000);
    return () => clearInterval(interval);
  }, [isAdmin, currentView]);
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'logs', label: 'Auditoria', icon: History },
    { id: 'customers', label: 'Clientes', icon: UsersIcon },
    { id: 'checking-account', label: 'Conta Corrente', icon: Banknote },
    { id: 'medication-search', label: 'Consultar Méd.', icon: Search },
    { id: 'debtors-report', label: 'Devedores', icon: AlertTriangle },
    { id: 'cash-closing', label: 'Fechamento', icon: Calculator },
    { id: 'financial', label: 'Financeiro', icon: Wallet },
    { id: 'task-management', label: 'Ger. Tarefas', icon: ClipboardCheck },
    { id: 'daily-records', label: 'Lançamentos', icon: Receipt },
    { id: 'shortages', label: 'Lista de Faltas', icon: ClipboardList },
    { id: 'orders', label: 'Pedidos', icon: ShoppingCart },
    { id: 'users', label: 'Usuários', icon: UsersIcon },
    { id: 'safe', label: 'Cofre', icon: Lock },
    { id: 'backups', label: 'Backups', icon: Database },
    { id: 'settings', label: 'Configurações', icon: SettingsIcon },
  ];

  // Filtra itens por permissão e garante que o Dashboard fique no topo e Configurações no final
  const filteredMenuItems = menuItems.filter(item => {
    const adminOnly = ['logs', 'checking-account', 'cash-closing', 'financial', 'users', 'safe', 'debtors-report', 'backups']; 
    if (adminOnly.includes(item.id) && !isAdmin) return false;
    return true;
  });

  // Reordena alfabeticamente exceto Dashboard (fixo no topo) e Configurações (fixo no final)
  const sortedMenuItems = [
    filteredMenuItems.find(i => i.id === 'dashboard')!,
    ...filteredMenuItems
      .filter(i => i.id !== 'dashboard' && i.id !== 'settings')
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    filteredMenuItems.find(i => i.id === 'settings')!
  ];

  // Logic for task creator notifications (Operator asked for help)
  const taskAttentionNotifications = tasks.filter(task => 
    task.needsAdminAttention && task.creator === user.id
  );

  // Logic for operator notifications (Admin replied to your request)
  const taskResponseNotifications = tasks.filter(task => 
    task.hasAdminResponse && task.assignedUser === user.id
  );

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const overdueBoletos = isAdmin ? boletos.filter(b => {
    const dueDate = new Date(b.due_date + 'T00:00:00');
    return b.status === BoletoStatus.PENDENTE && dueDate < now;
  }) : [];

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

  // Bank Deposit Tasks (Automatic tasks for admins)
  const bankDepositTasks = isAdmin ? tasks.filter(task =>
    task.title === 'Realizar Depósito Bancário' &&
    task.status !== 'Concluída' &&
    task.status !== 'Cancelada' &&
    !task.isArchived
  ) : [];

  const totalNotifications = 
    taskAttentionNotifications.length + 
    taskResponseNotifications.length + 
    bankDepositTasks.length +
    overdueBoletos.length + 
    boletosDueSunday.length;
  const hasNotifications = totalNotifications > 0;

  // Handle click outside to close notifications
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      {!isOpen && (
         <button 
         onClick={() => setIsOpen(true)}
         className="fixed top-4 left-4 z-50 p-2 bg-white dark:bg-slate-800 rounded-md shadow-md md:hidden border border-slate-200 dark:border-slate-700"
       >
         <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
       </button>
      )}

      <aside 
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:relative md:translate-x-0 shadow-2xl md:shadow-none`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-8">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-600 rounded-lg shadow-lg">
                <PlusSquare className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-xl font-black text-red-700 dark:text-red-500 tracking-tighter">BELA FARMA</span>
                <span className="text-sm font-bold text-blue-700 dark:text-blue-400 ml-auto tracking-widest uppercase text-[10px]">Sul</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative" ref={notificationRef}>
                <button 
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} 
                  className={`p-2.5 rounded-xl transition-all ${hasNotifications ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-600'}`}
                >
                  <Bell size={20} className={hasNotifications ? 'animate-bounce' : ''} />
                  {hasNotifications && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center bg-red-600 rounded-full border-2 border-white dark:border-slate-900 text-[10px] font-black text-white">
                      {totalNotifications}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <NotificationPanel 
                    tasks={tasks}
                    boletos={boletos}
                    user={user}
                    onClose={() => setIsNotificationsOpen(false)}
                    onNavigate={(view) => {
                      setView(view);
                      setIsNotificationsOpen(false);
                    }}
                    onViewTask={() => {
                      setView('task-management');
                      setIsNotificationsOpen(false);
                    }}
                  />
                )}
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1 text-slate-400 md:hidden">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="px-6 mb-8 flex flex-col gap-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className={`p-2 rounded-xl ${isAdmin ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-black text-slate-900 dark:text-slate-100 truncate uppercase tracking-tighter">{user.name}</span>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{user.role}</span>
              </div>
            </div>

            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 group transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Modo {theme === 'light' ? 'Escuro' : 'Claro'}</span>
              <div className="p-1.5 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 group-hover:text-yellow-500 dark:group-hover:text-yellow-400 transition-colors">
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </div>
            </button>
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
            {sortedMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setView(item.id as View);
                    if (window.innerWidth < 768) setIsOpen(false);
                  }}
                  className={`flex items-center w-full gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    isActive 
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-red-600 dark:text-red-500' : 'text-slate-400 dark:text-slate-600'}`} />
                  <span className="truncate">{item.label}</span>
                  {item.id === 'debtors-report' && hasOverdue && (
                    <span className="ml-auto w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-sm" title="Existem clientes com pagamento atrasado" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <button
              onClick={onLogout}
              className="flex items-center w-full gap-3 px-4 py-3 text-sm font-bold text-slate-400 dark:text-slate-500 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all"
            >
              <LogOut className="w-5 h-5" />
              Sair do Sistema
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
