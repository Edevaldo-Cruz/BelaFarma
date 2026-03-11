import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContext';
import { 
  Bot, Sparkles, Send, History, Newspaper, TrendingUp, CloudRain, 
  Calendar, CheckCircle, AlertTriangle, AlertCircle, MapPin
} from 'lucide-react';

const API_BASE = 'http://localhost:3001';

interface MarketingReport {
  id: string;
  content?: string;
  metadata: {
    geradoEm?: string;
    totalProdutos?: number;
    totalDatas?: number;
    datas?: string[];
  };
  sentToRosana: boolean;
  sentAt?: string;
  createdAt: string;
}

interface DataComemmorativa {
  nome: string;
  emoji: string;
  data: string;
  diasRestantes: number;
  temas: string[];
}

interface SchedulerStatus {
  agente: string;
  ativo: boolean;
  emExecucao: boolean;
  proximoEnvio: string;
  destinatario: string;
  frequencia: string;
  descricao: string;
  ultimoRelatorio?: {
    id: string;
    createdAt: string;
    sentToRosana: boolean;
    sentAt?: string;
  } | null;
}

type Tab = 'dashboard' | 'relatorio' | 'historico' | 'noticias' | 'trends' | 'clima';

export default function MarketingAgent() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [historico, setHistorico] = useState<MarketingReport[]>([]);
  const [datas, setDatas] = useState<DataComemmorativa[]>([]);
  const [relatorioAtual, setRelatorioAtual] = useState<MarketingReport | null>(null);

  const [loadingGerar, setLoadingGerar] = useState(false);
  const [loadingEnviar, setLoadingEnviar] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingNoticias, setLoadingNoticias] = useState(false);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [loadingClima, setLoadingClima] = useState(false);
  const [loadingIdeia, setLoadingIdeia] = useState(false);

  const [nomeProduto, setNomeProduto] = useState('');
  const [ideiaProduto, setIdeiaProduto] = useState('');
  const [phoneOverride, setPhoneOverride] = useState('');
  const [conteudoNoticias, setConteudoNoticias] = useState('');
  const [conteudoTrends, setConteudoTrends] = useState('');
  const [climaDescricao, setClimaDescricao] = useState('');
  const [conteudoClima, setConteudoClima] = useState('');
  const [previsaoIpiranga, setPrevisaoIpiranga] = useState<{ dadosClima: any, conteudo: string } | null>(null);
  const [loadingIpiranga, setLoadingIpiranga] = useState(false);

  // ─── Busca de dados ─────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/marketing/status`);
      if (r.ok) setStatus(await r.json());
    } catch { /* silencioso */ } finally {
      setLoadingStatus(false);
    }
  }, []);

  const fetchHistorico = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/marketing/historico?limit=10`);
      if (r.ok) setHistorico(await r.json());
    } catch { /* silencioso */ }
  }, []);

  const fetchDatas = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/marketing/datas-comemorativas?dias=30`);
      if (r.ok) {
        const data = await r.json();
        setDatas(data.datas || []);
      }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchHistorico();
    fetchDatas();
  }, [fetchStatus, fetchHistorico, fetchDatas]);

  // ─── Ações ──────────────────────────────────────────────────────────────────

  const handleGerarRelatorio = async () => {
    setLoadingGerar(true);
    setRelatorioAtual(null);
    addToast('🤖 A Isa está preparando o relatório... pode levar até 1 minuto.', 'info');

    try {
      const r = await fetch(`${API_BASE}/api/marketing/gerar-relatorio`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro desconhecido');
      setRelatorioAtual(data);
      setActiveTab('relatorio');
      await fetchHistorico();
      await fetchStatus();
      addToast('✅ Relatório da Isa gerado com sucesso!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar';
      addToast(`❌ ${msg}`, 'error');
    } finally {
      setLoadingGerar(false);
    }
  };

  const handleEnviarRelatorio = async (reportId?: string) => {
    setLoadingEnviar(true);
    addToast('📱 Isa enviando via WhatsApp... digitando para parecer natural!', 'info');
    try {
      const body: Record<string, string> = {};
      if (reportId) body.reportId = reportId;
      if (phoneOverride) body.phone = phoneOverride;

      const r = await fetch(`${API_BASE}/api/marketing/enviar-relatorio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Falha no envio');
      await fetchHistorico();
      await fetchStatus();
      addToast(data.enviado ? `✅ Enviado para ${data.phone}` : '⚠️ WhatsApp indisponível, salvo no painel', data.enviado ? 'success' : 'warning');
    } catch (err: unknown) {
      addToast(`❌ Erro ao enviar: ${err instanceof Error ? err.message : 'desconhecido'}`, 'error');
    } finally {
      setLoadingEnviar(false);
    }
  };

  const handleVerRelatorio = async (id: string) => {
    try {
      const r = await fetch(`${API_BASE}/api/marketing/historico/${id}`);
      if (r.ok) {
        setRelatorioAtual(await r.json());
        setActiveTab('relatorio');
      }
    } catch { /* silencioso */ }
  };

  const handleIdeiaProduto = async () => {
    if (!nomeProduto.trim()) { addToast('Informe o nome do produto', 'warning'); return; }
    setLoadingIdeia(true);
    setIdeiaProduto('');
    addToast('💡 Isa criando ideias para o produto...', 'info');
    try {
      const r = await fetch(`${API_BASE}/api/marketing/ideias/produto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeProduto }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro');
      setIdeiaProduto(data.ideias);
      addToast(`✅ Ideias prontas para: ${nomeProduto}`, 'success');
    } catch (err: unknown) {
      addToast(`❌ ${err instanceof Error ? err.message : 'Erro'}`, 'error');
    } finally {
      setLoadingIdeia(false);
    }
  };

  const handleBuscarNoticias = async () => {
    setLoadingNoticias(true);
    setConteudoNoticias('');
    addToast('📰 Isa buscando notícias (ANVISA, CRF-MG)...', 'info');
    try {
      const r = await fetch(`${API_BASE}/api/marketing/curadoria-noticias`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setConteudoNoticias(data.noticias);
      addToast('✅ Curadoria de notícias pronta!', 'success');
    } catch (err: unknown) {
      addToast(`❌ ${err instanceof Error ? err.message : 'Erro'}`, 'error');
    } finally {
      setLoadingNoticias(false);
    }
  };

  const handleTrendHunting = async () => {
    setLoadingTrends(true);
    setConteudoTrends('');
    addToast('🔥 Isa fazendo trend hunting...', 'info');
    try {
      const r = await fetch(`${API_BASE}/api/marketing/trend-hunting`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setConteudoTrends(data.trends);
      addToast('✅ Trends identificados!', 'success');
    } catch (err: unknown) {
      addToast(`❌ ${err instanceof Error ? err.message : 'Erro'}`, 'error');
    } finally {
      setLoadingTrends(false);
    }
  };

  const handleAlertaClima = async () => {
    if (!climaDescricao.trim()) { addToast('Descreva o clima atual de JF', 'warning'); return; }
    setLoadingClima(true);
    setConteudoClima('');
    addToast(`☁️ Isa criando conteúdo para "${climaDescricao}"...`, 'info');
    try {
      const r = await fetch(`${API_BASE}/api/marketing/alerta-clima`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clima: climaDescricao }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setConteudoClima(data.conteudo);
      addToast('✅ Alerta de clima criado!', 'success');
    } catch (err: unknown) {
      addToast(`❌ ${err instanceof Error ? err.message : 'Erro'}`, 'error');
    } finally {
      setLoadingClima(false);
    }
  };

  const fetchClimaIpiranga = async () => {
    setLoadingIpiranga(true);
    try {
      const r = await fetch(`${API_BASE}/api/marketing/clima-ipiranga`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setPrevisaoIpiranga(data);
    } catch (err: unknown) {
      console.error('Erro clima Ipiranga:', err);
    } finally {
      setLoadingIpiranga(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'clima') {
      fetchClimaIpiranga();
    }
  }, [activeTab]);

  // ─── Utils ──────────────────────────────────────────────────────────────────

  const formatData = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const formatDataHora = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const formatProximoEnvio = (iso: string) => {
    const d = new Date(iso);
    const diasRestantes = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diasRestantes <= 0) return 'Em breve!';
    if (diasRestantes === 1) return 'Amanhã';
    return `Em ${diasRestantes} dias (${formatData(iso)})`;
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Bot },
    { id: 'relatorio', label: 'Relatório', icon: Sparkles },
    { id: 'historico', label: 'Histórico', icon: History },
    { id: 'noticias', label: 'Notícias', icon: Newspaper },
    { id: 'trends', label: 'Trends', icon: TrendingUp },
    { id: 'clima', label: 'Clima JF', icon: CloudRain },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">

      {/* Header — Isa Marketing */}
      <div className="bg-gradient-to-r from-violet-600 via-blue-600 to-teal-500 rounded-3xl p-8 text-white shadow-lg overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="h-20 w-20 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-inner border border-white/20">
              <span className="text-5xl drop-shadow-md">🤖</span>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight mb-1">Isa-Marketing</h1>
              <p className="text-blue-100 font-medium flex items-center gap-2">
                <span>Especialista em Comunicação</span>
                <span className="w-1.5 h-1.5 bg-blue-300 rounded-full" />
                <span>Bela Farma Sul</span>
                <span className="w-1.5 h-1.5 bg-blue-300 rounded-full" />
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> JF/MG</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-4 py-2 bg-emerald-500/20 text-emerald-100 border border-emerald-500/30 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Ativa
            </span>
            <span className="px-4 py-2 bg-white/10 text-white border border-white/20 rounded-full text-xs font-bold uppercase tracking-widest">
              Gemini 1.5 Flash
            </span>
          </div>
        </div>
      </div>

      {/* Frase da Isa */}
      <div className="bg-violet-50 dark:bg-violet-900/10 border-l-4 border-violet-500 p-4 rounded-r-2xl">
        <p className="text-sm font-medium text-violet-700 dark:text-violet-300 italic flex gap-2">
          <span>💬</span>
          <span>&ldquo;Oi! Sou a Isa, sua vizinha especialista em marketing. Aqui você encontra ideias de promoções,
          notícias de saúde, trends virais e conteúdo feito pra JF. Deixa que eu cuido!&rdquo;</span>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-200 dark:border-slate-800">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-violet-100/50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800/30 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div>
        {/* ─── DASHBOARD ─────────────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Cards de status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Próximo Envio Auto</h3>
                </div>
                <div className="text-xl font-black text-slate-900 dark:text-slate-100 mb-1">
                  {loadingStatus ? '...' : status ? formatProximoEnvio(status.proximoEnvio) : '—'}
                </div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{status?.frequencia || 'Segunda-feira às 08:00'}</div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                  <Send className="w-3 h-3" /> {status?.destinatario || '+5532988634755'}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
                    <History className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Último Relatório</h3>
                </div>
                {status?.ultimoRelatorio ? (
                  <>
                    <div className="text-xl font-black text-slate-900 dark:text-slate-100 mb-1">{formatData(status.ultimoRelatorio.createdAt)}</div>
                    <div className={`text-xs font-bold mb-3 ${status.ultimoRelatorio.sentToRosana ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {status.ultimoRelatorio.sentToRosana ? `Enviado em ${formatDataHora(status.ultimoRelatorio.sentAt!)}` : 'Ainda não enviado'}
                    </div>
                    <button 
                      onClick={() => handleVerRelatorio(status.ultimoRelatorio!.id)} 
                      className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors"
                    >
                      Ver detalhes
                    </button>
                  </>
                ) : (
                  <div className="text-sm font-medium text-slate-500 italic">Nenhum relatório gerado ainda</div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Próximas Datas (JF)</h3>
                </div>
                <div className="space-y-3">
                  {datas.slice(0, 3).map((d, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{d.emoji} {d.nome}</span>
                      <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 rounded-md text-[10px] font-black uppercase tracking-wider">
                        Em {d.diasRestantes}d
                      </span>
                    </div>
                  ))}
                  {datas.length === 0 && <div className="text-sm font-medium text-slate-500 italic">Nenhuma data especial nos próximos 30 dias</div>}
                </div>
              </div>
            </div>

            {/* Ações rápidas */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm overflow-hidden relative">
              <div className="absolute -right-12 -top-12 opacity-5">
                <Sparkles className="w-48 h-48" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2 relative z-10">
                🚀 Ações Rápidas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                <div className="p-5 border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 h-16 leading-relaxed">
                    Gera o relatório completo da Isa para os próximos 15 dias:
                    promoções, notícias, trends, banners, calendário e mensagens WhatsApp prontas.
                  </p>
                  <button onClick={handleGerarRelatorio} disabled={loadingGerar} className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                    {loadingGerar ? <span className="animate-spin text-xl">💫</span> : <Sparkles className="w-5 h-5" />}
                    {loadingGerar ? 'Isa trabalhando...' : 'Gerar Relatório Completo'}
                  </button>
                </div>
                
                <div className="p-5 border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 h-16 leading-relaxed">
                    Envia o último/novo relatório via WhatsApp para a Rosana.
                    A Isa usa delay natural para simular digitação real.
                  </p>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Número (se vazio usa o padrão)"
                      value={phoneOverride}
                      onChange={e => setPhoneOverride(e.target.value)}
                      className="px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-slate-100"
                    />
                    <button onClick={() => handleEnviarRelatorio()} disabled={loadingEnviar} className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                      <Send className="w-4 h-4" />
                      {loadingEnviar ? 'Enviando...' : 'Enviar para WhatsApp'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Ideia produto */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm overflow-hidden relative">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2 relative z-10">
                💡 Ideias Rápidas para Produto
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-5 leading-relaxed max-w-2xl relative z-10">
                A Isa cria 3 ideias de promoção baseadas nas tendências com mensagens WhatsApp prontas e roteiros de Reels/Stories.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 relative z-10">
                <input
                  type="text"
                  placeholder="Nome do produto (ex: Vitamina C 1000mg)"
                  value={nomeProduto}
                  onChange={e => setNomeProduto(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleIdeiaProduto()}
                  className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-100"
                />
                <button onClick={handleIdeiaProduto} disabled={loadingIdeia} className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap">
                  {loadingIdeia ? 'Gerando...' : '💡 Gerar Ideias'}
                </button>
              </div>
              {ideiaProduto && (
                <div className="mt-6 p-6 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl max-h-[500px] overflow-y-auto custom-scrollbar">
                  <pre className="text-sm font-medium whitespace-pre-wrap text-slate-700 dark:text-slate-300 font-sans leading-relaxed">{ideiaProduto}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── RELATÓRIO ─────────────────────────────────────────────────────── */}
        {activeTab === 'relatorio' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-wrap gap-4">
              <button onClick={handleGerarRelatorio} disabled={loadingGerar} className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-sm cursor-pointer transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                {loadingGerar ? <span className="animate-spin text-xl">💫</span> : <Sparkles className="w-5 h-5" />}
                {loadingGerar ? 'Isa trabalhando...' : 'Gerar Novo Relatório'}
              </button>
              {relatorioAtual && (
                <button onClick={() => handleEnviarRelatorio(relatorioAtual.id)} disabled={loadingEnviar} className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm cursor-pointer transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                  <Send className="w-5 h-5" />
                  {loadingEnviar ? 'Enviando...' : 'Enviar para WhatsApp'}
                </button>
              )}
            </div>

            {relatorioAtual && (
              <div className="flex gap-4 text-xs font-bold px-4 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">📄 Gerado em {formatDataHora(relatorioAtual.createdAt)}</span>
                {relatorioAtual.sentToRosana && (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Enviado em {formatDataHora(relatorioAtual.sentAt!)}</span>
                )}
              </div>
            )}

            {loadingGerar && (
              <div className="flex flex-col items-center justify-center p-20 gap-6 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
                <div className="w-12 h-12 border-4 border-slate-100 dark:border-slate-800 border-t-violet-600 rounded-full animate-spin" />
                <div className="text-center">
                  <p className="font-bold text-lg text-slate-700 dark:text-slate-300 mb-1">🧠 A Isa está analisando...</p>
                  <p className="text-sm">Buscando produtos empacados, datas e tendências de Juiz de Fora.</p>
                  <p className="text-xs mt-3 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full inline-block">Isso pode levar até 1 minuto</p>
                </div>
              </div>
            )}

            {relatorioAtual && !loadingGerar && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm">
                <pre className="text-sm font-medium whitespace-pre-wrap text-slate-700 dark:text-slate-300 font-sans leading-loose">{relatorioAtual.content}</pre>
              </div>
            )}

            {!relatorioAtual && !loadingGerar && (
              <div className="flex flex-col items-center justify-center p-20 gap-4 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl border-dashed">
                <div className="text-6xl mb-2">🤖</div>
                <h3 className="font-bold text-xl text-slate-700 dark:text-slate-300">Nenhum relatório na tela</h3>
                <p className="text-sm">Clique em "Gerar Novo Relatório" para a Isa criar um plano de 15 dias.</p>
              </div>
            )}
          </div>
        )}

        {/* ─── HISTÓRICO ─────────────────────────────────────────────────────── */}
        {activeTab === 'historico' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
              <History className="w-5 h-5 text-slate-400" />
              Últimos 10 Relatórios da Isa
            </h3>
            {historico.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-16 text-center shadow-sm">
                <div className="text-5xl mb-4">📭</div>
                <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhum histórico encontrado.</p>
              </div>
            ) : historico.map(r => (
              <div key={r.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:border-violet-300 dark:hover:border-violet-800/50">
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-slate-400" />
                    Relatório de {formatData(r.createdAt)}
                  </div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
                    {r.metadata?.totalDatas ?? 0} datas especiais • {r.metadata?.totalProdutos ?? 0} produtos processados
                  </div>
                  {r.metadata?.datas && r.metadata.datas.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {r.metadata.datas.slice(0, 4).map((d, i) => (
                        <span key={i} className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-wider">{d}</span>
                      ))}
                      {r.metadata.datas.length > 4 && (
                        <span className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800/50 text-slate-400 rounded-lg text-[10px] font-bold uppercase">+{r.metadata.datas.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                    r.sentToRosana 
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30' 
                      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/30'
                  }`}>
                    {r.sentToRosana ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {r.sentToRosana ? 'Enviado' : 'Na Fila'}
                  </span>
                  <button onClick={() => handleVerRelatorio(r.id)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors">
                    Abrir
                  </button>
                  {!r.sentToRosana && (
                    <button onClick={() => handleEnviarRelatorio(r.id)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1">
                      <Send className="w-3 h-3" /> Push
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── NOTÍCIAS, TRENDS, CLIMA (Renderização Genérica) ──────────────── */}
        {(activeTab === 'noticias' || activeTab === 'trends' || activeTab === 'clima') && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
              <div className="max-w-xl">
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-200 flex items-center gap-3 mb-2">
                  {activeTab === 'noticias' ? <><Newspaper className="text-blue-500 w-6 h-6"/> Curadoria de Notícias (ANVISA/CRF)</> :
                   activeTab === 'trends' ? <><TrendingUp className="text-rose-500 w-6 h-6"/> Trend Hunting (Virais em Farmácia)</> :
                   <><CloudRain className="text-sky-500 w-6 h-6"/> Alerta de Clima (Juiz de Fora)</>}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  {activeTab === 'noticias' ? 'A Isa monitora portais de saúde e traduz novidades técnicas para linguagem simples com mensagens prontas para WhatsApp.' :
                   activeTab === 'trends' ? 'Descubra os áudios e vídeos que estão bombando no Reels/TikTok e como usar os produtos da Bela Farma Sul na trend.' :
                   'Descreva o clima de JF hoje e a Isa cria mensagens de WhatsApp e Instagram com dicas de saúde baseadas no tempo.'}
                </p>
              </div>

              {activeTab === 'noticias' && (
                <button onClick={handleBuscarNoticias} disabled={loadingNoticias} className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all whitespace-nowrap">
                  {loadingNoticias ? 'Buscando...' : 'Atualizar Notícias'}
                </button>
              )}
              {activeTab === 'trends' && (
                <button onClick={handleTrendHunting} disabled={loadingTrends} className="flex items-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md transition-all whitespace-nowrap">
                  {loadingTrends ? 'Caçando...' : 'Buscar Novas Trends'}
                </button>
              )}
            </div>

            {activeTab === 'clima' && (
              <div className="space-y-6">
                {/* Card de Clima Automático Ipiranga */}
                <div className="bg-gradient-to-br from-sky-500 to-blue-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
                  <div className="absolute -right-10 -top-10 opacity-20">
                    <CloudRain className="w-40 h-40 text-white" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
                        <MapPin className="w-5 h-5 text-white" />
                      </div>
                      <h4 className="font-bold text-lg">Previsão Ipiranga (JF)</h4>
                    </div>

                    {loadingIpiranga ? (
                      <div className="flex items-center gap-3 animate-pulse">
                        <div className="w-4 h-4 bg-white/40 rounded-full animate-bounce" />
                        <p className="text-sm font-medium opacity-80">Isa consultando os céus do Ipiranga...</p>
                      </div>
                    ) : previsaoIpiranga ? (
                      <div className="space-y-4">
                        <div className="p-4 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10">
                           <pre className="text-sm font-medium whitespace-pre-wrap font-sans leading-relaxed text-blue-50">
                            {previsaoIpiranga.conteudo}
                          </pre>
                        </div>
                        <div className="flex justify-end">
                            <button onClick={fetchClimaIpiranga} className="text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors">
                              🔄 Atualizar Agora
                            </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm opacity-80 italic">Não foi possível carregar a previsão automática no momento.</p>
                    )}
                  </div>
                </div>

                {/* Seção Manual */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-4 uppercase tracking-widest">
                    Gerar alerta para outro cenário
                  </h4>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      placeholder="Ex: chovendo muito e frio, calor extremo, tempo seco..."
                      value={climaDescricao}
                      onChange={e => setClimaDescricao(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAlertaClima()}
                      className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-sky-500 outline-none text-slate-900 dark:text-slate-100"
                    />
                    <button onClick={handleAlertaClima} disabled={loadingClima} className="flex items-center justify-center gap-2 px-8 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-md transition-all whitespace-nowrap">
                      {loadingClima ? 'Gerando...' : 'Gerar Alerta'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {['Frio e garoa ☔', 'Calorão 🌞', 'Tempo muito seco 💧', 'Frio de rachar 🧣', 'Variado (sol e chuva) 🌦️'].map(c => (
                      <button key={c} onClick={() => setClimaDescricao(c.split(' ').slice(0, 3).join(' ').trim())} className="px-4 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-sky-300 rounded-full text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors">
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Conteúdos */}
            {((activeTab === 'noticias' && loadingNoticias) || 
              (activeTab === 'trends' && loadingTrends) || 
              (activeTab === 'clima' && loadingClima)) && (
              <div className="flex flex-col items-center justify-center p-20 gap-4 text-slate-500">
                <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-current rounded-full animate-spin text-slate-400" />
                <p className="font-bold text-slate-700 dark:text-slate-300 mt-2">A Isa está vasculhando a internet...</p>
              </div>
            )}

            {((activeTab === 'noticias' && conteudoNoticias && !loadingNoticias) ||
              (activeTab === 'trends' && conteudoTrends && !loadingTrends) ||
              (activeTab === 'clima' && conteudoClima && !loadingClima)) && (
              <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 md:p-8">
                <pre className="text-sm font-medium whitespace-pre-wrap text-slate-700 dark:text-slate-300 font-sans leading-relaxed">
                  {activeTab === 'noticias' ? conteudoNoticias : activeTab === 'trends' ? conteudoTrends : conteudoClima}
                </pre>
              </div>
            )}

            {((activeTab === 'noticias' && !conteudoNoticias && !loadingNoticias) ||
              (activeTab === 'trends' && !conteudoTrends && !loadingTrends) ||
              (activeTab === 'clima' && !conteudoClima && !loadingClima)) && (
              <div className="flex flex-col items-center justify-center p-16 gap-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30">
                <div className="text-5xl opacity-80 mb-2">
                  {activeTab === 'noticias' ? '📰' : activeTab === 'trends' ? '📱' : '🌤️'}
                </div>
                <h4 className="font-bold text-slate-700 dark:text-slate-300 text-lg">Nada gerado ainda</h4>
                <p className="text-sm text-slate-500 max-w-sm">Use o botão acima para a Isa buscar o conteúdo e preparar os textos.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
