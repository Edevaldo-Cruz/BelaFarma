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
  AlertTriangle
} from 'lucide-react';
import { useToast } from './ToastContext';

interface CardData {
  id: number;
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

interface DashboardMetrics {
  cards: {
    total: number;
    active: number;
    pending: number;
    total_credit_granted: number;
    total_credit_used: number;
  };
  billing: {
    overdue_count: number;
    overdue_amount: number;
    serasa_candidates_count: number;
    serasa_candidates: Array<{
      id: string;
      due_date: string;
      debt_amount: number;
      customer_name: string;
      phone: string;
      cpf: string;
      days_late: number;
    }>;
  };
}

export const CrediarioNfcWidget: React.FC = () => {
  const { addToast } = useToast();

  // Estados principais
  const [nfcInput, setNfcInput] = useState('');
  const [activeCard, setActiveCard] = useState<CardData | null>(null);
  const [unregisteredUid, setUnregisteredUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'caixa' | 'cobranca'>('caixa');

  // Modais
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isCashbackModalOpen, setIsCashbackModalOpen] = useState(false);

  // Formulário de Emissão Expressa
  const [issueName, setIssueName] = useState('');
  const [issuePhone, setIssuePhone] = useState('');
  const [issueCpf, setIssueCpf] = useState('');
  const [issueLimit, setIssueLimit] = useState('300');
  const [issueDueDay, setIssueDueDay] = useState<'10' | '20'>('10');
  const [issuingLoading, setIssuingLoading] = useState(false);

  // Busca Manual Fallback
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

  // Foco automático e atalhos de teclado (F2 para busca rápida)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setIsSearchModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const focusNfcInput = () => {
    if (nfcInputRef.current) {
      nfcInputRef.current.focus();
    }
  };

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // 1. Processar Leitura NFC
  const handleNfcSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUid = nfcInput.trim().toUpperCase();
    if (!cleanUid) return;

    setLoading(true);
    setActiveCard(null);
    setUnregisteredUid(null);

    try {
      const res = await fetch(`/api/cards/by-uid/${encodeURIComponent(cleanUid)}`);
      const data = await res.json();

      if (!res.ok) {
        addToast(data.error || 'Erro ao consultar leitor NFC.', 'error');
        return;
      }

      if (data.registered && data.card) {
        setActiveCard(data.card);
        setNfcInput('');
        addToast(`Cartão lido: ${data.card.customer_name}`, 'success');
      } else {
        setUnregisteredUid(data.card_uid);
        setNfcInput('');
        setIsIssueModalOpen(true);
        addToast('Chip/Cartão virgem detectado! Abrindo cadastro expresso...', 'info');
      }
    } catch (err: any) {
      addToast('Falha na comunicação com o leitor NFC.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 2. Busca Manual de Cliente
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (res.ok && data.cards) {
        setSearchResults(data.cards);
      }
    } catch (_) {}
  };

  const selectSearchedCard = async (cardUid?: string, phone?: string) => {
    setIsSearchModalOpen(false);
    if (cardUid) {
      setNfcInput(cardUid);
      setLoading(true);
      try {
        const res = await fetch(`/api/cards/by-uid/${encodeURIComponent(cardUid)}`);
        const data = await res.json();
        if (data.card) {
          setActiveCard(data.card);
          addToast(`Cliente selecionado: ${data.card.customer_name}`, 'success');
        }
      } catch (_) {}
      setLoading(false);
    }
  };

  // 3. Emissão Expressa de Cartão
  const handleIssueCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueName.trim() || !issuePhone.trim()) {
      addToast('Nome e WhatsApp são obrigatórios!', 'warning');
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
          dueDay: parseInt(issueDueDay) || 10
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        addToast('Cartão emitido com sucesso! Bônus de R$ 3,00 creditado.', 'success');
        setIsIssueModalOpen(false);
        setIssueName('');
        setIssuePhone('');
        setIssueCpf('');
        setUnregisteredUid(null);

        // Carrega o cartão recém-criado
        if (data.card && data.card.card_uid) {
          setActiveCard({
            ...data.card,
            available_credit: data.card.credit_limit,
            available_cashback: 3.00,
            is_blocked_late: false,
            days_late: 0
          });
        }
      } else {
        addToast(data.error || 'Erro ao emitir cartão.', 'error');
      }
    } catch (err: any) {
      addToast('Falha na emissão do cartão: ' + err.message, 'error');
    } finally {
      setIssuingLoading(false);
    }
  };

  // 4. Lançar Compra no Crediário Próprio
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
          description: saleDescription
        })
      });
      const data = await res.json();

      if (res.ok && data.authorized) {
        addToast(`Venda de ${formatCurrency(val)} aprovada no Cartão BelaFarma!`, 'success');
        setIsSaleModalOpen(false);
        setSaleAmount('');

        // Atualiza dados na tela
        setActiveCard(prev => prev ? ({
          ...prev,
          used_limit: data.usedLimit,
          available_credit: data.remainingLimit
        }) : null);
      } else {
        addToast(data.reason || 'Venda recusada pelo sistema.', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao autorizar venda: ' + err.message, 'error');
    } finally {
      setAuthorizingSale(false);
    }
  };

  // 5. Resgate de Cashback
  const handleRedeemCashback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCard) return;

    const val = parseFloat(cashbackToRedeem);
    if (!val || val <= 0) {
      addToast('Informe um valor de resgate válido!', 'warning');
      return;
    }

    setRedeemingCashback(true);
    try {
      const res = await fetch('/api/cards/redeem-cashback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: activeCard.phone,
          amount: val
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        addToast(`Sucesso! ${formatCurrency(val)} de desconto abatido no caixa.`, 'success');
        setIsCashbackModalOpen(false);
        setCashbackToRedeem('');

        setActiveCard(prev => prev ? ({
          ...prev,
          available_cashback: data.remainingCashback
        }) : null);
      } else {
        addToast(data.error || 'Erro ao resgatar cashback.', 'error');
      }
    } catch (err: any) {
      addToast('Erro no resgate de cashback.', 'error');
    } finally {
      setRedeemingCashback(false);
    }
  };

  // 6. Carregar Métricas do Dashboard de Cobrança
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
              <span className="font-extrabold text-sm tracking-tight text-white">Cartão BelaFarma</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Wifi className="w-3 h-3 animate-pulse" /> NFC Ativo
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Terminal de Crédito Próprio & Cashback</p>
          </div>
        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('caixa')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'caixa' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Terminal do Caixa
          </button>
          <button
            onClick={() => setActiveTab('cobranca')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeTab === 'cobranca' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Cobrança & Serasa
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
          
          {/* BARRA DE LEITURA NFC & BUSCA */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            <form onSubmit={handleNfcSubmit} className="md:col-span-8 relative">
              <input
                ref={nfcInputRef}
                type="text"
                value={nfcInput}
                onChange={e => setNfcInput(e.target.value)}
                placeholder="Aproxime o Cartão/Chaveiro NFC ou digite o UID..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono transition"
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute right-1.5 top-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                <span>Bipar</span>
              </button>
            </form>

            <button
              onClick={() => setIsSearchModalOpen(true)}
              className="md:col-span-4 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-2 transition"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Buscar Celular / CPF <span className="text-[10px] text-slate-500 font-mono">(F2)</span></span>
            </button>
          </div>

          {/* ESTADO 1: NENHUM CARTÃO SELECIONADO */}
          {!activeCard && (
            <div className="p-6 rounded-2xl bg-slate-950/50 border border-slate-800/80 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                <Wifi className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-200">Aguardando Leitura por Aproximação</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Encoste o cartão ou chaveiro NFC no leitor USB. O sistema identifica o cliente, checa limite e faturas em atraso em menos de 1 segundo.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => { setUnregisteredUid(null); setIsIssueModalOpen(true); }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 text-xs font-bold transition"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Cadastrar Novo Cartão Manualmente</span>
                </button>
              </div>
            </div>
          )}

          {/* ESTADO 2: CARTÃO ATIVO & IDENTIFICADO */}
          {activeCard && (
            <div className={`p-4 rounded-2xl border transition space-y-4 ${
              activeCard.is_blocked_late
                ? 'bg-rose-950/30 border-rose-500/40'
                : activeCard.status === 'pending_signature'
                ? 'bg-amber-950/30 border-amber-500/40'
                : 'bg-slate-950/80 border-emerald-500/30'
            }`}>
              
              {/* STATUS HEADER */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shadow ${
                    activeCard.is_blocked_late
                      ? 'bg-rose-600 text-white'
                      : activeCard.status === 'pending_signature'
                      ? 'bg-amber-600 text-white'
                      : 'bg-emerald-600 text-white'
                  }`}>
                    {activeCard.is_blocked_late ? <XCircle className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-white">{activeCard.customer_name}</h3>
                    <div className="inline-flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                      <span>{activeCard.phone}</span>
                      <span>•</span>
                      <span>{activeCard.card_number}</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-sans font-bold">Vence Dia {activeCard.due_day}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    activeCard.is_blocked_late
                      ? 'bg-rose-900 text-rose-200 border border-rose-500'
                      : activeCard.status === 'pending_signature'
                      ? 'bg-amber-900 text-amber-200 border border-amber-500'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {activeCard.is_blocked_late
                      ? 'Bloqueado por Atraso'
                      : activeCard.status === 'pending_signature'
                      ? 'Aguardando Assinatura'
                      : 'Ativo & Liberado'}
                  </span>
                  <button
                    onClick={() => setActiveCard(null)}
                    className="block text-[10px] text-slate-400 hover:text-white underline mt-1 ml-auto"
                  >
                    Trocar Cliente
                  </button>
                </div>
              </div>

              {/* AVISO SE ESTIVER BLOQUEADO POR ATRASO */}
              {activeCard.is_blocked_late && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
                  <div className="flex-1">
                    <strong>Vendas Bloqueadas:</strong> Fatura de {activeCard.overdue_invoice?.reference_month} vencida há {activeCard.days_late} dias!
                    Saldo pendente: <strong>{formatCurrency((activeCard.overdue_invoice?.total_due || 0) - (activeCard.overdue_invoice?.paid_amount || 0))}</strong>.
                  </div>
                </div>
              )}

              {/* CARDS DE SALDO E CRÉDITO */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                {/* LIMITE DISPONÍVEL */}
                <div className="p-3 rounded-xl bg-slate-900/90 border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Limite Disponível</span>
                  <div className="text-lg font-black text-emerald-400">
                    {formatCurrency(activeCard.available_credit)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Total: {formatCurrency(activeCard.credit_limit)} | Usado: {formatCurrency(activeCard.used_limit)}
                  </div>
                </div>

                {/* CASHBACK DISPONÍVEL */}
                <div className="p-3 rounded-xl bg-slate-900/90 border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Saldo de Cashback</span>
                  <div className="text-lg font-black text-cyan-400 flex items-center justify-between">
                    <span>{formatCurrency(activeCard.available_cashback)}</span>
                    <Gift className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Válido por 30 dias após compra
                  </div>
                </div>

                {/* AÇÕES RÁPIDAS NO CAIXA */}
                <div className="flex flex-col gap-2 justify-center">
                  <button
                    disabled={activeCard.is_blocked_late || activeCard.status !== 'active' || activeCard.available_credit <= 0}
                    onClick={() => setIsSaleModalOpen(true)}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow transition flex items-center justify-center gap-1.5"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Lançar no Cartão</span>
                  </button>

                  <button
                    disabled={activeCard.available_cashback <= 0}
                    onClick={() => { setCashbackToRedeem(String(activeCard.available_cashback)); setIsCashbackModalOpen(true); }}
                    className="w-full py-2 px-3 rounded-xl bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow transition flex items-center justify-center gap-1.5"
                  >
                    <Gift className="w-3.5 h-3.5" />
                    <span>Resgatar Cashback</span>
                  </button>
                </div>

              </div>

            </div>
          )}

        </div>
      )}

      {/* ABA 2: COBRANÇA, INADIMPLÊNCIA & SERASA */}
      {activeTab === 'cobranca' && (
        <div className="p-4 space-y-4">
          
          {/* CARDS DE RESUMO DA CARTEIRA */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Cartões Ativos</div>
              <div className="text-base font-black text-white mt-0.5">{metrics?.cards?.active || 0} clientes</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Limite Concedido</div>
              <div className="text-base font-black text-emerald-400 mt-0.5">{formatCurrency(metrics?.cards?.total_credit_granted || 0)}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Crédito em Aberto</div>
              <div className="text-base font-black text-cyan-400 mt-0.5">{formatCurrency(metrics?.cards?.total_credit_used || 0)}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-rose-500/30 bg-rose-950/20">
              <div className="text-[10px] text-rose-300 uppercase">Faturas em Atraso</div>
              <div className="text-base font-black text-rose-400 mt-0.5">{formatCurrency(metrics?.billing?.overdue_amount || 0)}</div>
            </div>
          </div>

          {/* TABELA DE CANDIDATOS À NEGATIVAÇÃO NO SERASA (30+ DIAS) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Inadimplentes 30+ Dias (Aptos para Negativação no Serasa / SPC):</span>
              </h4>
              <button
                onClick={loadMetrics}
                disabled={loadingMetrics}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loadingMetrics ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-3 py-2 font-bold whitespace-nowrap">Cliente</th>
                    <th className="px-3 py-2 font-bold whitespace-nowrap">WhatsApp</th>
                    <th className="px-3 py-2 font-bold whitespace-nowrap">CPF</th>
                    <th className="px-3 py-2 font-bold whitespace-nowrap text-right">Dívida Total</th>
                    <th className="px-3 py-2 font-bold whitespace-nowrap text-right">Atraso</th>
                    <th className="px-3 py-2 font-bold whitespace-nowrap text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                  {metrics?.billing?.serasa_candidates?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        Nenhum cliente em atraso superior a 30 dias. Carteira saudável! 🎉
                      </td>
                    </tr>
                  ) : (
                    metrics?.billing?.serasa_candidates?.map(c => (
                      <tr key={c.id} className="hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-bold text-white whitespace-nowrap">{c.customer_name}</td>
                        <td className="px-3 py-2 text-slate-300 font-mono whitespace-nowrap">{c.phone}</td>
                        <td className="px-3 py-2 text-slate-400 font-mono whitespace-nowrap">{c.cpf || 'Não informado'}</td>
                        <td className="px-3 py-2 font-mono font-bold text-rose-400 text-right whitespace-nowrap">
                          {formatCurrency(c.debt_amount)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-mono text-amber-400">
                          {c.days_late} dias
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <button
                            onClick={() => addToast(`Solicitação de Negativação Serasa para ${c.customer_name} enviada para a esteira bancária!`, 'info')}
                            className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] transition"
                          >
                            Negativar Serasa
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

      {/* MODAL 1: EMISSÃO EXPRESSA DE CARTÃO */}
      {isIssueModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-fade-in text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-sm text-white">Cadastro Expresso - Cartão BelaFarma</h3>
              </div>
              <button onClick={() => setIsIssueModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {unregisteredUid && (
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <Wifi className="w-4 h-4 flex-shrink-0" />
                <span>Chip NFC Detectado: <strong className="font-mono">{unregisteredUid}</strong></span>
              </div>
            )}

            <form onSubmit={handleIssueCard} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Nome Completo do Cliente:</label>
                <input
                  type="text"
                  required
                  value={issueName}
                  onChange={e => setIssueName(e.target.value)}
                  placeholder="Ex: Maria Aparecida da Silva"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">WhatsApp (com DDD):</label>
                  <input
                    type="text"
                    required
                    value={issuePhone}
                    onChange={e => setIssuePhone(e.target.value)}
                    placeholder="32999998888"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">CPF (Opcional no caixa):</label>
                  <input
                    type="text"
                    value={issueCpf}
                    onChange={e => setIssueCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Limite Aprovado (R$):</label>
                  <input
                    type="number"
                    step="50"
                    value={issueLimit}
                    onChange={e => setIssueLimit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Dia do Vencimento:</label>
                  <select
                    value={issueDueDay}
                    onChange={e => setIssueDueDay(e.target.value as '10' | '20')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="10">Todo Dia 10 (Salário)</option>
                    <option value="20">Todo Dia 20 (Vale)</option>
                  </select>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div>🎁 <strong>Bônus de Boas-Vindas:</strong> R$ 3,00 de crédito liberado imediatamente.</div>
                <div>📲 <strong>Termo Digital:</strong> O link será enviado para o WhatsApp do cliente para aceite jurídico.</div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsIssueModalOpen(false)}
                  className="w-1/3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={issuingLoading}
                  className="w-2/3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center justify-center gap-1.5"
                >
                  {issuingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  <span>Emitir Cartão 🚀</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: BUSCA MANUAL FALLBACK (F2) */}
      {isSearchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl animate-fade-in text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-sm text-white">Buscar Cartão por Nome, Celular ou CPF</h3>
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
                placeholder="Digite o nome, celular ou CPF..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-800 rounded-xl border border-slate-800">
              {searchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  {searchQuery ? 'Nenhum cliente localizado.' : 'Digite para iniciar a busca...'}
                </div>
              ) : (
                searchResults.map(c => (
                  <div
                    key={c.id}
                    onClick={() => selectSearchedCard(c.card_uid, c.phone)}
                    className="p-3 hover:bg-slate-800/60 cursor-pointer flex items-center justify-between transition"
                  >
                    <div>
                      <div className="font-bold text-xs text-white">{c.customer_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{c.phone} • Vence Dia {c.due_day}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-emerald-400">
                        {formatCurrency(c.credit_limit - c.used_limit)} disp.
                      </div>
                      <div className="text-[10px] text-slate-500">Total: {formatCurrency(c.credit_limit)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: LANÇAMENTO DE COMPRA NO CARTÃO */}
      {isSaleModalOpen && activeCard && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-fade-in text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-extrabold text-sm text-white">Lançar Compra no Cartão BelaFarma</h3>
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
                  className="w-2/3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center justify-center gap-1.5"
                >
                  {authorizingSale ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  <span>Confirmar Venda</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: RESGATE DE CASHBACK */}
      {isCashbackModalOpen && activeCard && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-fade-in text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-extrabold text-sm text-white">Resgatar Saldo de Cashback</h3>
              <button onClick={() => setIsCashbackModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div>Cliente: <strong className="text-white">{activeCard.customer_name}</strong></div>
              <div>Saldo Acumulado: <strong className="text-cyan-400">{formatCurrency(activeCard.available_cashback)}</strong></div>
            </div>

            <form onSubmit={handleRedeemCashback} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Valor do Desconto a Abater no Caixa (R$):</label>
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  required
                  value={cashbackToRedeem}
                  onChange={e => setCashbackToRedeem(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-lg font-black text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <p className="text-[11px] text-slate-400 leading-tight">
                💡 Após confirmar o resgate aqui, lance esse valor como <strong>Desconto</strong> no fechamento da venda no PDV do Digifarma.
              </p>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCashbackModalOpen(false)}
                  className="w-1/3 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={redeemingCashback}
                  className="w-2/3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition flex items-center justify-center gap-1.5"
                >
                  {redeemingCashback ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />}
                  <span>Abater Cashback</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
