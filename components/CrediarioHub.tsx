import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileText,
  Link2,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShoppingBag,
  Users,
  Wallet,
  Wifi,
  WifiOff,
  X
} from 'lucide-react';
import { User, UserRole } from '../types';
import { useToast } from './ToastContext';
import { CrediarioCustomerProfileModal } from './CrediarioCustomerProfileModal';

export interface CrediarioHubProps {
  user: User;
  initialTab?: 'clientes' | 'lancamentos' | 'regras';
  initialFilter?: string;
}

interface UnifiedClientRow {
  id: number;
  digifarma_cliente_id?: number | null;
  customer_id?: string;
  portal_token: string;
  portal_url: string;
  customer_name: string;
  nickname: string;
  phone: string;
  cpf: string;
  responsible_name: string;
  authorized_buyers: string[];
  due_day: number;
  due_day_mode: string;
  credit_limit: number;
  principal_balance: number;
  late_fine: number;
  late_interest: number;
  total_charges: number;
  simulated_charges: number;
  total_balance: number;
  available_credit: number;
  overdue_principal: number;
  max_days_late: number;
  next_due_date: string;
  open_items_count: number;
  account_status: 'em_dia' | 'vencido' | 'zerado' | 'bloqueado' | string;
  is_blocked: boolean;
  interest_exempt: boolean;
  bought_today: boolean;
  missing_contact: boolean;
  has_movement_this_year?: boolean;
  last_movement_date?: string;
  last_payment?: any;
}

interface CrediarioKpis {
  totalPrincipal: number;
  totalCharges: number;
  totalReceivable: number;
  totalOverdue: number;
  overdueClientsCount: number;
  activeOpenClientsCount: number;
  activeThisYearClientsCount?: number;
  currentYear?: number;
  totalClientsCount: number;
  allClientsCount?: number;
  onlyCurrentYear?: boolean;
  paidThisMonth: number;
  interestEnabled: boolean;
}

interface UnifiedPurchaseGroup {
  id: string;
  cardId: number | null;
  clientName: string;
  phone: string;
  saleId: string;
  date: string;
  dueDate: string;
  buyerName: string;
  source: 'DIGIFARMA' | 'BELINHA' | string;
  totalAmount: number;
  items: Array<{
    productName: string;
    quantity: number;
    amount: number;
  }>;
}

interface UnifiedPaymentRow {
  id: string;
  cardId: number | null;
  clientName: string;
  date: string;
  amount: number;
  debtBefore: number;
  isFullSettlement: boolean;
  method: string;
  source: 'DIGIFARMA' | 'BELINHA' | string;
}

interface CrediarioConfig {
  interestEnabled: boolean;
  lateFinePercent: number;
  lateInterestMonthlyPercent: number;
  graceDays: number;
  autoBlockDays: number;
  pixKey: string;
  pixMerchantName: string;
  pixMerchantCity: string;
  storeWhatsapp: string;
  publicBaseUrl: string;
  autoNotifyNewPurchase: boolean;
  autoNotifyDueDay: boolean;
  autoNotifyOverdue: boolean;
  templates: {
    purchase: string;
    statement: string;
    due_reminder: string;
    overdue: string;
    payment_receipt: string;
  };
}

const CURRENT_YEAR = new Date().getFullYear();

const FILTER_OPTIONS = [
  { id: 'all', label: 'Todos' },
  { id: 'com_saldo', label: 'Com Saldo' },
  { id: 'vencidos', label: 'Vencidos' },
  { id: 'em_dia', label: 'Em Dia' },
  { id: 'compras_hoje', label: 'Compraram Hoje' },
  { id: 'bloqueados', label: 'Bloqueados' },
  { id: 'incompletos', label: 'Cadastro Incompleto' }
];

const TEMPLATE_VARIABLES = [
  '{nome}',
  '{primeiro_nome}',
  '{valor_compra}',
  '{itens_compra}',
  '{resumo_marco}',
  '{saldo_atual}',
  '{vencimento}',
  '{link_portal}',
  '{chave_pix}',
  '{pix_copia_cola}',
  '{dias_atraso}'
];

function formatCurrency(val: number | undefined | null): string {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const clean = String(dateStr).trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(dateStr);
  return Number.isNaN(dt.getTime()) ? String(dateStr) : dt.toLocaleDateString('pt-BR');
}

function formatDateTimeBR(isoOrSql?: string | null): string {
  if (!isoOrSql) return 'Nunca sincronizado';
  const normalized = String(isoOrSql).includes('T')
    ? String(isoOrSql)
    : String(isoOrSql).replace(' ', 'T');
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return String(isoOrSql);
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function copyClipboardSafe(text: string): Promise<boolean> {
  if (!text) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
    }
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function useNativeDialog(
  dialogRef: React.RefObject<HTMLDialogElement | null>,
  isOpen: boolean,
  onClose: () => void
) {
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    if (isOpen) {
      if (!dlg.open) {
        try {
          dlg.showModal();
        } catch {}
      }
    } else if (dlg.open) {
      dlg.close();
    }
  }, [dialogRef, isOpen]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    const handleClose = () => {
      if (isOpen) onClose();
    };
    dlg.addEventListener('close', handleClose);

    let cleanupFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const isOutside = (e: PointerEvent) => {
        const r = dlg.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      const onDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) dlg.close();
      };
      dlg.addEventListener('pointerdown', onDown);
      dlg.addEventListener('pointerup', onUp);
      cleanupFallback = () => {
        dlg.removeEventListener('pointerdown', onDown);
        dlg.removeEventListener('pointerup', onUp);
      };
    }

    return () => {
      dlg.removeEventListener('close', handleClose);
      if (cleanupFallback) cleanupFallback();
    };
  }, [dialogRef, isOpen, onClose]);
}

export const CrediarioHub: React.FC<CrediarioHubProps> = ({
  user,
  initialTab = 'clientes',
  initialFilter = 'all'
}) => {
  const { addToast } = useToast();
  const uid = useId();
  const isAdmin = user?.role === UserRole.ADM || user?.role === 'Administrador';

  const safeInitialTab = !isAdmin && initialTab === 'regras' ? 'clientes' : initialTab;
  const [activeTab, setActiveTab] = useState<'clientes' | 'lancamentos' | 'regras'>(safeInitialTab);

  // Aba 1: Carteira de Clientes
  const [clients, setClients] = useState<UnifiedClientRow[]>([]);
  const [kpis, setKpis] = useState<CrediarioKpis>({
    totalPrincipal: 0,
    totalCharges: 0,
    totalReceivable: 0,
    totalOverdue: 0,
    overdueClientsCount: 0,
    activeOpenClientsCount: 0,
    totalClientsCount: 0,
    allClientsCount: 0,
    onlyCurrentYear: true,
    paidThisMonth: 0,
    interestEnabled: false
  });
  const [syncMeta, setSyncMeta] = useState<any>(null);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientSearch, setClientSearch] = useState('');
  const [clientFilter, setClientFilter] = useState(initialFilter || 'all');
  const [onlyCurrentYear, setOnlyCurrentYear] = useState(true);
  const [syncingDigifarma, setSyncingDigifarma] = useState(false);

  // Aba 2: Lançamentos & Compras
  const [txPeriodDays, setTxPeriodDays] = useState<number>(60);
  const [txSearch, setTxSearch] = useState('');
  const [txView, setTxView] = useState<'purchases' | 'payments'>('purchases');
  const [purchases, setPurchases] = useState<UnifiedPurchaseGroup[]>([]);
  const [payments, setPayments] = useState<UnifiedPaymentRow[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // Aba 3: Regras, Juros & Automação (Admin-only)
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<{ connected?: boolean }>({ connected: false });
  const [config, setConfig] = useState<CrediarioConfig | null>(null);

  // Modal 360° de Cliente
  const [profileModal, setProfileModal] = useState<{
    isOpen: boolean;
    cardId: number | null;
    initialPanel: 'none' | 'receive' | 'purchase' | 'whatsapp' | 'edit';
    initialSaleId?: string;
  }>({
    isOpen: false,
    cardId: null,
    initialPanel: 'none',
    initialSaleId: ''
  });

  // Modal + Novo Cliente (<dialog> nativo)
  const newClientDialogRef = useRef<HTMLDialogElement>(null);
  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    customer_name: '',
    nickname: '',
    cpf: '',
    phone: '',
    credit_limit: '300',
    due_day: '20',
    due_day_mode: 'auto' as 'auto' | 'fixed',
    responsible_name: '',
    notes: ''
  });

  // Modal + Anotação no Crediário (<dialog> nativo)
  const annotationDialogRef = useRef<HTMLDialogElement>(null);
  const [isAnnotationOpen, setIsAnnotationOpen] = useState(false);
  const [annotationDirectory, setAnnotationDirectory] = useState<UnifiedClientRow[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [annotationClientSearch, setAnnotationClientSearch] = useState('');
  const [selectedAnnotationCardId, setSelectedAnnotationCardId] = useState<number | null>(null);
  const [submittingAnnotation, setSubmittingAnnotation] = useState(false);
  const [annotationForm, setAnnotationForm] = useState({
    description: '',
    unitPrice: '',
    quantity: '1',
    buyerName: ''
  });

  // Sincroniza troca de rota externa (Ex: Menu "Devedores / Em Atraso" -> initialFilter='vencidos')
  useEffect(() => {
    const targetTab = !isAdmin && initialTab === 'regras' ? 'clientes' : initialTab;
    setActiveTab(targetTab);
  }, [initialTab, isAdmin]);

  useEffect(() => {
    if (initialFilter) {
      setClientFilter(initialFilter === 'movimento_ano' ? 'all' : initialFilter);
    }
  }, [initialFilter]);

  const fetchClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      const params = new URLSearchParams();
      if (clientSearch.trim()) params.set('q', clientSearch.trim());
      if (clientFilter) params.set('filter', clientFilter);
      params.set('yearOnly', onlyCurrentYear ? '1' : '0');
      const res = await fetch(`/api/crediario-v2/clients?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao carregar carteira de clientes.');
      }
      setClients(Array.isArray(data.clients) ? data.clients : []);
      if (data.kpis) setKpis(data.kpis);
      if (data.sync !== undefined) setSyncMeta(data.sync);
    } catch (err: any) {
      addToast(err?.message || 'Falha ao carregar crediário.', 'error');
    } finally {
      setClientsLoading(false);
    }
  }, [clientSearch, clientFilter, onlyCurrentYear, addToast]);

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('periodDays', String(txPeriodDays));
      if (txSearch.trim()) params.set('q', txSearch.trim());
      const res = await fetch(`/api/crediario-v2/transactions?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao carregar lançamentos.');
      }
      setPurchases(Array.isArray(data.purchases) ? data.purchases : []);
      setPayments(Array.isArray(data.payments) ? data.payments : []);
    } catch (err: any) {
      addToast(err?.message || 'Erro ao consultar lançamentos.', 'error');
    } finally {
      setTxLoading(false);
    }
  }, [txPeriodDays, txSearch, addToast]);

  const fetchSettings = useCallback(async () => {
    if (!isAdmin) return;
    setSettingsLoading(true);
    try {
      const res = await fetch('/api/crediario-v2/settings');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao carregar regras do crediário.');
      }
      setConfig(data.config);
      setWhatsappStatus(data.whatsappStatus || { connected: false });
      if (data.sync !== undefined) setSyncMeta(data.sync);
    } catch (err: any) {
      addToast(err?.message || 'Erro ao carregar configurações.', 'error');
    } finally {
      setSettingsLoading(false);
    }
  }, [isAdmin, addToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClients();
    }, 180);
    return () => clearTimeout(timer);
  }, [fetchClients]);

  useEffect(() => {
    if (activeTab === 'lancamentos') {
      const timer = setTimeout(() => {
        fetchTransactions();
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [activeTab, fetchTransactions]);

  useEffect(() => {
    if (activeTab === 'regras' && isAdmin) {
      fetchSettings();
    }
  }, [activeTab, isAdmin, fetchSettings]);

  const closeNewClient = useCallback(() => setIsNewClientOpen(false), []);
  const closeAnnotationModal = useCallback(() => setIsAnnotationOpen(false), []);
  useNativeDialog(newClientDialogRef, isNewClientOpen, closeNewClient);
  useNativeDialog(annotationDialogRef, isAnnotationOpen, closeAnnotationModal);

  const handleOpenAnnotationModal = useCallback(async () => {
    setIsAnnotationOpen(true);
    setAnnotationClientSearch('');
    setSelectedAnnotationCardId(null);
    setAnnotationForm({ description: '', unitPrice: '', quantity: '1', buyerName: '' });
    setLoadingDirectory(true);
    try {
      const res = await fetch('/api/crediario-v2/clients?yearOnly=0&filter=all');
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.clients)) {
        setAnnotationDirectory(data.clients);
      } else {
        setAnnotationDirectory(clients);
      }
    } catch {
      setAnnotationDirectory(clients);
    } finally {
      setLoadingDirectory(false);
    }
  }, [clients]);

  const handleSubmitQuickAnnotation = async (e: React.FormEvent, openAfter = false) => {
    e.preventDefault();
    if (!selectedAnnotationCardId) {
      addToast('Selecione o cliente para lançar a anotação.', 'warning');
      return;
    }
    const cleanDesc = annotationForm.description.trim();
    const unitNum =
      parseFloat(String(annotationForm.unitPrice).replace(/\./g, '').replace(',', '.')) ||
      parseFloat(String(annotationForm.unitPrice).replace(',', '.'));
    const qtyNum = Math.max(1, parseInt(String(annotationForm.quantity).replace(/\D/g, ''), 10) || 1);

    if (!cleanDesc) {
      addToast('Informe a descrição do produto ou anotação.', 'warning');
      return;
    }
    if (isNaN(unitNum) || unitNum <= 0) {
      addToast('Informe um preço válido maior que zero.', 'warning');
      return;
    }

    const totalVal = Math.round(unitNum * qtyNum * 100) / 100;
    setSubmittingAnnotation(true);
    try {
      const res = await fetch(`/api/crediario-v2/clients/${selectedAnnotationCardId}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: cleanDesc,
          unitPrice: unitNum,
          quantity: qtyNum,
          amount: totalVal,
          buyerName: annotationForm.buyerName.trim(),
          isAnnotation: true
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Não foi possível lançar a anotação.');
      }

      const targetCardId = selectedAnnotationCardId;
      addToast('Anotação somada como produto no crediário com sucesso!', 'success');
      setIsAnnotationOpen(false);
      await fetchClients();
      if (activeTab === 'lancamentos') await fetchTransactions();
      if (openAfter) {
        handleOpenProfile(targetCardId, 'none');
      }
    } catch (err: any) {
      addToast(err?.message || 'Erro ao salvar anotação.', 'error');
    } finally {
      setSubmittingAnnotation(false);
    }
  };

  const handleSyncDigifarma = async () => {
    setSyncingDigifarma(true);
    try {
      const res = await fetch('/api/crediario-v2/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyNewPurchases: false })
      });
      const data = await res.json();
      if (!res.ok || data.offline || data.success === false) {
        addToast(
          data.message || data.error || 'Digifarma indisponível no momento. Exibindo cache local.',
          'warning'
        );
      } else {
        addToast(
          `Sincronizado com o Digifarma (${data.itemsCount ?? data.recordsCount ?? 0} itens em aberto e ${
            data.clientsCount ?? 0
          } clientes).`,
          'success'
        );
      }
      await fetchClients();
      if (activeTab === 'lancamentos') await fetchTransactions();
    } catch {
      addToast('Falha ao conectar para sincronização com Digifarma.', 'error');
    } finally {
      setSyncingDigifarma(false);
    }
  };

  const handleOpenProfile = (
    cardId: number | null,
    panel: 'none' | 'receive' | 'purchase' | 'whatsapp' | 'edit' = 'none',
    saleId = ''
  ) => {
    if (!cardId) {
      addToast('Este cliente ainda não possui ficha vinculada no crediário.', 'warning');
      return;
    }
    setProfileModal({
      isOpen: true,
      cardId,
      initialPanel: panel,
      initialSaleId: saleId
    });
  };

  const handleCopyPortalLink = async (client: UnifiedClientRow) => {
    const url = client.portal_url || `${window.location.origin}/minha-conta/${client.portal_token}`;
    const ok = await copyClipboardSafe(url);
    if (ok) {
      addToast(`Link do portal de ${client.customer_name} copiado!`, 'success');
    } else {
      addToast('Não foi possível copiar o link.', 'error');
    }
  };

  const handleCreateClient = async (e: React.FormEvent, openAfter = false) => {
    e.preventDefault();
    if (!newClientForm.customer_name.trim()) {
      addToast('Informe o nome completo do cliente.', 'warning');
      return;
    }
    setCreatingClient(true);
    try {
      const payload: any = {
        customer_name: newClientForm.customer_name.trim(),
        nickname: newClientForm.nickname.trim(),
        cpf: newClientForm.cpf.replace(/\D/g, ''),
        phone: newClientForm.phone.replace(/\D/g, ''),
        due_day: Number(newClientForm.due_day) || 20,
        due_day_mode: newClientForm.due_day_mode,
        responsible_name: newClientForm.responsible_name.trim(),
        notes: newClientForm.notes.trim()
      };
      if (isAdmin) {
        payload.credit_limit = Number(newClientForm.credit_limit) || 300;
      }

      const res = await fetch('/api/crediario-v2/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao cadastrar cliente.');
      }

      addToast('Cliente cadastrado no crediário com sucesso!', 'success');
      setIsNewClientOpen(false);
      setNewClientForm({
        customer_name: '',
        nickname: '',
        cpf: '',
        phone: '',
        credit_limit: '300',
        due_day: '20',
        due_day_mode: 'auto',
        responsible_name: '',
        notes: ''
      });
      await fetchClients();

      if (openAfter && data.card?.id) {
        handleOpenProfile(data.card.id, 'none');
      }
    } catch (err: any) {
      addToast(err?.message || 'Erro ao salvar novo cliente.', 'error');
    } finally {
      setCreatingClient(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || !isAdmin) return;
    setSavingSettings(true);
    try {
      const res = await fetch('/api/crediario-v2/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao salvar configurações.');
      }
      setConfig(data.config);
      addToast('Regras, juros e modelos do crediário salvos!', 'success');
      await fetchClients();
    } catch (err: any) {
      addToast(err?.message || 'Não foi possível salvar as regras.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const renderStatusBadge = (row: UnifiedClientRow) => {
    if (row.is_blocked || row.account_status === 'bloqueado') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-900 text-white dark:bg-red-900/70 dark:text-red-100 whitespace-nowrap">
          <Lock className="w-3 h-3" />
          Bloqueado
        </span>
      );
    }
    if (row.account_status === 'vencido' || row.overdue_principal > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 whitespace-nowrap">
          <AlertTriangle className="w-3 h-3" />
          Vencido ({row.max_days_late}d)
        </span>
      );
    }
    if (row.account_status === 'zerado' || row.principal_balance <= 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 whitespace-nowrap">
          <CheckCircle2 className="w-3 h-3" />
          Zerado
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200 whitespace-nowrap">
        Em Dia
      </span>
    );
  };

  const clientsHeadingId = `${uid}-clients-heading`;
  const clientSearchId = `${uid}-client-search`;
  const txSearchId = `${uid}-tx-search`;
  const txPeriodId = `${uid}-tx-period`;
  const newClientTitleId = `${uid}-new-client-title`;

  return (
    <div className="space-y-5 pb-10">
      {/* Cabeçalho Unificado */}
      <header className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 text-white flex items-center justify-center shadow-sm shrink-0">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                CENTRAL DO CREDIÁRIO BELAFARMA
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  kpis.interestEnabled
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {kpis.interestEnabled ? 'Juros Ativos' : 'Juros Desligados'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Ficha 360° • Extrato Simples (Idosos) &amp; Completo • PIX &amp; WhatsApp</span>
              <span className="text-slate-400">•</span>
              <span>Histórico a partir de 01/10/2025</span>
              <span className="text-slate-400">•</span>
              <span>
                Último sync Digifarma:{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {formatDateTimeBR(syncMeta?.ultima_sincronizacao)}
                </strong>
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleSyncDigifarma}
            disabled={syncingDigifarma}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncingDigifarma ? 'animate-spin' : ''}`} />
            <span>{syncingDigifarma ? 'Sincronizando...' : 'Sincronizar Digifarma'}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAnnotationModal}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>+ Anotação no Crediário</span>
          </button>

          <button
            type="button"
            onClick={() => setIsNewClientOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Cliente</span>
          </button>
        </div>
      </header>

      {/* 4 KPIs Reais */}
      <section aria-label="Indicadores do crediário" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Total a Receber</span>
            <Wallet className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums mt-1.5">
            {formatCurrency(kpis.totalReceivable)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {kpis.totalCharges > 0
              ? `Principal ${formatCurrency(kpis.totalPrincipal)} + ${formatCurrency(kpis.totalCharges)} encargos`
              : `Principal em aberto: ${formatCurrency(kpis.totalPrincipal)}`}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Em Atraso / Vencido</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-black text-red-600 dark:text-red-400 tabular-nums mt-1.5">
            {formatCurrency(kpis.totalOverdue)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {kpis.overdueClientsCount} cliente(s) com parcelas vencidas
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Contas com Saldo</span>
            <Users className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums mt-1.5">
            {kpis.activeOpenClientsCount}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {onlyCurrentYear
              ? `de ${kpis.totalClientsCount} cliente(s) com movimento em ${kpis.currentYear || CURRENT_YEAR}`
              : `de ${kpis.totalClientsCount} ficha(s) cadastradas`}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Recebido no Mês</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-1.5">
            {formatCurrency(kpis.paidThisMonth)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Baixas locais + Digifarma no mês atual
          </p>
        </div>
      </section>

      {/* Navegação das 3 Abas */}
      <nav aria-label="Seções do crediário" className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('clientes')}
          className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'clientes'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Carteira de Clientes</span>
          <span className="px-1.5 py-0.5 rounded-md text-xs bg-black/15">
            {clients.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('lancamentos')}
          className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'lancamentos'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Lançamentos &amp; Compras</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('regras')}
            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors ${
              activeTab === 'regras'
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Regras, Juros &amp; Automação</span>
          </button>
        )}
      </nav>

      {/* ABA 1: CARTEIRA DE CLIENTES */}
      {activeTab === 'clientes' && (
        <section
          aria-labelledby={clientsHeadingId}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 id={clientsHeadingId} className="text-base font-extrabold text-slate-900 dark:text-white">
                  Carteira de Clientes do Crediário
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Clique no cliente para abrir a Ficha 360°, Extrato Simples/Completo, Recebimento ou WhatsApp.
                </p>
              </div>

              <search className="w-full md:w-96">
                <label htmlFor={clientSearchId} className="sr-only">
                  Buscar cliente por nome, apelido, CPF, telefone ou comprador autorizado
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id={clientSearchId}
                    type="search"
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    placeholder="Buscar por nome, CPF, telefone ou comprador..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:border-red-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
                  />
                </div>
              </search>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros da carteira">
                {FILTER_OPTIONS.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setClientFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      clientFilter === f.id
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {onlyCurrentYear && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200 text-[11px] font-bold">
                    Mostrando apenas clientes com movimento em {kpis.currentYear || CURRENT_YEAR}
                  </span>
                )}
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!onlyCurrentYear}
                    onChange={e => setOnlyCurrentYear(!e.target.checked)}
                    className="w-4 h-4 accent-red-600 rounded"
                  />
                  <span>Incluir cadastros sem movimento em {CURRENT_YEAR}</span>
                </label>
              </div>
            </div>
          </div>

          <div className="crediario-table-region">
            <div
              tabIndex={0}
              role="region"
              aria-labelledby={clientsHeadingId}
              className="crediario-responsive-table overflow-x-auto"
            >
              <table className="w-full text-left border-collapse">
                <caption className="sr-only">Carteira de clientes do crediário</caption>
                <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 whitespace-nowrap">
                      Cliente
                    </th>
                    <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                      Situação
                    </th>
                    <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                      Vencimento
                    </th>
                    <th scope="col" className="px-3 py-2.5 whitespace-nowrap text-right">
                      Principal
                    </th>
                    <th scope="col" className="px-3 py-2.5 whitespace-nowrap text-right">
                      Encargos
                    </th>
                    <th scope="col" className="px-3 py-2.5 whitespace-nowrap text-right">
                      Total Aberto
                    </th>
                    <th scope="col" className="px-3 py-2.5 whitespace-nowrap text-right">
                      Limite / Disp.
                    </th>
                    <th scope="col" className="px-4 py-2.5 whitespace-nowrap text-right">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {clientsLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                        Carregando carteira de clientes...
                      </td>
                    </tr>
                  ) : clients.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                        <div className="space-y-2.5">
                          <p>
                            {onlyCurrentYear
                              ? `Nenhum cliente com movimentação em ${kpis.currentYear || CURRENT_YEAR} para este filtro.`
                              : 'Nenhum cliente encontrado para o filtro selecionado.'}
                          </p>
                          {onlyCurrentYear && (
                            <button
                              type="button"
                              onClick={() => setOnlyCurrentYear(false)}
                              className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity"
                            >
                              Incluir cadastros sem movimento em {kpis.currentYear || CURRENT_YEAR}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    clients.map(row => (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td data-label="Cliente" className="px-4 py-2.5 align-middle max-w-[300px]">
                          <button
                            type="button"
                            onClick={() => handleOpenProfile(row.id, 'none')}
                            className="text-left group focus:outline-none w-full"
                          >
                            <div className="font-bold text-slate-900 dark:text-white group-hover:text-red-600 transition-colors truncate">
                              {row.customer_name}
                              {row.nickname ? (
                                <span className="ml-1.5 font-medium text-xs text-slate-500">
                                  ({row.nickname})
                                </span>
                              ) : null}
                            </div>
                            <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>{row.phone || 'Sem telefone'}</span>
                              <span>•</span>
                              <span>{row.cpf ? `CPF ${row.cpf}` : 'Sem CPF'}</span>
                              {row.last_movement_date && (
                                <>
                                  <span>•</span>
                                  <span>Últ. mov. {formatDateBR(row.last_movement_date)}</span>
                                </>
                              )}
                              {row.interest_exempt && (
                                <span className="px-1.5 py-0 rounded bg-emerald-100 text-emerald-800 font-bold">
                                  Isento
                                </span>
                              )}
                              {row.missing_contact && (
                                <span className="px-1.5 py-0 rounded bg-amber-100 text-amber-800 font-bold">
                                  Cadastro Incompleto
                                </span>
                              )}
                            </div>
                          </button>
                        </td>

                        <td data-label="Situação" className="px-3 py-2.5 align-middle">
                          {renderStatusBadge(row)}
                        </td>

                        <td data-label="Vencimento" className="px-3 py-2.5 align-middle whitespace-nowrap text-xs">
                          {row.principal_balance <= 0 ? (
                            <span className="text-slate-400">-</span>
                          ) : (
                            <div>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {row.next_due_date ? formatDateBR(row.next_due_date) : `Dia ${row.due_day}`}
                              </span>
                              {row.due_day_mode === 'fixed' && (
                                <span className="ml-1 text-[10px] text-slate-500">(fixo)</span>
                              )}
                            </div>
                          )}
                        </td>

                        <td
                          data-label="Principal"
                          className="px-3 py-2.5 align-middle text-right font-semibold tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap"
                        >
                          {formatCurrency(row.principal_balance)}
                        </td>

                        <td
                          data-label="Encargos"
                          className="px-3 py-2.5 align-middle text-right tabular-nums whitespace-nowrap text-xs"
                        >
                          {row.total_charges > 0 ? (
                            <span className="font-bold text-red-600 dark:text-red-400">
                              {formatCurrency(row.total_charges)}
                            </span>
                          ) : row.simulated_charges > 0 ? (
                            <span
                              className="text-slate-400"
                              title={`Encargos simulados (juros desligados ou cliente isento): ${formatCurrency(
                                row.simulated_charges
                              )}`}
                            >
                              {formatCurrency(0)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td
                          data-label="Total Aberto"
                          className="px-3 py-2.5 align-middle text-right font-black tabular-nums text-slate-900 dark:text-white whitespace-nowrap"
                        >
                          {formatCurrency(row.total_balance)}
                        </td>

                        <td
                          data-label="Limite / Disp."
                          className="px-3 py-2.5 align-middle text-right tabular-nums whitespace-nowrap text-xs text-slate-600 dark:text-slate-400"
                        >
                          <div>{formatCurrency(row.credit_limit)}</div>
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                            Disp: {formatCurrency(row.available_credit)}
                          </div>
                        </td>

                        <td data-label="Ações" className="px-4 py-2.5 align-middle text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenProfile(row.id, 'none')}
                              title="Abrir Ficha 360° e Extratos"
                              aria-label={`Abrir ficha e extratos de ${row.customer_name}`}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
                            >
                              <FileText className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenProfile(row.id, 'receive')}
                              title="Receber Pagamento"
                              aria-label={`Receber pagamento de ${row.customer_name}`}
                              className="p-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 transition-colors"
                            >
                              <DollarSign className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenProfile(row.id, 'purchase')}
                              title="Lançar Nova Compra no Crediário"
                              aria-label={`Lançar compra para ${row.customer_name}`}
                              className="p-1.5 rounded-lg border border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-900/40 text-sky-700 dark:text-sky-300 transition-colors"
                            >
                              <ShoppingBag className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenProfile(row.id, 'whatsapp')}
                              title="Enviar Mensagem / Extrato no WhatsApp"
                              aria-label={`Enviar WhatsApp para ${row.customer_name}`}
                              className="p-1.5 rounded-lg border border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/40 text-green-700 dark:text-green-300 transition-colors"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCopyPortalLink(row)}
                              title="Copiar Link do Portal do Cliente"
                              aria-label={`Copiar link do portal de ${row.customer_name}`}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ABA 2: LANÇAMENTOS & COMPRAS */}
      {activeTab === 'lancamentos' && (
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTxView('purchases')}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-colors ${
                  txView === 'purchases'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Compras Recentes ({purchases.length})
              </button>
              <button
                type="button"
                onClick={() => setTxView('payments')}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-colors ${
                  txView === 'payments'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Pagamentos Recebidos ({payments.length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div>
                <label htmlFor={txPeriodId} className="sr-only">
                  Período em dias
                </label>
                <select
                  id={txPeriodId}
                  value={txPeriodDays}
                  onChange={e => setTxPeriodDays(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
                >
                  <option value={7}>Últimos 7 dias</option>
                  <option value={30}>Últimos 30 dias</option>
                  <option value={60}>Últimos 60 dias</option>
                  <option value={90}>Últimos 90 dias</option>
                </select>
              </div>

              <search className="w-full sm:w-72">
                <label htmlFor={txSearchId} className="sr-only">
                  Buscar lançamentos por cliente, comprador ou produto
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id={txSearchId}
                    type="search"
                    value={txSearch}
                    onChange={e => setTxSearch(e.target.value)}
                    placeholder="Filtrar cliente ou produto..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </search>
            </div>
          </div>

          {txLoading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Carregando movimentações...
            </div>
          ) : txView === 'purchases' ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {purchases.length === 0 ? (
                <p className="p-10 text-center text-sm text-slate-500">
                  Nenhuma compra encontrada neste período.
                </p>
              ) : (
                purchases.map(p => (
                  <div
                    key={p.id}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenProfile(p.cardId, 'none')}
                          className="font-extrabold text-slate-900 dark:text-white hover:text-red-600 text-left"
                        >
                          {p.clientName}
                        </button>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                          {p.source}
                        </span>
                        <span className="text-xs text-slate-500">
                          Data: <strong>{formatDateBR(p.date)}</strong>
                        </span>
                        {p.buyerName && (
                          <span className="text-xs text-slate-600 dark:text-slate-300">
                            • Retirado por: <strong>{p.buyerName}</strong>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                        {p.items
                          .slice(0, 4)
                          .map(it => `${it.quantity}x ${it.productName}`)
                          .join(' • ')}
                        {p.items.length > 4 ? ` (+${p.items.length - 4} itens)` : ''}
                      </p>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                      <span className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                        {formatCurrency(p.totalAmount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenProfile(p.cardId, 'whatsapp', p.saleId)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Avisar no WhatsApp</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {payments.length === 0 ? (
                <p className="p-10 text-center text-sm text-slate-500">
                  Nenhum pagamento recebido neste período.
                </p>
              ) : (
                payments.map(pay => (
                  <div
                    key={pay.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenProfile(pay.cardId, 'none')}
                        className="font-extrabold text-slate-900 dark:text-white hover:text-red-600 text-left"
                      >
                        {pay.clientName}
                      </button>
                      <span className="text-xs text-slate-500">{formatDateBR(pay.date)}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                        {pay.method} • {pay.source}
                      </span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                          pay.isFullSettlement
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-sky-100 text-sky-800'
                        }`}
                      >
                        {pay.isFullSettlement ? 'Quitação Total' : 'Pagamento Parcial'}
                      </span>
                    </div>

                    <span className="text-base font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      + {formatCurrency(pay.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {/* ABA 3: REGRAS, JUROS & AUTOMAÇÃO (EXCLUSIVO ADMIN) */}
      {activeTab === 'regras' && isAdmin && (
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
          {settingsLoading || !config ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Carregando configurações e status do WhatsApp...
            </div>
          ) : (
            <form onSubmit={handleSaveSettings} className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    Regras Gerais do Crediário, PIX &amp; Mensagens
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Área exclusiva do Administrador. Alterações valem imediatamente para toda a carteira e portal online.
                  </p>
                </div>

                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                    whatsappStatus.connected
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {whatsappStatus.connected ? (
                    <>
                      <Wifi className="w-4 h-4 text-emerald-600" />
                      <span>WhatsApp Servidor Conectado</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4 text-slate-500" />
                      <span>WhatsApp Servidor Offline (usa WhatsApp Web)</span>
                    </>
                  )}
                </div>
              </div>

              {/* Fieldset 1: PIX & Portal */}
              <fieldset className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
                <legend className="px-2 text-sm font-extrabold text-slate-900 dark:text-white">
                  1. PIX &amp; Identidade do Portal do Cliente
                </legend>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor={`${uid}-pixKey`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Chave PIX Recebedora
                    </label>
                    <input
                      id={`${uid}-pixKey`}
                      type="text"
                      value={config.pixKey}
                      onChange={e => setConfig({ ...config, pixKey: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-pixName`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nome do Recebedor (PIX)
                    </label>
                    <input
                      id={`${uid}-pixName`}
                      type="text"
                      value={config.pixMerchantName}
                      onChange={e => setConfig({ ...config, pixMerchantName: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-pixCity`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Cidade (PIX)
                    </label>
                    <input
                      id={`${uid}-pixCity`}
                      type="text"
                      value={config.pixMerchantCity}
                      onChange={e => setConfig({ ...config, pixMerchantCity: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-storeWa`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      WhatsApp da Loja (para comprovantes PIX)
                    </label>
                    <input
                      id={`${uid}-storeWa`}
                      type="text"
                      inputMode="numeric"
                      value={config.storeWhatsapp}
                      onChange={e => setConfig({ ...config, storeWhatsapp: e.target.value })}
                      placeholder="Ex: 5518999999999"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor={`${uid}-baseUrl`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      URL Pública Base do Portal
                    </label>
                    <input
                      id={`${uid}-baseUrl`}
                      type="url"
                      value={config.publicBaseUrl}
                      onChange={e => setConfig({ ...config, publicBaseUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Fieldset 2: Política de Juros e Multa */}
              <fieldset className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
                <legend className="px-2 text-sm font-extrabold text-slate-900 dark:text-white">
                  2. Política de Juros, Multa &amp; Bloqueio Automático
                </legend>

                <div
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    config.interestEnabled
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div>
                    <p className="text-sm font-extrabold">
                      {config.interestEnabled
                        ? 'Cobrança automática de multa e juros LIGADA'
                        : 'Cobrança de multa e juros DESLIGADA (somente simulada)'}
                    </p>
                    <p className="text-xs opacity-85">
                      Quando desligada, nenhuma conta sofre acréscimo real — o sistema apenas simula para consulta interna.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-sm shrink-0">
                    <input
                      type="checkbox"
                      checked={config.interestEnabled}
                      onChange={e => setConfig({ ...config, interestEnabled: e.target.checked })}
                      className="w-5 h-5 accent-red-600 rounded"
                    />
                    <span>Ativar Juros no Crediário</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label htmlFor={`${uid}-fine`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Multa por Atraso (%)
                    </label>
                    <input
                      id={`${uid}-fine`}
                      type="text"
                      inputMode="decimal"
                      value={String(config.lateFinePercent)}
                      onChange={e =>
                        setConfig({ ...config, lateFinePercent: Number(e.target.value.replace(',', '.')) || 0 })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${uid}-interest`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Juros ao Mês (% pro-rata)
                    </label>
                    <input
                      id={`${uid}-interest`}
                      type="text"
                      inputMode="decimal"
                      value={String(config.lateInterestMonthlyPercent)}
                      onChange={e =>
                        setConfig({
                          ...config,
                          lateInterestMonthlyPercent: Number(e.target.value.replace(',', '.')) || 0
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${uid}-grace`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Dias de Carência
                    </label>
                    <input
                      id={`${uid}-grace`}
                      type="text"
                      inputMode="numeric"
                      value={String(config.graceDays)}
                      onChange={e =>
                        setConfig({ ...config, graceDays: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0 })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${uid}-autoblock`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Bloqueio Automático (dias; 0=desl.)
                    </label>
                    <input
                      id={`${uid}-autoblock`}
                      type="text"
                      inputMode="numeric"
                      value={String(config.autoBlockDays)}
                      onChange={e =>
                        setConfig({
                          ...config,
                          autoBlockDays: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Fieldset 3: Automação WhatsApp */}
              <fieldset className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <legend className="px-2 text-sm font-extrabold text-slate-900 dark:text-white">
                  3. Envios Automáticos via Servidor WhatsApp
                </legend>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.autoNotifyNewPurchase}
                      onChange={e => setConfig({ ...config, autoNotifyNewPurchase: e.target.checked })}
                      className="w-4 h-4 mt-0.5 accent-red-600"
                    />
                    <span className="text-xs">
                      <strong className="block text-sm text-slate-900 dark:text-white">
                        Avisar Nova Compra
                      </strong>
                      Envia resumo da venda automaticamente após sincronizar compra nova.
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.autoNotifyDueDay}
                      onChange={e => setConfig({ ...config, autoNotifyDueDay: e.target.checked })}
                      className="w-4 h-4 mt-0.5 accent-red-600"
                    />
                    <span className="text-xs">
                      <strong className="block text-sm text-slate-900 dark:text-white">
                        Lembrete no Vencimento
                      </strong>
                      Envia lembrete amigável + PIX no dia do vencimento (09:05).
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.autoNotifyOverdue}
                      onChange={e => setConfig({ ...config, autoNotifyOverdue: e.target.checked })}
                      className="w-4 h-4 mt-0.5 accent-red-600"
                    />
                    <span className="text-xs">
                      <strong className="block text-sm text-slate-900 dark:text-white">
                        Aviso de Atraso
                      </strong>
                      Envia notificação gentil automática para parcelas vencidas (09:05).
                    </span>
                  </label>
                </div>
              </fieldset>

              {/* Fieldset 4: Templates */}
              <fieldset className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
                <legend className="px-2 text-sm font-extrabold text-slate-900 dark:text-white">
                  4. Modelos de Mensagens (WhatsApp)
                </legend>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300">
                  <strong>Variáveis disponíveis:</strong>{' '}
                  {TEMPLATE_VARIABLES.map(v => (
                    <code key={v} className="inline-block mr-2 px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono">
                      {v}
                    </code>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {[
                    { key: 'purchase', label: 'Aviso de Nova Compra' },
                    { key: 'statement', label: 'Extrato + Link PIX' },
                    { key: 'due_reminder', label: 'Lembrete de Vencimento' },
                    { key: 'overdue', label: 'Aviso de Atraso' },
                    { key: 'payment_receipt', label: 'Confirmação de Pagamento' }
                  ].map(item => (
                    <div key={item.key} className={item.key === 'payment_receipt' ? 'lg:col-span-2' : ''}>
                      <label
                        htmlFor={`${uid}-tpl-${item.key}`}
                        className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                      >
                        {item.label}
                      </label>
                      <textarea
                        id={`${uid}-tpl-${item.key}`}
                        rows={4}
                        value={(config.templates as any)[item.key] || ''}
                        onChange={e =>
                          setConfig({
                            ...config,
                            templates: { ...config.templates, [item.key]: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                      />
                    </div>
                  ))}
                </div>
              </fieldset>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-extrabold flex items-center gap-2 shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingSettings ? 'Salvando Regras...' : 'Salvar Regras e Mensagens'}</span>
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Modal nativo <dialog>: + Novo Cliente no Crediário */}
      <dialog
        ref={newClientDialogRef}
        {...({ closedby: 'any' } as any)}
        aria-labelledby={newClientTitleId}
        className="crediario-dialog w-[95vw] max-w-xl max-h-[90vh] m-auto p-0 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden"
      >
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 id={newClientTitleId} className="text-lg font-extrabold">
              Cadastrar Novo Cliente no Crediário
            </h2>
            <p className="text-xs text-slate-300">
              Cria a ficha 360° e gera automaticamente o link pessoal do Portal PIX.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsNewClientOpen(false)}
            aria-label="Fechar janela de cadastro"
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={e => handleCreateClient(e, false)} className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label htmlFor={`${uid}-nc-name`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nome Completo *
              </label>
              <input
                id={`${uid}-nc-name`}
                type="text"
                required
                value={newClientForm.customer_name}
                onChange={e => setNewClientForm({ ...newClientForm, customer_name: e.target.value })}
                placeholder="Ex: Maria Aparecida Silva"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label htmlFor={`${uid}-nc-nick`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Apelido / Como é conhecida(o)
              </label>
              <input
                id={`${uid}-nc-nick`}
                type="text"
                value={newClientForm.nickname}
                onChange={e => setNewClientForm({ ...newClientForm, nickname: e.target.value })}
                placeholder="Ex: Dona Maria do Posto"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label htmlFor={`${uid}-nc-resp`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Responsável / Cuidador(a)
              </label>
              <input
                id={`${uid}-nc-resp`}
                type="text"
                value={newClientForm.responsible_name}
                onChange={e => setNewClientForm({ ...newClientForm, responsible_name: e.target.value })}
                placeholder="Opcional"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label htmlFor={`${uid}-nc-cpf`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                CPF
              </label>
              <input
                id={`${uid}-nc-cpf`}
                type="text"
                inputMode="numeric"
                value={newClientForm.cpf}
                onChange={e => setNewClientForm({ ...newClientForm, cpf: e.target.value })}
                placeholder="Somente números"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label htmlFor={`${uid}-nc-phone`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Telefone / WhatsApp
              </label>
              <input
                id={`${uid}-nc-phone`}
                type="text"
                inputMode="numeric"
                value={newClientForm.phone}
                onChange={e => setNewClientForm({ ...newClientForm, phone: e.target.value })}
                placeholder="Ex: 18999999999"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label htmlFor={`${uid}-nc-limit`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Limite de Crédito (R$) {!isAdmin && '(Padrão)'}
              </label>
              <input
                id={`${uid}-nc-limit`}
                type="text"
                inputMode="decimal"
                disabled={!isAdmin}
                value={isAdmin ? newClientForm.credit_limit : '300'}
                onChange={e => setNewClientForm({ ...newClientForm, credit_limit: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-500 text-sm"
              />
            </div>

            <div>
              <label htmlFor={`${uid}-nc-due`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Dia de Vencimento e Modo
              </label>
              <div className="flex gap-2">
                <input
                  id={`${uid}-nc-due`}
                  type="text"
                  inputMode="numeric"
                  value={newClientForm.due_day}
                  onChange={e => setNewClientForm({ ...newClientForm, due_day: e.target.value })}
                  className="w-20 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-center"
                />
                <select
                  aria-label="Modo do dia de vencimento"
                  value={newClientForm.due_day_mode}
                  onChange={e =>
                    setNewClientForm({
                      ...newClientForm,
                      due_day_mode: e.target.value === 'fixed' ? 'fixed' : 'auto'
                    })
                  }
                  className="flex-1 px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="auto">Automático (+30 dias)</option>
                  <option value="fixed">Dia Fixo Todo Mês</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor={`${uid}-nc-notes`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Observações / Entrega / Preferências
              </label>
              <textarea
                id={`${uid}-nc-notes`}
                rows={2}
                value={newClientForm.notes}
                onChange={e => setNewClientForm({ ...newClientForm, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsNewClientOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={creatingClient}
              onClick={e => handleCreateClient(e as any, true)}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold disabled:opacity-60"
            >
              Salvar e Abrir Ficha
            </button>
            <button
              type="submit"
              disabled={creatingClient}
              className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-60"
            >
              {creatingClient ? 'Salvando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Modal nativo <dialog>: + Anotação Rápida no Crediário */}
      <dialog
        ref={annotationDialogRef}
        {...({ closedby: 'any' } as any)}
        aria-labelledby={`${uid}-ann-title`}
        className="crediario-dialog w-[95vw] max-w-xl max-h-[90vh] m-auto p-0 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden"
      >
        <div className="bg-red-700 text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 id={`${uid}-ann-title`} className="text-lg font-extrabold flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              <span>Lançar Anotação no Crediário</span>
            </h2>
            <p className="text-xs text-red-100">
              Informe descrição e preço para somar diretamente como produto na conta do cliente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAnnotationOpen(false)}
            aria-label="Fechar janela de anotação"
            className="p-1.5 rounded-lg hover:bg-white/10 text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={e => handleSubmitQuickAnnotation(e, false)} className="p-5 overflow-y-auto space-y-4">
          {(() => {
            const directorySource = annotationDirectory.length > 0 ? annotationDirectory : clients;
            const term = annotationClientSearch.trim().toLowerCase();
            const matchingClients = directorySource
              .filter(c => {
                if (!term) return true;
                return (
                  c.customer_name.toLowerCase().includes(term) ||
                  c.nickname.toLowerCase().includes(term) ||
                  c.phone.includes(term) ||
                  c.cpf.includes(term)
                );
              })
              .slice(0, 8);
            const selectedClient =
              directorySource.find(c => c.id === selectedAnnotationCardId) || null;

            const unitNum =
              parseFloat(String(annotationForm.unitPrice).replace(/\./g, '').replace(',', '.')) ||
              parseFloat(String(annotationForm.unitPrice).replace(',', '.'));
            const qtyNum = Math.max(1, parseInt(String(annotationForm.quantity).replace(/\D/g, ''), 10) || 1);
            const addAmount = !isNaN(unitNum) && unitNum > 0 ? Math.round(unitNum * qtyNum * 100) / 100 : 0;

            return (
              <>
                <div className="space-y-2">
                  <label htmlFor={`${uid}-ann-client-q`} className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    1. Selecione o Cliente *
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id={`${uid}-ann-client-q`}
                      type="search"
                      value={annotationClientSearch}
                      onChange={e => setAnnotationClientSearch(e.target.value)}
                      placeholder="Buscar nome, apelido, CPF ou telefone..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    />
                  </div>

                  {selectedClient ? (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <p className="font-extrabold text-emerald-950 dark:text-emerald-200">
                          {selectedClient.customer_name}
                        </p>
                        <p className="text-emerald-800 dark:text-emerald-300">
                          Saldo atual: <strong className="tabular-nums">{formatCurrency(selectedClient.total_balance)}</strong>
                          {selectedClient.is_blocked ? ' • CONTA BLOQUEADA' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedAnnotationCardId(null)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-emerald-300 text-xs font-bold"
                      >
                        Trocar
                      </button>
                    </div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                      {loadingDirectory ? (
                        <p className="p-3 text-xs text-slate-500">Carregando clientes...</p>
                      ) : matchingClients.length === 0 ? (
                        <p className="p-3 text-xs text-slate-500">Nenhum cliente encontrado.</p>
                      ) : (
                        matchingClients.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedAnnotationCardId(c.id)}
                            className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-bold text-slate-900 dark:text-white truncate">
                              {c.customer_name}
                            </span>
                            <span className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                              {formatCurrency(c.total_balance)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-4">
                    <label htmlFor={`${uid}-ann-desc`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      2. Descrição do Produto / Anotação *
                    </label>
                    <input
                      id={`${uid}-ann-desc`}
                      type="text"
                      required
                      value={annotationForm.description}
                      onChange={e => setAnnotationForm({ ...annotationForm, description: e.target.value })}
                      placeholder="Ex: Dipirona 1g cx c/ 10 ou Produto avulso"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor={`${uid}-ann-price`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Preço Unitário (R$) *
                    </label>
                    <input
                      id={`${uid}-ann-price`}
                      type="text"
                      inputMode="decimal"
                      required
                      value={annotationForm.unitPrice}
                      onChange={e => setAnnotationForm({ ...annotationForm, unitPrice: e.target.value })}
                      placeholder="Ex: 24,50"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-black"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${uid}-ann-qty`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Quantidade
                    </label>
                    <input
                      id={`${uid}-ann-qty`}
                      type="text"
                      inputMode="numeric"
                      value={annotationForm.quantity}
                      onChange={e =>
                        setAnnotationForm({ ...annotationForm, quantity: e.target.value.replace(/\D/g, '') })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-center"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${uid}-ann-buyer`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Quem retirou
                    </label>
                    <input
                      id={`${uid}-ann-buyer`}
                      type="text"
                      value={annotationForm.buyerName}
                      onChange={e => setAnnotationForm({ ...annotationForm, buyerName: e.target.value })}
                      placeholder="Opcional"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                </div>

                {addAmount > 0 && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span>
                      Valor a somar: <strong className="text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(addAmount)}</strong>
                    </span>
                    {selectedClient && (
                      <span>
                        Novo saldo estimado:{' '}
                        <strong className="text-slate-900 dark:text-white tabular-nums">
                          {formatCurrency(selectedClient.total_balance + addAmount)}
                        </strong>
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAnnotationOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={submittingAnnotation || !selectedAnnotationCardId}
                    onClick={e => handleSubmitQuickAnnotation(e as any, true)}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold disabled:opacity-50"
                  >
                    Lançar e Abrir Ficha
                  </button>
                  <button
                    type="submit"
                    disabled={submittingAnnotation || !selectedAnnotationCardId}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {submittingAnnotation ? 'Somando...' : 'Incluir no Crediário'}
                  </button>
                </div>
              </>
            );
          })()}
        </form>
      </dialog>

      {/* Modal 360° do Cliente */}
      <CrediarioCustomerProfileModal
        isOpen={profileModal.isOpen}
        onClose={() => setProfileModal(prev => ({ ...prev, isOpen: false }))}
        cardId={profileModal.cardId}
        user={user}
        initialPanel={profileModal.initialPanel}
        initialSaleId={profileModal.initialSaleId}
        onProfileUpdated={() => {
          fetchClients();
          if (activeTab === 'lancamentos') fetchTransactions();
        }}
      />
    </div>
  );
};

export default CrediarioHub;
