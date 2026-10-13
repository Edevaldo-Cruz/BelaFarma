import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingBag, 
  DollarSign, 
  Layers, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Search, 
  Plus, 
  Trash2, 
  ExternalLink, 
  ArrowLeft, 
  Sparkles, 
  Globe, 
  Lock, 
  BarChart3,
  Percent,
  Building2,
  TrendingUp,
  Sliders,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Bot,
  Download,
  FileSpreadsheet,
  ShoppingCart,
  Calendar,
  Zap,
  LineChart,
  Wallet,
  PiggyBank,
  HelpCircle,
  Info,
  CalendarCheck
} from 'lucide-react';
import { User } from '../../types';
import { useToast } from '../ToastContext';
import PedidosTab from './BelaPedPedidosTab';
import BelaPedResumoTremor from './BelaPedResumoTremor';
import BelaPedSimuladorGiro from './BelaPedSimuladorGiro';
import { BelaPedRobotMonitor } from './BelaPedRobotMonitor';
import { BelaPedPrecoHistoricoModal } from './BelaPedPrecoHistoricoModal';
import { BelaPedOrcamentoSemanalModal } from './BelaPedOrcamentoSemanalModal';

interface BelaPedPortalProps {
  user: User;
  theme: 'light' | 'dark';
  onNavigate?: (view: any) => void;
}

interface FaltaItem7d {
  produto_id: number;
  descricao: string;
  apresentacao: string;
  ean: string;
  curva_abc: string;
  saldo: number;
  vmd_ponderado: number;
  vendas_30d: number;
  vendas_historico_6m?: number;
  is_esquecido_6m?: boolean;
  chave_equivalencia?: string | null;
  equivalentes_agrupados_count?: number;
  equivalentes_agrupados_nomes?: string[];
  dias_estoque_restante: number;
  status_ruptura: string;
  custo_unitario: number;
  preco_ult_compra?: number;
  variacao_ult_compra_pct?: number;
  preco_venda_vigente: number;
  margem_lucro_percentual: number;
  fornecedor_ult_compra: string;
  data_ult_compra: string;
  nf_ult_compra: string;
  qtd_bruta_7d?: number;
  qtd_equalizada_7d?: number;
  qtd_sugerida_7d: number;
  subtotal_7d: number;
  tipo_categoria: 'MEDICAMENTO' | 'PERFUMARIA';
  fornecedor_1?: string;
  preco_1?: number;
  fornecedor_2?: string;
  preco_2?: number;
  diferenca_percentual?: number;
  melhor_dia_semana?: string;
  melhor_dia_semana_index?: number;
  status_dia?: 'MELHOR_DIA' | 'EMERGENCIAL_RUPTURA' | 'RETIDO_OUTRO_DIA';
  qtd_emergencial?: number;
}

interface PortalDistribuidora {
  id: string;
  nome: string;
  url_portal: string;
  usuario: string;
  pedido_minimo: number;
  prazo_dias_padrao: number;
  uf_origem: string;
  is_mg: number | boolean;
  is_ativo: number | boolean;
  observacoes: string;
}

interface MesOrcamento {
  mes: number;
  ano: number;
  nomeMes: string;
  limite: number;
  limiteSemanalPadrao?: number;
  qtdSemanas?: number;
  totalComprometido: number;
  totalPago?: number;
  totalPendente?: number;
  saldoLivre: number;
  percentualComprometido: number;
  statusOrcamento: 'LIBERADO' | 'ALERTA' | 'ESTOURADO';
  qtdBoletos: number;
  semanas?: any[];
  semanaAtual?: any;
}

export const BelaPedPortal: React.FC<BelaPedPortalProps> = ({
  user,
  theme,
  onNavigate
}) => {
  const { addToast } = useToast();
  
  // Abas de Navegação do BelaPed
  const [activeTab, setActiveTab] = useState<'faltas' | 'cotacao' | 'orcamento' | 'relatorios' | 'pedidos' | 'simulador'>('faltas');
  const [produtoSimuladorId, setProdutoSimuladorId] = useState<number | null>(null);

  // Estados de Dados
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Orçamento & Regra Master
  const [orcamentoInfo, setOrcamentoInfo] = useState<{
    regraMaster: {
      bloquearVencimentosMesAtual: boolean;
      prazoMinimoRecomendadoDias: number;
      mensagem: string;
    };
    mesAtual: MesOrcamento | null;
    proximoMes: MesOrcamento | null;
    mesSeguinte: MesOrcamento | null;
    semanaAtual?: any;
    todosMesesAno?: MesOrcamento[];
    ano?: number;
  } | null>(null);

  // Modal de Consulta do Limite Semanal de Gastos
  const [orcamentoSemanalModalOpen, setOrcamentoSemanalModalOpen] = useState(false);

  // Controle de Transição Dinâmica: Lista de Urgência -> Lista de Compras Regulares
  const [modoListaManual, setModoListaManual] = useState<'AUTO' | 'URGENCIA' | 'COMPRAS_REGULARES'>('AUTO');

  // Faltas 7 Dias + Inteligência Anti-Ruptura e Equalizador de Volumes
  const [faltasRaw, setFaltasRaw] = useState<FaltaItem7d[]>([]);
  const [itensAvulsos, setItensAvulsos] = useState<any[]>([]);
  const [filtroCurva, setFiltroCurva] = useState<'TODAS' | 'A' | 'B' | 'C' | 'ESQUECIDOS_6M'>('TODAS');
  const [filtroCategoria, setFiltroCategoria] = useState<'TODAS' | 'MEDICAMENTO' | 'PERFUMARIA'>('TODAS');
  const [filtroDistribuidora, setFiltroDistribuidora] = useState<string>('TODAS');
  const [agruparPorDistribuidora, setAgruparPorDistribuidora] = useState<boolean>(false);
  const [buscaFalta, setBuscaFalta] = useState('');
  const [itensSelecionados, setItensSelecionados] = useState<Record<number, boolean>>({});
  const [equalizarAtivo, setEqualizarAtivo] = useState<boolean>(true);
  const [tetoMaxUnidades, setTetoMaxUnidades] = useState<number>(10);
  const [statsAntiRuptura, setStatsAntiRuptura] = useState<{
    ocultadosEquiv: number;
    agrupadosEquiv: number;
    totalEsquecidos6m: number;
  }>({ ocultadosEquiv: 0, agrupadosEquiv: 0, totalEsquecidos6m: 0 });

  // Trava Orçamentária Inteligente: Meta de Reserva/Sobra Livre Garantida no Caixa (ex: 20%)
  const [percentualSobraMeta, setPercentualSobraMeta] = useState<number>(20);

  // Modo de Reposição Inteligente:
  // 'HOJE_URGENTES': Exibe apenas o que deve ser comprado HOJE (produtos no Melhor Dia + produtos Zerados Emergenciais)
  // 'TODOS': Exibe toda a matriz semanal inclusive retidos para outros dias
  const [filtroModoReposicao, setFiltroModoReposicao] = useState<'HOJE_URGENTES' | 'TODOS'>('HOJE_URGENTES');

  // Modal de Histórico de Preços & Tendências com Séries Temporais (Recharts)
  const [modalHistoricoPreco, setModalHistoricoPreco] = useState<{
    isOpen: boolean;
    produto: FaltaItem7d | null;
  }>({ isOpen: false, produto: null });

  // Nomes amigáveis dos dias da semana
  const DIAS_SEMANA_NOMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  // Recalcula dinamicamente as quantidades sugeridas e subtotais conforme Equalizador, Teto, Melhor Dia e Ruptura Emergencial
  const { faltas, economiaEqualizador } = useMemo(() => {
    let unCortadas = 0;
    let reaisEconomizados = 0;
    const hojeDiaSemana = new Date().getDay();

    const processadas = faltasRaw.map(item => {
      const bruta = Math.max(1, Number(item.qtd_bruta_7d ?? item.qtd_sugerida_7d) || 1);
      const precoRef = Number(item.preco_1 || item.custo_unitario || 0);
      const saldoFisico = Math.max(0, Number(item.saldo) || 0);
      const vmd = Number(item.vmd_ponderado) || 0;
      const hist6m = Number(item.vendas_historico_6m ?? item.vendas_30d ?? 0);

      // Determinação do Melhor Dia de Compra (seja por distribuidora líder ou distribuição suave semanal)
      const f1Upper = (item.fornecedor_1 || '').toUpperCase();
      let melhorDiaIdx = 2; // Terça-feira (padrão líder de mercado B2B farmacêutico)
      if (f1Upper.includes('PROFARMA') || f1Upper.includes('DPC')) {
        melhorDiaIdx = 2; // Terça
      } else if (f1Upper.includes('SOTON')) {
        melhorDiaIdx = 3; // Quarta
      } else if (f1Upper.includes('DISTRIMED')) {
        melhorDiaIdx = 4; // Quinta
      } else {
        melhorDiaIdx = (item.produto_id % 4) + 2; // Varia suavemente entre Terça (2) e Sexta (5)
      }
      const melhorDiaNome = DIAS_SEMANA_NOMES[melhorDiaIdx];

      // Cálculo da quantidade equalizada padrão de 7 dias
      let equalizada = bruta;
      if (item.is_esquecido_6m || item.curva_abc === 'C') {
        equalizada = hist6m >= 6 ? 2 : 1;
      } else {
        let metaEnxuta = precoRef >= 35
          ? Math.max(1, Math.ceil(vmd * 5) - saldoFisico)
          : Math.max(1, Math.ceil(vmd * 6.5) - saldoFisico);
        if (tetoMaxUnidades > 0) {
          metaEnxuta = Math.min(metaEnxuta, tetoMaxUnidades);
        }
        equalizada = Math.max(1, metaEnxuta);
      }

      // REGRA DE OURO: Melhor Dia vs Estoque Zerado (Ruptura Emergencial)
      let statusDia: 'MELHOR_DIA' | 'EMERGENCIAL_RUPTURA' | 'RETIDO_OUTRO_DIA' = 'MELHOR_DIA';
      let qtdFinal = equalizada;
      let qtdEmergencial: number | undefined = undefined;

      if (melhorDiaIdx === hojeDiaSemana) {
        // Hoje é o melhor dia histórico/estratégico deste produto!
        statusDia = 'MELHOR_DIA';
        qtdFinal = equalizarAtivo ? equalizada : bruta;
      } else {
        // Hoje NÃO é o melhor dia:
        if (saldoFisico <= 0) {
          // EXCEÇÃO DE RUPTURA: Estoque zerado na loja!
          // Sugere quantidade emergencial reduzida (1 ou 2 un) para não faltar na venda,
          // deixando a compra do lote de 7 dias para o dia ideal mais barato.
          statusDia = 'EMERGENCIAL_RUPTURA';
          qtdEmergencial = Math.min(2, Math.max(1, equalizada));
          qtdFinal = qtdEmergencial;
        } else {
          // Ainda tem estoque físico na loja: retém para comprar no dia mais barato!
          statusDia = 'RETIDO_OUTRO_DIA';
          qtdFinal = equalizarAtivo ? equalizada : bruta;
        }
      }

      if (bruta > qtdFinal) {
        unCortadas += (bruta - qtdFinal);
        reaisEconomizados += (bruta - qtdFinal) * precoRef;
      }

      return {
        ...item,
        melhor_dia_semana: melhorDiaNome,
        melhor_dia_semana_index: melhorDiaIdx,
        status_dia: statusDia,
        qtd_emergencial: qtdEmergencial,
        qtd_bruta_7d: bruta,
        qtd_equalizada_7d: equalizada,
        qtd_sugerida_7d: qtdFinal,
        subtotal_7d: Number((qtdFinal * precoRef).toFixed(2))
      };
    });

    return {
      faltas: processadas,
      economiaEqualizador: {
        unidadesCortadas: unCortadas,
        valorEconomizado: Number(reaisEconomizados.toFixed(2))
      }
    };
  }, [faltasRaw, equalizarAtivo, tetoMaxUnidades]);

  // Portais e Cotação
  const [portais, setPortais] = useState<PortalDistribuidora[]>([]);
  const [portalModalOpen, setPortalModalOpen] = useState(false);
  const [portalEditando, setPortalEditando] = useState<Partial<PortalDistribuidora>>({
    nome: '',
    url_portal: '',
    usuario: '',
    pedido_minimo: 350,
    prazo_dias_padrao: 28,
    uf_origem: 'MG',
    is_mg: 1,
    is_ativo: 1,
    observacoes: ''
  });

  // Modal Item Avulso
  const [avulsoModalOpen, setAvulsoModalOpen] = useState(false);
  const [novoAvulso, setNovoAvulso] = useState({
    descricao: '',
    ean: '',
    quantidade: 10,
    preco_referencia: 5.0,
    motivo: 'Demanda de balcão'
  });

  // Simulação de Carrinhos Otimizados
  const [carrinhosOtimizados, setCarrinhosOtimizados] = useState<any[]>([]);
  const [resumoSimulacao, setResumoSimulacao] = useState<any>(null);
  const [sugestoesReagrupamento, setSugestoesReagrupamento] = useState<any[]>([]);
  const [simulando, setSimulando] = useState(false);

  // Relatório de Preços
  const [relatorioPrecos, setRelatorioPrecos] = useState<any[]>([]);

  // Cotação ao Vivo com Robô
  const [cotandoAoVivo, setCotandoAoVivo] = useState(false);
  const [statusCotacao, setStatusCotacao] = useState<{
    emAndamento: boolean;
    fornecedor: string;
    total: number;
    atual: number;
    encontrados: number;
    ultimoItem: string;
  } | null>(null);

  // Montagem Robótica de Carrinho na Soton
  const [montandoCarrinhoSoton, setMontandoCarrinhoSoton] = useState(false);
  const [statusCarrinhoSoton, setStatusCarrinhoSoton] = useState<{
    emAndamento: boolean;
    total: number;
    atual: number;
    sucessos: number;
    erros: number;
    ultimoItem: string;
  } | null>(null);

  // Importação Robótica na Modal da Distrimed
  const [importandoDistrimed, setImportandoDistrimed] = useState(false);
  const [statusImportDistrimed, setStatusImportDistrimed] = useState<{
    emAndamento: boolean;
    mensagem: string;
    sucesso: boolean;
  } | null>(null);

  // Registro de horário da última sincronização para feedback visual
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('');

  // Carrega todos os dados iniciais
  const carregarDados = async () => {
    try {
      setRefreshing(true);

      const [resOrc, resFaltas, resPortais, resRel] = await Promise.all([
        fetch('/api/belaped/orcamento-boletos'),
        fetch(`/api/belaped/faltas-7d?equalizar=${equalizarAtivo ? '1' : '0'}&teto_max=${tetoMaxUnidades}`),
        fetch('/api/belaped/portais'),
        fetch('/api/belaped/relatorio-precos')
      ]);

      if (resOrc.ok) {
        const dataOrc = await resOrc.json();
        setOrcamentoInfo(dataOrc);
      }

      if (resFaltas.ok) {
        const dataFaltas = await resFaltas.json();
        setFaltasRaw(dataFaltas.items || []);
        setItensAvulsos(dataFaltas.itens_avulsos || []);
        setStatsAntiRuptura({
          ocultadosEquiv: Number(dataFaltas.ocultados_equivalente_com_estoque) || 0,
          agrupadosEquiv: Number(dataFaltas.agrupados_equivalencia) || 0,
          totalEsquecidos6m: Number(dataFaltas.total_esquecidos_6m) || 0
        });
        
        // Preserva seleção anterior se já existir, ou seleciona todos inicialmente
        setItensSelecionados(prev => {
          if (Object.keys(prev).length > 0) return prev;
          const selMap: Record<number, boolean> = {};
          (dataFaltas.items || []).forEach((item: FaltaItem7d) => {
            selMap[item.produto_id] = true;
          });
          return selMap;
        });
      }

      if (resPortais.ok) {
        const dataPortais = await resPortais.json();
        setPortais(dataPortais.portais || []);
      }

      if (resRel.ok) {
        const dataRel = await resRel.json();
        setRelatorioPrecos(dataRel.produtos || []);
      }

      setUltimaAtualizacao(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    } catch (e: any) {
      addToast('Erro ao sincronizar dados do BelaPed: ' + e.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Registra no histórico o carrinho da distribuidora filtrada (NÃO finaliza compra em portal algum)
  const registrarPedidoDaDistribuidora = async () => {
    if (filtroDistribuidora === 'TODAS') {
      addToast('Selecione o card de uma distribuidora para registrar o pedido.', 'info');
      return;
    }
    const itens = faltas
      .filter(f => f.fornecedor_1 === filtroDistribuidora && itensSelecionados[f.produto_id])
      .map(f => ({ ean: f.ean, descricao: f.descricao, quantidade: f.qtd_sugerida_7d, preco: f.preco_1 }));
    if (itens.length === 0) {
      addToast('Nenhum item selecionado para essa distribuidora.', 'info');
      return;
    }
    try {
      const r = await fetch('/api/belaped/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distribuidora: filtroDistribuidora, itens })
      });
      if (!r.ok) throw new Error('Falha ao registrar');
      addToast(`Pedido da ${filtroDistribuidora} registrado como "Carrinho gerado". Finalize manualmente no portal.`, 'success');
      setActiveTab('pedidos');
    } catch (e: any) {
      addToast('Erro ao registrar pedido: ' + e.message, 'error');
    }
  };

  // Sincronização manual com ERP Digifarma + recarga da lista de produtos
  const handleSincronizarManual = async () => {
    if (refreshing) return;
    setRefreshing(true);
    addToast('Sincronizando saldos, correções e compras com o Digifarma...', 'info');
    const t0 = Date.now();
    try {
      await fetch('/api/belaped/sincronizar-estoque', { method: 'POST' }).catch(() => {});
      await carregarDados();
      const restante = Math.max(0, 600 - (Date.now() - t0));
      if (restante > 0) await new Promise(r => setTimeout(r, restante));
      addToast('Lista de produtos e saldos atualizados com sucesso!', 'success');
    } catch (err: any) {
      addToast('Erro ao sincronizar dados: ' + err.message, 'error');
    } finally {
      setRefreshing(false);
    }
  };

  // Atualização automática da lista de produtos de 15 em 15 minutos (900.000 ms)
  useEffect(() => {
    carregarDados();
    const timer15m = setInterval(async () => {
      try {
        await fetch('/api/belaped/sincronizar-estoque', { method: 'POST' }).catch(() => {});
        await carregarDados();
      } catch (e) {}
    }, 15 * 60 * 1000);
    return () => clearInterval(timer15m);
  }, []);

  // Contagem analítica de urgências críticas (estoque físico zerado ou cobertura zerada)
  const totalUrgenciasCriticas = useMemo(() => {
    return faltas.filter(f => f.saldo <= 0 || f.dias_estoque_restante <= 0).length;
  }, [faltas]);

  // Transição Inteligente: Quando não houver mais urgências críticas (0 itens zerados), a lista vira Lista de Compras Regulares
  const isModoComprasRegulares = useMemo(() => {
    if (modoListaManual === 'COMPRAS_REGULARES') return true;
    if (modoListaManual === 'URGENCIA') return false;
    return totalUrgenciasCriticas === 0;
  }, [modoListaManual, totalUrgenciasCriticas]);

  // Contagem analítica dos status de dia para feedback visual
  const statsModoDia = useMemo(() => {
    let melhorDia = 0;
    let emergencial = 0;
    let retidos = 0;
    faltas.forEach(f => {
      if (f.status_dia === 'MELHOR_DIA') melhorDia++;
      else if (f.status_dia === 'EMERGENCIAL_RUPTURA') emergencial++;
      else if (f.status_dia === 'RETIDO_OUTRO_DIA') retidos++;
    });
    return { melhorDia, emergencial, retidos };
  }, [faltas]);

  // Filtra itens base (por modo urgência vs compras regulares, modo hoje vs todos, curva, esquecidos 6m, categoria e busca)
  const faltasBaseFiltradas = useMemo(() => {
    return faltas.filter(f => {
      // Se estiver forçado no modo de urgência estrita, exibe apenas os produtos que têm urgência real (saldo <= 0 ou dias <= 0)
      if (modoListaManual === 'URGENCIA' && f.saldo > 0 && f.dias_estoque_restante > 0) {
        return false;
      }

      // No modo padrão 'HOJE_URGENTES', retém produtos cujo melhor dia é outro dia e que ainda têm estoque físico
      if (filtroModoReposicao === 'HOJE_URGENTES' && f.status_dia === 'RETIDO_OUTRO_DIA') {
        return false;
      }
      if (filtroCurva === 'ESQUECIDOS_6M') {
        if (!f.is_esquecido_6m) return false;
      } else if (filtroCurva !== 'TODAS' && f.curva_abc !== filtroCurva) {
        return false;
      }
      if (filtroCategoria !== 'TODAS' && f.tipo_categoria !== filtroCategoria) return false;
      if (buscaFalta) {
        const termo = buscaFalta.toLowerCase();
        const bateNome = f.descricao.toLowerCase().includes(termo);
        const bateEan = f.ean && f.ean.includes(termo);
        if (!bateNome && !bateEan) return false;
      }
      return true;
    });
  }, [faltas, modoListaManual, filtroModoReposicao, filtroCurva, filtroCategoria, buscaFalta]);

  // Calcula os totais consolidados por empresa/distribuidora (1º Colocado)
  const totaisPorDistribuidora = useMemo(() => {
    const minimosPadrao: Record<string, number> = {
      'DISTRIMED': 350,
      'PROFARMA': 400,
      'SOTON FARMA': 300,
      'DPC DISTRIBUIDORA': 300
    };
    portais.forEach(p => {
      if (p.nome) minimosPadrao[p.nome.toUpperCase()] = Number(p.pedido_minimo) || 300;
    });

    const grupos: Record<string, {
      distribuidora: string;
      isEmpresaReal: boolean;
      qtdProdutos: number;
      qtdUnidades: number;
      valorTotal: number;
      qtdSelecionados: number;
      valorSelecionado: number;
      pedidoMinimo: number;
      atingiuMinimo: boolean;
      faltaParaMinimo: number;
      itens: FaltaItem7d[];
    }> = {};

    faltasBaseFiltradas.forEach(item => {
      const f1 = item.fornecedor_1 || 'Não Cotado';
      const isReal = f1 !== 'Não Cotado' && f1 !== 'Sem Estoque (Portais)';
      const chave = isReal ? f1.toUpperCase() : (f1 === 'Sem Estoque (Portais)' ? 'SEM ESTOQUE (4 PORTAIS)' : 'AGUARDANDO ROBÔ');

      if (!grupos[chave]) {
        const min = isReal ? (minimosPadrao[chave] || 300) : 0;
        grupos[chave] = {
          distribuidora: chave,
          isEmpresaReal: isReal,
          qtdProdutos: 0,
          qtdUnidades: 0,
          valorTotal: 0,
          qtdSelecionados: 0,
          valorSelecionado: 0,
          pedidoMinimo: min,
          atingiuMinimo: false,
          faltaParaMinimo: min,
          itens: []
        };
      }

      const g = grupos[chave];
      g.qtdProdutos += 1;
      g.qtdUnidades += item.qtd_sugerida_7d;
      g.valorTotal = Number((g.valorTotal + item.subtotal_7d).toFixed(2));
      if (itensSelecionados[item.produto_id]) {
        g.qtdSelecionados += 1;
        g.valorSelecionado = Number((g.valorSelecionado + item.subtotal_7d).toFixed(2));
      }
      g.itens.push(item);
    });

    Object.values(grupos).forEach(g => {
      if (g.pedidoMinimo > 0) {
        g.atingiuMinimo = g.valorTotal >= g.pedidoMinimo;
        g.faltaParaMinimo = g.atingiuMinimo ? 0 : Number((g.pedidoMinimo - g.valorTotal).toFixed(2));
      } else {
        g.atingiuMinimo = true;
        g.faltaParaMinimo = 0;
      }
    });

    // Retorna dinamicamente apenas distribuidoras/grupos que possuem itens (> 0)
    return Object.values(grupos)
      .filter(g => g.qtdProdutos > 0)
      .sort((a, b) => {
        if (a.isEmpresaReal && !b.isEmpresaReal) return -1;
        if (!a.isEmpresaReal && b.isEmpresaReal) return 1;
        return b.valorTotal - a.valorTotal;
      });
  }, [faltasBaseFiltradas, portais, itensSelecionados]);

  // Estado de ordenação por coluna da tabela
  const [ordenarColuna, setOrdenarColuna] = useState<keyof FaltaItem7d | null>(null);
  const [ordenarDirecao, setOrdenarDirecao] = useState<'asc' | 'desc'>('asc');

  const handleOrdenarColuna = (coluna: keyof FaltaItem7d) => {
    if (ordenarColuna === coluna) {
      setOrdenarDirecao(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdenarColuna(coluna);
      // Para colunas numéricas de valor/quantidade, primeira clicada já ordena do maior para o menor (desc)
      const isNumericoDesc = ['qtd_sugerida_7d', 'preco_ult_compra', 'preco_1', 'preco_2', 'margem_lucro_percentual', 'subtotal_7d'].includes(coluna as string);
      setOrdenarDirecao(isNumericoDesc ? 'desc' : 'asc');
    }
    setPaginaAtual(1);
  };

  const ordenarListaFaltas = (lista: FaltaItem7d[]) => {
    if (!ordenarColuna) return lista;
    return [...lista].sort((a, b) => {
      const valA = a[ordenarColuna];
      const valB = b[ordenarColuna];
      if (typeof valA === 'number' && typeof valB === 'number') {
        return ordenarDirecao === 'asc' ? valA - valB : valB - valA;
      }
      const strA = String(valA ?? '').toUpperCase();
      const strB = String(valB ?? '').toUpperCase();
      const cmp = strA.localeCompare(strB, 'pt-BR', { numeric: true });
      return ordenarDirecao === 'asc' ? cmp : -cmp;
    });
  };

  // Filtra e ordena itens de falta (aplicando também o filtro de distribuidora clicada)
  const faltasFiltradas = useMemo(() => {
    const base = filtroDistribuidora === 'TODAS'
      ? faltasBaseFiltradas
      : faltasBaseFiltradas.filter(item => {
          const f1 = item.fornecedor_1 || 'Não Cotado';
          const isReal = f1 !== 'Não Cotado' && f1 !== 'Sem Estoque (Portais)';
          const chave = isReal ? f1.toUpperCase() : (f1 === 'Sem Estoque (Portais)' ? 'SEM ESTOQUE (4 PORTAIS)' : 'AGUARDANDO ROBÔ');
          return chave === filtroDistribuidora;
        });
    return ordenarListaFaltas(base);
  }, [faltasBaseFiltradas, filtroDistribuidora, ordenarColuna, ordenarDirecao]);

  // Paginação da Tabela de Faltas
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(20);

  // Reseta para a primeira página ao alterar filtros ou busca
  useEffect(() => {
    setPaginaAtual(1);
  }, [filtroCurva, filtroCategoria, filtroDistribuidora, buscaFalta, itensPorPagina]);

  const totalPaginas = Math.max(1, Math.ceil(faltasFiltradas.length / itensPorPagina));

  // Itens fatiados para a página atual
  const itensPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    return faltasFiltradas.slice(inicio, inicio + itensPorPagina);
  }, [faltasFiltradas, paginaAtual, itensPorPagina]);

  // Totais dos itens selecionados
  const totaisSelecionados = useMemo(() => {
    let qtdItens = 0;
    let valorTotal = 0;
    faltasFiltradas.forEach(f => {
      if (itensSelecionados[f.produto_id]) {
        qtdItens++;
        valorTotal += f.subtotal_7d;
      }
    });
    return { qtdItens, valorTotal };
  }, [faltasFiltradas, itensSelecionados]);

  // Análise da Trava Orçamentária com Margem de Sobra Livre Garantida
  const analiseOrcamentoSobra = useMemo(() => {
    const saldoLivreMes = Math.max(0, orcamentoInfo?.mesAtual?.saldoLivre ?? 0);
    const reservaSeguranca = Number((saldoLivreMes * (percentualSobraMeta / 100)).toFixed(2));
    const tetoComprasDisponivel = Math.max(0, Number((saldoLivreMes - reservaSeguranca).toFixed(2)));
    const valorSelecionado = totaisSelecionados.valorTotal;
    const sobraProjetada = Number((saldoLivreMes - valorSelecionado).toFixed(2));
    const percentualSobraReal = saldoLivreMes > 0 ? Number(((sobraProjetada / saldoLivreMes) * 100).toFixed(1)) : 0;
    const estaDentroDoTeto = valorSelecionado <= tetoComprasDisponivel;
    const deficitTeto = estaDentroDoTeto ? 0 : Number((valorSelecionado - tetoComprasDisponivel).toFixed(2));

    return {
      saldoLivreMes,
      reservaSeguranca,
      tetoComprasDisponivel,
      valorSelecionado,
      sobraProjetada,
      percentualSobraReal,
      estaDentroDoTeto,
      deficitTeto
    };
  }, [orcamentoInfo, percentualSobraMeta, totaisSelecionados.valorTotal]);

  // Algoritmo de Equalização e Enquadramento Orçamentário com Sobra Garantida
  const handleEqualizarOrcamentoComSobra = () => {
    const teto = analiseOrcamentoSobra.tetoComprasDisponivel;
    if (teto <= 0) {
      addToast('Saldo livre do mês insuficiente para novas compras com a margem de sobra selecionada.', 'warning');
      return;
    }

    // Ordenação estrita por urgência de abastecimento:
    // 1º: Ruptura Imediata / Estoque Zerado (emergência crítica na farmácia)
    // 2º: Curva A
    // 3º: Curva B
    // 4º: Curva C / Esquecidos
    const itensPriorizados = [...faltasFiltradas].sort((a, b) => {
      const aZerado = a.saldo <= 0 ? 1 : 0;
      const bZerado = b.saldo <= 0 ? 1 : 0;
      if (aZerado !== bZerado) return bZerado - aZerado;

      const pesoCurva: Record<string, number> = { A: 3, B: 2, C: 1 };
      const pA = pesoCurva[a.curva_abc] || 0;
      const pB = pesoCurva[b.curva_abc] || 0;
      if (pA !== pB) return pB - pA;

      return b.vmd_ponderado - a.vmd_ponderado;
    });

    let acumulado = 0;
    const novoSel: Record<number, boolean> = {};
    let selecionadosCount = 0;

    itensPriorizados.forEach(it => {
      if (acumulado + it.subtotal_7d <= teto) {
        novoSel[it.produto_id] = true;
        acumulado += it.subtotal_7d;
        selecionadosCount++;
      }
    });

    setItensSelecionados(novoSel);
    addToast(
      `Seleção equalizada ao orçamento! ${selecionadosCount} produtos alocados (R$ ${acumulado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}), garantindo R$ ${analiseOrcamentoSobra.reservaSeguranca.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${percentualSobraMeta}%) de sobra no caixa.`,
      'success'
    );
  };

  // Toggle de seleção de todos (filtrados)
  const handleToggleTodos = () => {
    const todosMarcados = faltasFiltradas.length > 0 && faltasFiltradas.every(f => itensSelecionados[f.produto_id]);
    const novoMap = { ...itensSelecionados };
    faltasFiltradas.forEach(f => {
      novoMap[f.produto_id] = !todosMarcados;
    });
    setItensSelecionados(novoMap);
  };

  // Salvar Portal
  const handleSalvarPortal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/belaped/portais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(portalEditando)
      });
      const data = await res.json();
      if (data.success) {
        addToast('Portal da distribuidora salvo!', 'success');
        setPortalModalOpen(false);
        carregarDados();
      } else {
        addToast(data.error || 'Erro ao salvar portal', 'error');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  // Salvar Item Avulso
  const handleSalvarAvulso = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/belaped/itens-avulsos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...novoAvulso, usuario: user.name })
      });
      const data = await res.json();
      if (data.success) {
        addToast('Item avulso inserido na cotação!', 'success');
        setAvulsoModalOpen(false);
        setNovoAvulso({ descricao: '', ean: '', quantidade: 10, preco_referencia: 5.0, motivo: 'Demanda de balcão' });
        carregarDados();
      } else {
        addToast(data.error || 'Erro ao adicionar item avulso', 'error');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  // Remover Item Avulso
  const handleRemoverAvulso = async (id: string) => {
    try {
      await fetch(`/api/belaped/itens-avulsos/${id}`, { method: 'DELETE' });
      addToast('Item avulso removido', 'info');
      carregarDados();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  // Executar Simulação de Carrinhos Otimizados
  const handleExecutarSimulacao = async () => {
    try {
      setSimulando(true);
      const selecionados = faltasFiltradas.filter(f => itensSelecionados[f.produto_id]);

      if (selecionados.length === 0) {
        addToast('Selecione pelo menos um produto para cotar.', 'warning');
        return;
      }

      const cotacoesSimuladas: Record<string, any[]> = {};
      const portaisAtivos = portais.filter(p => p.is_ativo);

      selecionados.forEach(item => {
        const eanKey = item.ean || String(item.produto_id);
        const precos = [];
        const fornecedorHistorico = item.fornecedor_ult_compra.toUpperCase();
        
        portaisAtivos.forEach(p => {
          const isHistorico = fornecedorHistorico.includes(p.nome);
          const fator = isHistorico ? 0.98 : (1 + (Math.random() * 0.06 - 0.03));
          const preco = Number((item.custo_unitario * fator).toFixed(2));
          precos.push({
            distribuidora: p.nome,
            preco: preco > 0 ? preco : item.custo_unitario
          });
        });

        cotacoesSimuladas[eanKey] = precos;
      });

      const res = await fetch('/api/belaped/simular-otimizacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: selecionados,
          cotacoesPorDistribuidora: cotacoesSimuladas
        })
      });

      if (res.ok) {
        const data = await res.json();
        setCarrinhosOtimizados(data.carrinhos || []);
        setResumoSimulacao(data.resumo || null);
        setSugestoesReagrupamento(data.sugestoesReagrupamento || []);
        setActiveTab('cotacao');
        addToast('Otimização concluída com sucesso!', 'success');
      }
    } catch (e: any) {
      addToast('Erro na simulação: ' + e.message, 'error');
    } finally {
      setSimulando(false);
    }
  };

  // Abrir Navegador no Portal da Distribuidora (Finalizar Compra)
  const handleAbrirNavegadorCarrinho = (carrinho: any) => {
    const portal = portais.find(p => p.nome.toUpperCase() === carrinho.distribuidora.toUpperCase());
    const url = portal?.url_portal || 'https://pedido.profarma.com.br/?callbackUrl=%2Fnovo-pedido';
    window.open(url, '_blank');
    addToast(`Redirecionando para ${carrinho.distribuidora}. O carrinho foi montado com ${carrinho.itens.length} itens (Total R$ ${carrinho.total.toFixed(2)})!`, 'success');
  };

  // Iniciar Cotação ao Vivo com o Robô Puppeteer (Profarma / DPC / Soton / Distrimed / Todas)
  const handleIniciarCotacaoAoVivo = async (fornecedor: 'PROFARMA' | 'DPC' | 'SOTON' | 'DISTRIMED' | 'TODOS' = 'TODOS') => {
    try {
      setCotandoAoVivo(true);

      // Prioriza os itens "Aguardando Robô" (Não Cotado) da página atual e depois do restante da lista
      const naoCotadosPagina = itensPaginados
        .filter(s => !s.fornecedor_1 || s.fornecedor_1 === 'Não Cotado')
        .map(s => s.ean)
        .filter(e => e && e.length >= 7);

      const todosNaoCotados = faltasFiltradas
        .filter(s => (!s.fornecedor_1 || s.fornecedor_1 === 'Não Cotado') && s.ean && s.ean.length >= 7)
        .map(s => s.ean)
        .filter(e => !naoCotadosPagina.includes(e));

      const selecionadosRestantes = faltasFiltradas
        .filter(f => itensSelecionados[f.produto_id] && f.ean && f.ean.length >= 7)
        .map(s => s.ean)
        .filter(e => !naoCotadosPagina.includes(e) && !todosNaoCotados.includes(e));

      const eansParaCotar = [...naoCotadosPagina, ...todosNaoCotados, ...selecionadosRestantes].slice(0, 40);

      const nomeExibicao = fornecedor === 'TODOS' ? '4 Portais (Profarma, DPC, Soton e Distrimed)' : fornecedor;

      // Resposta visual IMEDIATA (0ms): Mostra o banner e status instantaneamente
      setStatusCotacao({
        emAndamento: true,
        fornecedor: nomeExibicao,
        total: eansParaCotar.length || 40,
        atual: 0,
        encontrados: 0,
        ultimoItem: 'Conectando aos navegadores e portais...'
      });

      addToast(`Robô de cotação iniciado para ${nomeExibicao}!`, 'info');

      const res = await fetch('/api/belaped/cotar-ao-vivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedor,
          limite: 40,
          eans: eansParaCotar.length > 0 ? eansParaCotar : undefined
        })
      });

      const data = await res.json();
      if (!data.success) {
        addToast(data.error || 'Erro ao iniciar cotação', 'error');
        setCotandoAoVivo(false);
        setStatusCotacao(null);
        return;
      }

      if (data.status) {
        setStatusCotacao(data.status);
      }

      addToast(data.message || `Robô pesquisando preços nos portais!`, 'success');

      let ultimoEncontrados = 0;

      // Monitora o progresso em segundo plano a cada 2s e atualiza a tabela ao vivo conforme preços chegam
      const verificarProgresso = async () => {
        try {
          const stRes = await fetch('/api/belaped/status-cotacao');
          const stData = await stRes.json();
          if (stData.success && stData.status) {
            setStatusCotacao(stData.status);
            if (stData.status.encontrados > ultimoEncontrados) {
              ultimoEncontrados = stData.status.encontrados;
              carregarDados();
            }
            if (!stData.status.emAndamento) {
              clearInterval(timer);
              setCotandoAoVivo(false);
              addToast(`Cotação concluída! ${stData.status.encontrados} preços ao vivo capturados!`, 'success');
              carregarDados();
            }
          }
        } catch (e) {
          clearInterval(timer);
          setCotandoAoVivo(false);
        }
      };

      setTimeout(verificarProgresso, 800);
      const timer = setInterval(verificarProgresso, 2500);

    } catch (err: any) {
      addToast('Erro na cotação: ' + err.message, 'error');
      setCotandoAoVivo(false);
      setStatusCotacao(null);
    }
  };

  // Montar Carrinho Roboticamente na Soton Farma (Produto a Produto)
  const handleMontarCarrinhoSoton = async () => {
    try {
      setMontandoCarrinhoSoton(true);

      // Filtra itens selecionados onde a Soton é o 1º colocado (ou todos os selecionados se o usuário desejar)
      const selecionados = faltasFiltradas.filter(f => itensSelecionados[f.produto_id]);
      const itensSoton = selecionados
        .filter(f => (f.fornecedor_1 || '').toUpperCase().includes('SOTON') && f.ean)
        .map(f => ({
          ean: f.ean,
          quantidade: f.qtd_sugerida_7d,
          descricao: f.descricao
        }));

      const res = await fetch('/api/belaped/montar-carrinho-soton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: itensSoton.length > 0 ? itensSoton : undefined
        })
      });

      const data = await res.json();
      if (!data.success) {
        addToast(data.message || 'Erro ao iniciar montagem do carrinho', 'error');
        setMontandoCarrinhoSoton(false);
        return;
      }

      addToast(data.message || 'Robô conectando na Soton para adicionar os produtos no carrinho!', 'success');

      // Polling do status da montagem de carrinho
      const timerSoton = setInterval(async () => {
        try {
          const stRes = await fetch('/api/belaped/status-carrinho-soton');
          const stData = await stRes.json();
          if (stData.success && stData.status) {
            setStatusCarrinhoSoton(stData.status);
            if (!stData.status.emAndamento) {
              clearInterval(timerSoton);
              setMontandoCarrinhoSoton(false);
              addToast(`Carrinho montado na Soton! ${stData.status.sucessos} itens adicionados com sucesso!`, 'success');
            }
          }
        } catch (e) {
          clearInterval(timerSoton);
          setMontandoCarrinhoSoton(false);
        }
      }, 2500);

    } catch (err: any) {
      addToast('Erro ao acionar robô Soton: ' + err.message, 'error');
      setMontandoCarrinhoSoton(false);
    }
  };

  // Baixar Planilha Pronta no Modelo do Pedido Profarma (Codigo/EAN e Quantidade)
  const handleExportarPlanilhaProfarma = () => {
    window.open('/api/belaped/exportar-planilha-profarma', '_blank');
    addToast('Download da planilha de pedido Profarma gerado com sucesso!', 'info');
  };

  // Baixar Planilha Pronta no Modelo do Pedido DPC (codigo ou ean e quantidade)
  const handleExportarPlanilhaDpc = () => {
    window.open('/api/belaped/exportar-planilha-dpc', '_blank');
    addToast('Download da planilha de pedido DPC gerado com sucesso!', 'info');
  };

  // Baixar Planilha no Modelo da Distrimed (EAN;Quantidade)
  const handleExportarPlanilhaDistrimed = () => {
    window.open('/api/belaped/exportar-planilha-distrimed', '_blank');
    addToast('Download da planilha de pedido Distrimed gerado com sucesso!', 'info');
  };

  // Importar Carrinho Automaticamente na Modal da Distrimed via Robô Puppeteer
  const handleImportarCarrinhoDistrimed = async () => {
    try {
      setImportandoDistrimed(true);
      const res = await fetch('/api/belaped/importar-carrinho-distrimed', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        addToast(data.message || 'Erro ao iniciar robô Distrimed', 'error');
        setImportandoDistrimed(false);
        return;
      }

      addToast('Robô Distrimed iniciado! Conectando para importar via modal...', 'success');

      // Polling do status da importação
      const timerDist = setInterval(async () => {
        try {
          const stRes = await fetch('/api/belaped/status-carrinho-distrimed');
          const stData = await stRes.json();
          if (stData.success && stData.status) {
            setStatusImportDistrimed(stData.status);
            if (!stData.status.emAndamento) {
              clearInterval(timerDist);
              setImportandoDistrimed(false);
              if (stData.status.sucesso) {
                addToast('Pedido importado com sucesso na modal da Distrimed!', 'success');
              } else {
                addToast(stData.status.mensagem || 'Falha na importação Distrimed', 'error');
              }
            }
          }
        } catch (e) {
          clearInterval(timerDist);
          setImportandoDistrimed(false);
        }
      }, 2500);

    } catch (err: any) {
      addToast('Erro ao importar na Distrimed: ' + err.message, 'error');
      setImportandoDistrimed(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen w-screen overflow-hidden bg-[#070b14] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* ─── TOPO STANDALONE EXECUTIVO DO BELAPED ───────────────────────────── */}
      <header className="h-16 px-4 md:px-8 bg-[#0b1222] border-b border-cyan-900/40 flex items-center justify-between shrink-0 shadow-lg relative z-20">
        
        {/* Esquerda: Botão Voltar ao BelaFarma e Marca BelaPed */}
        <div className="flex items-center gap-4">
          {onNavigate && (
            <button
              onClick={() => onNavigate('dashboard')}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-bold transition-all shadow-sm cursor-pointer group"
              title="Voltar para a operação do BelaFarma"
            >
              <ArrowLeft className="w-4 h-4 text-cyan-400 group-hover:-translate-x-1 transition-transform" />
              <span>Voltar ao BelaFarma</span>
            </button>
          )}

          <div className="h-6 w-px bg-slate-800 hidden sm:block"></div>

          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl shadow-md text-white">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-300 bg-clip-text text-transparent uppercase">
                  BelaPed
                </span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/80 tracking-wider">
                  B2B Procurement Suite
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium hidden md:block">
                Cotações Multi-Portais • Regime Vendeu/Comprou (7d) • Trava de Orçamento
              </p>
            </div>
          </div>
        </div>

        {/* Direita: Status dos Portais, Usuário e Botão Atualizar */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] font-bold text-slate-300">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>Portais Ativos: <b>{portais.filter(p => p.is_ativo).length}</b></span>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] font-bold text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{user.name}</span>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-950/50 border border-cyan-800/60 text-[11px] font-bold text-cyan-300" title="A lista de produtos e saldos do ERP é atualizada automaticamente a cada 15 minutos">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Auto-Sync: 15 min</span>
            {ultimaAtualizacao && <span className="text-slate-400">• Últ: {ultimaAtualizacao}</span>}
          </div>

          <button
            onClick={handleSincronizarManual}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black transition-all shadow-md cursor-pointer disabled:opacity-50"
            title="Forçar sincronização imediata de estoque, correções e compras com o ERP Digifarma"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{refreshing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>
        </div>
      </header>

      {/* ─── CORPO PRINCIPAL COM SCROLL INTERNO ──────────────────────────────── */}
      {/* ─── MENU LATERAL EXCLUSIVO DO BELAPED + CORPO ───────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
      <aside className="w-64 shrink-0 bg-[#0b1222] border-r border-slate-800/80 flex flex-col overflow-y-auto custom-scrollbar">
        <nav className="p-3 space-y-1.5">
          <span className="px-2 text-[10px] font-black uppercase tracking-widest text-cyan-400/80 block mb-1">
            Módulos Exclusivos BelaPed
          </span>
          {([
            { id: 'faltas', label: '1. Reposição 1 Semana', icon: <Layers className="w-4 h-4 text-cyan-300" />, badge: faltas.length },
            { id: 'cotacao', label: '2. Portais & Carrinho', icon: <Globe className="w-4 h-4 text-blue-400" />, badge: carrinhosOtimizados.length },
            { id: 'pedidos', label: '3. Meus Pedidos & NF', icon: <ShoppingCart className="w-4 h-4 text-amber-400" />, badge: 0 },
            { id: 'orcamento', label: '4. Radar de Orçamento', icon: <DollarSign className="w-4 h-4 text-emerald-400" />, badge: 0 },
            { id: 'relatorios', label: '5. Relatórios & Preços', icon: <BarChart3 className="w-4 h-4 text-purple-400" />, badge: 0 },
            { id: 'simulador', label: '6. Simulador de Giro', icon: <Calendar className="w-4 h-4 text-teal-400" />, badge: 0 }
          ] as const).map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                activeTab === item.id
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/30 border border-cyan-400/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              {item.icon}
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-cyan-950 text-cyan-200 border border-cyan-800">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Filtro Rápido no Menu Lateral: Melhor Preço por Distribuidora */}
        <div className="p-3 border-t border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
              Melhor Preço por Empresa
            </span>
            <Filter className="w-3 h-3 text-emerald-400" />
          </div>
          <button
            onClick={() => {
              setActiveTab('faltas');
              setFiltroDistribuidora('TODAS');
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-black cursor-pointer border transition-all ${
              activeTab === 'faltas' && filtroDistribuidora === 'TODAS'
                ? 'bg-cyan-950/70 border-cyan-500 text-cyan-200 shadow-sm'
                : 'bg-[#09101f] border-slate-800 text-slate-300 hover:border-slate-600'
            }`}
          >
            <span>Todas Distribuidoras</span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-900/60 text-[10px] text-cyan-200">{faltasBaseFiltradas.length} it.</span>
          </button>

          {totaisPorDistribuidora
            .filter(grp => grp.isEmpresaReal && grp.qtdProdutos > 0)
            .map(grp => {
              const nomeDist = grp.distribuidora;
              const ativo = activeTab === 'faltas' && filtroDistribuidora === nomeDist;
              return (
                <button
                  key={nomeDist}
                  onClick={() => {
                    setActiveTab('faltas');
                    setFiltroDistribuidora(filtroDistribuidora === nomeDist ? 'TODAS' : nomeDist);
                  }}
                  title={`Filtrar produtos onde ${nomeDist} tem o 1º melhor preço`}
                  className={`w-full flex flex-col gap-0.5 px-3 py-2 rounded-xl text-left cursor-pointer border transition-all ${
                    ativo
                      ? 'bg-emerald-950/70 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500/40 shadow-md'
                      : 'bg-[#09101f] border-slate-800 text-slate-300 hover:border-emerald-700/60'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-1">
                    <span className="text-xs font-black truncate uppercase text-emerald-300">{nomeDist}</span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-black text-white">
                      {grp.qtdProdutos} it.
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-400">
                    Total: <b className="text-white">R$ {grp.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                  </span>
                </button>
              );
            })}
        </div>

        {/* Ações Rápidas Exclusivas do Ped no Menu Lateral */}
        <div className="p-3 border-t border-slate-800/80 space-y-2 mt-auto">
          <span className="px-2 text-[10px] font-black uppercase tracking-widest text-slate-400 block">
            Ações Rápidas do Ped
          </span>
          <button
            onClick={() => {
              setActiveTab('faltas');
              setAgruparPorDistribuidora(prev => !prev);
            }}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-black uppercase cursor-pointer border transition-all ${
              agruparPorDistribuidora
                ? 'bg-cyan-600 text-white border-cyan-400'
                : 'bg-[#09101f] text-cyan-300 border-cyan-800/70 hover:border-cyan-500'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{agruparPorDistribuidora ? '✓ Agrupado por Empresa' : 'Agrupar por Empresa'}</span>
          </button>
          <button
            onClick={() => setAvulsoModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-black uppercase cursor-pointer border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span>Adicionar Item Avulso</span>
          </button>
        </div>
      </aside>


      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-5 bg-gradient-to-b from-[#070b14] via-[#09101f] to-[#070b14]">
        
        {/* ─── BARRA DA REGRA MASTER: ORÇAMENTO & VENCIMENTO DE BOLETOS ─────────── */}
        {orcamentoInfo && (
          <div className={`p-4 rounded-2xl border shadow-lg backdrop-blur-md transition-all ${
            orcamentoInfo.regraMaster.bloquearVencimentosMesAtual
              ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
              : orcamentoInfo.mesAtual?.statusOrcamento === 'ALERTA'
              ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
              : 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
          }`}>
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-[#0b1222] border border-slate-800 shadow-md shrink-0 mt-0.5">
                  {orcamentoInfo.regraMaster.bloquearVencimentosMesAtual ? (
                    <AlertTriangle className="w-5 h-5 text-rose-400 animate-pulse" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#0b1222] border border-slate-800 text-cyan-400">
                      REGRA MASTER • CONTROLE DE FLUXO
                    </span>
                    <span className="text-xs font-bold text-white capitalize">
                      Mês Atual ({orcamentoInfo.mesAtual?.nomeMes}): {orcamentoInfo.mesAtual?.statusOrcamento}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-300 mt-1 leading-relaxed">
                    {orcamentoInfo.regraMaster.mensagem}
                  </p>
                </div>
              </div>

              {/* Indicadores Reais de Saldo dos 3 Meses (Sincronizados com Painel de Orçamentos) */}
              <div className="flex flex-wrap items-center gap-4 bg-[#0b1222] px-4 py-2.5 rounded-xl shadow-md border border-slate-800 shrink-0">
                {/* Mês Atual */}
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    {(orcamentoInfo.mesAtual?.saldoLivre || 0) < 0 ? `Excedente ${orcamentoInfo.mesAtual?.nomeMes}` : `Saldo ${orcamentoInfo.mesAtual?.nomeMes}`}
                  </span>
                  <span className={`text-sm font-black block ${
                    (orcamentoInfo.mesAtual?.saldoLivre || 0) < 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {(orcamentoInfo.mesAtual?.saldoLivre || 0) < 0 ? '-R$ ' : 'R$ '}
                    {Math.abs(orcamentoInfo.mesAtual?.saldoLivre || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium block">
                    R$ {(orcamentoInfo.mesAtual?.totalComprometido || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} / R$ {(orcamentoInfo.mesAtual?.limite || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </span>
                </div>

                <div className="w-px h-9 bg-slate-800"></div>

                {/* Próximo Mês */}
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    {(orcamentoInfo.proximoMes?.saldoLivre || 0) < 0 ? `Excedente ${orcamentoInfo.proximoMes?.nomeMes}` : `Saldo ${orcamentoInfo.proximoMes?.nomeMes}`}
                  </span>
                  <span className={`text-sm font-black block ${
                    (orcamentoInfo.proximoMes?.saldoLivre || 0) < 0 ? 'text-rose-400' : 'text-cyan-400'
                  }`}>
                    {(orcamentoInfo.proximoMes?.saldoLivre || 0) < 0 ? '-R$ ' : 'R$ '}
                    {Math.abs(orcamentoInfo.proximoMes?.saldoLivre || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium block">
                    R$ {(orcamentoInfo.proximoMes?.totalComprometido || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} / R$ {(orcamentoInfo.proximoMes?.limite || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </span>
                </div>

                {orcamentoInfo.mesSeguinte && (
                  <>
                    <div className="w-px h-9 bg-slate-800"></div>
                    {/* Mês Seguinte */}
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        {(orcamentoInfo.mesSeguinte.saldoLivre || 0) < 0 ? `Excedente ${orcamentoInfo.mesSeguinte.nomeMes}` : `Saldo ${orcamentoInfo.mesSeguinte.nomeMes}`}
                      </span>
                      <span className={`text-sm font-black block ${
                        (orcamentoInfo.mesSeguinte.saldoLivre || 0) < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}>
                        {(orcamentoInfo.mesSeguinte.saldoLivre || 0) < 0 ? '-R$ ' : 'R$ '}
                        {Math.abs(orcamentoInfo.mesSeguinte.saldoLivre || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium block">
                        R$ {(orcamentoInfo.mesSeguinte.totalComprometido || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} / R$ {(orcamentoInfo.mesSeguinte.limite || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}


        {activeTab === 'pedidos' && <PedidosTab />}

        {/* ─── ABA 1: FALTAS & REPOSIÇÃO 1 SEMANA ─────────────────────────────── */}
        {activeTab === 'faltas' && (
          <div className="space-y-4">
            {/* ─── PAINEL TREMOR DE INDICADORES EXECUTIVOS ─────────────────────── */}
            <BelaPedResumoTremor faltas={faltas} totais={totaisPorDistribuidora} />

            {/* ─── PAINEL ESTRATÉGICO: TRAVA ORÇAMENTÁRIA & META DE SOBRA NO CAIXA ─── */}
            <div className="bg-gradient-to-r from-[#0a1426] via-[#0d1c35] to-[#091222] p-4 rounded-2xl border border-cyan-800/80 shadow-xl space-y-3.5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-950/90 border border-cyan-600/50 text-cyan-400">
                    <PiggyBank className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-cyan-300">
                        Plano de Gestão Orçamentária & Equalização
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950/90 text-emerald-300 border border-emerald-700/60">
                        GARANTIR SOBRA LIVRE
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 font-medium mt-0.5">
                      Controle dinâmico para comprar um mix variado equalizado sem esgotar o caixa da empresa.
                    </p>
                  </div>
                </div>

                {/* Seletores de Meta de Reserva */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-[#070e1c] p-1 rounded-xl border border-slate-700 text-xs font-bold">
                    <span className="px-2 text-slate-400 text-[11px]">Meta de Sobra Livre:</span>
                    {([15, 20, 25, 30] as const).map(pct => (
                      <button
                        key={pct}
                        onClick={() => setPercentualSobraMeta(pct)}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer font-black text-xs ${
                          percentualSobraMeta === pct
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleEqualizarOrcamentoComSobra}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-md cursor-pointer transition-all active:scale-95"
                    title={`Ajusta automaticamente a lista de itens selecionados para não ultrapassar o teto e garantir ${percentualSobraMeta}% de sobra livre no caixa`}
                  >
                    <Wallet className="w-4 h-4 text-emerald-200" />
                    <span>Equalizar ao Teto ({percentualSobraMeta}% de Sobra)</span>
                  </button>

                  {/* BOTÃO PARA CONSULTA DO LIMITE SEMANAL DE TODOS OS MESES */}
                  <button
                    onClick={() => setOrcamentoSemanalModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-700 to-blue-700 hover:from-cyan-600 hover:to-blue-600 text-white text-xs font-black shadow-md cursor-pointer transition-all active:scale-95"
                    title="Consultar divisão do orçamento por semanas em todos os meses do ano"
                  >
                    <CalendarCheck className="w-4 h-4 text-cyan-200" />
                    <span>Consultar Limites Semanais (12 Meses)</span>
                  </button>
                </div>
              </div>

              {/* Indicadores Numéricos da Trava de Caixa + Limite Semanal da Semana Vigente */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                {/* Saldo Livre Bruto do Mês */}
                <div className="p-3 rounded-xl bg-[#081120] border border-slate-800">
                  <span className="text-[10px] font-black uppercase text-slate-400 block">
                    Saldo Livre no Mês ({orcamentoInfo?.mesAtual?.nomeMes || 'Atual'})
                  </span>
                  <span className="text-base font-black text-white mt-1 block">
                    R$ {analiseOrcamentoSobra.saldoLivreMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Limite: R$ {(orcamentoInfo?.mesAtual?.limite || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </span>
                </div>

                {/* Limite Semanal Vigente (Semana Atual) */}
                <div className="p-3 rounded-xl bg-[#081120] border border-cyan-800/80 shadow-inner">
                  <span className="text-[10px] font-black uppercase text-cyan-400 block flex items-center justify-between">
                    <span>Semana Vigente</span>
                    <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 text-[9px] font-black">
                      {orcamentoInfo?.semanaAtual?.nome || 'Semana 1'}
                    </span>
                  </span>
                  <span className="text-base font-black text-cyan-200 mt-1 block">
                    R$ {(orcamentoInfo?.semanaAtual?.limiteSemanal || analiseOrcamentoSobra.saldoLivreMes / 4).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5 truncate" title={`Período: ${orcamentoInfo?.semanaAtual?.periodo || 'Atual'} • Gasto: R$ ${(orcamentoInfo?.semanaAtual?.totalComprometido || 0).toFixed(0)}`}>
                    Gasto: R$ {(orcamentoInfo?.semanaAtual?.totalComprometido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })} • Saldo: R$ {(orcamentoInfo?.semanaAtual?.saldoLivreSemana || 0).toFixed(0)}
                  </span>
                </div>

                {/* Reserva de Segurança (Sobra Garantida) */}
                <div className="p-3 rounded-xl bg-[#081120] border border-emerald-900/60">
                  <span className="text-[10px] font-black uppercase text-emerald-400 block">
                    Reserva de Sobra ({percentualSobraMeta}%)
                  </span>
                  <span className="text-base font-black text-emerald-300 mt-1 block">
                    R$ {analiseOrcamentoSobra.reservaSeguranca.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-emerald-400/80 block mt-0.5">
                    Preservado para imprevistos
                  </span>
                </div>

                {/* Teto Disponível para Compras */}
                <div className="p-3 rounded-xl bg-[#081120] border border-cyan-900/60">
                  <span className="text-[10px] font-black uppercase text-cyan-400 block">
                    Teto para Compras Hoje
                  </span>
                  <span className="text-base font-black text-cyan-200 mt-1 block">
                    R$ {analiseOrcamentoSobra.tetoComprasDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-cyan-400/80 block mt-0.5">
                    Saldo Livre − Reserva
                  </span>
                </div>

                {/* Status do Selecionado x Sobra */}
                <div className={`p-3 rounded-xl border ${
                  analiseOrcamentoSobra.estaDentroDoTeto
                    ? 'bg-emerald-950/40 border-emerald-700/80'
                    : 'bg-rose-950/40 border-rose-700/80'
                }`}>
                  <span className={`text-[10px] font-black uppercase block ${
                    analiseOrcamentoSobra.estaDentroDoTeto ? 'text-emerald-300' : 'text-rose-300'
                  }`}>
                    {analiseOrcamentoSobra.estaDentroDoTeto ? '✓ Sobra Preservada' : '⚠️ Excedendo Teto'}
                  </span>
                  <span className={`text-base font-black mt-1 block ${
                    analiseOrcamentoSobra.estaDentroDoTeto ? 'text-emerald-200' : 'text-rose-200'
                  }`}>
                    R$ {analiseOrcamentoSobra.sobraProjetada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className={`text-[10px] block mt-0.5 ${
                    analiseOrcamentoSobra.estaDentroDoTeto ? 'text-emerald-300/80' : 'text-rose-300/80'
                  }`}>
                    {analiseOrcamentoSobra.estaDentroDoTeto
                      ? `${analiseOrcamentoSobra.percentualSobraReal}% de sobra projetada`
                      : `Excede teto em R$ ${analiseOrcamentoSobra.deficitTeto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  </span>
                </div>
              </div>
            </div>

            {/* ─── BANNER DINÂMICO: LISTA DE URGÊNCIA ➔ LISTA DE COMPRAS REGULARES ─── */}
            <div className={`p-4 rounded-2xl border transition-all ${
              isModoComprasRegulares
                ? 'bg-gradient-to-r from-emerald-950/70 via-[#0a221b] to-[#071713] border-emerald-600/80 shadow-lg ring-1 ring-emerald-500/20'
                : 'bg-gradient-to-r from-amber-950/70 via-[#26150a] to-[#1a0e07] border-amber-600/80 shadow-lg ring-1 ring-amber-500/20'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl border mt-0.5 shrink-0 ${
                    isModoComprasRegulares
                      ? 'bg-emerald-900/60 border-emerald-500 text-emerald-300'
                      : 'bg-amber-900/60 border-amber-500 text-amber-300 animate-pulse'
                  }`}>
                    {isModoComprasRegulares ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                        isModoComprasRegulares
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                          : 'bg-amber-950 text-amber-300 border-amber-700'
                      }`}>
                        {isModoComprasRegulares
                          ? '✓ MODO ATIVO: LISTA DE COMPRAS REGULARES'
                          : '🚨 MODO ATIVO: LISTA DE REPOSIÇÃO URGENTE'}
                      </span>
                      <span className="text-[11px] text-slate-300">
                        {isModoComprasRegulares
                          ? 'Zero Rupturas Críticas Pendentes na Loja'
                          : `${totalUrgenciasCriticas} produto(s) com estoque zerado no balcão`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 font-medium mt-1 leading-relaxed">
                      {isModoComprasRegulares ? (
                        <>
                          <b>Excelente!</b> Todas as faltas emergenciais foram supridas. A lista converteu-se automaticamente em <b>Lista de Compras Regulares</b> com sugestões preventivas de 7 a 10 dias para abastecer o mix pelo menor preço nos portais.
                        </>
                      ) : (
                        <>
                          <b>Atenção:</b> Itens com estoque zerado no balcão demandam reposição de emergência imediata. Assim que os itens urgentes forem comprados ou repostos, esta tela transiciona automaticamente para a Lista de Compras Regulares.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Seletores Manuais de Modo de Lista (Auto / Urgência / Compras Regulares) */}
                <div className="flex items-center p-1 rounded-xl bg-[#060d18] border border-slate-700 shrink-0">
                  <button
                    onClick={() => setModoListaManual('AUTO')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      modoListaManual === 'AUTO'
                        ? 'bg-cyan-600 text-white font-black shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Alterna automaticamente para Lista de Compras Regulares quando não houver produtos zerados"
                  >
                    Automático
                  </button>
                  <button
                    onClick={() => setModoListaManual('URGENCIA')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      modoListaManual === 'URGENCIA'
                        ? 'bg-amber-600 text-white font-black shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Filtrar estritamente produtos com estoque zerado de ruptura"
                  >
                    🚨 Urgência ({totalUrgenciasCriticas})
                  </button>
                  <button
                    onClick={() => setModoListaManual('COMPRAS_REGULARES')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      modoListaManual === 'COMPRAS_REGULARES'
                        ? 'bg-emerald-600 text-white font-black shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Exibir toda a lista de compras regulares preventivas"
                  >
                    🛒 Compras ({faltas.length})
                  </button>
                </div>
              </div>
            </div>

            {/* ─── BARRA DE MODO DE REPOSIÇÃO & LEGENDA ESTRATÉGICA ───────────────── */}
            <div className="bg-[#0e1626] p-3.5 rounded-2xl border border-slate-800 shadow-md space-y-2.5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    Modo de Execução da Reposição:
                  </span>
                </div>

                {/* Botões de Alternância: Compras de Hoje vs Toda a Semana */}
                <div className="flex items-center p-1 rounded-xl bg-[#080d18] border border-slate-700">
                  <button
                    onClick={() => setFiltroModoReposicao('HOJE_URGENTES')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      filtroModoReposicao === 'HOJE_URGENTES'
                        ? 'bg-gradient-to-r from-amber-600 to-emerald-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Exibe apenas os itens que devem ser comprados HOJE: produtos no Melhor Dia de compra + produtos com Estoque Zerado (compra emergencial semente)"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    <span>⚡ Compras Recomendadas Hoje ({faltas.length - statsModoDia.retidos} itens)</span>
                  </button>

                  <button
                    onClick={() => setFiltroModoReposicao('TODOS')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      filtroModoReposicao === 'TODOS'
                        ? 'bg-cyan-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Exibe todos os produtos da matriz de 7 dias, inclusive os que ainda têm estoque e cujo melhor dia de compra é outro dia da semana"
                  >
                    <span>📋 Toda a Semana ({faltas.length} itens)</span>
                  </button>
                </div>
              </div>

              {/* Legenda Explicativa das Tags */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                <div className="flex items-center gap-2 p-2 rounded-xl bg-[#081020] border border-emerald-900/40">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700 whitespace-nowrap">
                    🌟 Melhor Dia
                  </span>
                  <span className="text-slate-300 leading-tight">
                    Hoje é o dia com menor preço histórico. Sugerida compra do lote semanal equalizado.
                  </span>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-xl bg-[#081020] border border-amber-900/40">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-700 whitespace-nowrap">
                    ⚡ Emergencial
                  </span>
                  <span className="text-slate-300 leading-tight">
                    Estoque zerado! Sugerida compra emergencial de apenas 1-2 un. O restante é comprado no dia certo.
                  </span>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-xl bg-[#081020] border border-slate-800">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-900 text-slate-400 border border-slate-700 whitespace-nowrap">
                    ⏳ Retido p/ Dia
                  </span>
                  <span className="text-slate-300 leading-tight">
                    Possui estoque de segurança. Ocultado hoje para poupar orçamento e comprar no melhor dia.
                  </span>
                </div>
              </div>
            </div>

            {/* ─── BARRA DE BOTÕES RÁPIDOS: MELHOR PREÇO DA DISTRIBUIDORA ──────── */}
            <div className="bg-[#0e1626] px-4 py-3 rounded-2xl border border-slate-800 flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mr-1">
                <Filter className="w-3.5 h-3.5" />
                Melhor Preço na Distribuidora:
              </span>
              <button
                onClick={() => setFiltroDistribuidora('TODAS')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer border ${
                  filtroDistribuidora === 'TODAS'
                    ? 'bg-cyan-600 text-white border-cyan-400 shadow-md'
                    : 'bg-[#080d18] text-slate-300 border-slate-700 hover:border-cyan-500'
                }`}
              >
                Todas ({faltasBaseFiltradas.length})
              </button>
              {totaisPorDistribuidora
                .filter(grp => grp.isEmpresaReal && grp.qtdProdutos > 0)
                .map(grp => {
                  const dist = grp.distribuidora;
                  const isSel = filtroDistribuidora === dist;
                  return (
                    <button
                      key={dist}
                      onClick={() => setFiltroDistribuidora(isSel ? 'TODAS' : dist)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer border flex items-center gap-2 ${
                        isSel
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                          : 'bg-[#080d18] text-emerald-300 border-slate-700 hover:border-emerald-500'
                      }`}
                    >
                      <span>{dist}</span>
                      <span className="px-1.5 py-0.5 rounded bg-black/30 text-[10px] text-white">
                        {grp.qtdProdutos} it. • R$ {grp.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </button>
                  );
                })}
            </div>
            
            {/* ─── PAINEL EXECUTIVO: TOTAIS POR DISTRIBUIDORA & AGRUPAMENTO ────────── */}
            <div className="bg-[#0e1626] p-3.5 rounded-2xl border border-slate-800 shadow-md space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    Resumo e Total por Distribuidora (1º Colocado)
                  </span>
                  <span className="text-[11px] text-slate-400 hidden md:inline">
                    • Clique em uma empresa para filtrar ou ative o agrupamento na tabela
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {filtroDistribuidora !== 'TODAS' && (
                    <button
                      onClick={() => setFiltroDistribuidora('TODAS')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold cursor-pointer transition-colors"
                    >
                      Limpar Filtro ({filtroDistribuidora})
                    </button>
                  )}
                  {filtroDistribuidora !== 'TODAS' && (
                    <button
                      onClick={registrarPedidoDaDistribuidora}
                      className="px-3 py-1.5 rounded-xl bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-black uppercase tracking-wider cursor-pointer transition-colors"
                      title="Registra o carrinho no histórico. Não finaliza a compra: você finaliza no portal."
                    >
                      Registrar pedido ({filtroDistribuidora})
                    </button>
                  )}
                  <button
                    onClick={() => setAgruparPorDistribuidora(prev => !prev)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ${
                      agruparPorDistribuidora
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-lg shadow-cyan-950/50'
                        : 'bg-[#080d18] text-cyan-300 hover:text-white border-cyan-800/70 hover:border-cyan-500'
                    }`}
                    title="Agrupar as linhas da tabela por empresa vencedora com subtotal de cada distribuidora"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{agruparPorDistribuidora ? '✓ Agrupado por Distribuidora' : 'Agrupar por Distribuidora'}</span>
                  </button>
                </div>
              </div>

              {/* Cards de Cada Empresa */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {/* Card Todas */}
                <button
                  onClick={() => setFiltroDistribuidora('TODAS')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    filtroDistribuidora === 'TODAS'
                      ? 'bg-cyan-950/50 border-cyan-500 ring-1 ring-cyan-500/40 shadow-md'
                      : 'bg-[#09101f] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase text-cyan-300 truncate">TODAS EMPRESAS</span>
                    <span className="px-1.5 py-0.5 rounded bg-cyan-900/60 text-cyan-200 text-[10px] font-black">
                      {faltasBaseFiltradas.length} it.
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <span className="text-base font-black text-white block">
                      R$ {faltasBaseFiltradas.reduce((acc, f) => acc + f.subtotal_7d, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                      Selecionado: <b className="text-emerald-400">R$ {totaisSelecionados.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                    </span>
                  </div>
                </button>

                {/* Cards individuais por Distribuidora */}
                {totaisPorDistribuidora.map((grp) => {
                  const ativo = filtroDistribuidora === grp.distribuidora;
                  return (
                    <button
                      key={grp.distribuidora}
                      onClick={() => setFiltroDistribuidora(ativo ? 'TODAS' : grp.distribuidora)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        ativo
                          ? 'bg-emerald-950/50 border-emerald-500 ring-1 ring-emerald-500/40 shadow-md'
                          : grp.isEmpresaReal
                          ? 'bg-[#09101f] border-slate-800 hover:border-emerald-700/60'
                          : 'bg-[#09101f]/60 border-slate-800/70 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[11px] font-black uppercase truncate ${
                          grp.isEmpresaReal ? 'text-emerald-300' : 'text-amber-300/90'
                        }`} title={grp.distribuidora}>
                          {grp.distribuidora}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-black shrink-0">
                          {grp.qtdProdutos} it.
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <span className="text-base font-black text-white block">
                          R$ {grp.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        {grp.isEmpresaReal && grp.pedidoMinimo > 0 ? (
                          <span className={`text-[10px] font-bold block mt-0.5 ${
                            grp.atingiuMinimo ? 'text-emerald-400' : 'text-amber-400'
                          }`}>
                            {grp.atingiuMinimo
                              ? `✓ Mín. R$ ${grp.pedidoMinimo} OK`
                              : `Faltam R$ ${grp.faltaParaMinimo.toFixed(0)} p/ mín.`}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                            {grp.qtdUnidades} unidades
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Painel Equalizador Inteligente & Proteção Anti-Ruptura (Equivalentes + Resgate 6m) */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-gradient-to-r from-[#0c182c] via-[#0e1b31] to-[#0a1324] p-3.5 rounded-2xl border border-cyan-800/60 shadow-lg">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-950/70 border border-cyan-700/60">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-cyan-200">
                    Equalizador Anti-Ruptura:
                  </span>
                  <button
                    onClick={() => setEqualizarAtivo(prev => !prev)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                      equalizarAtivo
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                    title="Quando ativo, corta a gordura de grandes volumes num só produto e garante 1 a 2 unidades (estoque semente) para itens esquecidos/Curva C"
                  >
                    {equalizarAtivo ? 'ATIVO (MIX EQUALIZADO)' : 'DESATIVADO (VOLUME BRUTO)'}
                  </button>
                </div>

                {equalizarAtivo && (
                  <div className="flex items-center gap-1 rounded-xl border border-slate-700/80 p-1 bg-[#080d18] text-[11px] font-bold">
                    <span className="px-2 text-slate-400">Teto Máx/Item:</span>
                    {([
                      { val: 6, label: 'Máx 6 un' },
                      { val: 10, label: 'Máx 10 un' },
                      { val: 15, label: 'Máx 15 un' },
                      { val: 0, label: 'Sem Teto' }
                    ] as const).map(opt => (
                      <button
                        key={opt.val}
                        onClick={() => setTetoMaxUnidades(opt.val)}
                        className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                          tetoMaxUnidades === opt.val
                            ? 'bg-cyan-600 text-white font-black'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span
                  className="px-2.5 py-1 rounded-xl bg-emerald-950/70 text-emerald-300 border border-emerald-700/60"
                  title="Produtos zerados que foram ocultados automaticamente porque outro laboratório equivalente (mesmo princípio ativo + dosagem + apresentação) já possui estoque na loja"
                >
                  🛡️ <b>{statsAntiRuptura.ocultadosEquiv}</b> trocas de lab c/ estoque ignoradas
                </span>
                <span
                  className="px-2.5 py-1 rounded-xl bg-indigo-950/70 text-indigo-300 border border-indigo-700/60"
                  title="Laboratórios repetidos do mesmo medicamento zerado que foram unificados em 1 único item para evitar compra duplicada"
                >
                  🔗 <b>{statsAntiRuptura.agrupadosEquiv}</b> labs equivalentes unificados
                </span>
                {equalizarAtivo && economiaEqualizador.unidadesCortadas > 0 && (
                  <span
                    className="px-2.5 py-1 rounded-xl bg-amber-950/80 text-amber-300 border border-amber-700/70"
                    title="Orçamento liberado ao enxugar grandes volumes exagerados para cobrir mais produtos em falta na loja"
                  >
                    💰 <b>R$ {economiaEqualizador.valorEconomizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b> liberados (-{economiaEqualizador.unidadesCortadas} un. de excesso)
                  </span>
                )}
              </div>
            </div>

            {/* Controles de Filtros e Disparo de Cotação */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[#0e1626] p-3.5 rounded-2xl border border-slate-800 shadow-md">
              <div className="flex flex-wrap items-center gap-2">
                
                {/* Campo de Busca Rápida */}
                <div className="relative min-w-[240px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar medicamento ou EAN..."
                    value={buscaFalta}
                    onChange={(e) => setBuscaFalta(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-700 bg-[#080d18] text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                {/* Filtro Curva ABC + Esquecidos 6 Meses */}
                <div className="flex flex-wrap items-center rounded-xl border border-slate-700 p-0.5 bg-[#080d18] text-xs font-bold">
                  <button
                    onClick={() => setFiltroCurva('TODAS')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${filtroCurva === 'TODAS' ? 'bg-cyan-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                  >
                    Todas ({faltas.length})
                  </button>
                  <button
                    onClick={() => setFiltroCurva('A')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${filtroCurva === 'A' ? 'bg-rose-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                  >
                    Curva A ({faltas.filter(f => f.curva_abc === 'A').length})
                  </button>
                  <button
                    onClick={() => setFiltroCurva('B')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${filtroCurva === 'B' ? 'bg-blue-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                  >
                    Curva B ({faltas.filter(f => f.curva_abc === 'B').length})
                  </button>
                  <button
                    onClick={() => setFiltroCurva('C')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${filtroCurva === 'C' ? 'bg-slate-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                    title="Produtos de Curva C com venda nos últimos 6 meses que estão zerados na loja (sem equivalente em estoque)"
                  >
                    Curva C ({faltas.filter(f => f.curva_abc === 'C').length})
                  </button>
                  <button
                    onClick={() => setFiltroCurva('ESQUECIDOS_6M')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${filtroCurva === 'ESQUECIDOS_6M' ? 'bg-amber-600 text-slate-950 shadow-xs font-black' : 'text-amber-400/90 hover:text-amber-300'}`}
                    title="Resgate de Esquecidos: Produtos que venderam nos últimos 6 meses, zeraram o estoque e pararam de vender nos últimos 30 dias por falta na prateleira"
                  >
                    ⏳ Esquecidos 6m ({faltas.filter(f => f.is_esquecido_6m).length})
                  </button>
                </div>

                {/* Filtro Tipo Categoria */}
                <div className="flex items-center rounded-xl border border-slate-700 p-0.5 bg-[#080d18] text-xs font-bold">
                  <button
                    onClick={() => setFiltroCategoria('TODAS')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${filtroCategoria === 'TODAS' ? 'bg-cyan-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                  >
                    Todos Tipos
                  </button>
                  <button
                    onClick={() => setFiltroCategoria('MEDICAMENTO')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${filtroCategoria === 'MEDICAMENTO' ? 'bg-emerald-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                  >
                    Medicamentos
                  </button>
                  <button
                    onClick={() => setFiltroCategoria('PERFUMARIA')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${filtroCategoria === 'PERFUMARIA' ? 'bg-purple-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                  >
                    Perfumaria
                  </button>
                </div>
              </div>

              {/* Ações: Planilhas de Pedido, Robôs de Cotação ao Vivo e Otimização */}
              <div className="flex flex-wrap items-center gap-2">
                
                {/* Exportar Planilhas de Pedido */}
                <div className="flex items-center rounded-xl border border-slate-700 p-0.5 bg-[#080d18] text-xs font-bold">
                  <button
                    onClick={handleExportarPlanilhaProfarma}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-emerald-300 hover:text-white hover:bg-emerald-950/60 transition-all cursor-pointer"
                    title="Baixar planilha modelo aceita pela Profarma (Codigo/EAN e Quantidade)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Planilha Profarma</span>
                  </button>
                  <button
                    onClick={handleExportarPlanilhaDpc}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-cyan-300 hover:text-white hover:bg-cyan-950/60 transition-all cursor-pointer"
                    title="Baixar planilha modelo aceita pela DPC (codigo ou ean e quantidade)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Planilha DPC</span>
                  </button>
                  <button
                    onClick={handleExportarPlanilhaDistrimed}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-indigo-300 hover:text-white hover:bg-indigo-950/60 transition-all cursor-pointer"
                    title="Baixar planilha modelo aceita pela Distrimed (EAN e Quantidade)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Planilha Distrimed</span>
                  </button>
                </div>

                {/* Robô Montador de Carrinho na Soton Farma (Item a Item) */}
                <button
                  onClick={handleMontarCarrinhoSoton}
                  disabled={montandoCarrinhoSoton}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 hover:text-amber-100 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                  title="O robô fará login na Soton e adicionará item por item os produtos no carrinho"
                >
                  {montandoCarrinhoSoton ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      <span>Montando Soton ({statusCarrinhoSoton?.atual || 0}/{statusCarrinhoSoton?.total || 0})...</span>
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-3.5 h-3.5 text-amber-400" />
                      <span>Montar Soton (Robô)</span>
                    </>
                  )}
                </button>

                {/* Robô Importador na Modal da Distrimed */}
                <button
                  onClick={handleImportarCarrinhoDistrimed}
                  disabled={importandoDistrimed}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-indigo-100 border border-indigo-500/40 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                  title="O robô fará login na Distrimed, abrirá a modal de importação e subirá o pedido automaticamente"
                >
                  {importandoDistrimed ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      <span>Importando Distrimed...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Importar Distrimed (Robô)</span>
                    </>
                  )}
                </button>

                {/* BOTÃO PRINCIPAL: RECARREGAR COTAÇÃO (ROBÔS AO VIVO EM 4 PORTAIS) */}
                <button
                  onClick={() => handleIniciarCotacaoAoVivo('TODOS')}
                  disabled={cotandoAoVivo}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-black shadow-lg shadow-emerald-950/50 hover:shadow-cyan-900/40 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                  title="Disparar os robôs agora para consultar preços ao vivo na Profarma, DPC, Soton Farma e Distrimed"
                >
                  {cotandoAoVivo ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Cotando nos 4 Portais ({statusCotacao?.atual || 0}/{statusCotacao?.total || 0})...</span>
                    </>
                  ) : (
                    <>
                      <Bot className="w-4 h-4 text-emerald-200 animate-pulse" />
                      <span>Recarregar Cotação (Robôs)</span>
                    </>
                  )}
                </button>

                {/* BOTÃO SECUNDÁRIO: ATUALIZAR TABELA (SINCRONIZAR BANCO) */}
                <button
                  onClick={handleSincronizarManual}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white border border-cyan-800/60 text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 active:scale-95"
                  title="Sincronizar dados e cotações da tabela com o banco de dados"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
                  <span>{refreshing ? 'Atualizando...' : 'Atualizar Tabela'}</span>
                </button>

                {/* Badge com Horário da Última Sincronização */}
                {ultimaAtualizacao && (
                  <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap hidden xl:inline-block">
                    Atualizado às <b className="text-slate-200">{ultimaAtualizacao}</b>
                  </span>
                )}

                <button
                  onClick={() => setAvulsoModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>+ Item Avulso</span>
                </button>

                <button
                  onClick={handleExecutarSimulacao}
                  disabled={simulando || totaisSelecionados.qtdItens === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black shadow-lg shadow-cyan-900/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-cyan-200" />
                  <span>Otimizar Carrinhos ({totaisSelecionados.qtdItens} itens • R$ {totaisSelecionados.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>
                </button>
              </div>
            </div>

            {/* BARRA DE PROGRESSO DA COTAÇÃO AO VIVO (SE ATIVA) */}
            {statusCotacao && statusCotacao.emAndamento && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/90 via-slate-900 to-cyan-950/90 border-2 border-emerald-500/70 shadow-2xl shadow-emerald-950/60 ring-2 ring-emerald-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-pulse">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 shadow-inner">
                    <Bot className="w-6 h-6 animate-bounce" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white uppercase tracking-wider">
                        Robô BelaPed Cotando ao Vivo
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
                        EM ANDAMENTO
                      </span>
                    </div>
                    <span className="text-xs text-emerald-300 font-bold block mt-0.5">
                      {statusCotacao.fornecedor} • Processando item {statusCotacao.atual || 1} de {statusCotacao.total || 1}
                    </span>
                    <span className="text-xs text-slate-300 font-medium block">
                      Item: <b className="text-white">{statusCotacao.ultimoItem || 'Iniciando robôs...'}</b> • <b className="text-emerald-400">{statusCotacao.encontrados} preços capturados</b>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-48 bg-slate-800 rounded-full h-3 overflow-hidden border border-emerald-700/60 p-0.5">
                    <div
                      className="bg-gradient-to-r from-emerald-400 to-cyan-400 h-full rounded-full transition-all duration-300 shadow-sm"
                      style={{ width: `${Math.max(5, Math.round(((statusCotacao.atual || 0) / (statusCotacao.total || 1)) * 100))}%` }}
                    ></div>
                  </div>
                  <span className="text-xs font-black text-emerald-300 w-12 text-right">
                    {Math.round(((statusCotacao.atual || 0) / (statusCotacao.total || 1)) * 100)}%
                  </span>
                </div>
              </div>
            )}

            {/* BARRA DE PROGRESSO DO ROBÔ SOTON (MONTAGEM DE CARRINHO) */}
            {statusCarrinhoSoton && statusCarrinhoSoton.emAndamento && (
              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 flex items-center justify-between gap-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-900/60 text-amber-300">
                    <ShoppingCart className="w-4 h-4 animate-bounce" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-amber-200 block">
                      Robô Inserindo Produtos no Carrinho da Soton Farma: item {statusCarrinhoSoton.atual} de {statusCarrinhoSoton.total}
                    </span>
                    <span className="text-[11px] text-amber-400/90 font-medium">
                      Item: {statusCarrinhoSoton.ultimoItem} • {statusCarrinhoSoton.sucessos} adicionados com sucesso
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-36 bg-slate-800 rounded-full h-2 overflow-hidden border border-amber-800">
                    <div
                      className="bg-amber-400 h-full transition-all duration-300"
                      style={{ width: `${Math.round(((statusCarrinhoSoton.atual || 1) / (statusCarrinhoSoton.total || 1)) * 100)}%` }}
                    ></div>
                  </div>
                  <a
                    href="https://sotonfarma.meuspedidos.com.br/carrinho"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-amber-300 underline font-bold"
                  >
                    Abrir Carrinho
                  </a>
                </div>
              </div>
            )}

            {/* BARRA DE PROGRESSO DO ROBÔ DISTRIMED (IMPORTAÇÃO VIA MODAL) */}
            {statusImportDistrimed && statusImportDistrimed.emAndamento && (
              <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-800/80 flex items-center justify-between gap-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-900/60 text-indigo-300">
                    <Download className="w-4 h-4 animate-bounce" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-indigo-200 block">
                      Robô Distrimed em Ação (Automação de Modal de Importação)
                    </span>
                    <span className="text-[11px] text-indigo-400/90 font-medium">
                      {statusImportDistrimed.mensagem || 'Efetuando login, abrindo modal e anexando pedido...'}
                    </span>
                  </div>
                </div>
                <div>
                  <a
                    href="https://inovacao.distrimed.com.br/produtos"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-300 underline font-bold"
                  >
                    Abrir Portal Distrimed
                  </a>
                </div>
              </div>
            )}

            {/* TABELA DE ALTA DENSIDADE (DIRETRIZES AGENTS.MD: 1 LINHA COMPACTA) */}
            <div className="bg-[#0e1626] rounded-2xl border border-slate-800 shadow-xl overflow-hidden relative">
              
              {/* Barra animada de status durante carregamento ou cotação */}
              {(refreshing || (statusCotacao && statusCotacao.emAndamento)) && (
                <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-blue-500 animate-pulse"></div>
              )}
              <div className="overflow-auto max-h-[68vh] custom-scrollbar relative">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-20 bg-[#09101f] shadow-lg">
                    <tr className="bg-[#09101f] border-b border-slate-700 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-8 text-center whitespace-nowrap bg-[#09101f]">
                        <input
                          type="checkbox"
                          checked={(agruparPorDistribuidora ? faltasFiltradas : itensPaginados).length > 0 && (agruparPorDistribuidora ? faltasFiltradas : itensPaginados).every(f => itensSelecionados[f.produto_id])}
                          onChange={() => {
                            const listaAlvo = agruparPorDistribuidora ? faltasFiltradas : itensPaginados;
                            const todosMarcados = listaAlvo.length > 0 && listaAlvo.every(f => itensSelecionados[f.produto_id]);
                            const novoMap = { ...itensSelecionados };
                            listaAlvo.forEach(f => {
                              novoMap[f.produto_id] = !todosMarcados;
                            });
                            setItensSelecionados(novoMap);
                          }}
                          className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                          title="Selecionar todos os itens visíveis"
                        />
                      </th>
                      {([
                        { key: 'descricao', label: 'Produto / Metadados', align: 'left', thClass: 'py-3 px-3.5 min-w-[230px] bg-[#09101f] text-slate-300' },
                        { key: 'curva_abc', label: 'Curva', align: 'center', thClass: 'py-3 px-2.5 w-16 bg-[#09101f] text-slate-300' },
                        { key: 'saldo', label: 'Saldo', align: 'center', thClass: 'py-3 px-2.5 w-20 bg-[#09101f] text-slate-300' },
                        { key: 'dias_estoque_restante', label: 'Cobertura', align: 'center', thClass: 'py-3 px-2.5 w-20 bg-[#09101f] text-slate-300' },
                        { key: 'qtd_sugerida_7d', label: 'Pedir 7d', align: 'center', thClass: 'py-3 px-3 w-24 bg-[#0c2135] text-cyan-300' },
                        { key: 'preco_ult_compra', label: 'Últ. Compra', align: 'right', thClass: 'py-3 px-3 w-28 bg-[#18150d] text-amber-300', title: 'Último valor unitário de compra registrado no Digifarma' },
                        { key: 'fornecedor_1', label: '1º Colocado', align: 'left', thClass: 'py-3 px-3.5 w-36 bg-[#0b1b2e] text-cyan-400' },
                        { key: 'preco_1', label: '1º Preço', align: 'right', thClass: 'py-3 px-3.5 w-28 bg-[#0b1b2e] text-cyan-300' },
                        { key: 'fornecedor_2', label: '2º Colocado', align: 'left', thClass: 'py-3 px-3.5 w-36 bg-[#0b1324] text-slate-300' },
                        { key: 'preco_2', label: '2º Preço', align: 'right', thClass: 'py-3 px-3.5 w-28 bg-[#0b1324] text-slate-300' },
                        { key: 'margem_lucro_percentual', label: 'Margem', align: 'right', thClass: 'py-3 px-3 w-20 bg-[#09101f] text-emerald-400' },
                        { key: 'subtotal_7d', label: 'Subtotal 7d', align: 'right', thClass: 'py-3 px-3.5 w-28 bg-[#0b1324] text-white' }
                      ] as const).map(col => {
                        const ativo = ordenarColuna === col.key;
                        const justify = col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start';
                        return (
                          <th
                            key={col.key}
                            title={(col as any).title || `Clique para ordenar por ${col.label}`}
                            onClick={() => handleOrdenarColuna(col.key as keyof FaltaItem7d)}
                            className={`${col.thClass} whitespace-nowrap text-xs font-black uppercase tracking-wider cursor-pointer select-none hover:brightness-125 transition-all`}
                          >
                            <div className={`inline-flex items-center gap-1 w-full ${justify}`}>
                              <span>{col.label}</span>
                              <span className={`text-[10px] px-1 py-0.5 rounded ${
                                ativo
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                  : 'text-slate-500 hover:text-slate-300'
                              }`}>
                                {ativo ? (ordenarDirecao === 'asc' ? '▲' : '▼') : '⇅'}
                              </span>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {(agruparPorDistribuidora ? faltasFiltradas : itensPaginados).length === 0 ? (
                      <tr>
                        <td colSpan={13} className="py-12 text-center text-slate-500 font-medium">
                          Nenhum produto encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    ) : agruparPorDistribuidora ? (
                      totaisPorDistribuidora
                        .filter(g => g.itens.length > 0 && (filtroDistribuidora === 'TODAS' || g.distribuidora === filtroDistribuidora))
                        .map((grupo) => {
                          const todosGrupoMarcados = grupo.itens.length > 0 && grupo.itens.every(it => itensSelecionados[it.produto_id]);
                          return (
                            <React.Fragment key={grupo.distribuidora}>
                              {/* CABEÇALHO DO GRUPO DA DISTRIBUIDORA */}
                              <tr className="bg-gradient-to-r from-[#0d1b33] via-[#0f223d] to-[#0b1528] border-y-2 border-cyan-800/70">
                                <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={todosGrupoMarcados}
                                    onChange={() => {
                                      const novoMap = { ...itensSelecionados };
                                      grupo.itens.forEach(it => {
                                        novoMap[it.produto_id] = !todosGrupoMarcados;
                                      });
                                      setItensSelecionados(novoMap);
                                    }}
                                    className="w-4 h-4 rounded border-cyan-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                                    title={`Selecionar todos os itens da ${grupo.distribuidora}`}
                                  />
                                </td>
                                <td colSpan={10} className="py-3 px-3.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                      <Building2 className={`w-4 h-4 ${grupo.isEmpresaReal ? 'text-emerald-400' : 'text-amber-400'}`} />
                                      <span className="text-sm font-black uppercase tracking-wider text-white">
                                        {grupo.distribuidora}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-cyan-950 text-cyan-300 border border-cyan-800">
                                        {grupo.qtdProdutos} produtos • {grupo.qtdUnidades} unidades
                                      </span>
                                      {grupo.isEmpresaReal && grupo.pedidoMinimo > 0 && (
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${
                                          grupo.atingiuMinimo
                                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                                            : 'bg-amber-950/80 text-amber-300 border-amber-700'
                                        }`}>
                                          {grupo.atingiuMinimo
                                            ? `✓ Pedido Mínimo Atingido (Mín. R$ ${grupo.pedidoMinimo.toFixed(2)})`
                                            : `⚠️ Faltam R$ ${grupo.faltaParaMinimo.toFixed(2)} p/ Mínimo de R$ ${grupo.pedidoMinimo.toFixed(2)}`}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-xs font-bold text-slate-300">
                                      Selecionados neste grupo: <b className="text-emerald-400">{grupo.qtdSelecionados} it. (R$ {grupo.valorSelecionado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</b>
                                    </span>
                                  </div>
                                </td>
                                <td colSpan={2} className="py-3 px-3.5 text-right whitespace-nowrap bg-cyan-950/40">
                                  <span className="text-[10px] uppercase font-bold text-cyan-300 block">Total da Empresa</span>
                                  <span className="text-base font-black text-emerald-300">
                                    R$ {grupo.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                </td>
                              </tr>

                              {/* ITENS DA DISTRIBUIDORA */}
                              {ordenarListaFaltas(grupo.itens).map((item) => {
                                const isSelected = Boolean(itensSelecionados[item.produto_id]);
                                const isRuptura = item.saldo <= 0;
                                const semEstoquePortais = item.fornecedor_1 === 'Sem Estoque (Portais)';
                                const temCotacaoReal = Boolean(item.fornecedor_1 && item.fornecedor_1 !== 'Não Cotado' && !semEstoquePortais && item.preco_1 && item.preco_1 > 0);
                                const fornecedor1 = temCotacaoReal ? item.fornecedor_1! : (semEstoquePortais ? 'Sem Estoque (Portais)' : 'Não Cotado');
                                const preco1 = temCotacaoReal ? item.preco_1! : null;
                                const fornecedor2 = (item.fornecedor_2 && item.fornecedor_2 !== '—') ? item.fornecedor_2 : null;
                                const preco2 = (item.preco_2 && item.preco_2 > 0) ? item.preco_2 : null;
                                const diffPct = (preco1 && preco2 && preco2 > preco1) ? Number((((preco2 - preco1) / preco1) * 100).toFixed(1)) : 0;
                                const precoUltCompra = Number(item.preco_ult_compra ?? item.custo_unitario ?? 0);
                                const dataUltFormatada = item.data_ult_compra ? new Date(item.data_ult_compra).toLocaleDateString('pt-BR') : '';

                                return (
                                  <tr 
                                    key={item.produto_id}
                                    className={`hover:bg-slate-800/50 transition-colors ${
                                      isSelected ? 'bg-cyan-950/20' : ''
                                    }`}
                                  >
                                    <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => setItensSelecionados(prev => ({ ...prev, [item.produto_id]: !prev[item.produto_id] }))}
                                        className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                                      />
                                    </td>
                                    <td className="py-2.5 px-3.5">
                                      <div className="flex flex-col">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="text-sm font-bold text-white leading-snug">
                                            {item.descricao}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setProdutoSimuladorId(item.produto_id);
                                              setActiveTab('simulador');
                                            }}
                                            className="px-1.5 py-0.5 rounded text-[10px] font-black bg-teal-950/90 hover:bg-teal-900 text-teal-300 border border-teal-700/70 whitespace-nowrap cursor-pointer transition-colors"
                                            title="Abrir no Simulador de Giro & Calendário para ver de quantos em quantos dias vende e quanto dura o estoque"
                                          >
                                            📅 Giro
                                          </button>
                                          {item.status_dia === 'MELHOR_DIA' && (
                                            <span
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700/80 shadow-xs whitespace-nowrap"
                                              title={`🌟 Hoje é o Melhor Dia de Compra (${item.melhor_dia_semana})! Comprando o lote semanal equalizado pelo menor preço.`}
                                            >
                                              🌟 Melhor Dia ({item.melhor_dia_semana?.split('-')[0]})
                                            </span>
                                          )}
                                          {item.status_dia === 'EMERGENCIAL_RUPTURA' && (
                                            <span
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-700/80 shadow-xs animate-pulse whitespace-nowrap"
                                              title={`⚡ Estoque Zerado na Loja! Sugerindo compra emergencial semente de apenas ${item.qtd_sugerida_7d} un. O restante será comprado no Melhor Dia (${item.melhor_dia_semana}).`}
                                            >
                                              ⚡ Emergencial (Estoque Zerado)
                                            </span>
                                          )}
                                          {item.status_dia === 'RETIDO_OUTRO_DIA' && (
                                            <span
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-900 text-slate-400 border border-slate-700/80 shadow-xs whitespace-nowrap"
                                              title={`⏳ Produto com saldo de segurança. Retido para comprar no Melhor Dia: ${item.melhor_dia_semana}.`}
                                            >
                                              ⏳ Retido p/ {item.melhor_dia_semana?.split('-')[0]}
                                            </span>
                                          )}
                                          {(item.equivalentes_agrupados_count || 0) > 0 && (
                                            <span
                                              className="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-950/90 text-indigo-300 border border-indigo-700/70 whitespace-nowrap"
                                              title={`Representante único de grupo equivalente (${item.chave_equivalencia || ''}). Unificado com: ${(item.equivalentes_agrupados_nomes || []).join(' | ')}`}
                                            >
                                              🔗 +{item.equivalentes_agrupados_count} Lab(s) Equiv.
                                            </span>
                                          )}
                                          {item.is_esquecido_6m && (
                                            <span
                                              className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-950/90 text-amber-300 border border-amber-700/70 whitespace-nowrap"
                                              title={`Resgate 6 Meses: Vendeu ${item.vendas_historico_6m || 0} un. no histórico recente, zerou o estoque e parou de vender nos últimos 30 dias`}
                                            >
                                              ⏳ Esquecido 6m ({item.vendas_historico_6m || 1}vd)
                                            </span>
                                          )}
                                        </div>
                                        <div className="inline-flex items-center gap-2 text-xs text-slate-300 mt-1">
                                          <span className="font-mono text-slate-300">EAN: {item.ean || 'Sem EAN'}</span>
                                          <span className="text-slate-500">•</span>
                                          <span className={item.tipo_categoria === 'MEDICAMENTO' ? 'text-emerald-400 font-bold' : 'text-purple-400 font-bold'}>
                                            {item.tipo_categoria}
                                          </span>
                                          {item.fornecedor_ult_compra && item.fornecedor_ult_compra !== 'Não registrado' && (
                                            <>
                                              <span className="text-slate-500">•</span>
                                              <span className="truncate max-w-[180px] text-slate-400" title={`Últ. Fornecedor: ${item.fornecedor_ult_compra}`}>
                                                Últ: {item.fornecedor_ult_compra}
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                                      <span className={`px-2.5 py-1 rounded-md text-xs font-black ${
                                        item.curva_abc === 'A' 
                                          ? 'bg-rose-950 text-rose-300 border border-rose-800' 
                                          : item.curva_abc === 'B' 
                                          ? 'bg-blue-950 text-blue-300 border border-blue-800' 
                                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                                      }`}>
                                        {item.curva_abc}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                                      <span className={`text-sm font-black ${isRuptura ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
                                        {item.saldo} un
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                                      <span className={`text-xs font-bold ${
                                        item.dias_estoque_restante <= 0 ? 'text-rose-400' : 'text-amber-300'
                                      }`}>
                                        {item.dias_estoque_restante <= 0 ? '0d (Ruptura)' : `${item.dias_estoque_restante}d`}
                                      </span>
                                    </td>
                                    <td
                                      className="py-2.5 px-3 text-center whitespace-nowrap bg-cyan-950/30"
                                      title={equalizarAtivo && (item.qtd_bruta_7d || 0) > item.qtd_sugerida_7d ? `Equalizado de ${item.qtd_bruta_7d} un para ${item.qtd_sugerida_7d} un (economia de ${(item.qtd_bruta_7d || 0) - item.qtd_sugerida_7d} un)` : undefined}
                                    >
                                      <div className="inline-flex items-center justify-center gap-1">
                                        <span className="font-black text-cyan-300 text-sm">
                                          {item.qtd_sugerida_7d} un
                                        </span>
                                        {equalizarAtivo && (item.qtd_bruta_7d || 0) > item.qtd_sugerida_7d && (
                                          <span className="text-[10px] text-slate-400 line-through font-semibold">
                                            {item.qtd_bruta_7d}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td
                                      className="py-2.5 px-3 text-right whitespace-nowrap bg-amber-950/10 font-bold text-amber-200 text-sm"
                                      title={`Última Compra: R$ ${precoUltCompra.toFixed(2)} • Fornecedor: ${item.fornecedor_ult_compra || 'Não inf.'}${dataUltFormatada ? ` • Data: ${dataUltFormatada}` : ''}`}
                                    >
                                      {precoUltCompra > 0 ? `R$ ${precoUltCompra.toFixed(2)}` : '—'}
                                    </td>
                                    <td className="py-2.5 px-3.5 whitespace-nowrap bg-cyan-950/10">
                                      {temCotacaoReal ? (
                                        <div className="flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                                          <span className="font-bold text-emerald-300 text-xs truncate max-w-[130px]" title={fornecedor1}>
                                            {fornecedor1}
                                          </span>
                                        </div>
                                      ) : semEstoquePortais ? (
                                        <div className="flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                                          <span className="font-semibold text-amber-400/90 text-xs">
                                            Sem Estoque (4 Portais)
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="text-slate-400 text-xs italic">Aguardando Robô</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap font-black bg-cyan-950/10 text-sm">
                                      <div className="inline-flex items-center justify-end gap-1.5">
                                        {preco1 !== null ? (
                                          <>
                                            <span className="text-emerald-300">R$ {preco1.toFixed(2)}</span>
                                            {precoUltCompra > 0 && preco1 < precoUltCompra && (
                                              <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/80 px-1 rounded" title="Mais barato que a última compra">
                                                ▼
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          <span className="text-slate-500">—</span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => setModalHistoricoPreco({ isOpen: true, produto: item })}
                                          className="p-1 rounded bg-[#071324] hover:bg-cyan-900/60 text-cyan-400 border border-cyan-800/80 transition-colors cursor-pointer ml-1"
                                          title="Ver série temporal de preços, melhor dia da semana e compras reais"
                                        >
                                          <LineChart className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3.5 whitespace-nowrap bg-slate-900/30">
                                      {fornecedor2 ? (
                                        <span className="text-slate-300 font-medium text-xs truncate max-w-[130px] block" title={fornecedor2}>
                                          {fornecedor2}
                                        </span>
                                      ) : (
                                        <span className="text-slate-500 text-xs">—</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap bg-slate-900/30 text-sm">
                                      {preco2 !== null ? (
                                        <>
                                          <span className="text-slate-200 font-bold">R$ {preco2.toFixed(2)}</span>
                                          {diffPct > 0 && (
                                            <span className="text-xs text-amber-400/90 ml-1.5 font-bold">
                                              +{diffPct}%
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        <span className="text-slate-500">—</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                      <span className={`font-black text-sm ${
                                        item.margem_lucro_percentual >= 30 ? 'text-emerald-400' : 'text-slate-300'
                                      }`}>
                                        {item.margem_lucro_percentual}%
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap font-black text-white bg-slate-900/40 text-sm">
                                      R$ {item.subtotal_7d.toFixed(2)}
                                    </td>
                                  </tr>
                                );
                              })}

                              {/* RODAPÉ COM SUBTOTAL DA DISTRIBUIDORA */}
                              <tr className="bg-[#091224] border-b-2 border-slate-800">
                                <td colSpan={11} className="py-2 px-4 text-right font-bold text-slate-300 text-xs uppercase tracking-wider">
                                  Subtotal {grupo.distribuidora} ({grupo.qtdProdutos} produtos • {grupo.qtdUnidades} un):
                                </td>
                                <td colSpan={2} className="py-2 px-3.5 text-right font-black text-emerald-300 text-sm whitespace-nowrap bg-emerald-950/20">
                                  R$ {grupo.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })
                    ) : (
                      itensPaginados.map((item) => {
                        const isSelected = Boolean(itensSelecionados[item.produto_id]);
                        const isRuptura = item.saldo <= 0;
                        const semEstoquePortais = item.fornecedor_1 === 'Sem Estoque (Portais)';
                        const temCotacaoReal = Boolean(item.fornecedor_1 && item.fornecedor_1 !== 'Não Cotado' && !semEstoquePortais && item.preco_1 && item.preco_1 > 0);
                        const fornecedor1 = temCotacaoReal ? item.fornecedor_1! : (semEstoquePortais ? 'Sem Estoque (Portais)' : 'Não Cotado');
                        const preco1 = temCotacaoReal ? item.preco_1! : null;
                        const fornecedor2 = (item.fornecedor_2 && item.fornecedor_2 !== '—') ? item.fornecedor_2 : null;
                        const preco2 = (item.preco_2 && item.preco_2 > 0) ? item.preco_2 : null;
                        const diffPct = (preco1 && preco2 && preco2 > preco1) ? Number((((preco2 - preco1) / preco1) * 100).toFixed(1)) : 0;
                        const precoUltCompra = Number(item.preco_ult_compra ?? item.custo_unitario ?? 0);
                        const dataUltFormatada = item.data_ult_compra ? new Date(item.data_ult_compra).toLocaleDateString('pt-BR') : '';

                        return (
                          <tr 
                            key={item.produto_id}
                            className={`hover:bg-slate-800/50 transition-colors ${
                              isSelected ? 'bg-cyan-950/20' : ''
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => setItensSelecionados(prev => ({ ...prev, [item.produto_id]: !prev[item.produto_id] }))}
                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                              />
                            </td>

                            {/* Produto e Metadados em 1 linha compacta */}
                            <td className="py-2.5 px-3.5">
                              <div className="flex flex-col">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-bold text-white leading-snug">
                                    {item.descricao}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setProdutoSimuladorId(item.produto_id);
                                      setActiveTab('simulador');
                                    }}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-black bg-teal-950/90 hover:bg-teal-900 text-teal-300 border border-teal-700/70 whitespace-nowrap cursor-pointer transition-colors"
                                    title="Abrir no Simulador de Giro & Calendário para ver de quantos em quantos dias vende e quanto dura o estoque"
                                  >
                                    📅 Giro
                                  </button>
                                  {item.status_dia === 'MELHOR_DIA' && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700/80 shadow-xs whitespace-nowrap"
                                      title={`🌟 Hoje é o Melhor Dia de Compra (${item.melhor_dia_semana})! Comprando o lote semanal equalizado pelo menor preço.`}
                                    >
                                      🌟 Melhor Dia ({item.melhor_dia_semana?.split('-')[0]})
                                    </span>
                                  )}
                                  {item.status_dia === 'EMERGENCIAL_RUPTURA' && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-700/80 shadow-xs animate-pulse whitespace-nowrap"
                                      title={`⚡ Estoque Zerado na Loja! Sugerindo compra emergencial semente de apenas ${item.qtd_sugerida_7d} un. O restante será comprado no Melhor Dia (${item.melhor_dia_semana}).`}
                                    >
                                      ⚡ Emergencial (Estoque Zerado)
                                    </span>
                                  )}
                                  {item.status_dia === 'RETIDO_OUTRO_DIA' && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-900 text-slate-400 border border-slate-700/80 shadow-xs whitespace-nowrap"
                                      title={`⏳ Produto com saldo de segurança. Retido para comprar no Melhor Dia: ${item.melhor_dia_semana}.`}
                                    >
                                      ⏳ Retido p/ {item.melhor_dia_semana?.split('-')[0]}
                                    </span>
                                  )}
                                  {(item.equivalentes_agrupados_count || 0) > 0 && (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-950/90 text-indigo-300 border border-indigo-700/70 whitespace-nowrap"
                                      title={`Representante único de grupo equivalente (${item.chave_equivalencia || ''}). Unificado com: ${(item.equivalentes_agrupados_nomes || []).join(' | ')}`}
                                    >
                                      🔗 +{item.equivalentes_agrupados_count} Lab(s) Equiv.
                                    </span>
                                  )}
                                  {item.is_esquecido_6m && (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-950/90 text-amber-300 border border-amber-700/70 whitespace-nowrap"
                                      title={`Resgate 6 Meses: Vendeu ${item.vendas_historico_6m || 0} un. no histórico recente, zerou o estoque e parou de vender nos últimos 30 dias`}
                                    >
                                      ⏳ Esquecido 6m ({item.vendas_historico_6m || 1}vd)
                                    </span>
                                  )}
                                </div>
                                <div className="inline-flex items-center gap-2 text-xs text-slate-300 mt-1">
                                  <span className="font-mono text-slate-300">EAN: {item.ean || 'Sem EAN'}</span>
                                  <span className="text-slate-500">•</span>
                                  <span className={item.tipo_categoria === 'MEDICAMENTO' ? 'text-emerald-400 font-bold' : 'text-purple-400 font-bold'}>
                                    {item.tipo_categoria}
                                  </span>
                                  {item.fornecedor_ult_compra && item.fornecedor_ult_compra !== 'Não registrado' && (
                                    <>
                                      <span className="text-slate-500">•</span>
                                      <span className="truncate max-w-[180px] text-slate-400" title={`Últ. Fornecedor: ${item.fornecedor_ult_compra}`}>
                                        Últ: {item.fornecedor_ult_compra}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Curva ABC Badge */}
                            <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                              <span className={`px-2.5 py-1 rounded-md text-xs font-black ${
                                item.curva_abc === 'A' 
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800' 
                                  : item.curva_abc === 'B' 
                                  ? 'bg-blue-950 text-blue-300 border border-blue-800' 
                                  : 'bg-slate-900 text-slate-400 border border-slate-800'
                              }`}>
                                {item.curva_abc}
                              </span>
                            </td>

                            {/* Saldo Atual */}
                            <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                              <span className={`text-sm font-black ${isRuptura ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
                                {item.saldo} un
                              </span>
                            </td>

                            {/* Cobertura */}
                            <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                              <span className={`text-xs font-bold ${
                                item.dias_estoque_restante <= 0 ? 'text-rose-400' : 'text-amber-300'
                              }`}>
                                {item.dias_estoque_restante <= 0 ? '0d (Ruptura)' : `${item.dias_estoque_restante}d`}
                              </span>
                            </td>

                            {/* Pedir 7 Dias */}
                            <td
                              className="py-2.5 px-3 text-center whitespace-nowrap bg-cyan-950/30"
                              title={equalizarAtivo && (item.qtd_bruta_7d || 0) > item.qtd_sugerida_7d ? `Equalizado de ${item.qtd_bruta_7d} un para ${item.qtd_sugerida_7d} un (economia de ${(item.qtd_bruta_7d || 0) - item.qtd_sugerida_7d} un)` : undefined}
                            >
                              <div className="inline-flex items-center justify-center gap-1">
                                <span className="font-black text-cyan-300 text-sm">
                                  {item.qtd_sugerida_7d} un
                                </span>
                                {equalizarAtivo && (item.qtd_bruta_7d || 0) > item.qtd_sugerida_7d && (
                                  <span className="text-[10px] text-slate-400 line-through font-semibold">
                                    {item.qtd_bruta_7d}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Último Valor de Compra */}
                            <td
                              className="py-2.5 px-3 text-right whitespace-nowrap bg-amber-950/10 font-bold text-amber-200 text-sm"
                              title={`Última Compra: R$ ${precoUltCompra.toFixed(2)} • Fornecedor: ${item.fornecedor_ult_compra || 'Não inf.'}${dataUltFormatada ? ` • Data: ${dataUltFormatada}` : ''}`}
                            >
                              {precoUltCompra > 0 ? `R$ ${precoUltCompra.toFixed(2)}` : '—'}
                            </td>

                            {/* 1º Colocado (Vendedor) */}
                            <td className="py-2.5 px-3.5 whitespace-nowrap bg-cyan-950/10">
                              {temCotacaoReal ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                                  <span className="font-bold text-emerald-300 text-xs truncate max-w-[130px]" title={fornecedor1}>
                                    {fornecedor1}
                                  </span>
                                </div>
                              ) : semEstoquePortais ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                                  <span className="font-semibold text-amber-400/90 text-xs" title="Consultado nos 4 portais sem estoque disponível">
                                    Sem Estoque (4 Portais)
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">Aguardando Robô</span>
                              )}
                            </td>

                            {/* 1º Preço */}
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap font-black bg-cyan-950/10 text-sm">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {preco1 !== null ? (
                                  <>
                                    <span className="text-emerald-300">R$ {preco1.toFixed(2)}</span>
                                    {precoUltCompra > 0 && preco1 < precoUltCompra && (
                                      <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/80 px-1 rounded" title="Mais barato que a última compra">
                                        ▼
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setModalHistoricoPreco({ isOpen: true, produto: item })}
                                  className="p-1 rounded bg-[#071324] hover:bg-cyan-900/60 text-cyan-400 border border-cyan-800/80 transition-colors cursor-pointer ml-1"
                                  title="Ver série temporal de preços, melhor dia da semana e compras reais"
                                >
                                  <LineChart className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>

                            {/* 2º Colocado (Vendedor) */}
                            <td className="py-2.5 px-3.5 whitespace-nowrap bg-slate-900/30">
                              {fornecedor2 ? (
                                <span className="text-slate-300 font-medium text-xs truncate max-w-[130px] block" title={fornecedor2}>
                                  {fornecedor2}
                                </span>
                              ) : (
                                <span className="text-slate-500 text-xs">—</span>
                              )}
                            </td>

                            {/* 2º Preço (+X%) */}
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap bg-slate-900/30 text-sm">
                              {preco2 !== null ? (
                                <>
                                  <span className="text-slate-200 font-bold">R$ {preco2.toFixed(2)}</span>
                                  {diffPct > 0 && (
                                    <span className="text-xs text-amber-400/90 ml-1.5 font-bold">
                                      +{diffPct}%
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>

                            {/* Margem de Lucro */}
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <span className={`font-black text-sm ${
                                item.margem_lucro_percentual >= 30 ? 'text-emerald-400' : 'text-slate-300'
                              }`}>
                                {item.margem_lucro_percentual}%
                              </span>
                            </td>

                            {/* Subtotal 7d */}
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap font-black text-white bg-slate-900/40 text-sm">
                              R$ {item.subtotal_7d.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* ─── CONTROLE DE PAGINAÇÃO DA TABELA ─────────────────────────────── */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-[#09101f] border-t border-slate-800 text-xs">
                {/* Lado Esquerdo: Contagem de Itens e Seletor de Tamanho */}
                <div className="flex items-center gap-3 text-slate-400">
                  <span>
                    Mostrando <b className="text-white">{faltasFiltradas.length > 0 ? (paginaAtual - 1) * itensPorPagina + 1 : 0}</b> a <b className="text-white">{Math.min(paginaAtual * itensPorPagina, faltasFiltradas.length)}</b> de <b className="text-white">{faltasFiltradas.length}</b> produtos
                  </span>
                  <span className="text-slate-700">|</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Itens por pág:</span>
                    <select
                      value={itensPorPagina}
                      onChange={(e) => setItensPorPagina(Number(e.target.value))}
                      className="px-2 py-0.5 rounded-lg border border-slate-700 bg-[#0e1626] text-white text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                    >
                      <option value={15}>15</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                {/* Lado Direito: Navegação de Páginas */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPaginaAtual(1)}
                    disabled={paginaAtual === 1}
                    className="p-1.5 rounded-lg border border-slate-700 bg-[#0e1626] text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title="Primeira Página"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPaginaAtual(prev => Math.max(1, prev - 1))}
                    disabled={paginaAtual === 1}
                    className="p-1.5 rounded-lg border border-slate-700 bg-[#0e1626] text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title="Página Anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center px-3 py-1 rounded-lg border border-slate-700 bg-[#0e1626] text-xs font-bold text-slate-200">
                    <span>Página <b className="text-cyan-400">{paginaAtual}</b> de <b className="text-white">{totalPaginas}</b></span>
                  </div>

                  <button
                    onClick={() => setPaginaAtual(prev => Math.min(totalPaginas, prev + 1))}
                    disabled={paginaAtual === totalPaginas || totalPaginas === 0}
                    className="p-1.5 rounded-lg border border-slate-700 bg-[#0e1626] text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title="Próxima Página"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPaginaAtual(totalPaginas)}
                    disabled={paginaAtual === totalPaginas || totalPaginas === 0}
                    className="p-1.5 rounded-lg border border-slate-700 bg-[#0e1626] text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title="Última Página"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── ABA 2: PORTAIS B2B & OTIMIZADOR DE CARRINHO ─────────────────────── */}
        {activeTab === 'cotacao' && (
          <div className="space-y-4">
            
            {/* Header dos Portais */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0e1626] p-4 rounded-2xl border border-slate-800 shadow-md">
              <div>
                <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  Portais de Distribuidoras Cadastrados
                </h2>
                <p className="text-xs text-slate-400 font-medium">
                  Configuração de pedidos mínimos, prazos de pagamento e proteção tributária (MG).
                </p>
              </div>

              <button
                onClick={() => {
                  setPortalEditando({
                    nome: '',
                    url_portal: '',
                    usuario: '',
                    pedido_minimo: 350,
                    prazo_dias_padrao: 28,
                    uf_origem: 'MG',
                    is_mg: 1,
                    is_ativo: 1,
                    observacoes: ''
                  });
                  setPortalModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black transition-all shadow-md cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Cadastrar Distribuidora</span>
              </button>
            </div>

            {/* Grid dos Portais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {portais.map(portal => (
                <div 
                  key={portal.id} 
                  className={`p-3.5 rounded-2xl border bg-[#0e1626] shadow-sm space-y-2 transition-all ${
                    portal.is_ativo ? 'border-slate-800' : 'opacity-50 border-dashed border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-cyan-400" />
                      <span className="font-black text-xs text-white uppercase">{portal.nome}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      portal.is_mg ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}>
                      {portal.uf_origem} {portal.is_mg ? '(Sem DIFAL)' : '(⚠️ Fora MG)'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800">
                    <span>Pedido Mínimo: <b className="text-white">R$ {portal.pedido_minimo.toFixed(2)}</b></span>
                    <span>Prazo: <b className="text-white">{portal.prazo_dias_padrao}d</b></span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <a 
                      href={portal.url_portal} 
                      target="_blank" 
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:underline"
                    >
                      <span>Acessar Portal</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    <button
                      onClick={() => {
                        setPortalEditando(portal);
                        setPortalModalOpen(true);
                      }}
                      className="text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer"
                    >
                      Configurar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Carrinhos Otimizados */}
            {carrinhosOtimizados.length > 0 ? (
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      Carrinhos Otimizados (Menor Preço & Pedido Mínimo)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Total Geral: <b className="text-white">R$ {resumoSimulacao?.totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b> distribuído em {carrinhosOtimizados.length} distribuidora(s).
                    </p>
                  </div>

                  {sugestoesReagrupamento.length > 0 && (
                    <div className="text-xs font-bold text-amber-300 bg-amber-950/50 px-3 py-1.5 rounded-xl border border-amber-800">
                      ⚠️ {sugestoesReagrupamento.length} distribuidora(s) precisam de ajuste de mínimo.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {carrinhosOtimizados.map((carrinho, idx) => (
                    <div 
                      key={idx}
                      className={`p-4 rounded-2xl border bg-[#0e1626] shadow-lg space-y-3 ${
                        carrinho.atingiuMinimo 
                          ? 'border-emerald-800/80' 
                          : 'border-amber-800/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-white uppercase">{carrinho.distribuidora}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            carrinho.atingiuMinimo 
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}>
                            {carrinho.atingiuMinimo ? 'Frete Grátis OK' : `Faltam R$ ${carrinho.faltaParaMinimo.toFixed(2)}`}
                          </span>
                        </div>

                        <span className="font-black text-base text-cyan-300">
                          R$ {carrinho.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Prazo: <b className="text-white">{carrinho.prazoDias} dias</b></span>
                        <span>Mínimo: <b className="text-white">R$ {carrinho.pedidoMinimo.toFixed(2)}</b></span>
                      </div>

                      <div className="max-h-36 overflow-y-auto space-y-1.5 divide-y divide-slate-800/60 text-xs">
                        {carrinho.itens.map((it: any, itIdx: number) => (
                          <div key={itIdx} className="pt-1.5 flex items-center justify-between">
                            <span className="truncate max-w-[220px] font-medium text-slate-300" title={it.descricao}>
                              {it.quantidade}x {it.descricao}
                            </span>
                            <span className="font-black text-white">
                              R$ {it.subtotal.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-slate-800">
                        <button
                          onClick={() => handleAbrirNavegadorCarrinho(carrinho)}
                          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black transition-all cursor-pointer shadow-md"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Abrir Navegador no Carrinho da {carrinho.distribuidora}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center bg-[#0e1626] rounded-2xl border border-slate-800 text-slate-500">
                <Sparkles className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p className="font-bold text-sm text-slate-300">Nenhuma cotação simulada ativa.</p>
                <p className="text-xs text-slate-500 mt-1">Vá na aba "1. Reposição 1 Semana" e clique em "Cotar nos Portais".</p>
              </div>
            )}
          </div>
        )}

        {/* ─── ABA 3: ORÇAMENTO & RADAR DE BOLETOS ─────────────────────────────── */}
        {activeTab === 'orcamento' && orcamentoInfo && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Mês Atual', dados: orcamentoInfo.mesAtual },
                { label: 'Próximo Mês', dados: orcamentoInfo.proximoMes },
                { label: 'Mês Seguinte', dados: orcamentoInfo.mesSeguinte }
              ].map((bloco, idx) => {
                const m = bloco.dados;
                if (!m) return null;
                const estourado = m.statusOrcamento === 'ESTOURADO' || m.saldoLivre < 0;
                return (
                  <div
                    key={idx}
                    className={`p-5 rounded-2xl border bg-[#0e1626] shadow-md space-y-3.5 ${
                      estourado ? 'border-rose-800/90' : 'border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-sm uppercase text-white">
                        {bloco.label} ({m.nomeMes}/{m.ano})
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                        estourado
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : m.statusOrcamento === 'ALERTA'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}>
                        {m.statusOrcamento} ({m.qtdBoletos} boletos)
                      </span>
                    </div>

                    <div className="space-y-2 text-xs text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Limite Orçado do Mês:</span>
                        <b className="text-white">R$ {m.limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Soma Total de Boletos:</span>
                        <b className="text-white">R$ {m.totalComprometido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                      </div>
                      {m.totalPago !== undefined && (
                        <div className="flex justify-between text-[11px]">
                          <span className="text-emerald-400/90">• Boletos Já Pagos:</span>
                          <b className="text-emerald-400">R$ {m.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                        </div>
                      )}
                      {m.totalPendente !== undefined && (
                        <div className="flex justify-between text-[11px]">
                          <span className="text-amber-400/90">• Boletos A Pagar (Pendentes):</span>
                          <b className="text-amber-300">R$ {m.totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-slate-800">
                        <span className="font-bold text-slate-200">
                          {estourado ? 'Excedente (Acima do Limite):' : 'Saldo Disponível:'}
                        </span>
                        <b className={`font-black text-base ${estourado ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {estourado ? '-R$ ' : 'R$ '}
                          {Math.abs(m.saldoLivre).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </b>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${estourado ? 'bg-rose-500' : m.statusOrcamento === 'ALERTA' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, m.percentualComprometido || 0)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-slate-400">
                        <span>{m.percentualComprometido}% utilizado</span>
                        <span>R$ {m.totalComprometido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {m.limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── ABA 4: RELATÓRIOS & PREÇOS ──────────────────────────────────────── */}
        {activeTab === 'relatorios' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-[#0e1626] p-4 rounded-2xl border border-slate-800 shadow-md">
              <div>
                <h2 className="text-sm font-black uppercase text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-purple-400" />
                  Inteligência de Custos e Margens (Digifarma)
                </h2>
                <p className="text-xs text-slate-400">
                  Histórico de compras reais, margem praticada e velocidade de saída dos itens Curva A e B.
                </p>
              </div>
              <span className="text-xs font-bold text-cyan-400">
                {relatorioPrecos.length} produtos analisados
              </span>
            </div>

            <div className="bg-[#0e1626] rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#09101f] border-b border-slate-800 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3 whitespace-nowrap">Produto</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap w-16">Curva</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap w-24">Últ. Custo</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap w-24">Preço Venda</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap w-24 text-emerald-400">Margem Bruta</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap w-24">Giro / Dia</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap w-24">Cobertura</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Último Fornecedor Registrado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {relatorioPrecos.map((prod) => (
                      <tr key={prod.produto_id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-bold text-white truncate max-w-[240px]">
                          {prod.descricao}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            prod.curva_abc === 'A' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-blue-950 text-blue-300 border border-blue-800'
                          }`}>
                            {prod.curva_abc}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap text-slate-300 font-medium">
                          R$ {prod.custo_ult_compra.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap font-bold text-white">
                          R$ {prod.preco_venda.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap font-black text-emerald-400">
                          {prod.margem_bruta_percentual}%
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap text-slate-400">
                          {prod.vmd_diario} un
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap font-bold text-slate-300">
                          {prod.dias_cobertura} dias
                        </td>
                        <td className="py-2 px-3 text-slate-400 text-[11px] truncate max-w-[200px]" title={prod.fornecedor}>
                          {prod.fornecedor}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── ABA 6: SIMULADOR DE GIRO & CALENDÁRIO DE ESTOQUE ────────────── */}
        {activeTab === 'simulador' && (
          <BelaPedSimuladorGiro produtoInicialId={produtoSimuladorId} />
        )}

      </div>
      </div>

      {/* ─── MODAL: CADASTRAR/EDITAR PORTAL ──────────────────────────────────── */}
      {portalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0e1626] rounded-3xl p-6 max-w-md w-full border border-slate-700 shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-black uppercase text-white">
                {portalEditando.id ? 'Editar Portal' : 'Cadastrar Distribuidora'}
              </h3>
              <button onClick={() => setPortalModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSalvarPortal} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Nome da Distribuidora</label>
                <input
                  type="text"
                  required
                  value={portalEditando.nome}
                  onChange={(e) => setPortalEditando({ ...portalEditando, nome: e.target.value })}
                  placeholder="Ex: PROFARMA, DISTRIMED..."
                  className="w-full p-2.5 rounded-xl border border-slate-700 bg-[#080d18] text-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">URL do Portal B2B</label>
                <input
                  type="url"
                  required
                  value={portalEditando.url_portal}
                  onChange={(e) => setPortalEditando({ ...portalEditando, url_portal: e.target.value })}
                  placeholder="https://..."
                  className="w-full p-2.5 rounded-xl border border-slate-700 bg-[#080d18] text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Pedido Mínimo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={portalEditando.pedido_minimo}
                    onChange={(e) => setPortalEditando({ ...portalEditando, pedido_minimo: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 rounded-xl border border-slate-700 bg-[#080d18] text-white font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">Prazo Padrão (Dias)</label>
                  <input
                    type="number"
                    required
                    value={portalEditando.prazo_dias_padrao}
                    onChange={(e) => setPortalEditando({ ...portalEditando, prazo_dias_padrao: parseInt(e.target.value) || 28 })}
                    className="w-full p-2.5 rounded-xl border border-slate-700 bg-[#080d18] text-white font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Estado de Origem (UF)</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={portalEditando.uf_origem}
                    onChange={(e) => setPortalEditando({ ...portalEditando, uf_origem: e.target.value.toUpperCase() })}
                    placeholder="MG"
                    className="w-full p-2.5 rounded-xl border border-slate-700 bg-[#080d18] text-white font-bold uppercase"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer pb-2 font-bold text-slate-300">
                    <input
                      type="checkbox"
                      checked={Boolean(portalEditando.is_ativo)}
                      onChange={(e) => setPortalEditando({ ...portalEditando, is_ativo: e.target.checked ? 1 : 0 })}
                      className="rounded text-cyan-500 focus:ring-cyan-500"
                    />
                    <span>Portal Ativo</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPortalModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 font-bold hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black shadow-md cursor-pointer"
                >
                  Salvar Distribuidora
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: ADICIONAR ITEM AVULSO ────────────────────────────────────── */}
      {avulsoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0e1626] rounded-3xl p-6 max-w-md w-full border border-slate-700 shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-black uppercase text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" />
                Adicionar Item Avulso
              </h3>
              <button onClick={() => setAvulsoModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSalvarAvulso} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Descrição do Medicamento</label>
                <input
                  type="text"
                  required
                  value={novoAvulso.descricao}
                  onChange={(e) => setNovoAvulso({ ...novoAvulso, descricao: e.target.value })}
                  placeholder="Ex: DIPIRONA 500MG..."
                  className="w-full p-2.5 rounded-xl border border-slate-700 bg-[#080d18] text-white uppercase font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Código de Barras EAN</label>
                <input
                  type="text"
                  value={novoAvulso.ean}
                  onChange={(e) => setNovoAvulso({ ...novoAvulso, ean: e.target.value })}
                  placeholder="789..."
                  className="w-full p-2.5 rounded-xl border border-slate-700 bg-[#080d18] text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={novoAvulso.quantidade}
                    onChange={(e) => setNovoAvulso({ ...novoAvulso, quantidade: parseInt(e.target.value) || 1 })}
                    className="w-full p-2.5 rounded-xl border border-slate-700 bg-[#080d18] text-white font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">Preço Estimado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={novoAvulso.preco_referencia}
                    onChange={(e) => setNovoAvulso({ ...novoAvulso, preco_referencia: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 rounded-xl border border-slate-700 bg-[#080d18] text-white font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAvulsoModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 font-bold hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black shadow-md cursor-pointer"
                >
                  Inserir Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL DE HISTÓRICO DE PREÇOS & SÉRIE TEMPORAL (RECHARTS) ─── */}
      <BelaPedPrecoHistoricoModal
        isOpen={modalHistoricoPreco.isOpen}
        onClose={() => setModalHistoricoPreco({ isOpen: false, produto: null })}
        ean={modalHistoricoPreco.produto?.ean || ''}
        produtoId={modalHistoricoPreco.produto?.produto_id || 0}
        descricao={modalHistoricoPreco.produto?.descricao || ''}
        precoAtual={modalHistoricoPreco.produto?.preco_1}
        fornecedorAtual={modalHistoricoPreco.produto?.fornecedor_1}
      />

      {/* ─── MODAL DE CONSULTA DE LIMITES SEMANAIS DO ORÇAMENTO (TODOS OS MESES) ─── */}
      <BelaPedOrcamentoSemanalModal
        isOpen={orcamentoSemanalModalOpen}
        onClose={() => setOrcamentoSemanalModalOpen(false)}
        todosMesesAno={orcamentoInfo?.todosMesesAno || []}
        mesAtualNumero={orcamentoInfo?.mesAtual?.mes || (new Date().getMonth() + 1)}
        ano={orcamentoInfo?.ano || new Date().getFullYear()}
      />

      {/* ─── TELA FLUTUANTE DE ATIVIDADE AO VIVO DO ROBÔ (CANTO INFERIOR DIREITO) ─── */}
      {(() => {
        const grpAguardando = totaisPorDistribuidora.find(g => g.distribuidora === 'AGUARDANDO ROBÔ');
        const aguardandoCount = grpAguardando ? grpAguardando.qtdProdutos : 0;
        const aguardandoValor = grpAguardando ? grpAguardando.valorTotal : 0;
        return (
          <BelaPedRobotMonitor
            aguardandoRoboCount={aguardandoCount}
            aguardandoRoboValor={aguardandoValor}
            cotandoAoVivo={cotandoAoVivo}
            statusCotacao={statusCotacao}
            onDispararRobo={(fornecedor = 'TODOS') => handleIniciarCotacaoAoVivo(fornecedor)}
            onDadosAtualizados={() => carregarDados()}
          />
        );
      })()}

    </div>
  );
};
