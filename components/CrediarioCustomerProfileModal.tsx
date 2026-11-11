import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Printer,
  Edit3,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Calendar,
  Phone,
  MapPin,
  FileText,
  Download,
  Copy,
  Send,
  Save,
  Search,
  Filter,
  RefreshCw,
  ShoppingBag,
  Check
} from 'lucide-react';
import { useToast } from './ToastContext';

interface Transaction {
  id: string;
  type: 'PURCHASE' | 'PAYMENT';
  date: string;
  description: string;
  amount: number;
  invoice_id?: string;
  sale_id?: string;
  payment_method?: string;
}

interface Invoice {
  id: string;
  card_id: number;
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

interface CardProfile {
  id: number;
  customer_id?: string;
  customer_name: string;
  phone: string;
  cpf?: string;
  has_cpf: boolean;
  needs_cpf: boolean;
  card_number: string;
  card_uid?: string;
  credit_limit: number;
  used_limit: number;
  available_credit: number;
  due_day: number;
  status: string;
  is_blocked_late: boolean;
  days_late: number;
}

interface CustomerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId?: number | string | null;
  customerId?: string | null;
  onProfileUpdated?: () => void;
  onOpenSaleModal?: (card: CardProfile) => void;
  onOpenPayModal?: (invoice: Invoice) => void;
}

export const CrediarioCustomerProfileModal: React.FC<CustomerProfileModalProps> = ({
  isOpen,
  onClose,
  cardId,
  customerId,
  onProfileUpdated,
  onOpenSaleModal,
  onOpenPayModal
}) => {
  const { addToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [card, setCard] = useState<CardProfile | null>(null);
  const [customer, setCustomer] = useState<any | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [metrics, setMetrics] = useState({
    totalPurchases: 0,
    totalPayments: 0,
    currentDebt: 0,
    creditLimit: 0,
    availableCredit: 0
  });

  // Abas internas: 'extrato' ou 'faturas'
  const [activeTab, setActiveTab] = useState<'extrato' | 'faturas'>('extrato');

  // Filtros do extrato
  const [filterType, setFilterType] = useState<'all' | 'purchases' | 'payments'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modo de edição cadastral rápida
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    customerName: '',
    cpf: '',
    phone: '',
    address: '',
    creditLimit: '300',
    dueDay: '20' as '10' | '20'
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Ações de faturas
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'Data N/D') return 'Data N/D';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        const parts = dateStr.substring(0, 10).split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
      }
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const loadStatement = async () => {
    const idToFetch = cardId || customerId;
    if (!idToFetch) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${idToFetch}/statement`);
      const data = await res.json();

      if (res.ok && data.success) {
        setCard(data.card);
        setCustomer(data.customer || null);
        setInvoices(data.invoices || []);
        setTransactions(data.transactions || []);
        setMetrics(data.metrics || {
          totalPurchases: 0,
          totalPayments: 0,
          currentDebt: data.card.used_limit || 0,
          creditLimit: data.card.credit_limit || 0,
          availableCredit: data.card.available_credit || 0
        });

        // Preenche o formulário de edição
        setEditForm({
          customerName: data.card.customer_name || '',
          cpf: data.card.cpf || '',
          phone: data.card.phone || '',
          address: data.customer?.address || '',
          creditLimit: String(data.card.credit_limit || 300),
          dueDay: String(data.card.due_day || 20) as '10' | '20'
        });
      } else {
        addToast(data.error || 'Não foi possível carregar a ficha de crediário.', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao carregar dados do crediário.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && (cardId || customerId)) {
      setIsEditing(false);
      loadStatement();
    }
  }, [isOpen, cardId, customerId]);

  // Impressão do extrato na Bematech MP-4200 TH (bobina térmica 80mm)
  const handlePrintStatement = async () => {
    if (!card) return;
    setPrinting(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/print-statement`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Extrato enviado com sucesso para a impressora térmica (80mm)!', 'success');
      } else {
        addToast(data.error || 'Erro ao enviar impressão para o caixa.', 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação com a impressora térmica.', 'error');
    } finally {
      setPrinting(false);
    }
  };

  // Salvar alterações de cadastro (CPF, Limite, Vencimento)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!card) return;

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: editForm.customerName,
          cpf: editForm.cpf,
          phone: editForm.phone,
          address: editForm.address,
          creditLimit: parseFloat(editForm.creditLimit) || 300,
          dueDay: parseInt(editForm.dueDay, 10) || 20
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Cadastro e parâmetros de crédito atualizados com sucesso!', 'success');
        setIsEditing(false);
        await loadStatement();
        if (onProfileUpdated) onProfileUpdated();
      } else {
        addToast(data.error || 'Erro ao atualizar cadastro.', 'error');
      }
    } catch (_) {
      addToast('Falha de conexão com o servidor.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Copiar Pix Copia e Cola
  const handleCopyPix = (pixCode?: string) => {
    if (!pixCode) {
      addToast('Código Pix não disponível para esta fatura.', 'warning');
      return;
    }
    navigator.clipboard.writeText(pixCode);
    addToast('Código Pix Copia e Cola copiado para a área de transferência!', 'success');
  };

  // Download do PDF do boleto Banco Inter
  const handleDownloadPdf = (invoiceId: string) => {
    window.open(`/api/cards/invoices/${invoiceId}/boleto-pdf`, '_blank');
  };

  // Envio por WhatsApp
  const handleSendWhatsApp = async (invoiceId: string) => {
    setActionLoadingId(invoiceId);
    try {
      const res = await fetch(`/api/cards/invoices/${invoiceId}/send-whatsapp`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(data.sentPdf ? 'Fatura e Boleto Inter enviados com sucesso no WhatsApp!' : 'Extrato e Pix enviados no WhatsApp!', 'success');
      } else {
        addToast(data.error || 'Erro ao enviar fatura pelo WhatsApp.', 'error');
      }
    } catch (_) {
      addToast('Falha ao enviar mensagem de WhatsApp.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtragem de transações
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filterType === 'purchases' && t.type !== 'PURCHASE') return false;
      if (filterType === 'payments' && t.type !== 'PAYMENT') return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const descMatch = (t.description || '').toLowerCase().includes(term);
        const amountMatch = String(t.amount).includes(term);
        return descMatch || amountMatch;
      }
      return true;
    });
  }, [transactions, filterType, searchTerm]);

  // Cálculo percentual de limite usado
  const limitPercent = useMemo(() => {
    if (!card || card.credit_limit <= 0) return 0;
    return Math.min(100, Math.round((card.used_limit / card.credit_limit) * 100));
  }, [card]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100 font-sans">
        
        {/* CABEÇALHO DO MODAL */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  {card?.customer_name || 'Ficha do Cliente & Extrato'}
                </h2>
                {card && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    card.is_blocked_late
                      ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {card.is_blocked_late ? `Bloqueado (${card.days_late}d atraso)` : 'Crediário Liberado'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Extrato Cronológico Completo, Limite de Crédito & Boletos Banco Inter
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* BOTÃO DE IMPRESSÃO TÉRMICA 80MM */}
            <button
              onClick={handlePrintStatement}
              disabled={printing || !card}
              title="Imprimir cupom de extrato na impressora térmica Bematech (80mm)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition shadow disabled:opacity-50"
            >
              <Printer className={`w-3.5 h-3.5 text-emerald-400 ${printing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{printing ? 'Imprimindo...' : 'Imprimir Extrato (80mm)'}</span>
            </button>

            {/* TOGGLE EDITAR DADOS */}
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`p-2 rounded-xl border text-xs font-bold transition ${
                isEditing
                  ? 'bg-amber-600 text-slate-950 border-amber-500'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Editar dados cadastrais, CPF, vencimento ou limite"
            >
              <Edit3 className="w-4 h-4" />
            </button>

            {/* FECHAR */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/60 hover:text-rose-200 text-slate-400 border border-slate-700 transition"
              title="Fechar Janela"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CORPO DO MODAL (ROLÁVEL) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          
          {loading && !card ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
              <p className="text-xs font-semibold">Carregando extrato e dados financeiros...</p>
            </div>
          ) : card ? (
            <>
              {/* ALERTA DE CPF PENDENTE */}
              {card.needs_cpf && !isEditing && (
                <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <div>
                      <strong>CPF não cadastrado:</strong> Cadastre o CPF para autorizar a emissão automática de boletos híbridos e Pix pelo Banco Inter.
                    </div>
                  </div>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition whitespace-nowrap shadow"
                  >
                    + Cadastrar CPF
                  </button>
                </div>
              )}

              {/* PAINEL DE EDIÇÃO CADASTRO / LIMITE */}
              {isEditing ? (
                <form onSubmit={handleSaveProfile} className="p-4 rounded-2xl bg-slate-950 border border-amber-500/40 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-black uppercase text-amber-400 flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5" /> Edição de Parâmetros de Crédito & Cadastro
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Nome do Cliente</label>
                      <input
                        type="text"
                        value={editForm.customerName}
                        onChange={e => setEditForm({ ...editForm, customerName: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500 font-semibold"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">CPF (Obrigatório p/ Banco Inter)</label>
                      <input
                        type="text"
                        placeholder="000.000.000-00"
                        value={editForm.cpf}
                        onChange={e => setEditForm({ ...editForm, cpf: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">WhatsApp / Telefone</label>
                      <input
                        type="text"
                        placeholder="(00) 00000-0000"
                        value={editForm.phone}
                        onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Limite Concedido (R$)</label>
                      <input
                        type="number"
                        step="50"
                        min="50"
                        value={editForm.creditLimit}
                        onChange={e => setEditForm({ ...editForm, creditLimit: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-emerald-400 font-extrabold outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Dia de Vencimento</label>
                      <select
                        value={editForm.dueDay}
                        onChange={e => setEditForm({ ...editForm, dueDay: e.target.value as '10' | '20' })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500 font-bold"
                      >
                        <option value="10">Todo dia 10</option>
                        <option value="20">Todo dia 20</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Endereço Residencial</label>
                      <input
                        type="text"
                        placeholder="Rua, número, bairro..."
                        value={editForm.address}
                        onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={savingEdit}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingEdit ? 'Salvando...' : 'Salvar Dados & Atualizar Limite'}</span>
                    </button>
                  </div>
                </form>
              ) : null}

              {/* CARD PRINCIPAL: VISÃO 360° E TERMÔMETRO DE LIMITE */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                
                {/* DADOS CADASTRAIS RESUMIDOS */}
                <div className="md:col-span-5 p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Identificação do Cliente</span>
                  
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="font-bold text-slate-400 w-20">CPF:</span>
                      <span className="font-mono text-white">{card.cpf || <span className="text-amber-400 font-semibold italic">Não cadastrado</span>}</span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="font-bold text-slate-400 w-20">WhatsApp:</span>
                      {card.phone ? (
                        <a
                          href={`https://wa.me/55${card.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:underline font-mono inline-flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3" /> {card.phone}
                        </a>
                      ) : (
                        <span className="text-slate-500 italic">Não informado</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="font-bold text-slate-400 w-20">Vencimento:</span>
                      <span className="font-extrabold text-white flex items-center gap-1 text-emerald-400">
                        <Calendar className="w-3 h-3" /> Todo dia {card.due_day}
                      </span>
                    </div>

                    {customer?.address && (
                      <div className="flex items-start gap-2 text-slate-300 pt-0.5">
                        <span className="font-bold text-slate-400 w-20 flex-shrink-0">Endereço:</span>
                        <span className="text-[11px] text-slate-400 leading-tight">
                          <MapPin className="w-3 h-3 inline mr-1 text-slate-500" />
                          {customer.address} {customer.neighborhood ? ` - ${customer.neighborhood}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* TERMÔMETRO DE CRÉDITO & DÍVIDA ATUAL */}
                <div className="md:col-span-7 p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Consumo de Limite</span>
                      <span className="text-xs font-black font-mono text-slate-300">{limitPercent}% utilizado</span>
                    </div>

                    {/* BARRA DE PROGRESSO */}
                    <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden p-0.5 border border-slate-700/50">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          limitPercent >= 90
                            ? 'bg-rose-500'
                            : limitPercent >= 70
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${limitPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* MINI CARDS DE VALORES */}
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Limite Total</span>
                      <span className="text-sm font-black text-white">{formatCurrency(card.credit_limit)}</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] font-bold text-rose-400 block uppercase">Saldo Devedor</span>
                      <span className="text-sm font-black text-rose-400">{formatCurrency(card.used_limit)}</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900 border border-emerald-500/20">
                      <span className="text-[10px] font-bold text-emerald-400 block uppercase">Disponível</span>
                      <span className="text-sm font-black text-emerald-400">{formatCurrency(card.available_credit)}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* NAVEGAÇÃO DE ABAS INTERNAS */}
              <div className="flex items-center justify-between border-b border-slate-800 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('extrato')}
                    className={`pb-2.5 px-3 text-xs font-black transition border-b-2 flex items-center gap-1.5 ${
                      activeTab === 'extrato'
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Extrato Cronológico ({transactions.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('faturas')}
                    className={`pb-2.5 px-3 text-xs font-black transition border-b-2 flex items-center gap-1.5 ${
                      activeTab === 'faturas'
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-slate-400 hover:text-white'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Faturas & Boletos ({invoices.length})</span>
                  </button>
                </div>

                {activeTab === 'extrato' && (
                  <div className="flex items-center gap-1.5 pb-2">
                    {/* FILTROS RÁPIDOS */}
                    <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px] font-bold">
                      <button
                        onClick={() => setFilterType('all')}
                        className={`px-2 py-1 rounded-md transition ${filterType === 'all' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                      >
                        Tudo
                      </button>
                      <button
                        onClick={() => setFilterType('purchases')}
                        className={`px-2 py-1 rounded-md transition flex items-center gap-1 ${filterType === 'purchases' ? 'bg-rose-950 text-rose-300 shadow' : 'text-slate-400 hover:text-white'}`}
                      >
                        <ArrowUpRight className="w-3 h-3 text-rose-400" /> Compras
                      </button>
                      <button
                        onClick={() => setFilterType('payments')}
                        className={`px-2 py-1 rounded-md transition flex items-center gap-1 ${filterType === 'payments' ? 'bg-emerald-950 text-emerald-300 shadow' : 'text-slate-400 hover:text-white'}`}
                      >
                        <ArrowDownRight className="w-3 h-3 text-emerald-400" /> Pagamentos
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* CONTEÚDO DA ABA 1: EXTRATO CRONOLÓGICO */}
              {activeTab === 'extrato' && (
                <div className="space-y-3">
                  {/* BUSCA RÁPIDA DENTRO DO EXTRATO */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filtrar lançamentos por descrição ou valor..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500"
                    />
                  </div>

                  {filteredTransactions.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-800/80">
                      Nenhuma transação encontrada com os filtros selecionados.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60 rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/40">
                      {filteredTransactions.map(tx => {
                        const isPurchase = tx.type === 'PURCHASE';
                        return (
                          <div
                            key={tx.id}
                            className="p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-slate-900/50 transition"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black ${
                                isPurchase
                                  ? 'bg-rose-950/80 text-rose-400 border border-rose-500/20'
                                  : 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/20'
                              }`}>
                                {isPurchase ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                              </div>

                              <div>
                                <div className="text-xs font-bold text-slate-200">
                                  {tx.description}
                                </div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                  <span>{formatDate(tx.date)}</span>
                                  {tx.payment_method && (
                                    <>
                                      <span>•</span>
                                      <span className="font-mono text-slate-500 uppercase">{tx.payment_method}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className={`text-sm font-black font-mono ${
                                isPurchase ? 'text-rose-400' : 'text-emerald-400'
                              }`}>
                                {isPurchase ? `+ ${formatCurrency(tx.amount)}` : `- ${formatCurrency(tx.amount)}`}
                              </span>
                              <span className="block text-[10px] text-slate-500 font-bold uppercase">
                                {isPurchase ? 'Débito na conta' : 'Baixa realizada'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* CONTEÚDO DA ABA 2: FATURAS E BOLETOS BANCO INTER */}
              {activeTab === 'faturas' && (
                <div className="space-y-3">
                  {invoices.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-800/80">
                      Nenhuma fatura registrada para este crediário.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {invoices.map(inv => {
                        const saldoPagar = Number((inv.total_due - inv.paid_amount).toFixed(2));
                        const isPaid = inv.status === 'paid' || saldoPagar <= 0;
                        const isActionLoading = actionLoadingId === inv.id;

                        return (
                          <div
                            key={inv.id}
                            className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-black text-white">Fatura {inv.reference_month}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                                  isPaid
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-amber-950 text-amber-300 border border-amber-500/30'
                                }`}>
                                  {isPaid ? 'Quitada' : `Vencimento: ${inv.due_date}`}
                                </span>
                                {inv.boleto_id && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                                    Banco Inter Integrado
                                  </span>
                                )}
                              </div>

                              <div className="text-xs text-slate-400">
                                Total da Fatura: <strong className="text-white font-mono">{formatCurrency(inv.total_due)}</strong>
                                {inv.paid_amount > 0 && (
                                  <span className="text-emerald-400 font-mono"> (Pago: {formatCurrency(inv.paid_amount)})</span>
                                )}
                                {!isPaid && (
                                  <span className="text-rose-400 font-black font-mono"> • Saldo: {formatCurrency(saldoPagar)}</span>
                                )}
                              </div>
                            </div>

                            {/* BOTÕES DE AÇÃO POR FATURA */}
                            <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
                              {inv.pix_copia_cola && !isPaid && (
                                <button
                                  onClick={() => handleCopyPix(inv.pix_copia_cola)}
                                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold transition flex items-center gap-1 shadow"
                                  title="Copiar Código Pix Copia e Cola"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copiar Pix</span>
                                </button>
                              )}

                              {inv.boleto_id && (
                                <button
                                  onClick={() => handleDownloadPdf(inv.id)}
                                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center gap-1 shadow"
                                  title="Baixar Boleto Oficial Banco Inter em PDF"
                                >
                                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>PDF</span>
                                </button>
                              )}

                              <button
                                onClick={() => handleSendWhatsApp(inv.id)}
                                disabled={isActionLoading}
                                className="px-2.5 py-1.5 rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition flex items-center gap-1 shadow disabled:opacity-50"
                                title="Enviar Fatura e Notificação por WhatsApp"
                              >
                                <Send className={`w-3.5 h-3.5 ${isActionLoading ? 'animate-spin' : ''}`} />
                                <span>WhatsApp</span>
                              </button>

                              {!isPaid && onOpenPayModal && (
                                <button
                                  onClick={() => onOpenPayModal(inv)}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition shadow"
                                >
                                  Receber no Caixa
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </>
          ) : null}

        </div>

        {/* RODAPÉ INFORMATIVO */}
        <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5 text-[11px]">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            Crediário 2.0 • Bloqueio automático com tolerância D+5 • Isenção de mensalidade
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
