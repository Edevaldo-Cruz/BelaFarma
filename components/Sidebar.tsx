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
  DollarSign,
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
  Trash2, // Added for Perdas e Avarias
  Thermometer, // Added for Mapa de Temperatura
  TableProperties, // Added for Análise de Reposição / Importador Digifarma
  Flame, // Added for Liquidação & Aceleração de Caixa
  FileSpreadsheet, // Added for Entrada de NF-e ERP
} from 'lucide-react';
import { View, User, UserRole, Task, Boleto, BoletoStatus } from '../types';
import { NotificationPanel } from './NotificationPanel';
import { FeatureAuditModal, FeatureAuditItem } from './FeatureAuditModal';

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
  budgetStatus?: 'safe' | 'warning' | 'danger' | 'no-budget';
  onOpenMural?: () => void;
  muralPendingCount?: number;
  onOpenVersionModal?: () => void;
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
  budgetStatus = 'no-budget',
  onOpenMural,
  muralPendingCount = 0,
  onOpenVersionModal
}) => {
  // Derivar isBudgetBusted para compatibilidade com lógica existente
  const isBudgetBusted = budgetStatus === 'danger';
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

  const [inTransitDeliveriesCount, setInTransitDeliveriesCount] = React.useState(0);

  // Check in-transit active deliveries (questions)
  React.useEffect(() => {
    const checkInTransit = async () => {
      try {
        const res = await fetch('/api/deliveries/in-transit');
        if (res.ok) {
          const data = await res.json();
          if (data.success && typeof data.count === 'number') {
            setInTransitDeliveriesCount(data.count);
          }
        }
      } catch (error) {
        // Fail silently
      }
    };
    checkInTransit();
    const interval = setInterval(checkInTransit, 20000);
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
    { id: 'belinha-pdv', label: 'Belinha PDV', icon: DollarSign },
    { id: 'erp-vendas', label: 'Vendas do Caixa', icon: Receipt },
    { id: 'erp-produtos', label: 'Estoque ERP', icon: Package },
    { id: 'erp-nfe', label: 'Entrada NF-e', icon: FileSpreadsheet },
    { id: 'anvisa-alerts', label: 'Alertas ANVISA', icon: ShieldAlert },
    { id: 'logs', label: 'Auditoria', icon: History },
    { id: 'belaped', label: 'BelaPed Compras', icon: ShoppingBag },
    { id: 'promocoes-whatsapp', label: 'Promoção WhatsApp', icon: MessageSquare },
    { id: 'central-compras', label: 'Central de Compras', icon: ShoppingBag },
    { id: 'reposicao-tabela', label: 'Análise Reposição', icon: TableProperties },
    { id: 'customers', label: 'Clientes', icon: UsersIcon },
    { id: 'checking-account', label: 'Conta Corrente', icon: Banknote },
    { id: 'medication-search', label: 'Consultar Méd.', icon: Search },
    { id: 'debtors-report', label: 'Devedores', icon: AlertTriangle },
    { id: 'cash-closing', label: 'Fechamento', icon: Calculator },
    { id: 'agenda', label: 'Agenda & Tarefas', icon: Calendar },
    { id: 'notes', label: 'Anotações', icon: NotebookPen },
    { id: 'temperature-map', label: 'Mapa de Temperatura', icon: Thermometer },
    { id: 'daily-records', label: 'Lançamentos', icon: Receipt },

    { id: 'shortages', label: 'Lista de Faltas', icon: ClipboardList },
    { id: 'inventario', label: 'Inventário Rotativo', icon: ClipboardList },
    { id: 'perdas-avarias', label: 'Perdas e Avarias', icon: Trash2 },
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
    { id: 'contas-a-pagar', label: 'Contas a Pagar', icon: Banknote },
    { id: 'financial', label: 'Gestão Financeira', icon: Landmark },
    { id: 'financial-health', label: 'Saúde Financeira', icon: HeartPulse },
    { id: 'caixa-provisoes', label: 'Caixa & Provisões', icon: Wallet },
    { id: 'sales-report', label: 'Relatório Vendas', icon: TrendingUp },
    { id: 'critical-stock', label: 'Estoque Crítico', icon: AlertTriangle },
    { id: 'system-watcher', label: 'Vigilante', icon: Activity },
    { id: 'price-manager', label: 'Gestão de Preços', icon: TrendingUp },
    { id: 'liquidacao-caixa', label: 'Liquidação & Caixa', icon: Flame },
    { id: 'settings', label: 'Configurações', icon: SettingsIcon },
  ];


  const [auditReport, setAuditReport] = React.useState<{
    monitoringStartedAt: string;
    monitoringTargetDays: number;
    elapsedDays: number;
    daysRemaining: number;
    isPeriodCompleted: boolean;
    abandonedCount: number;
    uninstalledCount: number;
    features: FeatureAuditItem[];
  } | null>(null);
  const [isAuditModeActive, setIsAuditModeActive] = React.useState(false);
  const [checkedAbandonedIds, setCheckedAbandonedIds] = React.useState<Record<string, boolean>>({});
  const [isAuditModalOpen, setIsAuditModalOpen] = React.useState(false);

  const applyAuditReport = React.useCallback((data: any) => {
    if (!data || !Array.isArray(data.features)) return;
    setAuditReport({
      monitoringStartedAt: data.monitoringStartedAt || new Date().toISOString(),
      monitoringTargetDays: data.monitoringTargetDays || 15,
      elapsedDays: data.elapsedDays || 0,
      daysRemaining: typeof data.daysRemaining === 'number' ? data.daysRemaining : 15,
      isPeriodCompleted: Boolean(data.isPeriodCompleted),
      abandonedCount: data.abandonedCount || 0,
      uninstalledCount: data.uninstalledCount || 0,
      features: data.features
    });

    // Pré-seleciona por padrão todos os itens abandonados (0 usos no período)
    const defaultChecked: Record<string, boolean> = {};
    data.features.forEach((f: FeatureAuditItem) => {
      if (f.isAbandoned && f.status !== 'UNINSTALLED' && !f.isProtected) {
        defaultChecked[f.featureId] = true;
      }
    });
    setCheckedAbandonedIds(prev => {
      // Preserva escolhas manuais já feitas na sessão atual se existirem
      const merged: Record<string, boolean> = { ...defaultChecked };
      Object.keys(prev).forEach(k => {
        if (k in defaultChecked) merged[k] = prev[k];
      });
      return merged;
    });

    if (data.isPeriodCompleted && (data.abandonedCount || 0) > 0) {
      setIsAuditModeActive(true);
    }
  }, []);

  React.useEffect(() => {
    const fetchAuditStatus = async () => {
      try {
        const res = await fetch('/api/system/feature-audit/status');
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            applyAuditReport(data);
          }
        }
      } catch (e) {}
    };
    fetchAuditStatus();
  }, [currentView, applyAuditReport]);

  const auditMap = React.useMemo(() => {
    const map: Record<string, FeatureAuditItem> = {};
    if (auditReport?.features) {
      auditReport.features.forEach(f => {
        map[f.featureId] = f;
      });
    }
    return map;
  }, [auditReport]);

  // Filtra itens por permissão, oculta itens já desinstalados e garante que Dashboard fique no topo e Configurações no final
  const filteredMenuItems = menuItems.filter(item => {
    const auditItem = auditMap[item.id];
    if (auditItem && auditItem.status === 'UNINSTALLED') return false;

    const adminOnly = ['logs', 'belaped', 'central-compras', 'checking-account', 'cash-closing', 'financial', 'contas-a-pagar', 'users', 'safe', 'debtors-report', 'backups', 'consignados', 'invoices', 'ifood-control', 'messaging-center', 'ai-portal', 'radio-manager', 'whatsapp-crm', 'stock', 'financial-health', 'caixa-provisoes', 'sales-report', 'critical-stock', 'system-watcher', 'purchase-calendar', 'price-manager', 'card-machines', 'liquidacao-caixa']; 

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
  ].filter(Boolean);

  // Lista de abandonados visíveis para o Admin no menu
  const visibleAbandonedIds = sortedMenuItems
    .map(i => i.id)
    .filter(id => {
      const f = auditMap[id];
      return f ? (f.isAbandoned && !f.isProtected && f.status !== 'UNINSTALLED') : false;
    });

  const selectedForUninstallIds = visibleAbandonedIds.filter(id => checkedAbandonedIds[id] !== false);
  const keptFromAbandonedIds = visibleAbandonedIds.filter(id => checkedAbandonedIds[id] === false);
  const showCleanupCheckboxes = isAdmin && isAuditModeActive;

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

  const hasTheme = budgetStatus !== 'no-budget';

  const getNotificationBtnClass = () => {
    if (hasTheme) {
      return hasNotifications ? 'bg-amber-500/20 text-amber-300' : 'rounded-xl transition-all';
    }
    const bgClass = hasNotifications ? 'bg-amber-100' : 'bg-slate-50';
    const textClass = hasNotifications ? 'text-amber-800' : 'text-slate-500';
    const hoverClass = hasNotifications ? 'hover:bg-amber-200' : 'hover:text-slate-700';
    return bgClass + ' ' + textClass + ' ' + hoverClass + ' dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl transition-all';
  };

  const getLogoutBtnClass = () => {
    if (hasTheme) {
      return 'hover:opacity-70';
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
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r transform transition-all duration-500 ease-in-out md:relative md:translate-x-0 shadow-2xl md:shadow-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          backgroundColor: 'var(--bf-sidebar-bg)',
          borderColor: 'var(--bf-sidebar-border)',
          color: 'var(--bf-sidebar-text)',
        }}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-8">
            <div className="flex items-center gap-2.5">
              <div className="bg-white px-2.5 py-1.5 rounded-xl shadow-md border border-slate-200/80 dark:border-white/20 flex items-center justify-center">
                <img src="/images/logo-bela-farma.jpg" alt="Bela Farma Sul" className="h-8 w-auto object-contain" />
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
            <div
              className="flex items-center gap-3 p-3 rounded-2xl border"
              style={{
                backgroundColor: 'var(--bf-sidebar-hover-bg)',
                borderColor: 'var(--bf-sidebar-border)',
              }}
            >
              <div
                className="p-2 rounded-xl"
                style={{
                  backgroundColor: 'var(--bf-user-badge-bg)',
                  color: 'var(--bf-user-badge-text)',
                }}
              >
                {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-black truncate uppercase tracking-tighter" style={{ color: 'var(--bf-sidebar-text)' }}>{user.name}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--bf-sidebar-accent)' }}>{user.role}</span>
              </div>
            </div>

            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="flex items-center justify-between p-3 rounded-2xl border group transition-all hover:opacity-80"
              style={{
                backgroundColor: 'var(--bf-sidebar-hover-bg)',
                borderColor: 'var(--bf-sidebar-border)',
              }}
            >
              <span className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: 'var(--bf-sidebar-accent)' }}>Modo {theme === 'light' ? 'Escuro' : 'Claro'}</span>
              <div
                className="p-1.5 rounded-lg shadow-sm border group-hover:text-yellow-500 dark:group-hover:text-yellow-400 transition-colors"
                style={{
                  backgroundColor: 'var(--bf-sidebar-bg)',
                  borderColor: 'var(--bf-sidebar-border)',
                  color: 'var(--bf-sidebar-accent)',
                }}
              >
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
            {/* Painel de Auditoria de Recursos (15 Dias) exclusivo para Administradores */}
            {isAdmin && auditReport && (
              <div className="p-2.5 rounded-2xl border border-slate-300/60 dark:border-slate-700/60 bg-slate-100/70 dark:bg-slate-800/60 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ClipboardCheck className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-tight text-slate-800 dark:text-slate-200 truncate">
                      {auditReport.isPeriodCompleted
                        ? `Limpeza 15d (${visibleAbandonedIds.length} s/ uso)`
                        : `Auditoria 15d (Faltam ${auditReport.daysRemaining}d)`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAuditModeActive(!isAuditModeActive)}
                    className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer ${
                      showCleanupCheckboxes
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                    }`}
                    title="Ativar/Desativar visualização de checkboxes de limpeza no menu"
                  >
                    {showCleanupCheckboxes ? 'Ocultar' : 'Auditar'}
                  </button>
                </div>

                {showCleanupCheckboxes && visibleAbandonedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsAuditModalOpen(true)}
                    className="w-full py-1.5 px-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Desinstalar selecionados ({selectedForUninstallIds.length})</span>
                  </button>
                )}

                {showCleanupCheckboxes && visibleAbandonedIds.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setIsAuditModalOpen(true)}
                    className="w-full py-1 px-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>Ver Relatório / Quarentena ({auditReport.uninstalledCount})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
            {sortedMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              const isVendas = item.id === 'whatsapp-vendas';
              const auditInfo = auditMap[item.id];
              const isItemAbandoned = Boolean(auditInfo?.isAbandoned && !auditInfo?.isProtected && auditInfo?.status !== 'UNINSTALLED');
              const isCheckedForRemoval = checkedAbandonedIds[item.id] !== false;

              let buttonClass = '';
              let iconClass = '';
              let buttonStyle: React.CSSProperties = {};
              let iconStyle: React.CSSProperties = {};

              if (isVendas) {
                if (isActive) {
                  buttonClass = 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md font-black';
                  iconClass = 'text-white';
                } else {
                  buttonClass = 'bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/10 dark:from-amber-950/50 dark:via-orange-950/50 dark:to-amber-950/30 text-amber-900 dark:text-amber-200 border border-amber-300/80 dark:border-amber-600/50 hover:bg-amber-500/30 font-black shadow-sm';
                  iconClass = 'text-amber-600 dark:text-amber-400';
                }
              } else if (isActive) {
                buttonClass = 'shadow-sm';
                buttonStyle = { backgroundColor: 'var(--bf-nav-active-bg)', color: 'var(--bf-nav-active-text)' };
                iconStyle = { color: 'var(--bf-nav-active-text)' };
              } else {
                buttonClass = 'hover:opacity-80';
                buttonStyle = { color: 'var(--bf-nav-inactive-text)' };
                iconStyle = { color: 'var(--bf-nav-inactive-icon)' };
              }

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-1.5 rounded-xl transition-all ${
                    showCleanupCheckboxes && isItemAbandoned && isCheckedForRemoval
                      ? 'bg-red-500/10 dark:bg-red-950/30 border border-red-400/30 dark:border-red-800/40 pr-1.5'
                      : ''
                  }`}
                >
                  {showCleanupCheckboxes && isItemAbandoned && (
                    <input
                      type="checkbox"
                      checked={isCheckedForRemoval}
                      onChange={(e) => {
                        e.stopPropagation();
                        setCheckedAbandonedIds(prev => ({
                          ...prev,
                          [item.id]: e.target.checked
                        }));
                      }}
                      title={
                        isCheckedForRemoval
                          ? 'Sem uso nos últimos 15 dias (Sugestão: Desinstalar). Desmarque se quiser manter este recurso.'
                          : 'Marcado para manter no sistema por mais 15 dias.'
                      }
                      className="ml-2.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
                    />
                  )}

                  <button
                    onClick={() => {
                      setView(item.id as View);
                      if (window.innerWidth < 768) setIsOpen(false);
                    }}
                    className={`flex items-center flex-1 min-w-0 gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all ${buttonClass}`}
                    style={buttonStyle}
                  >
                    <Icon className={`w-5 h-5 shrink-0 ${iconClass}`} style={iconStyle} />
                    <span className={`truncate ${showCleanupCheckboxes && isItemAbandoned && isCheckedForRemoval ? 'line-through opacity-75' : ''}`}>
                      {item.label}
                    </span>
                    {showCleanupCheckboxes && isItemAbandoned && (
                      <span
                        className="ml-auto px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-red-500/20 text-red-600 dark:text-red-400 shrink-0"
                        title="0 acessos nos últimos 15 dias"
                      >
                        0 usos
                      </span>
                    )}
                    {isVendas && !showCleanupCheckboxes && (
                      <span className={`ml-auto px-2 py-0.5 text-[10px] font-black rounded-full shadow-sm ${
                        isActive ? 'bg-white text-orange-600' : 'bg-gradient-to-r from-amber-400 to-orange-500 text-white animate-pulse'
                      }`}>
                        Destaque
                      </span>
                    )}
                    {item.id === 'debtors-report' && hasOverdue && !showCleanupCheckboxes && (
                      <span className="ml-auto w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-sm" title="Existem clientes com pagamento atrasado" />
                    )}
                    {item.id === 'anvisa-alerts' && anvisaAlertCount > 0 && !showCleanupCheckboxes && (
                      <span className="ml-auto px-2 py-0.5 text-xs font-bold text-white bg-red-600 rounded-full animate-pulse shadow-sm" title={`${anvisaAlertCount} produtos em estoque proibidos pela ANVISA`}>
                        {anvisaAlertCount}
                      </span>
                    )}
                    {item.id === 'central-compras' && purchasingPendingCount > 0 && !showCleanupCheckboxes && (
                      <span className="ml-auto px-2 py-0.5 text-xs font-bold text-white bg-red-600 rounded-full animate-pulse shadow-sm" title={`${purchasingPendingCount} aprovações pendentes`}>
                        {purchasingPendingCount}
                      </span>
                    )}
                    {item.id === 'deliveries' && (pendingReviewCount > 0 || inTransitDeliveriesCount > 0) && !showCleanupCheckboxes && (
                      <span className="ml-auto px-2 py-0.5 text-xs font-bold text-white bg-amber-500 dark:bg-amber-600 rounded-full animate-pulse shadow-sm" title={`${pendingReviewCount} revisões pendentes, ${inTransitDeliveriesCount} perguntas ativas em rota`}>
                        {pendingReviewCount + inTransitDeliveriesCount}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </nav>

          <div
            className="p-4 border-t transition-colors space-y-2"
            style={{
              borderColor: 'var(--bf-footer-border)',
              backgroundColor: 'var(--bf-footer-bg)',
            }}
          >
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

            {/* Badge de Versão do Sistema */}
            <div 
              onClick={onOpenVersionModal}
              title="Clique para ver detalhes da versão e commit"
              className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-200/40 dark:bg-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300/40 dark:border-slate-700/40 text-[10px] cursor-pointer transition-all group"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Sparkles className="w-3 h-3 text-orange-500 group-hover:scale-110 transition-transform" />
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300 truncate">
                  v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0'}
                </span>
              </div>
              <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500">
                #{typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev'}
              </span>
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

      {/* Modal de Auditoria e Verificação de Segurança de Dependências */}
      {isAdmin && auditReport && (
        <FeatureAuditModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          selectedFeatureIds={selectedForUninstallIds}
          keptFeatureIds={keptFromAbandonedIds}
          allFeatures={auditReport.features}
          monitoringStartedAt={auditReport.monitoringStartedAt}
          elapsedDays={auditReport.elapsedDays}
          daysRemaining={auditReport.daysRemaining}
          isPeriodCompleted={auditReport.isPeriodCompleted}
          userName={user.name}
          onSuccessUpdate={(updatedReport) => {
            applyAuditReport(updatedReport);
          }}
        />
      )}
    </>
  );
};
