import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Award, 
  CheckCircle2, 
  Building2, 
  Tag, 
  History, 
  TrendingDown, 
  DollarSign, 
  Package, 
  ShieldCheck, 
  ArrowRightLeft,
  AlertCircle
} from 'lucide-react';

interface ConcorrenteItem {
  distribuidora: string;
  ean: string | null;
  descricao: string;
  laboratorio: string | null;
  preco: number;
  isSubstituto: boolean;
  jaTeveNaLoja: boolean;
  vencedorPortal: boolean;
}

interface CotacaoPortal {
  fornecedor: string;
  preco: number | null;
  disponivel: boolean;
  descricao: string;
  ean_substituto?: string | null;
  laboratorio?: string | null;
  is_substituto: boolean;
  url_produto?: string | null;
  condicao_comercial?: string | null;
  updated_at?: string;
}

interface EquivalenciaDb {
  id: number;
  ean_original: string;
  ean_substituto: string;
  descricao_original: string;
  descricao_substituto: string;
  laboratorio: string;
  principio_ativo: string;
  origem_portal: string;
  preco_original: number;
  preco_substituto: number;
  economia_reais: number;
  data_vinculo: string;
}

interface ConcorrentesResponse {
  success: boolean;
  ean: string;
  produtoOriginal: {
    ean: string;
    descricao: string;
    saldo: number;
    custo_unitario: number;
    preco_unitario_ult_compra: number;
    vmd_ponderado: number;
    curva_abc: string;
  } | null;
  concorrentes: ConcorrenteItem[];
  cotacoesPorPortal: CotacaoPortal[];
  equivalencias: EquivalenciaDb[];
}

interface BelaPedConcorrentesModalProps {
  isOpen: boolean;
  onClose: () => void;
  ean: string;
  descricao: string;
  custoUnitario?: number;
  saldo?: number;
}

export const BelaPedConcorrentesModal: React.FC<BelaPedConcorrentesModalProps> = ({
  isOpen,
  onClose,
  ean,
  descricao,
  custoUnitario = 0,
  saldo = 0
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ConcorrentesResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !ean) return;

    let cancelado = false;
    setLoading(true);
    setErro(null);

    fetch(`/api/belaped/concorrentes-essencia/${encodeURIComponent(ean)}`)
      .then(res => {
        if (!res.ok) throw new Error(`Erro ${res.status} ao carregar concorrentes.`);
        return res.json();
      })
      .then((resJson: ConcorrentesResponse) => {
        if (!cancelado) {
          if (resJson.success) {
            setData(resJson);
          } else {
            setErro('Não foi possível obter os concorrentes para este item.');
          }
        }
      })
      .catch(err => {
        if (!cancelado) setErro(err.message || 'Falha de comunicação com o servidor.');
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [isOpen, ean]);

  if (!isOpen) return null;

  const prod = data?.produtoOriginal;
  const custoBase = prod?.custo_unitario || custoUnitario || 0;
  const concorrentes = data?.concorrentes || [];
  const vencedorGeral = concorrentes.find(c => c.preco > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-[#0b1323] border border-cyan-500/50 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* Cabeçalho */}
        <div className="p-4 px-6 bg-gradient-to-r from-[#0d1e38] via-[#102747] to-[#0c1626] border-b border-cyan-800/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-inner">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Cotação por Essência & Menor Preço Geral
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-950 text-purple-300 border border-purple-700/80">
                  Desvinculado do EAN
                </span>
              </div>
              <p className="text-xs text-slate-300 truncate max-w-xl font-medium mt-0.5">
                {descricao} {ean ? `• EAN Origem: ${ean}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
            title="Fechar Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo com rolagem */}
        <div className="p-6 overflow-y-auto space-y-5">
          {loading && (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div>
              <span className="text-xs font-bold text-slate-400 tracking-wide">
                Cruzando dados de concorrentes e histórico farmacológico...
              </span>
            </div>
          )}

          {erro && (
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-center gap-3 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{erro}</span>
            </div>
          )}

          {!loading && !erro && (
            <>
              {/* Cards Superiores: Produto Base vs Vencedor Eleito */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Card 1: Produto Atual da BelaFarma */}
                <div className="p-4 rounded-2xl bg-[#08101d] border border-cyan-900/60 relative overflow-hidden">
                  <div className="text-[10px] font-black uppercase text-cyan-400 mb-1 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-cyan-400" />
                    Produto Cadastrado na Farmácia (Origem)
                  </div>
                  <div className="text-sm font-bold text-white truncate" title={descricao}>
                    {descricao}
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    EAN: {ean || '—'}
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Estoque Físico</span>
                      <span className={`font-black ${saldo <= 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                        {saldo} un
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Custo Cadastrado</span>
                      <span className="font-black text-amber-300">
                        {custoBase > 0 ? `R$ ${custoBase.toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Curva ABC</span>
                      <span className="font-black text-cyan-300">
                        {prod?.curva_abc || 'C'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 2: Vencedor da Essência Farmacológica */}
                <div className="p-4 rounded-2xl bg-[#081720] border border-emerald-600/60 relative overflow-hidden">
                  <div className="text-[10px] font-black uppercase text-emerald-400 mb-1 flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-emerald-400" />
                    Opção Mais Barata Encontrada (Vencedor)
                  </div>
                  {vencedorGeral ? (
                    <>
                      <div className="text-sm font-black text-emerald-200 truncate" title={vencedorGeral.descricao}>
                        {vencedorGeral.descricao}
                      </div>
                      <div className="text-xs text-emerald-400/90 flex items-center gap-2 mt-0.5 font-medium">
                        <span>Lab: <strong>{vencedorGeral.laboratorio || 'Genérico'}</strong></span>
                        <span>•</span>
                        <span>Portal: <strong>{vencedorGeral.distribuidora}</strong></span>
                        <span>•</span>
                        <span className="font-mono">EAN: {vencedorGeral.ean || '—'}</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-emerald-900/60 text-xs">
                        <div>
                          <span className="text-emerald-400/80 text-[10px] block">Preço Ofertado</span>
                          <span className="font-black text-emerald-300 text-sm">
                            R$ {vencedorGeral.preco.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-emerald-400/80 text-[10px] block">Economia em Reais</span>
                          <span className="font-black text-cyan-300">
                            {custoBase > vencedorGeral.preco
                              ? `R$ ${(custoBase - vencedorGeral.preco).toFixed(2)}`
                              : 'R$ 0,00'}
                          </span>
                        </div>
                        <div>
                          <span className="text-emerald-400/80 text-[10px] block">% vs Custo Atual</span>
                          <span className="font-black text-emerald-400">
                            {custoBase > 0 && vencedorGeral.preco < custoBase
                              ? `-${(((custoBase - vencedorGeral.preco) / custoBase) * 100).toFixed(1)}%`
                              : '0%'}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-400 italic py-3">
                      Nenhuma cotação com estoque ativo encontrada no momento nos 7 portais.
                    </div>
                  )}
                </div>

              </div>

              {/* Tabela de Concorrentes Avaliados */}
              <div className="bg-[#070e1c] rounded-2xl border border-slate-800 overflow-hidden">
                <div className="p-3 px-4 bg-[#0a1426] border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                      Concorrentes & Equivalentes Avaliados ({concorrentes.length} opções encontradas)
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-semibold">
                    Classificados do menor para o maior preço
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#050b14] text-slate-400 border-b border-slate-800/80 uppercase text-[10px] font-black">
                        <th className="py-2.5 px-3.5 whitespace-nowrap">Distribuidora</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap">Laboratório</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap min-w-[200px]">Descrição no Portal</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap">EAN Substituto</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap text-center">Já Teve na Loja?</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Preço</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Economia vs Custo</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {concorrentes.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                            Nenhum concorrente registrado para este termo de essência ainda.
                          </td>
                        </tr>
                      ) : (
                        concorrentes.map((c, idx) => {
                          const isVencedor = idx === 0 && c.preco > 0;
                          const economiaReais = custoBase > c.preco ? custoBase - c.preco : 0;
                          const economiaPct = custoBase > 0 && c.preco < custoBase
                            ? (((custoBase - c.preco) / custoBase) * 100).toFixed(1)
                            : null;

                          return (
                            <tr
                              key={`${c.distribuidora}_${c.ean}_${idx}`}
                              className={`transition-colors ${
                                isVencedor
                                  ? 'bg-emerald-950/25 border-l-4 border-l-emerald-500 font-medium'
                                  : 'hover:bg-slate-800/30'
                              }`}
                            >
                              <td className="py-2.5 px-3.5 whitespace-nowrap font-bold text-slate-200">
                                {c.distribuidora}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                  {c.laboratorio || 'Genérico'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap max-w-xs truncate" title={c.descricao}>
                                {c.descricao}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-[11px] text-slate-400">
                                {c.ean || '—'}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap text-center">
                                {c.jaTeveNaLoja ? (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/80 inline-flex items-center gap-1"
                                    title="Este item já teve estoque ou vendas no banco de dados da BelaFarma"
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    Sim
                                  </span>
                                ) : (
                                  <span className="text-slate-500 text-[10px]">Não</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap text-right font-black text-sm">
                                <span className={isVencedor ? 'text-emerald-300' : 'text-slate-200'}>
                                  R$ {c.preco.toFixed(2)}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap text-right">
                                {economiaReais > 0 ? (
                                  <span className="text-emerald-400 font-bold text-xs inline-flex items-center gap-0.5">
                                    <TrendingDown className="w-3 h-3 text-emerald-400" />
                                    R$ {economiaReais.toFixed(2)} {economiaPct ? `(-${economiaPct}%)` : ''}
                                  </span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap text-center">
                                {isVencedor ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500 text-slate-950 uppercase tracking-wider inline-flex items-center gap-1 shadow-sm">
                                    <Award className="w-3 h-3 text-slate-950" />
                                    Eleito
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">Cotado</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Seção de Vínculos Registrados no Banco (belaped_equivalencias) */}
              {data && data.equivalencias && data.equivalencias.length > 0 && (
                <div className="bg-[#070e1c] rounded-2xl border border-slate-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <History className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-black uppercase text-purple-300">
                      Histórico de Equivalências Salvas no Banco de Dados
                    </span>
                  </div>
                  <div className="space-y-2">
                    {data.equivalencias.map(eq => (
                      <div
                        key={eq.id}
                        className="flex flex-wrap items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-cyan-300 font-bold">{eq.ean_substituto}</span>
                          <span className="text-slate-400 truncate max-w-xs">{eq.descricao_substituto}</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                            {eq.laboratorio}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-300">
                          <span>Portal: <strong>{eq.origem_portal}</strong></span>
                          <span className="text-emerald-300 font-bold">R$ {eq.preco_substituto.toFixed(2)}</span>
                          <span className="text-slate-500 text-[10px]">
                            {new Date(eq.data_vinculo).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Rodapé */}
        <div className="p-4 px-6 bg-[#080e1a] border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Validação estrita de molécula ativa, dosagem e forma farmacêutica garantida.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
