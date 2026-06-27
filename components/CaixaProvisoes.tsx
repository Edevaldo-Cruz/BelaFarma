
import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, RefreshCw, Loader2,
  ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2,
  ShoppingBasket, RotateCcw, Receipt, DollarSign,
  ArrowUpRight, ArrowDownRight, Info, Package,
  CreditCard, Landmark, QrCode, Banknote, Scale,
  ChevronDown, ChevronUp, Building2, Users, Archive
} from 'lucide-react';
import { useToast } from './ToastContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CaixaMinimoData {
  caixaMinimo: number;
  situacao: 'Saudável' | 'Atenção' | 'Crítico';
  saldoCaixaAtual: number;
  diferenca: number;
  diasCobertura: number;
  composicao: {
    despesasFixasMensais: number;
    boletosAVencer30dias: number;
    mediaComprasMensais: number;
    foguetePendente30dias: number;
    totalBaseMensal: number;
  };
  detalhes: {
    contasFixas: { nome: string; valor: number; status: string }[];
    boletosVencendo: { fornecedor: string; vencimento: string; valor: number }[];
  };
}

interface DREData {
  mes: string;
  periodo: { startDate: string; endDate: string; diasComFechamento: number };
  dre: {
    receitaBruta: number;
    cmv: number;
    lucroBruto: number;
    margemBruta: number;
    despesasFixas: number;
    despesasOperacionais: number;
    boletosPagos: number;
    despesasTotal: number;
    lucroLiquido: number;
    margemLiquida: number;
  };
  breakdown: { credito: number; debito: number; pix: number; dinheiro: number; crediario: number };
  usouCMVReal: boolean;
}

interface IndicadoresData {
  periodo: { days: number; cutoffStr: string };
  ticketMedio: {
    valor: number;
    qtdVendas: number;
    totalVendas: number;
    evolucao: { data: string; ticket: number; qtd: number; total: number }[];
  };
  giroEstoque: {
    giro: number;
    interpretacao: string;
    cmvPeriodo: number;
    valorEstoqueAtual: number;
    qtdProdutosEstoque: number;
    diasEstoque: number;
  };
}

interface BalanceteDetalheItem {
  fornecedor?: string;
  cliente?: string;
  nome?: string;
  valor: number;
  qtd?: number;
  qtdCompras?: number;
  status?: string;
  vencimento?: string;
  compraAntiga?: string;
  itens?: { vencimento?: string; valor: number; status?: string; descricao?: string }[];
}

interface BalanceteData {
  modo: 'atual' | 'mensal';
  referencia: string;
  ativo: {
    total: number;
    disponivel: { caixa: number; cofre: number; totalDisponivel: number; ultimoFechamento: string | null };
    estoque: { valor: number; qtdProdutos: number; fonte?: string };
    crediario: { total: number; fonte: string; detalhes: BalanceteDetalheItem[] };
  };
  passivo: {
    total: number;
    boletos: { total: number; detalhes: BalanceteDetalheItem[] };
    fogueteAmarelo: { total: number; detalhes: BalanceteDetalheItem[] };
    contasFixas: { total: number; mes: string; detalhes: BalanceteDetalheItem[] };
  };
  patrimonioLiquido: number;
  situacao: 'Saudável' | 'Atenção' | 'Crítico';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const pct = (v: number) => `${(v || 0).toFixed(1)}%`;

const getMonthOptions = () => {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.toISOString().slice(0, 7);
    const label = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    opts.push({ val, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
};

// ─── Mini Sparkline ───────────────────────────────────────────────────────────

const Sparkline: React.FC<{ data: number[]; color?: string }> = ({ data, color = '#3b82f6' }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120, h = 40;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h * 0.8 - h * 0.1;
    return `${x},${y}`;
  }).join(' ');
  const lastPt = pts.split(' ').at(-1) || '0,0';
  const [lastX, lastY] = lastPt.split(',');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="3" fill={color} />
    </svg>
  );
};


// ─── Component ────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: '30 dias', value: 30 },
  { label: '60 dias', value: 60 },
  { label: '90 dias', value: 90 },
];

export const CaixaProvisoes: React.FC = () => {
  const { addToast } = useToast();
  const monthOptions = getMonthOptions();

  const [activeTab, setActiveTab] = useState<'caixa' | 'dre' | 'indicadores' | 'balancete'>('caixa');
  const [period, setPeriod]   = useState(30);
  const [dreMonth, setDreMonth] = useState(monthOptions[0].val);

  const [caixaData, setCaixaData]         = useState<CaixaMinimoData | null>(null);
  const [dreData, setDreData]             = useState<DREData | null>(null);
  const [indicData, setIndicData]         = useState<IndicadoresData | null>(null);
  const [balanceteData, setBalanceteData] = useState<BalanceteData | null>(null);

  const [loadingCaixa, setLoadingCaixa]       = useState(false);
  const [loadingDre, setLoadingDre]           = useState(false);
  const [loadingIndic, setLoadingIndic]       = useState(false);
  const [loadingBalancete, setLoadingBalancete] = useState(false);

  const [balanceteMode, setBalanceteMode] = useState<'atual' | 'mensal'>('atual');
  const [balanceteMonth, setBalanceteMonth] = useState(monthOptions[0].val);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchCaixa = useCallback(async () => {
    setLoadingCaixa(true);
    try {
      const res = await fetch('/api/financial-health/caixa-minimo');
      if (!res.ok) throw new Error((await res.json()).error);
      setCaixaData(await res.json());
    } catch (e: any) {
      addToast(`❌ Caixa Mínimo: ${e.message}`, 'error');
    } finally { setLoadingCaixa(false); }
  }, [addToast]);

  const fetchDre = useCallback(async () => {
    setLoadingDre(true);
    try {
      const res = await fetch(`/api/financial-health/dre?month=${dreMonth}`);
      if (!res.ok) throw new Error((await res.json()).error);
      setDreData(await res.json());
    } catch (e: any) {
      addToast(`❌ DRE: ${e.message}`, 'error');
    } finally { setLoadingDre(false); }
  }, [dreMonth, addToast]);

  const fetchIndicadores = useCallback(async () => {
    setLoadingIndic(true);
    try {
      const res = await fetch(`/api/financial-health/indicadores?days=${period}`);
      if (!res.ok) throw new Error((await res.json()).error);
      setIndicData(await res.json());
    } catch (e: any) {
      addToast(`❌ Indicadores: ${e.message}`, 'error');
    } finally { setLoadingIndic(false); }
  }, [period, addToast]);

  const fetchBalancete = useCallback(async () => {
    setLoadingBalancete(true);
    try {
      const url = balanceteMode === 'atual'
        ? '/api/financial-health/balancete'
        : `/api/financial-health/balancete?month=${balanceteMonth}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json()).error);
      setBalanceteData(await res.json());
    } catch (e: any) {
      addToast(`❌ Balancete: ${e.message}`, 'error');
    } finally { setLoadingBalancete(false); }
  }, [balanceteMode, balanceteMonth, addToast]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Load on mount and tab change
  useEffect(() => { fetchCaixa(); }, [fetchCaixa]);
  useEffect(() => { if (activeTab === 'dre') fetchDre(); }, [activeTab, fetchDre]);
  useEffect(() => { if (activeTab === 'indicadores') fetchIndicadores(); }, [activeTab, fetchIndicadores]);
  useEffect(() => { if (activeTab === 'balancete') fetchBalancete(); }, [activeTab, fetchBalancete]);

  // ── Semaphore helper ──────────────────────────────────────────────────────

  const situacaoConfig = (s?: string) => ({
    'Saudável': { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
    'Atenção':  { bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-800'   },
    'Crítico':  { bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500',     text: 'text-red-700',     badge: 'bg-red-100 text-red-800'       },
  }[s || 'Crítico'] ?? { bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500', text: 'text-red-700', badge: 'bg-red-100 text-red-800' });

  const tabs = [
    { id: 'caixa'       as const, label: '💰 Caixa Mínimo',   icon: Wallet    },
    { id: 'dre'         as const, label: '📊 DRE Mensal',      icon: Receipt   },
    { id: 'indicadores' as const, label: '📈 Indicadores',     icon: TrendingUp },
    { id: 'balancete'   as const, label: '⚖️ Balancete',       icon: Scale     },
  ];

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-16">

      {/* ── Hero Header ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-emerald-900 via-teal-950 to-slate-900 text-white p-8 shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.25),_transparent_60%)]" />
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
              <Wallet className="w-8 h-8 text-emerald-300" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Caixa & Provisões</h1>
              <p className="text-emerald-300 font-medium text-sm mt-0.5">
                DRE · Caixa Mínimo · Ticket Médio · Giro de Estoque
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              fetchCaixa();
              if (activeTab === 'dre') fetchDre();
              if (activeTab === 'indicadores') fetchIndicadores();
              if (activeTab === 'balancete') fetchBalancete();
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/10 border border-white/20 text-white rounded-2xl font-bold text-sm hover:bg-white/20 transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 bg-slate-100 rounded-2xl p-1.5">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: CAIXA MÍNIMO
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'caixa' && (
        <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
          {loadingCaixa ? (
            <div className="flex items-center justify-center h-60">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
          ) : caixaData ? (
            <>
              {/* Semáforo principal */}
              {(() => {
                const cfg = situacaoConfig(caixaData.situacao);
                return (
                  <div className={`rounded-[2rem] border p-8 ${cfg.bg} ${cfg.border}`}>
                    <div className="flex flex-col md:flex-row md:items-center gap-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-5 h-5 rounded-full ${cfg.dot} ring-4 ring-offset-2 ring-current/20 animate-pulse`} />
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-2xl font-black text-slate-900">Caixa Mínimo Operacional</h2>
                            <span className={`text-[10px] font-black px-3 py-1 rounded-full ${cfg.badge}`}>
                              {caixaData.situacao}
                            </span>
                          </div>
                          <p className={`text-sm font-bold ${cfg.text}`}>
                            {caixaData.situacao === 'Saudável'
                              ? `✅ Você tem ${fmt(caixaData.diferenca)} acima do necessário`
                              : caixaData.situacao === 'Atenção'
                              ? `⚠️ Margem estreita — faltam ${fmt(Math.abs(caixaData.diferenca))} para conforto`
                              : `🚨 Faltam ${fmt(Math.abs(caixaData.diferenca))} para cobrir ${caixaData.diasCobertura} dias`
                            }
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-6 ml-auto">
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Caixa Mínimo</p>
                          <p className="text-2xl font-black text-slate-900">{fmt(caixaData.caixaMinimo)}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{caixaData.diasCobertura} dias de cobertura</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Atual</p>
                          <p className={`text-2xl font-black ${cfg.text}`}>{fmt(caixaData.saldoCaixaAtual)}</p>
                          <p className="text-[10px] text-slate-400 font-bold">no cofre</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Composição do Caixa Mínimo */}
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-100 flex items-center gap-3">
                  <Info className="w-4 h-4 text-blue-500" />
                  <h3 className="font-black text-slate-900 uppercase tracking-tighter text-sm">
                    Como o caixa mínimo foi calculado
                  </h3>
                </div>
                <div className="p-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {[
                      { label: 'Despesas Fixas/mês', val: caixaData.composicao.despesasFixasMensais, icon: Landmark, color: 'blue' },
                      { label: 'Boletos (próx. 30d)', val: caixaData.composicao.boletosAVencer30dias, icon: Receipt, color: 'red' },
                      { label: 'Média Compras/mês', val: caixaData.composicao.mediaComprasMensais, icon: ShoppingBasket, color: 'violet' },
                      { label: 'Foguete Amarelo', val: caixaData.composicao.foguetePendente30dias, icon: Package, color: 'amber' },
                    ].map((item, i) => (
                      <div key={i} className="bg-slate-50 rounded-2xl p-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{item.label}</p>
                        <p className="text-lg font-black text-slate-900">{fmt(item.val)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-slate-900 text-white rounded-2xl p-5 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        Fórmula: (Total Base Mensal ÷ 30) × {caixaData.diasCobertura} dias
                      </p>
                      <p className="text-sm font-bold text-slate-300">
                        ({fmt(caixaData.composicao.totalBaseMensal)} ÷ 30) × {caixaData.diasCobertura}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">= Caixa Mínimo</p>
                      <p className="text-2xl font-black text-white">{fmt(caixaData.caixaMinimo)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detalhes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contas Fixas */}
                <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-blue-500" />
                    <span className="font-black text-slate-900 text-sm uppercase tracking-tight">Contas Fixas do Mês</span>
                  </div>
                  <div className="p-4 space-y-2 max-h-48 overflow-y-auto">
                    {caixaData.detalhes.contasFixas.length === 0
                      ? <p className="text-xs text-slate-400 text-center py-4">Nenhuma conta fixa cadastrada</p>
                      : caixaData.detalhes.contasFixas.map((c, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <span className="text-xs text-slate-600 font-bold truncate flex-1">{c.nome}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">{fmt(c.valor)}</span>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${c.status === 'Pago' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {c.status}
                            </span>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>

                {/* Boletos vencendo */}
                <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="font-black text-slate-900 text-sm uppercase tracking-tight">Boletos Vencendo (30d)</span>
                  </div>
                  <div className="p-4 space-y-2 max-h-48 overflow-y-auto">
                    {caixaData.detalhes.boletosVencendo.length === 0
                      ? <p className="text-xs text-slate-400 text-center py-4 flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Sem boletos vencendo</p>
                      : caixaData.detalhes.boletosVencendo.map((b, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <div>
                            <p className="text-xs text-slate-700 font-bold truncate">{b.fornecedor}</p>
                            <p className="text-[10px] text-slate-400 font-bold">{new Date(b.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                          </div>
                          <span className="text-xs font-black text-red-700">{fmt(b.valor)}</span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold">Não foi possível carregar os dados</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: DRE MENSAL
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'dre' && (
        <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
          {/* Seletor de mês */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => {
                const idx = monthOptions.findIndex(m => m.val === dreMonth);
                if (idx < monthOptions.length - 1) setDreMonth(monthOptions[idx + 1].val);
              }}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <select
              value={dreMonth}
              onChange={e => setDreMonth(e.target.value)}
              className="flex-1 bg-white border border-slate-200 rounded-2xl px-5 py-3 font-black text-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {monthOptions.map(m => (
                <option key={m.val} value={m.val}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={() => {
                const idx = monthOptions.findIndex(m => m.val === dreMonth);
                if (idx > 0) setDreMonth(monthOptions[idx - 1].val);
              }}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
            <button onClick={fetchDre} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
              <RefreshCw className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          {loadingDre ? (
            <div className="flex items-center justify-center h-60">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
          ) : dreData ? (
            <>
              {/* DRE Table */}
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Receipt className="w-5 h-5 text-emerald-600" />
                    <div>
                      <h3 className="font-black text-slate-900 uppercase tracking-tighter text-base">
                        DRE — {monthOptions.find(m => m.val === dreMonth)?.label}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold">
                        {dreData.periodo.diasComFechamento} dias com fechamento
                        {dreData.usouCMVReal ? ' · CMV real do Digifarma' : ' · CMV estimado'}
                      </p>
                    </div>
                  </div>
                  {!dreData.usouCMVReal && (
                    <span className="text-[9px] font-black px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                      ⚠ CMV estimado
                    </span>
                  )}
                </div>
                <div className="divide-y divide-slate-50">
                  {/* Receita Bruta */}
                  <div className="flex items-center justify-between px-8 py-4 bg-emerald-50">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <span className="font-black text-slate-900 text-sm">Receita Bruta (Entradas de Caixa)</span>
                    </div>
                    <span className="font-black text-emerald-700 text-lg">{fmt(dreData.dre.receitaBruta)}</span>
                  </div>

                  {/* Boletos Pagos (Fornecedores/Compras) */}
                  {dreData.dre.boletosPagos > 0 && (
                    <div className="flex items-center justify-between px-8 py-4">
                      <div className="flex items-center gap-3 pl-4">
                        <ArrowDownRight className="w-4 h-4 text-red-400" />
                        <span className="font-bold text-slate-600 text-sm">(-) Boletos Pagos (Compras/Fornecedores)</span>
                      </div>
                      <span className="font-black text-red-600">{fmt(dreData.dre.boletosPagos)}</span>
                    </div>
                  )}

                  {/* Sobra Bruta de Caixa */}
                  <div className="flex items-center justify-between px-8 py-4 bg-blue-50">
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-4 h-4 text-blue-600" />
                      <span className="font-black text-slate-900 text-sm">= Sobra Bruta de Caixa</span>
                      <span className="text-[10px] font-black px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                        {pct(dreData.dre.margemBruta)} de margem
                      </span>
                    </div>
                    <span className="font-black text-blue-700 text-lg">{fmt(dreData.dre.lucroBruto)}</span>
                  </div>

                  {/* Despesas Fixas */}
                  <div className="flex items-center justify-between px-8 py-4">
                    <div className="flex items-center gap-3 pl-4">
                      <ArrowDownRight className="w-4 h-4 text-red-400" />
                      <span className="font-bold text-slate-600 text-sm">(-) Despesas Fixas</span>
                    </div>
                    <span className="font-black text-red-600">{fmt(dreData.dre.despesasFixas)}</span>
                  </div>

                  {/* Despesas Operacionais */}
                  <div className="flex items-center justify-between px-8 py-3">
                    <div className="flex items-center gap-3 pl-4">
                      <ArrowDownRight className="w-4 h-4 text-red-300" />
                      <span className="text-slate-500 text-xs font-bold">(-) Despesas Operacionais</span>
                    </div>
                    <span className="font-bold text-red-500 text-sm">{fmt(dreData.dre.despesasOperacionais)}</span>
                  </div>

                  {/* Resultado Líquido de Caixa */}
                  <div className={`flex items-center justify-between px-8 py-5 ${dreData.dre.lucroLiquido >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <div className="flex items-center gap-3">
                      {dreData.dre.lucroLiquido >= 0
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        : <AlertTriangle className="w-5 h-5 text-red-600" />
                      }
                      <span className="font-black text-slate-900 text-base">= Resultado Líquido (Caixa)</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${dreData.dre.lucroLiquido >= 0 ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'}`}>
                        {pct(dreData.dre.margemLiquida)} de margem
                      </span>
                    </div>
                    <span className={`font-black text-2xl ${dreData.dre.lucroLiquido >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {fmt(dreData.dre.lucroLiquido)}
                    </span>
                  </div>

                  {/* CMV Informativo (Não deduzido no Regime de Caixa) */}
                  <div className="flex items-center justify-between px-8 py-3 bg-slate-50 border-t border-slate-100">
                    <div className="flex items-center gap-3 pl-4">
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-500 text-xs font-bold">CMV Real do Período (Apenas Informativo - Competência)</span>
                    </div>
                    <span className="font-bold text-slate-500 text-sm">{fmt(dreData.dre.cmv)}</span>
                  </div>
                </div>
              </div>

              {/* Breakdown formas de pagamento */}
              <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-500" />
                  <span className="font-black text-slate-900 text-sm uppercase tracking-tight">Receita por Forma de Pagamento</span>
                </div>
                <div className="p-6 grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Crédito',  val: dreData.breakdown.credito,   icon: CreditCard, color: 'text-violet-600', bg: 'bg-violet-50' },
                    { label: 'Débito',   val: dreData.breakdown.debito,    icon: CreditCard, color: 'text-blue-600',   bg: 'bg-blue-50'   },
                    { label: 'PIX',      val: dreData.breakdown.pix,       icon: QrCode,     color: 'text-emerald-600',bg: 'bg-emerald-50' },
                    { label: 'Dinheiro', val: dreData.breakdown.dinheiro,  icon: Banknote,   color: 'text-amber-600',  bg: 'bg-amber-50'  },
                    { label: 'Crediário',val: dreData.breakdown.crediario, icon: Receipt,    color: 'text-red-600',    bg: 'bg-red-50'    },
                  ].map((item, i) => (
                    <div key={i} className={`rounded-2xl p-4 ${item.bg}`}>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                      <p className={`text-sm font-black ${item.color}`}>{fmt(item.val)}</p>
                      {dreData.dre.receitaBruta > 0 && (
                        <p className="text-[9px] text-slate-400 font-bold mt-1">
                          {pct((item.val / dreData.dre.receitaBruta) * 100)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold">Nenhum dado para o período selecionado</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: INDICADORES
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'indicadores' && (
        <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
          {/* Period selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Período:</span>
            <div className="flex bg-slate-100 border border-slate-200 rounded-2xl p-1 gap-1">
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    period === opt.value
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {loadingIndic ? (
            <div className="flex items-center justify-center h-60">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
          ) : indicData ? (
            <>
              {/* Ticket Médio */}
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-100 flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <h3 className="font-black text-slate-900 uppercase tracking-tighter text-base">Ticket Médio</h3>
                </div>
                <div className="p-8">
                  <div className="flex flex-col md:flex-row md:items-center gap-8">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Valor médio por venda
                      </p>
                      <p className="text-5xl font-black text-slate-900">{fmt(indicData.ticketMedio.valor)}</p>
                      <p className="text-sm text-slate-400 font-bold mt-2">
                        {indicData.ticketMedio.qtdVendas.toLocaleString('pt-BR')} vendas ·{' '}
                        {fmt(indicData.ticketMedio.totalVendas)} total nos últimos {period} dias
                      </p>
                    </div>
                    {indicData.ticketMedio.evolucao.length > 1 && (
                      <div className="ml-auto">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                          Evolução (14 dias)
                        </p>
                        <Sparkline
                          data={indicData.ticketMedio.evolucao.map(e => e.ticket)}
                          color="#3b82f6"
                        />
                      </div>
                    )}
                  </div>

                  {/* Mini tabela de evolução */}
                  {indicData.ticketMedio.evolucao.length > 0 && (
                    <div className="mt-6 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 font-black uppercase tracking-widest">
                            <th className="text-left pb-3">Data</th>
                            <th className="text-right pb-3">Ticket Médio</th>
                            <th className="text-right pb-3">Qtd Vendas</th>
                            <th className="text-right pb-3">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {indicData.ticketMedio.evolucao.slice(-7).map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="py-2 font-bold text-slate-600">
                                {new Date(String(r.data) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                              </td>
                              <td className="py-2 text-right font-black text-slate-900">{fmt(r.ticket)}</td>
                              <td className="py-2 text-right font-bold text-slate-500">{r.qtd}</td>
                              <td className="py-2 text-right font-bold text-slate-600">{fmt(r.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Giro de Estoque */}
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-100 flex items-center gap-3">
                  <RotateCcw className="w-5 h-5 text-violet-600" />
                  <h3 className="font-black text-slate-900 uppercase tracking-tighter text-base">Giro de Estoque</h3>
                </div>
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div className="col-span-1 md:col-span-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Número de Giros no Período
                      </p>
                      <div className="flex items-end gap-4">
                        <p className="text-6xl font-black text-slate-900">{indicData.giroEstoque.giro.toFixed(1)}<span className="text-2xl text-slate-400">x</span></p>
                        <div className="mb-2">
                          {indicData.giroEstoque.giro >= 3
                            ? <ArrowUpRight className="w-8 h-8 text-emerald-500" />
                            : <TrendingDown className="w-8 h-8 text-amber-500" />
                          }
                        </div>
                      </div>
                      <p className="text-sm font-bold text-slate-600 mt-3 max-w-sm leading-relaxed">
                        {indicData.giroEstoque.interpretacao}
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-slate-50 rounded-2xl p-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dias de Estoque</p>
                        <p className="text-2xl font-black text-slate-900">{indicData.giroEstoque.diasEstoque}</p>
                        <p className="text-[10px] text-slate-400 font-bold">dias para esgotar o estoque atual</p>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Produtos Ativos</p>
                        <p className="text-2xl font-black text-slate-900">{indicData.giroEstoque.qtdProdutosEstoque}</p>
                        <p className="text-[10px] text-slate-400 font-bold">com estoque &gt; 0</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
                      <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">CMV do Período</p>
                      <p className="text-xl font-black text-slate-900">{fmt(indicData.giroEstoque.cmvPeriodo)}</p>
                      <p className="text-[10px] text-slate-400 font-bold">custo do que foi vendido</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Valor do Estoque Atual</p>
                      <p className="text-xl font-black text-slate-900">{fmt(indicData.giroEstoque.valorEstoqueAtual)}</p>
                      <p className="text-[10px] text-slate-400 font-bold">dinheiro parado no estoque</p>
                    </div>
                  </div>

                  {indicData.giroEstoque.valorEstoqueAtual === 0 && (
                    <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs font-bold text-amber-700">
                        O estoque local (SQLite) não tem dados de custo/quantidade. Para o giro de estoque funcionar,
                        cadastre ou importe os produtos com custo e estoque no módulo Estoque.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold">Não foi possível carregar os indicadores</p>
            </div>
          )}
        </div>
      )}
      {/* ═══════════════════════════════════════════════════════════════════
          TAB: BALANCETE PATRIMONIAL
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'balancete' && (
        <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
          {/* Seletor Atual vs Mensal */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex bg-slate-100 border border-slate-200 rounded-2xl p-1 gap-1">
              <button
                onClick={() => setBalanceteMode('atual')}
                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  balanceteMode === 'atual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                📸 Atual
              </button>
              <button
                onClick={() => setBalanceteMode('mensal')}
                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  balanceteMode === 'mensal' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                📅 Mensal
              </button>
            </div>
            {balanceteMode === 'mensal' && (
              <>
                <button
                  onClick={() => {
                    const idx = monthOptions.findIndex(m => m.val === balanceteMonth);
                    if (idx < monthOptions.length - 1) setBalanceteMonth(monthOptions[idx + 1].val);
                  }}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-600" />
                </button>
                <select
                  value={balanceteMonth}
                  onChange={e => setBalanceteMonth(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-2xl px-5 py-3 font-black text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {monthOptions.map(m => (
                    <option key={m.val} value={m.val}>{m.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const idx = monthOptions.findIndex(m => m.val === balanceteMonth);
                    if (idx > 0) setBalanceteMonth(monthOptions[idx - 1].val);
                  }}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              </>
            )}
            <button onClick={fetchBalancete} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
              <RefreshCw className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          {loadingBalancete ? (
            <div className="flex items-center justify-center h-60">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
          ) : balanceteData ? (
            <>
              {/* ── Resumo Principal ────────────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Total Ativo */}
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-[2rem] border border-emerald-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-emerald-600" />
                    </div>
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total Ativo</p>
                  </div>
                  <p className="text-3xl font-black text-emerald-800">{fmt(balanceteData.ativo.total)}</p>
                  <p className="text-[10px] text-emerald-600 font-bold mt-1">O que a farmácia TEM</p>
                </div>

                {/* Total Passivo */}
                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-[2rem] border border-red-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    </div>
                    <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Total Passivo</p>
                  </div>
                  <p className="text-3xl font-black text-red-800">{fmt(balanceteData.passivo.total)}</p>
                  <p className="text-[10px] text-red-600 font-bold mt-1">O que a farmácia DEVE</p>
                </div>

                {/* Patrimônio Líquido */}
                {(() => {
                  const cfg = situacaoConfig(balanceteData.situacao);
                  return (
                    <div className={`rounded-[2rem] border p-6 shadow-sm ${cfg.bg} ${cfg.border}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${balanceteData.patrimonioLiquido >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                          <Scale className={`w-5 h-5 ${balanceteData.patrimonioLiquido >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'inherit' }}>Patrimônio Líquido</p>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${cfg.badge}`}>{balanceteData.situacao}</span>
                        </div>
                      </div>
                      <p className={`text-3xl font-black ${balanceteData.patrimonioLiquido >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                        {fmt(balanceteData.patrimonioLiquido)}
                      </p>
                      <p className="text-[10px] font-bold mt-1 opacity-70">Ativo − Passivo</p>
                    </div>
                  );
                })()}
              </div>

              {/* ── Barra Visual Proporção ──────────────────────────── */}
              {(balanceteData.ativo.total > 0 || balanceteData.passivo.total > 0) && (
                <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Proporção Ativo vs Passivo</p>
                  <div className="flex rounded-full overflow-hidden h-4 bg-slate-100">
                    <div
                      className="bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700 rounded-l-full"
                      style={{ width: `${Math.min(100, Math.max(2, (balanceteData.ativo.total / (balanceteData.ativo.total + balanceteData.passivo.total)) * 100))}%` }}
                    />
                    <div
                      className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-700 rounded-r-full"
                      style={{ width: `${Math.min(100, Math.max(2, (balanceteData.passivo.total / (balanceteData.ativo.total + balanceteData.passivo.total)) * 100))}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] font-black text-emerald-600">
                      Ativo {((balanceteData.ativo.total / (balanceteData.ativo.total + balanceteData.passivo.total)) * 100).toFixed(0)}%
                    </span>
                    <span className="text-[10px] font-black text-red-600">
                      Passivo {((balanceteData.passivo.total / (balanceteData.ativo.total + balanceteData.passivo.total)) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════
                  ATIVO
              ═══════════════════════════════════════════════════════ */}
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-100 bg-emerald-50">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                    <h3 className="font-black text-slate-900 uppercase tracking-tighter text-base">Ativo</h3>
                    <span className="ml-auto text-lg font-black text-emerald-700">{fmt(balanceteData.ativo.total)}</span>
                  </div>
                </div>

                {/* Disponível (Caixa + Cofre) */}
                <div className="border-b border-slate-50">
                  <button
                    onClick={() => toggleSection('disponivel')}
                    className="w-full flex items-center justify-between px-8 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Wallet className="w-4 h-4 text-blue-500" />
                      <span className="font-black text-slate-900 text-sm">Disponível (Caixa + Cofre)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-blue-700">{fmt(balanceteData.ativo.disponivel.totalDisponivel)}</span>
                      {expandedSections['disponivel'] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {expandedSections['disponivel'] && (
                    <div className="px-8 pb-4 space-y-2 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex justify-between items-center pl-7">
                        <div className="flex items-center gap-2">
                          <Banknote className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs text-slate-600 font-bold">Caixa (Gaveta)</span>
                        </div>
                        <span className="text-xs font-black text-slate-900">{fmt(balanceteData.ativo.disponivel.caixa)}</span>
                      </div>
                      <div className="flex justify-between items-center pl-7">
                        <div className="flex items-center gap-2">
                          <Archive className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="text-xs text-slate-600 font-bold">Cofre</span>
                        </div>
                        <span className="text-xs font-black text-slate-900">{fmt(balanceteData.ativo.disponivel.cofre)}</span>
                      </div>
                      {balanceteData.ativo.disponivel.ultimoFechamento && (
                        <p className="text-[10px] text-slate-400 font-bold pl-7 mt-1">
                          Último fechamento: {new Date(balanceteData.ativo.disponivel.ultimoFechamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Estoque */}
                <div className="border-b border-slate-50">
                  <div className="flex items-center justify-between px-8 py-4">
                    <div className="flex items-center gap-3">
                      <Package className="w-4 h-4 text-violet-500" />
                      <span className="font-black text-slate-900 text-sm">Estoque</span>
                      <span className="text-[10px] font-bold text-slate-400">
                        ({balanceteData.ativo.estoque.qtdProdutos} produtos)
                      </span>
                      {balanceteData.ativo.estoque.fonte && (
                        <span className="text-[9px] font-black px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full">
                          {balanceteData.ativo.estoque.fonte}
                        </span>
                      )}
                    </div>
                    <span className="font-black text-violet-700">{fmt(balanceteData.ativo.estoque.valor)}</span>
                  </div>
                </div>

                {/* Crediário a Receber */}
                <div className="border-b border-slate-50">
                  <button
                    onClick={() => toggleSection('crediario')}
                    className="w-full flex items-center justify-between px-8 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-amber-500" />
                      <span className="font-black text-slate-900 text-sm">Crediário a Receber</span>
                      <span className="text-[9px] font-black px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                        {balanceteData.ativo.crediario.fonte}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-amber-700">{fmt(balanceteData.ativo.crediario.total)}</span>
                      {expandedSections['crediario'] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {expandedSections['crediario'] && (
                    <div className="px-8 pb-4 space-y-2 max-h-64 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
                      {balanceteData.ativo.crediario.detalhes.length === 0
                        ? <p className="text-xs text-slate-400 text-center py-2">Nenhum crediário pendente</p>
                        : balanceteData.ativo.crediario.detalhes.map((d, i) => (
                          <div key={i} className="flex justify-between items-center pl-7">
                            <div>
                              <p className="text-xs text-slate-700 font-bold">{d.cliente}</p>
                              <p className="text-[10px] text-slate-400 font-bold">
                                {d.qtdCompras} compra(s)
                                {d.compraAntiga && ` · desde ${new Date(d.compraAntiga + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                              </p>
                            </div>
                            <span className="text-xs font-black text-amber-700">{fmt(d.valor)}</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* ═══════════════════════════════════════════════════════
                  PASSIVO
              ═══════════════════════════════════════════════════════ */}
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-100 bg-red-50">
                  <div className="flex items-center gap-3">
                    <TrendingDown className="w-5 h-5 text-red-600" />
                    <h3 className="font-black text-slate-900 uppercase tracking-tighter text-base">Passivo</h3>
                    <span className="ml-auto text-lg font-black text-red-700">{fmt(balanceteData.passivo.total)}</span>
                  </div>
                </div>

                {/* Boletos Pendentes */}
                <div className="border-b border-slate-50">
                  <button
                    onClick={() => toggleSection('boletos')}
                    className="w-full flex items-center justify-between px-8 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Receipt className="w-4 h-4 text-red-500" />
                      <span className="font-black text-slate-900 text-sm">Boletos Pendentes</span>
                      <span className="text-[10px] font-bold text-slate-400">
                        ({balanceteData.passivo.boletos.detalhes.reduce((a, d) => a + (d.qtd || 0), 0)} boletos)
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-red-700">{fmt(balanceteData.passivo.boletos.total)}</span>
                      {expandedSections['boletos'] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {expandedSections['boletos'] && (
                    <div className="px-8 pb-4 space-y-3 max-h-80 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
                      {balanceteData.passivo.boletos.detalhes.length === 0
                        ? <p className="text-xs text-slate-400 text-center py-2 flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Nenhum boleto pendente</p>
                        : balanceteData.passivo.boletos.detalhes.map((grupo, i) => (
                          <div key={i} className="pl-7">
                            <div className="flex justify-between items-center mb-1">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-xs font-black text-slate-800">{grupo.fornecedor}</span>
                                <span className="text-[9px] font-bold text-slate-400">({grupo.qtd})</span>
                              </div>
                              <span className="text-xs font-black text-red-700">{fmt(grupo.valor)}</span>
                            </div>
                            {grupo.itens && grupo.itens.map((item, j) => (
                              <div key={j} className="flex justify-between items-center pl-6 py-0.5">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-bold ${item.status === 'Vencido' ? 'text-red-500' : 'text-slate-400'}`}>
                                    {item.vencimento ? new Date(item.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                                  </span>
                                  {item.status === 'Vencido' && (
                                    <span className="text-[8px] font-black px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full">VENCIDO</span>
                                  )}
                                </div>
                                <span className="text-[10px] font-bold text-slate-600">{fmt(item.valor)}</span>
                              </div>
                            ))}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>

                {/* Foguete Amarelo */}
                <div className="border-b border-slate-50">
                  <button
                    onClick={() => toggleSection('foguete')}
                    className="w-full flex items-center justify-between px-8 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Package className="w-4 h-4 text-amber-500" />
                      <span className="font-black text-slate-900 text-sm">Foguete Amarelo (D+120)</span>
                      <span className="text-[10px] font-bold text-slate-400">
                        ({balanceteData.passivo.fogueteAmarelo.detalhes.reduce((a, d) => a + (d.qtd || 0), 0)} títulos)
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-amber-700">{fmt(balanceteData.passivo.fogueteAmarelo.total)}</span>
                      {expandedSections['foguete'] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {expandedSections['foguete'] && (
                    <div className="px-8 pb-4 space-y-3 max-h-64 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
                      {balanceteData.passivo.fogueteAmarelo.detalhes.length === 0
                        ? <p className="text-xs text-slate-400 text-center py-2 flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Sem títulos Foguete pendentes</p>
                        : balanceteData.passivo.fogueteAmarelo.detalhes.map((grupo, i) => (
                          <div key={i} className="pl-7">
                            <div className="flex justify-between items-center mb-1">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-xs font-black text-slate-800">{grupo.fornecedor}</span>
                                <span className="text-[9px] font-bold text-slate-400">({grupo.qtd})</span>
                              </div>
                              <span className="text-xs font-black text-amber-700">{fmt(grupo.valor)}</span>
                            </div>
                            {grupo.itens && grupo.itens.map((item, j) => (
                              <div key={j} className="flex justify-between items-center pl-6 py-0.5">
                                <span className="text-[10px] font-bold text-slate-400">
                                  {item.vencimento ? new Date(item.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                                  {item.descricao && ` · ${item.descricao}`}
                                </span>
                                <span className="text-[10px] font-bold text-slate-600">{fmt(item.valor)}</span>
                              </div>
                            ))}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>

                {/* Contas Fixas Pendentes */}
                <div>
                  <button
                    onClick={() => toggleSection('contasFixas')}
                    className="w-full flex items-center justify-between px-8 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Landmark className="w-4 h-4 text-blue-500" />
                      <span className="font-black text-slate-900 text-sm">Contas Fixas Pendentes</span>
                      <span className="text-[10px] font-bold text-slate-400">
                        ({balanceteData.passivo.contasFixas.detalhes.length} contas · {balanceteData.passivo.contasFixas.mes})
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-blue-700">{fmt(balanceteData.passivo.contasFixas.total)}</span>
                      {expandedSections['contasFixas'] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {expandedSections['contasFixas'] && (
                    <div className="px-8 pb-4 space-y-2 max-h-64 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
                      {balanceteData.passivo.contasFixas.detalhes.length === 0
                        ? <p className="text-xs text-slate-400 text-center py-2 flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Todas as contas fixas foram pagas</p>
                        : balanceteData.passivo.contasFixas.detalhes.map((c, i) => (
                          <div key={i} className="flex justify-between items-center pl-7">
                            <div>
                              <p className="text-xs text-slate-700 font-bold">{c.nome}</p>
                              <p className="text-[10px] text-slate-400 font-bold">
                                {c.vencimento ? `Vence: ${new Date(c.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                                {c.status && ` · ${c.status}`}
                              </p>
                            </div>
                            <span className="text-xs font-black text-blue-700">{fmt(c.valor)}</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* ═══════════════════════════════════════════════════════
                  PATRIMÔNIO LÍQUIDO (Rodapé)
              ═══════════════════════════════════════════════════════ */}
              <div className={`rounded-[2rem] border shadow-sm overflow-hidden ${
                balanceteData.patrimonioLiquido >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
              }`}>
                <div className="px-8 py-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <Scale className={`w-8 h-8 ${balanceteData.patrimonioLiquido >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                      <div>
                        <h3 className="font-black text-slate-900 uppercase tracking-tighter text-base">Patrimônio Líquido</h3>
                        <p className="text-[10px] text-slate-500 font-bold">
                          {fmt(balanceteData.ativo.total)} (Ativo) − {fmt(balanceteData.passivo.total)} (Passivo)
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-4xl font-black ${balanceteData.patrimonioLiquido >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {fmt(balanceteData.patrimonioLiquido)}
                      </p>
                      <p className="text-[10px] font-bold mt-1 opacity-60">
                        {balanceteData.modo === 'atual' ? 'Snapshot atual' : `Ref.: ${balanceteData.referencia}`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <Scale className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold">Não foi possível carregar o balancete</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
