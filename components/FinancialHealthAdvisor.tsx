
import React, { useState, useEffect, useCallback } from 'react';
import {
  HeartPulse, Sparkles, Loader2, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Lightbulb, ShoppingCart,
  Target, BarChart3, DollarSign, CreditCard,
  Clock, Zap, RefreshCw, ChevronDown, ChevronUp,
  Activity, CircleDollarSign, Banknote, Rocket
} from 'lucide-react';
import { useToast } from './ToastContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Snapshot {
  periodo: { days: number; cutoffStr: string; currentMonth: string };
  faturamento: {
    total: number; mediaDiaria: number; diasComFechamento: number;
    credito: number; debito: number; pix: number; despesasOperacionais: number;
  };
  contasFixas: {
    total: number; pagas: number; pendentes: number;
    lista: { nome: string; valor: number; status: string }[];
  };
  boletos: {
    totalVencidos: number; totalAVencer: number;
    qtdVencidos: number; qtdAVencer: number;
    porFornecedor: Record<string, number>;
  };
  fogueteAmarelo: { total: number; vencido: number; qtd: number };
  compras: { total: number; porDistribuidora: Record<string, number>; qtdPedidos: number };
  kpis: { margemBrutaPercent: number; pontoEquilibrio: number; totalDespesasTotal: number; saldoEstimado: number };
}

interface Alerta {
  nivel: 'critico' | 'atencao' | 'info';
  titulo: string;
  descricao: string;
  acao: string;
}

interface PlanoAcao {
  prioridade: number;
  titulo: string;
  descricao: string;
  impactoEstimado: string;
  prazo: string;
}

interface Analysis {
  resumoExecutivo?: {
    status: string;
    emoji: string;
    frase: string;
    faturamentoVsDespesas: string;
    pontoEquilibrio: string;
  };
  diagnostico?: {
    margemReal: string;
    fluxoDeCaixa: string;
    endividamento: string;
  };
  alertas?: Alerta[];
  estrategiaCompra?: {
    analise: string;
    fornecedorRisco: string;
    recomendacao: string;
  };
  planoAcao?: PlanoAcao[];
  dicasDeOuro?: string[];
  raw?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const pct = (v: number) => `${(v || 0).toFixed(1)}%`;

// ─── Component ───────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: '30 dias', value: 30 },
  { label: '60 dias', value: 60 },
  { label: '90 dias', value: 90 },
];

export const FinancialHealthAdvisor: React.FC = () => {
  const { addToast } = useToast();
  const [period, setPeriod] = useState(30);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [expandedAlerta, setExpandedAlerta] = useState<number | null>(null);
  const [showFixedList, setShowFixedList] = useState(false);

  // Busca snapshot (KPIs rápidos) ao montar e trocar período
  const fetchSnapshot = useCallback(async () => {
    setLoadingSnapshot(true);
    try {
      const res = await fetch(`/api/financial-health/snapshot?days=${period}`);
      if (res.ok) setSnapshot(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSnapshot(false);
    }
  }, [period]);

  useEffect(() => { fetchSnapshot(); }, [fetchSnapshot]);

  // Dispara análise IA
  const handleAnalyze = async () => {
    setLoadingAnalysis(true);
    setAnalysis(null);
    addToast('🤖 Gemini analisando sua saúde financeira...', 'info');
    try {
      const res = await fetch('/api/financial-health/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSnapshot(data.snapshot);
      setAnalysis(data.analysis);
      addToast('✅ Diagnóstico financeiro concluído!', 'success');
    } catch (err: any) {
      addToast(`❌ ${err.message}`, 'error');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const statusColor = (status?: string) => {
    if (status === 'Crítico') return 'text-red-600';
    if (status === 'Atenção') return 'text-amber-600';
    return 'text-emerald-600';
  };

  const nivelAlerta = {
    critico: { bg: 'bg-red-50 border-red-300', dot: 'bg-red-500', text: 'text-red-700', badge: 'CRÍTICO' },
    atencao: { bg: 'bg-amber-50 border-amber-300', dot: 'bg-amber-500', text: 'text-amber-700', badge: 'ATENÇÃO' },
    info:    { bg: 'bg-blue-50 border-blue-200',   dot: 'bg-blue-400', text: 'text-blue-700',  badge: 'INFO' },
  };

  const prazoColor: Record<string, string> = {
    'Esta semana': 'bg-red-100 text-red-700',
    'Este mês':    'bg-amber-100 text-amber-700',
    'Próximo trimestre': 'bg-blue-100 text-blue-700',
  };

  const saldoPositivo = (snapshot?.kpis.saldoEstimado || 0) >= 0;

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-16">

      {/* ── Hero Header ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white p-8 shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(59,130,246,0.25),_transparent_60%)]" />
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
              <HeartPulse className="w-8 h-8 text-blue-300" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Saúde Financeira</h1>
              <p className="text-blue-300 font-medium text-sm mt-0.5">
                Consultor Financeiro IA — Bela Farma Sul
              </p>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex bg-white/10 border border-white/20 rounded-2xl p-1 gap-1">
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setPeriod(opt.value); setAnalysis(null); }}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    period === opt.value
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleAnalyze}
              disabled={loadingAnalysis}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-500/30 hover:from-blue-600 hover:to-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingAnalysis
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analisando...</>
                : <><Sparkles className="w-4 h-4" /> Gerar Diagnóstico</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards (sempre visíveis) ──────────────────────────────────── */}
      {loadingSnapshot ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-slate-100 rounded-[1.5rem] h-28 animate-pulse" />
          ))}
        </div>
      ) : snapshot ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Faturamento */}
          <div className="bg-white rounded-[1.5rem] border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-emerald-100 rounded-xl"><TrendingUp className="w-4 h-4 text-emerald-600" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Faturamento</span>
            </div>
            <p className="text-2xl font-black text-slate-900">{fmt(snapshot.faturamento.total)}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">
              Média {fmt(snapshot.faturamento.mediaDiaria)}/dia
            </p>
          </div>

          {/* Compromissos */}
          <div className="bg-white rounded-[1.5rem] border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-red-100 rounded-xl"><TrendingDown className="w-4 h-4 text-red-600" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Compromissos</span>
            </div>
            <p className="text-2xl font-black text-red-700">{fmt(snapshot.kpis.totalDespesasTotal)}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">
              Fixas + Boletos + Foguete
            </p>
          </div>

          {/* Saldo Estimado */}
          <div className={`rounded-[1.5rem] border p-5 shadow-sm ${saldoPositivo ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-2 rounded-xl ${saldoPositivo ? 'bg-emerald-200' : 'bg-red-200'}`}>
                <CircleDollarSign className={`w-4 h-4 ${saldoPositivo ? 'text-emerald-700' : 'text-red-700'}`} />
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Estimado</span>
            </div>
            <p className={`text-2xl font-black ${saldoPositivo ? 'text-emerald-700' : 'text-red-700'}`}>
              {fmt(snapshot.kpis.saldoEstimado)}
            </p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">
              Margem bruta: {pct(snapshot.kpis.margemBrutaPercent)}
            </p>
          </div>

          {/* Boletos Vencidos */}
          <div className={`rounded-[1.5rem] border p-5 shadow-sm ${snapshot.boletos.totalVencidos > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-2 rounded-xl ${snapshot.boletos.totalVencidos > 0 ? 'bg-red-200' : 'bg-slate-100'}`}>
                <AlertTriangle className={`w-4 h-4 ${snapshot.boletos.totalVencidos > 0 ? 'text-red-700' : 'text-slate-400'}`} />
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Boletos Vencidos</span>
            </div>
            <p className={`text-2xl font-black ${snapshot.boletos.totalVencidos > 0 ? 'text-red-700' : 'text-slate-500'}`}>
              {fmt(snapshot.boletos.totalVencidos)}
            </p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">
              {snapshot.boletos.qtdVencidos} boleto(s) em atraso
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Detalhes Financeiros (Painel secundário sempre visível) ──────── */}
      {snapshot && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Contas Fixas */}
          <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-blue-500" />
                <span className="font-black text-slate-900 text-sm uppercase tracking-tight">Contas Fixas</span>
              </div>
              <button onClick={() => setShowFixedList(!showFixedList)} className="text-slate-400 hover:text-slate-600">
                {showFixedList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between">
                <span className="text-xs text-slate-500 font-bold">Total mês</span>
                <span className="font-black text-slate-900">{fmt(snapshot.contasFixas.total)}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min(100, (snapshot.contasFixas.pagas / (snapshot.contasFixas.total || 1)) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[10px] font-bold">
                <span className="text-emerald-600">Pago: {fmt(snapshot.contasFixas.pagas)}</span>
                <span className="text-red-500">Pendente: {fmt(snapshot.contasFixas.pendentes)}</span>
              </div>
              {showFixedList && (
                <div className="space-y-1.5 mt-3 border-t border-slate-100 pt-3">
                  {snapshot.contasFixas.lista.map((c, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-xs text-slate-600 font-bold truncate">{c.nome}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900">{fmt(c.valor)}</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${c.status === 'Pago' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {c.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Boletos por Fornecedor */}
          <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-red-500" />
              <span className="font-black text-slate-900 text-sm uppercase tracking-tight">Boletos Pendentes</span>
            </div>
            <div className="p-5 space-y-2">
              <div className="flex justify-between mb-3">
                <span className="text-xs text-slate-500 font-bold">A vencer</span>
                <span className="font-black text-slate-900">{fmt(snapshot.boletos.totalAVencer)}</span>
              </div>
              {(Object.entries(snapshot.boletos.porFornecedor) as [string, number][])
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([nome, val], i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-600 font-bold truncate flex-1">{nome}</span>
                    <span className="text-xs font-black text-red-700 flex-shrink-0">{fmt(val as number)}</span>
                  </div>
                ))}
              {Object.keys(snapshot.boletos.porFornecedor).length === 0 && (
                <p className="text-xs text-slate-400 font-bold text-center py-4">✅ Sem boletos pendentes</p>
              )}
            </div>
          </div>

          {/* Foguete Amarelo + Ponto de Equilíbrio */}
          <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center gap-2">
              <Rocket className="w-4 h-4 text-amber-500" />
              <span className="font-black text-slate-900 text-sm uppercase tracking-tight">Foguete Amarelo</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-between">
                <span className="text-xs text-slate-500 font-bold">Saldo restante</span>
                <span className="font-black text-amber-700">{fmt(snapshot.fogueteAmarelo.total)}</span>
              </div>
              {snapshot.fogueteAmarelo.vencido > 0 && (
                <div className="flex justify-between">
                  <span className="text-xs text-red-500 font-bold">⚠ Vencido</span>
                  <span className="font-black text-red-700">{fmt(snapshot.fogueteAmarelo.vencido)}</span>
                </div>
              )}
              <div className="h-px bg-slate-100" />
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Ponto de Equilíbrio</span>
              </div>
              <p className="text-xl font-black text-blue-700">{fmt(snapshot.kpis.pontoEquilibrio)}</p>
              <p className="text-[10px] text-slate-400 font-bold">Venda mínima para cobrir fixas</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Análise IA ───────────────────────────────────────────────────── */}
      {loadingAnalysis && (
        <div className="bg-gradient-to-br from-blue-50 to-slate-50 border border-blue-100 rounded-[2rem] p-16 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
            <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-blue-600" />
          </div>
          <p className="font-black text-slate-700 uppercase tracking-widest text-sm">Gemini analisando seus dados...</p>
          <p className="text-xs text-slate-400 font-bold">consultando {period} dias de histórico</p>
        </div>
      )}

      {analysis && !loadingAnalysis && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">

          {/* ── Resumo Executivo ───────────────────────────────────────── */}
          {analysis.resumoExecutivo && (
            <div className={`rounded-[2rem] p-8 border shadow-sm ${
              analysis.resumoExecutivo.status === 'Crítico' ? 'bg-red-50 border-red-200' :
              analysis.resumoExecutivo.status === 'Atenção'  ? 'bg-amber-50 border-amber-200' :
              'bg-emerald-50 border-emerald-200'
            }`}>
              <div className="flex items-start gap-4">
                <span className="text-5xl">{analysis.resumoExecutivo.emoji}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-black text-slate-900">Resumo Executivo</h2>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      analysis.resumoExecutivo.status === 'Crítico' ? 'bg-red-200 text-red-800' :
                      analysis.resumoExecutivo.status === 'Atenção'  ? 'bg-amber-200 text-amber-800' :
                      'bg-emerald-200 text-emerald-800'
                    }`}>
                      {analysis.resumoExecutivo.status}
                    </span>
                  </div>
                  <p className={`text-lg font-bold mb-4 ${statusColor(analysis.resumoExecutivo.status)}`}>
                    {analysis.resumoExecutivo.frase}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white/70 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        <BarChart3 className="w-3 h-3 inline mr-1" />Faturamento vs Despesas
                      </p>
                      <p className="text-sm font-bold text-slate-700">{analysis.resumoExecutivo.faturamentoVsDespesas}</p>
                    </div>
                    <div className="bg-white/70 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        <Target className="w-3 h-3 inline mr-1" />Ponto de Equilíbrio
                      </p>
                      <p className="text-sm font-bold text-slate-700">{analysis.resumoExecutivo.pontoEquilibrio}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Diagnóstico ────────────────────────────────────────────── */}
          {analysis.diagnostico && (
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-8 py-5 border-b border-slate-100 flex items-center gap-3">
                <Activity className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-900 uppercase tracking-tighter text-base">Diagnóstico de Saúde</h3>
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Margem Real
                  </p>
                  <p className="text-sm font-bold text-slate-700 leading-relaxed">{analysis.diagnostico.margemReal}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Fluxo de Caixa
                  </p>
                  <p className="text-sm font-bold text-slate-700 leading-relaxed">{analysis.diagnostico.fluxoDeCaixa}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <CreditCard className="w-3 h-3" /> Endividamento
                  </p>
                  <p className="text-sm font-bold text-slate-700 leading-relaxed">{analysis.diagnostico.endividamento}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Alertas ────────────────────────────────────────────────── */}
          {analysis.alertas && analysis.alertas.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" /> Alertas de Custo ({analysis.alertas.length})
              </h3>
              {analysis.alertas.map((alerta, idx) => {
                const cfg = nivelAlerta[alerta.nivel] || nivelAlerta.info;
                const isOpen = expandedAlerta === idx;
                return (
                  <div key={idx} className={`rounded-2xl border ${cfg.bg} overflow-hidden`}>
                    <button
                      onClick={() => setExpandedAlerta(isOpen ? null : idx)}
                      className="w-full flex items-center gap-4 p-5 text-left"
                    >
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} border-current`}>
                            {cfg.badge}
                          </span>
                          <span className={`font-black text-sm ${cfg.text}`}>{alerta.titulo}</span>
                        </div>
                      </div>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 space-y-3 animate-in slide-in-from-top-2 duration-200">
                        <p className={`text-sm font-bold ${cfg.text} leading-relaxed`}>{alerta.descricao}</p>
                        <div className="bg-white/70 rounded-xl p-3 flex items-start gap-2">
                          <Zap className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs font-black text-blue-700">{alerta.acao}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Estratégia de Compra ───────────────────────────────────── */}
          {analysis.estrategiaCompra && (
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-8 py-5 border-b border-slate-100 flex items-center gap-3">
                <ShoppingCart className="w-5 h-5 text-violet-600" />
                <h3 className="font-black text-slate-900 uppercase tracking-tighter text-base">Estratégia de Compra</h3>
              </div>
              <div className="p-8 space-y-4">
                <p className="text-sm font-bold text-slate-700 leading-relaxed">{analysis.estrategiaCompra.analise}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">⚠ Fornecedor de Risco</p>
                    <p className="text-sm font-bold text-slate-700">{analysis.estrategiaCompra.fornecedorRisco}</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">💡 Recomendação</p>
                    <p className="text-sm font-bold text-slate-700">{analysis.estrategiaCompra.recomendacao}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Plano de Ação ──────────────────────────────────────────── */}
          {analysis.planoAcao && analysis.planoAcao.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Plano de Ação — {analysis.planoAcao.length} dicas práticas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {analysis.planoAcao.map((acao, idx) => (
                  <div key={idx} className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm p-6 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0">
                        {acao.prioridade}
                      </div>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${prazoColor[acao.prazo] || 'bg-slate-100 text-slate-600'}`}>
                        <Clock className="w-2.5 h-2.5 inline mr-0.5" />{acao.prazo}
                      </span>
                    </div>
                    <h4 className="font-black text-slate-900 text-sm leading-tight">{acao.titulo}</h4>
                    <p className="text-xs font-bold text-slate-500 leading-relaxed flex-1">{acao.descricao}</p>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                      <p className="text-[10px] font-black text-emerald-700">💰 {acao.impactoEstimado}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Dicas de Ouro ──────────────────────────────────────────── */}
          {analysis.dicasDeOuro && analysis.dicasDeOuro.length > 0 && (
            <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-[2rem] p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 bg-amber-400 rounded-xl">
                  <Lightbulb className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-black text-amber-900 uppercase tracking-tight text-base">Dicas de Ouro</h3>
                <p className="text-xs text-amber-600 font-bold">Ideias disruptivas para aumentar a rentabilidade</p>
              </div>
              <div className="space-y-3">
                {analysis.dicasDeOuro.map((dica, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-white/70 rounded-2xl p-4">
                    <span className="text-amber-500 font-black text-base flex-shrink-0">✦</span>
                    <p className="text-sm font-bold text-slate-700 leading-relaxed">{dica}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Texto raw se não houver JSON estruturado */}
          {analysis.raw && !analysis.resumoExecutivo && (
            <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8">
              <pre className="text-sm font-medium whitespace-pre-wrap text-slate-700 font-sans leading-relaxed">
                {analysis.raw}
              </pre>
            </div>
          )}

          {/* Atualizar */}
          <div className="flex justify-center">
            <button
              onClick={handleAnalyze}
              className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all"
            >
              <RefreshCw className="w-4 h-4" /> Nova análise
            </button>
          </div>
        </div>
      )}

      {/* Estado inicial — sem análise ainda */}
      {!analysis && !loadingAnalysis && snapshot && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-blue-400" />
          </div>
          <p className="font-black text-slate-600 uppercase tracking-widest text-sm">
            Clique em "Gerar Diagnóstico" para análise completa
          </p>
          <p className="text-xs text-slate-400 font-bold max-w-md">
            O Gemini vai analisar {snapshot.faturamento.diasComFechamento} fechamentos,{' '}
            {snapshot.contasFixas.lista.length} contas fixas,{' '}
            {snapshot.boletos.qtdVencidos + snapshot.boletos.qtdAVencer} boletos e{' '}
            {snapshot.fogueteAmarelo.qtd} título(s) do Foguete Amarelo.
          </p>
        </div>
      )}

    </div>
  );
};
