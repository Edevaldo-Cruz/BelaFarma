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
  Inbox
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
import { Delivery, DeliveryMetrics } from '../types';

interface DeliveryWidgetProps {
  onOpenChat?: (phone: string) => void;
  onSelectPendingReview?: (delivery: Delivery, mode?: 'pedido' | 'cotacao') => void;
  reviewedDeliveryId?: string | null;
}

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

export const DeliveryWidget: React.FC<DeliveryWidgetProps> = ({ onOpenChat, onSelectPendingReview, reviewedDeliveryId }) => {
  const { addToast } = useToast();

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [pendingReviews, setPendingReviews] = useState<Delivery[]>([]);
  const [loadingPending, setLoadingPending] = useState<boolean>(false);
  const [syncingRetroactive, setSyncingRetroactive] = useState<boolean>(false);
  const [analyzingChatId, setAnalyzingChatId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending_reviews' | 'charts'>('pending_reviews');
  
  const [rejectionMetrics, setRejectionMetrics] = useState<{
    total_rejections: number;
    by_reason: Record<string, number>;
    top_products: Array<{ product_name: string; count: number; main_reason: string }>;
  }>({
    total_rejections: 0,
    by_reason: {},
    top_products: []
  });

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

  const [loading, setLoading] = useState<boolean>(true);
  const [period, setPeriod] = useState<'today' | '7days' | '30days' | 'month' | 'prev_month' | 'all' | string>('month');

  const fetchDeliveriesAndMetrics = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ period });
      const [resDeliv, resRej] = await Promise.all([
        fetch(`/api/deliveries?${query.toString()}`),
        fetch('/api/deliveries/rejection-metrics')
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
        setRejectionMetrics({
          total_rejections: dataRej.total_rejections || 0,
          by_reason: dataRej.by_reason || {},
          top_products: dataRej.top_products || []
        });
      }
    } catch (err: any) {
      console.error('[DeliveryWidget] Erro ao carregar métricas:', err);
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
    fetchPendingReviews();
    fetchDeliveriesAndMetrics();
  }, [period]);

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
        addToast(`Busca desde 01/08 concluída! ${data.enqueuedCount} conversas adicionadas à fila.`, 'success');
        fetchPendingReviews();
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

  // Dados formatados para gráficos de Recharts
  const conversionFunnelData = [
    { name: 'Cotações Perdidas', valor: metrics.unclosedSalesCount, fill: '#ef4444' },
    { name: 'Pedidos Fechados', valor: metrics.closedSalesCount, fill: '#10b981' }
  ];

  const reasonChartData = Object.entries(rejectionMetrics.by_reason).map(([reason, count]) => ({
    name: reason,
    quantidade: count
  }));

  const topProductsChartData = rejectionMetrics.top_products.slice(0, 10).map(p => ({
    name: p.product_name.length > 25 ? p.product_name.substring(0, 25) + '...' : p.product_name,
    recusas: p.count,
    motivo: p.main_reason
  }));

  const customerTypeData = [
    { name: 'Novos Clientes', valor: deliveries.filter(d => d.is_new_customer === 1).length, fill: '#3b82f6' },
    { name: 'Recorrentes', valor: deliveries.filter(d => d.is_new_customer !== 1).length, fill: '#8b5cf6' }
  ];

  return (
    <div className="space-y-6">
      {/* ── CABEÇALHO DO WIDGET ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
            <MessageSquare className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
              Auditoria Interativa & Notificações do WhatsApp
            </h2>
            <p className="text-xs text-slate-400">
              Classifique as conversas da farmácia para alimentar os gráficos de conversão e perdas.
            </p>
          </div>
        </div>

        {/* Botão de Busca Retroativa desde 01/08 */}
        <button
          onClick={handleSyncRetroactive}
          disabled={syncingRetroactive}
          className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-2xl shadow-lg shadow-blue-600/20 flex items-center gap-2 transition cursor-pointer disabled:opacity-60 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${syncingRetroactive ? 'animate-spin' : ''}`} />
          <span>Sincronizar (Desde 01/08)</span>
        </button>
      </div>

      {/* ── SUB-TABS NAVEGAÇÃO ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('pending_reviews')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs md:text-sm transition cursor-pointer ${
            activeTab === 'pending_reviews'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Inbox className="w-4 h-4" />
          <span>📥 Conversas Pendentes</span>
          {pendingReviews.length > 0 && (
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${
              activeTab === 'pending_reviews'
                ? 'bg-slate-950 text-amber-400'
                : 'bg-amber-500 text-slate-950 animate-pulse'
            }`}>
              {pendingReviews.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('charts')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs md:text-sm transition cursor-pointer ${
            activeTab === 'charts'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>📊 Gráficos & Indicadores Estratégicos</span>
        </button>
      </div>

      {/* ── ABA 1: FILA DE NOTIFICAÇÃO DE CONVERSAS PENDENTES ──────────────────── */}
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
                Clique no botão <strong className="text-blue-400">"Sincronizar (Desde 01/08)"</strong> acima para trazer o histórico recente de conversas para classificação.
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
                
                const durationSecs = item.chat_duration_seconds || 0;
                const durationMins = Math.floor(durationSecs / 60);
                const durationSecsRemainder = durationSecs % 60;
                const durationDisplay = durationMins > 0 ? `${durationMins}m ${durationSecsRemainder}s` : `${durationSecs}s`;

                return (
                  <div
                    key={item.id}
                    className="bg-slate-950/80 border border-amber-500/30 hover:border-amber-500/60 rounded-3xl p-5 shadow-xl flex flex-col justify-between space-y-4 transition-all hover:translate-y-[-2px]"
                  >
                    <div className="space-y-3">
                      {/* Cabeçalho do Cliente */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-bold text-white text-base truncate flex items-center gap-2" title={displayName}>
                            {displayName}
                          </h4>
                          <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                            {item.phone}
                          </p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                          isNewCustomer
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}>
                          {isNewCustomer ? '🆕 Cliente Novo' : '👤 Recorrente'}
                        </span>
                      </div>

                      {/* Métricas Extraídas */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Duração</span>
                          <span className="text-xs font-bold text-slate-200 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            {durationDisplay}
                          </span>
                        </div>

                        <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Mensagens</span>
                          <span className="text-xs font-bold text-slate-200 flex items-center gap-1 mt-0.5">
                            <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                            {item.chat_message_count || 0} msgs
                          </span>
                        </div>
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

                    {/* ── AS 3 OPÇÕES DE CLASSIFICAÇÃO PARA O ATENDENTE ─────────────── */}
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

      {/* ── ABA 2: GRÁFICOS & INDICADORES ESTRATÉGICOS (TELA LIMPA SEM LISTA DE TABELA) ───────────────────── */}
      {activeTab === 'charts' && (
        <div className="space-y-6">
          {/* Seletor de Período dos Gráficos */}
          <div className="flex items-center justify-between bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex-wrap gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" /> Período de Análise dos Gráficos:
            </span>
            <div className="flex items-center space-x-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto">
              <button
                onClick={() => setPeriod('today')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  period === 'today' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Hoje
              </button>
              <button
                onClick={() => setPeriod('month')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  period === 'month' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Este Mês
              </button>
              <button
                onClick={() => setPeriod('prev_month')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  period === 'prev_month' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Mês Anterior
              </button>
              <button
                onClick={() => setPeriod('30days')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  period === '30days' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                30 Dias
              </button>
              <button
                onClick={() => setPeriod('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  period === 'all' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tudo
              </button>
            </div>
          </div>

          {/* ── KPI CARDS ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Atendimentos */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Total Atendimentos</span>
              <div className="text-3xl font-black text-white mt-1">
                {metrics.totalContacts}
              </div>
              <p className="text-xs text-slate-500 mt-1">Conversas processadas</p>
            </div>

            {/* Faturamento em Pedidos */}
            <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-5 shadow-xl">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block">Vendas Concluídas (Pedidos)</span>
              <div className="text-3xl font-black text-emerald-400 mt-1">
                R$ {metrics.closedSalesAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-slate-400 mt-1">{metrics.closedSalesCount} pedidos fechados</p>
            </div>

            {/* Cotações Perdidas */}
            <div className="bg-slate-900/90 border border-rose-500/30 rounded-3xl p-5 shadow-xl">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 block">Cotações Perdidas (Valor)</span>
              <div className="text-3xl font-black text-rose-400 mt-1">
                R$ {metrics.unclosedSalesAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-slate-400 mt-1">{metrics.unclosedSalesCount} cotações não convertidas</p>
            </div>

            {/* Taxa de Conversão */}
            <div className="bg-slate-900/90 border border-blue-500/30 rounded-3xl p-5 shadow-xl">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 block">Taxa de Conversão</span>
              <div className="text-3xl font-black text-blue-300 mt-1">
                {metrics.conversionRate.toFixed(1)}%
              </div>
              <p className="text-xs text-slate-400 mt-1">Ticket Médio: R$ {metrics.averageTicket.toFixed(2)}</p>
            </div>
          </div>

          {/* ── GRÁFICOS PRINCIPAIS (FUNIL E MOTIVOS DE RECUSA) ───────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GRÁFICO 1: FUNIL DE CONVERSÃO (PEDIDOS VS COTAÇÕES) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Funil de Conversão: Cotações vs Pedidos
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={conversionFunnelData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                    />
                    <Bar dataKey="valor" radius={[12, 12, 0, 0]}>
                      {conversionFunnelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* GRÁFICO 2: MOTIVOS DE REJEIÇÃO / NÃO FECHAMENTO */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-400" /> Motivos de Não Fechamento de Cotações
              </h3>
              {reasonChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-500 italic text-xs">
                  Nenhum motivo registrado no período selecionado.
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reasonChartData}
                        dataKey="quantidade"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {reasonChartData.map((_, index) => (
                          <Cell key={`cell-reason-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                        itemStyle={{ color: '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* ── GRÁFICO 3: TOP PRODUTOS PERDIDOS / REJEITADOS NA COTAÇÃO ────────── */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-400" /> Top Produtos Rejeitados / Recusados nas Cotações
            </h3>

            {topProductsChartData.length === 0 ? (
              <p className="text-xs italic text-slate-500 py-6 text-center">
                Nenhum produto rejeitado registrado. Conforme os atendentes responderem ao questionário de Cotação, os produtos recusados aparecerão aqui!
              </p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProductsChartData} layout="vertical" margin={{ top: 10, right: 30, left: 100, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                    <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={130} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                      formatter={(val, name, item) => [`${val} recusas (Motivo: ${item.payload.motivo})`, 'Recusas']}
                    />
                    <Bar dataKey="recusas" fill="#f59e0b" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ── GRÁFICO 4: CRESCIMENTO DA ÁREA (NOVOS CLIENTES VS RECORRENTES) ────── */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" /> Origem dos Atendimentos (Novos Clientes vs Recorrentes)
            </h3>
            <div className="h-56 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={customerTypeData}
                    dataKey="valor"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                  >
                    {customerTypeData.map((entry, index) => (
                      <Cell key={`cell-cust-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
