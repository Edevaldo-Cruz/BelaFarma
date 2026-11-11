import React, { useState, useEffect, useRef } from 'react';
import {
  CreditCard,
  Wifi,
  Search,
  CheckCircle,
  AlertCircle,
  XCircle,
  Clock,
  UserPlus,
  DollarSign,
  Gift,
  ShieldAlert,
  Send,
  RefreshCw,
  X,
  FileText,
  AlertTriangle,
  Download,
  Copy,
  Edit3,
  Play
} from 'lucide-react';
import { useToast } from './ToastContext';

interface CardData {
  id: number;
  customer_name: string;
  phone: string;
  cpf?: string;
  has_cpf?: boolean;
  needs_cpf?: boolean;
  card_number: string;
  card_uid?: string;
  credit_limit: number;
  used_limit: number;
  available_credit: number;
  due_day: number;
  status: string;
  active_fee_amount: number;
  available_cashback: number;
  is_blocked_late: boolean;
  days_late: number;
  overdue_invoice?: {
    id: string;
    reference_month: string;
    due_date: string;
    total_due: number;
    paid_amount: number;
    days_late: number;
  } | null;
}

interface InvoiceData {
  id: string;
  card_id: number;
  customer_id?: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
  purchases_total: number;
  total_due: number;
  paid_amount: number;
  paid_at?: string;
  status: string;
  boleto_id?: string;
  boleto_barcode?: string;
  pix_copia_cola?: string;
}

interface DashboardMetrics {
  cards: {
    total: number;
    active: number;
    sem_cpf: number;
    total_credit_granted: number;
    total_credit_used: number;
  };
  billing: {
    overdue_count: number;
    overdue_amount: number;
    blocked_overdue_clients: number;
  };
}

export const CrediarioNfcWidget: React.FC = () => {
  const { addToast } = useToast();

  // Estados principais
  const [nfcInput, setNfcInput] = useState('');
  const [activeCard, setActiveCard] = useState<CardData | null>(null);
  const [cardInvoices, setCardInvoices] = useState<InvoiceData[]>([]);
  const [unregisteredUid, setUnregisteredUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'caixa' | 'cobranca'>('caixa');

  // Modais
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isCashbackModalOpen, setIsCashbackModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedInvoiceToPay, setSelectedInvoiceToPay] = useState<InvoiceData | null>(null);

  // Formulário de Emissão Expressa
  const [issueName, setIssueName] = useState('');
  const [issuePhone, setIssuePhone] = useState('');
  const [issueCpf, setIssueCpf] = useState('');
  const [issueLimit, setIssueLimit] = useState('300');
  const [issueDueDay, setIssueDueDay] = useState<'10' | '20'>('20');
  const [issuingLoading, setIssuingLoading] = useState(false);

  // Edição Cadastral (CPF / Tel / Limite)
  const [editCpf, setEditCpf] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editLimit, setEditLimit] = useState('');
  const [editDueDay, setEditDueDay] = useState<'10' | '20'>('20');
  const [savingEdit, setSavingEdit] = useState(false);

  // Baixa / Pagamento no Caixa
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('DINHEIRO');
  const [payingLoading, setPayingLoading] = useState(false);

  // Ações de Boleto & WhatsApp
  const [issuingBoletoId, setIssuingBoletoId] = useState<string | null>(null);
  const [sendingWppId, setSendingWppId] = useState<string | null>(null);
  const [runningCron, setRunningCron] = useState(false);

  // Busca Manual
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Lançamento de Venda no Crediário
  const [saleAmount, setSaleAmount] = useState('');
  const [saleDescription, setSaleDescription] = useState('Compra no Balcão BelaFarma');
  const [authorizingSale, setAuthorizingSale] = useState(false);

  // Resgate de Cashback
  const [cashbackToRedeem, setCashbackToRedeem] = useState('');
  const [redeemingCashback, setRedeemingCashback] = useState(false);

  // Métricas do Dashboard de Cobrança
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const nfcInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setIsSearchModalOpen(true);
        handleSearch('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const loadCardDetails = async (cardId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/details`);
      const data = await res.json();
      if (res.ok && data.card) {
        setActiveCard(data.card);
        setCardInvoices(data.invoices || []);
        setEditCpf(data.card.cpf || '');
        setEditPhone(data.card.phone || '');
        setEditLimit(String(data.card.credit_limit || 300));
        setEditDueDay(String(data.card.due_day || 20) as '10' | '20');
      } else {
        addToast(data.error || 'Erro ao carregar detalhes da conta.', 'error');
      }
    } catch (_) {
      addToast('Falha na comunicação com o servidor.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleNfcSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUid = nfcInput.trim().toUpperCase();
    if (!cleanUid) return;

    setLoading(true);
    setActiveCard(null);
    setCardInvoices([]);
    setUnregisteredUid(null);

    try {
      const res = await fetch(`/api/cards/by-uid/${encodeURIComponent(cleanUid)}`);
      const data = await res.json();

      if (!res.ok) {
        addToast(data.error || 'Erro ao consultar leitor NFC.', 'error');
        return;
      }

      if (data.registered && data.card) {
        setNfcInput('');
        await loadCardDetails(data.card.id);
        addToast(`Cliente identificado: ${data.card.customer_name}`, 'success');
      } else {
        setUnregisteredUid(data.card_uid);
        setNfcInput('');
        setIsIssueModalOpen(true);
        addToast('Chip virgem detectado! Abrindo cadastro expresso...', 'info');
      }
    } catch (err: any) {
      addToast('Falha na comunicação com o leitor NFC.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    try {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (res.ok && data.cards) {
        setSearchResults(data.cards);
      }
    } catch (_) {}
  };

  const selectCardFromSearch = async (cardItem: any) => {
    setIsSearchModalOpen(false);
    await loadCardDetails(cardItem.id);
    addToast(`Cliente selecionado: ${cardItem.customer_name}`, 'success');
  };

  const handleIssueCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueName.trim()) {
      addToast('Nome do cliente é obrigatório!', 'warning');
      return;
    }

    setIssuingLoading(true);
    try {
      const res = await fetch('/api/cards/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: issueName,
          phone: issuePhone,
          cpf: issueCpf,
          cardUid: unregisteredUid,
          creditLimit: parseFloat(issueLimit) || 300,
          dueDay: parseInt(issueDueDay) || 20
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        addToast('Conta de Crediário criada com sucesso!', 'success');
        setIsIssueModalOpen(false);
        setIssueName('');
        setIssuePhone('');
        setIssueCpf('');
        setUnregisteredUid(null);
        if (data.cardId) {
          await loadCardDetails(data.cardId);
        }
      } else {
        addToast(data.error || 'Erro ao emitir crediário.', 'error');
      }
    } catch (err: any) {
      addToast('Erro na criação de conta.', 'error');
    } finally {
      setIssuingLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCard) return;

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/cards/${activeCard.id}/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf: editCpf,
          phone: editPhone,
          creditLimit: parseFloat(editLimit) || activeCard.credit_limit,
          dueDay: parseInt(editDueDay) || activeCard.due_day
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Dados cadastrais atualizados com sucesso!', 'success');
        setIsEditModalOpen(false);
        await loadCardDetails(activeCard.id);
      } else {
        addToast(data.error || 'Erro ao atualizar cadastro.', 'error');
      }
    } catch (_) {
      addToast('Falha ao comunicar com o servidor.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAuthorizeSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCard) return;

    const val = parseFloat(saleAmount);
    if (!val || val <= 0) {
      addToast('Informe um valor de venda válido!', 'warning');
      return;
    }

    setAuthorizingSale(true);
    try {
      const res = await fetch('/api/cards/authorize-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: activeCard.id,
          amount: val,
          description: saleDescription || 'Compra no Balcão BelaFarma'
        })
      });
      const data = await res.json();

      if (res.ok && data.authorized) {
        addToast(`Venda de ${formatCurrency(val)} autorizada com sucesso!`, 'success');
        setIsSaleModalOpen(false);
        setSaleAmount('');
        await loadCardDetails(activeCard.id);
      } else {
        addToast(data.reason || data.error || 'Venda recusada.', 'error');
      }
    } catch (err: any) {
      addToast('Falha ao autorizar venda no crediário.', 'error');
    } finally {
      setAuthorizingSale(false);
    }
  };

  const handleIssueInterBoleto = async (invoiceId: string) => {
    if (!activeCard?.cpf) {
      addToast('Cliente sem CPF cadastrado. Informe o CPF antes de emitir o boleto.', 'warning');
      setIsEditModalOpen(true);
      return;
    }

    setIssuingBoletoId(invoiceId);
    try {
      const res = await fetch(`/api/cards/invoices/${invoiceId}/issue-inter-boleto`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Boleto Híbrido Banco Inter emitido com sucesso! Código Pix gerado.', 'success');
        await loadCardDetails(activeCard.id);
      } else {
        addToast(data.error || 'Erro ao emitir boleto no Banco Inter.', 'error');
      }
    } catch (_) {
      addToast('Erro na integração com Banco Inter.', 'error');
    } finally {
      setIssuingBoletoId(null);
    }
  };

  const handleDownloadPdf = (invoiceId: string) => {
    window.open(`/api/cards/invoices/${invoiceId}/boleto-pdf`, '_blank');
  };

  const handleSendWhatsApp = async (invoiceId: string) => {
    setSendingWppId(invoiceId);
    try {
      const res = await fetch(`/api/cards/invoices/${invoiceId}/send-whatsapp`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(data.sentPdf ? 'Fatura e PDF do boleto enviados no WhatsApp!' : 'Extrato e Pix enviados no WhatsApp!', 'success');
      } else {
        addToast(data.error || 'Erro ao enviar WhatsApp.', 'error');
      }
    } catch (_) {
      addToast('Falha no envio de WhatsApp.', 'error');
    } finally {
      setSendingWppId(null);
    }
  };

  const handleOpenPayModal = (inv: InvoiceData) => {
    setSelectedInvoiceToPay(inv);
    const saldoPagar = Math.max(0, inv.total_due - inv.paid_amount);
    setPayAmount(String(saldoPagar));
    setPayMethod('DINHEIRO');
    setIsPayModalOpen(true);
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceToPay || !activeCard) return;

    const val = parseFloat(payAmount);
    if (!val || val <= 0) {
      addToast('Informe um valor de pagamento válido!', 'warning');
      return;
    }

    setPayingLoading(true);
    try {
      const res = await fetch(`/api/cards/invoices/${selectedInvoiceToPay.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: val,
          paymentMethod: payMethod
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        addToast(data.message || 'Pagamento confirmado e limite liberado!', 'success');
        setIsPayModalOpen(false);
        await loadCardDetails(activeCard.id);
      } else {
        addToast(data.error || 'Erro ao registrar pagamento.', 'error');
      }
    } catch (_) {
      addToast('Erro ao comunicar pagamento.', 'error');
    } finally {
      setPayingLoading(false);
    }
  };

  const loadMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const res = await fetch('/api/cards/dashboard');
      const data = await res.json();
      if (res.ok && data.success) {
        setMetrics(data);
      }
    } catch (_) {}
    setLoadingMetrics(false);
  };

  const handleRunCron = async () => {
    setRunningCron(true);
    try {
      const res = await fetch('/api/cards/cron/run', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        const r = data.relatorio;
        addToast(`Régua executada: ${r.faturasFechadas} fechadas, ${r.boletosEmitidos} boletos, ${r.lembretesVencimento + r.lembretesAtraso} lembretes enviados!`, 'success');
        await loadMetrics();
      } else {
        addToast(data.error || 'Erro ao executar régua diária.', 'error');
      }
    } catch (_) {
      addToast('Falha ao acionar cron.', 'error');
    } finally {
      setRunningCron(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'cobranca') {
      loadMetrics();
    }
  }, [activeTab]);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden font-sans text-slate-100">
      
      {/* CABEÇALHO COMPACTO DO WIDGET */}
      <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-md">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-tight text-white">Crediário 2.0 BelaFarma</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Wifi className="w-3 h-3 animate-pulse" /> Banco Inter Ativo
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Controle de Limites, Boletos Híbridos & Cobrança Automática</p>
          </div>
        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('caixa')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'caixa' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Terminal do Balcão
          </button>
          <button
            onClick={() => setActiveTab('cobranca')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeTab === 'cobranca' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Gestão & Régua Automática
            {metrics?.billing?.overdue_count ? (
              <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] flex items-center justify-center font-black">
                {metrics.billing.overdue_count}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* ABA 1: TERMINAL DO CAIXA */}
      {activeTab === 'caixa' && (
        <div className="p-4 space-y-4">
          
          {/* BARRA DE BUSCA ÁGIL POR NOME OU LEITURA NFC */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            <button
              onClick={() => { setIsSearchModalOpen(true); handleSearch(''); }}
              className="md:col-span-8 px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-emerald-500/40 text-left text-xs font-medium text-slate-300 flex items-center justify-between transition shadow-inner group"
            >
              <div className="flex items-center gap-2.5">
                <Search className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span>Buscar Cliente por <strong className="text-white">Nome</strong>, Celular ou CPF...</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">F2</span>
            </button>

            <form onSubmit={handleNfcSubmit} className="md:col-span-4 relative">
              <input
                ref={nfcInputRef}
                type="text"
                value={nfcInput}
                onChange={e => setNfcInput(e.target.value)}
                placeholder="Aproxime Chip NFC..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono transition"
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute right-1.5 top-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold transition flex items-center gap-1"
              >
                <Wifi className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* ESTADO 1: NENHUM CLIENTE SELECIONADO */}
          {!activeCard && (
            <div className="p-6 rounded-2xl bg-slate-950/50 border border-slate-800/80 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                <Search className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-200">Selecione um Cliente para Iniciar</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Clique na busca acima ou pressione <strong>F2</strong> para buscar pelo Nome do cliente. Você também pode aproximar o cartão ou chaveiro NFC.
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-2">
                <button
                  onClick={() => { setIsSearchModalOpen(true); handleSearch(''); }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow"
                >
                  <Search className="w-4 h-4" />
                  <span>Buscar por Nome (22 Clientes Ativos)</span>
                </button>
                <button
                  onClick={() => { setUnregisteredUid(null); setIsIssueModalOpen(true); }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold transition"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Novo Cadastro</span>
                </button>
              </div>
            </div>
          )}

          {/* ESTADO 2: CLIENTE ATIVO & IDENTIFICADO */}
          {activeCard && (
            <div className={`p-4 rounded-2xl border transition space-y-4 ${
              activeCard.is_blocked_late
                ? 'bg-rose-950/30 border-rose-500/40'
                : 'bg-slate-950/80 border-emerald-500/30'
            }`}>
              
              {/* STATUS HEADER */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shadow ${
                    activeCard.is_blocked_late
                      ? 'bg-rose-600 text-white'
                      : 'bg-emerald-600 text-white'
                  }`}>
                    {activeCard.is_blocked_late ? <XCircle className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-sm text-white">{activeCard.customer_name}</h3>
                      <button
                        onClick={() => setIsEditModalOpen(true)}
                        className="text-slate-400 hover:text-emerald-400 transition"
                        title="Editar Dados / Cadastrar CPF"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="inline-flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                      <span>{activeCard.phone || 'Sem Telefone'}</span>
                      <span>•</span>
                      <span>CPF: {activeCard.cpf || 'Não cadastrado'}</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-sans font-bold">Vencimento Dia {activeCard.due_day}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    activeCard.is_blocked_late
                      ? 'bg-rose-900 text-rose-200 border border-rose-500'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {activeCard.is_blocked_late ? 'Bloqueado (> 5 dias de atraso)' : 'Crediário Liberado'}
                  </span>
                  <button
                    onClick={() => { setActiveCard(null); setCardInvoices([]); }}
                    className="text-[11px] text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 transition"
                  >
                    Trocar
                  </button>
                </div>
              </div>

              {/* ALERTA: CPF PENDENTE */}
              {activeCard.needs_cpf && (
                <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span><strong>CPF Pendente:</strong> Necessário para emitir boletos bancários pelo Banco Inter.</span>
                  </div>
                  <button
                    onClick={() => setIsEditModalOpen(true)}
                    className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold text-[11px] transition whitespace-nowrap"
                  >
                    + Cadastrar CPF Agora
                  </button>
                </div>
              )}

              {/* AVISO SE ESTIVER BLOQUEADO POR ATRASO */}
              {activeCard.is_blocked_late && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
                  <div className="flex-1">
                    <strong>Vendas a Prazo Bloqueadas:</strong> Fatura vencida há mais de 5 dias! O cliente deve efetuar o pagamento para liberar novas compras.
                  </div>
                </div>
              )}

              {/* CARDS DE SALDO E AÇÕES */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                {/* LIMITE DISPONÍVEL */}
                <div className="p-3 rounded-xl bg-slate-900/90 border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Limite Disponível</span>
                  <div className="text-xl font-black text-emerald-400">
                    {formatCurrency(activeCard.available_credit)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Teto: {formatCurrency(activeCard.credit_limit)} | Usado: {formatCurrency(activeCard.used_limit)}
                  </div>
                </div>

                {/* STATUS DE DÍVIDA TOTAL */}
                <div className="p-3 rounded-xl bg-slate-900/90 border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Saldo Devedor Consolidado</span>
                  <div className="text-xl font-black text-cyan-400">
                    {formatCurrency(activeCard.used_limit)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {cardInvoices.length} fatura(s) registradas
                  </div>
                </div>

                {/* BOTÃO PRINCIPAL DE LANÇAMENTO */}
                <div className="flex flex-col gap-2 justify-center">
                  <button
                    disabled={activeCard.is_blocked_late || activeCard.available_credit <= 0}
                    onClick={() => setIsSaleModalOpen(true)}
                    className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow transition flex items-center justify-center gap-1.5"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Lançar Compra a Prazo</span>
                  </button>
                </div>

              </div>

              {/* LISTAGEM DE FATURAS DO CLIENTE */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <h4 className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Faturas & Boletos Banco Inter:</span>
                  <span className="text-[11px] text-slate-500 font-normal">Vencimentos dias 10 e 20</span>
                </h4>

                {cardInvoices.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500 bg-slate-900/40 rounded-xl">
                    Nenhuma fatura em aberto.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cardInvoices.map(inv => {
                      const saldoPagar = Number((inv.total_due - inv.paid_amount).toFixed(2));
                      const isPaid = inv.status === 'paid' || saldoPagar <= 0;
                      return (
                        <div key={inv.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-white">Fatura {inv.reference_month}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                                isPaid ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-amber-950 text-amber-400 border border-amber-500/30'
                              }`}>
                                {isPaid ? 'Quitada' : `Vence em ${inv.due_date}`}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Valor: <strong className="text-white">{formatCurrency(inv.total_due)}</strong>
                              {inv.paid_amount > 0 && <span className="text-emerald-400"> (Pago: {formatCurrency(inv.paid_amount)})</span>}
                              {!isPaid && <span className="text-cyan-400 font-bold"> • Saldo: {formatCurrency(saldoPagar)}</span>}
                            </div>
                          </div>

                          {/* BOTÕES DE AÇÃO NA FATURA */}
                          <div className="flex flex-wrap items-center gap-1.5 self-end md:self-auto">
                            {!isPaid && (
                              <button
                                onClick={() => handleOpenPayModal(inv)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-1 shadow"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>Baixar no Caixa</span>
                              </button>
                            )}

                            {!isPaid && !inv.boleto_id && (
                              <button
                                disabled={issuingBoletoId === inv.id}
                                onClick={() => handleIssueInterBoleto(inv.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center gap-1"
                              >
                                {issuingBoletoId === inv.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                                <span>Gerar Boleto Inter</span>
                              </button>
                            )}

                            {inv.boleto_id && (
                              <button
                                onClick={() => handleDownloadPdf(inv.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition flex items-center gap-1 border border-slate-700"
                              >
                                <Download className="w-3.5 h-3.5 text-emerald-400" />
                                <span>PDF Boleto</span>
                              </button>
                            )}

                            {inv.pix_copia_cola && (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(inv.pix_copia_cola || '');
                                  addToast('Código Pix Copia e Cola copiado!', 'success');
                                }}
                                className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                                title="Copiar Pix Copia e Cola"
                              >
                                <Copy className="w-3.5 h-3.5 text-cyan-400" />
                              </button>
                            )}

                            {activeCard.phone && !isPaid && (
                              <button
                                disabled={sendingWppId === inv.id}
                                onClick={() => handleSendWhatsApp(inv.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white font-bold text-xs transition flex items-center gap-1"
                                title="Enviar fatura detalhada com Pix para o WhatsApp"
                              >
                                {sendingWppId === inv.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                <span>WhatsApp</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      )}

      {/* ABA 2: GESTÃO, DASHBOARD & RÉGUA AUTOMÁTICA */}
      {activeTab === 'cobranca' && (
        <div className="p-4 space-y-4">
          
          {/* HEADER DA RÉGUA AUTOMÁTICA */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold">
                <Play className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Régua Automática de Cobrança (WhatsApp & Banco Inter)</h4>
                <p className="text-[11px] text-slate-400">Disparos diários às 09:00: Fechamento (D-10), Vencimento, D+1, D+3 e D+5.</p>
              </div>
            </div>
            <button
              disabled={runningCron}
              onClick={handleRunCron}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition flex items-center gap-1.5 shadow"
            >
              {runningCron ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>Executar Varredura Agora</span>
            </button>
          </div>

          {/* CARDS DE RESUMO DA CARTEIRA */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Clientes Ativos</div>
              <div className="text-base font-black text-white mt-0.5">{metrics?.cards?.active || 0} contas</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Limite Total Concedido</div>
              <div className="text-base font-black text-emerald-400 mt-0.5">{formatCurrency(metrics?.cards?.total_credit_granted || 0)}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Saldo em Aberto</div>
              <div className="text-base font-black text-cyan-400 mt-0.5">{formatCurrency(metrics?.cards?.total_credit_used || 0)}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-rose-500/30 bg-rose-950/20">
              <div className="text-[10px] text-rose-300 uppercase">Total Vencido em Atraso</div>
              <div className="text-base font-black text-rose-400 mt-0.5">{formatCurrency(metrics?.billing?.overdue_amount || 0)}</div>
            </div>
          </div>

        </div>
      )}

      {/* MODAL: BUSCA MANUAL POR NOME (F2) */}
      {isSearchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl animate-fade-in text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-sm text-white">Localizar Cliente do Crediário</h3>
              </div>
              <button onClick={() => setIsSearchModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Digite o Nome, Celular ou CPF..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-800 rounded-xl border border-slate-800">
              {searchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  {searchQuery ? 'Nenhum cliente localizado com esse termo.' : 'Carregando lista de clientes...'}
                </div>
              ) : (
                searchResults.map(c => (
                  <div
                    key={c.id}
                    onClick={() => selectCardFromSearch(c)}
                    className="p-3 hover:bg-slate-800/80 cursor-pointer flex items-center justify-between transition"
                  >
                    <div>
                      <div className="font-bold text-xs text-white flex items-center gap-2">
                        <span>{c.customer_name}</span>
                        {c.needs_cpf && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-500/40">
                            Sem CPF
                          </span>
                        )}
                        {c.is_blocked_late && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-500/40">
                            Bloqueado
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {c.phone || 'Sem telefone'} • Vence Dia {c.due_day}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-emerald-400">
                        {formatCurrency(c.available_credit)} disp.
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Usado: {formatCurrency(c.used_limit)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LANÇAMENTO DE COMPRA */}
      {isSaleModalOpen && activeCard && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-fade-in text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-extrabold text-sm text-white">Lançar Compra no Crediário</h3>
              <button onClick={() => setIsSaleModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div>Cliente: <strong className="text-white">{activeCard.customer_name}</strong></div>
              <div>Limite Disponível: <strong className="text-emerald-400">{formatCurrency(activeCard.available_credit)}</strong></div>
            </div>

            <form onSubmit={handleAuthorizeSale} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Valor da Compra (R$):</label>
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  required
                  value={saleAmount}
                  onChange={e => setSaleAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-lg font-black text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Descrição do Lançamento:</label>
                <input
                  type="text"
                  value={saleDescription}
                  onChange={e => setSaleDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSaleModalOpen(false)}
                  className="w-1/3 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={authorizingSale}
                  className="w-2/3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center justify-center gap-1.5 shadow"
                >
                  {authorizingSale ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  <span>Confirmar Venda</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BAIXA DE PAGAMENTO NO CAIXA */}
      {isPayModalOpen && selectedInvoiceToPay && activeCard && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-fade-in text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-extrabold text-sm text-white">Receber Fatura no Balcão</h3>
              <button onClick={() => setIsPayModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div>Cliente: <strong className="text-white">{activeCard.customer_name}</strong></div>
              <div>Fatura: <strong className="text-white">{selectedInvoiceToPay.reference_month}</strong></div>
              <div>Saldo Restante: <strong className="text-cyan-400">{formatCurrency(selectedInvoiceToPay.total_due - selectedInvoiceToPay.paid_amount)}</strong></div>
            </div>

            <form onSubmit={handleConfirmPayment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Valor Pago (R$):</label>
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-lg font-black text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Forma de Pagamento:</label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="DINHEIRO">Dinheiro em Espécie</option>
                  <option value="PIX">Pix Direto</option>
                  <option value="DEBITO">Cartão de Débito</option>
                  <option value="CREDITO_AVISTA">Cartão de Crédito à Vista</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="w-1/3 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={payingLoading}
                  className="w-2/3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center justify-center gap-1.5 shadow"
                >
                  {payingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
                  <span>Confirmar Baixa</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR CADASTRO & CADASTRAR CPF */}
      {isEditModalOpen && activeCard && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-fade-in text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-extrabold text-sm text-white">Dados do Cliente & Parâmetros de Crédito</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">CPF do Titular (Obrigatório para Banco Inter):</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="000.000.000-00"
                  value={editCpf}
                  onChange={e => setEditCpf(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">WhatsApp / Telefone:</label>
                <input
                  type="text"
                  placeholder="(32) 99999-9999"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Limite Concedido (R$):</label>
                  <input
                    type="number"
                    step="50"
                    value={editLimit}
                    onChange={e => setEditLimit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Dia de Vencimento:</label>
                  <select
                    value={editDueDay}
                    onChange={e => setEditDueDay(e.target.value as '10' | '20')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="10">Dia 10 (Fecha dia 1)</option>
                    <option value="20">Dia 20 (Fecha dia 10)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="w-1/3 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="w-2/3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center justify-center gap-1.5 shadow"
                >
                  {savingEdit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  <span>Salvar Dados</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVO CADASTRO */}
      {isIssueModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-fade-in text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-extrabold text-sm text-white">Novo Cliente no Crediário 2.0</h3>
              <button onClick={() => setIsIssueModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleIssueCard} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Nome Completo:</label>
                <input
                  autoFocus
                  type="text"
                  required
                  placeholder="Nome do cliente"
                  value={issueName}
                  onChange={e => setIssueName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">CPF (Recomendado):</label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={issueCpf}
                    onChange={e => setIssueCpf(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">WhatsApp:</label>
                  <input
                    type="text"
                    placeholder="(32) 99999-9999"
                    value={issuePhone}
                    onChange={e => setIssuePhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Limite Inicial (R$):</label>
                  <input
                    type="number"
                    step="50"
                    value={issueLimit}
                    onChange={e => setIssueLimit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Vencimento:</label>
                  <select
                    value={issueDueDay}
                    onChange={e => setIssueDueDay(e.target.value as '10' | '20')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="20">Dia 20 (Fecha dia 10)</option>
                    <option value="10">Dia 10 (Fecha dia 1)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsIssueModalOpen(false)}
                  className="w-1/3 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={issuingLoading}
                  className="w-2/3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center justify-center gap-1.5 shadow"
                >
                  {issuingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>Criar Conta</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
