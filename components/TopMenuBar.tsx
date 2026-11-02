import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Settings as SettingsIcon,
  LogOut,
  ChevronDown,
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
  Sun,
  Moon,
  Database,
  Bell,
  AlertTriangle,
  FileText,
  Package,
  MessageSquare,
  Sparkles,
  BrainCircuit,
  HeartPulse,
  Radio,
  ContactRound,
  Printer,
  Activity,
  Calendar,
  Truck,
  ShieldAlert,
  NotebookPen,
  RefreshCw,
  ShoppingBag,
  Trash2,
  Thermometer,
  TableProperties,
  Flame,
  FileSpreadsheet,
} from 'lucide-react';
import { View, User, UserRole, Task, Boleto, BoletoStatus } from '../types';
import { NotificationPanel } from './NotificationPanel';

export type MenuLayoutMode = 'sidebar' | 'topbar';

export interface TopMenuBarProps {
  user: User;
  currentView: View;
  setView: (view: View) => void;
  onLogout: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  layoutMode: MenuLayoutMode;
  setLayoutMode: (mode: MenuLayoutMode) => void;
  tasks?: Task[];
  boletos?: Boleto[];
  onOpenTeraModal?: () => void;
  budgetStatus?: 'safe' | 'warning' | 'danger' | 'no-budget';
  onOpenMural?: () => void;
  muralPendingCount?: number;
  onOpenVersionModal?: () => void;
}

interface MenuItemDef {
  id: View;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties; size?: number }>;
  adminOnly?: boolean;
}

interface MenuCategoryDef {
  id: string;
  label: string;
  items: MenuItemDef[];
}

export const TopMenuBar: React.FC<TopMenuBarProps> = ({
  user,
  currentView,
  setView,
  onLogout,
  theme,
  setTheme,
  layoutMode,
  setLayoutMode,
  tasks = [],
  boletos = [],
  onOpenTeraModal,
  budgetStatus = 'no-budget',
  onOpenMural,
  muralPendingCount = 0,
  onOpenVersionModal,
}) => {
  const isAdmin = user.role === UserRole.ADM;
  const [openCategory, setOpenCategory] = React.useState<string | null>(null);
  const [isTracking, setIsTracking] = React.useState<boolean>(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const notificationRef = React.useRef<HTMLDivElement>(null);
  const menuBarRef = React.useRef<HTMLDivElement>(null);

  // Status badges & notifications
  const [hasOverdue, setHasOverdue] = React.useState(false);
  const [ifoodNotifCount, setIfoodNotifCount] = React.useState(0);
  const [pendingReviewCount, setPendingReviewCount] = React.useState(0);
  const [inTransitDeliveriesCount, setInTransitDeliveriesCount] = React.useState(0);
  const [anvisaAlertCount, setAnvisaAlertCount] = React.useState(0);
  const [purchasingPendingCount, setPurchasingPendingCount] = React.useState(0);
  const [isSyncingDigifarma, setIsSyncingDigifarma] = React.useState(false);
  const [digifarmaSyncText, setDigifarmaSyncText] = React.useState('Sincronizado');

  // Monitor Digifarma sync status
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

  // WhatsApp reviews & deliveries
  React.useEffect(() => {
    const checkDeliveries = async () => {
      try {
        const resReview = await fetch('/api/deliveries/pending-reviews');
        const dataReview = await resReview.json();
        if (dataReview.success && typeof dataReview.count === 'number') {
          setPendingReviewCount(dataReview.count);
        } else if (Array.isArray(dataReview.pending_reviews)) {
          setPendingReviewCount(dataReview.pending_reviews.length);
        }

        const resInTransit = await fetch('/api/deliveries/in-transit');
        if (resInTransit.ok) {
          const dataInTransit = await resInTransit.json();
          if (dataInTransit.success && typeof dataInTransit.count === 'number') {
            setInTransitDeliveriesCount(dataInTransit.count);
          }
        }
      } catch (e) {}
    };
    checkDeliveries();
    const interval = setInterval(checkDeliveries, 30000);
    return () => clearInterval(interval);
  }, [currentView]);

  // Overdue debtors
  React.useEffect(() => {
    if (!isAdmin) return;
    const checkOverdue = async () => {
      try {
        const res = await fetch('/api/debtors-report');
        const data = await res.json();
        if (Array.isArray(data)) {
          setHasOverdue(data.some((d: any) => d.hasOverdue === 1));
        }
      } catch (e) {}
    };
    checkOverdue();
    const interval = setInterval(checkOverdue, 60000);
    return () => clearInterval(interval);
  }, [isAdmin, currentView]);

  // iFood notifications
  React.useEffect(() => {
    if (!isAdmin) return;
    const checkIFood = async () => {
      try {
        const res = await fetch('/api/ifood-sales/notifications');
        const data = await res.json();
        if (Array.isArray(data)) {
          setIfoodNotifCount(data.length);
        }
      } catch (e) {}
    };
    checkIFood();
    const interval = setInterval(checkIFood, 300000);
    return () => clearInterval(interval);
  }, [isAdmin, currentView]);

  // ANVISA alerts
  React.useEffect(() => {
    const checkAnvisaAlerts = async () => {
      try {
        const res = await fetch('/api/anvisa/summary');
        const data = await res.json();
        if (data.success && typeof data.totalEmEstoque === 'number') {
          setAnvisaAlertCount(data.totalEmEstoque);
        }
      } catch (e) {}
    };
    checkAnvisaAlerts();
    const interval = setInterval(checkAnvisaAlerts, 120000);
    return () => clearInterval(interval);
  }, [currentView]);

  // Purchasing approvals
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
      } catch (e) {}
    };
    checkPurchasingApprovals();
    const interval = setInterval(checkPurchasingApprovals, 20000);
    return () => clearInterval(interval);
  }, [isAdmin, currentView]);

  // Calculate notifications
  const taskAttentionNotifications = tasks.filter(task =>
    task.needsAdminAttention && task.creator === user.id
  );
  const taskResponseNotifications = tasks.filter(task =>
    task.hasAdminResponse && task.assignedUser === user.id
  );
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const overdueBoletos = isAdmin ? boletos.filter(b => {
    const dueDate = new Date(b.due_date + 'T00:00:00');
    return b.status === BoletoStatus.PENDENTE && dueDate < now;
  }) : [];
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
    ifoodNotifCount +
    (isAdmin ? (muralPendingCount || 0) : 0) +
    (isAdmin ? (purchasingPendingCount || 0) : 0);
  const hasNotifications = totalNotifications > 0;

  // Click outside to close menus and notifications
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setOpenCategory(null);
        setIsTracking(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenCategory(null);
        setIsTracking(false);
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // 6 Functional ERP categories
  const categories: MenuCategoryDef[] = React.useMemo(() => [
    {
      id: 'vendas',
      label: 'Vendas & Atendimento',
      items: [
        { id: 'belinha-pdv', label: 'Belinha PDV', icon: DollarSign },
        { id: 'erp-vendas', label: 'Vendas do Dia', icon: Receipt },
        { id: 'deliveries', label: 'Pedidos & Entregas', icon: Truck },
        { id: 'orders', label: 'Pedidos', icon: ShoppingCart },
        { id: 'ifood-control', label: 'Controle iFood', icon: ShoppingCart, adminOnly: true },
        { id: 'promocoes-whatsapp', label: 'Promoção WhatsApp', icon: MessageSquare },
        { id: 'whatsapp-crm', label: 'CRM WhatsApp', icon: ContactRound, adminOnly: true },
        { id: 'whatsapp-vendas', label: 'Assistente de Vendas', icon: MessageSquare },
        { id: 'sales-report', label: 'Relatório Vendas', icon: TrendingUp, adminOnly: true },
      ],
    },
    {
      id: 'estoque',
      label: 'Estoque & Farmácia',
      items: [
        { id: 'erp-produtos', label: 'Estoque ERP', icon: Package },
        { id: 'erp-nfe', label: 'Entrada NF-e', icon: FileSpreadsheet },
        { id: 'medication-search', label: 'Consultar Medicamentos', icon: Search },
        { id: 'anvisa-alerts', label: 'Alertas ANVISA', icon: ShieldAlert },
        { id: 'controlled-medications', label: 'Controle Especial & SNGPC', icon: ShieldCheck },
        { id: 'inventario', label: 'Inventário Rotativo', icon: ClipboardList },
        { id: 'perdas-avarias', label: 'Perdas e Avarias', icon: Trash2 },
        { id: 'temperature-map', label: 'Mapa de Temperatura', icon: Thermometer },
        { id: 'labels', label: 'Etiquetas A4', icon: Printer },
        { id: 'price-manager', label: 'Gestão de Preços', icon: TrendingUp, adminOnly: true },
        { id: 'critical-stock', label: 'Estoque Crítico', icon: AlertTriangle, adminOnly: true },
        { id: 'stock', label: 'Estoque Geral', icon: Package, adminOnly: true },
      ],
    },
    {
      id: 'compras',
      label: 'Compras & Reposição',
      items: [
        { id: 'central-compras', label: 'Central de Compras', icon: ShoppingBag, adminOnly: true },
        { id: 'belaped', label: 'BelaPed Compras', icon: ShoppingBag, adminOnly: true },
        { id: 'compras-live', label: 'Sugestão Compras', icon: ShoppingCart },
        { id: 'reposicao-tabela', label: 'Análise Reposição', icon: TableProperties },
        { id: 'purchase-calendar', label: 'Calendário de Compras', icon: Calendar, adminOnly: true },
        { id: 'suppliers', label: 'Fornecedores', icon: UsersIcon },
        { id: 'quotations', label: 'Cotações', icon: MessageSquare },
        { id: 'shortages', label: 'Lista de Faltas', icon: ClipboardList },
      ],
    },
    {
      id: 'financeiro',
      label: 'Financeiro & Fiscal',
      items: [
        { id: 'cash-closing', label: 'Fechamento de Caixa', icon: Calculator, adminOnly: true },
        { id: 'daily-records', label: 'Lançamentos', icon: Receipt },
        { id: 'caixa-provisoes', label: 'Caixa & Provisões', icon: Wallet, adminOnly: true },
        { id: 'contas-a-pagar', label: 'Contas a Pagar', icon: Banknote, adminOnly: true },
        { id: 'checking-account', label: 'Conta Corrente', icon: Banknote, adminOnly: true },
        { id: 'debtors-report', label: 'Devedores', icon: AlertTriangle, adminOnly: true },
        { id: 'financial', label: 'Gestão Financeira', icon: Landmark, adminOnly: true },
        { id: 'financial-health', label: 'Saúde Financeira', icon: HeartPulse, adminOnly: true },
        { id: 'card-machines', label: 'Maquininhas & Cartões', icon: CreditCard, adminOnly: true },
        { id: 'liquidacao-caixa', label: 'Liquidação & Caixa', icon: Flame, adminOnly: true },
        { id: 'fiscal-contabil', label: 'Fiscal & Simples', icon: Receipt, adminOnly: true },
        { id: 'invoices', label: 'Notas Fiscais', icon: FileText, adminOnly: true },
        { id: 'consignados', label: 'Consignados', icon: Package, adminOnly: true },
        { id: 'safe', label: 'Cofre', icon: Lock, adminOnly: true },
      ],
    },
    {
      id: 'ferramentas',
      label: 'Ferramentas & IA',
      items: [
        { id: 'belafarma-ia', label: 'BelaFarma IA (Consultor)', icon: Sparkles, adminOnly: true },
        { id: 'ai-portal', label: 'Central de IAs', icon: BrainCircuit, adminOnly: true },
        { id: 'messaging-center', label: 'Mensagens WhatsApp', icon: MessageSquare, adminOnly: true },
        { id: 'radio-manager', label: 'Rádio Bela Farma', icon: Radio, adminOnly: true },
        { id: 'agenda', label: 'Agenda & Tarefas', icon: Calendar },
        { id: 'notes', label: 'Anotações', icon: NotebookPen },
        { id: 'system-watcher', label: 'Vigilante', icon: Activity, adminOnly: true },
        { id: 'logs', label: 'Auditoria de Ações', icon: History, adminOnly: true },
      ],
    },
    {
      id: 'sistema',
      label: 'Sistema & Cadastros',
      items: [
        { id: 'customers', label: 'Clientes', icon: UsersIcon },
        { id: 'users', label: 'Usuários', icon: UsersIcon, adminOnly: true },
        { id: 'backups', label: 'Backups', icon: Database, adminOnly: true },
        { id: 'settings', label: 'Configurações', icon: SettingsIcon },
      ],
    },
  ], []);

  // Filter items by user role
  const visibleCategories = categories.map(cat => ({
    ...cat,
    items: cat.items.filter(item => !item.adminOnly || isAdmin)
  })).filter(cat => cat.items.length > 0);

  // Helper to get notification badge for an item
  const getItemBadge = (itemId: View) => {
    if (itemId === 'promocoes-whatsapp') {
      return <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded-full bg-emerald-600 text-white animate-pulse">Novo</span>;
    }
    if (itemId === 'whatsapp-vendas') {
      return <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded-full bg-orange-500 text-white animate-pulse">Destaque</span>;
    }
    if (itemId === 'debtors-report' && hasOverdue) {
      return <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" title="Clientes em atraso" />;
    }
    if (itemId === 'anvisa-alerts' && anvisaAlertCount > 0) {
      return <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-red-600 text-white animate-pulse">{anvisaAlertCount}</span>;
    }
    if (itemId === 'central-compras' && purchasingPendingCount > 0) {
      return <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-red-600 text-white animate-pulse">{purchasingPendingCount}</span>;
    }
    if (itemId === 'deliveries' && (pendingReviewCount > 0 || inTransitDeliveriesCount > 0)) {
      return <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-white animate-pulse">{pendingReviewCount + inTransitDeliveriesCount}</span>;
    }
    if (itemId === 'ifood-control' && ifoodNotifCount > 0) {
      return <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-red-600 text-white animate-pulse">{ifoodNotifCount}</span>;
    }
    return null;
  };

  // Helper to check if a category has any pending notification/badge
  const getCategoryHasBadge = (catId: string) => {
    if (catId === 'vendas') {
      return ifoodNotifCount > 0 || pendingReviewCount > 0 || inTransitDeliveriesCount > 0;
    }
    if (catId === 'estoque') {
      return anvisaAlertCount > 0;
    }
    if (catId === 'compras') {
      return purchasingPendingCount > 0;
    }
    if (catId === 'financeiro') {
      return hasOverdue || overdueBoletos.length > 0;
    }
    return false;
  };

  const handleCategoryClick = (catId: string) => {
    if (openCategory === catId) {
      setOpenCategory(null);
      setIsTracking(false);
    } else {
      setOpenCategory(catId);
      setIsTracking(true);
    }
  };

  const handleCategoryMouseEnter = (catId: string) => {
    if (isTracking && openCategory !== catId) {
      setOpenCategory(catId);
    }
  };

  const handleItemSelect = (viewId: View) => {
    setView(viewId);
    setOpenCategory(null);
    setIsTracking(false);
  };

  return (
    <header
      ref={menuBarRef}
      className="hidden md:flex flex-col w-full border-b select-none transition-colors duration-300 relative z-30 shadow-xs"
      style={{
        backgroundColor: 'var(--bf-header-bg)',
        borderColor: 'var(--bf-header-border)',
        color: 'var(--bf-header-text)',
      }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 min-h-[46px] gap-2">
        {/* Left: Logo & Direct Dashboard button */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="bg-white px-2 py-0.5 rounded-lg shadow-2xs border border-slate-200/80 dark:border-white/20 flex items-center justify-center">
            <img src="/images/logo-bela-farma.jpg" alt="Bela Farma Sul" className="h-6 w-auto object-contain" />
          </div>

          <button
            onClick={() => handleItemSelect('dashboard')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              currentView === 'dashboard'
                ? 'bg-red-600 text-white shadow-xs'
                : 'hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
            }`}
            title="Ir para o Dashboard"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>
        </div>

        {/* Center: Windows-style Menubar Categories */}
        <nav className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar">
          {visibleCategories.map(cat => {
            const isOpen = openCategory === cat.id;
            const isCategoryActive = cat.items.some(i => i.id === currentView);
            const hasBadge = getCategoryHasBadge(cat.id);

            return (
              <div key={cat.id} className="relative">
                <button
                  type="button"
                  onClick={() => handleCategoryClick(cat.id)}
                  onMouseEnter={() => handleCategoryMouseEnter(cat.id)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    isOpen
                      ? 'bg-slate-200/90 dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : isCategoryActive
                      ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-black'
                      : 'hover:bg-slate-200/60 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span>{cat.label}</span>
                  {hasBadge && (
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse shadow-xs shrink-0" />
                  )}
                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-red-600' : ''}`} />
                </button>

                {/* Dropdown Menu Window */}
                {isOpen && (
                  <div
                    className="absolute left-0 mt-1 w-64 rounded-xl shadow-2xl border py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md"
                    style={{
                      backgroundColor: 'var(--bf-sidebar-bg)',
                      borderColor: 'var(--bf-sidebar-border)',
                      color: 'var(--bf-sidebar-text)',
                    }}
                  >
                    <div className="px-3 py-1 border-b mb-1 flex items-center justify-between" style={{ borderColor: 'var(--bf-sidebar-border)' }}>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {cat.label}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {cat.items.length} módulos
                      </span>
                    </div>

                    <div className="max-h-[70vh] overflow-y-auto custom-scrollbar px-1 space-y-0.5">
                      {cat.items.map(item => {
                        const Icon = item.icon;
                        const isItemActive = currentView === item.id;
                        const itemBadge = getItemBadge(item.id);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleItemSelect(item.id)}
                            className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer text-left ${
                              isItemActive
                                ? 'bg-red-600 text-white font-bold shadow-xs'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <Icon className={`w-4 h-4 shrink-0 ${isItemActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                              <span className="truncate">{item.label}</span>
                            </div>
                            {itemBadge && <div className="ml-2 shrink-0">{itemBadge}</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Right: Radio Selector, Sync, Notifications, Theme, User */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Radio Button Toggle: Menu Lateral / Menu Topo */}
          <div
            className="flex items-center p-0.5 rounded-lg border text-[11px] font-bold shadow-2xs"
            style={{
              backgroundColor: 'var(--bf-sidebar-hover-bg)',
              borderColor: 'var(--bf-sidebar-border)',
            }}
            title="Escolha o estilo de menu do sistema"
          >
            <label
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-all ${
                layoutMode === 'sidebar'
                  ? 'bg-white dark:bg-slate-700 shadow-xs text-red-600 dark:text-red-400 font-black'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <input
                type="radio"
                name="menu_layout_mode_topbar"
                checked={layoutMode === 'sidebar'}
                onChange={() => setLayoutMode('sidebar')}
                className="sr-only"
              />
              <span className={`w-2 h-2 rounded-full border transition-all ${layoutMode === 'sidebar' ? 'border-red-600 bg-red-600' : 'border-slate-400 bg-transparent'}`} />
              <span>Lateral</span>
            </label>

            <label
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-all ${
                layoutMode === 'topbar'
                  ? 'bg-white dark:bg-slate-700 shadow-xs text-red-600 dark:text-red-400 font-black'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <input
                type="radio"
                name="menu_layout_mode_topbar"
                checked={layoutMode === 'topbar'}
                onChange={() => setLayoutMode('topbar')}
                className="sr-only"
              />
              <span className={`w-2 h-2 rounded-full border transition-all ${layoutMode === 'topbar' ? 'border-red-600 bg-red-600' : 'border-slate-400 bg-transparent'}`} />
              <span>Topo</span>
            </label>
          </div>

          {/* Digifarma Sync */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-semibold"
            style={{
              backgroundColor: 'var(--bf-sidebar-hover-bg)',
              borderColor: 'var(--bf-sidebar-border)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            <span className="hidden xl:inline text-slate-600 dark:text-slate-300 truncate max-w-[120px]">
              {digifarmaSyncText}
            </span>
            <button
              onClick={handleForceSyncDigifarma}
              disabled={isSyncingDigifarma}
              title="Forçar sincronização Digifarma agora"
              className="p-0.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncingDigifarma ? 'animate-spin text-blue-500' : ''}`} />
            </button>
          </div>

          {/* Mural de Pendências */}
          {onOpenMural && (
            <button
              onClick={onOpenMural}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-300/60 dark:border-amber-600/40 text-amber-900 dark:text-amber-200 text-xs font-bold transition-all cursor-pointer"
              title="Abrir Mural de Pendências"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="hidden lg:inline text-[11px]">Mural</span>
              {muralPendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-red-600 text-white animate-pulse">
                  {muralPendingCount}
                </span>
              )}
            </button>
          )}

          {/* Notificações Bell */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer relative ${
                hasNotifications
                  ? 'bg-amber-100 text-amber-800 dark:bg-slate-800 dark:text-amber-400'
                  : 'hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
              style={{ borderColor: 'var(--bf-sidebar-border)' }}
              title="Notificações"
            >
              <Bell className={`w-4 h-4 ${hasNotifications ? 'animate-pulse text-amber-600' : ''}`} />
              {hasNotifications && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center bg-red-600 rounded-full border-2 border-white dark:border-slate-900 text-[9px] font-black text-white">
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

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-1.5 rounded-lg border hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
            style={{ borderColor: 'var(--bf-sidebar-border)' }}
            title={`Alternar para tema ${theme === 'light' ? 'Escuro' : 'Claro'}`}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-yellow-500" />}
          </button>

          {/* User info & Logout */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg border"
            style={{
              backgroundColor: 'var(--bf-sidebar-hover-bg)',
              borderColor: 'var(--bf-sidebar-border)',
            }}
          >
            <div
              className="p-1 rounded-md"
              style={{
                backgroundColor: 'var(--bf-user-badge-bg)',
                color: 'var(--bf-user-badge-text)',
              }}
            >
              {isAdmin ? <ShieldCheck className="w-3.5 h-3.5" /> : <UserIcon className="w-3.5 h-3.5" />}
            </div>
            <span className="text-xs font-bold truncate max-w-[100px] hidden sm:inline" style={{ color: 'var(--bf-sidebar-text)' }}>
              {user.name.split(' ')[0]}
            </span>
          </div>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
            title="Sair do sistema"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
