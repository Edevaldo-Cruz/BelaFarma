import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ShoppingCart, 
  Search,
  Zap,
  Check, 
  Calendar, 
  Ban, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Copy, 
  CheckCircle2, 
  Plus, 
  Minus, 
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Sparkles,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  X,
  Layers,
  Grid,
  Maximize2,
  SlidersHorizontal,
  Info,
  ShieldCheck,
  DollarSign,
  PackageCheck,
  Building2,
  Clock,
  HelpCircle
} from 'lucide-react';
import { useToast } from '../ToastContext';

export interface CotacaoRealItem {
  distribuidora: string;
  preco: number;
  url_produto?: string | null;
  condicao_comercial?: string | null;
  is_substituto?: boolean;
}

export interface FaltaItem7d {
  produto_id: number;
  descricao: string;
  apresentacao: string;
  ean: string;
  imagem_url?: string | null;
  curva_abc: string;
  saldo: number;
  vmd_ponderado: number;
  vendas_30d: number;
  dias_estoque_restante: number;
  custo_unitario: number;
  preco_ult_compra?: number;
  fornecedor_ult_compra: string;
  data_ult_compra: string;
  nf_ult_compra?: string;
  qtd_ult_compra?: number | null;
  embalagem_ult_compra?: string;
  qtd_sugerida_7d: number;
  subtotal_7d: number;
  tipo_categoria: 'MEDICAMENTO' | 'PERFUMARIA';
  fornecedor_1?: string;
  preco_1?: number;
  url_produto_1?: string | null;
  fornecedor_2?: string;
  preco_2?: number;
  url_produto_2?: string | null;
  fornecedor_3?: string;
  preco_3?: number;
  url_produto_3?: string | null;
  fornecedor_2_ref?: string | null;
  preco_2_ref?: number;
  todas_cotacoes_reais?: CotacaoRealItem[];
  melhor_dia_semana?: string;
  prioridade?: 'P1' | 'P2' | 'P3' | 'P4';
  nao_cotar?: boolean;
  nao_carrinho?: boolean;
  is_adiado_proxima_semana?: boolean;
  is_enviado_carrinho_semana?: boolean;
  is_ja_pedido?: boolean;
  ja_pedido_ate?: string | null;
  adiar_ate?: string | null;
  is_desejado?: boolean;
  ranking_posicao?: number;
  score_ranking?: number;
  falta_balcao_belinha?: any;
  melhor_fora_janela?: { distribuidora: string; preco: number; motivo: string } | null;
}

interface PortalInfo {
  id: string;
  nome: string;
  pedido_minimo: number;
  prazo_dias_padrao: number;
  prazos_boleto?: string;
}

interface Props {
  faltas: FaltaItem7d[];
  portais: PortalInfo[];
  itensSelecionados: Record<number, boolean>;
  setItensSelecionados: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  onAlterarQtd: (produtoId: number, novaQtd: number) => void;
  onEscolherFornecedor: (
    produtoId: number,
    posicao: 1 | 2 | 3,
    fornecedorOverride?: string,
    precoOverride?: number,
    urlOverride?: string | null
  ) => void;
  onAtualizarRegra: (
    item: FaltaItem7d, 
    campo: 'nao_cotar' | 'nao_carrinho' | 'motivo_justificativa' | 'adiar_ate' | 'ja_pedido_ate', 
    valor: any
  ) => Promise<void>;
  onAbrirVerCarrinhos: () => void;
  onNavegarTab: (tab: any) => void;
  onRecarregarDados?: () => Promise<void> | void;
  orcamentoInfo?: any;
  janelaAlvoSelecionada?: string;
  setJanelaAlvoSelecionada?: (janela: string) => void;
}

export const BelaPedDecisaoTab: React.FC<Props> = ({
  faltas,
  portais,
  itensSelecionados,
  setItensSelecionados,
  onAlterarQtd,
  onEscolherFornecedor,
  onAtualizarRegra,
  onAbrirVerCarrinhos,
  onNavegarTab,
  onRecarregarDados,
  orcamentoInfo,
  janelaAlvoSelecionada = '2027-01',
  setJanelaAlvoSelecionada
}) => {
  const { addToast } = useToast();

  // Modo de exibição: Grade Compacta ou Carrossel Focal 1 a 1
  const [modoVisualizacao, setModoVisualizacao] = useState<'grade' | 'carrossel'>(() => {
    try {
      return (localStorage.getItem('belaped_modo_decisao') as 'grade' | 'carrossel') || 'grade';
    } catch {
      return 'grade';
    }
  });

  // Reserva de segurança padrão 15% (com chips rápidos 5, 10, 15, 20)
  const [reservaSegurancaPct, setReservaSegurancaPct] = useState<number>(() => {
    try {
      const salvo = localStorage.getItem('belaped_reserva_seguranca_pct');
      return salvo ? Number(salvo) : 15;
    } catch {
      return 15;
    }
  });

  // Teto manual personalizado (opcional para o usuário enxugar mais ainda)
  const [tetoManualEditando, setTetoManualEditando] = useState<boolean>(false);
  const [tetoManualValor, setTetoManualValor] = useState<string>('');

  // Índice ativo no modo carrossel
  const [indiceCarrossel, setIndiceCarrossel] = useState<number>(0);

  // Itens descartados temporariamente nesta sessão ("Substituir por Outro")
  const [descartadosSessao, setDescartadosSessao] = useState<Set<number>>(new Set());

  // Itens promovidos manualmente do banco de reserva
  const [promovidosManualmente, setPromovidosManualmente] = useState<Set<number>>(new Set());

  // Itens adicionados manualmente via pesquisa sob demanda
  const [itensAvulsosPesquisa, setItensAvulsosPesquisa] = useState<FaltaItem7d[]>([]);

  // Modais auxiliares
  const [modalExclusaoAberto, setModalExclusaoAberto] = useState<boolean>(false);
  const [modalBancoAberto, setModalBancoAberto] = useState<boolean>(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  // Barra de Pesquisa Rápida Integrada (Topo)
  const [termoBusca, setTermoBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultadoBusca, setResultadoBusca] = useState<any | null>(null);
  const [painelBuscaExpandido, setPainelBuscaExpandido] = useState(false);
  const [cotandoAoVivo, setCotandoAoVivo] = useState(false);
  const [progressoCotacao, setProgressoCotacao] = useState<{
    total: number;
    atualIndex: number;
    distribuidoraAtual: string;
    finalizados: string[];
  }>({ total: 0, atualIndex: 0, distribuidoraAtual: '', finalizados: [] });

  // Modal para inclusão direta no carrinho
  const [modalCarrinho, setModalCarrinho] = useState<{
    aberto: boolean;
    distribuidora: string;
    ean: string;
    descricao: string;
    quantidade: number;
    preco: number;
    enviando: boolean;
  }>({
    aberto: false,
    distribuidora: '',
    ean: '',
    descricao: '',
    quantidade: 1,
    preco: 0,
    enviando: false
  });

  const salvarModoVisualizacao = (modo: 'grade' | 'carrossel') => {
    setModoVisualizacao(modo);
    try {
      localStorage.setItem('belaped_modo_decisao', modo);
    } catch {}
  };

  const salvarReservaPct = (pct: number) => {
    setReservaSegurancaPct(pct);
    try {
      localStorage.setItem('belaped_reserva_seguranca_pct', String(pct));
    } catch {}
  };

  // Copiar EAN para área de transferência
  const handleCopiarEan = (ean: string, id: string) => {
    if (!ean) return;
    navigator.clipboard.writeText(ean);
    setCopiadoId(id);
    addToast(`EAN ${ean} copiado para a área de transferência!`, 'success');
    setTimeout(() => setCopiadoId(null), 2500);
  };

  // 1. DADOS DE ORÇAMENTO DA JANELA SELECIONADA
  const janelaAtiva = useMemo(() => {
    if (orcamentoInfo?.janelasDisponiveis && orcamentoInfo.janelasDisponiveis.length > 0) {
      const achada = orcamentoInfo.janelasDisponiveis.find((j: any) => j.chave === janelaAlvoSelecionada);
      if (achada) return achada;
      return orcamentoInfo.janelasDisponiveis[0];
    }
    return orcamentoInfo?.mesAtual || null;
  }, [orcamentoInfo, janelaAlvoSelecionada]);

  const limiteMes = Number(janelaAtiva?.limite || 12500);
  const comprometidoMes = Number(janelaAtiva?.totalComprometido || 0);
  const saldoLivreMes = Math.max(0, Number(janelaAtiva?.saldoLivre ?? (limiteMes - comprometidoMes)));
  const qtdSemanas = Number(janelaAtiva?.qtdSemanas || 4);

  // Cálculo da cota semanal bruta e com reserva de segurança
  const cotaBrutaSemanal = qtdSemanas > 0 ? (saldoLivreMes / qtdSemanas) : 0;
  const valorReservaPoupada = cotaBrutaSemanal * (reservaSegurancaPct / 100);
  const cotaEfetivaCalculada = Math.max(0, cotaBrutaSemanal - valorReservaPoupada);

  // Teto ativo da semana
  const tetoSemanalAtivo = tetoManualValor !== '' && !isNaN(Number(tetoManualValor))
    ? Number(tetoManualValor)
    : cotaEfetivaCalculada;

  // 2. LISTAS E REGRAS DE EXCLUSÃO E RESERVA
  // Lista de produtos excluídos permanentemente (nao_cotar = 1)
  const itensExcluidos = useMemo(() => {
    return faltas.filter(f => Boolean(f.nao_cotar));
  }, [faltas]);

  // Lista de itens candidatos ordenados estritamente por criticidade
  const itensCandidatos = useMemo(() => {
    // Une faltas com itens adicionados manualmente na pesquisa
    const base = [...itensAvulsosPesquisa, ...faltas];
    const mapaUnicos = new Map<number, FaltaItem7d>();
    base.forEach(item => {
      if (!mapaUnicos.has(item.produto_id)) {
        mapaUnicos.set(item.produto_id, item);
      }
    });

    const lista = Array.from(mapaUnicos.values()).filter(f => {
      // Ignora itens excluídos da cotação
      if (f.nao_cotar) return false;
      // Ignora itens com adiamento para próxima semana
      if (f.is_adiado_proxima_semana) return false;
      // Ignora itens já pedidos
      if (f.is_ja_pedido) return false;
      // Ignora itens descartados nesta sessão
      if (descartadosSessao.has(f.produto_id)) return false;
      return true;
    });

    // Ordenação estrita de Extrema Necessidade:
    // P1: Curva A zerada (saldo <= 0)
    // P2: Curva B zerada (saldo <= 0)
    // P3: Curva A com ruptura iminente (cobertura <= 7 dias)
    // P4: Curva B com ruptura iminente (cobertura <= 7 dias)
    // P5: Curva C ou outros
    return lista.sort((a, b) => {
      const aPromovido = promovidosManualmente.has(a.produto_id) ? 1 : 0;
      const bPromovido = promovidosManualmente.has(b.produto_id) ? 1 : 0;
      if (aPromovido !== bPromovido) return bPromovido - aPromovido;

      const getPeso = (it: FaltaItem7d) => {
        const saldo = Number(it.saldo) || 0;
        const cob = Number(it.dias_estoque_restante) || 0;
        const curva = (it.curva_abc || 'C').toUpperCase();

        if (curva === 'A' && saldo <= 0) return 1000;
        if (curva === 'B' && saldo <= 0) return 800;
        if (curva === 'A' && cob <= 7) return 600 - cob;
        if (curva === 'B' && cob <= 7) return 400 - cob;
        if (curva === 'C' && saldo <= 0) return 200;
        return 50;
      };

      const pesoA = getPeso(a);
      const pesoB = getPeso(b);
      if (pesoA !== pesoB) return pesoB - pesoA;

      // Desempate por maior VMD ponderado
      return (Number(b.vmd_ponderado) || 0) - (Number(a.vmd_ponderado) || 0);
    });
  }, [faltas, itensAvulsosPesquisa, descartadosSessao, promovidosManualmente]);

  // 3. DIVISÃO EM LISTA ATIVA DA SEMANA (LIMITADA AO ORÇAMENTO) E BANCO DE RESERVA
  const { listaAtivaSemana, bancoReservaSemana, totalOrcadoSemana } = useMemo(() => {
    const ativa: FaltaItem7d[] = [];
    const reserva: FaltaItem7d[] = [];
    let acumulado = 0;

    for (const item of itensCandidatos) {
      const preco = item.preco_1 && item.preco_1 > 0
        ? item.preco_1
        : (item.preco_ult_compra || item.custo_unitario || 0);
      const qtd = Math.max(1, item.qtd_sugerida_7d || 1);
      const subtotal = Number((qtd * preco).toFixed(2));

      // Se foi promovido manualmente pelo usuário, entra com prioridade
      const isPromovido = promovidosManualmente.has(item.produto_id);

      if (isPromovido || (acumulado + subtotal <= tetoSemanalAtivo || ativa.length === 0)) {
        ativa.push({ ...item, subtotal_7d: subtotal });
        acumulado += subtotal;
      } else {
        reserva.push({ ...item, subtotal_7d: subtotal });
      }
    }

    return {
      listaAtivaSemana: ativa,
      bancoReservaSemana: reserva,
      totalOrcadoSemana: acumulado
    };
  }, [itensCandidatos, tetoSemanalAtivo, promovidosManualmente]);

  // Sobra enxugada na semana
  const sobraSemana = Math.max(0, tetoSemanalAtivo - totalOrcadoSemana);
  const totalPoupadoSemana = valorReservaPoupada + sobraSemana;
  const pctConsumoOrcamento = tetoSemanalAtivo > 0 ? (totalOrcadoSemana / tetoSemanalAtivo) * 100 : 0;

  // Ajusta índice ativo no carrossel para não sair do limite
  useEffect(() => {
    if (indiceCarrossel >= listaAtivaSemana.length) {
      setIndiceCarrossel(Math.max(0, listaAtivaSemana.length - 1));
    }
  }, [listaAtivaSemana.length, indiceCarrossel]);

  // AÇÕES NOS CARDS
  // 1. Substituir por Outro (descarta temporariamente e puxa o 1º do Banco de Reserva)
  const handleSubstituirPorOutro = (produtoId: number, descricao: string) => {
    setDescartadosSessao(prev => new Set(prev).add(produtoId));
    addToast(`"${descricao.slice(0, 30)}" substituído! Próximo item do Banco de Reserva promovido.`, 'info');
  };

  // 2. Não Cotar (envia para Lista de Exclusão permanente e puxa o 1º do Banco)
  const handleNaoCotar = async (item: FaltaItem7d) => {
    try {
      await onAtualizarRegra(item, 'nao_cotar', true);
      addToast(`"${item.descricao.slice(0, 25)}" enviado para a Lista de Exclusão.`, 'warning');
    } catch (e) {
      addToast('Erro ao atualizar regra de exclusão.', 'error');
    }
  };

  // 3. Restaurar Produto da Lista de Exclusão
  const handleRestaurarExcluido = async (item: FaltaItem7d) => {
    try {
      await onAtualizarRegra(item, 'nao_cotar', false);
      addToast(`"${item.descricao.slice(0, 25)}" restaurado com sucesso!`, 'success');
    } catch (e) {
      addToast('Erro ao restaurar produto.', 'error');
    }
  };

  // 4. Já Pedido (marca que já foi pedido e retira do orçamento da semana)
  const handleJaPedido = async (item: FaltaItem7d) => {
    const dataAte = new Date();
    dataAte.setDate(dataAte.getDate() + 7);
    const dataIso = dataAte.toISOString().slice(0, 10);
    try {
      await onAtualizarRegra(item, 'ja_pedido_ate', dataIso);
      addToast(`"${item.descricao.slice(0, 25)}" marcado como Já Pedido!`, 'success');
    } catch (e) {
      addToast('Erro ao marcar como já pedido.', 'error');
    }
  };

  // 5. Promover item do Banco de Reserva para a Lista Ativa
  const handlePromoverDoBanco = (produtoId: number, descricao: string) => {
    setPromovidosManualmente(prev => new Set(prev).add(produtoId));
    setModalBancoAberto(false);
    addToast(`"${descricao.slice(0, 25)}" promovido com sucesso para a lista ativa!`, 'success');
  };

  // 6. Enviar item ao carrinho via robô
  const handleAdicionarAoCarrinho = (item: FaltaItem7d, distribuidora: string, preco: number) => {
    setModalCarrinho({
      aberto: true,
      distribuidora,
      ean: item.ean,
      descricao: item.descricao,
      quantidade: Math.max(1, item.qtd_sugerida_7d || 1),
      preco,
      enviando: false
    });
  };

  const handleConfirmarEnvioCarrinho = async (limparAntes: boolean) => {
    if (!modalCarrinho.distribuidora || !modalCarrinho.ean) return;
    setModalCarrinho(prev => ({ ...prev, enviando: true }));
    try {
      const res = await fetch('/api/belaped/adicionar-item-carrinho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distribuidora: modalCarrinho.distribuidora,
          ean: modalCarrinho.ean,
          quantidade: modalCarrinho.quantidade,
          descricao: modalCarrinho.descricao,
          limparAntes
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(data.message || `Item adicionado ao carrinho da ${modalCarrinho.distribuidora}!`, 'success');
        setModalCarrinho(prev => ({ ...prev, aberto: false, enviando: false }));
        if (onRecarregarDados) onRecarregarDados();
      } else {
        addToast(data.error || 'Erro ao incluir item no carrinho.', 'error');
        setModalCarrinho(prev => ({ ...prev, enviando: false }));
      }
    } catch (err: any) {
      addToast(`Falha na comunicação com o robô: ${err.message}`, 'error');
      setModalCarrinho(prev => ({ ...prev, enviando: false }));
    }
  };

  // 7. PESQUISA RÁPIDA NO TOPO
  const handleExecutarBusca = async (termo: string) => {
    const q = termo.trim();
    if (!q) {
      setResultadoBusca(null);
      setPainelBuscaExpandido(false);
      return;
    }
    setBuscando(true);
    setPainelBuscaExpandido(true);
    try {
      const res = await fetch(`/api/belaped/pesquisa-produto?q=${encodeURIComponent(q)}&janelaMes=${encodeURIComponent(janelaAlvoSelecionada)}`);
      if (res.ok) {
        const data = await res.json();
        setResultadoBusca(data);
      } else {
        addToast('Erro ao consultar produto.', 'error');
      }
    } catch (e: any) {
      addToast(`Erro de conexão: ${e.message}`, 'error');
    } finally {
      setBuscando(false);
    }
  };

  // Disparar cotação ao vivo sob demanda para o produto pesquisado
  const handleCotarAoVivoProduto = async (produto: any) => {
    if (!produto || !produto.ean) {
      addToast('EAN não identificado para cotação.', 'warning');
      return;
    }
    setCotandoAoVivo(true);
    try {
      const portaisAtivos = portais.filter(p => !['TODOS', 'TODAS'].includes(p.id.toUpperCase()));
      setProgressoCotacao({
        total: portaisAtivos.length,
        atualIndex: 0,
        distribuidoraAtual: portaisAtivos[0]?.nome || 'Iniciando...',
        finalizados: []
      });

      for (let i = 0; i < portaisAtivos.length; i++) {
        const portal = portaisAtivos[i];
        setProgressoCotacao(prev => ({
          ...prev,
          atualIndex: i + 1,
          distribuidoraAtual: portal.nome
        }));

        try {
          await fetch('/api/belaped/cotar-ao-vivo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ean: produto.ean,
              descricao: produto.descricao,
              distribuidora: portal.nome
            })
          });
          setProgressoCotacao(prev => ({
            ...prev,
            finalizados: [...prev.finalizados, portal.nome]
          }));
        } catch (e) {}
      }

      // Reexecuta busca para carregar as novas cotações
      await handleExecutarBusca(produto.ean);
      addToast(`Cotação ao vivo concluída para ${produto.descricao}!`, 'success');
    } catch (err: any) {
      addToast(`Erro ao cotar ao vivo: ${err.message}`, 'error');
    } finally {
      setCotandoAoVivo(false);
    }
  };

  // Adicionar produto da pesquisa à lista ativa da semana
  const handleAdicionarProdutoBuscaNaSemana = (prod: any, qtd: number = 1) => {
    const novoItem: FaltaItem7d = {
      produto_id: prod.produto_id || Math.floor(Math.random() * 900000) + 100000,
      descricao: prod.descricao,
      apresentacao: prod.apresentacao || '',
      ean: prod.ean,
      curva_abc: prod.curva_abc || 'B',
      saldo: Number(prod.saldo) || 0,
      vmd_ponderado: Number(prod.vmd_ponderado) || 0,
      vendas_30d: Number(prod.vendas_30d) || 0,
      dias_estoque_restante: prod.vmd_ponderado > 0 ? Number((prod.saldo / prod.vmd_ponderado).toFixed(1)) : 0,
      custo_unitario: Number(prod.preco_unitario_ult_compra || prod.custo_unitario) || 0,
      preco_ult_compra: Number(prod.preco_unitario_ult_compra || prod.custo_unitario) || 0,
      fornecedor_ult_compra: prod.fornecedor_ult_compra || 'Última Compra',
      data_ult_compra: prod.data_ult_compra || 'Recente',
      qtd_sugerida_7d: qtd,
      subtotal_7d: Number((qtd * (prod.preco_unitario_ult_compra || prod.custo_unitario || 1)).toFixed(2)),
      tipo_categoria: 'MEDICAMENTO',
      fornecedor_1: prod.fornecedor_1 || 'Melhor Cotação',
      preco_1: Number(prod.preco_1 || prod.custo_unitario) || 0,
      prioridade: 'P1'
    };

    setItensAvulsosPesquisa(prev => [novoItem, ...prev]);
    setPainelBuscaExpandido(false);
    setTermoBusca('');
    setResultadoBusca(null);
    addToast(`"${prod.descricao.slice(0, 25)}" adicionado à Lista da Semana!`, 'success');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#070b14] text-slate-100 overflow-y-auto">
      
      {/* ─── 1. HEADER DE ORÇAMENTO ESTRATÉGICO POR JANELA ─────────────────────── */}
      <div className="bg-[#0b1222] border-b border-cyan-900/40 p-3 sm:p-4 shrink-0 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col gap-3">
          
          {/* Linha Superior: Título, Seletor de Janela e Chips de Reserva de Segurança */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl text-amber-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                    Orçamento Semanal & Decisão
                  </h1>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 font-bold">
                    Extrema Necessidade
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Lista limitada rigorosamente ao teto semanal com reposição dinâmica do Banco de Reserva.
                </p>
              </div>
            </div>

            {/* Controles de Janela e Reserva */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              {/* Seletor de Janela de Vencimento dos Boletos */}
              {orcamentoInfo?.janelasDisponiveis && setJanelaAlvoSelecionada && (
                <div className="flex items-center gap-1.5 bg-[#060a12] border border-cyan-900/60 rounded-xl px-2.5 py-1.5 shadow-inner">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Janela:</span>
                  <select
                    value={janelaAlvoSelecionada}
                    onChange={(e) => setJanelaAlvoSelecionada(e.target.value)}
                    className="bg-transparent text-xs font-black text-cyan-200 outline-none cursor-pointer"
                  >
                    {orcamentoInfo.janelasDisponiveis.map((j: any) => (
                      <option key={j.chave} value={j.chave} className="bg-slate-900 text-slate-100">
                        {j.label} {j.isMesAtual ? '(Mês Atual)' : ''} — Saldo: R$ {Math.max(0, j.saldoLivre).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Seletor de Reserva de Segurança (5%, 10%, 15%, 20%) */}
              <div className="flex items-center gap-1 bg-[#060a12] border border-slate-800 rounded-xl px-2 py-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">Reserva:</span>
                {[5, 10, 15, 20].map(pct => (
                  <button
                    key={pct}
                    onClick={() => salvarReservaPct(pct)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                      reservaSegurancaPct === pct
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cards de Métricas Financeiras e Progresso Orçamentário */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
            {/* Teto do Mês */}
            <div className="bg-[#070d18] border border-slate-800/80 rounded-xl p-2.5 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Limite do Mês</span>
              <span className="text-sm font-black text-white font-mono">
                R$ {limiteMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Boletos Comprometidos */}
            <div className="bg-[#070d18] border border-slate-800/80 rounded-xl p-2.5 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Boletos do Mês</span>
              <span className="text-sm font-black text-rose-400 font-mono">
                R$ {comprometidoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Saldo Livre do Mês */}
            <div className="bg-[#070d18] border border-slate-800/80 rounded-xl p-2.5 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Saldo Livre</span>
              <span className="text-sm font-black text-emerald-400 font-mono">
                R$ {saldoLivreMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Cota da Semana (Com Reserva de Segurança Deduzida) */}
            <div className="bg-[#081528] border border-cyan-800/80 rounded-xl p-2.5 flex flex-col justify-between relative group">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black text-cyan-300 tracking-wider flex items-center gap-1">
                  Cota da Semana
                  <span className="text-[9px] font-normal text-cyan-400/80">(-{reservaSegurancaPct}%)</span>
                </span>
                <button
                  onClick={() => {
                    setTetoManualEditando(!tetoManualEditando);
                    if (!tetoManualEditando) setTetoManualValor(String(tetoSemanalAtivo.toFixed(2)));
                  }}
                  className="text-[10px] text-cyan-400 hover:text-white cursor-pointer"
                  title="Ajustar teto da semana manualmente"
                >
                  ✎
                </button>
              </div>

              {tetoManualEditando ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="number"
                    value={tetoManualValor}
                    onChange={(e) => setTetoManualValor(e.target.value)}
                    className="w-full bg-[#050914] text-xs font-mono font-bold text-white border border-cyan-600 rounded px-1.5 py-0.5 outline-none"
                    placeholder="Teto R$"
                  />
                  <button
                    onClick={() => setTetoManualEditando(false)}
                    className="px-1.5 py-0.5 bg-cyan-600 text-white rounded text-[10px] font-bold"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <span className="text-sm font-black text-cyan-300 font-mono">
                  R$ {tetoSemanalAtivo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>

            {/* Gasto Total da Lista Ativa */}
            <div className="bg-[#070d18] border border-slate-800/80 rounded-xl p-2.5 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total da Semana</span>
              <span className={`text-sm font-black font-mono ${
                totalOrcadoSemana > tetoSemanalAtivo ? 'text-rose-400' : 'text-white'
              }`}>
                R$ {totalOrcadoSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Economia Enxugada (Reserva + Sobra) */}
            <div className="bg-gradient-to-br from-emerald-950/40 to-teal-950/30 border border-emerald-800/60 rounded-xl p-2.5 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-black text-emerald-300 tracking-wider flex items-center gap-1">
                Poupado / Sobra
                <Sparkles className="w-3 h-3 text-emerald-400" />
              </span>
              <span className="text-sm font-black text-emerald-300 font-mono">
                R$ {totalPoupadoSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Barra de Progresso Orçamentário da Semana */}
          <div className="w-full flex items-center gap-3 pt-1">
            <div className="flex-1 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
              <div 
                className={`h-full transition-all duration-500 rounded-full ${
                  pctConsumoOrcamento > 100 
                    ? 'bg-rose-500' 
                    : pctConsumoOrcamento > 85 
                    ? 'bg-amber-500' 
                    : 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, pctConsumoOrcamento))}%` }}
              />
            </div>
            <span className="text-[11px] font-mono font-bold text-slate-400 shrink-0">
              {pctConsumoOrcamento.toFixed(1)}% do Teto Semanal
            </span>
          </div>

        </div>
      </div>

      {/* ─── 2. BARRA DE PESQUISA RÁPIDA INTEGRADA (TOPO) ────────────────────── */}
      <div className="p-3 sm:p-4 max-w-7xl mx-auto w-full flex flex-col gap-2 shrink-0">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-cyan-400 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleExecutarBusca(termoBusca);
            }}
            placeholder="🔍 Digite o Nome ou EAN do produto para pesquisar e cotar ao vivo nas distribuidoras..."
            className="w-full bg-[#0b1222] border border-cyan-900/60 rounded-2xl pl-10 pr-24 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 shadow-inner focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
          />
          <div className="absolute right-2 flex items-center gap-1.5">
            {termoBusca && (
              <button
                type="button"
                onClick={() => {
                  setTermoBusca('');
                  setResultadoBusca(null);
                  setPainelBuscaExpandido(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
                title="Limpar pesquisa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => handleExecutarBusca(termoBusca)}
              disabled={buscando || !termoBusca.trim()}
              className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer shadow-md transition-all active:scale-95 flex items-center gap-1"
            >
              {buscando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Buscar</span>
            </button>
          </div>
        </div>

        {/* PAINEL EXPANSÍVEL DA PESQUISA COM ESTOQUE, VEREDITO E COTAÇÕES */}
        {painelBuscaExpandido && resultadoBusca && (
          <div className="bg-[#0b1222] border-2 border-cyan-500/60 rounded-2xl p-3 sm:p-4 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-cyan-400 tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Resultado da Pesquisa Sob Demanda
                </span>
                {resultadoBusca.produto && (
                  <span className="font-mono text-[11px] bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-slate-300">
                    EAN: {resultadoBusca.produto.ean}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPainelBuscaExpandido(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {resultadoBusca.encontrado && resultadoBusca.produto ? (
              <div className="flex flex-col gap-3">
                {/* Cabeçalho do Produto e Veredito em 3 Níveis */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[#060a12] p-3 rounded-xl border border-slate-800">
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-white">
                      {resultadoBusca.produto.descricao}
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span>{resultadoBusca.produto.apresentacao || 'Sem apresentação'}</span>
                      <span>•</span>
                      <span className="font-bold text-amber-400">Curva {resultadoBusca.produto.curva_abc}</span>
                      <span>•</span>
                      <span>Saldo: <b className="text-white">{resultadoBusca.produto.saldo} un</b></span>
                      <span>•</span>
                      <span>VMD: <b className="text-white">{resultadoBusca.produto.vmd_ponderado}</b></span>
                      <span>•</span>
                      <span>Cob: <b className="text-white">{resultadoBusca.produto.dias_cobertura}d</b></span>
                    </div>
                  </div>

                  {/* Veredito Inteligente */}
                  {resultadoBusca.veredito && (
                    <div className={`px-3 py-1.5 rounded-xl border font-black text-xs uppercase flex items-center gap-1.5 shrink-0 ${
                      resultadoBusca.veredito.nivel === 'COMPRAR_AGORA'
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                        : resultadoBusca.veredito.nivel === 'AGUARDAR'
                        ? 'bg-amber-950/60 border-amber-500 text-amber-300'
                        : 'bg-rose-950/60 border-rose-500 text-rose-300'
                    }`}>
                      {resultadoBusca.veredito.nivel === 'COMPRAR_AGORA' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4" />}
                      <span>{resultadoBusca.veredito.nivel.replace('_', ' ')}</span>
                    </div>
                  )}
                </div>

                {/* Justificativa do Veredito */}
                {resultadoBusca.veredito && (
                  <p className="text-[11px] text-slate-300 bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                    💡 <b>Diagnóstico:</b> {resultadoBusca.veredito.explicacao}
                  </p>
                )}

                {/* Cotações ao Vivo nas Distribuidoras */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                      Cotações nas Distribuidoras ({resultadoBusca.cotacoes?.length || 0} portais):
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCotarAoVivoProduto(resultadoBusca.produto)}
                      disabled={cotandoAoVivo}
                      className="px-2.5 py-1 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-lg text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                    >
                      <Zap className={`w-3.5 h-3.5 ${cotandoAoVivo ? 'animate-spin' : ''}`} />
                      <span>{cotandoAoVivo ? `Cotando (${progressoCotacao.atualIndex}/${progressoCotacao.total})...` : '⚡ Cotar ao Vivo Agora'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {resultadoBusca.cotacoes?.map((cot: any, cIdx: number) => (
                      <div
                        key={cot.portal_id || cIdx}
                        className={`p-2.5 rounded-xl border flex flex-col justify-between gap-1.5 ${
                          cot.disponivel
                            ? 'bg-[#060a12] border-cyan-800/80'
                            : 'bg-slate-950/40 border-slate-900 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-white truncate">{cot.nome}</span>
                          {cot.is_janela_elegivel && (
                            <span className="text-[9px] bg-emerald-950 border border-emerald-600 text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                              Janela OK
                            </span>
                          )}
                        </div>

                        <div className="flex items-baseline justify-between">
                          <span className="text-xs font-black font-mono text-cyan-300">
                            {cot.disponivel && cot.preco > 0 ? `R$ ${Number(cot.preco).toFixed(2)}` : 'Sem Estoque'}
                          </span>
                          {cot.url_produto && (
                            <a
                              href={cot.url_produto}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-400 hover:text-white p-1"
                              title="Ver produto no portal"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>

                        {cot.disponivel && cot.preco > 0 && (
                          <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800/80">
                            <button
                              type="button"
                              onClick={() => handleAdicionarProdutoBuscaNaSemana(resultadoBusca.produto, 1)}
                              className="flex-1 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 text-[10px] font-black uppercase text-center cursor-pointer transition-colors"
                            >
                              + Na Semana
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdicionarAoCarrinho(resultadoBusca.produto, cot.nome, cot.preco)}
                              className="p-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white cursor-pointer transition-colors"
                              title="Comprar direto no carrinho"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 p-3 text-center">
                {resultadoBusca.mensagem || 'Nenhum produto correspondente encontrado.'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ─── 3. BARRA DE CONTROLE DA LISTA DA SEMANA ───────────────────────────── */}
      <div className="px-3 sm:px-4 max-w-7xl mx-auto w-full flex items-center justify-between gap-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-cyan-400" />
            Lote Ativo da Semana ({listaAtivaSemana.length} itens)
          </span>
          <span className="text-[11px] font-mono text-cyan-300 font-bold">
            = R$ {totalOrcadoSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão para ver Banco de Reserva */}
          <button
            type="button"
            onClick={() => setModalBancoAberto(true)}
            className="px-2.5 py-1.5 rounded-xl bg-[#060a12] border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Banco de Reserva ({bancoReservaSemana.length})</span>
          </button>

          {/* Botão para ver Lista de Exclusão */}
          {itensExcluidos.length > 0 && (
            <button
              type="button"
              onClick={() => setModalExclusaoAberto(true)}
              className="px-2.5 py-1.5 rounded-xl bg-[#060a12] border border-rose-900/60 hover:border-rose-500 text-rose-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Ban className="w-3.5 h-3.5 text-rose-400" />
              <span>Excluídos ({itensExcluidos.length})</span>
            </button>
          )}

          {/* Alternador de Modo: Grade vs Carrossel */}
          <div className="flex items-center bg-[#060a12] border border-slate-800 rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => salvarModoVisualizacao('grade')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modoVisualizacao === 'grade'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Visualizar em Grade de Cards"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => salvarModoVisualizacao('carrossel')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modoVisualizacao === 'carrossel'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Visualizar em Carrossel Focal 1 a 1"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── 4. LISTA DE CARDS DE COMPRA (GRADE OU CARROSSEL) ─────────────────── */}
      <div className="px-3 sm:px-4 max-w-7xl mx-auto w-full flex-1 pb-12">
        {listaAtivaSemana.length === 0 ? (
          <div className="bg-[#0b1222] border border-slate-800 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <h3 className="text-base font-black text-white">Nenhum produto crítico restante para cotar nesta semana!</h3>
            <p className="text-xs text-slate-400 max-w-md">
              Todos os itens de extrema necessidade foram atendidos, pedidos ou estão com estoque suficiente para os próximos 7 dias.
            </p>
          </div>
        ) : modoVisualizacao === 'grade' ? (
          /* MODO GRADE COMPACTA DE CARDS */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {listaAtivaSemana.map((item, idx) => (
              <CardProdutoDecisao
                key={item.produto_id}
                item={item}
                indiceAtual={idx}
                totalItens={listaAtivaSemana.length}
                copiadoId={copiadoId}
                onCopiarEan={handleCopiarEan}
                onAlterarQtd={onAlterarQtd}
                onNaoCotar={() => handleNaoCotar(item)}
                onSubstituir={() => handleSubstituirPorOutro(item.produto_id, item.descricao)}
                onJaPedido={() => handleJaPedido(item)}
                onComprar={(dist, preco) => handleAdicionarAoCarrinho(item, dist, preco)}
                onNavegarAnterior={() => {}}
                onNavegarProximo={() => {}}
                isModoCarrossel={false}
              />
            ))}
          </div>
        ) : (
          /* MODO CARROSSEL FOCAL 1 A 1 */
          <div className="max-w-2xl mx-auto flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-slate-400 px-2">
              <span>Card <b>{indiceCarrossel + 1}</b> de <b>{listaAtivaSemana.length}</b></span>
              <span className="font-mono font-bold text-cyan-300">
                Subtotal acumulado até aqui: R$ {listaAtivaSemana
                  .slice(0, indiceCarrossel + 1)
                  .reduce((acc, it) => acc + it.subtotal_7d, 0)
                  .toFixed(2)}
              </span>
            </div>

            {listaAtivaSemana[indiceCarrossel] && (
              <CardProdutoDecisao
                item={listaAtivaSemana[indiceCarrossel]}
                indiceAtual={indiceCarrossel}
                totalItens={listaAtivaSemana.length}
                copiadoId={copiadoId}
                onCopiarEan={handleCopiarEan}
                onAlterarQtd={onAlterarQtd}
                onNaoCotar={() => handleNaoCotar(listaAtivaSemana[indiceCarrossel])}
                onSubstituir={() => handleSubstituirPorOutro(listaAtivaSemana[indiceCarrossel].produto_id, listaAtivaSemana[indiceCarrossel].descricao)}
                onJaPedido={() => handleJaPedido(listaAtivaSemana[indiceCarrossel])}
                onComprar={(dist, preco) => handleAdicionarAoCarrinho(listaAtivaSemana[indiceCarrossel], dist, preco)}
                onNavegarAnterior={() => setIndiceCarrossel(prev => Math.max(0, prev - 1))}
                onNavegarProximo={() => setIndiceCarrossel(prev => Math.min(listaAtivaSemana.length - 1, prev + 1))}
                isModoCarrossel={true}
              />
            )}
          </div>
        )}
      </div>

      {/* ─── MODAL DO BANCO DE RESERVA ────────────────────────────────────────── */}
      {modalBancoAberto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#0b1222] border border-cyan-800/80 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-white text-base">Banco de Reserva ({bancoReservaSemana.length} itens)</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalBancoAberto(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-2">
              <p className="text-xs text-slate-400 mb-2">
                Itens de extrema necessidade que excederam a cota orçamentária desta semana. Se algum item da lista ativa for rejeitado ou pulado, o próximo do banco é promovido automaticamente.
              </p>

              {bancoReservaSemana.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">O Banco de Reserva está vazio no momento.</p>
              ) : (
                bancoReservaSemana.map((it, bIdx) => (
                  <div
                    key={it.produto_id}
                    className="p-3 rounded-xl bg-[#060a12] border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                  >
                    <div className="truncate flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                          #{bIdx + 1}
                        </span>
                        <span className="font-bold text-xs text-white truncate">{it.descricao}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span>Curva {it.curva_abc}</span>
                        <span>•</span>
                        <span>Saldo: {it.saldo} un</span>
                        <span>•</span>
                        <span>Qtd: {it.qtd_sugerida_7d} un</span>
                        <span>•</span>
                        <span className="font-mono text-cyan-300 font-bold">R$ {it.subtotal_7d.toFixed(2)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePromoverDoBanco(it.produto_id, it.descricao)}
                      className="px-3 py-1.5 rounded-xl bg-cyan-950 hover:bg-cyan-900 border border-cyan-700/80 text-cyan-200 text-xs font-black uppercase tracking-wider shrink-0 cursor-pointer shadow-sm active:scale-95 transition-all"
                    >
                      Promover Agora
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DA LISTA DE EXCLUSÃO (NÃO COTAR) ───────────────────────────── */}
      {modalExclusaoAberto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#0b1222] border border-rose-900/80 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-rose-400" />
                <h3 className="font-black text-white text-base">Produtos na Lista de Exclusão ({itensExcluidos.length})</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalExclusaoAberto(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-2">
              <p className="text-xs text-slate-400 mb-2">
                Itens marcados como "Não Cotar". Eles ficam permanentemente fora das listas de cotação até serem restaurados manualmente.
              </p>

              {itensExcluidos.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">Nenhum produto excluído da cotação.</p>
              ) : (
                itensExcluidos.map((it) => (
                  <div
                    key={it.produto_id}
                    className="p-3 rounded-xl bg-[#060a12] border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="truncate flex-1">
                      <span className="font-bold text-xs text-white truncate block">{it.descricao}</span>
                      <span className="text-[11px] text-slate-400">EAN: {it.ean} • Curva {it.curva_abc}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestaurarExcluido(it)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-700/80 text-emerald-200 text-xs font-black uppercase tracking-wider shrink-0 cursor-pointer shadow-sm active:scale-95 transition-all flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restaurar</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE CONFIRMAÇÃO DE ADIÇÃO AO CARRINHO COM OPÇÃO LIMPAR ─────── */}
      {modalCarrinho.aberto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#0b1222] border-2 border-amber-500/80 rounded-2xl w-full max-w-md p-4 sm:p-5 shadow-2xl flex flex-col gap-3 animate-in zoom-in-95">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-white text-sm sm:text-base">Adicionar ao Carrinho</h3>
                <span className="text-xs text-amber-300 font-bold">{modalCarrinho.distribuidora}</span>
              </div>
            </div>

            <div className="bg-[#060a12] border border-slate-800 rounded-xl p-3 text-xs text-slate-300 flex flex-col gap-1">
              <span className="font-bold text-white">{modalCarrinho.descricao}</span>
              <div className="flex items-center justify-between text-slate-400 pt-1">
                <span>EAN: {modalCarrinho.ean}</span>
                <span>Qtd: <b className="text-white">{modalCarrinho.quantidade} un</b></span>
                <span className="font-mono text-cyan-300 font-bold">R$ {(modalCarrinho.quantidade * modalCarrinho.preco).toFixed(2)}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Deseja esvaziar o carrinho atual da distribuidora antes de incluir este item para garantir compras limpas, ou deseja mantê-lo?
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                type="button"
                disabled={modalCarrinho.enviando}
                onClick={() => handleConfirmarEnvioCarrinho(true)}
                className="w-full sm:flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider shadow-md disabled:opacity-50 cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                {modalCarrinho.enviando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                <span>Limpar e Adicionar</span>
              </button>

              <button
                type="button"
                disabled={modalCarrinho.enviando}
                onClick={() => handleConfirmarEnvioCarrinho(false)}
                className="w-full sm:flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs uppercase tracking-wider shadow-sm disabled:opacity-50 cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>Manter Existente</span>
              </button>
            </div>

            <button
              type="button"
              disabled={modalCarrinho.enviando}
              onClick={() => setModalCarrinho(prev => ({ ...prev, aberto: false }))}
              className="text-xs text-slate-400 hover:text-white pt-1 text-center cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

// ─── COMPONENTE INTERNO: CARD INDIVIDUAL DE PRODUTO ─────────────────────────
interface CardProps {
  item: FaltaItem7d;
  indiceAtual: number;
  totalItens: number;
  copiadoId: string | null;
  onCopiarEan: (ean: string, id: string) => void;
  onAlterarQtd: (produtoId: number, novaQtd: number) => void;
  onNaoCotar: () => void;
  onSubstituir: () => void;
  onJaPedido: () => void;
  onComprar: (distribuidora: string, preco: number) => void;
  onNavegarAnterior: () => void;
  onNavegarProximo: () => void;
  isModoCarrossel: boolean;
}

const CardProdutoDecisao: React.FC<CardProps> = ({
  item,
  indiceAtual,
  totalItens,
  copiadoId,
  onCopiarEan,
  onAlterarQtd,
  onNaoCotar,
  onSubstituir,
  onJaPedido,
  onComprar,
  onNavegarAnterior,
  onNavegarProximo,
  isModoCarrossel
}) => {
  const preco1 = Number(item.preco_1) || 0;
  const precoUlt = Number(item.preco_ult_compra) || 0;
  const diferencaPct = precoUlt > 0 && preco1 > 0
    ? Number((((preco1 - precoUlt) / precoUlt) * 100).toFixed(1))
    : 0;

  const saldo = Number(item.saldo) || 0;
  const vmd = Number(item.vmd_ponderado) || 0;
  const diasCob = item.dias_estoque_restante;
  const qtd = Math.max(1, item.qtd_sugerida_7d || 1);
  const subtotal = Number((qtd * (preco1 > 0 ? preco1 : (precoUlt || item.custo_unitario || 0))).toFixed(2));

  return (
    <div className="bg-[#0b1222] border border-cyan-900/50 hover:border-cyan-500/60 rounded-2xl p-3 sm:p-4 shadow-lg flex flex-col justify-between gap-3 transition-all duration-200">
      
      {/* 1. TOPO DO CARD: Identificação, Apresentação e Badges de Estoque */}
      <div>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="truncate flex-1">
            <span className="font-black text-sm text-white truncate block" title={item.descricao}>
              {item.descricao}
            </span>
            <span className="text-[11px] text-slate-400 block truncate">
              {item.apresentacao || 'Sem apresentação cadastrada'}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${
              item.curva_abc === 'A'
                ? 'bg-rose-950/80 border-rose-600 text-rose-300'
                : item.curva_abc === 'B'
                ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                : 'bg-slate-900 border-slate-700 text-slate-300'
            }`}>
              Curva {item.curva_abc}
            </span>
          </div>
        </div>

        {/* Metadados em 1 linha compacta (EAN, Saldo, VMD, Cobertura) */}
        <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap bg-[#060a12] p-1.5 rounded-lg border border-slate-800/80">
          <button
            type="button"
            onClick={() => onCopiarEan(item.ean, String(item.produto_id))}
            className="flex items-center gap-1 font-mono text-[10px] text-cyan-300 hover:text-white cursor-pointer"
            title="Clique para copiar EAN"
          >
            <Copy className="w-3 h-3" />
            <span>{item.ean || 'S/ EAN'}</span>
            {copiadoId === String(item.produto_id) && <span className="text-[9px] text-emerald-400">✓</span>}
          </button>

          <span>•</span>
          <span className={`font-bold ${saldo <= 0 ? 'text-rose-400' : 'text-slate-300'}`}>
            Estoque: {saldo} un
          </span>

          <span>•</span>
          <span>VMD: {vmd}</span>

          <span>•</span>
          <span className={`font-bold ${diasCob <= 3 ? 'text-rose-400' : diasCob <= 7 ? 'text-amber-400' : 'text-slate-400'}`}>
            {diasCob}d cob
          </span>
        </div>
      </div>

      {/* 2. HISTÓRICO DA ÚLTIMA COMPRA */}
      <div className="bg-[#060d19] border border-slate-800 rounded-xl p-2 flex items-center justify-between text-xs">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Última Compra:</span>
          <span className="font-bold text-slate-200">
            {item.fornecedor_ult_compra || 'Digifarma (NF)'}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-400 block">
            {item.data_ult_compra ? String(item.data_ult_compra).split('T')[0] : 'Data N/D'}
          </span>
          <span className="font-mono font-black text-slate-200">
            {precoUlt > 0 ? `R$ ${precoUlt.toFixed(2)}` : 'R$ —'}
          </span>
        </div>
      </div>

      {/* 3. PÓDIO DE COTAÇÕES (1º, 2º E 3º COLOCADOS) */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
          Pódio de Cotações (Melhores Preços):
        </span>

        {/* 1º Colocado (Vencedor) */}
        <div className="bg-[#071322] border-2 border-cyan-500/80 rounded-xl p-2.5 flex items-center justify-between shadow-sm">
          <div className="truncate flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-500 text-slate-950">
                1º
              </span>
              <span className="font-black text-xs text-white truncate">
                {item.fornecedor_1 || 'Sem Cotação'}
              </span>
              {item.melhor_fora_janela && item.melhor_fora_janela.distribuidora === item.fornecedor_1 ? (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800" title={item.melhor_fora_janela.motivo}>
                  ⚠️ Vence fora da Janela
                </span>
              ) : item.preco_1 && item.preco_1 > 0 ? (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Janela OK
                </span>
              ) : null}
            </div>
            {item.melhor_fora_janela && item.melhor_fora_janela.distribuidora !== item.fornecedor_1 && (
              <span className="text-[10px] text-amber-300/80 block mt-0.5">
                💡 Menor geral: {item.melhor_fora_janela.distribuidora} (R$ {item.melhor_fora_janela.preco.toFixed(2)}) vence fora da janela
              </span>
            )}
            {diferencaPct !== 0 && precoUlt > 0 && preco1 > 0 && (
              <span className={`text-[10px] font-bold flex items-center gap-0.5 mt-0.5 ${
                diferencaPct < 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {diferencaPct < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                {Math.abs(diferencaPct)}% {diferencaPct < 0 ? 'mais barato que a última' : 'mais caro'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-black font-mono text-cyan-300">
              {preco1 > 0 ? `R$ ${preco1.toFixed(2)}` : 'R$ —'}
            </span>
            {item.url_produto_1 && (
              <a
                href={item.url_produto_1}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:text-white p-1 hover:bg-cyan-950/50 rounded-lg transition-colors"
                title="Abrir no portal da distribuidora"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        {/* 2º e 3º Colocados (Comparativo Rápido) */}
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          {/* 2º Colocado */}
          <div className="bg-[#060a12] border border-slate-800 rounded-lg p-1.5 flex items-center justify-between">
            <div className="truncate">
              <span className="text-[9px] font-bold text-slate-400 mr-1">2º</span>
              <span className="text-slate-300 truncate" title={item.fornecedor_2 || '—'}>
                {item.fornecedor_2 || '—'}
              </span>
            </div>
            <span className="font-mono font-bold text-slate-300 shrink-0">
              {item.preco_2 && item.preco_2 > 0 ? `R$ ${item.preco_2.toFixed(2)}` : '—'}
            </span>
          </div>

          {/* 3º Colocado */}
          <div className="bg-[#060a12] border border-slate-800 rounded-lg p-1.5 flex items-center justify-between">
            <div className="truncate">
              <span className="text-[9px] font-bold text-slate-400 mr-1">3º</span>
              <span className="text-slate-300 truncate" title={item.fornecedor_3 || '—'}>
                {item.fornecedor_3 || '—'}
              </span>
            </div>
            <span className="font-mono font-bold text-slate-300 shrink-0">
              {item.preco_3 && item.preco_3 > 0 ? `R$ ${item.preco_3.toFixed(2)}` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. INTELIGÊNCIA DE COMPRA: MELHOR DIA DA SEMANA */}
      <div className="bg-[#060d19] border border-amber-900/30 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-xs">
        <span className="text-[11px] text-amber-300 font-bold flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-amber-400" />
          Melhor Dia: {item.melhor_dia_semana || 'Terça-feira'}
        </span>
        <span className="text-[10px] text-slate-400">
          (preço historicamente menor)
        </span>
      </div>

      {/* 5. CONTROLE DE QUANTIDADE E SUBTOTAL DA SEMANA */}
      <div className="flex items-center justify-between bg-[#060a12] border border-slate-800 rounded-xl p-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onAlterarQtd(item.produto_id, Math.max(1, qtd - 1))}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold cursor-pointer"
          >
            -
          </button>
          <span className="w-12 text-center font-mono font-black text-xs text-white">
            {qtd} un
          </span>
          <button
            type="button"
            onClick={() => onAlterarQtd(item.produto_id, qtd + 1)}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold cursor-pointer"
          >
            +
          </button>
        </div>

        <div className="text-right">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Subtotal</span>
          <span className="text-sm font-black font-mono text-cyan-300">
            R$ {subtotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* 6. AÇÕES NO RODAPÉ DO CARD */}
      <div className="flex flex-col gap-2 pt-1 border-t border-slate-800/80">
        {/* Linha Principal: Colocar no Carrinho */}
        <button
          type="button"
          onClick={() => onComprar(item.fornecedor_1 || 'PROFARMA', preco1 > 0 ? preco1 : precoUlt)}
          className="w-full py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-xs uppercase tracking-wider shadow-md hover:shadow-cyan-950 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Colocar no Carrinho ({item.fornecedor_1 || 'Melhor'})</span>
        </button>

        {/* Linha Secundária: Substituir por Outro, Não Cotar, Já Pedido */}
        <div className="grid grid-cols-3 gap-1 text-[10px] font-bold">
          <button
            type="button"
            onClick={onSubstituir}
            className="py-1.5 px-1 rounded-lg bg-[#060a12] border border-slate-700/80 hover:border-slate-500 text-slate-300 hover:text-white transition-colors cursor-pointer text-center"
            title="Pula este produto e puxa o 1º do Banco de Reserva"
          >
            ⇄ Substituir
          </button>

          <button
            type="button"
            onClick={onNaoCotar}
            className="py-1.5 px-1 rounded-lg bg-[#060a12] border border-rose-900/60 hover:border-rose-500 text-rose-300 hover:text-rose-200 transition-colors cursor-pointer text-center"
            title="Envia para Lista de Exclusão até ser retirado"
          >
            🚫 Não Cotar
          </button>

          <button
            type="button"
            onClick={onJaPedido}
            className="py-1.5 px-1 rounded-lg bg-[#060a12] border border-slate-700/80 hover:border-slate-500 text-slate-300 hover:text-white transition-colors cursor-pointer text-center"
            title="Marca como já pedido e puxa o próximo"
          >
            📦 Já Pedido
          </button>
        </div>

        {/* Navegação Anterior / Próximo (Apenas se estiver no modo carrossel) */}
        {isModoCarrossel && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
            <button
              type="button"
              disabled={indiceAtual === 0}
              onClick={onNavegarAnterior}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <span className="text-[11px] font-mono text-slate-400">
              #{indiceAtual + 1} de {totalItens}
            </span>

            <button
              type="button"
              disabled={indiceAtual >= totalItens - 1}
              onClick={onNavegarProximo}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-30 cursor-pointer"
            >
              <span>Próximo</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

    </div>
  );
};

export default BelaPedDecisaoTab;
