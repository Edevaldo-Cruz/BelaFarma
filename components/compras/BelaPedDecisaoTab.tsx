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
  HelpCircle,
  Printer
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
  substituto_promovido?: string;
  motivo_sem_estoque?: string;
  prioridade_original?: number;
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
  const [modalSemEstoqueAberto, setModalSemEstoqueAberto] = useState<boolean>(false);
  const [modalImpressaoAberto, setModalImpressaoAberto] = useState<boolean>(false);
  const [recotandoEan, setRecotandoEan] = useState<string | null>(null);
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

  // 3. DIVISÃO EM LISTA ATIVA DA SEMANA (LIMITADA AO ORÇAMENTO), BANCO DE RESERVA E ITENS SEM ESTOQUE
  const { listaAtivaSemana, bancoReservaSemana, itensSemEstoquePortais, totalOrcadoSemana } = useMemo(() => {
    const ativa: FaltaItem7d[] = [];
    const reserva: FaltaItem7d[] = [];
    const semEstoque: FaltaItem7d[] = [];
    let acumulado = 0;
    let rankGlobal = 1;
    let loteSemanaCheio = false;

    for (const item of itensCandidatos) {
      const forn = String(item.fornecedor_1 || '').trim().toLowerCase();
      // Tem estoque se tiver preço válido e fornecedor não for nulo/vazio/"sem estoque"/"sem cotação"
      const temEstoque = Boolean(
        item.preco_1 && 
        item.preco_1 > 0 && 
        forn && 
        !forn.includes('sem estoque') && 
        !forn.includes('sem cotação')
      );

      const preco = item.preco_1 && item.preco_1 > 0
        ? item.preco_1
        : (item.preco_ult_compra || item.custo_unitario || 0);
      const qtd = Math.max(1, item.qtd_sugerida_7d || 1);
      const subtotal = Number((qtd * preco).toFixed(2));

      // Enquanto o lote ativo da semana ainda NÃO completou o orçamento:
      if (!loteSemanaCheio) {
        if (!temEstoque) {
          // Item prioritário avaliado para esta semana que não tem estoque em nenhum portal:
          // Abre vaga para o próximo e entra na lista de auditadas da semana!
          semEstoque.push({
            ...item,
            subtotal_7d: subtotal,
            prioridade_original: rankGlobal++,
            motivo_sem_estoque: 'Esgotado em todos os 12 portais'
          });
          continue;
        }

        // Tem estoque: verifica se cabe no orçamento da semana
        const isPromovido = promovidosManualmente.has(item.produto_id);

        if (isPromovido || (acumulado + subtotal <= tetoSemanalAtivo || ativa.length === 0)) {
          ativa.push({
            ...item,
            subtotal_7d: subtotal,
            prioridade_original: rankGlobal++
          });
          acumulado += subtotal;
        } else {
          // Ultrapassou o teto orçamentário da semana: o lote da semana fechou!
          loteSemanaCheio = true;
          reserva.push({
            ...item,
            subtotal_7d: subtotal,
            prioridade_original: rankGlobal++
          });
        }
      } else {
        // Lote da semana já completo: apenas os itens restantes COM estoque vão para o Banco de Reserva
        if (temEstoque) {
          reserva.push({
            ...item,
            subtotal_7d: subtotal,
            prioridade_original: rankGlobal++
          });
        }
        // Itens sem estoque além do corte semanal são ignorados para não poluir o relatório da semana
      }
    }

    // Associa aos itens sem estoque o produto com estoque que entrou na lista ativa para ocupar a vaga
    semEstoque.forEach((se, idx) => {
      const promovido = ativa[ativa.length - 1 - idx] || ativa[ativa.length - 1] || ativa[0];
      if (promovido) {
        se.substituto_promovido = promovido.descricao;
      }
    });

    return {
      listaAtivaSemana: ativa,
      bancoReservaSemana: reserva,
      itensSemEstoquePortais: semEstoque,
      totalOrcadoSemana: acumulado
    };
  }, [itensCandidatos, tetoSemanalAtivo, promovidosManualmente]);

  // Sobra enxugada na semana
  const sobraSemana = Math.max(0, tetoSemanalAtivo - totalOrcadoSemana);
  const totalPoupadoSemana = valorReservaPoupada + sobraSemana;
  const pctConsumoOrcamento = tetoSemanalAtivo > 0 ? (totalOrcadoSemana / tetoSemanalAtivo) * 100 : 0;

  // 4. BALANÇO DE ECONOMIA OU GASTO A MAIS NA COTAÇÃO (VS ÚLTIMA COMPRA / REFERÊNCIA)
  const { totalReferenciaUltCompra, diferencaEconomiaReais, diferencaEconomiaPct, isEconomia } = useMemo(() => {
    let somaRef = 0;
    let somaCotado = 0;

    for (const item of listaAtivaSemana) {
      const precoCotado = Number(item.preco_1) || 0;
      const precoRef = Number(item.preco_ult_compra) || Number(item.custo_unitario) || 0;
      const qtd = Math.max(1, item.qtd_sugerida_7d || 1);

      if (precoCotado > 0 && precoRef > 0) {
        somaCotado += precoCotado * qtd;
        somaRef += precoRef * qtd;
      }
    }

    const diff = somaRef - somaCotado;
    const pct = somaRef > 0 ? (Math.abs(diff) / somaRef) * 100 : 0;
    const isEcon = diff >= 0;

    return {
      totalReferenciaUltCompra: somaRef,
      diferencaEconomiaReais: Math.abs(diff),
      diferencaEconomiaPct: Number(pct.toFixed(1)),
      isEconomia: isEcon
    };
  }, [listaAtivaSemana]);

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

  // 6. Recotar item sem estoque nos portais
  const handleRecotarItemSemEstoque = async (ean: string, descricao: string) => {
    if (!ean) {
      addToast('Produto sem EAN para cotação.', 'warning');
      return;
    }
    setRecotandoEan(ean);
    addToast(`Disparando recotação nos portais para "${descricao.slice(0, 25)}"...`, 'info');
    try {
      const res = await fetch('/api/belaped/recotar-produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ean,
          fornecedor: 'TODOS',
          descricao
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Cotação atualizada para "${descricao.slice(0, 25)}"!`, 'success');
        if (onRecarregarDados) await onRecarregarDados();
      } else {
        addToast(data.error || 'Não foi possível recotar o item.', 'warning');
      }
    } catch (e) {
      addToast('Erro ao disparar recotação.', 'error');
    } finally {
      setRecotandoEan(null);
    }
  };

  // 7. Gerar e abrir documento HTML puro para impressão perfeita em modo Retrato (A4 Multi-páginas)
  const handleAbrirRelatorioHtml = () => {
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const horaHoje = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const totalUnidades = listaAtivaSemana.reduce((acc, it) => acc + (it.qtd_sugerida_7d || 1), 0);
    const escapeHtml = (str: any) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>BelaFarma - Relatório Semanal de Compras (${dataHoje})</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 8mm 10mm 8mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.25;
    }
    .toolbar {
      position: sticky;
      top: 0;
      background: #0f172a;
      color: #ffffff;
      padding: 10px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.15);
      z-index: 9999;
    }
    .toolbar h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .toolbar-actions {
      display: flex;
      gap: 10px;
    }
    .btn {
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: 800;
      font-size: 11px;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      transition: all 0.15s ease;
    }
    .btn-primary {
      background: #0284c7;
      color: #ffffff;
    }
    .btn-primary:hover {
      background: #0369a1;
    }
    .btn-secondary {
      background: #334155;
      color: #ffffff;
    }
    .btn-secondary:hover {
      background: #475569;
    }
    @media print {
      .toolbar {
        display: none !important;
      }
      body {
        padding: 0 !important;
      }
    }
    .sheet {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
      padding: 12px 14px;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .header h1 {
      margin: 0;
      font-size: 17px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .header p {
      margin: 2px 0 0;
      font-size: 10.5px;
      color: #475569;
      font-weight: 600;
    }
    .meta-box {
      text-align: right;
      font-size: 9.5px;
      color: #475569;
      line-height: 1.35;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 10px;
      margin-bottom: 12px;
    }
    .kpi-item span {
      display: block;
    }
    .kpi-label {
      font-size: 8.5px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
    }
    .kpi-val {
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
      font-family: monospace;
    }
    .section-title {
      background: #1e293b;
      color: #ffffff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      justify-content: space-between;
      margin-top: 12px;
      margin-bottom: 5px;
    }
    .section-subtitle {
      font-size: 9.5px;
      color: #64748b;
      font-style: italic;
      margin: -2px 0 5px 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      margin-bottom: 8px;
      page-break-inside: auto;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    th {
      background: #f1f5f9;
      color: #1e293b;
      font-weight: 800;
      text-align: left;
      border: 1px solid #94a3b8;
      padding: 3.5px 5px;
      white-space: nowrap;
    }
    td {
      border: 1px solid #cbd5e1;
      padding: 3px 5px;
      color: #0f172a;
    }
    tr:nth-child(even) td {
      background: #f8fafc;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-mono { font-family: monospace; }
    .font-bold { font-weight: 700; }
    .font-black { font-weight: 900; }
    .badge-ok {
      background: #ecfdf5;
      color: #047857;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 700;
      border: 1px solid #a7f3d0;
      white-space: nowrap;
    }
    .badge-warn {
      background: #fffbeb;
      color: #b45309;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 700;
      border: 1px solid #fde68a;
      white-space: nowrap;
    }
    .badge-esgotado {
      background: #fef2f2;
      color: #b91c1c;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 700;
      border: 1px solid #fecaca;
      white-space: nowrap;
    }
    .footer {
      border-top: 1px solid #cbd5e1;
      padding-top: 6px;
      margin-top: 12px;
      display: flex;
      justify-content: space-between;
      font-size: 8.5px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <h2>📄 BelaFarma • Relatório Semanal de Compras</h2>
    <div class="toolbar-actions">
      <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
      <button class="btn btn-secondary" onclick="window.close()">✕ Fechar</button>
    </div>
  </div>

  <div class="sheet">
    <div class="header">
      <div>
        <h1>BelaFarma • Decisão Semanal de Compras</h1>
        <p>Enquadramento Orçamentário com Reserva de Segurança & Auditoria de Faltas</p>
      </div>
      <div class="meta-box">
        <div><b>Emissão:</b> ${dataHoje} às ${horaHoje}</div>
        <div><b>Janela:</b> ${escapeHtml(janelaAlvoSelecionada || 'Padrão')}</div>
        <div><b>Reserva de Caixa:</b> ${reservaSegurancaPct}%</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-item">
        <span class="kpi-label">Teto Semanal</span>
        <span class="kpi-val">R$ ${tetoSemanalAtivo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="kpi-item">
        <span class="kpi-label">Cota Comprometida</span>
        <span class="kpi-val" style="color: #0284c7;">R$ ${totalOrcadoSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="kpi-item">
        <span class="kpi-label">Reserva Poupada (${reservaSegurancaPct}%)</span>
        <span class="kpi-val" style="color: #059669;">R$ ${valorReservaPoupada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="kpi-item">
        <span class="kpi-label">${isEconomia ? 'Economia na Cotação' : 'Acréscimo na Cotação'}</span>
        <span class="kpi-val" style="color: ${isEconomia ? '#059669' : '#dc2626'};">
          ${isEconomia ? '-' : '+'}R$ ${diferencaEconomiaReais.toFixed(2)} (${isEconomia ? '-' : '+'}${diferencaEconomiaPct}%)
        </span>
      </div>
      <div class="kpi-item">
        <span class="kpi-label">Itens Aprovados</span>
        <span class="kpi-val">${listaAtivaSemana.length} produtos (${totalUnidades} un)</span>
      </div>
    </div>

    <!-- BLOCO 1 -->
    <div class="section-title">
      <span>📦 Bloco 1: Pedido da Semana dentro da Cota Orçamentária</span>
      <span class="font-mono">Total: R$ ${totalOrcadoSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>

    <table>
      <thead>
        <tr>
          <th class="text-center" style="width: 20px;">#</th>
          <th>Produto / Descrição</th>
          <th class="text-center" style="width: 75px;">EAN</th>
          <th class="text-center" style="width: 25px;">Curva</th>
          <th class="text-right" style="width: 28px;">Saldo</th>
          <th class="text-right" style="width: 28px;">VMD</th>
          <th class="text-center" style="width: 30px;">Qtd</th>
          <th>Distribuidora</th>
          <th class="text-right" style="width: 52px;">Preço Cot.</th>
          <th class="text-right" style="width: 52px;">Últ. Compra</th>
          <th class="text-right" style="width: 65px;">Variação</th>
          <th class="text-right" style="width: 58px;">Subtotal</th>
          <th class="text-center" style="width: 52px;">Janela</th>
        </tr>
      </thead>
      <tbody>
        ${listaAtivaSemana.map((it, idx) => {
          const precoUlt = Number(it.preco_ult_compra) || Number(it.custo_unitario) || 0;
          const precoCot = Number(it.preco_1) || 0;
          const diffUnit = precoUlt > 0 && precoCot > 0 ? (precoCot - precoUlt) : 0;
          const diffPct = precoUlt > 0 ? (diffUnit / precoUlt) * 100 : 0;
          return `
            <tr>
              <td class="text-center font-bold" style="color: #64748b;">${idx + 1}</td>
              <td class="font-bold">${escapeHtml(it.descricao)}</td>
              <td class="text-center font-mono" style="color: #475569;">${escapeHtml(it.ean || '—')}</td>
              <td class="text-center font-bold">${escapeHtml(it.curva_abc)}</td>
              <td class="text-right ${it.saldo <= 0 ? 'font-bold' : ''}" style="color: ${it.saldo <= 0 ? '#dc2626' : '#334155'};">${it.saldo}</td>
              <td class="text-right" style="color: #475569;">${Number(it.vmd_ponderado).toFixed(1)}</td>
              <td class="text-center font-bold" style="color: #0369a1;">${it.qtd_sugerida_7d}</td>
              <td class="font-bold">${escapeHtml(it.fornecedor_1 || '—')}</td>
              <td class="text-right font-mono">R$ ${precoCot.toFixed(2)}</td>
              <td class="text-right font-mono" style="color: #64748b;">${precoUlt > 0 ? `R$ ${precoUlt.toFixed(2)}` : '—'}</td>
              <td class="text-right font-mono font-bold" style="font-size: 8px;">
                ${diffUnit < 0 
                  ? `<span class="badge-ok">-R$ ${Math.abs(diffUnit).toFixed(2)} (${diffPct.toFixed(1)}%)</span>` 
                  : diffUnit > 0 
                  ? `<span class="badge-warn">+R$ ${diffUnit.toFixed(2)} (+${diffPct.toFixed(1)}%)</span>` 
                  : '<span style="color: #94a3b8;">=</span>'}
              </td>
              <td class="text-right font-mono font-bold">R$ ${it.subtotal_7d.toFixed(2)}</td>
              <td class="text-center">
                ${it.melhor_fora_janela && it.melhor_fora_janela.distribuidora === it.fornecedor_1 
                  ? '<span class="badge-warn">Fora Janela</span>' 
                  : '<span class="badge-ok">Janela OK</span>'}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
      <tfoot>
        <tr style="background: #e2e8f0; font-weight: 800;">
          <td colspan="6" class="text-right font-bold" style="text-transform: uppercase;">Totais do Pedido:</td>
          <td class="text-center font-bold" style="color: #0369a1;">${totalUnidades} un</td>
          <td colspan="4" class="text-right font-bold" style="text-transform: uppercase;">Valor Total Comprometido:</td>
          <td class="text-right font-mono font-black" style="color: #0f172a; font-size: 10px;">
            R$ ${totalOrcadoSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </td>
          <td class="text-center" style="font-size: 8px; color: #475569;">
            ${((totalOrcadoSemana / (tetoSemanalAtivo || 1)) * 100).toFixed(0)}% cota
          </td>
        </tr>
        <tr style="background: #f8fafc; font-weight: 700;">
          <td colspan="6" class="text-right" style="text-transform: uppercase; font-size: 8px; color: #64748b;">
            Balanço vs Última Compra:
          </td>
          <td colspan="7" class="text-left font-mono font-bold" style="color: ${isEconomia ? '#059669' : '#dc2626'}; font-size: 9px;">
            ${isEconomia ? '🟢 ECONOMIA TOTAL GERADA:' : '🟠 ACRÉSCIMO TOTAL:'} 
            <b>${isEconomia ? '-' : '+'}R$ ${diferencaEconomiaReais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> 
            (${isEconomia ? '-' : '+'}${diferencaEconomiaPct}% vs total histórico de R$ ${totalReferenciaUltCompra.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- BLOCO 2 -->
    <div class="section-title" style="background: #78350f;">
      <span>⚠️ Bloco 2: Faltas Críticas Sem Estoque nos Portais (Cobrança de Fornecedores)</span>
      <span>${itensSemEstoquePortais.length} itens esgotados (vagas abertas)</span>
    </div>
    <div class="section-subtitle">
      Itens prioritários em falta crítica que abriram vaga no orçamento por estarem esgotados em todos os 12 portais. Entregue esta lista ao televendas/representantes.
    </div>

    <table>
      <thead>
        <tr style="background: #fef3c7;">
          <th class="text-center" style="width: 30px;"># Orig.</th>
          <th>Produto em Falta</th>
          <th class="text-center" style="width: 80px;">EAN</th>
          <th class="text-center" style="width: 28px;">Curva</th>
          <th class="text-right" style="width: 32px;">Saldo</th>
          <th class="text-right" style="width: 32px;">VMD</th>
          <th class="text-center" style="width: 38px;">Qtd Nec.</th>
          <th class="text-right" style="width: 60px;">Preço Ref.</th>
          <th class="text-center" style="width: 90px;">Situação Portais</th>
          <th>Vaga Ocupada Por (Substituto)</th>
        </tr>
      </thead>
      <tbody>
        ${itensSemEstoquePortais.length === 0 ? `
          <tr>
            <td colspan="10" class="text-center" style="padding: 10px; color: #64748b; font-style: italic;">
              Nenhum produto crítico esgotado nos portais nesta semana.
            </td>
          </tr>
        ` : itensSemEstoquePortais.map((it) => `
          <tr>
            <td class="text-center font-bold" style="color: #92400e;">#${it.prioridade_original || '—'}</td>
            <td class="font-bold">${escapeHtml(it.descricao)}</td>
            <td class="text-center font-mono" style="color: #475569;">${escapeHtml(it.ean || '—')}</td>
            <td class="text-center font-bold">${escapeHtml(it.curva_abc)}</td>
            <td class="text-right font-bold" style="color: #dc2626;">${it.saldo}</td>
            <td class="text-right" style="color: #475569;">${Number(it.vmd_ponderado).toFixed(1)}</td>
            <td class="text-center font-bold">${it.qtd_sugerida_7d}</td>
            <td class="text-right font-mono">R$ ${(it.preco_ult_compra || it.custo_unitario || 0).toFixed(2)}</td>
            <td class="text-center"><span class="badge-esgotado">Esgotado nos 12 portais</span></td>
            <td>
              ${it.substituto_promovido 
                ? `<b style="color: #065f46;">${escapeHtml(it.substituto_promovido)}</b>` 
                : '<span style="color: #64748b; font-style: italic;">Vaga liberada no orçamento</span>'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="footer">
      <span>BelaFarma Gestão Farmacêutica Inteligente • Módulo BelaPed Decisão</span>
      <span>Documento gerado em modo Retrato (A4 Multi-páginas)</span>
    </div>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        try { win.print(); } catch {}
      }, 400);
    } else {
      addToast('Pop-up bloqueado pelo navegador. Por favor, autorize pop-ups para imprimir.', 'warning');
    }
  };

  // 8. Enviar item ao carrinho via robô
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 pt-1">
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

            {/* Balanço de Economia ou Gasto a Mais na Cotação vs Última Compra */}
            <div className={`border rounded-xl p-2.5 flex flex-col justify-between ${
              isEconomia 
                ? 'bg-gradient-to-br from-emerald-950/40 to-teal-950/30 border-emerald-700/60' 
                : 'bg-gradient-to-br from-rose-950/40 to-amber-950/30 border-rose-700/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] uppercase font-black tracking-wider flex items-center gap-1 ${
                  isEconomia ? 'text-emerald-300' : 'text-rose-300'
                }`}>
                  {isEconomia ? 'Economia Cotação' : 'Acréscimo Cotação'}
                </span>
                {isEconomia ? <TrendingDown className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingUp className="w-3.5 h-3.5 text-rose-400" />}
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className={`text-sm font-black font-mono ${isEconomia ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {isEconomia ? '-' : '+'}R$ {diferencaEconomiaReais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={`text-[10px] font-bold ${isEconomia ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ({isEconomia ? '-' : '+'}{diferencaEconomiaPct}%)
                </span>
              </div>
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
      <div className="px-3 sm:px-4 max-w-7xl mx-auto w-full flex items-center justify-between gap-3 pb-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-cyan-400" />
            Lote Ativo da Semana ({listaAtivaSemana.length} itens)
          </span>
          <span className="text-[11px] font-mono text-cyan-300 font-bold">
            = R$ {totalOrcadoSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>

          {totalReferenciaUltCompra > 0 && (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1.5 ${
              isEconomia 
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60' 
                : 'bg-rose-950/80 text-rose-300 border-rose-700/60'
            }`}>
              {isEconomia ? <TrendingDown className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingUp className="w-3.5 h-3.5 text-rose-400" />}
              <span>
                {isEconomia ? 'Economia:' : 'Gasto a mais:'} <b>{isEconomia ? '-' : '+'}R$ {diferencaEconomiaReais.toFixed(2)}</b> ({isEconomia ? '-' : '+'}{diferencaEconomiaPct}% vs última compra)
              </span>
            </span>
          )}
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

          {/* Botão para ver Sem Estoque nos Portais */}
          {itensSemEstoquePortais.length > 0 && (
            <button
              type="button"
              onClick={() => setModalSemEstoqueAberto(true)}
              className="px-2.5 py-1.5 rounded-xl bg-amber-950/40 border border-amber-800/80 hover:border-amber-500 text-amber-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              title="Itens críticos esgotados em todos os 12 portais (abriram vaga na semana)"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Sem Estoque ({itensSemEstoquePortais.length})</span>
            </button>
          )}

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

          {/* Botão de Impressão da Lista (A4) */}
          <button
            type="button"
            onClick={handleAbrirRelatorioHtml}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-900/60 to-blue-900/60 border border-cyan-700/80 hover:border-cyan-400 text-cyan-200 hover:text-white text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
            title="Imprimir relatório da semana e faltas esgotadas nos portais"
          >
            <Printer className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Imprimir Lista</span>
            <span className="sm:hidden">Imprimir</span>
          </button>

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

      {/* ─── MODAL DE PRODUTOS SEM ESTOQUE NOS PORTAIS (ABRIRAM VAGA) ───────── */}
      {modalSemEstoqueAberto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#0b1222] border-2 border-amber-800/80 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-950/60 border border-amber-800 rounded-xl text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">Faltas Sem Estoque nos Portais ({itensSemEstoquePortais.length} itens)</h3>
                  <span className="text-xs text-amber-300 font-bold">Abriram vaga no orçamento semanal</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalSemEstoqueAberto(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-2.5">
              <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-200">
                <p className="font-bold mb-1">💡 Por que estes produtos não aparecem nos cards de compra?</p>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Estes itens pertencem à Extrema Necessidade (Curva A/B ou Ruptura), porém nenhuma das 12 distribuidoras possui estoque disponível no momento. Eles <b>não consumiram o seu orçamento</b>, abrindo vaga automaticamente para que outros produtos com estoque pudessem ser aprovados.
                </p>
              </div>

              {itensSemEstoquePortais.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">Nenhum produto em falta está esgotado nos portais.</p>
              ) : (
                itensSemEstoquePortais.map((it) => (
                  <div
                    key={it.produto_id}
                    className="p-3 rounded-xl bg-[#060a12] border border-amber-900/40 hover:border-amber-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors"
                  >
                    <div className="truncate flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                          #{it.prioridade_original || '—'}
                        </span>
                        <span className="font-black text-xs text-white truncate">{it.descricao}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                          Esgotado nos 12 portais
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 flex-wrap">
                        <span>EAN: {it.ean}</span>
                        <span>•</span>
                        <span>Curva {it.curva_abc}</span>
                        <span>•</span>
                        <span>Saldo: <b className="text-rose-400">{it.saldo} un</b></span>
                        <span>•</span>
                        <span>VMD: {it.vmd_ponderado}</span>
                        <span>•</span>
                        <span>Qtd Nec: {it.qtd_sugerida_7d} un</span>
                        <span>•</span>
                        <span>Ref: R$ {(it.preco_ult_compra || it.custo_unitario || 0).toFixed(2)}</span>
                      </div>
                      {it.substituto_promovido && (
                        <div className="mt-1 text-[11px] text-emerald-400 font-medium">
                          ↳ Vaga ocupada por: <span className="font-bold underline">{it.substituto_promovido}</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={recotandoEan === it.ean}
                      onClick={() => handleRecotarItemSemEstoque(it.ean, it.descricao)}
                      className="px-3 py-1.5 rounded-xl bg-amber-950 hover:bg-amber-900 border border-amber-700/80 text-amber-200 text-xs font-black uppercase tracking-wider shrink-0 cursor-pointer shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      title="Disparar robôs para consultar novamente este EAN em todos os portais"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${recotandoEan === it.ean ? 'animate-spin' : ''}`} />
                      <span>{recotandoEan === it.ean ? 'Cotando...' : 'Recotar Portais'}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE PRÉ-VISUALIZAÇÃO E IMPRESSÃO A4 (2 BLOCOS) ───────────────── */}
      {modalImpressaoAberto && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          {/* Estilos específicos para impressão nativa A4 */}
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #relatorio-decisao-print, #relatorio-decisao-print * {
                visibility: visible !important;
              }
              #relatorio-decisao-print {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 10mm !important;
                background: #ffffff !important;
                color: #000000 !important;
                box-shadow: none !important;
              }
              .no-print {
                display: none !important;
              }
              table {
                width: 100% !important;
                border-collapse: collapse !important;
                font-size: 10px !important;
                page-break-inside: auto !important;
              }
              tr {
                page-break-inside: avoid !important;
                page-break-after: auto !important;
              }
              thead {
                display: table-header-group !important;
              }
              tfoot {
                display: table-footer-group !important;
              }
              th, td {
                border: 1px solid #cbd5e1 !important;
                padding: 4px 6px !important;
                color: #0f172a !important;
              }
              th {
                background-color: #f1f5f9 !important;
                font-weight: 800 !important;
              }
            }
          `}</style>

          <div className="bg-[#0b1222] border border-cyan-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl animate-in zoom-in-95">
            {/* Barra superior de ações (oculta na impressão) */}
            <div className="no-print p-3.5 border-b border-slate-800 flex items-center justify-between bg-[#060a12] rounded-t-2xl shrink-0">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-cyan-400" />
                <h3 className="font-black text-white text-sm sm:text-base">Pré-visualização do Relatório Semanal de Compras</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAbrirRelatorioHtml}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir em Nova Janela (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalImpressaoAberto(false)}
                  className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Conteúdo Imprimível (A4 Clean) */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-900/60 flex justify-center">
              <div 
                id="relatorio-decisao-print" 
                className="bg-white text-slate-900 p-6 sm:p-8 rounded-xl shadow-xl w-full max-w-4xl min-h-[1050px] font-sans flex flex-col gap-5"
              >
                {/* Cabeçalho Institucional do Relatório */}
                <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      BelaFarma • Decisão Semanal de Compras
                    </h1>
                    <p className="text-xs text-slate-600 font-semibold mt-0.5">
                      Enquadramento Orçamentário com Reserva de Segurança & Auditoria de Faltas
                    </p>
                  </div>
                  <div className="text-left sm:text-right text-[11px] text-slate-600 leading-snug">
                    <p><b>Emissão:</b> {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    <p><b>Janela de Vencimento:</b> {janelaAlvoSelecionada || 'Padrão'}</p>
                    <p><b>Reserva de Caixa:</b> {reservaSegurancaPct}%</p>
                  </div>
                </div>

                {/* Resumo Financeiro da Semana */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Teto Semanal:</span>
                    <span className="font-bold text-slate-800">
                      R$ {tetoSemanalAtivo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Cota Comprometida:</span>
                    <span className="font-black text-blue-700">
                      R$ {totalOrcadoSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Reserva Poupada ({reservaSegurancaPct}%):</span>
                    <span className="font-bold text-emerald-700">
                      R$ {valorReservaPoupada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">{isEconomia ? 'Economia na Cotação:' : 'Acréscimo na Cotação:'}</span>
                    <span className={`font-black font-mono ${isEconomia ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {isEconomia ? '-' : '+'}R$ {diferencaEconomiaReais.toFixed(2)} ({isEconomia ? '-' : '+'}{diferencaEconomiaPct}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Itens Aprovados:</span>
                    <span className="font-bold text-slate-800">
                      {listaAtivaSemana.length} produtos ({itensSemEstoquePortais.length} sem estoque)
                    </span>
                  </div>
                </div>

                {/* ─── BLOCO 1: PEDIDO DA SEMANA DENTRO DA COTA ORÇAMENTÁRIA ────────── */}
                <div className="flex flex-col gap-2">
                  <div className="bg-slate-800 text-white px-3 py-1.5 rounded flex items-center justify-between">
                    <span className="font-black text-xs tracking-wider uppercase">
                      📦 Bloco 1: Pedido da Semana dentro da Cota Orçamentária
                    </span>
                    <span className="text-xs font-mono font-bold text-cyan-300">
                      Total: R$ {totalOrcadoSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-300 text-[10px]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700">
                          <th className="border border-slate-300 px-1.5 py-1 text-center w-8">#</th>
                          <th className="border border-slate-300 px-2 py-1 text-left">Produto / Descrição</th>
                          <th className="border border-slate-300 px-1.5 py-1 text-center">EAN</th>
                          <th className="border border-slate-300 px-1.5 py-1 text-center w-8">Curva</th>
                          <th className="border border-slate-300 px-1.5 py-1 text-right">Saldo</th>
                          <th className="border border-slate-300 px-1.5 py-1 text-right">VMD</th>
                          <th className="border border-slate-300 px-1.5 py-1 text-center font-bold">Qtd</th>
                          <th className="border border-slate-300 px-2 py-1 text-left">Distribuidora</th>
                          <th className="border border-slate-300 px-2 py-1 text-right">Preço Cot.</th>
                          <th className="border border-slate-300 px-2 py-1 text-right">Últ. Compra</th>
                          <th className="border border-slate-300 px-2 py-1 text-right font-bold">Variação</th>
                          <th className="border border-slate-300 px-2 py-1 text-right font-bold">Subtotal</th>
                          <th className="border border-slate-300 px-1.5 py-1 text-center">Janela</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listaAtivaSemana.map((it, idx) => {
                          const precoUlt = Number(it.preco_ult_compra) || Number(it.custo_unitario) || 0;
                          const precoCot = Number(it.preco_1) || 0;
                          const diffUnit = precoUlt > 0 && precoCot > 0 ? (precoCot - precoUlt) : 0;
                          const diffPct = precoUlt > 0 ? (diffUnit / precoUlt) * 100 : 0;
                          return (
                            <tr key={it.produto_id} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                              <td className="border border-slate-300 px-1.5 py-1 text-center font-bold text-slate-600">
                                {idx + 1}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 font-bold text-slate-900">
                                {it.descricao}
                              </td>
                              <td className="border border-slate-300 px-1.5 py-1 text-center font-mono text-slate-600">
                                {it.ean || '—'}
                              </td>
                              <td className="border border-slate-300 px-1.5 py-1 text-center font-bold text-slate-700">
                                {it.curva_abc}
                              </td>
                              <td className={`border border-slate-300 px-1.5 py-1 text-right ${it.saldo <= 0 ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>
                                {it.saldo}
                              </td>
                              <td className="border border-slate-300 px-1.5 py-1 text-right text-slate-600">
                                {Number(it.vmd_ponderado).toFixed(1)}
                              </td>
                              <td className="border border-slate-300 px-1.5 py-1 text-center font-bold text-blue-800">
                                {it.qtd_sugerida_7d}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 font-bold text-slate-800">
                                {it.fornecedor_1 || '—'}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-right font-mono text-slate-700">
                                R$ {precoCot.toFixed(2)}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-right font-mono text-slate-500">
                                {precoUlt > 0 ? `R$ ${precoUlt.toFixed(2)}` : '—'}
                              </td>
                              <td className="border border-slate-300 px-1.5 py-1 text-right font-mono font-bold text-[9px]">
                                {diffUnit < 0 ? (
                                  <span className="text-emerald-700 font-bold">-R$ {Math.abs(diffUnit).toFixed(2)} ({diffPct.toFixed(1)}%)</span>
                                ) : diffUnit > 0 ? (
                                  <span className="text-rose-700 font-bold">+R$ {diffUnit.toFixed(2)} (+{diffPct.toFixed(1)}%)</span>
                                ) : (
                                  <span className="text-slate-400">=</span>
                                )}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-right font-mono font-bold text-slate-900">
                                R$ {it.subtotal_7d.toFixed(2)}
                              </td>
                              <td className="border border-slate-300 px-1.5 py-1 text-center text-[9px] font-bold">
                                {it.melhor_fora_janela && it.melhor_fora_janela.distribuidora === it.fornecedor_1 ? (
                                  <span className="text-amber-700">Fora Janela</span>
                                ) : (
                                  <span className="text-emerald-700">Janela OK</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-200 font-bold text-slate-900">
                          <td colSpan={6} className="border border-slate-300 px-2 py-1.5 text-right uppercase">
                            Totais do Pedido da Semana:
                          </td>
                          <td className="border border-slate-300 px-1.5 py-1.5 text-center font-bold text-blue-900">
                            {listaAtivaSemana.reduce((acc, it) => acc + (it.qtd_sugerida_7d || 1), 0)} un
                          </td>
                          <td colSpan={4} className="border border-slate-300 px-2 py-1.5 text-right uppercase">
                            Valor Total Comprometido:
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right font-mono font-black text-blue-900 text-[11px]">
                            R$ {totalOrcadoSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="border border-slate-300 px-1.5 py-1.5 text-center text-[9px] text-slate-600">
                            {((totalOrcadoSemana / (tetoSemanalAtivo || 1)) * 100).toFixed(0)}% cota
                          </td>
                        </tr>
                        <tr className="bg-slate-100 font-bold">
                          <td colSpan={6} className="border border-slate-300 px-2 py-1 text-right uppercase text-[9px] text-slate-600">
                            Balanço vs Última Compra:
                          </td>
                          <td colSpan={7} className={`border border-slate-300 px-2 py-1 text-left font-mono font-bold text-[10px] ${
                            isEconomia ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {isEconomia ? '🟢 ECONOMIA TOTAL GERADA:' : '🟠 ACRÉSCIMO TOTAL:'}{' '}
                            <b>{isEconomia ? '-' : '+'}R$ {diferencaEconomiaReais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>{' '}
                            ({isEconomia ? '-' : '+'}{diferencaEconomiaPct}% vs total histórico de R$ {totalReferenciaUltCompra.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* ─── BLOCO 2: FALTAS CRÍTICAS SEM ESTOQUE NOS PORTAIS ───────────── */}
                <div className="flex flex-col gap-2 pt-2">
                  <div className="bg-amber-900 text-white px-3 py-1.5 rounded flex items-center justify-between">
                    <span className="font-black text-xs tracking-wider uppercase">
                      ⚠️ Bloco 2: Faltas Críticas Sem Estoque nos Portais (Cobrança de Fornecedores)
                    </span>
                    <span className="text-xs font-bold text-amber-200">
                      {itensSemEstoquePortais.length} itens esgotados (vagas abertas no orçamento)
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-600 italic">
                    Itens prioritários com estoque zerado ou ruptura iminente que não puderam ser cotados por falta de disponibilidade em nenhum dos 12 portais. Entregue esta lista ao televendas/representantes para cobrança direta.
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-300 text-[10px]">
                      <thead>
                        <tr className="bg-amber-50 text-amber-950 font-bold">
                          <th className="border border-slate-300 px-1.5 py-1 text-center w-8"># Orig.</th>
                          <th className="border border-slate-300 px-2 py-1 text-left">Produto em Falta</th>
                          <th className="border border-slate-300 px-1.5 py-1 text-center">EAN</th>
                          <th className="border border-slate-300 px-1.5 py-1 text-center w-8">Curva</th>
                          <th className="border border-slate-300 px-1.5 py-1 text-right">Saldo</th>
                          <th className="border border-slate-300 px-1.5 py-1 text-right">VMD</th>
                          <th className="border border-slate-300 px-1.5 py-1 text-center font-bold">Qtd Nec.</th>
                          <th className="border border-slate-300 px-2 py-1 text-right">Preço Ref.</th>
                          <th className="border border-slate-300 px-2 py-1 text-center text-rose-700">Situação Portais</th>
                          <th className="border border-slate-300 px-2 py-1 text-left font-bold text-slate-800">Vaga Ocupada Por (Substituto)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itensSemEstoquePortais.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="border border-slate-300 p-3 text-center text-slate-500 italic">
                              Nenhum produto crítico esgotado nos portais nesta semana.
                            </td>
                          </tr>
                        ) : (
                          itensSemEstoquePortais.map((it) => (
                            <tr key={it.produto_id} className="bg-white hover:bg-amber-50/50">
                              <td className="border border-slate-300 px-1.5 py-1 text-center font-bold text-amber-800">
                                #{it.prioridade_original || '—'}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 font-bold text-slate-900">
                                {it.descricao}
                              </td>
                              <td className="border border-slate-300 px-1.5 py-1 text-center font-mono text-slate-600">
                                {it.ean || '—'}
                              </td>
                              <td className="border border-slate-300 px-1.5 py-1 text-center font-bold text-slate-700">
                                {it.curva_abc}
                              </td>
                              <td className="border border-slate-300 px-1.5 py-1 text-right text-rose-600 font-bold">
                                {it.saldo}
                              </td>
                              <td className="border border-slate-300 px-1.5 py-1 text-right text-slate-600">
                                {Number(it.vmd_ponderado).toFixed(1)}
                              </td>
                              <td className="border border-slate-300 px-1.5 py-1 text-center font-bold text-slate-800">
                                {it.qtd_sugerida_7d}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-right font-mono text-slate-700">
                                R$ {(it.preco_ult_compra || it.custo_unitario || 0).toFixed(2)}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-center font-bold text-rose-600 text-[9px]">
                                Esgotado nos 12 portais
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-slate-800 text-[10px]">
                                {it.substituto_promovido ? (
                                  <span className="font-bold text-emerald-800">{it.substituto_promovido}</span>
                                ) : (
                                  <span className="text-slate-400 italic">Vaga liberada no orçamento</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Rodapé Institucional */}
                <div className="border-t border-slate-300 pt-3 text-[10px] text-slate-500 flex items-center justify-between mt-auto">
                  <span>BelaFarma Gestão Farmacêutica Inteligente • Módulo BelaPed Decisão</span>
                  <span>Documento gerado automaticamente pelo sistema</span>
                </div>
              </div>
            </div>
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
