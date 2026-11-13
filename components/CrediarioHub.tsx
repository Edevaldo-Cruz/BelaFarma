import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CreditCard,
  AlertTriangle,
  Receipt,
  Search,
  CheckCircle,
  MessageSquare,
  DollarSign,
  Clock,
  Eye,
  X,
  Phone,
  RefreshCw,
  Send,
  Users,
  Wifi,
  Calendar,
  Filter,
  Check,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  ArrowDownRight,
  Sparkles
} from 'lucide-react';
import { useToast } from './ToastContext';
import { CrediarioNfcWidget } from './CrediarioNfcWidget';
import { CrediarioCustomerProfileModal } from './CrediarioCustomerProfileModal';
import { DebtorReport, Customer, CustomerDebt } from '../types';

export interface CrediarioHubProps {
  initialTab?: 'titulos' | 'devedores' | 'cartoes';
}

interface CrediarioDigifarma {
  id: string;
  clientId: string;
  clientName: string;
  phone: string;
  amount: number;
  paidAmount: number;
  balance: number;
  dueDate: string;
  saleId: string;
}

interface CardSummary {
  id: number;
  customer_id?: string;
  customer_name: string;
  phone: string;
  cpf?: string;
  card_number: string;
  card_uid?: string;
  credit_limit: number;
  used_limit: number;
  available_credit: number;
  due_day: number;
  status: string;
  is_blocked?: boolean;
}

export const CrediarioHub: React.FC<CrediarioHubProps> = ({ initialTab = 'titulos' }) => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'titulos' | 'devedores' | 'cartoes'>(initialTab);

  // Sincroniza tab inicial se a prop mudar
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // ==========================================
  // ESTADOS - ABA 1: TÍTULOS DIGIFARMA
  // ==========================================
  const [records, setRecords] = useState<CrediarioDigifarma[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'vencidos' | 'hoje' | 'a_vencer'>('todos');

  // Modal Baixa de Título
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<CrediarioDigifarma | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [isProcessingPay, setIsProcessingPay] = useState(false);
  const payInputRef = useRef<HTMLInputElement>(null);

  // Modal Cobrança WhatsApp
  const [isCobrancaModalOpen, setIsCobrancaModalOpen] = useState(false);
  const [cobrancaMessage, setCobrancaMessage] = useState('');
  const [cobrancaTargetPhone, setCobrancaTargetPhone] = useState('');
  const [isSendingCobranca, setIsSendingCobranca] = useState(false);
  const [selectedRecordsForBatch, setSelectedRecordsForBatch] = useState<CrediarioDigifarma[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchIndex, setBatchIndex] = useState(0);

  // ==========================================
  // ESTADOS - ABA 2: DEVEDORES
  // ==========================================
  const [debtors, setDebtors] = useState<DebtorReport[]>([]);
  const [loadingDebtors, setLoadingDebtors] = useState(true);
  const [selectedDebtor, setSelectedDebtor] = useState<Customer | null>(null);
  const [debtorDebts, setDebtorDebts] = useState<CustomerDebt[]>([]);
  const [allDebts, setAllDebts] = useState<CustomerDebt[]>([]);
  const [isDebtorDetailModalOpen, setIsDebtorDetailModalOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [paymentModalDebt, setPaymentModalDebt] = useState<CustomerDebt | null>(null);
  const [debtPaymentAmountStr, setDebtPaymentAmountStr] = useState('');
  const [isProcessingDebtPay, setIsProcessingDebtPay] = useState(false);

  // ==========================================
  // ESTADOS - ABA 3: CARTÕES BELAFARMA / NFC
  // ==========================================
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardSearchTerm, setCardSearchTerm] = useState('');
  const [cardsDashboard, setCardsDashboard] = useState<any>(null);
  const [selectedCardIdForProfile, setSelectedCardIdForProfile] = useState<number | null>(null);
  const [isCardProfileOpen, setIsCardProfileOpen] = useState(false);

  // ==========================================
  // UTILITÁRIOS DE FORMATAÇÃO
  // ==========================================
  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const parseCurrency = (str: string) => {
    return Number(str.replace(/\D/g, '')) / 100;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
    } catch {
      return '-';
    }
  };

  // ==========================================
  // BUSCA DE DADOS
  // ==========================================
  const fetchCrediarioRecords = async () => {
    setLoadingRecords(true);
    try {
      const response = await fetch('/api/crediario');
      if (response.status === 503) {
        addToast('Servidor Digifarma offline ou inacessível no momento.', 'warning');
        setRecords([]);
        return;
      }
      if (!response.ok) throw new Error('Falha ao obter crediário');
      const data = await response.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao buscar crediário:', error);
      addToast('Não foi possível carregar as contas a receber do Digifarma.', 'error');
    } finally {
      setLoadingRecords(false);
    }
  };

  const fetchDebtors = async () => {
    setLoadingDebtors(true);
    try {
      const response = await fetch('/api/debtors-report');
      if (!response.ok) throw new Error('Falha ao obter devedores');
      const data = await response.json();
      setDebtors(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao buscar devedores:', error);
      addToast('Não foi possível carregar a lista de devedores.', 'error');
    } finally {
      setLoadingDebtors(false);
    }
  };

  const fetchCards = async (q: string = '') => {
    setLoadingCards(true);
    try {
      const url = q ? `/api/cards/search?q=${encodeURIComponent(q)}` : '/api/cards/search';
      const [resCards, resDash] = await Promise.all([
        fetch(url),
        fetch('/api/cards/dashboard').catch(() => null)
      ]);

      if (resCards.ok) {
        const data = await resCards.json();
        setCards(Array.isArray(data.cards) ? data.cards : (Array.isArray(data) ? data : []));
      }
      if (resDash && resDash.ok) {
        const dashData = await resDash.json();
        setCardsDashboard(dashData);
      }
    } catch (error) {
      console.error('Erro ao buscar cartões:', error);
    } finally {
      setLoadingCards(false);
    }
  };

  const refreshAll = () => {
    fetchCrediarioRecords();
    fetchDebtors();
    fetchCards(cardSearchTerm);
    addToast('Atualizando dados do crediário...', 'info');
  };

  useEffect(() => {
    fetchCrediarioRecords();
    fetchDebtors();
    fetchCards();
  }, []);

  // ==========================================
  // CÁLCULOS E KPIs UNIFICADOS
  // ==========================================
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const totalOpenDigifarma = useMemo(() => {
    return records.reduce((acc, r) => acc + (Number(r.balance) || 0), 0);
  }, [records]);

  const totalOverdueDigifarma = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return records
      .filter(r => r.dueDate && new Date(r.dueDate) < today && (r.balance || 0) > 0)
      .reduce((acc, r) => acc + (Number(r.balance) || 0), 0);
  }, [records]);

  const totalDebtorsValue = useMemo(() => {
    return debtors.reduce((acc, d) => acc + (Number(d.totalOwed) || 0), 0);
  }, [debtors]);

  const totalOverdueDebtorsCount = useMemo(() => {
    return debtors.filter(d => d.hasOverdue === 1 || d.hasOverdue === true).length;
  }, [debtors]);

  // Filtros de Títulos da Aba 1
  const filteredRecords = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return records.filter(r => {
      // Filtro de texto
      const matchesSearch =
        searchTerm === '' ||
        (r.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.phone || '').includes(searchTerm);

      if (!matchesSearch) return false;

      if (statusFilter === 'todos') return true;

      if (!r.dueDate) return statusFilter === 'todos';

      const d = new Date(r.dueDate);
      d.setHours(0, 0, 0, 0);

      if (statusFilter === 'vencidos') {
        return d < today;
      }
      if (statusFilter === 'hoje') {
        return d.getTime() === today.getTime();
      }
      if (statusFilter === 'a_vencer') {
        return d > today;
      }

      return true;
    });
  }, [records, searchTerm, statusFilter]);

  // ==========================================
  // AÇÕES - BAIXA DE TÍTULO DIGIFARMA
  // ==========================================
  const handleOpenReceive = (record: CrediarioDigifarma) => {
    setSelectedRecord(record);
    setPaymentAmount(record.balance);
    setIsPayModalOpen(true);
    setTimeout(() => payInputRef.current?.focus(), 150);
  };

  const handleReceive = async () => {
    if (!selectedRecord) return;
    setIsProcessingPay(true);
    try {
      const response = await fetch('/api/crediario/receber', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crediarioId: selectedRecord.id, valorPago: paymentAmount })
      });

      if (response.status === 503) {
        addToast('O servidor do Digifarma está Offline.', 'error');
        return;
      }

      if (!response.ok) throw new Error('Erro ao baixar');
      addToast('Baixa de crediário realizada com sucesso!', 'success');
      setIsPayModalOpen(false);
      fetchCrediarioRecords();
      fetchDebtors();
    } catch (error) {
      addToast('Erro ao realizar baixa no Digifarma.', 'error');
    } finally {
      setIsProcessingPay(false);
    }
  };

  // ==========================================
  // AÇÕES - COBRANÇA WHATSAPP
  // ==========================================
  const handleOpenCobranca = (record: CrediarioDigifarma) => {
    if (!record.phone) {
      addToast('Este cliente não possui telefone celular cadastrado.', 'warning');
      return;
    }
    setSelectedRecord(record);
    setIsBatchMode(false);
    setCobrancaTargetPhone(record.phone);

    const dateFormatted = record.dueDate ? new Date(record.dueDate).toLocaleDateString('pt-BR') : 'N/D';
    const msg = `Olá, *${(record.clientName || '').trim()}*!\n\nPassando para lembrar amigavelmente do seu crediário na *BelaFarma* no valor de *${formatCurrency(record.balance)}*, que venceu em *${dateFormatted}*.\n\nSe preferir pagar por Pix ou quiser combinar de passar aqui, estamos à disposição! Muito obrigado! 😊`;

    setCobrancaMessage(msg);
    setIsCobrancaModalOpen(true);
  };

  const handleOpenBatchCobranca = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueWithPhone = records.filter(r => {
      if (!r.phone || !r.dueDate) return false;
      const d = new Date(r.dueDate);
      return d < today && (r.balance || 0) > 0;
    });

    if (overdueWithPhone.length === 0) {
      addToast('Não há crediários vencidos com celular cadastrado para cobrar.', 'info');
      return;
    }

    setSelectedRecordsForBatch(overdueWithPhone);
    setIsBatchMode(true);
    setBatchIndex(0);

    const first = overdueWithPhone[0];
    setCobrancaTargetPhone(first.phone);

    const dateFormatted = first.dueDate ? new Date(first.dueDate).toLocaleDateString('pt-BR') : 'N/D';
    const msg = `Olá, *${(first.clientName || '').trim()}*!\n\nPassando para lembrar amigavelmente do seu crediário na *BelaFarma* no valor de *${formatCurrency(first.balance)}*, que venceu em *${dateFormatted}*.\n\nSe preferir pagar por Pix ou quiser combinar de passar aqui, estamos à disposição! Muito obrigado! 😊`;

    setCobrancaMessage(msg);
    setIsCobrancaModalOpen(true);
  };

  const handleSendCobranca = async () => {
    if (!cobrancaTargetPhone || !cobrancaMessage.trim()) {
      addToast('Telefone ou mensagem inválidos.', 'warning');
      return;
    }

    setIsSendingCobranca(true);
    try {
      const response = await fetch('/api/crediario/enviar-cobranca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cobrancaTargetPhone,
          messageText: cobrancaMessage
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao enviar mensagem.');
      }

      addToast('Cobrança enviada com sucesso no WhatsApp!', 'success');

      if (isBatchMode) {
        const nextIdx = batchIndex + 1;
        if (nextIdx < selectedRecordsForBatch.length) {
          setBatchIndex(nextIdx);
          const nextRecord = selectedRecordsForBatch[nextIdx];
          setCobrancaTargetPhone(nextRecord.phone);

          const dateFormatted = nextRecord.dueDate ? new Date(nextRecord.dueDate).toLocaleDateString('pt-BR') : 'N/D';
          const msg = `Olá, *${(nextRecord.clientName || '').trim()}*!\n\nPassando para lembrar amigavelmente do seu crediário na *BelaFarma* no valor de *${formatCurrency(nextRecord.balance)}*, que venceu em *${dateFormatted}*.\n\nSe preferir pagar por Pix ou quiser combinar de passar aqui, estamos à disposição! Muito obrigado! 😊`;

          setCobrancaMessage(msg);
        } else {
          setIsCobrancaModalOpen(false);
          addToast('Lote de cobranças concluído!', 'success');
        }
      } else {
        setIsCobrancaModalOpen(false);
      }
    } catch (err: any) {
      console.error(err);
      addToast(err.message || 'Erro ao enviar cobrança.', 'error');
    } finally {
      setIsSendingCobranca(false);
    }
  };

  const handleSkipCobranca = () => {
    const nextIdx = batchIndex + 1;
    if (nextIdx < selectedRecordsForBatch.length) {
      setBatchIndex(nextIdx);
      const nextRecord = selectedRecordsForBatch[nextIdx];
      setCobrancaTargetPhone(nextRecord.phone);

      const dateFormatted = nextRecord.dueDate ? new Date(nextRecord.dueDate).toLocaleDateString('pt-BR') : 'N/D';
      const msg = `Olá, *${(nextRecord.clientName || '').trim()}*!\n\nPassando para lembrar amigavelmente do seu crediário na *BelaFarma* no valor de *${formatCurrency(nextRecord.balance)}*, que venceu em *${dateFormatted}*.\n\nSe preferir pagar por Pix ou quiser combinar de passar aqui, estamos à disposição! Muito obrigado! 😊`;

      setCobrancaMessage(msg);
    } else {
      setIsCobrancaModalOpen(false);
      addToast('Lote de cobranças concluído!', 'success');
    }
  };

  // ==========================================
  // AÇÕES - DEVEDORES (DETALHES E AMORTIZAÇÃO)
  // ==========================================
  const openDebtorDetails = async (debtor: DebtorReport) => {
    try {
      const customerResp = await fetch(`/api/customers/${debtor.id}`);
      const customer = await customerResp.json();
      setSelectedDebtor(customer);

      const debtsResp = await fetch(`/api/customers/${debtor.id}/debts`);
      const debts = await debtsResp.json();
      setAllDebts(Array.isArray(debts) ? debts : []);
      setDebtorDebts(Array.isArray(debts) ? debts.filter((d: CustomerDebt) => d.status !== 'Pago') : []);

      setShowHistory(false);
      setIsDebtorDetailModalOpen(true);
    } catch (error) {
      console.error('Erro ao buscar detalhes do devedor:', error);
      addToast('Erro ao carregar débitos do cliente.', 'error');
    }
  };

  const openDebtPaymentModal = (debt: CustomerDebt) => {
    setPaymentModalDebt(debt);
    setDebtPaymentAmountStr(debt.totalValue.toFixed(2));
  };

  const handleDebtPayment = async () => {
    if (!paymentModalDebt) return;

    const amount = parseFloat(debtPaymentAmountStr);
    if (isNaN(amount) || amount <= 0) {
      addToast('Por favor, insira um valor válido de pagamento.', 'warning');
      return;
    }

    if (amount > paymentModalDebt.totalValue) {
      addToast('O valor do pagamento não pode ser maior que o débito pendente.', 'warning');
      return;
    }

    setIsProcessingDebtPay(true);
    try {
      if (amount >= paymentModalDebt.totalValue) {
        // Quitação Total
        const response = await fetch(`/api/customer-debts/${paymentModalDebt.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Pago', paidAt: new Date().toISOString() }),
        });

        if (response.ok) {
          addToast('Débito quitado com sucesso!', 'success');
          setPaymentModalDebt(null);
          setDebtPaymentAmountStr('');
          fetchDebtors();
          fetchCrediarioRecords();
          if (selectedDebtor) {
            const debtsResp = await fetch(`/api/customers/${selectedDebtor.id}/debts`);
            const debts = await debtsResp.json();
            setAllDebts(debts);
            setDebtorDebts(debts.filter((d: CustomerDebt) => d.status !== 'Pago'));
          }
        } else {
          throw new Error('Falha ao registrar quitação');
        }
      } else {
        // Pagamento Parcial
        const newValue = paymentModalDebt.totalValue - amount;
        const response = await fetch(`/api/customer-debts/${paymentModalDebt.id}/partial-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentAmount: amount,
            newTotalValue: newValue
          }),
        });

        if (response.ok) {
          addToast('Pagamento parcial registrado!', 'success');
          setPaymentModalDebt(null);
          setDebtPaymentAmountStr('');
          fetchDebtors();
          fetchCrediarioRecords();
          if (selectedDebtor) {
            const debtsResp = await fetch(`/api/customers/${selectedDebtor.id}/debts`);
            const debts = await debtsResp.json();
            setAllDebts(debts);
            setDebtorDebts(debts.filter((d: CustomerDebt) => d.status !== 'Pago'));
          }
        } else {
          throw new Error('Falha ao registrar pagamento parcial');
        }
      }
    } catch (error) {
      console.error('Erro ao processar pagamento de débito:', error);
      addToast('Erro ao processar pagamento.', 'error');
    } finally {
      setIsProcessingDebtPay(false);
    }
  };

  const handleMarkDebtAsPaid = async (debtId: string) => {
    try {
      const response = await fetch(`/api/customer-debts/${debtId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Pago', paidAt: new Date().toISOString() }),
      });
      if (response.ok) {
        addToast('Débito baixado com sucesso!', 'success');
        fetchDebtors();
        fetchCrediarioRecords();
        if (selectedDebtor) {
          const debtsResp = await fetch(`/api/customers/${selectedDebtor.id}/debts`);
          const debts = await debtsResp.json();
          setAllDebts(debts);
          setDebtorDebts(debts.filter((d: CustomerDebt) => d.status !== 'Pago'));
        }
      }
    } catch (error) {
      console.error('Erro ao marcar débito como pago:', error);
      addToast('Erro ao baixar débito.', 'error');
    }
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      {/* ==========================================
          CABEÇALHO EXECUTIVO UNIFICADO
         ========================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center text-white shadow-md shrink-0">
            <CreditCard className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Central do Crediário BelaFarma
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
                Unificado
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
              Gestão centralizada de contas a receber, cobrança WhatsApp, devedores e cartão fidelidade NFC
            </p>
          </div>
        </div>

        {/* Ações Globais */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleOpenBatchCobranca}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
            title="Disparar régua de cobrança amigável via WhatsApp para crediários vencidos"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Cobrança em Lote</span>
          </button>

          <button
            onClick={refreshAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs shadow-2xs transition-all cursor-pointer"
            title="Atualizar dados do Digifarma e relatórios"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRecords || loadingDebtors ? 'animate-spin text-red-600' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* ==========================================
          KPIs E MÉTRICAS GERAIS
         ========================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total a Receber */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total a Receber
            </span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-500">
            {formatCurrency(totalOpenDigifarma || totalDebtorsValue)}
          </p>
          <p className="text-[10px] font-semibold text-slate-400 mt-1">
            {records.length} títulos abertos no sistema
          </p>
        </div>

        {/* Total em Atraso */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Em Atraso / Vencido
            </span>
            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-red-600 dark:text-red-400">
            {formatCurrency(totalOverdueDigifarma)}
          </p>
          <p className="text-[10px] font-semibold text-slate-400 mt-1">
            Títulos com data de vencimento ultrapassada
          </p>
        </div>

        {/* Clientes Devedores */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Clientes Devedores
            </span>
            <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-black text-slate-800 dark:text-white">
              {debtors.length}
            </p>
            {totalOverdueDebtorsCount > 0 && (
              <span className="text-xs font-black text-red-600">
                ({totalOverdueDebtorsCount} em atraso)
              </span>
            )}
          </div>
          <p className="text-[10px] font-semibold text-slate-400 mt-1">
            Clientes com pendências financeiras
          </p>
        </div>

        {/* Cartão Fidelidade / NFC */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cartão BelaFarma (NFC)
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
              <Wifi className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800 dark:text-white">
            {cardsDashboard?.cards?.active ?? cards.length}
          </p>
          <p className="text-[10px] font-semibold text-slate-400 mt-1">
            Limite em uso: {formatCurrency(cardsDashboard?.cards?.total_credit_used || 0)}
          </p>
        </div>
      </div>

      {/* ==========================================
          SELETOR DE ABAS DO MÓDULO UNIFICADO
         ========================================== */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-fit border border-slate-200/80 dark:border-slate-700 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('titulos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'titulos'
              ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Títulos a Receber</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold">
            {records.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('devedores')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'devedores'
              ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Clientes Devedores</span>
          {totalOverdueDebtorsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-600 text-white font-black animate-pulse">
              {totalOverdueDebtorsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cartoes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'cartoes'
              ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Wifi className="w-4 h-4" />
          <span>Cartão BelaFarma & NFC</span>
        </button>
      </div>

      {/* ==========================================
          CONTEÚDO DA ABA 1: TÍTULOS A RECEBER
         ========================================== */}
      {activeTab === 'titulos' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Barra de Filtros e Busca */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Status Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setStatusFilter('todos')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'todos'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                Todos ({records.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('vencidos')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'vencidos'
                    ? 'bg-red-600 text-white font-black shadow-2xs'
                    : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 hover:bg-red-100'
                }`}
              >
                Vencidos
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('hoje')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'hoje'
                    ? 'bg-amber-600 text-white font-black shadow-2xs'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100'
                }`}
              >
                Vencem Hoje
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('a_vencer')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'a_vencer'
                    ? 'bg-emerald-600 text-white font-black shadow-2xs'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'
                }`}
              >
                A Vencer
              </button>
            </div>

            {/* Input de Busca */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por cliente ou telefone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:border-red-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Tabela de Títulos - Padrão de Alta Densidade BelaFarma */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3 whitespace-nowrap">Vencimento</th>
                    <th className="px-4 py-3 whitespace-nowrap">Cliente</th>
                    <th className="px-4 py-3 whitespace-nowrap">Contato</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Valor Total</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Saldo Pendente</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {loadingRecords ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 font-semibold">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-600" />
                        Carregando títulos do Digifarma...
                      </td>
                    </tr>
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 font-medium">
                        Nenhum crediário encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map(record => {
                      const isOverdue = record.dueDate && new Date(record.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
                      return (
                        <tr
                          key={record.id}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                            isOverdue ? 'bg-red-50/30 dark:bg-red-950/10' : ''
                          }`}
                        >
                          <td className="px-4 py-2.5 whitespace-nowrap font-bold text-slate-700 dark:text-slate-300">
                            <div className="inline-flex items-center gap-1.5">
                              {isOverdue && (
                                <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" title="Vencido" />
                              )}
                              <span>{formatDate(record.dueDate)}</span>
                            </div>
                          </td>

                          <td className="px-4 py-2.5 font-black uppercase text-slate-900 dark:text-white truncate max-w-[220px]">
                            {record.clientName}
                          </td>

                          <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
                            {record.phone ? (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                                <Phone className="w-3 h-3 text-emerald-600" />
                                {record.phone}
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 text-[11px]">-</span>
                            )}
                          </td>

                          <td className="px-4 py-2.5 text-right whitespace-nowrap font-medium text-slate-500 dark:text-slate-400">
                            {formatCurrency(record.amount)}
                          </td>

                          <td className="px-4 py-2.5 text-right whitespace-nowrap font-black text-red-600 dark:text-red-400 text-sm">
                            {formatCurrency(record.balance)}
                          </td>

                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenReceive(record)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-bold text-[11px] transition-colors cursor-pointer"
                                title="Dar baixa em pagamento do crediário"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Baixa</span>
                              </button>

                              {record.phone && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenCobranca(record)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 font-bold text-[11px] transition-colors cursor-pointer"
                                  title="Enviar mensagem amigável de cobrança via WhatsApp"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>Cobrar</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          CONTEÚDO DA ABA 2: CLIENTES DEVEDORES
         ========================================== */}
      {activeTab === 'devedores' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-800 dark:text-white">
                  Lista de Clientes em Débito
                </h3>
                <p className="text-xs text-slate-400">
                  Ordenados por maior saldo devedor
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {debtors.length} clientes encontrados
              </span>
            </div>

            {loadingDebtors ? (
              <div className="py-12 text-center text-slate-400 font-semibold">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-600" />
                Carregando devedores...
              </div>
            ) : debtors.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/50 rounded-full flex items-center justify-center mx-auto mb-2 text-emerald-600">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-emerald-600">Nenhum devedor registrado!</p>
                <p className="text-xs text-slate-400">Todos os crediários e débitos estão quitados.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {debtors.map((debtor, index) => (
                  <div
                    key={debtor.id}
                    className={`p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                      debtor.hasOverdue ? 'bg-red-50/20 dark:bg-red-950/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 ${
                          index === 0
                            ? 'bg-red-600'
                            : index === 1
                            ? 'bg-amber-600'
                            : index === 2
                            ? 'bg-orange-500'
                            : 'bg-slate-400'
                        }`}
                      >
                        {index + 1}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-xs text-slate-900 dark:text-white uppercase">
                            {debtor.name}
                          </h4>
                          {debtor.hasOverdue ? (
                            <span className="px-2 py-0.2 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 text-[10px] font-black uppercase rounded-md">
                              Em Atraso
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                          {debtor.nickname && <span>"{debtor.nickname}"</span>}
                          {debtor.phone && (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3 text-emerald-600" />
                              {debtor.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          {debtor.debtCount} {debtor.debtCount === 1 ? 'compra' : 'compras'}
                        </span>
                        <span
                          className={`text-base font-black ${
                            debtor.hasOverdue ? 'text-red-600 dark:text-red-400' : 'text-amber-600'
                          }`}
                        >
                          {formatCurrency(debtor.totalOwed)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => openDebtorDetails(debtor)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold transition-all cursor-pointer"
                        title="Ver histórico de débitos do cliente"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver Débitos</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          CONTEÚDO DA ABA 3: CARTÃO BELAFARMA & NFC
         ========================================== */}
      {activeTab === 'cartoes' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Terminal NFC Integrado */}
          <CrediarioNfcWidget />

          {/* Listagem Rápida de Cartões BelaFarma */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-800 dark:text-white">
                  Cartões Fidelidade & Private Label
                </h3>
                <p className="text-xs text-slate-400">
                  Gerenciamento de limites e clientes portadores
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar cartão por nome/CPF..."
                  value={cardSearchTerm}
                  onChange={e => {
                    setCardSearchTerm(e.target.value);
                    fetchCards(e.target.value);
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3 whitespace-nowrap">Cartão / UID</th>
                    <th className="px-4 py-3 whitespace-nowrap">Cliente</th>
                    <th className="px-4 py-3 whitespace-nowrap">Telefone / CPF</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Limite Total</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Limite Usado</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Disponível</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {loadingCards ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-semibold">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-600" />
                        Carregando cartões...
                      </td>
                    </tr>
                  ) : cards.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500 font-medium">
                        Nenhum cartão BelaFarma encontrado.
                      </td>
                    </tr>
                  ) : (
                    cards.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                            {c.card_number || 'Sem número'}
                          </div>
                          {c.card_uid && (
                            <span className="text-[10px] text-slate-400 font-mono">UID: {c.card_uid}</span>
                          )}
                        </td>

                        <td className="px-4 py-2.5 font-black uppercase text-slate-900 dark:text-white truncate max-w-[200px]">
                          {c.customer_name}
                        </td>

                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 text-[11px]">
                          <div>{c.phone || '-'}</div>
                          {c.cpf && <div className="font-mono text-[10px] text-slate-400">{c.cpf}</div>}
                        </td>

                        <td className="px-4 py-2.5 text-right whitespace-nowrap font-medium text-slate-600 dark:text-slate-300">
                          {formatCurrency(c.credit_limit)}
                        </td>

                        <td className="px-4 py-2.5 text-right whitespace-nowrap font-bold text-amber-600 dark:text-amber-400">
                          {formatCurrency(c.used_limit)}
                        </td>

                        <td className="px-4 py-2.5 text-right whitespace-nowrap font-black text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(c.available_credit)}
                        </td>

                        <td className="px-4 py-2.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCardIdForProfile(c.id);
                              setIsCardProfileOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 text-xs font-bold transition-colors cursor-pointer"
                            title="Ver faturas, extrato e opções do cartão"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Perfil</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: BAIXA DE TÍTULO DIGIFARMA
         ========================================== */}
      {isPayModalOpen && selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onKeyDown={e => e.key === 'Escape' && setIsPayModalOpen(false)}
        >
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 space-y-5 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase">
                Receber Crediário
              </h2>
              <p className="text-xs font-bold text-slate-500">{selectedRecord.clientName}</p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span className="text-xs font-black text-slate-400 uppercase">Saldo Pendente</span>
              <span className="text-xl font-black text-red-600 dark:text-red-400">
                {formatCurrency(selectedRecord.balance)}
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                Valor do Pagamento (R$)*
              </label>
              <input
                ref={payInputRef}
                type="text"
                value={formatCurrency(paymentAmount)}
                onChange={e => setPaymentAmount(parseCurrency(e.target.value))}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-black text-2xl text-center outline-none focus:border-red-500 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={isProcessingPay}
                onClick={() => setIsPayModalOpen(false)}
                className="py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-black uppercase text-xs hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessingPay || paymentAmount <= 0 || paymentAmount > selectedRecord.balance}
                onClick={handleReceive}
                className="py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-md hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isProcessingPay ? 'Baixando...' : 'Confirmar Baixa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: COBRANÇA WHATSAPP
         ========================================== */}
      {isCobrancaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 space-y-5 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase">
                {isBatchMode
                  ? `Cobrança em Lote (${batchIndex + 1}/${selectedRecordsForBatch.length})`
                  : 'Enviar Cobrança WhatsApp'}
              </h2>
              <p className="text-xs font-bold text-slate-500">
                Cliente:{' '}
                <span className="text-slate-900 dark:text-white font-black">
                  {isBatchMode ? selectedRecordsForBatch[batchIndex]?.clientName : selectedRecord?.clientName}
                </span>
              </p>
              <p className="text-[11px] text-slate-400 font-mono">
                WhatsApp: {cobrancaTargetPhone}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                Mensagem a ser enviada (editável)*
              </label>
              <textarea
                value={cobrancaMessage}
                onChange={e => setCobrancaMessage(e.target.value)}
                rows={6}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-medium text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-2">
              <button
                type="button"
                disabled={isSendingCobranca}
                onClick={() => setIsCobrancaModalOpen(false)}
                className="py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-black uppercase text-xs hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              {isBatchMode && (
                <button
                  type="button"
                  disabled={isSendingCobranca}
                  onClick={handleSkipCobranca}
                  className="py-3 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 rounded-xl font-black uppercase text-xs hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  Pular
                </button>
              )}

              <button
                type="button"
                disabled={isSendingCobranca}
                onClick={handleSendCobranca}
                className={`py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs flex items-center justify-center gap-1.5 shadow-md hover:bg-emerald-700 transition-colors cursor-pointer ${
                  isBatchMode ? 'col-span-1' : 'col-span-2'
                }`}
              >
                {isSendingCobranca ? 'Enviando...' : 'Enviar Agora'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: DETALHES DE DÉBITOS DO CLIENTE
         ========================================== */}
      {isDebtorDetailModalOpen && selectedDebtor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-6 space-y-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase">
                  Débitos de {selectedDebtor.name}
                </h3>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                  {selectedDebtor.phone && <span>Tel: {selectedDebtor.phone}</span>}
                  {selectedDebtor.cpf && <span>CPF: {selectedDebtor.cpf}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDebtorDetailModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">
                {showHistory ? 'Histórico Completo' : 'Apenas Débitos Pendentes'}
              </span>
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs font-black text-red-600 hover:underline cursor-pointer"
              >
                {showHistory ? 'Ver apenas pendentes' : 'Ver histórico com quitados'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-1">
              {(showHistory ? allDebts : debtorDebts).length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Nenhum registro encontrado.
                </div>
              ) : (
                (showHistory ? allDebts : debtorDebts).map(debt => (
                  <div
                    key={debt.id}
                    className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {debt.description || 'Compra a Prazo'}
                        </span>
                        <span
                          className={`px-2 py-0.2 rounded-md text-[10px] font-black uppercase ${
                            debt.status === 'Pago'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {debt.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Data: {formatDate(debt.createdAt)}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-black text-sm text-slate-900 dark:text-white">
                        {formatCurrency(debt.totalValue)}
                      </span>

                      {debt.status !== 'Pago' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDebtPaymentModal(debt)}
                            className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-bold text-[11px] hover:bg-amber-100 cursor-pointer"
                          >
                            Amortizar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMarkDebtAsPaid(debt.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 cursor-pointer"
                          >
                            Quitar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: PAGAMENTO / AMORTIZAÇÃO DE DÉBITO
         ========================================== */}
      {paymentModalDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase text-center">
              Amortizar Débito
            </h3>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl flex justify-between items-center text-xs">
              <span className="font-bold text-slate-500">Valor Atual</span>
              <span className="font-black text-slate-900 dark:text-white">
                {formatCurrency(paymentModalDebt.totalValue)}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">
                Valor do Pagamento (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={debtPaymentAmountStr}
                onChange={e => setDebtPaymentAmountStr(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-black text-xl text-center outline-none focus:border-red-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={isProcessingDebtPay}
                onClick={() => setPaymentModalDebt(null)}
                className="py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessingDebtPay}
                onClick={handleDebtPayment}
                className="py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700"
              >
                {isProcessingDebtPay ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: PERFIL DO CARTÃO BELAFARMA
         ========================================== */}
      {isCardProfileOpen && selectedCardIdForProfile && (
        <CrediarioCustomerProfileModal
          isOpen={isCardProfileOpen}
          onClose={() => {
            setIsCardProfileOpen(false);
            setSelectedCardIdForProfile(null);
            fetchCards(cardSearchTerm);
          }}
          cardId={selectedCardIdForProfile}
          onProfileUpdated={() => {
            fetchCards(cardSearchTerm);
          }}
        />
      )}
    </div>
  );
};
