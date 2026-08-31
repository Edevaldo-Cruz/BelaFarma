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
  AlertTriangle, // Added for Devedores menu item
  FileText, // Added for Invoices
  Package, // Added for Consignados
  MessageSquare, // Added for Messaging Center
  Star, // Added for Marketing Agent
  BrainCircuit, // Added for Financeiro IA
  HeartPulse, // Added for Saude Financeira
  Radio, // Added for Rádio Bela Farma
  ContactRound, // Added for CRM WhatsApp
  Sparkles, // Added for Tera Incentive
  Printer, // Added for Labels
  Activity, // Added for Vigilante
  Calendar, // Added for Purchase Calendar
  Truck, // Added for Deliveries
  ShieldAlert, // Added for Alertas ANVISA
  NotebookPen, // Added for Bloco de Notas
  RefreshCw, // Added for Digifarma Sync
  ShoppingBag, // Added for Central de Compras
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
  onOpenTeraModal?: () => void; // ADDED
  isBudgetBusted?: boolean;
  onOpenMural?: () => void;
  muralPendingCount?: number;
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
  boletos = [], // ADDED
  onOpenTeraModal,
  isBudgetBusted = false,
  onOpenMural,
  muralPendingCount = 0
}) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const notificationRef = React.useRef<HTMLDivElement>(null);
  const isAdmin = user.role === UserRole.ADM;

  const [hasOverdue, setHasOverdue] = React.useState(false);
  const [ifoodNotifCount, setIfoodNotifCount] = React.useState(0);
  const [pendingReviewCount, setPendingReviewCount] = React.useState(0);
  const [isSyncingDigifarma, setIsSyncingDigifarma] = React.useState(false);
  const [digifarmaSyncText, setDigifarmaSyncText] = React.useState('Sincronizado');

  // Monitora status de sincronização do Digifarma
  React.useEffect(() => {
    const checkSyncStatus = async () => {
      try {
        const res = await fetch('/api/sync/status');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.data) && data.data.length > 0) {
            const latest = data.data.reduce((max: any, item: any) => {
              return (!max || new Date(item.ultima_sincronizacao) > new Date(max.ultima_sincronizacao)) ? item : max;
            }, null);
            if (latest && latest.ultima_sincronizacao) {
              const diffMin = Math.max(0, Math.floor((Date.now() - new Date(latest.ultima_sincronizacao).getTime()) / 60000));
              setDigifarmaSyncText(diffMin === 0 ? 'Sincronizado agora' : `Sincronizado há ${diffMin}m`);
            }
          }
        }
      } catch (e) {}
    };
    checkSyncStatus();
    const interval = setInterval(checkSyncStatus, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleForceSyncDigifarma = async () => {
    if (isSyncingDigifarma) return;
    setIsSyncingDigifarma(true);
    try {
      const res = await fetch('/api/sync/force', { method: 'POST' });
      if (res.ok) {
        setDigifarmaSyncText('Sincronizado agora');
      }
    } catch (e) {
    } finally {
      setIsSyncingDigifarma(false);
    }
  };

  // Check pending audit reviews for WhatsApp deliveries
  React.useEffect(() => {
    const checkPendingReviews = async () => {
      try {
        const res = await fetch('/api/deliveries/pending-reviews');
        const data = await res.json();
        if (data.success && typeof data.count === 'number') {
          setPendingReviewCount(data.count);
        } else if (Array.isArray(data.pending_reviews)) {
          setPendingReviewCount(data.pending_reviews.length);
        }
      } catch (error) {
        console.error('Error checking pending reviews count:', error);
      }
    };
    checkPendingReviews();
    const interval = setInterval(checkPendingReviews, 30000);
    return () => clearInterval(interval);
  }, [currentView]);

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

  // Check iFood notifications
  React.useEffect(() => {
    if (!isAdmin) return;
    const checkIFood = async () => {
      try {
        const res = await fetch('/api/ifood-sales/notifications');
        const data = await res.json();
        if (Array.isArray(data)) {
          setIfoodNotifCount(data.length);
        }
      } catch (error) {
        console.error('Error checking iFood notifications:', error);
      }
    };
    checkIFood();
    const interval = setInterval(checkIFood, 300000); // Every 5 minutes
    return () => clearInterval(interval);
  }, [isAdmin, currentView]);
  const [anvisaAlertCount, setAnvisaAlertCount] = React.useState(0);

  // Check ANVISA alerts in stock
  React.useEffect(() => {
    const checkAnvisaAlerts = async () => {
      try {
        const res = await fetch('/api/anvisa/summary');
        const data = await res.json();
        if (data.success && typeof data.totalEmEstoque === 'number') {
          setAnvisaAlertCount(data.totalEmEstoque);
        }
      } catch (error) {
        console.error('Error checking ANVISA alerts summary:', error);
      }
    };
    checkAnvisaAlerts();
    const interval = setInterval(checkAnvisaAlerts, 120000); // Every 2 minutes
    return () => clearInterval(interval);
  }, [currentView]);

  const [purchasingPendingCount, setPurchasingPendingCount] = React.useState(0);

  // Monitora Fila de Aprovação da Central de Compras
  React.useEffect(() => {
    if (!isAdmin) return;
    const checkPurchasingApprovals = async () => {
      try {
        const res = await fetch('/api/central-compras/aprovacoes/contador');
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.pendentes === 'number') {
            setPurchasingPendingCount(data.pendentes);
          }
        }
      } catch (error) {
        // Fail silently
      }
    };
    checkPurchasingApprovals();
    const interval = setInterval(checkPurchasingApprovals, 20000); // Every 20s
    return () => clearInterval(interval);
  }, [isAdmin, currentView]);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'anvisa-alerts', label: 'Alertas ANVISA', icon: ShieldAlert },
    { id: 'logs', label: 'Auditoria', icon: History },
    { id: 'central-compras', label: 'Central de Compras', icon: ShoppingBag },
    { id: 'customers', label: 'Clientes', icon: UsersIcon },
    { id: 'checking-account', label: 'Conta Corrente', icon: Banknote },
    { id: 'medication-search', label: 'Consultar Méd.', icon: Search },
    { id: 'debtors-report', label: 'Devedores', icon: AlertTriangle },
    { id: 'cash-closing', label: 'Fechamento', icon: Calculator },
    { id: 'agenda', label: 'Agenda & Tarefas', icon: Calendar },
    { id: 'notes', label: 'Anotações', icon: NotebookPen },
    { id: 'daily-records', label: 'Lançamentos', icon: Receipt },

    { id: 'shortages', label: 'Lista de Faltas', icon: ClipboardList },
    { id: 'inventario', label: 'Inventário Rotativo', icon: ClipboardList },
    { id: 'orders', label: 'Pedidos', icon: ShoppingCart },
    { id: 'users', label: 'Usuários', icon: UsersIcon },
    { id: 'safe', label: 'Cofre', icon: Lock },
    { id: 'backups', label: 'Backups', icon: Database },
    { id: 'quotations', label: 'Cotações', icon: MessageSquare },
    { id: 'card-machines', label: 'Maquininhas & Cartões', icon: CreditCard },
    { id: 'ifood-control', label: 'Controle iFood', icon: ShoppingCart },
    { id: 'consignados', label: 'Consignados', icon: Package },
    { id: 'invoices', label: 'Notas Fiscais', icon: FileText },
    { id: 'messaging-center', label: 'Mensagens WA', icon: MessageSquare },
    { id: 'ai-portal', label: 'Central de IAs', icon: BrainCircuit },
    { id: 'radio-manager', label: 'Rádio Bela Farma', icon: Radio },
    { id: 'whatsapp-crm', label: 'CRM WhatsApp', icon: ContactRound },
    { id: 'whatsapp-vendas', label: 'Assistente de Vendas', icon: MessageSquare },
    { id: 'deliveries', label: 'Pedidos & Entregas', icon: Truck },
    { id: 'labels', label: 'Etiquetas A4', icon: Printer },
    { id: 'compras-live', label: 'Sugestão Compras', icon: ShoppingCart },
    { id: 'purchase-calendar', label: 'Calendário de Compras', icon: Calendar },
    { id: 'suppliers', label: 'Fornecedores', icon: UsersIcon },
    { id: 'stock', label: 'Estoque', icon: Package },
    { id: 'financial-health', label: 'Saúde Financeira', icon: HeartPulse },
    { id: 'caixa-provisoes', label: 'Caixa & Provisões', icon: Wallet },
    { id: 'sales-report', label: 'Relatório Vendas', icon: TrendingUp },
    { id: 'critical-stock', label: 'Estoque Crítico', icon: AlertTriangle },
    { id: 'system-watcher', label: 'Vigilante', icon: Activity },
    { id: 'price-manager', label: 'Gestão de Preços', icon: TrendingUp },
    { id: 'settings', label: 'Configurações', icon: SettingsIcon },
  ];


  // Filtra itens por permissão e garante que o Dashboard fique no topo e Configurações no final
  const filteredMenuItems = menuItems.filter(item => {
    const adminOnly = ['logs', 'central-compras', 'checking-account', 'cash-closing', 'financial', 'users', 'safe', 'debtors-report', 'backups', 'consignados', 'invoices', 'ifood-control', 'messaging-center', 'ai-portal', 'radio-manager', 'whatsapp-crm', 'stock', 'financial-health', 'caixa-provisoes', 'sales-report', 'critical-stock', 'system-watcher', 'purchase-calendar', 'price-manager', 'card-machines']; 
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
    boletosDueSunday.length +
    ifoodNotifCount +
    (isAdmin ? (muralPendingCount || 0) : 0) +
    (isAdmin ? (purchasingPendingCount || 0) : 0);
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

  const getNotificationBtnClass = () => {
    if (isBudgetBusted) {
      return hasNotifications ? 'bg-amber-500/20 text-amber-300' : 'bg-red-900/40 text-red-300 hover:text-white';
    }
    const bgClass = hasNotifications ? 'bg-amber-100' : 'bg-slate-50';
    const textClass = hasNotifications ? 'text-amber-800' : 'text-slate-500';
    const hoverClass = hasNotifications ? 'hover:bg-amber-200' : 'hover:text-slate-700';
    return bgClass + ' ' + textClass + ' ' + hoverClass + ' dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl transition-all';
  };

  const getLogoutBtnClass = () => {
    if (isBudgetBusted) {
      return 'text-red-300 hover:bg-red-900/40 hover:text-white';
    }
    const textClass = 'text-slate-500';
    const hoverClass = 'hover:bg-red-50 hover:text-red-650';
    return textClass + ' ' + hoverClass + ' dark:text-slate-450 dark:hover:bg-red-900/20 dark:hover:text-red-450';
  };

  return (
    <>
      {isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm md:hidden transition-opacity duration-300 animate-in fade-in cursor-default w-full h-full text-left"
          aria-label="Fechar menu"
        />
      )}

      <aside 
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r transform transition-transform duration-300 ease-in-out transition-colors duration-500 md:relative md:translate-x-0 shadow-2xl md:shadow-none ${
          isBudgetBusted 
            ? 'bg-red-950 border-red-900 text-red-100' 
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        } ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-8">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-600 rounded-lg shadow-lg">
                <PlusSquare className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-2xl font-black text-red-700 dark:text-red-500 tracking-tighter">belinha</span>
                <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 ml-auto tracking-widest uppercase italic">sistema</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative" ref={notificationRef}>
                <button 
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} 
                  className={`p-2.5 rounded-xl transition-all ${getNotificationBtnClass()}`}
                >
                  <Bell size={20} className={hasNotifications ? 'animate-pulse' : ''} />
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
                    onOpenMural={onOpenMural}
                    muralPendingCount={muralPendingCount}
                  />
                )}
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1 text-slate-400 md:hidden">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="px-6 mb-8 flex flex-col gap-4">
            <div className={`flex items-center gap-3 p-3 rounded-2xl border ${
              isBudgetBusted
                ? 'bg-red-900/40 border-red-800/60 text-red-100'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'
            }`}>
              <div className={`p-2 rounded-xl ${
                isBudgetBusted
                  ? 'bg-red-900 text-red-200'
                  : isAdmin ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className={`text-xs font-black truncate uppercase tracking-tighter ${isBudgetBusted ? 'text-red-200' : 'text-slate-900 dark:text-slate-100'}`}>{user.name}</span>
                <span className={`text-[9px] font-bold uppercase tracking-widest ${isBudgetBusted ? 'text-red-400/80' : 'text-slate-400 dark:text-slate-500'}`}>{user.role}</span>
              </div>
            </div>

            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={`flex items-center justify-between p-3 rounded-2xl border group transition-all ${
                isBudgetBusted
                  ? 'bg-red-900/40 border-red-800/60 hover:bg-red-900/60 text-red-200'
                  : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isBudgetBusted ? 'text-red-300' : 'text-slate-400 dark:text-slate-500'}`}>Modo {theme === 'light' ? 'Escuro' : 'Claro'}</span>
              <div className={`p-1.5 rounded-lg shadow-sm border text-slate-500 dark:text-slate-400 group-hover:text-yellow-500 dark:group-hover:text-yellow-400 transition-colors ${
                isBudgetBusted ? 'bg-red-900 border-red-800' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-700'
              }`}>
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </div>
            </button>

            {/* Botão de Acesso Rápido ao Mural de Pendências */}
            {onOpenMural && (
              <button
                onClick={onOpenMural}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-500/15 to-orange-500/15 hover:from-amber-500/25 hover:to-orange-500/25 rounded-2xl border border-amber-300 dark:border-amber-700/50 group transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-lg shadow-sm">
                    <Sparkles size={16} className={muralPendingCount > 0 ? 'animate-pulse' : ''} />
                  </div>
                  <span className="text-[11px] font-black text-amber-900 dark:text-amber-200 uppercase tracking-tight">
                    Mural de Pendências
                  </span>
                </div>
                {muralPendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white shadow-sm animate-pulse">
                    {muralPendingCount}
                  </span>
                )}
              </button>
            )}

            {/* Botão de Incentivo VW Tera exclusivo para Nayane */}
            {user.name.toLowerCase().includes('nayane') && onOpenTeraModal && (
              <button 
                onClick={onOpenTeraModal}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-red-500/10 to-orange-500/10 hover:from-red-500/20 hover:to-orange-500/20 rounded-2xl border border-red-200/40 dark:border-orange-950/30 group transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <span className="text-[10px] font-black text-red-700 dark:text-orange-400 uppercase tracking-widest ml-1">Meu Sonho: VW Tera 🚗</span>
                <div className="p-1.5 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-red-100 dark:border-slate-800 text-red-600">
                  <Sparkles size={16} className="animate-pulse" />
                </div>
              </button>
            )}
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
            {sortedMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              const isVendas = item.id === 'whatsapp-vendas';

              let buttonClass = '';
              let iconClass = '';

              if (isVendas) {
                if (isActive) {
                  buttonClass = 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md font-black';
                  iconClass = 'text-white';
                } else {
                  buttonClass = 'bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/10 dark:from-amber-950/50 dark:via-orange-950/50 dark:to-amber-950/30 text-amber-900 dark:text-amber-200 border border-amber-300/80 dark:border-amber-600/50 hover:bg-amber-500/30 font-black shadow-sm';
                  iconClass = 'text-amber-600 dark:text-amber-400';
                }
              } else if (isActive) {
                buttonClass = isBudgetBusted 
                  ? 'bg-red-900 text-white shadow-sm'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 shadow-sm';
                iconClass = isBudgetBusted ? 'text-white' : 'text-red-600 dark:text-red-500';
              } else {
                buttonClass = isBudgetBusted
                  ? 'text-red-300 hover:bg-red-900/40 hover:text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100';
                iconClass = isBudgetBusted ? 'text-red-400' : 'text-slate-400 dark:text-slate-600';
              }

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setView(item.id as View);
                    if (window.innerWidth < 768) setIsOpen(false);
                  }}
                  className={`flex items-center w-full gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${buttonClass}`}
                >
                  <Icon className={`w-5 h-5 ${iconClass}`} />
                  <span className="truncate">{item.label}</span>
                  {isVendas && (
                    <span className={`ml-auto px-2 py-0.5 text-[10px] font-black rounded-full shadow-sm ${
                      isActive ? 'bg-white text-orange-600' : 'bg-gradient-to-r from-amber-400 to-orange-500 text-white animate-pulse'
                    }`}>
                      Destaque
                    </span>
                  )}
                  {item.id === 'debtors-report' && hasOverdue && (
                    <span className="ml-auto w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-sm" title="Existem clientes com pagamento atrasado" />
                  )}
                  {item.id === 'anvisa-alerts' && anvisaAlertCount > 0 && (
                    <span className="ml-auto px-2 py-0.5 text-xs font-bold text-white bg-red-600 rounded-full animate-pulse shadow-sm" title={`${anvisaAlertCount} produtos em estoque proibidos pela ANVISA`}>
                      {anvisaAlertCount}
                    </span>
                  )}
                  {item.id === 'central-compras' && purchasingPendingCount > 0 && (
                    <span className="ml-auto px-2 py-0.5 text-xs font-bold text-white bg-red-600 rounded-full animate-pulse shadow-sm" title={`${purchasingPendingCount} aprovações pendentes`}>
                      {purchasingPendingCount}
                    </span>
                  )}
                  {item.id === 'deliveries' && pendingReviewCount > 0 && (
                    <span className="ml-auto px-2 py-0.5 text-xs font-bold text-white bg-amber-500 dark:bg-amber-600 rounded-full animate-pulse shadow-sm" title={`${pendingReviewCount} revisões pendentes`}>
                      {pendingReviewCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className={`p-4 border-t transition-colors space-y-2 ${
            isBudgetBusted 
              ? 'border-red-900/50 bg-red-950/85' 
              : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50'
          }`}>
            {/* Status do Cache Digifarma */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/40 dark:border-slate-700/40 text-[11px]">
              <div className="flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span className="font-bold text-slate-700 dark:text-slate-300 truncate">
                  {digifarmaSyncText}
                </span>
              </div>
              <button
                onClick={handleForceSyncDigifarma}
                disabled={isSyncingDigifarma}
                title="Sincronizar Digifarma com a VPS agora"
                className="p-1 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDigifarma ? 'animate-spin text-blue-500' : ''}`} />
              </button>
            </div>

            <button
              onClick={onLogout}
              className={`flex items-center w-full gap-3 px-4 py-3 text-sm font-bold rounded-xl transition-all ${getLogoutBtnClass()}`}
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
