import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Search, 
  Calendar, 
  Clock, 
  User, 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  Eye, 
  DollarSign, 
  TrendingUp, 
  RefreshCw,
  X,
  CreditCard,
  Banknote,
  QrCode,
  BookOpen,
  ShieldCheck,
  Printer,
  ChevronRight,
  Filter
} from 'lucide-react';
import { useToast } from '../ToastContext';
import { DanfeNfceModal } from './DanfeNfceModal';

interface SalePayment {
  method: string;
  amount: number;
  card_brand?: string;
}

interface SaleSummary {
  id: string;
  sale_date: string;
  sale_time: string;
  total_items_value: number;
  discount_value: number;
  total_value: number;
  customer_name: string | null;
  user_name: string;
  status: 'CONCLUIDA' | 'CANCELADA';
  total_items: number;
  payment_methods: string;
  payments?: SalePayment[];
  cancellation_reason?: string;
  fiscal_status?: string;
  nfe_number?: number;
  nfe_series?: number;
  access_key?: string;
}

interface ResumoDia {
  data: string;
  total_cupons: number;
  total_faturado: number;
  total_descontos: number;
  pagamentos: {
    DINHEIRO: number;
    CARTAO_DEBITO: number;
    CARTAO_CREDITO: number;
    PIX: number;
    CREDIARIO: number;
    OUTROS: number;
  };
  cancelamentos: {
    total: number;
    valor: number;
  };
}

export const SalesHistory: React.FC = () => {
  const { addToast } = useToast();
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [resumoDia, setResumoDia] = useState<ResumoDia | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Filtros
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'CONCLUIDA' | 'CANCELADA'>('TODOS');
  const [paymentFilter, setPaymentFilter] = useState<string>('TODOS');

  // Detalhes da Venda
  const [activeSaleDetail, setActiveSaleDetail] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Fiscal
  const [activeDanfeModal, setActiveDanfeModal] = useState<any | null>(null);
  const [isEmittingFiscal, setIsEmittingFiscal] = useState<string | null>(null);

  // Modal de Cancelamento
  const [saleToCancel, setSaleToCancel] = useState<SaleSummary | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Datas de atalho
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };
  const getBeforeYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d.toISOString().split('T')[0];
  };

  // Carregar Vendas e Resumo do Dia
  const fetchSales = async () => {
    setIsLoading(true);
    try {
      const statusParam = statusFilter !== 'TODOS' ? `&status=${statusFilter}` : '';
      const paymentParam = paymentFilter !== 'TODOS' ? `&paymentMethod=${encodeURIComponent(paymentFilter)}` : '';
      const res = await fetch(`/api/erp/sales?dataInicio=${selectedDate}&dataFim=${selectedDate}${statusParam}${paymentParam}&limit=200`);
      if (res.ok) {
        const json = await res.json();
        setSales(json.data || []);
        if (json.resumo) {
          setResumoDia(json.resumo);
        }
      }
    } catch (e) {
      addToast('Erro ao carregar vendas do dia.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [selectedDate, statusFilter, paymentFilter]);

  // Carregar Detalhes de uma Venda
  const handleOpenDetail = async (saleId: string) => {
    setIsLoadingDetail(true);
    try {
      const res = await fetch(`/api/erp/sales/${encodeURIComponent(saleId)}`);
      if (res.ok) {
        const json = await res.json();
        setActiveSaleDetail(json.data);
      }
    } catch (e) {
      addToast('Erro ao obter detalhes da venda.', 'error');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Confirmar Cancelamento
  const handleConfirmCancel = async () => {
    if (!saleToCancel) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/erp/pos/cancel/${encodeURIComponent(saleToCancel.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason || 'Cancelamento no caixa' })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`Venda #${saleToCancel.id} cancelada e estoque estornado!`, 'success');
        setSaleToCancel(null);
        setCancelReason('');
        fetchSales();
      } else {
        addToast(json.error || 'Erro ao cancelar venda.', 'error');
      }
    } catch (e) {
      addToast('Erro de comunicação ao cancelar venda.', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Abrir DANFE NFC-e com QR Code
  const handleImprimirDanfe = async (saleId: string) => {
    try {
      const res = await fetch(`/api/erp/fiscal/danfe/${encodeURIComponent(saleId)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setActiveDanfeModal(data);
      } else {
        addToast(data.error || 'Não foi possível carregar o cupom fiscal.', 'error');
      }
    } catch (err) {
      addToast('Erro ao carregar DANFE NFC-e.', 'error');
    }
  };

  // Emitir Cupom Fiscal para venda que não foi emitida
  const handleEmitirNfce = async (saleId: string) => {
    setIsEmittingFiscal(saleId);
    try {
      const res = await fetch(`/api/erp/fiscal/emit/${encodeURIComponent(saleId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`NFC-e #${data.nfe_number} emitida com sucesso!`, 'success');
        setActiveDanfeModal(data);
        fetchSales();
      } else {
        addToast(data.error || 'Erro ao emitir NFC-e.', 'error');
      }
    } catch (err) {
      addToast('Erro ao comunicar com o emissor fiscal.', 'error');
    } finally {
      setIsEmittingFiscal(null);
    }
  };

  // Filtragem textual local
  const filteredSales = sales.filter(s => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      s.id.toLowerCase().includes(q) ||
      (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
      (s.user_name && s.user_name.toLowerCase().includes(q)) ||
      (s.payment_methods && s.payment_methods.toLowerCase().includes(q))
    );
  });

  // Métricas da lista filtrada
  const totalFaturadoLista = filteredSales
    .filter(s => s.status === 'CONCLUIDA')
    .reduce((acc, s) => acc + s.total_value, 0);

  const totalCanceladoLista = filteredSales
    .filter(s => s.status === 'CANCELADA')
    .reduce((acc, s) => acc + s.total_value, 0);

  const concluidasCountLista = filteredSales.filter(s => s.status === 'CONCLUIDA').length;
  const ticketMedioLista = concluidasCountLista > 0 ? totalFaturadoLista / concluidasCountLista : 0;

  // Renderizar badge visual de cada forma de pagamento
  const renderPaymentBadge = (method: string) => {
    const m = (method || '').toUpperCase();
    if (m === 'DINHEIRO') {
      return (
        <span key={method} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
          <Banknote className="w-3 h-3" /> Dinheiro
        </span>
      );
    }
    if (m === 'PIX') {
      return (
        <span key={method} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/25">
          <QrCode className="w-3 h-3" /> PIX
        </span>
      );
    }
    if (m === 'CARTAO_DEBITO' || m.includes('DEBITO') || m.includes('DÉBITO')) {
      return (
        <span key={method} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25">
          <CreditCard className="w-3 h-3" /> Débito
        </span>
      );
    }
    if (m === 'CARTAO_CREDITO' || m.includes('CREDITO') || m.includes('CRÉDITO')) {
      return (
        <span key={method} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25">
          <CreditCard className="w-3 h-3" /> Crédito
        </span>
      );
    }
    if (m === 'CREDIARIO' || m === 'CREDIÁRIO' || m.includes('CONVENIO') || m.includes('CONVÊNIO')) {
      return (
        <span key={method} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
          <BookOpen className="w-3 h-3" /> Crediário
        </span>
      );
    }
    return (
      <span key={method} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/25">
        {method}
      </span>
    );
  };

  // Totais do dia pelo resumo
  const pTotais = resumoDia?.pagamentos || {
    DINHEIRO: 0,
    PIX: 0,
    CARTAO_DEBITO: 0,
    CARTAO_CREDITO: 0,
    CREDIARIO: 0,
    OUTROS: 0
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-3 sm:p-5 overflow-y-auto">
      {/* 1. CABEÇALHO COM TÍTULO, SELETOR DE DIA E ATALHOS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Receipt className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                Vendas do Dia & Conferência de Caixa
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Listagem de todas as vendas emitidas no PDV com detalhamento e filtro por todas as formas de pagamento.
            </p>
          </div>

          {/* Atalhos de Data e Seletor */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setSelectedDate(getTodayStr())}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  selectedDate === getTodayStr()
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(getYesterdayStr())}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  selectedDate === getYesterdayStr()
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Ontem
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(getBeforeYesterdayStr())}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  selectedDate === getBeforeYesterdayStr()
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Anteontem
              </button>
            </div>

            {/* Input de Data */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold">
              <Calendar className="w-4 h-4 text-emerald-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-100 font-mono focus:outline-none cursor-pointer"
              />
            </div>

            {/* Botão Atualizar */}
            <button
              onClick={fetchSales}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all border border-slate-200 dark:border-slate-700"
              title="Atualizar vendas"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-500' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. PÍLULAS INTERATIVAS POR TODAS AS FORMAS DE PAGAMENTO DO DIA */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-4">
        {/* Todas as Formas */}
        <button
          type="button"
          onClick={() => setPaymentFilter('TODOS')}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
            paymentFilter === 'TODOS'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-md'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-75">Todas as Formas</span>
            <Filter className="w-3.5 h-3.5" />
          </div>
          <p className="text-base sm:text-lg font-black font-mono">
            R$ {(resumoDia?.total_faturado || totalFaturadoLista).toFixed(2)}
          </p>
          <p className="text-[10px] opacity-70 mt-0.5">
            {resumoDia?.total_cupons || concluidasCountLista} cupons
          </p>
        </button>

        {/* Dinheiro */}
        <button
          type="button"
          onClick={() => setPaymentFilter(paymentFilter === 'DINHEIRO' ? 'TODOS' : 'DINHEIRO')}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
            paymentFilter === 'DINHEIRO'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
              <Banknote className="w-3 h-3 text-emerald-500" /> Dinheiro
            </span>
            {paymentFilter === 'DINHEIRO' && <CheckCircle2 className="w-3 h-3" />}
          </div>
          <p className="text-base sm:text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">
            R$ {pTotais.DINHEIRO.toFixed(2)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Espécie no caixa</p>
        </button>

        {/* PIX */}
        <button
          type="button"
          onClick={() => setPaymentFilter(paymentFilter === 'PIX' ? 'TODOS' : 'PIX')}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
            paymentFilter === 'PIX'
              ? 'bg-teal-600 text-white border-teal-600 shadow-md ring-2 ring-teal-500/30'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-teal-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
              <QrCode className="w-3 h-3 text-teal-500" /> PIX
            </span>
            {paymentFilter === 'PIX' && <CheckCircle2 className="w-3 h-3" />}
          </div>
          <p className="text-base sm:text-lg font-black font-mono text-teal-600 dark:text-teal-400">
            R$ {pTotais.PIX.toFixed(2)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Instantâneo</p>
        </button>

        {/* Débito */}
        <button
          type="button"
          onClick={() => setPaymentFilter(paymentFilter === 'CARTAO_DEBITO' ? 'TODOS' : 'CARTAO_DEBITO')}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
            paymentFilter === 'CARTAO_DEBITO'
              ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-blue-500" /> C. Débito
            </span>
            {paymentFilter === 'CARTAO_DEBITO' && <CheckCircle2 className="w-3 h-3" />}
          </div>
          <p className="text-base sm:text-lg font-black font-mono text-blue-600 dark:text-blue-400">
            R$ {pTotais.CARTAO_DEBITO.toFixed(2)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Maquininha</p>
        </button>

        {/* Crédito */}
        <button
          type="button"
          onClick={() => setPaymentFilter(paymentFilter === 'CARTAO_CREDITO' ? 'TODOS' : 'CARTAO_CREDITO')}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
            paymentFilter === 'CARTAO_CREDITO'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500/30'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-indigo-500" /> C. Crédito
            </span>
            {paymentFilter === 'CARTAO_CREDITO' && <CheckCircle2 className="w-3 h-3" />}
          </div>
          <p className="text-base sm:text-lg font-black font-mono text-indigo-600 dark:text-indigo-400">
            R$ {pTotais.CARTAO_CREDITO.toFixed(2)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">À vista / Parcelado</p>
        </button>

        {/* Crediário */}
        <button
          type="button"
          onClick={() => setPaymentFilter(paymentFilter === 'CREDIARIO' ? 'TODOS' : 'CREDIARIO')}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
            paymentFilter === 'CREDIARIO'
              ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500/30'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
              <BookOpen className="w-3 h-3 text-amber-500" /> Crediário
            </span>
            {paymentFilter === 'CREDIARIO' && <CheckCircle2 className="w-3 h-3" />}
          </div>
          <p className="text-base sm:text-lg font-black font-mono text-amber-600 dark:text-amber-400">
            R$ {pTotais.CREDIARIO.toFixed(2)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Convênio cliente</p>
        </button>

        {/* Cancelados */}
        <div className="p-3 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Estornos
            </span>
          </div>
          <p className="text-base sm:text-lg font-black font-mono text-rose-600 dark:text-rose-400">
            R$ {(resumoDia?.cancelamentos.valor || totalCanceladoLista).toFixed(2)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {resumoDia?.cancelamentos.total || 0} cancelamentos
          </p>
        </div>
      </div>

      {/* 3. BARRA DE FILTROS ADICIONAIS & BUSCA */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm mb-4">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Campo de Busca */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Buscar por número do cupom, cliente, operador ou forma..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold focus:outline-none focus:border-emerald-500"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filtro Dropdown Formas de Pagamento */}
          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="TODOS">Todas as Formas de Pagto</option>
            <option value="DINHEIRO">💵 Apenas Dinheiro</option>
            <option value="PIX">⚡ Apenas PIX</option>
            <option value="CARTAO_DEBITO">💳 Apenas Cartão de Débito</option>
            <option value="CARTAO_CREDITO">💳 Apenas Cartão de Crédito</option>
            <option value="CREDIARIO">📑 Apenas Crediário / Convênio</option>
          </select>

          {/* Filtro Status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="TODOS">Todos os Status</option>
            <option value="CONCLUIDA">Apenas Concluídas</option>
            <option value="CANCELADA">Apenas Canceladas</option>
          </select>
        </div>

        {/* Resumo Rápido da Busca Atual */}
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-3">
          <span>Mostrando <strong className="text-slate-900 dark:text-white">{filteredSales.length}</strong> vendas</span>
          <span>Total: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">R$ {totalFaturadoLista.toFixed(2)}</strong></span>
        </div>
      </div>

      {/* 4. TABELA DE VENDAS (ALTA DENSIDADE) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-2.5 px-4 whitespace-nowrap">Cupom #</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Horário</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Cliente</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Operador</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-center">Itens</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Formas de Pagamento</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Valor Total</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Cupom Fiscal</th>
                <th className="py-2.5 px-4 text-center whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                    Carregando vendas do dia...
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhuma venda encontrada para esta data com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredSales.map(s => {
                  const isConcluida = s.status === 'CONCLUIDA';

                  // Lista de formas de pagamento
                  const methodsList = s.payments && s.payments.length > 0 
                    ? s.payments.map(p => p.method)
                    : (s.payment_methods ? s.payment_methods.split(',').map(m => m.trim()) : []);

                  return (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      {/* Cupom ID */}
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {s.id}
                      </td>

                      {/* Horário */}
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {s.sale_time}
                        </span>
                      </td>

                      {/* Cliente */}
                      <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap max-w-[200px] truncate" title={s.customer_name || 'Consumidor Final'}>
                        {s.customer_name || 'Balcão / Consumidor'}
                      </td>

                      {/* Operador */}
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap max-w-[120px] truncate" title={s.user_name}>
                        {s.user_name}
                      </td>

                      {/* Itens */}
                      <td className="py-2.5 px-3 text-center font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {s.total_items} un
                      </td>

                      {/* Formas de Pagamento com Badges */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-1">
                          {methodsList.length > 0 ? (
                            methodsList.map((m, idx) => (
                              <React.Fragment key={idx}>
                                {renderPaymentBadge(m)}
                              </React.Fragment>
                            ))
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">-</span>
                          )}
                        </div>
                      </td>

                      {/* Total */}
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap">
                        R$ {s.total_value.toFixed(2)}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          isConcluida 
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                        }`}>
                          {isConcluida ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {s.status}
                        </span>
                      </td>

                      {/* Cupom Fiscal */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {s.fiscal_status === 'EMITIDO' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                            <ShieldCheck className="w-3 h-3" />
                            NFC-e #{s.nfe_number}
                          </span>
                        ) : s.fiscal_status === 'CONTINGENCIA' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <ShieldCheck className="w-3 h-3" />
                            Contingência #{s.nfe_number}
                          </span>
                        ) : s.fiscal_status === 'CANCELADO' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            Cancelada
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">
                            Não Emitido
                          </span>
                        )}
                      </td>

                      {/* Ações Enxutas por Ícones com Tooltips */}
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(s.id)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                            title="Ver Detalhes do Cupom"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {(s.fiscal_status === 'EMITIDO' || s.fiscal_status === 'CONTINGENCIA') && (
                            <button
                              type="button"
                              onClick={() => handleImprimirDanfe(s.id)}
                              className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400 transition-colors"
                              title="Imprimir Cupom DANFE NFC-e"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isConcluida && (!s.fiscal_status || s.fiscal_status === 'NAO_EMITIDO') && (
                            <button
                              type="button"
                              onClick={() => handleEmitirNfce(s.id)}
                              disabled={isEmittingFiscal === s.id}
                              className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400 transition-colors"
                              title="Emitir Cupom Fiscal (NFC-e Oficial SEFAZ)"
                            >
                              {isEmittingFiscal === s.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          {isConcluida && (
                            <button
                              type="button"
                              onClick={() => setSaleToCancel(s)}
                              className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 transition-colors"
                              title="Cancelar Venda e Estornar Estoque"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
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

      {/* 5. MODAL: DETALHES COMPLETOS DA VENDA */}
      {activeSaleDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-500" />
                  Cupom #{activeSaleDetail.id}
                </h3>
                <p className="text-xs text-slate-400">
                  {activeSaleDetail.sale_date} às {activeSaleDetail.sale_time} • Operador: {activeSaleDetail.user_name}
                </p>
              </div>
              <button 
                onClick={() => setActiveSaleDetail(null)} 
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista de Itens */}
            <div className="mb-4">
              <p className="font-black text-slate-500 uppercase text-[10px] mb-1.5">Itens Vendidos:</p>
              <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {activeSaleDetail.items?.map((it: any, i: number) => (
                  <div key={i} className="p-2.5 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{it.product_name}</p>
                      <p className="font-mono text-[10px] text-slate-400">EAN: {it.barcode || 'S/N'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-slate-500">{it.quantity}x R$ {it.unit_price.toFixed(2)}</p>
                      <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">R$ {it.total_price.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pagamentos */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 mb-4 text-xs space-y-2">
              <p className="font-black text-slate-500 uppercase text-[10px]">Formas de Pagamento Utilizadas:</p>
              {activeSaleDetail.payments?.map((p: any, i: number) => (
                <div key={i} className="flex justify-between items-center font-mono">
                  <div className="flex items-center gap-1.5">
                    {renderPaymentBadge(p.payment_method)}
                    {p.card_brand && <span className="text-[10px] text-slate-400">({p.card_brand})</span>}
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white">R$ {p.amount.toFixed(2)}</span>
                </div>
              ))}

              <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between text-sm font-black">
                <span>Total Pago:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">R$ {activeSaleDetail.total_value.toFixed(2)}</span>
              </div>
            </div>

            {/* Ações da Modal de Detalhes */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveSaleDetail(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
              >
                Fechar
              </button>
              {(activeSaleDetail.fiscal_status === 'EMITIDO' || activeSaleDetail.fiscal_status === 'CONTINGENCIA') && (
                <button
                  type="button"
                  onClick={() => {
                    handleImprimirDanfe(activeSaleDetail.id);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-900/30 flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir Cupom
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: CANCELAMENTO DE VENDA */}
      {saleToCancel && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="p-3 bg-rose-500/10 rounded-2xl">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">Cancelar Venda #{saleToCancel.id}?</h3>
                <p className="text-xs text-slate-400">Esta ação devolverá todos os itens ao estoque.</p>
              </div>
            </div>

            <div className="my-4 space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Motivo do Cancelamento:
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Ex: Desistência do cliente, erro de operador, troca..."
                rows={3}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSaleToCancel(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleConfirmCancel}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                {isCancelling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL DANFE NFC-e COM QR CODE */}
      {activeDanfeModal && (
        <DanfeNfceModal
          isOpen={Boolean(activeDanfeModal)}
          danfeData={activeDanfeModal}
          onClose={() => setActiveDanfeModal(null)}
        />
      )}
    </div>
  );
};
