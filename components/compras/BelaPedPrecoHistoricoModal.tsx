import React, { useState, useEffect } from 'react';
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  DollarSign, 
  Clock, 
  Layers, 
  Bot, 
  FileText, 
  Sparkles, 
  AlertCircle,
  HelpCircle
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

interface PontoHistorico {
  data: string;
  fornecedor: string;
  preco: number;
  origem: 'ROBO_B2B' | 'COMPRA_NF';
  diaSemana: number;
}

interface EstatisticasHistorico {
  totalColetas: number;
  menorPrecoHistorico: number;
  maiorPrecoHistorico: number;
  melhorDiaSemana: string;
  melhorDiaSemanaIndex: number;
  melhorQuinzena: string;
  dicaMercado: string;
}

interface BelaPedPrecoHistoricoModalProps {
  ean: string;
  produtoId: number;
  descricao: string;
  precoAtual?: number;
  fornecedorAtual?: string;
  isOpen: boolean;
  onClose: () => void;
}

const DISTRIBUIDORA_CORES: Record<string, string> = {
  PROFARMA: '#10b981', // Emerald
  DPC: '#06b6d4',      // Cyan
  SOTON: '#f59e0b',    // Amber
  DISTRIMED: '#8b5cf6', // Violet
  'Nota Fiscal (NF)': '#94a3b8' // Slate
};

export const BelaPedPrecoHistoricoModal: React.FC<BelaPedPrecoHistoricoModalProps> = ({
  ean,
  produtoId,
  descricao,
  precoAtual,
  fornecedorAtual,
  isOpen,
  onClose
}) => {
  const [loading, setLoading] = useState(false);
  const [pontos, setPontos] = useState<PontoHistorico[]>([]);
  const [estatisticas, setEstatisticas] = useState<EstatisticasHistorico | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || (!ean && !produtoId)) return;

    let cancelado = false;
    setLoading(true);
    setErro(null);

    const carregarHistorico = async () => {
      try {
        const query = new URLSearchParams();
        if (ean) query.set('ean', ean);
        if (produtoId) query.set('produto_id', String(produtoId));

        const res = await fetch(`/api/belaped/historico-precos-produto?${query.toString()}`);
        if (!res.ok) throw new Error('Falha ao consultar histórico de preços.');
        const data = await res.json();

        if (!cancelado) {
          if (data.success) {
            setPontos(data.pontos || []);
            setEstatisticas(data.estatisticas || null);
          } else {
            setErro(data.error || 'Erro desconhecido');
          }
        }
      } catch (err: any) {
        if (!cancelado) {
          setErro(err.message || 'Erro ao carregar dados de preços.');
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    carregarHistorico();

    return () => {
      cancelado = true;
    };
  }, [isOpen, ean, produtoId]);

  if (!isOpen) return null;

  // Prepara dados transformados para o Recharts (uma linha por data única com valores por distribuidora)
  const datasUnicas = Array.from(new Set(pontos.map(p => p.data))).sort();
  const dadosGrafico = datasUnicas.map(dataStr => {
    const pontosDestaData = pontos.filter(p => p.data === dataStr);
    const itemGrafico: Record<string, any> = { data: dataStr };

    pontosDestaData.forEach(p => {
      const chaveFornecedor = p.fornecedor.toUpperCase();
      itemGrafico[chaveFornecedor] = p.preco;
    });

    return itemGrafico;
  });

  // Lista única de fornecedores presentes nos pontos
  const fornecedoresPresentes = Array.from(new Set(pontos.map(p => p.fornecedor.toUpperCase())));

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl max-h-[92vh] bg-[#0c1527] border border-cyan-800/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 ring-1 ring-cyan-500/30"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Modal */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-slate-800/90 bg-[#091122]">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-600/50 text-cyan-400 mt-0.5">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-cyan-400">
                  Inteligência de Mercado BelaPed
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-900/60 text-cyan-200 border border-cyan-700/60">
                  Série Temporal de Cotações
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white mt-0.5 leading-snug">
                {descricao}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                <span className="font-mono text-cyan-300">EAN: {ean || 'Sem EAN'}</span>
                <span>•</span>
                <span>ID: {produtoId}</span>
                {precoAtual && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400 font-bold">
                      Preço Hoje: R$ {precoAtual.toFixed(2)} ({fornecedorAtual || 'Menor Oferta'})
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Fechar Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo Modal */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-9 h-9 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-bold text-cyan-300">
                Compilando histórico de preços e tendências...
              </span>
            </div>
          ) : erro ? (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{erro}</span>
            </div>
          ) : (
            <>
              {/* Cards de Inteligência e Melhores Dias */}
              {estatisticas && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Menor Preço Histórico */}
                  <div className="p-3.5 rounded-xl bg-[#081224] border border-emerald-800/60 shadow-inner">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      Menor Preço Capturado
                    </span>
                    <div className="text-xl font-black text-white mt-1">
                      {estatisticas.menorPrecoHistorico > 0 ? (
                        <>R$ {estatisticas.menorPrecoHistorico.toFixed(2)}</>
                      ) : (
                        '—'
                      )}
                    </div>
                    <span className="text-[11px] text-emerald-300/80 font-medium mt-0.5 block">
                      Piso histórico nas distribuidoras
                    </span>
                  </div>

                  {/* Melhor Dia da Semana */}
                  <div className="p-3.5 rounded-xl bg-[#081224] border border-cyan-800/60 shadow-inner">
                    <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Melhor Dia de Compra
                    </span>
                    <div className="text-xl font-black text-cyan-300 mt-1">
                      {estatisticas.melhorDiaSemana}
                    </div>
                    <span className="text-[11px] text-cyan-200/80 font-medium mt-0.5 block truncate" title={estatisticas.dicaMercado}>
                      Dia de maior desconto médio
                    </span>
                  </div>

                  {/* Melhor Quinzena / Época do Mês */}
                  <div className="p-3.5 rounded-xl bg-[#081224] border border-amber-800/60 shadow-inner">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Ciclo do Mês Ideal
                    </span>
                    <div className="text-sm font-black text-amber-200 mt-1.5 truncate">
                      {estatisticas.melhorQuinzena}
                    </div>
                    <span className="text-[11px] text-amber-300/80 font-medium mt-0.5 block">
                      Reposição com maior agressividade
                    </span>
                  </div>

                  {/* Total de Coletas Registradas */}
                  <div className="p-3.5 rounded-xl bg-[#081224] border border-indigo-800/60 shadow-inner">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                      <Bot className="w-3.5 h-3.5" />
                      Cotações Rastreadas
                    </span>
                    <div className="text-xl font-black text-indigo-200 mt-1">
                      {estatisticas.totalColetas} coletas
                    </div>
                    <span className="text-[11px] text-indigo-300/80 font-medium mt-0.5 block">
                      Robôs B2B + Compras Reais
                    </span>
                  </div>
                </div>
              )}

              {/* Dica Estratégica em Destaque */}
              {estatisticas?.dicaMercado && (
                <div className="p-3 rounded-xl bg-gradient-to-r from-cyan-950/60 to-emerald-950/60 border border-cyan-700/60 flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-cyan-100 font-semibold leading-relaxed">
                    <b>Estratégia Recomendada:</b> {estatisticas.dicaMercado}
                  </p>
                </div>
              )}

              {/* Gráfico de Evolução Temporal */}
              <div className="p-4 rounded-xl bg-[#081020] border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    Evolução Histórica do Preço por Fornecedor
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {pontos.length} registros computados
                  </span>
                </div>

                {dadosGrafico.length > 0 ? (
                  <div className="w-full h-64 sm:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dadosGrafico} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis 
                          dataKey="data" 
                          stroke="#64748b" 
                          fontSize={11} 
                          tickFormatter={(val: string) => {
                            if (!val) return '';
                            const parts = val.split('-');
                            return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : val;
                          }}
                        />
                        <YAxis 
                          stroke="#64748b" 
                          fontSize={11} 
                          tickFormatter={(val: number) => `R$ ${val.toFixed(2)}`}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#0b1329', 
                            borderColor: '#1e293b', 
                            borderRadius: '0.75rem',
                            color: '#fff',
                            fontSize: '12px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                          }}
                          formatter={(value: any, name: any) => [`R$ ${Number(value).toFixed(2)}`, name]}
                          labelFormatter={(label: any) => `Data: ${label}`}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        {fornecedoresPresentes.map((forn) => (
                          <Line
                            key={forn}
                            type="monotone"
                            dataKey={forn}
                            name={forn}
                            stroke={DISTRIBUIDORA_CORES[forn] || '#38bdf8'}
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
                  <div className="py-12 text-center text-slate-500 text-xs">
                    Nenhum registro histórico suficiente para traçar curvas. O robô irá acumular coletas diariamente.
                  </div>
                )}
              </div>

              {/* Tabela de Últimas Coletas */}
              <div className="p-4 rounded-xl bg-[#081020] border border-slate-800">
                <span className="text-xs font-black uppercase tracking-wider text-slate-300 block mb-3">
                  Extrato Cronológico de Cotações & Compras
                </span>
                <div className="overflow-x-auto max-h-56">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#0c1830] text-slate-400 font-bold uppercase text-[10px] sticky top-0">
                      <tr>
                        <th className="py-2 px-3 whitespace-nowrap">Data</th>
                        <th className="py-2 px-3 whitespace-nowrap">Fornecedor</th>
                        <th className="py-2 px-3 whitespace-nowrap">Origem</th>
                        <th className="py-2 px-3 whitespace-nowrap text-right">Preço</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {pontos.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-500">
                            Sem coletas anteriores.
                          </td>
                        </tr>
                      ) : (
                        pontos.slice().reverse().map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40">
                            <td className="py-2 px-3 text-slate-300 font-mono whitespace-nowrap">
                              {p.data}
                            </td>
                            <td className="py-2 px-3 font-bold text-white whitespace-nowrap">
                              {p.fornecedor}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.origem === 'ROBO_B2B' 
                                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60' 
                                  : 'bg-slate-800 text-slate-300'
                              }`}>
                                {p.origem === 'ROBO_B2B' ? 'Robô B2B' : 'NF Compra'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-black text-emerald-300 whitespace-nowrap">
                              R$ {p.preco.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="p-3 sm:p-4 bg-[#091122] border-t border-slate-800/90 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <HelpCircle className="w-4 h-4 text-cyan-400" />
            <span>Dados sincronizados automaticamente a cada cotação do robô e entrada de NF.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-black transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
