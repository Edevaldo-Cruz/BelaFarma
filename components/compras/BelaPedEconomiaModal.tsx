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
  Sparkles
} from 'lucide-react';
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

export const BelaPedEconomiaModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [resumo, setResumo] = useState<ResumoEconomia | null>(null);
  const [itens, setItens] = useState<ItemEconomia[]>([]);
  const [distFiltro, setDistFiltro] = useState<string>('TODAS');
  const [statusFiltro, setStatusFiltro] = useState<'TODOS' | 'MAIS_BARATO' | 'REAJUSTE'>('TODOS');
  const [busca, setBusca] = useState<string>('');

  const carregarDados = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/belaped/relatorio-economia');
      if (res.ok) {
        const data = await res.json();
        setResumo(data.resumo);
        setItens(data.itens || []);
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
    }
  }, [isOpen]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-[#0b1320] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#0f1a2c]">
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
          
          {/* CARDS DE KPI DE ALTO IMPACTO */}
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
                  <Sparkles className="w-3 h-3" /> Economia Real no Bolso
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
                  <Calendar className="w-3 h-3" /> Prazo Médio / Caixa
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

          {/* CARDS POR DISTRIBUIDORA */}
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

          {/* BARRA DE FILTROS E BUSCA */}
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

          {/* TABELA DE ALTA DENSIDADE */}
          <div className="rounded-xl border border-slate-800 overflow-hidden bg-[#0a111c]">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-[#0e1726] border-b border-slate-800">
                    <th className="px-3 py-2 text-left whitespace-nowrap">Produto / EAN</th>
                    <th className="px-3 py-2 text-left whitespace-nowrap">Distribuidora</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Qtd</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Preço Hoje</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Última Compra</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Econ. Unit.</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Econ. Lote</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap">Variação</th>
                    <th className="px-3 py-2 text-center whitespace-nowrap">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {itensFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                        Nenhum produto encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  )}
                  {itensFiltrados.map((it, idx) => {
                    const isMelhor = it.economizou;
                    return (
                      <tr 
                        key={idx}
                        className={`hover:bg-slate-900/50 transition-colors ${
                          isMelhor ? 'bg-emerald-950/5' : 'bg-amber-950/5'
                        }`}
                      >
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-white">
                          <div className="flex flex-col">
                            <span>{it.descricao}</span>
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
                        <td className={`px-3 py-2 whitespace-nowrap text-right font-bold ${
                          isMelhor ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          {isMelhor ? '-' : '+'}{brl(Math.abs(it.diffUnit))}
                        </td>
                        <td className={`px-3 py-2 whitespace-nowrap text-right font-black ${
                          isMelhor ? 'text-emerald-300' : 'text-amber-300'
                        }`}>
                          {isMelhor ? '-' : '+'}{brl(Math.abs(it.diffLote))}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isMelhor ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}>
                            {isMelhor ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                            {it.pctVar > 0 ? `+${it.pctVar}%` : `${it.pctVar}%`}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          {isMelhor ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Economizou
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Reajuste
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
