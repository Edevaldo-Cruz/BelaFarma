import React, { useState, useEffect } from 'react';
import {
  Truck,
  DollarSign,
  Package,
  CheckCircle,
  Clock,
  Sparkles,
  RefreshCw,
  Edit2,
  Phone,
  MessageSquare,
  TrendingUp,
  Users,
  XCircle,
  Calendar,
  Inbox,
  MapPin,
  Award,
  Search,
  ShoppingBag,
  Filter,
  ArrowUpRight,
  BarChart3,
  UserCheck,
  UserPlus,
  Building2,
  AlertCircle,
  Check,
  X
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid
} from 'recharts';
import { useToast } from './ToastContext';
import { Delivery, DeliveryMetrics, DeliveryAnalyticsData } from '../types';

interface DeliveryWidgetProps {
  onOpenChat?: (phone: string) => void;
  onSelectPendingReview?: (delivery: Delivery, mode?: 'pedido' | 'cotacao') => void;
  reviewedDeliveryId?: string | null;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export const DeliveryWidget: React.FC<DeliveryWidgetProps> = ({ onOpenChat, onSelectPendingReview, reviewedDeliveryId }) => {
  const { addToast } = useToast();

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [pendingReviews, setPendingReviews] = useState<Delivery[]>([]);
  const [loadingPending, setLoadingPending] = useState<boolean>(false);
  const [syncingRetroactive, setSyncingRetroactive] = useState<boolean>(false);
  const [analyzingChatId, setAnalyzingChatId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'deliveries_list' | 'intelligence' | 'pending_reviews'>('deliveries_list');
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterClosed, setFilterClosed] = useState<'all' | 'closed' | 'unclosed'>('all');

  const [rejectionMetrics, setRejectionMetrics] = useState<{
    total_rejections: number;
    by_reason: Record<string, number>;
    top_products: Array<{ product_name: string; count: number; main_reason: string }>;
  }>({
    total_rejections: 0,
    by_reason: {},
    top_products: []
  });

  const [analyticsData, setAnalyticsData] = useState<DeliveryAnalyticsData | null>(null);

  const [metrics, setMetrics] = useState<DeliveryMetrics>({
    totalContacts: 0,
    closedSalesCount: 0,
    closedSalesAmount: 0,
    unclosedSalesCount: 0,
    unclosedSalesAmount: 0,
    conversionRate: 0,
    averageTicket: 0,
    byPaymentMethod: {},
    byStatus: { Pendente: 0, 'Em Rota': 0, Entregue: 0, Nao_Fechado: 0, Cancelado: 0 },
    byUnclosedReason: {}
  });

  const [inTransitDeliveries, setInTransitDeliveries] = useState<Delivery[]>([]);
  const [loadingInTransit, setLoadingInTransit] = useState<boolean>(false);
  const [editingTransitData, setEditingTransitData] = useState<Record<string, { customer_name?: string; delivery_address?: string; neighborhood?: string }>>({});
  const [undeliveredModalDelivery, setUndeliveredModalDelivery] = useState<Delivery | null>(null);
  const [undeliveredAction, setUndeliveredAction] = useState<'reagendar' | 'cancelar'>('reagendar');
  const [undeliveredReason, setUndeliveredReason] = useState<string>('Cliente ausente / ninguém atendeu');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [period, setPeriod] = useState<'today' | '7days' | '30days' | 'month' | 'prev_month' | 'all' | string>('today');

  const fetchInTransitDeliveries = async () => {
    setLoadingInTransit(true);
    try {
      const res = await fetch('/api/deliveries/in-transit');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setInTransitDeliveries(data.deliveries || []);
        }
      }
    } catch (err: any) {
      console.error('[DeliveryWidget] Erro ao buscar pedidos em rota:', err);
    } finally {
      setLoadingInTransit(false);
    }
  };

  const handleTransitChange = (id: string, field: 'customer_name' | 'delivery_address' | 'neighborhood', value: string) => {
    setEditingTransitData(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleConfirmDelivered = async (del: Delivery) => {
    setActionLoadingId(del.id);
    const edit = editingTransitData[del.id] || {};
    const nameToSave = (edit.customer_name !== undefined ? edit.customer_name : (del.customer_name || '')).trim();
    const addressToSave = (edit.delivery_address !== undefined ? edit.delivery_address : (del.delivery_address || '')).trim();
    const neighborhoodToSave = (edit.neighborhood !== undefined ? edit.neighborhood : (del.neighborhood || '')).trim();

    try {
      const res = await fetch(`/api/deliveries/${del.id}/confirm-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Entregue',
          customer_name: nameToSave,
          delivery_address: addressToSave,
          neighborhood: neighborhoodToSave
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        let msg = '✅ Pedido marcado como Entregue!';
        if (data.digifarma && data.digifarma.cliente_id) {
          msg += ` Digifarma: #${data.digifarma.cliente_id} (${data.digifarma.action === 'created' ? 'Novo Cadastro Criado' : 'Cadastro Atualizado'}).`;
        }
        addToast(msg, 'success');
        fetchInTransitDeliveries();
        fetchDeliveriesAndMetrics();
      } else {
        addToast(data.error || 'Erro ao confirmar entrega.', 'error');
      }
    } catch (err: any) {
      addToast('Erro de conexão ao confirmar entrega.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSyncDigifarma = async (del: Delivery) => {
    setActionLoadingId(del.id);
    const edit = editingTransitData[del.id] || {};
    const nameToSave = (edit.customer_name !== undefined ? edit.customer_name : (del.customer_name || '')).trim();
    const addressToSave = (edit.delivery_address !== undefined ? edit.delivery_address : (del.delivery_address || '')).trim();
    const neighborhoodToSave = (edit.neighborhood !== undefined ? edit.neighborhood : (del.neighborhood || '')).trim();

    try {
      await fetch(`/api/deliveries/${del.id}/confirm-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: del.status || 'Em Rota',
          customer_name: nameToSave,
          delivery_address: addressToSave,
          neighborhood: neighborhoodToSave
        })
      });

      const res = await fetch(`/api/deliveries/${del.id}/sync-digifarma`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success && data.digifarma?.cliente_id) {
        addToast(`✅ Digifarma: Cliente #${data.digifarma.cliente_id} (${data.digifarma.action === 'created' ? 'Novo Cadastro' : 'Atualizado'}) com sucesso!`, 'success');
        fetchInTransitDeliveries();
        fetchDeliveriesAndMetrics();
      } else {
        addToast(data.digifarma?.message || 'Não foi possível sincronizar com o Digifarma.', 'warning');
      }
    } catch (err: any) {
      addToast('Erro ao comunicar com o Digifarma.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmUndelivered = async () => {
    if (!undeliveredModalDelivery) return;
    const del = undeliveredModalDelivery;
    setActionLoadingId(del.id);

    try {
      const targetStatus = undeliveredAction === 'reagendar' ? 'Pendente' : 'Cancelado';
      const res = await fetch(`/api/deliveries/${del.id}/confirm-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          unclosed_reason: undeliveredReason
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(
          undeliveredAction === 'reagendar'
            ? 'Pedido retornado para Pendente para nova tentativa.'
            : 'Pedido cancelado e registrado no histórico.',
          'info'
        );
        setUndeliveredModalDelivery(null);
        fetchInTransitDeliveries();
        fetchDeliveriesAndMetrics();
      } else {
        addToast(data.error || 'Erro ao atualizar pedido.', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao comunicar com o servidor.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const fetchDeliveriesAndMetrics = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ period });
      if (searchTerm.trim()) query.append('search', searchTerm.trim());
      if (filterClosed !== 'all') query.append('filterClosed', filterClosed);

      const [resDeliv, resRej, resAnalytics] = await Promise.all([
        fetch(`/api/deliveries?${query.toString()}`),
        fetch('/api/deliveries/rejection-metrics'),
        fetch(`/api/deliveries/analytics?${new URLSearchParams({ period }).toString()}`)
      ]);

      if (resDeliv.ok) {
        const data = await resDeliv.json();
        if (data.success) {
          setDeliveries(data.deliveries || []);
          if (data.metrics) setMetrics(data.metrics);
        }
      }

      if (resRej.ok) {
        const dataRej = await resRej.json();
        const rejObj = dataRej.metrics || dataRej;
        setRejectionMetrics({
          total_rejections: rejObj.total_rejections || 0,
          by_reason: rejObj.by_reason || {},
          top_products: rejObj.top_rejected_products || rejObj.top_products || []
        });
      }

      if (resAnalytics.ok) {
        const dataAn = await resAnalytics.json();
        if (dataAn.success && dataAn.analytics) {
          setAnalyticsData(dataAn.analytics);
        }
      }
    } catch (err: any) {
      console.error('[DeliveryWidget] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingReviews = async () => {
    setLoadingPending(true);
    try {
      const res = await fetch('/api/deliveries/pending-reviews');
      const data = await res.json();
      if (res.ok && data.success) {
        setPendingReviews(data.pending_reviews || []);
      }
    } catch (err: any) {
      console.error('[DeliveryWidget] Erro ao buscar conversas pendentes:', err);
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => {
    fetchDeliveriesAndMetrics();
    fetchInTransitDeliveries();
  }, [period, searchTerm, filterClosed]);

  useEffect(() => {
    fetchPendingReviews();
    fetchInTransitDeliveries();
  }, []);

  useEffect(() => {
    const handleReviewSubmittedEvent = (event: any) => {
      const deliveryId = event?.detail?.id;
      if (deliveryId) {
        setPendingReviews(prev => prev.filter(item => String(item.id) !== String(deliveryId)));
        fetchDeliveriesAndMetrics();
      }
    };

    window.addEventListener('reviewSubmitted', handleReviewSubmittedEvent);
    return () => {
      window.removeEventListener('reviewSubmitted', handleReviewSubmittedEvent);
    };
  }, []);

  useEffect(() => {
    if (reviewedDeliveryId) {
      setPendingReviews(prev => prev.filter(item => String(item.id) !== String(reviewedDeliveryId)));
      fetchDeliveriesAndMetrics();
    }
  }, [reviewedDeliveryId]);

  // Sincronização Retroativa desde 01/08/2026
  const handleSyncRetroactive = async () => {
    setSyncingRetroactive(true);
    try {
      const res = await fetch('/api/deliveries/sync-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: '2026-08-01' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`Sincronização concluída! ${data.enqueuedCount} conversas adicionadas.`, 'success');
        fetchPendingReviews();
        fetchDeliveriesAndMetrics();
      } else {
        throw new Error(data.error || 'Erro ao sincronizar conversas.');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao sincronizar conversas retroativas.', 'error');
    } finally {
      setSyncingRetroactive(false);
    }
  };

  // Clique em Cotação ou Pedido (Dispara IA e abre Modal)
  const handleSelectOption = async (item: Delivery, type: 'cotacao' | 'pedido') => {
    setAnalyzingChatId(item.id);
    try {
      const res = await fetch('/api/deliveries/analyze-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, type })
      });

      const data = await res.json();
      let updatedItem = { ...item };
      if (res.ok && data.success && data.data) {
        updatedItem = { ...item, ...data.data };
      }

      if (onSelectPendingReview) {
        onSelectPendingReview(updatedItem, type);
      }
    } catch (err: any) {
      console.error('[DeliveryWidget] Erro ao analisar conversa com IA:', err);
      if (onSelectPendingReview) {
        onSelectPendingReview(item, type);
      }
    } finally {
      setAnalyzingChatId(null);
    }
  };

  // Clique em Não Relevante (Descarta conversa)
  const handleDismissChat = async (id: string) => {
    try {
      const res = await fetch(`/api/deliveries/dismiss-chat/${id}`, { method: 'POST' });
      if (res.ok) {
        setPendingReviews(prev => prev.filter(item => String(item.id) !== String(id)));
        addToast('Conversa marcada como Não Relevante e descartada.', 'info');
      }
    } catch (err) {
      console.error('Erro ao descartar conversa:', err);
    }
  };

  // Formatador de segundos para minutos
  const formatSLA = (secs?: number) => {
    if (!secs || secs <= 0) return '—';
    if (secs < 60) return `${secs}s`;
    const min = Math.floor(secs / 60);
    const rem = secs % 60;
    return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
  };

  return (
    <div className="space-y-6">
      {/* ── CABEÇALHO DO WIDGET & SELETOR DE PERÍODO ────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
            <Truck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
              Gestão de Entregas, Vendas & Inteligência do WhatsApp
            </h2>
            <p className="text-xs text-slate-400">
              Dados geográficos, SLA de resposta, histórico de pedidos e recompra auditados pela IA.
            </p>
          </div>
        </div>

        {/* Controles de Período e Sincronização */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setPeriod('today')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                period === 'today' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setPeriod('7days')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                period === '7days' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              7 Dias
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                period === 'month' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Este Mês
            </button>
            <button
              onClick={() => setPeriod('prev_month')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                period === 'prev_month' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Mês Anterior
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                period === 'all' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tudo
            </button>
          </div>

          <button
            onClick={handleSyncRetroactive}
            disabled={syncingRetroactive}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-2xl border border-slate-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 shrink-0"
            title="Sincronizar conversas recentes do WhatsApp"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingRetroactive ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Sincronizar</span>
          </button>
        </div>
      </div>

      {/* ── KPI CARDS SUPERIORES (RESUMO DO PERÍODO) ────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Atendimentos */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 shadow-xl">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Total Atendimentos</span>
          <div className="text-2xl sm:text-3xl font-black text-white mt-1">
            {metrics.totalContacts}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Conversas analisadas</p>
        </div>

        {/* Vendas Fechadas (Pedidos) */}
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-4 shadow-xl">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-400 block">Pedidos Concluídos</span>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">
            R$ {metrics.closedSalesAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{metrics.closedSalesCount} entregas fechadas</p>
        </div>

        {/* Cotações Perdidas */}
        <div className="bg-slate-900/90 border border-rose-500/30 rounded-3xl p-4 shadow-xl">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-rose-400 block">Não Fechados (Perdas)</span>
          <div className="text-2xl sm:text-3xl font-black text-rose-400 mt-1">
            R$ {metrics.unclosedSalesAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{metrics.unclosedSalesCount} cotações sem venda</p>
        </div>

        {/* Taxa de Conversão */}
        <div className="bg-slate-900/90 border border-blue-500/30 rounded-3xl p-4 shadow-xl">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-400 block">Taxa de Conversão</span>
          <div className="text-2xl sm:text-3xl font-black text-blue-300 mt-1">
            {metrics.conversionRate.toFixed(1)}%
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Ticket Médio: R$ {metrics.averageTicket.toFixed(2)}</p>
        </div>

        {/* SLA Médio de 1ª Resposta */}
        <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-4 shadow-xl col-span-2 lg:col-span-1">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-400 block">Tempo 1ª Resposta (SLA)</span>
          <div className="text-2xl sm:text-3xl font-black text-amber-300 mt-1">
            {formatSLA(analyticsData?.slaAnalytics?.avgFirstResponseSeconds)}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {analyticsData?.slaAnalytics?.under1Min || 0} chats respondidos em &lt;1m
          </p>
        </div>
      </div>

      {/* ── CARD DE AÇÃO RÁPIDA: PEDIDOS EM ROTA PARA ENTREGA ─────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border-2 border-amber-500/40 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-xl shadow-inner">
              🛵
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
                  Pedidos Em Rota para Entrega
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 animate-pulse">
                  {inTransitDeliveries.length}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Confirme se a entrega foi realizada e complete Nome e Endereço para criar ou atualizar o cadastro no <strong>Digifarma</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={fetchInTransitDeliveries}
            disabled={loadingInTransit}
            className="self-start sm:self-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Atualizar lista de pedidos em rota"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingInTransit ? 'animate-spin text-amber-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        {loadingInTransit ? (
          <div className="py-8 text-center text-slate-400 flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
            <p className="text-xs">Verificando entregas em rota...</p>
          </div>
        ) : inTransitDeliveries.length === 0 ? (
          <div className="py-5 px-4 text-center rounded-2xl bg-slate-950/40 border border-slate-800/80 flex flex-col sm:flex-row items-center justify-center gap-3 text-slate-400">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-left">
              <p className="text-xs sm:text-sm font-bold text-slate-300">Nenhum pedido em rota pendente de confirmação no momento.</p>
              <p className="text-[11px] text-slate-500">Assim que um pedido for despachado para entrega no WhatsApp, ele aparecerá aqui com caixas para conferência de Nome e Endereço.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {inTransitDeliveries.map((del) => {
              const edit = editingTransitData[del.id] || {};
              const currentName = edit.customer_name !== undefined ? edit.customer_name : (del.customer_name || '');
              const currentAddress = edit.delivery_address !== undefined ? edit.delivery_address : (del.delivery_address || '');
              const currentNeighborhood = edit.neighborhood !== undefined ? edit.neighborhood : (del.neighborhood || '');
              const isLoadingThis = actionLoadingId === del.id;

              return (
                <div
                  key={del.id}
                  className="bg-slate-950/80 border border-amber-500/30 hover:border-amber-500/60 rounded-2xl p-4 shadow-lg flex flex-col justify-between space-y-3 transition"
                >
                  {/* Topo do Card: Telefone, Valor, Status, Digifarma Badge */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-white">
                          {del.phone}
                        </span>
                        {onOpenChat && (
                          <button
                            onClick={() => onOpenChat(del.phone)}
                            className="p-1 text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                            title="Conversar no WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          🛵 Em Rota
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        <span>Produtos: <strong className="text-slate-200">{del.items || 'Itens diversos'}</strong></span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-base font-black text-emerald-400 block">
                        R$ {(del.total_amount || 0).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {del.payment_method || 'Pagamento na entrega'}
                      </span>
                    </div>
                  </div>

                  {/* Formulário Rápido de Edição de Nome e Endereço */}
                  <div className="space-y-2.5 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1 flex items-center justify-between">
                        <span>👤 Nome do Cliente (Digifarma):</span>
                        {del.digifarma_cliente_id ? (
                          <span className="text-teal-400 font-mono text-[10px] flex items-center gap-1 font-bold">
                            <Check className="w-3 h-3" /> Digifarma #{del.digifarma_cliente_id}
                          </span>
                        ) : (
                          <span className="text-amber-400 text-[10px]">
                            {currentName ? 'Pronto para cadastrar' : '⚠️ Digite o nome'}
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={currentName}
                        onChange={(e) => handleTransitChange(del.id, 'customer_name', e.target.value)}
                        placeholder="Nome não encontrado - digite aqui..."
                        className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          📍 Endereço de Entrega:
                        </label>
                        <input
                          type="text"
                          value={currentAddress}
                          onChange={(e) => handleTransitChange(del.id, 'delivery_address', e.target.value)}
                          placeholder="Rua, número, complemento..."
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          Bairro:
                        </label>
                        <input
                          type="text"
                          value={currentNeighborhood}
                          onChange={(e) => handleTransitChange(del.id, 'neighborhood', e.target.value)}
                          placeholder="Bairro..."
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ações: Entregue, Não Entregue, Sincronizar Digifarma */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConfirmDelivered(del)}
                        disabled={isLoadingThis}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        <span>Entregue</span>
                      </button>

                      <button
                        onClick={() => {
                          setUndeliveredModalDelivery(del);
                          setUndeliveredAction('reagendar');
                        }}
                        disabled={isLoadingThis}
                        className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                        <span>Não Entregue</span>
                      </button>
                    </div>

                    <button
                      onClick={() => handleSyncDigifarma(del)}
                      disabled={isLoadingThis}
                      className="px-3 py-2 bg-slate-800 hover:bg-teal-700 text-slate-300 hover:text-white border border-slate-700 hover:border-teal-600 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      title="Salva os dados e cadastra/atualiza o cliente imediatamente no banco Firebird do Digifarma"
                    >
                      <Building2 className="w-3.5 h-3.5 text-teal-400" />
                      <span>{del.digifarma_cliente_id ? `Digifarma #${del.digifarma_cliente_id}` : 'Cadastrar no Digifarma'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── NAVEGAÇÃO ENTRE AS ABAS ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
        {/* Aba 1: Histórico & Entregas */}
        <button
          onClick={() => setActiveTab('deliveries_list')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs md:text-sm transition cursor-pointer shrink-0 ${
            activeTab === 'deliveries_list'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>🛵 Histórico de Entregas & Pedidos</span>
          <span className="px-2 py-0.5 bg-slate-950/60 rounded-full text-[11px] font-black">
            {deliveries.length}
          </span>
        </button>

        {/* Aba 2: Inteligência Geográfica, Bairros e SLA */}
        <button
          onClick={() => setActiveTab('intelligence')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs md:text-sm transition cursor-pointer shrink-0 ${
            activeTab === 'intelligence'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>🌍 Inteligência Geográfica & Bairros</span>
        </button>

        {/* Aba 3: Conversas Pendentes */}
        <button
          onClick={() => setActiveTab('pending_reviews')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs md:text-sm transition cursor-pointer shrink-0 ${
            activeTab === 'pending_reviews'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Inbox className="w-4 h-4" />
          <span>📥 Conversas Pendentes</span>
          {pendingReviews.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
              activeTab === 'pending_reviews'
                ? 'bg-slate-950 text-amber-400'
                : 'bg-amber-500 text-slate-950 animate-pulse'
            }`}>
              {pendingReviews.length}
            </span>
          )}
        </button>
      </div>

      {/* ── ABA 1: TABELA DETALHADA DE ENTREGAS & PEDIDOS ─────────────────────── */}
      {activeTab === 'deliveries_list' && (
        <div className="space-y-4">
          {/* Barra de Filtros e Busca */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar cliente, telefone, bairro ou item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-emerald-400" /> Status:
              </span>
              <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setFilterClosed('all')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    filterClosed === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFilterClosed('closed')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    filterClosed === 'closed' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Fechados
                </button>
                <button
                  onClick={() => setFilterClosed('unclosed')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    filterClosed === 'unclosed' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Não Fechados
                </button>
              </div>
            </div>
          </div>

          {/* Tabela de Entregas */}
          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-3 bg-slate-900/60 rounded-3xl border border-slate-800">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
              <p className="text-sm">Carregando entregas do período selecionado...</p>
            </div>
          ) : deliveries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-3 bg-slate-900/60 rounded-3xl border border-slate-800">
              <Package className="w-10 h-10 text-slate-600" />
              <p className="text-base font-bold text-slate-200">Nenhum atendimento ou entrega encontrada para este filtro.</p>
              <p className="text-xs text-slate-500">Experimente selecionar outro período (ex: "Este Mês" ou "Tudo") ou sincronizar as mensagens.</p>
            </div>
          ) : (
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Data / Hora</th>
                      <th className="py-3.5 px-4">Cliente</th>
                      <th className="py-3.5 px-4">Bairro / Endereço</th>
                      <th className="py-3.5 px-4">Produtos / Descrição</th>
                      <th className="py-3.5 px-4">Valor</th>
                      <th className="py-3.5 px-4">Status / Motivo</th>
                      <th className="py-3.5 px-4">SLA (1ª Resposta)</th>
                      <th className="py-3.5 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {deliveries.map((del) => {
                      const isClosed = del.sale_closed === 1;
                      const dateDisplay = del.created_at ? new Date(del.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

                      return (
                        <tr key={del.id} className="hover:bg-slate-800/40 transition">
                          {/* Data / Hora */}
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                            {dateDisplay}
                          </td>

                          {/* Cliente */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{del.customer_name || del.wa_name || 'Cliente'}</span>
                              {del.is_new_customer === 1 ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                  NOVO
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                  RECORRENTE
                                </span>
                              )}
                              {del.digifarma_cliente_id ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-teal-500/20 text-teal-300 border border-teal-500/30" title={`Cadastrado no Digifarma com ID #${del.digifarma_cliente_id}`}>
                                  ERP #{del.digifarma_cliente_id}
                                </span>
                              ) : null}
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono block">
                              {del.phone}
                            </span>
                          </td>

                          {/* Bairro / Endereço */}
                          <td className="py-3 px-4 max-w-[200px]">
                            {del.neighborhood ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-0.5">
                                <MapPin className="w-2.5 h-2.5" />
                                {del.neighborhood}
                              </span>
                            ) : null}
                            <p className="text-[11px] text-slate-300 truncate" title={del.delivery_address || ''}>
                              {del.delivery_address || 'Balcão / Loja'}
                            </p>
                          </td>

                          {/* Produtos */}
                          <td className="py-3 px-4 max-w-[220px]">
                            <p className="text-[11px] text-slate-200 line-clamp-2" title={del.items || ''}>
                              {del.items || '—'}
                            </p>
                          </td>

                          {/* Valor */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`font-black text-sm ${isClosed ? 'text-emerald-400' : 'text-slate-400'}`}>
                              R$ {(del.total_amount || 0).toFixed(2)}
                            </span>
                            {del.payment_method && (
                              <span className="block text-[10px] text-slate-500">
                                {del.payment_method}
                              </span>
                            )}
                          </td>

                          {/* Status / Motivo */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {del.status === 'Em Rota' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                                <span>🛵</span> Em Rota
                              </span>
                            ) : isClosed ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle className="w-3 h-3" />
                                {del.status || 'Entregue'}
                              </span>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  <XCircle className="w-3 h-3" />
                                  Não Fechado
                                </span>
                                {del.unclosed_reason && (
                                  <span className="block text-[10px] text-slate-400 mt-0.5">
                                    {del.unclosed_reason}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* SLA */}
                          <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-amber-300">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-400" />
                              {formatSLA(del.first_response_time_seconds)}
                            </span>
                          </td>

                          {/* Ação */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {onOpenChat && (
                              <button
                                onClick={() => onOpenChat(del.phone)}
                                className="p-2 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-xl transition cursor-pointer inline-flex items-center gap-1 text-xs font-bold"
                                title="Abrir conversa no WhatsApp"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA 2: INTELIGÊNCIA GEOGRÁFICA, BAIRROS & SLA ─────────────────────── */}
      {activeTab === 'intelligence' && (
        <div className="space-y-6">
          {/* SEÇÃO 1: RANKING GEOGRÁFICO DE BAIRROS */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-emerald-400" /> Onde Mais Saem Entregas: Ranking de Bairros & Regiões
                </h3>
                <p className="text-xs text-slate-400">
                  Volume de pedidos e faturamento gerado em cada região de atendimento da BelaFarma.
                </p>
              </div>
              <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">
                {analyticsData?.geoAnalytics?.length || 0} Regiões Mapeadas
              </span>
            </div>

            {(!analyticsData?.geoAnalytics || analyticsData.geoAnalytics.length === 0) ? (
              <p className="text-xs text-slate-500 italic py-8 text-center">
                Nenhum dado geográfico detectado no período. Conforme os endereços forem informados pelos clientes nas conversas, as regiões aparecerão aqui automaticamente!
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                {/* Gráfico de Barras de Faturamento por Bairro */}
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analyticsData.geoAnalytics.slice(0, 8)}
                      layout="vertical"
                      margin={{ top: 10, right: 30, left: 90, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                      <XAxis type="number" stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `R$ ${v}`} />
                      <YAxis dataKey="neighborhood" type="category" stroke="#94a3b8" fontSize={11} width={110} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                        formatter={(val: any, name: any, item: any) => [
                          `R$ ${Number(val).toFixed(2)} (${item.payload.closedCount} pedidos)`,
                          'Faturamento'
                        ]}
                      />
                      <Bar dataKey="totalAmount" fill="#10b981" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Tabela de Bairros */}
                <div className="overflow-x-auto max-h-72 rounded-2xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 sticky top-0 text-slate-400 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Bairro / Região</th>
                        <th className="py-2.5 px-3">Pedidos</th>
                        <th className="py-2.5 px-3">Faturamento</th>
                        <th className="py-2.5 px-3">Ticket Médio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {analyticsData.geoAnalytics.map((geo, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-bold text-white flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] flex items-center justify-center text-slate-400 font-mono">
                              {idx + 1}
                            </span>
                            {geo.neighborhood}
                          </td>
                          <td className="py-2 px-3">{geo.closedCount}</td>
                          <td className="py-2 px-3 font-black text-emerald-400">R$ {geo.totalAmount.toFixed(2)}</td>
                          <td className="py-2 px-3 text-slate-400">R$ {geo.avgTicket.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* SEÇÃO 2: PRODUTOS NO DELIVERY (MAIS VENDIDOS VS MAIS PERDIDOS) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Produtos Vendidos no Delivery */}
            <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" /> Top Produtos Mais Vendidos no Delivery
              </h3>

              {(!analyticsData?.topSoldProducts || analyticsData.topSoldProducts.length === 0) ? (
                <p className="text-xs text-slate-500 italic py-6 text-center">Nenhum produto registrado no período.</p>
              ) : (
                <div className="space-y-2.5">
                  {analyticsData.topSoldProducts.slice(0, 8).map((prod, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-950/50 rounded-xl border border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-black flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-white line-clamp-1">{prod.product_name}</span>
                      </div>
                      <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-black rounded-full text-xs shrink-0">
                        {prod.count} {prod.count === 1 ? 'venda' : 'vendas'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Produtos Perdidos / Cotações Recusadas */}
            <div className="bg-slate-900/90 border border-rose-500/30 rounded-3xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
                <Package className="w-4 h-4" /> Top Produtos Cotados Perdidos (Preço / Falta)
              </h3>

              {(!analyticsData?.topLostProducts || analyticsData.topLostProducts.length === 0) ? (
                <p className="text-xs text-slate-500 italic py-6 text-center">Nenhum produto perdido registrado no período.</p>
              ) : (
                <div className="space-y-2.5">
                  {analyticsData.topLostProducts.slice(0, 8).map((prod, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-950/50 rounded-xl border border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 text-xs font-black flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-white line-clamp-1">{prod.product_name}</span>
                      </div>
                      <span className="px-2.5 py-0.5 bg-rose-500/20 text-rose-300 font-bold rounded-full text-xs shrink-0">
                        {prod.count}x ({prod.reason})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SEÇÃO 3: FIDELIDADE (NOVOS VS RECORRENTES) & TOP CLIENTES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Fidelidade / Taxa de Recompra */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" /> Fidelidade & Taxa de Recompra
              </h3>

              <div className="grid grid-cols-2 gap-4 py-2">
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">Novos Clientes</span>
                  <div className="text-3xl font-black text-white mt-1">
                    {analyticsData?.customerLoyalty?.newCustomersCount || 0}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Primeira compra via WhatsApp</p>
                </div>

                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                  <span className="text-xs font-bold text-purple-400 uppercase tracking-wider block">Clientes Recorrentes</span>
                  <div className="text-3xl font-black text-white mt-1">
                    {analyticsData?.customerLoyalty?.repeatCustomersCount || 0}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Recompras fidelizadas</p>
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Índice de Fidelidade (Recompra):</span>
                <span className="text-xl font-black text-emerald-400">
                  {analyticsData?.customerLoyalty?.loyaltyRate || 0}%
                </span>
              </div>
            </div>

            {/* Ranking dos Clientes Mais Frequentes */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" /> Clientes Mais Frequentes no Delivery
              </h3>

              {(!analyticsData?.customerLoyalty?.topCustomers || analyticsData.customerLoyalty.topCustomers.length === 0) ? (
                <p className="text-xs text-slate-500 italic py-6 text-center">Nenhum cliente com múltiplas compras no período.</p>
              ) : (
                <div className="space-y-2">
                  {analyticsData.customerLoyalty.topCustomers.slice(0, 5).map((cust, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800/80">
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span className="text-amber-400 font-mono text-[11px]">#{idx + 1}</span>
                          <span>{cust.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">{cust.phone}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-emerald-400 block">R$ {cust.totalSpent.toFixed(2)}</span>
                        <span className="text-[10px] text-slate-400">{cust.orderCount} pedidos</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SEÇÃO 4: SLA DE ATENDIMENTO & HORÁRIOS DE PICO */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* SLA de Atendimento */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> SLA: Agilidade no Atendimento (1ª Resposta)
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase block">&lt; 1 minuto</span>
                  <span className="text-xl font-black text-white mt-1 block">
                    {analyticsData?.slaAnalytics?.under1Min || 0}
                  </span>
                  <span className="text-[10px] text-slate-500">Excelente</span>
                </div>

                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                  <span className="text-[10px] font-bold text-blue-400 uppercase block">1 a 5 min</span>
                  <span className="text-xl font-black text-white mt-1 block">
                    {analyticsData?.slaAnalytics?.oneToFiveMin || 0}
                  </span>
                  <span className="text-[10px] text-slate-500">Bom</span>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <span className="text-[10px] font-bold text-amber-400 uppercase block">5 a 15 min</span>
                  <span className="text-xl font-black text-white mt-1 block">
                    {analyticsData?.slaAnalytics?.fiveToFifteenMin || 0}
                  </span>
                  <span className="text-[10px] text-slate-500">Atenção</span>
                </div>

                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
                  <span className="text-[10px] font-bold text-rose-400 uppercase block">&gt; 15 min</span>
                  <span className="text-xl font-black text-white mt-1 block">
                    {analyticsData?.slaAnalytics?.over15Min || 0}
                  </span>
                  <span className="text-[10px] text-slate-500">Crítico</span>
                </div>
              </div>
            </div>

            {/* Horários de Pico */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" /> Horários de Pico dos Pedidos (07h às 22h)
              </h3>

              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData?.peakHours || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA 3: FILA DE NOTIFICAÇÃO DE CONVERSAS PENDENTES ──────────────────── */}
      {activeTab === 'pending_reviews' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs md:text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" /> Fila de Notificação por Conversa ({pendingReviews.length})
            </h3>
            <button
              onClick={fetchPendingReviews}
              disabled={loadingPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPending ? 'animate-spin' : ''}`} />
              <span>Atualizar Fila</span>
            </button>
          </div>

          {loadingPending ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-3 bg-slate-950/40 rounded-2xl border border-slate-800">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
              <p className="text-sm">Buscando conversas pendentes do WhatsApp...</p>
            </div>
          ) : pendingReviews.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-3 bg-slate-950/40 rounded-2xl border border-slate-800">
              <CheckCircle className="w-10 h-10 text-emerald-500/80" />
              <p className="text-base font-bold text-slate-200">Tudo em dia! Nenhuma conversa pendente no momento.</p>
              <p className="text-xs text-slate-400 max-w-md">
                Todas as conversas foram devidamente auditadas e salvas no sistema!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingReviews.map((item) => {
                const isPureNumeric = (val?: string) => !val || /^\d{10,}$/.test(val.trim());
                let displayName = 'Cliente WhatsApp';
                if (item.wa_name && item.wa_name.trim() && !isPureNumeric(item.wa_name)) {
                  displayName = item.wa_name.trim();
                } else if (item.customer_name && item.customer_name.trim() && item.customer_name !== 'Cliente WhatsApp' && !isPureNumeric(item.customer_name)) {
                  displayName = item.customer_name.trim();
                } else if (item.phone) {
                  displayName = isPureNumeric(item.phone) ? `Cliente (${item.phone.slice(-4)})` : item.phone;
                }

                const isNewCustomer = item.is_new_customer === 1;
                const isAnalyzing = analyzingChatId === item.id;
                
                return (
                  <div
                    key={item.id}
                    className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-amber-500/40 transition shadow-lg"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg">
                            <Phone className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <h4 className="font-bold text-white text-sm leading-tight line-clamp-1">
                              {displayName}
                            </h4>
                            <p className="text-[11px] text-slate-500 font-mono">{item.phone}</p>
                          </div>
                        </div>

                        {isNewCustomer && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Novo
                          </span>
                        )}
                      </div>

                      {/* Prévia da última mensagem */}
                      {item.items && (
                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Última mensagem</span>
                          <p className="text-xs text-slate-300 italic line-clamp-2">"{item.items}"</p>
                        </div>
                      )}

                      {item.created_at && (
                        <p className="text-[11px] text-slate-500">
                          Recebido em: {new Date(item.created_at).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>

                    {/* Opções de Classificação */}
                    <div className="pt-3 border-t border-slate-800/80 space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-center">
                        Qual o tipo deste atendimento?
                      </span>

                      {isAnalyzing ? (
                        <div className="py-3 bg-slate-900 rounded-2xl flex items-center justify-center gap-2 text-amber-400 text-xs font-bold">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>IA Analisando conversa...</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5">
                          {/* 1. COTAÇÃO */}
                          <button
                            onClick={() => handleSelectOption(item, 'cotacao')}
                            className="py-2 px-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                            title="Analisar como Cotação / Orçamento"
                          >
                            <span>💬 Cotação</span>
                          </button>

                          {/* 2. PEDIDO */}
                          <button
                            onClick={() => handleSelectOption(item, 'pedido')}
                            className="py-2 px-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                            title="Analisar como Pedido de Entrega"
                          >
                            <span>🛵 Pedido</span>
                          </button>

                          {/* 3. NÃO RELEVANTE */}
                          <button
                            onClick={() => handleDismissChat(item.id)}
                            className="py-2 px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer hover:text-rose-300"
                            title="Desconsiderar para métricas"
                          >
                            <span>🚫 Ignorar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: TRATAMENTO DE PEDIDO NÃO ENTREGUE ─────────────────────────── */}
      {undeliveredModalDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Pedido Não Entregue
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {undeliveredModalDelivery.phone} • {undeliveredModalDelivery.customer_name || 'Cliente'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUndeliveredModalDelivery(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-300 font-medium">
                Como deseja proceder com este pedido?
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setUndeliveredAction('reagendar')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                    undeliveredAction === 'reagendar'
                      ? 'bg-amber-500/20 border-amber-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-bold block mb-1">🔄 Reagendar</span>
                  <span className="text-[10px] text-slate-400 leading-tight">Volta para 'Pendente' para nova tentativa de entrega.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUndeliveredAction('cancelar')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                    undeliveredAction === 'cancelar'
                      ? 'bg-rose-500/20 border-rose-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-bold block mb-1">🚫 Cancelar Pedido</span>
                  <span className="text-[10px] text-slate-400 leading-tight">Marca como Cancelado e registra o motivo da devolução.</span>
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Motivo:
                </label>
                <div className="space-y-1.5">
                  <select
                    value={undeliveredReason}
                    onChange={(e) => setUndeliveredReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Cliente ausente / ninguém atendeu">Cliente ausente / ninguém atendeu</option>
                    <option value="Endereço não localizado ou incompleto">Endereço não localizado ou incompleto</option>
                    <option value="Cliente cancelou / desistiu do pedido">Cliente cancelou / desistiu do pedido</option>
                    <option value="Troca ou problema com a mercadoria">Troca ou problema com a mercadoria</option>
                    <option value="Outro">Outro motivo</option>
                  </select>

                  {undeliveredReason === 'Outro' && (
                    <input
                      type="text"
                      placeholder="Especifique o motivo..."
                      onChange={(e) => setUndeliveredReason(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 mt-1"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setUndeliveredModalDelivery(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmUndelivered}
                disabled={actionLoadingId === undeliveredModalDelivery.id}
                className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer disabled:opacity-50 ${
                  undeliveredAction === 'reagendar'
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                Confirmar {undeliveredAction === 'reagendar' ? 'Reagendamento' : 'Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
