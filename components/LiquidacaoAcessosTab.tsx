import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Eye,
  ShoppingBag,
  TrendingUp,
  MapPin,
  Smartphone,
  Monitor,
  RotateCcw,
  Trash2,
  Clock,
  ArrowUpRight,
  Search,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Flame,
  Activity,
  Layers,
  HelpCircle,
  Percent,
  Calendar,
  Compass,
  AlertCircle
} from 'lucide-react';
import { useToast } from './ToastContext';

export interface AnalyticsData {
  period: string;
  kpis: {
    totalPageviews: number;
    uniqueVisitors: number;
    returningVisitors: number;
    taxaRecorrencia: number;
    totalCheckouts: number;
    taxaConversao: number;
    totalAbandoned: number;
    valorTotalPerdido: number;
    taxaAbandono: number;
    avgDurationSeconds: number;
    avgScrollPercent: number;
  };
  timeline: Array<{
    date_str: string;
    visualizacoes: number;
    visitantes_unicos: number;
    carrinhos: number;
    pedidos: number;
  }>;
  hourlyDistribution: Array<{
    hora: string;
    acessos: number;
  }>;
  topCidades: Array<{
    cidade: string;
    estado: string;
    total: number;
    percentual: number;
  }>;
  topBairros: Array<{
    bairro: string;
    total: number;
  }>;
  dispositivos: {
    mobile: number;
    desktop: number;
  };
  origens: Array<{
    canal: string;
    total: number;
  }>;
  topInteresse: Array<{
    produto_id: number;
    produto_nome: string;
    categoria: string;
    produto_preco: number;
    cliques: number;
    adicionados: number;
    comprados: number;
  }>;
  termosBuscados: Array<{
    search_term: string;
    total_buscas: number;
    media_resultados: number;
  }>;
  demandaReprimida: Array<{
    produto_id: number;
    produto_nome: string;
    tentativas_clique: number;
  }>;
  carrinhosAbandonados: Array<{
    id: string;
    cliente: string;
    bairro: string;
    cidade: string;
    estado: string;
    dispositivo: string;
    valor: number;
    itensCount: number;
    dataHora: string;
    produtos: Array<{
      id: number;
      nome: string;
      preco: number;
      quantidade: number;
      imagem?: string;
    }>;
  }>;
}

export const LiquidacaoAcessosTab: React.FC = () => {
  const [period, setPeriod] = useState<'hoje' | '7d' | '30d' | 'total'>('7d');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const { showToast } = useToast();

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/liquidacao/analytics/dashboard?period=${period}`);
      if (!res.ok) throw new Error('Falha ao carregar métricas');
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (e: any) {
      console.error('Erro ao buscar dados de analytics:', e);
      showToast('Erro ao carregar dados de monitoramento da vitrine.', 'error');
    } finally {
      setLoading(false);
    }
  }, [period, showToast]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleResetData = async () => {
    setIsResetting(true);
    try {
      const res = await fetch('/api/liquidacao/analytics/reset', { method: 'POST' });
      if (res.ok) {
        showToast('Métricas da vitrine zeradas com sucesso!', 'success');
        setShowResetModal(false);
        fetchAnalytics();
      } else {
        throw new Error('Falha ao resetar métricas');
      }
    } catch (e: any) {
      showToast('Erro ao zerar métricas de teste.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const formatBRL = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDate = (isoStr: string) => {
    if (!isoStr) return '';
    try {
      const parts = isoStr.split('T')[0].split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
      return isoStr;
    } catch {
      return isoStr;
    }
  };

  const formatDateTime = (isoStr: string) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  const maxTimelineViews = data?.timeline?.length
    ? Math.max(...data.timeline.map((t) => t.visualizacoes), 1)
    : 1;

  const maxHourlyAccess = data?.hourlyDistribution?.length
    ? Math.max(...data.hourlyDistribution.map((h) => h.acessos), 1)
    : 1;

  const totalDev = (data?.dispositivos?.mobile || 0) + (data?.dispositivos?.desktop || 0);
  const mobilePercent = totalDev > 0 ? Math.round(((data?.dispositivos?.mobile || 0) / totalDev) * 100) : 0;
  const desktopPercent = totalDev > 0 ? 100 - mobilePercent : 0;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ─── BARRA DE CONTROLE & SELETOR DE PERÍODO ─── */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl shadow-md">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                Monitoramento & Inteligência da Vitrine Liquida
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                AO VIVO
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Rastreamento em tempo real de acessos, localização por IP, dispositivos e carrinhos abandonados
            </p>
          </div>
        </div>

        {/* Filtros e Ações */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
            <button
              type="button"
              onClick={() => setPeriod('hoje')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'hoje'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-black'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setPeriod('7d')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === '7d'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-black'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              7 Dias
            </button>
            <button
              type="button"
              onClick={() => setPeriod('30d')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === '30d'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-black'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              30 Dias
            </button>
            <button
              type="button"
              onClick={() => setPeriod('total')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'total'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-black'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Tudo
            </button>
          </div>

          <button
            type="button"
            onClick={fetchAnalytics}
            disabled={loading}
            className="p-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
            title="Atualizar dados agora"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-900/50 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Limpar métricas de testes"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Zerar Testes</span>
          </button>
        </div>
      </div>

      {/* ─── GRID DE CARDS COM KPIS PRINCIPAIS ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Card 1: Visualizações Totais */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Acessos Totais</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {data?.kpis?.totalPageviews?.toLocaleString('pt-BR') || 0}
            </span>
            <p className="text-[10px] text-slate-400 mt-0.5">Visualizações de página</p>
          </div>
        </div>

        {/* Card 2: Visitantes Únicos */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Visitantes Únicos</span>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {data?.kpis?.uniqueVisitors?.toLocaleString('pt-BR') || 0}
            </span>
            <p className="text-[10px] text-slate-400 mt-0.5">Pessoas diferentes</p>
          </div>
        </div>

        {/* Card 3: Clientes Recorrentes */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Recorrentes</span>
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
                {data?.kpis?.returningVisitors || 0}
              </span>
              <span className="text-xs font-bold text-purple-500">
                ({data?.kpis?.taxaRecorrencia || 0}%)
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Voltaram mais de 1x</p>
          </div>
        </div>

        {/* Card 4: Pedidos WhatsApp Finalizados */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Pedidos WhatsApp</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {data?.kpis?.totalCheckouts || 0}
              </span>
              <span className="text-xs font-bold text-emerald-500">
                ({data?.kpis?.taxaConversao || 0}%)
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Taxa de conversão</p>
          </div>
        </div>

        {/* Card 5: Carrinhos Abandonados */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Carrinhos Abandonados</span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {data?.kpis?.totalAbandoned || 0}
              </span>
              <span className="text-xs font-bold text-amber-600">
                ({data?.kpis?.taxaAbandono || 0}%)
              </span>
            </div>
            <p className="text-[10px] font-bold text-amber-600/90 mt-0.5 truncate">
              {formatBRL(data?.kpis?.valorTotalPerdido || 0)} perdidos
            </p>
          </div>
        </div>

        {/* Card 6: Tempo Médio & Scroll */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Tempo & Rolagem</span>
            <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-xl font-black text-slate-900 dark:text-white">
              {data?.kpis?.avgDurationSeconds || 0}s
            </span>
            <p className="text-[10px] text-teal-600 font-bold mt-0.5">
              Rolagem: {data?.kpis?.avgScrollPercent || 0}% da página
            </p>
          </div>
        </div>
      </div>

      {/* ─── LINHA DO TEMPO DIÁRIA E HORÁRIOS DE PICO ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico 1: Evolução Diária de Acessos e Conversões */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span>Evolução Diária de Acessos & Compras</span>
              </h3>
              <p className="text-xs text-slate-400">Visualizações x Visitantes Únicos x Pedidos Finalizados</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold">
              <span className="flex items-center gap-1.5 text-blue-600">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Visualizações
              </span>
              <span className="flex items-center gap-1.5 text-indigo-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" /> Únicos
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Pedidos
              </span>
            </div>
          </div>

          {/* Gráfico de Barras Estilizadas */}
          {data?.timeline && data.timeline.length > 0 ? (
            <div className="pt-4 flex items-end justify-between gap-2 h-56 border-b border-slate-100 dark:border-slate-800 px-2">
              {data.timeline.map((item, idx) => {
                const heightViews = Math.max(8, Math.round((item.visualizacoes / maxTimelineViews) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group relative">
                    {/* Tooltip Hover */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-slate-900 text-white text-[10px] p-2 rounded-xl shadow-xl z-20 whitespace-nowrap pointer-events-none">
                      <span className="font-black text-amber-300">{item.date_str}</span>
                      <span>👁️ {item.visualizacoes} visualizações</span>
                      <span>👤 {item.visitantes_unicos} únicos</span>
                      <span>🛒 {item.carrinhos} no carrinho</span>
                      <span className="text-emerald-400 font-bold">✅ {item.pedidos} pedidos</span>
                    </div>

                    <div className="w-full flex items-end justify-center gap-1 h-full">
                      {/* Barra Visualizações */}
                      <div
                        style={{ height: `${heightViews}%` }}
                        className="w-full max-w-[20px] bg-gradient-to-t from-blue-600 to-cyan-400 rounded-t-md transition-all duration-300 group-hover:brightness-110"
                      />
                      {/* Barra Pedidos */}
                      {item.pedidos > 0 && (
                        <div
                          style={{ height: `${Math.max(10, Math.round((item.pedidos / maxTimelineViews) * 100))}%` }}
                          className="w-1.5 bg-emerald-500 rounded-t-sm"
                        />
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 truncate max-w-[45px]">
                      {formatDate(item.date_str)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-56 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Calendar className="w-8 h-8 mb-2 opacity-40 text-blue-500" />
              <span>Nenhum acesso registrado no período selecionado.</span>
            </div>
          )}
        </div>

        {/* Gráfico 2: Horários de Pico (0h às 23h) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="mb-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Horários de Maior Movimento</span>
            </h3>
            <p className="text-xs text-slate-400">Concentração de acessos por hora do dia</p>
          </div>

          <div className="grid grid-cols-6 gap-1.5 h-56 pt-2 items-end">
            {data?.hourlyDistribution?.map((h, i) => {
              const heightPct = Math.max(6, Math.round((h.acessos / maxHourlyAccess) * 100));
              const isPeak = h.acessos > 0 && h.acessos === maxHourlyAccess;
              return (
                <div key={i} className="flex flex-col items-center gap-1 h-full justify-end group relative">
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-900 text-white text-[10px] px-2 py-1 rounded-md z-20 whitespace-nowrap">
                    {h.hora}: {h.acessos} acessos
                  </div>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-t-md transition-all ${
                      isPeak
                        ? 'bg-gradient-to-t from-red-600 to-amber-400 shadow-sm'
                        : h.acessos > 0
                          ? 'bg-blue-400 dark:bg-blue-600'
                          : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  />
                  <span className={`text-[9px] font-bold ${isPeak ? 'text-red-600 font-black' : 'text-slate-400'}`}>
                    {h.hora}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── LOCALIZAÇÃO (CIDADES E BAIRROS) & DISPOSITIVOS ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Top Cidades */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600">
                <MapPin className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Cidades dos Visitantes</h3>
            </div>
            <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md text-slate-500">
              GeoIP Silencioso
            </span>
          </div>

          <div className="space-y-3">
            {data?.topCidades && data.topCidades.length > 0 ? (
              data.topCidades.map((cid, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      📍 {cid.cidade} - {cid.estado}
                    </span>
                    <span className="text-slate-500 font-bold">
                      {cid.total} acessos ({cid.percentual}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, Math.max(10, cid.percentual))}%` }}
                      className="h-full bg-gradient-to-r from-rose-500 to-red-600 rounded-full"
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 text-center py-6">Aguardando primeiros acessos da vitrine.</p>
            )}
          </div>
        </div>

        {/* Top Bairros (Capturados no Checkout) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                <Compass className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Bairros Informados</h3>
            </div>
            <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-md">
              Carrinho
            </span>
          </div>

          <div className="space-y-2.5">
            {data?.topBairros && data.topBairros.length > 0 ? (
              data.topBairros.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs"
                >
                  <span className="font-black text-slate-700 dark:text-slate-300">🏘️ {b.bairro}</span>
                  <span className="font-extrabold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                    {b.total} {b.total === 1 ? 'cliente' : 'clientes'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 text-center py-6">
                Nenhum bairro registrado ainda. Os bairros aparecem quando os clientes preenchem o carrinho!
              </p>
            )}
          </div>
        </div>

        {/* Dispositivos & Canais de Origem */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-purple-600" />
              <span>Aparelhos & Canais de Origem</span>
            </h3>

            {/* Divisão Mobile vs Desktop */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 mb-4">
              <div className="flex items-center justify-between text-xs font-bold mb-2">
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                  <Smartphone className="w-3.5 h-3.5 text-blue-500" /> Celular: {mobilePercent}%
                </span>
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                  <Monitor className="w-3.5 h-3.5 text-indigo-500" /> PC: {desktopPercent}%
                </span>
              </div>
              <div className="w-full bg-indigo-200 dark:bg-indigo-950 h-2.5 rounded-full overflow-hidden flex">
                <div style={{ width: `${mobilePercent}%` }} className="bg-blue-500 h-full" />
                <div style={{ width: `${desktopPercent}%` }} className="bg-indigo-500 h-full" />
              </div>
            </div>

            {/* Canais */}
            <div className="space-y-1.5 text-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Origem do Tráfego:
              </span>
              {data?.origens && data.origens.length > 0 ? (
                data.origens.map((orig, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {orig.canal === 'Instagram' ? '📸 Instagram' : orig.canal === 'WhatsApp' ? '💬 WhatsApp' : orig.canal === 'Facebook' ? '📘 Facebook' : '🔗 Link Direto'}
                    </span>
                    <span className="font-black text-slate-900 dark:text-white">{orig.total}</span>
                  </div>
                ))
              ) : (
                <p className="text-slate-400 text-xs py-2">Direto / Link</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── TABELA DE CARRINHOS ABANDONADOS ─── */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Carrinhos Abandonados Recentes (Não Finalizados)
              </h3>
              <p className="text-xs text-slate-400">
                Clientes que montaram sacola mas não enviaram o pedido no WhatsApp
              </p>
            </div>
          </div>
          <span className="text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-800">
            {data?.carrinhosAbandonados?.length || 0} carrinhos recentes
          </span>
        </div>

        {data?.carrinhosAbandonados && data.carrinhosAbandonados.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700/80 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-3 whitespace-nowrap">Data / Hora</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Cliente & Bairro</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Dispositivo</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Produtos Deixados no Carrinho</th>
                  <th className="py-2.5 px-3 whitespace-nowrap text-right">Valor Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.carrinhosAbandonados.map((cart) => (
                  <tr key={cart.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 whitespace-nowrap font-medium text-slate-500">
                      {formatDateTime(cart.dataHora)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {cart.cliente}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          📍 {cart.bairro} ({cart.cidade})
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        {cart.dispositivo === 'mobile' ? <Smartphone className="w-3.5 h-3.5 text-blue-500" /> : <Monitor className="w-3.5 h-3.5 text-indigo-500" />}
                        {cart.dispositivo === 'mobile' ? 'Celular' : 'PC'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1.5 max-w-lg">
                        {cart.produtos && cart.produtos.length > 0 ? (
                          cart.produtos.map((p, pIdx) => (
                            <span
                              key={pIdx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                            >
                              <span className="font-black text-red-600">{p.quantidade}x</span>
                              <span className="truncate max-w-[150px]">{p.nome}</span>
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">Itens não detalhados</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-right font-black text-sm text-red-600 dark:text-red-400">
                      {formatBRL(cart.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs">
            <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30 text-amber-500" />
            <p className="font-bold">Nenhum carrinho abandonado registrado no período.</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Todos os clientes que adicionaram produtos finalizaram a compra ou o carrinho ainda está vazio.
            </p>
          </div>
        )}
      </div>

      {/* ─── PRODUTOS DE ALTO INTERESSE, TERMOS BUSCADOS E DEMANDA REPRIMIDA ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. Alto Interesse sem Compra */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Alto Interesse sem Compra</h3>
              <p className="text-[11px] text-slate-400">Mais clicados com pouca conversão</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {data?.topInteresse && data.topInteresse.length > 0 ? (
              data.topInteresse.map((prod, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs"
                >
                  <div className="flex flex-col truncate max-w-[190px]">
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate" title={prod.produto_nome}>
                      {prod.produto_nome}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatBRL(prod.produto_preco)} • {prod.categoria || 'Geral'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded text-[10px] font-black">
                      👁️ {prod.cliques}
                    </span>
                    <span className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded text-[10px] font-black">
                      🛒 {prod.adicionados}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 text-center py-6">Aguardando cliques em produtos.</p>
            )}
          </div>
        </div>

        {/* 2. Termos Mais Pesquisados */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Mais Buscados na Pesquisa</h3>
              <p className="text-[11px] text-slate-400">O que os clientes estão digitando</p>
            </div>
          </div>

          <div className="space-y-2">
            {data?.termosBuscados && data.termosBuscados.length > 0 ? (
              data.termosBuscados.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs"
                >
                  <span className="font-bold text-slate-700 dark:text-slate-300">🔍 "{t.search_term}"</span>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-900 dark:text-white">{t.total_buscas}x</span>
                    {t.media_resultados === 0 && (
                      <span className="text-[10px] font-black text-red-600 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">
                        0 achados
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 text-center py-6">Nenhuma pesquisa registrada ainda.</p>
            )}
          </div>
        </div>

        {/* 3. Alerta de Demanda Reprimida (Esgotados Procurados) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Demanda Reprimida</h3>
              <p className="text-[11px] text-slate-400">Produtos esgotados que clientes tentaram comprar</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {data?.demandaReprimida && data.demandaReprimida.length > 0 ? (
              data.demandaReprimida.map((dr, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-red-50/60 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/40 flex items-center justify-between text-xs"
                >
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px]" title={dr.produto_nome}>
                    🚫 {dr.produto_nome}
                  </span>
                  <span className="bg-red-600 text-white font-black px-2 py-0.5 rounded-md text-[10px]">
                    {dr.tentativas_clique} tentativas
                  </span>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-500 opacity-60" />
                <p>Nenhuma tentativa de compra de produto esgotado no período.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── MODAL DE CONFIRMAÇÃO DE ZERAR TESTES ─── */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 max-w-md w-full p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 dark:bg-red-950/60 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Zerar Métricas de Teste?
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Esta ação limpará o histórico de acessos, visualizações e carrinhos abandonados acumulados durante a fase de testes.
              Use esta opção quando estiver pronto para iniciar o monitoramento oficial da campanha.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResetData}
                disabled={isResetting}
                className="px-4 py-2 text-xs font-black bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isResetting ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Confirmar e Zerar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
