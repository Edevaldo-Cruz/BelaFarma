import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  TrendingDown, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  Calendar, 
  Printer, 
  Search, 
  Filter, 
  RefreshCw, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  Building2,
  PieChart,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  LineChart as LineChartIcon,
  BarChart3,
  Clock,
  Layers,
  ChevronRight,
  Eye,
  Info
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { useToast } from '../ToastContext';

interface ItemEconomia {
  ean: string;
  descricao: string;
  distribuidora: string;
  prazo: string;
  qtd: number;
  precoHoje: number;
  subtotalHoje: number;
  precoUltCompra: number;
  subtotalHistorico: number;
  diffUnit: number;
  diffLote: number;
  pctVar: number;
  economizou: boolean;
  dataUltCompra: string | null;
  fornUltCompra: string | null;
}

interface ResumoEconomia {
  totalInvestido: number;
  totalHistorico: number;
  economiaLiquida: number;
  economiaPct: number;
  totalItens: number;
  totalItensMaisBaratos: number;
  porDistribuidora: Record<string, { totalHoje: number; totalHist: number; itens: number; unidades: number }>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const brl = (v: number) => 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DISTRIBUIDORA_CORES: Record<string, string> = {
  'ORIENTE FARMA': '#38bdf8', // Sky Blue
  'ORIENTE': '#38bdf8',
  'DISTRIMED': '#c084fc',     // Violet / Purple
  'DPC': '#22d3ee',           // Cyan
  'DPC DISTRIBUIDORA': '#22d3ee',
  'PROFARMA': '#34d399',      // Emerald
  'SOTON FARMA': '#fbbf24',   // Amber
  'SOTON': '#fbbf24',
  'DIVIMED': '#f472b6',       // Pink
  'NOTA FISCAL (NF)': '#94a3b8',
  'DIGIFARMA (NF)': '#94a3b8'
};

const getCorFornecedor = (nome: string) => {
  const upper = (nome || '').toUpperCase();
  for (const [key, color] of Object.entries(DISTRIBUIDORA_CORES)) {
    if (upper.includes(key)) return color;
  }
  return '#38bdf8';
};

export const BelaPedEconomiaModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [resumo, setResumo] = useState<ResumoEconomia | null>(null);
  const [itens, setItens] = useState<ItemEconomia[]>([]);
  const [distFiltro, setDistFiltro] = useState<string>('TODAS');
  const [statusFiltro, setStatusFiltro] = useState<'TODOS' | 'MAIS_BARATO' | 'REAJUSTE'>('TODOS');
  const [busca, setBusca] = useState<string>('');

  // Estado do produto selecionado para exibição do gráfico
  const [itemSelecionado, setItemSelecionado] = useState<ItemEconomia | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartPontos, setChartPontos] = useState<any[]>([]);
  const [chartEstatisticas, setChartEstatisticas] = useState<any | null>(null);
  const [chartErro, setChartErro] = useState<string | null>(null);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/belaped/relatorio-economia');
      if (res.ok) {
        const data = await res.json();
        setResumo(data.resumo);
        const listaItens = data.itens || [];
        setItens(listaItens);
        // Se ainda não selecionou nenhum produto, seleciona o primeiro com maior economia por padrão
        if (!itemSelecionado && listaItens.length > 0) {
          const itemDestaque = [...listaItens].sort((a, b) => b.diffLote - a.diffLote)[0];
          setItemSelecionado(itemDestaque);
        }
      } else {
        addToast('Falha ao carregar comparativo de economia.', 'error');
      }
    } catch (e: any) {
      addToast('Erro ao carregar dados: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      carregarDados();
    } else {
      setItemSelecionado(null);
      setChartPontos([]);
    }
  }, [isOpen]);

  // Carrega os dados do gráfico quando um produto é clicado
  useEffect(() => {
    if (!itemSelecionado) {
      setChartPontos([]);
      setChartEstatisticas(null);
      return;
    }

    let cancelado = false;
    setChartLoading(true);
    setChartErro(null);

    fetch(`/api/belaped/historico-precos-produto?ean=${encodeURIComponent(itemSelecionado.ean)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelado) return;
        if (data.success) {
          let pts = data.pontos || [];
          
          // Se não houver histórico suficiente retornado pelo robô, constrói os pontos base
          if (pts.length < 2) {
            const dataHoje = new Date().toISOString().split('T')[0];
            const dataHist = itemSelecionado.dataUltCompra ? itemSelecionado.dataUltCompra.split('T')[0] : 'Última Compra';
            pts = [
              {
                data: dataHist,
                fornecedor: itemSelecionado.fornUltCompra ? `NF - ${itemSelecionado.fornUltCompra.slice(0, 15)}` : 'Nota Fiscal Digifarma',
                preco: itemSelecionado.precoUltCompra,
                origem: 'COMPRA_NF'
              },
              {
                data: dataHoje,
                fornecedor: itemSelecionado.distribuidora,
                preco: itemSelecionado.precoHoje,
                origem: 'PEDIDO_BELAPED'
              }
            ];
          }

          setChartPontos(pts);
          setChartEstatisticas(data.estatisticas || null);
        } else {
          setChartErro(data.error || 'Erro ao carregar histórico');
        }
      })
      .catch(err => {
        if (cancelado) return;
        setChartErro(err.message || 'Erro ao conectar à inteligência de preços.');
      })
      .finally(() => {
        if (!cancelado) setChartLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [itemSelecionado]);

  // Transforma os pontos para formato Recharts (colunas por fornecedor)
  const dadosGrafico = useMemo(() => {
    if (!chartPontos.length) return [];
    const datasUnicas = Array.from(new Set(chartPontos.map(p => p.data))).sort();
    return datasUnicas.map(dataStr => {
      const pontosDestaData = chartPontos.filter(p => p.data === dataStr);
      const itemGrafico: Record<string, any> = { data: dataStr };
      pontosDestaData.forEach(p => {
        const chave = p.fornecedor.toUpperCase();
        itemGrafico[chave] = p.preco;
      });
      return itemGrafico;
    });
  }, [chartPontos]);

  const fornecedoresGrafico = useMemo(() => {
    return Array.from(new Set(chartPontos.map(p => p.fornecedor.toUpperCase())));
  }, [chartPontos]);

  const itensFiltrados = useMemo(() => {
    return itens.filter(item => {
      const matchDist = distFiltro === 'TODAS' || item.distribuidora.toUpperCase().includes(distFiltro);
      const matchStatus = 
        statusFiltro === 'TODOS' ||
        (statusFiltro === 'MAIS_BARATO' && item.economizou) ||
        (statusFiltro === 'REAJUSTE' && !item.economizou);
      const termo = busca.trim().toLowerCase();
      const matchBusca = !termo || 
        item.descricao.toLowerCase().includes(termo) || 
        item.ean.includes(termo);
      return matchDist && matchStatus && matchBusca;
    });
  }, [itens, distFiltro, statusFiltro, busca]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-7xl max-h-[94vh] flex flex-col bg-[#0b1320] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-[#0f1a2c]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                Painel Visual de Economia & Comparativo de Compras
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  BelaPed Inteligência
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Auditoria de custo: Comparação exata entre o preço pago hoje vs. a última compra no Digifarma
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Imprimir Relatório"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={carregarDados}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 transition-colors"
              title="Recarregar dados"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CORPO MODAL COM SCROLL */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* TOTALIZADORES DE ALTO IMPACTO (KPIS) */}
          {resumo && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-[#0e1726] border border-slate-800 shadow-sm">
                <span className="text-[11px] font-semibold text-slate-400 block mb-0.5">Total Investido (Hoje)</span>
                <div className="text-lg sm:text-xl font-black text-white">{brl(resumo.totalInvestido)}</div>
                <span className="text-[10px] text-slate-400 block mt-0.5">{resumo.totalItens} produtos cotados</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0e1726] border border-slate-800 shadow-sm">
                <span className="text-[11px] font-semibold text-slate-400 block mb-0.5">Se Comprado ao Custo Antigo</span>
                <div className="text-lg sm:text-xl font-black text-slate-300 line-through decoration-rose-500/80">
                  {brl(resumo.totalHistorico)}
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">Base no histórico Digifarma</span>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-800/60 shadow-sm">
                <span className="text-[11px] font-semibold text-emerald-300 block mb-0.5 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Economia Real no Bolso
                </span>
                <div className="text-lg sm:text-xl font-black text-emerald-400">
                  {brl(resumo.economiaLiquida)}
                </div>
                <span className="text-[10px] font-bold text-emerald-300 block mt-0.5">
                  Economia de {resumo.economiaPct}%
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-800/60 shadow-sm">
                <span className="text-[11px] font-semibold text-blue-300 block mb-0.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" /> Prazo Médio / Caixa
                </span>
                <div className="text-lg sm:text-xl font-black text-cyan-300">
                  Jan / 2027
                </div>
                <span className="text-[10px] text-blue-300/80 block mt-0.5">
                  Oriente com prazo estendido
                </span>
              </div>
            </div>
          )}

          {/* TOTALIZADORES POR DISTRIBUIDORA */}
          {resumo && resumo.porDistribuidora && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Object.entries(resumo.porDistribuidora).map(([dist, d]) => {
                const econ = Math.max(0, d.totalHist - d.totalHoje);
                const pct = d.totalHist > 0 ? ((econ / d.totalHist) * 100).toFixed(1) : 0;
                return (
                  <div key={dist} className="p-3 rounded-xl bg-[#0e1726] border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black uppercase text-white flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-cyan-400" /> {dist}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                        -{pct}%
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between mt-1 text-xs">
                      <span className="text-slate-400">Total: <strong className="text-white font-bold">{brl(d.totalHoje)}</strong></span>
                      <span className="text-slate-400">{d.itens} itens ({d.unidades} un)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* BARRA DE FILTROS E PESQUISA */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 rounded-xl bg-[#0e1726] border border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 mr-1">
                <Filter className="w-3 h-3" /> Distribuidora:
              </span>
              {['TODAS', 'ORIENTE', 'DISTRIMED', 'DPC'].map(d => (
                <button
                  key={d}
                  onClick={() => setDistFiltro(d)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    distFiltro === d 
                      ? 'bg-cyan-500 text-slate-950 shadow-sm' 
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {d}
                </button>
              ))}

              <span className="text-slate-700 mx-1">|</span>

              {['TODOS', 'MAIS_BARATO', 'REAJUSTE'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFiltro(s as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    statusFiltro === s 
                      ? 'bg-emerald-500 text-slate-950 shadow-sm' 
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {s === 'TODOS' ? 'Todos' : s === 'MAIS_BARATO' ? '🟢 Mais Baratos' : '🟡 Reajustes'}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar produto ou EAN..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* CONTEÚDO PRINCIPAL: LISTA + PAINEL DE GRÁFICO QUANDO SELECIONADO */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            
            {/* COLUNA ESQUERDA: LISTA INTERATIVA DE PRODUTOS COMPRADOS */}
            <div className={`${itemSelecionado ? 'lg:col-span-7' : 'lg:col-span-12'} transition-all duration-200`}>
              <div className="rounded-xl border border-slate-800 overflow-hidden bg-[#0a111c]">
                <div className="p-2.5 border-b border-slate-800/80 bg-[#0d1624] flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-cyan-400" />
                    Produtos Comprados Recentes ({itensFiltrados.length})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    💡 Clique em qualquer produto para abrir o gráfico
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-[#0e1726] border-b border-slate-800">
                        <th className="px-3 py-2 text-left whitespace-nowrap">Produto / EAN</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Distribuidora</th>
                        <th className="px-3 py-2 text-right whitespace-nowrap">Qtd</th>
                        <th className="px-3 py-2 text-right whitespace-nowrap">Preço Hoje</th>
                        <th className="px-3 py-2 text-right whitespace-nowrap">Última Compra</th>
                        <th className="px-3 py-2 text-right whitespace-nowrap">Econ. Lote</th>
                        <th className="px-3 py-2 text-center whitespace-nowrap">Status</th>
                        <th className="px-2 py-2 text-center whitespace-nowrap">Gráfico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {itensFiltrados.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                            Nenhum produto encontrado com os filtros aplicados.
                          </td>
                        </tr>
                      )}
                      {itensFiltrados.map((it, idx) => {
                        const isMelhor = it.economizou;
                        const isSelected = itemSelecionado?.ean === it.ean;
                        return (
                          <tr 
                            key={idx}
                            onClick={() => setItemSelecionado(it)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-cyan-950/40 ring-1 ring-inset ring-cyan-500/50'
                                : isMelhor 
                                  ? 'hover:bg-slate-900/60 bg-emerald-950/5' 
                                  : 'hover:bg-slate-900/60 bg-amber-950/5'
                            }`}
                          >
                            <td className="px-3 py-2 whitespace-nowrap font-medium text-white max-w-[260px] truncate" title={it.descricao}>
                              <div className="flex flex-col">
                                <span className="truncate">{it.descricao}</span>
                                <span className="text-[10px] text-slate-400 font-mono">EAN: {it.ean}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-slate-300 font-semibold">
                              {it.distribuidora}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-right font-bold text-slate-200">
                              {it.qtd}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-right font-black text-cyan-300">
                              {brl(it.precoHoje)}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-right font-semibold text-slate-400 line-through">
                              {brl(it.precoUltCompra)}
                            </td>
                            <td className={`px-3 py-2 whitespace-nowrap text-right font-black ${
                              isMelhor ? 'text-emerald-300' : 'text-amber-300'
                            }`}>
                              {isMelhor ? '-' : '+'}{brl(Math.abs(it.diffLote))}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-center">
                              {isMelhor ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <ArrowDownRight className="w-3 h-3" /> -{Math.abs(it.pctVar)}%
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  <ArrowUpRight className="w-3 h-3" /> +{Math.abs(it.pctVar)}%
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setItemSelecionado(it);
                                }}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isSelected 
                                    ? 'bg-cyan-500 text-slate-950 font-bold' 
                                    : 'bg-slate-800 text-slate-300 hover:text-cyan-300 hover:bg-slate-700'
                                }`}
                                title="Ver gráfico e histórico de preços"
                              >
                                <LineChartIcon className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA: PAINEL DEDICADO DO GRÁFICO DO PRODUTO */}
            {itemSelecionado && (
              <div className="lg:col-span-5 space-y-3 sticky top-0">
                <div className="p-4 rounded-xl bg-[#091122] border border-cyan-800/80 shadow-xl space-y-4">
                  
                  {/* CABEÇALHO DO PRODUTO SELECIONADO */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div>
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                        <LineChartIcon className="w-3.5 h-3.5" />
                        Gráfico & Tendência do Produto
                      </div>
                      <h3 className="text-sm font-black text-white mt-0.5 line-clamp-2" title={itemSelecionado.descricao}>
                        {itemSelecionado.descricao}
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                        <span>EAN: {itemSelecionado.ean}</span>
                        <span>•</span>
                        <span className="text-slate-300 font-semibold">{itemSelecionado.distribuidora}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setItemSelecionado(null)}
                      className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
                      title="Ocultar Gráfico"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* CARDS COMPARATIVOS RÁPIDOS DO PRODUTO */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-[#0c1629] border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Preço Pago Hoje</span>
                      <span className="text-base font-black text-cyan-300">{brl(itemSelecionado.precoHoje)}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{itemSelecionado.distribuidora}</span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#0c1629] border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Última Compra (Digifarma)</span>
                      <span className="text-base font-black text-slate-300 line-through decoration-rose-500/80">
                        {brl(itemSelecionado.precoUltCompra)}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5 truncate" title={itemSelecionado.fornUltCompra || 'NF'}>
                        {itemSelecionado.fornUltCompra ? itemSelecionado.fornUltCompra.slice(0, 18) : 'Nota Fiscal'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-800/40">
                      <span className="text-[10px] text-emerald-300 block">Economia Total Lote</span>
                      <span className="text-base font-black text-emerald-400">
                        {itemSelecionado.economizou ? '-' : '+'}{brl(Math.abs(itemSelecionado.diffLote))}
                      </span>
                      <span className="text-[10px] text-emerald-300/80 block mt-0.5">
                        {itemSelecionado.qtd} unidades pedidas
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#0c1629] border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Menor Histórico Já Visto</span>
                      <span className="text-base font-black text-emerald-300">
                        {chartEstatisticas && chartEstatisticas.menorPrecoHistorico > 0 
                          ? brl(chartEstatisticas.menorPrecoHistorico) 
                          : brl(Math.min(itemSelecionado.precoHoje, itemSelecionado.precoUltCompra))}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {chartEstatisticas?.melhorDiaSemana ? `Melhor dia: ${chartEstatisticas.melhorDiaSemana}` : 'Robô B2B'}
                      </span>
                    </div>
                  </div>

                  {/* ÁREA DO GRÁFICO RECHARTS */}
                  <div className="p-3 rounded-xl bg-[#060c18] border border-slate-800/80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-cyan-400" /> Curva de Preços (Digifarma vs Portais)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {chartPontos.length} ponto(s)
                      </span>
                    </div>

                    {chartLoading ? (
                      <div className="h-56 flex flex-col items-center justify-center gap-2">
                        <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs text-cyan-300 font-semibold">Buscando histórico do produto...</span>
                      </div>
                    ) : chartErro ? (
                      <div className="h-56 flex items-center justify-center p-3 text-xs text-rose-300 text-center">
                        {chartErro}
                      </div>
                    ) : dadosGrafico.length > 0 ? (
                      <div className="w-full h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={dadosGrafico} margin={{ top: 10, right: 12, left: -15, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis 
                              dataKey="data" 
                              stroke="#64748b" 
                              fontSize={10} 
                              tickFormatter={(val: string) => {
                                if (!val) return '';
                                const parts = val.split('-');
                                return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : val;
                              }}
                            />
                            <YAxis 
                              stroke="#64748b" 
                              fontSize={10} 
                              tickFormatter={(val: number) => `R$${val.toFixed(2)}`}
                              domain={['auto', 'auto']}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#091122', 
                                borderColor: '#1e293b', 
                                borderRadius: '0.75rem',
                                color: '#fff',
                                fontSize: '11px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                              }}
                              formatter={(value: any, name: any) => [`R$ ${Number(value).toFixed(2)}`, name]}
                              labelFormatter={(label: any) => `Data: ${label}`}
                            />
                            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '6px' }} />
                            {fornecedoresGrafico.map((forn) => (
                              <Line
                                key={forn}
                                type="monotone"
                                dataKey={forn}
                                name={forn}
                                stroke={getCorFornecedor(forn)}
                                strokeWidth={2.5}
                                dot={{ r: 4, strokeWidth: 1.5 }}
                                activeDot={{ r: 6 }}
                                connectNulls
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-56 flex items-center justify-center text-xs text-slate-500">
                        Histórico sendo acumulado pelas cotações diárias.
                      </div>
                    )}
                  </div>

                  {/* DICA DE MERCADO / INTELIGÊNCIA */}
                  {chartEstatisticas?.dicaMercado && (
                    <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-800/40 text-xs text-cyan-200 flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <span>{chartEstatisticas.dicaMercado}</span>
                    </div>
                  )}

                </div>
              </div>
            )}

          </div>

        </div>

        {/* RODAPÉ DO MODAL */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-[#0f1a2c] text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Preços conferidos com notas fiscais reais do Digifarma e robôs oficiais do BelaPed</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors"
          >
            Fechar Painel
          </button>
        </div>

      </div>
    </div>
  );
};

export default BelaPedEconomiaModal;
