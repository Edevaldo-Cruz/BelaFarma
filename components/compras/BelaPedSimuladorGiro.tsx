import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Calendar as CalendarIcon,
  Clock,
  Package,
  TrendingUp,
  AlertTriangle,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  Layers,
  ShoppingCart,
  Sparkles,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

interface ProdutoSimuladorResumo {
  produto_id: number;
  descricao: string;
  apresentacao: string;
  ean: string;
  curva_abc: string;
  saldo: number;
  est_minimo_calculado: number;
  vmd_ponderado: number;
  vmd_efetivo: number;
  vendas_30d: number;
  vendas_31_60d: number;
  vendas_61_90d: number;
  vendas_10m: number;
  dias_por_unidade: number | null;
  dias_duracao_estoque: number;
  custo_unitario: number;
  preco_venda_vigente: number;
}

interface ProdutoSimuladorDetalhe extends ProdutoSimuladorResumo {
  vendas_90d: number;
  chave_equivalencia: string | null;
  equivalentes: Array<{
    produto_id: number;
    descricao: string;
    ean: string;
    saldo: number;
    vmd_ponderado: number;
    vendas_30d: number;
    vendas_31_60d: number;
    vendas_61_90d: number;
    vendas_10m: number;
  }>;
  historico_vendas_datas: Array<{
    data_hora: string;
    quantidade: number;
  }>;
}

interface BelaPedSimuladorGiroProps {
  produtoInicialId?: number | null;
}

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const BelaPedSimuladorGiro: React.FC<BelaPedSimuladorGiroProps> = ({
  produtoInicialId
}) => {
  const [busca, setBusca] = useState('');
  const [buscandoLista, setBuscandoLista] = useState(false);
  const [resultadosBusca, setResultadosBusca] = useState<ProdutoSimuladorResumo[]>([]);
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoSimuladorDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  // Controles interativos de simulação
  const [compraSimulada, setCompraSimulada] = useState<number>(0);
  const [somarEquivalentes, setSomarEquivalentes] = useState<boolean>(false);
  const [mesOffset, setMesOffset] = useState<number>(0); // 0 = exibe Mês Atual e Próximo Mês

  // Busca lista de produtos conforme digitação
  const buscarProdutos = async (termo: string) => {
    try {
      setBuscandoLista(true);
      const res = await fetch(`/api/belaped/simulador-giro?busca=${encodeURIComponent(termo)}`);
      if (res.ok) {
        const data = await res.json();
        setResultadosBusca(data.produtos || []);
        // Se não há produto selecionado ainda e não veio produtoInicialId, seleciona o 1º da lista
        if (!produtoSelecionado && !produtoInicialId && data.produtos && data.produtos.length > 0) {
          selecionarProduto(data.produtos[0].produto_id);
        }
      }
    } catch (e) {
      // silencioso
    } finally {
      setBuscandoLista(false);
    }
  };

  const selecionarProduto = async (prodId: number) => {
    try {
      setCarregandoDetalhe(true);
      const res = await fetch(`/api/belaped/simulador-giro?produto_id=${prodId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.produto) {
          setProdutoSelecionado(data.produto);
          setCompraSimulada(0);
          setMesOffset(0);
        }
      }
    } catch (e) {
      // silencioso
    } finally {
      setCarregandoDetalhe(false);
    }
  };

  useEffect(() => {
    buscarProdutos('');
  }, []);

  useEffect(() => {
    if (produtoInicialId) {
      selecionarProduto(produtoInicialId);
    }
  }, [produtoInicialId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      buscarProdutos(busca);
    }, 280);
    return () => clearTimeout(timer);
  }, [busca]);

  // Cálculos consolidados do simulador (individual ou somando equivalentes)
  const dadosSimulacao = useMemo(() => {
    if (!produtoSelecionado) return null;

    const eqs = somarEquivalentes && produtoSelecionado.equivalentes ? produtoSelecionado.equivalentes : [];
    const saldoProprio = Math.max(0, Number(produtoSelecionado.saldo) || 0);
    const saldoEquiv = eqs.reduce((acc, e) => acc + Math.max(0, Number(e.saldo) || 0), 0);
    const saldoBase = saldoProprio + saldoEquiv;
    const saldoTotalComSimulacao = saldoBase + Math.max(0, compraSimulada);

    const v30 = (Number(produtoSelecionado.vendas_30d) || 0) + eqs.reduce((acc, e) => acc + (Number(e.vendas_30d) || 0), 0);
    const v60 = (Number(produtoSelecionado.vendas_31_60d) || 0) + eqs.reduce((acc, e) => acc + (Number(e.vendas_31_60d) || 0), 0);
    const v90 = (Number(produtoSelecionado.vendas_61_90d) || 0) + eqs.reduce((acc, e) => acc + (Number(e.vendas_61_90d) || 0), 0);
    const v10m = (Number(produtoSelecionado.vendas_10m) || 0) + eqs.reduce((acc, e) => acc + (Number(e.vendas_10m) || 0), 0);

    const vmdProprio = Number(produtoSelecionado.vmd_efetivo) || 0;
    const vmdEquiv = eqs.reduce((acc, e) => {
      const ev = Number(e.vmd_ponderado) || 0;
      if (ev > 0) return acc + ev;
      const e90 = (Number(e.vendas_30d) || 0) + (Number(e.vendas_31_60d) || 0) + (Number(e.vendas_61_90d) || 0);
      return acc + (e90 > 0 ? e90 / 90 : (Number(e.vendas_10m) || 0) / 300);
    }, 0);

    const vmd = vmdProprio + vmdEquiv;
    const diasPorUnidade = vmd > 0 ? Number((1 / vmd).toFixed(1)) : null;

    const diasDuracaoBase = vmd > 0 && saldoBase > 0 ? Math.ceil(saldoBase / vmd) : 0;
    const diasDuracaoTotal = vmd > 0 && saldoTotalComSimulacao > 0 ? Math.ceil(saldoTotalComSimulacao / vmd) : 0;
    const diasGanhosSimulacao = Math.max(0, diasDuracaoTotal - diasDuracaoBase);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const dataEsgotamentoBase = new Date(hoje);
    dataEsgotamentoBase.setDate(hoje.getDate() + diasDuracaoBase);

    const dataEsgotamentoTotal = new Date(hoje);
    dataEsgotamentoTotal.setDate(hoje.getDate() + diasDuracaoTotal);

    // Texto amigável de "De quantos em quantos dias vende"
    let fraseFrequencia = 'Sem vendas registradas no período';
    let subFraseFrequencia = 'Produto parado ou sem histórico recente';
    if (vmd > 0) {
      if (vmd >= 1) {
        const unPorDia = Number(vmd.toFixed(1));
        const horasPorUn = Math.max(1, Math.round(24 / vmd));
        fraseFrequencia = `Vende ~${unPorDia} un. todos os dias`;
        subFraseFrequencia = `Sai 1 unidade a cada ~${horasPorUn}h de loja aberta (~${Math.round(vmd * 30)} un/mês)`;
      } else {
        const dUn = Number((1 / vmd).toFixed(1));
        fraseFrequencia = `A cada ${dUn.toLocaleString('pt-BR')} dias vende 1 un.`;
        subFraseFrequencia = `Ritmo médio de ~${Math.max(1, Math.round(vmd * 30))} un. vendidas por mês (${(vmd * 7).toFixed(1)} un/semana)`;
      }
    }

    // Mapa dia-a-dia a partir de hoje para pintar o calendário (até 365 dias à frente)
    const mapaDias = new Map<string, {
      offsetDias: number;
      saldoInicioDia: number;
      saldoFimDia: number;
      unidadesVendidasNoDia: number;
      status: 'HOJE' | 'ESTOQUE_ATUAL' | 'COMPRA_SIMULADA' | 'ALERTA_PEDIDO' | 'DIA_RUPTURA' | 'SEM_ESTOQUE';
    }>();

    let acumuladoVendas = 0;
    let unidadesInteirasVendidasAnterior = 0;

    for (let d = 0; d <= 365; d++) {
      const dt = new Date(hoje);
      dt.setDate(hoje.getDate() + d);
      const chaveData = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

      if (vmd <= 0) {
        mapaDias.set(chaveData, {
          offsetDias: d,
          saldoInicioDia: saldoTotalComSimulacao,
          saldoFimDia: saldoTotalComSimulacao,
          unidadesVendidasNoDia: 0,
          status: d === 0 ? 'HOJE' : (saldoTotalComSimulacao > 0 ? 'ESTOQUE_ATUAL' : 'SEM_ESTOQUE')
        });
        continue;
      }

      const saldoAntes = Math.max(0, Number((saldoTotalComSimulacao - acumuladoVendas).toFixed(2)));
      acumuladoVendas += vmd;
      const unidadesInteirasAgora = Math.floor(acumuladoVendas + 0.0001);
      const vendeuHoje = Math.max(0, unidadesInteirasAgora - unidadesInteirasVendidasAnterior);
      unidadesInteirasVendidasAnterior = unidadesInteirasAgora;

      const saldoRestanteInteiro = Math.max(0, saldoTotalComSimulacao - unidadesInteirasAgora);

      let status: 'HOJE' | 'ESTOQUE_ATUAL' | 'COMPRA_SIMULADA' | 'ALERTA_PEDIDO' | 'DIA_RUPTURA' | 'SEM_ESTOQUE' = 'SEM_ESTOQUE';

      if (d === 0) {
        status = saldoTotalComSimulacao > 0 ? 'HOJE' : 'DIA_RUPTURA';
      } else if (d === diasDuracaoTotal && saldoTotalComSimulacao > 0) {
        status = 'DIA_RUPTURA';
      } else if (d < diasDuracaoTotal) {
        if (diasDuracaoTotal - d <= 5 && diasDuracaoTotal > 5) {
          status = 'ALERTA_PEDIDO';
        } else if (d > diasDuracaoBase && compraSimulada > 0) {
          status = 'COMPRA_SIMULADA';
        } else {
          status = 'ESTOQUE_ATUAL';
        }
      } else {
        status = 'SEM_ESTOQUE';
      }

      mapaDias.set(chaveData, {
        offsetDias: d,
        saldoInicioDia: saldoAntes,
        saldoFimDia: saldoRestanteInteiro,
        unidadesVendidasNoDia: d <= diasDuracaoTotal ? vendeuHoje : 0,
        status
      });
    }

    return {
      saldoProprio,
      saldoEquiv,
      saldoBase,
      saldoTotalComSimulacao,
      v30,
      v60,
      v90,
      v10m,
      vmd,
      diasPorUnidade,
      diasDuracaoBase,
      diasDuracaoTotal,
      diasGanhosSimulacao,
      dataEsgotamentoBase,
      dataEsgotamentoTotal,
      fraseFrequencia,
      subFraseFrequencia,
      mapaDias
    };
  }, [produtoSelecionado, compraSimulada, somarEquivalentes]);

  // Gera a grade de 2 meses consecutivos para o calendário visual
  const mesesCalendario = useMemo(() => {
    const base = new Date();
    base.setDate(1);
    base.setHours(0, 0, 0, 0);

    return [0, 1].map(idx => {
      const dataMes = new Date(base.getFullYear(), base.getMonth() + mesOffset + idx, 1);
      const ano = dataMes.getFullYear();
      const mes = dataMes.getMonth();
      const nomeMes = `${NOMES_MESES[mes]} ${ano}`;
      const primeiroDiaSemana = dataMes.getDay();
      const totalDiasMes = new Date(ano, mes + 1, 0).getDate();

      const celulas: Array<{
        dia: number | null;
        chaveData: string | null;
      }> = [];

      for (let i = 0; i < primeiroDiaSemana; i++) {
        celulas.push({ dia: null, chaveData: null });
      }
      for (let d = 1; d <= totalDiasMes; d++) {
        const chaveData = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        celulas.push({ dia: d, chaveData });
      }

      return { ano, mes, nomeMes, celulas };
    });
  }, [mesOffset]);

  return (
    <div className="space-y-4">
      {/* CABEÇALHO E BUSCA RÁPIDA DE PRODUTO */}
      <div className="bg-[#0e1626] p-4 rounded-2xl border border-slate-800 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base font-black uppercase tracking-wider text-white">
                Simulador de Giro & Calendário de Duração de Estoque
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Pesquise qualquer produto para ver de quantos em quantos dias ele é vendido e até que dia no calendário o estoque vai durar.
            </p>
          </div>

          {/* Barra de Busca */}
          <div className="relative min-w-[320px] lg:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite o nome do medicamento ou código EAN..."
              className="w-full pl-10 pr-4 py-2 text-xs font-bold rounded-xl border border-cyan-800/70 bg-[#080d18] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            {buscandoLista && (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400 absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>
        </div>

        {/* Lista rápida horizontal de produtos encontrados para clicar e simular */}
        <div className="mt-3 pt-3 border-t border-slate-800/80">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">
            {busca ? `Resultados para "${busca}" (${resultadosBusca.length}):` : 'Produtos com Giro Ativo (Clique para Simular no Calendário):'}
          </span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 custom-scrollbar">
            {resultadosBusca.length === 0 ? (
              <span className="text-xs text-slate-500 italic py-1">Nenhum produto encontrado para essa busca.</span>
            ) : (
              resultadosBusca.map(p => {
                const ativo = produtoSelecionado?.produto_id === p.produto_id;
                return (
                  <button
                    key={p.produto_id}
                    onClick={() => selecionarProduto(p.produto_id)}
                    className={`shrink-0 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                      ativo
                        ? 'bg-cyan-950/90 border-cyan-400 text-white shadow-md shadow-cyan-950/50'
                        : 'bg-[#09101d] border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black truncate max-w-[200px]">{p.descricao}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                        p.saldo <= 0 ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}>
                        {p.saldo} un
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-semibold">
                      <span>
                        {p.dias_por_unidade !== null
                          ? (p.dias_por_unidade < 1 ? `~${(1 / p.dias_por_unidade).toFixed(1)} un/dia` : `1 un a cada ${p.dias_por_unidade}d`)
                          : 'Sem giro recente'}
                      </span>
                      <span>•</span>
                      <span className="text-cyan-300">Dura ~{p.dias_duracao_estoque}d</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {carregandoDetalhe ? (
        <div className="bg-[#0e1626] p-12 rounded-2xl border border-slate-800 text-center">
          <RefreshCw className="w-6 h-6 animate-spin text-cyan-400 mx-auto mb-2" />
          <span className="text-xs font-bold text-slate-300">Calculando ritmo de venda e montando calendário do produto...</span>
        </div>
      ) : produtoSelecionado && dadosSimulacao ? (
        <>
          {/* BARRA DO PRODUTO SELECIONADO + SIMULADOR DE COMPRA (+ UNIDADES) */}
          <div className="bg-gradient-to-r from-[#0c182c] via-[#0e1b31] to-[#0a1324] p-4 rounded-2xl border border-cyan-800/60 shadow-lg flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-black ${
                  produtoSelecionado.curva_abc === 'A'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : produtoSelecionado.curva_abc === 'B'
                    ? 'bg-blue-950 text-blue-300 border border-blue-800'
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}>
                  Curva {produtoSelecionado.curva_abc}
                </span>
                <h3 className="text-lg font-black text-white">
                  {produtoSelecionado.descricao}
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  EAN: {produtoSelecionado.ean || 'N/A'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-300">
                <span>
                  Vendas 30d: <b className="text-white">{dadosSimulacao.v30} un</b>
                </span>
                <span>•</span>
                <span>
                  31-60d: <b className="text-white">{dadosSimulacao.v60} un</b>
                </span>
                <span>•</span>
                <span>
                  61-90d: <b className="text-white">{dadosSimulacao.v90} un</b>
                </span>
                <span>•</span>
                <span>
                  Acumulado 10 Meses: <b className="text-cyan-300">{dadosSimulacao.v10m} un</b>
                </span>
                {produtoSelecionado.equivalentes && produtoSelecionado.equivalentes.length > 0 && (
                  <button
                    onClick={() => setSomarEquivalentes(prev => !prev)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black border transition-all cursor-pointer ${
                      somarEquivalentes
                        ? 'bg-indigo-600 text-white border-indigo-400'
                        : 'bg-indigo-950/70 text-indigo-300 border-indigo-700/70 hover:bg-indigo-900/60'
                    }`}
                    title="Soma o estoque e o giro de todos os laboratórios equivalentes desta mesma molécula e dosagem"
                  >
                    🔗 {somarEquivalentes ? 'Somando Equivalentes' : `Somar +${produtoSelecionado.equivalentes.length} Lab(s) Equivalentes`}
                  </button>
                )}
              </div>
            </div>

            {/* Simulador Interativo: "E se eu comprar +X unidades?" */}
            <div className="flex flex-wrap items-center gap-2 bg-[#080d18] p-2.5 rounded-xl border border-slate-800">
              <div className="pr-2 border-r border-slate-800">
                <span className="text-[10px] font-black uppercase text-cyan-400 block">
                  Simular Compra Extra:
                </span>
                <span className="text-[11px] text-slate-400">
                  Teste quantos dias dura no calendário
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCompraSimulada(prev => Math.max(0, prev - 1))}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  min={0}
                  value={compraSimulada}
                  onChange={(e) => setCompraSimulada(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-16 text-center py-1 rounded-lg bg-slate-900 border border-cyan-700/60 text-cyan-300 font-black text-sm"
                />
                <button
                  onClick={() => setCompraSimulada(prev => prev + 1)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                {[0, 2, 5, 10, 15, 30].map(val => (
                  <button
                    key={val}
                    onClick={() => setCompraSimulada(val)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                      compraSimulada === val
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {val === 0 ? 'Só Estoque' : `+${val} un`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3 CARDS DIRETOS DE RESPOSTA: VELOCIDADE DE VENDA, DURAÇÃO E DATA DE TÉRMINO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* CARD 1: DE QUANTOS EM QUANTOS DIAS VENDE */}
            <div className="bg-[#0e1626] p-4 rounded-2xl border border-slate-800 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                  1. Tempo Médio para Vender
                </span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-xl font-black text-white mt-2">
                {dadosSimulacao.fraseFrequencia}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {dadosSimulacao.subFraseFrequencia}
              </p>
            </div>

            {/* CARD 2: QUANTO TEMPO O ESTOQUE DURA EM MÉDIA */}
            <div className="bg-[#0e1626] p-4 rounded-2xl border border-slate-800 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400">
                  2. Duração Média do Estoque
                </span>
                <Package className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-black text-emerald-400">
                  {dadosSimulacao.diasDuracaoTotal} dias
                </span>
                <span className="text-xs font-bold text-slate-300">
                  ({dadosSimulacao.saldoTotalComSimulacao} un. no total)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Estoque atual ({dadosSimulacao.saldoBase} un) dura <b>{dadosSimulacao.diasDuracaoBase} dias</b>
                {compraSimulada > 0 && (
                  <span className="text-indigo-300 font-bold">
                    {' '}• Compra simulada (+{compraSimulada} un) soma +{dadosSimulacao.diasGanhosSimulacao} dias!
                  </span>
                )}
              </p>
            </div>

            {/* CARD 3: PREVISÃO DE FIM DO ESTOQUE NO CALENDÁRIO */}
            <div className="bg-[#0e1626] p-4 rounded-2xl border border-slate-800 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-rose-400">
                  3. Previsão de Acabar (Ruptura)
                </span>
                <CalendarIcon className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-2xl font-black text-white mt-2">
                {dadosSimulacao.saldoTotalComSimulacao <= 0 ? (
                  <span className="text-rose-400">Já está Zerado (Hoje)</span>
                ) : dadosSimulacao.vmd <= 0 ? (
                  <span className="text-emerald-300">Sem previsão de acabar</span>
                ) : (
                  <span>
                    {dadosSimulacao.dataEsgotamentoTotal.toLocaleDateString('pt-BR')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {dadosSimulacao.saldoTotalComSimulacao <= 0
                  ? 'Adicione unidades no simulador acima para projetar a cobertura no calendário.'
                  : dadosSimulacao.vmd > 0
                  ? `Dia previsto para zerar a última unidade na prateleira.`
                  : 'Produto com estoque positivo e sem saídas recentes.'}
              </p>
            </div>
          </div>

          {/* CALENDÁRIO VISUAL DE DURAÇÃO DO ESTOQUE E SAÍDA DE UNIDADES */}
          <div className="bg-[#0e1626] p-4 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-cyan-400" />
                  <span>Calendário Visual de Consumo & Duração do Estoque</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Acompanhe dia a dia quantas unidades restam na loja e exatamente em quais dias ocorre a venda de cada unidade (`🛒 -1 un`).
                </p>
              </div>

              {/* Legenda e Navegação de Meses */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 text-[11px] font-bold mr-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-700/60">
                    🟦 Estoque Atual
                  </span>
                  {compraSimulada > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/90 text-indigo-300 border border-indigo-700/60">
                      🟪 +Compra Simulada
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-700/60">
                    🟨 Últimos 5 dias (Pedir)
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/90 text-rose-300 border border-rose-700/60">
                    🟥 Acaba o Estoque
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-[#080d18] p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setMesOffset(prev => prev - 1)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
                    title="Mês anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setMesOffset(0)}
                    className="px-2.5 py-1 rounded-lg text-xs font-black text-cyan-300 hover:bg-slate-800 cursor-pointer"
                  >
                    Hoje
                  </button>
                  <button
                    onClick={() => setMesOffset(prev => prev + 1)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
                    title="Próximo mês"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Grade de 2 Meses Lado a Lado */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {mesesCalendario.map((mesObj) => (
                <div key={mesObj.nomeMes} className="bg-[#09101d] p-3.5 rounded-xl border border-slate-800/90">
                  <div className="text-center font-black text-sm uppercase tracking-wider text-cyan-300 mb-3">
                    {mesObj.nomeMes}
                  </div>

                  {/* Cabeçalho dos dias da semana */}
                  <div className="grid grid-cols-7 gap-1.5 text-center mb-1.5">
                    {DIAS_SEMANA.map(d => (
                      <div key={d} className="text-[10px] font-black uppercase text-slate-500 py-1">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Dias do mês */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {mesObj.celulas.map((cel, idx) => {
                      if (!cel.dia || !cel.chaveData) {
                        return <div key={`empty-${idx}`} className="h-16 rounded-lg bg-transparent" />;
                      }

                      const infoDia = dadosSimulacao.mapaDias.get(cel.chaveData);
                      if (!infoDia) {
                        return (
                          <div
                            key={cel.chaveData}
                            className="h-16 p-1.5 rounded-lg bg-slate-950/50 border border-slate-900 text-slate-600 flex flex-col justify-between"
                          >
                            <span className="text-xs font-bold">{cel.dia}</span>
                          </div>
                        );
                      }

                      let cardStyle = 'bg-slate-950/60 border-slate-800/80 text-slate-500';
                      let badgeTexto = '';

                      if (infoDia.status === 'HOJE') {
                        cardStyle = 'bg-emerald-950/80 border-2 border-emerald-400 text-white shadow-md';
                        badgeTexto = 'HOJE';
                      } else if (infoDia.status === 'ESTOQUE_ATUAL') {
                        cardStyle = 'bg-cyan-950/50 border border-cyan-700/60 text-cyan-100';
                      } else if (infoDia.status === 'COMPRA_SIMULADA') {
                        cardStyle = 'bg-indigo-950/60 border border-indigo-600/70 text-indigo-100';
                      } else if (infoDia.status === 'ALERTA_PEDIDO') {
                        cardStyle = 'bg-amber-950/60 border border-amber-600/70 text-amber-100';
                      } else if (infoDia.status === 'DIA_RUPTURA') {
                        cardStyle = 'bg-rose-950/90 border-2 border-rose-500 text-rose-100 animate-pulse';
                        badgeTexto = 'ACABA';
                      }

                      return (
                        <div
                          key={cel.chaveData}
                          className={`h-16 p-1.5 rounded-lg border flex flex-col justify-between transition-all ${cardStyle}`}
                          title={`Dia ${cel.dia}: Saldo estimado = ${infoDia.saldoFimDia} un.${infoDia.unidadesVendidasNoDia > 0 ? ` • Previsão de venda neste dia: -${infoDia.unidadesVendidasNoDia} un.` : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black">{cel.dia}</span>
                            {badgeTexto && (
                              <span className="text-[9px] font-black px-1 rounded bg-black/40 text-white">
                                {badgeTexto}
                              </span>
                            )}
                          </div>

                          {/* Marcador visual do dia em que 1 unidade é vendida */}
                          {infoDia.unidadesVendidasNoDia > 0 && (
                            <div className="text-[10px] font-black px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-center truncate">
                              🛒 -{infoDia.unidadesVendidasNoDia} un
                            </div>
                          )}

                          {/* Saldo restante ao final do dia */}
                          <div className="text-[10px] font-bold text-right truncate">
                            {infoDia.status === 'DIA_RUPTURA' ? (
                              <span className="text-rose-300 font-black">0 un</span>
                            ) : infoDia.status !== 'SEM_ESTOQUE' ? (
                              <span className="opacity-90">Restam {infoDia.saldoFimDia}</span>
                            ) : (
                              <span className="text-slate-600">Sem est.</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RODAPÉ COM EQUIVALENTES DA MESMA MOLÉCULA E ÚLTIMAS DATAS REAIS DE VENDA */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Laboratórios Equivalentes na Farmácia */}
            <div className="bg-[#0e1626] p-4 rounded-2xl border border-slate-800">
              <h4 className="text-xs font-black uppercase tracking-wider text-indigo-300 mb-2 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>
                  Laboratórios Equivalentes na Farmácia ({produtoSelecionado.equivalentes?.length || 0})
                </span>
              </h4>
              {(!produtoSelecionado.equivalentes || produtoSelecionado.equivalentes.length === 0) ? (
                <p className="text-xs text-slate-500">
                  Nenhum outro laboratório com mesma molécula, dosagem e apresentação foi encontrado com saldo ou giro.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar">
                  {produtoSelecionado.equivalentes.map(eq => (
                    <div
                      key={eq.produto_id}
                      onClick={() => selecionarProduto(eq.produto_id)}
                      className="flex items-center justify-between p-2 rounded-xl bg-[#09101d] border border-slate-800 hover:border-indigo-600/60 cursor-pointer transition-all text-xs"
                    >
                      <div>
                        <span className="font-bold text-white block">{eq.descricao}</span>
                        <span className="text-[10px] text-slate-400">
                          EAN: {eq.ean || 'N/A'} • Vendas 30d: {eq.vendas_30d} un • 10m: {eq.vendas_10m} un
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded font-black ${
                        eq.saldo > 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}>
                        {eq.saldo} un
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Últimas Vendas Reais no Caixa (Digifarma) */}
            <div className="bg-[#0e1626] p-4 rounded-2xl border border-slate-800">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-300 mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>
                  Últimas Saídas Reais Registradas no Caixa ({produtoSelecionado.historico_vendas_datas?.length || 0})
                </span>
              </h4>
              {(!produtoSelecionado.historico_vendas_datas || produtoSelecionado.historico_vendas_datas.length === 0) ? (
                <p className="text-xs text-slate-400">
                  Calculado com base nas janelas consolidadas do ERP Digifarma (30d: <b>{dadosSimulacao.v30} un</b> • 60d: <b>{dadosSimulacao.v60} un</b> • 90d: <b>{dadosSimulacao.v90} un</b> • 10m: <b>{dadosSimulacao.v10m} un</b>).
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto custom-scrollbar">
                  {produtoSelecionado.historico_vendas_datas.map((hv, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-[#09101d] border border-slate-800 text-[11px] font-bold text-slate-300"
                    >
                      📅 {new Date(hv.data_hora).toLocaleDateString('pt-BR')} — <b className="text-emerald-400">{hv.quantidade} un</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default BelaPedSimuladorGiro;
