import React, { useState, useEffect, useCallback } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  Settings, 
  Download, 
  AlertTriangle, 
  TrendingUp, 
  CheckCircle2, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Layers, 
  Sliders, 
  DollarSign, 
  Lock, 
  ArrowUpRight, 
  ArrowDownRight, 
  X 
} from 'lucide-react';
import { useToast } from './ToastContext';

interface PricingSuggestion {
  ean: string;
  produto_id: string;
  descricao: string;
  categoria: string;
  curva: 'A' | 'B' | 'C';
  estoque_atual: number;
  custo_liquido: number;
  preco_atual: number;
  preco_sugerido: number;
  preco_pmc: number;
  preco_proffer: number | null;
  preco_proffer_baixo?: number | null;
  preco_proffer_medio?: number | null;
  preco_proffer_alto?: number | null;
  margem_atual_pct: number;
  margem_projetada_pct: number;
  variacao_pct: number;
  variacao_valor: number;
  trava_teto_cmed: number;
  trava_piso_minimo: number;
  trava_volatilidade: number;
  requer_aprovacao_manual: number;
  justificativa: string;
  calculado_em: string;
}

interface PricingStats {
  total: number;
  curveA: number;
  curveB: number;
  curveC: number;
  categories: {
    generico: number;
    similar: number;
    referencia: number;
    perfumaria: number;
    mips: number;
  };
  requiresApproval: number;
  travas: {
    cmed: number;
    piso: number;
    volatilidade: number;
  };
  countIncrease: number;
  countDecrease: number;
  avgMargemAtual: number;
  avgMargemProjetada: number;
  marginGainPct: number;
  lastRun: {
    id: string;
    executado_em: string;
    total_skus: number;
    duracao_ms: number;
  } | null;
}

interface PricingRules {
  aliquotaImpostosPct: number;
  despesasOperacionaisPct: number;
  taxaCartaoPct: number;
  margemMinimaAbsolutaPct: number;
  maxVariacaoAlertaPct: number;
  diasAnaliseAbc: number;
  matrizMargens: Record<string, { A: number; B: number; C: number }>;
}

export const PricingEngineView: React.FC = () => {
  const { addToast } = useToast();

  const [suggestions, setSuggestions] = useState<PricingSuggestion[]>([]);
  const [stats, setStats] = useState<PricingStats | null>(null);
  const [rules, setRules] = useState<PricingRules | null>(null);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const limit = 50;

  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('ALL');
  const [curva, setCurva] = useState('ALL');
  const [approvalFilter, setApprovalFilter] = useState('ALL');
  const [guardrailFilter, setGuardrailFilter] = useState('ALL');
  const [variationFilter, setVariationFilter] = useState('ALL');

  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [editRules, setEditRules] = useState<PricingRules | null>(null);
  const [savingRules, setSavingRules] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search,
        categoria,
        curva,
        approvalFilter,
        guardrailFilter,
        variationFilter
      });

      const res = await fetch(`/api/pricing-engine/suggestions?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Erro ao buscar sugestões.');
      const json = await res.json();

      if (json.success) {
        setSuggestions(json.data || []);
        setTotalPages(json.pagination.totalPages || 1);
        setTotalItems(json.pagination.totalItems || 0);
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao carregar dados de precificação.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, categoria, curva, approvalFilter, guardrailFilter, variationFilter, addToast]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/pricing-engine/stats');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setStats(json.data);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar estatísticas:', err);
    }
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/pricing-engine/rules');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setRules(json.data);
          setEditRules(json.data);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar regras:', err);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    fetchStats();
    fetchRules();
  }, [fetchStats, fetchRules]);

  const handleRunSimulation = async () => {
    setSimulating(true);
    try {
      const res = await fetch('/api/pricing-engine/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!res.ok) throw new Error('Falha ao processar simulação.');
      const json = await res.json();

      if (json.success) {
        addToast(`🎉 Simulação concluída com sucesso! ${json.totalSuggestions} produtos calculados em ${json.durationMs}ms.`, 'success');
        fetchSuggestions();
        fetchStats();
      } else {
        throw new Error(json.error || 'Erro na simulação.');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao executar simulação de preços.', 'error');
    } finally {
      setSimulating(false);
    }
  };

  const handleSaveRules = async () => {
    if (!editRules) return;
    setSavingRules(true);
    try {
      const res = await fetch('/api/pricing-engine/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editRules)
      });

      if (!res.ok) throw new Error('Falha ao salvar regras.');
      const json = await res.json();

      if (json.success) {
        addToast('✔ Regras de precificação e matriz de margem atualizadas!', 'success');
        setRules(editRules);
        setIsRulesModalOpen(false);
        handleRunSimulation();
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao salvar regras.', 'error');
    } finally {
      setSavingRules(false);
    }
  };

  const handleExportCSV = () => {
    window.open('/api/pricing-engine/export', '_blank');
    addToast('📥 Download do relatório de auditoria iniciado!', 'info');
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'generico':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800 border border-amber-300">Genérico</span>;
      case 'similar':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800 border border-blue-300">Similar</span>;
      case 'referencia':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-800 border border-purple-300">Referência</span>;
      case 'perfumaria':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-pink-100 text-pink-800 border border-pink-300">Perfumaria</span>;
      case 'mips':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800 border border-emerald-300">MIP / OTC</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700 border border-slate-300">{cat}</span>;
    }
  };

  const getCurveBadge = (curva: string) => {
    switch (curva) {
      case 'A':
        return <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-500 text-white shadow-sm">Curva A</span>;
      case 'B':
        return <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-500 text-white shadow-sm">Curva B</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-slate-400 text-white shadow-sm">Curva C</span>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header com Ações e Aviso de Simulação */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-xl text-white shadow-md">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                Belinha Pricing Engine
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Inteligência de Precificação
                </span>
              </h1>
              <p className="text-sm text-slate-500">
                Formação automática de preços por Markup Divisor, Curva ABC e Travas Regulatórias CMED
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsRulesModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            <Settings className="w-4 h-4" />
            Parâmetros & Margens
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>

          <button
            onClick={handleRunSimulation}
            disabled={simulating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${simulating ? 'animate-spin' : ''}`} />
            {simulating ? 'Simulando...' : 'Recalcular Sugestões'}
          </button>
        </div>
      </div>

      {/* Alerta de Segurança e Isolamento */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
        <Lock className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-emerald-900">
          <p className="font-semibold">Ambiente 100% Seguro de Simulação & Auditoria</p>
          <p className="text-xs text-emerald-700 mt-0.5">
            Nenhuma alteração é enviada ao banco de dados do Digifarma (Firebird). Todas as simulações e cálculos de markup são registrados exclusivamente para análise e validação.
          </p>
        </div>
      </div>

      {/* Cards de Métricas e KPIs */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Margem Média</span>
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-800">{stats.avgMargemProjetada.toFixed(1)}%</span>
              <span className="text-xs text-slate-400 line-through">Atual: {stats.avgMargemAtual.toFixed(1)}%</span>
            </div>
            <div className="mt-1 flex items-center text-xs font-semibold text-emerald-600">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              Ganho projetado de +{stats.marginGainPct.toFixed(1)} pp
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">SKUs Auditados</span>
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-slate-800">{stats.total.toLocaleString('pt-BR')}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500 flex gap-2">
              <span>Curva A: <strong className="text-emerald-600">{stats.curveA}</strong></span>
              <span>Curva B: <strong className="text-blue-600">{stats.curveB}</strong></span>
              <span>Curva C: <strong className="text-slate-600">{stats.curveC}</strong></span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Requerem Auditoria</span>
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-amber-600">{stats.requiresApproval}</span>
              <span className="text-xs text-slate-500 ml-1.5">itens c/ variação brusca</span>
            </div>
            <div className="mt-1 text-xs text-slate-500 flex gap-2">
              <span>Piso: <strong>{stats.travas.piso}</strong></span>
              <span>CMED: <strong>{stats.travas.cmed}</strong></span>
              <span>Volatilidade: <strong>{stats.travas.volatilidade}</strong></span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ajustes Sugeridos</span>
              <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <div className="flex items-center text-sm font-bold text-emerald-600">
                <ArrowUpRight className="w-4 h-4 mr-0.5" />
                {stats.countIncrease} altas
              </div>
              <div className="flex items-center text-sm font-bold text-rose-600">
                <ArrowDownRight className="w-4 h-4 mr-0.5" />
                {stats.countDecrease} baixas
              </div>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {stats.lastRun ? `Última simulação: ${new Date(stats.lastRun.executado_em).toLocaleTimeString('pt-BR')}` : 'Pronto para simular'}
            </div>
          </div>
        </div>
      )}

      {/* Painel de Filtros e Busca */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por descrição do produto, código de barras EAN ou ID..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={categoria}
              onChange={e => {
                setCategoria(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">Todas as Categorias</option>
              <option value="generico">Genéricos</option>
              <option value="similar">Similares</option>
              <option value="referencia">Referência / Marca</option>
              <option value="perfumaria">Perfumaria & Higiene</option>
              <option value="mips">MIPs / OTC</option>
            </select>

            <select
              value={curva}
              onChange={e => {
                setCurva(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">Curva ABC (Todas)</option>
              <option value="A">Curva A (Alto Giro)</option>
              <option value="B">Curva B (Médio)</option>
              <option value="C">Curva C (Cauda Longa)</option>
            </select>

            <select
              value={approvalFilter}
              onChange={e => {
                setApprovalFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">Auditoria (Todos)</option>
              <option value="REQUIRES_APPROVAL">⚠️ Requer Aprovação Manual</option>
              <option value="APPROVED_AUTO">✔ Aprovado Automático</option>
            </select>

            <select
              value={guardrailFilter}
              onChange={e => {
                setGuardrailFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">Travas (Todas)</option>
              <option value="ANY_TRAVA">Qualquer Trava Acionada</option>
              <option value="CMED">Teto CMED</option>
              <option value="PISO">Piso de Custo</option>
              <option value="VOLATILIDADE">Volatilidade &gt; 20%</option>
            </select>

            <select
              value={variationFilter}
              onChange={e => {
                setVariationFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">Variação (Todas)</option>
              <option value="INCREASE">Aumento de Preço</option>
              <option value="DECREASE">Redução de Preço</option>
              <option value="DISCREPANT">Discrepância &ge; 15%</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabela de Sugestões de Preço */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3.5">Produto & EAN</th>
                <th className="px-3 py-3.5 text-center">Curva</th>
                <th className="px-3 py-3.5">Categoria</th>
                <th className="px-3 py-3.5 text-right">Custo Líq.</th>
                <th className="px-3 py-3.5 text-right">Preço Atual</th>
                <th className="px-3 py-3.5 text-center">Concorrência Proffer (JF Indep.)</th>
                <th className="px-3 py-3.5 text-right font-bold text-emerald-700">Preço Sugerido</th>
                <th className="px-3 py-3.5 text-center">Margem (Atual &rarr; Nova)</th>
                <th className="px-3 py-3.5 text-right">Variação</th>
                <th className="px-4 py-3.5">Status & Guardrails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                    Carregando simulação de preços...
                  </td>
                </tr>
              ) : suggestions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    Nenhum produto encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                suggestions.map(s => {
                  const isIncrease = s.variacao_valor > 0.05;
                  const isDecrease = s.variacao_valor < -0.05;

                  return (
                    <tr key={s.ean} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800 line-clamp-1">{s.descricao}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          EAN: {s.ean} | ID: {s.produto_id} | Estq: {s.estoque_atual}
                        </div>
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        {getCurveBadge(s.curva)}
                      </td>

                      <td className="px-3 py-3.5">
                        {getCategoryBadge(s.categoria)}
                      </td>

                      <td className="px-3 py-3.5 text-right font-medium text-slate-700">
                        R$ {s.custo_liquido.toFixed(2)}
                      </td>

                      <td className="px-3 py-3.5 text-right font-medium text-slate-600">
                        R$ {s.preco_atual.toFixed(2)}
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        {s.preco_proffer_medio ? (
                          <div className="inline-flex flex-col items-center bg-blue-50/80 border border-blue-200 rounded-lg px-2.5 py-1">
                            <div className="text-xs font-bold text-blue-900">
                              Média: R$ {s.preco_proffer_medio.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-blue-600 font-medium flex items-center gap-1.5 mt-0.5">
                              <span>Min: R$ {(s.preco_proffer_baixo !== null && s.preco_proffer_baixo !== undefined ? s.preco_proffer_baixo : s.preco_proffer_medio).toFixed(2)}</span>
                              <span className="text-blue-300">•</span>
                              <span>Max: R$ {(s.preco_proffer_alto !== null && s.preco_proffer_alto !== undefined ? s.preco_proffer_alto : s.preco_proffer_medio).toFixed(2)}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-normal">-</span>
                        )}
                      </td>

                      <td className="px-3 py-3.5 text-right">
                        <span className="text-base font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          R$ {s.preco_sugerido.toFixed(2)}
                        </span>
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5 font-medium">
                          <span className="text-xs text-slate-500">{s.margem_atual_pct.toFixed(0)}%</span>
                          <span className="text-slate-300">&rarr;</span>
                          <span className="text-xs font-bold text-emerald-700">{s.margem_projetada_pct.toFixed(0)}%</span>
                        </div>
                      </td>

                      <td className="px-3 py-3.5 text-right">
                        <div className={`font-semibold text-xs flex items-center justify-end gap-0.5 ${
                          isIncrease ? 'text-emerald-600' : isDecrease ? 'text-rose-600' : 'text-slate-500'
                        }`}>
                          {isIncrease && <ArrowUpRight className="w-3.5 h-3.5" />}
                          {isDecrease && <ArrowDownRight className="w-3.5 h-3.5" />}
                          {s.variacao_pct > 0 ? `+${s.variacao_pct.toFixed(1)}%` : `${s.variacao_pct.toFixed(1)}%`}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {s.variacao_valor > 0 ? `+R$ ${s.variacao_valor.toFixed(2)}` : `R$ ${s.variacao_valor.toFixed(2)}`}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {s.requer_aprovacao_manual ? (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1" title={s.justificativa}>
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Requer Aprovação
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1" title={s.justificativa}>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Auto OK
                            </span>
                          )}

                          {s.trava_teto_cmed ? (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-100 text-purple-800 border border-purple-200">
                              Teto CMED
                            </span>
                          ) : null}

                          {s.trava_piso_minimo ? (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-100 text-blue-800 border border-blue-200">
                              Piso Mínimo
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5" title={s.justificativa}>
                          {s.justificativa}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-600">
          <div>
            Mostrando <strong>{(page - 1) * limit + 1}</strong> a <strong>{Math.min(page * limit, totalItems)}</strong> de <strong>{totalItems}</strong> produtos auditados
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition"
              title="Primeira Página"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition"
              title="Página Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition"
              title="Próxima Página"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition"
              title="Última Página"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Configuração de Parâmetros & Matriz de Margens */}
      {isRulesModalOpen && editRules && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                  <Sliders className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">
                  Parâmetros de Formação de Preço & Matriz de Margem
                </h3>
              </div>
              <button
                onClick={() => setIsRulesModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-5 space-y-6">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  1. Parâmetros Globais de Markup Divisor
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Impostos (%):
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={editRules.aliquotaImpostosPct}
                      onChange={e => setEditRules({ ...editRules, aliquotaImpostosPct: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Despesas Operacionais (%):
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={editRules.despesasOperacionaisPct}
                      onChange={e => setEditRules({ ...editRules, despesasOperacionaisPct: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Taxa Média Cartão (%):
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={editRules.taxaCartaoPct}
                      onChange={e => setEditRules({ ...editRules, taxaCartaoPct: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Piso Mínimo s/ Custo (%):
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={editRules.margemMinimaAbsolutaPct}
                      onChange={e => setEditRules({ ...editRules, margemMinimaAbsolutaPct: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Alerta Volatilidade (±%):
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={editRules.maxVariacaoAlertaPct}
                      onChange={e => setEditRules({ ...editRules, maxVariacaoAlertaPct: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Dias Histórico ABC:
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={editRules.diasAnaliseAbc}
                      onChange={e => setEditRules({ ...editRules, diasAnaliseAbc: parseInt(e.target.value) || 60 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  2. Matriz de Margem Alvo (% Líquida) por Categoria e Curva ABC
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5">Categoria / Grupo</th>
                        <th className="px-3 py-2.5 text-center text-emerald-700">Curva A (%)</th>
                        <th className="px-3 py-2.5 text-center text-blue-700">Curva B (%)</th>
                        <th className="px-3 py-2.5 text-center text-slate-700">Curva C (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {[
                        { key: 'generico', label: 'Genéricos' },
                        { key: 'similar', label: 'Similares' },
                        { key: 'referencia', label: 'Referência / Marca' },
                        { key: 'perfumaria', label: 'Perfumaria & Higiene' },
                        { key: 'mips', label: 'MIPs / OTC' },
                        { key: 'outros', label: 'Outros / Diversos' }
                      ].map(cat => {
                        const m = editRules.matrizMargens[cat.key] || { A: 20, B: 30, C: 40 };
                        return (
                          <tr key={cat.key}>
                            <td className="px-3 py-2 font-semibold text-slate-700">{cat.label}</td>
                            <td className="px-3 py-1.5 text-center">
                              <input
                                type="number"
                                step="1"
                                value={m.A}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setEditRules({
                                    ...editRules,
                                    matrizMargens: {
                                      ...editRules.matrizMargens,
                                      [cat.key]: { ...m, A: val }
                                    }
                                  });
                                }}
                                className="w-16 px-2 py-1 text-center border border-slate-300 rounded font-bold text-emerald-700 focus:ring-1 focus:ring-emerald-500"
                              />
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <input
                                type="number"
                                step="1"
                                value={m.B}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setEditRules({
                                    ...editRules,
                                    matrizMargens: {
                                      ...editRules.matrizMargens,
                                      [cat.key]: { ...m, B: val }
                                    }
                                  });
                                }}
                                className="w-16 px-2 py-1 text-center border border-slate-300 rounded font-bold text-blue-700 focus:ring-1 focus:ring-emerald-500"
                              />
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <input
                                type="number"
                                step="1"
                                value={m.C}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setEditRules({
                                    ...editRules,
                                    matrizMargens: {
                                      ...editRules.matrizMargens,
                                      [cat.key]: { ...m, C: val }
                                    }
                                  });
                                }}
                                className="w-16 px-2 py-1 text-center border border-slate-300 rounded font-bold text-slate-700 focus:ring-1 focus:ring-emerald-500"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setIsRulesModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveRules}
                disabled={savingRules}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow transition disabled:opacity-50"
              >
                {savingRules ? 'Salvando...' : 'Salvar & Recalcular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
